/**
 * @file Mapeamento de nós GraphQL Arweave para objetos do app.
 */

/**
 * Operação `tagValue` do módulo.
 * @param {*} [tags] Lista de tags ANS-104.
 * @param {*} [name] Parâmetro `name`.
 * @returns {*} Resultado da operação.
 */
export function tagValue(tags, name) {
  if (!Array.isArray(tags)) return "";
  const t = tags.find((x) => x.name === name);
  return t ? t.value : "";
}

/**
 * Mapeia nó GraphQL para comunidade.
 * @param {*} node
 * @returns {*} Resultado da operação.
 */
export function mapCommunity(node) {
  const tags = node.tags || [];
  return {
    id: tagValue(tags, "Community-Id") || node.id,
    txId: node.id,
    title: tagValue(tags, "Title") || "Comunidade sem título",
    description: tagValue(tags, "Description") || "",
    category: tagValue(tags, "Category") || "",
    moderators: tagValue(tags, "Moderators") || "",
    owner: node.owner?.address || "",
  };
}

/**
 * Mapeia nó GraphQL para tópico.
 * @param {*} node
 * @param {string} [communityId]
 * @returns {*} Resultado da operação.
 */
export function mapTopic(node, communityId) {
  const tags = node.tags || [];
  const mediaTx = tagValue(tags, "Media-Tx");
  const mediaMime = tagValue(tags, "Media-Type") || "image/webp";
  const aspect = tagValue(tags, "Aspect-Ratio") || "original";
  return {
    id: node.id,
    communityId: communityId || tagValue(tags, "Community-Id"),
    title: tagValue(tags, "Topic-Title") || tagValue(tags, "Title") || "Tópico",
    owner: node.owner?.address || "",
    mediaTx: mediaTx || null,
    image: mediaTx ? `https://turbo-gateway.com/raw/${mediaTx}` : null,
    mediaType: mediaMime,
    aspectRatio: aspect,
    tags,
  };
}

/**
 * Mapeia nó GraphQL para resposta.
 * @param {*} node
 * @returns {*} Resultado da operação.
 */
export function mapReply(node) {
  const tags = node.tags || [];
  return {
    id: node.id,
    replyTo: tagValue(tags, "Reply-To"),
    communityId: tagValue(tags, "Community-Id"),
    body: tagValue(tags, "Body") || tagValue(tags, "Content") || "",
    owner: node.owner?.address || "",
    tags,
  };
}

/**
 * Mapeia nó GraphQL para profile-card.
 * @param {*} node
 * @returns {*} Resultado da operação.
 */
export function mapProfileCard(node) {
  const tags = node.tags || [];
  return {
    txId: node.id,
    owner: node.owner?.address || "",
    routeId: tagValue(tags, "Route-Id"),
    displayName: tagValue(tags, "Display-Name"),
    name: tagValue(tags, "Display-Name"),
    bio: tagValue(tags, "Bio"),
    avatarUrl: tagValue(tags, "Avatar-Url"),
    discoverable: tagValue(tags, "Discoverable") !== "false",
    timestamp: Number(tagValue(tags, "Timestamp") || 0),
    tags,
  };
}