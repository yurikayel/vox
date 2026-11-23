/** @file PM-69 — decisão de quem modera sobre a publicação em revisão: volta para todos ou mantém arquivada. */

import * as review from "../report-review.js";
import * as share from "../share.js";

/** "restored" publica `unhide` na malha (e memória central), sem Arweave; "kept" publica `hide`, como o botão "Ocultar da rede". */
const DECISIONS = Object.freeze({
  restored: { action: "unhide", upload: false, toast: "A publicação voltou para todos." },
  kept: { action: "hide", upload: true, toast: "A publicação continua arquivada." },
});

/**
 * Registra decisão de revisão moderativa e propaga hide/unhide na comunidade.
 *
 * @param {string} communityId Id da comunidade.
 * @param {string} postId Id da publicação.
 * @param {"restored"|"kept"} outcome Resultado da revisão.
 * @param {object} [options={}]
 * @param {Function} [options.dispatch] Envio de ação mod; padrão usa tela da comunidade.
 * @param {Storage} [options.storage=globalThis.localStorage] Onde marcar casos resolvidos.
 * @param {number} [options.now=Date.now] Carimbo de tempo.
 * @returns {Promise<object>} Metadados da decisão (`action`, `upload`, `toast`).
 */
export async function decideReview(communityId, postId, outcome, { dispatch, storage = globalThis.localStorage, now = Date.now() } = {}) {
  const decision = DECISIONS[outcome];
  if (!decision || !communityId || !postId) throw new Error("Revisão sem publicação ou comunidade.");
  const send = dispatch || (await import("./screens-community.js")).dispatchCommunityModAction;
  await send(communityId, decision.action, postId, { upload: decision.upload });
  review.resolveCasesForPost(postId, outcome, { storage, now });
  return decision;
}

/**
 * Registra a decisão de revisão do botão clicado e atualiza o aviso na tela.
 *
 * @param {HTMLElement} btn Botão com `data-comm` e `data-id`.
 * @param {string} outcome Resultado escolhido.
 */
async function onReviewClick(btn, outcome) {
  btn.disabled = true;
  try {
    const decision = await decideReview(btn.dataset.comm || "", btn.dataset.id || "", outcome);
    share.showToast(decision.toast);
    const banner = btn.closest(".review-banner");
    if (banner) banner.innerHTML = `<strong>${outcome === "restored" ? "Revisada: voltou para todos." : "Revisada: mantida arquivada."}</strong>`;
  } catch (err) {
    btn.disabled = false;
    share.showToast(err.message || "Não foi possível registrar a revisão.", "error");
  }
}

let reviewHandlersWired = false;

/**
 * Liga botões restaurar/manter na faixa de revisão (delegação no documento).
 *
 * @param {Document} [doc=globalThis.document] Documento que recebe o listener.
 * @returns {void}
 */
export function attachReviewHandlers(doc = globalThis.document) {
  if (reviewHandlersWired || !doc?.addEventListener) return;
  reviewHandlersWired = true;
  doc.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".btn-review-restore, .btn-review-keep");
    if (!btn) return;
    e.preventDefault();
    void onReviewClick(btn, btn.classList.contains("btn-review-restore") ? "restored" : "kept");
  });
}
