/** @file Delegação de eventos e orquestração de ações do disparo tático. */

import { showToast } from "./share.js";
import { copyStoryCardToClipboard } from "./story-card.js";
import {
  buildCanonicalTopicUrl,
  buildPosseExportPayload,
  firePosseWebhooks,
  loadPosseWebhooks,
} from "./posse-dispatch.js";
import { recordExplosion } from "./social.js";
import { buildExplodeText, resolveIntentTargetUrl } from "./explode-intent.js";
import {
  EXPLODE_SHEET_ID,
  getActiveExplodePost,
  openExplodeSheet,
  closeExplodeSheet,
  updateExplodeButtonsUi,
} from "./explode-ui.js";
import {
  executeExplodeBurst,
  quickExplodePost,
  startCascadeExplode,
  hasAnyConfiguredBurstChannel,
  handleCascadeClick,
} from "./explode-crosspost.js";

/**
 * Compartilha o cartão visual (Instagram ou TikTok) e avisa a pessoa.
 * @param {string} action Ação escolhida
 * @param {string} text Texto
 * @param {object} post Post
 * @returns {Promise<void>} Conclui após o aviso.
 */
async function handleVisualMediaShare(action, text, post) {
  try { await navigator.clipboard.writeText(text); } catch {}
  const cardRes = await copyStoryCardToClipboard(post);
  const target = action === "tiktok" ? "TikTok 🎵" : "Instagram 📸";
  const msg = cardRes?.imageCopied
    ? `📸 Card copiado + legenda! Cole no ${target}`
    : `📸 Card baixado + legenda copiada! Abra o ${target}`;
  showToast(msg);
  if (action === "story-card") return true;
  const appUrl = action === "tiktok" ? "https://www.tiktok.com/upload" : "https://www.instagram.com/";
  window.open(appUrl, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Envia o conteúdo aos webhooks configurados e avisa o resultado.
 * @param {object} payload Conteúdo
 * @returns {Promise<void>} Conclui após o aviso.
 */
async function handleWebhooksShare(payload) {
  const hooks = loadPosseWebhooks();
  const res = hooks.length ? await firePosseWebhooks(payload, hooks) : { sent: 0, failed: 0 };
  showToast(
    res.sent > 0 ? `Enviado para ${res.sent} webhook(s)!` : "Configure webhooks em Configurações → Rede.",
    res.sent > 0 ? "info" : "error",
  );
  return true;
}

/**
 * Trata um botão da grade de destinos.
 * @param {string} action Ação
 * @param {string} text Texto
 * @param {string} url Link
 * @param {object} payload Conteúdo
 * @param {object} post Post
 * @returns {Promise<void>} Conclui após a ação.
 */
async function handleExplodeGridActions(action, text, url, payload, post) {
  const targetUrl = resolveIntentTargetUrl(action, text, url, post);
  if (targetUrl) {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  if (action === "instagram" || action === "tiktok" || action === "story-card") {
    return handleVisualMediaShare(action, text, post);
  }
  if (action === "webhooks") {
    return handleWebhooksShare(payload);
  }
  return false;
}

/**
 * Trata a rajada: dispara os canais configurados ou abre a cascata.
 * @param {object} post Post
 * @returns {Promise<void>} Conclui após a ação.
 */
async function handleExplodeBurst(post) {
  closeExplodeSheet();
  if (!hasAnyConfiguredBurstChannel()) {
    startCascadeExplode(post);
    showToast("📢 Disparo em onda iniciado! Mensagem copiada.");
    return;
  }
  const res = await executeExplodeBurst(post);
  const total = res.webhooksSent || res.connectedCount || 0;
  showToast(
    total > 0
      ? `📢 Rajada disparada! (${total} destino(s))`
      : "📢 Mensagem copiada! Cole nos grupos!",
  );
}

/**
 * Copia a mensagem e avisa a pessoa.
 * @param {string} text Mensagem
 * @returns {Promise<void>} Conclui após a cópia.
 */
async function handleExplodeCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("📋 Mensagem copiada! Cole onde quiser.");
  } catch {}
  closeExplodeSheet();
}

/**
 * Compartilha pelo menu nativo; sem suporte, copia.
 * @param {object} post Post
 * @param {string} text Texto
 * @param {string} canonicalUrl Link do post
 * @returns {Promise<void>} Conclui após a ação.
 */
async function handleExplodeNativeShare(post, text, canonicalUrl) {
  if (!navigator.share) return handleExplodeCopy(text);
  try {
    await navigator.share({ title: post.title || "Vox", text, url: canonicalUrl });
  } catch {}
  closeExplodeSheet();
}

/**
 * Registra a explosão do post e atualiza os botões.
 * @param {object} post Post
 */
function recordPostExplosion(post) {
  if (!post?.id) return;
  const exp = recordExplosion(post.id, post.explodesCount || 0);
  updateExplodeButtonsUi(post.id, exp.count);
}

/**
 * Trata as ações do painel que não dependem de rede.
 * @param {string} action Ação
 * @param {object} post Post
 * @returns {boolean} `true` se tratou.
 */
function handleDirectSheetAction(action, post) {
  if (action === "close") {
    closeExplodeSheet();
    return true;
  }
  if (action === "cascade") {
    startCascadeExplode(post);
    return true;
  }
  if (action === "burst") {
    void handleExplodeBurst(post);
    return true;
  }
  return false;
}

/**
 * Trata o clique numa ação do painel de divulgação.
 * @param {string} action Ação
 * @returns {Promise<void>} Conclui após a ação.
 */
async function onExplodeAction(action) {
  const post = getActiveExplodePost();
  if (!post) return;
  if (handleDirectSheetAction(action, post)) return;

  const canonicalUrl = buildCanonicalTopicUrl(post.id, { communityId: post.communityId });
  const text = buildExplodeText({ title: post.title, body: post.body, url: canonicalUrl });
  const payload = buildPosseExportPayload({ ...post, canonicalUrl });

  recordPostExplosion(post);
  if (await handleExplodeGridActions(action, text, canonicalUrl, payload, post)) {
    closeExplodeSheet();
    return;
  }
  if (action === "copy") return handleExplodeCopy(text);
  if (action === "native") return handleExplodeNativeShare(post, text, canonicalUrl);
}

/**
 * Lê os dados do post a partir do botão clicado.
 * @param {HTMLElement} btn Botão
 * @returns {object} Dados do post.
 */
function extractExplodeBtnPost(btn) {
  return {
    id: btn.dataset.id,
    title: btn.dataset.title,
    body: btn.dataset.body,
    author: btn.dataset.author,
    communityId: btn.dataset.comm || "",
  };
}

/**
 * Abre o painel quando o clique foi num gatilho de divulgação.
 * @param {MouseEvent} e Evento de clique
 * @returns {boolean} `true` se tratou o clique.
 */
function handleExplodePostTriggerClick(e) {
  const shareBtn = e.target.closest?.(".btn-share-post, #btn-share-topic, .btn-explode-post");
  if (!shareBtn) return false;
  e.preventDefault();
  const postData = extractExplodeBtnPost(shareBtn);
  if (e.shiftKey || e.altKey) {
    quickExplodePost(postData);
  } else {
    openExplodeSheet(postData);
  }
  return true;
}

/**
 * Diz se o painel está aberto.
 * @param {HTMLElement|null} sheet Painel
 * @returns {boolean} `true` se aberto.
 */
function isSheetOpen(sheet) {
  return Boolean(sheet && !sheet.hidden && sheet.classList.contains("is-open"));
}

/**
 * Trata o clique dentro do painel aberto (fora do conteúdo, fecha).
 * @param {MouseEvent} e Evento de clique
 * @param {HTMLElement} sheet Painel
 */
function handleSheetActionClick(e, sheet) {
  if (!e.target.closest(".explode-panel")) {
    e.preventDefault();
    closeExplodeSheet();
    return true;
  }
  const btn = e.target.closest?.("[data-explode-action]");
  if (btn && sheet.contains(btn)) {
    e.preventDefault();
    void onExplodeAction(btn.getAttribute("data-explode-action"));
    return true;
  }
  return false;
}

/**
 * Trata cliques no documento ligados à divulgação.
 * @param {MouseEvent} e Evento de clique
 */
function handleDocumentExplodeClick(e) {
  if (handleCascadeClick(e) || handleExplodePostTriggerClick(e)) return;
  const sheet = document.getElementById(EXPLODE_SHEET_ID);
  if (!isSheetOpen(sheet)) return;
  handleSheetActionClick(e, sheet);
}

let explodeWired = false;

/** Conecta manipuladores de eventos para disparo tático ao documento.
 */
export function attachExplodeHandlers() {
  if (explodeWired) return;
  explodeWired = true;

  document.addEventListener("click", handleDocumentExplodeClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeExplodeSheet();
  });
}
