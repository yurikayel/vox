/**
 * Tela da pauta de governança (Stitch tela 8). Saiu de `render/community.js` para a página da comunidade e a
 * da pauta não dividirem o mesmo arquivo de mais de mil linhas.
 */
import * as gov from "../governance.js";
import { renderUnifiedDiffHtml } from "./diff-html.js";
import { formatCountdown } from "./vote.js";
import { renderProposalStatusBadge } from "./community.js";
import {
  escapeHtml,
  resolvePostAuthorLabels,
  formatTimeAgo,
  renderAvatarHtml,
  renderMarkdownLight,
  renderAgoraBreadcrumbHtml,
} from "./util.js";

function renderProposalArticle(proposal, labels, timeLabel, state, diffHtml) {
  const author = proposal.author || proposal.owner || "";
  const countdown = state === "open" ? formatCountdown(proposal.closesAt) : "";
  return `
    <article class="agora-stele agora-proposal-head">
      <div class="agora-deliberation-meta">
        ${renderProposalStatusBadge(state)}
        <span class="agora-pill">Pauta de governança</span>
        ${countdown ? `<span class="agora-countdown">${escapeHtml(countdown)}</span>` : ""}
      </div>
      <h1 class="agora-proposal-title">${escapeHtml(proposal.title)}</h1>
      <div class="agora-proposal-author">
        <span class="agora-label">Proponente</span>
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
      </div>
      <div class="post-text agora-proposal-body">${renderMarkdownLight(proposal.body)}</div>
      ${diffHtml}
      <div class="proposal-bridge-bar">
        <span class="meta">📣 Ecoar no QG:</span>
        <button type="button" id="btn-proposal-copy-discord" class="btn btn-sm btn-outline">📋 Copiar resumo (Discord / Slack)</button>
        <button type="button" id="btn-proposal-webhook-echo" class="btn btn-sm btn-outline">🔔 Disparar Webhook</button>
      </div>
    </article>`;
}

/**
 * Tela da pauta (`#/c/:id/proposal/:id`, Stitch tela 8): trilha, estela da proposta e, em telas largas,
 * coluna com a apuração e a cédula; abaixo, a lista pública de votos.
 * @param {HTMLElement} main Contêiner da rota.
 * @param {object} proposal Pauta `governance-proposal` (título, corpo, autor, `closesAt`, `diffText`).
 * @param {object} tally Resultado de `governance.computeTally` (contagens, estado, votos detalhados).
 * @param {{userVote?: object, isEligible?: boolean, isMember?: boolean, userAddress?: string, community?: {id: string, title: string}}} [opts]
 * @returns {void}
 */
export function renderProposalDetail(main, proposal, tally, opts = {}) {
  const commId = proposal.communityId;
  const commTitle = opts.community?.title || commId;
  const author = proposal.author || proposal.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: proposal.authorDisplay,
    isOwnLocalPost: proposal.isOwnLocalPost,
  });
  const timeLabel = formatTimeAgo(proposal.createdAt || proposal.ts);
  const state = tally.state || proposal.state || "open";
  const diffHtml = proposal.diffText ? renderProposalDiff(proposal.diffText) : "";

  const crumbs = renderAgoraBreadcrumbHtml([
    { label: "Comunidades", href: "#/communities" },
    { label: commTitle, href: `#/c/${encodeURIComponent(commId)}` },
    { label: "Governança", href: `#/c/${encodeURIComponent(commId)}?tab=governance` },
    { label: "Pauta" },
  ]);

  main.innerHTML = `
    <div class="proposal-detail agora-wide agora-proposal">
      ${crumbs}
      <div class="agora-proposal-grid">
        <div class="agora-proposal-main">${renderProposalArticle(proposal, labels, timeLabel, state, diffHtml)}</div>
        <aside class="agora-proposal-aside" aria-label="Apuração e voto">
          ${renderProposalTally(tally, proposal)}
          ${renderProposalVotingBox(proposal, tally, opts)}
        </aside>
      </div>
      ${renderProposalVotesList(tally)}
    </div>`;
}

