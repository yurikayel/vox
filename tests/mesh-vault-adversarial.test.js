/**
 * Cofre na malha (ADR-037), módulo base, caçando bugs: relógio controlado, limites exatos, data do cofre no futuro ou
 * velha, endereço malformado e armazenamento corrompido. Só o módulo `vault/mesh-vault.js`; o fluxo entre aparelhos
 * (veto forjado, pedidos concorrentes, corrida da volta) está em `mesh-vault-adversarial-flow.test.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";

const HOUR = 60 * 60 * 1000;
const A1 = "a".repeat(64);
const NOW = 1_800_000_000_000;
const RECORD = { v: 2, salt: "s", iv: "i", ct: "c".repeat(500) };

/** Cofre cujo JSON tem exatamente `chars` caracteres. */
function recordOfLength(chars) {
  const base = JSON.stringify({ v: 2, ct: "" }).length;
  return { v: 2, ct: "x".repeat(chars - base) };
}

const guard = (over = {}) => ({ author: "vx_dona", address: A1, record: RECORD, updatedAt: NOW, ...over });
const reqAt = (t, over = {}) => ({ t, firstSeen: t, ...over });

test.beforeEach(() => localStorage.clear());

test("espera — 24 h contadas do aviso: 1 ms antes espera, na hora entrega; \"sim\" entrega antes, \"não\" nunca", () => {
  const r = reqAt(NOW);
  assert.equal(mesh.decideRequest(r, NOW + mesh.WAIT_MS - 1), "wait");
  assert.equal(mesh.decideRequest(r, NOW + mesh.WAIT_MS), "release");
  assert.equal(mesh.decideRequest({ ...r, decision: "sim" }, NOW + HOUR), "release");
  assert.equal(mesh.decideRequest({ ...r, decision: "nao" }, NOW + 100 * HOUR), "drop");
  assert.equal(mesh.decideRequest({ ...r, decision: "nao" }, NOW + mesh.WAIT_MS), "drop", "veto vence a espera");
  assert.equal(mesh.decideRequest({ ...r, answered: true }, NOW + 30 * HOUR), "drop", "já entregue não entrega de novo");
});

test("espera — pedido com mais de 72 h não entrega, nem com \"sim\" nem passadas as 24 h", () => {
  const max = mesh.REQUEST_MAX_AGE_MS;
  assert.equal(mesh.decideRequest(reqAt(NOW, { decision: "sim" }), NOW + max), "release", "no limite ainda vale");
  assert.equal(mesh.decideRequest(reqAt(NOW, { decision: "sim" }), NOW + max + 1), "drop");
  assert.equal(mesh.decideRequest(reqAt(NOW, { firstSeen: NOW + 60 * HOUR }), NOW + max + 1), "drop");
  assert.equal(mesh.decideRequest(reqAt(NOW - 71 * HOUR, { firstSeen: NOW }), NOW + mesh.WAIT_MS), "drop", "visto tarde");
});

test("espera — pedido guardado ilegível nunca entrega (data do aviso ausente ou não numérica)", () => {
  for (const firstSeen of [null, undefined, "0", "", NaN, Infinity, {}]) {
    assert.notEqual(mesh.decideRequest({ t: NOW, firstSeen }, NOW + 100 * HOUR), "release", `firstSeen=${String(firstSeen)}`);
    assert.notEqual(mesh.decideRequest({ t: NOW, firstSeen, decision: "sim" }, NOW), "release", `sim, firstSeen=${String(firstSeen)}`);
  }
  for (const t of [undefined, "1", NaN, null]) assert.notEqual(mesh.decideRequest({ t, firstSeen: 0, decision: "sim" }, NOW), "release");
  assert.equal(mesh.decideRequest(null, NOW), "drop");
});

test("pedido — limites exatos: 72 h e 5 min de relógio adiantado entram, 1 ms além sai", () => {
  const k = mesh.buildRequest({ publicJwk: { kty: "EC", crv: "P-256", x: "A".repeat(43), y: "B".repeat(43) }, now: NOW }).k;
  const text = (t, over = {}) => JSON.stringify({ type: mesh.REQUEST_TYPE, v: 0, k, t, n: "n", ...over });
  const max = mesh.REQUEST_MAX_AGE_MS;
  assert.ok(mesh.parseRequest(text(NOW - max), NOW));
  assert.equal(mesh.parseRequest(text(NOW - max - 1), NOW), null);
  assert.ok(mesh.parseRequest(text(NOW + 5 * 60 * 1000), NOW));
  assert.equal(mesh.parseRequest(text(NOW + 5 * 60 * 1000 + 1), NOW), null);
  for (const t of ["1", null, NaN, Infinity]) assert.equal(mesh.parseRequest(text(t), NOW), null, `t=${String(t)}`);
  assert.equal(mesh.parseRequest(text(NOW, { n: 7 }), NOW), null, "nonce não texto");
  assert.equal(mesh.parseRequest(text(NOW, { k: "curta" }), NOW), null, "chave temporária inválida");
});

