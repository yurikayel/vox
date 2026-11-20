/**
 * LT-04 (§3.5–3.6, §5) — Shamir, arquivos de backup e storage corrompido (semente fixa).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { combineShares, MAX_N, MIN_M, splitSecret } from "../client/js/shamir-gf256.js";
import { importAccountBundle } from "../client/js/identity/account-backup.js";
import * as emailKit from "../client/js/email-kit.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as identitySeed from "../client/js/identity/identity-seed.js";
import * as inboxBackup from "../client/js/identity/inbox-backup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as vaultStore from "../client/js/vault/vault-store.js";
import * as meshFlow from "../client/js/app/mesh-vault-flow.js";
const { SEED_STORAGE } = identitySeed;

const LT04_SEED = 0x4c543034;
const PASS = "frase longa de teste soberana";
const hex = (u8) => Buffer.from(u8).toString("hex");

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function subsets(list, size) {
  if (size === 0) return [[]];
  if (list.length < size) return [];
  const [head, ...rest] = list;
  return [...subsets(rest, size - 1).map((s) => [head, ...s]), ...subsets(rest, size)];
}

function rngFactory(seed) {
  const next = mulberry32(seed);
  return (buf) => {
    for (let i = 0; i < buf.length; i++) buf[i] = (next() * 256) | 0;
    return buf;
  };
}

function secretFor(m, n) {
  const next = mulberry32(LT04_SEED + m * 17 + n * 997);
  return Uint8Array.from({ length: 16 }, () => (next() * 256) | 0);
}

const MESH_KEYS = [
  mesh.HELD_STORAGE,
  mesh.MINE_STORAGE,
  mesh.PENDING_STORAGE,
  mesh.NOTICES_STORAGE,
];
const ACCOUNT_KEYS = [
  "vox-local-account-v1",
  "vox-accounts-vault-v1",
  SEED_STORAGE,
  "vox-dm-keypair",
];

function randomStorageValue(rng, _key) {
  const kind = Math.floor(rng() * 6);
  if (kind === 0) return String(rng());
  if (kind === 1) return JSON.stringify({ x: rng(), nest: { a: [null, true, "vx"] } });
  if (kind === 2) return JSON.stringify([rng(), "vx_fake", { t: Date.now() }]);
  if (kind === 3) return "not-json{{";
  if (kind === 4) return "A".repeat(4000 + Math.floor(rng() * 200));
  return JSON.stringify({ junk: rng() });
}

test("LT-04 Shamir — todo subconjunto de M pedaços devolve o segredo (N ≤ 7, semente fixa)", () => {
  for (let n = MIN_M; n <= MAX_N; n++) {
    for (let m = MIN_M; m <= n; m++) {
      const secret = secretFor(m, n);
      const { shares } = splitSecret(secret, { m, n, random: rngFactory(LT04_SEED ^ (m << 8) ^ n) });
      for (const group of subsets(shares, m)) {
        assert.equal(hex(combineShares(group, m)), hex(secret), `${m} de ${n}`);
      }
    }
  }
});

test("LT-04 Shamir — M−1 pedaços não recuperam o segredo", () => {
  for (let n = MIN_M; n <= MAX_N; n++) {
    for (let m = MIN_M; m <= n; m++) {
      if (m < MIN_M + 1) continue;
      const secret = secretFor(m, n);
      const { shares } = splitSecret(secret, { m, n, random: rngFactory(LT04_SEED ^ 0xbeef ^ (m << 4) ^ n) });
      assert.throws(() => combineShares(shares.slice(0, m - 1), m), /São precisos/);
      for (const group of subsets(shares, m - 1)) {
        assert.notEqual(hex(combineShares(group, m - 1)), hex(secret), `${m - 1} de ${n}`);
      }
    }
  }
});

test("LT-04 arquivos — vazio, muito grande e binário recusam sem derrubar", async () => {
  const empty = await emailKit.restoreAccountFromInputs({ pass: PASS, files: [{ text: async () => "" }] });
  assert.equal(empty.ok, false);

  await assert.rejects(() => importAccountBundle(""), /Formato de backup inválido/);
  await assert.rejects(() => importAccountBundle("\x00\x01\xff\xfe"), /Formato de backup inválido/);

  const huge = "{" + '"junk":"' + "z".repeat(600_000) + '"}';
  const big = await emailKit.restoreAccountFromInputs({ pass: PASS, files: [{ text: async () => huge }] });
  assert.equal(big.ok, false);
  await assert.rejects(() => importAccountBundle(huge), /Formato de backup inválido|incompatível/);
});

test("LT-04 storage — JSON aleatório nas chaves do login e da malha não derruba entradas", async () => {
  const rng = mulberry32(LT04_SEED ^ 0xc0ffee);
  for (let round = 0; round < 24; round++) {
    localStorage.clear();
    for (const key of [...MESH_KEYS, ...ACCOUNT_KEYS]) {
      localStorage.setItem(key, randomStorageValue(rng, key));
    }
    assert.doesNotThrow(() => mesh.loadPending());
    assert.doesNotThrow(() => mesh.loadHeld());
    assert.doesNotThrow(() => mesh.loadNotices());
    assert.doesNotThrow(() => mesh.loadMine());
    assert.doesNotThrow(() => inboxBackup.getInboxBackupSettings());
    assert.doesNotThrow(() => inboxBackup.dueInboxBackups());
    await assert.doesNotReject(async () => localAccount.ensureLocalAccount());
    await assert.doesNotReject(async () => identitySeed.storeSeed("vx_fuzz_seed", new Uint8Array(16)));
    await assert.doesNotReject(async () =>
      meshFlow.holderTick({
        getMe: () => "vx_guarda_fuzz",
        getContacts: () => [],
        fetchRequests: async () => [],
        fetchActions: async () => [],
        push: async () => true,
        seal: async (_p, text) => text,
        sign: async (b) => b,
        verify: async () => true,
        now: () => 1_700_000_000_000,
      }),
    );
  }
});

test("JSON corrompido ou não-objeto não quebra mine/pending/vault-store/inbox-backup", async () => {
  localStorage.clear();
  const validAddr = "a".repeat(64);
  localStorage.setItem(mesh.MINE_STORAGE, JSON.stringify({ address: validAddr, sentTo: "corrupt", previousHolders: 42 }));
  assert.doesNotThrow(() => mesh.rememberMine({ routeId: "vx_dona", address: validAddr, record: { v: 2 } }));
  localStorage.setItem(mesh.MINE_STORAGE, JSON.stringify({ address: validAddr, sentTo: 99, previousHolders: {} }));
  assert.doesNotThrow(() => mesh.markSent(["vx_guarda1"]));
  assert.deepEqual(mesh.pickHolders({ sentTo: "bad", previousHolders: 123 }, ["vx_g1"]), ["vx_g1"]);

  localStorage.setItem(mesh.PENDING_STORAGE, JSON.stringify([1, 2, 3]));
  assert.equal(mesh.loadPending(), null);

  const acc = await localAccount.ensureLocalAccount();
  localStorage.setItem(`vox-inbox-backup-v1:${acc.routeId}`, JSON.stringify([1, 2, 3]));
  assert.equal(inboxBackup.getInboxBackupSettings().ready, false);
  assert.deepEqual(inboxBackup.dueInboxBackups(), []);
  assert.doesNotThrow(() => inboxBackup.setInboxBackupCadence({ weekly: false }));
  assert.equal(localStorage.getItem(`vox-inbox-backup-v1:${acc.routeId}`), JSON.stringify([1, 2, 3]));

  const remoteRecord = { v: 2, updatedAt: 10, ciphertext: "ok" };
  localStorage.setItem(`${vaultStore.VAULT_STORAGE_PREFIX}k_corrupt`, JSON.stringify([123]));
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ record: remoteRecord }) });
  try {
    const out = await vaultStore.findVaultRecordWithStatus("k_corrupt", vaultStore.VAULT_STORAGE_PREFIX);
    assert.deepEqual(out.record, remoteRecord, "lixo local em array não deve impedir busca remota do cofre");
  } finally {
    globalThis.fetch = prevFetch;
  }
});