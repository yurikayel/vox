/**
 * LT-10 — matriz (como criou × como volta): mesmo `routeId` e assinatura fixa verificável.
 *
 * Não suportados (sem API de volta hoje):
 * - oauth_enrich × * — login social só enriquece perfil; não é chave nem cofre (vault-v2 §PM-90).
 * - local × vault_local | vault_sync | vault_kit | mesh — conta sem cofre salvo não abre por senha.
 * - local × guardians — pedaços não foram distribuídos na criação.
 * - vault_pass | vault_email | email_kit | vault_mesh × backup_plain — após cofre, chaves travadas; export simples exige senha (use wrapped).
 * - vault_pass | vault_email × guardians — pedaços Shamir não fazem parte do cofre por senha.
 * - vault_mesh × mesh (espera 24 h ou aprovação) — o harness LT-10 não recria o mundo multi-aparelho após
 *   capturar assinatura; ida/volta pela malha segue em `mesh-vault-flow.test.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as accountPhrase from "../client/js/identity/account-phrase.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import { exportAccountBundle, importAccountBundle } from "../client/js/identity/account-backup.js";
import * as oauthVault from "../client/js/vault/index.js";
import * as vaultCrypto from "../client/js/vault/vault-crypto.js";
import * as emailKit from "../client/js/email-kit.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as meshFlow from "../client/js/app/mesh-vault-flow.js";
import { savePassphraseVault, restoreFromPassphraseVault } from "../client/js/vault/passphrase-vault.js";
import * as guardians from "../client/js/identity/guardians.js";
import * as sendFlow from "../client/js/app/guardians-flow.js";
import * as gFlow from "../client/js/app/guardian-return-flow.js";
import * as cryptoDm from "../client/js/crypto-dm.js";
import { openRecoverySecret } from "../client/js/identity/account-phrase.js";
import * as keystore from "../client/js/identity/keystore.js";

const PASS = "minha senha bem longa soberana";
const EMAIL = "ana@exemplo.com";
const DEVICE_KEYS = [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE, mesh.PENDING_STORAGE];
const FIXED_PAYLOAD = {
  type: "topic",
  communityId: "lt10",
  title: "LT-10 matriz",
  body: "payload fixo de ida e volta",
};

if (!globalThis.sessionStorage) {
  const data = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

function stubOfflineFetch() {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  return () => {
    globalThis.fetch = orig;
  };
}

async function wipeAccountKeys() {
  await localAccount.wipeLocalAccount();
  keyLock.__resetKeyLockForTests();
}

async function wipeAll() {
  await wipeAccountKeys();
  localStorage.clear();
  if (globalThis.sessionStorage?.clear) globalStorageClear();
}

function globalStorageClear() {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

async function captureSignature() {
  const routeId = await localAccount.getRouteId();
  const signed = await localAccount.signPayload(FIXED_PAYLOAD);
  return { routeId, signed };
}

async function assertRoundTrip(routeId, signed) {
  assert.equal(await localAccount.getRouteId(), routeId);
  assert.equal(await localAccount.verifyPayload(signed), true, "assinatura capturada antes do wipe");
  const resigned = await localAccount.signPayload(FIXED_PAYLOAD);
  assert.equal(resigned.author, routeId);
  assert.equal(await localAccount.verifyPayload(resigned), true, "nova assinatura com a chave restaurada");
}

/** Monta criadores e artefatos reutilizáveis por cada caminho de volta. */
async function setupCreators() {
  const creators = {};

  creators.local_name = async () => {
    await wipeAll();
    await localAccount.ensureLocalAccount();
    return {};
  };

  creators.vault_pass = async () => {
    await wipeAll();
    const restoreFetch = stubOfflineFetch();
    try {
      await localAccount.ensureLocalAccount();
      const saved = await savePassphraseVault(PASS);
      assert.equal(saved.ok, true);
      const encoded = vaultCrypto.encodeVaultBundleForUrl(saved.bundle);
      return { encoded, saved };
    } finally {
      restoreFetch();
    }
  };

  creators.vault_email = async () => {
    await wipeAll();
    const restoreFetch = stubOfflineFetch();
    try {
      await localAccount.ensureLocalAccount();
      const saved = await savePassphraseVault(PASS, EMAIL);
      assert.equal(saved.ok, true);
      const encoded = vaultCrypto.encodeVaultBundleForUrl(saved.syncBundle || saved.bundle);
      return { encoded, email: EMAIL };
    } finally {
      restoreFetch();
    }
  };

  creators.email_kit = async () => {
    await wipeAll();
    const restoreFetch = stubOfflineFetch();
    try {
      const created = await emailKit.createEmailAccountKit({
        rawName: "Bia",
        email: EMAIL,
        pass: PASS,
        includePhrase: false,
        draftState: { email: "", pass: "" },
      });
      assert.equal(created.ok, true);
      return {
        email: EMAIL,
        syncUrl: created.kit.syncUrl,
        kitCode: created.kit.kitCode,
        encoded: vaultCrypto.encodeVaultBundleForUrl(
          vaultCrypto.decodeVaultBundleFromUrl(decodeURIComponent(created.kit.syncUrl.split("#/sync?b=")[1])),
        ),
      };
    } finally {
      restoreFetch();
    }
  };

  creators.vault_mesh = async () => {
    await wipeAll();
    const w = { now: Date.now(), relay: new Map(), dms: [], storage: new Map(), mutual: new Set(), guardians: [], pool: [] };
    const owner = (await localAccount.ensureLocalAccount()).routeId;
    const holders = [];
    for (let i = 0; i < 2; i++) {
      holders.push((await localAccount.createAdditionalAccount({ displayName: `H${i}` })).routeId);
      w.mutual.add(holders[i]);
    }
    w.mutual.add(owner);
    w.pool = [...holders];
    await meshAs(w, owner, async () => {
      assert.equal((await savePassphraseVault(PASS, EMAIL)).ok, true);
      assert.equal((await meshFlow.shareMyVault(meshDeps(w, owner))).length, 2);
    });
    await meshDeliver(w);
    const encoded = await meshAs(w, owner, async () => {
      const addr = await vaultCrypto.deriveVaultAddress(PASS, EMAIL);
      return vaultCrypto.encodeVaultBundleForUrl(JSON.parse(localStorage.getItem(`vox-vault-v2:${addr}`)));
    });
    return { w, owner, holders, email: EMAIL, encoded };
  };

  creators.guardians = async () => {
    await wipeAll();
    globalStorageClear();
    const owner = (await localAccount.ensureLocalAccount()).routeId;
    const ids = [];
    const sent = [];
    for (let i = 0; i < 3; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `G${i}` })).routeId);
    await localAccount.switchActiveAccount(owner);
    await sendFlow.sendGuardianShares({ guardians: ids, m: 2 }, guardianSendDeps(owner, sent));
    for (const env of sent) {
      await localAccount.switchActiveAccount(env.to);
      await onGuardianDevice(env.to, () => sendFlow.receiveGuardianDm({ from: env.from }, env.text, guardianSendDeps(env.to, [])));
    }
    await localAccount.switchActiveAccount(owner);
    return { owner, ids };
  };

  return creators;
}

