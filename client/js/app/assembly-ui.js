/**
 * @file PM-23 — Controlador de UI do Modo Assembleia (v0).
 * Publicação de convocação+pauta (estendendo aviso `convocacao`), RSVP via `aviso-resposta`,
 * presença assinável (`assembly-presence`), voto com prazo (`vote` + `blockReason`),
 * atualização de status pós-decisão e exportação de ata/presença em Markdown/JSON.
 *
 * @module app/assembly-ui
 * @see docs/specs/modo-assembleia-v0.md
 * @see client/js/assembly-minutes.js
 * @see client/js/assembly-presence.js
 */
import * as aviso from "../aviso.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as share from "../share.js";
import { isModerator } from "../moderation.js";
import { randomBase36 } from "../shared/html.js";
import {
  buildAssemblyBundleFromPosts,
  buildAssemblyConvocacao,
  buildDecisionStatusUpdate,
  isAssemblyConvocacao,
  renderAssemblyMinutesMarkdownClient,
  serializeAssemblyMinutesJson,
  tallyAssemblyClient,
  validatePostDecisionStatus,
} from "../assembly-minutes.js";
import {
  buildAssemblyPresenceCheckin,
  buildAssemblyVote,
  buildPresenceExportData,
  isAssemblyVotingOpen,
  renderPresenceListMarkdown,
  serializePresenceListJson,
  summarizeAssemblyPresence,
  tallyAssemblyAgendaVotes,
} from "../assembly-presence.js";
import { renderAssemblyPanel } from "../render/assembly-panel.js";

/**
 * Gera um identificador local com prefixo usando `randomBase36`.
 * @param {string} prefix Prefixo do registro.
 * @returns {string}
 */
const newId = (prefix) => `${prefix}_${randomBase36(8)}`;

/**
 * Lê posts locais de um tipo para a comunidade; falha retorna lista vazia.
 * @param {string} type Tipo de post.
 * @param {string} communityId Comunidade.
 * @returns {Promise<object[]>}
 */
const localOf = (type, communityId) => cacheNode.getLocalPosts({ type, communityId }).catch(() => []);

/**
 * Assina, persiste localmente e espalha via gossip.
 * @param {object} payload Payload plano.
 * @returns {Promise<object>}
 */
async function signAndBroadcast(payload) {
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  return signed;
}

/**
 * Calcula conjunto de membros ativos da comunidade a partir de entradas e saídas.
 * @param {object[]} joins Entradas `membership`.
 * @param {object[]} leaves Saídas `membership_leave`.
 * @param {string} [owner=""] Dono da comunidade.
 * @returns {Set<string>}
 */
function resolveMemberSet(joins = [], leaves = [], owner = "") {
  const members = new Set(owner ? [owner] : []);
  const maxTs = (items, author, field) =>
    Math.max(0, ...items.filter((m) => (m.author || m.owner) === author).map((m) => Number(m[field] || m.ts || 0)));
  for (const author of new Set(joins.map((m) => m.author || m.owner).filter(Boolean))) {
    if (maxTs(joins, author, "joinedAt") > maxTs(leaves, author, "leftAt")) members.add(author);
  }
  return members;
}

/**
 * Retorna a última escolha de RSVP de `routeId` para a convocação.
 * @param {object[]} responses Respostas `aviso-resposta`.
 * @param {string} assemblyId ID da convocação.
 * @param {string} routeId Rota do usuário atual.
 * @returns {string}
 */
function findMyChoice(responses, assemblyId, routeId) {
  if (!routeId) return "";
  const mine = responses.filter((r) => r.avisoId === assemblyId && (r.author || r.owner) === routeId);
  mine.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return mine[0]?.choice || "";
}

/**
 * Retorna o status pós-decisão mais recente assinado por moderação.
 * @param {object[]} statuses Posts `assembly-status`.
 * @param {string} assemblyId ID da convocação.
 * @param {object} meta Metadados da comunidade.
 * @returns {string}
 */
