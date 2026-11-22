/** @file Gerenciador soberano de contas vinculadas e auto-replicação multi-redes (ATProto + Webhooks). */

export {
  LINKED_ACCOUNTS_KEY,
  AUTO_REPLICATE_KEY,
  GENERAL_WEBHOOK_KEY,
  BSKY_DEFAULT_PDS,
  SUPPORTED_NETWORKS,
  INTENT_NETWORK_META,
  normalizeHandle,
  validateHandle,
  resolveNetworkProfileUrl,
  getNetworkAuthUrl,
  getSuggestedHandle,
} from "./linked-accounts-format.js";

export {
  sanitizeLinkedAccounts,
  loadLinkedAccounts,
  saveLinkedAccount,
  removeLinkedAccount,
  isAutoReplicationEnabled,
  setAutoReplicationEnabled,
  getGeneralWebhookUrl,
  setGeneralWebhookUrl,
  confirmLinkedAccount,
  connectWithOneClick,
} from "./linked-accounts-store.js";

export {
  postToBlueskyAtProto,
} from "./linked-accounts-bsky.js";

export {
  buildReplicationPayload,
  getConnectedIntentTargets,
  hasDirectReplicationTargets,
  dispatchAutoReplication,
} from "./linked-accounts-dispatch.js";

export {
  testLinkedAccount,
} from "./linked-accounts-verify.js";
