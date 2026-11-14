/**
 * @file Guardiões, parte 3b — tela `#/guardioes`: escolher guardiões entre os laços mútuos, dividir e enviar,
 * ver quantos confirmaram, e parar de guardar a volta de alguém. Spec: `docs/specs/guardioes-v0.md` §5–§6.
 */

import * as render from "../render.js";
import * as share from "../share.js";
import * as contacts from "../contacts.js";
import * as social from "../social.js";
import * as guardians from "../guardians.js";
import { getAuthorDisplaySync } from "../profile-directory.js";
import { shortId } from "../short-id.js";
import { phraseNeedsPassphrase } from "../account-phrase.js";
import * as localAccount from "../local-account.js";
import {
  describeThreshold,
  renderGuardianChooserHtml,
  renderGuardianStatusHtml,
  renderGuardiansScreenHtml,
  renderHeldListHtml,
} from "../render/guardians.js";
import { filterMutualTies, sendGuardianShares, stopGuarding } from "./guardians-flow.js";
import { getActiveUser, makeShellProps } from "./context.js";

function labelFor(routeId, fallback = "") {
  const contact = contacts.listContacts().find((c) => c.routeId === routeId);
  return contact?.label || fallback || getAuthorDisplaySync(routeId) || shortId(routeId);
}

async function loadCandidates() {
  const pool = [...contacts.listContacts().map((c) => c.routeId), ...social.getWatchedProfiles()];
  return (await filterMutualTies(pool)).map((routeId) => ({ routeId, name: labelFor(routeId) }));
}

function ownerStatus(me) {
  const split = guardians.getOwnerSplit(me);
  if (!split) return null;
  return { ...guardians.countConfirmed(me), names: split.guardians.map((g) => labelFor(g.routeId)) };
}

function showError(text) {
  const el = document.getElementById("guardian-error");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

function chosenGuardians() {
  return [...document.querySelectorAll('#form-guardians input[name="guardian"]:checked')].map((el) => el.value);
}

function syncHint() {
  const hint = document.getElementById("guardian-hint");
  const m = Number(document.getElementById("guardian-m")?.value) || guardians.DEFAULT_M;
  if (hint) hint.textContent = describeThreshold(m, chosenGuardians().length);
}

const FAILURES = {
  "not-mutual": "Só dá para escolher quem tem laço mútuo com você.",
  "no-key": "Ainda não temos a chave de mensagem de alguém da lista. Peça para a pessoa abrir o Vox e tente de novo.",
};

async function submitGuardians() {
  const chosen = chosenGuardians();
  const m = Number(document.getElementById("guardian-m")?.value) || guardians.DEFAULT_M;
  if (chosen.length < 3 || m > chosen.length) return showError(describeThreshold(m, chosen.length));
  const btn = document.getElementById("btn-guardians-send");
  if (btn) btn.disabled = true;
  try {
    const res = await sendGuardianShares({ guardians: chosen, m, passphrase: document.getElementById("guardian-pass")?.value || "" });
    if (!res.ok) return showError(FAILURES[res.reason] || "Não deu para enviar.");
    share.showToast("Pedaços enviados. A saída vale quando o mínimo confirmar.");
    await showGuardians();
  } catch (err) {
    showError(err?.message || "Não deu para enviar.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindScreen() {
  const form = document.getElementById("form-guardians");
  form?.addEventListener("change", syncHint);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitGuardians();
  });
  document.querySelectorAll("[data-stop-guarding]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await stopGuarding(btn.dataset.stopGuarding);
      share.showToast("Você parou de guardar. A pessoa foi avisada.");
      await showGuardians();
    })
  );
  syncHint();
}

/** Abre a tela dos guardiões da conta ativa. */
export async function showGuardians() {
  const user = await getActiveUser();
  const me = await localAccount.getRouteId();
  const main = render.renderShell(makeShellProps(user, "profile", "Guardiões"));
  const [candidates, needsPassphrase] = await Promise.all([loadCandidates(), phraseNeedsPassphrase()]);
  main.innerHTML = renderGuardiansScreenHtml({
    statusHtml: renderGuardianStatusHtml(ownerStatus(me)),
    chooserHtml: renderGuardianChooserHtml({ candidates, m: guardians.DEFAULT_M, needsPassphrase }),
    heldHtml: renderHeldListHtml(guardians.listHeld().map((h) => ({ owner: h.owner, name: labelFor(h.owner, h.ownerName) }))),
  });
  bindScreen();
}