function latestDecisionStatus(statuses, assemblyId, meta) {
  const valid = (statuses || []).filter((s) =>
    s?.type === "assembly-status"
    && s.assemblyId === assemblyId
    && validatePostDecisionStatus(s.decisionStatus)
    && isModerator(s.author || s.owner, meta?.owner, meta?.moderators));
  valid.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return valid[0]?.decisionStatus || "";
}

/**
 * Conta participantes únicos somando presença assinada e RSVP (`vou`/`ciente`).
 * @param {object} presence Resumo de `summarizeAssemblyPresence`.
 * @param {object[]} responses Respostas `aviso-resposta`.
 * @param {string} assemblyId ID da assembleia.
 * @returns {number}
 */
function countUniqueParticipants(presence, responses, assemblyId) {
  const pubkeys = new Set((presence.entries || []).map((e) => e.pubkey));
  for (const r of responses || []) {
    if (r?.avisoId === assemblyId && (r.choice === "vou" || r.choice === "ciente") && r.sig) {
      const pk = String(r.author || r.owner || "").trim();
      if (pk) pubkeys.add(pk);
    }
  }
  return pubkeys.size;
}

/**
 * Monta item de visão para uma convocação de assembleia.
 * @param {object} convocacao Post de convocação.
 * @param {object} state Dados locais da comunidade.
 * @returns {object}
 */
function buildAssemblyViewItem(convocacao, state) {
  const presence = summarizeAssemblyPresence(state.presences, convocacao.id);
  const quorumMin = Number.isInteger(convocacao.assemblyQuorumMin) ? convocacao.assemblyQuorumMin : Number(convocacao.quorumMin || 0);
  const quorumMet = countUniqueParticipants(presence, state.responses, convocacao.id) >= quorumMin;
  return {
    convocacao,
    tally: aviso.tallyAvisoResponses(state.responses, convocacao.id, state.members),
    myChoice: findMyChoice(state.responses, convocacao.id, state.routeId),
    presence,
    myPresence: presence.entries.some((e) => e.pubkey === state.routeId),
    votingOpen: isAssemblyVotingOpen(convocacao, state.now),
    voteSummary: tallyAssemblyAgendaVotes(convocacao, state.votes, { quorumMet, myRouteId: state.routeId }),
    decisionStatus: latestDecisionStatus(state.statuses, convocacao.id, state.meta),
  };
}

/**
 * Carrega contexto local de assembleias de uma comunidade.
 * @param {string} communityId Comunidade.
 * @param {object} [meta={}] Metadados da comunidade.
 * @param {number} [now=Date.now()] Instante de referência em ms.
 * @returns {Promise<object>}
 */
export async function loadAssemblyContext(communityId, meta = {}, now = Date.now()) {
  const types = ["topic", "aviso-resposta", "assembly-presence", "vote", "assembly-status", "membership", "membership_leave"];
  const [topics, responses, presences, votes, statuses, joins, leaves] = await Promise.all(types.map((t) => localOf(t, communityId)));
  const routeId = await localAccount.getRouteId();
  const members = resolveMemberSet(joins, leaves, meta?.owner);
  const isMod = isModerator(routeId, meta?.owner, meta?.moderators);
  const convocacoes = aviso.classifyAvisos(topics, meta).filter(isAssemblyConvocacao);
  const state = { responses, presences, votes, statuses, members, routeId, meta, now };
  const items = convocacoes.map((convocacao) => buildAssemblyViewItem(convocacao, state));
  return { communityId, meta, routeId, isMod, canRespond: Boolean(routeId), responses, presences, votes, items };
}

/**
 * Publica convocação de assembleia com pauta assinada.
 * @param {object} draft Rascunho da convocação.
 * @returns {Promise<object>} Post assinado.
 */
export async function publishAssemblyConvocacao(draft) {
  const payload = buildAssemblyConvocacao(draft);
  return signAndBroadcast({
    ...payload,
    id: newId("asm"),
    authorDisplay: localAccount.getDisplayName() || "",
  });
}

