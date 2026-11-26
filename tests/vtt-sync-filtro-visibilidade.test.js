/**
 * @file Filtro de visibilidade do Mestre para jogadores (`filterOpForPlayer`): cada tipo de op devolve exatamente o que o
 * jogador pode receber (nada, a própria op, uma cópia sem o campo do Mestre ou "peça um novo snapshot"). Foco em não-vazamento.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";

const PLAYER = "vx_jogador";
const OTHER = "vx_outro";
const REFRESH = { refreshSnapshot: true };
const REVEALED = { id: "r", x: 0, y: 0, w: 256, h: 256 };

const floor = (z, fog) => ({ z, grid: { cellPx: 64 }, fog, doors: [] });
const FOG_ON = { enabled: true, revealedRects: [REVEALED] };
const FOG_OFF = { enabled: false, revealedRects: [] };

/** Cena "s1" ativa com piso 0 aberto e piso 1 com névoa; cena "s2" com névoa. */
function campaign({ activeFloorZ = 0 } = {}) {
  const s1 = {
    sceneId: "s1",
    activeFloorZ,
    floors: [floor(0, FOG_OFF), floor(1, FOG_ON)],
    tokens: [
      { tokenId: "jogador", layer: "player", floorZ: 0, x: 1, y: 1 },
      { tokenId: "mestre", layer: "gm", floorZ: 0, x: 1, y: 1 },
      { tokenId: "no-andar-1-visto", layer: "player", floorZ: 1, x: 1, y: 1 },
      { tokenId: "no-andar-1-oculto", layer: "player", floorZ: 1, x: 20, y: 20 },
    ],
  };
  const s2 = { sceneId: "s2", activeFloorZ: 0, floors: [floor(0, FOG_ON)], tokens: [{ tokenId: "outra-cena", layer: "player", floorZ: 0, x: 20, y: 20 }] };
  return { activeSceneId: "s1", scenesById: { s1, s2 } };
}

const filter = (op, c = campaign(), viewer = PLAYER) => filterOpForPlayer(c, op, viewer);

test("ops que mudam a visão do jogador pedem um novo snapshot, sem carregar dado nenhum", () => {
  for (const type of ["TOKEN_LAYER_SET", "TOKEN_REMOVE", "FOG_SET", "DOOR_STATE_SET", "INITIATIVE_SET_ENTRY", "INITIATIVE_NEXT"]) {
    assert.deepEqual(filter({ type, payload: { segredo: "x" } }), REFRESH, type);
  }
});

test("sem tipo ou sem op: nada segue; tipo sem filtro segue como está", () => {
  assert.equal(filterOpForPlayer(campaign(), null, PLAYER), null);
  assert.equal(filterOpForPlayer(campaign(), {}, PLAYER), null);
  const op = { type: "TIPO_DESCONHECIDO", payload: { a: 1 } };
  assert.equal(filter(op), op);
});

test("TOKEN_MOVE: token do Mestre ou inexistente não segue; com névoa ligada pede snapshot; sem névoa segue", () => {
  const move = (tokenId) => ({ type: "TOKEN_MOVE", payload: { sceneId: "s1", tokenId, x: 2, y: 2 } });
  assert.equal(filter(move("mestre")), null);
  assert.equal(filter(move("nao-existe")), null);
  const op = move("jogador");
  assert.equal(filter(op), op, "piso aberto: a própria op");
  assert.deepEqual(filter(move("no-andar-1-visto")), REFRESH, "piso com névoa ligada pede snapshot");
  assert.deepEqual(filter(move("no-andar-1-oculto")), REFRESH);
});

test("TOKEN_MOVE: a cena vem do payload; sem sceneId vale a cena ativa", () => {
  const move = (payload) => ({ type: "TOKEN_MOVE", payload });
  assert.deepEqual(filter(move({ sceneId: "s2", tokenId: "outra-cena" })), REFRESH);
  assert.equal(filter(move({ sceneId: "s1", tokenId: "outra-cena" })), null, "esse token não existe na cena s1");
  const op = move({ tokenId: "jogador" });
  assert.equal(filter(op), op, "sem sceneId: cena ativa s1");
});

test("TOKEN_CHANGE_FLOOR: token do Mestre não segue; os demais (e o desconhecido) pedem snapshot", () => {
  const op = (tokenId) => ({ type: "TOKEN_CHANGE_FLOOR", payload: { sceneId: "s1", tokenId, floorZ: 1 } });
  assert.equal(filter(op("mestre")), null);
  assert.deepEqual(filter(op("jogador")), REFRESH);
  assert.deepEqual(filter(op("nao-existe")), REFRESH);
});

test("TOKEN_UPSERT: camada do Mestre não segue; novo ou à vista segue; na névoa pede snapshot", () => {
  const up = (token, sceneId = "s1") => ({ type: "TOKEN_UPSERT", payload: { sceneId, token } });
  assert.equal(filter(up({ tokenId: "novo", layer: "gm" })), null);
  const novo = up({ tokenId: "novo", layer: "player", x: 20, y: 20 });
  assert.equal(filter(novo), novo, "token novo (ainda sem estado) segue");
  const visto = up({ tokenId: "jogador", layer: "player" });
  assert.equal(filter(visto), visto, "existente e à vista");
  assert.deepEqual(filter(up({ tokenId: "no-andar-1-oculto", layer: "player" })), REFRESH, "existente e na névoa");
  assert.deepEqual(filter(up({ tokenId: "outra-cena", layer: "player" }, "s2")), REFRESH);
});

