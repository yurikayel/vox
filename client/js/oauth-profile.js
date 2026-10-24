/** OAuth client-only — enriquece perfil local (V-DIS-08/10). */

import * as localAccount from "./local-account.js";

let configCache = null;

export async function loadOAuthConfig() {
  if (configCache) return configCache;
  try {
    const res = await fetch("./config/oauth.json");
    if (res.ok) {
      configCache = await res.json();
      return configCache;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const res = await fetch("./config/oauth.example.json");
    if (res.ok) {
      configCache = await res.json();
      return configCache;
    }
  } catch {
    /* ignore */
  }
  configCache = { googleClientId: "", facebookAppId: "", enabledProviders: [] };
  return configCache;
}

export function __resetOAuthConfigForTests() {
  configCache = null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed ${src}`));
    document.head.appendChild(s);
  });
}

export async function signInWithGoogle() {
  const cfg = await loadOAuthConfig();
  const clientId = cfg?.googleClientId || "";
  if (!clientId || clientId.includes("YOUR_")) {
    return {
      ok: false,
      reason:
        "Google não configurado. Copie client/config/oauth.example.json para oauth.json e preencha o Client ID.",
    };
  }
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve) => {
    if (!window.google?.accounts?.id) {
      resolve({ ok: false, reason: "GIS indisponível" });
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => {
        try {
          const payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          const name = payload.name || payload.given_name || "";
          const picture = payload.picture || "";
          localAccount.setProfileEnrichment({
            displayName: name,
            avatarUrl: picture,
            bio: "",
            oauthProvider: "google",
          });
          resolve({ ok: true, profile: { displayName: name, avatarUrl: picture } });
        } catch (e) {
          resolve({ ok: false, reason: e.message });
        }
      },
    });
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        resolve({ ok: false, reason: "Prompt Google não exibido — use Pular ou configure origem OAuth" });
      }
    });
  });
}

export async function signInWithMeta() {
  const cfg = await loadOAuthConfig();
  const appId = cfg?.facebookAppId || "";
  if (!appId || appId.includes("YOUR_")) {
    return {
      ok: false,
      reason:
        "Meta não configurado. Copie client/config/oauth.example.json para oauth.json e preencha o App ID.",
    };
  }
  await loadScript("https://connect.facebook.net/pt_BR/sdk.js");
  return new Promise((resolve) => {
    if (!window.FB) {
      resolve({ ok: false, reason: "SDK Meta indisponível" });
      return;
    }
    window.FB.init({ appId, cookie: false, xfbml: false, version: "v19.0" });
    window.FB.login(
      (response) => {
        if (!response.authResponse) {
          resolve({ ok: false, reason: "Login Meta cancelado" });
          return;
        }
        window.FB.api("/me", { fields: "name,picture" }, (profile) => {
          if (!profile?.name) {
            resolve({ ok: false, reason: "Perfil Meta vazio" });
            return;
          }
          const picture = profile.picture?.data?.url || "";
          localAccount.setProfileEnrichment({
            displayName: profile.name,
            avatarUrl: picture,
            bio: "",
            oauthProvider: "facebook",
          });
          resolve({ ok: true, profile: { displayName: profile.name, avatarUrl: picture } });
        });
      },
      { scope: "public_profile" },
    );
  });
}

export function skipOAuthEnrichment() {
  localStorage.setItem("vox-oauth-skipped", "1");
}

export function hasSkippedOAuth() {
  return localStorage.getItem("vox-oauth-skipped") === "1";
}

export function hasCompletedOAuthStep() {
  return hasSkippedOAuth() || Boolean(localAccount.getProfileEnrichment()?.oauthProvider);
}
