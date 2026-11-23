/**
 * @module app/onboarding-email
 * Entrada e volta com e-mail + Senha Soberana (ADR-032 Emenda 1). O e-mail é só a caixa onde a
 * pessoa guarda o próprio backup cifrado: o Vox não o guarda nem o envia a servidor.
 */

import * as render from "../render.js";
import * as localAccount from "../identity/index.js";
import * as emailKit from "../email-kit.js";
import { normalizeVaultEmail } from "../vault/index.js";
import { setOAuthButtonBusy, setOAuthEnrichError, warnIfAccountNotPersisted } from "./onboarding-oauth-ui.js";

/** Inputs de `#form-oauth-custom-name` (genesis-entry) para foco após erro na entrada (LT-07). */
const EMAIL_ENTRY_FOCUS_ID = { name: "oauth-custom-name-input", email: "oauth-entry-email-input", pass: "oauth-entry-pass-input" };

/** Rascunho da entrada / espera da malha entre recargas (só `sessionStorage`, some ao fechar a aba). */
export const GENESIS_RESUME_KEY = "vox-genesis-resume-v1";

/** Aviso ao retomar a espera da malha: e-mail e senha não ficam guardados. */
const MESH_RESUME_ASK_PASS =
  "Você estava esperando seu cofre chegar. Por segurança o Vox não guarda e-mail nem senha: preencha os dois de novo para continuar a espera.";

/**
 * Cópia do rascunho sem e-mail nem Senha Soberana: nada sensível vai a `sessionStorage`.
 * @param {object} state
 * @returns {object}
 */
function sanitizeResumeForStorage(state) {
  const safe = { ...state };
  delete safe.pass;
  delete safe.email;
  return safe;
}

/**
 * Rascunho antigo podia trazer `pass` ou `email` em claro: regrava só metadados de passo.
 * @param {object} state rascunho lido
 * @param {Storage} store
 * @returns {object} rascunho saneado
 */
function scrubLegacySecrets(state, store) {
  const safe = sanitizeResumeForStorage(state);
  try {
    store.removeItem(GENESIS_RESUME_KEY);
    store.setItem(GENESIS_RESUME_KEY, JSON.stringify(safe));
  } catch {
    /* sessionStorage indisponível: a chave já foi apagada */
  }
  return safe;
}

/**
 * Lê o rascunho da entrada após recarga. Nunca devolve senha: se houver uma gravada por versão antiga, é apagada.
 * @param {Storage} [store]
 * @returns {object|null}
 */
export function readGenesisResume(store = globalThis.sessionStorage) {
  try {
    const raw = store?.getItem(GENESIS_RESUME_KEY);
    const state = raw ? JSON.parse(raw) : null;
    if (!state || typeof state !== "object") return state;
    return "pass" in state || "email" in state ? scrubLegacySecrets(state, store) : state;
  } catch {
    return null;
  }
}

/**
 * Grava ou apaga o rascunho da entrada (`null` limpa). Qualquer campo `pass` é descartado antes de gravar.
 * @param {object|null} state
 * @param {Storage} [store]
 * @returns {void}
 */
export function writeGenesisResume(state, store = globalThis.sessionStorage) {
  try {
    if (!state) store?.removeItem(GENESIS_RESUME_KEY);
    else store?.setItem(GENESIS_RESUME_KEY, JSON.stringify(sanitizeResumeForStorage(state)));
  } catch {
    /* sessionStorage indisponível */
  }
}

/**
 * Apaga o rascunho da entrada.
 * @param {Storage} [store]
 * @returns {void}
 */
export function clearGenesisResume(store = globalThis.sessionStorage) {
  writeGenesisResume(null, store);
}

/**
 * Guarda o rascunho da entrada sem a senha (a pessoa digita de novo após recarga).
 * @param {object} values campos da entrada
 * @param {Storage} [store]
 * @returns {void}
 */
export function persistGenesisEntryDraft(values, store = globalThis.sessionStorage) {
  const { rawName, includePhrase } = values;
  writeGenesisResume({ step: "entry", meshWaiting: false, rawName, includePhrase }, store);
}

/**
 * Marca que a espera da malha está em curso; grava só o e-mail normalizado (nunca a senha).
 * @param {string} [vaultEmail]
 * @param {Storage} [store]
 * @returns {void}
 */
