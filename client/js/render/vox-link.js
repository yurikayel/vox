/** @file PM-82 — cartão do convite com vínculo assinado, na tela "Conectar". */

import { escapeHtml } from "./util.js";

const PRIVACY_NOTE = "O vínculo fica visível para os aparelhos da rede e para a memória central (não vai para o Arweave). Quem é seu padrinho pode revisar denúncias contra posts seus.";

function renderSponsorBoxHtml(name, checked) {
  return `<label class="vox-link-sponsor">
      <input type="checkbox" id="vox-link-sponsor" ${checked ? "checked" : ""} />
      ${escapeHtml(name)} me trouxe para o Vox (padrinho)
    </label>`;
}

/** PM-83 lote F: trocar de padrinho (uma vez) e vínculo "só mediação". */
function renderOptionsHtml(name, canSwitch) {
  const swap = canSwitch ? `<label class="vox-link-switch">
      <input type="checkbox" id="vox-link-switch" />
      Trocar meu padrinho para ${escapeHtml(name)} (vale em 7 dias; só dá para trocar uma vez)
    </label>` : "";
  return `${swap}<label class="vox-link-mediation">
      <input type="checkbox" id="vox-link-mediation" />
      Só para mediação (este vínculo nunca dá poder de arquivar posts meus)
    </label>`;
}

const STATE_TEXT = {
  pending: (name) => `⏳ Aceite enviado. O vínculo fecha quando o aparelho de ${name} receber.`,
  confirmed: (name) => `✓ Vínculo com ${name} confirmado pelas duas pessoas.`,
};

/** `state`: "none" (pode aceitar), "pending" ou "confirmed". */
export function renderInviteCardHtml({ name = "", state = "none", canSponsor = false, sponsorDefault = false, canSwitch = false, options = false } = {}) {
  const who = escapeHtml(name);
  if (STATE_TEXT[state]) {
    return `<div class="card vox-link-card" data-state="${state}"><p class="vox-link-status">${STATE_TEXT[state](who)}</p></div>`;
  }
  return `<div class="card vox-link-card" data-state="none">
    <h3 class="vox-link-title">${who} te convidou</h3>
    <p class="desc">Aceite para criar um vínculo assinado por vocês dois.</p>
    ${canSponsor ? renderSponsorBoxHtml(name, sponsorDefault) : ""}
    ${options ? renderOptionsHtml(name, canSwitch && !canSponsor) : ""}
    <p class="meta">${PRIVACY_NOTE}</p>
    <button type="button" class="btn btn-primary" id="btn-vox-link-accept">Aceitar vínculo</button>
  </div>`;
}
