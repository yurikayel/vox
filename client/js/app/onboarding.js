/** @file Cantina gate, OAuth enrich (Google / Meta / GitHub), pact modals. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as localAccount from "../local-account.js";
import * as oauthProfile from "../oauth-profile.js";
import * as oauthVault from "../oauth-vault.js";
import * as meshProfile from "../mesh-profile.js";
import * as centralMemory from "../central-memory.js";
import { syncIdentity } from "./screens-network.js";
import { parseRoute } from "./route-parse.js";
import * as ageGate from "../age-gate.js";
import {
  CANTINA_STORAGE_KEY,
  hasPassedCantinaGate,
  shouldShowCantinaGate,
  wireCantinaOverlayPassthrough,
} from "./cantina-gate.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { showHome } from "./screens-home.js";
import * as readFirst from "./read-first.js";

export { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";

export function setOAuthEnrichError(message) {
  const el = document.getElementById("oauth-enrich-error");
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

export function setOAuthButtonBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.setAttribute("aria-busy", "true");
  else btn.removeAttribute("aria-busy");
}

export function reportOAuthEnrichFailure(message, fallbackLabel) {
  const text = message || fallbackLabel;
  setOAuthEnrichError(text);
  share.showToast(text, "error");
}

export async function runOAuthEnrichSignIn(btn, signInFn, { fallbackError }) {
  setOAuthEnrichError("");
  setOAuthButtonBusy(btn, true);
  try {
    const res = await signInFn();
    if (res.ok) return res;
    reportOAuthEnrichFailure(res.reason, fallbackError);
    return res;
  } catch (err) {
    reportOAuthEnrichFailure(err?.message, fallbackError);
    return { ok: false, reason: err?.message };
  } finally {
    setOAuthButtonBusy(btn, false);
  }
}

function applyOAuthProviderAvailability() {
  oauthProfile.loadOAuthConfig().then((cfg) => {
    const googleId = String(cfg?.googleClientId || "").trim();
    const metaId = String(cfg?.facebookAppId || "").trim();
    const googleReady = googleId && !googleId.includes("YOUR_");
    const metaReady = metaId && !metaId.includes("YOUR_");
    const btnGoogle = document.getElementById("btn-oauth-google");
    const btnMeta = document.getElementById("btn-oauth-meta");
    if (btnGoogle) {
      btnGoogle.disabled = !googleReady;
      if (!googleReady) btnGoogle.title = "Google não configurado (oauth.json)";
    }
    if (btnMeta) {
      btnMeta.disabled = !metaReady;
      if (!metaReady) btnMeta.title = "Meta não configurado (oauth.json)";
    }
    if (!googleReady && !metaReady) {
      setOAuthEnrichError(
        "Google/Meta requerem oauth.json — você pode entrar com GitHub agora ou clicar em Pular.",
      );
    }
  });
}

function syncIdentityAndDirectoryAfterOnboarding() {
  void syncIdentity();
  void meshProfile.syncMeshProfileCard();
  void centralMemory.syncWithCentralMemory();
}

function bindOAuthProviderButton({ btnId, signInFn, fallbackError, labelFn, modalContainer, onDone }) {
  document.getElementById(btnId)?.addEventListener("click", async () => {
    const btn = document.getElementById(btnId);
    const res = await runOAuthEnrichSignIn(btn, signInFn, { fallbackError });
    if (res.ok) {
      oauthProfile.skipOAuthEnrichment();
      share.showToast(labelFn(res));
      syncIdentityAndDirectoryAfterOnboarding();
      endGenesis(modalContainer, onDone, res);
    }
  });
}

function bindCustomNameForm(modalContainer, onComplete) {
  const form = document.getElementById("form-oauth-custom-name");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawName = document.getElementById("oauth-custom-name-input")?.value.trim() || "";
    if (!rawName) {
      setOAuthEnrichError("Digite um nome ou apelido para continuar.");
      return;
    }
    setOAuthEnrichError("");
    localAccount.setDisplayName(rawName);
    oauthProfile.skipOAuthEnrichment();
    share.showToast(`Bem-vindo, ${rawName}!`);
    syncIdentityAndDirectoryAfterOnboarding();
    endGenesis(modalContainer, onComplete, { ok: true, customName: rawName });
  });
}

function bindSovereignPassphraseForm(modalContainer, onComplete) {
  const form = document.getElementById("form-oauth-restore-passphrase");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("oauth-sovereign-passphrase-input")?.value.trim() || "";
    if (!pass) return setOAuthEnrichError("Digite sua Senha Soberana para restaurar.");
    const btn = document.getElementById("btn-oauth-restore-passphrase");
    setOAuthButtonBusy(btn, true);
    setOAuthEnrichError("");
    try {
      const res = await oauthVault.restoreFromPassphraseVault(pass);
      if (res.ok) {
        oauthProfile.skipOAuthEnrichment();
        share.showToast(`Identidade restaurada com sucesso! Bem-vindo(a), ${res.displayName || "Cidadão"}!`);
        syncIdentityAndDirectoryAfterOnboarding();
        endGenesis(modalContainer, onComplete, { ok: true, restored: true, routeId: res.routeId });
      } else {
        setOAuthEnrichError(res.reason || "Senha incorreta ou cofre não encontrado.");
      }
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

export function openOAuthEnrichModal({ onComplete, withPact = false } = {}) {
  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;
  genesisWithPact = withPact;

  render.renderOAuthEnrich(modalContainer);
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
}

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
  openOAuthEnrichModal({ onComplete: () => checkPactModal(), withPact: true });
}

export function checkCantinaGate() {
  const modalContainer = document.getElementById("modal-container");
  const route = parseRoute();

  if (!shouldShowCantinaGate(route.name)) {
    if (modalContainer && route.name === "ajuda-teste") {
      render.closeCantinaGate(modalContainer);
    }
    if (hasPassedCantinaGate()) {
      readFirst.removeReadFirstBanner();
      checkOAuthEnrichStep();
    } else if (readFirst.isReadFirstRoute(route.name)) {
      startReadFirst();
    }
    return;
  }
  openCantinaGate(modalContainer);
}

/** PM-54: leitura liberada, faixa "Entrar no Vox" e portão na primeira ação que escreve. */
function startReadFirst() {
  const enter = () => openCantinaGate(document.getElementById("modal-container"));
  readFirst.installReadFirstGuards({ doc: document, hasEntered: () => hasPassedCantinaGate(), openEntry: enter });
  readFirst.mountReadFirstBanner(document, enter);
}

