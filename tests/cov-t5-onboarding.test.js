/**
 * @file Cobertura T5 — entrada e pacto (`app/onboarding.js`) e entrada/volta por e-mail (`app/onboarding-email.js`).
 * Módulos e armazenamento reais; só o DOM (mini-DOM programável) e a rede são falsos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle, unrefLongTimers, waitFor } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) => {
  const t = realSetTimeout(fn, ms, ...rest);
  if (ms >= 10_000) t.unref?.();
  return t;
};
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

const onboarding = await import("../client/js/app/onboarding.js");
const email = await import("../client/js/app/onboarding-email.js");
const localAccount = await import("../client/js/identity/index.js");
const oauthProfile = await import("../client/js/oauth-profile.js");
const ageGate = await import("../client/js/age-gate.js");
const navigation = await import("../client/js/app/navigation.js");
const { CANTINA_STORAGE_KEY } = await import("../client/js/app/cantina-gate.js");
navigation.setRoute(async () => {});

function reset() {
  localStorage.clear();
  sessionStorage.clear();
  globalThis.location = { hash: "#/", search: "" };
  globalThis.window.location = globalThis.location;
}

/** Monta a entrada em três etapas (entry/have/pact) num contêiner falso e devolve os pedaços. */
function genesisDom(extra = {}) {
  const steps = ["entry", "have", "pact"].map((k) => makeEl({ dataset: { genesisStep: k }, hidden: k !== "entry" }));
  const panel = makeEl();
  const container = makeEl({ id: "modal-container", kids: { ".genesis-panel--steps": panel }, kidsAll: { "[data-genesis-step]": steps } });
  panel.kidsAll["[data-genesis-step]"] = steps;
  const ids = {
    "modal-container": container,
    "oauth-enrich-error": makeEl({ hidden: true }),
    "btn-oauth-skip": makeEl(),
    "btn-oauth-google": makeEl(),
    "btn-oauth-meta": makeEl(),
    "btn-oauth-github": makeEl(),
    "form-oauth-custom-name": makeEl(),
    "oauth-custom-name-input": makeEl({ value: "" }),
    "form-oauth-restore-passphrase": makeEl(),
    "btn-oauth-restore-passphrase": makeEl(),
    "btn-pact-accept": makeEl({ dataset: {} }),
    "btn-pact-settings": makeEl(),
    [ageGate.AGE_CHECKBOX_ID]: makeEl({ checked: false }),
    ...extra,
  };
  const doc = installDom({ ids });
  return { doc, ids, container, panel, steps, error: ids["oauth-enrich-error"] };
}

test("entrada: 'Pular' marca a etapa como feita, fecha o modal e entrega {skipped:true}", async () => {
  reset();
  const { ids, container } = genesisDom();
  let result = null;
  onboarding.openOAuthEnrichModal({ onComplete: (r) => { result = r; } });
  assert.ok(container.innerHTML.length > 0, "o modal da entrada foi desenhado");
  await ids["btn-oauth-skip"].fire("click");
  assert.deepEqual(result, { skipped: true });
  assert.equal(oauthProfile.hasCompletedOAuthStep(), true);
  assert.equal(container.innerHTML, "", "modal fechado");
});

test("entrada com pacto: 'Pular' leva ao passo do pacto; aceitar exige a caixa de 18+ e grava o pacto", async () => {
  reset();
  const { ids, steps, container } = genesisDom();
  await localAccount.ensureLocalAccount();
  onboarding.openOAuthEnrichModal({ withPact: true });
  await ids["btn-oauth-skip"].fire("click");
  assert.equal(steps[2].hidden, false, "o passo do pacto aparece");
  assert.equal(steps[0].hidden, true);
  const accept = ids["btn-pact-accept"];
  await accept.fire("click");
  assert.equal(localStorage.getItem("vox-pact-accepted"), null, "sem 18+ nada é gravado");
  ids[ageGate.AGE_CHECKBOX_ID].checked = true;
  await ids[ageGate.AGE_CHECKBOX_ID].fire("change");
  assert.equal(accept.disabled, false);
  await accept.fire("click");
  await settle();
  assert.equal(localStorage.getItem("vox-pact-accepted"), "true");
  assert.equal(ageGate.hasConfirmedAdult(), true);
  assert.equal(container.innerHTML, "");
  assert.equal(onboarding.hasFullEntry(), false, "a entrada ainda não foi passada pela cantina");
});

