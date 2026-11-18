/**
 * Storage corrompido, rodada 2 (segue o #214): `guardians.js`, `key-lock.js` e `account-exit.js` leem JSON do
 * `localStorage`. Array, null, número, string, `__proto__`, JSON inválido e cota cheia não podem derrubar a leitura,
 * misturar chaves de índice no mapa nem apagar dado válido. Os casos de `local-account.js` (fora do escopo deste
 * PR) ficam como `todo`: rodam e aparecem, mas só passam a valer quando esse arquivo for corrigido.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as guardians from "../client/js/identity/guardians.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as flow from "../client/js/app/guardians-flow.js";
import { getAccountExits, markAccountExit } from "../client/js/identity/account-exit.js";
import { makeDeps, setup } from "./guardians-harness.js";

const NOT_A_MAP = ["[1,2]", "[]", "null", "42", '"texto"', "true", "{quebrado"];
const COPIES_KEY = "vox-locked-keys-v1";
const PASS = "quatro palavras de teste soberano";
const SHARE = { author: "vx_dona", ownerName: "Ana", splitId: "split-1", x: 1 };
const read = (key) => JSON.parse(localStorage.getItem(key));
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

test.afterEach(() => {
  delete localStorage.setItem;
  localStorage.clear();
  keyLock.__resetKeyLockForTests();
});

/** Cota cheia só para a chave dada: qualquer outra gravação segue normal. */
function fullFor(storageKey) {
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (key === storageKey || key.startsWith(storageKey)) throw new DOMException("cheio", "QuotaExceededError");
    original(key, value);
  };
}

async function openKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const [publicJwk, privateJwk] = await Promise.all([pair.publicKey, pair.privateKey].map((k) => crypto.subtle.exportKey("jwk", k)));
  return { publicJwk, privateJwk };
}

const lock = async (routeId, pass = PASS) => keyLock.lockKeys({ routeId, ...(await openKeys()) }, pass);

// ---- key-lock ----

test("key-lock — cópias que não são mapa: a trava grava só a conta e não mistura índices", async (t) => {
  for (const raw of NOT_A_MAP) {
    await t.test(raw, async () => {
      localStorage.setItem(COPIES_KEY, raw);
      assert.ok(await lock("vx_a"), "travou");
      const map = read(COPIES_KEY);
      assert.ok(isRecord(map), "gravou um mapa");
      assert.deepEqual(Object.keys(map), ["vx_a"]);
      assert.ok(await keyLock.openLockedCopy("vx_a", PASS), "a cópia abre com a senha");
    });
  }
});

test("key-lock — __proto__ no JSON não vira chave nem polui; cópia de outra conta fica", async () => {
  await lock("vx_b");
  const other = read(COPIES_KEY).vx_b;
  localStorage.setItem(COPIES_KEY, `{"__proto__":{"polluted":1},"vx_b":${JSON.stringify(other)}}`);
  assert.ok(await lock("vx_a"));
  const map = read(COPIES_KEY);
  assert.equal(Object.hasOwn(map, "__proto__"), false);
  assert.deepEqual(map.vx_b, other, "cópia válida de outra conta preservada");
  assert.equal({}.polluted, undefined);
});

test("key-lock — routeId que é nome do protótipo diz que não há cópia, não 'senha incorreta'", async () => {
  await lock("vx_a");
  for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    await assert.rejects(() => keyLock.openLockedCopy(id, PASS), /não está neste aparelho/, id);
  }
});

test("key-lock — entrada que não é registro conta como 'sem cópia'", async (t) => {
  for (const entry of ["42", "[1]", '"x"', "true"]) {
    await t.test(entry, async () => {
      localStorage.setItem(COPIES_KEY, `{"vx_a":${entry}}`);
      await assert.rejects(() => keyLock.openLockedCopy("vx_a", PASS), /não está neste aparelho/);
    });
  }
});

test("key-lock — cota cheia: não trava, devolve null e a cópia anterior segue abrindo", async () => {
  assert.ok(await lock("vx_a"));
  const before = localStorage.getItem(COPIES_KEY);
  fullFor(COPIES_KEY);
  assert.equal(await lock("vx_a", `${PASS} nova`), null);
  assert.equal(await lock("vx_c"), null, "conta nova também não trava sem onde gravar a cópia");
  assert.equal(localStorage.getItem(COPIES_KEY), before, "nada gravado pela metade");
  assert.ok(await keyLock.openLockedCopy("vx_a", PASS), "senha antiga ainda abre");
});

