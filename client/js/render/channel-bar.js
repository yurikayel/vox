/** @file PM-81 — faixa do canal no topo da comunidade, selo do tópico retido e aviso da página do tópico. */

import { escapeHtml } from "./util.js";
import { isChannel, POSTING_MODE_MODS, POSTING_MODE_OPEN } from "../community-channel.js";

function modeButtonHtml(communityId, mode, label) {
  return `<button type="button" class="btn btn-sm btn-outline btn-channel-mode" data-comm="${escapeHtml(communityId)}" data-mode="${mode}" data-requires-entry>${label}</button>`;
}

/** Faixa: moderação vê o estado e o botão de trocar; quem não modera vê o aviso só quando é canal. */
export function renderChannelBarHtml(meta, { communityId = "", isMod = false } = {}) {
  const id = communityId || meta?.id || "";
  if (isChannel(meta)) {
    const action = isMod ? modeButtonHtml(id, POSTING_MODE_OPEN, "Abrir para todos publicarem") : "";
    return `<div class="banner-info community-channel-bar" role="note"><strong>📣 Canal:</strong> só a moderação publica posts; todo mundo pode comentar. ${action}</div>`;
  }
  if (!isMod) return "";
  return `<div class="community-channel-bar community-channel-bar-off">${modeButtonHtml(id, POSTING_MODE_MODS, "📣 Transformar em canal")}</div>`;
}

/** "Novo post" no topo: some só para quem não modera um canal. */
export function showsComposeButton(meta, isMod = false) {
  return Boolean(isMod) || !isChannel(meta);
}

export function renderChannelHeldPillHtml() {
  return `<span class="badge-pill community-channel-held-pill" title="Neste canal só a moderação publica: este post só aparece para quem publicou e para a moderação">📣 Fora do canal</span>`;
}

export function renderChannelHiddenTopicShellHtml() {
  return `
    <div class="card empty community-channel-hidden" role="status">
      <h2 style="margin-top:0;">Publicação fora do canal</h2>
      <p class="desc">Esta comunidade é um canal: só a moderação publica posts. Esta publicação só aparece para quem a escreveu e para a moderação.</p>
    </div>`;
}
