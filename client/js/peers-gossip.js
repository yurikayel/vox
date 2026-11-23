/**
 * @file Validação, ingestão, persistência e propagação (gossip) de posts, edições, lápides e cartões de perfil.
 */

import * as cacheNode from "./cache-node.js";
import { allowGossipFromAuthor } from "./rate-limit.js";
import { noteKeySeen } from "./new-key-guard.js";
import * as localAccount from "./identity/index.js";
import * as mediaBlob from "./media-blob.js";
import * as manifestMesh from "./peers-cache-manifest.js";
import * as moderation from "./moderation.js";
import * as profileCard from "./profile-card.js";
import * as gossipProfile from "./peers-gossip-profile.js";
import * as profileDirectory from "./profile-directory.js";
import { isBeforeGenesisMs, isTestRouteId } from "./genesis.js";
import { isSupersededLocally } from "./post-supersede.js";
import {
  MAX_GOSSIP_ITEM_BYTES,
  MAX_PROFILE_CARD_BYTES,
  exceedsBytes,
  noteGossipDrop,
} from "./peers-gossip-profile.js";
import { myPeerId } from "./peers-base.js";
import { dispatchGossipPost, dispatchGossipTombstone } from "./peers-events.js";
import { relayToMesh, broadcastToMesh } from "./peers-transport.js";

/**
 * Item recebido (post, edição, lápide ou cartão) acima do teto do seu tipo: descartado e contado.
 * @param {object} item Item a verificar.
 * @returns {boolean} Verdadeiro se o item exceder os limites de bytes permitidos.
 */
export function isOversizedItem(item) {
  const isCard = item?.type === profileCard.PROFILE_CARD_TYPE || item?.routeId !== undefined;
  const max = isCard ? MAX_PROFILE_CARD_BYTES : MAX_GOSSIP_ITEM_BYTES;
  if (!exceedsBytes(item, max)) return false;
  noteGossipDrop(isCard ? "oversizedProfileCard" : "oversizedItem");
  return true;
}

/**
 * Trata mensagem PROFILE_CARD_HELLO recebida na abertura de canal WebRTC.
 * @param {object} card Cartão de perfil recebido.
 */
export async function handleProfileCardHello(card) {
  if (!card || typeof card !== "object" || !card.pubKey || !card.sig || !card.author) return;
  if (moderation.shouldDropGossip(card.author)) return;
  if (isOversizedItem(card)) return;
  const valid = await localAccount.verifyPayload(card);
  if (valid) {
    await gossipProfile.applyVerifiedProfileCardItem(card);
  }
}

/** PM-84: só segue adiante o cartão de perfil novo; o repetido circulava sem fim. */
async function applyAndRelayProfileCard(item, type, source) {
  if (await gossipProfile.applyVerifiedProfileCardItem(item)) {
    relayToMesh({ type, item, fromPeer: myPeerId }, source);
  }
}

/**
 * Trata o recebimento de um manifesto de cache assinado (CACHE_MANIFEST).
 * @param {object} item Item de manifesto assinado.
 * @param {string} [source="rtc"] Origem do tráfego.
 */
export async function handleCacheManifestMessage(item, source = "rtc") {
  const result = await manifestMesh.ingestSignedCacheManifestItem(item, localAccount.verifyPayload);
  if (!result.ok || result.skipped) return;
  relayToMesh({ type: "CACHE_MANIFEST", item, fromPeer: myPeerId }, source);
}

/**
 * Atualiza o diretório de perfis com os dados do autor do item recebido.
 * @param {object} item Item da fofoca
 */
function syncProfileDirectoryFromGossip(item) {
  if (item.author && (item.authorDisplay || item.authorAvatar || item.authorHandle)) {
    profileDirectory.setProfileCard(item.author, {
      name: item.authorDisplay || "",
      avatarUrl: item.authorAvatar || "",
      handle: item.authorHandle || "",
    });
  }
}

/**
 * Diz se o item de comunidade recebido tem imagens recusadas.
 * @param {object} item Item da fofoca
 * @returns {Promise<boolean>} `true` se deve recusar.
 */
async function isRejectedCommunityGossipItem(item) {
  if (item.type !== "community" && item.type !== "community_update") return false;
  const { communityGossipHasRejectedImages } = await import("./shared/community-avatar-image.js");
  if (communityGossipHasRejectedImages(item)) return true;
  if (item.type === "community_update") return !(await cacheNode.isCommunityUpdateAcceptable(item));
  return false;
}

