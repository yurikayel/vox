/** @file Steward wizard and network identity synchronization handlers. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as inbox from "../inbox.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import { getActiveUser, makeShellProps } from "./context.js";

/**
 * Liga os botões de teste do espelho do administrador.
 */
function bindStewardTestButtons() {
  document.getElementById("sw-test-mirror")?.addEventListener("click", async () => {
    const draft = stewardWizard.loadDraft();
    const out = document.getElementById("sw-mirror-result");
    if (out) out.textContent = "Enviando…";
    const result = await communityMirror.testMirrorForSteward(draft.communityId, [], draft.relayHttpUrl || inbox.getRelayHttpUrl());
    if (out) out.textContent = result ? "Espelho OK — relay aceitou o índice." : "Falha — veja toast ou código acima.";
    if (result) showStewardWizard();
  });

  document.getElementById("sw-verify-relay")?.addEventListener("click", async () => {
    const url = document.getElementById("sw-relay-http")?.value.trim();
    const out = document.getElementById("sw-verify-result");
    if (out) out.textContent = "Verificando…";
    const r = await stewardWizard.verifyRelayHttp(url);
    if (out) out.textContent = r.ok ? `OK · ${stewardWizard.formatRelayHealthSummary(r.data)}` : `Falha: ${r.reason}`;
  });
}

/**
 * Liga formulário do assistente steward.
 *
 * @returns {void}
 */
export function bindStewardWizardForm() {
  const form = document.getElementById("form-steward-wizard");
  if (!form) return;
  const step = stewardWizard.loadStep();

  document.getElementById("sw-prev")?.addEventListener("click", () => {
    stewardWizard.saveDraft(stewardWizard.readFormStep(step));
    stewardWizard.saveStep(step - 1);
    showStewardWizard();
  });

  bindStewardTestButtons();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = stewardWizard.readFormStep(step);
    if (step === 1 && !data.pledge) return share.showToast("Marque o compromisso para continuar.", "error");
    stewardWizard.saveDraft(data);
    if (step === 5) {
      const draft = stewardWizard.loadDraft();
      if (draft.signalingUrl) localStorage.setItem("vox-custom-signaling-url", draft.signalingUrl);
      if (draft.relayHttpUrl) inbox.saveRelayHttpUrl(draft.relayHttpUrl);
      share.showToast("Wizard concluído — URLs salvas em Preferências de rede.");
      location.hash = "#/settings/network";
      return;
    }
    stewardWizard.saveStep(step + 1);
    showStewardWizard();
  });
}

/**
 * Monta assistente steward.
 *
 * @returns {Promise<void>}
 */
export async function showStewardWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Assistente steward"));
  const step = stewardWizard.loadStep();
  const draft = stewardWizard.loadDraft();
  const mirrorLast =
    communityMirror.getMirrorStatusForCommunity(draft.communityId) ||
    communityMirror.loadMirrorTelemetry().lastError;
  render.renderStewardWizard(main, { draft, step, mirrorLast });
  bindStewardWizardForm();
}