/**
 * Registra RSVP assinado reutilizando `type: "aviso-resposta"`.
 * @param {{id: string, communityId: string}} convocacao Convocação alvo.
 * @param {string} choice Escolha (`ciente`, `vou`, `talvez`, `nao-vou`).
 * @returns {Promise<object>} Resposta assinada.
 */
export async function submitAssemblyRsvp(convocacao, choice) {
  const payload = aviso.buildAvisoResponse(convocacao, choice);
  return signAndBroadcast({
    ...payload,
    id: newId("avr"),
    authorDisplay: localAccount.getDisplayName() || "",
  });
}

/**
 * Registra check-in assinado na lista de presença (`assembly-presence`).
 * @param {{id: string, communityId: string}} convocacao Convocação alvo.
 * @param {string} [note=""] Observação opcional.
 * @returns {Promise<object>} Presença assinada.
 */
export async function submitAssemblyPresence(convocacao, note = "") {
  const payload = buildAssemblyPresenceCheckin({
    communityId: convocacao?.communityId,
    assemblyId: convocacao?.id,
    note,
  });
  return signAndBroadcast({
    ...payload,
    id: newId("apr"),
    authorDisplay: localAccount.getDisplayName() || "",
  });
}

/**
 * Assina e publica um voto com prazo (`type: "vote"`) para um item da pauta.
 * @param {{convocacao: object, agendaId: string, choice: string, blockReason?: string}} input Dados do voto.
 * @param {number} [now=Date.now()] Instante em ms.
 * @returns {Promise<object>} Voto assinado.
 */
export async function submitAssemblyVote(input, now = Date.now()) {
  const payload = buildAssemblyVote(input, now);
  return signAndBroadcast({
    ...payload,
    id: newId("avt"),
    authorDisplay: localAccount.getDisplayName() || "",
  });
}

/**
 * Publica atualização de status pós-decisão (`em_andamento`, `cumprida`, `arquivada`).
 * @param {{communityId: string, assemblyId: string, decisionStatus: string}} input Dados do status.
 * @returns {Promise<object>} Atualização assinada.
 */
export async function updateAssemblyDecisionStatus(input) {
  const payload = buildDecisionStatusUpdate(input);
  return signAndBroadcast({ ...payload, id: newId("ast") });
}

/**
 * Dispara download de arquivo texto/JSON no navegador quando habilitado.
 * @param {string} output Conteúdo serializado.
 * @param {string} filename Nome do arquivo.
 * @param {boolean} isJson Se o conteúdo é JSON.
 * @param {boolean} download Se deve baixar.
 * @returns {void}
 */
function triggerDownload(output, filename, isJson, download) {
  if (!download || typeof Blob === "undefined") return;
  const mime = isJson ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
  share.downloadBlob(new Blob([output], { type: mime }), filename);
}

/**
 * Gera e opcionalmente baixa a ata assinada em Markdown ou JSON.
 * @param {{convocacao: object, responses?: object[], presences?: object[], votes?: object[], format?: "md"|"json", download?: boolean}} input Parâmetros.
 * @returns {Promise<{tally: object, output: string, filename: string}>}
 */
export async function exportAssemblyMinutes({ convocacao, responses = [], presences = [], votes = [], format = "md", download = true }) {
  const bundle = buildAssemblyBundleFromPosts({ convocacao, responses, presences, votes });
  const tally = await tallyAssemblyClient(bundle);
  const isJson = format === "json";
  const output = isJson ? serializeAssemblyMinutesJson(tally) : renderAssemblyMinutesMarkdownClient(tally);
  const filename = `ata-${bundle.assemblyId || "assembleia"}.${isJson ? "json" : "md"}`;
  triggerDownload(output, filename, isJson, download);
  return { tally, output, filename };
}

/**
 * Gera e opcionalmente baixa a lista de presença assinada em Markdown ou JSON.
 * @param {{convocacao: object, presences?: object[], format?: "md"|"json", download?: boolean}} input Parâmetros.
 * @returns {Promise<{data: object, output: string, filename: string}>}
 */
