/**
 * @module social-login
 * "Conectar com login" por rede — o usuário não digita @usuário:
 *  - Bluesky: OAuth do AT Protocol direto no navegador (bsky-oauth.js), sem cadastro.
 *  - Facebook: SDK já configurado (facebookAppId); a Meta não fornece @usuário público.
 *  - X, Threads, GitHub, TikTok, Instagram (profissional): OAuth 2.0 + PKCE; o relay troca o
 *    código pelo @usuário usando o segredo do app e DESCARTA o token (só identidade).
 * Cada provedor só aparece quando o operador configurou o app (config/oauth.json).
 */
import { loadOAuthConfig } from "./oauth-profile.js";
import { appBaseUrl, b64url, startBskyLogin, completeBskyLogin } from "./bsky-oauth.js";

const FLOW_KEY = "vox-social-oauth-flow";
export const CALLBACK_KEY = "vox-oauth-callback";

/** Provedores OAuth 2.0 + PKCE (troca de código no relay). */
export const OAUTH_PROVIDERS = Object.freeze({
  twitter: { configKey: "xClientId", label: "X", authorize: "https://x.com/i/oauth2/authorize", scope: "users.read tweet.read", idParam: "client_id" },
  github: { configKey: "githubClientId", label: "GitHub", authorize: "https://github.com/login/oauth/authorize", scope: "read:user", idParam: "client_id" },
  threads: { configKey: "threadsAppId", label: "Threads", authorize: "https://threads.net/oauth/authorize", scope: "threads_basic", idParam: "client_id" },
  tiktok: { configKey: "tiktokClientKey", label: "TikTok", authorize: "https://www.tiktok.com/v2/auth/authorize/", scope: "user.info.basic", idParam: "client_key" },
  instagram: { configKey: "instagramAppId", label: "Instagram", authorize: "https://www.instagram.com/oauth/authorize", scope: "instagram_business_basic", idParam: "client_id", note: "Só contas profissionais (Comercial ou Criador)." },
});

function configured(v) {
  return Boolean(v) && !String(v).includes("YOUR_");
}

/** Quais redes têm "Conectar com login" disponível neste deploy. */
export async function availableLoginProviders() {
  const cfg = await loadOAuthConfig();
  const out = { bsky: true, facebook: configured(cfg.facebookAppId) };
  const relayOk = configured(cfg.oauthRelayUrl);
  for (const [id, p] of Object.entries(OAUTH_PROVIDERS)) out[id] = relayOk && configured(cfg[p.configKey]);
  return out;
}

export function oauthRedirectUri() {
  return `${appBaseUrl()}oauth-callback.html`;
}

async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

/** URL de autorização (pura, testável). */
export function buildAuthorizeUrl(provider, { clientId, redirectUri, state, challenge }) {
  const p = OAUTH_PROVIDERS[provider];
  const q = new URLSearchParams({ [p.idParam]: clientId, response_type: "code", redirect_uri: redirectUri, scope: p.scope, state, code_challenge: challenge, code_challenge_method: "S256" });
  return `${p.authorize}?${q}`;
}

async function startPkceLogin(provider) {
  const cfg = await loadOAuthConfig();
  const p = OAUTH_PROVIDERS[provider];
  const clientId = cfg[p.configKey];
  if (!configured(clientId) || !configured(cfg.oauthRelayUrl)) throw new Error(`Login do ${p.label} não configurado neste Vox.`);
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = oauthRedirectUri();
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ provider, state, verifier, redirectUri }));
  location.assign(buildAuthorizeUrl(provider, { clientId, redirectUri, state, challenge }));
}

/** Facebook: login pelo SDK; retorna identidade (sem @usuário público). */
async function connectFacebook() {
  const cfg = await loadOAuthConfig();
  if (!configured(cfg.facebookAppId)) throw new Error("Login do Facebook não configurado neste Vox.");
  const { signInWithMetaIdentity } = await import("./oauth-profile.js");
  return signInWithMetaIdentity();
}

/**
 * Inicia o login da rede. Bluesky/X/GitHub/Threads/TikTok/Instagram saem da página e voltam
 * pelo callback; Facebook resolve aqui mesmo com { handle:"", name, id }.
 */
export async function startSocialLogin(netId) {
  if (netId === "bsky" && location.hostname === "localhost") {
    // Loopback do AT Protocol volta para 127.0.0.1: começa lá para o sessionStorage ser o mesmo.
    location.assign(location.href.replace("//localhost", "//127.0.0.1"));
    throw new Error("Abrimos o Vox em 127.0.0.1 (exigência do login local do Bluesky). Toque em Conectar de novo.");
  }
  if (netId === "bsky") return startBskyLogin();
  if (netId === "facebook") return connectFacebook();
  if (OAUTH_PROVIDERS[netId]) return startPkceLogin(netId);
  throw new Error("Rede sem login disponível.");
}

async function exchangeViaRelay(flow, code) {
  const cfg = await loadOAuthConfig();
  const res = await fetch(`${String(cfg.oauthRelayUrl).replace(/\/$/, "")}/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: flow.provider, code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.handle) throw new Error(data.error || "Não foi possível concluir o login.");
  return { netId: flow.provider, handle: data.handle, id: data.id || "", name: data.name || "", avatar: data.avatar || "" };
}

/** Lê e consome o callback guardado por oauth-callback.html. */
export function takePendingCallback() {
  try {
    const raw = sessionStorage.getItem(CALLBACK_KEY);
    sessionStorage.removeItem(CALLBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Conclui um login que voltou pelo callback → { netId, handle, did?, id?, name? }. */
export async function completeSocialLogin(cb) {
  if (cb.error) {
    sessionStorage.removeItem("vox-bsky-oauth-flow");
    sessionStorage.removeItem(FLOW_KEY);
    throw new Error(cb.error === "access_denied" ? "Login cancelado." : `A rede recusou o login (${cb.error}).`);
  }
  if (sessionStorage.getItem("vox-bsky-oauth-flow")) {
    const r = await completeBskyLogin(cb);
    return { netId: "bsky", handle: r.handle, did: r.did };
  }
  let flow = null;
  try { flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null"); } catch {}
  sessionStorage.removeItem(FLOW_KEY);
  if (!flow || flow.state !== cb.state) throw new Error("Login expirou ou não confere. Tente de novo.");
  return exchangeViaRelay(flow, cb.code);
}
