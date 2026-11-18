/**
 * S19 — `vault/vault-store.js`: busca local/remota, revogação e gravação paralela (módulo fora dos locks #218).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_STORAGE_PREFIX,
  findVaultRecordWithStatus,
  saveRemoteVaultRecord,
  persistVaultRecord,
  forgetLocalVaultRecord,
  revokeVaultAddress,
} from "../client/js/vault/vault-store.js";

function installVaultFetch() {
  const byUrl = new Map();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const path = String(url);
    if (!path.includes("/memory/vault/")) {
      return orig ? orig(url, opts) : { ok: false, status: 404, json: async () => ({}) };
    }
    const key = path.split("/memory/vault/")[1];
    if (opts.method === "POST") {
      const body = JSON.parse(opts.body || "{}");
      byUrl.set(key, body.record);
      return { ok: true, json: async () => ({ status: "saved" }) };
    }
    const record = byUrl.get(key);
    return record
      ? { ok: true, json: async () => ({ status: "ok", record }) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  return {
    seed(key, record, base = "http://127.0.0.1:3921") {
      byUrl.set(key, record);
      return `${base}/memory/vault/${key}`;
    },
    restore: () => {
      globalThis.fetch = orig;
    },
  };
}

const LOOKUP = "abc123deadbeef";
const SAMPLE = { v: 2, salt: "aa", iter: 600000, iv: "bb", ciphertext: "cc", updatedAt: 100 };

test("vault-store - local revogado não consulta rede", async () => {
  localStorage.clear();
  localStorage.setItem(VAULT_STORAGE_PREFIX + LOOKUP, JSON.stringify({ v: 2, revoked: true, updatedAt: 1 }));
  const relay = installVaultFetch();
  relay.seed(LOOKUP, SAMPLE);
  const status = await findVaultRecordWithStatus(LOOKUP, VAULT_STORAGE_PREFIX);
  relay.restore();
  assert.equal(status.record, null);
  assert.equal(status.revoked, true);
});

test("vault-store - JSON inválido no aparelho e cópia remota mais nova vence", async () => {
  localStorage.clear();
  localStorage.setItem(VAULT_STORAGE_PREFIX + LOOKUP, "{nao-json");
  const relay = installVaultFetch();
  relay.seed(LOOKUP, { ...SAMPLE, updatedAt: 2000 });
  const status = await findVaultRecordWithStatus(LOOKUP, VAULT_STORAGE_PREFIX);
  relay.restore();
  assert.equal(status.revoked, false);
  assert.equal(status.record?.updatedAt, 2000);
});

test("vault-store - grava local e conta POSTs aceitos nos servidores", async () => {
  localStorage.clear();
  const relay = installVaultFetch();
  const saved = await saveRemoteVaultRecord(LOOKUP, SAMPLE, "tok");
  const count = await persistVaultRecord(LOOKUP, SAMPLE, "tok");
  const local = JSON.parse(localStorage.getItem(VAULT_STORAGE_PREFIX + LOOKUP));
  forgetLocalVaultRecord(LOOKUP);
  relay.restore();
  assert.ok(saved >= 1);
  assert.equal(count, saved);
  assert.deepEqual(local, SAMPLE);
  assert.equal(localStorage.getItem(VAULT_STORAGE_PREFIX + LOOKUP), null);
});

test("vault-store - revoke apaga local e envia marca revogada", async () => {
  localStorage.clear();
  localStorage.setItem(VAULT_STORAGE_PREFIX + LOOKUP, JSON.stringify(SAMPLE));
  const relay = installVaultFetch();
  await revokeVaultAddress(LOOKUP, "tok");
  const remote = await findVaultRecordWithStatus(LOOKUP, VAULT_STORAGE_PREFIX);
  relay.restore();
  assert.equal(localStorage.getItem(VAULT_STORAGE_PREFIX + LOOKUP), null);
  assert.equal(remote.revoked, true);
  assert.equal(remote.record, null);
});