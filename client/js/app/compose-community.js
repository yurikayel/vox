/**
 * @file Fluxo de criação de nova comunidade: preview de avatar, assinatura local, gossip e upload opcional.
 *
 * @module app/compose-community
 */

import * as render from "../render.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as featureFlags from "../feature-flags.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as communitySeed from "../community-seed-checklist.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { getActiveUser, makeShellProps } from "./context.js";
import {
  acceptCommunityAvatarDataUrl,
  compressCommunityAvatarFile,
  validateCommunityAvatarFile,
} from "../shared/community-avatar-image.js";
import { leaveComposeAfterPublish, renderIfPaused } from "./compose-shared.js";
import { bindCommunityKitPicker, buildCommunityFromKit } from "./compose-community-kit.js";

/** @param {HTMLElement | null} previewEl @param {string} src @param {string} [initial] */
export function updateCommunityPhotoPreview(previewEl, src, initial = "C") {
  if (!previewEl) return;
  previewEl.replaceChildren();
  const fallbackStyle =
    "background:var(--brand-chrome); font-size:1.8rem; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-weight:800; border-radius:14px;";
  if (src) {
    const img = previewEl.ownerDocument.createElement("img");
    img.className = "community-avatar-img";
    img.src = src;
    img.alt = "Preview";
    img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:14px;";
    previewEl.appendChild(img);
    return;
  }
  const div = previewEl.ownerDocument.createElement("div");
  div.className = "community-avatar-fallback";
  div.style.cssText = fallbackStyle;
  div.textContent = initial;
  previewEl.appendChild(div);
}

/**
 * Liga o campo de arquivo da foto da comunidade e mostra a prévia.
 *
 * @param {HTMLInputElement|null} fileInput Campo de arquivo.
 * @param {HTMLElement} previewEl Elemento da prévia.
 * @param {object} state Estado do formulário.
 */
function bindPhotoFileInput(fileInput, previewEl, state) {
  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateCommunityAvatarFile(file);
    if (!check.ok) {
      share.showToast(check.message, "error");
      e.target.value = "";
      return;
    }
    try {
      state.photoDataUrl = await compressCommunityAvatarFile(file);
      updateCommunityPhotoPreview(previewEl, state.photoDataUrl);
    } catch (err) {
      share.showToast(err.message || "Falha ao processar foto.", "error");
      e.target.value = "";
    }
  });
}

/**
 * Liga os campos de foto (arquivo e endereço) do formulário de nova comunidade.
 *
 * @param {object} state Estado do formulário.
 */
function bindCommunityPhotoInputs(state) {
  const fileInput = document.getElementById("comm-photo-file");
  const urlInput = document.getElementById("comm-photo-url");
  const previewEl = document.getElementById("comm-photo-preview");
  const titleInput = document.getElementById("comm-title");

  bindPhotoFileInput(fileInput, previewEl, state);

  urlInput?.addEventListener("input", () => {
    const url = acceptCommunityAvatarDataUrl(urlInput.value.trim());
    if (url) {
      state.photoDataUrl = url;
      updateCommunityPhotoPreview(previewEl, url);
    } else if (!fileInput?.files?.[0]) {
      state.photoDataUrl = "";
      updateCommunityPhotoPreview(previewEl, "", (titleInput?.value || "C").slice(0, 1).toUpperCase());
    }
  });

  titleInput?.addEventListener("input", () => {
    if (!state.photoDataUrl) {
      updateCommunityPhotoPreview(previewEl, "", (titleInput.value || "C").slice(0, 1).toUpperCase());
    }
  });
}

/**
 * Envia a comunidade para a Permaweb quando o envio está ligado e há carteira.
 *
 * @param {object} communityRecord Registro da comunidade.
 */
async function uploadCommunityToPermaweb(communityRecord) {
  if (!featureFlags.isFeatureEnabled("arweaveUpload") || !wallet.hasWallet()) return;
  try {
    const { id, title, category, description, image } = communityRecord;
    const tags = upload.buildTags("community", {
      "Community-Id": id,
      Title: title,
      Category: category,
      Description: description,
      Image: image,
    });
    await upload.postData({ id, title, category, description, image }, tags);
  } catch {}
}

