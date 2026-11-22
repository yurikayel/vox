/** @file Open Frame actions on posts and button interaction handler. */
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as frames from "../frames.js";
import * as i18n from "../i18n-pt-br.js";
import * as localAccount from "../identity/index.js";
import * as peers from "../peers.js";
import { getActiveUser } from "./context.js";
import { markFrameChoice, refreshFrameContent, resolvePostForFrame } from "./frame-ui.js";
import { runButtonAction } from "./action-runner.js";

/**
 * Assina e propaga ação de botão de Open Frame no post.
 *
 * @param {object} frame Metadados do frame no post.
 * @param {string} postId Id do post.
 * @param {number} index Índice do botão.
 * @param {string} label Rótulo do botão.
 * @returns {Promise<void>}
 */
export async function executeFrameAction(frame, postId, index, label) {
  const user = await getActiveUser();
  const payload = frames.buildFrameActionPayload({
    postId,
    frameKind: frame.kind,
    buttonIndex: index,
    buttonLabel: label,
    userAddress: user,
  });
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  frames.saveUserFrameAction(postId, signed);
  peers.broadcastGossipUpdate(signed);
  await refreshFrameContent(document, postId, frame, signed);
  share.showToast(i18n.frameActionRecordedToast || "Ação registrada no mini-app!");
}

/**
 * Handler de clique em botão de frame: valida, executa e atualiza UI.
 *
 * @param {HTMLElement} btn Botão com datasets do frame.
 * @returns {Promise<void>}
 */
export async function handleFrameActionClick(btn) {
  const postId = btn.dataset.postId;
  const index = parseInt(btn.dataset.index ?? btn.dataset.btnIndex, 10);
  const label = btn.dataset.label ?? btn.dataset.btnLabel;
  if (!postId || isNaN(index)) return;

  const post = await resolvePostForFrame(postId);
  if (!post?.frame) return;

  await runButtonAction(btn, async () => {
    await executeFrameAction(post.frame, postId, index, label);
    markFrameChoice(btn, index);
  }, {
    busyText: "Gravando…",
    onError: (err) => {
      console.warn("Frame action failed", err);
      share.showToast("Falha ao executar ação no frame", "error");
    },
  });
}
