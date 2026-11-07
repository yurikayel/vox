/**
 * @fileoverview Vote — Democracia Direta (layout Stitch, ADR-016).
 *
 * Mostra as pautas reais de governança (`governance-proposal`) das comunidades conhecidas por este
 * aparelho, com a apuração de `governance.computeTally` (1 membro = 1 voto, último voto vale,
 * corte anti-brigading). Nenhum número é inventado: sem pautas, a tela mostra um estado vazio.
 */
import { escapeHtml, shortId, formatTimeAgo } from "./util.js";
import { renderPageHead } from "./shell.js";

export const VOTE_FILTERS = Object.freeze([
  { key: "all", label: "Todas" },
  { key: "open", label: "Em votação" },
  { key: "merged", label: "Aprovadas" },
  { key: "closed", label: "Encerradas" },
]);

const STATE_LABELS = {
  open: "Em votação",
  merged: "Aprovada",
  rejected: "Rejeitada",
  expired: "Expirada sem quórum",
};

/** @param {{ state?: string }} item @param {string} filter */
export function matchesVoteFilter(item, filter) {
  const state = item?.state || "open";
  if (filter === "open") return state === "open";
  if (filter === "merged") return state === "merged";
  if (filter === "closed") return state === "rejected" || state === "expired";
  return true;
}

/**
 * Agrega indicadores reais para o cabeçalho.
 * @param {Array<{ state?: string, tally?: { totalEligible?: number }, communityId?: string }>} items
 */
export function computeVoteStats(items = []) {
  const open = items.filter((i) => (i.state || "open") === "open").length;
  const merged = items.filter((i) => i.state === "merged").length;
  const votes = items.reduce((sum, i) => sum + (Number(i.tally?.totalEligible) || 0), 0);
  const communities = new Set(items.map((i) => i.communityId).filter(Boolean)).size;
  return { open, merged, votes, communities, total: items.length };
}

