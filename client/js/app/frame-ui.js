/**
 * @file Open Frames na página: a apuração conta as ações de todos e os botões voltam ao normal depois do voto.
 *
 * O feed desenha o cartão de forma síncrona, só com o voto guardado neste aparelho. Assim que um cartão entra na
 * página (feed, comunidade, perfil, tópico ou redesenho por gossip), `watchFrameCards` completa a apuração com as
 * ações guardadas: as minhas e as que chegaram de outros aparelhos. Depois de um voto, `markFrameChoice` marca a
 * escolha nos botões do cartão.
 */
import * as cacheNode from "../cache-node.js";
import * as mock from "../mock.js";
import * as frames from "../frames.js";
import * as render from "../render.js";

const FRAME_SELECTOR = ".vox-frame[data-post-id]";

/**
 * Post que carrega o frame: o guardado neste aparelho ou, no tour de demonstração, o do mock.
 * @param {string} postId id do post
 * @returns {Promise<object|null>} post com `frame`, ou null
 */
export async function resolvePostForFrame(postId) {
  const post = await cacheNode.getLocalPost(postId);
  if (post?.frame) return post;
  const tour = mock.mockRecentTopics()?.items || [];
  return tour.find((p) => p.id === postId) || null;
}

/**
 * Redesenha a apuração de um frame com todas as ações guardadas para o post.
 * @param {Document} doc documento onde está o cartão
 * @param {string} postId post que carrega o frame
 * @param {object} rawFrame frame como veio no post (antes de `parseFrame`)
 * @param {object|null} [localAction] ação deste aparelho (padrão: a guardada)
 * @returns {Promise<boolean>} true se o cartão estava na página e foi redesenhado
 */
export async function refreshFrameContent(doc, postId, rawFrame, localAction = frames.getUserFrameAction(postId)) {
  const parsed = frames.parseFrame(rawFrame);
  if (!parsed.valid) return false;
  const actions = await cacheNode.getLocalPosts({ type: "frame-action", postId }).catch(() => []);
  const container = doc.getElementById(`frame-content-${postId}`);
  if (!container) return false;
  const state = frames.getFrameState(parsed.frame, actions, localAction);
  container.innerHTML = render.renderFrameContentHtml(parsed.frame, state);
  return true;
}

/**
 * Marca o botão escolhido (`active`) entre os botões do mesmo cartão.
 * @param {HTMLElement} btn botão clicado
 * @param {number} index `data-index` da escolha
 * @returns {void}
 */
export function markFrameChoice(btn, index) {
  const group = btn.closest?.(".vox-frame-buttons");
  const buttons = group ? [...group.querySelectorAll(".btn-frame-action")] : [btn];
  for (const b of buttons) b.classList?.toggle("active", Number(b.dataset.index) === index);
}

async function tallyCard(card, resolvePost) {
  const postId = card.dataset.postId;
  if (!postId || card.dataset.tallied) return;
  card.dataset.tallied = "1";
  const post = await resolvePost(postId);
  if (post?.frame) await refreshFrameContent(card.ownerDocument, postId, post.frame);
}

/**
 * Completa a apuração de todos os cartões de frame dentro de `root` (ou do próprio `root`). Cada cartão é apurado
 * uma vez; um redesenho cria cartões novos, que são apurados de novo.
 * @param {Element} root elemento que acabou de entrar na página
 * @param {(postId: string) => Promise<object|null>} [resolvePost] busca o post pelo id
 * @returns {Promise<void>}
 */
export async function tallyFrameCards(root, resolvePost = resolvePostForFrame) {
  const cards = root.matches?.(FRAME_SELECTOR) ? [root] : [...(root.querySelectorAll?.(FRAME_SELECTOR) || [])];
  await Promise.all(cards.map((card) => tallyCard(card, resolvePost).catch(() => {})));
}

function tallyAdded(records) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1) void tallyFrameCards(node);
    }
  }
}

/**
 * Abertura do app: apura os cartões de frame que já estão na página e todos os que entrarem depois.
 * @param {Document} [doc] documento do app
 * @returns {MutationObserver|null} o observador, ou null sem suporte no ambiente
 */
export function watchFrameCards(doc = globalThis.document) {
  if (typeof MutationObserver === "undefined" || !doc?.body) return null;
  const observer = new MutationObserver(tallyAdded);
  observer.observe(doc.body, { childList: true, subtree: true });
  void tallyFrameCards(doc.body);
  return observer;
}
