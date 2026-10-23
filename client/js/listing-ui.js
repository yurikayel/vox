/**
 * UI da Feira — gossip v1 (status + retratação; sem edição de corpo).
 */
import * as listing from "./listing.js";
import * as postOwnership from "./post-ownership.js";
import * as gossipRetract from "./gossip-retract-ui.js";
import * as i18n from "./i18n-pt-br.js";

export function filterListingsForGossipRetract(listings = []) {
  if (!gossipRetract.isGossipRetractUiEnabled()) return listings;
  return listings.filter((l) => !gossipRetract.shouldHideGossipDeletedPost(l));
}

/** mapOwnLocalFlags + filtro tombstone em memória (aba Classificados). */
export function prepareListingsForTab(listings, routeId) {
  const flagged = postOwnership.mapOwnLocalFlags(listings || [], routeId);
  return filterListingsForGossipRetract(flagged);
}

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

export function isListingVerifiedShape(item) {
  if (!listing.isListingItem(item)) return false;
  return listing.validateSignedListingGossip(item).valid;
}

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

export function renderListingHeaderBadges(item, { statusKey, statusLabel, escapeHtml }) {
  const verified =
    isListingVerifiedShape(item) ? renderListingVerifiedBadgeHtml() : "";
  return `<div class="listing-header-badges">
          ${verified}
          <span class="badge-pill listing-status-pill status-${escapeHtml(statusKey)}">${escapeHtml(statusLabel)}</span>
        </div>`;
}
