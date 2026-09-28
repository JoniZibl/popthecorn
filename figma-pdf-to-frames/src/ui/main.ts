import { mergeRuns } from "../shared/text";
import { ensureSvgSize, normalizeSvg } from "../shared/svg";
import type { ImportMode, PageData, TextRun, UiToPlugin } from "../shared/types";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Obergrenze fuer Bild-Fills; Figma skaliert groessere Bitmaps ohnehin herunter. */
const MAX_RASTER_SIDE = 4000;

const fileInput = byId<HTMLInputElement>("file");
const dropZone = byId<HTMLLabelElement>("drop");
const allPages = byId<HTMLInputElement>("all-pages");
const rangeInput = byId<HTMLInputElement>("range");
const progress = byId<HTMLProgressElement>("progress");
const statusEl = byId<HTMLParagraphElement>("status");

let busy = false;

setupWorker();

allPages.addEventListener("change", () => {
  rangeInput.disabled = allPages.checked;
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void start(file);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-over");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-over"));

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-over");
  const file = event.dataTransfer?.files?.[0];
  if (file) void start(file);
});

/**
 * pdf.js braucht einen Worker. Im Figma-iframe gibt es keinen eigenen Origin,
 * deshalb wird der (mitgebundelte) Worker-Quelltext als Blob-URL gestartet.
 */
function setupWorker(): void {
  try {
    const blob = new Blob([__PDF_WORKER_SOURCE__], { type: "text/javascript" });
    pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
  } catch (error) {
    fail(
      "PDF-Worker konnte nicht gestartet werden — bitte Figma neu starten oder die Desktop-App verwenden.",
    );
    console.error(error);
  }
}

async function start(file: File): Promise<void> {
  if (busy) return;
  busy = true;
  progress.hidden = false;
  progress.value = 0;
  statusEl.classList.remove("is-error");

  try {
    const mode = currentMode();
    const wanted = allPages.checked ? null : parseRange(rangeInput.value);
    if (wanted && wanted.size === 0) throw new Error("Der Seitenbereich ist leer oder ungültig.");

    const pages = await convert(file, mode, wanted);
    if (pages.length === 0) throw new Error("Keine der angegebenen Seiten existiert in diesem PDF.");

    statusEl.textContent = "Baue Frames in Figma …";
    post({ type: "pages", mode, fileName: stripExtension(file.name), pages });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    console.error(error);
  } finally {
    busy = false;
    progress.hidden = true;
    fileInput.value = "";
  }
}

async function convert(
  file: File,
  mode: ImportMode,
  wanted: Set<number> | null,
): Promise<PageData[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({
    data,
    // Figmas iframe erlaubt kein eval(); pdf.js hat dafuer einen langsameren Pfad.
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const total: number = doc.numPages;
  const pages: PageData[] = [];

  for (let index = 1; index <= total; index++) {
    if (wanted && !wanted.has(index)) continue;

    statusEl.textContent = `Lese Seite ${index} von ${total} …`;
    progress.value = Math.round((index / total) * 100);

    const page = await doc.getPage(index);
    // scale: 1 bedeutet 1 PDF-Punkt = 1 px in Figma. Nicht aendern — sonst
    // passen die Textmasse aus getTextContent() nicht mehr zum SVG.
    const viewport = page.getViewport({ scale: 1 });

    let svg: string | null = null;
    let png: Uint8Array | null = null;
    let texts: TextRun[] = [];

    if (mode === "image") {
      png = await renderPng(page, viewport);
    } else {
      svg = await renderSvg(page, viewport, mode);
    }

    if (mode === "hybrid") {
      texts = mergeRuns(extractRuns(await page.getTextContent(), viewport));
    }

    pages.push({
      index,
      width: Math.round(viewport.width * 100) / 100,
      height: Math.round(viewport.height * 100) / 100,
      svg,
      png,
      texts,
    });

    page.cleanup();
    // Dem Browser Luft zum Zeichnen geben, sonst friert das Panel bei
    // grossen Dokumenten sichtbar ein.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return pages;
}

async function renderSvg(page: any, viewport: any, mode: ImportMode): Promise<string> {
  const operatorList = await page.getOperatorList();
  const graphics = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
  // Im Hybrid-Modus setzen wir den Text selbst — dann brauchen wir auch die
  // eingebetteten Font-Subsets nicht, die das SVG stark aufblaehen.
  graphics.embedFonts = mode === "vector";

  const element: SVGElement = await graphics.getSVG(operatorList, viewport);
  if (mode === "hybrid") stripTextElements(element);

  const serialized = new XMLSerializer().serializeToString(element);
  return ensureSvgSize(normalizeSvg(serialized), viewport.width, viewport.height);
}

function stripTextElements(root: SVGElement): void {
  for (const tag of ["text", "style"]) {
    const nodes = Array.from(root.getElementsByTagNameNS(SVG_NS, tag));
    for (const node of nodes) node.parentNode?.removeChild(node);
  }
}

async function renderPng(page: any, viewport: any): Promise<Uint8Array> {
  const longestSide = Math.max(viewport.width, viewport.height);
  const scale = Math.min(2, MAX_RASTER_SIDE / longestSide);
  const scaled = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(scaled.width);
  canvas.height = Math.ceil(scaled.height);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas-Kontext nicht verfügbar.");
  // PDF-Seiten sind transparent; ohne weissen Grund wird der Export fleckig.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport: scaled }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Seite konnte nicht als Bild gerendert werden.");
  return new Uint8Array(await blob.arrayBuffer());
}

function extractRuns(textContent: any, viewport: any): TextRun[] {
  const styles = textContent.styles ?? {};
  const runs: TextRun[] = [];

  for (const item of textContent.items) {
    if (typeof item.str !== "string" || item.str.trim().length === 0) continue;

    // Util.transform kombiniert Text- und Viewport-Matrix — damit ist das
    // Ergebnis bereits in Figma-Koordinaten (y nach unten).
    const matrix = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const size = Math.hypot(matrix[2], matrix[3]);
    if (size < 0.5) continue;

    const rawName: string = styles[item.fontName]?.fontFamily ?? item.fontName ?? "";
    const fontName = cleanFontName(rawName);

    runs.push({
      str: item.str,
      x: matrix[4],
      y: matrix[5],
      size,
      width: item.width,
      fontName,
      bold: /bold|black|heavy|semibold|demi/i.test(rawName),
      italic: /italic|oblique/i.test(rawName),
    });
  }

  return runs;
}

/** Entfernt den Subset-Praefix ("ABCDEF+Helvetica-Bold" -> "Helvetica-Bold"). */
function cleanFontName(raw: string): string {
  return raw.replace(/^[A-Z]{6}\+/, "").trim();
}

function currentMode(): ImportMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return (checked?.value as ImportMode | undefined) ?? "vector";
}

/** "1-3,7,12-14" -> Set {1,2,3,7,12,13,14} */
export function parseRange(input: string): Set<number> {
  const pages = new Set<number>();

  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(trimmed);
    if (!match) throw new Error(`"${trimmed}" ist kein gültiger Seitenbereich.`);

    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 1 || to < from) throw new Error(`"${trimmed}" ist kein gültiger Seitenbereich.`);

    for (let page = from; page <= to; page++) pages.add(page);
  }

  return pages;
}

function stripExtension(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

function fail(message: string): void {
  statusEl.textContent = message;
  statusEl.classList.add("is-error");
  post({ type: "error", message });
}

function post(message: UiToPlugin): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} fehlt in ui.html`);
  return element as T;
}
