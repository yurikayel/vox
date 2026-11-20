/** @file Helpers compartilhados: contagens, online, excertos e chips de meta da comunidade.
 * @module render/community-shared
 */
import * as mock from "../mock.js";
import * as profileDirectory from "../profile-directory.js";
import { escapeHtml, renderAvatarHtml } from "./util.js";

/**
 * Contagem de membros conhecida neste aparelho (sem inflar com dados centrais).
 * @param {object} meta Metadados da comunidade.
 * @param {string} communityId Slug.
 * @returns {number|null} Total ou `null` se desconhecido.
 */
export function resolveCommunityMemberCount(meta, communityId) {
  if (meta && meta.memberCount != null && !Number.isNaN(Number(meta.memberCount))) {
    return Number(meta.memberCount);
  }
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id && mock.isDemoMode()) return mock.MOCK_DEMO_UF_COUNT;
  if (communityId === "vox" || meta?.isOfficial) return 1;
  return null;
}

/**
 * Rótulo legível de quantidade de membros.
 * @param {number|null} n Contagem.
 * @returns {string} Texto ou `""` se ausente.
 */
export function formatCommunityMembers(n) {
  if (n == null) return "";
  return `${n.toLocaleString("pt-BR")} membros`;
}

/**
 * Banner quando a comunidade espelha outra (`community-fork`).
 * @param {object} meta Metadados com `forkOf` / `communityForkOf`.
 * @returns {string} HTML do aviso ou `""`.
 */
export function renderCommunityForkBanner(meta) {
  const forkOf = meta.communityForkOf || meta.forkOf;
  if (!forkOf) return "";
  const upstreamId = typeof forkOf === "string" ? forkOf : forkOf.communityId || forkOf.id || "";
  if (!upstreamId) return "";
  const label = forkOf.title || upstreamId;
  return `
    <div class="community-vox-fork-banner card" role="note">
      <strong>Espelho comunitário</strong> — esta comunidade espelha
      <a href="#/c/${encodeURIComponent(upstreamId)}">${escapeHtml(label)}</a>.
      <span class="meta">Tag: <code>Type: community-fork</code></span>
    </div>`;
}

/**
 * Recado de boas-vindas opcional no topo da aba Posts.
 * @param {string} text Corpo do recado.
 * @returns {string} HTML do bloco ou `""`.
 */
export function renderCommunityWelcomeRecado(text) {
  if (!text) return "";
  return `
    <article class="community-vox-recado" aria-label="Recado da comunidade">
      <header class="community-vox-recado-head">
        <span class="community-vox-recado-icon" aria-hidden="true">✉</span>
        <span class="section-title">Recado da comunidade</span>
      </header>
      <p class="community-vox-recado-body">${escapeHtml(text)}</p>
    </article>`;
}

/**
 * Lista de pessoas “online” com preenchimento demo quando aplicável.
 * @param {object[]} recentPeople Atividade recente na malha.
 * @param {string} communityId Slug medido.
 * @param {number} [limit=9] Teto de avatares.
 * @returns {object[]} Pessoas para grade online.
 */
export function resolveCommunityOnlinePeople(recentPeople, communityId, limit = 9) {
  const people = recentPeople.slice(0, limit);
  if (people.length >= limit) return people;
  if (communityId !== mock.MOCK_DEMO_COMMUNITY.id || !mock.isDemoMode()) return people;
  const seen = new Set(people.map((p) => p.routeId));
  for (const routeId of mock.UF_ROUTE_IDS) {
    if (people.length >= limit) break;
    if (seen.has(routeId)) continue;
    people.push({
      routeId,
      name: mock.getAuthorDisplay(routeId) || routeId.slice(0, 10),
    });
    seen.add(routeId);
  }
  return people;
}

/**
 * Extrai um parágrafo curto do corpo/título do tópico (sem hashtags).
 * @param {object} topic Tópico com `body` ou `title`.
 * @returns {string} Trecho para listagem.
 */
