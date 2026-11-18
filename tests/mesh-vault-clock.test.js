/**
 * Cofre na malha (ADR-037), relógio (LT-05 do plano de testes do login): bordas exatas das regras de tempo de
 * `client/js/vault/mesh-vault.js`, sempre com `now` injetado. Pedido do futuro só passa com até 5 min de folga; a
 * entrega sai em 24 h exatas depois de quem guarda ver o pedido; o pedido vence em 72 h exatas. O caso do relógio
 * de quem guarda voltando no tempo, com aparelhos e relay, está em `tests/mesh-vault-flow.test.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import * as cryptoDm from "../client/js/crypto-dm.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);

async function requestText(t) {
  const { publicJwk } = await cryptoDm.generateDmKeypair();
  return JSON.stringify(mesh.buildRequest({ publicJwk, now: t, nonce: "n-relogio" }));
}

test("relógio — as regras de tempo são as do ADR-037 (24 h de espera, 72 h de validade)", () => {
  assert.equal(mesh.WAIT_MS, 24 * HOUR);
  assert.equal(mesh.REQUEST_MAX_AGE_MS, 72 * HOUR);
});

test("relógio — pedido do futuro: até 5 min de folga passa, 1 ms além é recusado", async () => {
  assert.ok(mesh.parseRequest(await requestText(T0 + 5 * MIN), T0), "5 min no futuro é atraso de relógio aceito");
  assert.equal(mesh.parseRequest(await requestText(T0 + 5 * MIN + 1), T0), null);
  assert.equal(mesh.parseRequest(await requestText(T0 + HOUR), T0), null, "1 h no futuro");
});

test("relógio — pedido velho: 72 h exatas ainda vale, 1 ms depois é recusado", async () => {
  const text = await requestText(T0);
  assert.ok(mesh.parseRequest(text, T0 + 72 * HOUR));
  assert.equal(mesh.parseRequest(text, T0 + 72 * HOUR + 1), null);
});

test("relógio — entrega em 24 h exatas depois de visto: 23h59m59s espera, 24 h entrega", () => {
  const req = { t: T0, firstSeen: T0 + 2 * HOUR };
  assert.equal(mesh.decideRequest(req, req.firstSeen + 24 * HOUR - 1000), "wait");
  assert.equal(mesh.decideRequest(req, req.firstSeen + 24 * HOUR - 1), "wait");
  assert.equal(mesh.decideRequest(req, req.firstSeen + 24 * HOUR), "release");
});

test("relógio — a espera conta de quando quem guarda viu, não de quando o pedido foi feito", () => {
  const req = { t: T0, firstSeen: T0 + 10 * HOUR };
  assert.equal(mesh.decideRequest(req, T0 + 24 * HOUR), "wait", "24 h do pedido, só 14 h de visto");
  assert.equal(mesh.decideRequest(req, T0 + 34 * HOUR), "release");
});

test("relógio — guardado vence em 72 h exatas do pedido: no limite segue, 1 ms depois descarta", () => {
  const waiting = { t: T0, firstSeen: T0 + 60 * HOUR };
  assert.equal(mesh.decideRequest(waiting, T0 + 72 * HOUR), "wait", "visto tarde: ainda não fez 24 h");
  assert.equal(mesh.decideRequest(waiting, T0 + 72 * HOUR + 1), "drop", "venceu antes de completar a espera");
  const approved = { t: T0, firstSeen: T0, decision: "sim" };
  assert.equal(mesh.decideRequest(approved, T0 + 72 * HOUR), "release");
  assert.equal(mesh.decideRequest(approved, T0 + 72 * HOUR + 1), "drop", "aprovação não estica a validade");
});

test("relógio — relógio de quem guarda antes do firstSeen não entrega nem quebra", () => {
  const req = { t: T0, firstSeen: T0 + HOUR };
  for (const now of [T0 + HOUR - 3 * HOUR, T0 - 48 * HOUR, 0]) {
    assert.equal(mesh.decideRequest(req, now), "wait", `now=${now}`);
  }
});

test("relógio — pedido guardado no aparelho novo some depois de 72 h", () => {
  localStorage.clear();
  mesh.savePending({ request: { t: T0 }, requestId: "r" });
  assert.ok(mesh.loadPending(T0 + 72 * HOUR));
  assert.equal(mesh.loadPending(T0 + 72 * HOUR + 1), null);
});
