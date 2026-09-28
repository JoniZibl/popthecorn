/**
 * Erzeugt ein minimales zweiseitiges Test-PDF ohne externe Abhaengigkeiten.
 *
 * Seite 1 enthaelt bewusst zwei Tj-Operatoren auf derselben Baseline
 * ("Hallo " + "Welt"), damit der Merge-Algorithmus aus src/shared/text.ts
 * etwas zu tun bekommt.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

const CONTENT_PAGE_1 = `0.9 0.2 0.2 rg
50 700 200 80 re f
BT /F1 24 Tf 50 640 Td (Hallo ) Tj (Welt) Tj ET
BT /F1 12 Tf 50 600 Td (Zweite Zeile) Tj ET
`;

const CONTENT_PAGE_2 = `0.2 0.4 0.9 rg
100 400 300 120 re f
BT /F1 18 Tf 100 350 Td (Seite zwei) Tj ET
`;

export function buildPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    page(6),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    page(7),
    stream(CONTENT_PAGE_1),
    stream(CONTENT_PAGE_2),
  ];

  const chunks = ["%PDF-1.4\n"];
  const offsets = [];
  let position = chunks[0].length;

  objects.forEach((body, index) => {
    const text = `${index + 1} 0 obj\n${body}\nendobj\n`;
    offsets.push(position);
    position += text.length;
    chunks.push(text);
  });

  const xrefStart = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(chunks.join("") + xref, "latin1");
}

function page(contentsObject) {
  return (
    "<< /Type /Page /Parent 2 0 R " +
    `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
    "/Resources << /Font << /F1 4 0 R >> >> " +
    `/Contents ${contentsObject} 0 R >>`
  );
}

function stream(content) {
  return `<< /Length ${content.length} >>\nstream\n${content}endstream`;
}