export function topicExcerptOneParagraph(topic) {
  const raw = (topic.body || topic.title || "").replace(/\s+/g, " ").trim();
  const noTags = raw.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const text = noTags || raw;
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}…`;
}

/**
 * Normaliza contagem de respostas do tópico.
 * @param {object} topic Tópico com `repliesCount` ou `replyCount`.
 * @returns {number} Quantidade finita ou zero.
 */
export function topicReplyCount(topic) {
  const n = topic.repliesCount ?? topic.replyCount ?? 0;
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

/**
 * Resume membros, online e papel do visitante para abas e painéis.
 * @param {object} meta Metadados da comunidade.
 * @param {string} communityId Slug.
 * @param {object[]} [recentPeople=[]] Pessoas recentes.
 * @param {boolean} [isMember=false] Filiação do visitante.
 * @param {number} [onlineLimit=24] Limite da grade online.
 * @returns {object} Campos para HTML de membros.
 */
export function buildCommunityMembersSummary(meta, communityId, recentPeople = [], isMember = false, onlineLimit = 24) {
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const online = resolveCommunityOnlinePeople(recentPeople, communityId, onlineLimit);
  const onlineExtra = Math.max(0, (memberCount || online.length) - online.length);
  const modCount = Array.isArray(meta.moderators) ? meta.moderators.length : 0;
  const isDemo = communityId.startsWith("demo-");
  const onlineHint = isDemo
    ? (online.length ? `${online.length}${onlineExtra ? `+${onlineExtra}` : ""} agora (demo)` : "Demo offline")
    : (online.length ? `${online.length} pessoas na malha recente` : "Sem atividade recente");
  return { memberCount, online, onlineHint, modCount, isMember };
}

/**
 * Bloco de estatísticas da aba Membros.
 * @param {object} summary Saída de {@link buildCommunityMembersSummary}.
 * @returns {string} HTML da seção.
 */
export function renderCommunityMembersStatsBlock({ memberCount, modCount, isMember }) {
  return `
      <section class="community-vox-members-stats card" aria-labelledby="community-vox-members-stats-title">
        <h3 id="community-vox-members-stats-title" class="community-vox-sidebar-title">Estatísticas</h3>
        <dl class="community-vox-stat-dl community-vox-stat-dl--wide">
          ${memberCount != null ? `<div><dt>Membros</dt><dd>${escapeHtml(formatCommunityMembers(memberCount))}</dd></div>` : ""}
          <div><dt>Moderadores</dt><dd>${modCount ? modCount : "Dono + até 10"}</dd></div>
          <div><dt>Você</dt><dd>${isMember ? "Membro" : "Visitante"}</dd></div>
        </dl>
      </section>`;
}

/**
 * Grade de avatares «pessoas online».
 * @param {object[]} [people=[]] Participantes com `routeId`.
 * @param {object} [options={}]
 * @param {string} [options.layout="compact"] Layout `compact` ou `tab`.
 * @returns {string} HTML da grade ou mensagem vazia.
 */
export function renderCommunityOnlineGrid(people = [], { layout = "compact" } = {}) {
  if (!people.length) {
    return `<p class="community-vox-online-empty">Ninguém recente no feed — seja o primeiro!</p>`;
  }
  const gridClass =
    layout === "tab"
      ? "community-vox-online-grid community-vox-online-grid--tab"
      : "community-vox-online-grid";
  const cells = people
    .map((p) => {
      const label = profileDirectory.getAuthorDisplaySync(p.routeId) || p.name || p.routeId.slice(0, 10);
      const short = label.split(/\s+/)[0] || label;
      return `
        <a class="community-vox-online-face" href="#/u/${encodeURIComponent(p.routeId)}" title="${escapeHtml(label)}">
          ${renderAvatarHtml(p.routeId, label, "avatar-sm")}
          <span class="community-vox-online-name">${escapeHtml(short)}</span>
        </a>`;
    })
    .join("");
  return `<div class="${gridClass}" role="list">${cells}</div>`;
}

/**
 * Indica se o checklist pós-criação já foi cumprido.
 * @param {object} state Progresso salvo (`invitesSent`, `activeAck`, etc.).
 * @param {object} ctx Contagem de tópicos e flags de rede.
 * @returns {boolean} `true` quando todos os passos obrigatórios foram concluídos.
 */
export function isSeedCompleteForRender(state, ctx) {
  const activeOk = state.activeAck || ctx.peerEnabled !== false;
  return activeOk && state.invitesSent >= 2 && ctx.topicCount > 0;
}

/**
 * Chips de meta no cabeçalho da comunidade (membros, visibilidade, demo).
 * @param {object} meta Metadados.
 * @param {string} communityId Slug.
 * @param {number|null} memberCount Contagem conhecida.
 * @returns {string} HTML da lista de chips.
 */
export function renderCommunityMetaChips(meta, communityId, memberCount) {
  const chips = [];
  if (memberCount != null) {
    chips.push(`<li class="community-vox-chip community-vox-chip-accent">${escapeHtml(formatCommunityMembers(memberCount))}</li>`);
  }
  const vis = meta.visibility === "closed" ? "Fechada" : "Aberta";
  chips.push(`<li class="community-vox-chip">${escapeHtml(vis)}</li>`);
  if (meta.communityForkOf || meta.forkOf) chips.push(`<li class="community-vox-chip">Espelho</li>`);
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id || meta.demo) chips.push(`<li class="community-vox-chip">Demo</li>`);
  if (meta.category) chips.push(`<li class="community-vox-chip">${escapeHtml(meta.category)}</li>`);
  return `<ul class="community-vox-chip-list" aria-label="Informações da comunidade">${chips.join("")}</ul>`;
}

/**
 * Célula de métrica na vitrine de comunidades.
 * @param {string} label Rótulo curto.
 * @param {string} value Valor exibido.
 * @param {string} [tone=""] Sufixo tonal opcional (`emerald`, `cobalt`).
 * @returns {string} HTML de `.agora-metric`.
 */
export function renderCommunityMetric(label, value, tone = "") {
  const toneCls = tone ? ` agora-metric-value--${tone}` : "";
  return `<div class="agora-metric"><span class="agora-metric-label">${escapeHtml(label)}</span><span class="agora-metric-value${toneCls}">${escapeHtml(value)}</span></div>`;
}