/** @param {number} closesAt @param {number} now */
export function formatCountdown(closesAt, now = Date.now()) {
  const ms = Number(closesAt) - now;
  if (!closesAt || Number.isNaN(ms)) return "";
  if (ms <= 0) return "Encerrada";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `Encerra em ${Math.floor(h / 24)} dias`;
  if (h >= 1) return `Encerra em ${h}h ${m}m`;
  return `Encerra em ${Math.max(1, m)} min`;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function renderStat(label, value, hint, tone = "") {
  const toneCls = tone ? ` agora-stat-value--${tone}` : "";
  return `
    <div class="agora-stat">
      <span class="agora-stat-label">${escapeHtml(label)}</span>
      <span class="agora-stat-value${toneCls}">${escapeHtml(String(value))}</span>
      <span class="agora-stat-hint">${escapeHtml(hint)}</span>
    </div>`;
}

function renderFilterBar(items, activeFilter) {
  const buttons = VOTE_FILTERS.map((f) => {
    const count = items.filter((i) => matchesVoteFilter(i, f.key)).length;
    const pressed = f.key === activeFilter;
    return `<button type="button" class="agora-filter-btn" data-vote-filter="${f.key}" aria-pressed="${pressed}">${escapeHtml(f.label)} (${count})</button>`;
  }).join("");
  return `<div class="agora-filter-bar" role="group" aria-label="Filtrar pautas">${buttons}</div>`;
}

function renderHero(items, activeFilter) {
  const stats = computeVoteStats(items);
  const head = renderPageHead({
    kicker: "Câmara deliberativa · 1 membro = 1 voto",
    title: "Democracia Direta",
    subtitle:
      "Pautas abertas nas comunidades que este aparelho conhece. Cada voto é assinado com a chave do seu aparelho e contado como 1 membro = 1 voto; quem entrou depois da pauta não altera o resultado.",
    actionsHtml: `<a class="agora-btn agora-btn--primary" href="#/compose/proposal?c=vox">+ Propor votação</a>`,
  });
  return `
    <section class="agora-vote-hero" aria-label="Resumo da governança">
      ${head}
      <div class="agora-stat-row">
        ${renderStat("Pautas em votação", stats.open, stats.open === 1 ? "1 aberta agora" : `${stats.open} abertas agora`, "emerald")}
        ${renderStat("Votos válidos", stats.votes.toLocaleString("pt-BR"), "Somando todas as pautas")}
        ${renderStat("Aprovadas", stats.merged, `De ${stats.total} pautas registradas`)}
        ${renderStat("Comunidades", stats.communities, "Com pautas neste aparelho")}
      </div>
      ${renderFilterBar(items, activeFilter)}
    </section>`;
}

function renderTally(item) {
  const t = item.tally || {};
  const yes = Number(t.yes) || 0;
  const no = Number(t.no) || 0;
  const abstain = Number(t.abstain) || 0;
  const total = yes + no + abstain;
  const minQuorum = Number(item.minQuorum) || 1;
  const quorumLabel = total >= minQuorum ? `Quórum atingido (${total}/${minQuorum})` : `Quórum: ${total}/${minQuorum} votos`;
  const ineligible = Number(t.ineligibleCount) || 0;
  return `
    <div class="agora-tally" aria-label="Apuração">
      <div class="agora-tally-row">
        <span class="agora-tally-yes">${pct(yes, total)}% a favor (${yes})</span>
        <span class="agora-tally-no">${pct(no, total)}% contra (${no})</span>
      </div>
      <div class="agora-tally-bar" role="img" aria-label="${yes} a favor, ${no} contra, ${abstain} abstenções">
        <span class="yes" style="width:${pct(yes, total)}%"></span>
        <span class="no" style="width:${pct(no, total)}%"></span>
        <span class="abstain" style="width:${pct(abstain, total)}%"></span>
      </div>
      <div class="agora-tally-foot">
        <span>${escapeHtml(quorumLabel)} · ${abstain} ${abstain === 1 ? "abstenção" : "abstenções"}</span>
        <span>${ineligible ? `${ineligible} voto${ineligible === 1 ? "" : "s"} fora do corte` : "Apuração local verificável"}</span>
      </div>
    </div>`;
}

function renderVoteActions(item) {
  const href = `#/c/${encodeURIComponent(item.communityId)}/proposal/${encodeURIComponent(item.id)}`;
  const detailBtn = `<a class="agora-btn agora-btn--secondary" href="${href}">Ver pauta e debate</a>`;
  if ((item.state || "open") !== "open") {
    return `<div class="agora-vote-actions">${detailBtn}</div>`;
  }
  if (!item.isMember) {
    return `
      <div class="agora-vote-actions">
        <a class="agora-btn agora-btn--ghost" href="#/c/${encodeURIComponent(item.communityId)}">Entrar na comunidade para votar</a>
        ${detailBtn}
      </div>`;
  }
  if (!item.isEligible) {
    return `
      <div class="agora-vote-actions">
        ${detailBtn}
        <p class="agora-vote-note">Você entrou na comunidade depois da abertura desta pauta, então seu voto não entra na contagem (regra anti-brigading).</p>
      </div>`;
  }
  return renderBallot(item, detailBtn);
}

function renderBallot(item, detailBtn) {
  const current = item.userVote?.choice || "";
  const btn = (choice, label, cls) =>
    `<button type="button" class="agora-btn agora-btn--secondary ${cls} agora-vote-btn" data-vote-choice="${choice}" data-proposal-id="${escapeHtml(item.id)}" aria-pressed="${current === choice}">${label}</button>`;
  const note = current ? `<p class="agora-vote-note">Seu voto atual: <strong>${escapeHtml(STATE_CHOICE_LABEL[current] || current)}</strong>. Você pode mudar até o encerramento — vale o mais recente.</p>` : "";
  return `
    <div class="agora-vote-actions">
      ${btn("yes", "✓ Votar sim", "agora-btn--yes")}
      ${btn("no", "✕ Votar não", "agora-btn--no")}
      ${btn("abstain", "Abster", "")}
      ${detailBtn}
      ${note}
    </div>`;
}

const STATE_CHOICE_LABEL = { yes: "Sim", no: "Não", abstain: "Abstenção" };

/**
 * @param {object} item pauta normalizada (ver showVote em screens-community.js)
 */
export function renderDeliberation(item) {
  const state = item.state || "open";
  const href = `#/c/${encodeURIComponent(item.communityId)}/proposal/${encodeURIComponent(item.id)}`;
  const statePill = state === "open"
    ? `<span class="agora-pill agora-pill--emerald">${STATE_LABELS.open}</span>`
    : `<span class="agora-pill${state === "merged" ? " agora-pill--cobalt" : ""}">${escapeHtml(STATE_LABELS[state] || state)}</span>`;
  const countdown = state === "open" ? formatCountdown(item.closesAt) : "";
  const author = item.authorLabel || (item.author ? shortId(item.author) : "");
  const when = item.createdAt ? formatTimeAgo(item.createdAt) : "";
  return `
    <article class="agora-deliberation" data-state="${escapeHtml(state)}" data-proposal-id="${escapeHtml(item.id)}">
      <div class="agora-deliberation-meta">
        ${statePill}
        <a class="agora-pill" href="#/c/${encodeURIComponent(item.communityId)}">${escapeHtml(item.communityTitle || item.communityId)}</a>
        ${author ? `<span>por ${escapeHtml(author)}</span>` : ""}
        ${when ? `<span>· ${escapeHtml(when)}</span>` : ""}
        ${countdown ? `<span class="agora-countdown">${escapeHtml(countdown)}</span>` : ""}
      </div>
      <h2 class="agora-deliberation-title"><a href="${href}">${escapeHtml(item.title || "Pauta sem título")}</a></h2>
      ${item.body ? `<p class="agora-deliberation-body">${escapeHtml(item.body)}</p>` : ""}
      ${renderTally(item)}
      ${renderVoteActions(item)}
    </article>`;
}

function renderEmpty(activeFilter, hasAny) {
  if (hasAny) {
    return `<div class="agora-empty"><h2>Nada neste filtro</h2><p>Não há pautas com esse status agora.</p></div>`;
  }
  return `
    <div class="agora-empty">
      <h2>Nenhuma pauta por aqui ainda</h2>
      <p>Pautas são propostas que uma comunidade decide em votação. Abra a primeira no fórum Vox ou na comunidade do seu bairro.</p>
      <a class="agora-btn agora-btn--primary" href="#/compose/proposal?c=vox">+ Abrir uma pauta</a>
    </div>`;
}

/**
 * @param {Array<object>} items pautas normalizadas
 * @param {{ filter?: string }} [opts]
 */
export function renderVoteDashboard(items = [], { filter = "all" } = {}) {
  const visible = items.filter((i) => matchesVoteFilter(i, filter));
  const list = visible.length ? visible.map(renderDeliberation).join("") : renderEmpty(filter, items.length > 0);
  return `
    <div class="agora-vote">
      ${renderHero(items, filter)}
      <div class="agora-deliberation-list">${list}</div>
    </div>`;
}
