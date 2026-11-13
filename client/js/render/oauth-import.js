/** @file ADR-032 — "Importar nome e foto" (Google, Meta, GitHub), aberto do Perfil: longe da entrada e dizendo que não guarda a conta. */

/** Ícones inline (GIS / Meta brand — sem asset extra no SW). */
const OAUTH_SVG_GOOGLE = `<svg class="oauth-btn__icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const OAUTH_SVG_META = `<svg class="oauth-btn__icon oauth-btn__icon--meta" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;

const OAUTH_SVG_GITHUB = `<svg class="oauth-btn__icon oauth-btn__icon--github" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;

function renderOAuthProviderButtonsHtml() {
  return `<div class="oauth-enrich-actions">
    <button type="button" id="btn-oauth-google" class="oauth-btn oauth-btn--google" aria-label="Entrar com Google para importar nome e foto">
      ${OAUTH_SVG_GOOGLE}
      <span class="oauth-btn__label">Nome e foto do Google</span>
    </button>
    <button type="button" id="btn-oauth-meta" class="oauth-btn oauth-btn--meta" aria-label="Entrar com Meta para importar nome e foto">
      ${OAUTH_SVG_META}
      <span class="oauth-btn__label">Nome e foto da Meta</span>
    </button>
    <button type="button" id="btn-oauth-github" class="oauth-btn oauth-btn--github" aria-label="Entrar com GitHub para importar nome e foto">
      ${OAUTH_SVG_GITHUB}
      <span class="oauth-btn__label">Nome e foto do GitHub</span>
    </button>
  </div>`;
}

/** ADR-032: nome e foto de Google, Meta ou GitHub ficam no Perfil, longe da entrada, e dizem que não guardam a conta. */
function renderImportBodyHtml() {
  return `
          <h2 id="oauth-enrich-title" class="genesis-panel-title">Importar nome e foto</h2>
          <p class="genesis-lead">Só nome e foto. <strong>Não guarda sua conta:</strong> se você limpar o navegador, entrar com Google não traz ela de volta. Para isso, crie sua saída em Perfil → Backup.</p>
          ${renderOAuthProviderButtonsHtml()}
          <div class="genesis-links"><button type="button" id="btn-oauth-skip" class="genesis-link">Cancelar</button></div>
          <p class="meta oauth-enrich-legal">Tokens do Google e da Meta não são guardados (LGPD).</p>`;
}

/**
 * Painel do modal no modo importar, com o mesmo invólucro de etapas da entrada.
 * @returns {string} HTML do painel.
 */
export function renderImportPanelHtml() {
  return `
        <section class="genesis-panel genesis-panel--steps">
          <div id="oauth-enrich-error" class="oauth-enrich-error" role="alert" aria-live="polite" hidden></div>
          <section class="genesis-step" data-genesis-step="import">${renderImportBodyHtml()}</section>
        </section>`;
}
