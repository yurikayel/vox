/**
 * @file Fachada unificada de configurações de rede, assistente steward e contas vinculadas.
 *
 * Re-exporta os submódulos especializados conforme o fatiamento Onda 3 (Hardening v3.2):
 * - `network-screen-settings.js`: preferências de rede, modo apoiador, formulário e telemetria;
 * - `network-screen-moderation.js`: moderação local e comprovante de contribuição (ADR-001);
 * - `network-screen-steward.js`: assistente steward e sincronização de identidade;
 * - `network-screen-linked.js`: contas vinculadas e login social.
 *
 * @module app/screens-network
 * @see client/js/app/network-screen-settings.js
 * @see client/js/app/network-screen-moderation.js
 * @see client/js/app/network-screen-steward.js
 * @see client/js/app/network-screen-linked.js
 */

export {
  bindSupporterToggle,
  bindNetworkSettingsForm,
  bindNetworkSettingsButtons,
  showNetworkSettings,
} from "./network-screen-settings.js";

export {
  bindModerationListButtons,
  bindModerationExportImport,
  bindContributionAttestationButton,
} from "./network-screen-moderation.js";

export {
  bindStewardWizardForm,
  showStewardWizard,
  syncIdentity,
} from "./network-screen-steward.js";

export {
  showLinkedAccounts,
  bindLinkedAccountsUi,
} from "./network-screen-linked.js";