test("pacto: 'Ajustar rede depois' grava o pacto e vai para as preferências de rede", async () => {
  reset();
  const { ids } = genesisDom();
  await localAccount.ensureLocalAccount();
  onboarding.openOAuthEnrichModal({ withPact: true });
  await ids["btn-oauth-skip"].fire("click");
  await ids["btn-pact-settings"].fire("click");
  assert.equal(globalThis.location.hash, "#/", "sem 18+ marcado não sai do lugar");
  ids[ageGate.AGE_CHECKBOX_ID].checked = true;
  await ids[ageGate.AGE_CHECKBOX_ID].fire("change");
  await ids["btn-pact-settings"].fire("click");
  await settle();
  assert.equal(globalThis.location.hash, "#/settings/network");
  assert.equal(localStorage.getItem("vox-pact-accepted"), "true");
});

test("entrada: toque num [data-genesis-go] troca a etapa e limpa o erro", async () => {
  reset();
  const { panel, steps, error } = genesisDom();
  onboarding.openOAuthEnrichModal();
  error.textContent = "erro velho";
  const go = makeEl({ dataset: { genesisGo: "have" } });
  await panel.fire("click", { target: makeEl({ up: { "[data-genesis-go]": go } }) });
  assert.equal(steps[1].hidden, false);
  assert.equal(steps[0].hidden, true);
  assert.equal(error.textContent, "");
  await panel.fire("click", { target: makeEl() });
  assert.equal(steps[1].hidden, false, "clique fora de um botão de etapa não troca nada");
});

test("entrada: login do GitHub/Google/Meta indisponível mostra o erro e libera o botão", async () => {
  reset();
  const { ids, error } = genesisDom();
  onboarding.openOAuthEnrichModal();
  for (const id of ["btn-oauth-github", "btn-oauth-google", "btn-oauth-meta"]) {
    error.textContent = "";
    await ids[id].fire("click");
    assert.ok(error.textContent.length > 0, `${id} mostra o motivo`);
    assert.equal(ids[id].disabled, false, `${id} volta a ficar ativo`);
  }
});

test("entrada só com nome: cria a conta, grava o nome e entrega o resultado", async () => {
  reset();
  const { ids } = genesisDom();
  ids["oauth-custom-name-input"].value = "  Ana Voz ";
  let result = null;
  onboarding.openOAuthEnrichModal({ onComplete: (r) => { result = r; } });
  await ids["form-oauth-custom-name"].fire("submit");
  await waitFor(() => result !== null);
  assert.equal(result.customName, "Ana Voz");
  assert.equal(localAccount.getDisplayName(), "Ana Voz");
  assert.equal(oauthProfile.hasCompletedOAuthStep(), true);
});

test("entrada só com nome: sem nome mostra o erro e não cria conta nem chama onComplete", async () => {
  reset();
  const { ids, error } = genesisDom();
  let called = 0;
  onboarding.openOAuthEnrichModal({ onComplete: () => { called += 1; } });
  await ids["form-oauth-custom-name"].fire("submit");
  assert.match(error.textContent, /Digite um nome/);
  assert.equal(called, 0);
});

test("volta com senha: campos vazios mostram o motivo, sem fechar o modal", async () => {
  reset();
  const { ids, error, container } = genesisDom();
  onboarding.openOAuthEnrichModal();
  await ids["form-oauth-restore-passphrase"].fire("submit");
  await settle();
  assert.match(error.textContent, /e-mail e senha|frase de recuperação/);
  assert.equal(ids["btn-oauth-restore-passphrase"].disabled, false);
  assert.ok(container.innerHTML.length > 0);
});

test("modal de entrada sem contêiner na tela não faz nada", () => {
  reset();
  installDom();
  assert.doesNotThrow(() => onboarding.openOAuthEnrichModal());
});

test("etapas da entrada: quem já aceitou o pacto antes pula a importação; quem concluiu vai ao pacto", () => {
  reset();
  const { container } = genesisDom();
  localStorage.setItem("vox-pact-accepted", "true");
  onboarding.checkOAuthEnrichStep();
  assert.equal(oauthProfile.hasCompletedOAuthStep(), true);
  assert.ok(container.innerHTML.length > 0, "falta confirmar os 18+: o pacto abre");
  container.innerHTML = "";
  onboarding.checkPactModal();
  assert.ok(container.innerHTML.length > 0);
});

