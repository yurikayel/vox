/**
 * @file Cobertura T5 — telas de rede: configurações (`network-screen-settings.js`), assistente steward
 * (`network-screen-steward.js`) e moderação local (`network-screen-moderation.js`). Módulos reais sobre
 * `localStorage`; só o DOM e a rede são falsos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();
let relay = { online: false };
globalThis.fetch = async () => {
  if (!relay.online) throw new TypeError("sem rede no teste");
  return { ok: true, status: 200, json: async () => ({ status: "ok", cachedCount: 7 }) };
};
const blobs = [];
URL.createObjectURL = (blob) => {
  blobs.push(blob);
  return "blob:teste";
};
URL.revokeObjectURL = () => {};

const settings = await import("../client/js/app/network-screen-settings.js");
const steward = await import("../client/js/app/network-screen-steward.js");
const moderation = await import("../client/js/app/network-screen-moderation.js");
const peers = await import("../client/js/peers.js");
const mod = await import("../client/js/moderation.js");
const mock = await import("../client/js/mock.js");
const inbox = await import("../client/js/inbox.js");
const posse = await import("../client/js/posse-dispatch.js");
const wizard = await import("../client/js/steward-wizard.js");
const localAccount = await import("../client/js/identity/index.js");
const webrtcState = await import("../client/js/webrtc-peer-state.js");

function reset() {
  localStorage.clear();
  relay = { online: false };
  blobs.length = 0;
  globalThis.confirm = () => true;
}

/** Campos do formulário de rede, por id, com os valores pedidos. */
function formFields(values) {
  const ids = {};
  for (const [id, v] of Object.entries(values)) ids[id] = makeEl(typeof v === "boolean" ? { checked: v } : { value: String(v) });
  return ids;
}

test("formulário de rede: grava sinalização, relays, TURN, webhooks e preferências do nó", async () => {
  reset();
  const form = makeEl();
  const ids = formFields({
    "net-pause": false, "net-max-mb": "150", "net-daily-cap": "90", "net-wifi": true, "net-cellular-cap": "3",
    "net-comm-only": true, "net-bg-relay": false, "net-webrtc": true, "net-turn-only": false, "net-mesh-discoverable": true,
    "net-signaling-url": " wss://sinal.exemplo ", "net-relay-http-url": "https://relay.exemplo",
    "net-relay-buddy-http-url": "https://amigo.exemplo", "net-turn-url": "turn:t.exemplo", "net-turn-user": "u",
    "net-turn-pass": "p", "net-posse-webhooks": "https://hook.exemplo/a",
  });
  ids["form-network-settings"] = form;
  installDom({ ids });
  settings.bindNetworkSettingsForm();
  const ev = await form.fire("submit");
  assert.equal(ev.defaultPrevented, true);
  assert.equal(localStorage.getItem("vox-custom-signaling-url"), "wss://sinal.exemplo");
  assert.equal(inbox.getRelayHttpUrl(), "https://relay.exemplo");
  assert.equal(peers.getCustomTurnConfig().urls, "turn:t.exemplo");
  assert.equal(peers.getPeerSettings().enabled, true);
  assert.equal(peers.getPeerSettings().commOnly, true);
  assert.equal(localAccount.getMeshDiscoverable(), true);
  assert.equal(posse.loadPosseWebhooks().length, 1);
});

test("formulário de rede: 'pausar' desliga o nó; número inválido cai no padrão", async () => {
  reset();
  const form = makeEl();
  const ids = formFields({ "net-pause": true, "net-max-mb": "abc", "net-daily-cap": "-4" });
  ids["form-network-settings"] = form;
  installDom({ ids });
  settings.bindNetworkSettingsForm();
  await form.fire("submit");
  assert.equal(peers.getPeerSettings().enabled, false);
  assert.equal(peers.getPeerSettings().maxMb, 100, "disco do nó leve volta ao limite");
});

test("formulário de rede ausente: nada é ligado", () => {
  installDom();
  assert.doesNotThrow(() => settings.bindNetworkSettingsForm());
});

test("modo apoiador: o botão liga (disco 512–1024 MB) e desliga (volta ao nó leve)", async () => {
  reset();
  const btn = makeEl({ dataset: { on: "0" } });
  installDom({ ids: { "btn-supporter-toggle": btn } });
  settings.bindSupporterToggle();
  await btn.fire("click");
  assert.equal(peers.getPeerSettings().supporter, true);
  assert.ok(peers.getPeerSettings().maxMb >= 512);
  btn.dataset.on = "1";
  await btn.fire("click");
  assert.equal(peers.getPeerSettings().supporter, false);
  assert.equal(peers.getPeerSettings().maxMb, 100);
});

