/**
 * @file Fachada de render de comunidades (re-exporta módulos focados).
 *
 * Contagens e telemetria refletem somente o que o aparelho já carregou (sem números fictícios centrais).
 *
 * @module render/community
 */
export { CIVIC_TAGS, extractTopicCivicTag } from "./topic-badges.js";

export {
  renderCommunityAvatarHtml,
  renderCommunityOrkutMembersBox,
  renderHome,
  renderCommunityPeopleStrip,
} from "./community-home.js";

export {
  TOPICS_PAGE_SIZE,
  renderNewKeyHeldNoticeHtml,
  renderCommunityTopicRow,
  renderCommunityMembersTab,
  renderCommunityTopicFeedInner,
  renderCommunityPostsTab,
} from "./community-topics.js";

export {
  computeCommunityNeighborStats,
  renderCommunitySeedChecklist,
} from "./community-neighbors.js";

export { renderCommunity, renderCommunityTabContent } from "./community-page.js";

export {
  renderCommunityGovernanceTab,
  renderProposalItem,
  renderProposalStatusBadge,
  renderListingItem,
  renderComposeProposal,
} from "./community-governance.js";