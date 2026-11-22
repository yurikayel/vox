/** @file App initialization, social interactions, and gossip routing facade. */
import { wireDmBadgeLive } from "./dm-badge-live.js";
import { wireSidebarCirclesLive } from "./sidebar-circles-live.js";
import { wireTabSyncAtBoot, bindGossipSubscriptions } from "./init-network-sync.js";

/**
 * Registra listeners de gossip, signaling e recompensa de voxel local (boot social).
 *
 * @returns {void}
 */
export function initGossipListeners() {
  wireTabSyncAtBoot();
  wireDmBadgeLive();
  wireSidebarCirclesLive();
  bindGossipSubscriptions();
}

export { executeFrameAction, handleFrameActionClick } from "./init-frame-actions.js";
export { openPostEditModal, handleDeletePost } from "./init-post-mutation.js";
export { initSocialInteractions } from "./init-social-actions.js";
export { initDmListeners } from "./screens-dm.js";
