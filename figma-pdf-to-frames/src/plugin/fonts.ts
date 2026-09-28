import type { TextRun } from "../shared/types";

export interface FontIndex {
  /** Kleingeschriebener Familienname -> vorhandene Schnitte. */
  styles: Map<string, Set<string>>;
  /** Kleingeschriebener Familienname -> Original-Schreibweise. */
  names: Map<string, string>;
  fallback: string;
}

/** PDF-Standardschriften auf das, was in Figma ueblicherweise da ist. */
const ALIASES: Record<string, string[]> = {
  helvetica: ["Helvetica", "Helvetica Neue", "Arial", "Inter"],
  arial: ["Arial", "Helvetica", "Inter"],
  arialmt: ["Arial", "Helvetica", "Inter"],
  times: ["Times New Roman", "Times", "Georgia"],
  timesnewroman: ["Times New Roman", "Times", "Georgia"],
  timesnewromanpsmt: ["Times New Roman", "Times", "Georgia"],
  courier: ["Courier New", "Courier", "Roboto Mono"],
  couriernew: ["Courier New", "Courier", "Roboto Mono"],
  symbol: ["Inter"],
  zapfdingbats: ["Inter"],
};

const FALLBACK_CANDIDATES = ["Inter", "Roboto", "Arial", "Helvetica"];

const STYLE_PREFERENCES = {
  boldItalic: ["Bold Italic", "Semi Bold Italic", "Medium Italic", "Italic", "Bold", "Regular"],
  bold: ["Bold", "Semi Bold", "SemiBold", "Medium", "Black", "Regular"],
  italic: ["Italic", "Oblique", "Regular"],
  regular: ["Regular", "Book", "Normal", "Medium", "Light"],
};

export async function buildFontIndex(): Promise<FontIndex> {
  const available = await figma.listAvailableFontsAsync();

  const styles = new Map<string, Set<string>>();
  const names = new Map<string, string>();

  for (const entry of available) {
    const family = entry.fontName.family;
    const key = family.toLowerCase();
    if (!styles.has(key)) {
      styles.set(key, new Set());
      names.set(key, family);
    }
    styles.get(key)!.add(entry.fontName.style);
  }

  const fallback = FALLBACK_CANDIDATES.find((name) => styles.has(name.toLowerCase()));
  if (!fallback) throw new Error("Keine verwendbare Standardschrift in Figma gefunden.");

  return { styles, names, fallback };
}

export function pickFont(index: FontIndex, run: TextRun): FontName {
  const family = resolveFamily(index, run.fontName);
  const available = index.styles.get(family.toLowerCase());
  if (!available) return { family, style: "Regular" };

  const preferences =
    run.bold && run.italic
      ? STYLE_PREFERENCES.boldItalic
      : run.bold
        ? STYLE_PREFERENCES.bold
        : run.italic
          ? STYLE_PREFERENCES.italic
          : STYLE_PREFERENCES.regular;

  for (const style of preferences) {
    if (available.has(style)) return { family, style };
  }

  // Irgendein vorhandener Schnitt ist besser als ein Ladefehler.
  const first = available.values().next();
  return { family, style: first.done ? "Regular" : first.value };
}

function resolveFamily(index: FontIndex, pdfName: string): string {
  for (const candidate of familyCandidates(pdfName)) {
    const key = candidate.toLowerCase();
    const existing = index.names.get(key);
    if (existing) return existing;

    for (const alias of ALIASES[key.replace(/[\s-]/g, "")] ?? []) {
      const aliasName = index.names.get(alias.toLowerCase());
      if (aliasName) return aliasName;
    }
  }

  return index.names.get(index.fallback.toLowerCase()) ?? index.fallback;
}

/**
 * Aus "Helvetica-BoldOblique" werden die Kandidaten
 * ["Helvetica-BoldOblique", "Helvetica", "Helvetica"] — vom spezifischsten
 * zum allgemeinsten, damit eine exakt passende Familie gewinnt.
 */
function familyCandidates(pdfName: string): string[] {
  const base = pdfName.replace(/^[A-Z]{6}\+/, "").trim();
  if (!base) return [];

  const withoutStyle = base
    .split(/[-,]/)[0]
    .replace(/(MT|PS|Std|Pro)$/i, "")
    .trim();

  const spaced = withoutStyle.replace(/([a-z])([A-Z])/g, "$1 $2");

  return [...new Set([base, withoutStyle, spaced].filter(Boolean))];
}
