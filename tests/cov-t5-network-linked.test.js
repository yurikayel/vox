/**
 * @file Cobertura T5 — contas vinculadas (`app/network-screen-linked.js`): cada botão e formulário da tela grava
 * (ou recusa) o vínculo no armazenamento real de `linked-accounts`; o DOM é um mini-DOM programável.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle } from "./helpers/cov-t5-dom.mjs";

if (!globalThis.sessionStorage) {
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}
globalThis.fetch = async () => {
  throw new TypeError("sem rede no teste");
};

const linked = await import("../client/js/app/network-screen-linked.js");
const accounts = await import("../client/js/linked-accounts.js");
const socialLogin = await import("../client/js/social-login.js");

/** Botão de uma rede, dentro de uma caixa que tem o campo do @usuário. */
function netButton(netId, handle = "") {
  const input = makeEl({ value: handle });
  const box = makeEl({ kids: { ".input-net-handle": input } });
  const btn = makeEl({ dataset: { netId }, up: { ".network-connect-box": box } });
  return { btn, input, box };
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
}

test("conectar com um toque: @usuário válido vincula como não verificado e liga a auto-replicação", async () => {
  reset();
  const { btn } = netButton("twitter", "@ana_voz");
  installDom({ all: { ".btn-one-click-connect": [btn] } });
  let refreshed = 0;
  linked.bindLinkedAccountsUi(() => { refreshed += 1; });
  await btn.fire("click");
  const saved = accounts.loadLinkedAccounts().twitter;
  assert.equal(saved.handle, "ana_voz");
  assert.equal(saved.verified, false);
  assert.equal(accounts.isAutoReplicationEnabled(), true);
  assert.equal(refreshed, 1);
});

test("conectar com um toque: @usuário inválido não grava nada e devolve o foco ao campo", async () => {
  reset();
  const { btn, input } = netButton("twitter", "isto não é usuário!");
  installDom({ all: { ".btn-one-click-connect": [btn] } });
  linked.bindLinkedAccountsUi();
  await btn.fire("click");
  assert.deepEqual(accounts.loadLinkedAccounts(), {});
  assert.equal(input.focused, 1);
});

test("salvar rápido: valida, grava sem verificar; inválido não grava", async () => {
  reset();
  const ok = netButton("twitter", "ana_voz");
  const bad = netButton("threads", "");
  installDom({ all: { ".btn-save-handle-quick": [ok.btn, bad.btn] } });
  let refreshed = 0;
  linked.bindLinkedAccountsUi(() => { refreshed += 1; });
  await bad.btn.fire("click");
  assert.equal(accounts.loadLinkedAccounts().threads, undefined);
  await ok.btn.fire("click");
  assert.equal(accounts.loadLinkedAccounts().twitter.handle, "ana_voz");
  assert.equal(accounts.loadLinkedAccounts().twitter.enabled, true);
  assert.equal(refreshed, 1);
});

test("formulário de rede: pega @usuário da caixa, webhook e senha de app; sem campo, usa o sugerido", async () => {
  reset();
  const handle = makeEl({ value: "" });
  const hook = makeEl({ value: " https://hook.exemplo/x " });
  const pass = makeEl({ value: "abcd-efgh" });
  const form = makeEl({
    dataset: { netId: "twitter" },
    kids: { ".input-net-handle": handle, ".input-net-webhook": hook, ".input-net-app-password": pass },
    up: {},
  });
  const bad = makeEl({ dataset: { netId: "twitter" }, kids: {} });
  installDom({ all: { ".form-link-network": [form, bad] } });
  linked.bindLinkedAccountsUi();
  const emptyEv = await bad.fire("submit");
  assert.equal(emptyEv.defaultPrevented, true);
  assert.equal(accounts.loadLinkedAccounts().twitter, undefined, "sem handle e sem sugestão: recusa");
  handle.value = "ana_voz";
  await form.fire("submit");
  const saved = accounts.loadLinkedAccounts().twitter;
  assert.equal(saved.handle, "ana_voz");
  assert.equal(saved.webhook, "https://hook.exemplo/x");
});