/**
 * Lê os campos do formulário de nova comunidade.
 *
 * @param {object} state Estado do formulário.
 * @returns {object}
 */
function readCommunityInputs(state) {
  return {
    id: document.getElementById("comm-id")?.value.trim().toLowerCase(),
    title: document.getElementById("comm-title")?.value.trim(),
    category: document.getElementById("comm-category")?.value.trim() || "Geral",
    desc: document.getElementById("comm-desc")?.value.trim(),
    visibility: document.getElementById("comm-type")?.value || "open",
    newKeyQuarantine: Boolean(document.getElementById("comm-new-key-quarantine")?.checked),
    kitId: state.kitId || "",
    includeCartridges: Boolean(state.includeCartridges),
    image: acceptCommunityAvatarDataUrl(
      state.photoDataUrl || document.getElementById("comm-photo-url")?.value.trim() || ""
    ),
  };
}

/**
 * Monta os campos extras do kit-genesis quando a comunidade parte de um modelo.
 *
 * @param {object} data Campos lidos do formulário.
 * @returns {Promise<object>}
 */
async function resolveKitMetadata(data) {
  if (!data.kitId) return {};
  const creatorAddr = await getActiveUser();
  const kitPayload = await buildCommunityFromKit({
    kitId: data.kitId,
    creatorAddr,
    id: data.id,
    title: data.title,
    desc: data.desc,
    includeCartridges: data.includeCartridges,
  });
  return {
    kitId: kitPayload.kitId,
    kitVersion: kitPayload.kitVersion,
    kitChannels: kitPayload.channels,
    kitCartridges: kitPayload.cartridges,
    kitRoles: kitPayload.roles,
    kitSecurityPolicy: kitPayload.securityPolicy,
  };
}

/**
 * Assina o registro da comunidade, guarda no aparelho e espalha pela rede.
 *
 * @param {object} data Campos lidos do formulário.
 */
async function signAndBroadcastCommunity(data) {
  const kitMeta = await resolveKitMetadata(data);
  const signed = await localAccount.signPayload({
    id: "c_" + data.id,
    type: "community",
    communityId: data.id,
    title: data.title,
    category: data.category,
    description: data.desc,
    image: data.image,
    avatar: data.image,
    visibility: data.visibility,
    ...(data.newKeyQuarantine ? { newKeyQuarantine: true } : {}),
    ...kitMeta,
    language: "Português",
    createdAt: Date.now(),
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
}

/**
 * Valida e cria a comunidade a partir do formulário.
 *
 * @param {object} state Estado do formulário.
 * @param {Event} e Evento `submit`.
 */
async function handleCommunityCreate(state, e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-comm");
  const data = readCommunityInputs(state);
  btn.disabled = true;
  btn.textContent = "Assinando…";
  try {
    await signAndBroadcastCommunity(data);
    await uploadCommunityToPermaweb({ id: data.id, title: data.title, category: data.category, description: data.desc, image: data.image });
    communitySeed.markSeedPending(data.id);
    leaveComposeAfterPublish("Comunidade criada na rede!", `#/c/${encodeURIComponent(data.id)}?seed=1`);
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Publicar Comunidade";
  }
}

/**
 * Formulário de nova comunidade.
 *
 * @returns {Promise<void>}
 */
export async function showComposeCommunity() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Comunidade"));
  if (renderIfPaused(main, "communityCreate")) return;
  render.renderComposeCommunity(main);

  const state = { photoDataUrl: "", kitId: "", includeCartridges: false };
  bindCommunityPhotoInputs(state);
  bindCommunityKitPicker(state);
  bindComposeStepper(document.getElementById("form-compose-community"));
  document.getElementById("form-compose-community")?.addEventListener("submit", (e) => handleCommunityCreate(state, e));
}
