/**
 * @file A Crônica respeita a visibilidade também no envio: `filterOpForPlayer` aplica a `CHRONICLE_APPEND` a mesma regra
 * das rolagens (pública passa, só do Mestre passa só para o autor, cega não passa).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";

const GM = "vx_mestre";
const PLAYER = "vx_jogador";
const entry = (visibility, actor = GM) => ({ type: "CHRONICLE_APPEND", actor, payload: { visibility, text: "texto" } });
const send = (op, viewer = PLAYER) => filterOpForPlayer({}, op, viewer);

test("a) entrada só do Mestre de outro autor não é enviada ao jogador", () => {
  assert.equal(send(entry("gm")), null);
});

test("b) entrada cega nunca é enviada, nem ao autor", () => {
  assert.equal(send(entry("blind")), null);
  assert.equal(send(entry("blind", GM), GM), null);
});

test("c) entrada pública passa inteira", () => {
  const op = entry("public");
  assert.equal(send(op), op);
});

test("d) entrada sem visibilidade informada vale como pública", () => {
  const op = { type: "CHRONICLE_APPEND", actor: GM, payload: { text: "texto" } };
  assert.equal(send(op), op);
});

test("e) o autor da entrada só do Mestre ainda a recebe", () => {
  const op = entry("gm", PLAYER);
  assert.equal(send(op, PLAYER), op);
});
