/** @file Entrada (nome e 18+), importação de nome e foto do Perfil (Google / Meta / GitHub, ADR-032) e pacto. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as localAccount from "../identity/index.js";
import * as oauthProfile from "../oauth-profile.js";
import * as emailKit from "../email-kit.js";
import {
  bindEmailEntryForm,
  clearGenesisResume,
  handleRestoreFailure,
  readGenesisResume,
  readRestoreInputs,
  resumeGenesisAfterRender,
} from "./onboarding-email.js";
import * as meshProfile from "../mesh-profile.js";
import * as centralMemory from "../central-memory.js";
import { syncIdentity } from "./screens-network.js";
import { parseRoute } from "./route-parse.js";
import * as ageGate from "../age-gate.js";
import {
  CANTINA_STORAGE_KEY,
  hasPassedCantinaGate,
  shouldShowCantinaGate,
} from "./cantina-gate.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { showHome } from "./screens-home.js";
import * as readFirst from "./read-first.js";
import { startStorageDurability } from "./storage-durability-flow.js";
import { startAccountExitBanner } from "./account-exit-banner.js";
import * as inviteArrival from "../invite-arrival.js";
import { addContactAndNotify } from "./contact-notify-flow.js";
import { showConnect } from "./screens-people.js";
import { forgetAllMesh } from "../vault/index.js";
import {
  setOAuthEnrichError,
  warnIfAccountNotPersisted,
  setOAuthButtonBusy,
  runOAuthEnrichSignIn,
} from "./onboarding-oauth-ui.js";

export { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
export {
  ACCOUNT_NOT_PERSISTED_WARN,
  setOAuthEnrichError,
  warnIfAccountNotPersisted,
  setOAuthButtonBusy,
  reportOAuthEnrichFailure,
  runOAuthEnrichSignIn,
} from "./onboarding-oauth-ui.js";

/**
 * Diz se um id de cliente OAuth do `config/oauth.json` está preenchido de verdade.
 * @param {unknown} id Valor lido do arquivo (pode faltar ou ser o texto de exemplo `YOUR_…`).
 * @returns {boolean} `true` quando há um id real.
 */
function isOAuthClientConfigured(id) {
  const value = String(id || "").trim();
  return Boolean(value) && !value.includes("YOUR_");
}

/**
 * Esconde os botões de Google e Meta quando o `config/oauth.json` não traz o id do cliente.
 * Antes eles ficavam desativados e uma caixa vermelha de erro aparecia já no primeiro passo
 * do onboarding, antes de a pessoa escolher importar nada. Falta de configuração não é erro
 * de quem usa: o GitHub e o "Pular" continuam à mão.
 * @returns {void}
 */
function applyOAuthProviderAvailability() {
  oauthProfile.loadOAuthConfig().then((cfg) => {
    const ready = {
      "btn-oauth-google": isOAuthClientConfigured(cfg?.googleClientId),
      "btn-oauth-meta": isOAuthClientConfigured(cfg?.facebookAppId),
    };
    for (const [id, ok] of Object.entries(ready)) {
      const btn = document.getElementById(id);
      if (btn) btn.hidden = !ok;
    }
  });
}

function syncIdentityAndDirectoryAfterOnboarding() {
  void syncIdentity();
  void meshProfile.syncMeshProfileCard();
  void centralMemory.syncWithCentralMemory();
}

function completeEntryOnboarding(modalContainer, onComplete, result, toastMsg = "") {
  clearGenesisResume();
  oauthProfile.skipOAuthEnrichment();
  if (toastMsg) share.showToast(toastMsg);
  syncIdentityAndDirectoryAfterOnboarding();
  endGenesis(modalContainer, onComplete, result);
}

function bindOAuthProviderButton({ btnId, signInFn, fallbackError, labelFn, modalContainer, onDone }) {
  document.getElementById(btnId)?.addEventListener("click", async () => {
    const res = await runOAuthEnrichSignIn(document.getElementById(btnId), signInFn, { fallbackError });
    if (res.ok) completeEntryOnboarding(modalContainer, onDone, res, labelFn(res));
  });
}

