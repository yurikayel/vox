/**
 * @file Fachada de render do feed da Ágora (re-exporta módulos focados).
 *
 * Gera HTML estático; eventos e persistência ficam nos controllers de rota e em `social.js`.
 *
 * @module render/feed
 */
export { renderComposerStrip, renderInlineComposer } from "./feed-composer.js";
export { formatPostMarkdown, commentsPanelId, renderCommentNestedReplyComposer, renderInlineReplyItem, renderCommentList, renderPostComments } from "./feed-comments.js";
export { quarantineShareAttrs, renderQuarantineAction, renderPostOwnerMenu } from "./feed-post-toolbar.js";
export { getPostFeedLayout } from "./feed-post-media.js";
export { renderPostTextHtml, renderFrameContentHtml, renderPostFrame, renderPostItem } from "./feed-post-item.js";
export { renderStoriesStrip, renderFeedTabsBar, renderExternalFeedManagerHtml, renderFeed } from "./feed-chrome.js";