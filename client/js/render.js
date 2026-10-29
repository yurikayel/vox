/** @file Barrel re-export of Vox client render API (split under ./render/). */
export {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  getCommunityColor,
  formatTimeAgo,
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatIsoTimestamp,
  postTimeParts,
  renderPostAuthorMetaLines,
} from "./render/util.js";

export {
  renderNetworkChip,
  renderFeedNav,
  updateTopBarSync,
  renderShell,
  renderLoading,
  renderError,
  renderDemoBanner,
  renderGatewayBanner,
} from "./render/shell.js";

export {
  renderComposerStrip,
  renderInlineComposer,
  getPostFeedLayout,
  formatPostMarkdown,
  commentsPanelId,
  renderInlineReplyItem,
  renderCommentList,
  renderPostComments,
  renderPostOwnerMenu,
  renderQuarantineAction,
  renderPostTextHtml,
  renderFrameContentHtml,
  renderPostFrame,
  renderPostItem,
  renderStoriesStrip,
  renderWelcomeFeedHintHtml,
  renderFeedTabsBar,
  renderExternalFeedManagerHtml,
  renderFeed,
} from "./render/feed.js";

export { renderTopic } from "./render/topic.js";

export {
  renderHome,
  renderCommunityPeopleStrip,
  renderCommunity,
  renderCommunityAvatarHtml,
  renderCommunityOrkutMembersBox,
  renderCommunityTopicRow,
  renderCommunityGovernanceTab,
  renderProposalItem,
  renderProposalStatusBadge,
  renderListingItem,
  renderProposalDetail,
  renderProposalDiff,
  renderProposalTally,
  renderProposalVotingBox,
  renderProposalVotesList,
  renderComposeProposal,
  computeCommunityNeighborStats,
  renderCommunitySeedChecklist,
} from "./render/community.js";

export {
  renderProfile,
  renderProfileGridNotFound,
  renderPixLookup,
  renderHandleConflict,
  renderWallet,
  renderComposeCommunity,
  renderComposeTopic,
  renderComposeReply,
  renderComposeListing,
} from "./render/profile.js";

export {
  renderOAuthEnrich,
  closeOAuthEnrich,
  renderPeopleSearch,
  renderPostPactConnectModal,
  closePostPactConnectModal,
  renderConnectPreview,
  renderCantinaGate,
  closeCantinaGate,
  renderPactModal,
  closePactModal,
  renderZapModal,
  closeZapModal,
  postEditInitialText,
  renderPostEditModal,
  closePostEditModal,
} from "./render/oauth-modals.js";

export {
  inferParticipationLayer,
  renderNetworkSettings,
  renderStewardWizard,
} from "./render/network.js";

export { renderDmList, renderDmThread } from "./render/dm.js";

export { renderTagFeed, renderPolisReportHtml } from "./render/tag-polis.js";

export { renderVoxpedia } from "./render/voxpedia.js";
export { renderAjudaTeste, VOX_GITHUB_ISSUES } from "./render/ajuda-teste.js";

export { renderStatusPage } from "./render/status.js";
export { renderLinkedAccountsPage, renderLinkedAccountsHtml } from "./render/linked-accounts-ui.js";
