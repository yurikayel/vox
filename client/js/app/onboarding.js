/** @file Cantina gate, OAuth enrich, pact modals. */

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
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
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

export async function runOAuthEnrichSignIn(btn, signInFn, { successToast, fallbackError }) {
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

  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderOAuthEnrich(modalContainer);

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
        "Login social ainda não configurado pelo operador — use Pular ou preencha client/config/oauth.json (ver DEV.md).",
      );
    }
  });

  document.getElementById("btn-oauth-skip")?.addEventListener("click", () => {
    setOAuthEnrichError("");
    oauthProfile.skipOAuthEnrichment();
    render.closeOAuthEnrich(modalContainer);
    checkPactModal();
  });

  document.getElementById("btn-oauth-google")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-oauth-google");
    const res = await runOAuthEnrichSignIn(btn, () => oauthProfile.signInWithGoogle(), {
      fallbackError: "Google indisponível",
    });
    if (res.ok) {
      oauthProfile.skipOAuthEnrichment();
      render.closeOAuthEnrich(modalContainer);
      share.showToast("Perfil enriquecido com Google.");
      void meshProfile.syncMeshProfileCard();
      checkPactModal();
    }
  });

  document.getElementById("btn-oauth-meta")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-oauth-meta");
    const res = await runOAuthEnrichSignIn(btn, () => oauthProfile.signInWithMeta(), {
      fallbackError: "Meta indisponível",
    });
    if (res.ok) {
      oauthProfile.skipOAuthEnrichment();
      render.closeOAuthEnrich(modalContainer);
      share.showToast("Perfil enriquecido com Meta.");
      void meshProfile.syncMeshProfileCard();
      checkPactModal();
    }
  });

  document.getElementById("btn-oauth-github")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-oauth-github");
    const res = await runOAuthEnrichSignIn(btn, () => oauthProfile.signInWithGithub(), {
      fallbackError: "GitHub indisponível",
    });
    if (res.ok) {
      oauthProfile.skipOAuthEnrichment();
      render.closeOAuthEnrich(modalContainer);
      share.showToast(`Perfil enriquecido com GitHub (@${res.profile?.handle || ""}).`);
      void meshProfile.syncMeshProfileCard();
      checkPactModal();
    }
  });
}

export function checkCantinaGate() {
  const modalContainer = document.getElementById("modal-container");
  const route = parseRoute();

  if (!shouldShowCantinaGate(route.name)) {
    if (modalContainer && route.name === "ajuda-teste") {
      render.closeCantinaGate(modalContainer);
    }
    if (hasPassedCantinaGate()) {
      checkOAuthEnrichStep();
    }
    return;
  }

  if (!modalContainer) return;

  wireCantinaOverlayPassthrough();
  render.renderCantinaGate(modalContainer);

  const btnEnter = document.getElementById("btn-cantina-enter");
  if (btnEnter) {
    btnEnter.addEventListener("click", () => {
      localStorage.setItem(CANTINA_STORAGE_KEY, "true");
      render.closeCantinaGate(modalContainer);
      checkOAuthEnrichStep();
    });
  }
}

export function checkPactModal() {
  const accepted = localStorage.getItem("vox-pact-accepted");
  if (accepted) return;

  const modalContainer = document.getElementById("modal-container");
  if (!modalContainer) return;

  render.renderPactModal(modalContainer);

  const finishPact = async () => {
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
  };

  const btnAccept = document.getElementById("btn-pact-accept");
  if (btnAccept) {
    btnAccept.addEventListener("click", () => {
      void finishPact();
    });
  }

  const btnSettings = document.getElementById("btn-pact-settings");
  if (btnSettings) {
    btnSettings.addEventListener("click", () => {
      localStorage.setItem("vox-pact-accepted", "true");
      render.closePactModal(modalContainer);
      void localAccount.getRouteId().then((u) => ensureOnboardingSideEffects(u));
      location.hash = "#/settings/network";
    });
  }
}