export async function exportAssemblyPresence({ convocacao, presences = [], format = "md", download = true }) {
  const data = await buildPresenceExportData({ convocacao, presences });
  const isJson = format === "json";
  const output = isJson ? serializePresenceListJson(data) : renderPresenceListMarkdown(data);
  const filename = `presenca-${data.assemblyId || "assembleia"}.${isJson ? "json" : "md"}`;
  triggerDownload(output, filename, isJson, download);
  return { data, output, filename };
}

/**
 * Monta o painel do Modo Assembleia dentro do slot informado.
 * @param {HTMLElement} slot Elemento `[data-assembly-slot]`.
 * @param {{communityId: string, meta?: object, now?: number}} options Contexto da comunidade.
 * @returns {Promise<object>} Contexto carregado.
 */
export async function mountAssemblyPanel(slot, { communityId, meta = {}, now = Date.now() }) {
  const ctx = await loadAssemblyContext(communityId, meta, now);
  slot.innerHTML = renderAssemblyPanel({
    communityId,
    items: ctx.items,
    isMod: ctx.isMod,
    canRespond: ctx.canRespond,
    now,
  });
  slot.dataset.assemblyMounted = "1";
  return ctx;
}

/**
 * Lê os campos do formulário de convocação+pauta.
 * @param {HTMLFormElement} form Formulário submetido.
 * @param {string} communityId Comunidade alvo.
 * @returns {object}
 */
function readPublishForm(form, communityId) {
  const data = new FormData(form);
  const rawDate = String(data.get("eventAt") || "");
  const rawCloses = String(data.get("assemblyClosesAt") || "");
  return {
    communityId,
    title: String(data.get("title") || ""),
    assemblyAgenda: String(data.get("assemblyAgenda") || ""),
    eventAt: rawDate ? new Date(rawDate).getTime() || 0 : 0,
    assemblyClosesAt: rawCloses ? new Date(rawCloses).getTime() || 0 : 0,
    eventPlace: String(data.get("eventPlace") || ""),
    quorumMin: data.get("quorumMin"),
    ritualRule: data.get("ritualRule") ? String(data.get("ritualRule")) : "",
  };
}

/**
 * Executa exportação de ata ou lista de presença a partir de ação do botão.
 * @param {string} action Nome da ação.
 * @param {object} item Item da assembleia.
 * @param {object} ctx Contexto carregado.
 * @returns {Promise<void>}
 */
async function runExportAction(action, item, ctx) {
  if (action === "export-md" || action === "export-json") {
    const format = action === "export-json" ? "json" : "md";
    const { tally } = await exportAssemblyMinutes({
      convocacao: item.convocacao,
      responses: ctx.responses,
      presences: ctx.presences,
      votes: ctx.votes,
      format,
    });
    share.showToast(`Ata exportada (${format.toUpperCase()}) · hash ${tally.minutesHash.slice(0, 10)}…`);
    return;
  }
  if (action === "export-presence-md" || action === "export-presence-json") {
    const format = action === "export-presence-json" ? "json" : "md";
    const { data } = await exportAssemblyPresence({ convocacao: item.convocacao, presences: ctx.presences, format });
    share.showToast(`Presença exportada (${format.toUpperCase()}) · hash ${data.presenceHash.slice(0, 10)}…`);
  }
}

/**
 * Executa ação de clique delegada do painel de assembleia.
 * @param {HTMLElement} button Botão clicado.
 * @param {HTMLElement} slot Slot do painel.
 * @param {{communityId: string, meta?: object}} opts Contexto da comunidade.
 * @returns {Promise<void>}
 */
async function runAssemblyAction(button, slot, { communityId, meta }) {
  const action = button.dataset.assemblyAction;
  if (action === "open") {
    await mountAssemblyPanel(slot, { communityId, meta });
    return;
  }
  const ctx = await loadAssemblyContext(communityId, meta);
  const item = ctx.items.find((i) => i.convocacao.id === button.dataset.assemblyId);
  if (!item) return;
  if (action === "rsvp") {
    await submitAssemblyRsvp(item.convocacao, button.dataset.choice);
    share.showToast("Presença (RSVP) assinada.");
    await mountAssemblyPanel(slot, { communityId, meta });
    return;
  }
  if (action === "checkin") {
    await submitAssemblyPresence(item.convocacao);
    share.showToast("Check-in de presença assinado.");
    await mountAssemblyPanel(slot, { communityId, meta });
    return;
  }
  if (action === "status" && ctx.isMod) {
    await updateAssemblyDecisionStatus({ communityId, assemblyId: item.convocacao.id, decisionStatus: button.dataset.status });
    share.showToast("Status pós-decisão assinado.");
    await mountAssemblyPanel(slot, { communityId, meta });
    return;
  }
  await runExportAction(action, item, ctx);
}