export function persistGenesisMeshWait(vaultEmail = "", store = globalThis.sessionStorage) {
  const email = normalizeVaultEmail(vaultEmail);
  writeGenesisResume({ step: "have", meshWaiting: true, ...(email ? { vaultEmail: email } : {}) }, store);
}

/**
 * Preenche um campo (texto ou caixa) pelo identificador; valor vazio é ignorado.
 *
 * @param {string} id Identificador do elemento.
 * @param {string|boolean|null} value Valor a colocar.
 */
function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;
  if ("checked" in el && typeof value === "boolean") el.checked = value;
  else el.value = String(value);
}

/** Reabre a entrada sem PII guardada; e-mail e senha voltam vazios (foco no e-mail). */
function applyEntryResume(resume) {
  setInputValue("oauth-custom-name-input", resume.rawName);
  setInputValue("oauth-entry-include-phrase", resume.includePhrase);
  document.getElementById("oauth-entry-email-input")?.focus();
}

/** Reabre a volta: e-mail do rascunho quando houver; senha sempre vazia. */
function applyRestoreResume(resume) {
  setInputValue("oauth-restore-email-input", resume?.vaultEmail);
  const passFirst = Boolean(resume?.vaultEmail);
  document.getElementById(passFirst ? "oauth-sovereign-passphrase-input" : "oauth-restore-email-input")?.focus();
}

/**
 * Guarda o rascunho da entrada enquanto a pessoa digita.
 *
 * @param {HTMLFormElement} form Formulário de entrada.
 */
function bindEntryDraftPersistence(form) {
  form.addEventListener("input", () => {
    const v = readEntryFormValues();
    if (v.email || v.pass || v.rawName) persistGenesisEntryDraft(v);
    else if (!readGenesisResume()?.meshWaiting) clearGenesisResume();
  });
}

/**
 * Liga o botão de mostrar e ocultar a senha.
 */
function bindEntryPasswordToggle() {
  const input = document.getElementById("oauth-entry-pass-input");
  const toggle = document.getElementById("btn-oauth-toggle-pass");
  if (!input || !toggle) return;
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Ocultar senha" : "Mostrar senha";
    toggle.setAttribute("aria-pressed", String(show));
  });
}

/**
 * Lê os campos do formulário de entrada.
 *
 * @returns {object}
 */
function readEntryFormValues() {
  return {
    rawName: document.getElementById("oauth-custom-name-input")?.value.trim() || "",
    email: normalizeVaultEmail(document.getElementById("oauth-entry-email-input")?.value || ""),
    pass: document.getElementById("oauth-entry-pass-input")?.value.trim() || "",
    includePhrase: Boolean(document.getElementById("oauth-entry-include-phrase")?.checked),
  };
}

/**
 * Mostra o cartão do kit de e-mail no lugar do formulário.
 *
 * @param {{kit: object, routeId: string, email: string, form: HTMLFormElement, finish: Function}} options Kit, conta, e-mail, formulário e função de encerrar.
 * @returns {*}
 */
function showEmailKitCard({ kit, routeId, email, form, finish }) {
  const slot = document.getElementById("oauth-email-kit-slot");
  const links = form.parentElement?.querySelector(".genesis-links");
  if (!slot) return finish({ ok: true, routeId, email });
  form.hidden = true;
  if (links) links.hidden = true;
  slot.innerHTML = render.renderEmailKitCardHtml({ email: kit.to, mailtoUrl: kit.mailtoUrl });
  slot.hidden = false;
  writeGenesisResume({ step: "email-kit", routeId, mailtoUrl: kit.mailtoUrl, meshWaiting: false });
  document.getElementById("btn-email-kit-fix-email")?.addEventListener("click", () => {
    slot.hidden = true;
    form.hidden = false;
    if (links) links.hidden = false;
    document.getElementById("oauth-entry-email-input")?.focus();
  });
  document.getElementById("btn-email-kit-copy")?.addEventListener("click", () => void emailKit.copyEmailKit(kit));
  document.getElementById("btn-email-kit-download")?.addEventListener("click", () => emailKit.downloadEmailKitFile(kit, routeId));
  /**
   * Conclui a entrada, confirmando o envio do kit quando a pessoa disse que mandou.
   *
   * @param {boolean} confirmExit A pessoa confirmou que enviou o kit.
   */
  const done = (confirmExit) => {
    if (confirmExit) emailKit.confirmEmailKitSent(routeId);
    clearGenesisResume();
    finish({ ok: true, routeId, email }, `Bem-vindo(a), ${localAccount.getDisplayName()}!`);
  };
  document.getElementById("btn-email-kit-confirm")?.addEventListener("click", () => done(true));
  document.getElementById("btn-email-kit-later")?.addEventListener("click", () => done(false));
}

