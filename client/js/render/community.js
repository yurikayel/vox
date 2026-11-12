/** @file Home, communities, listings, governance proposals UI. */
import * as mock from "../mock.js";
import * as communityUpdates from "../community-updates.js";
import * as listing from "../listing.js";
import * as hashtags from "../hashtags.js";
import * as listingUi from "../listing-ui.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import * as profileDirectory from "../profile-directory.js";
import { renderCommunityCatchupBanner } from "../community-unread.js";
import { renderPageHead } from "./shell.js";
import { renderComposeSignaturePanel } from "./compose-chrome.js";
import { renderSteps, renderReviewList, renderFeiraDisabled } from "./compose-steps.js";
import { buildListingDmHref } from "../dm-messenger.js";
import { getReadOriginAggregate } from "../gateway-telemetry.js";
import {
  escapeHtml,
  shortId,
  resolvePostAuthorLabels,
  getCommunityColor,
  formatTimeAgo,
  formatAbsoluteDate,
  postTimeParts,
  renderAvatarHtml,
} from "./util.js";
import { renderStat, formatCountdown } from "./vote.js";
import { extractTopicCivicTag, resolveTopicBadgesHtml } from "./topic-badges.js";
import { renderCommunityHeaderToolbar } from "./community-toolbar.js";
import { renderChannelBarHtml, showsComposeButton } from "./channel-bar.js";
export { CIVIC_TAGS, extractTopicCivicTag } from "./topic-badges.js";

export function renderCommunityAvatarHtml(meta = {}, communityId = "", sizeClass = "community-avatar-lg") {
  const image = meta.image || meta.avatar || meta.photo || "";
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

function resolveCommunityMemberCount(meta, communityId) {
  if (meta && meta.memberCount != null && !Number.isNaN(Number(meta.memberCount))) {
    return Number(meta.memberCount);
  }
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id && mock.isDemoMode()) return mock.MOCK_DEMO_UF_COUNT;
  if (communityId === "vox" || meta?.isOfficial) return 1;
  return null;
}

function formatCommunityMembers(n) {
  if (n == null) return "";
  return `${n.toLocaleString("pt-BR")} membros`;
}

