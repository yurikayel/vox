import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const agoraCss = fs.readFileSync(path.join(root, "css/agora.css"), "utf8");

test("typography civic — CSS tokens and display pairing", () => {
  assert.match(css, /--font-sans:\s*"Inter"/);
  assert.match(css, /--font-display:\s*"Noto Serif"/);
  // Sovereign Agora (Stitch): Domine epigráfica + Work Sans, com Noto Serif/Inter como fallback local.
  assert.match(agoraCss, /--font-epigraphic:\s*"Domine",\s*"Noto Serif"/);
  assert.match(agoraCss, /--font-telemetry:\s*"Work Sans",\s*"Inter"/);
  assert.match(css, /--font-weight-nav:\s*600/);
  assert.ok(css.includes("font-family: var(--font-sans)"));
  // O wordmark V/O/X tricolor (.brand-word/.brand-letter-*) saiu do shell no rework Stitch; o CSS morto foi
  // removido em 2026-11-11. O wordmark atual é o .agora-wordmark, coberto pelos testes do shell; a fonte de
  // títulos é aplicada pela camada agora.css (--font-epigraphic, que é o --font-display).
  assert.ok(agoraCss.includes("var(--font-epigraphic)"));
});

test("typography civic — ADR-016: shell sem Google Fonts (LGPD/soberania) e com camada agora.css", () => {
  assert.ok(!indexHtml.includes("fonts.googleapis.com"));
  assert.ok(!indexHtml.includes("fonts.gstatic.com"));
  assert.ok(indexHtml.includes('href="css/agora.css"'));
  assert.ok(indexHtml.indexOf("css/style.css") < indexHtml.indexOf("css/agora.css"), "agora.css carrega depois de style.css");
});
