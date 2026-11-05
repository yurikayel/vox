/** @file Ordenação determinística de tópicos de comunidade (Bumping de fórum vs Recentes). */

/**
 * Determina o timestamp da atividade mais recente de um tópico.
 * Em arquitetura de fórum tradicional (bumping), cada nova resposta eleva a discussão.
 */
export function resolveTopicLastActivityTs(topic = {}) {
  const postTs = Number(topic.ts) || 0;
  const replyTs = Number(topic.lastReplyTs) || 0;
  return Math.max(postTs, replyTs);
}

/** Ordenação padrão de fórum: tópicos com atividade/respostas recentes sobem ao topo. */
export function sortTopicsByActivity(topics = []) {
  if (!Array.isArray(topics)) return [];
  return [...topics].sort((a, b) => {
    const actDiff = resolveTopicLastActivityTs(b) - resolveTopicLastActivityTs(a);
    if (actDiff !== 0) return actDiff;
    const postDiff = (Number(b.ts) || 0) - (Number(a.ts) || 0);
    if (postDiff !== 0) return postDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/** Ordenação cronológica estrita pela criação do post. */
export function sortTopicsByNewest(topics = []) {
  if (!Array.isArray(topics)) return [];
  return [...topics].sort((a, b) => {
    const postDiff = (Number(b.ts) || 0) - (Number(a.ts) || 0);
    if (postDiff !== 0) return postDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/**
 * Ponto de entrada de ordenação com base na preferência do usuário ou padrão comunitário.
 * @param {Array} topics
 * @param {"active"|"newest"} mode
 */
export function orderCommunityTopics(topics = [], mode = "active") {
  if (mode === "newest") {
    return sortTopicsByNewest(topics);
  }
  return sortTopicsByActivity(topics);
}
