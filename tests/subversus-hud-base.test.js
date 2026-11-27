/**
 * @file HUD de jogo, parte 2 (spec hud-jogo-v0): cinto 4×1, indicador de magia, favoritos e região viva estável.
 */
import "./setup.js";
import assert from "node:assert/strict";
import test from "node:test";
import { FAVORITES_MAX, normalizeFavorites, toggleFavorite } from "../client/js/dungeon/hud-favorites.js";
import { buildHudBelt, buildHudMagic, resolveHudFavorites } from "../client/js/dungeon/hud-bar-model.js";
import { syncHudLive } from "../client/js/dungeon/hud-live.js";
import { renderHudStatus } from "../client/js/dungeon/screen-hud-status.js";
import { renderMapHud } from "../client/js/dungeon/screen-map-hud.js";
import { buildHudShortcuts } from "../client/js/dungeon/sheet-view-model.js";
import { ensureSheetMeta } from "../client/js/dungeon/vtt-schema.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { updateSheetBasicInfo, mutateSheetInventory } from "../client/js/dungeon/dungeon-persistence.js";
import { toggleHudFavorite, useBeltItem } from "../client/js/dungeon/dungeon-hud-actions.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";

const item = (id, label, qty, tags = ["consumivel"]) => ({ id, label, qty, weightLb: 0, equipped: false, tags });
const inv = (...items) => Object.fromEntries(items.map((i) => [i.id, i]));

test("favoritos: normaliza lixo, repetição e teto de 6", () => {
  assert.deepEqual(normalizeFavorites("x"), []);
  assert.deepEqual(normalizeFavorites(["action:a", "action:a", "lixo", 3, "item:b c", "item:b"]), ["action:a", "item:b"]);
  const many = Array.from({ length: 9 }, (_, i) => `item:i${i}`);
  assert.equal(normalizeFavorites(many).length, FAVORITES_MAX);
  assert.deepEqual(normalizeFavorites(["item:" + "x".repeat(49)]), []);
});

test("favoritos: ligar, desligar, barra cheia e chave inválida", () => {
  assert.deepEqual(toggleFavorite([], "item:a"), { favorites: ["item:a"], changed: true });
  assert.deepEqual(toggleFavorite(["item:a"], "item:a"), { favorites: [], changed: true });
  const full = ["a", "b", "c", "d", "e", "f"].map((x) => `item:${x}`);
  assert.deepEqual(toggleFavorite(full, "item:g"), { favorites: full, changed: false });
  assert.equal(toggleFavorite(full, "item:a").changed, true);
  assert.equal(toggleFavorite([], "nada").changed, false);
});

test("ficha: sheet_meta.favorites sobrevive ao ensureSheetMeta e lixo é descartado", () => {
  const keep = ensureSheetMeta({ sheet_meta: { favorites: ["item:a", "lixo"] } });
  assert.deepEqual(keep.sheet_meta.favorites, ["item:a"]);
  assert.deepEqual(ensureSheetMeta({}).sheet_meta.favorites, []);
});

test("cinto: 4 vagas, só consumíveis com quantidade, por rótulo; vaga vazia é null", () => {
  const sheet = { inventory_orset: inv(item("b", "Poção B", 2), item("a", "Poção A", 1), item("e", "Espada", 1, []), item("d", "Dardo", 3), item("c", "Cura", 1), item("f", "Fogo", 1)) };
  const belt = buildHudBelt(sheet);
  assert.equal(belt.length, 4);
  assert.deepEqual(belt.map((s) => s.label), ["Cura", "Dardo", "Fogo", "Poção A"]);
  assert.deepEqual(buildHudBelt({ inventory_orset: inv(item("a", "A", 1)) }).map((s) => s === null), [false, true, true, true]);
  assert.deepEqual(buildHudBelt(null), [null, null, null, null]);
});

test("magia: só com máximo acima de zero; atual vem dos espaços restantes; rótulo do pacote", () => {
  const sheet = { system: { id: PACK_5E.id }, pools_base: { hp_max: 10, spell_slots_max: { l1: 3, l2: 1, l3: 0 } }, delta_ledger: [] };
  assert.deepEqual(buildHudMagic(sheet), { label: "Espaços de magia", text: "4/4" });
  assert.equal(buildHudMagic({ pools_base: { hp_max: 10, spell_slots_max: { l1: 0, l2: 0, l3: 0 } } }), null);
  assert.equal(buildHudMagic(null), null);
  assert.equal(buildHudMagic({ pools_base: { spell_slots_max: { l1: 2 } }, delta_ledger: [] }).label, "Magia");
});

test("favoritos resolvidos: ação e item existentes, na ordem; chave sem alvo some", () => {
  const sheet = { sheet_meta: { clickable_actions: [{ id: "atk", label: "Golpe" }], favorites: ["item:p", "action:atk", "action:fantasma", "item:sumiu"] }, inventory_orset: inv(item("p", "Poção", 1)) };
  assert.deepEqual(resolveHudFavorites(sheet).map((f) => [f.key, f.label]), [["item:p", "Poção"], ["action:atk", "Golpe"]]);
  assert.deepEqual(resolveHudFavorites(null), []);
});

