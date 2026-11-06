/**
 * @fileoverview Sovereign Agora Luminescent Matrix — Vote & Direct Democracy View (Stitch).
 * Deliberação vicinal com quórum qualificado (mínimo 70%) e sufrágio assinado ed25519.
 */
import { escapeHtml } from "./util.js";

const DEFAULT_VOTE_STATS = {
  quorum: "82.4%",
  quorumMin: "70% min",
  treasury: "142.8k ZK-BRL",
  openCount: "06",
};

const DEMO_DELIBERATIONS = [
  {
    id: "DEL-882",
    title: "Instalação de Corredor Verde e Ciclovia Integrada na Rua Fradique Coutinho",
    description: "Reconfiguração do trecho arterial entre Rua dos Pinheiros e Cardeal Arcoverde. Eliminação de 42 vagas de estacionamento para implantação de biovaletas pluviais e via ciclável bidirecional com pavimento drenante.",
    tag: "Deliberação Vinculante",
    district: "Distrito Pinheiros / Vila Madalena",
    author: "@célula_são_simão",
    authorKey: "ed25519:3b19...74e",
    countdown: "Encerra em 13h 29m",
    approvalPct: 88.2,
    votesYes: 13071,
    votesNo: 1749,
    status: "active",
  },
  {
    id: "DEL-883",
    title: "Aporte Coletivo: Implementação de Captação e Purificação Solar de Água na Praça Benedito Calixto",
    description: "Plano de soberania hídrica barrial prevendo micro-estação autônoma de dessalinização e filtragem via osmose reversa energizada por matriz fotovoltaica comunitária. Relatório técnico auditado por nós descentralizados.",
    tag: "Alocação de Fundos",
    district: "Regional Oeste",
    author: "Coletivo Raízes Urbanas",
    authorKey: "ed25519:80c1...42a",
    countdown: "Encerra em 42h 15m",
    approvalPct: 94.5,
    votesYes: 84500,
    votesNo: 5500,
    status: "active",
  },
  {
    id: "DEL-884",
    title: "Alargamento e Drenagem Sustentável das Calçadas da Rua Simão Álvares",
    description: "Substituição do asfalto de calçada por blocos intertravados permeáveis e plantio de 32 mudas nativas da Mata Atlântica em cooperação com pequenos comerciantes locais.",
    tag: "Urbanismo Tático",
    district: "Subprefeitura de Pinheiros",
    author: "@mobilidade_ativa",
    authorKey: "ed25519:12a8...41f",
    countdown: "Encerra em 5 dias",
    approvalPct: 91.0,
    votesYes: 6240,
    votesNo: 618,
    status: "active",
  },
];

function renderVoteHeroHeader() {
  return `
    <header class="vote-banner">
      <div class="vote-banner-glow-1" aria-hidden="true"></div>
      <div class="vote-banner-glow-2" aria-hidden="true"></div>
      <div style="position:relative; z-index:2;">
        <span class="vote-tag-district">
          <span class="vote-tag-district-pulse"></span>
          Câmara Distrital Soberana &bull; ZK-SNARK Proved &bull; #SP-011 PINHEIROS
        </span>
        <h1 class="vote-header-title">Democracia Direta &amp; Deliberação Vicinal</h1>
        <p class="vote-header-desc">
          Pautas soberanas com poder executório local. O sufrágio é criptograficamente assinado pela sua chave ed25519 e verificado em tempo real via prova de conhecimento zero sem exposição identitária.
        </p>
        ${renderVoteQuickStats(DEFAULT_VOTE_STATS)}
      </div>
    </header>`;
}

function renderVoteQuickStats(stats) {
  return `
    <div class="vote-stats-grid">
      <div class="vote-stat-box">
        <span class="vote-stat-label">Quórum da Sessão</span>
        <div class="vote-stat-value text-emerald">${escapeHtml(stats.quorum)}</div>
        <span class="vote-stat-sub">Legítimo (${escapeHtml(stats.quorumMin)})</span>
      </div>
      <div class="vote-stat-box">
        <span class="vote-stat-label">Tesouro em Pauta</span>
        <div class="vote-stat-value">${escapeHtml(stats.treasury)}</div>
        <span class="vote-stat-sub">Contratos Descentralizados</span>
      </div>
      <div class="vote-stat-box">
        <span class="vote-stat-label">Pautas Abertas</span>
        <div class="vote-stat-value text-emerald">${escapeHtml(stats.openCount)}</div>
        <span class="vote-stat-sub">1 encerramento iminente</span>
      </div>
    </div>`;
}

