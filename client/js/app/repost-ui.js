/**
 * @file Clique da toolbar: republicar post ou desfazer republicação.
 */

import * as share from "../share.js";
import * as repost from "../repost.js";

/**
 * Mostra toast conforme o resultado de {@link repost.toggleFromContext}.
 *
 * @param {object|undefined} res Resultado com `kind` create/undo.
 * @returns {boolean} `true` quando a operação foi bem-sucedida.
 */
export function toastRepostResult(res) {
  if (res?.kind === "create" && res.signed) {
    share.showToast("Republicado (sem impulsionar).");
    return true;
  }
  if (res?.kind === "undo" && res.undone) {
    share.showToast("Republicação desfeita.");
    return true;
  }
  share.showToast("Não foi possível republicar.");
  return false;
}

/**
 * Handler do botão republicar na toolbar do post.
 *
 * @param {HTMLElement} btn Botão com `data-id`, título e autor.
 * @returns {Promise<object>} Resultado de `toggleFromContext` ou `{ok: false}`.
 */
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
