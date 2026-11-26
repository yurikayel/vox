/**
 * @file HUD de jogo, parte 2b (spec hud-jogo-v0): painéis em meia tela, atalhos, foco ao abrir e fechar, sem modal.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { HUD_PANELS, HUD_SHORTCUT_ZONE, closeHudPanel, isHudPanelEnabled, hudPanelKeyJob, isHudPanelKey, isTextTarget, openHudPanel, takeHudPanelFocus, toggleHudPanel } from "../client/js/dungeon/hud-panels.js";
import { CHRONICLE_LIMIT, renderHudPanel, renderHudPanelButtons } from "../client/js/dungeon/screen-hud-panels.js";
import { renderMapHud } from "../client/js/dungeon/screen-map-hud.js";
import { runHudOp } from "../client/js/dungeon/dungeon-hud-actions.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { handleCanvasKeydown } from "../client/js/dungeon/dungeon-controller.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";

const HOSTILE = `"><img src=x onerror=alert(1)>`;
const inMesa = (tagName = "BUTTON") => ({ tagName, closest: (sel) => (sel.includes("mapHero") ? {} : null) });
const key = (k, extra = {}) => ({ key: k, target: inMesa(), preventDefault() { this.prevented = true; }, ...extra });
const sheet = () => ({ character_id: "ana", char_id: "ana", name: "Lyra", attributes_lww: { name: "Lyra", armor_class: 12 }, pools_base: { hp_max: 10 }, delta_ledger: [], sheet_meta: { clickable_actions: [] } });
const player = (extra = {}) => ({ sheet: sheet(), viewerRole: "player", chronicle: [], ...extra });

test("painéis: cinco, com atalho de uma letra única e sem Tab", () => {
  assert.deepEqual(HUD_PANELS.map((p) => p.id), ["sheet", "items", "abilities", "map", "chronicle"]);
  assert.equal(new Set(HUD_PANELS.map((p) => p.key)).size, 5);
  assert.ok(HUD_PANELS.every((p) => /^[a-z]$/.test(p.key)));
});

test("abrir, trocar, fechar e alternar; id desconhecido não abre", () => {
  const s = { sheet: sheet() };
  assert.equal(openHudPanel(s, "nada"), false);
  assert.equal(s.hudPanel, undefined);
  assert.equal(openHudPanel(s, "items"), true);
  assert.equal(openHudPanel(s, "map"), true);
  assert.equal(s.hudPanel, "map");
  assert.equal(toggleHudPanel(s, "map"), true);
  assert.equal(s.hudPanel, "");
  assert.equal(closeHudPanel(s), false);
});

test("foco: abrir leva ao painel; fechar volta ao botão que abriu; entrega uma vez só", () => {
  const s = { sheet: sheet() };
  openHudPanel(s, "items");
  assert.equal(takeHudPanelFocus(s), "[data-hud-panel-body]");
  assert.equal(takeHudPanelFocus(s), "");
  closeHudPanel(s);
  assert.equal(takeHudPanelFocus(s), `[data-hud-op="panel-open"][data-panel-id="items"]`);
});

test("teclado: letra abre o painel, Esc fecha, campo de texto e modificador ignoram", async () => {
  const s = { sheet: sheet() };
  const ev = key("c");
  await hudPanelKeyJob(s, ev);
  assert.equal(s.hudPanel, "sheet");
  assert.equal(ev.prevented, true);
  await hudPanelKeyJob(s, key("I"));
  assert.equal(s.hudPanel, "items");
  assert.equal(hudPanelKeyJob(s, key("c", { target: inMesa("INPUT") })), undefined);
  assert.equal(hudPanelKeyJob(s, key("c", { ctrlKey: true })), undefined);
  assert.equal(hudPanelKeyJob(s, key("x")), undefined);
  assert.equal(s.hudPanel, "items");
  await hudPanelKeyJob(s, key("Escape"));
  assert.equal(s.hudPanel, "");
  assert.equal(hudPanelKeyJob(s, key("Escape")), undefined);
});

test("campo de texto: input, textarea, select e contenteditable; Tab não é atalho", () => {
  for (const t of [{ tagName: "input" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }]) assert.equal(isTextTarget(t), true);
  assert.equal(isTextTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTextTarget(null), false);
  assert.equal(isHudPanelKey(key("Tab")), false);
});

test("botão do painel e fechar despacham por hud-op; o mesmo botão abre e fecha", async () => {
  assert.equal(typeof ACTION_HANDLERS["hud-op"], "function");
  const s = { sheet: sheet() };
  const open = { dataset: { hudOp: "panel-open", panelId: "chronicle" } };
  await runHudOp(s, open);
  assert.equal(s.hudPanel, "chronicle");
  await runHudOp(s, open);
  assert.equal(s.hudPanel, "");
  await runHudOp(s, open);
  await runHudOp(s, { dataset: { hudOp: "panel-close" } });
  assert.equal(s.hudPanel, "");
});

test("render: barra com aria-expanded, painel sem aria-modal, nome e botão Fechar", () => {
  assert.equal([...renderHudPanelButtons(player()).matchAll(/aria-expanded="false"/g)].length, 5);
  const state = player({ hudPanel: "items" });
  assert.match(renderHudPanelButtons(state), /data-panel-id="items"[^>]*aria-expanded="true"/);
  const html = renderHudPanel(state, undefined);
  assert.match(html, /aria-label="Itens"/);
  assert.match(html, /data-hud-op="panel-close"/);
  assert.ok(!html.includes("aria-modal"));
  assert.equal(renderHudPanel(player({ hudPanel: "" })), "");
  assert.equal(renderHudPanel({ hudPanel: "items" }), "");
});

test("render: cada painel abre e o HUD da Mesa traz a barra e o painel", () => {
  for (const p of HUD_PANELS) assert.match(renderHudPanel(player({ hudPanel: p.id }), { tokens: [], floors: [] }), new RegExp(`data-hud-panel="${p.id}"`), p.id);
  const html = renderMapHud(player({ hudPanel: "sheet" }), { tokens: [] });
  assert.match(html, /class="dungeon-hud-panel-bar/);
  assert.match(html, /id="dungeon-hud-panel"/);
});

test("escape: nome de token, cena e crônica definidos pela mesa não viram HTML", () => {
  const scene = { name: HOSTILE, activeFloorZ: 0, floors: [{ z: 0 }], tokens: [{ tokenId: "t", name: HOSTILE, x: HOSTILE, y: 1, floorZ: 0, layer: "player" }] };
  assert.ok(!renderHudPanel(player({ hudPanel: "map" }), scene).includes("<img"));
  const entry = { speaker: HOSTILE, badge: HOSTILE, text: HOSTILE, visibility: "public" };
  assert.ok(!renderHudPanel(player({ hudPanel: "chronicle", viewerRole: "gm", chronicle: [entry] }), undefined).includes("<img"));
});

test("visão do jogador: o painel Mapa não lista token da camada do Mestre; a crônica esconde o que é do Mestre", () => {
  const scene = { name: "Cripta", activeFloorZ: 0, floors: [{ z: 0 }], tokens: [{ tokenId: "a", name: "Aliado", x: 1, y: 1, floorZ: 0, layer: "player" }, { tokenId: "g", name: "Emboscada", x: 2, y: 2, floorZ: 0, layer: "gm" }] };
  const map = renderHudPanel(player({ hudPanel: "map" }), scene);
  assert.match(map, /Aliado/);
  assert.ok(!map.includes("Emboscada"));
  assert.match(renderHudPanel(player({ hudPanel: "map", viewerRole: "gm" }), scene), /Emboscada/);
  const chronicle = [{ speaker: "Mestre", badge: "Rolagem GM", text: "segredo-do-mestre", visibility: "gm" }, { speaker: "Mestre", badge: "Nota", text: "publico", visibility: "public" }];
  const html = renderHudPanel(player({ hudPanel: "chronicle", chronicle }), undefined);
  assert.match(html, /publico/);
  assert.ok(!html.includes("segredo-do-mestre"));
});

test("tela: Esc e a letra chegam ao painel pelo teclado da Mesa; fora da Mesa e em campo de texto, não", async () => {
  const state = createDungeonSessionState();
  const container = { querySelector: () => null, querySelectorAll: () => [], ownerDocument: null };
  const run = (opts, ev) => handleCanvasKeydown(container, { state, ...opts }, ev, (job) => job);
  await run({ screen: "mesa" }, key("c"));
  assert.equal(state.hudPanel, "sheet");
  assert.equal(run({ screen: "ficha" }, key("i")), undefined);
  assert.equal(state.hudPanel, "sheet");
  assert.equal(run({ screen: "mesa" }, key("i", { target: inMesa("INPUT") })), undefined);
  await run({ screen: "mesa" }, key("Escape"));
  assert.equal(state.hudPanel, "");
});

test("redesenho: depois de abrir pelo teclado, o foco é pedido ao corpo do painel; ao fechar, ao botão", async () => {
  const state = createDungeonSessionState();
  const asked = [];
  const container = { innerHTML: "", dataset: {}, querySelector: (sel) => { asked.push(sel); return null; }, querySelectorAll: () => [], contains: () => false, ownerDocument: null };
  const opts = { state, screen: "mesa" };
  await handleCanvasKeydown(container, opts, key("c"));
  assert.ok(asked.includes("[data-hud-panel-body]"), asked.join("|"));
  asked.length = 0;
  await handleCanvasKeydown(container, opts, key("Escape"));
  assert.ok(asked.includes(`[data-hud-op="panel-open"][data-panel-id="sheet"]`), asked.join("|"));
});

test("teclado: Meta+C e Alt+C não abrem painel", () => {
  const s = { sheet: sheet() };
  assert.equal(hudPanelKeyJob(s, key("c", { metaKey: true })), undefined);
  assert.equal(hudPanelKeyJob(s, key("c", { altKey: true })), undefined);
  assert.equal(isHudPanelKey(key("c", { metaKey: true })), false);
  assert.equal(s.hudPanel, undefined);
});

test("WCAG 2.1.4: a letra só vale com o foco dentro da área da Mesa; fora dela, nada", () => {
  const s = { sheet: sheet() };
  const outside = { tagName: "BUTTON", closest: () => null };
  assert.equal(hudPanelKeyJob(s, key("c", { target: outside })), undefined);
  assert.equal(isHudPanelKey(key("c", { target: outside })), false);
  assert.equal(isHudPanelKey(key("c", { target: { tagName: "BODY" } })), false);
  assert.equal(isHudPanelKey(key("c", { target: undefined })), false);
  assert.equal(s.hudPanel, undefined);
  assert.equal(isHudPanelKey(key("c")), true);
});

test("a11y: o alvo do foco do painel é o título com tabindex -1 (focável)", () => {
  const html = renderHudPanel(player({ hudPanel: "items" }), undefined);
  assert.match(html, /<h3 tabindex="-1" data-hud-panel-body>Itens<\/h3>/);
});

test("a11y: rótulos de constante (sem escape), aria-label do Fechar e aria-controls só com o painel aberto", () => {
  const html = renderHudPanel(player({ hudPanel: "abilities" }), undefined);
  assert.match(html, /aria-label="Fechar painel Habilidades"/);
  assert.match(html, /<section id="dungeon-hud-panel"[^>]*aria-label="Habilidades"/);
  const closed = renderHudPanelButtons(player());
  assert.ok(!closed.includes("aria-controls"));
  const open = renderHudPanelButtons(player({ hudPanel: "map" }));
  assert.equal([...open.matchAll(/aria-controls="dungeon-hud-panel"/g)].length, 1);
  assert.match(open, /data-panel-id="map"[^>]*aria-expanded="true" aria-controls="dungeon-hud-panel"/);
  assert.match(renderHudPanel(player({ hudPanel: "chronicle" }), undefined), /id="dungeon-hud-panel"/);
});

test("crônica: o painel mostra só as últimas 20 entradas", () => {
  assert.equal(CHRONICLE_LIMIT, 20);
  const chronicle = Array.from({ length: 25 }, (_, i) => ({ speaker: "Narrador", badge: "Nota", text: `entrada-${i}-fim`, visibility: "public" }));
  const html = renderHudPanel(player({ hudPanel: "chronicle", chronicle }), undefined);
  assert.equal([...html.matchAll(/dungeon-turn-card/g)].length, 20);
  assert.ok(!html.includes("entrada-4-fim"));
  assert.match(html, /entrada-5-fim/);
  assert.match(html, /entrada-24-fim/);
});

test("sem ficha: Ficha, Itens e Habilidades ficam desabilitados e não abrem; Mapa e Crônica seguem", () => {
  const none = { viewerRole: "player", chronicle: [] };
  const html = renderHudPanelButtons(none);
  for (const id of ["sheet", "items", "abilities"]) {
    assert.match(html, new RegExp(`aria-disabled="true" data-panel-id="${id}"`), id);
    assert.equal(isHudPanelEnabled(none, id), false);
    assert.equal(openHudPanel({ ...none }, id), false);
  }
  assert.equal([...html.matchAll(/aria-disabled="true"/g)].length, 3);
  assert.equal([...html.matchAll(/aria-expanded="false"/g)].length, 2);
  assert.ok(!html.includes('data-panel-id="sheet" aria-expanded'));
  assert.equal(openHudPanel({ ...none }, "map"), true);
  assert.equal(renderHudPanel({ ...none, hudPanel: "items" }, undefined), "");
  assert.match(renderHudPanel({ ...none, hudPanel: "map" }, { name: "Cripta", floors: [], tokens: [] }), /data-hud-panel="map"/);
  assert.ok(!renderHudPanelButtons({ ...none, hudPanel: "items" }).includes('data-panel-id="items" aria-expanded="true"'));
});

test("WCAG 2.1.4: o seletor da área bate com a zona que a view da Mesa renderiza e contém a barra e o painel", () => {
  const zone = /^\[data-dungeon-zone="([^"]+)"\]$/.exec(HUD_SHORTCUT_ZONE)?.[1];
  assert.ok(zone, HUD_SHORTCUT_ZONE);
  const state = createDungeonSessionState({ viewerRole: "player" });
  state.hudPanel = "chronicle";
  const html = renderTableScreen(state);
  const open = html.indexOf(`data-dungeon-zone="${zone}"`);
  assert.ok(open >= 0, `a Mesa não renderiza data-dungeon-zone="${zone}"`);
  assert.equal(html.indexOf(`data-dungeon-zone="${zone}"`, open + 1), -1, "a zona é única");
  const bar = html.indexOf('class="dungeon-hud-panel-bar');
  const roster = html.indexOf("dungeon-token-roster");
  assert.ok(bar > open && bar < roster, "a barra fica dentro da zona (antes da lista de tokens, que é da zona)");
  const panel = html.indexOf('id="dungeon-hud-panel"');
  assert.ok(panel > open && panel < roster, "o painel fica dentro da zona");
});
