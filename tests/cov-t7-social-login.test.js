/**
 * @file Cobertura T7 de `social-login.js`: provedores disponíveis, início do fluxo PKCE, callback pendente
 * e conclusão do login (relay, erro do provedor, fluxo expirado e Bluesky), sem rede.
 */
import "./setup.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as social from "../client/js/social-login.js";
import * as oauth from "../client/js/oauth-profile.js";

const realFetch = globalThis.fetch;
const realLocation = globalThis.location;
const realDocument = globalThis.document;
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const FLOW = "vox-social-oauth-flow";
const BSKY = "vox-bsky-oauth-flow";
let assigned;

/**
 * Instala `location` falso e registra os `assign`.
 * @param {string} [hostname] Host atual.
 * @returns {void}
 */
function installLocation(hostname = "vox.test") {
  assigned = [];
  globalThis.location = {
    hostname,
    href: `https://${hostname}/app/index.html`,
    origin: `https://${hostname}`,
    pathname: "/app/index.html",
    hash: "#/",
    assign: (u) => assigned.push(u),
  };
}

/**
 * Faz `loadOAuthConfig` devolver a config dada.
 * @param {object} cfg Conteúdo de `oauth.json`.
 * @returns {void}
 */
function useConfig(cfg) {
  oauth.__resetOAuthConfigForTests();
  globalThis.fetch = async (url) => {
    if (String(url) === "./config/oauth.json") return { ok: true, json: async () => cfg };
    throw new Error(`rota não prevista: ${url}`);
  };
}

beforeEach(() => {
  store.clear();
  installLocation();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.location = realLocation;
  globalThis.document = realDocument;
  delete globalThis.FB;
  oauth.__resetOAuthConfigForTests();
});

test("availableLoginProviders - Bluesky sempre; demais dependem de relay e client id reais", async () => {
  useConfig({ facebookAppId: "fb1", oauthRelayUrl: "https://relay.test", githubClientId: "gh1", xClientId: "YOUR_X", tiktokClientKey: "" });
  const out = await social.availableLoginProviders();
  assert.deepEqual(out, { bsky: true, facebook: true, twitter: false, github: true, threads: false, tiktok: false, instagram: false });
  useConfig({ githubClientId: "gh1" });
  const noRelay = await social.availableLoginProviders();
  assert.deepEqual([noRelay.github, noRelay.facebook, noRelay.bsky], [false, false, true]);
});

test("oauthRedirectUri - aponta para oauth-callback.html ao lado da página", () => {
  assert.equal(social.oauthRedirectUri(), "https://vox.test/app/oauth-callback.html");
});

test("startSocialLogin - PKCE guarda o fluxo, limpa o do Bluesky e redireciona ao provedor", async () => {
  useConfig({ githubClientId: "gh-cli", oauthRelayUrl: "https://relay.test" });
  store.set(BSKY, "{}");
  await social.startSocialLogin("github");
  const flow = JSON.parse(store.get(FLOW));
  assert.equal(store.has(BSKY), false);
  assert.equal(flow.provider, "github");
  assert.equal(flow.redirectUri, "https://vox.test/app/oauth-callback.html");
  const url = new URL(assigned[0]);
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "gh-cli");
  assert.equal(url.searchParams.get("state"), flow.state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(url.searchParams.get("code_challenge"), flow.verifier);
});

test("startSocialLogin - provedor não configurado, rede desconhecida e Bluesky em localhost", async () => {
  useConfig({ githubClientId: "gh-cli" });
  await assert.rejects(() => social.startSocialLogin("github"), /Login do GitHub não configurado/);
  await assert.rejects(() => social.startSocialLogin("orkut"), /Rede sem login disponível/);
  installLocation("localhost");
  await assert.rejects(() => social.startSocialLogin("bsky"), /127\.0\.0\.1/);
  assert.equal(assigned[0], "https://127.0.0.1/app/index.html");
});

test("startSocialLogin - Facebook sem app id falha; com app id usa o SDK e devolve a identidade", async () => {
  useConfig({ facebookAppId: "" });
  await assert.rejects(() => social.startSocialLogin("facebook"), /Facebook não configurado/);
  useConfig({ facebookAppId: "app9" });
  globalThis.document = { querySelector: () => ({}), createElement: () => ({}), head: { appendChild() {} } };
  globalThis.FB = { init() {}, login: (cb) => cb({ authResponse: {} }), api: (_p, _o, cb) => cb({ id: "7", name: "Dani" }) };
  assert.deepEqual(await social.startSocialLogin("facebook"), { netId: "facebook", handle: "", name: "Dani", id: "7" });
});