/**
 * Valida o formulário de entrada e segue para a criação da conta ou só do nome.
 *
 * @param {{draftState: object, form: HTMLFormElement, finish: Function, finishNameOnly: Function}} options Estado do rascunho, formulário e funções de encerrar.
 * @returns {Promise<*>}
 */
async function handleEntryFormSubmit({ draftState, form, finish, finishNameOnly }) {
  const v = readEntryFormValues();
  const issue = emailKit.validateEmailEntryIssue(v);
  if (issue) return setOAuthEnrichError(issue.message, EMAIL_ENTRY_FOCUS_ID[issue.field]);
  setOAuthEnrichError("");
  if (!v.email && !v.pass) return finishNameOnly(v.rawName);
  const btn = document.getElementById("btn-oauth-save-name");
  setOAuthButtonBusy(btn, true);
  try {
    const out = await emailKit.createEmailAccountKit({ ...v, draftState });
    if (!out.ok) return setOAuthEnrichError(out.reason);
    warnIfAccountNotPersisted();
    emailKit.triggerMailtoDraft(out.kit.mailtoUrl);
    showEmailKitCard({ kit: out.kit, routeId: out.routeId, email: v.email, form, finish });
  } catch (errCreate) {
    setOAuthEnrichError(errCreate?.message || "Erro ao criar conta.");
  } finally {
    setOAuthButtonBusy(btn, false);
  }
}

/**
 * Liga o formulário de entrada (ADR-032 Emenda 1): só nome, ou e-mail + senha, que cria a conta,
 * abre o rascunho do e-mail para a própria pessoa e mostra o cartão do kit.
 * @param {HTMLFormElement} form `#form-oauth-custom-name`
 * @param {{ finish: (result: object, toastMsg?: string) => void, finishNameOnly: (rawName: string) => void }} done
 */
export function bindEmailEntryForm(form, { finish, finishNameOnly, entryResume = null }) {
  const draftState = { email: "", pass: "" };
  bindEntryPasswordToggle();
  bindEntryDraftPersistence(form);
  if (entryResume) applyEntryResume(entryResume);
  document.getElementById("btn-oauth-name-only")?.addEventListener("click", () => void finishNameOnly(readEntryFormValues().rawName));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void handleEntryFormSubmit({ draftState, form, finish, finishNameOnly });
  });
}

/**
 * Lê os campos da volta: e-mail, senha, kit colado, frase e arquivos de backup.
 * @returns {{ email: string, pass: string, kitText: string, phraseText: string, files: File[] }}
 */
export function readRestoreInputs() {
  return {
    email: document.getElementById("oauth-restore-email-input")?.value.trim() || "",
    pass: document.getElementById("oauth-sovereign-passphrase-input")?.value.trim() || "",
    kitText: document.getElementById("oauth-restore-kit-text")?.value.trim() || "",
    phraseText: document.getElementById("oauth-restore-phrase")?.value.trim() || "",
    files: [...(document.getElementById("oauth-restore-files")?.files || [])],
  };
}

const MESH_POLL_MS = 15 * 1000;
/** Texto de `#oauth-mesh-status` enquanto o pedido à malha está ativo (LT-07d). */
export const MESH_WAITING_STATUS =
  "Pedimos seu cofre à sua rede. Chega em até 24 h, ou na hora se você aprovar num aparelho seu. Pode deixar esta tela aberta.";

let meshPollGen = 0;

/** @returns {boolean} há ciclo de poll da malha ativo (uso em testes LT-07d). */
export function isMeshPollActive() {
  return meshPollGen > 0;
}

/** Invalida polls em andamento (teardown de testes). */
export function stopMeshPoll() {
  meshPollGen += 1;
}

/**
 * Escreve o texto de estado da busca em malha.
 *
 * @param {string} text Texto exibido.
 */
function setMeshStatus(text) {
  const el = document.getElementById("oauth-mesh-status");
  if (!el) return;
  el.textContent = text;
}

