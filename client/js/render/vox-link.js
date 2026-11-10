/** @file PM-82 — cartão do convite com vínculo assinado, na tela "Conectar". */

import { escapeHtml } from "./util.js";

const PRIVACY_NOTE = "O vínculo fica visível para os aparelhos da rede e para a memória central (não vai para o Arweave). Quem é seu padrinho pode revisar denúncias contra posts seus.";

function renderSponsorBoxHtml(name, checked) {
  return `<label class="vox-link-sponsor">
      <input type="checkbox" id="vox-link-sponsor" ${checked ? "checked" : ""} />
      ${escapeHtml(name)} me trouxe para o Vox (padrinho)
    </label>`;
}

const STATE_TEXT = {
  pending: (name) => `⏳ Aceite enviado. O vínculo fecha quando o aparelho de ${name} receber.`,
  confirmed: (name) => `✓ Vínculo com ${name} confirmado pelas duas pessoas.`,
};

/** `state`: "none" (pode aceitar), "pending" ou "confirmed". */
export function renderInviteCardHtml({ name = "", state = "none", canSponsor = false, sponsorDefault = false } = {}) {
  const who = escapeHtml(name);
  if (STATE_TEXT[state]) {
    return `<div class="card vox-link-card" data-state="${state}"><p class="vox-link-status">${STATE_TEXT[state](who)}</p></div>`;
  }
  return `<div class="card vox-link-card" data-state="none">
    <h3 class="vox-link-title">${who} te convidou</h3>
    <p class="desc">Aceite para criar um vínculo assinado por vocês dois.</p>
    ${canSponsor ? renderSponsorBoxHtml(name, sponsorDefault) : ""}
    <p class="meta">${PRIVACY_NOTE}</p>
    <button type="button" class="btn btn-primary" id="btn-vox-link-accept">Aceitar vínculo</button>
  </div>`;
}