test("cofre guardado — no limite exato do teto entra; um caractere acima é recusado (guarda e cofre da dona)", () => {
  const max = mesh.MAX_RECORD_CHARS;
  assert.equal(JSON.stringify(recordOfLength(max)).length, max);
  assert.equal(mesh.acceptGuard(guard({ record: recordOfLength(max) }), NOW), "ok");
  assert.equal(mesh.acceptGuard(guard({ author: "vx_outra", record: recordOfLength(max + 1) }), NOW), "invalid");
  assert.equal(Object.keys(mesh.loadHeld()).length, 1);
  localStorage.clear();
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: recordOfLength(max), updatedAt: NOW });
  assert.ok(mesh.loadMine(), "no teto");
  localStorage.clear();
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: recordOfLength(max + 1), updatedAt: NOW });
  assert.equal(mesh.loadMine(), null, "acima do teto");
});

test("cofre guardado — o que não é um cofre-objeto é recusado (lista, texto, número, nulo)", () => {
  for (const record of [[], ["x"], "texto", 7, null, undefined, true]) {
    assert.equal(mesh.acceptGuard(guard({ record }), NOW), "invalid", JSON.stringify(record) ?? "undefined");
  }
  assert.deepEqual(mesh.loadHeld(), {});
});

test("rollback — versão igual ou mais velha não troca o cofre mais novo; a mais nova troca", () => {
  const newer = { ...RECORD, ct: "novo" };
  assert.equal(mesh.acceptGuard(guard({ record: newer, updatedAt: NOW }), NOW), "ok");
  for (const updatedAt of [NOW, NOW - 1, 0, -5]) {
    assert.equal(mesh.acceptGuard(guard({ updatedAt, record: { ...RECORD, ct: "velho" } }), NOW), "stale", `updatedAt=${updatedAt}`);
  }
  assert.equal(mesh.loadHeld().vx_dona.record.ct, "novo");
  assert.equal(mesh.acceptGuard(guard({ updatedAt: NOW + 1, record: { ...RECORD, ct: "mais novo" } }), NOW + 1), "ok");
  assert.equal(mesh.loadHeld().vx_dona.record.ct, "mais novo");
});

test("rollback — data no futuro não trava as trocas seguintes (relógio da dona errado)", () => {
  assert.equal(mesh.acceptGuard(guard({ updatedAt: NOW + HOUR }), NOW), "ok", "uma hora à frente ainda vale");
  localStorage.clear();
  for (const updatedAt of [NOW + HOUR + 1, NOW + 24 * HOUR, 9e15, Number.MAX_VALUE]) {
    assert.equal(mesh.acceptGuard(guard({ updatedAt }), NOW), "invalid", `updatedAt=${updatedAt}`);
  }
  assert.deepEqual(mesh.loadHeld(), {}, "nada foi guardado");
  assert.equal(mesh.acceptGuard(guard({ updatedAt: NOW + 5 }), NOW + 5), "ok", "a troca de senha seguinte passa");
});

test("rollback — data que não é número finito é recusada", () => {
  for (const updatedAt of ["100", null, undefined, NaN, Infinity, -Infinity, {}, [5]]) {
    assert.equal(mesh.acceptGuard(guard({ updatedAt }), NOW), "invalid", String(updatedAt));
  }
});

test("endereço malformado — só 64 hexadecimais minúsculos, em texto, valem", () => {
  const bad = ["", "a".repeat(63), "a".repeat(65), "A".repeat(64), `${A1}\n`, ` ${A1}`, `0x${"a".repeat(62)}`, "g".repeat(64), null, undefined, 7];
  for (const address of bad) {
    assert.equal(mesh.isVaultAddress(address), false, JSON.stringify(address));
    assert.equal(mesh.acceptGuard(guard({ address }), NOW), "invalid", JSON.stringify(address));
  }
  assert.equal(mesh.isVaultAddress(A1), true);
  assert.equal(mesh.isVaultAddress("0123456789abcdef".repeat(4)), true);
});

test("endereço malformado — objeto que só vira texto de um endereço não passa por endereço", () => {
  for (const address of [[A1], new String(A1), { toString: () => A1 }]) {
    assert.equal(mesh.isVaultAddress(address), false);
    assert.equal(mesh.acceptGuard(guard({ address }), NOW), "invalid");
    mesh.rememberMine({ routeId: "vx_dona", address, record: RECORD, updatedAt: NOW });
    assert.equal(mesh.loadMine(), null);
  }
});

