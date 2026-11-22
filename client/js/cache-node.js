/**
 * @file Cache local persistente do Vox (IndexedDB `vox-cache-db`): fachada principal reexportando dados de transações
 * com limpeza LRU, posts e lápides deste aparelho, DMs e as contagens de respostas. Os posts e lápides gravados
 * podem ser repassados à memória central (`registerCentralMemorySink`).
 */

export {
  getCachedTx,
  setCachedTx,
  getCacheStats,
  clearCache,
  enforceMaxCacheSize,
} from "./cache-node-tx.js";

export {
  saveDmMessage,
  notifyDmChanged,
  getAllDmMessages,
  getDmMessages,
  getDmConversations,
  deleteDmThread,
} from "./cache-node-dm.js";

export {
  registerCentralMemorySink,
} from "./cache-node-sink.js";

export {
  saveTombstone,
  getTombstone,
  getAllTombstones,
  getPostRecord,
} from "./cache-node-tombstones.js";

export {
  invalidateReplyCountsCache,
  saveLocalPost,
  getLocalPost,
  deleteLocalPost,
  getLocalPosts,
  getAllLocalPosts,
  getWirePosts,
  getReplyCountsMap,
  getReplyActivityMap,
  clearLocalPosts,
} from "./cache-node-posts.js";

export {
  getLocalCommunities,
  isCommunityUpdateAcceptable,
} from "./cache-node-communities.js";

export {
  getPostsByTag,
} from "./cache-node-tags.js";

// Dispara na shell via notifyDmChanged: new CustomEvent("vox:dm-changed")