test("pacto completo (aceito + 18+) não abre de novo", () => {
  reset();
  const { container } = genesisDom();
  localStorage.setItem("vox-pact-accepted", "true");
  ageGate.confirmAdult();
  onboarding.checkPactModal();
  assert.equal(container.innerHTML, "");
});

test("sem a entrada feita: abre o modal da entrada; com o overlay já na tela não duplica", () => {
  reset();
  const { container, ids } = genesisDom();
  onboarding.checkOAuthEnrichStep();
  assert.ok(container.innerHTML.length > 0, "o modal da entrada abre");
  container.innerHTML = "";
  ids["oauth-enrich-overlay"] = makeEl();
  installDom({ ids });
  onboarding.checkOAuthEnrichStep();
  assert.equal(container.innerHTML, "", "já aberto: não redesenha");
});

test("portão da cantina: em rota que escreve abre a entrada e marca o portão como passado", () => {
  reset();
  const { container } = genesisDom();
  globalThis.location.hash = "#/rota-que-nao-existe";
  onboarding.checkCantinaGate();
  assert.equal(localStorage.getItem(CANTINA_STORAGE_KEY), "true");
  assert.ok(container.innerHTML.length > 0, "o modal da entrada abre");
});

test("portão: quem já passou segue direto para a etapa da entrada e remove a faixa de leitura", () => {
  reset();
  localStorage.setItem(CANTINA_STORAGE_KEY, "true");
  const banner = makeEl();
  const { container } = genesisDom({ "read-first-banner": banner });
  globalThis.location.hash = "#/";
  onboarding.checkCantinaGate();
  assert.equal(banner.removed, true);
  assert.ok(container.innerHTML.length > 0);
});

test("leitura primeiro: na Ágora sem entrada instala as guardas de escrita e 'Entrar no Vox' abre a entrada", async () => {
  reset();
  const enter = makeEl();
  const { container, doc } = genesisDom({ "btn-read-first-enter": enter });
  globalThis.location.hash = "#/";
  onboarding.checkCantinaGate();
  assert.ok(doc.docListeners.click?.length > 0, "guarda de clique instalada na captura");
  assert.ok(doc.docListeners.submit?.length > 0, "guarda de envio instalada na captura");
  assert.equal(container.innerHTML, "", "ler não abre a entrada");
  await enter.fire("click");
  assert.equal(localStorage.getItem(CANTINA_STORAGE_KEY), "true");
  assert.ok(container.innerHTML.length > 0);
});

test("apagar conta local: a conta some, o aviso é honesto e o resultado diz o que ficou", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const outcome = await onboarding.wipeLocalDevice();
  assert.equal(typeof outcome.complete, "boolean");
  assert.ok(Array.isArray(outcome.pending));
  assert.equal(localStorage.getItem("vox-pact-accepted"), null);
  assert.deepEqual(onboarding.describeWipeOutcome({ complete: true, pending: [] }), { message: "Chaves deste navegador apagadas.", kind: "info" });
  const partial = onboarding.describeWipeOutcome({ complete: false, pending: ["db"] });
  assert.equal(partial.kind, "error");
  assert.match(partial.message, /outra aba/);
  assert.equal(onboarding.describeWipeOutcome(undefined).kind, "error");
});

test("rascunho da entrada: grava sem e-mail nem senha, lê de volta e apaga", () => {
  reset();
  email.writeGenesisResume({ step: "entry", rawName: "Ana", pass: "segredo", email: "a@b.c" });
  const raw = sessionStorage.getItem(email.GENESIS_RESUME_KEY);
  assert.doesNotMatch(raw, /segredo|a@b\.c/);
  assert.equal(email.readGenesisResume().rawName, "Ana");
  email.persistGenesisEntryDraft({ rawName: "Bia", includePhrase: true });
  assert.deepEqual(email.readGenesisResume(), { step: "entry", meshWaiting: false, rawName: "Bia", includePhrase: true });
  email.clearGenesisResume();
  assert.equal(email.readGenesisResume(), null);
});

