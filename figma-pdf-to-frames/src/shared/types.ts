/**
 * Typen, die sich UI-iframe und Plugin-Sandbox teilen.
 * Dieses Modul darf weder DOM- noch figma-Globals benutzen.
 */

export type ImportMode =
  /** Reines SVG: Vektoren + Text kommen aus dem SVG-Import. */
  | "vector"
  /** SVG ohne Text + eigene, sauber gesetzte Figma-TextNodes. */
  | "hybrid"
  /** Rasterbild pro Seite (Fallback fuer Scans / kaputte PDFs). */
  | "image";

/**
 * Ein Textlauf in Figma-Koordinaten (Ursprung oben links, y nach unten).
 * `y` ist die **Baseline**, nicht die Oberkante.
 */
export interface TextRun {
  str: string;
  x: number;
  y: number;
  size: number;
  width: number;
  /** Aufgeraeumter Font-Name aus dem PDF, z. B. "Helvetica-Bold". */
  fontName: string;
  bold: boolean;
  italic: boolean;
}

export interface PageData {
  /** 1-basierte Seitennummer im Quell-PDF. */
  index: number;
  width: number;
  height: number;
  svg: string | null;
  png: Uint8Array | null;
  texts: TextRun[];
}

export type UiToPlugin =
  | { type: "pages"; mode: ImportMode; fileName: string; pages: PageData[] }
  | { type: "error"; message: string }
  | { type: "cancel" };

export type PluginToUi = { type: "imported"; count: number };
