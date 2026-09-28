/**
 * End-to-End-Smoke-Test der UI-Haelfte: laedt die gebaute dist/ui.html in
 * Chromium, schiebt ein Test-PDF durch den File-Input und prueft die Nachricht,
 * die das Plugin bekommen wuerde.
 *
 * Die Figma-Haelfte (src/plugin) laesst sich so nicht testen — dafuer gibt es
 * keine oeffentliche Laufzeit ausserhalb von Figma.
 *
 *   npm run build && npm run test
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { buildPdf } from "./fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiPath = path.join(root, "dist", "ui.html");

const server = await serveFile(uiPath);
const browser = await chromium.launch();

try {
  const workDir = await mkdtemp(path.join(tmpdir(), "pdf2frames-"));
  const pdfPath = path.join(workDir, "probe.pdf");
  await writeFile(pdfPath, buildPdf());

  await run("Modus: vector", server.url, pdfPath, "vector", (result) => {
    assert.equal(result.type, "pages");
    assert.equal(result.fileName, "probe");
    assert.equal(result.pages.length, 2, "beide Seiten importiert");

    for (const page of result.pages) {
      assert.ok(Math.abs(page.width - 595) < 1, `Breite ${page.width} ≈ 595 pt`);
      assert.ok(Math.abs(page.height - 842) < 1, `Höhe ${page.height} ≈ 842 pt`);
      assert.ok(page.svg && page.svg.startsWith("<svg"), "SVG ohne svg:-Präfix");
      assert.ok(!/<svg:/.test(page.svg), "keine namespace-präfixierten Tags");
      assert.equal(page.png, null);
    }
  });

  await run("Modus: hybrid", server.url, pdfPath, "hybrid", (result) => {
    const [first] = result.pages;

    assert.ok(!/<text/.test(first.svg), "Text ist aus dem SVG entfernt");

    const strings = first.texts.map((run) => run.str);
    assert.deepEqual(
      strings,
      ["Hallo Welt", "Zweite Zeile"],
      "benachbarte Runs derselben Zeile sind zusammengefasst",
    );

    const [headline, line] = first.texts;
    assert.ok(Math.abs(headline.size - 24) < 0.5, `Schriftgröße ${headline.size} ≈ 24`);
    assert.ok(headline.y < line.y, "Baselines laufen von oben nach unten (Figma-Koordinaten)");
    // PDF-Baseline y=640 von unten entspricht 842-640=202 von oben.
    assert.ok(Math.abs(headline.y - 202) < 1, `Baseline ${headline.y} ≈ 202`);
    assert.ok(Math.abs(headline.x - 50) < 1, `x ${headline.x} ≈ 50`);
  });

  await run("Modus: image", server.url, pdfPath, "image", (result) => {
    for (const page of result.pages) {
      assert.equal(page.svg, null);
      assert.ok(page.png, "PNG-Bytes vorhanden");
      // Uint8Array wird beim postMessage zu einem Objekt mit Zahlen-Keys.
      const bytes = Object.values(page.png);
      assert.ok(bytes.length > 1000, `PNG hat ${bytes.length} Bytes`);
      assert.deepEqual(bytes.slice(0, 4), [0x89, 0x50, 0x4e, 0x47], "PNG-Signatur");
    }
  });

  await run("Seitenbereich", server.url, pdfPath, "vector", (result) => {
    assert.deepEqual(
      result.pages.map((page) => page.index),
      [2],
      "nur die gewählte Seite",
    );
  }, "2");

  console.log("\nalle Tests bestanden");
} finally {
  await browser.close();
  server.close();
}

async function run(label, url, pdfPath, mode, check, range) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(url);

  // parent === window auf oberster Ebene, die postMessage-Aufrufe der UI
  // landen also im selben Fenster.
  await page.evaluate(() => {
    window.__received = [];
    window.addEventListener("message", (event) => {
      if (event.data?.pluginMessage) window.__received.push(event.data.pluginMessage);
    });
  });

  await page.check(`input[name="mode"][value="${mode}"]`);
  if (range) {
    await page.uncheck("#all-pages");
    await page.fill("#range", range);
  }

  await page.setInputFiles("#file", pdfPath);

  await page.waitForFunction(
    () => window.__received.some((message) => message.type === "pages" || message.type === "error"),
    undefined,
    { timeout: 30_000 },
  );

  const result = await page.evaluate(() =>
    window.__received.find((message) => message.type === "pages" || message.type === "error"),
  );

  assert.equal(errors.length, 0, `keine JS-Fehler: ${errors.join("; ")}`);
  assert.notEqual(result.type, "error", `UI meldete: ${result.message}`);
  check(result);

  await page.close();
  console.log(`ok — ${label}`);
}

async function serveFile(filePath) {
  const body = await readFile(filePath);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(body);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}
