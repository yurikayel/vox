/**
 * @file Fluxo de criação de classificado/oferta na Feira de uma comunidade.
 *
 * @module app/compose-listing
 */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as i18n from "../i18n-pt-br.js";
import { renderFeiraDisabled } from "../render/compose-steps.js";
import { randomBase36 } from "../shared/html.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { getInputValue, leaveComposeAfterPublish, renderIfPaused } from "./compose-shared.js";

/**
 * Lê os campos do formulário de anúncio.
 *
 * @returns {object}
 */
function readListingFormValues() {
  return {
    title: getInputValue("listing-title"),
    priceLabel: getInputValue("listing-price"),
    locationLabel: getInputValue("listing-location"),
    contactPix: getInputValue("listing-pix"),
    image: getInputValue("listing-image"),
    body: getInputValue("listing-body"),
  };
}

/**
 * Valida a chave Pix de contato e devolve a forma normalizada.
 *
 * @param {string} contactPix Chave digitada (vazia é permitida).
 * @returns {{ok: boolean, normalized?: string, error?: string}}
 */
function resolveContactPix(contactPix) {
  if (!contactPix) return { ok: true, normalized: "" };
  const pixVal = pixKeyHelper.validatePixKey(contactPix);
  if (!pixVal.ok) {
    return { ok: false, error: `Chave Pix inválida: ${pixVal.errorPt}` };
  }
  return { ok: true, normalized: pixVal.normalized };
}

/**
 * Monta, assina e publica o anúncio.
 *
 * @param {object} form Valores do formulário.
 * @param {string} pixNormalized Chave Pix normalizada.
 * @param {string} user Rota do autor.
 * @param {string} communityId Comunidade.
 */
async function executeListingPublish(form, pixNormalized, user, communityId) {
  const listingId = `listing_${Date.now()}_${randomBase36(5)}`;
  const draft = listing.buildListingDraft({
    id: listingId,
    communityId,
    ...form,
    contactPix: pixNormalized,
    author: user,
    owner: user,
    listingStatus: "available",
  });
  const signed = await localAccount.signPayload(draft);
  const check = listing.validateSignedListingGossip(signed);
  if (!check.valid) throw new Error(check.error || "Oferta inválida");
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  leaveComposeAfterPublish(i18n.listingPublishedToast, `#/c/${encodeURIComponent(communityId)}?tab=listings`);
}

/**
 * Formulário de classificado na comunidade.
 *
 * @param {string} communityId ID da comunidade alvo.
 * @returns {Promise<void>}
 */
export async function showComposeListing(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY_FEIRA.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Oferta"));
  if (renderIfPaused(main, "feira")) return;

  let meta = { id: targetComm, title: targetComm, commercialEnabled: false };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) {
      meta = { ...localC, commercialEnabled: Boolean(localC.commercialEnabled) };
    } else if (targetComm === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
      meta = mock.MOCK_DEMO_COMMUNITY_FEIRA;
    } else {
      const commRes = await gql.fetchCommunity(targetComm).catch(() => null);
      if (commRes) meta = commRes;
    }
  } catch {}

  if (!listing.isCommercialEnabled(meta)) {
    main.innerHTML = renderFeiraDisabled(targetComm);
    return;
  }

  const defaultPix = pixKeyHelper.storedPixValue(localAccount.getPixKey());
  render.renderComposeListing(main, targetComm, meta.title, { defaultPix });

  bindComposeStepper(document.getElementById("form-compose-listing"));
  document.getElementById("form-compose-listing")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleComposeListingSubmit(user, targetComm);
  });
}

/**
 * Envia classificado da comunidade.
 *
 * @param {string} user Identificador do autor ativo.
 * @param {string} communityId ID da comunidade alvo.
 * @returns {Promise<unknown>}
 */
export async function handleComposeListingSubmit(user, communityId) {
  const form = readListingFormValues();
  const val = listing.validateListingInput(form);
  if (!val.valid) return share.showToast(val.error, "error");

  const pixResult = resolveContactPix(form.contactPix);
  if (!pixResult.ok) return share.showToast(pixResult.error, "error");

  const btn = document.getElementById("btn-submit-listing");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Publicando…";
  }

  try {
    await executeListingPublish(form, pixResult.normalized, user, communityId);
  } catch (err) {
    share.showToast(`Erro ao publicar oferta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar na Feira";
    }
  }
}
