/**
 * @file Fachada dos fluxos de composição e respostas inline (re-exporta os módulos de domínio focados).
 *
 * @module app/screens-compose
 * @see client/js/app/compose-community.js
 * @see client/js/app/compose-topic.js
 * @see client/js/app/compose-listing.js
 * @see client/js/app/compose-proposal.js
 * @see client/js/app/compose-reply.js
 * @see client/js/app/compose-inline-replies.js
 */

export { showComposeCommunity } from "./compose-community.js";
export { showComposeTopic } from "./compose-topic.js";
export { showComposeListing, handleComposeListingSubmit } from "./compose-listing.js";
export {
  showComposeProposal,
  attachComposeProposalHandlers,
  publishProposal,
} from "./compose-proposal.js";
export { showComposeReply, persistLocalReply } from "./compose-reply.js";
export {
  loadInlineReplies,
  setCommentOpen,
  closeOtherCommentPanels,
  fillCommentFeed,
  togglePostComments,
  appendInlineReply,
  appendNestedInlineReply,
  toggleCommentReplyComposer,
  onNestedCommentReplySubmit,
  bumpReplyCount,
  onInlineReplySubmit,
} from "./compose-inline-replies.js";