test("atalhos: favoritos ocupam as vagas das ações e os fixos ficam; sem favoritos vale o de antes", () => {
  const sheet = { char_id: "c1", sheet_meta: { clickable_actions: [{ id: "a0", label: "A0" }] } };
  const favorites = [{ key: "item:p", kind: "item", id: "p", label: "Poção" }, { key: "action:a0", kind: "action", id: "a0", label: "A0" }];
  const items = buildHudShortcuts(sheet, { ownTokenId: "t1", favorites });
  assert.deepEqual(items.map((i) => i.id), ["item:p", "action:a0", "roll-d20", "move", "sheet"]);
  assert.equal(items[0].action, "inv-equip");
  assert.equal(items[1].action, "roll-action");
  assert.deepEqual(buildHudShortcuts(sheet, { favorites: [] }).map((i) => i.id), ["action:a0", "roll-d20", "sheet"]);
  const six = Array.from({ length: 6 }, (_, i) => ({ key: `item:i${i}`, kind: "item", id: `i${i}`, label: `I${i}` }));
  assert.equal(buildHudShortcuts(sheet, { ownTokenId: "t1", favorites: six }).length, 6);
});

const own = (extra = {}) => ({ character_id: "ana", char_id: "ana", name: "Lyra", attributes_lww: { armor_class: 12 }, pools_base: { hp_max: 10 }, delta_ledger: [], ...extra });

test("render: cinto com 4 vagas, rótulo escapado, nome acessível e ações existentes", () => {
  const sheet = own({ inventory_orset: inv(item("p", `<img src=x onerror="a">`, 2)) });
  const html = renderHudStatus({ sheet }, { tokens: [] });
  assert.equal([...html.matchAll(/is-empty/g)].length, 3);
  assert.ok(!html.includes("<img"));
  assert.match(html, /aria-label="&lt;img src=x onerror=&quot;a&quot;&gt;, 2 restantes\. Usar 1"/);
  for (const [, name] of html.matchAll(/data-dungeon="([^"]+)"/g)) assert.equal(typeof ACTION_HANDLERS[name], "function", name);
});

test("render: indicador de magia só aparece com magia", () => {
  const sem = renderHudStatus({ sheet: own() }, { tokens: [] });
  assert.ok(!sem.includes("data-hud-magic"));
  const com = renderHudStatus({ sheet: own({ pools_base: { hp_max: 10, spell_slots_max: { l1: 2 } } }) }, { tokens: [] });
  assert.match(com, /data-hud-magic>Magia 2\/2</);
});

test("render: favoritos aparecem na barra de atalhos do HUD rápido, com rótulo escapado", () => {
  const sheet = own({ sheet_meta: { clickable_actions: [{ id: "a", label: "<b>Golpe</b>" }], favorites: ["action:a"] } });
  const html = renderMapHud({ sheet }, { tokens: [] });
  assert.match(html, /data-hud-shortcut="action:a"/);
  assert.ok(!html.includes("<b>Golpe"));
});

test("região viva: nó único e estável, só troca o texto quando muda", () => {
  const nodes = new Map();
  const doc = {
    body: { appendChild: (n) => nodes.set(n.id, n) },
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: "" }),
  };
  assert.equal(syncHudLive("PV 5/10", doc), true);
  const first = nodes.get("dungeon-hud-live");
  assert.equal(first.attrs["aria-live"], "polite");
  assert.equal(first.attrs.role, "status");
  assert.equal(syncHudLive("PV 5/10", doc), false);
  assert.equal(syncHudLive("PV 4/10", doc), true);
  assert.equal(nodes.get("dungeon-hud-live"), first);
  assert.equal(nodes.size, 1);
  assert.equal(syncHudLive("x", {}), false);
});

async function sessionWith(...items) {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael" });
  for (const it of items) await mutateSheetInventory(state, "add", { label: it.label, qty: it.qty, tags: it.tags, itemId: it.id });
  return state;
}

test("usar do cinto: gasta 1, a última unidade tira o item; não consumível e item inexistente não mudam nada", async () => {
  const state = await sessionWith({ id: "pocao", label: "Poção", qty: 2, tags: ["consumivel"] }, { id: "espada", label: "Espada", qty: 1, tags: [] });
  const qtyOf = (id) => Object.values(state.sheet.inventory_orset).find((i) => i.id === id)?.qty;
  assert.equal(qtyOf("pocao"), 2);
  await useBeltItem(state, "pocao");
  assert.equal(qtyOf("pocao"), 1);
  await useBeltItem(state, "pocao");
  assert.equal(qtyOf("pocao"), undefined);
  assert.equal(await useBeltItem(state, "espada"), undefined);
  assert.equal(qtyOf("espada"), 1);
  assert.equal(await useBeltItem(state, "nada"), undefined);
});

test("favoritar: grava em sheet_meta.favorites; barra cheia avisa e não troca", async () => {
  const state = await sessionWith();
  await toggleHudFavorite(state, "action:atk");
  assert.deepEqual(state.sheet.sheet_meta.favorites, ["action:atk"]);
  await toggleHudFavorite(state, "action:atk");
  assert.deepEqual(state.sheet.sheet_meta.favorites, []);
  for (const k of "abcdef") await toggleHudFavorite(state, `item:${k}`);
  assert.equal(await toggleHudFavorite(state, "item:g"), undefined);
  assert.equal(state.sheet.sheet_meta.favorites.length, 6);
  assert.match(state.campaignNotice, /já tem 6/);
});