test("rascunho antigo com senha em claro é saneado ao ler", () => {
  reset();
  sessionStorage.setItem(email.GENESIS_RESUME_KEY, JSON.stringify({ step: "have", pass: "velha", email: "x@y.z", meshWaiting: false }));
  const state = email.readGenesisResume();
  assert.equal("pass" in state, false);
  assert.equal("email" in state, false);
  assert.doesNotMatch(sessionStorage.getItem(email.GENESIS_RESUME_KEY), /velha/);
  sessionStorage.setItem(email.GENESIS_RESUME_KEY, "não é json");
  assert.equal(email.readGenesisResume(), null);
  sessionStorage.setItem(email.GENESIS_RESUME_KEY, "7");
  assert.equal(email.readGenesisResume(), 7);
});

test("espera da malha: grava só o e-mail normalizado; sem e-mail, só o passo", () => {
  reset();
  email.persistGenesisMeshWait("  ANA@Exemplo.COM ");
  assert.deepEqual(email.readGenesisResume(), { step: "have", meshWaiting: true, vaultEmail: "ana@exemplo.com" });
  email.persistGenesisMeshWait("");
  assert.deepEqual(email.readGenesisResume(), { step: "have", meshWaiting: true });
});

test("armazenamento de sessão que falha não derruba a gravação nem a leitura", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.doesNotThrow(() => email.writeGenesisResume({ step: "entry" }, broken));
  assert.doesNotThrow(() => email.writeGenesisResume(null, broken));
  assert.equal(email.readGenesisResume(broken), null);
  sessionStorage.setItem(email.GENESIS_RESUME_KEY, JSON.stringify({ pass: "p" }));
  const half = { getItem: () => JSON.stringify({ pass: "p" }), removeItem: () => {}, setItem() { throw new Error("cheio"); } };
  assert.deepEqual(email.readGenesisResume(half), {});
});

test("retomar a entrada: repõe nome e foca o e-mail; retomar a volta repõe o e-mail e foca a senha", () => {
  reset();
  const { container, panel, steps, ids } = genesisDom({
    "oauth-entry-email-input": makeEl(), "oauth-entry-include-phrase": makeEl({ checked: false }),
    "oauth-restore-email-input": makeEl(), "oauth-sovereign-passphrase-input": makeEl(),
  });
  email.writeGenesisResume({ step: "entry", rawName: "Ana", includePhrase: true });
  email.resumeGenesisAfterRender(container, { onEmailKitFinish() {} });
  assert.equal(ids["oauth-custom-name-input"].value, "Ana");
  assert.equal(ids["oauth-entry-include-phrase"].checked, true);
  assert.equal(ids["oauth-entry-email-input"].focused, 1);
  email.writeGenesisResume({ step: "have", vaultEmail: "ana@exemplo.com", meshWaiting: false });
  email.resumeGenesisAfterRender(container, { onEmailKitFinish() {} });
  assert.equal(steps[1].hidden, false);
  assert.equal(ids["oauth-restore-email-input"].value, "ana@exemplo.com");
  assert.equal(ids["oauth-sovereign-passphrase-input"].focused, 1);
  assert.ok(panel);
});

test("retomar sem rascunho ou sem painel não faz nada", () => {
  reset();
  const { container } = genesisDom();
  email.resumeGenesisAfterRender(container, { onEmailKitFinish() {} });
  email.writeGenesisResume({ step: "entry" });
  assert.doesNotThrow(() => email.resumeGenesisAfterRender(makeEl(), { onEmailKitFinish() {} }));
});

test("retomar o cartão do e-mail: remonta o kit do mailto e 'Confirmar' encerra a entrada", async () => {
  reset();
  await localAccount.ensureLocalAccount();
  const slot = makeEl({ hidden: true });
  const form = makeEl({ parentElement: { querySelector: () => makeEl() } });
  const confirmBtn = makeEl();
  const { container } = genesisDom({ "oauth-email-kit-slot": slot, "form-oauth-custom-name": form, "btn-email-kit-confirm": confirmBtn });
  email.writeGenesisResume({ step: "email-kit", routeId: "vx_abc", mailtoUrl: "mailto:ana%40exemplo.com?subject=Acesso&body=Corpo%20do%20kit" });
  let finished = null;
  email.resumeGenesisAfterRender(container, { onEmailKitFinish: (r) => { finished = r; } });
  assert.equal(slot.hidden, false);
  assert.equal(form.hidden, true);
  assert.match(slot.innerHTML, /ana@exemplo\.com|ana%40exemplo\.com/);
  await confirmBtn.fire("click");
  assert.equal(finished.ok, true);
  assert.equal(finished.routeId, "vx_abc");
  assert.equal(email.readGenesisResume(), null, "o rascunho some ao concluir");
});

