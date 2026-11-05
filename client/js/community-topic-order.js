/** @file Ordenação determinística de tópicos de comunidade (Bumping de fórum vs Recentes). */

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
 * Tópicos fixados (isPinned: true) flutuam sempre no topo, seguidos pelos tópicos regulares.
 * @param {Array} topics
 * @param {"active"|"newest"} mode
 */
export function orderCommunityTopics(topics = [], mode = "active") {
  if (!Array.isArray(topics)) return [];
  const pinned = [];
  const regular = [];
  for (const t of topics) {
    if (t?.isPinned) pinned.push(t);
    else regular.push(t);
  }
  const sortFn = mode === "newest" ? sortTopicsByNewest : sortTopicsByActivity;
  return [...sortFn(pinned), ...sortFn(regular)];
}
