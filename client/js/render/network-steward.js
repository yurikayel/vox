/** @file Steward wizard UI rendering (V-P01 5-step assistant). */
import { escapeHtml } from "./util.js";

/** Wizard operador steward (V-P01) — MVP 5 passos. */
const STEWARD_STEP_RENDERERS = {
  1: (d) => `
    <p class="desc" style="font-size:0.85rem;">Camada Steward: espelho e relay para leitura mais rápida. Leia <code>COMPLIANCE-BR.md</code> no repositório Vox (Marco Civil, espelho).</p>
    <label style="display:flex; gap:0.5rem; align-items:flex-start; margin-top:0.75rem;">
      <input type="checkbox" id="sw-pledge" ${d.pledge ? "checked" : ""} required style="margin-top:0.2rem;" />
      <span>Comprometo-me a operar infra <strong>voluntária</strong>, com quotas e sem inspecionar DMs.</span>
    </label>`,
  2: (d) => `
    <div class="form-group">
      <label for="sw-community-id">Community-Id ou slug da comunidade</label>
      <input type="text" id="sw-community-id" class="form-control" value="${escapeHtml(d.communityId || "")}" placeholder="ex. bairro-centro" required />
    </div>`,
  3: () => `
    <p class="desc"><strong>VPS (coletivo):</strong> Docker em <code>relay/deploy</code> — Caddy expõe WSS e relay HTTP no mesmo domínio (<code>docs/operations/steward-relay-kit.md</code>).</p>
    <ul class="desc" style="font-size:0.85rem; margin:0.5rem 0 0 1rem;">
      <li>DNS + <code>docker compose up -d --build</code></li>
      <li><code>cp .env.example .env</code> — quota <code>VOX_RELAY_MAX_CACHE_MB</code></li>
      <li>Conferir <code>curl …/health</code> (espelhos + cache)</li>
    </ul>
    <p class="desc" style="font-size:0.85rem; margin-top:0.75rem;"><strong>Desktop / LAN:</strong> Windows <code>packaging/steward-kit-windows/Start-StewardKit.ps1</code> ou Linux <code>packaging/steward-kit-linux/start-steward-kit.sh</code> — relay em <code>http://127.0.0.1:8787</code>.</p>`,
  4: (d) => `
    <div class="form-group">
      <label for="sw-signaling">WSS signaling</label>
      <input type="text" id="sw-signaling" class="form-control" value="${escapeHtml(d.signalingUrl || "")}" placeholder="wss://signal.coletivo.org" />
    </div>
    <p class="meta" style="font-size:0.8rem;">TURN (usuário/senha): configure em <a href="#/settings/network">Preferências de rede</a> após o wizard.</p>
    <div class="form-group">
      <label for="sw-relay-http">URL HTTP relay</label>
      <input type="text" id="sw-relay-http" class="form-control" value="${escapeHtml(d.relayHttpUrl || "")}" placeholder="https://signal.coletivo.org" />
    </div>
    <p class="meta" style="font-size:0.8rem;">Na VPS, use a <strong>mesma origem HTTPS</strong> do signaling (Caddy encaminha <code>/health</code> e <code>/vox/*</code>). Local: <code>http://127.0.0.1:8787</code>.</p>
    <button type="button" id="sw-verify-relay" class="btn btn-outline btn-sm">Verificar Relay HTTP</button>
    <span id="sw-verify-result" class="meta" style="margin-left:0.5rem;"></span>`,
  5: (d, mirrorLast) => `
    <p class="desc">Salve as URLs acima em <a href="#/settings/network">Preferências de rede</a>. Depois, teste o espelho no relay e compartilhe <code>#/c/&lt;slug&gt;</code>.</p>
    <button type="button" id="sw-test-mirror" class="btn btn-outline btn-sm">Testar espelho agora</button>
    <span id="sw-mirror-result" class="meta" style="margin-left:0.5rem;"></span>
    ${mirrorLast && !mirrorLast.ok ? `<p class="meta" id="sw-mirror-last-code">Último código: <code>${escapeHtml(mirrorLast.code || "—")}</code></p>` : ""}
    <div class="form-group" style="margin-top:0.75rem;">
      <label for="sw-share-link">Link para compartilhar</label>
      <input type="text" id="sw-share-link" class="form-control" value="${escapeHtml(d.shareLink || "")}" placeholder="#/c/minha-comunidade" />
    </div>`,
};

/**
 * Assistente steward em 5 passos (V-P01).
 * @param {HTMLElement} main Contêiner da tela.
 * @param {object} [options={}] Opções do assistente.
 * @param {object} [options.draft={}] Rascunho do formulário.
 * @param {number} [options.step=1] Passo atual (1–5).
 * @param {object|null} [options.mirrorLast=null] Último teste de espelho.
 * @returns {void}
 */
export function renderStewardWizard(main, { draft = {}, step = 1, mirrorLast = null } = {}) {
  const s = Math.min(5, Math.max(1, Number(step) || 1));
  const d = draft || {};
  const stepRenderer = STEWARD_STEP_RENDERERS[s] || STEWARD_STEP_RENDERERS[1];
  const stepHtml = stepRenderer(d, mirrorLast);

  main.innerHTML = `
    <a class="back-link" href="#/settings/network">← Voltar às preferências de rede</a>
    <div class="card">
      <h2>Assistente steward</h2>
      <p class="desc">Voluntário da <strong>comunidade</strong> — não o mantenedor do código. Passo ${s} de 5.</p>
      <form id="form-steward-wizard">
        ${stepHtml}
        <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
          ${s > 1 ? `<button type="button" id="sw-prev" class="btn btn-outline">← Anterior</button>` : ""}
          ${s < 5 ? `<button type="submit" class="btn btn-primary">Próximo →</button>` : `<button type="submit" class="btn btn-primary">Concluir</button>`}
        </div>
      </form>
    </div>`;
}
