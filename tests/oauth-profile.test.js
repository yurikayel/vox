import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as oauth from "../client/js/oauth-profile.js";
import * as localAccount from "../client/js/local-account.js";
import {
  restoreOrBindGoogleIdentity,
  restoreOrBindMetaIdentity,
  computeVaultLookupKey,
  savePassphraseVault,
  restoreFromPassphraseVault,
} from "../client/js/oauth-vault.js";
import * as oauthVault from "../client/js/oauth-vault.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as peopleIndex from "../client/js/people-index.js";
import { encodeVoxUrl } from "../client/js/qr-url.js";
import { parseRoute } from "../client/js/app/route-parse.js";

test("oauth-profile - skip marks step complete", () => {
  localStorage.clear();
  oauth.__resetOAuthConfigForTests();
  assert.equal(oauth.hasCompletedOAuthStep(), false);
  oauth.skipOAuthEnrichment();
  assert.equal(oauth.hasSkippedOAuth(), true);
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});

test("oauth-profile - enrichment counts as completed", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({ displayName: "Test", oauthProvider: "google" });
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});

test("oauth-profile - signInWithGithub enriches profile from github api", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.github.com/users/devbrasil")) {
      return {
        ok: true,
        json: async () => ({
          login: "devbrasil",
          name: "Dev Brasil",
          avatar_url: "https://github.com/devbrasil.png",
          bio: "FOSS e Soberania Digital",
        }),
      };
    }
    return { ok: false };
  };

  try {
    const res = await oauth.signInWithGithub("devbrasil");
    assert.equal(res.ok, true);
    assert.equal(res.profile.displayName, "Dev Brasil");
    assert.equal(res.profile.avatarUrl, "https://github.com/devbrasil.png");
    assert.equal(res.profile.handle, "devbrasil");

    const enrichment = localAccount.getProfileEnrichment();
    assert.equal(enrichment.displayName, "Dev Brasil");
    assert.equal(enrichment.oauthProvider, "github");
    assert.equal(localStorage.getItem("vox-profile-github"), "devbrasil");
    assert.equal(oauth.hasCompletedOAuthStep(), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-profile - applyGoogleCredential switches to existing account if already in vault", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc1 = await localAccount.ensureLocalAccount();

    const fakePayload1 = {
      sub: "google_user_999",
      email: "yuri@example.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_test=s96-c",
    };
    const b64Payload1 = Buffer.from(JSON.stringify(fakePayload1)).toString("base64");
    const fakeToken1 = `eyJhbGciOiJSUzI1NiJ9.${b64Payload1}.fake_signature`;

    // 1. Aplica na conta 1
    let res1;
    await new Promise((resolve) => oauth.applyGoogleCredential(fakeToken1, (r) => { res1 = r; resolve(); }));
    assert.equal(res1.ok, true);
    assert.equal(res1.profile.displayName, "Yuri Kayel");

    // 2. Cria uma conta 2 descartável no cofre
    const acc2 = await localAccount.createAdditionalAccount();
    assert.notEqual(acc2.routeId, acc1.routeId);
    assert.equal(localAccount.getCachedRouteIdSync(), acc2.routeId);

    // 3. Tenta enriquecer a conta 2 com a MESMA conta Google
    let res2;
    await new Promise((resolve) => oauth.applyGoogleCredential(fakeToken1, (r) => { res2 = r; resolve(); }));
    assert.equal(res2.ok, true);
    assert.equal(res2.switched, true);
    // Conta ativa foi alternada de volta para acc1!
    assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
    // A conta descartável acc2 foi removida do cofre para não deixar órfão
    const vault = localAccount.listVaultAccountsSync();
    assert.equal(vault.some((v) => v.routeId === acc2.routeId), false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-vault - restoreOrBindGoogleIdentity restores canonical routeId after localStorage wipe", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc1 = await localAccount.ensureLocalAccount();
    const sub = "google_user_test_restore_42";

    // 1. Primeiro vínculo
    const res1 = await restoreOrBindGoogleIdentity({
      sub,
      email: "yuri@test.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_restore=s96-c",
    });
    assert.equal(res1.routeId, acc1.routeId);
    assert.equal(res1.restored, false);

    // Guarda o vault backup gerado
    const lookupKey = await computeVaultLookupKey(sub, "google");
    const vaultCipher = localStorage.getItem("vox-oauth-vault-v1:" + lookupKey);
    assert.ok(vaultCipher);

    // 2. Simula desconexão / wipe de chaves deste navegador
    localAccount.wipeLocalAccount();
    assert.equal(localStorage.getItem("vox-local-account-v1"), null);

    // Mantém o backup cifrado (simulado no localStorage/remote)
    localStorage.setItem("vox-oauth-vault-v1:" + lookupKey, vaultCipher);

    // 3. Usuário conecta novamente com a mesma conta Google
    const res2 = await restoreOrBindGoogleIdentity({
      sub,
      email: "yuri@test.com",
      name: "Yuri Kayel",
      picture: "https://lh3.googleusercontent.com/a/ACg8oc_restore=s96-c",
    });

    // RESTAUROU A MESMA IDENTIDADE ORIGINAL!
    assert.equal(res2.restored, true);
    assert.equal(res2.routeId, acc1.routeId);
    assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-vault - restoreOrBindMetaIdentity restores canonical routeId after localStorage wipe", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc1 = await localAccount.ensureLocalAccount();
    const sub = "meta_user_987654";

    const res1 = await restoreOrBindMetaIdentity({
      sub,
      email: "alice@meta.com",
      name: "Alice Meta",
      picture: "https://graph.facebook.com/987654/picture",
    });
    assert.equal(res1.routeId, acc1.routeId);
    assert.equal(res1.restored, false);

    const lookupKey = await computeVaultLookupKey(sub, "meta");
    const vaultCipher = localStorage.getItem("vox-oauth-vault-v1:" + lookupKey);
    assert.ok(vaultCipher);

    localAccount.wipeLocalAccount();
    assert.equal(localStorage.getItem("vox-local-account-v1"), null);

    localStorage.setItem("vox-oauth-vault-v1:" + lookupKey, vaultCipher);

    const res2 = await restoreOrBindMetaIdentity({
      sub,
      email: "alice@meta.com",
      name: "Alice Meta",
      picture: "https://graph.facebook.com/987654/picture",
    });

    assert.equal(res2.restored, true);
    assert.equal(res2.routeId, acc1.routeId);
    assert.equal(localAccount.getCachedRouteIdSync(), acc1.routeId);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-vault - sovereign passphrase vault save, wrong passphrase reject, and successful restore", async () => {
  const origFetch = globalThis.fetch;
  const mockVault = new Map();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/memory/vault/")) {
      const key = String(url).split("/memory/vault/")[1];
      if (opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        mockVault.set(key, body.record);
        return { ok: true, json: async () => ({ status: "saved" }) };
      }
      if (mockVault.has(key)) {
        return { ok: true, json: async () => ({ status: "ok", record: mockVault.get(key) }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    }
    return origFetch(url, opts);
  };

  try {
    localAccount.wipeLocalAccount();
    const acc = await localAccount.ensureLocalAccount();
    localAccount.setDisplayName("Alice Soberana");

    const pass = "segredo-forte-soberano-42";
    const saveRes = await savePassphraseVault(pass);
    assert.equal(saveRes.ok, true);
    assert.equal(saveRes.routeId, acc.routeId);

    // Limpa chaves deste aparelho (simula aparelho B virgem)
    localAccount.wipeLocalAccount();
    assert.equal(localStorage.getItem("vox-local-account-v1"), null);

    // Senha errada deve falhar
    const badRes = await restoreFromPassphraseVault("senha-errada-qualquer");
    assert.equal(badRes.ok, false);

    // Senha correta restaura identidade
    const okRes = await restoreFromPassphraseVault(pass);
    assert.equal(okRes.ok, true);
    assert.equal(okRes.routeId, acc.routeId);
    assert.equal(okRes.displayName, "Alice Soberana");
    assert.equal(localAccount.getCachedRouteIdSync(), acc.routeId);
    assert.equal(localAccount.getDisplayName(), "Alice Soberana");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("oauth-vault - cross-device sync URL and QR code encoding", () => {
  const origLocation = globalThis.location;
  try {
    globalThis.location = { hash: "#/sync?b=Y2lmcmFkbw" };
    const r = parseRoute();
    assert.equal(r.name, "sync");
    assert.equal(r.bundle, "Y2lmcmFkbw");
    assert.equal(r.passphrase, undefined, "PM-92: a senha não vem do link");
    assert.equal(r.legacyPassphrase, false);
    globalThis.location = { hash: "#/sync?p=segredo-forte-soberano-42" };
    const legacy = parseRoute();
    assert.equal(legacy.passphrase, undefined);
    assert.equal(legacy.legacyPassphrase, true, "link antigo com senha só gera aviso");

    const qr = encodeVoxUrl("https://vox.local/#/sync?b=Y2lmcmFkbw");
    assert.ok(qr.modules);
    assert.ok(qr.modules.length > 0);
  } finally {
    globalThis.location = origLocation;
  }
});

test("oauth-vault - cross-device offline restore via URL hash bundle (no server needed)", async () => {
  localAccount.wipeLocalAccount();
  const originalAcc = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Yuri Celular");

  const pass = "senha-soberana-teste-cross-device-offline";
  const saved = await savePassphraseVault(pass);
  assert.equal(saved.ok, true);
  assert.ok(saved.bundle);

  const encodedBundle = oauthVault.encodeVaultBundleForUrl(saved.bundle);
  assert.ok(encodedBundle.length > 50);

  // Simula outro aparelho (limpando localStorage e gerando conta efêmera)
  localAccount.wipeLocalAccount();
  const ephemeralDeviceAcc = await localAccount.ensureLocalAccount();
  assert.notEqual(ephemeralDeviceAcc.routeId, originalAcc.routeId);

  // Decodifica e restaura usando o bundle passado na URL (zero chamadas fetch)
  const decodedRecord = oauthVault.decodeVaultBundleFromUrl(encodedBundle);
  assert.ok(decodedRecord);
  const restoreRes = await restoreFromPassphraseVault(pass, null, decodedRecord);
  assert.equal(restoreRes.ok, true);
  assert.equal(restoreRes.routeId, originalAcc.routeId);
  assert.equal(localAccount.getCachedRouteIdSync(), originalAcc.routeId);
  assert.equal(localAccount.getDisplayName(), "Yuri Celular");

  // Conta efêmera foi limpa do cofre
  const vault = localAccount.listVaultAccountsSync();
  assert.equal(vault.some((v) => v.routeId === ephemeralDeviceAcc.routeId), false);
});

test("oauth-vault - re-login Google não duplica perfil em profileDirectory e peopleIndex", async () => {
  localAccount.wipeLocalAccount();
  profileDirectory.__resetProfileCardsForTests();

  const fakePayload = {
    sub: "google_yuri_12345",
    email: "yuri.kayel@gmail.com",
    name: "Yuri Kayel",
    picture: "https://lh3.googleusercontent.com/ogw/AF2bZq_fake=s96-c",
  };
  const token = `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(fakePayload)).toString("base64")}.sig`;

  // 1. Primeiro login
  await new Promise((resolve) => oauth.applyGoogleCredential(token, resolve));
  const canonicalId = localAccount.getCachedRouteIdSync();
  assert.ok(canonicalId.startsWith("vx_"));

  // 2. Simula criação de cartão no diretório
  profileDirectory.setProfileCard(canonicalId, {
    name: "Yuri Kayel",
    avatarUrl: fakePayload.picture,
    discoverable: true,
  });

  // 3. Simula novo acesso onde nasce conta efêmera
  const ephemeral = await localAccount.createAdditionalAccount();
  profileDirectory.setProfileCard(ephemeral.routeId, {
    name: "Yuri Kayel",
    avatarUrl: "https://lh3.googleusercontent.com/ogw/AF2bZq_fake=s192-c",
    discoverable: true,
  });

  // 4. Reconecta mesma conta Google
  await new Promise((resolve) => oauth.applyGoogleCredential(token, resolve));

  // Conta ativa deve ser a canônica
  assert.equal(localAccount.getCachedRouteIdSync(), canonicalId);

  // Cartões duplicados em profileDirectory e peopleIndex devem estar limpos
  const cards = profileDirectory.listDiscoverableProfileCards();
  const yuriCards = cards.filter((c) => c.name === "Yuri Kayel");
  assert.equal(yuriCards.length, 1);
  assert.equal(yuriCards[0].routeId, canonicalId);

  const people = await peopleIndex.buildPeopleIndex();
  const yuriPeople = people.filter((p) => p.name === "Yuri Kayel");
  assert.equal(yuriPeople.length, 1);
  assert.equal(yuriPeople[0].routeId, canonicalId);
});
