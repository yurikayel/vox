/** @file Vitrine de comunidades, avatar, caixa Orkut e faixa de pessoas.
 * @module render/community-home
 */
import * as mock from "../mock.js";
import * as profileDirectory from "../profile-directory.js";
import { sanitizeMediaUrl } from "../shared/html.js";
import { renderCommunityCatchupBanner } from "../community-unread.js";
import { renderPageHead } from "./shell.js";
import {
  escapeHtml,
  shortId,
  getCommunityColor,
  renderAvatarHtml,
} from "./util.js";
import {
  resolveCommunityMemberCount,
  renderCommunityMetric,
} from "./community-shared.js";

/**
 * Avatar da comunidade com fallback de inicial colorida.
 * @param {object} [meta={}] Metadados (`image`, `title`, etc.).
 * @param {string} [communityId=""] Slug para cor de acento.
 * @param {string} [sizeClass="community-avatar-lg"] Classe de tamanho CSS.
 * @returns {string} HTML do bloco de avatar.
 */
export function renderCommunityAvatarHtml(meta = {}, communityId = "", sizeClass = "community-avatar-lg") {
  const image = sanitizeMediaUrl(meta.image || meta.avatar || meta.photo || "");
  const title = meta.title || communityId || "Comunidade";
  const initial = (title || "C").slice(0, 1).toUpperCase();
  const accent = getCommunityColor(communityId);
  if (image) {
    return `<div class="community-avatar-box ${sizeClass}" style="--comm-avatar-accent:${accent};">
      <img class="community-avatar-img" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" data-fallback-next="1" />
      <div class="community-avatar-fallback" style="display:none; background:${accent};">${escapeHtml(initial)}</div>
    </div>`;
  }
  return `<div class="community-avatar-box ${sizeClass}" style="--comm-avatar-accent:${accent};">
    <div class="community-avatar-fallback" style="background:${accent};">${escapeHtml(initial)}</div>
  </div>`;
}

/**
 * Caixa estilo Orkut com membros recentes e link «ver todos».
 * @param {object} meta Metadados da comunidade.
 * @param {string} communityId Slug da rota.
 * @param {object[]} [recentPeople=[]] Pessoas recentes com `routeId`.
 * @param {number|null} [memberCount=null] Total conhecido para o título.
 * @returns {string} HTML da seção ou `""` sem pessoas.
 */
export function renderCommunityOrkutMembersBox(meta, communityId, recentPeople = [], memberCount = null) {
  if (!recentPeople || !recentPeople.length) return "";
  const displayList = recentPeople.slice(0, 8);
  const countLabel = memberCount != null ? ` (${memberCount.toLocaleString("pt-BR")})` : "";
  const items = displayList
    .map((p) => {
      const name = profileDirectory.getAuthorDisplaySync(p.routeId) || p.name || p.routeId.slice(0, 8);
      const firstName = name.split(/\s+/)[0] || name;
      return `
        <a class="community-orkut-member-item" href="#/u/${encodeURIComponent(p.routeId)}" title="${escapeHtml(name)}">
          ${renderAvatarHtml(p.routeId, name, "avatar-md")}
          <span class="community-orkut-member-name">${escapeHtml(firstName)}</span>
        </a>`;
    })
    .join("");

  return `
    <section class="community-orkut-members-box card" aria-label="Membros da comunidade">
      <header class="community-orkut-members-head">
        <h3 class="community-orkut-members-title">Membros da comunidade${escapeHtml(countLabel)}</h3>
        <a class="community-orkut-members-more" href="#/c/${encodeURIComponent(communityId)}?tab=members">Ver todos →</a>
      </header>
      <div class="community-orkut-members-grid">${items}</div>
    </section>`;
}

/**
 * Selos do cartão da comunidade (fechada, derivação etc.).
 *
 * @param {object} c
 * @returns {string}
 */
function renderHomeCommunityPills(c) {
  const isClosed = c.visibility === "closed" || c.type === "closed";
  const isFork = Boolean(c.communityForkOf || c.forkOf);
  const isDemo = c.id === mock.MOCK_DEMO_COMMUNITY.id || c.demo;
  return [
    c.isOfficial || c.id === "vox" ? `<span class="agora-pill agora-pill--emerald">Oficial</span>` : "",
    `<span class="agora-pill">${isClosed ? "Fechada" : "Aberta"}</span>`,
    c.category ? `<span class="agora-pill">${escapeHtml(c.category)}</span>` : "",
    isFork ? `<span class="agora-pill agora-pill--cobalt">Espelho</span>` : "",
    isDemo ? `<span class="agora-pill agora-pill--amber">Demo</span>` : "",
  ].join("");
}

/**
 * Métricas do cartão da comunidade (membros e não lidas).
 *
 * @param {object} c
 * @returns {string}
 */
