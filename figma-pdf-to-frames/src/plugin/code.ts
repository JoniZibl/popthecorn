import { buildFontIndex, pickFont, type FontIndex } from "./fonts";
import { unwrapRedundantGroups } from "./cleanup";
import type { ImportMode, PageData, TextRun, UiToPlugin } from "../shared/types";

/** Abstand zwischen zwei importierten Seiten auf dem Canvas. */
const PAGE_GAP = 80;
/**
 * Naeherung Baseline -> Oberkante des TextNodes. Figma positioniert Text an der
 * Oberkante, das PDF liefert die Baseline; 0.8 * fontSize trifft den Ascender
 * der meisten Textschriften gut genug.
 */
const ASCENDER_RATIO = 0.8;

figma.showUI(__html__, { width: 380, height: 430, themeColors: true });

figma.ui.onmessage = async (message: UiToPlugin) => {
  if (message.type === "cancel") {
    figma.closePlugin();
    return;
  }

  if (message.type === "error") {
    figma.notify(message.message, { error: true });
    return;
  }

  if (message.type !== "pages") return;

  try {
    const frames = await importPages(message.pages, message.mode, message.fileName);
    figma.currentPage.selection = frames;
    figma.viewport.scrollAndZoomIntoView(frames);
    figma.notify(`${frames.length} Seite(n) importiert`);
    figma.closePlugin();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(error);
    figma.notify(`Import fehlgeschlagen: ${reason}`, { error: true });
  }
};

async function importPages(
  pages: PageData[],
  mode: ImportMode,
  fileName: string,
): Promise<FrameNode[]> {
  if (pages.length === 0) throw new Error("Es wurden keine Seiten übergeben.");

  const fonts = mode === "hybrid" ? await buildFontIndex() : null;

  const totalWidth =
    pages.reduce((sum, page) => sum + page.width, 0) + PAGE_GAP * Math.max(0, pages.length - 1);
  const maxHeight = pages.reduce((max, page) => Math.max(max, page.height), 0);

  // Ganzen Stapel um das aktuelle Viewport-Zentrum legen.
  let x = figma.viewport.center.x - totalWidth / 2;
  const y = figma.viewport.center.y - maxHeight / 2;

  const frames: FrameNode[] = [];

  for (const page of pages) {
    const frame = await buildFrame(page, mode, fileName, fonts);
    frame.x = Math.round(x);
    frame.y = Math.round(y);
    figma.currentPage.appendChild(frame);
    frames.push(frame);
    x += page.width + PAGE_GAP;
  }

  return frames;
}

async function buildFrame(
  page: PageData,
  mode: ImportMode,
  fileName: string,
  fonts: FontIndex | null,
): Promise<FrameNode> {
  const frame = createPageFrame(page, mode);

  frame.name = `${fileName} — Seite ${page.index}`;
  frame.clipsContent = true;

  if (fonts && page.texts.length > 0) {
    await addTextNodes(frame, page.texts, fonts);
  }

  return frame;
}

function createPageFrame(page: PageData, mode: ImportMode): FrameNode {
  if (mode === "image" && page.png) {
    const frame = figma.createFrame();
    frame.resizeWithoutConstraints(page.width, page.height);
    const image = figma.createImage(page.png);
    frame.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    return frame;
  }

  if (page.svg) {
    try {
      // Liefert eine FrameNode voller echter VectorNodes und Gruppen.
      const frame = figma.createNodeFromSvg(page.svg);
      frame.resizeWithoutConstraints(page.width, page.height);
      frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      unwrapRedundantGroups(frame);
      return frame;
    } catch (error) {
      console.error(`Seite ${page.index}: SVG-Import fehlgeschlagen`, error);
      figma.notify(`Seite ${page.index} konnte nicht als Vektor importiert werden.`, {
        error: true,
      });
    }
  }

  const fallback = figma.createFrame();
  fallback.resizeWithoutConstraints(page.width, page.height);
  return fallback;
}

async function addTextNodes(frame: FrameNode, texts: TextRun[], fonts: FontIndex): Promise<void> {
  const resolved = texts.map((run) => ({ run, font: pickFont(fonts, run) }));

  // Jede Schrift genau einmal laden — loadFontAsync pro Node waere um
  // Groessenordnungen langsamer.
  const unique = new Map<string, FontName>();
  const remember = (font: FontName) => unique.set(`${font.family}\u0000${font.style}`, font);

  // Auch die Default-Schrift eines frischen TextNodes muss geladen sein,
  // bevor irgendeine Text-Eigenschaft geschrieben werden darf.
  const probe = figma.createText();
  remember(probe.fontName as FontName);
  probe.remove();

  for (const { font } of resolved) remember(font);
  await Promise.all([...unique.values()].map((font) => figma.loadFontAsync(font)));

  for (const { run, font } of resolved) {
    const node = figma.createText();
    node.fontName = font;
    node.fontSize = Math.min(1000, Math.max(1, Math.round(run.size * 100) / 100));
    node.characters = run.str;
    node.textAutoResize = "WIDTH_AND_HEIGHT";
    node.x = run.x;
    node.y = run.y - run.size * ASCENDER_RATIO;
    node.name = run.str.length > 40 ? `${run.str.slice(0, 40)}…` : run.str;
    frame.appendChild(node);
  }
}
