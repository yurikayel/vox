/**
 * @file Guardiões, parte 3c — telas do pedido de volta: `#/guardiao?…` (o guardião confere e devolve) e `#/voltar`
 * (o aparelho novo pede, junta as respostas e entra). Spec: `docs/specs/guardioes-v0.md` §7; THREAT-MODEL T25.
 */

import * as render from "../render.js";
import * as share from "../share.js";
import * as contacts from "../contacts.js";
import * as guardians from "../identity/index.js";
import { skipOAuthEnrichment } from "../oauth-profile.js";
import { getAuthorAvatarSync, getAuthorDisplaySync } from "../profile-directory.js";
import { shortId } from "../short-id.js";
import {
  renderGuardianReturnHtml,
  renderRecoverPendingHtml,
  renderRecoverStartHtml,
  renderReturnSentHtml,
} from "../render/guardian-return.js";
import * as flow from "./guardian-return-flow.js";
import { getActiveUser, makeShellProps } from "./context.js";

const RECOVER_FAILURES = {
  invalid: "Não achei uma conta nisso. Cole o link do seu perfil ou o código vx_….",
  "no-keystore": "Este navegador não guarda a chave do pedido com segurança (aba anônima?). Abra o Vox numa aba normal.",
  "no-request": "O pedido venceu ou esta aba foi fechada. Crie outro.",
  "not-a-reply": "Isto não é uma resposta de guardião. Cole o texto inteiro, que começa com vox-volta:.",
  repeated: "Esta resposta já tinha chegado.",
  "wrong-account": "Os pedaços não formam a conta pedida. Confira se colou o link do seu perfil certo.",
};

function setError(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

/** Nome e foto como o guardião conhece a dona: contato, cartão de perfil ou o nome que veio no pedaço assinado. */
function ownerAsKnown(owner) {
  const contact = contacts.listContacts().find((c) => c.routeId === owner);
  const held = guardians.listHeld().find((h) => h.owner === owner);
  const name = contact?.label || getAuthorDisplaySync(owner) || held?.ownerName || shortId(owner);
  return { name, avatarUrl: getAuthorAvatarSync(owner) || "" };
}

async function mount(title) {
  const user = await getActiveUser();
  return render.renderShell(makeShellProps(user, "profile", title));
}

function bindGuardianReturn(request) {
  const box = document.getElementById("guardian-return-confirm");
  const btn = document.getElementById("btn-guardian-return");
  box?.addEventListener("change", () => {
    if (btn) btn.disabled = !box.checked;
  });
  btn?.addEventListener("click", async () => {
    btn.disabled = true;
    const res = await flow.sendGuardianReturn(request, { confirmed: Boolean(box?.checked) }).catch(() => ({ ok: false }));
    if (!res.ok) {
      btn.disabled = !box?.checked;
      return setError("guardian-return-error", "Não deu para devolver. Confira se o pedido ainda vale e tente de novo.");
    }
    const sent = document.getElementById("guardian-return-sent");
    if (!sent) return;
    sent.innerHTML = renderReturnSentHtml(res);
    sent.hidden = false;
    document.getElementById("btn-guardian-return-share")?.addEventListener("click", () =>
      share.shareOrCopy({ title: "Vox", text: res.pasteText, copyText: res.pasteText, copiedToast: "Resposta copiada." })
    );
  });
}

/**
 * Tela do guardião para um pedido aberto pelo link.
 * @param {URLSearchParams} query os campos do pedido
 */
export async function showGuardianReturn(query) {
  const main = await mount("Devolver a conta");
  const res = await flow.prepareGuardianReturn(query);
  if (!res.ok) {
    main.innerHTML = renderGuardianReturnHtml({ reason: res.reason });
    return;
  }
  main.innerHTML = renderGuardianReturnHtml({ ...ownerAsKnown(res.request.o), ageMs: Date.now() - res.request.t, code: res.code });
  bindGuardianReturn(res.request);
}

async function onFinish() {
  const res = await flow.finishRecovery().catch(() => ({ ok: false, reason: "error" }));
  if (res.ok) {
    skipOAuthEnrichment();
    share.showToast(`Conta de volta. Bem-vindo(a), ${res.displayName || "de novo"}!`);
    location.hash = "#/perfil";
    location.reload();
    return;
  }
  setError("guardian-recover-error", finishFailure(res));
}

function finishFailure(res) {
  if (res.reason !== "not-enough") return RECOVER_FAILURES[res.reason] || "Não deu para entrar. Tente de novo.";
  if (!res.have) return "Ainda não chegou nenhuma resposta que valha para esta conta.";
  return `Ainda faltam pedaços: ${res.have} de ${res.need} que valem para esta conta.`;
}

function bindPending(view) {
  const on = (id, fn) => document.getElementById(id)?.addEventListener("click", fn);
  on("btn-guardian-recover-share", () => share.shareOrCopy({ title: "Vox", text: "Pedido para devolver minha conta no Vox:", url: view.link, copyText: view.link }));
  on("btn-guardian-recover-add", async () => {
    const res = await flow.addPastedReply(document.getElementById("guardian-recover-paste")?.value || "");
    if (!res.ok) return setError("guardian-recover-error", RECOVER_FAILURES[res.reason] || "Isto não é uma resposta de guardião.");
    await showGuardianRecover();
  });
  on("btn-guardian-recover-pull", async () => {
    const got = await flow.collectRelayReplies();
    share.showToast(got ? `${got} resposta(s) nova(s).` : "Nada novo na caixa temporária.");
    if (got) await showGuardianRecover();
  });
  on("btn-guardian-recover-finish", () => void onFinish());
  on("btn-guardian-recover-cancel", async () => {
    flow.cancelRecovery();
    await showGuardianRecover();
  });
}

function bindStart() {
  document.getElementById("form-guardian-recover")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const owner = flow.parseOwnerInput(document.getElementById("guardian-recover-owner")?.value || "");
    const res = await flow.startRecovery(owner);
    if (!res.ok) return setError("guardian-recover-error", RECOVER_FAILURES[res.reason]);
    await showGuardianRecover();
  });
}

/** Tela do aparelho novo: pedir a conta de volta aos guardiões. Fecha a entrada, se veio de "Já tenho conta". */
export async function showGuardianRecover() {
  const modal = document.getElementById("modal-container");
  if (modal?.querySelector(".genesis-panel--steps")) render.closeOAuthEnrich(modal);
  const main = await mount("Voltar pelos guardiões");
  const view = await flow.currentRecovery();
  main.innerHTML = view ? renderRecoverPendingHtml(view) : renderRecoverStartHtml();
  if (view) bindPending(view);
  else bindStart();
}
