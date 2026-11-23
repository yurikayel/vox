/**
 * @file Busca e filtragem de tópicos e anúncios locais por hashtags no cache persistente.
 */

import * as hashtags from "./hashtags.js";
import * as mock from "./mock.js";
import { getLocalPosts } from "./cache-node-posts.js";

/**
 * Diz se o item tem a tag, pelas tags guardadas ou pelas extraídas do texto.
 * @param {object} item Item
 * @param {string} targetSlug Tag procurada
 * @returns {boolean} `true` se tiver.
 */
function itemMatchesTag(item, targetSlug) {
  const tags = Array.isArray(item.tags) && item.tags.length > 0
    ? item.tags
    : hashtags.extractHashtags(`${item.title || ""} ${item.body || ""} ${item.description || ""}`);
  return tags.includes(targetSlug);
}

/**
 * Junta os itens que têm a tag, sem repetir ids.
 * @param {object[]} items Itens
 * @param {string} targetSlug Tag procurada
 * @param {Set<string>} seenIds Ids já vistos
 * @param {object[]} results Lista de resultados a preencher
 * @param {Function|null} [typeFilter=null] Filtro de tipo
 */
function collectMatchingItems(items, targetSlug, seenIds, results, typeFilter = null) {
  for (const item of items) {
    if (!item || seenIds.has(item.id)) continue;
    if (typeFilter && !typeFilter(item)) continue;
    if (itemMatchesTag(item, targetSlug)) {
      seenIds.add(item.id);
      results.push(item);
    }
  }
}

/**
 * Tópicos e anúncios com a hashtag, dos posts locais e dos dados de demonstração, sem repetir id. Usa as `tags` do
 * item ou, sem elas, as hashtags do título, corpo e descrição.
 * @param {string} slug Hashtag (com ou sem `#`).
 * @returns {Promise<object[]>} Itens, mais novos primeiro; vazio para hashtag vazia.
 */
export async function getPostsByTag(slug) {
  if (!slug) return [];
  const targetSlug = hashtags.slugifyTag(slug);
  if (!targetSlug) return [];

  const results = [];
  const seenIds = new Set();

  try {
    const localPosts = await getLocalPosts();
    collectMatchingItems(
      localPosts,
      targetSlug,
      seenIds,
      results,
      (p) => p.type === "topic" || p.type === "listing",
    );
  } catch {}

  try {
    collectMatchingItems(mock.mockRecentTopics()?.items || [], targetSlug, seenIds, results);
  } catch {}

  try {
    collectMatchingItems(mock.mockListings("demo-feira-local")?.items || [], targetSlug, seenIds, results);
  } catch {}

  results.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return results;
}
