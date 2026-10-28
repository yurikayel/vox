/** OAuth client-only — enriquece perfil local (V-DIS-08/10) com Google, Meta ou GitHub. */

import * as localAccount from "./local-account.js";

let configCache = null;

export async function loadOAuthConfig() {
  if (configCache) return configCache;
  try {
    const res = await fetch("./config/oauth.json");
    if (res.ok) return (configCache = await res.json());
  } catch {}
  try {
    const res = await fetch("./config/oauth.example.json");
    if (res.ok) return (configCache = await res.json());
  } catch {}
  configCache = { googleClientId: "", facebookAppId: "", githubClientId: "", enabledProviders: [] };
  return configCache;
}

export function __resetOAuthConfigForTests() {
  configCache = null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed ${src}`));
    document.head.appendChild(s);
  });
}

function applyGoogleCredential(credential, resolve) {
  try {
    const payload = JSON.parse(atob(credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const name = payload.name || payload.given_name || "";
    const picture = payload.picture || "";
    localAccount.setProfileEnrichment({ displayName: name, avatarUrl: picture, bio: "", oauthProvider: "google" });
    resolve({ ok: true, profile: { displayName: name, avatarUrl: picture } });
  } catch (e) {
    resolve({ ok: false, reason: e.message });
  }
}

export async function signInWithGoogle() {
  const cfg = await loadOAuthConfig();
  const clientId = cfg?.googleClientId || "";
  if (!clientId || clientId.includes("YOUR_")) {
    return {
      ok: false,
      reason: "Google não configurado. Copie client/config/oauth.example.json para oauth.json e preencha o Client ID.",
    };
  }
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve) => {
    if (!window.google?.accounts?.id) return resolve({ ok: false, reason: "GIS indisponível" });
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => applyGoogleCredential(resp.credential, resolve),
    });
    window.google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed() || n.isSkippedMoment()) {
        resolve({ ok: false, reason: "Prompt Google não exibido — use Pular ou configure origem OAuth" });
      }
    });
  });
}

function fetchMetaProfile(resolve) {
  window.FB.api("/me", { fields: "name,picture" }, (profile) => {
    if (!profile?.name) return resolve({ ok: false, reason: "Perfil Meta vazio" });
    const picture = profile.picture?.data?.url || "";
    localAccount.setProfileEnrichment({ displayName: profile.name, avatarUrl: picture, bio: "", oauthProvider: "facebook" });
    resolve({ ok: true, profile: { displayName: profile.name, avatarUrl: picture } });
  });
}

export async function signInWithMeta() {
  const cfg = await loadOAuthConfig();
  const appId = cfg?.facebookAppId || "";
  if (!appId || appId.includes("YOUR_")) {
    return {
      ok: false,
      reason: "Meta não configurado. Copie client/config/oauth.example.json para oauth.json e preencha o App ID.",
    };
  }
  await loadScript("https://connect.facebook.net/pt_BR/sdk.js");
  return new Promise((resolve) => {
    if (!window.FB) return resolve({ ok: false, reason: "SDK Meta indisponível" });
    window.FB.init({ appId, cookie: false, xfbml: false, version: "v19.0" });
    window.FB.login(
      (response) => {
        if (!response.authResponse) return resolve({ ok: false, reason: "Login Meta cancelado" });
        fetchMetaProfile(resolve);
      },
      { scope: "public_profile" },
    );
  });
}

function resolveGithubHandleInput(handle) {
  const clean = String(handle || "").trim().replace(/^@/, "");
  if (clean) return clean;
  if (typeof window !== "undefined" && window.prompt) {
    return String(window.prompt("Digite seu usuário ou @handle do GitHub:") || "").trim().replace(/^@/, "");
  }
  return "";
}

export async function signInWithGithub(handle = "") {
  const cleanHandle = resolveGithubHandleInput(handle);
  if (!cleanHandle) return { ok: false, reason: "Usuário GitHub não informado." };

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanHandle)}`);
    if (!res.ok) return { ok: false, reason: `Perfil GitHub @${cleanHandle} não encontrado.` };
    const data = await res.json();
    const name = data.name || data.login || cleanHandle;
    const avatar = data.avatar_url || "";
    const bio = data.bio || "";
    localAccount.setProfileEnrichment({ displayName: name, avatarUrl: avatar, bio, oauthProvider: "github" });
    if (typeof localStorage !== "undefined") localStorage.setItem("vox-profile-github", cleanHandle);
    return { ok: true, profile: { displayName: name, avatarUrl: avatar, bio, handle: cleanHandle } };
  } catch (e) {
    return { ok: false, reason: e.message || "Falha na conexão com GitHub" };
  }
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
