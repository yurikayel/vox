/**
 * UI prep for retratação gossip (GOSSIP_UPDATE / GOSSIP_DELETE).
 * Protocolo P2P fica em peers.js — aqui só shape de dados + render hooks.
 */

/** @type {boolean} Ative quando a malha propagar update/delete assinados. */
export const GOSSIP_RETRACT_UI = true;

let testOverride = null;

/** @param {boolean|null} enabled */
export function __setGossipRetractUiEnabledForTests(enabled) {
  testOverride = enabled;
}

export function isGossipRetractUiEnabled() {
  if (testOverride !== null) return Boolean(testOverride);
  return GOSSIP_RETRACT_UI;
}

/**
 * @param {object|null|undefined} post
 * @returns {boolean}
 */
export function isGossipTombstone(post) {
  if (!post) return false;
  if (post.gossipTombstone === true) return true;
  const tomb = post.gossipTombstone;
  return Boolean(tomb && typeof tomb === "object" && tomb.deleted);
}

/**
 * @param {object|null|undefined} post
 * @returns {boolean}
 */
export function isGossipEdited(post) {
  if (!post) return false;
  if (post.gossipEditedAt > 0) return true;
  const upd = post.gossipUpdate;
  return Boolean(upd && typeof upd === "object" && upd.appliedAt > 0);
}

/**
 * @param {object|null|undefined} post
 * @returns {boolean}
 */
export function shouldHideGossipDeletedPost(post) {
  return isGossipRetractUiEnabled() && isGossipTombstone(post);
}

/**
 * @param {object[]} topics
 * @returns {object[]}
 */
export function filterFeedTopicsForGossipRetract(topics = []) {
  if (!isGossipRetractUiEnabled()) return topics;
  return topics.filter((t) => !shouldHideGossipDeletedPost(t));
}

export function renderGossipEditedBadgeHtml() {
  return `<span class="badge-pill gossip-edited-pill" title="Editado na rede">Editado</span>`;
}

export function renderGossipDeletedTopicShellHtml() {
  return `<article class="post insta-post post-gossip-deleted card" hidden aria-hidden="true" data-gossip-deleted="1">
    <p class="post-gossip-deleted-msg">Esta publicação foi removida na rede.</p>
  </article>`;
}
