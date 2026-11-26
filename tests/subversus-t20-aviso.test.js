/**
 * Aviso de não afiliação visível no seletor de sistema da ficha (T20 e GURPS).
 * @module tests/subversus-t20-aviso
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { renderSystemSelect } from "../client/js/dungeon/screen-sheet-derived.js";
import { T20_ATTRIBUTION } from "../client/js/dungeon/system-pack-t20.js";

const fichaT20 = () => ({ id: "ficha-t20", name: "Aria", system: { id: "t20", version: 1 } });

test("t20: o seletor de sistema mostra o aviso da Jambô e liga o campo a ele", () => {
  const html = renderSystemSelect(fichaT20());
  assert.match(html, /Jambô Editora/);
  assert.match(html, /<select[^>]*aria-describedby="sheet-system-notices"/);
  assert.match(html, /<p class="dungeon-muted" role="note" id="sheet-system-notices">/);
});

test("t20: a atribuição do pacote cita a Jambô Editora", () => {
  assert.match(T20_ATTRIBUTION, /Jambô Editora/);
});

test("gurps: o mesmo aviso do seletor cita a Steve Jackson Games", () => {
  assert.match(renderSystemSelect(fichaT20()), /Steve Jackson Games/);
});
