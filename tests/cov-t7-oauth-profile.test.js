/**
 * @file Cobertura T7 de `oauth-profile.js`: carga de config, Google Identity Services, SDK do Facebook e GitHub,
 * com `document`/`window.google`/`window.FB` falsos e `fetch` sem rede.
 */
import "./setup.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as oauth from "../client/js/oauth-profile.js";
import * as localAccount from "../client/js/identity/local-account.js";

const realFetch = globalThis.fetch;
const realDocument = globalThis.document;
const realPrompt = globalThis.prompt;
let scripts;

/**
 * Cria `document` falso que "carrega" scripts: dispara `onload` (ou `onerror`) ao anexar.
 * @param {{ fail?: boolean, existing?: string }} [opts] `fail` faz o script falhar; `existing` simula `<script>` já presente.
 * @returns {void}
 */
function installDocument({ fail = false, existing = "" } = {}) {
  scripts = [];
  globalThis.document = {
    querySelector: (sel) => (existing && sel.includes(existing) ? {} : null),
    createElement: () => ({}),
    head: {
      appendChild(s) {
        scripts.push(s.src);
        queueMicrotask(() => (fail ? s.onerror() : s.onload()));
      },
    },
  };
}

/**
 * Instala `fetch` que serve as configs pedidas e devolve 404 no resto.
 * @param {Record<string, object|null>} routes Mapa URL → corpo JSON (`null` = erro HTTP).
 * @returns {void}
 */
