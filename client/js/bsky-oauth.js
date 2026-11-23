/**
 * @file Login OAuth/OIDC no Bluesky (AT Protocol) com DPoP e sessão local.
 *
 * @module bsky-oauth
 * Login do Bluesky via OAuth do AT Protocol, 100% no navegador (cliente público):
 * PAR + PKCE (S256) + DPoP (ES256). Sem app registrado e sem servidor — o client_id é a URL
 * de um JSON de metadados publicado com o site (gerado no deploy) ou, em localhost, o
 * client_id de loopback previsto pela especificação.
 *
 * Fluxo: startBskyLogin() → página do Bluesky → oauth-callback.html → completeBskyLogin().
 * A sessão (tokens + chave DPoP) fica só neste aparelho e permite postar direto.*/

import { isSealed, openSealed, sealJsonStrict } from "./identity/keys.js";

/** URL ou endpoint público. @type {string} */
export const BSKY_ENTRYWAY = "https://bsky.social";
/** Export `BSKY_SCOPE` do módulo. @type {string} */
export const BSKY_SCOPE = "atproto transition:generic";
const FLOW_KEY = "vox-bsky-oauth-flow";
const SOCIAL_FLOW_KEY = "vox-social-oauth-flow";
const SESSION_KEY = "vox-bsky-oauth-session";
const enc = new TextEncoder();

/** Operação `b64url` do módulo.
 * @param {*} [bytes] Bytes do data item.
 * @returns {*} Resultado da operação.
 */
