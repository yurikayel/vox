import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../client/js/app/route-parse.js";
import {
  renderAjudaTeste,
  VOX_GITHUB_ISSUES,
} from "../client/js/render/ajuda-teste.js";
import { VOX_GITHUB_DOCS } from "../client/js/render/voxpedia.js";

const BANNED = [/100%\s*P2P/i, /imunidade\s+total/i, /P2P\s+total\s+no\s+celular/i];

function withLocation({ hash = "" }, fn) {
  const loc = { hash, search: "" };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("ajuda-teste route", () => {
  it("resolves #/ajuda/teste", () => {
    withLocation({ hash: "#/ajuda/teste" }, () => {
      assert.deepEqual(parseRoute(), { name: "ajuda-teste" });
    });
  });
});

describe("renderAjudaTeste", () => {
  const html = renderAjudaTeste();

  it("covers tester checklist and honest network copy", () => {
    assert.match(html, /Teste aberto/i);
    assert.match(html, /15 min/i);
    assert.match(html, /Pacto Vox/i);
    assert.match(html, /#\/settings\/network/);
    assert.match(html, /demo-aprenda-vox/);
    assert.match(html, /#\/status/);
    assert.match(html, /Leitura reserva/i);
    assert.match(html, /não precis/i);
    assert.match(html, /relay/i);
    assert.match(html, /IndexedDB/i);
    assert.match(html, /Pausar ajuda/i);
    assert.match(html, /#\/wallet/);
    assert.match(html, /piloto/i);
    assert.match(html, /BR Code|offline/i);
    assert.match(html, /não custodia/i);
  });

  it("links GitHub docs and issues", () => {
    assert.match(
      html,
      new RegExp(`href="${VOX_GITHUB_DOCS.docsReadme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    );
    assert.match(html, new RegExp(`href="${VOX_GITHUB_ISSUES.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });

  it("avoids banned hype phrases in tester copy", () => {
    for (const re of BANNED) {
      assert.doesNotMatch(html, re, `banned phrase matched: ${re}`);
    }
  });
});
