import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as render from "../client/js/render.js";
import { renderDemoModeBanner } from "../client/js/render/shell.js";
import { MOCK_DEMO_COMMUNITY } from "../client/js/mock.js";

const CLIENT_JS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/js");
const FORBIDDEN_PATTERNS = [/100% P2P/i, /imunidade total/i, /imunidade regulat/i, /ranking de nós/i];

const readClientJs = (relPath) => fs.readFileSync(path.join(CLIENT_JS_DIR, relPath), "utf8");

function assertNoForbiddenCopy(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.doesNotMatch(content, pattern, `${path.basename(filePath)} não deve conter ${pattern}`);
  }
}

test("DOC-04 - perfil próprio cita malha e arweaveUpload desligado", () => {
  const main = { innerHTML: "" };
  render.renderProfile(main, "vx_self_test", [], true, { activeTab: "about", displayName: "Teste" });
  assert.match(main.innerHTML, /arweaveUpload: false/);
  assert.match(main.innerHTML, /Carteira Arweave \(opcional\)/);
  assert.ok(!main.innerHTML.includes("permanentemente no permaweb"));
});

test("DOC-04 - home comunidade: origem malha vs gateway (não Permaweb)", () => {
  const main = { innerHTML: "" };
  const communities = [
    { id: "a", title: "Malha", description: "x", isLocalP2p: true, memberCount: 2 },
    { id: "b", title: "Espelho", description: "y", isLocalP2p: false, memberCount: 1 },
  ];
  render.renderHome(main, communities);
  assert.match(main.innerHTML, /Na malha/);
  assert.match(main.innerHTML, /Via gateway/);
  assert.ok(!main.innerHTML.includes("Permaweb"));
});

test("DOC-04 - tópico: badge de origem honesta", () => {
  const main = { innerHTML: "" };
  const topic = { id: "t1", title: "Olá", body: "corpo", author: "vx_a", isLocalP2p: false, ts: Date.now() };
  render.renderTopic(main, "t1", topic, []);
  assert.match(main.innerHTML, /Via gateway/);
  assert.ok(!main.innerHTML.includes(">Guardado<"));
});

test("DOC-04 - demo: mock tour e banner citam malha sem permaweb automático", () => {
  assert.match(MOCK_DEMO_COMMUNITY.welcomeRecado, /fictícios/);
  assert.match(MOCK_DEMO_COMMUNITY.description, /sem Arweave/);
  assert.match(renderDemoModeBanner(), /sem gravação Arweave/);
});

test("DOC-04 - compositor e feed: badges Lo-Fi sem '100% Grátis' ou 'Permaweb Arweave'", () => {
  const feedSrc = readClientJs("render/feed.js");
  const composerSrc = readClientJs("app/inline-composer.js");
  assert.doesNotMatch(feedSrc, /100% Grátis/i);
  assert.doesNotMatch(composerSrc, /100% Grátis/i);
  assert.doesNotMatch(composerSrc, /Permaweb Arweave/i);
  assert.match(feedSrc, /mídia leve para a malha/);
  assert.match(composerSrc, /mídia leve para a malha/);
});

test("DOC-04 - termos proibidos ausentes na UI renderizada, i18n, mock e inline-composer", () => {
  const renderDir = path.join(CLIENT_JS_DIR, "render");
  const files = [
    path.join(CLIENT_JS_DIR, "i18n-pt-br.js"),
    path.join(CLIENT_JS_DIR, "mock.js"),
    path.join(CLIENT_JS_DIR, "app/inline-composer.js"),
    ...fs.readdirSync(renderDir).filter((f) => f.endsWith(".js")).map((f) => path.join(renderDir, f)),
  ];
  for (const filePath of files) {
    assertNoForbiddenCopy(filePath);
  }
});
