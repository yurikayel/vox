/**
 * @file A replicação no Bluesky pela sessão OAuth leva o link canônico do post, como o caminho do App Password.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import * as linked from "../client/js/linked-accounts.js";

async function oauthSession() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
  return { did: "did:plc:teste", handle: "teste.bsky.social", pds: "https://pds.teste", keys, nonce: "",
    accessToken: "tok", refreshToken: "", expiresAt: Date.now() + 3_600_000 };
}

async function postedTextVia(setup) {
  localStorage.clear();
  await setup();
  const texts = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith("/xrpc/com.atproto.repo.createRecord")) texts.push(JSON.parse(opts.body).record.text);
    const body = String(url).endsWith("createSession") ? { did: "did:plc:teste", accessJwt: "jwt" } : { uri: "at://x" };
    return { ok: true, status: 200, headers: new Headers(), json: async () => body };
  };
  try {
    await linked.dispatchAutoReplication(
      { id: "p1", title: "Título", body: "Corpo do post", canonicalUrl: "https://vox.example/#/p/p1" },
      { force: true },
    );
  } finally {
    globalThis.fetch = origFetch;
  }
  return texts;
}

test("replicação por OAuth leva o link canônico do post", async () => {
  const texts = await postedTextVia(async () => {
    localStorage.setItem("vox-bsky-oauth-session", JSON.stringify(await oauthSession()));
    linked.saveLinkedAccount("bsky", { handle: "teste.bsky.social", via: "oauth", did: "did:plc:teste", enabled: true });
  });
  assert.equal(texts.length, 1);
  assert.equal(texts[0], "Título\n\nCorpo do post\n\nhttps://vox.example/#/p/p1");
});

test("OAuth e App Password publicam o mesmo texto", async () => {
  const viaOauth = await postedTextVia(async () => {
    localStorage.setItem("vox-bsky-oauth-session", JSON.stringify(await oauthSession()));
    linked.saveLinkedAccount("bsky", { handle: "teste.bsky.social", via: "oauth", enabled: true });
  });
  const viaPassword = await postedTextVia(async () => {
    linked.saveLinkedAccount("bsky", { handle: "teste.bsky.social", appPassword: "senha-app", enabled: true });
  });
  assert.deepEqual(viaOauth, viaPassword);
});
