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
 * Renderiza o cartão de backup HTML standalone offline (EXP-04).
 *
 * @returns {string} HTML do cartão com o botão de download local.
 */
export function renderHtmlBackupCard() {
  return `<section class="card html-backup-card" style="margin-top:1.25rem;">
  <h3>Backup HTML offline</h3>
  <p class="desc">Salve seus posts num único arquivo HTML legível em qualquer navegador, sem internet e sem enviar nada para fora deste aparelho.</p>
  <button type="button" class="agora-btn agora-btn--secondary" id="btn-export-html-backup">Baixar backup HTML (offline)</button>
</section>`;
}

/**
 * Desenha a tela de configurações de rede: cabeçalho de estado, números do nó, formulário (com disco e
 * banda por modo), link de status, webhooks POSSE, backup HTML offline e listas de moderação local.
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
  html += renderHtmlBackupCard();
  html += renderPosseWebhooksSection(props.posseWebhooks || []);
  html += renderModerationSettingsSection(props.blockedUsers || [], props.mutedUsers || []);
  main.innerHTML = html;
}