/**
 * Bloco do patch proposto (diff unificado colorido), quando a pauta traz `diffText`.
 * @param {string} diffText Diff unificado em texto.
 * @returns {string} HTML do bloco, ou vazio.
 */
export function renderProposalDiff(diffText) {
  if (!diffText) return "";
  return `
    <div style="margin-top: 1.5rem;">
      <h4 style="margin: 0 0 0.5rem; display:flex; align-items:center; gap:6px;">
        <span>📝</span> Patch proposto (Diff unificado)
      </h4>
      ${renderUnifiedDiffHtml(diffText)}
    </div>`;
}

/**
 * Uma opção da apuração: rótulo, votos, porcentagem e barra própria (Stitch tela 8).
 * @param {"yes"|"no"|"abstain"} key Opção (vira a cor da barra).
 * @param {string} label Rótulo em português.
 * @param {number} count Votos computados na opção.
 * @param {number} share Porcentagem inteira sobre o total apurado.
 * @returns {string} HTML da linha.
 */
function renderProposalTallyRow(key, label, count, share) {
  return `<div class="agora-proposal-tally-row">
      <div class="agora-tally-row"><span><strong>${label}:</strong> ${count}</span><span class="agora-proposal-tally-pct">${share}%</span></div>
      <div class="agora-tally-bar" role="img" aria-label="${label}: ${share}%"><span class="${key}" style="width:${share}%"></span></div>
    </div>`;
}

/**
 * Apuração da pauta: uma linha por opção com votos, porcentagem sobre o total apurado e barra; no pé, o total
 * e os votos descartados pelo marco de corte. Só números que o aparelho tem.
 * @param {object} tally Resultado de `governance.computeTally`.
 * @param {object} [_proposal] Mantido pela assinatura pública; não é usado.
 * @returns {string} HTML da seção.
 */
export function renderProposalTally(tally, _proposal) {
  const total = tally.totalEligible || 0;
  const share = (n) => (total > 0 ? Math.round(((n || 0) / total) * 100) : 0);
  const rows = [["yes", "Sim", tally.yes], ["no", "Não", tally.no], ["abstain", "Abstenção", tally.abstain]]
    .map(([key, label, n]) => renderProposalTallyRow(key, label, n || 0, share(n)))
    .join("");
  const dropped = tally.ineligibleCount > 0 ? `<span>⚠️ <strong>Descartados pós-corte:</strong> ${tally.ineligibleCount}</span>` : "";
  return `
    <section class="tally-container agora-stele agora-proposal-tally" aria-labelledby="proposal-tally-title">
      <h3 id="proposal-tally-title" class="agora-proposal-side-title">Apuração de Votos (1 membro = 1 voto)</h3>
      <div class="agora-tally">${rows}</div>
      <div class="agora-tally-foot"><span>👥 <strong>Total apurado:</strong> ${total}</span>${dropped}</div>
    </section>`;
}

function renderProposalVoterWarning(isMember, isEligible) {
  if (!isMember) {
    return `<div class="banner-warning">⚠️ Você ainda não é membro desta comunidade. Membresia obtida após a abertura não confere voto nesta proposta (marco de corte anti-brigading).</div>`;
  }
  if (!isEligible) {
    return `<div class="banner-warning">⚠️ <strong>Atenção ao marco de corte:</strong> Você aderiu à comunidade após a abertura desta proposta. Seu voto será gravado e visível publicamente, mas <strong>não será computado</strong> no resultado oficial (regra canônica anti-brigading).</div>`;
  }
  return "";
}

/**
 * Cédula da pauta: aviso de elegibilidade, explicação do voto assinado e três botões com `aria-pressed`.
 * Pauta encerrada mostra só o estado; sem conta local, pede para conectar.
 * @param {object} proposal Pauta.
 * @param {object} tally Apuração (traz o estado atual).
 * @param {{userVote?: object, isEligible: boolean, isMember: boolean, userAddress?: string}} ctx Situação de quem vê.
 * @returns {string} HTML da cédula.
 */