const returns = {
  phrase: async () => {
    const needs = await accountPhrase.phraseNeedsPassphrase();
    const { words } = await accountPhrase.getAccountPhrase(needs ? PASS : undefined);
    await wipeAll();
    const res = await accountPhrase.restoreFromPhrase(words.join(" "));
    assert.equal(res.ok, true);
  },
  backup_plain: async () => {
    const bundle = await exportAccountBundle();
    await wipeAll();
    await importAccountBundle(bundle);
  },
  backup_wrapped: async () => {
    const bundle = await exportAccountBundle(PASS);
    await wipeAll();
    await importAccountBundle(bundle, PASS);
  },
  vault_local_pass: async () => {
    await wipeAccountKeys();
    const res = await restoreFromPassphraseVault(PASS);
    assert.equal(res.ok, true);
    return res.routeId;
  },
  vault_local_email: async (art) => {
    await wipeAccountKeys();
    const res = await restoreFromPassphraseVault(PASS, { email: art.email || EMAIL });
    assert.equal(res.ok, true);
    return res.routeId;
  },
  vault_sync: async (art) => {
    await wipeAll();
    const record = vaultCrypto.decodeVaultBundleFromUrl(art.encoded);
    const res = await restoreFromPassphraseVault(PASS, null, record, art.email || "");
    assert.equal(res.ok, true);
    return res.routeId;
  },
  vault_kit_url: async (art) => {
    await wipeAll();
    const res = await emailKit.restoreAccountFromInputs({ email: art.email || EMAIL, pass: PASS, kitText: art.syncUrl });
    assert.equal(res.ok, true);
    return res.routeId;
  },
  vault_kit_code: async (art) => {
    await wipeAll();
    const res = await emailKit.restoreAccountFromInputs({ email: art.email || EMAIL, pass: PASS, kitText: art.kitCode });
    assert.equal(res.ok, true);
    return res.routeId;
  },
  guardians_two: async (art) => {
    const { owner, ids } = art;
    const device = (await localAccount.createAdditionalAccount({ displayName: "Volta" })).routeId;
    await localAccount.switchActiveAccount(device);
    const req = await gFlow.startRecovery(owner);
    assert.equal(req.ok, true);
    const pushed = [];
    const q = new URLSearchParams(req.link.split("?")[1]);
    const first = await guardianGiveBack(ids[0], q, pushed);
    await guardianGiveBack(ids[1], q, pushed);
    await localAccount.switchActiveAccount(device);
    assert.deepEqual(await gFlow.addPastedReply(first.pasteText), { ok: true });
    assert.equal(await gFlow.collectRelayReplies({ ...(await guardianFlowDeps()), pull: async () => [pushed[1].env] }), 1);
    const done = await gFlow.finishRecovery();
    assert.equal(done.ok, true);
    assert.equal(await localAccount.getRouteId(), owner);
    return owner;
  },
};