export function b64url(bytes) {
  let s = "";
  new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Gera um token aleatório em base64url.
 * @param {number} [n=32] Quantidade de bytes aleatórios
 * @returns {string} Token.
 */
function randomToken(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

/**
 * Calcula o SHA-256 de um texto em base64url.
 * @param {string} text Texto
 * @returns {Promise<string>} Resumo em base64url.
 */
async function sha256b64url(text) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Base pública do app (diretório do index.html), ex.: https://user.github.io/vox/ 
 * @param {*} [loc] Objeto `location` ou equivalente.
 * @returns {*} Resultado da operação.*/
export function appBaseUrl(loc = globalThis.location) {
  const path = loc.pathname.endsWith("/") ? loc.pathname : loc.pathname.replace(/[^/]*$/, "");
  return `${loc.origin}${path}`;
}

/**
 * Diz se o endereço é de loopback (desenvolvimento local).
 * @param {Location} loc Localização
 * @returns {boolean} `true` se for loopback.
 */
function isLoopback(loc) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(loc.hostname);
}

/** client_id e redirect_uri conforme o ambiente (loopback em dev, metadados publicados em produção). 
 * @param {*} [loc] Objeto `location` ou equivalente.
 * @returns {*} Resultado da operação.*/
export function bskyClientConfig(loc = globalThis.location) {
  const base = appBaseUrl(loc);
  if (isLoopback(loc)) {
    const redirectUri = `${base.replace("//localhost", "//127.0.0.1")}oauth-callback.html`;
    const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(BSKY_SCOPE)}`;
    return { clientId, redirectUri };
  }
  return { clientId: `${base}oauth/bsky-client-metadata.json`, redirectUri: `${base}oauth-callback.html` };
}

/**
 * Gera o par de chaves ECDSA P-256 do DPoP.
 * @returns {Promise<{privateJwk: object, publicJwk: object}>} Par em JWK.
 */
async function newDpopKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey), publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey) };
}

/**
 * Assina um JWT com ECDSA P-256.
 * @param {object} header Cabeçalho
 * @param {object} payload Corpo
 * @param {object} privateJwk Chave privada em JWK
 * @returns {Promise<string>} JWT assinado.
 */
async function signJwt(header, payload, privateJwk) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${b64url(sig)}`;
}

/** Prova DPoP (RFC 9449) para uma requisição. 
 * @param {*} [keys] Par de chaves DPoP.
 * @param {*} [htm] Método HTTP do DPoP.
 * @param {*} [htu] URL do recurso no DPoP.
 * @param {object} [dpopExtras] Nonce e token de acesso opcionais do DPoP.
 * @returns {*} Resultado da operação.*/
export async function dpopProof(keys, htm, htu, { nonce = "", accessToken = "" } = {}) {
  const { kty, crv, x, y } = keys.publicJwk;
  const payload = { jti: randomToken(16), htm, htu: htu.split(/[?#]/)[0], iat: Math.floor(Date.now() / 1000) };
  if (nonce) payload.nonce = nonce;
  if (accessToken) payload.ath = await sha256b64url(accessToken);
  return signJwt({ typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } }, payload, keys.privateJwk);
}

/**
 * Diz se a resposta pede nova tentativa com o nonce do DPoP.
 * @param {Response} res Resposta HTTP
 * @param {object} body Corpo já lido
 * @returns {boolean} `true` se deve repetir.
 */
function needsNonceRetry(res, body) {
  const header = res.headers.get("WWW-Authenticate") || "";
  return Boolean(res.headers.get("DPoP-Nonce")) && (body?.error === "use_dpop_nonce" || header.includes("use_dpop_nonce"));
}

/** fetch com DPoP e uma nova tentativa quando o servidor exige nonce. 
 * @param {*} [keys] Par de chaves DPoP.
 * @param {*} [url] URL de destino.
 * @param {*} [init] Opções do `fetch`.
 * @param {*} [state] Estado OAuth persistido.
 * @returns {*} Resultado da operação.*/
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

/**
 * Busca um JSON por GET; falha se a resposta não for 2xx.
 * @param {string} url Endereço
 * @returns {Promise<object>} JSON recebido.
 */
async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Falha ao consultar ${new URL(url).host} (${r.status})`);
  return r.json();
}

/**
 * Busca os metadados do servidor de autorização.
 * @param {string} [issuer=BSKY_ENTRYWAY] Emissor
 * @returns {Promise<object>} Metadados.
 */
async function authServerMetadata(issuer = BSKY_ENTRYWAY) {
  return getJson(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`);
}

/** DID → { handle, pds } a partir do documento DID (plc.directory ou did:web). 
 * @param {*} [did] DID do usuário Bluesky.
 * @returns {*} Resultado da operação.*/
export async function resolveDid(did) {
  const url = did.startsWith("did:web:") ? `https://${did.slice(8)}/.well-known/did.json` : `https://plc.directory/${did}`;
  const doc = await getJson(url);
  const handle = (doc.alsoKnownAs || []).find((a) => a.startsWith("at://"))?.slice(5) || "";
  const pds = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer")?.serviceEndpoint || "";
  return { did, handle, pds };
}

/**
 * Lê o fluxo de login em andamento da sessão do navegador.
 * @returns {object|null} Fluxo salvo ou `null`.
 */
function readFlow() {
  try { return JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null"); } catch { return null; }
}

/** Inicia o login: PAR no servidor de autorização e redireciona para a tela do Bluesky. 
 * @param {object} [options] Opções do fluxo (ex.: `loginHint`).*/
export async function startBskyLogin({ loginHint = "" } = {}) {
  sessionStorage.removeItem(SOCIAL_FLOW_KEY);
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
  const issRequired = meta.authorization_response_iss_parameter_supported === true;
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ provider: "bsky", state, verifier, keys, nonce: dpop.nonce || "", issuer: meta.issuer, issRequired, tokenEndpoint: meta.token_endpoint, clientId, redirectUri }));
  location.assign(`${meta.authorization_endpoint}?client_id=${encodeURIComponent(clientId)}&request_uri=${encodeURIComponent(par.request_uri)}`);
}