test("falha na volta: sem servidor aponta o link do e-mail; motivo desconhecido usa o texto padrão", () => {
  reset();
  const { ids, error } = genesisDom({ "oauth-restore-kit-text": makeEl() });
  email.handleRestoreFailure({ noServer: true });
  assert.match(error.textContent, /Nenhum servidor respondeu/);
  assert.equal(ids["oauth-restore-kit-text"].focused, 1);
  email.handleRestoreFailure({ reason: "Cofre revogado." });
  assert.equal(error.textContent, "Cofre revogado.");
  email.handleRestoreFailure(null);
  assert.match(error.textContent, /Senha incorreta/);
});

test("espera da malha: sem senha continua esperando; com cofre e senha abre e cancela o pedido", async () => {
  const calls = [];
  const ops = {
    collect: async () => ({ ok: true, record: { r: 1 } }),
    restore: async (pass, opts) => { calls.push([pass, opts.email]); return pass === "ok" ? { ok: true, routeId: "vx_a" } : { ok: false }; },
    cancel: () => calls.push("cancel"),
  };
  assert.deepEqual(await email.tryMeshRestoreOnce({ email: "a@b.c", pass: "" }, ops), { ok: false, reason: "waiting" });
  const wrong = await email.tryMeshRestoreOnce({ email: "a@b.c", pass: "errada" }, ops);
  assert.match(wrong.reason, /senha não abriu/);
  assert.equal((await email.tryMeshRestoreOnce({ email: "a@b.c", pass: "ok" }, ops)).routeId, "vx_a");
  assert.deepEqual(calls.at(-1), "cancel");
  const none = await email.tryMeshRestoreOnce({ email: "", pass: "x" }, { ...ops, collect: async () => ({ ok: false, reason: "waiting" }) });
  assert.deepEqual(none, { ok: false, reason: "waiting" });
});

test("leitura dos campos da volta: junta e-mail, senha, kit, frase e arquivos", () => {
  reset();
  installDom({
    ids: {
      "oauth-restore-email-input": makeEl({ value: " a@b.c " }), "oauth-sovereign-passphrase-input": makeEl({ value: " senha " }),
      "oauth-restore-kit-text": makeEl({ value: "VOX1:x" }), "oauth-restore-phrase": makeEl({ value: " p1 p2 " }),
      "oauth-restore-files": makeEl({ files: ["arq"] }),
    },
  });
  assert.deepEqual(email.readRestoreInputs(), { email: "a@b.c", pass: "senha", kitText: "VOX1:x", phraseText: "p1 p2", files: ["arq"] });
  installDom();
  assert.deepEqual(email.readRestoreInputs(), { email: "", pass: "", kitText: "", phraseText: "", files: [] });
});

test("formulário de entrada: mostrar/ocultar senha alterna o tipo e o rótulo; rascunho some ao limpar o formulário", async () => {
  reset();
  const pass = makeEl({ type: "password", value: "" });
  const toggle = makeEl({ textContent: "Mostrar senha" });
  const name = makeEl({ value: "Ana" });
  const form = makeEl();
  installDom({ ids: { "oauth-entry-pass-input": pass, "btn-oauth-toggle-pass": toggle, "oauth-custom-name-input": name, "oauth-entry-email-input": makeEl({ value: "" }) } });
  email.bindEmailEntryForm(form, { finish() {}, finishNameOnly() {} });
  await toggle.fire("click");
  assert.equal(pass.type, "text");
  assert.equal(toggle.textContent, "Ocultar senha");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  await toggle.fire("click");
  assert.equal(pass.type, "password");
  await form.fire("input");
  assert.equal(email.readGenesisResume().rawName, "Ana");
  name.value = "";
  await form.fire("input");
  assert.equal(email.readGenesisResume(), null);
});

