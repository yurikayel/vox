/**
 * PM-09 — quem pode mudar a foto, o título, a descrição e o modo de publicação (PM-81) de uma comunidade.
 *
 * Um `community_update` assinado só vale quando o autor é o dono da comunidade
 * ou está na lista de moderadores. A assinatura já prova quem é o autor
 * (`localAccount.verifyPayload` amarra `author` à chave pública). Aqui se decide
 * se esse autor tem o direito de mudar a comunidade.
 *
 * Só os campos de COMMUNITY_UPDATE_FIELDS passam. `id`, `author`, `owner`,
 * `moderators`, `sig` e o resto do payload nunca sobrescrevem o registro.
 *
 * O dono vem do registro canônico da comunidade, o post `c_<communityId>`
 * criado por `signAndBroadcastCommunity`. Um segundo post `community` com o
 * mesmo `communityId` e outro `id` é ignorado: senão bastaria publicar um com
 * `ts` antigo para virar dono.
 */
import { parseModerators } from "./moderation.js";

export const COMMUNITY_UPDATE_TYPE = "community_update";
export const COMMUNITY_UPDATE_FIELDS = Object.freeze(["image", "avatar", "title", "description", "category", "postingMode", "postingModeSince"]);

export function canonicalCommunityPostId(communityId) {
  return `c_${communityId}`;
}

export function isCanonicalCommunityPost(post) {
  return Boolean(post?.communityId) && post.id === canonicalCommunityPostId(post.communityId);
}

export function canUpdateCommunity(community, author) {
  if (!author || typeof author !== "string" || !community) return false;
  if (community.owner && community.owner === author) return true;
  return parseModerators(community.moderators).includes(author);
}

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

/** Atualizações válidas para a comunidade, da mais antiga para a mais nova. */
export function authorizedCommunityUpdates(community, updates) {
  const cid = community?.communityId || community?.id;
  return (Array.isArray(updates) ? updates : [])
    .filter((u) => u?.type === COMMUNITY_UPDATE_TYPE && u.communityId === cid)
    .filter((u) => canUpdateCommunity(community, u.author))
    .sort((a, b) => updateTime(a) - updateTime(b));
}

/** Novo registro com as atualizações autorizadas aplicadas; a mais nova vence. */
export function applyCommunityUpdates(community, updates) {
  let merged = { ...community };
  for (const u of authorizedCommunityUpdates(community, updates)) {
    merged = { ...merged, ...pickCommunityUpdateFields(u) };
  }
  return merged;
}
