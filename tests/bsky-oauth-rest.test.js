/**
 * @file PM-96 — Sessão do Bluesky cifrada no aparelho (ADR-026).
 * Valida sessão selada em repouso, abertura síncrona/assíncrona, renovação DPoP e migração legada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as keystore from "../client/js/identity/keystore.js";
import { sealKeysAtRest } from "../client/js/identity/key-at-rest.js";
import {
  saveBskySession,
  loadBskySession,
  openBskySession,
  clearBskySession,
  postWithBskySession,
} from "../client/js/bsky-oauth.js";

const SESSION_KEY = "vox-bsky-oauth-session";

async function makePlainSession() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
  return {
    did: "did:plc:test-user-123",
    handle: "test-user.bsky.social",
    pds: "https://pds.test.example",
    issuer: "https://bsky.social",
    clientId: "http://localhost/client-id",
    tokenEndpoint: "https://bsky.social/oauth/token",
    keys,
    nonce: "test-nonce-1",
    accessToken: "secret-access-token-xyz",
    refreshToken: "secret-refresh-token-abc",
    expiresAt: Date.now() + 3_600_000,
  };
}

async function withoutKeystore(fn) {
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try {
    return await fn();
  } finally {
    globalThis.indexedDB = saved;
    keystore.__resetKeystoreForTests();
  }
}

test("PM-96 - sessão selada no localStorage não expõe segredos em texto claro", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  await saveBskySession(plain);

  const raw = localStorage.getItem(SESSION_KEY);
  assert.ok(raw, "registro deve existir no localStorage");
  assert.equal(raw.includes("secret-access-token-xyz"), false, "accessToken não pode estar em claro");
  assert.equal(raw.includes("secret-refresh-token-abc"), false, "refreshToken não pode estar em claro");
  assert.equal(raw.includes(plain.keys.privateJwk.d), false, "chave privada DPoP não pode estar em claro");

  const parsed = JSON.parse(raw);
  assert.equal(parsed.did, "did:plc:test-user-123");
  assert.equal(parsed.handle, "test-user.bsky.social");
  assert.equal(parsed.keys, undefined);
  assert.equal(parsed.accessToken, undefined);
  assert.equal(parsed.refreshToken, undefined);
  assert.equal(keystore.isSealed(parsed.sealed), true);
});

test("PM-96 - loadBskySession() síncrono é truthy e openBskySession() decifra os segredos", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  await saveBskySession(plain);

  const sync = loadBskySession();
  assert.ok(sync, "loadBskySession síncrono deve retornar objeto truthy");
  assert.equal(sync.did, plain.did);
  assert.equal(sync.keys, undefined, "loadBskySession não expõe chaves");
  assert.equal(sync.accessToken, undefined, "loadBskySession não expõe tokens");

  const opened = await openBskySession();
  assert.ok(opened, "openBskySession deve decifrar sessão");
  assert.equal(opened.did, plain.did);
  assert.equal(opened.accessToken, "secret-access-token-xyz");
  assert.equal(opened.refreshToken, "secret-refresh-token-abc");
  assert.deepEqual(opened.keys.privateJwk, plain.keys.privateJwk);
});

test("PM-96 - openBskySession() e loadBskySession() com sessão vazia ou legada em claro", async () => {
  clearBskySession();
  assert.equal(loadBskySession(), null);
  assert.equal(await openBskySession(), null);

  const plain = await makePlainSession();
  localStorage.setItem(SESSION_KEY, JSON.stringify(plain));

  const opened = await openBskySession();
  assert.equal(opened.accessToken, "secret-access-token-xyz");
  assert.deepEqual(opened.keys, plain.keys);
});

test("PM-96 - postWithBskySession publica com sessão selada e atualiza nonce selado", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  await saveBskySession(plain);

  const origFetch = globalThis.fetch;
  let postedRecord = null;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith("/xrpc/com.atproto.repo.createRecord")) {
      postedRecord = JSON.parse(opts.body);
      const headers = new Headers();
      headers.set("DPoP-Nonce", "rotated-nonce-888");
      return { ok: true, status: 200, headers, json: async () => ({ uri: "at://record" }) };
    }
    return { ok: false, status: 404, headers: new Headers() };
  };

  try {
    const res = await postWithBskySession("Post de teste selado");
    assert.equal(res.ok, true);
    assert.equal(postedRecord.record.text, "Post de teste selado");

    const raw = localStorage.getItem(SESSION_KEY);
    assert.equal(raw.includes("secret-access-token-xyz"), false);
    const opened = await openBskySession();
    assert.equal(opened.nonce, "rotated-nonce-888");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("PM-96 - postWithBskySession renova token expirado e persiste nova sessão selada", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  plain.expiresAt = Date.now() - 5000;
  await saveBskySession(plain);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/oauth/token")) {
      const headers = new Headers();
      return {
        ok: true,
        status: 200,
        headers,
        json: async () => ({ access_token: "renewed-tok-999", refresh_token: "renewed-ref-999", expires_in: 3600 }),
      };
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ uri: "at://x" }) };
  };

  try {
    const res = await postWithBskySession("Post após refresh");
    assert.equal(res.ok, true);

    const raw = localStorage.getItem(SESSION_KEY);
    assert.equal(raw.includes("renewed-tok-999"), false);
    const opened = await openBskySession();
    assert.equal(opened.accessToken, "renewed-tok-999");
    assert.equal(opened.refreshToken, "renewed-ref-999");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("PM-96 - fallback seguro quando a chave do aparelho não está disponível", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  await withoutKeystore(async () => {
    const saved = await saveBskySession(plain);
    assert.equal(saved.accessToken, "secret-access-token-xyz");
    assert.equal(loadBskySession().accessToken, "secret-access-token-xyz");
    const opened = await openBskySession();
    assert.equal(opened.accessToken, "secret-access-token-xyz");
  });
});

test("PM-96 - sealKeysAtRest() migra sessão legada em claro e remove campos sensíveis", async () => {
  clearBskySession();
  const plain = await makePlainSession();
  localStorage.setItem(SESSION_KEY, JSON.stringify(plain));

  const changed = await sealKeysAtRest();
  assert.equal(changed, 1);

  const raw = localStorage.getItem(SESSION_KEY);
  assert.equal(raw.includes("secret-access-token-xyz"), false);
  assert.equal(raw.includes(plain.keys.privateJwk.d), false);

  const parsed = JSON.parse(raw);
  assert.equal(parsed.did, plain.did);
  assert.equal(parsed.keys, undefined);
  assert.equal(parsed.accessToken, undefined);
  assert.equal(parsed.refreshToken, undefined);
  assert.equal(keystore.isSealed(parsed.sealed), true);

  const opened = await openBskySession();
  assert.equal(opened.accessToken, "secret-access-token-xyz");
  assert.equal(opened.refreshToken, "secret-refresh-token-abc");
  assert.deepEqual(opened.keys.privateJwk, plain.keys.privateJwk);

  assert.equal(await sealKeysAtRest(), 0, "segunda execução não altera sessão já selada");
});

test("PM-96 - sealKeysAtRest() não regrava se armazenamento mudou concorrentemente", async () => {
  const plain = await makePlainSession();
  const initial = JSON.stringify(plain);
  const store = new Map([[SESSION_KEY, initial]]);
  let reads = 0;
  const racingStorage = {
    getItem: (k) => {
      if (k !== SESSION_KEY) return store.get(k) ?? null;
      reads += 1;
      return reads > 1 ? JSON.stringify({ ...plain, accessToken: "divergent-race" }) : store.get(k);
    },
    setItem: (k, v) => store.set(k, v),
  };

  const changed = await sealKeysAtRest(racingStorage);
  assert.equal(changed, 0, "corrida concorrente deve abortar gravação");
});
