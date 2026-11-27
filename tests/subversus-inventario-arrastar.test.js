/**
 * @file Arrastar no inventário (SUB-25b): veredito "não cabe aí" igual ao do reducer, ponto→célula, teclado
 * (Enter, setas, R, Esc), toque longo de 300 ms, `rot` não booleano recusado e `place` de quem não é dono barrado.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyInventoryMutation, listInventoryItems } from "../client/js/dungeon/vtt-inventory.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { CAMPAIGN_OP_HANDLERS, isPlayerAuthorizedForCampaignOp } from "../client/js/dungeon/vtt-campaign-reducer.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";

const drag = await import("../client/js/dungeon/inventory-drag.js").catch(() => ({}));
const item = (id, label, extra = {}) => ({ id, label, qty: 1, weightLb: 0, equipped: false, ...extra });
const sheetWith = (...labels) => labels.reduce((sheet, label) => applyInventoryMutation(sheet, "add", { label }), {});
const byLabel = (sheet) => Object.fromEntries(listInventoryItems(sheet.inventory_orset).map((it) => [it.label, it]));

test("o módulo do arrastar exporta a API combinada", () => {
  for (const name of ["dropVerdict", "cellFromPoint", "keyboardStep", "createPointerDrag"]) assert.equal(typeof drag[name], "function", name);
  assert.equal(drag.LONG_PRESS_MS, 300);
  assert.equal(drag.NO_FIT_MESSAGE, "Não cabe aí.");
});

test("place com rot não booleano é recusado (ficha idêntica); booleano segue valendo", () => {
  const base = sheetWith("Espada");
  for (const rot of ["true", 1, "", {}, []]) {
    const out = applyInventoryMutation(base, "place", { itemId: "espada", x: 7, y: 0, rot });
    assert.deepEqual(out, base, `rot=${JSON.stringify(rot)}`);
  }
  assert.equal(byLabel(applyInventoryMutation(base, "place", { itemId: "espada", x: 7, y: 0, rot: true })).Espada.rot, true);
  assert.equal(byLabel(applyInventoryMutation(base, "place", { itemId: "espada", x: 7, y: 0 })).Espada.x, 7);
});

test("place de quem não é dono da ficha não passa pelo portão; o dono passa e grava", () => {
  const sheets = { s1: { ...sheetWith("Escudo"), character_id: "s1", owner_pubkey_p256: "vx_dono" } };
  const camp = { ...createCampaign({ id: "c1" }), sheetsById: sheets };
  const op = (actor) => createVttOp({ opId: `op-${actor}`, type: "INVENTORY_MUTATE", lamport: 1, actor, ts: 1_700_000_000, payload: { sheetId: "s1", kind: "place", itemId: "escudo", x: 4, y: 1 } });
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, op("vx_intruso"), false), false);
  assert.equal(isPlayerAuthorizedForCampaignOp(camp, op("vx_dono"), false), true);
  const next = CAMPAIGN_OP_HANDLERS.INVENTORY_MUTATE(camp, op("vx_dono"));
  assert.equal(byLabel(next.sheetsById.s1).Escudo.x, 4);
});

test("dropVerdict concorda com o reducer: livre, fora, ocupado, equipado e inexistente", () => {
  const items = [item("a", "Escudo", { x: 0, y: 0 }), item("b", "Espada", { x: 5, y: 0 }), item("c", "Anel", { equipped: true })];
  assert.equal(drag.dropVerdict(items, "b", { x: 7, y: 0 }).ok, true);
  assert.equal(drag.dropVerdict(items, "b", { x: 5, y: 1 }).ok, true, "1×3 em y=1 vai até y=3: cabe");
  assert.equal(drag.dropVerdict(items, "b", { x: 5, y: 2 }).reason, "fora", "em y=2 passaria da última linha");
  assert.equal(drag.dropVerdict(items, "b", { x: 1, y: 1 }).reason, "ocupado", "toca o Escudo 2×2");
  assert.equal(drag.dropVerdict(items, "b", { x: 8, y: 0, rot: true }).reason, "fora", "girada vira 3×1 e passa de x=9");
  assert.equal(drag.dropVerdict(items, "b", { x: 6, y: 0, rot: true }).ok, true);
  assert.equal(drag.dropVerdict(items, "a", { x: 3, y: 3, rot: true }).ok, false, "quadrado ignora rot e sai da grade em y=3");
  assert.equal(drag.dropVerdict(items, "c", { x: 4, y: 0 }).reason, "sem-item", "equipado não vai à grade");
  assert.equal(drag.dropVerdict(items, "zz", { x: 4, y: 0 }).reason, "sem-item");
  assert.equal(drag.dropVerdict(items, "b", { x: 1.5, y: 0 }).reason, "fora");
  assert.equal(drag.dropVerdict(items, "b", { x: 7, y: 0 }).message, "", "ok não traz aviso");
  assert.equal(drag.dropVerdict(items, "b", { x: 1, y: 1 }).message, "Não cabe aí.");
});

test("dropVerdict ok ⇒ o reducer grava a mesma posição; recusa ⇒ o reducer não grava", () => {
  const sheet = applyInventoryMutation(applyInventoryMutation(sheetWith("Escudo", "Espada"), "place", { itemId: "escudo", x: 0, y: 0 }), "place", { itemId: "espada", x: 5, y: 0 });
  const items = listInventoryItems(sheet.inventory_orset);
  for (const spot of [{ x: 7, y: 0 }, { x: 1, y: 1 }, { x: 6, y: 0, rot: true }, { x: 8, y: 0, rot: true }, { x: 5, y: 3 }]) {
    const placed = byLabel(applyInventoryMutation(sheet, "place", { itemId: "espada", ...spot })).Espada;
    assert.equal(placed.x === spot.x && placed.y === spot.y, drag.dropVerdict(items, "espada", spot).ok, JSON.stringify(spot));
  }
});

test("cellFromPoint: ponto na caixa vira célula (com a pegada do item); fora da caixa é null", () => {
  const box = { left: 100, top: 50, width: 440, height: 176 };
  assert.deepEqual(drag.cellFromPoint(box, { x: 100, y: 50 }), { x: 0, y: 0 });
  assert.deepEqual(drag.cellFromPoint(box, { x: 539, y: 225 }), { x: 9, y: 3 });
  assert.deepEqual(drag.cellFromPoint(box, { x: 100 + 44 * 3 + 5, y: 50 + 44 + 5 }), { x: 3, y: 1 });
  assert.deepEqual(drag.cellFromPoint(box, { x: 100 + 44 * 3 + 5, y: 50 + 44 * 2 + 5 }, { dx: 1, dy: 1 }), { x: 2, y: 1 });
  assert.equal(drag.cellFromPoint(box, { x: 99, y: 60 }), null);
  assert.equal(drag.cellFromPoint(box, { x: 540, y: 60 }), null);
  assert.equal(drag.cellFromPoint({ ...box, width: 0 }, { x: 100, y: 60 }), null);
});

test("teclado: Enter pega, setas movem sem sair da grade, R gira, Enter solta e Esc devolve", () => {
  const items = [item("b", "Espada", { x: 5, y: 0 }), item("a", "Escudo", { x: 0, y: 0 })];
  const step = (state, key) => drag.keyboardStep(state, key, { items, focusId: "b" });
  let r = step(null, "Enter");
  assert.deepEqual([r.state.id, r.state.x, r.state.y, r.action], ["b", 5, 0, null]);
  r = step(r.state, "ArrowRight");
  r = step(r.state, "ArrowDown");
  assert.deepEqual([r.state.x, r.state.y], [6, 1]);
  for (let i = 0; i < 6; i += 1) r = step(r.state, "ArrowRight");
  assert.equal(r.state.x, 9, "trava na borda direita");
  for (let i = 0; i < 6; i += 1) r = step(r.state, "ArrowDown");
  assert.equal(r.state.y, 1, "1×3 em y=1 já está na última linha possível");
  r = step(r.state, "r");
  assert.equal(r.state.rot, true);
  assert.equal(r.state.x, 7, "girada vira 3×1: a coluna recua para caber");
  r = step(r.state, "R");
  assert.equal(r.state.rot, false);
  r = step(r.state, "Escape");
  assert.deepEqual([r.state, r.action], [null, "cancel"]);
});

test("teclado: Enter sobre célula ocupada avisa 'Não cabe aí.' e segue segurando; em célula livre pede o place", () => {
  const items = [item("b", "Espada", { x: 5, y: 0 }), item("a", "Escudo", { x: 0, y: 0 })];
  const ctx = { items, focusId: "b" };
  let r = drag.keyboardStep(null, "Enter", ctx);
  for (let i = 0; i < 4; i += 1) r = drag.keyboardStep(r.state, "ArrowLeft", ctx);
  assert.equal(r.state.x, 1);
  r = drag.keyboardStep(r.state, "Enter", ctx);
  assert.equal(r.action, null);
  assert.equal(r.notice, "Não cabe aí.");
  assert.equal(r.state.id, "b", "continua segurando");
  r = drag.keyboardStep(r.state, "ArrowRight", ctx);
  r = drag.keyboardStep(r.state, "ArrowRight", ctx);
  r = drag.keyboardStep(r.state, "Enter", ctx);
  assert.deepEqual([r.action, r.state, r.place], ["place", null, { itemId: "b", x: 3, y: 0 }]);
});

test("teclado: sem item focado ou equipado, Enter não pega; tecla qualquer é ignorada", () => {
  const items = [item("c", "Anel", { equipped: true })];
  assert.equal(drag.keyboardStep(null, "Enter", { items, focusId: "c" }).state, null);
  assert.equal(drag.keyboardStep(null, "Enter", { items, focusId: "zz" }).state, null);
  assert.equal(drag.keyboardStep(null, "x", { items, focusId: "c" }).handled, false);
  assert.equal(drag.keyboardStep(null, "Enter", { items, focusId: "c" }).handled, true);
});

function fakeTimers() {
  const pending = [];
  return {
    setTimer: (fn, ms) => pending.push({ fn, ms }) && pending.length,
    clearTimer: (id) => { pending[id - 1] = null; },
    fire: () => pending.filter(Boolean).forEach((t) => t.fn()),
    pending,
  };
}

test("mouse: começa a arrastar depois de 4 px, solta com up; sem mexer é só clique", () => {
  const log = [];
  const t = fakeTimers();
  const p = drag.createPointerDrag({ ...t, onStart: (e) => log.push(["start", e.id]), onMove: (e) => log.push(["move", e.x]), onDrop: (e) => log.push(["drop", e.x]) });
  p.down({ id: "a", pointerType: "mouse", x: 10, y: 10 });
  p.move({ x: 12, y: 10 });
  assert.deepEqual(log, [], "2 px ainda é clique");
  p.move({ x: 20, y: 10 });
  p.up({ x: 30, y: 10 });
  assert.deepEqual(log, [["start", "a"], ["move", 20], ["drop", 30]]);
  assert.equal(t.pending.length, 0, "mouse não usa temporizador");
  log.length = 0;
  p.down({ id: "a", pointerType: "mouse", x: 10, y: 10 });
  p.up({ x: 10, y: 10 });
  assert.deepEqual(log, [], "sem arrastar não há drop");
});

test("toque: só arrasta depois de 300 ms parado; mexer antes cancela (rolagem); soltar antes cancela", () => {
  const log = [];
  const t = fakeTimers();
  const p = drag.createPointerDrag({ ...t, onStart: () => log.push("start"), onMove: () => log.push("move"), onDrop: () => log.push("drop") });
  p.down({ id: "a", pointerType: "touch", x: 10, y: 10 });
  assert.equal(t.pending[0].ms, 300);
  t.fire();
  p.move({ x: 14, y: 10 });
  p.up({ x: 14, y: 10 });
  assert.deepEqual(log, ["start", "move", "drop"]);
  log.length = 0;
  p.down({ id: "a", pointerType: "touch", x: 10, y: 10 });
  p.move({ x: 40, y: 10 });
  t.fire();
  assert.deepEqual(log, [], "mexeu antes dos 300 ms: é rolagem, não arrasto");
  p.down({ id: "a", pointerType: "touch", x: 10, y: 10 });
  p.up({ x: 10, y: 10 });
  t.fire();
  assert.deepEqual(log, [], "soltou antes dos 300 ms");
  assert.equal(p.active, false);
});

test("painel: célula da mochila é focável, tem id e dimensões para o arrastar e a dica de teclado", () => {
  const sheet = applyInventoryMutation(sheetWith("Espada"), "place", { itemId: "espada", x: 2, y: 0 });
  const html = renderInventoryPanel({ sheet: { inventoryItems: listInventoryItems(sheet.inventory_orset) } });
  assert.match(html, /data-inv-cell="espada"/);
  assert.match(html, /data-inv-w="1" data-inv-h="3"/);
  assert.match(html, /aria-keyshortcuts="Enter"/);
  assert.match(html, /data-inv-hint/);
  assert.match(html, /role="status"[^>]*data-inv-notice|data-inv-notice[^>]*role="status"/);
});

test("voxchar-v0.md documenta x, y e rot da mochila", () => {
  const doc = readFileSync(new URL("../docs/specs/voxchar-v0.md", import.meta.url), "utf8");
  assert.match(doc, /`x`[^\n]*`y`[^\n]*`rot`/);
});