function renderHomeCommunityMetrics(c) {
  const members = resolveCommunityMemberCount(c, c.id);
  const unread = Number(c.unreadCount) || 0;
  return [
    renderCommunityMetric("Membros", members != null ? members.toLocaleString("pt-BR") : "—"),
    renderCommunityMetric("Novidades", unread > 0 ? `${unread} novos` : "Em dia", unread > 0 ? "emerald" : ""),
    renderCommunityMetric("Origem", c.isLocalP2p === false ? "Via gateway" : "Na malha", "cobalt"),
  ].join("");
}

/**
 * Cartão de uma comunidade na Ágora.
 *
 * @param {object} c
 * @returns {string}
 */
function renderHomeCommunityCard(c) {
  const href = `#/c/${encodeURIComponent(c.id)}`;
  const avatarHtml = renderCommunityAvatarHtml(c, c.id, "community-avatar-md agora-community-avatar");
  const pills = renderHomeCommunityPills(c);
  const metrics = renderHomeCommunityMetrics(c);
  const owner = c.owner || c.author || "";
  const ownerLabel = owner ? `Fundada por ${escapeHtml(profileDirectory.getAuthorDisplaySync(owner) || shortId(owner))}` : `#${escapeHtml(c.id)}`;
  return `
    <article class="agora-community community-vox-card community-vox-card-list" style="--community-accent:${getCommunityColor(c.id)};">
      <a class="community-vox-card-avatar-wrap" href="${href}" aria-label="${escapeHtml(c.title)}">${avatarHtml}</a>
      <div class="agora-community-main">
        <h2 class="agora-community-title"><a href="${href}">${escapeHtml(c.title)}</a>${pills}</h2>
        <p class="agora-community-desc">${escapeHtml(c.description || "Sem descrição.")}</p>
      </div>
      <div class="agora-metrics" aria-label="Indicadores da comunidade">${metrics}</div>
      <div class="agora-community-foot">
        <span class="agora-mono">${ownerLabel}</span>
        <a class="agora-btn agora-btn--primary community-vox-enter-btn" href="${href}">Entrar na comunidade</a>
      </div>
    </article>`;
}

/**
 * Lista de comunidades (vitrine territorial) com banner de catch-up.
 * @param {HTMLElement} main Container `#/communities`.
 * @param {object[]} communities Cards com `id`, título e métricas locais.
 * @param {object} [options={}]
 * @param {number} [options.totalUnread=0] Total de novidades para o banner.
 * @returns {void}
 */
export function renderHome(main, communities, { totalUnread = 0 } = {}) {
  const catchupBanner = renderCommunityCatchupBanner({ totalUnread });
  const head = renderPageHead({
    title: "Comunidades",
    subtitle: "Fóruns e círculos territoriais da sua rede. Cada comunidade decide suas pautas, regras e moderação.",
    actionsHtml: `<a class="agora-btn agora-btn--primary" href="#/compose/community">+ Fundar comunidade</a>`,
    wide: true,
  });
  if (!communities.length) {
    main.innerHTML += `${head}<div class="agora-empty"><h2>Nenhuma comunidade ainda</h2><p>Crie a primeira comunidade da sua rede — um bairro, um coletivo, um grupo de estudo.</p><a class="agora-btn agora-btn--primary" href="#/compose/community">+ Criar comunidade</a></div>`;
    return;
  }
  const items = communities.map(renderHomeCommunityCard).join("");
  main.innerHTML += `${head}<div class="agora-community-list">${catchupBanner}${items}</div>`;
}

/**
 * Faixa de chips «pessoas nesta comunidade» com atalho de adicionar contato.
 * @param {object[]} [people=[]] Participantes com `routeId` e nome.
 * @returns {string} HTML do cartão ou `""` se vazio.
 */
export function renderCommunityPeopleStrip(people = []) {
  if (!people.length) return "";
  const chips = people
    .map((p) => {
      const label = profileDirectory.getAuthorDisplaySync(p.routeId) || p.name || p.routeId.slice(0, 10);
      const av = renderAvatarHtml(p.routeId, label, "avatar-sm");
      return `
        <span class="people-chip-wrap" style="display:inline-flex; align-items:center; gap:4px; padding:4px 6px 4px 8px; border:1px solid var(--border); border-radius:999px; font-size:0.82rem;">
          <a class="people-chip" href="#/u/${encodeURIComponent(p.routeId)}" style="display:inline-flex; align-items:center; gap:4px; text-decoration:none;">${av}<span>${escapeHtml(label)}</span></a>
          <button type="button" class="btn btn-sm btn-outline btn-community-add-contact" data-route="${escapeHtml(p.routeId)}" data-label="${escapeHtml(label)}" style="padding:2px 6px; font-size:0.72rem;">+ Contato</button>
        </span>`;
    })
    .join("");
  return `
    <div class="card" style="margin-top:0.5rem; padding:0.65rem 0.85rem;">
      <span class="section-title" style="font-size:0.85rem;">Pessoas nesta comunidade</span>
      <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.45rem;">${chips}</div>
    </div>`;
}