const door = (x) => ({ doorId: "d", x1: x, y1: 1, x2: x + 1, y2: 1, state: "closed" });
const doorOp = (payload) => ({ type: "DOOR_UPSERT", payload });

test("DOOR_UPSERT: porta secreta nunca segue", () => {
  assert.equal(filter(doorOp({ sceneId: "s1", floorZ: 0, door: { ...door(1), state: "secret" } })), null);
});

test("DOOR_UPSERT: sem porta, sem piso ou à vista segue; porta fora da área revelada pede snapshot", () => {
  const semPorta = doorOp({ sceneId: "s1", floorZ: 1 });
  assert.equal(filter(semPorta), semPorta);
  const semPiso = doorOp({ sceneId: "s1", floorZ: 9, door: door(20) });
  assert.equal(filter(semPiso), semPiso);
  const aberta = doorOp({ sceneId: "s1", floorZ: 0, door: door(20) });
  assert.equal(filter(aberta), aberta, "piso sem névoa: tudo à vista");
  const vista = doorOp({ sceneId: "s1", floorZ: 1, door: door(1) });
  assert.equal(filter(vista), vista);
  assert.deepEqual(filter(doorOp({ sceneId: "s1", floorZ: 1, door: door(20) })), REFRESH);
});

test("DOOR_UPSERT: o piso padrão é o ativo da cena e a cena padrão é a ativa", () => {
  assert.deepEqual(filter(doorOp({ sceneId: "s1", door: door(20) }), campaign({ activeFloorZ: 1 })), REFRESH);
  const aberto = doorOp({ sceneId: "s1", door: door(20) });
  assert.equal(filter(aberto, campaign({ activeFloorZ: 0 })), aberto);
  assert.deepEqual(filter(doorOp({ floorZ: 0, door: door(20) }), { ...campaign(), activeSceneId: "s2" }), REFRESH, "cena ativa s2 tem névoa");
  assert.deepEqual(filter(doorOp({ sceneId: "s2", floorZ: 0, door: door(20) })), REFRESH);
});

test("DRAWING_ADD e AOE_UPSERT: camada do Mestre não segue; a do jogador segue", () => {
  for (const [type, key] of [["DRAWING_ADD", "drawing"], ["AOE_UPSERT", "aoe"]]) {
    assert.equal(filter({ type, payload: { [key]: { layer: "gm" } } }), null, type);
    const op = { type, payload: { [key]: { layer: "player" } } };
    assert.equal(filter(op), op, type);
    const semItem = { type, payload: {} };
    assert.equal(filter(semItem), semItem, type);
  }
});

test("NOTE_UPSERT e SHEET_UPSERT: o segredo do Mestre sai da cópia e o original fica intacto", () => {
  const note = { type: "NOTE_UPSERT", payload: { note: { id: "n", publicMarkdown: "pista", gmSecretMarkdown: "SEGREDO" } } };
  const outNote = filter(note);
  assert.deepEqual(outNote.payload.note, { id: "n", publicMarkdown: "pista", gmSecretMarkdown: "" });
  assert.equal(note.payload.note.gmSecretMarkdown, "SEGREDO");
  const sheet = { type: "SHEET_UPSERT", payload: { sheet: { id: "f", sheet_meta: { notes_gm: "SEGREDO", notes: "ok" } } } };
  const outSheet = filter(sheet);
  assert.deepEqual(outSheet.payload.sheet.sheet_meta, { notes_gm: "", notes: "ok" });
  assert.equal(sheet.payload.sheet.sheet_meta.notes_gm, "SEGREDO");
  const semMeta = { type: "SHEET_UPSERT", payload: { sheet: { id: "f" } } };
  assert.equal(filter(semMeta), semMeta);
  const semNota = { type: "NOTE_UPSERT", payload: {} };
  assert.equal(filter(semNota), semNota);
});

test("ROLL_RECORDED: às cegas e do Mestre para outro par não seguem; públicas e as próprias seguem", () => {
  const roll = (payload, actor = OTHER) => ({ type: "ROLL_RECORDED", actor, payload });
  const publica = roll({ rollResult: { visibility: "public" } });
  assert.equal(filter(publica), publica);
  const semVis = roll({});
  assert.equal(filter(semVis), semVis, "sem visibilidade vale pública");
  assert.equal(filter(roll({ rollResult: { visibility: "blind" } })), null);
  assert.equal(filter(roll({ visibility: "blind" })), null);
  assert.equal(filter(roll({ rollResult: { visibility: "gm" } })), null);
  assert.equal(filter(roll({ visibility: "gm" })), null);
  const propria = roll({ rollResult: { visibility: "gm" } }, PLAYER);
  assert.equal(filter(propria), propria, "o autor vê a própria rolagem");
  assert.equal(filter(roll({ rollResult: { visibility: "blind" }, visibility: "public" })), null, "rollResult tem precedência");
  const publicaVence = roll({ rollResult: { visibility: "public" }, visibility: "blind" });
  assert.equal(filter(publicaVence), publicaVence, "rollResult tem precedência (pública)");
});
