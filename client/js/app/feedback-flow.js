/** @file "Algo errado aqui?" — modal de apontamento sobre o app (trabalho voluntário 3). */

import * as feedback from "../app-feedback.js";
import * as share from "../share.js";
import { escapeHtml } from "../render/util.js";
import { parseRoute } from "./route-parse.js";
import { modalHost, clearModalHost } from "../render/modal-host.js";

const MODAL_ID = "feedback-modal-container";

/**
 * HTML do modal "Algo errado aqui?" na tela atual.
 *
 * @param {string} [screen=""] Nome lógico da rota para o texto de contexto.
 * @returns {string} Marcação do formulário.
 */
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

/**
 * HTML da etapa de confirmação após salvar apontamento local.
 *
 * @param {number} [total=1] Quantidade total de apontamentos neste aparelho.
 * @returns {string} Marcação do modal de obrigado.
 */
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

const container = () => modalHost(MODAL_ID);
const closeFeedbackModal = () => clearModalHost(MODAL_ID);

/**
 * Nome do cache do Service Worker em uso (ex.: `vox-pwa-v7.44-…`), ou string vazia.
 *
 * @param {CacheStorage} [cacheApi=globalThis.caches] API de caches do navegador.
 * @returns {Promise<string>} Último cache `vox-pwa-*` conhecido.
 */
export async function currentAppVersion(cacheApi = globalThis.caches) {
  try {
    const keys = (await cacheApi?.keys?.()) || [];
    const ours = keys.filter((k) => k.startsWith("vox-pwa-"));
    return ours.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).pop() || "";
  } catch {
    return "";
  }
}

/**
 * Compartilha ou copia a lista de apontamentos para a equipe do piloto.
 *
 * @param {object[]} [list=feedback.listFeedback()] Registros salvos localmente.
 * @returns {Promise<void>|void} Resultado de {@link share.shareOrCopy}.
 */
export function shareFeedbackList(list = feedback.listFeedback()) {
  return share.shareOrCopy({
    title: "Apontamentos do Vox",
    text: feedback.formatFeedbackForShare(list),
    copiedToast: "Apontamentos copiados: cole no grupo do piloto.",
    failToast: "Não foi possível copiar os apontamentos.",
  });
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

/**
 * Abre o fluxo de apontamento sobre o app na tela indicada.
 *
 * @param {string} [screen=parseRoute().name] Nome da rota para contextualizar o formulário.
 * @returns {void}
 */
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
