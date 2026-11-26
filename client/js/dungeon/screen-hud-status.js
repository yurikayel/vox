/**
 * @file Renderização do estado do personagem no HUD (spec hud-jogo-v0 §2 e §3): retrato, PV, CA, condições, grupo e linha móvel.
 * @module dungeon/screen-hud-status
 */
import { escapeHtml } from "../shared/html.js";
import { buildHudStatus } from "./hud-status-model.js";
import { syncHudLive } from "./hud-live.js";

function renderPortrait(p, name) {
  return `<span class="dungeon-hud-portrait" style="--hud-portrait:${escapeHtml(p.color)};color:${escapeHtml(p.ink)}" role="img" aria-label="Retrato de ${escapeHtml(name)}">${escapeHtml(p.initials)}</span>`;
}

function renderConditions({ shown, more }) {
  if (!shown.length) return "";
  const chips = shown.map((c) => `<li class="dungeon-hud-condition">${escapeHtml(c.label)}</li>`).join("");
  const extra = more ? `<li class="dungeon-hud-condition" aria-label="mais ${more} condições">+${more}</li>` : "";
  return `<ul class="dungeon-clean-list dungeon-hud-conditions" aria-label="Condições">${chips}${extra}</ul>`;
}

function renderMagic(magic) {
  return magic ? `<span class="dungeon-hud-magic" data-hud-magic>${escapeHtml(magic.label)} ${escapeHtml(magic.text)}</span>` : "";
}

function renderBeltSlot(slot, index) {
  if (!slot) return `<li class="dungeon-hud-belt-slot is-empty" aria-label="Vaga ${index + 1} do cinto, vazia">vazio</li>`;
  const name = `${escapeHtml(slot.label)}, ${slot.qty} restantes. Usar 1`;
  return `<li class="dungeon-hud-belt-slot"><button type="button" class="dungeon-chip-btn" data-dungeon="hud-op" data-hud-op="belt-use" data-item-id="${escapeHtml(slot.id)}" aria-label="${name}">${escapeHtml(slot.label)} ×${slot.qty}</button></li>`;
}

function renderBelt(belt) {
  return `<ul class="dungeon-clean-list dungeon-hud-belt" aria-label="Cinto" data-hud-belt>${belt.map(renderBeltSlot).join("")}</ul>`;
}

function renderOwn(own) {
  const hp = own.hp ? `<span class="dungeon-hud-hp">PV ${escapeHtml(own.hp)}</span>` : "";
  const ac = own.ac === null ? "" : `<span class="dungeon-hud-ac">${escapeHtml(own.acLabel || "CA")} ${own.ac}</span>`;
  return `<div class="dungeon-hud-own" data-hud-own>${renderPortrait(own, own.name)}<strong class="dungeon-hud-name">${escapeHtml(own.name)}</strong>${hp}${ac}${renderMagic(own.magic)}${renderConditions(own.conditions)}${renderBelt(own.belt)}</div>`;
}

function renderParty(party) {
  if (!party.length) return "";
  const rows = party.map((m) => `<li class="dungeon-hud-member" data-hud-member="${escapeHtml(m.tokenId)}">${renderPortrait(m, m.name)}<span>${escapeHtml(m.name)}</span><span class="dungeon-hud-member-hp">${escapeHtml(m.hp)}</span></li>`);
  return `<ul class="dungeon-clean-list dungeon-hud-party" aria-label="Grupo">${rows.join("")}</ul>`;
}

/**
 * Bloco de estado do HUD: retrato, nome, PV, CA e condições da ficha própria, grupo e linha móvel. Sem ficha, devolve vazio.
 * @param {object} state Estado da sessão (`sheet`).
 * @param {{tokens?: object[]}} scene Cena ativa.
 * @returns {string} HTML ou string vazia.
 */
export function renderHudStatus(state, scene) {
  const model = buildHudStatus(state, scene);
  syncHudLive(model?.own.hp ? `PV ${model.own.hp}` : "");
  if (!model) return "";
  const line = `<p class="dungeon-hud-mobile-line" data-hud-mobile-line>${escapeHtml(model.own.mobileLine)}</p>`;
  return `<section class="dungeon-hud-status" aria-label="Estado do personagem" data-dungeon-zone="mapHudStatus">${line}${renderOwn(model.own)}${renderParty(model.party)}</section>`;
}