function installFetch(routes) {
  globalThis.fetch = async (url) => {
    const body = routes[String(url)];
    if (body === undefined) throw new Error(`rota não prevista: ${url}`);
    if (body === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
}

beforeEach(() => {
  localStorage.clear();
  oauth.__resetOAuthConfigForTests();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.document = realDocument;
  globalThis.prompt = realPrompt;
  delete globalThis.google;
  delete globalThis.FB;
});

test("loadOAuthConfig - usa oauth.json, guarda em cache e cai no exemplo e no padrão", async () => {
  installFetch({ "./config/oauth.json": { googleClientId: "g1" } });
  assert.equal((await oauth.loadOAuthConfig()).googleClientId, "g1");
  globalThis.fetch = async () => { throw new Error("não deve buscar de novo"); };
  assert.equal((await oauth.loadOAuthConfig()).googleClientId, "g1");
  oauth.__resetOAuthConfigForTests();
  installFetch({ "./config/oauth.json": null, "./config/oauth.example.json": { githubClientId: "ex" } });
  assert.equal((await oauth.loadOAuthConfig()).githubClientId, "ex");
  oauth.__resetOAuthConfigForTests();
  installFetch({});
  assert.deepEqual(await oauth.loadOAuthConfig(), { googleClientId: "", facebookAppId: "", githubClientId: "", enabledProviders: [] });
});

test("applyGoogleCredential - credencial ilegível vira perfil sem sub; falha ao responder vira ok=false", async () => {
  installFetch({});
  const seen = [];
  await oauth.applyGoogleCredential("sem-pontos", (r) => seen.push(r));
  assert.equal(seen[0].ok, true);
  assert.equal(seen[0].restored, false);
  assert.equal(seen[0].profile.routeId, undefined);
  const failing = [];
  await oauth.applyGoogleCredential("x.y.z", (r) => {
    if (r.ok) throw new Error("falha ao entregar");
    failing.push(r);
  });
  assert.deepEqual(failing, [{ ok: false, reason: "falha ao entregar" }]);
});

test("signInWithGoogle - sem Client ID configurado explica como configurar", async () => {
  installFetch({ "./config/oauth.json": { googleClientId: "YOUR_CLIENT_ID" } });
  const r = await oauth.signInWithGoogle();
  assert.equal(r.ok, false);
  assert.match(r.reason, /oauth\.example\.json/);
});

test("signInWithGoogle - carrega o GIS uma vez e entrega a credencial ao callback", async () => {
  installFetch({ "./config/oauth.json": { googleClientId: "id-g.apps" } });
  installDocument();
  let init;
  globalThis.google = { accounts: { id: { initialize: (o) => { init = o; }, prompt: () => {} } } };
  const pending = oauth.signInWithGoogle();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(scripts, ["https://accounts.google.com/gsi/client"]);
  assert.equal(init.client_id, "id-g.apps");
  const payload = Buffer.from(JSON.stringify({ sub: "", name: "Ana" })).toString("base64url");
  init.callback({ credential: `h.${payload}.s` });
  const r = await pending;
  assert.deepEqual([r.ok, r.profile.displayName], [true, "Ana"]);
});

test("signInWithGoogle - prompt não exibido, GIS ausente e script que falha", async () => {
  installFetch({ "./config/oauth.json": { googleClientId: "id-g" } });
  installDocument({ existing: "accounts.google.com" });
  globalThis.google = { accounts: { id: { initialize() {}, prompt: (cb) => cb({ isNotDisplayed: () => true, isSkippedMoment: () => false }) } } };
  assert.match((await oauth.signInWithGoogle()).reason, /Prompt Google não exibido/);
  delete globalThis.google;
  assert.deepEqual(await oauth.signInWithGoogle(), { ok: false, reason: "GIS indisponível" });
  installDocument({ fail: true });
  await assert.rejects(() => oauth.signInWithGoogle(), /failed https:\/\/accounts\.google\.com/);
});

test("signInWithMeta - não configurado, SDK ausente, login cancelado e perfil vazio", async () => {
  installFetch({ "./config/oauth.json": { facebookAppId: "" } });
  assert.match((await oauth.signInWithMeta()).reason, /App ID/);
  oauth.__resetOAuthConfigForTests();
  installFetch({ "./config/oauth.json": { facebookAppId: "app1" } });
  installDocument();
  assert.deepEqual(await oauth.signInWithMeta(), { ok: false, reason: "SDK Meta indisponível" });
  globalThis.FB = { init() {}, login: (cb) => cb({}) };
  assert.deepEqual(await oauth.signInWithMeta(), { ok: false, reason: "Login Meta cancelado" });
  globalThis.FB = { init() {}, login: (cb) => cb({ authResponse: {} }), api: (_p, _o, cb) => cb({}) };
  assert.deepEqual(await oauth.signInWithMeta(), { ok: false, reason: "Perfil Meta vazio" });
});

test("signInWithMeta - perfil válido é vinculado à conta local", async () => {
  installFetch({ "./config/oauth.json": { facebookAppId: "app1" } });
  installDocument();
  globalThis.FB = {
    init(o) { this.opts = o; },
    login: (cb) => cb({ authResponse: { ok: 1 } }),
    api: (_p, _o, cb) => cb({ id: "fb-77", name: "Beto", picture: { data: { url: "https://img/b.png" } } }),
  };
  const r = await oauth.signInWithMeta();
  assert.equal(r.ok, true);
  assert.deepEqual([r.profile.displayName, r.profile.avatarUrl], ["Beto", "https://img/b.png"]);
  assert.equal(globalThis.FB.opts.appId, "app1");
  assert.equal(localAccount.getProfileEnrichment().oauthProvider, "meta");
});

test("signInWithMetaIdentity - devolve netId/id e rejeita nas falhas conhecidas", async () => {
  installFetch({ "./config/oauth.json": { facebookAppId: "" } });
  await assert.rejects(() => oauth.signInWithMetaIdentity(), /não configurado/);
  oauth.__resetOAuthConfigForTests();
  installFetch({ "./config/oauth.json": { facebookAppId: "app1" } });
  installDocument({ existing: "connect.facebook.net" });
  await assert.rejects(() => oauth.signInWithMetaIdentity(), /SDK do Facebook indisponível/);
  globalThis.FB = { init() {}, login: (cb) => cb(null), api: () => {} };
  await assert.rejects(() => oauth.signInWithMetaIdentity(), /cancelado/);
  globalThis.FB = { init() {}, login: (cb) => cb({ authResponse: {} }), api: (_p, _o, cb) => cb({}) };
  await assert.rejects(() => oauth.signInWithMetaIdentity(), /não devolveu o perfil/);
  globalThis.FB.api = (_p, _o, cb) => cb({ id: 5, name: "Cris" });
  assert.deepEqual(await oauth.signInWithMetaIdentity(), { netId: "facebook", handle: "", name: "Cris", id: "5" });
});

test("signInWithGithub - pede o usuário ao prompt, trata cancelamento, 404 e falha de rede", async () => {
  globalThis.prompt = () => "";
  assert.deepEqual(await oauth.signInWithGithub(""), { ok: false, reason: "Usuário GitHub não informado." });
  globalThis.prompt = () => "@octo";
  globalThis.fetch = async (url) => ({ ok: false, url });
  assert.deepEqual(await oauth.signInWithGithub(), { ok: false, reason: "Perfil GitHub @octo não encontrado." });
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.deepEqual(await oauth.signInWithGithub("octo"), { ok: false, reason: "offline" });
  globalThis.fetch = async () => { throw new Error(""); };
  assert.equal((await oauth.signInWithGithub("octo")).reason, "Falha na conexão com GitHub");
});

test("signInWithGithub - usa login quando não há nome e sem avatar/bio", async () => {
  await localAccount.ensureLocalAccount();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ login: "so-login" }) });
  const r = await oauth.signInWithGithub("so-login");
  assert.deepEqual(r.profile, { displayName: "so-login", avatarUrl: "", bio: "", handle: "so-login" });
  assert.equal(localStorage.getItem("vox-profile-github"), "so-login");
});
