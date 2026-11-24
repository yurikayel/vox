/**
 * @file Publicação, persistência P2P, permaweb e submissão do formulário inline.
 */
import * as share from "../share.js";
import { uploadTopicToPermaweb } from "../topic-permaweb.js";
import * as localAccount from "../identity/index.js";
import * as peers from "../peers.js";
import * as cacheNode from "../cache-node.js";
import * as wallet from "../wallet.js";
import * as postOwnership from "../post-ownership.js";
import * as mediaBlob from "../media-blob.js";
import * as photoTags from "../photo-tags.js";
import { randomBase36 } from "../shared/html.js";
import { scheduleCommit } from "../shared/schedule-commit.js";
import { route } from "./navigation.js";
import * as permanence from "../permanence-notice.js";
import { attachPowIfWanted } from "../new-key-guard.js";
import { assertCanPostTopic } from "./community-channel-flow.js";
import { focusAfterComposePublish } from "../render/compose-chrome.js";
import {
  inlineComposerMedia,
  inlineComposerImageDataUrl,
  inlineComposerAspectRatio,
  inlineComposerPhotoTags,
  clearMedia,
  syncInlineComposerUi,
  collapseInlineComposer,
} from "./inline-composer-state.js";

/**
 * Anexa a mídia ativa do compositor ao payload do tópico.
 * @param {object} payload Payload do tópico sendo montado.
 * @returns {void}
 */
export function attachComposerMediaToPayload(payload) {
  const mtype = inlineComposerMedia.type;
  if (mtype === "image" && (inlineComposerImageDataUrl || inlineComposerMedia.dataUrl)) {
    payload.image = inlineComposerImageDataUrl || inlineComposerMedia.dataUrl;
    payload.imageAlt = payload.title || "Foto";
    payload.aspectRatio = inlineComposerAspectRatio || "original";
    if (inlineComposerPhotoTags.length > 0) {
      payload.photoTags = [...inlineComposerPhotoTags];
    }
  } else if (mtype === "audio" && inlineComposerMedia.dataUrl) {
    payload.audio = inlineComposerMedia.dataUrl;
  } else if (mtype === "video" && inlineComposerMedia.dataUrl) {
    payload.video = inlineComposerMedia.dataUrl;
  }
}

/**
 * Constrói payload de tópico para envio pelo compositor inline.
 * @param {{ title: string, body: string, commSlug: string }} params Parâmetros do tópico.
 * @returns {object} Payload estruturado do tópico.
 */
export function buildInlineTopicPayload({ title, body, commSlug }) {
  const topicId = "top_" + randomBase36(8);
  const enrichment = localAccount.getProfileEnrichment();
  const myDisplayName = localAccount.getDisplayName() || enrichment?.displayName || "";
  const myAvatar = enrichment?.avatarUrl || "";
  const payload = {
    id: topicId,
    type: "topic",
    communityId: commSlug,
    title: title || "",
    body: body || "",
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  };
  attachComposerMediaToPayload(payload);
  return payload;
}

/**
 * Exibe notificação toast sobre o resultado da publicação no P2P e permaweb.
 * @param {object} [permawebResult] Resultado do upload para a permaweb.
 * @returns {void}
 */
export function showPublishToast(permawebResult) {
  if (permawebResult?.success) {
    const badge = permawebResult.via === "turbo" ? "Turbo ⚡" : "Arweave";
    share.showToast(`Post publicado no P2P e gravado na Permaweb (${badge})!`);
  } else if (permawebResult?.skipped === permanence.CHOICE_MESH) {
    share.showToast("Post publicado só na malha P2P (não permanente).");
  } else if (permawebResult?.skipped === "arweave-disabled") {
    share.showToast("Post publicado na rede de seguidores!");
  } else if (wallet.hasWallet()) {
    share.showToast("Post publicado no P2P local (Permaweb indisponível).", "warning");
  } else {
    share.showToast("Post publicado na rede P2P!");
  }
}

/**
 * Assina, persiste e propaga um tópico criado pelo compositor inline.
 *
 * @param {object} payload Campos base do post.
 * @param {string} title Título derivado.
 * @param {string} body Corpo do texto.
 * @param {string} commSlug Slug/id da comunidade.
 * @param {object} [options={}] Opções de propagação.
 * @param {boolean} [options.deferBroadcast=false] Se `true`, deixa o broadcast P2P para o chamador.
 * @returns {Promise<{ signed: object, permaResult: object|null, blob: object|null }>} Post assinado salvo e mídia destacada.
 */
export async function broadcastAndPersistInlineTopic(payload, title, body, commSlug, { deferBroadcast = false } = {}) {
  // LAN-14: comunidade com quarentena de chave nova recebe o post com PoW leve.
  const community = (await cacheNode.getLocalCommunities()).find((c) => c.id === commSlug);
  await attachPowIfWanted(payload, community, await localAccount.getRouteId());
  // PM-87: a mídia sai antes da assinatura; o post assinado leva `mediaHash` e o blob viaja ao lado.
  const { detachedPost, mediaBlob: blob } = await mediaBlob.detachMedia(payload);
  const signed = await localAccount.signPayload(detachedPost);
  if (blob) await mediaBlob.defaultBlobStorage.put(blob);
  await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(signed, blob));
  if (payload.photoTags?.length) photoTags.setLocalTags(signed.id, payload.photoTags);
  if (!deferBroadcast) peers.broadcastGossip(signed, blob);
  const permaResult = await uploadTopicToPermaweb({ topicId: payload.id, commSlug, title, body, blob, aspectRatio: inlineComposerAspectRatio });
  return { signed, permaResult, blob };
}

