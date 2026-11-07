/**
 * @module bsky-oauth
 * Login do Bluesky via OAuth do AT Protocol, 100% no navegador (cliente público):
 * PAR + PKCE (S256) + DPoP (ES256). Sem app registrado e sem servidor — o client_id é a URL
 * de um JSON de metadados publicado com o site (gerado no deploy) ou, em localhost, o
 * client_id de loopback previsto pela especificação.
 *
 * Fluxo: startBskyLogin() → página do Bluesky → oauth-callback.html → completeBskyLogin().
 * A sessão (tokens + chave DPoP) fica só neste aparelho e permite postar direto.
 */

export const BSKY_ENTRYWAY = "https://bsky.social";
export const BSKY_SCOPE = "atproto transition:generic";
const FLOW_KEY = "vox-bsky-oauth-flow";
const SESSION_KEY = "vox-bsky-oauth-session";
const enc = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

async function sha256b64url(text) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Base pública do app (diretório do index.html), ex.: https://user.github.io/vox/ */
export function appBaseUrl(loc = globalThis.location) {
  const path = loc.pathname.endsWith("/") ? loc.pathname : loc.pathname.replace(/[^/]*$/, "");
  return `${loc.origin}${path}`;
}

function isLoopback(loc) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(loc.hostname);
}

/** client_id e redirect_uri conforme o ambiente (loopback em dev, metadados publicados em produção). */
export function bskyClientConfig(loc = globalThis.location) {
  const base = appBaseUrl(loc);
  if (isLoopback(loc)) {
    const redirectUri = `${base.replace("//localhost", "//127.0.0.1")}oauth-callback.html`;
    const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(BSKY_SCOPE)}`;
    return { clientId, redirectUri };
  }
  return { clientId: `${base}oauth/bsky-client-metadata.json`, redirectUri: `${base}oauth-callback.html` };
}

async function newDpopKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey), publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey) };
}

async function signJwt(header, payload, privateJwk) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

/** Prova DPoP (RFC 9449) para uma requisição. */
export async function dpopProof(keys, htm, htu, { nonce = "", accessToken = "" } = {}) {
  const { kty, crv, x, y } = keys.publicJwk;
  const payload = { jti: randomToken(16), htm, htu: htu.split(/[?#]/)[0], iat: Math.floor(Date.now() / 1000) };
  if (nonce) payload.nonce = nonce;
  if (accessToken) payload.ath = await sha256b64url(accessToken);
  return signJwt({ typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } }, payload, keys.privateJwk);
}

function needsNonceRetry(res, body) {
  const header = res.headers.get("WWW-Authenticate") || "";
  return Boolean(res.headers.get("DPoP-Nonce")) && (body?.error === "use_dpop_nonce" || header.includes("use_dpop_nonce"));
}

/** fetch com DPoP e uma nova tentativa quando o servidor exige nonce. */
export async function dpopFetch(keys, url, init = {}, state = {}) {
  const method = init.method || "GET";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = new Headers(init.headers || {});
    headers.set("DPoP", await dpopProof(keys, method, url, { nonce: state.nonce, accessToken: state.accessToken }));
    if (state.accessToken) headers.set("Authorization", `DPoP ${state.accessToken}`);
    const res = await fetch(url, { ...init, method, headers });
    if (res.headers.get("DPoP-Nonce")) state.nonce = res.headers.get("DPoP-Nonce");
    if (res.ok || attempt > 0) return res;
    const body = await res.clone().json().catch(() => null);
    if (!needsNonceRetry(res, body)) return res;
  }
  throw new Error("dpopFetch: estado inesperado");
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Falha ao consultar ${new URL(url).host} (${r.status})`);
  return r.json();
}

