/** @file PM-69 — decisão de quem modera sobre a publicação em revisão: volta para todos ou mantém arquivada. */

import * as review from "../report-review.js";
import * as share from "../share.js";

/** "restored" publica `unhide` na malha (e memória central), sem Arweave; "kept" publica `hide`, como o botão "Ocultar da rede". */
const DECISIONS = Object.freeze({
  restored: { action: "unhide", upload: false, toast: "A publicação voltou para todos." },
  kept: { action: "hide", upload: true, toast: "A publicação continua arquivada." },
});

export async function decideReview(communityId, postId, outcome, { dispatch, storage = globalThis.localStorage, now = Date.now() } = {}) {
  const decision = DECISIONS[outcome];
  if (!decision || !communityId || !postId) throw new Error("Revisão sem publicação ou comunidade.");
  const send = dispatch || (await import("./screens-community.js")).dispatchCommunityModAction;
  await send(communityId, decision.action, postId, { upload: decision.upload });
  review.resolveCasesForPost(postId, outcome, { storage, now });
  return decision;
}

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
