/**
 * @file Tela lazy read-first de caminho de volta POSSE (`PM-105`).
 * Abre o post original + conversa sem exigir conta, verifica assinatura offline e exibe degradação honesta.
 * @module app/screens-posse-return
 */
import * as render from "../render.js";
import * as cacheNode from "../cache-node.js";
import * as gql from "../graphql.js";
import { verifyPayload } from "../signed-verify.js";
import { classifyUploadError } from "../honest-errors.js";
import { getCachedRouteIdSync } from "../identity/index.js";
import { parsePosseReturnTarget, renderPosseReturnHtml } from "../render/posse-return.js";
import { makeShellProps } from "./context.js";
import { hasPassedCantinaGate } from "./cantina-gate.js";

/**
 * Verifica a assinatura ECDSA P-256 offline de uma publicação original (`ADR-021`).
 *
 * @param {object|null|undefined} post Publicação recuperada.
 * @param {(signed: object) => Promise<boolean>} [verifyFn=verifyPayload] Verificador criptográfico.
 * @returns {Promise<{ status: "verified" | "invalid" | "unsigned", authorRouteId?: string, reason?: string }>}
 */
export async function verifyPossePost(post, verifyFn = verifyPayload) {
  if (!post?.sig || !post?.pubKey || !post?.author) {
    return { status: "unsigned", reason: "Esta cópia chegou sem assinatura criptográfica anexada." };
  }
  const ok = await verifyFn(post);
  if (ok) {
    return { status: "verified", authorRouteId: post.author };
  }
  return {
    status: "invalid",
    authorRouteId: post.author,
    reason: "A assinatura criptográfica não confere com o conteúdo ou a chave pública.",
  };
}

/**
 * Mescla respostas locais e remotas sem duplicação por `id`.
 *
 * @param {Array<object>} localReplies Respostas residentes no aparelho.
 * @param {Array<object>} remoteReplies Respostas vindas do gateway.
 * @returns {Array<object>}
 */
function mergeReplies(localReplies, remoteReplies) {
  const seen = new Set();
  const merged = [];
  for (const item of [...localReplies, ...remoteReplies]) {
    const id = item?.id || "";
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(item);
  }
  return merged;
}

/**
 * Carrega respostas locais e tenta complementar com respostas remotas sem falhar offline.
 *
 * @param {string} topicId Identificador do tópico.
 * @param {object} deps Dependências de leitura.
 * @returns {Promise<Array<object>>}
 */
async function loadRepliesBestEffort(topicId, deps) {
  const local = await deps.getLocalPosts({ type: "reply", replyTo: topicId }).catch(() => []);
  const remoteRes = await deps.fetchReplies(topicId).catch(() => ({ items: [] }));
  return mergeReplies(Array.isArray(local) ? local : [], Array.isArray(remoteRes?.items) ? remoteRes.items : []);
}

/**
 * Consulta o tópico nos gateways remotos quando ausente no cache local.
 *
 * @param {string} topicId Identificador do tópico.
 * @param {string} communityId Comunidade opcional.
 * @param {object} deps Dependências de leitura.
 * @returns {Promise<{ status: string, post?: object, source?: object, errorKind?: string }>}
 */
async function loadRemoteTopic(topicId, communityId, deps) {
  let meta;
  try {
    meta = await deps.fetchTopicById(topicId);
  } catch (err) {
    return { status: "error", errorKind: classifyUploadError(err) || "gatewaysDown" };
  }
  if (!meta) return { status: "not-found" };
  const data = await deps.fetchTransactionData(topicId, { communityId: meta.communityId || communityId }).catch(() => ({}));
  const post = {
    ...meta,
    ...(data && typeof data === "object" ? data : {}),
    id: meta.id || topicId,
    author: data?.author || meta.author || meta.owner || "",
  };
  return { status: "ok", post, source: { kind: "gateway", label: meta.gateway || "" } };
}

/**
 * Monta dependências padrão de leitura local-first e verificação offline.
 *
 * @param {object} [overrides={}] Substituições para testes.
 * @returns {object}
 */