/**
 * Trata submissão do formulário de nova convocação+pauta.
 * @param {HTMLFormElement} form Formulário submetido.
 * @param {HTMLElement} slot Slot do painel.
 * @param {{communityId: string, meta?: object}} opts Contexto da comunidade.
 * @returns {Promise<void>}
 */
async function runPublishSubmit(form, slot, { communityId, meta }) {
  const errorEl = form.querySelector("[data-assembly-error]");
  try {
    await publishAssemblyConvocacao(readPublishForm(form, communityId));
    share.showToast("Convocação e pauta assinadas e publicadas.");
    await mountAssemblyPanel(slot, { communityId, meta });
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
    share.showToast(`Erro: ${err.message}`, "error");
  }
}

/**
 * Trata submissão do formulário de voto com prazo e `blockReason`.
 * @param {HTMLFormElement} form Formulário submetido.
 * @param {HTMLElement} slot Slot do painel.
 * @param {{communityId: string, meta?: object}} opts Contexto da comunidade.
 * @returns {Promise<void>}
 */
async function runVoteSubmit(form, slot, { communityId, meta }) {
  const errorEl = form.querySelector("[data-vote-error]");
  try {
    const ctx = await loadAssemblyContext(communityId, meta);
    const item = ctx.items.find((i) => i.convocacao.id === form.dataset.assemblyId);
    if (!item) throw new Error("Assembleia não encontrada.");
    const data = new FormData(form);
    await submitAssemblyVote({
      convocacao: item.convocacao,
      agendaId: form.dataset.agendaId,
      choice: String(data.get("choice") || ""),
      blockReason: String(data.get("blockReason") || ""),
    });
    share.showToast("Voto assinado e registrado.");
    await mountAssemblyPanel(slot, { communityId, meta });
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
    share.showToast(`Erro: ${err.message}`, "error");
  }
}

/**
 * Liga eventos delegados do Modo Assembleia em `main` e monta o painel se o slot já existir.
 * @param {HTMLElement} main Container da página da comunidade.
 * @param {{communityId: string, meta?: object}} options Contexto da comunidade.
 * @returns {void}
 */
export function bindAssemblyPanelHost(main, { communityId, meta = {} }) {
  if (!main || main.dataset.assemblyBound === communityId) return;
  main.dataset.assemblyBound = communityId;
  const initialSlot = main.querySelector("[data-assembly-slot]");
  if (initialSlot) void mountAssemblyPanel(initialSlot, { communityId, meta }).catch(() => {});
  main.addEventListener("click", (e) => {
    const button = e.target?.closest?.("[data-assembly-action]");
    const slot = button?.closest?.("[data-assembly-slot]");
    if (!button || !slot) return;
    button.disabled = true;
    void runAssemblyAction(button, slot, { communityId, meta })
      .catch((err) => share.showToast(`Erro: ${err.message}`, "error"))
      .finally(() => { button.disabled = false; });
  });
  main.addEventListener("submit", (e) => {
    const publishForm = e.target?.closest?.('[data-assembly-form="publish"]');
    const voteForm = publishForm ? null : e.target?.closest?.('[data-assembly-form="vote"]');
    const form = publishForm || voteForm;
    const slot = form?.closest?.("[data-assembly-slot]");
    if (!form || !slot) return;
    e.preventDefault();
    if (publishForm) void runPublishSubmit(form, slot, { communityId, meta });
    else void runVoteSubmit(form, slot, { communityId, meta });
  });
}