test("key-lock — esquecer conta com cota cheia ou lixo no mapa não lança", async () => {
  await lock("vx_a");
  fullFor(COPIES_KEY);
  await assert.doesNotReject(() => keyLock.forgetLockedAccount("vx_a"));
  delete localStorage.setItem;
  for (const raw of NOT_A_MAP) {
    localStorage.setItem(COPIES_KEY, raw);
    await assert.doesNotReject(() => keyLock.forgetLockedAccount("vx_a"), raw);
    await assert.doesNotReject(() => keyLock.forgetAllLockedAccounts(), raw);
  }
});

// ---- guardians: guarda do guardião ----

test("guardiões — guarda que não é mapa: lista vazia e o pedaço novo fica salvo como mapa", async (t) => {
  for (const raw of NOT_A_MAP) {
    await t.test(raw, async () => {
      localStorage.setItem(guardians.HELD_STORAGE, raw);
      assert.deepEqual(guardians.listHeld(), []);
      assert.equal(await guardians.storeHeldShare(SHARE, "vx_eu"), true);
      assert.ok(isRecord(read(guardians.HELD_STORAGE)));
      assert.deepEqual(guardians.listHeld().map((h) => h.owner), ["vx_dona"]);
    });
  }
});

test("guardiões — entradas da guarda que não são registros não derrubam a lista", () => {
  const bad = { vx_a: 42, vx_b: null, vx_c: [1], vx_d: "x", vx_e: {}, vx_f: { owner: "vx_outro", sealed: {} } };
  localStorage.setItem(guardians.HELD_STORAGE, JSON.stringify(bad));
  assert.deepEqual(guardians.listHeld(), []);
});

test("guardiões — __proto__ e nomes do protótipo não viram dona guardada", async () => {
  const entry = { owner: "vx_evil", heldAt: 1, sealed: { v: 1 } };
  localStorage.setItem(guardians.HELD_STORAGE, `{"__proto__":${JSON.stringify(entry)}}`);
  assert.deepEqual(guardians.listHeld(), []);
  for (const id of ["__proto__", "constructor", "toString"]) assert.equal(await guardians.openHeldShare(id), null, id);
  assert.equal(guardians.dropHeldShare("constructor"), null);
});

test("guardiões — lixo na guarda não conta no teto de 20 e o pedaço válido continua lá", async () => {
  assert.equal(await guardians.storeHeldShare(SHARE, "vx_eu"), true);
  const map = read(guardians.HELD_STORAGE);
  for (let i = 0; i < 25; i += 1) map[`vx_lixo${i}`] = i % 2 ? null : i;
  localStorage.setItem(guardians.HELD_STORAGE, JSON.stringify(map));
  assert.equal(await guardians.storeHeldShare({ ...SHARE, author: "vx_outra", x: 2 }, "vx_eu"), true);
  assert.deepEqual(guardians.listHeld().map((h) => h.owner).sort(), ["vx_dona", "vx_outra"]);
  assert.ok(await guardians.openHeldShare("vx_dona"), "o pedaço da primeira dona ainda abre");
});

test("guardiões — cota cheia na guarda: não finge que guardou nem que soltou", async () => {
  assert.equal(await guardians.storeHeldShare(SHARE, "vx_eu"), true);
  const before = localStorage.getItem(guardians.HELD_STORAGE);
  fullFor(guardians.HELD_STORAGE);
  assert.equal(await guardians.storeHeldShare({ ...SHARE, author: "vx_outra" }, "vx_eu"), false);
  assert.equal(guardians.dropHeldShare("vx_dona"), null, "o pedaço continua, então não diz que apagou");
  assert.equal(localStorage.getItem(guardians.HELD_STORAGE), before);
});

// ---- guardians: mapa da dona ----

