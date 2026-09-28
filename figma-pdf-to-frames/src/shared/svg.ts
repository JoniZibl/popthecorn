const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * pdf.js' SVGGraphics schreibt jedes Element mit `svg:`-Praefix
 * (`<svg:svg xmlns:svg="...">`). Figmas SVG-Parser kommt damit nicht
 * zuverlaessig klar, deshalb wird der Praefix entfernt.
 */
export function normalizeSvg(svg: string): string {
  let out = svg.replace(/<(\/?)svg:/g, "<$1").replace(/\sxmlns:svg=/g, " xmlns=");

  if (!/<svg\b[^>]*\sxmlns=/.test(out)) {
    out = out.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);
  }

  return out;
}

/** Fehlende width/height ergaenzen — Figma braucht sie fuer die Frame-Groesse. */
export function ensureSvgSize(svg: string, width: number, height: number): string {
  if (/<svg\b[^>]*\swidth=/.test(svg)) return svg;
  return svg.replace(/<svg\b/, `<svg width="${width}" height="${height}"`);
}