async function authServerMetadata(issuer = BSKY_ENTRYWAY) {
  return getJson(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`);
}

/** DID → { handle, pds } a partir do documento DID (plc.directory ou did:web). */
export async function resolveDid(did) {
  const url = did.startsWith("did:web:") ? `https://${did.slice(8)}/.well-known/did.json` : `https://plc.directory/${did}`;
  const doc = await getJson(url);
  const handle = (doc.alsoKnownAs || []).find((a) => a.startsWith("at://"))?.slice(5) || "";
  const pds = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer")?.serviceEndpoint || "";
  return { did, handle, pds };
}

function readFlow() {
  try { return JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null"); } catch { return null; }
}

/** Inicia o login: PAR no servidor de autorização e redireciona para a tela do Bluesky. */
export async function startBskyLogin({ loginHint = "" } = {}) {
  const meta = await authServerMetadata();
  const { clientId, redirectUri } = bskyClientConfig();
  const keys = await newDpopKey();
  const verifier = randomToken(48);
  const state = randomToken(16);
  const form = new URLSearchParams({
    client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: BSKY_SCOPE, state,
    code_challenge: await sha256b64url(verifier), code_challenge_method: "S256",
  });
  if (loginHint) form.set("login_hint", loginHint);
  const dpop = {};
  const res = await dpopFetch(keys, meta.pushed_authorization_request_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }, dpop);
  const par = await res.json().catch(() => ({}));
  if (!res.ok || !par.request_uri) throw new Error(par.error_description || par.error || "O Bluesky recusou o pedido de login.");
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ provider: "bsky", state, verifier, keys, nonce: dpop.nonce || "", issuer: meta.issuer, tokenEndpoint: meta.token_endpoint, clientId, redirectUri }));
  location.assign(`${meta.authorization_endpoint}?client_id=${encodeURIComponent(clientId)}&request_uri=${encodeURIComponent(par.request_uri)}`);
}

async function assertIssuerForDid(pds, issuer) {
  const pr = await getJson(`${pds.replace(/\/$/, "")}/.well-known/oauth-protected-resource`);
  if (!(pr.authorization_servers || []).includes(issuer)) throw new Error("O servidor de login não corresponde à conta — login recusado.");
}

async function exchangeCode(flow, code) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: flow.redirectUri, client_id: flow.clientId, code_verifier: flow.verifier });
  const dpop = { nonce: flow.nonce };
  const res = await dpopFetch(flow.keys, flow.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, dpop);
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token || !tok.sub) throw new Error(tok.error_description || tok.error || "Falha ao concluir o login no Bluesky.");
  return { tok, nonce: dpop.nonce };
}

/**
 * Conclui o login com os parâmetros do callback (?code&state&iss). Verifica state e emissor,
 * resolve DID → handle/PDS e guarda a sessão. Retorna { handle, did, pds }.
 */
export async function completeBskyLogin({ code, state, iss }) {
  const flow = readFlow();
  sessionStorage.removeItem(FLOW_KEY);
  if (!flow || flow.provider !== "bsky" || flow.state !== state) throw new Error("Login do Bluesky expirou ou não confere. Tente de novo.");
  if (iss && iss !== flow.issuer) throw new Error("Emissor do login não confere.");
  const { tok, nonce } = await exchangeCode(flow, code);
  const who = await resolveDid(tok.sub);
  await assertIssuerForDid(who.pds, flow.issuer);
  const session = {
    did: tok.sub, handle: who.handle, pds: who.pds, keys: flow.keys, nonce, issuer: flow.issuer, clientId: flow.clientId,
    tokenEndpoint: flow.tokenEndpoint, accessToken: tok.access_token, refreshToken: tok.refresh_token || "",
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { handle: who.handle, did: tok.sub, pds: who.pds };
}

export function loadBskySession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

export function clearBskySession() {
  localStorage.removeItem(SESSION_KEY);
}

async function refreshSession(s) {
  if (!s.refreshToken) throw new Error("Sessão do Bluesky expirada — conecte de novo.");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: s.refreshToken, client_id: s.clientId });
  const dpop = { nonce: s.nonce };
  const res = await dpopFetch(s.keys, s.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, dpop);
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) throw new Error("Sessão do Bluesky expirada — conecte de novo.");
  const next = { ...s, nonce: dpop.nonce, accessToken: tok.access_token, refreshToken: tok.refresh_token || s.refreshToken, expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

/** Publica um post no Bluesky com a sessão OAuth (DPoP). */
export async function postWithBskySession(text) {
  let s = loadBskySession();
  if (!s) return { ok: false, error: "Bluesky não conectado por login." };
  if (Date.now() > s.expiresAt - 60_000) s = await refreshSession(s);
  const url = `${s.pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`;
  const record = { $type: "app.bsky.feed.post", text: String(text).slice(0, 300), createdAt: new Date().toISOString() };
  const state = { nonce: s.nonce, accessToken: s.accessToken };
  const res = await dpopFetch(s.keys, url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record }) }, state);
  if (state.nonce !== s.nonce) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, nonce: state.nonce }));
  return res.ok ? { ok: true } : { ok: false, error: `Bluesky respondeu ${res.status}` };
}