/**
 * Uma tentativa de juntar a resposta da malha e abrir o cofre com a senha (ADR-037 §3.2).
 * @param {{ email: string, pass: string }} creds
 * @param {{ collect: Function, restore: Function, cancel: Function }} ops
 * @returns {Promise<{ ok: true, routeId: string, displayName?: string }|{ ok: false, reason: string }>}
 */
export async function tryMeshRestoreOnce({ email, pass }, { collect, restore, cancel }) {
  const got = await collect();
  if (!got.ok) return got;
  if (!pass?.trim()) return { ok: false, reason: "waiting" };
  const res = await restore(pass, { email, directRecord: got.record });
  if (res.ok) cancel();
  return res.ok ? res : { ok: false, reason: res.reason || "O cofre chegou, mas a senha não abriu." };
}

/**
 * Resolve e-mail e senha para a busca em malha, com o e-mail guardado como reserva.
 *
 * @param {{email?: string, pass?: string}} inputs Valores digitados.
 * @returns {{email: string, pass: string}}
 */
function resolveMeshCreds(inputs) {
  const resume = readGenesisResume();
  return { email: inputs.email || resume?.vaultEmail || "", pass: inputs.pass || "" };
}

/**
 * Repete a busca do cofre em malha até restaurar ou a tela sair.
 *
 * @param {Function} getInputs Lê os valores digitados.
 * @param {Function} onRestored Chamado ao restaurar.
 */
function startMeshPollLoop(getInputs, onRestored) {
  const gen = (meshPollGen += 1);
  void (async () => {
    const { ops } = await meshOps();
    /**
     * Faz uma tentativa de restaurar o cofre em malha.
     *
     * @returns {Promise<void>}
     */
    const poll = async () => {
      if (gen !== meshPollGen) return;
      if (!document.getElementById("oauth-mesh-status")) return;
      const creds = resolveMeshCreds(getInputs());
      const res = await tryMeshRestoreOnce(creds, ops).catch(() => ({ ok: false, reason: "waiting" }));
      if (res.ok) {
        meshPollGen = 0;
        clearGenesisResume();
        return onRestored(res);
      }
      if (res.reason !== "waiting") setOAuthEnrichError(res.reason);
      setTimeout(() => void poll(), MESH_POLL_MS);
    };
    void poll();
  })();
}

/**
 * Carrega o fluxo e o cofre usados na busca em malha.
 *
 * @returns {Promise<{flow: object, vault: object, ops: object}>}
 */
async function meshOps() {
  const [flow, vault] = await Promise.all([import("./mesh-vault-flow.js"), import("../vault/index.js")]);
  return { flow, vault, ops: { collect: () => flow.collectMeshReply(), restore: vault.restoreFromPassphraseVault, cancel: flow.cancelMeshRequest } };
}

/**
 * Cofre não achado aqui nem nos servidores: pede à malha (ou retoma o pedido do mesmo endereço) e fica olhando a
 * resposta enquanto o formulário estiver na tela.
 * @param {{ email: string, pass: string }} creds
 * @param {(res: object) => void} onRestored chamado quando a conta abriu
 * @returns {Promise<void>}
 */
export async function startMeshRestore({ email, pass }, onRestored) {
  persistGenesisMeshWait(email);
  const { flow, vault } = await meshOps();
  const address = await vault.meshVaultAddress(pass, email);
  if (vault.loadMeshPending()?.address !== address) {
    const out = await flow.requestFromMesh(email, pass);
    if (!out.ok) return setOAuthEnrichError("Este navegador não consegue guardar o pedido com segurança. Use o link do e-mail ou a frase.");
  }
  setOAuthEnrichError("");
  setMeshStatus(MESH_WAITING_STATUS);
  startMeshPollLoop(() => ({ email, pass }), onRestored);
}

/**
 * Cria a função que mostra uma etapa da gênese e esconde as outras.
 *
 * @param {HTMLElement} panel Painel da gênese.
 * @returns {Function}
 */
function genesisStepShower(panel) {
  return (key) => {
    panel.querySelectorAll("[data-genesis-step]").forEach((s) => { s.hidden = s.dataset.genesisStep !== key; });
  };
}

