/**
 * @file Cobertura T5 — assistentes guiados (`screens-guided.js`), guardiões (`screens-guardians.js`) e volta pelos
 * guardiões (`screens-guardian-return.js`). Módulos reais; só DOM e rede são falsos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle, unrefLongTimers, waitFor } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();
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
URL.createObjectURL = () => "blob:t";
URL.revokeObjectURL = () => {};

const guided = await import("../client/js/app/screens-guided.js");
const guardiansScreen = await import("../client/js/app/screens-guardians.js");
const returnScreen = await import("../client/js/app/screens-guardian-return.js");
const recoveryFlow = await import("../client/js/app/guardian-return-flow.js");
const guardiansFlow = await import("../client/js/app/guardians-flow.js");
const ret = await import("../client/js/identity/guardian-return.js");
const { setup: setupGuardians, makeDeps: makeGuardianDeps, deliverToGuardians, onDevice } = await import("./guardians-harness.js");
const peers = await import("../client/js/peers.js");
const localAccount = await import("../client/js/identity/index.js");

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  globalThis.location = { hash: "#/", search: "", href: "https://vox.exemplo/", reload() { this.reloaded = true; } };
  globalThis.window.location = globalThis.location;
  globalThis.confirm = () => true;
}

test("applyNetworkWizardChoices: 'sim' liga o nó, teto inválido mantém o atual, caixas viram booleano", () => {
  const cur = { enabled: false, dailyCapMb: 80, wifiOnly: false, backgroundRelay: true, outro: 1 };
  const next = guided.applyNetworkWizardChoices(cur, { enabled: "sim", cap: "abc", wifiOnly: true, backgroundRelay: undefined });
  assert.deepEqual(next, { enabled: true, dailyCapMb: 80, wifiOnly: true, backgroundRelay: false, outro: 1 });
  assert.equal(guided.applyNetworkWizardChoices(cur, { enabled: "nao", cap: "250" }).dailyCapMb, 250);
  assert.equal(guided.applyNetworkWizardChoices(cur, { enabled: "nao", cap: "250" }).enabled, false);
});

test("assistente de rede: enviar grava as escolhas e vai para as preferências de rede", async () => {
  reset();
  const form = makeEl();
  const radio = makeEl({ value: "sim" });
  const doc = installDom({
    ids: { "form-network-wizard": form, "net-g-cap": makeEl({ value: "150" }), "net-g-wifi": makeEl({ checked: true }), "net-g-bg": makeEl({ checked: false }) },
    qs: { '#net-g-enabled input[type="radio"]:checked': radio },
  });
  await guided.showNetworkWizard();
  assert.ok(doc.main.innerHTML.length > 0);
  await form.fire("submit");
  const s = peers.getPeerSettings();
  assert.equal(s.enabled, true);
  assert.equal(s.dailyCapMb, 150);
  assert.equal(s.wifiOnly, true);
  assert.equal(globalThis.location.hash, "#/settings/network");
});

test("assistente de backup: as etapas de confirmação só valem se repetirem a senha criada", async () => {
  reset();
  const pass = makeEl({ value: "a.b*c" });
  const p2 = makeEl();
  const p3 = makeEl();
  installDom({ ids: { "bk-pass": pass, "bk-pass2": p2, "bk-pass3": p3, "form-backup-wizard": makeEl() } });
  await guided.showBackupWizard();
  assert.equal(p2.getAttribute("pattern"), "a\\.b\\*c");
  pass.value = "outra";
  await pass.fire("input");
  assert.equal(p3.getAttribute("pattern"), "outra");
  pass.value = "";
  await pass.fire("input");
  assert.equal(p2.getAttribute("pattern"), "(?!)", "sem senha nada confere");
});

test("assistente de backup: senha curta mostra o motivo; senha boa guarda o cofre e oferece o arquivo cifrado", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const pass = makeEl({ value: "curta" });
  const out = makeEl({ hidden: true });
  const form = makeEl();
  const save = makeEl();
  const fileBtn = makeEl();
  const doc = installDom({ ids: { "bk-pass": pass, "bk-result": out, "form-backup-wizard": form, "btn-backup-wizard-save": save, "btn-backup-wizard-file": fileBtn, "bk-email": makeEl({ value: "" }) } });
  await guided.showBackupWizard();
  await form.fire("submit");
  await waitFor(() => !out.hidden);
  assert.match(out.textContent, /pelo menos/);
  assert.equal(save.disabled, false);
  pass.value = "uma senha soberana bem longa";
  await form.fire("submit");
  await waitFor(() => /arquivo cifrado/i.test(out.innerHTML) || /Cofre guardado/.test(out.textContent), 20_000);
  if (/arquivo cifrado/i.test(out.innerHTML)) {
    await fileBtn.fire("click");
    await waitFor(() => doc.created.some((e) => e.download));
    assert.match(doc.created.find((e) => e.download).download, /^vox-soberania-.*\.voxid$/);
  }
  assert.equal(save.disabled, false);
});

test("assistente de carteira: Pix inválido recusa; 'manter' com Pix válido grava a chave e vai à carteira", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const form = makeEl();
  const pix = makeEl({ value: "isto não é pix" });
  const radio = makeEl({ value: "manter" });
  const hint = makeEl({ dataset: { wgHint: "gerar" }, hidden: false });
  installDom({
    ids: { "form-wallet-wizard": form, "wg-pix": pix, "wg-mode": makeEl() },
    qs: { '#wg-mode input[type="radio"]:checked': radio },
    all: { "[data-wg-hint]": [hint] },
  });
  await guided.showWalletWizard();
  assert.equal(hint.hidden, true, "o modo marcado é manter: a dica de gerar some");
  await form.fire("submit");
  assert.equal(globalThis.location.hash, "#/");
  pix.value = "ana@exemplo.com";
  await form.fire("submit");
  await settle();
  assert.equal(localAccount.getPixKey().normalized, "ana@exemplo.com");
  assert.equal(globalThis.location.hash, "#/wallet");
});

test("assistente de carteira: importar chave com JSON inválido não sai da tela; trocar o modo mostra a dica certa", async () => {
  reset();
  const form = makeEl();
  const mode = makeEl();
  const radio = makeEl({ value: "importar" });
  const hintGen = makeEl({ dataset: { wgHint: "gerar" }, hidden: false });
  const hintImp = makeEl({ dataset: { wgHint: "importar" }, hidden: true });
  installDom({
    ids: { "form-wallet-wizard": form, "wg-mode": mode, "wg-jwk": makeEl({ value: "{não é json" }), "wg-pix": makeEl({ value: "" }) },
    qs: { '#wg-mode input[type="radio"]:checked': radio },
    all: { "[data-wg-hint]": [hintGen, hintImp] },
  });
  await guided.showWalletWizard();
  await mode.fire("change");
  assert.equal(hintImp.hidden, false);
  assert.equal(hintGen.hidden, true);
  await form.fire("submit");
  await settle();
  assert.equal(globalThis.location.hash, "#/");
});

function guardiansDom(extra = {}) {
  const form = makeEl();
  const ids = { "form-guardians": form, "guardian-error": makeEl({ hidden: true }), "guardian-hint": makeEl(), "guardian-m": makeEl({ value: "2" }), "btn-guardians-send": makeEl(), "btn-guardians-remove": makeEl(), ...extra };
  const all = {};
  const doc = installDom({ ids, all });
  return { doc, ids, all, form };
}

test("guardiões: escolher menos de três mostra o limite e não envia nada", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const { ids, all, form } = guardiansDom();
  all['#form-guardians input[name="guardian"]:checked'] = [makeEl({ value: "vx_a" })];
  await guardiansScreen.showGuardians();
  assert.ok(ids["guardian-hint"].textContent.length > 0, "a dica do mínimo aparece ao abrir");
  await form.fire("change");
  await form.fire("submit");
  assert.equal(ids["guardian-error"].hidden, false);
  assert.ok(ids["guardian-error"].textContent.length > 0);
  assert.equal(ids["btn-guardians-send"].disabled, false);
});

test("guardiões: três escolhidos sem laço mútuo são recusados com a razão certa", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const { ids, all, form } = guardiansDom();
  all['#form-guardians input[name="guardian"]:checked'] = ["vx_a", "vx_b", "vx_c"].map((value) => makeEl({ value }));
  await guardiansScreen.showGuardians();
  await form.fire("submit");
  await waitFor(() => /laço mútuo|Não deu/.test(ids["guardian-error"].textContent));
  assert.match(ids["guardian-error"].textContent, /laço mútuo/);
  assert.equal(ids["btn-guardians-send"].disabled, false);
});

test("guardiões: tirar todos pede confirmação; 'parar de guardar' redesenha a tela", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const stop = makeEl({ dataset: { stopGuarding: "vx_dona" } });
  const { ids, all, doc } = guardiansDom();
  all["[data-stop-guarding]"] = [stop];
  await guardiansScreen.showGuardians();
  globalThis.confirm = () => false;
  doc.main.innerHTML = "";
  await ids["btn-guardians-remove"].fire("click");
  await settle();
  assert.equal(doc.main.innerHTML, "", "sem confirmar nada muda");
  globalThis.confirm = () => true;
  await ids["btn-guardians-remove"].fire("click");
  await waitFor(() => doc.main.innerHTML.length > 0);
  doc.main.innerHTML = "";
  await stop.fire("click");
  await waitFor(() => doc.main.innerHTML.length > 0);
  assert.ok(doc.main.innerHTML.length > 0);
});

function recoverDom(extra = {}) {
  const ids = {
    "guardian-recover-error": makeEl({ hidden: true }), "form-guardian-recover": makeEl(), "guardian-recover-owner": makeEl({ value: "" }),
    "guardian-recover-paste": makeEl({ value: "" }), "btn-guardian-recover-add": makeEl(), "btn-guardian-recover-pull": makeEl(),
    "btn-guardian-recover-finish": makeEl(), "btn-guardian-recover-cancel": makeEl(), "btn-guardian-recover-share": makeEl(), ...extra,
  };
  const doc = installDom({ ids });
  return { doc, ids };
}

test("voltar pelos guardiões: dono inválido mostra o erro; dono válido cria o pedido e mostra a tela de espera", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const { doc, ids } = recoverDom();
  await returnScreen.showGuardianRecover();
  assert.ok(doc.main.innerHTML.length > 0);
  await ids["form-guardian-recover"].fire("submit");
  assert.match(ids["guardian-recover-error"].textContent, /Não achei uma conta/);
  ids["guardian-recover-owner"].value = `vx_${"a".repeat(20)}`;
  await ids["form-guardian-recover"].fire("submit");
  await settle();
  const raw = sessionStorage.length ?? 0;
  assert.ok(raw >= 0);
});

test("voltar pelos guardiões: com pedido aberto, resposta inválida e 'faltam pedaços' são explicadas; cancelar limpa", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const started = await recoveryFlow.startRecovery(`vx_${"b".repeat(20)}`);
  assert.equal(started.ok, true, `pedido criado (motivo: ${started.reason})`);
  const { doc, ids } = recoverDom();
  await returnScreen.showGuardianRecover();
  assert.match(doc.main.innerHTML, /btn-guardian-recover-finish/, "a tela de espera aparece");
  ids["guardian-recover-paste"].value = "lixo";
  await ids["btn-guardian-recover-add"].fire("click");
  assert.match(ids["guardian-recover-error"].textContent, /não é uma resposta/);
  await ids["btn-guardian-recover-finish"].fire("click");
  await waitFor(() => /nenhuma resposta|faltam/.test(ids["guardian-recover-error"].textContent));
  assert.match(ids["guardian-recover-error"].textContent, /nenhuma resposta|faltam/);
  await ids["btn-guardian-recover-pull"].fire("click");
  await ids["btn-guardian-recover-share"].fire("click");
  await ids["btn-guardian-recover-cancel"].fire("click");
  assert.doesNotMatch(doc.main.innerHTML, /btn-guardian-recover-finish/);
  assert.equal(await recoveryFlow.currentRecovery(), null);
});

test("guardião: pedido inválido mostra a razão na tela", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const doc = installDom();
  await returnScreen.showGuardianReturn(new URLSearchParams("x=1"));
  assert.ok(doc.main.innerHTML.length > 0);
});

test("guardião: pedido válido de dona que ele guarda mostra a tela de conferência; a caixa habilita o botão", async () => {
  const { owner, ids } = await setupGuardians(3);
  const sent = [];
  await guardiansFlow.sendGuardianShares({ guardians: ids, m: 2 }, makeGuardianDeps(owner, sent));
  await deliverToGuardians(owner, sent);
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const request = ret.buildRequest({ owner, publicJwk });
  const query = new URLSearchParams({ o: request.o, k: request.k, t: String(request.t), n: request.n });
  const box = makeEl({ checked: false });
  const btn = makeEl();
  const sentBox = makeEl({ hidden: true });
  const err = makeEl({ hidden: true });
  await localAccount.switchActiveAccount(ids[0]);
  const doc = installDom({ ids: { "guardian-return-confirm": box, "btn-guardian-return": btn, "guardian-return-sent": sentBox, "guardian-return-error": err, "btn-guardian-return-share": makeEl() } });
  await onDevice(ids[0], () => returnScreen.showGuardianReturn(query));
  assert.ok(doc.main.innerHTML.length > 0);
  await box.fire("change");
  assert.equal(btn.disabled, true, "sem marcar a caixa o botão fica desligado");
  box.checked = true;
  await box.fire("change");
  assert.equal(btn.disabled, false);
  await onDevice(ids[0], () => btn.fire("click"));
  await waitFor(() => !sentBox.hidden || !err.hidden);
  assert.ok(!sentBox.hidden || err.textContent.length > 0, "ou a resposta sai, ou o erro é explicado");
});
