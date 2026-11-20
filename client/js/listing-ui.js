/**
 * UI da Feira — gossip v1 (status + retratação; sem edição de corpo).
 */
import * as listing from "./listing.js";
import * as postOwnership from "./post-ownership.js";
import * as gossipRetract from "./gossip-retract-ui.js";
import * as i18n from "./i18n-pt-br.js";

/**
 * Filtra ofertas marcadas como excluídas por retratação via gossip quando habilitado.
 * @param {object[]} [listings=[]] Ofertas candidatas.
 * @returns {object[]} Ofertas visíveis.
 */
export function filterListingsForGossipRetract(listings = []) {
  if (!gossipRetract.isGossipRetractUiEnabled()) return listings;
  return listings.filter((l) => !gossipRetract.shouldHideGossipDeletedPost(l));
}

/**
 * `mapOwnLocalFlags` + filtro de tombstones em memória (aba Classificados).
 * @param {object[]} listings Ofertas da comunidade.
 * @param {string} routeId Identificador `vx_…` da conta ativa.
 * @returns {object[]} Ofertas anotadas e filtradas.
 */
export function prepareListingsForTab(listings, routeId) {
  const flagged = postOwnership.mapOwnLocalFlags(listings || [], routeId);
  return filterListingsForGossipRetract(flagged);
}

/**
 * Remove ofertas que possuem tombstone salvo localmente no aparelho.
 * @param {object[]} listings Ofertas a filtrar.
 * @param {(id: string) => Promise<object|null>} getTombstoneFn Consulta de tombstone por ID.
 * @returns {Promise<object[]>} Ofertas sem tombstone armazenado.
 */
export async function filterListingsByStoredTombstones(listings, getTombstoneFn) {
  if (typeof getTombstoneFn !== "function") return listings;
  const out = [];
  for (const item of listings) {
    const tomb = await getTombstoneFn(item.id);
    if (tomb) continue;
    out.push(item);
  }
  return out;
}

/**
 * Verifica se o item é uma oferta válida com assinatura v1/v2 conferida.
 * @param {object} item Item candidato.
 * @returns {boolean} `true` quando é oferta assinada válida.
 */
export function isListingVerifiedShape(item) {
  if (!listing.isListingItem(item)) return false;
  return listing.validateSignedListingGossip(item).valid;
}

/**
 * Renderiza o selo HTML indicando oferta com assinatura verificada.
 * @returns {string} HTML do selo.
 */
export function renderListingVerifiedBadgeHtml() {
  const tip = escapeAttr(i18n.listingVerifiedBadgeTitle);
  return `<span class="badge-pill listing-verified-pill" title="${tip}">Verificada</span>`;
}

const LISTING_STATUS_OPTIONS = [
  { key: "available", label: "Disponível" },
  { key: "reserved", label: "Reservado" },
  { key: "sold", label: "Vendido" },
];

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Renderiza o menu de status e retratação para ofertas da própria conta.
 * @param {object} item Oferta anotada com `isOwnLocalPost`.
 * @returns {string} HTML do menu ou string vazia.
 */
export function renderListingOwnerMenu(item) {
  if (!item?.isOwnLocalPost || !listing.isListingItem(item)) return "";
  const syncTip = escapeAttr(i18n.listingMutateStatusTooltip);
  const id = escapeAttr(item.id);
  const current = listing.normalizeListingStatus(item.listingStatus);
  const statusBtns = LISTING_STATUS_OPTIONS.map((opt) => {
    const active = current === opt.key ? " is-active" : "";
    return `<button type="button" class="btn-listing-status btn-text-quiet${active}" data-id="${id}" data-status="${opt.key}" title="${syncTip}">${opt.label}</button>`;
  }).join("");
  return `<div class="listing-owner-block">
    <div class="listing-owner-menu" role="group" aria-label="Gerenciar oferta">
      <span class="listing-owner-menu-label">Alterar status</span>
      ${statusBtns}
      <button type="button" class="btn-listing-retract btn-text-quiet" data-id="${id}" title="${syncTip}">${i18n.listingRetractLabel}</button>
    </div>
  </div>`;
}

/**
 * Renderiza os selos de verificação e status no cabeçalho de uma oferta.
 * @param {object} item Oferta da Feira.
 * @param {{ statusKey: string, statusLabel: string, escapeHtml: (s: string) => string }} meta Metadados de status e escape.
 * @returns {string} HTML dos selos do cabeçalho.
 */
export function renderListingHeaderBadges(item, { statusKey, statusLabel, escapeHtml }) {
  const verified =
    isListingVerifiedShape(item) ? renderListingVerifiedBadgeHtml() : "";
  return `<div class="listing-header-badges">
          ${verified}
          <span class="badge-pill listing-status-pill status-${escapeHtml(statusKey)}">${escapeHtml(statusLabel)}</span>
        </div>`;
}