/** Retoma o poll se `loadMeshPending` ainda existe após recarga (LT-07d). */
async function resumeMeshPollIfPending(onMeshRestored) {
  if (!onMeshRestored) return;
  const { vault } = await meshOps();
  if (!vault.loadMeshPending()) return;
  setMeshStatus(MESH_WAITING_STATUS);
  startMeshPollLoop(readRestoreInputs, onMeshRestored);
}

/**
 * Senha não fica guardada: com pedido à malha ativo, repõe o e-mail e reinicia o poll (`loadMeshPending`).
 */
function resumeGenesisHave(resume, show, onMeshRestored) {
  show("have");
  applyRestoreResume(resume);
  if (!resume.meshWaiting) return;
  setOAuthEnrichError(MESH_RESUME_ASK_PASS);
  void resumeMeshPollIfPending(onMeshRestored);
}

/**
 * Reconstrói o kit de e-mail a partir do link `mailto:` guardado.
 *
 * @param {string} mailtoUrl Link `mailto:` do kit.
 * @returns {object}
 */
function hydrateKitFromMailto(mailtoUrl) {
  const raw = String(mailtoUrl || "");
  const q = raw.indexOf("?");
  const to = raw.startsWith("mailto:") ? decodeURIComponent(raw.slice(7, q >= 0 ? q : raw.length)) : "";
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
  const subject = params.get("subject") || "";
  const body = params.get("body") || "";
  const copyText = subject && body ? `Assunto: ${subject}\n\n${body}` : body;
  return { to, subject, body, copyText, filename: "vox-acesso.txt", mailtoUrl: raw };
}

/**
 * Retoma a tela do kit de e-mail depois de recarregar.
 *
 * @param {object} resume Estado de retomada da gênese.
 * @param {Function} show Mostra uma etapa.
 * @param {Function} onEmailKitFinish Chamado ao concluir.
 */
function resumeGenesisEmailKit(resume, show, onEmailKitFinish) {
  if (!resume.mailtoUrl) return;
  show("entry");
  const form = document.getElementById("form-oauth-custom-name");
  if (!form) return;
  const kit = hydrateKitFromMailto(resume.mailtoUrl);
  showEmailKitCard({ kit, routeId: resume.routeId || "", email: kit.to, form, finish: onEmailKitFinish });
}

/**
 * Depois de `renderOAuthEnrich`, reabre o passo salvo (entrada, volta ou cartão do e-mail).
 * @param {ParentNode} modalContainer `#modal-container`
 * @param {{ onEmailKitFinish: Function, onMeshRestored?: Function }} hooks
 * @returns {void}
 */
export function resumeGenesisAfterRender(modalContainer, { onEmailKitFinish, onMeshRestored = null }) {
  const resume = readGenesisResume();
  if (!resume?.step) return;
  const panel = modalContainer.querySelector(".genesis-panel--steps");
  if (!panel) return;
  const show = genesisStepShower(panel);
  if (resume.step === "entry") return void (show("entry"), applyEntryResume(resume));
  if (resume.step === "have") return resumeGenesisHave(resume, show, onMeshRestored);
  if (resume.step === "email-kit") resumeGenesisEmailKit(resume, show, onEmailKitFinish);
}

/**
 * Mostra por que a volta falhou. Cofre não achado com e-mail e senha: pede à malha (ADR-037); sem servidor e sem como
 * pedir, aponta para o link ou código do e-mail.
 * @param {{ noServer?: boolean, notFound?: boolean, reason?: string }|null} res
 * @param {{ email?: string, pass?: string }|null} [inputs] o que a pessoa digitou
 * @param {((res: object) => void)|null} [onRestored] chamado se a malha devolver o cofre
 */
export function handleRestoreFailure(res, inputs = null, onRestored = null) {
  if (res?.notFound && inputs?.email && inputs?.pass && onRestored) {
    void startMeshRestore({ email: inputs.email, pass: inputs.pass }, onRestored).catch(() => handleRestoreFailure({ ...res, notFound: false }));
    return;
  }
  if (res?.noServer) {
    setOAuthEnrichError("Nenhum servidor respondeu aqui. Toque no link do seu e-mail ou cole o link (#/sync?b=…) / código VOX1:… acima, mantendo sua senha.");
    document.getElementById("oauth-restore-kit-text")?.focus();
    return;
  }
  setOAuthEnrichError(res?.reason || "Senha incorreta ou cofre não encontrado.");
}
