/**
 * @file Tela 1 do AI Social Dungeon: Acampamento dos Guardiões (#/dungeon).
 */
import { escapeHtml } from "../shared/html.js";
import { dungeonIcon, renderCampfireSceneSvg } from "./rpg-illustrations.js";

const ROLE_LABELS_PTBR = {
  STAGE1_JUDGE_RULES: { title: "Juiz de Regras", duty: "Valida acertos e danos", icon: "shield" },
  STAGE1_LORE_RAG: { title: "Guardião das Crônicas", duty: "Lembra fatos e boatos", icon: "scroll" },
  STAGE1_NPC_ACTOR: { title: "Voz dos Personagens", duty: "Interpreta reações e diálogos", icon: "beer" },
  STAGE1_ACT_DIRECTOR: { title: "Diretor de Cena", duty: "Mantém o ritmo da aventura", icon: "bolt" },
  STAGE2_LEAD_NARRATOR: { title: "Narrador da Mesa", duty: "Tece a prosa em português", icon: "flame" },
};

function renderGuardianCard(lease, peerAliases) {
  const meta = ROLE_LABELS_PTBR[lease.role] || { title: lease.role, duty: "Apoio à mesa", icon: "cpu" };
  const alias = peerAliases?.[lease.peerId] || lease.peerId;
  return `
    <article class="dungeon-pillar-card">
      <div class="dungeon-pillar-top">
        <span class="dungeon-pillar-icon">${dungeonIcon(meta.icon, 18)}</span>
        <span class="dungeon-status-pill">Exemplo</span>
      </div>
      <h3>${escapeHtml(meta.title)}</h3>
      <p class="dungeon-pillar-duty">${escapeHtml(meta.duty)}</p>
      <p class="dungeon-pillar-node">${escapeHtml(alias)}</p>
    </article>`;
}

function renderFavoriteSliderSection(state) {
  const [first, second] = state.favorites;
  const firstMb = Math.round(state.allocations?.[0]?.allocatedDiskMb || 614);
  const secondMb = Math.round(state.allocations?.[1]?.allocatedDiskMb || 410);
  const nextName = state.drf?.nextCommunityId === second.id ? second.name : first.name;
  return `
    <section class="dungeon-panel dungeon-solidarity">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Solidariedade Automática</span>
          <h2>Apoiar Comunidades Enquanto Descansa</h2>
        </div>
        <span class="dungeon-chip">Próximo turno: ${escapeHtml(nextName)}</span>
      </div>
      <p class="dungeon-muted">Simule como dividiria energia ociosa e cache entre suas <strong>2 comunidades favoritas</strong>. Nesta demonstração nada é dividido de verdade.</p>
      <div class="dungeon-slider-card">
        <div class="dungeon-slider-labels">
          <span><strong>${escapeHtml(first.name)}</strong> · ${first.sliderWeight}% (${firstMb} MB)</span>
          <span><strong>${escapeHtml(second.name)}</strong> · ${second.sliderWeight}% (${secondMb} MB)</span>
        </div>
        <label class="sr-only" for="dungeon-fav-slider">Divisão de energia entre 2 comunidades favoritas</label>
        <input id="dungeon-fav-slider" class="dungeon-range" type="range" min="0" max="100" step="5" value="${first.sliderWeight}" data-dungeon="slider-fav" />
        <div class="dungeon-slider-scale"><span>100% ${escapeHtml(second.name)}</span><span>50% / 50%</span><span>100% ${escapeHtml(first.name)}</span></div>
      </div>
    </section>`;
}

