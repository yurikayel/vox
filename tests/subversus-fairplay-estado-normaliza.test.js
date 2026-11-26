/**
 * @file SUB-01: normalização do bloco `fairplay` (entrada não confiável): filtro de mapas, tetos de ops por par e
 * por rolagem, `seq` e selo. Asserts de comportamento sobre `vtt-fairplay-state`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ADMIT_EVENTS_PER_ACTOR, MAX_KEY_OPS_PER_ACTOR, MAX_LOGGED_ROLLS, fairplayOf, normalizeFairplayState, pickMap, seal,
} from "../client/js/dungeon/vtt-fairplay-state.js";

const range = (n) => Array.from({ length: n }, (_, i) => ({ i }));

test("pickMap: só chaves seguras com valor objeto; entrada que não é objeto vira vazio", () => {
  assert.deepEqual(pickMap(null), {});
  assert.deepEqual(pickMap("texto"), {});
  assert.deepEqual(pickMap(7), {});
  const raw = JSON.parse('{"ok":{"a":1},"__proto__":{"x":1},"constructor":{"x":1},"num":3,"nulo":null,"txt":"t"}');
  assert.deepEqual(Object.keys(pickMap(raw)), ["ok"]);
  assert.equal(Object.getPrototypeOf(pickMap(raw)), Object.prototype);
});

test("ops de chave: só listas, e só as últimas MAX_KEY_OPS_PER_ACTOR por par", () => {
  const fp = normalizeFairplayState({ ops: { keys: { ana: range(MAX_KEY_OPS_PER_ACTOR + 3), bia: { nao: "lista" }, cai: range(2) } } });
  assert.deepEqual(Object.keys(fp.ops.keys).sort(), ["ana", "cai"]);
  assert.equal(fp.ops.keys.ana.length, MAX_KEY_OPS_PER_ACTOR);
  assert.equal(fp.ops.keys.ana[0].i, 3, "os mais antigos saem primeiro");
  assert.equal(fp.ops.keys.cai.length, 2);
});

test("ops de admissão: objeto solto vira lista, itens que não são objeto saem, teto por par", () => {
  const fp = normalizeFairplayState({ ops: { admit: { ana: { lamport: 1 }, bia: [{ lamport: 2 }, null, "x", 3], cai: range(MAX_ADMIT_EVENTS_PER_ACTOR + 2) } } });
  assert.deepEqual(fp.ops.admit.ana, [{ lamport: 1 }]);
  assert.deepEqual(fp.ops.admit.bia, [{ lamport: 2 }]);
  assert.equal(fp.ops.admit.cai.length, MAX_ADMIT_EVENTS_PER_ACTOR);
  assert.equal(fp.ops.admit.cai[0].i, 2);
});

test("rolagens guardadas: exige ops em lista e seq finito, fica com as MAX_LOGGED_ROLLS de maior seq", () => {
  const rolls = { semOps: { seq: 1, ops: "x" }, semSeq: { seq: "abc", ops: [] }, boa: { seq: 2, ops: [{ a: 1 }], extra: "some" } };
  for (let i = 0; i < MAX_LOGGED_ROLLS + 2; i += 1) rolls[`r${i}`] = { seq: 100 + i, ops: [] };
  const out = normalizeFairplayState({ ops: { rolls } }).ops.rolls;
  assert.equal(Object.keys(out).length, MAX_LOGGED_ROLLS);
  assert.equal(Object.hasOwn(out, "semOps"), false, "seq válido sem ops em lista");
  assert.equal(Object.hasOwn(out, "semSeq"), false, "ops em lista sem seq finito");
  assert.equal(Object.hasOwn(out, "boa"), false, "as de menor seq saem primeiro");
  assert.equal(Object.hasOwn(out, `r${MAX_LOGGED_ROLLS + 1}`), true);
  const poucas = normalizeFairplayState({ ops: { rolls: { semOps: { seq: 7, ops: "x" }, semSeq: { seq: "abc", ops: [] }, boa: { seq: 2, ops: [] } } } }).ops.rolls;
  assert.deepEqual(Object.keys(poucas), ["boa"], "sem teto à vista, só a entrada completa fica");
  assert.deepEqual(normalizeFairplayState({ ops: { rolls: { boa: rolls.boa } } }).ops.rolls, { boa: { seq: 2, ops: [{ a: 1 }] } }, "só seq e ops");
});

test("seq do log: o maior entre o salvo e o das rolagens; negativo ou lixo vira 0; entrada que não é objeto vira vazio", () => {
  const seq = (ops) => normalizeFairplayState({ ops }).ops.seq;
  assert.equal(seq({ seq: 9, rolls: { a: { seq: 4, ops: [] } } }), 9);
  assert.equal(seq({ seq: 2, rolls: { a: { seq: 4, ops: [] } } }), 4);
  assert.equal(seq({ seq: -5 }), 0);
  assert.equal(seq({ seq: "lixo" }), 0);
  assert.equal(seq("texto"), 0);
  assert.deepEqual(normalizeFairplayState({ ops: null }).ops, { seq: 0, admit: {}, keys: {}, rolls: {} });
  assert.deepEqual(normalizeFairplayState(null), { keys: {}, rolls: {}, admitted: {}, revoked: {}, ops: { seq: 0, admit: {}, keys: {}, rolls: {} } });
  assert.deepEqual(normalizeFairplayState("x").keys, {});
});

test("selo: bloco selado volta o mesmo objeto; sem selo é copiado e selado; fairplayOf lê do estado", () => {
  const sealed = seal({ keys: {}, rolls: {}, admitted: {}, revoked: {}, ops: { seq: 0, admit: {}, keys: {}, rolls: {} } });
  assert.equal(normalizeFairplayState(sealed), sealed);
  const raw = { keys: { a: { k: 1 } } };
  const fp = normalizeFairplayState(raw);
  assert.notEqual(fp, raw);
  assert.equal(normalizeFairplayState(fp), fp, "o resultado já vem selado");
  assert.equal(fairplayOf({ fairplay: sealed }), sealed);
  assert.deepEqual(fairplayOf({}).keys, {});
});
