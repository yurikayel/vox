import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderComposeCommunity } from "../client/js/render/profile-compose-wizards.js";
import { installFakeDom, withToasts, settle } from "./helpers/cov-t2-dom.mjs";
import * as composeCommunity from "../client/js/app/compose-community.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/identity/index.js";
import {
  loadKitGenesis,
  normalizeKitCreatorAddr,
  listCommunityKitSummaries,
  renderKitPickerPanelHtml,
  applyKitToCommunityForm,
  buildCommunityFromKit,
  bindCommunityKitPicker,
} from "../client/js/app/compose-community-kit.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeFakeEl(id, extra = {}) {
  const listeners = new Map();
  return {
    id,
    value: "",
    checked: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    disabled: false,
    dataset: {},
    attrs: new Map(),
    setAttribute(k, v) { this.attrs.set(k, v); },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    async fire(ev, eventObj = {}) {
      for (const fn of listeners.get(ev) || []) await fn(eventObj);
    },
    ...extra,
  };
}

function makeKitDom() {
  const els = new Map([
    ["btn-open-kit-genesis", makeFakeEl("btn-open-kit-genesis")],
    ["comm-kit-picker-panel", makeFakeEl("comm-kit-picker-panel", { hidden: true })],
    ["comm-title", makeFakeEl("comm-title")],
    ["comm-id", makeFakeEl("comm-id")],
    ["comm-category", makeFakeEl("comm-category")],
    ["comm-type", makeFakeEl("comm-type")],
    ["comm-desc", makeFakeEl("comm-desc")],
  ]);
  return {
    els,
    doc: { getElementById: (id) => els.get(id) || null },
  };
}