test("desvincular remove a conta; confirmar marca como verificada; sem conta não confirma", async () => {
  reset();
  accounts.saveLinkedAccount("twitter", { handle: "ana_voz", enabled: true, verified: false });
  const unlink = makeEl({ dataset: { netId: "twitter" } });
  const noId = makeEl({ dataset: {} });
  const confirm = makeEl({ dataset: { netId: "twitter" } });
  const ghost = makeEl({ dataset: { netId: "threads" } });
  installDom({ all: { ".btn-unlink-network": [noId, unlink], ".btn-confirm-network": [ghost, confirm] } });
  let refreshed = 0;
  linked.bindLinkedAccountsUi(() => { refreshed += 1; });
  await ghost.fire("click");
  await confirm.fire("click");
  assert.equal(accounts.loadLinkedAccounts().twitter.verified, true);
  await noId.fire("click");
  assert.ok(accounts.loadLinkedAccounts().twitter, "sem netId nada é removido");
  await unlink.fire("click");
  assert.equal(accounts.loadLinkedAccounts().twitter, undefined);
  assert.equal(refreshed, 3);
});

test("marcar/desmarcar replicação por canal grava `enabled`; mestre e webhook geral gravam suas chaves", async () => {
  reset();
  accounts.saveLinkedAccount("twitter", { handle: "ana_voz", enabled: true });
  const chk = makeEl({ dataset: { netId: "twitter" }, checked: false });
  const orphan = makeEl({ dataset: { netId: "tiktok" }, checked: true });
  const master = makeEl({ checked: true });
  const input = makeEl({ value: "  https://geral.exemplo/h  " });
  const save = makeEl();
  installDom({
    ids: { "chk-auto-replicate-master": master, "input-general-webhook": input, "btn-save-general-webhook": save },
    all: { ".chk-network-replicate": [chk, orphan] },
  });
  linked.bindLinkedAccountsUi();
  await chk.fire("change");
  await orphan.fire("change");
  assert.equal(accounts.loadLinkedAccounts().twitter.enabled, false);
  assert.equal(accounts.loadLinkedAccounts().tiktok, undefined);
  await master.fire("change");
  assert.equal(accounts.isAutoReplicationEnabled(), true);
  await save.fire("click");
  assert.equal(accounts.getGeneralWebhookUrl(), "https://geral.exemplo/h");
  input.value = "";
  await save.fire("click");
  assert.equal(accounts.getGeneralWebhookUrl(), "");
});

test("ligar duas vezes não duplica ouvintes (marca data-wired)", () => {
  reset();
  const { btn } = netButton("twitter", "ana_voz");
  installDom({ all: { ".btn-one-click-connect": [btn] } });
  linked.bindLinkedAccountsUi();
  linked.bindLinkedAccountsUi();
  assert.equal(btn.listeners.click.length, 1);
  assert.equal(btn.dataset.wired, "1");
});

test("testar conta: mostra o retorno no quadro, volta o rótulo do botão e escapa HTML", async () => {
  reset();
  accounts.saveLinkedAccount("twitter", { handle: "ana_voz", enabled: true, verified: false });
  const btn = makeEl({ dataset: { netId: "twitter" }, textContent: "" });
  const fb = makeEl();
  const none = makeEl({ dataset: {} });
  installDom({ ids: { "test-feedback-twitter": fb }, all: { ".btn-test-network": [none, btn] } });
  linked.bindLinkedAccountsUi();
  await none.fire("click");
  const pending = btn.fire("click");
  assert.equal(btn.disabled, true);
  await pending;
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "🧪 Testar se conectou");
  assert.equal(fb.style.display, "block");
  assert.match(fb.innerHTML, /Ver perfil/);
  assert.match(fb.style.border, /b07a00/, "estado não verificado usa o tom de aviso");
});