const SPLIT = { splitId: "s1", m: 2, n: 3, guardians: [{ routeId: "vx_a", x: 1, sentAt: 1, heldAt: null }] };
const ownerKey = "vox-guardians-v1:vx_dona";
const BAD_SPLITS = [
  ...NOT_A_MAP,
  JSON.stringify({ ...SPLIT, guardians: "x" }),
  JSON.stringify({ ...SPLIT, guardians: null }),
  JSON.stringify({ ...SPLIT, guardians: [null] }),
  JSON.stringify({ ...SPLIT, guardians: [{ x: 1 }] }),
  JSON.stringify({ ...SPLIT, m: "dois" }),
  JSON.stringify({ ...SPLIT, splitId: 7 }),
];

test("guardiões — mapa da dona corrompido vale como 'sem divisão', sem lançar nem apagar o que está lá", async (t) => {
  const receipt = { author: "vx_a", splitId: "s1", x: 1, heldAt: 5 };
  for (const raw of BAD_SPLITS) {
    await t.test(raw, () => {
      localStorage.setItem(ownerKey, raw);
      assert.equal(guardians.getOwnerSplit("vx_dona"), null);
      assert.deepEqual(guardians.countConfirmed("vx_dona"), { confirmed: 0, m: 0, n: 0 });
      assert.equal(guardians.applyReceipt("vx_dona", receipt), false);
      assert.equal(localStorage.getItem(ownerKey), raw, "o valor guardado não foi tocado");
    });
  }
});

test("guardiões — mapa da dona válido continua lendo e recebendo recibo", () => {
  localStorage.setItem(ownerKey, JSON.stringify(SPLIT));
  assert.equal(guardians.applyReceipt("vx_dona", { author: "vx_a", splitId: "s1", x: 1, heldAt: 5 }), true);
  assert.deepEqual(guardians.countConfirmed("vx_dona"), { confirmed: 1, m: 2, n: 3 });
});

test("guardiões — cota cheia no mapa da dona: recordOwnerSplit e applyReceipt dizem false e a divisão antiga fica", () => {
  localStorage.setItem(ownerKey, JSON.stringify(SPLIT));
  const before = localStorage.getItem(ownerKey);
  fullFor(ownerKey);
  assert.equal(guardians.recordOwnerSplit("vx_dona", { splitId: "s2", m: 2, guardians: ["vx_a", "vx_b", "vx_c"] }), false);
  assert.equal(guardians.applyReceipt("vx_dona", { author: "vx_a", splitId: "s1", x: 1, heldAt: 5 }), false);
  assert.equal(localStorage.getItem(ownerKey), before);
  assert.equal(guardians.getOwnerSplit("vx_dona").splitId, "s1");
});

test("guardiões — enviar com cota cheia no mapa da dona devolve storage-full em vez de lançar", async () => {
  const { owner, ids } = await setup(3);
  fullFor(`vox-guardians-v1:${owner}`);
  const res = await flow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, []));
  assert.equal(res.ok, false);
  assert.equal(res.reason, "storage-full");
});

// ---- account-exit ----

test("saídas da conta — array, número ou string no registro contam como vazio e não viram chaves de índice", async (t) => {
  for (const raw of ["[1,2]", "42", '"texto"', "null", "{quebrado"]) {
    await t.test(raw, () => {
      localStorage.setItem("vox-account-exits-v1:vx_a", raw);
      assert.deepEqual(getAccountExits("vx_a"), {});
      assert.equal(markAccountExit("frase", "vx_a", 7), true);
      assert.deepEqual(read("vox-account-exits-v1:vx_a"), { frase: 7 });
    });
  }
});

// ---- local-account.js: achados, ainda sem correção (arquivo fora do escopo) ----

const TODO = { todo: "local-account.js fora do escopo (lock do PR #218): corrigir em PR próprio" };

test("local-account — lista de contas que não é mapa não quebra nem perde a conta ativa", TODO, async (t) => {
  for (const raw of ["null", "[]", "[1,2]", "42", '"texto"', "{quebrado"]) {
    await t.test(raw, async () => {
      await localAccount.wipeLocalAccount();
      localStorage.clear();
      const acc = await localAccount.ensureLocalAccount();
      localStorage.setItem("vox-accounts-vault-v1", raw);
      const entry = await localAccount.syncActiveAccountToVault();
      assert.equal(entry?.routeId, acc.routeId);
      const stored = read("vox-accounts-vault-v1");
      assert.ok(isRecord(stored) && stored[acc.routeId], "a conta ativa está na lista gravada");
    });
  }
});
