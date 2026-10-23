/**
 * Módulo de hashtags descentralizadas (descoberta por prefixo gossip / Willow).
 *
 * Princípios:
 * - Descoberta local por prefixo de caminho (Willow /tags/:slug/...)
 * - Zero trending, zero métricas de volume, zero ranking algorítmico
 * - Preserva acentos na exibição visual e gera slugs limpos em ASCII
 * - Processamento seguro de HTML (linkify pós-escapeHtml)
 */

/**
 * Converte uma tag bruta ou com acentos em slug ASCII canônico em minúsculas.
 * Ex: "#educação" -> "educacao", "Saúde_Pública" -> "saude_publica"
 *
 * @param {string} tag
 * @returns {string} Slug limpo contendo apenas [a-z0-9_]
 */
export function slugifyTag(tag) {
  if (!tag || typeof tag !== "string") return "";
  const clean = tag.startsWith("#") ? tag.slice(1) : tag;
  return clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Extrai hashtags únicas (como slugs) de um texto.
 * Limite de tags por post (padrão 8) para controle de tag-stuffing / spam.
 *
 * @param {string} text Texto bruto de entrada
 * @param {number} [maxTags=8] Máximo de tags permitidas
 * @returns {string[]} Lista de slugs de hashtags normalizados
 */
export function extractHashtags(text, maxTags = 8) {
  if (!text || typeof text !== "string") return [];
  const regex = /(?<![&\w\u00C0-\u00FF])#([a-zA-Z0-9_\u00C0-\u00FF]{1,40})/gu;
  const matches = text.matchAll(regex);
  const slugs = new Set();

  for (const m of matches) {
    const rawTag = m[1];
    // Evita tags puramente numéricas para não colidir com valores, referências ou entidades
    if (/^\d+$/.test(rawTag)) continue;
    const slug = slugifyTag(rawTag);
    if (slug) {
      slugs.add(slug);
      if (slugs.size >= maxTags) break;
    }
  }

  return Array.from(slugs);
}

/**
 * Converte hashtags dentro de um texto JÁ ESCAPADO (escapeHtml) em links clicáveis.
 * Preserva a acentuação e a caixa originais na exibição visual, usando o slug na URL.
 * Protegido contra entidades HTML (ex: &#39; não é transformado em hashtag).
 *
 * @param {string} escapedHtml Texto previamente tratado com escapeHtml
 * @returns {string} HTML com tags envolvidas em links da rota #/tag/:slug
 */
export function linkifyHashtags(escapedHtml) {
  if (!escapedHtml || typeof escapedHtml !== "string") return "";
  const regex = /(?<!&)#([a-zA-Z0-9_\u00C0-\u00FF]{1,40})/gu;
  return escapedHtml.replace(regex, (match, rawTag) => {
    if (/^\d+$/.test(rawTag)) return match;
    const slug = slugifyTag(rawTag);
    if (!slug) return match;
    return `<a href="#/tag/${encodeURIComponent(slug)}" class="hashtag-link">#${rawTag}</a>`;
  });
}
