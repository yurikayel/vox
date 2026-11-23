/**
 * @file Tela de composição de resposta a tópico e persistência/assinatura local de respostas.
 *
 * @module app/compose-reply
 */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as featureFlags from "../feature-flags.js";
import * as permanence from "../permanence-notice.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as mod from "../moderation.js";
import { randomBase36 } from "../shared/html.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { resolveCommunityMetadata } from "./community-metadata.js";
import { resolveTopicContent } from "./community-topic-screen.js";
import { leaveComposeAfterPublish } from "./compose-shared.js";

/**
 * Diz se o tópico está trancado pela moderação.
 *
 * @param {string} topicId Tópico.
 * @param {string} communityId Comunidade.
 * @param {string} user Rota de quem vê.
 * @returns {Promise<boolean>}
 */
async function resolveTopicLockState(topicId, communityId, user) {
  if (!topicId) return false;
  try {
    const { topic } = await resolveTopicContent(topicId, communityId, user);
    if (!topic) return false;
    const meta = await resolveCommunityMetadata(communityId).catch(() => null);
    const modActions = await mod.fetchModActions(communityId).catch(() => []);
    const filtered = mod.applyFilters([topic], modActions, meta?.owner, meta?.moderators);
    return Boolean(filtered[0]?.isLocked);
  } catch {
    return false;
  }
}

/**
 * Acha autor e trecho da resposta pai para citar.
 *
 * @param {string} parentId Resposta pai (vazia se não há).
 * @param {string} communityId Comunidade.
 * @returns {Promise<{parentAuthor: string, parentExcerpt: string}>}
 */
async function resolveParentReplyContext(parentId, communityId) {
  if (!parentId) return { parentAuthor: "", parentExcerpt: "" };
  try {
    const parentPost = (await cacheNode.getLocalPost(parentId)) || (await gql.fetchTransactionData(parentId, { communityId }).catch(() => null));
    if (!parentPost) return { parentAuthor: "", parentExcerpt: "" };
    const parentAuthor = parentPost.authorDisplay || parentPost.author || parentPost.owner || "";
    let parentExcerpt = (parentPost.body || "").slice(0, 100);
    if (parentPost.body && parentPost.body.length > 100) parentExcerpt += "…";
    return { parentAuthor, parentExcerpt };
  } catch {
    return { parentAuthor: "", parentExcerpt: "" };
  }
}

/**
 * Liga o envio do formulário de resposta.
 *
 * @param {HTMLFormElement} form Formulário.
 * @param {string} topicId Tópico.
 * @param {string} communityId Comunidade.
 * @param {string} parentId Resposta pai (vazia se não há).
 */
function bindComposeReplySubmit(form, topicId, communityId, parentId) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-reply");
    const body = document.getElementById("reply-body")?.value.trim();

    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      await persistLocalReply(topicId, communityId, body, { parentId });
      leaveComposeAfterPublish(
        "Resposta enviada.",
        `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}`,
      );
    } catch (err) {
      share.showToast(`Erro: ${err.message}`, "error");
      btn.disabled = false;
      btn.textContent = "Enviar Resposta";
    }
  });
}

/**
 * Mostra o aviso de tópico trancado no lugar do formulário.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} topicId Tópico.
 * @param {string} communityId Comunidade.
 */
function renderLockedTopicNotice(main, topicId, communityId) {
  main.innerHTML = `
    <div class="card compose-card" style="text-align:center; padding: 2rem 1rem;">
      <h3 style="margin-top:0;">🔒 Discussão Encerrada</h3>
      <p class="meta" style="margin-bottom: 1.5rem;">Este debate foi trancado pela moderação da comunidade e não aceita novas respostas.</p>
      <a href="#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}" class="btn btn-primary">Voltar ao Tópico</a>
    </div>`;
}

/**
 * Envia a resposta para a Permaweb se houver carteira e a pessoa confirmar.
 *
 * @param {string} topicId Tópico.
 * @param {string} communityId Comunidade.
 * @param {string} body Texto da resposta.
 * @param {string} replyId Identificador da resposta.
 * @param {string} authorDisplay Nome exibido do autor.
 */
async function tryUploadReplyToPermaweb(topicId, communityId, body, replyId, authorDisplay) {
  if (!featureFlags.isFeatureEnabled("arweaveUpload") || !wallet.hasWallet()) return;
  if (!(await permanence.confirmPermanentPublish())) return;
  try {
    const tags = upload.buildTags("reply", {
      "Reply-To": topicId,
      "Community-Id": communityId,
      "Local-Origin-Id": replyId,
    });
    await upload.postData({ replyTo: topicId, body, communityId, authorDisplay }, tags);
  } catch {}
}

/**
 * Compositor de resposta a tópico.
 *
 * @param {string} topicId ID do tópico alvo.
 * @param {string} communityId ID da comunidade.
 * @param {string} [parentId] ID do comentário pai, se resposta aninhada.
 * @returns {Promise<void>}
 */
export async function showComposeReply(topicId, communityId, parentId = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Responder"));

  const isLocked = await resolveTopicLockState(topicId, communityId, user);
  if (isLocked) {
    renderLockedTopicNotice(main, topicId, communityId);
    return;
  }

  const { parentAuthor, parentExcerpt } = await resolveParentReplyContext(parentId, communityId);
  render.renderComposeReply(main, topicId, communityId, { parentId, parentAuthor, parentExcerpt });

  const form = document.getElementById("form-compose-reply");
  if (form) bindComposeReplySubmit(form, topicId, communityId, parentId);
}

/**
 * Salva resposta local assinada, propaga no gossip P2P e envia à Permaweb se habilitado.
 *
 * @param {string} topicId ID do tópico respondido.
 * @param {string} communityId ID da comunidade.
 * @param {string} body Corpo textual da resposta.
 * @param {object} [arg3] Opções adicionais (`parentId`).
 * @returns {Promise<object>} Resposta assinada persistida.
 */
export async function persistLocalReply(topicId, communityId, body, { parentId = "" } = {}) {
  const isLocked = await resolveTopicLockState(topicId, communityId, null);
  if (isLocked) {
    throw new Error("Este debate foi encerrado pela moderação e não aceita novas respostas.");
  }

  const replyId = "rep_" + randomBase36(8);
  const myDisplayName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const myAvatar = localAccount.getProfileEnrichment()?.avatarUrl || "";
  const signed = await localAccount.signPayload({
    id: replyId,
    type: "reply",
    replyTo: topicId,
    communityId,
    body,
    parentId: parentId || "",
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  await tryUploadReplyToPermaweb(topicId, communityId, body, replyId, myDisplayName);
  return signed;
}