/**
 * Anexa botão "Desfazer" ao toast visível atual sem alterar `share.js`.
 * @param {() => void} onUndo Ação de cancelamento ao clicar em Desfazer.
 * @returns {void}
 */
function attachUndoButtonToToast(onUndo) {
  const toast = document.querySelector?.(".vox-toast");
  if (!toast || typeof toast.appendChild !== "function") return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vox-toast-undo";
  btn.textContent = "Desfazer";
  btn.style.marginLeft = "0.75rem";
  toast.style.pointerEvents = "auto";
  toast.removeAttribute?.("aria-hidden");
  btn.addEventListener("click", () => {
    onUndo();
    toast.remove?.();
  });
  toast.appendChild(btn);
}

/**
 * Agenda o broadcast P2P com janela de 4 s para desfazer localmente antes de enviar aos pares.
 * @param {{ signed: object, blob: object|null, bodyRaw: string }} params Dados da publicação.
 * @returns {{ undo: () => void, flush: () => void, isPending: () => boolean }} Controles do agendamento.
 */
function scheduleInlineBroadcast({ signed, blob, bodyRaw }) {
  return scheduleCommit({
    delayMs: 4000,
    onCommit: () => peers.broadcastGossip(signed, blob),
    onUndo: async () => {
      await cacheNode.deleteLocalPost(signed.id);
      const bodyInput = document.getElementById("inline-topic-body");
      if (bodyInput && !bodyInput.value) bodyInput.value = bodyRaw;
      syncInlineComposerUi();
      share.showToast("Publicação desfeita.");
      await route();
    },
  });
}

/**
 * Executa publicação de tópico com validação de canal, persistência e reset da UI.
 * @param {HTMLFormElement} form Elemento do formulário.
 * @param {((signed: object) => Promise<void>|void)|undefined} onPublished Callback pós publicação.
 * @param {object} state Estado do controlador.
 * @param {boolean} [shouldEcho=false] Se deve abrir a folha de ecoar em seguida.
 * @returns {Promise<void>}
 */
export async function executeInlinePublish(form, onPublished, state, shouldEcho = false) {
  const bodyRaw = document.getElementById("inline-topic-body")?.value?.trim() || "";
  const commSlug = document.getElementById("inline-topic-comm")?.value?.trim().toLowerCase() || "geral";
  const hasMedia = Boolean(inlineComposerImageDataUrl || inlineComposerMedia.dataUrl);
  if (!bodyRaw && !hasMedia) return;
  if (!(await assertCanPostTopic(commSlug))) return;

  const { title, body } = postOwnership.deriveTopicTitleFromBody(bodyRaw || "");
  const payload = buildInlineTopicPayload({ title, body, commSlug });
  const { signed, permaResult, blob } = await broadcastAndPersistInlineTopic(payload, title, body, commSlug, { deferBroadcast: true });

  form.reset();
  clearMedia(state);
  syncInlineComposerUi();
  collapseInlineComposer();
  showPublishToast(permaResult);
  focusAfterComposePublish();
  if (typeof onPublished === "function") await onPublished(signed);
  else location.reload();

  const { undo } = scheduleInlineBroadcast({ signed, blob, bodyRaw });
  attachUndoButtonToToast(undo);

  if (shouldEcho) {
    const { openExplodeSheet } = await import("../explode-dispatch.js");
    openExplodeSheet(signed);
  }
}

const SUBMIT_BUTTON_LABELS = { "btn-inline-submit": "Postar", "btn-inline-echo": "🚀 Postar & Ecoar" };

/**
 * Atualiza o estado de habilitação e texto dos botões de envio.
 * @param {boolean} isSubmitting Se a publicação está em andamento.
 * @returns {void}
 */
export function updateSubmitButtonsState(isSubmitting) {
  for (const [id, idleLabel] of Object.entries(SUBMIT_BUTTON_LABELS)) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = isSubmitting;
    btn.textContent = isSubmitting ? "Publicando…" : idleLabel;
  }
}

let isInlineSubmitting = false;

/**
 * Conecta o evento de submissão do formulário do compositor inline.
 * @param {HTMLFormElement|null} form Formulário do compositor.
 * @param {((signed: object) => Promise<void>|void)|undefined} onPublished Callback pós publicação.
 * @param {object} state Estado do controlador.
 * @returns {void}
 */
export function bindFormSubmit(form, onPublished, state) {
  let shouldEchoNext = false;
  document.getElementById("btn-inline-echo")?.addEventListener("click", () => {
    shouldEchoNext = true;
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isInlineSubmitting) return;
    const isEcho = shouldEchoNext;
    shouldEchoNext = false;
    isInlineSubmitting = true;
    updateSubmitButtonsState(true);
    try {
      await executeInlinePublish(form, onPublished, state, isEcho);
    } catch (err) {
      share.showToast(`Erro ao publicar: ${err.message}`, "error");
    } finally {
      isInlineSubmitting = false;
      updateSubmitButtonsState(false);
    }
  });
}