/** Pares cobertos hoje (criar × voltar). */
const COVERED = [
  ["local_name", "phrase"],
  ["local_name", "backup_plain"],
  ["local_name", "backup_wrapped"],
  ["vault_pass", "vault_local_pass"],
  ["vault_pass", "vault_sync"],
  ["vault_pass", "phrase"],
  ["vault_pass", "backup_wrapped"],
  ["vault_email", "vault_local_email"],
  ["vault_email", "vault_sync"],
  ["vault_email", "phrase"],
  ["vault_email", "backup_wrapped"],
  ["email_kit", "vault_kit_url"],
  ["email_kit", "vault_kit_code"],
  ["email_kit", "vault_sync"],
  ["email_kit", "phrase"],
  ["vault_mesh", "vault_sync"],
  ["vault_mesh", "phrase"],
  ["guardians", "guardians_two"],
  ["guardians", "phrase"],
  ["guardians", "backup_plain"],
];

function meshAs(w, who, fn) {
  return switchMeshDevice(w, who, fn);
}

async function switchMeshDevice(w, who, fn) {
  await localAccount.switchActiveAccount(who);
  const mine = w.storage.get(who) || {};
  for (const k of DEVICE_KEYS) {
    if (mine[k] == null) localStorage.removeItem(k);
    else localStorage.setItem(k, mine[k]);
  }
  try {
    return await fn();
  } finally {
    w.storage.set(who, Object.fromEntries(DEVICE_KEYS.map((k) => [k, localStorage.getItem(k)])));
  }
}