function renderVoteFiltersBar() {
  return `
    <nav class="vote-filters-bar" aria-label="Filtros de Pautas">
      <button type="button" class="vote-filter-btn active" data-filter="all">Todas as Pautas (3)</button>
      <button type="button" class="vote-filter-btn" data-filter="urgent">Em Votação Urgente (1)</button>
      <button type="button" class="vote-filter-btn" data-filter="ready">Prontas para Execução (1)</button>
      <button type="button" class="vote-filter-btn" data-filter="consult">Consultas Consultivas (1)</button>
    </nav>`;
}

function renderDeliberationQuorum(p) {
  const yesPct = p.approvalPct;
  const noPct = (100 - yesPct).toFixed(1);
  return `
    <div class="quorum-progress-block">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
        <span style="font-weight:700; color:var(--emerald-bright);">Aprovação ${yesPct}%</span>
        <span style="color:var(--text-tertiary); font-size:0.75rem;">${p.votesYes.toLocaleString("pt-BR")} a favor &bull; ${p.votesNo.toLocaleString("pt-BR")} contra</span>
      </div>
      <div class="quorum-progress-bar">
        <div class="quorum-fill-yes" style="width: ${yesPct}%"></div>
        <div class="quorum-fill-no" style="width: ${noPct}%"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-tertiary);">
        <span>Quórum territorial validado via ZK</span>
        <span>${escapeHtml(p.countdown)}</span>
      </div>
    </div>`;
}

function renderDeliberationActions(p) {
  return `
    <div class="vote-actions-row">
      <button type="button" class="btn-vote-choice btn-vote-yes" data-id="${escapeHtml(p.id)}" data-choice="yes">
        <span>✓</span> Votar Sim
      </button>
      <button type="button" class="btn-vote-choice btn-vote-no" data-id="${escapeHtml(p.id)}" data-choice="no">
        <span>✕</span> Contestar
      </button>
      <a href="#/t/${encodeURIComponent(p.id)}" class="btn-vote-choice btn-vote-no" style="text-decoration:none;">
        <span>💬</span> Debate Público
      </a>
      <button type="button" class="btn-vote-choice btn-vote-endorse" data-id="${escapeHtml(p.id)}">
        <span>🔑</span> Endossar (ed25519)
      </button>
    </div>`;
}

function renderDeliberationCard(p) {
  return `
    <article class="vote-proposal-item" data-id="${escapeHtml(p.id)}">
      <div class="vote-proposal-bar" aria-hidden="true"></div>
      <div class="vote-proposal-top">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="vote-tag-district">${escapeHtml(p.tag)}</span>
          <span style="font-family:var(--font-telemetry); font-size:0.75rem; color:var(--cyan-bridge); font-weight:700;">#${escapeHtml(p.id)}</span>
          <span style="color:var(--text-tertiary); font-size:0.75rem;">&bull; ${escapeHtml(p.author)}</span>
        </div>
        <span style="font-size:0.75rem; color:var(--emerald-bright); font-family:var(--font-telemetry);">${escapeHtml(p.countdown)}</span>
      </div>
      <h2 class="vote-proposal-title">${escapeHtml(p.title)}</h2>
      <p class="vote-proposal-desc">${escapeHtml(p.description)}</p>
      ${renderDeliberationQuorum(p)}
      ${renderDeliberationActions(p)}
    </article>`;
}

export function renderVoteDashboard(deliberations = DEMO_DELIBERATIONS) {
  const cardsHtml = deliberations.map((d) => renderDeliberationCard(d)).join("");
  return `
    <div class="vote-container">
      ${renderVoteHeroHeader()}
      ${renderVoteFiltersBar()}
      <div class="vote-proposals-stream" style="display:flex; flex-direction:column; gap:1.25rem;">
        ${cardsHtml}
      </div>
    </div>`;
}
