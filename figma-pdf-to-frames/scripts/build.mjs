import { mkdir, readFile, writeFile } from "node:fs/promises";
import { watch as watchDir } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const isWatch = process.argv.includes("--watch");

// pdf.js wird NICHT mitgebundelt: der Distributions-Build enthaelt ein
// `require("canvas")` fuer Node, an dem sich Bundler regelmaessig verschlucken.
// Stattdessen landet die fertige Datei als eigener <script>-Block in der HTML.
const PDFJS_LIB = require.resolve("pdfjs-dist/legacy/build/pdf.min.js");
const PDFJS_WORKER = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.js");

async function buildPlugin() {
  await esbuild.build({
    entryPoints: [path.join(root, "src/plugin/code.ts")],
    outfile: path.join(dist, "code.js"),
    bundle: true,
    format: "iife",
    // Figmas Sandbox ist QuickJS: async/await ja, neuere Syntax lieber nicht.
    target: ["es2017"],
    minify: !isWatch,
    logLevel: "warning",
  });
}

async function buildUi() {
  const [workerSource, pdfjsSource, template] = await Promise.all([
    readFile(PDFJS_WORKER, "utf8"),
    readFile(PDFJS_LIB, "utf8"),
    readFile(path.join(root, "src/ui/index.html"), "utf8"),
  ]);

  const result = await esbuild.build({
    entryPoints: [path.join(root, "src/ui/main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome90"],
    minify: !isWatch,
    logLevel: "warning",
    banner: {
      js: `var __PDF_WORKER_SOURCE__ = ${JSON.stringify(workerSource)};`,
    },
  });

  const bundle = result.outputFiles[0].text;
  const html = template
    .replace("<!--PDFJS-->", () => scriptTag(pdfjsSource))
    .replace("<!--BUNDLE-->", () => scriptTag(bundle));

  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "ui.html"), html);

  return Buffer.byteLength(html);
}

/**
 * Inline-Script bauen. `</script>` im JS wuerde den Block sonst vorzeitig
 * schliessen; die Ersetzung ist innerhalb von JS-Strings aequivalent.
 */
function scriptTag(source) {
  return `<script>\n${source.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

async function buildAll() {
  const started = Date.now();
  await buildPlugin();
  const uiBytes = await buildUi();
  const kb = Math.round(uiBytes / 1024);
  console.log(`build ok — ui.html ${kb} kB, ${Date.now() - started} ms`);
}

await mkdir(dist, { recursive: true });
await buildAll();

if (isWatch) {
  console.log("watching src/ …");
  let pending = null;

  watchDir(path.join(root, "src"), { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      buildAll().catch((error) => console.error(error.message));
    }, 80);
  });
}
