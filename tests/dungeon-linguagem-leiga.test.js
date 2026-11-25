/**
 * @file Linguagem leiga na ficha e no Escudo do Mestre: o HTML gerado não traz siglas de implementação.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applySheetResourceDelta, createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";

const BLACKLIST = [/CRDT/i, /OR-Set/i, /Delta-Ledger/i, /\bRRF\b/, /Saldo Negativo/i, /Hybrid/i, /Lamport/i];

function assertPlain(html, label) {
  for (const term of BLACKLIST) assert.doesNotMatch(html, term, `${label}: termo técnico ${term}`);
}

test("linguagem leiga: a ficha, com gasto além do saldo e mochila, não usa siglas de implementação", () => {
  const state = createDungeonSessionState({ peerAliases: {} });
  applySheetResourceDelta(state, "coins", -999, "Gasto grande");
  const html = renderSheetScreen(state);
  assertPlain(html, "ficha");
  assert.match(html, /Proteção contra gasto além do saldo/);
  assert.match(html, /Ficha guardada neste aparelho/);
  assert.match(html, /Inventário compartilhado/);
});

test("linguagem leiga: a ficha mantém o botão de teste da proteção, agora com texto claro", () => {
  const html = renderSheetScreen(createDungeonSessionState({ peerAliases: {} }));
  assert.match(html, /data-dungeon="test-overdraft">Testar proteção contra gasto além do saldo</);
  assert.match(html, /<summary>Para conferir: como a ficha é guardada<\/summary>/);
  assert.match(html, /Editar Dados da Ficha/);
});

test("linguagem leiga: o Escudo do Mestre não usa siglas de implementação", () => {
  const state = createDungeonSessionState({ peerAliases: {} });
  assertPlain(renderDmScreen(state), "escudo");
  assertPlain(renderDmScreen({ ...state, coDmWhispers: null, activeRoute: null }), "escudo mínimo");
});
