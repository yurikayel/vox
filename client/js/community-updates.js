/**
 * @file Atualizações assinadas de metadados de comunidade (PM-09, PM-81).
 *
 * Autor deve ser dono ou moderador; só campos em {@link COMMUNITY_UPDATE_FIELDS} entram.
 */
import { parseModerators } from "./moderation.js";
import { acceptCommunityAvatarDataUrl } from "./shared/community-avatar-image.js";

/** Valor de `type` em posts de atualização. @type {string} */
export const COMMUNITY_UPDATE_TYPE = "community_update";
/** Campos que um update pode alterar no registro canônico. @type {readonly string[]} */
export const COMMUNITY_UPDATE_FIELDS = Object.freeze([
  "image",
  "avatar",
  "title",
  "description",
  "category",
  "postingMode",
  "postingModeSince",
  "newKeyQuarantine",
  "newKeyQuarantineSince",
]);

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

function pickQuarantineField(val) {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

function pickQuarantineSince(val) {
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  return undefined;
}

function pickTextField(field, val) {
  if (typeof val !== "string" || !val) return undefined;
  if (field === "image" || field === "avatar") {
    return acceptCommunityAvatarDataUrl(val) || undefined;
  }
  return val;
}

function pickFieldValue(field, update) {
  if (field === "newKeyQuarantine") return pickQuarantineField(update.newKeyQuarantine);
  if (field === "newKeyQuarantineSince") return pickQuarantineSince(update.newKeyQuarantineSince);
  return pickTextField(field, update[field]);
}

/**
 * Extrai só campos de atualização permitidos e não vazios.
 * @param {object|null} update Payload `community_update`.
 * @returns {object}
 */
export function pickCommunityUpdateFields(update) {
  if (!update || typeof update !== "object") return {};
  const out = {};
  for (const field of COMMUNITY_UPDATE_FIELDS) {
    const val = pickFieldValue(field, update);
    if (val !== undefined) out[field] = val;
  }
  if (out.image && !out.avatar) out.avatar = out.image;
  if (out.avatar && !out.image) out.image = out.avatar;
  return out;
}

/**
 * Constrói o payload de `community_update` para alternar quarentena de chaves novas.
 * @param {string} communityId Id da comunidade.
 * @param {boolean|string} enabled Estado desejado da quarentena.
 * @param {number} [now=Date.now()] Instante em ms.
 * @returns {object}
 */
export function buildQuarantineUpdate(communityId, enabled, now = Date.now()) {
  if (!communityId) throw new Error("Comunidade sem id.");
  const nextState = enabled === true || enabled === "true";
  return {
    id: `comm_update_${communityId}_${now}`,
    type: COMMUNITY_UPDATE_TYPE,
    communityId,
    newKeyQuarantine: nextState,
    newKeyQuarantineSince: String(now),
    updatedAt: now,
  };
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