async function finishNameOnlyEntry(rawName, modalContainer, onComplete) {
  if (!rawName) return setOAuthEnrichError("Digite um nome ou apelido para continuar.");
  setOAuthEnrichError("");
  try {
    await localAccount.ensureLocalAccount();
    warnIfAccountNotPersisted();
    localAccount.setDisplayName(rawName);
    completeEntryOnboarding(modalContainer, onComplete, { ok: true, customName: rawName }, `Bem-vindo, ${rawName}!`);
  } catch (err) {
    setOAuthEnrichError(err?.message || "Erro ao criar conta.");
  }
}

function bindCustomNameForm(modalContainer, onComplete) {
  const form = document.getElementById("form-oauth-custom-name");
  if (!form) return;
  const genesisResume = readGenesisResume();
  const entryResume = genesisResume?.step === "entry" ? genesisResume : null;
  bindEmailEntryForm(form, {
    finish: (result, toastMsg) => completeEntryOnboarding(modalContainer, onComplete, result, toastMsg),
    finishNameOnly: (rawName) => void finishNameOnlyEntry(rawName, modalContainer, onComplete),
    entryResume,
  });
}

function bindSovereignPassphraseForm(modalContainer, onComplete) {
  const form = document.getElementById("form-oauth-restore-passphrase");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-oauth-restore-passphrase");
    setOAuthButtonBusy(btn, true);
    setOAuthEnrichError("");
    try {
      const inputs = readRestoreInputs();
      const res = await emailKit.restoreAccountFromInputs(inputs);
      const done = (ok) => completeEntryOnboarding(modalContainer, onComplete, { ok: true, restored: true, routeId: ok.routeId }, `Identidade restaurada com sucesso! Bem-vindo(a), ${ok.displayName || "Cidadão"}!`);
      if (res.ok) done(res);
      else handleRestoreFailure(res, inputs, done);
    } catch (err) {
      setOAuthEnrichError(err?.message || "Erro ao decifrar cofre soberano.");
    } finally {
      setOAuthButtonBusy(btn, false);
    }
  });
}

/** Quando true, o pacto de boas-vindas é a última etapa do próprio onboarding (sem 2º modal). */
let genesisWithPact = false;

/**
 * Fim de um método de entrada: se o pacto ainda não foi aceito e este fluxo é o de primeiro
 * acesso, avança para a etapa "pacto" no mesmo modal; senão fecha e segue o callback.
 */
function endGenesis(modalContainer, onComplete, res) {
  const pactPending = genesisWithPact && !isPactComplete();
  if (pactPending && render.showGenesisStep(modalContainer, "pact")) {
    bindPactActions(modalContainer);
    return;
  }
  render.closeOAuthEnrich(modalContainer);
  if (onComplete) onComplete(res);
}

function completeMeshRestoredOnboarding(modalContainer, onComplete, ok) {
  completeEntryOnboarding(
    modalContainer,
    onComplete,
    { ok: true, restored: true, routeId: ok.routeId },
    `Identidade restaurada com sucesso! Bem-vindo(a), ${ok.displayName || "Cidadão"}!`,
  );
}

/**
 * Abre a entrada (primeiro acesso) ou, com `mode: "import"`, só a importação de nome e foto do Perfil (ADR-032).
 * @param {{ onComplete?: Function, withPact?: boolean, mode?: "entry" | "import" }} [opts]
 */
