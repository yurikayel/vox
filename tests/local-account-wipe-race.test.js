/**
 * @file `wipeLocalAccount` no meio de `ensureLocalAccount`: a criação em voo não pode gravar a conta apagada de volta
 * (nem a semente, nem a chave de DM, nem a entrada no cofre local).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/identity/local-account.js";

const ACCOUNT_KEY = "vox-local-account-v1";
const SEED_KEY = "vox-identity-seed-v1";
const DM_KEY = "vox-dm-keypair";
const VAULT_KEY = "vox-accounts-vault-v1";

/** Chama `onWrite(value)` uma vez, logo depois da primeira gravação de `key`, e devolve o que foi gravado. */
function afterFirstWrite(key, onWrite) {
  const real = localStorage.setItem.bind(localStorage);
  const seen = { value: null };
  localStorage.setItem = (k, v) => {
    real(k, v);
    if (k !== key || seen.value !== null) return;
    seen.value = String(v);
    onWrite(seen.value);
  };
  return { seen, restore: () => { localStorage.setItem = real; } };
}

function readJson(key) {
  return JSON.parse(localStorage.getItem(key) || "null");
}

function assertNoTrace(routeId) {
  assert.notEqual(readJson(ACCOUNT_KEY)?.routeId, routeId, "conta apagada voltou ao armazenamento");
  assert.notEqual(localAccount.getCachedRouteIdSync(), routeId, "conta apagada voltou à memória");
  assert.equal(readJson(SEED_KEY)?.[routeId], undefined, "semente da conta apagada ficou");
  assert.equal(readJson(VAULT_KEY)?.[routeId], undefined, "conta apagada entrou no cofre local");
}

test("wipe logo depois da semente: a criação em voo não grava a conta apagada", async () => {
  localStorage.clear();
  const hook = afterFirstWrite(SEED_KEY, () => localAccount.wipeLocalAccount());
  try {
    const acc = await localAccount.ensureLocalAccount();
    const [doomed] = Object.keys(JSON.parse(hook.seen.value));
    assert.ok(doomed);
    assert.notEqual(acc.routeId, doomed);
    assertNoTrace(doomed);
    assert.equal(readJson(ACCOUNT_KEY).routeId, acc.routeId);
  } finally {
    hook.restore();
  }
});

test("wipe logo depois da chave de DM: a chave da conta apagada não fica", async () => {
  localStorage.clear();
  let doomed = "";
  const hook = afterFirstWrite(DM_KEY, () => {
    doomed = Object.keys(readJson(SEED_KEY) || {})[0];
    localAccount.wipeLocalAccount();
  });
  try {
    const acc = await localAccount.ensureLocalAccount();
    assert.ok(doomed);
    assert.notEqual(acc.routeId, doomed);
    assertNoTrace(doomed);
    assert.notEqual(localStorage.getItem(DM_KEY), hook.seen.value, "chave de DM da conta apagada ficou");
  } finally {
    hook.restore();
  }
});

test("wipe com a conta já criada e a chave de DM sendo refeita: a conta antiga não volta", async () => {
  localStorage.clear();
  const old = await localAccount.ensureLocalAccount();
  localStorage.removeItem(DM_KEY);
  const pending = localAccount.ensureLocalAccount();
  const wiped = localAccount.wipeLocalAccount();
  const acc = await pending;
  await wiped;
  assert.notEqual(acc.routeId, old.routeId);
  assertNoTrace(old.routeId);
});

test("chamada feita logo depois do wipe não entra na criação em voo de antes dele", async () => {
  localStorage.clear();
  let after = null;
  const hook = afterFirstWrite(SEED_KEY, () => {
    localAccount.wipeLocalAccount();
    after = localAccount.ensureLocalAccount();
  });
  try {
    const before = await localAccount.ensureLocalAccount();
    const afterAcc = await after;
    const [doomed] = Object.keys(JSON.parse(hook.seen.value));
    assert.equal(before.routeId, afterAcc.routeId, "quem pediu antes do wipe recebe a conta nova, a mesma de quem pediu depois");
    assert.notEqual(afterAcc.routeId, doomed);
    assertNoTrace(doomed);
  } finally {
    hook.restore();
  }
});