function openCantinaGate(modalContainer) {
  if (!modalContainer) return;
  wireCantinaOverlayPassthrough();
  render.renderCantinaGate(modalContainer);

  document.getElementById("btn-cantina-enter")?.addEventListener("click", () => {
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    render.closeCantinaGate(modalContainer);
    readFirst.removeReadFirstBanner();
    checkOAuthEnrichStep();
  });
}

/** Pacto aceito E maioridade confirmada (ADR-020). Quem aceitou antes do aviso de 18+ vê o pacto uma vez mais. */
function isPactComplete() {
  return localStorage.getItem("vox-pact-accepted") === "true" && ageGate.hasConfirmedAdult();
}

function acceptPact() {
  ageGate.confirmAdult();
  localStorage.setItem("vox-pact-accepted", "true");
}

async function finishPactAcceptance(modalContainer) {
  acceptPact();
  render.closePactModal(modalContainer);
  const user = await localAccount.getRouteId().catch(() => "");
  await ensureOnboardingSideEffects(user);
  share.showToast("Bem-vindo ao Vox! Rede ativa.");
  if (user) {
    render.renderPostPactConnectModal(modalContainer, user);
    document.getElementById("btn-post-pact-connect-close")?.addEventListener("click", () => {
      render.closePostPactConnectModal(modalContainer);
    });
    document.getElementById("btn-post-pact-share-connect")?.addEventListener("click", () => {
      void share.shareConnect({ routeId: user, displayName: localAccount.getDisplayName() });
    });
  }
  const cur = parseRoute();
  if (cur.name === "home") showHome(cur.feed);
}

export function checkPactModal() {
  if (isPactComplete()) return;
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
    if (!confirmed()) return;
    acceptPact();
    render.closePactModal(modalContainer);
    void localAccount.getRouteId().then((u) => ensureOnboardingSideEffects(u));
    location.hash = "#/settings/network";
  });
}