export function openOAuthEnrichModal({ onComplete, withPact = false, mode = "entry" } = {}) {
  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;
  genesisWithPact = withPact;

  render.renderOAuthEnrich(modalContainer, { invite: inviteArrival.peekInviteArrival(), mode });
  modalContainer.querySelector(".genesis-panel--steps")?.addEventListener("click", (e) => {
    const go = e.target.closest("[data-genesis-go]");
    if (!go) return;
    setOAuthEnrichError("");
    render.showGenesisStep(modalContainer, go.dataset.genesisGo);
  });
  applyOAuthProviderAvailability();
  bindCustomNameForm(modalContainer, onComplete);
  bindSovereignPassphraseForm(modalContainer, onComplete);

  document.getElementById("btn-oauth-skip")?.addEventListener("click", () => {
    setOAuthEnrichError("");
    oauthProfile.skipOAuthEnrichment();
    syncIdentityAndDirectoryAfterOnboarding();
    endGenesis(modalContainer, onComplete, { skipped: true });
  });

  bindOAuthProviderButton({ btnId: "btn-oauth-google", signInFn: () => oauthProfile.signInWithGoogle(), fallbackError: "Google indisponível", labelFn: () => "Perfil enriquecido com Google.", modalContainer, onDone: onComplete });
  bindOAuthProviderButton({ btnId: "btn-oauth-meta", signInFn: () => oauthProfile.signInWithMeta(), fallbackError: "Meta indisponível", labelFn: () => "Perfil enriquecido com Meta.", modalContainer, onDone: onComplete });
  bindOAuthProviderButton({ btnId: "btn-oauth-github", signInFn: () => oauthProfile.signInWithGithub(), fallbackError: "GitHub indisponível", labelFn: (res) => `Perfil enriquecido com GitHub (@${res.profile?.handle || ""}).`, modalContainer, onDone: onComplete });

  resumeGenesisAfterRender(modalContainer, {
    onEmailKitFinish: (result, toastMsg) => completeEntryOnboarding(modalContainer, onComplete, result, toastMsg),
    onMeshRestored: (ok) => completeMeshRestoredOnboarding(modalContainer, onComplete, ok),
  });
}

/**
 * Avança para pacto ou reabre modal de entrada conforme estado local.
 *
 * @returns {void}
 */
export function checkOAuthEnrichStep() {
  if (oauthProfile.hasCompletedOAuthStep()) {
    checkPactModal();
    return;
  }
  if (localStorage.getItem("vox-pact-accepted") === "true") {
    oauthProfile.skipOAuthEnrichment();
    checkPactModal();
    return;
  }
  if (document.getElementById("oauth-enrich-overlay")) return;
  openOAuthEnrichModal({ onComplete: () => checkPactModal(), withPact: true });
}

/**
 * Orquestra portão de entrada, read-first e enriquecimento OAuth na troca de rota.
 *
 * @returns {void}
 */
export function checkCantinaGate() {
  const route = parseRoute();

  if (!shouldShowCantinaGate(route.name)) {
    if (hasPassedCantinaGate()) {
      readFirst.removeReadFirstBanner();
      checkOAuthEnrichStep();
    } else if (readFirst.isReadFirstRoute(route.name)) {
      startReadFirst();
    }
    return;
  }
  openEntry();
}

/** PM-54: leitura liberada, faixa "Entrar no Vox" e portão na primeira ação que escreve. */
function startReadFirst() {
  installEntryGuards();
  readFirst.mountReadFirstBanner(document, openEntry);
}

/**
 * Escrever exige ter passado pela entrada E concluído o pacto com 18+ (ADR-020).
 *
 * @returns {boolean}
 */
export function hasFullEntry() {
  return hasPassedCantinaGate() && isPactComplete();
}

/** Guardas de escrita desde o boot: valem antes de a 1ª rota rodar e para quem ainda não confirmou 18+. */
export function installEntryGuards() {
  readFirst.installReadFirstGuards({ doc: document, hasEntered: hasFullEntry, openEntry });
}

/** Abre a entrada (nome e 18+) direto, sem a tela de portão que vinha antes. Idempotente: quem já entrou cai no passo que falta (pacto). */
function openEntry() {
  localStorage.setItem(CANTINA_STORAGE_KEY, "true");
  readFirst.removeReadFirstBanner();
  checkOAuthEnrichStep();
}

/** Pacto aceito E maioridade confirmada (ADR-020). Quem aceitou antes do aviso de 18+ vê o pacto uma vez mais. */
function isPactComplete() {
  return localStorage.getItem("vox-pact-accepted") === "true" && ageGate.hasConfirmedAdult();
}

/** Grava o pacto e os 18+. Se o navegador recusar gravar (cheio, modo privado), avisa em vez de travar. */
function acceptPact() {
  try {
    ageGate.confirmAdult();
    localStorage.setItem("vox-pact-accepted", "true");
    return true;
  } catch {
    share.showToast("Não foi possível salvar neste navegador. Libere espaço ou saia do modo privado.", "error");
    return false;
  }
}

