/** @file Cantina gate, OAuth enrich (Google / Meta / GitHub), pact modals. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as localAccount from "../local-account.js";
import * as oauthProfile from "../oauth-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import {
  CANTINA_STORAGE_KEY,
  hasPassedCantinaGate,
  shouldShowCantinaGate,
  wireCantinaOverlayPassthrough,
} from "./cantina-gate.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { showHome } from "./screens-home.js";

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

function bindOAuthProviderButton(btnId, signInFn, fallbackError, labelFn, modalContainer, onDone) {
  document.getElementById(btnId)?.addEventListener("click", async () => {
    const btn = document.getElementById(btnId);
    const res = await runOAuthEnrichSignIn(btn, signInFn, { fallbackError });
    if (res.ok) {
      oauthProfile.skipOAuthEnrichment();
      render.closeOAuthEnrich(modalContainer);
      share.showToast(labelFn(res));
      void meshProfile.syncMeshProfileCard();
      if (onDone) onDone(res);
    }
  });
}

export function openOAuthEnrichModal({ onComplete } = {}) {
  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderOAuthEnrich(modalContainer);
  applyOAuthProviderAvailability();

  document.getElementById("btn-oauth-skip")?.addEventListener("click", () => {
    setOAuthEnrichError("");
    oauthProfile.skipOAuthEnrichment();
    render.closeOAuthEnrich(modalContainer);
    if (onComplete) onComplete({ skipped: true });
  });

  bindOAuthProviderButton("btn-oauth-google", () => oauthProfile.signInWithGoogle(), "Google indisponível", () => "Perfil enriquecido com Google.", modalContainer, onComplete);
  bindOAuthProviderButton("btn-oauth-meta", () => oauthProfile.signInWithMeta(), "Meta indisponível", () => "Perfil enriquecido com Meta.", modalContainer, onComplete);
  bindOAuthProviderButton("btn-oauth-github", () => oauthProfile.signInWithGithub(), "GitHub indisponível", (res) => `Perfil enriquecido com GitHub (@${res.profile?.handle || ""}).`, modalContainer, onComplete);
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
  openOAuthEnrichModal({ onComplete: () => checkPactModal() });
}

export function checkCantinaGate() {
  const modalContainer = document.getElementById("modal-container");
  const route = parseRoute();

  if (!shouldShowCantinaGate(route.name)) {
    if (modalContainer && route.name === "ajuda-teste") {
      render.closeCantinaGate(modalContainer);
    }
    if (hasPassedCantinaGate()) checkOAuthEnrichStep();
    return;
  }
  if (!modalContainer) return;

  wireCantinaOverlayPassthrough();
  render.renderCantinaGate(modalContainer);

  document.getElementById("btn-cantina-enter")?.addEventListener("click", () => {
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    render.closeCantinaGate(modalContainer);
    checkOAuthEnrichStep();
  });
}

async function finishPactAcceptance(modalContainer) {
  localStorage.setItem("vox-pact-accepted", "true");
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
  if (localStorage.getItem("vox-pact-accepted")) return;
  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderPactModal(modalContainer);
  document.getElementById("btn-pact-accept")?.addEventListener("click", () => {
    void finishPactAcceptance(modalContainer);
  });
  document.getElementById("btn-pact-settings")?.addEventListener("click", () => {
    localStorage.setItem("vox-pact-accepted", "true");
    render.closePactModal(modalContainer);
    void localAccount.getRouteId().then((u) => ensureOnboardingSideEffects(u));
    location.hash = "#/settings/network";
  });
}