test("takePendingCallback - lê e consome; vazio ou inválido devolve null", () => {
  assert.equal(social.takePendingCallback(), null);
  store.set(social.CALLBACK_KEY, JSON.stringify({ code: "c", state: "s" }));
  assert.deepEqual(social.takePendingCallback(), { code: "c", state: "s" });
  assert.equal(store.has(social.CALLBACK_KEY), false);
  store.set(social.CALLBACK_KEY, "{quebrado");
  assert.equal(social.takePendingCallback(), null);
});

test("matchesPendingFlow - confere o state com qualquer fluxo guardado, sem consumir", () => {
  store.set(FLOW, JSON.stringify({ state: "abc" }));
  store.set(BSKY, "{quebrado");
  assert.equal(social.matchesPendingFlow({ state: "abc" }), true);
  assert.equal(social.matchesPendingFlow({ state: "outro" }), false);
  assert.equal(social.matchesPendingFlow({ state: 5 }), false);
  assert.equal(social.matchesPendingFlow(null), false);
  assert.equal(store.has(FLOW), true);
});

test("completeSocialLogin - callback com erro encerra fluxos e traduz a mensagem", async () => {
  store.set(FLOW, JSON.stringify({ state: "s", provider: "github" }));
  await assert.rejects(() => social.completeSocialLogin({ error: "access_denied" }), /Login cancelado\./);
  assert.equal(store.has(FLOW), false);
  await assert.rejects(() => social.completeSocialLogin({ error: "server_error" }), /recusou o login \(server_error\)/);
});

test("completeSocialLogin - sem fluxo com o mesmo state o login expirou", async () => {
  store.set(FLOW, JSON.stringify({ state: "s1", provider: "github" }));
  await assert.rejects(() => social.completeSocialLogin({ code: "c", state: "outro" }), /Login expirou/);
  assert.equal(store.has(FLOW), true);
});

test("completeSocialLogin - troca o código no relay e devolve a identidade", async () => {
  useConfig({ oauthRelayUrl: "https://relay.test/" });
  store.set(FLOW, JSON.stringify({ state: "s1", provider: "github", verifier: "v", redirectUri: "https://vox.test/cb" }));
  const calls = [];
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/oauth/exchange")) {
      calls.push([String(url), JSON.parse(init.body)]);
      return { ok: true, json: async () => ({ handle: "octo", id: "42", name: "Octo" }) };
    }
    return base(url, init);
  };
  const id = await social.completeSocialLogin({ code: "cod", state: "s1" });
  assert.deepEqual(id, { netId: "github", handle: "octo", id: "42", name: "Octo" });
  assert.deepEqual(calls, [["https://relay.test/oauth/exchange", { provider: "github", code: "cod", code_verifier: "v", redirect_uri: "https://vox.test/cb" }]]);
  assert.equal(store.has(FLOW), false);
});

test("completeSocialLogin - relay recusando devolve o erro dele ou uma mensagem padrão", async () => {
  useConfig({ oauthRelayUrl: "https://relay.test" });
  const seed = () => store.set(FLOW, JSON.stringify({ state: "s1", provider: "github" }));
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).endsWith("/oauth/exchange")
    ? { ok: false, json: async () => ({ error: "código inválido" }) }
    : base(url, init));
  seed();
  await assert.rejects(() => social.completeSocialLogin({ code: "x", state: "s1" }), /código inválido/);
  globalThis.fetch = async (url, init) => (String(url).endsWith("/oauth/exchange")
    ? { ok: true, json: async () => { throw new Error("json ruim"); } }
    : base(url, init));
  seed();
  await assert.rejects(() => social.completeSocialLogin({ code: "x", state: "s1" }), /Não foi possível concluir o login/);
});

test("completeSocialLogin - fluxo Bluesky vai para o login do Bluesky e descarta o fluxo social", async () => {
  store.set(BSKY, JSON.stringify({ provider: "bsky", state: "b1", issRequired: true, issuer: "https://bsky.test" }));
  store.set(FLOW, JSON.stringify({ state: "s9", provider: "github" }));
  await assert.rejects(() => social.completeSocialLogin({ code: "c", state: "b1", iss: "https://falso.test" }), /Emissor do login não confere/);
  assert.equal(store.has(FLOW), false);
});
