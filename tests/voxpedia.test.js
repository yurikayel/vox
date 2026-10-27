import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoute } from "../client/js/app/route-parse.js";
import { renderVoxpedia, VOX_GITHUB_DOCS } from "../client/js/render/voxpedia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellSrc = fs.readFileSync(
  path.join(__dirname, "../client/js/render/shell.js"),
  "utf8"
);

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

describe("voxpedia route", () => {
  it("resolves #/voxpedia", () => {
    withLocation({ hash: "#/voxpedia" }, () => {
      assert.deepEqual(parseRoute(), { name: "voxpedia" });
    });
  });

  it("resolves #/ajuda/voxpedia", () => {
    withLocation({ hash: "#/ajuda/voxpedia" }, () => {
      assert.deepEqual(parseRoute(), { name: "voxpedia" });
    });
  });
});

describe("renderVoxpedia", () => {
  const html = renderVoxpedia();

  it("includes hero and section headings", () => {
    assert.match(html, /<h1>Voxpedia<\/h1>/);
    assert.match(html, /Começar/);
    assert.match(html, /Mensagens/);
    assert.match(html, /Comunidades/);
    assert.match(html, /Rede cooperativa/);
    assert.match(html, /Privacidade &amp; dados|Privacidade & dados/);
    assert.match(html, /Para curiosos \(técnico\)/);
  });

  it("has nested details layers", () => {
    const layerCount = (html.match(/class="voxpedia-layer/g) || []).length;
    assert.ok(layerCount >= 6, `expected multiple voxpedia-layer, got ${layerCount}`);
    assert.ok(html.includes("<details"), "missing details elements");
    assert.ok(html.includes("<summary"), "missing summary elements");
    const firstDetails = html.indexOf("<details");
    const nested = html.indexOf("<details", firstDetails + 1);
    const between = html.slice(firstDetails, nested);
    assert.ok(between.includes("</details>") || html.slice(nested).includes("<details"),
      "expected nesting or sibling layers");
  });

  it("mentions key product summaries", () => {
    assert.match(html, /Pacto Vox/i);
    assert.match(html, /vx_/);
    assert.match(html, /IndexedDB/i);
  });

  it("covers feed transparency and POSSE copy", () => {
    assert.match(html, /sem ranking, sem boost/i);
    assert.match(html, /POSSE/i);
    assert.match(html, /Zap continua existindo/i);
    assert.match(html, /n[aã]o<\/strong> publica sozinho no Facebook ou Instagram/i);
  });

  it("covers civic pull request on community rules", () => {
    assert.match(html, /Pull request cívico \(regras da comunidade\)/);
    assert.match(html, /governance-proposal/);
    assert.match(html, /diff/i);
    assert.match(html, /sim/);
    assert.match(html, /abstenção/);
    assert.match(html, /Eligibility-Cutoff/);
    assert.match(html, /Proposal-Created-At/);
    assert.match(html, /regra daquela comunidade/);
    assert.match(html, /n[aã]o um programa municipal/);
    assert.match(html, /n[aã]o uma carta de federa/);
    assert.match(html, /n[aã]o quórum territorial/);
  });

  it("covers three logics fazenda pensão movimento", () => {
    assert.match(html, /Três lógicas: fazenda, pensão, movimento/);
    assert.match(html, /Big Tech = fazenda/);
    assert.match(html, /Fediverso clássico = pensão/);
    assert.match(html, /Vox = movimento/);
    assert.match(html, /chave no bolso/);
    assert.doesNotMatch(html, /100%\s*P2P/i);
    assert.doesNotMatch(html, /imunidade judicial/i);
    assert.doesNotMatch(html, /calar a rede/i);
    assert.doesNotMatch(html, /confiscar cada celular/i);
    assert.doesNotMatch(html, /confiscate cada celular/i);
  });

  it("links to GitHub technical documentation", () => {
    assert.match(html, /id="voxpedia-docs-github"/);
    assert.match(html, /Documentação técnica \(GitHub\)/);
    assert.match(html, new RegExp(`href="${VOX_GITHUB_DOCS.docsReadme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /repositório é a fonte, não um helpdesk/);
    assert.match(html, new RegExp(`href="${VOX_GITHUB_DOCS.devGuide.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });
});

describe("voxpedia shell nav", () => {
  it("sidebar link to #/voxpedia", () => {
    assert.match(shellSrc, /href="#\/voxpedia"/);
    assert.match(shellSrc, /Voxpedia/);
    assert.match(shellSrc, /activeTab === "voxpedia"/);
  });
});