/**
 * Confere se o servidor de autorização é o declarado pelo PDS da conta.
 * @param {string} pds Endereço do PDS
 * @param {string} issuer Emissor esperado
 * @returns {Promise<void>} Conclui se confere; lança erro se não.
 */
async function assertIssuerForDid(pds, issuer) {
  const pr = await getJson(`${pds.replace(/\/$/, "")}/.well-known/oauth-protected-resource`);
  if (!(pr.authorization_servers || []).includes(issuer)) throw new Error("O servidor de login não corresponde à conta — login recusado.");
}

/**
 * Troca o código de autorização por tokens.
 * @param {object} flow Fluxo de login
 * @param {string} code Código recebido
 * @returns {Promise<object>} Resposta de tokens.
 */
async function exchangeCode(flow, code) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: flow.redirectUri, client_id: flow.clientId, code_verifier: flow.verifier });
  const dpop = { nonce: flow.nonce };
  const res = await dpopFetch(flow.keys, flow.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, dpop);
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token || !tok.sub) throw new Error(tok.error_description || tok.error || "Falha ao concluir o login no Bluesky.");
  return { tok, nonce: dpop.nonce };
}

/**
 * Conclui o login com os parâmetros do callback (?code&state&iss). Verifica state e emissor (RFC 9207: se o servidor
 * anuncia `authorization_response_iss_parameter_supported`, callback sem `iss` é recusado),
 * resolve DID → handle/PDS e guarda a sessão. Retorna { handle, did, pds }.
 
 * @param {object} [callback] Parâmetros do callback OAuth (`code`, `state`, `iss`).
 * @returns {*} Resultado da operação.*/
export async function completeBskyLogin({ code, state, iss }) {
  const flow = readFlow();
  sessionStorage.removeItem(FLOW_KEY);
  if (!flow || flow.provider !== "bsky" || flow.state !== state) throw new Error("Login do Bluesky expirou ou não confere. Tente de novo.");
  if ((iss || flow.issRequired) && iss !== flow.issuer) throw new Error("Emissor do login não confere.");
  const { tok, nonce } = await exchangeCode(flow, code);
  const who = await resolveDid(tok.sub);
  await assertIssuerForDid(who.pds, flow.issuer);
  const session = {
    did: tok.sub, handle: who.handle, pds: who.pds, keys: flow.keys, nonce, issuer: flow.issuer, clientId: flow.clientId,
    tokenEndpoint: flow.tokenEndpoint, accessToken: tok.access_token, refreshToken: tok.refresh_token || "",
    expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
  };
  await saveBskySession(session);
  return { handle: who.handle, did: tok.sub, pds: who.pds };
}

let memorySecrets = null;

const B64 = /^[A-Za-z0-9+/_=-]+$/;

/** Reconstrói o envelope cifrado só com campos base64 validados; qualquer outra coisa é recusada. */
function sealedEnvelope(env) {
  if (!isSealed(env) || !B64.test(env.iv) || !B64.test(env.ct)) throw new Error("Envelope cifrado inválido.");
  return { sealed: env.sealed, iv: env.iv, ct: env.ct };
}

/** Metadados públicos da sessão, lidos um a um (nenhum segredo nem campo desconhecido atravessa). */
function pickSessionMeta(src) {
  return {
    did: src.did, handle: src.handle, pds: src.pds, issuer: src.issuer, clientId: src.clientId,
    tokenEndpoint: src.tokenEndpoint, expiresAt: src.expiresAt,
  };
}

/** Sessão aberta: metadados da sessão guardada + segredos, montada campo a campo (sem espalhar um objeto no outro). */
function buildOpenSession(meta, secrets) {
  return {
    ...pickSessionMeta(meta),
    keys: secrets.keys, nonce: secrets.nonce, accessToken: secrets.accessToken, refreshToken: secrets.refreshToken,
  };
}

