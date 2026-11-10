/** @file Ordenação determinística de tópicos de comunidade (Bumping de fórum vs Recentes) e junção com os locais. */

import * as postOwnership from "./post-ownership.js";

/**
 * Obtém o timestamp canônico de criação de um tópico, com fallback para createdAt e timestamp.
 */
export function resolveTopicCreatedAtTs(topic = {}) {
  return Number(topic.ts || topic.createdAt || topic.timestamp) || 0;
}

/**
 * Determina o timestamp da atividade mais recente de um tópico.
 * Em arquitetura de fórum tradicional (bumping), cada nova resposta eleva a discussão.
 */
export function resolveTopicLastActivityTs(topic = {}) {
  const postTs = resolveTopicCreatedAtTs(topic);
  const replyTs = Number(topic.lastReplyTs) || 0;
  return Math.max(postTs, replyTs);
}

/** Ordenação padrão de fórum: tópicos com atividade/respostas recentes sobem ao topo. */
export function sortTopicsByActivity(topics = []) {
  if (!Array.isArray(topics)) return [];
  return [...topics].sort((a, b) => {
    const actDiff = resolveTopicLastActivityTs(b) - resolveTopicLastActivityTs(a);
    if (actDiff !== 0) return actDiff;
    const postDiff = resolveTopicCreatedAtTs(b) - resolveTopicCreatedAtTs(a);
    if (postDiff !== 0) return postDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/** Ordenação cronológica estrita pela criação do post. */
export function sortTopicsByNewest(topics = []) {
  if (!Array.isArray(topics)) return [];
  return [...topics].sort((a, b) => {
    const postDiff = resolveTopicCreatedAtTs(b) - resolveTopicCreatedAtTs(a);
    if (postDiff !== 0) return postDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/**
 * Ponto de entrada de ordenação com base na preferência do usuário ou padrão comunitário.
 * - "active": Bumping de atividade (tópicos fixados flutuam no topo).
 * - "newest": Cronológico estrito de criação (tópicos fixados flutuam no topo).
 * - "pinned": Exibe exclusivamente tópicos fixados e pautas ativas de governança.
 * @param {Array} topics
 * @param {"active"|"newest"|"pinned"} mode
 */
export function orderCommunityTopics(topics = [], mode = "active") {
  if (!Array.isArray(topics)) return [];
  if (mode === "pinned") {
    const pinnedOnly = topics.filter((t) => Boolean(t?.isPinned));
    return sortTopicsByActivity(pinnedOnly);
  }
  const pinned = [];
  const regular = [];
  for (const t of topics) {
    if (t?.isPinned) pinned.push(t);
    else regular.push(t);
  }
  const sortFn = mode === "newest" ? sortTopicsByNewest : sortTopicsByActivity;
  return [...sortFn(pinned), ...sortFn(regular)];
}

/** Junta tópicos locais e da rede (sem repetir) e soma as respostas locais à contagem e à última atividade. */
export function mergeTopicsWithLocalReplies(localTopics, topics, user, replyCounts, replyActivity = {}) {
  const seen = new Set();
  const merged = [];
  for (const t of localTopics) {
    seen.add(t.id);
    merged.push(postOwnership.withOwnLocalFlag({ ...t, isLocalP2p: true }, user));
  }
  for (const t of topics) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      merged.push({ ...t, isLocalP2p: false });
    }
  }
  for (const t of merged) {
    const act = replyActivity[t.id];
    const extra = (act?.count != null) ? act.count : (replyCounts[t.id] || 0);
    if (extra > 0 || !t.repliesCount) {
      t.repliesCount = (Number(t.repliesCount) || 0) + extra;
    }
    if (act?.lastTs) {
      t.lastReplyTs = Math.max(Number(t.lastReplyTs) || 0, act.lastTs);
    }
  }
  return merged;
}
