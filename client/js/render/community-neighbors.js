/** @file Painel «Sustentada por vizinhos», telemetria e checklist pós-criação.
 * @module render/community-neighbors
 */
import * as mock from "../mock.js";
import { getReadOriginAggregate } from "../gateway-telemetry.js";
import { escapeHtml } from "./util.js";
import { resolveCommunityOnlinePeople, isSeedCompleteForRender } from "./community-shared.js";

function resolveNeighborReadPct(communityId, isDemoComm, readOriginStats) {
  if (isDemoComm) return { localReadPct: 96, readOriginInsufficient: false };
  const agg = readOriginStats ?? getReadOriginAggregate(communityId);
  if (agg.sufficient && agg.localReadPct != null) {
    return { localReadPct: agg.localReadPct, readOriginInsufficient: false };
  }
  return { localReadPct: null, readOriginInsufficient: true };
}

/**
 * Agregados locais para o painel «Sustentada por vizinhos» (sem ranking público de nós).
 * @param {object} [options={}]
 * @param {object[]} [options.recentPeople=[]] Pessoas recentes.
 * @param {string} [options.communityId=""] Comunidade medida.
 * @param {number|null} [options.memberCount=null] Membros conhecidos.
 * @param {string} [options.gatewayState="all_ok"] Saúde do gateway (`critical`, etc.).
 * @param {boolean} [options.isDemo=false] Se usa estimativas demo.
 * @param {object|null} [options.readOriginStats=null] Telemetria de origem de leitura.
 * @returns {object} Métricas para {@link renderCommunityNeighborPanel}.
 */
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

/**
 * Dica de espelho relay no cabeçalho da comunidade.
 * @param {object|null|undefined} mirrorStatus Último status de espelho (`ok`, `at`, `code`).
 * @returns {string} HTML do parágrafo ou `""`.
 */
export function renderCommunityMirrorHint(mirrorStatus) {
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

/**
 * Painel lateral «Sustentada por vizinhos» com métricas agregadas locais.
 * @param {object|null|undefined} stats Saída de {@link computeCommunityNeighborStats}.
 * @param {object} [options={}]
 * @param {boolean} [options.commOnly=false] Se o visitante já prioriza só comunidades.
 * @returns {string} HTML da seção ou `""`.
 */
export function renderCommunityNeighborPanel(stats, { commOnly = false } = {}) {
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

/**
 * Checklist V-P05 pós-criação (~3 min) com passos verificáveis no aparelho.
 * @param {string} communityId Comunidade recém-criada.
 * @param {object} state Progresso salvo (`invitesSent`, `dismissed`, etc.).
 * @param {object} [ctx={}] Contagem de tópicos e flags de rede.
 * @returns {string} HTML da seção ou `""` se completa/dispensada.
 */
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
