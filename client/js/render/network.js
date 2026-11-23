/** @file Network settings facade: exports participation layers, steward wizard and network settings screen. */
import { renderInviteFriendsCard } from "./util.js";
import {
  inferParticipationLayer,
  renderSupporterCardHtml,
  renderTurnOnlyHtml,
} from "./network-participation.js";
import { renderNetworkForm } from "./network-form.js";
import {
  renderNetworkHeader,
  renderNetworkStats,
  renderStatusLinkBlock,
  renderPosseWebhooksSection,
  renderModerationSettingsSection,
} from "./network-sections.js";
import { renderStewardWizard } from "./network-steward.js";

export {
  inferParticipationLayer,
  renderSupporterCardHtml,
  renderTurnOnlyHtml,
  renderStewardWizard,
};

/**
 * Desenha a tela de configurações de rede: cabeçalho de estado, números do nó, formulário (com disco e
 * banda por modo), link de status, webhooks POSSE e listas de moderação local.
 *
 * @param {HTMLElement} main Contêiner da tela; o conteúdo é substituído.
 * @param {object} [props={}] Estado lido em `app/screens-network.js` (configurações, métricas, relays, moderação).
 * @returns {void}
 */
export function renderNetworkSettings(main, props = {}) {
  let html = renderNetworkHeader(props);
  html += renderNetworkStats(props.metrics, props.cacheStats, props.dailyUsage, props.settings);
  html += renderNetworkForm(props);
  if (props.routeId) {
    html += renderInviteFriendsCard({
      routeId: props.routeId,
      inviteLink: props.inviteLink || "",
      buttonId: "btn-network-share-connect",
      codeId: "network-invite-connect-url",
      className: "card network-invite-card",
    });
  }
  html += renderStatusLinkBlock();
  html += renderPosseWebhooksSection(props.posseWebhooks || []);
  html += renderModerationSettingsSection(props.blockedUsers || [], props.mutedUsers || []);
  main.innerHTML = html;
}
