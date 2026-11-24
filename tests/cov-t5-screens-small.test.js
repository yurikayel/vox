/**
 * @file Cobertura T5 — vínculo por convite (`vox-link-flow.js`), backup por e-mail (`inbox-backup-ui.js`) e
 * frase de recuperação (`screens-phrase.js`). Cripto e armazenamento reais; DOM e rede falsos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { person } from "./signer.js";
import { makeEl, installDom, settle, unrefLongTimers, waitFor } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();
globalThis.fetch = async () => {
  throw new TypeError("sem rede no teste");
};
URL.createObjectURL = () => "blob:t";
URL.revokeObjectURL = () => {};

const flow = await import("../client/js/app/vox-link-flow.js");
const voxLink = await import("../client/js/vox-link.js");
const ui = await import("../client/js/app/inbox-backup-ui.js");
const phrase = await import("../client/js/app/screens-phrase.js");
const backup = await import("../client/js/identity/index.js");
const cacheNode = await import("../client/js/cache-node.js");
const { verifyPayload } = await import("../client/js/identity/local-account.js");

class Store {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

function deps(who, mesh, over = {}) {
  return {
    getAccount: async () => ({ routeId: who.routeId, createdAt: Date.now() }),
    sign: who.sign, verify: verifyPayload,
    save: async (item) => mesh.set(item.id, item), broadcast: () => {},
    loadRecords: async () => [...mesh.values()], onGossip: () => {},
    storage: new Store(), now: () => 1000, ...over,
  };
}

test("cartão do convite: aceitar grava o aceite, redesenha o cartão e não aparece para si mesmo", async () => {
  const [ana, bia] = [await person(), await person()];
  const mesh = new Map();
  const token = voxLink.currentInvite({ storage: new Store() }).token;
  const card = makeEl();
  const accept = makeEl();
  const main = makeEl({ kids: { "#btn-vox-link-accept": accept, ".vox-link-card": card, "#vox-link-sponsor": makeEl({ checked: true }) } });
  installDom();
  await flow.mountInviteCard(main, { inviter: ana.routeId, token, name: "Ana" }, deps(bia, mesh));
  assert.equal(main.inserted.length, 1);
  await accept.fire("click", { currentTarget: accept });
  const saved = [...mesh.values()];
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, "accept");
  assert.equal(saved[0].sponsor, true);
  assert.ok(card.outerHTML.length > 0, "o cartão foi redesenhado");
  const self = makeEl();
  await flow.mountInviteCard(self, { inviter: bia.routeId, token }, deps(bia, new Map()));
  assert.equal(self.inserted.length, 0, "ninguém aceita o próprio convite");
  await flow.mountInviteCard(null, { inviter: ana.routeId, token });
  await flow.mountInviteCard(self, { inviter: ana.routeId, token: "curto" });
  assert.equal(self.inserted.length, 0);
});

test("cartão do convite: falha ao assinar libera o botão e nada é gravado", async () => {
  const [ana, bia] = [await person(), await person()];
  const token = voxLink.currentInvite({ storage: new Store() }).token;
  const accept = makeEl();
  const main = makeEl({ kids: { "#btn-vox-link-accept": accept } });
  const mesh = new Map();
  installDom();
  const d = deps(bia, mesh, { sign: async () => { throw new Error("sem chave"); } });
  await flow.mountInviteCard(main, { inviter: ana.routeId, token }, d);
  await accept.fire("click", { currentTarget: accept });
  assert.equal(accept.disabled, false);
  assert.equal(mesh.size, 0);
});

test("aceitar convite com as dependências reais grava o aceite no cache local", async () => {
  const ana = await person();
  const token = voxLink.currentInvite({ storage: new Store() }).token;
  const signed = await flow.acceptInvite({ inviter: ana.routeId, token });
  const found = (await cacheNode.getWirePosts()).find((p) => p.id === signed.id);
  assert.equal(found.kind, "accept");
  assert.equal(found.to, ana.routeId);
});

test("startVoxLinks: confirma aceites que chegam por gossip; só liga uma vez", async () => {
  const [ana, bia] = [await person(), await person()];
  const mesh = new Map();
  const storage = new Store();
  const { token } = voxLink.currentInvite({ storage, now: 1000 });
  let listener = null;
  const d = deps(ana, mesh, { storage, onGossip: (fn) => { listener = fn; } });
  await flow.startVoxLinks(d);
  assert.equal(typeof listener, "function");
  await flow.acceptInvite({ inviter: ana.routeId, token }, deps(bia, mesh));
  listener({ type: voxLink.VOX_LINK_TYPE, kind: "accept" });
  await waitFor(() => [...mesh.values()].some((r) => r.kind === "confirm"));
  assert.ok([...mesh.values()].some((r) => r.kind === "confirm" && r.author === ana.routeId));
  let again = 0;
  await flow.startVoxLinks({ ...d, onGossip: () => { again += 1; } });
  assert.equal(again, 0);
});

async function readyBackup() {
  localStorage.clear();
  await backup.ensureLocalAccount();
  await backup.enableInboxBackup("uma senha soberana bem longa");
}

test("backup por e-mail: desligado pede senha; ligado mostra as caixas e o botão completo", async () => {
  localStorage.clear();
  await backup.ensureLocalAccount();
  assert.match(ui.renderInboxBackupSection(), /btn-inbox-backup-enable/);
  await readyBackup();
  const html = ui.renderInboxBackupSection();
  assert.match(html, /data-inbox-send="completo"/);
  assert.match(html, /inbox-backup-weekly" checked/, "ligar já deixa a cadência semanal marcada");
});

test("backup por e-mail: senha curta não liga; senha boa liga e pede redesenho; cadência grava", async () => {
  localStorage.clear();
  await backup.ensureLocalAccount();
  const pass = makeEl({ value: "curta" });
  const enable = makeEl();
  const weekly = makeEl({ checked: false });
  installDom({ ids: { "inbox-backup-pass": pass, "btn-inbox-backup-enable": enable, "inbox-backup-weekly": weekly } });
  let redraw = 0;
  ui.bindInboxBackupSection(() => { redraw += 1; });
  await enable.fire("click");
  assert.equal(redraw, 0);
  assert.equal(backup.getInboxBackupSettings().ready, false);
  pass.value = "uma senha soberana bem longa";
  await enable.fire("click");
  assert.equal(redraw, 1);
  assert.equal(backup.getInboxBackupSettings().ready, true);
  weekly.checked = true;
  await weekly.fire("change", { target: weekly });
  assert.equal(backup.getInboxBackupSettings().weekly, true);
});

test("backup por e-mail: o botão completo só liga depois de montado e baixa o arquivo ao tocar", async () => {
  await readyBackup();
  const send = makeEl();
  const doc = installDom({ qs: { "[data-inbox-send]": send } });
  ui.bindInboxBackupSection(() => {});
  assert.equal(send.disabled, true, "desabilitado enquanto monta");
  await waitFor(() => !send.disabled);
  await send.fire("click");
  await settle();
  const file = doc.created.find((e) => e.download);
  assert.ok(file, "o arquivo foi baixado");
  assert.equal(file.clicks, 1);
});

test("enviar backup: compartilhar do aparelho dá true; cancelar ou falhar dá false", async () => {
  await readyBackup();
  installDom();
  const built = { name: "b.txt", text: "x", to: 5 };
  Object.defineProperty(globalThis.navigator, "canShare", { configurable: true, value: () => true });
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async (d) => shared.push(d) });
  assert.equal(await ui.sendInboxBackup("completo", built), true);
  assert.equal(shared.length, 1);
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); } });
  assert.equal(await ui.sendInboxBackup("completo", built), false);
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async () => { throw new Error("falhou"); } });
  assert.equal(await ui.sendInboxBackup("semana", built), false);
  Object.defineProperty(globalThis.navigator, "canShare", { configurable: true, value: undefined });
});

test("aviso de backup vencido: sem backup ligado nada aparece", async () => {
  localStorage.clear();
  await backup.ensureLocalAccount();
  const doc = installDom();
  await ui.showDueInboxBackup();
  assert.equal(doc.body.children, undefined);
});

test("aviso de backup vencido: com mensal vencido monta a barra e 'Depois' a remove", async () => {
  await readyBackup();
  const doc = installDom();
  const realNow = Date.now;
  Date.now = () => realNow() + 40 * 24 * 60 * 60 * 1000;
  try {
    assert.ok(backup.dueInboxBackups().length > 0);
    await ui.showDueInboxBackup();
  } finally {
    Date.now = realNow;
  }
  const bar = doc.body.children.at(-1);
  assert.equal(bar.attrs.get("role"), "status");
  const later = makeEl({ dataset: { act: "later" } });
  await bar.fire("click", { target: makeEl({ up: { "[data-act]": later } }) });
  assert.equal(bar.removed, true);
});

test("frase: revelar mostra as palavras; conferir errado avisa; certo conclui", async () => {
  localStorage.clear();
  await backup.ensureLocalAccount();
  const screen = makeEl({ id: "phrase-screen" });
  const form = makeEl();
  const pass = makeEl({ value: "" });
  const error = makeEl({ hidden: true });
  const all = {};
  const ids = { "phrase-screen": screen, "form-phrase-show": form, "phrase-pass": pass, "phrase-error": error, "btn-phrase-print": makeEl(), "btn-phrase-written": makeEl(), "btn-phrase-back": makeEl(), "form-phrase-confirm": makeEl(), "btn-phrase-show": makeEl() };
  const doc = installDom({ ids, all });
  await phrase.showRecoveryPhrase();
  assert.ok(doc.main.innerHTML.length > 0);
  assert.equal(pass.focused, 1);
  await form.fire("submit");
  await waitFor(() => screen.innerHTML.length > 0);
  const words = (await backup.getAccountPhrase()).words;
  assert.ok(screen.innerHTML.includes(words[0]));
  await ids["btn-phrase-written"].fire("click");
  const positions = [...screen.innerHTML.matchAll(/data-phrase-pos="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(positions.length >= 3);
  const inputs = positions.map((p) => makeEl({ dataset: { phrasePos: String(p) }, value: "errada" }));
  all["[data-phrase-pos]"] = inputs;
  await ids["form-phrase-confirm"].fire("submit");
  assert.match(error.textContent, /não confere/);
  inputs.forEach((el, i) => { el.value = words[positions[i]]; });
  await ids["form-phrase-confirm"].fire("submit");
  assert.doesNotMatch(screen.innerHTML, /data-phrase-pos/, "a conferência deu lugar à conclusão");
  assert.equal(await phrase.printCard(), false, "sem cartão na tela não imprime");
});

test("frase: 'voltar' da conferência mostra as palavras de novo", async () => {
  localStorage.clear();
  await backup.ensureLocalAccount();
  const screen = makeEl({ id: "phrase-screen" });
  const form = makeEl();
  const ids = { "phrase-screen": screen, "form-phrase-show": form, "btn-phrase-written": makeEl(), "btn-phrase-back": makeEl(), "btn-phrase-print": makeEl() };
  installDom({ ids });
  await phrase.showRecoveryPhrase();
  await form.fire("submit");
  await waitFor(() => screen.innerHTML.length > 0);
  const words = (await backup.getAccountPhrase()).words;
  await ids["btn-phrase-written"].fire("click");
  assert.doesNotMatch(screen.innerHTML, new RegExp(`>${words[0]}<`));
  await ids["btn-phrase-back"].fire("click");
  assert.ok(screen.innerHTML.includes(words[0]));
});