test("botões da rede: limpar cache respeita a confirmação; demonstração alterna", async () => {
  reset();
  const clear = makeEl();
  const demo = makeEl();
  installDom({ ids: { "btn-clear-cache": clear, "btn-reset-demo": demo } });
  settings.bindNetworkSettingsButtons();
  globalThis.confirm = () => false;
  await clear.fire("click");
  globalThis.confirm = () => true;
  await clear.fire("click");
  assert.equal(mock.isDemoMode(), false);
  await demo.fire("click");
  assert.equal(mock.isDemoMode(), true, "primeiro toque liga a demonstração");
  assert.equal(demo.disabled, true);
  await demo.fire("click");
  assert.equal(mock.isDemoMode(), false, "segundo toque desliga");
});

test("verificar relay: offline não acusa online; online devolve o rótulo ao botão", async () => {
  reset();
  const btn = makeEl({ textContent: "Verificar Relay Desktop" });
  installDom({ ids: { "btn-check-relay": btn } });
  settings.bindNetworkSettingsButtons();
  await btn.fire("click");
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "Verificar Relay Desktop");
  relay.online = true;
  await btn.fire("click");
  await settle();
  assert.equal(btn.disabled, false);
});

test("pedir notificação: sem suporte do navegador a tela é redesenhada sem quebrar", async () => {
  reset();
  const btn = makeEl();
  const doc = installDom({ ids: { "btn-request-notif": btn } });
  settings.bindNetworkSettingsButtons();
  await btn.fire("click");
  await settle();
  assert.ok(doc.main.innerHTML.length > 0, "a tela de rede foi redesenhada");
});

test("compartilhar convite: sem rota não faz nada; com rota abre o compartilhamento", async () => {
  reset();
  const btn = makeEl({ dataset: { route: "" } });
  installDom({ ids: { "btn-network-share-connect": btn } });
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async (d) => shared.push(d) });
  Object.defineProperty(globalThis.navigator, "canShare", { configurable: true, value: () => true });
  settings.bindNetworkSettingsButtons();
  await btn.fire("click");
  assert.equal(shared.length, 0);
  btn.dataset.route = "vx_abc123def456";
  await btn.fire("click");
  await settle();
  assert.equal(shared.length, 1);
  assert.match(shared[0].url, /vx_abc123def456/);
});

test("showNetworkSettings: desenha a tela e liga formulário e botões", async () => {
  reset();
  const card = makeEl();
  const form = makeEl();
  const doc = installDom({ ids: { "form-network-settings": form } });
  doc.main.kids[".network-card"] = card;
  await settings.showNetworkSettings();
  assert.ok(doc.main.innerHTML.length > 0);
  assert.equal(card.inserted.length, 1);
  assert.equal(card.inserted[0].pos, "afterend");
  assert.equal(form.listeners.submit.length, 1);
});

test("moderação: desbloquear e desilenciar tiram o autor das listas e pedem refresh", async () => {
  reset();
  mod.blockUser("vx_a", "spam");
  mod.muteUser("vx_b");
  const unblock = makeEl({ dataset: { route: "vx_a" } });
  const unmute = makeEl({ dataset: { route: "vx_b" } });
  const empty = makeEl({ dataset: {} });
  installDom({ all: { ".btn-unblock-item": [empty, unblock], ".btn-unmute-item": [unmute] } });
  let refreshed = 0;
  moderation.bindModerationListButtons(() => { refreshed += 1; });
  await empty.fire("click");
  assert.equal(mod.getBlockedUsers().length, 1, "sem rota nada acontece");
  await unblock.fire("click");
  await unmute.fire("click");
  assert.equal(mod.getBlockedUsers().length, 0);
  assert.equal(mod.getMutedUsers().length, 0);
  assert.equal(refreshed, 2);
});

test("moderação: exportar regras baixa JSON com bloqueados; relatório baixa Markdown", async () => {
  reset();
  mod.blockUser("vx_a", "spam");
  const exp = makeEl();
  const log = makeEl();
  const doc = installDom({ ids: { "btn-export-moderation": exp, "btn-export-mod-log": log } });
  moderation.bindModerationExportImport();
  await exp.fire("click");
  const a = doc.created.at(-1);
  assert.equal(a.download, "vox-moderacao.json");
  assert.equal(a.clicks, 1);
  assert.match(await blobs.at(-1).text(), /vx_a/);
  await log.fire("click");
  await settle();
  const md = doc.created.at(-1);
  assert.equal(md.download, "vox-transparencia-moderacao.md");
  const report = await blobs.at(-1).text();
  assert.match(report, /1 bloqueado\(s\)/);
  assert.doesNotMatch(report, /vx_a/, "o relatório só traz contagem anônima dos filtros locais");
});

