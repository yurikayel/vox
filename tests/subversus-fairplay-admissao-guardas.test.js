/**
 * @file SUB-01: guardas de `applyFairplayAdmit` (quem admite, alvo seguro, repetida, teto de pares) e de
 * `isAdmitted`/`isRevokedAt`, com asserts de comportamento (um mutante em cada guarda precisa quebrar um teste).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyFairplayAdmit, applyFairplayRevoke, isAdmitted, isRevokedAt } from "../client/js/dungeon/vtt-fairplay-admission.js";
import { MAX_KEYS, fairplayOf } from "../client/js/dungeon/vtt-fairplay-state.js";

const admit = (actor, target, lamport = 1) => ({ type: "FAIRPLAY_ADMIT", actor, lamport, payload: { actor: target } });
const campaign = (gmRouteId = "gm", admitted = {}) => ({ gmRouteId, fairplay: { admitted } });
const names = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { lamport: 1 }]));

test("só o Mestre admite: outro autor, campanha sem Mestre ou alvo inseguro não mudam o estado", () => {
  const st = campaign();
  assert.equal(applyFairplayAdmit(st, admit("ana", "bia")), st, "autor que não é o Mestre");
  const noGm = campaign("");
  assert.equal(applyFairplayAdmit(noGm, admit("", "bia")), noGm, "sem Mestre ninguém admite");
  for (const bad of ["__proto__", "constructor", ""]) assert.equal(applyFairplayAdmit(st, admit("gm", bad)), st, `alvo inseguro: ${bad}`);
  assert.equal(Object.hasOwn(fairplayOf(applyFairplayAdmit(st, admit("gm", "bia"))).admitted, "bia"), true, "o Mestre admite alvo seguro");
});

test("admitir de novo quem já está admitido não faz nada, mesmo com vaga sobrando", () => {
  const st = campaign("gm", { bia: { lamport: 1 } });
  assert.equal(applyFairplayAdmit(st, admit("gm", "bia", 9)), st);
  assert.equal(fairplayOf(st).admitted.bia.lamport, 1, "o lamport original fica");
});

test("teto de pares: o último lugar (MAX_KEYS) ainda admite e o seguinte é recusado", () => {
  const almost = campaign("gm", names(MAX_KEYS - 1));
  const full = applyFairplayAdmit(almost, admit("gm", "novo"));
  assert.equal(Object.keys(fairplayOf(full).admitted).length, MAX_KEYS, "ocupa a última vaga");
  assert.equal(applyFairplayAdmit(full, admit("gm", "extra")), full, "sem vaga, recusa");
  assert.equal(Object.hasOwn(fairplayOf(full).admitted, "extra"), false);
});

test("readmitir exige lamport maior que o da revogação; isAdmitted e isRevokedAt usam lamport estrito", () => {
  const admitted = applyFairplayAdmit(campaign(), admit("gm", "bia", 1));
  const revoked = applyFairplayRevoke(admitted, { type: "FAIRPLAY_REVOKE", actor: "gm", lamport: 5, payload: { actor: "bia" } });
  assert.equal(applyFairplayAdmit(revoked, admit("gm", "bia", 5)), revoked, "mesmo lamport da revogação: recusa");
  assert.equal(applyFairplayAdmit(revoked, admit("gm", "bia", 4)), revoked, "lamport menor: recusa");
  assert.equal(Object.hasOwn(fairplayOf(applyFairplayAdmit(revoked, admit("gm", "bia", 6))).admitted, "bia"), true, "maior: readmite");
  const fp = fairplayOf(admitted);
  assert.equal(isAdmitted(admitted, fp, { actor: "bia", lamport: 2 }), true);
  assert.equal(isAdmitted(admitted, fp, { actor: "bia", lamport: 1 }), false, "lamport igual ao da admissão não vale");
  assert.equal(isAdmitted(admitted, fp, { actor: "gm", lamport: 0 }), true, "o Mestre vale sempre");
  assert.equal(isRevokedAt(fairplayOf(revoked), { actor: "bia", lamport: 6 }), true);
  assert.equal(isRevokedAt(fairplayOf(revoked), { actor: "bia", lamport: 5 }), false, "lamport igual ao da revogação ainda vale");
});

const revoke = (actor, target, lamport = 5) => ({ type: "FAIRPLAY_REVOKE", actor, lamport, payload: { actor: target } });

test("revogar: só o Mestre, nunca ele mesmo, e só tira o alvo (os outros admitidos e suas chaves ficam)", () => {
  const st = { gmRouteId: "gm", fairplay: { admitted: { bia: { lamport: 1 }, cai: { lamport: 1 }, gm: { lamport: 1 } }, keys: { bia: { k: 1 }, cai: { k: 2 } } } };
  assert.equal(applyFairplayRevoke(st, revoke("ana", "bia")), st, "autor que não é o Mestre");
  assert.equal(applyFairplayRevoke(st, revoke("gm", "gm")), st, "o Mestre não se revoga");
  assert.equal(applyFairplayRevoke(st, revoke("gm", "desconhecido")), st, "par desconhecido");
  const fp = fairplayOf(applyFairplayRevoke(st, revoke("gm", "bia")));
  assert.deepEqual(Object.keys(fp.admitted).sort(), ["cai", "gm"], "só o alvo sai dos admitidos");
  assert.deepEqual(Object.keys(fp.keys), ["cai"], "só a chave do alvo sai");
  assert.equal(fp.revoked.bia.lamport, 5);
});
