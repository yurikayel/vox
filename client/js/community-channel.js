/**
 * @file PM-81 — canal: comunidade em que só o dono e a moderação publicam tópicos; todos comentam.
 * O modo vem de um `community_update` assinado (campos `postingMode` e `postingModeSince`), que só
 * dono ou moderador emitem (PM-09). A regra vale na leitura, em cada aparelho. Spec: docs/specs/canal-comunidade-v0.md.
 */

import { isModerator } from "./moderation.js";

export const POSTING_MODE_MODS = "mods";
export const POSTING_MODE_OPEN = "open";

export const isChannel = (meta) => meta?.postingMode === POSTING_MODE_MODS;

const topicAuthor = (topic) => String(topic?.owner || topic?.author || "");
const sameAddress = (a, b) => Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
const isModOf = (meta, who) => isModerator(who, meta?.owner, meta?.moderators);

/** Pode publicar tópico? `selves`: as identidades do aparelho (ativa e conta local). */
export function canPostTopic(meta, selves) {
  if (!isChannel(meta)) return true;
  return [].concat(selves).some((self) => self && isModOf(meta, self));
}

/**
 * Lista vista por `viewer` (uma identidade ou a lista das do aparelho): tópico de quem não modera some para os outros enquanto a comunidade for canal
 * (inclusive os antigos: a data do tópico é de quem publica e não serve de prova). Voltar a "aberta" mostra tudo.
 * O autor e a moderação continuam vendo, marcado com `channelHeld`.
 */
export function filterChannelTopics(topics, meta, viewer = "") {
  if (!isChannel(meta)) return topics;
  const viewers = [].concat(viewer).filter(Boolean);
  const viewerIsMod = viewers.some((v) => isModOf(meta, v));
  const out = [];
  for (const topic of topics) {
    const author = topicAuthor(topic);
    if (isModOf(meta, author)) out.push(topic);
    else if (viewerIsMod || viewers.some((v) => sameAddress(author, v))) out.push({ ...topic, channelHeld: true });
  }
  return out;
}

/** Página do tópico: quem não pode ver recebe o tópico marcado `channelHidden` (a tela mostra só o aviso). */
export function filterChannelTopic(topic, meta, viewer = "") {
  if (!topic) return topic;
  const [visible] = filterChannelTopics([topic], meta, viewer);
  return visible || { ...topic, channelHidden: true };
}

/** Corpo do `community_update` que troca o modo; quem chama assina e espalha. */
export function buildPostingModeUpdate(communityId, mode, now = Date.now()) {
  if (!communityId) throw new Error("Comunidade sem id.");
  if (mode !== POSTING_MODE_MODS && mode !== POSTING_MODE_OPEN) throw new Error(`Modo de publicação inválido: ${mode}`);
  return {
    id: `comm_update_${communityId}_${now}`,
    type: "community_update",
    communityId,
    postingMode: mode,
    postingModeSince: String(now),
    updatedAt: now,
  };
}