test("mais de 7 guardiões — nunca passa de 7, guardiões primeiro, sem repetir nem contar quem já recebeu", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `vx_${i}`);
  assert.deepEqual(mesh.pickHolders({}, ids), ids.slice(0, 7));
  assert.deepEqual(mesh.pickHolders({}, [...ids, ...ids]), ids.slice(0, 7), "repetidos contam uma vez");
  assert.deepEqual(mesh.pickHolders({ sentTo: ids.slice(0, 5) }, ids), ids.slice(5, 7), "só as 2 vagas que sobram");
  assert.deepEqual(mesh.pickHolders({ sentTo: ids.slice(0, 7) }, ids), []);
  assert.deepEqual(mesh.pickHolders({ sentTo: ids.slice(0, 9) }, ids), [], "lista de enviados maior que 7: nada");
  assert.deepEqual(mesh.pickHolders({ previousHolders: ids.slice(8, 12) }, ids), [...ids.slice(8, 12), ...ids.slice(0, 3)]);
  assert.deepEqual(mesh.pickHolders({}, ["", null, undefined, "vx_a"]), ["vx_a"], "vazios não ocupam vaga");
});

test("cofre desta conta — salvar duas vezes antes de mandar não perde quem já guardava o cofre velho", () => {
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: RECORD, updatedAt: NOW });
  mesh.markSent(["vx_a", "vx_b"]);
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: RECORD, updatedAt: NOW + 1 });
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: RECORD, updatedAt: NOW + 2 });
  mesh.rememberMine({ routeId: "vx_dona", address: A1, record: RECORD, updatedAt: NOW + 3 });
  assert.deepEqual([...mesh.loadMine().previousHolders].sort(), ["vx_a", "vx_b"], "ainda são os dois com a cópia velha");
  assert.deepEqual(mesh.pickHolders(mesh.loadMine(), []), ["vx_a", "vx_b"], "voltam a receber a cópia nova");
  mesh.rememberMine({ routeId: "vx_outra", address: A1, record: RECORD, updatedAt: NOW + 4 });
  assert.deepEqual(mesh.loadMine().previousHolders, [], "outra conta não herda");
});

const GARBAGE = ["", "null", "[]", "{}", "[1,2]", "\"texto\"", "123", "true", "{nao e json", "{\"a\":null}", "[null,5,{}]"];

test("armazenamento corrompido — nenhuma leitura derruba e a forma devolvida é sempre a esperada", () => {
  for (const key of [mesh.HELD_STORAGE, mesh.MINE_STORAGE, mesh.NOTICES_STORAGE, mesh.PENDING_STORAGE]) {
    for (const raw of GARBAGE) {
      localStorage.setItem(key, raw);
      const where = `${key} = ${raw}`;
      const held = mesh.loadHeld();
      assert.ok(held && typeof held === "object" && !Array.isArray(held), where);
      assert.equal(typeof mesh.heldCount(), "number", where);
      assert.ok(Array.isArray(mesh.loadNotices()), where);
      assert.doesNotThrow(() => mesh.loadMine(), where);
      assert.doesNotThrow(() => mesh.loadPending(NOW), where);
      assert.doesNotThrow(() => mesh.addNotice({ holder: "vx_h", requestId: "r", firstSeen: NOW }), where);
      assert.doesNotThrow(() => mesh.takeNotices("r"), where);
      localStorage.clear();
    }
  }
});

test("armazenamento corrompido — lista no lugar do mapa de cofres: guardar funciona e a cópia fica", () => {
  localStorage.setItem(mesh.HELD_STORAGE, "[]");
  assert.equal(mesh.acceptGuard(guard(), NOW), "ok");
  assert.ok(mesh.loadHeld().vx_dona, "o que foi aceito precisa estar guardado");
});

test("armazenamento corrompido — aviso sem forma é descartado, os bons seguem", () => {
  const good = { holder: "vx_h", requestId: "r1", firstSeen: NOW };
  localStorage.setItem(mesh.NOTICES_STORAGE, JSON.stringify([null, 5, {}, { holder: 1 }, { ...good, firstSeen: "x" }, good]));
  assert.deepEqual(mesh.loadNotices(), [good]);
  assert.equal(mesh.addNotice({ holder: "vx_h", requestId: "r2", firstSeen: NOW }), true);
  assert.equal(mesh.takeNotices("r1").length, 1);
});

test("armazenamento corrompido — pedido em andamento sem data válida não fica para sempre", () => {
  for (const request of [{}, { t: "1" }, { t: null }, { t: NaN }, { k: "x" }]) {
    localStorage.setItem(mesh.PENDING_STORAGE, JSON.stringify({ address: A1, request }));
    assert.equal(mesh.loadPending(NOW + 1000 * HOUR), null, JSON.stringify(request));
  }
  localStorage.setItem(mesh.PENDING_STORAGE, JSON.stringify({ address: A1, request: { t: NOW } }));
  assert.ok(mesh.loadPending(NOW + mesh.REQUEST_MAX_AGE_MS), "válido até o limite");
  assert.equal(mesh.loadPending(NOW + mesh.REQUEST_MAX_AGE_MS + 1), null);
});