test("kit-genesis-plug - usa import() dinâmico lazy sem import estático de labs/", () => {
  const src = fs.readFileSync(path.join(ROOT, "client/js/app/compose-community-kit.js"), "utf8");
  assert.match(src, /import\(\s*["']\.\.\/labs\/parado\/kit-genesis\.js["']\s*\)/);
  assert.doesNotMatch(src, /^import\s+.*kit-genesis\.js/m);
});

test("kit-genesis-plug - renderComposeCommunity expõe entrada de modelo preservando 5 etapas", () => {
  const main = { innerHTML: "" };
  renderComposeCommunity(main);
  assert.ok(main.innerHTML.includes('id="btn-open-kit-genesis"'));
  assert.ok(main.innerHTML.includes("Criar comunidade a partir de modelo"));
  assert.ok(main.innerHTML.includes('id="comm-kit-picker-panel" hidden'));
  assert.equal((main.innerHTML.match(/class="compose-step"/g) || []).length, 5);
});

test("kit-genesis-plug - lista os 3 kits (Bairro, Sindicato, Coletivo) via import lazy", async () => {
  const kits = await listCommunityKitSummaries();
  assert.equal(kits.length, 3);
  assert.deepEqual(kits.map((k) => k.id), ["kit-bairro", "kit-sindicato", "kit-coletivo"]);
  assert.deepEqual(kits.map((k) => k.shortLabel), ["Bairro", "Sindicato", "Coletivo"]);
  assert.equal(kits[0].visibility, "open");
  assert.equal(kits[1].visibility, "closed");
  assert.equal(kits[2].visibility, "open");
});

test("kit-genesis-plug - criação a partir de modelo com cartridges opcionais (false padrão, true opt-in)", async () => {
  const semCartuchos = await buildCommunityFromKit({
    kitId: "kit-bairro",
    creatorAddr: "vx_ed25519_criador_01",
    id: "bairro-centro",
    title: "Bairro Centro",
    desc: "Zeladoria do centro.",
  });
  assert.equal(semCartuchos.kitId, "kit-bairro");
  assert.equal(semCartuchos.communityId, "bairro-centro");
  assert.equal(semCartuchos.name, "Bairro Centro");
  assert.deepEqual(semCartuchos.cartridges, []);
  assert.ok(semCartuchos.channels.length >= 3);

  const comCartuchos = await buildCommunityFromKit({
    kitId: "kit-coletivo",
    creatorAddr: "abc",
    includeCartridges: true,
  });
  assert.equal(comCartuchos.kitId, "kit-coletivo");
  assert.ok(comCartuchos.creatorAddr.startsWith("vx_"));
  assert.ok(comCartuchos.cartridges.length > 0);
  assert.equal(comCartuchos.cartridges[0].communityId, comCartuchos.communityId);
});

test("kit-genesis-plug - normalizeKitCreatorAddr valida e normaliza identificadores", () => {
  assert.equal(normalizeKitCreatorAddr("vx_ed25519_abc"), "vx_ed25519_abc");
  assert.equal(normalizeKitCreatorAddr("alice1234"), "vx_alice1234");
  assert.equal(normalizeKitCreatorAddr("ab"), "vx_ab000");
  assert.throws(() => normalizeKitCreatorAddr(""), /obrigatória/);
});

test("kit-genesis-plug - renderKitPickerPanelHtml aplica escapeHtml contra XSS", () => {
  const maliciousKit = {
    id: 'kit-xss"><img src=x onerror=alert(1)>',
    shortLabel: "<script>alert(1)</script>",
    title: "Título & 'teste'",
    description: '<svg onload="evil()">desc',
    channels: [{ title: "<b>Canal</b>" }],
  };
  const html = renderKitPickerPanelHtml([maliciousKit], maliciousKit.id, false);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<svg onload"));
  assert.ok(!html.includes("<b>Canal</b>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;b&gt;Canal&lt;/b&gt;"));
  assert.ok(html.includes("data-kit-clear"));
  assert.ok(!html.includes('id="comm-kit-include-cartridges" checked'));
});

test("kit-genesis-plug - bindCommunityKitPicker carrega lazy, preenche formulário, alterna cartuchos e limpa", async () => {
  const { els, doc } = makeKitDom();
  const state = { kitId: "", includeCartridges: false };
  let loadCount = 0;
  const loader = async () => {
    loadCount += 1;
    return loadKitGenesis();
  };

  bindCommunityKitPicker(state, { loadKit: loader, doc });
  assert.equal(loadCount, 0);

  const btn = els.get("btn-open-kit-genesis");
  const panel = els.get("comm-kit-picker-panel");
  await btn.fire("click");
  assert.equal(loadCount, 1);
  assert.equal(panel.hidden, false);
  assert.ok(panel.innerHTML.includes("Bairro") && panel.innerHTML.includes("Sindicato") && panel.innerHTML.includes("Coletivo"));

  await panel.fire("click", {
    target: { closest: (sel) => (sel === "[data-kit-id]" ? { dataset: { kitId: "kit-sindicato" } } : null) },
  });
  assert.equal(state.kitId, "kit-sindicato");
  assert.equal(els.get("comm-id").value, "meu-sindicato");
  assert.equal(els.get("comm-type").value, "closed");
  assert.ok(els.get("comm-desc").value.includes("Assembleia Permanente"));

  await panel.fire("change", { target: { id: "comm-kit-include-cartridges", checked: true } });
  assert.equal(state.includeCartridges, true);

  await panel.fire("click", { target: { closest: (sel) => (sel === "[data-kit-clear]" ? {} : null) } });
  assert.equal(state.kitId, "");
  assert.equal(state.includeCartridges, false);

  await btn.fire("click");
  assert.equal(panel.hidden, true);
  await btn.fire("click");
  assert.equal(loadCount, 1);
});

test("kit-genesis-plug - applyKitToCommunityForm e bindCommunityKitPicker toleram DOM ausente", () => {
  const emptyDoc = { getElementById: () => null };
  assert.doesNotThrow(() => applyKitToCommunityForm({ title: "T", suggestedSlug: "s", category: "C", visibility: "open", description: "D" }, emptyDoc));
  assert.doesNotThrow(() => bindCommunityKitPicker({ kitId: "", includeCartridges: false }, { doc: emptyDoc }));
});

test("kit-genesis-plug - showComposeCommunity assina comunidade criada a partir de modelo", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const doc = installFakeDom();
  doc.add("div", { id: "app-root" });
  doc.add("main", { id: "app-main" });
  const form = doc.add("form", { id: "form-compose-community" });
  doc.add("button", { id: "btn-open-kit-genesis" });
  const panel = doc.add("div", { id: "comm-kit-picker-panel", hidden: true });
  doc.add("input", { id: "comm-id", value: "bairro-kit" });
  doc.add("input", { id: "comm-title", value: "Bairro Kit" });
  doc.add("input", { id: "comm-category", value: "Cidades & Bairros" });
  doc.add("input", { id: "comm-desc", value: "Comunidade criada de modelo" });
  doc.add("input", { id: "comm-type", value: "open" });
  doc.add("button", { id: "btn-submit-comm" });

  await composeCommunity.showComposeCommunity();
  doc.getElementById("btn-open-kit-genesis").fire("click", {});
  await settle(20);
  panel.fire("click", {
    target: { closest: (sel) => (sel === "[data-kit-id]" ? { dataset: { kitId: "kit-bairro" } } : null) },
  });
  await settle(10);
  const toasts = await withToasts(doc, async () => {
    form.fire("submit", { target: form });
    await settle(30);
  });
  assert.deepEqual(toasts, ["Comunidade criada na rede!"]);
  const [saved] = await cacheNode.getLocalPosts({ type: "community", communityId: "meu-bairro" });
  assert.equal(saved.kitId, "kit-bairro");
  assert.ok(Array.isArray(saved.kitChannels) && saved.kitChannels.length >= 3);
  assert.deepEqual(saved.kitCartridges, []);
});
