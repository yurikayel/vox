/** @file "Algo errado aqui?" — modal de apontamento sobre o app (trabalho voluntário 3). */

import * as feedback from "../app-feedback.js";
import * as share from "../share.js";
import { escapeHtml } from "../render/util.js";
import { parseRoute } from "./route-parse.js";

const MODAL_ID = "feedback-modal-container";

export function renderFeedbackFormHtml(screen = "") {
  const options = feedback.FEEDBACK_KINDS.map(
    (k) => `
      <label class="feedback-kind">
        <input type="radio" name="feedback-kind" value="${k.id}" required> <span>${escapeHtml(k.label)}</span>
      </label>`,
  ).join("");
  return `
    <div class="modal-overlay modal-sheet" id="feedback-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <div class="modal-dialog modal-card feedback-modal">
        <h2 id="feedback-title">Algo errado aqui?</h2>
        <p class="desc">Sobre o <strong>app</strong>, na tela <strong>${escapeHtml(feedback.normalizeScreen(screen))}</strong>. Para denunciar um post ou uma pessoa, use o menu ⋯ do post.</p>
        <form id="form-feedback">
          <fieldset class="feedback-kinds"><legend class="desc">O que aconteceu?</legend>${options}</fieldset>
          <label for="feedback-note" class="desc">Quer contar mais? (opcional, até ${feedback.MAX_NOTE_LEN} caracteres)</label>
          <textarea id="feedback-note" class="form-control" rows="3" maxlength="${feedback.MAX_NOTE_LEN}"></textarea>
          <div class="feedback-actions">
            <button type="submit" class="btn btn-primary">Salvar apontamento</button>
            <button type="button" class="btn btn-outline" id="btn-feedback-cancel">Cancelar</button>
          </div>
        </form>
      </div>
    </div>`;
}

export function renderFeedbackDoneHtml(total = 1) {
  return `
    <div class="modal-overlay modal-sheet" id="feedback-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-done-title">
      <div class="modal-dialog modal-card feedback-modal">
        <h2 id="feedback-done-title">Obrigado!</h2>
        <p class="desc">Ficou salvo <strong>só neste aparelho</strong> (${total} no total). Para a equipe do piloto ver, compartilhe no grupo.</p>
        <div class="feedback-actions feedback-actions--stack">
          <button type="button" class="btn btn-primary" id="btn-feedback-share">Compartilhar apontamentos</button>
          <button type="button" class="btn btn-outline" id="btn-feedback-close">Fechar</button>
        </div>
      </div>
    </div>`;
}

function container() {
  let el = document.getElementById(MODAL_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = MODAL_ID;
    document.body.appendChild(el);
  }
  return el;
}

function closeFeedbackModal() {
  const el = document.getElementById(MODAL_ID);
  if (el) el.innerHTML = "";
}

/** Nome do cache do Service Worker em uso (ex.: vox-pwa-v7.44-…), ou "". */
export async function currentAppVersion(cacheApi = globalThis.caches) {
  try {
    const keys = (await cacheApi?.keys?.()) || [];
    const ours = keys.filter((k) => k.startsWith("vox-pwa-"));
    return ours.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop() || "";
  } catch {
    return "";
  }
}

export async function shareFeedbackList(list = feedback.listFeedback()) {
  const text = feedback.formatFeedbackForShare(list);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Apontamentos do Vox", text });
      share.showToast(share.SHARE_NATIVE_SUCCESS_TOAST);
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    share.showToast("Apontamentos copiados: cole no grupo do piloto.");
    return true;
  } catch {
    share.showToast("Não foi possível copiar os apontamentos.", "error");
    return false;
  }
}

async function submitFeedback(screen, form) {
  const kind = form.querySelector('input[name="feedback-kind"]:checked')?.value || "";
  const note = form.querySelector("#feedback-note")?.value || "";
  const rec = feedback.buildFeedback({ screen, kind, note, version: await currentAppVersion() });
  const total = feedback.saveFeedback(rec);
  container().innerHTML = renderFeedbackDoneHtml(total);
  document.getElementById("btn-feedback-close")?.addEventListener("click", closeFeedbackModal);
  document.getElementById("btn-feedback-share")?.addEventListener("click", () => void shareFeedbackList());
}

export function openFeedbackFlow(screen = parseRoute().name) {
  container().innerHTML = renderFeedbackFormHtml(screen);
  document.getElementById("btn-feedback-cancel")?.addEventListener("click", closeFeedbackModal);
  document.getElementById("form-feedback")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector('button[type="submit"]');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    try {
      await submitFeedback(screen, e.target);
    } catch (err) {
      share.showToast(err.message || "Não foi possível salvar o apontamento.", "error");
      if (submit) submit.disabled = false;
    }
  });
}

let feedbackHandlersWired = false;

/** Liga todo elemento [data-app-feedback] (o botão do rodapé, presente em todas as telas) ao modal. */
export function attachFeedbackHandlers(doc = globalThis.document) {
  if (feedbackHandlersWired || !doc?.addEventListener) return;
  feedbackHandlersWired = true;
  doc.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-app-feedback]");
    if (!btn) return;
    e.preventDefault();
    openFeedbackFlow();
  });
}
