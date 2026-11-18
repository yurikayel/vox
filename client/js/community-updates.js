/**
 * @file Atualizações assinadas de metadados de comunidade (PM-09, PM-81).
 *
 * Autor deve ser dono ou moderador; só campos em {@link COMMUNITY_UPDATE_FIELDS} entram.
 */
import { parseModerators } from "./moderation.js";

/** Valor de `type` em posts de atualização. @type {string} */
export const COMMUNITY_UPDATE_TYPE = "community_update";
/** Campos que um update pode alterar no registro canônico. @type {readonly string[]} */
export const COMMUNITY_UPDATE_FIELDS = Object.freeze(["image", "avatar", "title", "description", "category", "postingMode", "postingModeSince"]);

/**
 * Id do post canônico que define dono e estado base da comunidade.
 * @param {string} communityId Id da comunidade.
 * @returns {string}
 */
export function canonicalCommunityPostId(communityId) {
  return `c_${communityId}`;
}

/**
 * Indica se o post é o registro canônico inicial da comunidade.
 * @param {object|null} post Post candidato.
 * @returns {boolean}
 */
export function isCanonicalCommunityPost(post) {
  return Boolean(post?.communityId) && post.id === canonicalCommunityPostId(post.communityId);
}

/**
 * Indica se o autor pode emitir `community_update` para a comunidade.
 * @param {object|null} community Registro da comunidade.
 * @param {string} author Rota ou chave do autor.
 * @returns {boolean}
 */
export function canUpdateCommunity(community, author) {
  if (!author || typeof author !== "string" || !community) return false;
  if (community.owner && community.owner === author) return true;
  return parseModerators(community.moderators).includes(author);
}

/**
 * Extrai só campos de atualização permitidos e não vazios.
 * @param {object|null} update Payload `community_update`.
 * @returns {object}
 */
export function pickCommunityUpdateFields(update) {
  const out = {};
  for (const field of COMMUNITY_UPDATE_FIELDS) {
    const value = update?.[field];
    if (typeof value === "string" && value) out[field] = value;
  }
  if (out.image && !out.avatar) out.avatar = out.image;
  if (out.avatar && !out.image) out.image = out.avatar;
  return out;
}

function updateTime(update) {
  return Number(update.updatedAt || update.ts) || 0;
}

/**
 * Filtra e ordena atualizações autorizadas da mais antiga para a mais nova.
 * @param {object|null} community Comunidade base.
 * @param {object[]} updates Lista de posts de atualização.
 * @returns {object[]}
 */
export function authorizedCommunityUpdates(community, updates) {
  const cid = community?.communityId || community?.id;
  return (Array.isArray(updates) ? updates : [])
    .filter((u) => u?.type === COMMUNITY_UPDATE_TYPE && u.communityId === cid)
    .filter((u) => canUpdateCommunity(community, u.author))
    .sort((a, b) => updateTime(a) - updateTime(b));
}

/**
 * Aplica atualizações autorizadas sobre uma cópia do registro da comunidade.
 * @param {object|null} community Comunidade base.
 * @param {object[]} updates Posts `community_update`.
 * @returns {object}
 */
export function applyCommunityUpdates(community, updates) {
  let merged = { ...community };
  for (const u of authorizedCommunityUpdates(community, updates)) {
    merged = { ...merged, ...pickCommunityUpdateFields(u) };
  }
  return merged;
}