function buildReadDeps(overrides = {}) {
  return {
    getLocalPost: cacheNode.getLocalPost,
    getLocalPosts: cacheNode.getLocalPosts,
    fetchTopicById: gql.fetchTopicById,
    fetchTransactionData: gql.fetchTransactionData,
    fetchReplies: gql.fetchReplies,
    verifyPayload,
    hasAccount: () => Boolean(hasPassedCantinaGate() && getCachedRouteIdSync()),
    ...overrides,
  };
}

/**
 * Tenta ler o tópico do cache local antes de recorrer aos gateways remotos.
 *
 * @param {{ topicId: string, communityId: string }} target Destino validado.
 * @param {object} deps Dependências de leitura.
 * @returns {Promise<{ status: string, post?: object, source?: object, errorKind?: string }>}
 */
async function resolvePostLocalFirst(target, deps) {
  const localPost = await deps.getLocalPost(target.topicId).catch(() => null);
  if (localPost) return { status: "ok", post: localPost, source: { kind: "local" } };
  return loadRemoteTopic(target.topicId, target.communityId, deps);
}

/**
 * Resolve o estado completo da tela de retorno POSSE (local-first → gateway → degradação honesta).
 *
 * @param {{ topicId?: string, communityId?: string, rawUrl?: string }} routeParams Parâmetros da rota.
 * @param {object} [depOverrides={}] Dependências injetáveis.
 * @returns {Promise<object>} Estado pronto para {@link renderPosseReturnHtml}.
 */
export async function loadPosseReturnData(routeParams = {}, depOverrides = {}) {
  const target = parsePosseReturnTarget(routeParams);
  if (!target.ok) return { status: "invalid-link", errorReason: target.reason };
  const deps = buildReadDeps(depOverrides);
  const resolved = await resolvePostLocalFirst(target, deps);
  if (resolved.status !== "ok") {
    return { ...resolved, topicId: target.topicId, communityId: target.communityId };
  }
  const [verification, replies] = await Promise.all([
    verifyPossePost(resolved.post, deps.verifyPayload),
    loadRepliesBestEffort(target.topicId, deps),
  ]);
  return {
    status: "ok",
    topicId: target.topicId,
    communityId: resolved.post.communityId || target.communityId,
    post: resolved.post,
    source: resolved.source,
    verification,
    replies,
    hasAccount: Boolean(deps.hasAccount()),
  };
}

/**
 * Liga os controles da tela de retorno (recarregar em erro/ausência e CTA opcional de participação).
 *
 * @param {HTMLElement} container Contêiner onde o HTML foi renderizado.
 * @param {object} routeParams Parâmetros da rota atual.
 * @param {object} depOverrides Dependências opcionais.
 * @returns {void}
 */
function bindPosseReturnActions(container, routeParams, depOverrides) {
  container.querySelector("#btn-posse-retry")?.addEventListener("click", () => {
    void showPosseReturn(routeParams, depOverrides);
  });
  if (typeof depOverrides?.onParticipate === "function") {
    container.querySelector("#btn-posse-participate")?.addEventListener("click", () => {
      depOverrides.onParticipate(routeParams);
    });
  }
}

/**
 * Monta a tela read-first de caminho de volta POSSE sem exigir conta.
 *
 * @param {{ topicId?: string, communityId?: string, rawUrl?: string }} [routeParams={}] Parâmetros vindos do roteador.
 * @param {object} [depOverrides={}] Dependências opcionais (contêiner, leitor local/remoto, verificador).
 * @returns {Promise<object>} Estado final renderizado.
 */
export async function showPosseReturn(routeParams = {}, depOverrides = {}) {
  const user = typeof depOverrides.activeUser === "string" ? depOverrides.activeUser : (getCachedRouteIdSync() || "");
  const main =
    depOverrides.container ||
    render.renderShell(makeShellProps(user, "home", "Publicação"));
  if (!depOverrides.container) render.renderLoading(main);
  const state = await loadPosseReturnData(routeParams, depOverrides);
  main.innerHTML = renderPosseReturnHtml(state);
  bindPosseReturnActions(main, routeParams, depOverrides);
  return state;
}