/**
 * Diz se o item está fora da rede viva (conta de teste ou anterior à gênese).
 * @param {object} item Item da fofoca
 * @returns {boolean} `true` se está fora.
 */
function isOutsideLiveNetwork(item) {
  if (isTestRouteId(item.author || item.routeId)) return true;
  return item.type !== profileCard.PROFILE_CARD_TYPE && isBeforeGenesisMs(item.ts || item.timestamp || 0);
}

/**
 * Trata o recebimento de um novo item assinado via gossip.
 * @param {object} item Item assinado recebido.
 * @param {string} [source="rtc"] Origem da mensagem.
 * @param {object|null} [sentBlob=null] Blob opcional que viaja adjacente ao item.
 */
export async function handleGossipMessage(item, source = "rtc", sentBlob = null) {
  if (!item?.id || !item?.sig || isOversizedItem(item)) return;
  if (moderation.shouldDropGossip(item.author) || isOutsideLiveNetwork(item)) return;
  if (await isSupersededLocally(item)) return;
  if (!(await localAccount.verifyPayload(item))) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await applyAndRelayProfileCard(item, "GOSSIP", source);
    return;
  }

  if (!allowGossipFromAuthor(item.author)) return;
  if (await isRejectedCommunityGossipItem(item)) return;
  noteKeySeen(item.author);

  syncProfileDirectoryFromGossip(item);
  const blob = await mediaBlob.blobForPost(item, sentBlob);
  await cacheNode.saveLocalPost(mediaBlob.withLocalMedia(item, blob));
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP", item, blob, fromPeer: myPeerId }, source);
}

/**
 * Diz se o item já foi superado por lápide ou versão mais nova.
 * @param {object} item Atualização recebida
 * @returns {Promise<boolean>} `true` se superada.
 */
async function isGossipUpdateSuperseded(item) {
  const tombstone = await cacheNode.getTombstone(item.id);
  if (tombstone && (tombstone.editedAt || 0) >= item.editedAt) return true;

  const existing = await cacheNode.getLocalPost(item.id);
  if (existing) {
    if (existing.author && existing.author !== item.author) return true;
    const existingTime = existing.editedAt || existing.ts || 0;
    if (item.editedAt <= existingTime) return true;
  }
  return false;
}

/**
 * Diz se a atualização é malformada ou de autor bloqueado.
 * @param {object} item Atualização recebida
 * @returns {boolean} `true` se deve ser descartada.
 */
function isMalformedOrBlockedUpdate(item) {
  if (!item?.id || !item?.sig || !item?.author) return true;
  if (moderation.shouldDropGossip(item.author) || isOutsideLiveNetwork(item)) return true;
  return !(item.editedAt > 0);
}

/**
 * Trata o recebimento de uma edição de post ou cartão via gossip (GOSSIP_UPDATE).
 * @param {object} item Item editado assinado.
 * @param {string} [source="rtc"] Origem da mensagem.
 */
export async function handleGossipUpdateMessage(item, source = "rtc") {
  if (isMalformedOrBlockedUpdate(item) || isOversizedItem(item)) return;
  if (await isGossipUpdateSuperseded(item)) return;
  if (!(await localAccount.verifyPayload(item))) return;

  if (item.type === profileCard.PROFILE_CARD_TYPE) {
    await applyAndRelayProfileCard(item, "GOSSIP_UPDATE", source);
    return;
  }
  if (await isRejectedCommunityGossipItem(item)) return;

  await cacheNode.saveLocalPost(item);
  dispatchGossipPost(item, source);
  relayToMesh({ type: "GOSSIP_UPDATE", item, fromPeer: myPeerId }, source);
}

/**
 * Diz se a lápide já foi superada por outra mais nova.
 * @param {object} tombstone Lápide recebida
 * @returns {Promise<boolean>} `true` se superada.
 */
async function isTombstoneSuperseded(tombstone) {
  const deleteTime = tombstone.editedAt || tombstone.ts || 0;
  const existingTombstone = await cacheNode.getTombstone(tombstone.id);
  if (existingTombstone) {
    const existingDeleteTime = existingTombstone.editedAt || existingTombstone.ts || 0;
    if (existingDeleteTime >= deleteTime) return true;
  }

  const existingPost = await cacheNode.getLocalPost(tombstone.id);
  if (existingPost) {
    if (existingPost.author && existingPost.author !== tombstone.author) return true;
    const postTime = existingPost.editedAt || existingPost.ts || 0;
    if (deleteTime < postTime) return true;
  }
  return false;
}

