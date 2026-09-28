import type { TextRun } from "./types";

export interface MergeOptions {
  /** Max. vertikaler Versatz (in Vielfachen der Schriftgroesse) fuer "gleiche Zeile". */
  lineTolerance?: number;
  /** Ab diesem Abstand (in Vielfachen der Schriftgroesse) wird ein Leerzeichen eingefuegt. */
  spaceFactor?: number;
  /** Ab diesem Abstand wird ein neuer TextNode begonnen. */
  breakFactor?: number;
}

/**
 * pdf.js liefert Text als einzelne Runs — oft ein Fragment pro Kerning-Sprung.
 * Ohne Zusammenfassen entstehen hunderte Ein-Zeichen-Layer in Figma.
 *
 * Fasst benachbarte Runs derselben Zeile, Groesse und Schrift zu einem Lauf
 * zusammen und fuegt dort Leerzeichen ein, wo das PDF nur eine Luecke hat.
 */
export function mergeRuns(runs: TextRun[], options: MergeOptions = {}): TextRun[] {
  const lineTolerance = options.lineTolerance ?? 0.3;
  const spaceFactor = options.spaceFactor ?? 0.18;
  const breakFactor = options.breakFactor ?? 1;

  const sorted = runs.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: TextRun[] = [];
  let current: TextRun | null = null;

  for (const run of sorted) {
    if (current && sameLine(current, run, lineTolerance)) {
      const gap = run.x - (current.x + current.width);
      if (gap <= current.size * breakFactor) {
        const needsSpace =
          gap > current.size * spaceFactor && !/\s$/.test(current.str) && !/^\s/.test(run.str);
        current.str += (needsSpace ? " " : "") + run.str;
        current.width = Math.max(current.width, run.x + run.width - current.x);
        continue;
      }
    }

    current = { ...run };
    merged.push(current);
  }

  return merged.filter((run) => run.str.trim().length > 0);
}

function sameLine(a: TextRun, b: TextRun, tolerance: number): boolean {
  return (
    Math.abs(a.y - b.y) <= Math.min(a.size, b.size) * tolerance &&
    Math.abs(a.size - b.size) <= 0.5 &&
    a.fontName === b.fontName &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    // Nur nach rechts zusammenfassen — Spalten sollen getrennt bleiben.
    b.x >= a.x
  );
}
