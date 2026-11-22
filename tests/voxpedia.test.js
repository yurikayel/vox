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

describe("renderVoxpedia headings & structure", () => {
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
  });

  it("mentions key product summaries", () => {
    assert.match(html, /Pacto Vox/i);
    assert.match(html, /vx_/);
    assert.match(html, /IndexedDB/i);
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

describe("renderVoxpedia core topics", () => {
  const html = renderVoxpedia();

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

  it("states Arweave upload paused by default (DOC-04)", () => {
    assert.match(html, /arweaveUpload:\s*false/i);
    assert.match(html, /grava[cç][aã]o no Arweave está pausada/i);
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
});

describe("renderVoxpedia nov/2026 features", () => {
  const html = renderVoxpedia();

  it("covers sovereign entry and exit (phrase, guardians, vaults)", () => {
    assert.match(html, /Entrada e saída soberana/i);
    assert.match(html, /Frase de recuperação 12\/24 palavras/i);
    assert.match(html, /#\/frase/);
    assert.match(html, /12 palavras para contas novas, 24 para legadas/);
    assert.match(html, /cartão sem QR/);
    assert.match(html, /Guardiões 3-de-5 e devolução/i);
    assert.match(html, /#\/guardioes/);
    assert.match(html, /#\/voltar/);
    assert.match(html, /Shamir GF\(256\)/);
    assert.match(html, /Cofre v2 por senha e cofre na malha/i);
    assert.match(html, /#\/backup/);
    assert.match(html, /#\/sync/);
    assert.match(html, /anti-rollback/i);
    assert.match(html, /ADR-037/);
    assert.match(html, /pedido cego no relay/i);
  });

  it("covers channel mode and signed local open frames", () => {
    assert.match(html, /Modo canal \(postingMode: &quot;mods&quot;\)|Modo canal \(postingMode: "mods"\)/);
    assert.match(html, /postingMode:\s*"mods"/);
    assert.match(html, /somente moderadores publicam tópicos no feed principal/i);
    assert.match(html, /Open Frames locais assinados/i);
    assert.match(html, /#\/labs\/frames/);
    assert.match(html, /allowlist local/i);
  });

  it("covers hybrid signaling WebSocket + Nostr (REV-09)", () => {
    assert.match(html, /Sinalização híbrida WebSocket \+ Nostr efêmero \(REV-09\)/i);
    assert.match(html, /WebSocket/i);
    assert.match(html, /Nostr efêmero/i);
    assert.match(html, /25050/);
    assert.match(html, /reconexão/i);
  });

  it("covers local protections (quarantine, 14-bit PoW, moderation, sigv: 2)", () => {
    assert.match(html, /Quarentena de chave nova \(PoW 14 bits\)/i);
    assert.match(html, /Proof-of-Work leve de 14 bits/i);
    assert.match(html, /menos de 24h/i);
    assert.match(html, /Moderação comunitária e denúncias/i);
    assert.match(html, /mod-action/);
    assert.match(html, /quarentena preventiva de 48h/i);
    assert.match(html, /sigv:\s*2/);
  });
});

describe("voxpedia shell nav", () => {
  it("sidebar link to #/voxpedia", () => {
    assert.match(shellSrc, /href="#\/voxpedia"/);
    assert.match(shellSrc, /Voxpedia/);
    assert.match(shellSrc, /tab: "voxpedia"/);
  });
});