export function renderProposalVotingBox(proposal, tally, { userVote, isEligible, isMember, userAddress }) {
  const state = tally.state || proposal.state || "open";
  if (state !== "open") {
    return `<div class="agora-stele agora-ballot"><p class="desc">🔒 Esta votação está encerrada (${renderProposalStatusBadge(state)}).</p></div>`;
  }
  if (!userAddress) {
    return `<div class="banner-info">ℹ️ Para votar nesta proposta, você precisa estar conectado à sua conta Vox local.</div>`;
  }
  const currentChoice = userVote ? gov.normalizeVoteChoice(userVote.choice) : "";
  const choiceHint = currentChoice ? `<br><strong>Seu voto atual:</strong> ${currentChoice.toUpperCase()} (você pode alterar até o encerramento).` : "";
  return `
    <div class="agora-stele agora-ballot">
      <h3 class="agora-proposal-side-title">Registrar seu voto</h3>
      ${renderProposalVoterWarning(isMember, isEligible)}
      <p class="desc">
        🛡️ Cada membro tem peso idêntico (1×). Seu voto será assinado localmente com sua chave ECDSA e propagado para os pares.
        ${choiceHint}
      </p>
      <div class="vote-action-buttons">
        <button class="vote-btn vote-btn-yes ${currentChoice === "yes" ? "selected" : ""}" data-choice="yes" aria-pressed="${currentChoice === "yes"}">✓ Sim (Aprovar)</button>
        <button class="vote-btn vote-btn-no ${currentChoice === "no" ? "selected" : ""}" data-choice="no" aria-pressed="${currentChoice === "no"}">✗ Não (Rejeitar)</button>
        <button class="vote-btn vote-btn-abstain ${currentChoice === "abstain" ? "selected" : ""}" data-choice="abstain" aria-pressed="${currentChoice === "abstain"}">○ Abstenção</button>
      </div>
    </div>`;
}

function renderVoteRow(v) {
  const labels = resolvePostAuthorLabels(v.author, {
    authorDisplay: v.authorDisplay,
    isOwnLocalPost: v.isOwnLocalPost,
  });
  const choiceLabels = { yes: "Sim", no: "Não", abstain: "Abstenção" };
  const choiceColors = { yes: "#10b981", no: "#ef4444", abstain: "#9ca3af" };
  const choiceText = choiceLabels[v.choice] || v.choice;
  const choiceColor = choiceColors[v.choice] || "var(--text)";
  const choiceBadge = `<span class="pill" style="color:${choiceColor}; border-color:${choiceColor};">${escapeHtml(choiceText)}</span>`;
  const statusCol = v.eligible
    ? `<span style="color:#10b981;">✓ Computado</span>`
    : `<span style="color:#f59e0b;" title="${escapeHtml(v.reason)}">⚠️ Não computado (${escapeHtml(v.reason)})</span>`;

  return `
    <tr>
      <td><a href="#/u/${encodeURIComponent(v.author)}">${escapeHtml(labels.authorDisplay)}</a></td>
      <td>${choiceBadge}</td>
      <td>${statusCol}</td>
      <td style="color:var(--muted);">${escapeHtml(formatTimeAgo(v.ts))}</td>
    </tr>`;
}

/**
 * Tabela pública de votos (transparência): eleitor, escolha, se conta no resultado e quando.
 * @param {object} tally Apuração com `votesDetail`.
 * @returns {string} HTML da tabela, ou vazio sem votos.
 */
export function renderProposalVotesList(tally) {
  const votes = tally.votesDetail || [];
  if (!votes.length) return "";
  const rows = votes.map(renderVoteRow).join("");
  return `
    <div class="card" style="padding: 1.25rem;">
      <h4 style="margin: 0 0 0.75rem;">📋 Transparência de Votos (${votes.length})</h4>
      <table class="votes-table">
        <thead><tr><th>Eleitor</th><th>Voto</th><th>Status</th><th>Quando</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