/**
 * Diz se a lápide é malformada, grande demais ou de autor bloqueado.
 * @param {object} tombstone Lápide recebida
 * @returns {boolean} `true` se deve ser descartada.
 */
function isMalformedOrBlockedTombstone(tombstone) {
  if (!tombstone?.id || !tombstone?.sig || !tombstone?.author || isOversizedItem(tombstone)) return true;
  return moderation.shouldDropGossip(tombstone.author) || !(tombstone.editedAt || tombstone.ts);
}

/**
 * Trata o recebimento de uma remoção (lápide assinada) via gossip (GOSSIP_DELETE).
 * @param {object} tombstone Lápide assinada recebida.
 * @param {string} [source="rtc"] Origem da mensagem.
 */
export async function handleGossipDeleteMessage(tombstone, source = "rtc") {
  if (isMalformedOrBlockedTombstone(tombstone)) return;
  if (await isTombstoneSuperseded(tombstone)) return;

  const valid = await localAccount.verifyPayload(tombstone);
  if (!valid) return;

  const cardRoute = gossipProfile.routeIdFromProfileCardId(tombstone.id);
  if (cardRoute) {
    profileDirectory.removeProfileCard(cardRoute);
    relayToMesh(
      { type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId },
      source,
    );
    return;
  }

  await cacheNode.saveTombstone(tombstone);
  dispatchGossipTombstone(tombstone, source);
  relayToMesh({ type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId }, source);
}

/**
 * Anuncia um item assinado novo (post, cartão) às outras abas e aos pares WebRTC.
 * @param {object} item Item assinado; sem `id`, nada é enviado.
 * @param {object|null} [blob=null] Mídia do `mediaHash`, que viaja ao lado do post (PM-87).
 */
export function broadcastGossip(item, blob = null) {
  if (!item?.id) return;
  broadcastToMesh({ type: "GOSSIP", item, blob, fromPeer: myPeerId });
}

/**
 * Anuncia a edição de um item assinado às outras abas e aos pares WebRTC.
 * @param {object} item Item editado e assinado; sem `id`, nada é enviado.
 */
export function broadcastGossipUpdate(item) {
  if (!item?.id) return;
  broadcastToMesh({ type: "GOSSIP_UPDATE", item, fromPeer: myPeerId });
}

/**
 * Anuncia uma remoção (lápide assinada) às outras abas e aos pares WebRTC.
 * @param {object} tombstone Lápide assinada; sem `id`, nada é enviado.
 */
export function broadcastGossipDelete(tombstone) {
  if (!tombstone?.id) return;
  broadcastToMesh({ type: "GOSSIP_DELETE", item: tombstone, tombstone, fromPeer: myPeerId });
}

/**
 * Anuncia o cartão de perfil assinado como gossip novo.
 * @param {object} item Cartão de perfil; outro tipo é ignorado.
 */
export function broadcastProfileCard(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossip(item);
}

/**
 * Anuncia a edição do cartão de perfil assinado.
 * @param {object} item Cartão de perfil; outro tipo é ignorado.
 */
export function broadcastProfileCardUpdate(item) {
  if (item?.type !== profileCard.PROFILE_CARD_TYPE) return;
  broadcastGossipUpdate(item);
}

/**
 * Anuncia um manifesto de cache assinado às outras abas e aos pares WebRTC.
 * @param {object} item Item `cache-manifest` assinado; outro tipo, ou sem `id`, é ignorado.
 */
export function broadcastCacheManifest(item) {
  if (!item?.id || item.type !== "cache-manifest") return;
  broadcastToMesh({ type: "CACHE_MANIFEST", item, fromPeer: myPeerId });
}

/**
 * Assina um manifesto de cache com a conta deste aparelho, guarda localmente e anuncia na malha.
 * @param {object} manifestBody Manifesto da comunidade (com `communityId`).
 * @returns {Promise<object>} O item assinado que foi anunciado.
 */
export async function publishSignedCacheManifest(manifestBody) {
  const draft = manifestMesh.buildCacheManifestGossipDraft({
    communityId: manifestBody?.communityId,
    manifest: manifestBody,
  });
  const signed = await localAccount.signPayload(draft);
  await manifestMesh.ingestSignedCacheManifestItem(signed, localAccount.verifyPayload);
  broadcastCacheManifest(signed);
  return signed;
}
