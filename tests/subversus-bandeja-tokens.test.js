/**
 * @file Bandeja de tokens do Mestre (SUB-26): só o Mestre vê e usa; "Adicionar ao mapa" grava `TOKEN_UPSERT` no estado,
 * na primeira célula livre, sem op nova; ficha não ganha dois tokens; alvos de toque de 44 px no CSS.
 */
import "./setup.js";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { getActiveScene } from "../client/js/dungeon/dungeon-scene-actions.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { ensureDungeonLayoutStyles, SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";

const SHEETS = {
  s1: { character_id: "s1", attributes_lww: { name: "Gareth" }, pools_base: { hp_max: 31 } },
  s2: { character_id: "s2", attributes_lww: { name: "Lyra" }, pools_base: { hp_max: 18 } },
};

let state;
beforeEach(() => {
  state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  state.campaign = { sheetsById: SHEETS };
});

const tokens = () => getActiveScene(state).tokens;
const byName = (n) => tokens().find((t) => t.name === n);

function trayButton(attrs, form = {}) {
  const root = { querySelector: (sel) => form[sel] ?? null };
  return { dataset: attrs, closest: (sel) => (sel === "[data-token-tray]" ? root : null) };
}

const click = (el) => ACTION_HANDLERS["tray-add"](state, el, null, {});

test("o Mestre vê a bandeja com as fichas da mesa e o token simples; o jogador não vê nada", () => {
  const gm = renderTableScreen(state);
  assert.match(gm, /data-token-tray/);
  assert.match(gm, /Adicionar ao mapa/);
  assert.match(gm, /data-sheet-id="s1"/);
  assert.match(gm, /Gareth/);
  state.viewerRole = "player";
  const player = renderTableScreen(state);
  for (const leak of ["data-token-tray", "tray-add", "Adicionar ao mapa", "dungeon-tray-name"]) assert.equal(player.includes(leak), false, leak);
});

test("Adicionar ao mapa de uma ficha grava o token ligado à ficha, com os PV dela", async () => {
  assert.equal(typeof ACTION_HANDLERS["tray-add"], "function");
  await click(trayButton({ trayKind: "sheet", sheetId: "s1" }));
  const gareth = byName("Gareth");
  assert.ok(gareth, "o token entrou na cena do estado");
  assert.deepEqual([gareth.sheetId, gareth.layer, gareth.hpMax, gareth.hpCurrent], ["s1", "player", 31, 31]);
  assert.match(state.mapNotice, /Gareth.*adicionado ao mapa/);
});

test("a ficha que já tem token no mapa não ganha um segundo; a bandeja mostra 'No mapa'", async () => {
  assert.equal(typeof ACTION_HANDLERS["tray-add"], "function");
  await click(trayButton({ trayKind: "sheet", sheetId: "s1" }));
  const before = tokens().length;
  await click(trayButton({ trayKind: "sheet", sheetId: "s1" }));
  assert.equal(tokens().length, before);
  assert.match(state.mapNotice, /já está no mapa/);
  assert.match(renderTableScreen(state), /<button[^>]*disabled[^>]*>No mapa<\/button>/);
});

test("token simples usa o nome digitado e vai à Camada do Mestre quando 'oculto'", async () => {
  assert.equal(typeof ACTION_HANDLERS["tray-add"], "function");
  await click(trayButton({ trayKind: "simple" }, { "#dungeon-tray-name": { value: "  Goblin " }, "#dungeon-tray-hidden": { checked: true } }));
  const goblin = byName("Goblin");
  assert.deepEqual([goblin.layer, goblin.hpMax], ["gm", 20]);
  assert.match(state.mapNotice, /Camada do Mestre/);
  await click(trayButton({ trayKind: "simple" }, { "#dungeon-tray-name": { value: "" } }));
  assert.equal(byName("Token").layer, "player", "sem nome: 'Token', visível");
});