test("moderação: importar arquivo válido aplica as regras; inválido e vazio não mudam nada", async () => {
  reset();
  mod.blockUser("vx_a");
  const bundle = mod.exportModerationBundle();
  mod.unblockUser("vx_a");
  const input = makeEl({ files: [] });
  installDom({ ids: { "file-import-moderation": input } });
  let refreshed = 0;
  moderation.bindModerationExportImport(() => { refreshed += 1; });
  await input.fire("change");
  input.files = [{ text: async () => "não é json" }];
  await input.fire("change");
  assert.equal(mod.getBlockedUsers().length, 0);
  input.files = [{ text: async () => { throw new Error("leitura falhou"); } }];
  await input.fire("change");
  input.files = [{ text: async () => bundle }];
  await input.fire("change");
  assert.equal(mod.getBlockedUsers()[0].routeId, "vx_a");
  assert.equal(refreshed, 1);
});

test("comprovante de contribuição: baixa o assinado e, no cooldown, recusa e libera o botão", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const btn = makeEl();
  const doc = installDom({ ids: { "btn-export-contribution-attestation": btn } });
  moderation.bindContributionAttestationButton();
  await btn.fire("click");
  const files = doc.created.filter((e) => e.download);
  assert.equal(files.length, 1);
  assert.equal(JSON.parse(await blobs.at(-1).text()).type, "contribution-attestation");
  assert.equal(btn.disabled, false);
  await btn.fire("click");
  assert.equal(doc.created.filter((e) => e.download).length, 1, "segundo toque dentro do minuto não baixa");
  assert.equal(btn.disabled, false);
});

test("comprovante sem botão na tela: não liga nada", () => {
  installDom();
  assert.doesNotThrow(() => moderation.bindContributionAttestationButton());
});

test("assistente steward: etapa 1 exige o compromisso; marcado, grava e avança", async () => {
  reset();
  wizard.saveStep(1);
  const form = makeEl();
  const pledge = makeEl({ checked: false });
  installDom({ ids: { "form-steward-wizard": form, "sw-pledge": pledge } });
  steward.bindStewardWizardForm();
  await form.fire("submit");
  assert.equal(wizard.loadStep(), 1, "sem compromisso não avança");
  pledge.checked = true;
  await form.fire("submit");
  assert.equal(wizard.loadStep(), 2);
  assert.equal(wizard.loadDraft().pledge, true);
});

test("assistente steward: 'voltar' guarda o que foi digitado e recua; etapa 5 grava as URLs e vai às preferências", async () => {
  reset();
  wizard.saveStep(2);
  wizard.saveDraft({ signalingUrl: "wss://s.exemplo", relayHttpUrl: "https://r.exemplo" });
  const form = makeEl();
  const prev = makeEl();
  const community = makeEl({ value: " praca " });
  installDom({ ids: { "form-steward-wizard": form, "sw-prev": prev, "sw-community-id": community } });
  steward.bindStewardWizardForm();
  await prev.fire("click");
  assert.equal(wizard.loadStep(), 1);
  assert.equal(wizard.loadDraft().communityId, "praca");
  wizard.saveStep(5);
  steward.bindStewardWizardForm();
  globalThis.location = { hash: "#/" };
  await form.fire("submit");
  assert.equal(localStorage.getItem("vox-custom-signaling-url"), "wss://s.exemplo");
  assert.equal(inbox.getRelayHttpUrl(), "https://r.exemplo");
  assert.equal(globalThis.location.hash, "#/settings/network");
});

test("assistente steward: verificar relay mostra OK ou a falha; espelho sem comunidade falha", async () => {
  reset();
  const verify = makeEl();
  const mirror = makeEl();
  const form = makeEl();
  const url = makeEl({ value: " https://r.exemplo/ " });
  const vOut = makeEl();
  const mOut = makeEl();
  installDom({
    ids: { "form-steward-wizard": form, "sw-verify-relay": verify, "sw-relay-http": url, "sw-verify-result": vOut, "sw-test-mirror": mirror, "sw-mirror-result": mOut },
  });
  steward.bindStewardWizardForm();
  await verify.fire("click");
  assert.match(vOut.textContent, /^Falha: /);
  relay.online = true;
  await verify.fire("click");
  assert.match(vOut.textContent, /^OK · /);
  await mirror.fire("click");
  assert.match(mOut.textContent, /Falha/, "sem Community-Id o espelho não é testado");
});

test("assistente steward: showStewardWizard desenha a etapa atual", async () => {
  reset();
  wizard.saveStep(3);
  const doc = installDom();
  await steward.showStewardWizard();
  assert.ok(doc.main.innerHTML.length > 0);
});

test("syncIdentity: anuncia a conta e a chave de DM com nome e avatar do perfil", async () => {
  reset();
  const { routeId } = await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({ displayName: "Ana Voz", avatarUrl: "https://x.exemplo/a.png" });
  installDom();
  await steward.syncIdentity();
  assert.equal(webrtcState.getCurrentAddress(), routeId);
  assert.equal(webrtcState.getCurrentDmPub().displayName, "Ana Voz");
  assert.equal(webrtcState.getCurrentDmPub().avatarUrl, "https://x.exemplo/a.png");
  assert.equal(webrtcState.getCurrentDmPub().kty, "EC", "leva a chave pública de DM");
});