function renderTablesSection(state) {
  const safeTable = encodeURIComponent(state.tableId || "vila-nova");
  const sheetHref = `#/dungeon/ficha/${encodeURIComponent(state.sheet.char_id)}`;
  return `
    <section class="dungeon-panel">
      <div class="dungeon-section-head"><div><span class="dungeon-eyebrow">Mesas de Exemplo</span><h2>Escolha sua Aventura</h2></div></div>
      <div class="dungeon-tables-grid">
        <article class="dungeon-table-card is-featured">
          <div class="dungeon-table-meta"><span class="dungeon-badge-ok">Exemplo</span><span class="dungeon-code-tag">Vila Teste</span></div>
          <h3>${escapeHtml(state.tableName)}</h3>
          <p class="dungeon-muted">Investigação e cripta inundada, narrada por roteiro fixo. Sua ficha não sai do seu aparelho.</p>
          <div class="dungeon-card-actions">
            <a class="dungeon-btn dungeon-btn-primary" href="#/dungeon/mesa/${safeTable}">Entrar na Mesa →</a>
            <a class="dungeon-btn dungeon-btn-ghost" href="${sheetHref}">Abrir Grimório</a>
          </div>
        </article>
        <article class="dungeon-table-card">
          <div class="dungeon-table-meta"><span class="dungeon-badge-warn">Recrutando</span><span class="dungeon-code-tag">Bela Vista</span></div>
          <h3>Assembleia na Floresta de Vidro</h3>
          <p class="dungeon-muted">Crônica diplomática e exploração de ruínas antigas entre vizinhos.</p>
          <div class="dungeon-card-actions"><a class="dungeon-btn dungeon-btn-secondary" href="#/dungeon/mesa/floresta-de-vidro">Observar Cena</a></div>
        </article>
      </div>
    </section>`;
}

function renderCampHero(state) {
  return `
    <section class="dungeon-hero-camp">
      <div class="dungeon-hero-art">${renderCampfireSceneSvg()}</div>
      <div class="dungeon-hero-copy">
        <span class="dungeon-eyebrow">Santuário da Guilda (exemplo)</span>
        <h1>${escapeHtml(state.tableName)}</h1>
        <p class="dungeon-lead">5 guardiões virtuais dividem o trabalho do Mestre direto nos aparelhos da vizinhança — sem servidores centrais ou mensalidade.</p>
        <div class="dungeon-hero-actions">
          <a class="dungeon-btn dungeon-btn-primary" href="#/dungeon/mesa/${encodeURIComponent(state.tableId)}">${dungeonIcon("sword", 16)}<span>Entrar na Mesa →</span></a>
          <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="failover">${dungeonIcon("bolt", 16)}<span>Testar Queda de GPU (k-1)</span></button>
        </div>
        <p class="dungeon-inline-status" role="status">${escapeHtml(state.failoverNotice)}</p>
      </div>
    </section>`;
}

function renderGuardiansPanel(state) {
  const cardsHtml = state.leases.map((l) => renderGuardianCard(l, state.peerAliases)).join("");
  return `
    <section class="dungeon-panel">
      <div class="dungeon-section-head">
        <div><span class="dungeon-eyebrow">Como a mesa dividiria o trabalho</span><h2>Os 5 Postos da Fogueira (exemplo)</h2></div>
        <span class="dungeon-code-tag">${state.leases.length} / 5 postos ocupados</span>
      </div>
      <div class="dungeon-pillars-grid">${cardsHtml}</div>
      <div class="dungeon-receipt-banner">
        <span class="dungeon-receipt-icon">${dungeonIcon("receipt", 22)}</span>
        <div class="dungeon-receipt-copy">
          <strong>Recibo de exemplo · ${Number(state.receipt?.supportPoints || 30)} pontos de apoio</strong>
          <p>${escapeHtml(state.receipt?.summaryPtBr || "Você aqueceu a fogueira comunitária hoje.")}</p>
        </div>
      </div>
    </section>`;
}

/**
 * Renderiza a Tela 1 (Acampamento dos Guardiões) com fogueira SVG, pilares P2P e slider de comunidades.
 *
 * @param {object} state Estado atual da sessão AI Social Dungeon.
 * @returns {string} HTML interno para a moldura `.dungeon-sanctum`.
 */
export function renderCampScreen(state) {
  const utilPct = Math.round((state.stability?.utilization || 0.4) * 100);
  return `
    ${renderCampHero(state)}
    ${renderGuardiansPanel(state)}
    ${renderFavoriteSliderSection(state)}
    ${renderTablesSection(state)}
    <details class="dungeon-audit">
      <summary>Detalhes Técnicos (W-DRF, Quotas e Estabilidade MoA)</summary>
      <div class="dungeon-audit-body">
        <p><strong>Escalonamento W-DRF:</strong> Utilização da fila em <code>${utilPct}%</code> (estável = <code>${String(state.stability?.stable)}</code> · taxa segura max <code>${state.stability?.maxSafeLambda ?? 0.6}</code>).</p>
        <p><strong>Alocação Local:</strong> orçamento de exemplo de 1024 MB dividido entre as 2 comunidades escolhidas. Nesta demonstração nada é reservado nem emprestado de verdade.</p>
      </div>
    </details>`;
}