test("testar conta de rede sem vínculo: quadro de erro vermelho, sem link de perfil", async () => {
  reset();
  const btn = makeEl({ dataset: { netId: "threads" } });
  const fb = makeEl();
  installDom({ ids: { "test-feedback-threads": fb }, all: { ".btn-test-network": [btn] } });
  linked.bindLinkedAccountsUi();
  await btn.fire("click");
  assert.match(fb.innerHTML, /Nenhuma conta vinculada/);
  assert.doesNotMatch(fb.innerHTML, /Ver perfil/);
  assert.match(fb.style.border, /dc2626/);
});

test("abrir o modal de entrada pelo botão da tela desenha o modal de importação", async () => {
  reset();
  const open = makeEl();
  const modal = makeEl({ id: "modal-container" });
  installDom({ ids: { "btn-open-oauth-from-linked": open, "modal-container": modal } });
  linked.bindLinkedAccountsUi();
  await open.fire("click");
  await settle();
  assert.match(modal.innerHTML, /genesis|oauth|modal/i, "o modal de entrada foi desenhado");
});

test("botão Conectar: rede sem login abre o campo manual; o link manual faz o mesmo e foca o campo", async () => {
  reset();
  const handleInput = makeEl();
  const panel = makeEl({ hidden: true, kids: { ".input-net-handle": handleInput } });
  const connect = makeEl({ dataset: { netId: "twitter" } });
  const manual = makeEl({ dataset: { netId: "twitter" } });
  installDom({
    all: { ".btn-link-connect": [connect], ".btn-link-manual": [manual] },
    qs: { '.link-manual[data-net-id="twitter"]': panel },
  });
  linked.bindLinkedAccountsUi();
  await connect.fire("click");
  assert.equal(panel.hidden, false);
  assert.equal(handleInput.focused, 1);
  panel.hidden = true;
  await manual.fire("click");
  assert.equal(panel.hidden, false);
  assert.equal(handleInput.focused, 2);
});

test("botão Conectar de rede com login: bloqueia durante o login e libera quando falha", async () => {
  reset();
  const connect = makeEl({ dataset: { netId: "bsky" } });
  installDom({ all: { ".btn-link-connect": [connect] } });
  linked.bindLinkedAccountsUi();
  const pending = connect.fire("click");
  assert.equal(connect.disabled, true);
  await pending;
  await settle();
  assert.equal(connect.disabled, false);
  assert.deepEqual(accounts.loadLinkedAccounts(), {}, "login falho não grava vínculo");
});

test("showLinkedAccounts: monta a página e consome o retorno OAuth pendente (erro e estado que não confere)", async () => {
  reset();
  const doc = installDom();
  sessionStorage.setItem(socialLogin.CALLBACK_KEY, JSON.stringify({ error: "access_denied" }));
  await linked.showLinkedAccounts();
  await settle();
  assert.ok(doc.main.innerHTML.length > 0 || doc.root.innerHTML.length > 0, "a tela foi desenhada");
  assert.equal(sessionStorage.getItem(socialLogin.CALLBACK_KEY), null, "o retorno é lido uma vez só");
  sessionStorage.setItem(socialLogin.CALLBACK_KEY, JSON.stringify({ state: "nao-confere", code: "x" }));
  await linked.showLinkedAccounts();
  await settle();
  assert.equal(sessionStorage.getItem(socialLogin.CALLBACK_KEY), null);
  assert.deepEqual(accounts.loadLinkedAccounts(), {});
});

test("showLinkedAccounts: esconde o campo manual das redes sem login", async () => {
  reset();
  const keep = makeEl({ dataset: { netId: "bsky" }, hidden: true });
  const drop = makeEl({ dataset: { netId: "twitter" }, hidden: false });
  installDom({ all: { ".btn-link-manual": [keep, drop] } });
  await linked.showLinkedAccounts();
  await settle();
  assert.equal(keep.hidden, false, "Bluesky tem login: o link manual aparece como alternativa");
  assert.equal(drop.hidden, true, "sem login configurado: o campo manual já é o caminho");
});
