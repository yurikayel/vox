/**
 * Voxels & Civic Achievements Profile View — Renderizador da aba de Passaporte Cívico.
 * ADR-013: Exibição transparente de esforço cívico, trilhas de colaboração e insígnias.
 */
import { escapeHtml } from "./util.js";
import { ACHIEVEMENT_CATALOG, computeVoxelBalance, evaluateAchievements } from "../voxels.js";

function renderVoxelBalanceHero(balance) {
  const total = balance?.total || 0;
  return `
    <div class="voxel-hero-card card" style="text-align:center; padding:1.25rem 1rem; margin-bottom:1rem; background:linear-gradient(135deg, rgba(43, 95, 184, 0.08), rgba(0, 0, 0, 0.02)); border:1px solid var(--border-subtle);">
      <div style="font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin-bottom:0.35rem;">
        Passaporte Cívico &bull; Energia Colaborativa
      </div>
      <div class="voxel-total-score" style="font-size:2.4rem; font-weight:800; line-height:1; color:var(--text); margin-bottom:0.4rem;">
        ${total} <span style="font-size:1.1rem; font-weight:600; color:var(--muted);">Voxels</span>
      </div>
      <div class="voxel-disclaimer-pill" style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.75rem; color:var(--muted); background:var(--surface-soft); padding:0.25rem 0.65rem; border-radius:999px; border:1px solid var(--border);">
        <span>🛡️</span>
        <span>Soulbound &bull; Sem alcance comprado &bull; 0 peso em votos cívicos</span>
      </div>
    </div>`;
}

function renderTrackCard(title, icon, amount, description, colorVar) {
  return `
    <div class="card voxel-track-card" style="flex:1; min-width:180px; padding:0.9rem; border-top:3px solid ${colorVar}; background:var(--surface-soft);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem;">
        <span style="font-weight:700; font-size:0.92rem;">${icon} ${escapeHtml(title)}</span>
        <span style="font-weight:800; font-size:1.15rem; color:var(--text);">${amount}</span>
      </div>
      <p style="margin:0; font-size:0.8rem; color:var(--muted); line-height:1.35;">${escapeHtml(description)}</p>
    </div>`;
}

function renderVoxelTracksGrid(byCategory) {
  const c = byCategory || { forja: 0, agora: 0, cuidado: 0 };
  const forjaCard = renderTrackCard("Forja", "🔨", c.forja, "Nós Vox Populi, relays e cache público (com decaimento)", "var(--accent, #2b5fb8)");
  const agoraCard = renderTrackCard("Ágora", "📜", c.agora, "Sínteses deliberativas e mediação de consenso", "#1fa855");
  const cuidadoCard = renderTrackCard("Cuidado", "🤝", c.cuidado, "Acolhimento de novos membros e acessibilidade viva", "#f5c400");

  return `
    <div class="voxel-tracks-container" style="display:flex; flex-wrap:wrap; gap:0.75rem; margin-bottom:1.5rem;">
      ${forjaCard}
      ${agoraCard}
      ${cuidadoCard}
    </div>`;
}

function renderAchievementBadgeItem(achievement, isUnlocked) {
  const icon = achievement.icon || "🏅";
  const opacity = isUnlocked ? "1" : "0.55";
  const border = isUnlocked ? "1px solid var(--border)" : "1px dashed var(--border-subtle)";
  const statusBadge = isUnlocked
    ? `<span class="badge-pill" style="font-size:0.7rem; background:rgba(31,168,85,0.15); color:#1fa855; font-weight:700;">Conquistado</span>`
    : `<span class="badge-pill" style="font-size:0.7rem; background:var(--surface-soft); color:var(--muted);">Critério Pendente</span>`;

  return `
    <div class="card achievement-badge-item" style="padding:0.75rem 0.85rem; border:${border}; opacity:${opacity}; display:flex; gap:0.75rem; align-items:flex-start;">
      <div style="font-size:1.6rem; line-height:1; flex-shrink:0;">${icon}</div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-bottom:0.25rem;">
          <strong style="font-size:0.88rem; color:var(--text);">${escapeHtml(achievement.title)}</strong>
          ${statusBadge}
        </div>
        <p style="margin:0; font-size:0.78rem; color:var(--muted); line-height:1.3;">${escapeHtml(achievement.description)}</p>
      </div>
    </div>`;
}

function renderAchievementsSection(unlockedList = []) {
  const unlockedMap = new Set(unlockedList.map((a) => a.id));
  const cardsHtml = ACHIEVEMENT_CATALOG.map((item) => renderAchievementBadgeItem(item, unlockedMap.has(item.id))).join("");

  return `
    <div class="voxel-achievements-section" style="margin-bottom:1.5rem;">
      <h3 class="profile-grid-about-heading" style="margin:0 0 0.65rem; font-size:0.95rem; font-weight:700;">
        Conquistas Cívicas (${unlockedList.length}/${ACHIEVEMENT_CATALOG.length})
      </h3>
      <div class="voxel-achievements-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:0.65rem;">
        ${cardsHtml}
      </div>
    </div>`;
}

function renderVoxelPassportExport(address, isCurrentWallet) {
  if (!isCurrentWallet) return "";
  return `
    <div class="card voxel-export-box" style="padding:0.9rem 1rem; background:var(--surface-soft); display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
      <div>
        <strong style="font-size:0.88rem; display:block;">Passaporte Cívico Soberano</strong>
        <span style="font-size:0.78rem; color:var(--muted);">Exportar recibos e insígnias assinados em JSON para arquivo pessoal</span>
      </div>
      <button class="profile-grid-btn profile-grid-btn-primary" id="btn-export-voxel-passport" type="button" style="font-size:0.8rem; padding:0.4rem 0.85rem;">
        📥 Baixar Passaporte
      </button>
    </div>`;
}

export function renderProfileVoxelsTab(params = {}) {
  const receipts = params.receipts || [];
  const balance = computeVoxelBalance(receipts, params.options || {});
  const { unlocked } = evaluateAchievements(receipts, params.unlockedAchievements || []);

  const heroHtml = renderVoxelBalanceHero(balance);
  const tracksHtml = renderVoxelTracksGrid(balance.byCategory);
  const achievementsHtml = renderAchievementsSection(unlocked);
  const exportHtml = renderVoxelPassportExport(params.address, params.isCurrentWallet);

  return `
    <div class="profile-grid-about profile-grid-voxels" style="padding:0.5rem 0;">
      ${heroHtml}
      ${tracksHtml}
      ${achievementsHtml}
      ${exportHtml}
    </div>`;
}