test("formulário de entrada: e-mail sem senha mostra o erro no campo certo; só nome chama finishNameOnly", async () => {
  reset();
  const emailInput = makeEl({ value: "ana@exemplo.com" });
  const name = makeEl({ value: "Ana" });
  const nameOnly = makeEl();
  const form = makeEl();
  const error = makeEl({ hidden: true });
  const passInput = makeEl({ value: "" });
  installDom({ ids: { "oauth-entry-email-input": emailInput, "oauth-custom-name-input": name, "btn-oauth-name-only": nameOnly, "oauth-enrich-error": error, "oauth-entry-pass-input": passInput } });
  const seen = [];
  email.bindEmailEntryForm(form, { finish() {}, finishNameOnly: (n) => seen.push(n) });
  await form.fire("submit");
  assert.match(error.textContent, /senha/i);
  assert.equal(passInput.focused, 1, "o foco vai para a senha");
  emailInput.value = "";
  await form.fire("submit");
  assert.deepEqual(seen, ["Ana"]);
  await nameOnly.fire("click");
  assert.deepEqual(seen, ["Ana", "Ana"]);
});

test("entrada com e-mail e senha: cria a conta, mostra o cartão do kit e 'Fiz o envio' conclui", async () => {
  reset();
  const slot = makeEl({ hidden: true });
  const form = makeEl({ parentElement: { querySelector: () => makeEl() } });
  const confirmBtn = makeEl();
  const fix = makeEl();
  const { ids } = genesisDom({
    "oauth-custom-name-input": makeEl({ value: "Ana" }), "oauth-entry-email-input": makeEl({ value: "ana@exemplo.com" }),
    "oauth-entry-pass-input": makeEl({ value: "uma senha bem longa de teste" }), "oauth-email-kit-slot": slot,
    "btn-oauth-save-name": makeEl(), "btn-email-kit-confirm": confirmBtn, "btn-email-kit-fix-email": fix,
    "btn-email-kit-copy": makeEl(), "btn-email-kit-download": makeEl(), "btn-email-kit-later": makeEl(),
  });
  let finished = null;
  email.bindEmailEntryForm(form, { finish: (r, toast) => { finished = { r, toast }; }, finishNameOnly() {} });
  await form.fire("submit");
  await waitFor(() => !slot.hidden || ids["oauth-enrich-error"].textContent);
  assert.equal(slot.hidden, false, `o cartão do kit aparece; erro: ${ids["oauth-enrich-error"].textContent}`);
  assert.equal(form.hidden, true);
  assert.equal(email.readGenesisResume().step, "email-kit");
  await fix.fire("click");
  assert.equal(slot.hidden, true, "'Corrigir e-mail' volta ao formulário");
  assert.equal(form.hidden, false);
  await confirmBtn.fire("click");
  assert.equal(finished.r.ok, true);
  assert.equal(finished.r.email, "ana@exemplo.com");
  assert.equal(email.readGenesisResume(), null);
  assert.equal(ids["btn-oauth-save-name"].disabled, false);
});

test("retomar a espera da malha: avisa que e-mail e senha precisam ser digitados de novo", () => {
  reset();
  const { container, ids, error } = genesisDom({ "oauth-restore-email-input": makeEl(), "oauth-sovereign-passphrase-input": makeEl() });
  email.writeGenesisResume({ step: "have", vaultEmail: "ana@exemplo.com", meshWaiting: true });
  email.resumeGenesisAfterRender(container, { onEmailKitFinish() {}, onMeshRestored() {} });
  assert.match(error.textContent, /esperando seu cofre/);
  assert.equal(ids["oauth-restore-email-input"].value, "ana@exemplo.com");
});

test("cofre não achado com e-mail e senha: pede à malha e deixa o pedido guardado", async () => {
  reset();
  const { error } = genesisDom({ "oauth-mesh-status": makeEl() });
  let restored = null;
  email.handleRestoreFailure({ notFound: true }, { email: "ana@exemplo.com", pass: "uma senha bem longa de teste" }, (r) => { restored = r; });
  await waitFor(() => document.getElementById("oauth-mesh-status").textContent || error.textContent);
  assert.equal(email.readGenesisResume().meshWaiting, true);
  assert.equal(restored, null, "nada chegou ainda");
  const status = document.getElementById("oauth-mesh-status").textContent;
  assert.ok(status === email.MESH_WAITING_STATUS || error.textContent.length > 0, "ou espera a malha, ou explica por que não deu");
  email.stopMeshPoll();
});
