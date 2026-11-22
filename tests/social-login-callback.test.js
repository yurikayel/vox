/**
 * @file Callback de login social: o fluxo é escolhido pelo `state` (um login do Bluesky abandonado não captura o
 * callback de outra rede) e, no Bluesky, callback sem `iss` é recusado quando o servidor anuncia o parâmetro (RFC 9207).
 * Rede de fora não é tocada: `fetch` é substituído em cada teste.
 */
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

if (!globalThis.sessionStorage) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

const { completeSocialLogin, matchesPendingFlow } = await import("../client/js/social-login.js");
const { completeBskyLogin } = await import("../client/js/bsky-oauth.js");

const BSKY_FLOW = "vox-bsky-oauth-flow";
const PKCE_FLOW = "vox-social-oauth-flow";
const realFetch = globalThis.fetch;

async function dpopKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

async function bskyFlow(state, extra = {}) {
  return {
    provider: "bsky", state, verifier: "v", keys: await dpopKeys(), nonce: "", issuer: "https://bsky.social",
    tokenEndpoint: "https://bsky.social/oauth/token", clientId: "c", redirectUri: "r", ...extra,
  };
}

function setFlows({ bsky, pkce }) {
  sessionStorage.clear();
  if (bsky) sessionStorage.setItem(BSKY_FLOW, JSON.stringify(bsky));
  if (pkce) sessionStorage.setItem(PKCE_FLOW, JSON.stringify(pkce));
}

/** `fetch` falso: registra as URLs; config do OAuth e troca no relay respondem, o resto falha. */
function fakeFetch(calls) {
  return async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("config/oauth")) {
      return new Response(JSON.stringify({ oauthRelayUrl: "http://relay.test", githubClientId: "gh" }), { status: 200 });
    }
    if (u === "http://relay.test/oauth/exchange") {
      return new Response(JSON.stringify({ handle: "fulana", id: "42", name: "Fulana" }), { status: 200 });
    }
    return new Response("{}", { status: 400 });
  };
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
  sessionStorage.clear();
});

test("callback social - login do Bluesky abandonado não captura o callback do GitHub", async () => {
  const calls = [];
  globalThis.fetch = fakeFetch(calls);
  setFlows({
    bsky: await bskyFlow("estado-bsky-velho"),
    pkce: { provider: "github", state: "estado-github", verifier: "ver", redirectUri: "http://127.0.0.1/oauth-callback.html" },
  });
  const r = await completeSocialLogin({ code: "abc", state: "estado-github" });
  assert.deepEqual(r, { netId: "github", handle: "fulana", id: "42", name: "Fulana" });
  assert.ok(calls.includes("http://relay.test/oauth/exchange"));
  assert.ok(!calls.some((u) => u.startsWith("https://bsky.social")), "não tocou o Bluesky");
  assert.equal(sessionStorage.getItem(BSKY_FLOW), null, "fluxo velho do Bluesky encerrado");
  assert.equal(sessionStorage.getItem(PKCE_FLOW), null);
});

test("callback social - state do Bluesky vai para o Bluesky e encerra o fluxo PKCE pendente", async () => {
  const calls = [];
  globalThis.fetch = fakeFetch(calls);
  setFlows({
    bsky: await bskyFlow("estado-bsky"),
    pkce: { provider: "github", state: "estado-github-velho", verifier: "ver", redirectUri: "r" },
  });
  await assert.rejects(
    completeSocialLogin({ code: "abc", state: "estado-bsky", iss: "https://bsky.social" }),
    /Falha ao concluir o login no Bluesky/
  );
  assert.ok(calls.includes("https://bsky.social/oauth/token"));
  assert.ok(!calls.includes("http://relay.test/oauth/exchange"));
  assert.equal(sessionStorage.getItem(PKCE_FLOW), null);
  assert.equal(sessionStorage.getItem(BSKY_FLOW), null);
});

test("callback social - state que não confere com nenhum fluxo é recusado e preserva os fluxos pendentes", async () => {
  const calls = [];
  globalThis.fetch = fakeFetch(calls);
  setFlows({ bsky: await bskyFlow("a"), pkce: { provider: "github", state: "b", verifier: "v", redirectUri: "r" } });
  await assert.rejects(completeSocialLogin({ code: "abc", state: "c" }), /Login expirou ou não confere/);
  await assert.rejects(completeSocialLogin({ code: "abc" }), /Login expirou ou não confere/);
  assert.deepEqual(calls, []);
  assert.notEqual(sessionStorage.getItem(BSKY_FLOW), null);
  assert.notEqual(sessionStorage.getItem(PKCE_FLOW), null);
  assert.equal(matchesPendingFlow({ state: "b" }), true);
  assert.equal(matchesPendingFlow({ state: "c" }), false);
  assert.equal(matchesPendingFlow({}), false);
});

test("bluesky oauth - sem iss no callback é recusado quando o servidor anuncia o parâmetro (RFC 9207)", async () => {
  const calls = [];
  globalThis.fetch = fakeFetch(calls);
  setFlows({ bsky: await bskyFlow("s", { issRequired: true }) });
  await assert.rejects(completeBskyLogin({ code: "abc", state: "s" }), /Emissor do login não confere/);
  setFlows({ bsky: await bskyFlow("s", { issRequired: true }) });
  await assert.rejects(completeBskyLogin({ code: "abc", state: "s", iss: "https://outro.example" }), /Emissor do login não confere/);
  assert.deepEqual(calls, [], "nenhum código trocado");
});

test("bluesky oauth - servidor que não anuncia iss segue aceitando callback sem iss, mas recusa iss errado", async () => {
  const calls = [];
  globalThis.fetch = fakeFetch(calls);
  setFlows({ bsky: await bskyFlow("s") });
  await assert.rejects(completeBskyLogin({ code: "abc", state: "s" }), /Falha ao concluir o login no Bluesky/);
  assert.deepEqual(calls, ["https://bsky.social/oauth/token"]);
  setFlows({ bsky: await bskyFlow("s") });
  await assert.rejects(completeBskyLogin({ code: "abc", state: "s", iss: "https://outro.example" }), /Emissor do login não confere/);
});