function renderCommunityForkBanner(meta) {
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

function renderCommunityWelcomeRecado(text) {
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

function resolveCommunityOnlinePeople(recentPeople, communityId, limit = 9) {
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

function topicExcerptOneParagraph(topic) {
  const raw = (topic.body || topic.title || "").replace(/\s+/g, " ").trim();
  const noTags = raw.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const text = noTags || raw;
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}…`;
}

function topicReplyCount(topic) {
  const n = topic.repliesCount ?? topic.replyCount ?? 0;
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

function renderTopicRowThumb(topic, topicHref) {
  if (!topic.image || gossipRetract.shouldHideGossipDeletedPost(topic)) return "";
  return `<a class="community-topic-row-thumb" href="${topicHref}" aria-hidden="true"><img src="${escapeHtml(topic.image)}" alt="" width="48" height="48" loading="lazy" /></a>`;
}

function resolveTopicAuthorMeta(topic) {
  const author = topic.author || topic.owner || "";
  const authorLabels = resolvePostAuthorLabels(author, {
    authorDisplay: topic.authorDisplay,
    isOwnLocalPost: topic.isOwnLocalPost,
  });
  const authorHandle = authorLabels.authorHandle || (author ? mock.getAuthorHandle(author) : "") || shortId(author);
  const authorDisplay = authorLabels.authorDisplay || authorHandle;
  const authorAvatar = renderAvatarHtml(author, authorDisplay, "avatar-xs");
  return { author, authorHandle, authorDisplay, authorAvatar };
}

export const TOPICS_PAGE_SIZE = 20;

/** LAN-14: aviso de posts recolhidos pela quarentena de chave nova, com "ver mesmo assim". */
export function renderNewKeyHeldNoticeHtml(count) {
  const n = Number(count) || 0;
  const what = n === 1 ? "1 post de chave nova está recolhido" : `${n} posts de chaves novas estão recolhidos`;
  return `<p class="feed-notice community-newkey-notice" role="status">${what} pela quarentena desta comunidade (anti-spam).
    <button type="button" class="btn btn-outline btn-sm btn-reveal-new-keys">Ver mesmo assim</button></p>`;
}

function resolveTopicBumpSpan(topic) {
  if (Number(topic.lastReplyTs) <= Number(topic.ts)) return "";
  const rel = formatTimeAgo(topic.lastReplyTs);
  const phrase = rel === "agora" ? "ativa agora" : `ativa há ${rel}`;
  return `<span class="community-topic-bump" title="Atividade recente no tópico"> · ${escapeHtml(phrase)}</span>`;
}

function resolveTopicCleanTitle(topic) {
  let title = topic.title || topicExcerptOneParagraph(topic) || "Sem título";
  const civicTag = extractTopicCivicTag(topic);
  if (civicTag && title.toLowerCase().startsWith(civicTag.toLowerCase())) {
    title = title.slice(civicTag.length).trim() || title;
  }
  return title;
}

function renderTopicRowMeta(topic) {
  const { author, authorHandle, authorAvatar } = resolveTopicAuthorMeta(topic);
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(topic.ts);
  const replies = topicReplyCount(topic);
  const replyLabel = replies === 1 ? "1 resposta" : `${replies} respostas`;
  const bumpSpan = resolveTopicBumpSpan(topic);
  return `
    <p class="community-topic-row-meta">
      <a class="community-topic-row-author" href="#/u/${encodeURIComponent(author)}">${authorAvatar}<span>@${escapeHtml(authorHandle)}</span></a>
      <span class="community-topic-row-dot" aria-hidden="true">·</span>
      <span>${escapeHtml(replyLabel)}</span>${bumpSpan}
      <span class="community-topic-row-dot" aria-hidden="true">·</span>
      <span class="community-topic-row-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
    </p>`;
}

export function renderCommunityTopicRow(topic, { communityId: _communityId = "", communityTitle: _communityTitle = "" } = {}) {
  const badgesHtml = resolveTopicBadgesHtml(topic);
  const title = resolveTopicCleanTitle(topic);
  const excerpt = topicExcerptOneParagraph(topic);
  const topicHref = `#/t/${encodeURIComponent(topic.id)}`;
  const thumb = renderTopicRowThumb(topic, topicHref);
  const metaHtml = renderTopicRowMeta(topic);

  return `
    <article class="community-topic-row${topic.isPinned ? " is-pinned" : ""}${topic.isLocked ? " is-locked" : ""}" data-id="${escapeHtml(topic.id)}">
      <div class="community-topic-row-body">
        <h3 class="community-topic-row-title"><a href="${topicHref}">${badgesHtml}${escapeHtml(title)}</a></h3>
        ${metaHtml}
        ${excerpt && excerpt !== title ? `<p class="community-topic-row-excerpt">${escapeHtml(excerpt)}</p>` : ""}
      </div>
      ${thumb}
    </article>`;
}

function buildCommunityMembersSummary(meta, communityId, recentPeople = [], isMember = false, onlineLimit = 24) {
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

function renderCommunityMembersStatsBlock({ memberCount, modCount, isMember }) {
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

export function renderCommunityMembersTab(meta, communityId, recentPeople = [], isMember = false) {
  const summary = buildCommunityMembersSummary(meta, communityId, recentPeople, isMember, 24);
  return `
    <div class="community-vox-panel community-vox-members-panel">
      <section class="community-vox-members-online card" aria-labelledby="community-vox-members-online-title">
        <header class="community-vox-members-head">
          <h2 id="community-vox-members-online-title" class="community-vox-members-title">Membros online</h2>
          <p class="community-vox-sidebar-hint">${escapeHtml(summary.onlineHint)}</p>
        </header>
        ${renderCommunityOnlineGrid(summary.online, { layout: "tab" })}
      </section>
      ${renderCommunityMembersStatsBlock(summary)}
    </div>`;
}

function renderCommunityOnlineGrid(people = [], { layout = "compact" } = {}) {
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

function resolveNeighborReadPct(communityId, isDemoComm, readOriginStats) {
  if (isDemoComm) return { localReadPct: 96, readOriginInsufficient: false };
  const agg = readOriginStats ?? getReadOriginAggregate(communityId);
  if (agg.sufficient && agg.localReadPct != null) {
    return { localReadPct: agg.localReadPct, readOriginInsufficient: false };
  }
  return { localReadPct: null, readOriginInsufficient: true };
}

/** Estatísticas honestas para painel «Sustentada por vizinhos» (sem ranking de nós). */
export function computeCommunityNeighborStats({
  recentPeople = [],
  communityId = "",
  memberCount = null,
  gatewayState = "all_ok",
  isDemo = false,
  readOriginStats = null,
} = {}) {
  const demoComm = isDemo || communityId === mock.MOCK_DEMO_COMMUNITY.id;
  const online = resolveCommunityOnlinePeople(recentPeople, communityId, 9);
  const onlineDevices = demoComm ? Math.max(online.length, 14) : online.length;
  const { localReadPct, readOriginInsufficient } = resolveNeighborReadPct(communityId, demoComm, readOriginStats);
  const fewSupporters = onlineDevices < 3 && !demoComm;
  const degraded = fewSupporters || gatewayState === "critical";

  return {
    onlineDevices,
    localReadPct,
    readOriginInsufficient,
    degraded,
    fewSupporters,
    isDemoEstimate: demoComm,
    memberCount,
  };
}

function formatMirrorTime(at) {
  if (!at) return "";
  try {
    return new Date(at).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function renderCommunityMirrorHint(mirrorStatus) {
  if (!mirrorStatus) return "";
  if (mirrorStatus.ok) {
    const timeLabel = formatMirrorTime(mirrorStatus.at);
    const label = timeLabel ? `atualizado ${timeLabel}` : "atualizado";
    return `<p class="community-vox-mirror-hint meta" role="status">Espelho relay ${escapeHtml(label)}.</p>`;
  }
  const code = mirrorStatus.code || "erro";
  return `<p class="community-vox-mirror-hint meta community-vox-mirror-hint--warn" role="status">Último espelho: falha (<code>${escapeHtml(code)}</code>).</p>`;
}

function formatNeighborReadLabel(stats) {
  if (stats.readOriginInsufficient || stats.localReadPct == null) {
    return "Ainda coletando estimativa local das leituras neste aparelho (precisamos de algumas leituras na rede)";
  }
  return `~${stats.localReadPct}% das leituras recentes via cache local, malha ou relay comunitário`;
}

function renderCommunityNeighborPanel(stats, { commOnly = false } = {}) {
  if (!stats) return "";
  const demoNote = stats.isDemoEstimate
    ? ' <span class="community-vox-neighbor-demo meta">(estimativa demo)</span>'
    : ' <span class="community-vox-neighbor-demo meta">(estimativa local)</span>';
  const onlineLabel = `~${stats.onlineDevices.toLocaleString("pt-BR")} aparelho${stats.onlineDevices === 1 ? "" : "s"} online agora`;
  const readLabel = formatNeighborReadLabel(stats);
  const alert = stats.degraded ? '<p class="community-vox-neighbor-alert" role="status">Velocidade reduzida: poucos apoiadores online nesta comunidade. <a href="#/settings/network#net-supporter">Seja um apoiador da rede</a></p>' : "";
  const commCta = commOnly
    ? '<span class="meta">Você já prioriza suas comunidades na malha.</span>'
    : '<button type="button" class="btn btn-sm btn-outline" id="btn-neighbor-comm-only">Priorizar esta comunidade na malha</button>';

  return `
    <section class="community-vox-neighbor card" aria-labelledby="community-vox-neighbor-title">
      <h2 id="community-vox-neighbor-title" class="community-vox-neighbor-title">Sustentada por vizinhos</h2>
      <p class="community-vox-neighbor-body">${escapeHtml(onlineLabel)}.${demoNote}<span class="community-vox-neighbor-read">${escapeHtml(readLabel)}.${demoNote}</span></p>
      ${alert}
      <div class="community-vox-neighbor-actions">
        <a class="btn btn-sm btn-outline" href="#/settings/network">Ajustar participação na rede</a>
        ${commCta}
      </div>
      <p class="community-vox-neighbor-foot meta">Sem ranking público de nós — só agregados desta comunidade.</p>
    </section>`;
}

function renderSeedStep(done, label, detail) {
  return `<li class="community-seed-step${done ? " is-done" : ""}">${done ? "✓" : "○"} ${label}${detail ? ` <span class="meta">${detail}</span>` : ""}</li>`;
}

function renderCommunitySeedStepList(communityId, state, ctx) {
  const activeDone = state.activeAck || ctx.peerEnabled !== false;
  const invitesDone = state.invitesSent >= 2;
  const topicDone = ctx.topicCount > 0;
  const composeHref = `#/compose/topic?c=${encodeURIComponent(communityId)}`;

  return `
    <ol class="community-seed-steps">
      ${renderSeedStep(activeDone, "Camada <strong>Ativa</strong> (Pacto Vox)", activeDone ? "" : '<a href="#/settings/network">Revisar rede</a>')}
      ${renderSeedStep(invitesDone, "2 convites", invitesDone ? `${state.invitesSent} enviados` : '<button type="button" class="btn-link community-seed-invite" id="btn-seed-invite">Contar compartilhamento</button>')}
      ${renderSeedStep(topicDone, "Primeiro tópico", topicDone ? "Publicado" : `<a href="${composeHref}">Criar post</a>`)}
      ${renderSeedStep(state.commOnlyNudgeSeen || ctx.commOnly, "Priorizar minhas comunidades (opcional)", ctx.commOnly ? "Ativo" : '<a href="#/settings/network#net-comm-only-wrap">Ver opção</a>')}
    </ol>`;
}

/** Checklist V-P05 (~3 min) — passos honestos pós-criação. */
export function renderCommunitySeedChecklist(communityId, state, ctx = {}) {
  const { topicCount = 0, peerEnabled = true, commOnly = false } = ctx;
  if (!communityId || !state || state.dismissed) return "";
  if (isSeedCompleteForRender(state, { topicCount, peerEnabled })) return "";

  return `
    <section class="community-vox-seed card" aria-labelledby="community-vox-seed-title" data-community-id="${escapeHtml(communityId)}">
      <header class="community-vox-seed-head">
        <h2 id="community-vox-seed-title" class="community-vox-seed-title">Primeiros passos (~3 min)</h2>
        <button type="button" class="btn btn-sm btn-ghost community-seed-dismiss" id="btn-seed-dismiss">Dispensar</button>
      </header>
      <p class="desc community-vox-seed-lead">Ritual rápido para visitantes lerem via vizinhos, não só gateway de reserva.</p>
      ${renderCommunitySeedStepList(communityId, state, { topicCount, peerEnabled, commOnly })}
      <p class="meta community-vox-seed-foot">Baseado em <code>docs/operations/steward-seed-15min.md</code> — caminho A (sem VPS).</p>
    </section>`;
}

function isSeedCompleteForRender(state, ctx) {
  const activeOk = state.activeAck || ctx.peerEnabled !== false;
  return activeOk && state.invitesSent >= 2 && ctx.topicCount > 0;
}

function renderCommunityMetaChips(meta, communityId, memberCount) {
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

function renderCommunityMetric(label, value, tone = "") {
  const toneCls = tone ? ` agora-metric-value--${tone}` : "";
  return `<div class="agora-metric"><span class="agora-metric-label">${escapeHtml(label)}</span><span class="agora-metric-value${toneCls}">${escapeHtml(value)}</span></div>`;
}

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

function renderHomeCommunityMetrics(c) {
  const members = resolveCommunityMemberCount(c, c.id);
  const unread = Number(c.unreadCount) || 0;
  return [
    renderCommunityMetric("Membros", members != null ? members.toLocaleString("pt-BR") : "—"),
    renderCommunityMetric("Novidades", unread > 0 ? `${unread} novos` : "Em dia", unread > 0 ? "emerald" : ""),
    renderCommunityMetric("Origem", c.isLocalP2p === false ? "Permaweb" : "Rede local", "cobalt"),
  ].join("");
}

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

function renderCommunityHeaderAvatar(meta, communityId, canChangePhoto) {
  const photoBtn = canChangePhoto ? `
    <label class="btn-change-comm-photo" title="Alterar foto da comunidade (estilo Orkut)">
      <input type="file" id="input-comm-photo-file" accept="image/*" style="display:none;" />
      <span class="btn-change-comm-photo-label">📷 Alterar foto</span>
    </label>` : "";
  return `<div class="community-vox-avatar-wrap">${renderCommunityAvatarHtml(meta, communityId, "community-avatar-lg")}${photoBtn}</div>`;
}

function renderCommunityFichaOrkut(meta, ownerLabels, memberCount) {
  const ownerItem = meta.owner && ownerLabels ? `
    <div class="community-orkut-detail-item">
      <span class="community-orkut-detail-label">Dono:</span>
      <span class="community-orkut-detail-val">
        <a class="community-orkut-owner-link" href="#/u/${encodeURIComponent(meta.owner)}">
          ${renderAvatarHtml(meta.owner, ownerLabels.authorDisplay, "avatar-xs")}
          <span class="community-orkut-owner-name">${escapeHtml(ownerLabels.authorDisplay)}</span>
          ${ownerLabels.authorHandle && ownerLabels.authorHandle !== ownerLabels.authorDisplay ? `<span class="meta community-orkut-owner-handle">@${escapeHtml(ownerLabels.authorHandle)}</span>` : ""}
        </a>
      </span>
    </div>` : "";

  return `
    <div class="community-vox-about community-orkut-ficha">
      ${meta.description ? `<p class="community-vox-desc">${escapeHtml(meta.description)}</p>` : ""}
      <div class="community-orkut-details-grid">
        ${ownerItem}
        ${meta.category ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Categoria:</span><span class="community-orkut-detail-val">${escapeHtml(meta.category)}</span></div>` : ""}
        <div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Tipo:</span><span class="community-orkut-detail-val">${meta.visibility === "closed" ? "Moderada (Fechada)" : "Pública (Aberta)"}</span></div>
        <div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Idioma:</span><span class="community-orkut-detail-val">${escapeHtml(meta.language || "Português")}</span></div>
        ${memberCount != null ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Membros:</span><span class="community-orkut-detail-val">${escapeHtml(formatCommunityMembers(memberCount))}</span></div>` : ""}
        ${meta.createdAt || meta.ts ? `<div class="community-orkut-detail-item"><span class="community-orkut-detail-label">Criada em:</span><span class="community-orkut-detail-val">${escapeHtml(formatAbsoluteDate(meta.createdAt || meta.ts))}</span></div>` : ""}
      </div>
      ${meta.owner ? `<p class="community-vox-owner meta" style="display:none;">Criada por <a href="#/u/${encodeURIComponent(meta.owner)}">${escapeHtml(shortId(meta.owner))}</a></p>` : ""}
    </div>`;
}

/** PM-09: mesma regra de quem aplica o update; a chave que assina é a da conta local (vx_…). */
function canChangeCommunityPhoto(meta, opts) {
  return communityUpdates.canUpdateCommunity(meta, opts.routeId || opts.walletAddress);
}

function renderCommunityHeader(meta, communityId, opts = {}) {
  const commTitle = meta.title || communityId;
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const metaChips = renderCommunityMetaChips(meta, communityId, memberCount);
  const canChangePhoto = canChangeCommunityPhoto(meta, opts);
  const tagline = meta.headerTagline || (communityId === mock.MOCK_DEMO_COMMUNITY.id ? mock.MOCK_DEMO_COMMUNITY.headerTagline : "");
  const kicker = tagline || (meta.category ? `Comunidade · ${meta.category}` : "Comunidade Vox");
  const ownerLabels = meta.owner ? resolvePostAuthorLabels(meta.owner) : null;

  return `
    <header class="community-vox-header card">
      <div class="community-vox-accent-rail" aria-hidden="true"></div>
      <div class="community-vox-header-grid">
        ${renderCommunityHeaderAvatar(meta, communityId, canChangePhoto)}
        <div class="community-vox-header-copy">
          <p class="community-vox-kicker">${escapeHtml(kicker)}</p>
          <h1 class="community-vox-name">${escapeHtml(commTitle)}</h1>
          ${metaChips}
          ${renderCommunityMirrorHint(opts.mirrorStatus)}
        </div>
        ${renderCommunityHeaderToolbar(communityId, commTitle, opts.isMember, showsComposeButton(meta, opts.isMod))}
      </div>
      ${renderCommunityFichaOrkut(meta, ownerLabels, memberCount)}
    </header>`;
}

function renderCommunityNavTabs(communityId, activeTab, proposalCount = 0) {
  const encId = encodeURIComponent(communityId);
  const isPosts = activeTab !== "listings" && activeTab !== "governance" && activeTab !== "members";
  const govLabel = proposalCount ? ` (${proposalCount})` : "";
  return `
    <nav class="community-vox-nav community-tabs segmented-tabs" aria-label="Seções da comunidade">
      <a class="tab-btn ${isPosts ? "active" : ""}" data-tab="posts" href="#/c/${encId}">Posts</a>
      <a class="tab-btn ${activeTab === "members" ? "active" : ""}" data-tab="members" href="#/c/${encId}?tab=members">Membros</a>
      <a class="tab-btn ${activeTab === "listings" ? "active" : ""}" data-tab="listings" href="#/c/${encId}?tab=listings">Classificados</a>
      <a class="tab-btn ${activeTab === "governance" ? "active" : ""}" data-tab="governance" href="#/c/${encId}?tab=governance">Governança${govLabel}</a>
    </nav>`;
}

/**
 * Monólitos da comunidade com o que o aparelho sabe de verdade (Stitch tela 7, sem tesouro nem ZK).
 * @param {number|null} memberCount Membros conhecidos (ou `null` quando ainda não há contagem).
 * @param {object[]} topics Tópicos carregados nesta tela.
 * @param {object[]} proposals Pautas da comunidade conhecidas pelo aparelho.
 * @returns {string} HTML da `.agora-stat-row`.
 */
function renderCommunityStatRowHtml(memberCount, topics, proposals) {
  const open = (proposals || []).filter((p) => (p.state || "open") === "open").length;
  const members = memberCount == null ? "—" : formatCommunityMembers(memberCount);
  return `<div class="agora-stat-row community-vox-stats">
      ${renderStat("Membros", members, "conhecidos neste aparelho")}
      ${renderStat("Tópicos", (topics || []).length, "carregados aqui")}
      ${renderStat("Pautas em votação", open, open ? "abertas agora" : "nenhuma aberta", open ? "emerald" : "")}
    </div>`;
}

/**
 * Pauta aberta em destaque no topo dos posts (a "assembleia aberta" do Stitch), com prazo real.
 * @param {string} communityId Id da comunidade.
 * @param {object[]} proposals Pautas conhecidas; usa a primeira em votação.
 * @returns {string} HTML do cartão `.agora-deliberation`, ou vazio se nenhuma pauta estiver aberta.
 */
function renderCommunityFeaturedProposalHtml(communityId, proposals) {
  const open = (proposals || []).find((p) => (p.state || "open") === "open");
  if (!open) return "";
  const href = `#/c/${encodeURIComponent(communityId)}/proposal/${encodeURIComponent(open.id)}`;
  const countdown = formatCountdown(open.closesAt);
  const body = String(open.body || "");
  return `<article class="agora-deliberation community-vox-featured" data-state="open">
      <div class="agora-deliberation-meta"><span class="agora-pill agora-pill--emerald">Pauta em votação</span>${countdown ? `<span class="agora-countdown">${escapeHtml(countdown)}</span>` : ""}</div>
      <h2 class="agora-deliberation-title"><a href="${href}">${escapeHtml(open.title || "Pauta sem título")}</a></h2>
      ${body ? `<p class="agora-deliberation-body">${escapeHtml(body.slice(0, 220))}${body.length > 220 ? "…" : ""}</p>` : ""}
      <div class="agora-vote-actions"><a class="agora-btn agora-btn--solid" href="${href}">Ver pauta e votar</a></div>
    </article>`;
}

/**
 * Monta a página em duas faixas: conteúdo (abas e posts) e lateral (vizinhos, primeiros passos).
 * No celular a lateral desce para depois do conteúdo; em telas largas fica ao lado (CSS).
 * @param {{communityId: string, accent: string, top: string, main: string, aside: string}} parts Pedaços já renderizados.
 * @returns {string} HTML da `.community-vox-page`.
 */
function renderCommunityPageHtml({ communityId, accent, top, main, aside }) {
  return `
    <div class="community-vox-page agora-wide" data-community-id="${escapeHtml(communityId)}" style="--community-accent:${accent};">
      ${top}
      <div class="community-vox-layout">
        <div class="community-vox-main">${main}</div>
        ${aside ? `<aside class="community-vox-aside" aria-label="Rede e primeiros passos">${aside}</aside>` : ""}
      </div>
    </div>`;
}

export function renderCommunity(main, communityId, topics, meta = {}, opts = {}) {
  const activeTab = opts.activeTab || "posts";
  const accent = getCommunityColor(communityId);
  const headerHtml = renderCommunityHeader(meta, communityId, opts);
  const neighborHtml = renderCommunityNeighborPanel(opts.neighborStats, opts);
  const seedHtml = opts.seedChecklist ? renderCommunitySeedChecklist(communityId, opts.seedChecklist.state, opts.seedChecklist.ctx) : "";
  const recadoHtml = activeTab === "posts" && meta.welcomeRecado ? renderCommunityWelcomeRecado(meta.welcomeRecado) : "";
  const navHtml = renderCommunityNavTabs(communityId, activeTab, opts.proposals?.length);
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const featuredHtml = activeTab === "posts" ? renderCommunityFeaturedProposalHtml(communityId, opts.proposals) : "";
  const slotHtml = renderCommunityTabContent(activeTab, {
    communityId,
    commTitle: meta.title || communityId,
    meta,
    topics,
    listings: opts.listings,
    proposals: opts.proposals,
    recentPeople: opts.recentPeople,
    isMember: opts.isMember, isMod: opts.isMod,
    memberCount,
  });

  main.innerHTML += renderCommunityPageHtml({
    communityId,
    accent,
    top: `${headerHtml}${renderCommunityStatRowHtml(memberCount, topics, opts.proposals)}`,
    main: `${renderChannelBarHtml(meta, { communityId, isMod: opts.isMod })}${renderCommunityForkBanner(meta)}${recadoHtml}${featuredHtml}${navHtml}
      <div class="community-tab-content-slot" id="community-tab-content">${slotHtml}</div>`,
    aside: `${neighborHtml}${seedHtml}`,
  });
}

const TAB_RENDERERS = {
  listings: (c) => renderCommunityListingsTab(c.communityId, c.commTitle, c.meta, c.listings),
  governance: (c) => renderCommunityGovernanceTab(c.communityId, c.commTitle, c.meta, c.proposals),
  members: (c) => renderCommunityMembersTab(c.meta, c.communityId, c.recentPeople, c.isMember),
};

export function renderCommunityTabContent(tab = "posts", ctx = {}) {
  const activeTab = tab || "posts";
  const renderer = TAB_RENDERERS[activeTab];
  if (renderer) return renderer(ctx);
  return `<div class="community-vox-posts-wrap">
    ${renderCommunityOrkutMembersBox(ctx.meta, ctx.communityId, ctx.recentPeople, ctx.memberCount)}
    ${renderCommunityPostsTab(ctx.communityId, ctx.commTitle, ctx.topics || [], { sortMode: ctx.sortMode || "active", canCompose: showsComposeButton(ctx.meta, ctx.isMod) })}
  </div>`;
}

function renderTopicPaginationButton(totalCount, visibleCount) {
  if (totalCount <= visibleCount) return "";
  const remaining = totalCount - visibleCount;
  return `
    <div class="community-topic-pagination" style="text-align:center; padding:12px 0 6px;">
      <button type="button" class="btn btn-outline btn-sm btn-load-more-topics" data-visible="${visibleCount}">
        Carregar tópicos anteriores (${remaining} ${remaining === 1 ? "restante" : "restantes"})
      </button>
    </div>`;
}

export function renderCommunityTopicFeedInner(topics, communityId, commTitle, composeHref, visibleCount = TOPICS_PAGE_SIZE) {
  if (!topics.length) {
    return `<div class="empty community-vox-empty"><p>Nenhum post nesta comunidade ainda.</p>${composeHref ? `<a class="btn btn-primary btn-sm" href="${composeHref}">Criar o primeiro post</a>` : ""}</div>`;
  }
  const paged = topics.slice(0, visibleCount);
  const items = paged
    .map((t) => renderCommunityTopicRow({ ...t, communityId, communityTitle: commTitle }))
    .join("");
  const paginationHtml = renderTopicPaginationButton(topics.length, visibleCount);
  return `<div class="community-vox-topic-list">${items}</div>${paginationHtml}`;
}

export function renderCommunityPostsTab(communityId, commTitle, topics, { sortMode = "active", visibleCount = TOPICS_PAGE_SIZE, canCompose = true } = {}) {
  const composeHref = canCompose ? `#/compose/topic?c=${encodeURIComponent(communityId)}` : "";
  const inner = renderCommunityTopicFeedInner(topics, communityId, commTitle, composeHref, visibleCount);
  return `
    <section class="community-vox-feed card" aria-labelledby="community-vox-feed-title">
      <header class="community-vox-feed-head">
        <div class="community-feed-header-main" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h2 id="community-vox-feed-title" class="community-vox-feed-title" style="margin:0;">Tópicos e posts</h2>
            <div class="community-sort-bar" style="margin-top:4px; display:inline-flex; gap:6px; font-size:0.8rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "active" ? "active" : ""}" data-sort="active" aria-pressed="${sortMode === "active"}">🔥 Atividade Recente</button>
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "newest" ? "active" : ""}" data-sort="newest" aria-pressed="${sortMode === "newest"}">✨ Mais Recentes</button>
              <button type="button" class="btn btn-sm btn-subtle btn-sort-topic ${sortMode === "pinned" ? "active" : ""}" data-sort="pinned" aria-pressed="${sortMode === "pinned"}">📌 Fixados / Governança</button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="search" id="input-comm-topic-search" class="input input-sm community-topic-search" placeholder="🔍 Filtrar tópicos..." style="max-width:180px; padding:4px 8px; font-size:0.82rem;" aria-label="Filtrar tópicos da comunidade" />
            ${composeHref ? `<a class="btn btn-sm btn-outline" href="${composeHref}">+ Post</a>` : ""}
          </div>
        </div>
      </header>
      ${inner}
    </section>`;
}

function renderCommercialDisabledView(communityId) {
  return `<div class="community-vox-panel">${renderFeiraDisabled(communityId)}</div>`;
}

function renderCommunityListingsTab(communityId, commTitle, meta, listings) {
  if (!listing.isCommercialEnabled(meta)) {
    return renderCommercialDisabledView(communityId);
  }
  const actions = `
    <div class="community-vox-panel">
    <div class="actions-bar feira-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Ofertas locais</span>
      <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Nova oferta</a>
    </div>`;

  if (!listings || !listings.length) {
    return `${actions}
      <div class="empty" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma oferta cadastrada nesta feira ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/listing?c=${encodeURIComponent(communityId)}">+ Criar primeira oferta</a>
      </div>
    </div>`;
  }

  const items = listings.map((l) => renderListingItem(l, { communityTitle: commTitle })).join("");
  return `${actions}
    <div class="feed-container community-vox-panel-feed">${items}</div>
    <p class="listing-footer-disclaimer">⚡ ${escapeHtml(listing.LISTING_DISCLAIMER)}</p>
    </div>`;
}

export function renderCommunityGovernanceTab(communityId, commTitle, meta, proposals = []) {
  const actions = `
    <div class="community-vox-panel">
    <div class="actions-bar gov-actions-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <span class="section-title">Deliberações Comunitárias</span>
      <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Nova proposta</a>
    </div>
    <div class="gov-info-card" style="padding: 1rem; margin-bottom: 1rem;">
      <p class="desc" style="margin:0; font-size:0.875rem;">
        🏛️ <strong>Rede como repo público:</strong> Mudanças de regras e moderação são propostas abertas com diff unificado, apuração estrita de <strong>1 membro = 1 voto</strong> e marco de corte anti-brigading.
      </p>
    </div>`;

  if (!proposals.length) {
    return `${actions}
      <div class="empty" style="padding: 1.5rem; text-align: center;">
        <p>Nenhuma proposta em deliberação nesta comunidade ainda.</p>
        <a class="btn btn-primary btn-sm" href="#/compose/proposal?c=${encodeURIComponent(communityId)}">+ Criar primeira proposta</a>
      </div>
    </div>`;
  }

  const items = proposals.map((p) => renderProposalItem(p, { communityId, communityTitle: commTitle })).join("");
  return `${actions}<div class="feed-container community-vox-panel-feed">${items}</div></div>`;
}

function renderProposalMetaFooter(item, commId, timeLabel) {
  const diffBadge = item.diffText ? '<span class="pill">📄 Contém diff unificado</span>' : "";
  return `
    <div class="proposal-meta-row" style="margin-top: 0.75rem;">
      ${diffBadge}
      <span class="pill pill-outline">Corte: ${escapeHtml(timeLabel)}</span>
      <a class="btn btn-outline btn-sm" style="margin-left:auto;" href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">Ver proposta & votos →</a>
    </div>`;
}

export function renderProposalItem(item, { communityId = "", communityTitle: _communityTitle = "" } = {}) {
  const author = item.author || item.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: item.authorDisplay,
    isOwnLocalPost: item.isOwnLocalPost,
  });
  const timeLabel = formatTimeAgo(item.createdAt || item.ts);
  const commId = item.communityId || communityId || "";
  const statusBadge = renderProposalStatusBadge(item.state || "open");
  const bodyText = (item.body || "").slice(0, 160);
  const bodyEllipsis = (item.body || "").length > 160 ? "…" : "";

  return `
    <article class="post-card proposal-card card" data-id="${escapeHtml(item.id)}">
      <div class="post-header">
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
        <div class="proposal-badges">${statusBadge}</div>
      </div>
      <h3 class="proposal-title" style="margin: 0.5rem 0 0.25rem;">
        <a href="#/c/${encodeURIComponent(commId)}/proposal/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>
      </h3>
      <p class="post-text">${escapeHtml(bodyText)}${bodyEllipsis}</p>
      ${renderProposalMetaFooter(item, commId, timeLabel)}
    </article>`;
}

export function renderProposalStatusBadge(state) {
  if (state === "merged") {
    return `<span class="status-pill status-merged">🟣 Aprovada (Merged)</span>`;
  }
  if (state === "rejected") {
    return `<span class="status-pill status-rejected">🔴 Rejeitada</span>`;
  }
  if (state === "expired") {
    return `<span class="status-pill status-expired">⚪ Expirada</span>`;
  }
  return `<span class="status-pill status-open">🟢 Em votação</span>`;
}

function renderListingMedia(item) {
  if (!item.image) return "";
  return `<div class="post-media-container"><img class="post-media" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.title || "Oferta")}" /></div>`;
}

function renderListingActions({ item, author, authorDisplay, price, pixKey, commId }) {
  const pixBtn = pixKey
    ? `<button type="button" class="btn btn-secondary btn-sm btn-zap-post btn-copy-pix" data-pix="${escapeHtml(pixKey)}" data-author="${escapeHtml(author)}" data-author-name="${escapeHtml(authorDisplay)}" data-price="${escapeHtml(price || "")}" data-title="${escapeHtml(item.title || "")}" aria-label="Apoiar com Pix" title="Apoiar com Pix">⚡ Apoiar</button>`
    : "";
  const dmHref = buildListingDmHref(author, item, { communityId: commId, price: price || "", pixKey });

  return `
    <div class="listing-actions post-toolbar" style="margin-top:10px; display:flex; gap:8px; align-items:center;">
      <a class="btn btn-outline btn-sm" href="${escapeHtml(dmHref)}">💬 Conversar no DM</a>
      ${pixBtn}
      <button class="action-btn btn-share-listing" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" data-comm="${escapeHtml(commId)}" data-price="${escapeHtml(price)}" aria-label="Compartilhar oferta">
        <svg class="action-icon icon-share" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>`;
}

function renderListingHeader(author, labels, locBadge, timeLabel, headerBadges) {
  return `
    <div class="post-header">
      <div class="post-header-author">
        <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
        <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
        <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
        ${locBadge}
        <span class="post-dot">·</span>
        <span class="post-meta">${escapeHtml(timeLabel)}</span>
      </div>
      ${headerBadges}
    </div>`;
}

function renderListingContent(item, price) {
  const priceHtml = price ? `<span class="listing-price">${escapeHtml(price)}</span>` : "";
  return `
    <div class="listing-content">
      <div class="listing-price-row">
        ${priceHtml}
        <h3 class="listing-title">${escapeHtml(item.title || "Oferta")}</h3>
      </div>
      <div class="post-body listing-body">${hashtags.linkifyHashtags(escapeHtml(item.body || ""))}</div>
    </div>`;
}

export function renderListingItem(item, { communityTitle = "" } = {}) {
  if (gossipRetract.shouldHideGossipDeletedPost(item)) return "";
  const author = item.author || item.owner || "";
  const labels = resolvePostAuthorLabels(author, {
    authorDisplay: item.authorDisplay,
    isOwnLocalPost: item.isOwnLocalPost,
  });
  const price = listing.normalizePriceLabel(item.priceLabel);
  const location = listing.normalizeLocationLabel(item.locationLabel);
  const commId = item.communityId || communityTitle || "demo-feira-local";
  const pixKey = item.contactPix || (author ? mock.getAuthorPixKey(author) : "") || "";
  const locBadge = location ? `<span class="listing-location-badge">📍 ${escapeHtml(location)}</span>` : "";
  const headerBadges = listingUi.renderListingHeaderBadges(item, {
    statusKey: listing.normalizeListingStatus(item.listingStatus),
    statusLabel: listing.formatListingStatus(item.listingStatus),
    escapeHtml,
  });

  return `
    <article class="post-card listing-card card" data-id="${escapeHtml(item.id)}">
      ${renderListingHeader(author, labels, locBadge, formatTimeAgo(item.ts), headerBadges)}
      ${listingUi.renderListingOwnerMenu(item)}
      ${renderListingMedia(item)}
      ${renderListingContent(item, price)}
      ${renderListingActions({ item, author, authorDisplay: labels.authorDisplay, price, pixKey, commId })}
    </article>`;
}


/** Nova proposta em etapas: o que muda → por quê → regras (diff) → revisar. */
function proposalWhatStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-title" class="agora-field-label">Título da proposta</label>
          <input type="text" id="prop-title" class="form-control" placeholder="Ex: Ativar feira comunitária popular" required maxlength="120" />
        </div>`;
}

function proposalWhyStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-body" class="agora-field-label">Motivação e descrição</label>
          <textarea id="prop-body" class="form-control" rows="6" placeholder="Explique os motivos da mudança e benefícios para a comunidade..." required></textarea>
        </div>`;
}

function proposalDiffStepHtml() {
  return `
        <div class="form-group agora-compose-field">
          <label for="prop-diff" class="agora-field-label">Diff unificado das regras</label>
          <textarea id="prop-diff" class="form-control agora-diff-input" rows="6" placeholder="@@ -1,2 +1,3 @@&#10;- regra antiga&#10;+ nova regra"></textarea>
          <span class="agora-field-hint">Linhas com + indicam inclusões e - indicam exclusões. Pode pular.</span>
        </div>`;
}

function proposalReviewStepHtml() {
  return `
        ${renderReviewList([
          { label: "Título", from: "prop-title" },
          { label: "Motivação", from: "prop-body", long: true },
          { label: "Regras", from: "prop-diff", empty: "Sem diff", long: true },
        ])}
        <p class="compose-step-lead">Membros decidem por voto direto: 1 membro = 1 voto. Só vota quem já era membro quando a proposta nasceu.</p>
        ${renderComposeSignaturePanel()}`;
}

export function renderComposeProposal(main, communityId, commTitle = "") {
  const backHref = `#/c/${encodeURIComponent(communityId)}?tab=governance`;
  const nav = { backHref, submitId: "btn-submit-proposal", submitLabel: "Publicar Proposta Assinada" };
  const steps = [
    { key: "what", title: "O que muda?", required: ["prop-title"], requiredMsg: "Dê um título à proposta.", body: proposalWhatStepHtml() },
    { key: "why", title: "Por quê?", required: ["prop-body"], requiredMsg: "Explique a motivação.", body: proposalWhyStepHtml() },
    { key: "diff", title: "Quais regras mudam? (opcional)", body: proposalDiffStepHtml() },
    { key: "review", title: "Revisar a proposta", body: proposalReviewStepHtml() },
  ];
  main.innerHTML = `
    <div class="card compose-card compose-proposal-card agora-composer agora-composer--steps">
      <div class="agora-composer-head">
        <a class="back-link" href="${backHref}">← Voltar à governança</a>
        <p class="agora-composer-kicker">Nova Proposta — ${escapeHtml(commTitle || communityId)}</p>
      </div>
      <form id="form-compose-proposal" novalidate>
        <input type="hidden" id="prop-comm-id" value="${escapeHtml(communityId)}" />
        ${renderSteps(steps, nav)}
      </form>
    </div>`;
}