/**
 * "Apagar conta local": as chaves da conta, o cofre na malha e todo dado pessoal do aparelho (lista em `local-wipe.js`).
 * O localStorage e o sessionStorage saem na hora; a promessa termina quando os bancos IndexedDB também saíram
 * ou o navegador provou que não saem (outra aba segurando): `complete` só é true se tudo foi apagado de fato.
 * @returns {Promise<{ complete: boolean, pending: string[] }>} `pending` lista os bancos que ficaram
 */
export async function wipeLocalDevice() {
  const accountGone = localAccount.wipeLocalAccount();
  forgetAllMesh();
  localAccount.dropAllPersonalStorage();
  await accountGone;
  const pending = await localAccount.dropDatabases();
  return { complete: pending.length === 0, pending };
}

/**
 * Texto do aviso depois de "Apagar conta local", sem prometer o que não aconteceu.
 * @param {{ complete: boolean, pending: string[] }} outcome resultado de `wipeLocalDevice`
 * @returns {{ message: string, kind: "info" | "error" }}
 */
export function describeWipeOutcome(outcome) {
  if (outcome?.complete) return { message: "Chaves deste navegador apagadas.", kind: "info" };
  return {
    message:
      "Apagamos o que deu, mas parte das chaves ainda está neste navegador: outra aba do Vox está usando. " +
      "Feche as outras abas e apague de novo.",
    kind: "error",
  };
}

/** Conta acabou de nascer: pede ao navegador para não apagar e avisa que ela ainda não tem saída (ADR-032). */
function protectNewAccount() {
  void startStorageDurability({ hasAccount: hasFullEntry }).catch(() => {});
  void startAccountExitBanner({ hasAccount: hasFullEntry }).catch(() => {});
}

async function finishPactAcceptance(modalContainer) {
  const returning = localStorage.getItem("vox-pact-accepted") === "true";
  if (!acceptPact()) return;
  render.closePactModal(modalContainer);
  protectNewAccount();
  if (returning) return; // só faltava confirmar os 18+: sem boas-vindas nem convite de novo
  const user = await localAccount.getRouteId().catch(() => "");
  await ensureOnboardingSideEffects(user);
  share.showToast("Bem-vindo ao Vox! 🔗🟢");
  if (landOnInviter(user)) return;
  const cur = parseRoute();
  if (cur.name === "home") showHome(cur.feed);
}

/** Chegou por convite: quem chamou vira contato e a pessoa cai na tela dele, com o cartão do vínculo. */
function landOnInviter(user) {
  const arrival = inviteArrival.peekInviteArrival();
  if (!arrival || !user || arrival.inviter === user) return false;
  inviteArrival.clearInviteArrival();
  addContactAndNotify(arrival.inviter, arrival.name);
  const target = inviteArrival.inviteArrivalHash(arrival);
  if (location.hash === target) void showConnect(arrival.inviter, arrival.token);
  else location.hash = target;
  return true;
}

/**
 * Abre o modal de pacto quando ainda falta aceite ou confirmação de maioridade.
 *
 * @returns {void}
 */
export function checkPactModal() {
  // Já aberto: não redesenhar a cada troca de rota (desmarcaria a caixa de 18+).
  if (isPactComplete() || document.getElementById("pact-modal-overlay")) return;
  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderPactModal(modalContainer);
  bindPactActions(modalContainer);
}

/** Liga "Entrar na roda" / "Ajustar rede depois" (modal avulso ou etapa final do onboarding). */
function bindPactActions(modalContainer) {
  const accept = document.getElementById("btn-pact-accept");
  if (!accept || accept.dataset.bound === "1") return;
  accept.dataset.bound = "1";
  const settings = document.getElementById("btn-pact-settings");
  const ageBox = ageGate.bindAdultCheck(document, [accept, settings]);
  const confirmed = () => Boolean(ageBox?.checked);
  accept.addEventListener("click", () => {
    if (confirmed()) void finishPactAcceptance(modalContainer);
  });
  settings?.addEventListener("click", () => {
    if (!confirmed() || !acceptPact()) return;
    render.closePactModal(modalContainer);
    protectNewAccount();
    void localAccount.getRouteId().then((u) => ensureOnboardingSideEffects(u));
    location.hash = "#/settings/network";
  });
}