function meshDeps(w, me) {
  return {
    getMe: () => me,
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: (_pub, text, meta) => ({ ...meta, text }),
    open: (env, priv) => cryptoDm.open(env, priv),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    sealKey: (v) => keystore.sealJsonStrict(v),
    openKey: (v) => keystore.openSealed(v),
    dispatch: async (to, env) => w.dms.push({ to, env }),
    push: async (addr, env) => w.relay.set(addr, [...(w.relay.get(addr) || []), env]),
    pull: async (addr) => [...(w.relay.get(addr) || [])],
    guardiansOf: () => w.guardians,
    pool: () => w.pool,
    mutual: async (ids) => ids.filter((id) => w.mutual.has(id)),
    alert: () => {},
    now: () => w.now,
  };
}

async function meshDeliver(w) {
  const queue = w.dms.splice(0);
  for (const { to, env } of queue) {
    await switchMeshDevice(w, to, () => meshFlow.receiveMeshDm({ from: env.from }, env.text, meshDeps(w, to)));
  }
  return queue.length;
}

const heldByDevice = new Map();
async function onGuardianDevice(who, fn) {
  const saved = localStorage.getItem(guardians.HELD_STORAGE);
  if (heldByDevice.has(who)) localStorage.setItem(guardians.HELD_STORAGE, heldByDevice.get(who));
  else localStorage.removeItem(guardians.HELD_STORAGE);
  try {
    return await fn();
  } finally {
    heldByDevice.set(who, localStorage.getItem(guardians.HELD_STORAGE) || "{}");
    if (saved == null) localStorage.removeItem(guardians.HELD_STORAGE);
    else localStorage.setItem(guardians.HELD_STORAGE, saved);
  }
}

function guardianSendDeps(me, outbox) {
  return {
    getMe: () => me,
    getOwnerName: () => "Ana",
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (s) => localAccount.verifyPayload(s),
    seal: async (_pub, text, meta) => ({ ...meta, text }),
    dispatch: async (_to, env) => {
      outbox.push(env);
      return "delivered";
    },
    openSecret: (pass) => openRecoverySecret(pass),
    follows: () => true,
    addedMe: () => true,
    alert: () => {},
  };
}

function guardianReturnDeps(me, pushed) {
  return {
    getMe: () => me,
    openHeld: (owner) => onGuardianDevice(me, () => guardians.openHeldShare(owner)),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    push: async (addr, env) => {
      pushed.push({ addr, env });
    },
    now: () => Date.now(),
  };
}

async function guardianGiveBack(guardian, q, pushed) {
  await localAccount.switchActiveAccount(guardian);
  const prep = await gFlow.prepareGuardianReturn(q, guardianReturnDeps(guardian, pushed));
  assert.equal(prep.ok, true);
  return gFlow.sendGuardianReturn(prep.request, { confirmed: true }, guardianReturnDeps(guardian, pushed));
}

async function guardianFlowDeps() {
  const [inbox, phrase] = [await import("../client/js/inbox.js"), await import("../client/js/identity/account-phrase.js")];
  return {
    getMe: () => localAccount.getRouteId(),
    openHeld: (o) => guardians.openHeldShare(o),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    seal: (p, t, m) => cryptoDm.seal(p, t, m),
    open: (e, k) => cryptoDm.open(e, k),
    sealKey: (v) => keystore.sealJsonStrict(v),
    openKey: (v) => keystore.openSealed(v),
    push: (a, e) => inbox.pushSealed(a, e),
    pull: (a) => inbox.pullMine(a),
    verify: (s) => localAccount.verifyPayload(s),
    restore: (j, o) => phrase.restoreFromSecret(j, o),
    now: () => Date.now(),
  };
}

const creatorsCache = setupCreators();

for (const [createId, returnId] of COVERED) {
  test(`LT-10: ${createId} → ${returnId}`, async () => {
    const creators = await creatorsCache;
    const art = await creators[createId]();
    const cap =
      art.owner && (createId === "vault_mesh" || createId === "guardians")
        ? art.w
          ? await switchMeshDevice(art.w, art.owner, captureSignature)
          : (await localAccount.switchActiveAccount(art.owner), await captureSignature())
        : await captureSignature();
    await returns[returnId](art);
    await assertRoundTrip(cap.routeId, cap.signed);
  });
}