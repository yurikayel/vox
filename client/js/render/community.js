/** @file Home, communities, listings, governance proposals UI. */
import * as mock from "../mock.js";
import * as listing from "../listing.js";
import * as gov from "../governance.js";
import * as hashtags from "../hashtags.js";
import * as listingUi from "../listing-ui.js";
import * as gossipRetract from "../gossip-retract-ui.js";
import * as profileDirectory from "../profile-directory.js";
import { renderUnifiedDiffHtml } from "./diff-html.js";
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
  renderMarkdownLight,
} from "./util.js";

export function renderCommunityAvatarHtml(meta = {}, communityId = "", sizeClass = "community-avatar-lg") {
  const image = meta.image || meta.avatar || meta.photo || "";
  const title = meta.title || communityId || "Comunidade";
  const initial = (title || "C").slice(0, 1).toUpperCase();
  const accent = getCommunityColor(communityId);
  if (image) {
    return `<div class="community-avatar-box ${sizeClass}" style="--comm-avatar-accent:${accent};">
      <img class="community-avatar-img" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
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
  if (meta.memberCount != null && !Number.isNaN(Number(meta.memberCount))) {
    return Number(meta.memberCount);
  }
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id) return mock.MOCK_DEMO_UF_COUNT;
  return null;
}

function formatCommunityMembers(n) {
  if (n == null) return "";
  return `${n.toLocaleString("pt-BR")} membros`;
}

function buildCommunityTypeSubtitle(meta, communityId) {
  const parts = [];
  const vis = meta.visibility === "closed" ? "fechada" : "aberta";
  parts.push(`Tipo: ${vis}`);
  if (meta.communityForkOf || meta.forkOf) parts.push("espelho");
  if (communityId === mock.MOCK_DEMO_COMMUNITY.id || meta.demo) parts.push("Demo");
  return parts.join(" · ");
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
  if (communityId !== mock.MOCK_DEMO_COMMUNITY.id) return people;
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

export function renderCommunityTopicRow(topic, { communityId: _communityId = "", communityTitle: _communityTitle = "" } = {}) {
  const { author, authorHandle, authorAvatar } = resolveTopicAuthorMeta(topic);
  const { display: timeDisplay, titleAttr: timeTitle } = postTimeParts(topic.ts);
  const replies = topicReplyCount(topic);
  const replyLabel = replies === 1 ? "1 resposta" : `${replies} respostas`;
  const title = topic.title || topicExcerptOneParagraph(topic) || "Sem título";
  const excerpt = topicExcerptOneParagraph(topic);
  const topicHref = `#/t/${encodeURIComponent(topic.id)}`;
  const thumb = renderTopicRowThumb(topic, topicHref);

  return `
    <article class="community-topic-row" data-id="${escapeHtml(topic.id)}">
      <div class="community-topic-row-body">
        <h3 class="community-topic-row-title"><a href="${topicHref}">${escapeHtml(title)}</a></h3>
        <p class="community-topic-row-meta">
          <a class="community-topic-row-author" href="#/u/${encodeURIComponent(author)}">${authorAvatar}<span>@${escapeHtml(authorHandle)}</span></a>
          <span class="community-topic-row-dot" aria-hidden="true">·</span>
          <span>${escapeHtml(replyLabel)}</span>
          <span class="community-topic-row-dot" aria-hidden="true">·</span>
          <span class="community-topic-row-time"${timeTitle}>${escapeHtml(timeDisplay)}</span>
        </p>
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
  const onlineHint = online.length
    ? `${online.length}${onlineExtra ? `+${onlineExtra}` : ""} agora (demo)`
    : "Demo offline";
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
  const alert = stats.degraded ? '<p class="community-vox-neighbor-alert" role="status">Velocidade reduzida: poucos apoiadores online nesta comunidade.</p>' : "";
  const commCta = commOnly
    ? '<span class="meta">Você já prioriza suas comunidades na malha (Apoiador).</span>'
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
      ${renderSeedStep(state.commOnlyNudgeSeen || ctx.commOnly, "Apoiador <code>commOnly</code> (opcional)", ctx.commOnly ? "Ativo" : '<a href="#/settings/network#net-comm-only-wrap">Ver opção</a>')}
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
      <p class="meta community-vox-seed-foot">Baseado em <code>docs/steward-seed-15min.md</code> — caminho A (sem VPS).</p>
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

function renderHomeCommunityCard(c) {
  const members = resolveCommunityMemberCount(c, c.id);
  const memberLine = members != null ? `<p class="community-vox-card-members">${escapeHtml(formatCommunityMembers(members))}</p>` : "";
  const typeLine = buildCommunityTypeSubtitle(c, c.id);
  const avatarHtml = renderCommunityAvatarHtml(c, c.id, "community-avatar-md");
  return `
    <article class="community-card community-vox-card community-vox-card-list card" style="--community-accent:${getCommunityColor(c.id)};">
      <div class="community-vox-card-accent" aria-hidden="true"></div>
      <div class="community-vox-card-layout">
        <a class="community-vox-card-avatar-link community-vox-card-avatar-wrap" href="#/c/${encodeURIComponent(c.id)}" aria-label="${escapeHtml(c.title)}">${avatarHtml}</a>
        <div class="community-vox-card-main">
          <a class="community-vox-card-title" href="#/c/${encodeURIComponent(c.id)}"><h3>${escapeHtml(c.title)}</h3></a>
          ${memberLine}
          <p class="community-vox-card-type">${escapeHtml(typeLine)}</p>
          <p class="community-vox-card-desc desc">${escapeHtml(c.description || "Sem descrição.")}</p>
          <div class="community-vox-card-actions">
            <a class="btn btn-sm community-vox-enter-btn" href="#/c/${encodeURIComponent(c.id)}">Entrar →</a>
          </div>
        </div>
      </div>
    </article>`;
}

export function renderHome(main, communities) {
  const bar = `<div class="actions-bar"><span class="section-title">Comunidades</span><a class="btn btn-primary btn-sm" href="#/compose/community">+ Nova</a></div>`;
  if (!communities.length) {
    main.innerHTML += `${bar}<div class="empty"><p>Nenhuma comunidade criada ainda.</p><a class="btn btn-primary" href="#/compose/community">+ Criar Comunidade</a></div>`;
    return;
  }
  const items = communities.map(renderHomeCommunityCard).join("");
  main.innerHTML += `${bar}<div class="community-grid">${items}</div>`;
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

function renderCommunityHeaderToolbar(communityId, commTitle, isMember) {
  return `
    <div class="community-vox-toolbar" role="toolbar" aria-label="Ações da comunidade">
      <button id="btn-join-comm" type="button" class="community-vox-join-pill${isMember ? " is-member" : ""}" data-id="${escapeHtml(communityId)}" aria-pressed="${isMember ? "true" : "false"}">
        ${isMember ? "✓ Membro" : "Entrar"}
      </button>
      <button id="btn-share-comm" type="button" class="btn btn-sm btn-outline community-vox-btn-share" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">Compartilhar</button>
      <button id="btn-export-comm-genesis" type="button" class="btn btn-sm btn-outline community-vox-btn-export" data-id="${escapeHtml(communityId)}" title="Exportar Gênesis e dados offline desta comunidade">💾 Gênesis</button>
      <a class="btn btn-sm btn-primary community-vox-btn-compose" href="#/compose/topic?c=${encodeURIComponent(communityId)}">Novo post</a>
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

function canChangeCommunityPhoto(owner, walletAddress, isMod) {
  if (isMod) return true;
  return Boolean(owner && walletAddress && owner === walletAddress);
}

function renderCommunityHeader(meta, communityId, opts = {}) {
  const commTitle = meta.title || communityId;
  const memberCount = resolveCommunityMemberCount(meta, communityId);
  const metaChips = renderCommunityMetaChips(meta, communityId, memberCount);
  const canChangePhoto = canChangeCommunityPhoto(meta.owner, opts.walletAddress, opts.isMod);
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
        ${renderCommunityHeaderToolbar(communityId, commTitle, opts.isMember)}
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

export function renderCommunity(main, communityId, topics, meta = {}, opts = {}) {
  const activeTab = opts.activeTab || "posts";
  const accent = getCommunityColor(communityId);
  const headerHtml = renderCommunityHeader(meta, communityId, opts);
  const neighborHtml = renderCommunityNeighborPanel(opts.neighborStats, opts);
  const seedHtml = opts.seedChecklist ? renderCommunitySeedChecklist(communityId, opts.seedChecklist.state, opts.seedChecklist.ctx) : "";
  const recadoHtml = activeTab === "posts" && meta.welcomeRecado ? renderCommunityWelcomeRecado(meta.welcomeRecado) : "";
  const navHtml = renderCommunityNavTabs(communityId, activeTab, opts.proposals?.length);
  const slotHtml = renderCommunityTabContent(activeTab, {
    communityId,
    commTitle: meta.title || communityId,
    meta,
    topics,
    listings: opts.listings,
    proposals: opts.proposals,
    recentPeople: opts.recentPeople,
    isMember: opts.isMember,
    memberCount: resolveCommunityMemberCount(meta, communityId),
  });

  main.innerHTML += `
    <div class="community-vox-page" data-community-id="${escapeHtml(communityId)}" style="--community-accent:${accent};">
      ${headerHtml}${neighborHtml}${seedHtml}${renderCommunityForkBanner(meta)}${recadoHtml}${navHtml}
      <div class="community-tab-content-slot" id="community-tab-content">${slotHtml}</div>
    </div>`;
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
    ${renderCommunityPostsTab(ctx.communityId, ctx.commTitle, ctx.topics || [])}
  </div>`;
}

function renderCommunityPostsTab(communityId, commTitle, topics) {
  const composeHref = `#/compose/topic?c=${encodeURIComponent(communityId)}`;
  let inner = "";
  if (!topics.length) {
    inner = `<div class="empty community-vox-empty"><p>Nenhum post nesta comunidade ainda.</p><a class="btn btn-primary btn-sm" href="${composeHref}">Criar o primeiro post</a></div>`;
  } else {
    const items = topics
      .map((t) => renderCommunityTopicRow({ ...t, communityId, communityTitle: commTitle }))
      .join("");
    inner = `<div class="community-vox-topic-list">${items}</div>`;
  }
  return `
    <section class="community-vox-feed card" aria-labelledby="community-vox-feed-title">
      <header class="community-vox-feed-head">
        <h2 id="community-vox-feed-title" class="community-vox-feed-title">Tópicos e posts</h2>
        <a class="btn btn-sm btn-outline" href="${composeHref}">+ Post</a>
      </header>
      ${inner}
    </section>`;
}

function renderCommercialDisabledView(communityId) {
  return `
    <div class="community-vox-panel">
      <div class="empty feira-disabled" style="padding: 1.5rem; text-align: center;">
        <h3 style="margin-top:0;">🏛️ Feira comunitária não ativada</h3>
        <p class="desc" style="max-width: 480px; margin: 0.5rem auto 1rem;">
          Esta comunidade ainda não abriu classificados (modo comercial desligado por padrão). Uma proposta comunitária de governança pode deliberar e aprovar a abertura da feira local.
        </p>
        <a href="#/c/${encodeURIComponent(communityId)}" class="btn btn-outline btn-sm">← Ver posts da comunidade</a>
      </div>
    </div>`;
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

function renderListingActions(item, author, authorDisplay, price, pixKey, commId) {
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
      ${renderListingActions(item, author, labels.authorDisplay, price, pixKey, commId)}
    </article>`;
}

function renderProposalArticle(proposal, labels, timeLabel, state, diffHtml) {
  const author = proposal.author || proposal.owner || "";
  return `
    <article class="card" style="padding: 1.5rem; margin-bottom: 1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
        <div class="post-header-author">
          <a class="avatar-link" href="#/u/${encodeURIComponent(author)}">${renderAvatarHtml(author, labels.authorDisplay)}</a>
          <a class="post-author" href="#/u/${encodeURIComponent(author)}">${escapeHtml(labels.authorDisplay)}</a>
          <span class="post-handle">@${escapeHtml(labels.authorHandle)}</span>
          <span class="post-dot">·</span>
          <span class="post-meta">${escapeHtml(timeLabel)}</span>
        </div>
        <div>${renderProposalStatusBadge(state)}</div>
      </div>
      <h1 style="font-size: 1.4rem; margin: 0.5rem 0 1rem;">${escapeHtml(proposal.title)}</h1>
      <div class="post-text" style="font-size: 1rem; line-height: 1.6;">${renderMarkdownLight(proposal.body)}</div>
      ${diffHtml}
      <div class="proposal-bridge-bar" style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--border); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
        <span class="meta" style="font-size:0.78rem;">📣 Ecoar no QG:</span>
        <button type="button" id="btn-proposal-copy-discord" class="btn btn-sm btn-outline">📋 Copiar resumo (Discord / Slack)</button>
        <button type="button" id="btn-proposal-webhook-echo" class="btn btn-sm btn-outline">🔔 Disparar Webhook</button>
      </div>
    </article>`;
}

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

  main.innerHTML = `
    <div class="proposal-detail">
      <div style="margin-bottom: 1rem;">
        <a href="#/c/${encodeURIComponent(commId)}?tab=governance" class="back-link">← Voltar para Governança de ${escapeHtml(commTitle)}</a>
      </div>
      ${renderProposalArticle(proposal, labels, timeLabel, state, diffHtml)}
      ${renderProposalTally(tally, proposal)}
      ${renderProposalVotingBox(proposal, tally, opts)}
      ${renderProposalVotesList(tally)}
    </div>`;
}

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

export function renderProposalTally(tally, _proposal) {
  const total = tally.totalEligible || 0;
  const pctYes = total > 0 ? Math.round((tally.yes / total) * 100) : 0;
  const pctNo = total > 0 ? Math.round((tally.no / total) * 100) : 0;
  const pctAbstain = total > 0 ? Math.round((tally.abstain / total) * 100) : 0;

  return `
    <div class="tally-container card">
      <h3 style="margin: 0 0 0.5rem;">📊 Apuração de Votos (1 membro = 1 voto)</h3>
      <div class="tally-bar">
        <div class="tally-segment tally-yes" style="width: ${pctYes}%" title="Sim: ${pctYes}%"></div>
        <div class="tally-segment tally-no" style="width: ${pctNo}%" title="Não: ${pctNo}%"></div>
        <div class="tally-segment tally-abstain" style="width: ${pctAbstain}%" title="Abstenção: ${pctAbstain}%"></div>
      </div>
      <div class="tally-stats-row">
        <span>🟢 <strong>Sim:</strong> ${tally.yes} (${pctYes}%)</span>
        <span>🔴 <strong>Não:</strong> ${tally.no} (${pctNo}%)</span>
        <span>⚪ <strong>Abstenção:</strong> ${tally.abstain} (${pctAbstain}%)</span>
        <span>👥 <strong>Total apurado:</strong> ${total}</span>
        ${tally.ineligibleCount > 0 ? `<span>⚠️ <strong>Descartados pós-corte:</strong> ${tally.ineligibleCount}</span>` : ""}
      </div>
    </div>`;
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

export function renderProposalVotingBox(proposal, tally, { userVote, isEligible, isMember, userAddress }) {
  const state = tally.state || proposal.state || "open";
  if (state !== "open") {
    return `<div class="card" style="padding: 1.25rem; text-align: center; margin-bottom: 1.25rem;"><p class="desc" style="margin:0;">🔒 Esta votação está encerrada (${renderProposalStatusBadge(state)}).</p></div>`;
  }
  if (!userAddress) {
    return `<div class="banner-info">ℹ️ Para votar nesta proposta, você precisa estar conectado à sua conta Vox local.</div>`;
  }
  const currentChoice = userVote ? gov.normalizeVoteChoice(userVote.choice) : "";
  const choiceHint = currentChoice ? `<br><strong>Seu voto atual:</strong> ${currentChoice.toUpperCase()} (você pode alterar até o encerramento).` : "";
  return `
    <div class="card" style="padding: 1.25rem; margin-bottom: 1.25rem;">
      <h3 style="margin-top: 0;">🗳️ Registrar seu voto</h3>
      ${renderProposalVoterWarning(isMember, isEligible)}
      <p class="desc" style="font-size: 0.85rem; margin-bottom: 1rem;">
        🛡️ Cada membro tem peso idêntico (1×). Seu voto será assinado localmente com sua chave ECDSA e propagado para os pares.
        ${choiceHint}
      </p>
      <div class="vote-action-buttons">
        <button class="vote-btn vote-btn-yes ${currentChoice === "yes" ? "selected" : ""}" data-choice="yes">✓ Sim (Aprovar)</button>
        <button class="vote-btn vote-btn-no ${currentChoice === "no" ? "selected" : ""}" data-choice="no">✗ Não (Rejeitar)</button>
        <button class="vote-btn vote-btn-abstain ${currentChoice === "abstain" ? "selected" : ""}" data-choice="abstain">○ Abstenção</button>
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

export function renderComposeProposal(main, communityId, commTitle = "") {
  main.innerHTML = `
    <div class="card compose-card compose-proposal-card" style="max-width: 640px; margin: 1rem auto; padding: 1.5rem;">
      <a class="back-link" href="#/c/${encodeURIComponent(communityId)}?tab=governance">← Voltar à governança</a>
      <h2>Nova Proposta — ${escapeHtml(commTitle || communityId)}</h2>
      <p class="desc" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        🏛️ No espírito FOSS, mudanças de regras acompanham um diff transparente. Membros decidirão via voto direto (1 membro = 1 voto).
      </p>
      <form id="form-compose-proposal">
        <input type="hidden" id="prop-comm-id" value="${escapeHtml(communityId)}" />
        <div class="form-group" style="margin-bottom: 1rem;">
          <label for="prop-title" style="display:block; font-weight:600; margin-bottom:0.3rem;">Título da proposta *</label>
          <input type="text" id="prop-title" class="form-control" placeholder="Ex: Ativar feira comunitária popular" required maxlength="120" />
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label for="prop-body" style="display:block; font-weight:600; margin-bottom:0.3rem;">Motivação e Descrição *</label>
          <textarea id="prop-body" class="form-control" rows="4" placeholder="Explique os motivos da mudança e benefícios para a comunidade..." required></textarea>
        </div>
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label for="prop-diff" style="display:block; font-weight:600; margin-bottom:0.3rem;">Diff unificado das regras (Pull Request) [opcional]:</label>
          <textarea id="prop-diff" class="form-control" rows="3" style="font-family:monospace; font-size:0.85rem;" placeholder="@@ -1,2 +1,3 @@&#10;- regra antiga&#10;+ nova regra"></textarea>
          <span style="font-size:0.75rem; color:var(--muted); display:block; margin-top:0.25rem;">Linhas com + indicam inclusões e - indicam exclusões.</span>
        </div>
        <div class="form-actions" style="margin-top:1rem; display:flex; justify-content:flex-end; gap:0.75rem;">
          <a href="#/c/${encodeURIComponent(communityId)}?tab=governance" class="btn btn-outline">Cancelar</a>
          <button type="submit" class="btn btn-primary" id="btn-submit-proposal">Publicar Proposta Assinada</button>
        </div>
      </form>
    </div>`;
}
