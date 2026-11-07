/**
 * @file Confirmação de voto em etapas (entender a pauta → confirmar a escolha), para evitar
 * voto por impulso. Abre por cima da página, sem tocar no #modal-container.
 */
import { escapeHtml } from "../render/util.js";

const CHOICE_LABELS = { yes: "Sim (aprovar)", no: "Não (rejeitar)", abstain: "Abstenção" };

export function voteChoiceLabel(choice) {
  return CHOICE_LABELS[choice] || String(choice || "");
}

function excerpt(text, max = 420) {
  const t = String(text || "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Marcação das duas etapas da confirmação (pura, testável). */
export function renderVoteConfirmHtml(proposal = {}, choice = "") {
  const title = escapeHtml(proposal.title || "Pauta sem título");
  const body = escapeHtml(excerpt(proposal.body)) || "<em>Sem descrição.</em>";
  return `
    <div class="vote-confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirmar voto">
      <div class="vote-confirm-sheet">
        <section class="vote-confirm-step" data-vote-step="understand">
          <p class="compose-step-count">Etapa 1 de 2</p>
          <h2 class="compose-step-title">Entenda a pauta</h2>
          <h3 class="vote-confirm-title">${title}</h3>
          <p class="vote-confirm-body">${body}</p>
          <div class="agora-composer-actions">
            <button type="button" class="agora-btn agora-btn--secondary" data-vote-cancel>Cancelar</button>
            <button type="button" class="agora-btn agora-btn--primary" data-vote-next>Continuar</button>
          </div>
        </section>
        <section class="vote-confirm-step" data-vote-step="confirm" hidden>
          <p class="compose-step-count">Etapa 2 de 2</p>
          <h2 class="compose-step-title">Confirme seu voto</h2>
          <p class="vote-confirm-choice">Seu voto: <strong>${escapeHtml(voteChoiceLabel(choice))}</strong></p>
          <p class="vote-confirm-note">O voto é assinado com a chave deste aparelho. Vale 1 voto por membro; votar de novo substitui o anterior.</p>
          <div class="agora-composer-actions">
            <button type="button" class="agora-btn agora-btn--secondary" data-vote-back>Voltar</button>
            <button type="button" class="agora-btn agora-btn--primary" data-vote-confirm>Confirmar e assinar</button>
          </div>
        </section>
      </div>
    </div>`;
}

/**
 * Abre a confirmação e resolve `true` só quando a pessoa confirma na 2ª etapa.
 * @returns {Promise<boolean>}
 */
export function confirmGovernanceVote(proposal, choice) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.innerHTML = renderVoteConfirmHtml(proposal, choice);
    const overlay = host.firstElementChild;
    document.body.appendChild(overlay);
    const show = (key) => {
      overlay.querySelectorAll("[data-vote-step]").forEach((s) => { s.hidden = s.dataset.voteStep !== key; });
      overlay.querySelector(`[data-vote-step="${key}"] .agora-btn--primary`)?.focus();
    };
    const done = (ok) => {
      overlay.remove();
      resolve(ok);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-vote-cancel]")) done(false);
      else if (e.target.closest("[data-vote-next]")) show("confirm");
      else if (e.target.closest("[data-vote-back]")) show("understand");
      else if (e.target.closest("[data-vote-confirm]")) done(true);
    });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") done(false); });
    show("understand");
  });
}
