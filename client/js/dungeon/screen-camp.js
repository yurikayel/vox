/**
 * @file Tela 1 do AI Social Dungeon: Acampamento dos Guardiões (#/dungeon).
 */
import { escapeHtml } from "../shared/html.js";
import { dungeonIcon, renderCampfireSceneSvg } from "./rpg-illustrations.js";
import { renderNotesPanel } from "./screen-notes.js";

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

function nextTurnName(state) {
  const [first, second] = state.favorites;
  return state.drf?.nextCommunityId === second.id ? second.name : first.name;
}

/**
 * Rótulos do slider de comunidades (nome, % e MB de cada uma). Usado no desenho da tela e, durante o arrasto,
 * para atualizar só esses rótulos sem trocar o `<input type="range">` que a pessoa está segurando.
 *
 * @param {object} state Estado da sessão (`favorites`, `allocations`).
 * @returns {string} HTML interno de `.dungeon-slider-labels`.
 */
export function renderFavoriteSliderLabels(state) {
  const [first, second] = state.favorites;
  // `??`, não `||`: com 0% a comunidade recebe 0 MB, e isso tem de aparecer como 0.
  const firstMb = Math.round(state.allocations?.[0]?.allocatedDiskMb ?? 614);
  const secondMb = Math.round(state.allocations?.[1]?.allocatedDiskMb ?? 410);
  return `
          <span><strong>${escapeHtml(first.name)}</strong> · ${first.sliderWeight}% (${firstMb} MB)</span>
          <span><strong>${escapeHtml(second.name)}</strong> · ${second.sliderWeight}% (${secondMb} MB)</span>`;
}

/**
 * Atualiza, no lugar, os rótulos do slider e o chip "Próximo turno" depois de um passo do arrasto.
 *
 * @param {ParentNode} root Contêiner da tela do acampamento.
 * @param {object} state Estado da sessão já atualizado por `updateFavoriteSlider`.
 * @returns {void}
 */
export function refreshFavoriteSlider(root, state) {
  const labels = root.querySelector(".dungeon-slider-labels");
  if (labels) labels.innerHTML = renderFavoriteSliderLabels(state);
  const chip = root.querySelector("[data-dungeon-next-turn]");
  if (chip) chip.textContent = `Próximo turno: ${nextTurnName(state)}`;
}

