/**
 * @module render/profile-sovereignty
 * Cartão de backup e sincronização entre aparelhos do Perfil (Senha Soberana, cofre, .voxid).
 */

import { escapeHtml } from "./util.js";
import { formatPhraseSentInEmailNotice } from "../email-kit.js";

function renderPhraseInEmailNoticeHtml(address) {
  const emailNotice = formatPhraseSentInEmailNotice(address);
  return emailNotice
    ? `<p class="desc phrase-in-email-notice" role="note" style="margin-bottom:0.5rem;">⚠️ ${escapeHtml(emailNotice)}</p>`
    : "";
}

/**
 * Cartão "Soberania & Sincronização" do Perfil: Senha Soberana, cofre, QR, arquivo .voxid e restauração.
 * Se a frase de recuperação foi junto no e-mail (ADR-032 Emenda 1), avisa no topo.
 * @param {string} [address] routeId da conta mostrada
 * @returns {string} HTML do cartão
 */
export function renderSovereigntyCard(address = "") {
  return `
      <div class="card profile-sovereignty-export" style="margin-top:0.75rem;">
        <h3>Soberania & Sincronização entre Aparelhos</h3>
        ${renderPhraseInEmailNoticeHtml(address)}
        <p class="desc" style="font-size:0.85rem; margin-bottom:0.5rem;">
          Chaves P-256 de assinatura e chaves de DM <strong>deste aparelho</strong>.
          Não inclui o IndexedDB completo nem a lista de seguidores.
          Defina uma <strong>Senha Soberana</strong> para habilitar acesso em outros navegadores ou celulares com criptografia de ponta a ponta (AES-GCM-256).
        </p>
        <label for="input-sovereignty-passphrase" class="desc" style="display:block; font-size:0.82rem; margin-bottom:0.25rem;">
          Senha Soberana (usada para sincronizar aparelhos e cifrar backup offline)
        </label>
        <input type="password" id="input-sovereignty-passphrase" class="form-control" autocomplete="new-password" placeholder="Digite uma senha forte para sua conta…" style="margin-bottom:0.5rem;" />
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          <button type="button" id="btn-save-sovereign-vault" class="btn btn-sm btn-primary">☁️ Sincronizar em Outro Aparelho</button>
          <button type="button" id="btn-sync-qr-device" class="btn btn-sm btn-outline">📲 QR Code para Celular</button>
          <button type="button" id="btn-export-account" class="btn btn-sm btn-outline">Baixar arquivo de soberania (.voxid)</button>
          <button type="button" id="btn-export-account-alt" class="btn btn-sm btn-outline" hidden aria-hidden="true">💾 Exportar Identidade (.json)</button>
          <label class="btn btn-sm btn-outline" style="margin:0; cursor:pointer;">
            📥 Restaurar Backup
            <input type="file" id="file-import-account" accept=".json,.voxid,.txt,application/json,text/plain" multiple style="display:none;" />
          </label>
        </div>
        <div id="sovereignty-sync-feedback" class="meta" style="margin-top:0.5rem;" hidden></div>
      </div>`;
}
