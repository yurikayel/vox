/**
 * @file Ações interativas da listagem de ofertas/classificados dentro da comunidade.
 * @module app/community-listing-handlers
 */
import * as brcode from "../brcode.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as postOwnership from "../post-ownership.js";
import * as listing from "../listing.js";
import * as localAccount from "../identity/index.js";
import * as peers from "../peers.js";
import * as i18n from "../i18n-pt-br.js";
import { getActiveUser } from "./context.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";

/**
 * Abre o pagamento Pix de um anúncio a partir do botão clicado.
 *
 * @param {HTMLElement} btn Botão com `data-pix` e `data-price`.
 */
async function handleListingPixClick(btn) {
  const pix = btn.dataset.pix;
  if (!pix) return;
  const numAmount = brcode.parseNumericAmount(btn.dataset.price || "");
  if (numAmount) {
    openZapModal({
      pixKey: pix,
      authorName: btn.dataset.authorName || "Vendedor",
      title: btn.dataset.title || "Oferta",
      defaultAmount: parseFloat(numAmount),
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(pix);
    share.showToast("Chave Pix copiada!");
  } catch {
    share.showToast(`Pix: ${pix}`);
  }
}

/**
 * Liga ações de Pix, compartilhamento, status e retirada nas ofertas renderizadas.
 *
 * @param {HTMLElement} main Container principal da comunidade.
 * @returns {void}
 */
export function attachCommunityListingHandlers(main) {
  main.querySelectorAll(".btn-copy-pix").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.preventDefault(); void handleListingPixClick(btn); });
  });
  main.querySelectorAll(".btn-share-listing").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      share.shareListing({
        title: btn.dataset.title || "Oferta na Feira",
        communityId: btn.dataset.comm || "demo-feira-local",
        priceLabel: btn.dataset.price || "",
      });
    });
  });
  main.querySelectorAll(".btn-listing-status").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.dataset.status) void handleListingStatusUpdate(btn.dataset.id, btn.dataset.status);
    });
  });
  main.querySelectorAll(".btn-listing-retract").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.preventDefault(); void handleListingRetract(btn.dataset.id); });
  });
}

/**
 * Atualiza o status assinado de uma oferta própria e propaga na malha.
 *
 * @param {string} listingId Identificador do anúncio.
 * @param {string} newStatus Novo status desejado.
 * @returns {Promise<void>}
 */
export async function handleListingStatusUpdate(listingId, newStatus) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(listingId);
  if (!postOwnership.canMutateLocalPost(existing, user) || !listing.isListingItem(existing)) {
    share.showToast("Só é possível alterar ofertas suas.", "error");
    return;
  }
  const normalized = listing.normalizeListingStatus(newStatus);
  if (listing.normalizeListingStatus(existing.listingStatus) === normalized) return;

  try {
    const patch = listing.buildListingStatusUpdate(existing, normalized);
    const signed = await localAccount.signPayload(patch);
    const check = listing.validateSignedListingGossip(signed);
    if (!check.valid) throw new Error(check.error || "Oferta inválida");
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossipUpdate(signed);
    share.showToast(i18n.listingStatusUpdatedToast);
    route();
  } catch (err) {
    share.showToast(`Erro ao atualizar status: ${err.message}`, "error");
  }
}

/**
 * Emite tombstone assinado para retirar uma oferta própria da listagem.
 *
 * @param {string} listingId Identificador do anúncio.
 * @returns {Promise<void>}
 */
export async function handleListingRetract(listingId) {
  const user = await getActiveUser();
  const existing = await cacheNode.getLocalPost(listingId);
  if (!postOwnership.canMutateLocalPost(existing, user) || !listing.isListingItem(existing)) {
    share.showToast("Só é possível retirar ofertas suas.", "error");
    return;
  }
  const label = (existing.title || "esta oferta").slice(0, 80);
  if (!confirm(`${i18n.listingRetractConfirmPrefix} "${label}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const tombstone = await postOwnership.createPostTombstone(existing);
    await cacheNode.saveTombstone(tombstone);
    peers.broadcastGossipDelete(tombstone);
    share.showToast(i18n.listingRetractedToast);
    route();
  } catch (err) {
    share.showToast(`Erro ao retirar oferta: ${err.message}`, "error");
  }
}