function renderFavoriteSliderSection(state) {
  const [first, second] = state.favorites;
  const nextName = nextTurnName(state);
  return `
    <section class="dungeon-panel dungeon-solidarity">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Solidariedade Automática</span>
          <h2>Apoiar Comunidades Enquanto Descansa</h2>
        </div>
        <span class="dungeon-chip" data-dungeon-next-turn>Próximo turno: ${escapeHtml(nextName)}</span>
      </div>
      <p class="dungeon-muted">Simule como dividiria energia ociosa e cache entre suas <strong>2 comunidades favoritas</strong>. Nesta demonstração nada é dividido de verdade.</p>
      <div class="dungeon-slider-card">
        <div class="dungeon-slider-labels">${renderFavoriteSliderLabels(state)}
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

function formatBytesMb(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024 * 1024) return `${Math.max(0, Math.round(num / 1024))} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function renderStorageMeter(usage) {
  if (!usage || !usage.isSupported) {
    return `<p class="dungeon-muted">Armazenamento local neste navegador (sem nuvem ilimitada): exporte backups <code>.voxrpg.zip</code> periodicamente.</p>`;
  }
  const pct = Math.max(0, Math.min(100, Number(usage.percentage) || 0));
  const durLabel = usage.persisted ? "proteção contra limpeza ativa" : "proteção solicitada ao criar a 1ª campanha";
  return `
    <div class="dungeon-slider-card" aria-label="Uso de disco local da Mesa">
      <div class="dungeon-hp-label">
        <span>Disco local neste aparelho (${durLabel})</span>
        <strong>${formatBytesMb(usage.usage)} / ${formatBytesMb(usage.quota)} (${pct}%)</strong>
      </div>
      <div class="dungeon-bar"><div class="dungeon-bar-fill" style="width:${pct}%"></div></div>
      <p class="dungeon-muted">Sem nuvem ilimitada: o teto real é a cota deste aparelho. Faça cópias <code>.voxrpg.zip</code> ou cifradas <code>.voxrpg.enc</code>.</p>
    </div>`;
}

function renderSavedCampaignCard(camp, activeId, pendingDeleteId) {
  const isActive = camp.id === activeId;
  const isConfirming = camp.id === pendingDeleteId;
  const badge = isActive
    ? `<span class="dungeon-badge-ok">Ativa neste aparelho</span>`
    : `<span class="dungeon-code-tag">Salva localmente</span>`;
  const deleteControl = isConfirming
    ? `<button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="confirm-delete-campaign" data-campaign-id="${escapeHtml(camp.id)}">Confirmar exclusão</button><button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="cancel-delete-campaign">Cancelar</button>`
    : `<button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="arm-delete-campaign" data-campaign-id="${escapeHtml(camp.id)}">Excluir</button>`;
  return `
    <article class="dungeon-table-card${isActive ? " is-featured" : ""}">
      <div class="dungeon-table-meta">${badge}<span class="dungeon-code-tag">${escapeHtml(camp.system || "d20-livre")}</span></div>
      <h3>${escapeHtml(camp.name)}</h3>
      <p class="dungeon-muted">${Number(camp.sheetCount) || 1} ficha(s) · ${Number(camp.chronicleCount) || 0} entrada(s) na crônica.</p>
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn ${isActive ? "dungeon-btn-secondary" : "dungeon-btn-primary"}" data-dungeon="open-campaign" data-campaign-id="${escapeHtml(camp.id)}">${isActive ? "Recarregar" : "Abrir Campanha"}</button>
        <a class="dungeon-btn dungeon-btn-ghost" href="#/dungeon/mesa/${encodeURIComponent(camp.id)}">Ir para a Mesa →</a>
        ${deleteControl}
      </div>
    </article>`;
}

function renderCalendarPanel(state) {
  const label = state.worldDateLabel || "Calendário disponível ao abrir uma campanha.";
  return `
    <div class="dungeon-action-form" aria-label="Calendário do mundo">
      <span class="dungeon-eyebrow">Tempo do Mundo</span>
      <p class="dungeon-inline-status" role="status">${escapeHtml(label)}</p>
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="calendar-round">+1 Rodada (6s)</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="calendar-10m">+10 min</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="calendar-short-rest">Descanso Curto</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="calendar-long-rest">Descanso Longo</button>
      </div>
    </div>`;
}

function renderBackupControls() {
  return `
    <div class="dungeon-action-form">
      <span class="dungeon-eyebrow">Backup Portátil &amp; Obsidian</span>
      <div class="dungeon-card-actions">
        <button type="button" class="dungeon-btn dungeon-btn-secondary" data-dungeon="export-voxrpg">Exportar .voxrpg.zip</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="export-chronicle-md">Exportar Crônica .md</button>
        <button type="button" class="dungeon-btn dungeon-btn-ghost" data-dungeon="export-voxrpg-enc">Exportar Cifrado (.voxrpg.enc)</button>
      </div>
      <div class="dungeon-input-row">
        <label class="sr-only" for="dungeon-backup-passphrase">Senha Soberana para backup cifrado</label>
        <input id="dungeon-backup-passphrase" class="dungeon-input" type="password" autocomplete="off" placeholder="Senha Soberana (mín. 12 caracteres) para cifrar/abrir .voxrpg.enc" />
      </div>
      <div class="dungeon-input-row">
        <label for="dungeon-import-file" class="dungeon-muted">Importar <code>.voxrpg.zip</code>, <code>.voxrpg.enc</code> ou ficha/nota <code>.md</code> (Obsidian):</label>
        <input id="dungeon-import-file" class="dungeon-input" type="file" accept=".zip,.enc,.md,.canvas,application/zip,application/json,text/markdown" data-dungeon="import-file" />
      </div>
    </div>`;
}

function renderSavedCampaignsGrid(state, list) {
  if (!list.length) {
    return `<p class="dungeon-muted">Nenhuma campanha salva ainda neste aparelho. Crie sua primeira campanha abaixo ou importe um pacote <code>.voxrpg.zip</code> / nota <code>.md</code> do Obsidian.</p>`;
  }
  return `<div class="dungeon-tables-grid">${list.map((c) => renderSavedCampaignCard(c, state.campaignId, state.pendingDeleteId)).join("")}</div>`;
}

function renderCampaignsSection(state) {
  const list = Array.isArray(state.campaigns) ? state.campaigns : [];
  const noticeHtml = state.campaignNotice ? `<p class="dungeon-inline-status" role="status">${escapeHtml(state.campaignNotice)}</p>` : "";
  return `
    <section class="dungeon-panel" aria-label="Campanhas salvas localmente">
      <div class="dungeon-section-head">
        <div>
          <span class="dungeon-eyebrow">Mesa Soberana · Persistência Local</span>
          <h2>Suas Campanhas neste Aparelho</h2>
        </div>
        <span class="dungeon-code-tag">${list.length} campanha(s) salva(s)</span>
      </div>
      ${renderStorageMeter(state.storageUsage)}
      ${state.campaignId ? renderCalendarPanel(state) : ""}
      <form class="dungeon-action-form" data-dungeon="create-campaign-form">
        <label class="sr-only" for="dungeon-campaign-name">Nome da nova campanha</label>
        <div class="dungeon-input-row">
          <input id="dungeon-campaign-name" class="dungeon-input" type="text" name="campaignName" maxlength="80" placeholder="Nome da campanha (ex.: Crônicas de Vila Nova)" autocomplete="off" />
          <button type="submit" class="dungeon-btn dungeon-btn-primary">Criar Campanha</button>
        </div>
      </form>
      ${noticeHtml}
      ${renderSavedCampaignsGrid(state, list)}
      ${renderBackupControls()}
    </section>`;
}

/**
 * Renderiza a Tela 1 (Acampamento dos Guardiões) com fogueira SVG, pilares P2P, slider de comunidades e campanhas locais.
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
    ${renderCampaignsSection(state)}
    ${state.campaignId ? renderNotesPanel(state) : ""}
    ${renderTablesSection(state)}
    <details class="dungeon-audit">
      <summary>Detalhes Técnicos (W-DRF, Quotas e Estabilidade MoA)</summary>
      <div class="dungeon-audit-body">
        <p><strong>Escalonamento W-DRF:</strong> Utilização da fila em <code>${utilPct}%</code> (estável = <code>${String(state.stability?.stable)}</code> · taxa segura max <code>${state.stability?.maxSafeLambda ?? 0.6}</code>).</p>
        <p><strong>Alocação Local:</strong> orçamento de exemplo de 1024 MB dividido entre as 2 comunidades escolhidas. Nesta demonstração nada é reservado nem emprestado de verdade.</p>
      </div>
    </details>`;
}
