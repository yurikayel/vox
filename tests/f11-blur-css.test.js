/**
 * F11: Valida estilos acessíveis em `client/css/agora.css` para borrão local
 * (`feed-post-item.js`) e aviso local consultivo (`local-advisory.js`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzePrePublishAdvisory,
  renderLocalAdvisoryBanner,
} from "../client/js/shared/local-advisory.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGORA_CSS = fs.readFileSync(path.join(ROOT, "client/css/agora.css"), "utf8");
const FEED_POST_JS = fs.readFileSync(
  path.join(ROOT, "client/js/render/feed-post-item.js"),
  "utf8"
);

function extractClassesFromHtml(html) {
  const classes = new Set();
  for (const m of html.matchAll(/\bclass="([^"]+)"/g)) {
    for (const token of m[1].split(/\s+/)) {
      if (token) classes.add(token);
    }
  }
  return [...classes];
}

function getF11CssSection(css) {
  const marker = "/* ── F11:";
  const idx = css.indexOf(marker);
  assert.ok(idx >= 0, "Seção F11 ausente em client/css/agora.css");
  return css.slice(idx);
}

const F11_CSS = getF11CssSection(AGORA_CSS);

describe("F11 — Borrão local de post em client/css/agora.css", () => {
  it("estiliza todas as classes e atributos de borrão emitidos por feed-post-item.js", () => {
    const requiredTokens = [
      "is-locally-blurred",
      'data-locally-blurred="1"',
      "post-local-blur-banner",
      "data-local-blur-banner",
      "post-local-blur-text",
      "post-local-blur-reveal",
    ];
    for (const token of requiredTokens) {
      assert.ok(FEED_POST_JS.includes(token), `feed-post-item.js deve emitir ${token}`);
      assert.ok(F11_CSS.includes(token), `agora.css (F11) deve estilizar ${token}`);
    }
  });

  it("aplica blur(8px) e user-select: none apenas fora do banner, mantendo-o nítido e clicável", () => {
    assert.match(
      F11_CSS,
      /\.post\.is-locally-blurred\s*>\s*:not\(\[data-local-blur-banner\]\)[\s\S]*?filter:\s*blur\(8px\)/
    );
    assert.match(
      F11_CSS,
      /\.post\[data-locally-blurred="1"\]\s*>\s*:not\(\[data-local-blur-banner\]\)[\s\S]*?user-select:\s*none/
    );
    assert.match(
      F11_CSS,
      /\.post-local-blur-banner,\s*\[data-local-blur-banner\]\s*\{[\s\S]*?filter:\s*none[\s\S]*?pointer-events:\s*auto/
    );
  });
});

describe("F11 — Aviso local consultivo em client/css/agora.css", () => {
  it("estiliza 100% das classes emitidas por renderLocalAdvisoryBanner", () => {
    const result = analyzePrePublishAdvisory("Contato: teste@example.com http://site.invalid");
    const html = renderLocalAdvisoryBanner(result);
    assert.ok(html.length > 0, "Banner consultivo deve ser renderizado para rascunho com avisos");

    const emittedClasses = extractClassesFromHtml(html);
    assert.ok(emittedClasses.length >= 5, "Banner consultivo deve emitir classes semânticas");
    for (const cls of emittedClasses) {
      assert.ok(F11_CSS.includes(`.${cls}`), `agora.css (F11) deve estilizar .${cls}`);
    }
  });
});

describe("F11 — Acessibilidade WCAG AA, foco, toque, movimento reduzido e tokens de papel", () => {
  it("garante alvo de toque >= 44px nos botões de revelar e de ação consultiva", () => {
    assert.match(F11_CSS, /\.post-local-blur-reveal\s*\{[^}]*min-height:\s*44px/);
    assert.match(
      F11_CSS,
      /\.vox-advisory-review,\s*\.vox-advisory-ignore\s*\{[^}]*min-height:\s*44px/
    );
  });

  it("define foco visível (:focus-visible) sem suprimir outline", () => {
    assert.match(F11_CSS, /\.post-local-blur-reveal:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/);
    assert.match(
      F11_CSS,
      /\.vox-advisory-review:focus-visible,\s*\.vox-advisory-ignore:focus-visible\s*\{[^}]*outline:\s*2px\s+solid/
    );
  });

  it("desativa transições em @media (prefers-reduced-motion: reduce)", () => {
    const reducedMatch = F11_CSS.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/
    );
    assert.ok(reducedMatch, "Seção F11 deve declarar @media (prefers-reduced-motion: reduce)");
    assert.match(reducedMatch[1], /\.post\.is-locally-blurred\s*>\s*:not\(\[data-local-blur-banner\]\)/);
    assert.match(reducedMatch[1], /transition:\s*none/);
  });

  it("usa apenas tokens Sovereign Agora sem cores roxas proibidas", () => {
    assert.match(F11_CSS, /var\(--sa-surface-low\)/);
    assert.match(F11_CSS, /var\(--sa-on-surface\)/);
    assert.match(F11_CSS, /var\(--sa-primary\)/);
    assert.match(F11_CSS, /var\(--sa-on-primary-fixed\)/);
    assert.doesNotMatch(F11_CSS, /#312183|#c8c0f0|#0c0a18|purple/i);
  });
});
