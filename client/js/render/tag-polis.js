/** @file Hashtag feed and Pol.is-lite report HTML. */
import * as hashtags from "../hashtags.js";
import { escapeHtml } from "./util.js";
import { renderPostItem } from "./feed.js";

export function renderTagFeed(main, slug, posts = []) {
  if (!main) return;
  const cleanSlug = hashtags.slugifyTag(slug) || slug;
  const count = posts ? posts.length : 0;
  const countLabel = count === 1 ? "1 post no seu índice" : `${count} posts no seu índice`;

  const headerHtml = `
    <header class="page-header tag-feed-header">
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
        <a class="back-link" href="#/" style="margin-bottom:0;">← Início</a>
      </div>
      <h2 class="tag-title" style="margin:0.25rem 0 0.15rem; font-size:1.5rem; display:flex; align-items:center; gap:6px;">
        <span class="tag-hash" style="color:var(--accent);">#</span><span>${escapeHtml(cleanSlug)}</span>
      </h2>
      <div class="tag-meta" style="font-size:0.82rem; color:var(--muted); display:flex; gap:0.75rem; align-items:center;">
        <span>📦 ${escapeHtml(countLabel)}</span>
        <span>·</span>
        <span>Descoberta local gossip (Willow)</span>
      </div>
    </header>
  `;

  if (!posts || posts.length === 0) {
    main.innerHTML = `
      ${headerHtml}
      <div class="empty-state card" style="text-align:center; padding:2.5rem 1.5rem; margin-top:1rem;">
        <div style="font-size:2rem; margin-bottom:0.5rem;">🔍</div>
        <h3 style="margin:0 0 0.5rem; font-size:1.1rem;">Nenhum post com #${escapeHtml(cleanSlug)} no seu índice ainda</h3>
        <p style="color:var(--muted); font-size:0.88rem; max-width:400px; margin:0 auto 1.25rem;">
          No Vox, o índice vive no seu próprio dispositivo. Quando você ou alguém conectado na rede compartilhar posts com esta tag, eles aparecerão aqui.
        </p>
        <a class="btn btn-primary btn-sm" href="#/compose/topic">Criar post com #${escapeHtml(cleanSlug)}</a>
      </div>
    `;
    return;
  }

  const postsHtml = posts.map((p) => renderPostItem(p)).join("");
  main.innerHTML = `
    ${headerHtml}
    <div class="posts-list tag-posts-list" style="margin-top:1rem;">
      ${postsHtml}
    </div>
  `;
}

function renderPolisStatementItem(s) {
  const agreePct = Math.round(Number(s.agreePct) || 0);
  const disagreePct = Math.round(Number(s.disagreePct) || 0);
  const passPct = Math.round(Number(s.passPct) || 0);

  let badge = "";
  if (s.isBridge || s.evaluation?.isConsensusBridge) {
    badge = `<span class="badge-pill consensus-bridge" style="background:var(--success-soft, #e6f4ea); color:var(--success, #137333); font-size:0.75rem; font-weight:700;">★ Ponte de Consenso</span>`;
  } else if (s.isDivisive || s.evaluation?.isDivisive) {
    badge = `<span class="badge-pill divisive-point" style="background:var(--warning-soft, #fef7e0); color:var(--warning, #b06000); font-size:0.75rem; font-weight:700;">⚡ Ponto Divisivo</span>`;
  }

  return `
    <div class="polis-statement-card card" style="margin-bottom:0.75rem; padding:12px 14px;" data-statement-id="${escapeHtml(s.id)}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
        <p class="post-body" style="margin:0; font-weight:600;">${escapeHtml(s.text)}</p>
        ${badge}
      </div>
      <div class="polis-vote-bar" style="height:8px; display:flex; border-radius:4px; overflow:hidden; background:var(--surface-soft); margin:8px 0 4px;">
        <div style="width:${agreePct}%; background:var(--success, #137333);" title="Concordo: ${agreePct}%"></div>
        <div style="width:${passPct}%; background:var(--muted, #80868b);" title="Neutro: ${passPct}%"></div>
        <div style="width:${disagreePct}%; background:var(--danger, #c5221f);" title="Discordo: ${disagreePct}%"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted);">
        <span>👍 Concordo: ${agreePct}%</span>
        <span>⚪ Neutro: ${passPct}%</span>
        <span>👎 Discordo: ${disagreePct}%</span>
      </div>
    </div>`;
}

export function renderPolisReportHtml(report, _userVotes = {}) {
  if (!report || !Array.isArray(report.statements)) return "";
  const totalVoters = report.totalVoters || 0;
  const bridgesCount = (report.bridgeStatements || report.consensusBridges)?.length || 0;
  const divisiveCount = report.divisiveStatements?.length || 0;

  const header = `
    <div class="polis-report-header" style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span class="badge-pill p2p-pill">🗳️ Deliberação Pol.is-lite</span>
        <span class="meta">${totalVoters} participantes • ${report.totalStatements || report.statements.length} afirmações</span>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <span class="badge-pill" style="background:var(--success-soft, #e6f4ea); color:var(--success, #137333); font-weight:700;">★ ${bridgesCount} Pontes de Consenso</span>
        <span class="badge-pill" style="background:var(--warning-soft, #fef7e0); color:var(--warning, #b06000); font-weight:700;">⚡ ${divisiveCount} Pontos Divisivos</span>
      </div>
    </div>`;

  const items = report.statements.map((s) => renderPolisStatementItem(s)).join("");
  return `<div class="polis-deliberation-wrap">${header}${items}</div>`;
}

