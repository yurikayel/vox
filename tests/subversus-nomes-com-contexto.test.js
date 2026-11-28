/**
 * @file Botões repetidos numa lista dizem a que item se referem (WCAG 2.4.6), sem perder o texto visível no começo do
 * nome (2.5.3): Excluir e Confirmar exclusão (campanhas), Remover (mochila e tokens), Revelar/Ocultar GM (tokens) e
 * Adicionar ao mapa / No mapa (bandeja). Cada nome acessível é único dentro do grupo e começa pelo texto visível.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderInventoryPanel } from "../client/js/dungeon/screen-sheet-inventory.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";

/** Os `<button>` do HTML com o texto visível e o nome acessível (`aria-label`, ou o texto quando não há). */
function buttons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => {
    const visible = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const label = /aria-label="([^"]*)"/.exec(m[1])?.[1];
    return { attrs: m[1], visible, name: label ?? visible };
  });
}

/** Os botões cujo `data-dungeon` (ou o texto visível, se for `text:`) é o pedido. */
function group(html, key) {
  return buttons(html).filter((b) => (key.startsWith("text:") ? b.visible === key.slice(5) : b.attrs.includes(`data-dungeon="${key}"`) || b.attrs.includes(`data-tray-kind="${key}"`)));
}

function assertContexto(list, esperados) {
  assert.deepEqual(list.map((b) => b.name), esperados);
  assert.equal(new Set(list.map((b) => b.name)).size, list.length, "nomes únicos no grupo");
  for (const b of list) assert.ok(b.name.startsWith(b.visible), `o nome "${b.name}" começa pelo texto visível "${b.visible}" (2.5.3)`);
}

test("campanhas: Excluir e Confirmar exclusão levam o nome da campanha", () => {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  state.campaigns = [{ id: "c1", name: "Vila Nova" }, { id: "c2", name: "Ilha <b>Perdida</b>" }];
  assertContexto(group(renderCampScreen(state, { lab: false }), "arm-delete-campaign"), ["Excluir Vila Nova", "Excluir Ilha &lt;b&gt;Perdida&lt;/b&gt;"]);
  state.pendingDeleteId = "c1";
  assertContexto(group(renderCampScreen(state, { lab: false }), "confirm-delete-campaign"), ["Confirmar exclusão de Vila Nova"]);
});

test("mochila: Remover leva o nome do item", () => {
  const items = [{ id: "i1", label: "Espada longa", qty: 1, tags: [] }, { id: "i2", label: "Tocha", qty: 3, tags: [] }];
  const html = renderInventoryPanel({ sheet: { inventoryItems: items } });
  assertContexto(group(html, "inv-remove"), ["Remover Espada longa", "Remover Tocha"]);
});

test("mesa: Revelar, Ocultar GM e Remover dos tokens, e a bandeja, levam o nome", async () => {
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  state.campaign = { sheetsById: { s1: { character_id: "s1", attributes_lww: { name: "Gareth" }, pools_base: { hp_max: 31 } }, s2: { character_id: "s2", attributes_lww: { name: "Lyra" }, pools_base: { hp_max: 18 } } } };
  const root = (form) => ({ querySelector: (sel) => form[sel] ?? null });
  const click = (attrs, form = {}) => ACTION_HANDLERS["tray-add"](state, { dataset: attrs, closest: () => root(form) }, null, {});
  await click({ trayKind: "sheet", sheetId: "s1" });
  await click({ trayKind: "simple" }, { "#dungeon-tray-name": { value: "Goblin" }, "#dungeon-tray-hidden": { checked: true } });
  const html = renderTableScreen(state); // a cena já traz Lyra e Sentinela da Cripta
  assertContexto(group(html, "toggle-token-layer"), ["Ocultar GM Lyra", "Revelar Sentinela da Cripta", "Ocultar GM Gareth", "Revelar Goblin"]);
  assertContexto(group(html, "remove-token"), ["Remover Lyra", "Remover Sentinela da Cripta", "Remover Gareth", "Remover Goblin"]);
  assertContexto(group(html, "sheet"), ["Adicionar ao mapa: Lyra"]);
  assertContexto(group(html, "simple"), ["Adicionar ao mapa: token simples"]);
  assertContexto(group(html, "text:No mapa"), ["No mapa: Gareth"]);
});
