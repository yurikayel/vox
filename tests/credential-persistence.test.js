/**
 * @file Persistência de credenciais endurecida: sem chave do aparelho, segredos de sessão e de contas vinculadas
 * não vão para o localStorage; com chave, só cifrados.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import * as keystore from "../client/js/identity/keystore.js";
import { saveBskySession, openBskySession, loadBskySession } from "../client/js/bsky-oauth.js";
import * as linked from "../client/js/linked-accounts.js";

const SESSION = {
  did: "did:plc:x", handle: "x.bsky.social", pds: "https://pds.test", issuer: "https://bsky.social", clientId: "c",
  tokenEndpoint: "https://bsky.social/token", expiresAt: 123, extra: "NAO-LISTADO",
  keys: { privateJwk: { d: "DPOP-PRIVADA" }, publicJwk: { x: "pub" } }, nonce: "n1", accessToken: "ACESSO-SECRETO", refreshToken: "REFRESH-SECRETO",
};

async function withoutDeviceKey(fn) {
  const salvo = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try { await fn(); } finally { globalThis.indexedDB = salvo; keystore.__resetKeystoreForTests(); }
}

function dump() {
  return JSON.stringify([...localStorage.store]);
}

test("sessão Bluesky sem chave do aparelho: nenhum segredo no storage, só metadados em lista branca", async () => {
  localStorage.clear();
  await withoutDeviceKey(async () => {
    await saveBskySession({ ...SESSION });
    const raw = dump();
    for (const s of ["DPOP-PRIVADA", "ACESSO-SECRETO", "REFRESH-SECRETO", "NAO-LISTADO"]) assert.ok(!raw.includes(s), s);
    assert.equal(loadBskySession().handle, "x.bsky.social");
    const open = await openBskySession();
    assert.equal(open.accessToken, "ACESSO-SECRETO");
  });
});

test("sessão Bluesky com chave do aparelho: segredos só cifrados e reabertos no uso", async () => {
  localStorage.clear();
  await saveBskySession({ ...SESSION });
  const raw = dump();
  for (const s of ["DPOP-PRIVADA", "ACESSO-SECRETO", "REFRESH-SECRETO"]) assert.ok(!raw.includes(s), s);
  assert.equal(keystore.isSealed(loadBskySession().sealed), true);
  assert.equal((await openBskySession()).refreshToken, "REFRESH-SECRETO");
});

test("contas vinculadas sem chave do aparelho: App Password e webhook não vão ao storage, mas servem na sessão", async () => {
  localStorage.clear();
  await withoutDeviceKey(async () => {
    linked.saveLinkedAccount("bsky", { handle: "u.bsky.social", appPassword: "APP-PWD-SECRETA", webhook: "https://hook.test/SEGREDO", enabled: true });
    await new Promise((r) => setTimeout(r, 20));
    const raw = dump();
    assert.ok(!raw.includes("APP-PWD-SECRETA"));
    assert.ok(!raw.includes("SEGREDO"));
    assert.equal(linked.loadLinkedAccounts().bsky.appPassword, "APP-PWD-SECRETA");
    linked.removeLinkedAccount("bsky");
  });
});

test("contas vinculadas com chave do aparelho: segredos só cifrados e recuperados após hidratar", async () => {
  localStorage.clear();
  linked.saveLinkedAccount("bsky", { handle: "u.bsky.social", appPassword: "APP-PWD-CIFRADA", enabled: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!dump().includes("APP-PWD-CIFRADA"));
  assert.ok(localStorage.getItem("vox-linked-secrets"));
  await linked.hydrateLinkedAccounts();
  assert.equal(linked.loadLinkedAccounts().bsky.appPassword, "APP-PWD-CIFRADA");
  linked.removeLinkedAccount("bsky");
});

test("vínculo legado com App Password em claro é migrado: o storage deixa de ter o segredo", async () => {
  localStorage.clear();
  localStorage.setItem("vox-linked-accounts-v1", JSON.stringify({ bsky: { handle: "u.bsky.social", appPassword: "LEGADO-CLARO", enabled: true } }));
  const acc = linked.loadLinkedAccounts().bsky;
  assert.equal(acc.appPassword, "LEGADO-CLARO");
  assert.ok(!localStorage.getItem("vox-linked-accounts-v1").includes("LEGADO-CLARO"));
  linked.removeLinkedAccount("bsky");
});

test("vínculo: campo fora da lista branca não chega ao storage", async () => {
  localStorage.clear();
  linked.saveLinkedAccount("bsky", { handle: "u.bsky.social", enabled: true, intruso: "CAMPO-EXTRA", token: "TOKEN-EXTRA" });
  const stored = JSON.parse(localStorage.getItem("vox-linked-accounts-v1")).bsky;
  assert.deepEqual(Object.keys(stored).sort(), ["accountId", "did", "displayName", "enabled", "handle", "linkedAt", "updatedAt", "verified", "via"]);
  assert.ok(!dump().includes("EXTRA"));
  linked.removeLinkedAccount("bsky");
});

test("sessão Bluesky já selada: regravar não deixa passar campo fora da lista branca", async () => {
  localStorage.clear();
  const sealed = await keystore.sealJsonStrict({ keys: {}, nonce: "", accessToken: "a", refreshToken: "" });
  await saveBskySession({ did: "did:plc:x", handle: "x", sealed, intruso: "CAMPO-EXTRA" });
  const stored = loadBskySession();
  assert.deepEqual(Object.keys(stored).sort(), ["did", "handle", "sealed"]);
  await assert.rejects(saveBskySession({ did: "d", sealed: { sealed: keystore.SEALED_TAG ?? "x", iv: "<script>", ct: "ab" } }));
});
