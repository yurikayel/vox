/**
 * @file Fachada de render de perfil, carteira e composição (re-exporta módulos focados).
 *
 * Perfis em grade, carteira Arweave, consulta Pix e telas de composição (tópico, resposta, oferta, comunidade).
 *
 * @module render/profile
 */
export {
  renderProfileGridNotFound,
} from "./profile-header.js";

export {
  normalizeProfileTab,
  renderProfile,
  renderProfileTabContent,
} from "./profile-tabs.js";

export {
  renderPixLookup,
  renderHandleConflict,
  renderWallet,
} from "./profile-wallet.js";

export {
  renderComposeTopic,
  renderComposeReply,
} from "./profile-compose-topic.js";

export {
  renderComposeCommunity,
  renderComposeListing,
} from "./profile-compose-wizards.js";