/**
 * Salva a sessão do Bluesky. Os segredos (chave DPoP, nonce, tokens) só vão ao armazenamento cifrados com a chave do
 * aparelho; sem ela ficam apenas em memória nesta sessão e o armazenamento recebe só metadados.
 * @param {object} session Objeto da sessão com metadados e segredos (keys, nonce, accessToken, refreshToken).
 * @returns {Promise<object>} Registro salvo no localStorage.
 */
export async function saveBskySession(session) {
  if (!session || typeof session !== "object") throw new Error("Sessão inválida.");
  if (!session.keys && !session.accessToken && !session.refreshToken && session.sealed) {
    const kept = { ...pickSessionMeta(session), sealed: sealedEnvelope(session.sealed) };
    localStorage.setItem(SESSION_KEY, JSON.stringify(kept));
    return kept;
  }
  const secrets = {
    keys: session.keys,
    nonce: session.nonce || "",
    accessToken: session.accessToken || "",
    refreshToken: session.refreshToken || "",
  };
  const meta = pickSessionMeta(session);
  let toStore;
  try {
    toStore = { ...meta, sealed: sealedEnvelope(await sealJsonStrict(secrets)) };
    memorySecrets = null;
  } catch {
    memorySecrets = { did: session.did, ...secrets };
    toStore = { ...meta, secretsInMemoryOnly: true };
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(toStore));
  return toStore;
}

/** Carrega BskySession do armazenamento ou rede.
 * @returns {*} Resultado da operação.
 */
export function loadBskySession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

/**
 * Abre a sessão do Bluesky guardada neste aparelho, decifrando segredos selados.
 * Retorna a sessão legada em claro se não estiver selada, ou null se não houver sessão.
 * @returns {Promise<object|null>} Sessão aberta com segredos e metadados, ou null.
 */
export async function openBskySession() {
  const session = loadBskySession();
  if (!session) return null;
  if (session.secretsInMemoryOnly) return memorySecrets?.did === session.did ? buildOpenSession(session, memorySecrets) : null;
  if (!session.sealed) return session;
  return buildOpenSession(session, await openSealed(session.sealed));
}

/** Limpa BskySession armazenados.
 */
export function clearBskySession() {
  memorySecrets = null;
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Renova a sessão do Bluesky com o token de renovação.
 * @param {object} s Sessão atual
 * @returns {Promise<object>} Sessão renovada.
 */
async function refreshSession(s) {
  if (!s.refreshToken) throw new Error("Sessão do Bluesky expirada — conecte de novo.");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: s.refreshToken, client_id: s.clientId });
  const dpop = { nonce: s.nonce };
  const res = await dpopFetch(s.keys, s.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, dpop);
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) throw new Error("Sessão do Bluesky expirada — conecte de novo.");
  const next = buildOpenSession({ ...pickSessionMeta(s), expiresAt: Date.now() + (Number(tok.expires_in) || 3600) * 1000 }, {
    keys: s.keys, nonce: dpop.nonce, accessToken: tok.access_token, refreshToken: tok.refresh_token || s.refreshToken,
  });
  await saveBskySession(next);
  return next;
}

/** Publica um post no Bluesky com a sessão OAuth (DPoP). 
 * @param {*} [text] Texto de entrada.
 * @returns {*} Resultado da operação.*/
export async function postWithBskySession(text) {
  let s = await openBskySession();
  if (!s) return { ok: false, error: "Bluesky não conectado por login." };
  if (Date.now() > s.expiresAt - 60_000) s = await refreshSession(s);
  const url = `${s.pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`;
  const record = { $type: "app.bsky.feed.post", text: String(text).slice(0, 300), createdAt: new Date().toISOString() };
  const state = { nonce: s.nonce, accessToken: s.accessToken };
  const res = await dpopFetch(s.keys, url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record }) }, state);
  if (state.nonce !== s.nonce) {
    s.nonce = state.nonce;
    await saveBskySession(s);
  }
  return res.ok ? { ok: true } : { ok: false, error: `Bluesky respondeu ${res.status}` };
}
