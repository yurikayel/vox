/** Clique da toolbar: republicar na praça ou desfazer. */

import * as share from "../share.js";
import * as repost from "../repost.js";

export function toastRepostResult(res) {
  if (res?.kind === "create" && res.signed) {
    share.showToast("Republicado na praça (sem impulsionar).");
    return true;
  }
  if (res?.kind === "undo" && res.undone) {
    share.showToast("Republicação desfeita.");
    return true;
  }
  share.showToast("Não foi possível republicar.");
  return false;
}

export async function handleRepostClick(btn) {
  const postId = String(btn?.dataset?.id || "").trim();
  if (!postId) return { ok: false };
  const res = await repost.toggleFromContext({
    postId,
    title: btn.dataset.title || "",
    authorRoute: btn.dataset.author || "",
  });
  toastRepostResult(res);
  return res;
}