test("cada token entra numa célula livre diferente", async () => {
  assert.equal(typeof ACTION_HANDLERS["tray-add"], "function");
  const before = tokens().length;
  for (const sheetId of ["s1", "s2"]) await click(trayButton({ trayKind: "sheet", sheetId }));
  await click(trayButton({ trayKind: "simple" }, { "#dungeon-tray-name": { value: "Orc" } }));
  const cells = tokens().map((t) => `${t.floorZ}:${t.x},${t.y}`);
  assert.equal(tokens().length, before + 3);
  assert.equal(new Set(cells).size, cells.length, "nenhum token em cima de outro");
});

test("fora do Mestre a ação não grava nada", async () => {
  assert.equal(typeof ACTION_HANDLERS["tray-add"], "function");
  state.viewerRole = "player";
  const before = tokens().length;
  await click(trayButton({ trayKind: "sheet", sheetId: "s1" }));
  await click(trayButton({ trayKind: "simple" }, { "#dungeon-tray-name": { value: "Intruso" } }));
  assert.equal(tokens().length, before);
});

test("CSS: alvos de toque de 44 px, bottom sheet no celular e gaveta à esquerda no desktop", () => {
  const block = readFileSync(new URL("../client/css/sv-token-tray.css", import.meta.url), "utf8");
  assert.match(block, /\.dungeon-token-tray summary[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(block, /\.dungeon-token-tray \.dungeon-chip-btn[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(block, /bottom:\s*0/);
  assert.match(block, /@media \(min-width:\s*768px\)[\s\S]*left:\s*0/);
});

function fakeDoc() {
  const listeners = {};
  const links = [];
  return {
    links,
    head: { appendChild: (el) => links.push(el) },
    getElementById: (id) => links.find((l) => l.id === id) ?? null,
    createElement: () => ({ id: "", rel: "", href: "" }),
    addEventListener: (type, fn, capture) => { listeners[type] = { fn, capture }; },
    fire: (type, target) => listeners[type]?.fn({ target }),
    listeners,
  };
}

test("o link de sv-token-tray.css só entra quando a bandeja abre, uma vez, e a folha do legado não cresce", () => {
  const doc = fakeDoc();
  ensureDungeonLayoutStyles(doc);
  ensureDungeonLayoutStyles(doc);
  assert.equal(doc.listeners.toggle?.capture, true, "toggle não borbulha: escuta em captura");
  const mesa = ["css/dungeon-layout.css", ...SV_SHEETS.map((s) => s.href)];
  assert.deepEqual(doc.links.map((l) => l.href), mesa, "fechada: só as folhas da Mesa, sem a da bandeja");
  doc.fire("toggle", { dataset: { dungeonDetails: "token-tray" }, open: false });
  doc.fire("toggle", { dataset: { dungeonDetails: "sheet-audit" }, open: true });
  assert.equal(doc.links.length, mesa.length, "fechar a bandeja ou abrir outro details não injeta");
  doc.fire("toggle", { dataset: { dungeonDetails: "token-tray" }, open: true });
  doc.fire("toggle", { dataset: { dungeonDetails: "token-tray" }, open: true });
  assert.deepEqual(doc.links.map((l) => l.href), [...mesa, "css/sv-token-tray.css"]);
  const legacy = readFileSync(new URL("../client/css/dungeon-layout.css", import.meta.url), "utf8").split("\n").length;
  assert.ok(legacy <= 369, `dungeon-layout.css é legado acima de 350 linhas e não cresce (${legacy})`);
});

test("CSS: toda var(--x) da bandeja está definida nas folhas de tema (sem token fantasma)", () => {
  const read = (name) => readFileSync(new URL(`../client/css/${name}`, import.meta.url), "utf8");
  const theme = `${read("style.css")}\n${read("agora.css")}`;
  const used = [...read("sv-token-tray.css").matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  assert.ok(used.length >= 3, "a folha usa tokens de tema");
  for (const name of new Set(used)) assert.match(theme, new RegExp(`${name}\s*:`), `${name} não existe nas folhas de tema`);
});
