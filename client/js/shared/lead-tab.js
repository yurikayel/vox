/**
 * @file Eleição de aba líder e trava exclusiva entre abas (Web Locks + BroadcastChannel opcional).
 *
 * Mantém um signal reativo `isLead` backed por `navigator.locks.request` (com fallback
 * gracioso quando a API não existe) e expõe `withWebLock` para serializar operações entre abas.
 *
 * @module shared/lead-tab
 */

import { signal } from "./signals.js";
import { randomBase36 } from "./html.js";

const DEFAULT_LOCK_NAME = "vox-lead-tab-v0";
const MSG_VERSION = 1;

/**
 * Monta o objeto de opções aceito por `LockManager.request` com apenas campos definidos.
 * @param {object} [opts={}] Opções do chamador.
 * @returns {object} Opções normalizadas do Web Lock.
 */
function buildLockOptions(opts = {}) {
  const out = { mode: opts?.mode === "shared" ? "shared" : "exclusive" };
  if (typeof opts?.ifAvailable === "boolean") out.ifAvailable = opts.ifAvailable;
  if (typeof opts?.steal === "boolean") out.steal = opts.steal;
  if (opts?.signal) out.signal = opts.signal;
  return out;
}

/**
 * Executa `fn` sob uma trava Web Lock quando `navigator.locks` existe; sem a API, executa direto.
 * @template T
 * @param {string} name Nome canônico da trava entre abas.
 * @param {(lock: object|null) => (T|Promise<T>)} fn Trabalho a serializar.
 * @param {object} [opts={}] Opções (`mode`, `ifAvailable`, `steal`, `signal`, `locks`).
 * @returns {Promise<T>} Resultado de `fn`.
 * @throws {TypeError} Se `name` não for string não vazia ou `fn` não for função.
 */
export async function withWebLock(name, fn, opts = {}) {
  if (typeof name !== "string" || !name) throw new TypeError("lead-tab: name obrigatório");
  if (typeof fn !== "function") throw new TypeError("lead-tab: fn obrigatória");
  const locks = opts?.locks !== undefined ? opts.locks : globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== "function") return fn(null);
  return locks.request(name, buildLockOptions(opts), (lock) => fn(lock));
}

/**
 * Gera um identificador curto desta instância de aba.
 * @returns {string} Identificador único local.
 */
function makeTabId() {
  return `${Date.now().toString(36)}_${randomBase36(8)}`;
}

/**
 * Abre um `BroadcastChannel` opcional sem falhar em ambientes restritos.
 * @param {typeof BroadcastChannel|undefined} BC Construtor de canal.
 * @param {string|null|false} channelName Nome do canal ou falso/nulo para desativar.
 * @param {(data: object) => void} onMessage Handler de mensagens válidas de outras abas.
 * @returns {BroadcastChannel|null} Canal aberto ou `null`.
 */
function openChannel(BC, channelName, onMessage) {
  if (typeof BC !== "function" || !channelName) return null;
  try {
    const channel = new BC(channelName);
    channel.onmessage = (ev) => {
      if (ev?.data && typeof ev.data === "object") onMessage(ev.data);
    };
    return channel;
  } catch {
    return null;
  }
}

/**
 * Envia evento no canal entre abas ignorando falhas de canal fechado.
 * @param {BroadcastChannel|null} channel Canal ativo.
 * @param {object} payload Mensagem estruturada.
 * @returns {void}
 */
function postChannel(channel, payload) {
  try {
    channel?.postMessage(payload);
  } catch {}
}

/**
 * Notifica alteração no estado de liderança sem repetir eventos idênticos.
 * @param {object} ctx Contexto interno da eleição.
 * @param {boolean} next Novo estado de liderança.
 * @returns {void}
 */
function setLeadState(ctx, next) {
  if (ctx.isLeadSig.peek() === next) return;
  ctx.isLeadSig.set(next);
  if (typeof ctx.onChange === "function") ctx.onChange(next);
}

/**
 * Mantém a trava Web Lock aberta até `stop()` ser chamado.
 * @param {object} ctx Contexto interno da eleição.
 * @returns {Promise<void>} Promessa que segura o lock enquanto ativa.
 */
function holdLeadershipLock(ctx) {
  if (ctx.stopped) return Promise.resolve();
  return new Promise((resolve) => {
    ctx.release = resolve;
    setLeadState(ctx, true);
    postChannel(ctx.channel, {
      v: MSG_VERSION,
      kind: "lead",
      lockName: ctx.lockName,
      tabId: ctx.tabId,
    });
  });
}

/**
 * Encerra a participação na eleição, libera o Web Lock e fecha o canal.
 * @param {object} ctx Contexto interno da eleição.
 * @returns {void}
 */
function stopLeadership(ctx) {
  if (ctx.stopped) return;
  ctx.stopped = true;
  const wasLead = ctx.isLeadSig.peek();
  setLeadState(ctx, false);
  if (wasLead) postChannel(ctx.channel, { v: MSG_VERSION, kind: "release", lockName: ctx.lockName, tabId: ctx.tabId });
  try { ctx.channel?.close?.(); } catch {}
  ctx.channel = null;
  ctx.release?.();
  ctx.release = null;
}

/**
 * Inicia a disputa pelo Web Lock de liderança ou promove imediatamente sem a API.
 * @param {object} ctx Contexto interno da eleição.
 * @param {object|null|undefined} locks Gerenciador de travas.
 * @returns {void}
 */
function beginElection(ctx, locks) {
  if (!locks || typeof locks.request !== "function") {
    setLeadState(ctx, true);
    return;
  }
  void Promise.resolve(locks.request(ctx.lockName, { mode: "exclusive" }, () => holdLeadershipLock(ctx))).catch(() => {
    if (!ctx.stopped) setLeadState(ctx, false);
  });
}

/**
 * Monta o contexto interno e abre o canal opcional de notificações entre abas.
 * @param {object} opts Opções do chamador.
 * @returns {object} Contexto inicializado.
 */
function buildLeadContext(opts) {
  const lockName = typeof opts?.lockName === "string" && opts.lockName ? opts.lockName : DEFAULT_LOCK_NAME;
  const tabId = typeof opts?.tabId === "string" && opts.tabId ? opts.tabId : makeTabId();
  const BC = opts?.BroadcastChannel !== undefined ? opts.BroadcastChannel : globalThis.BroadcastChannel;
  const channelName = opts?.channelName === undefined ? `${lockName}-bc` : opts.channelName;
  const onPeerEvent = typeof opts?.onPeerEvent === "function" ? opts.onPeerEvent : null;
  const ctx = {
    lockName,
    tabId,
    isLeadSig: signal(false),
    onChange: typeof opts?.onChange === "function" ? opts.onChange : null,
    channel: null,
    release: null,
    stopped: false,
  };
  ctx.channel = openChannel(BC, channelName, (data) => {
    if (data.v === MSG_VERSION && data.lockName === lockName && data.tabId !== tabId && onPeerEvent) {
      onPeerEvent(data);
    }
  });
  return ctx;
}

/**
 * Cria um controlador reativo de aba líder baseado em Web Locks e BroadcastChannel opcional.
 * @param {object} [opts={}] Configurações da eleição.
 * @param {string} [opts.lockName="vox-lead-tab-v0"] Nome da trava exclusiva no `LockManager`.
 * @param {string|null|false} [opts.channelName] Nome do `BroadcastChannel` (padrão `${lockName}-bc`; `null` desativa).
 * @param {object|null} [opts.locks] `LockManager` injetável (padrão `globalThis.navigator?.locks`).
 * @param {typeof BroadcastChannel|null} [opts.BroadcastChannel] Construtor de canal injetável.
 * @param {string} [opts.tabId] Identificador desta aba (opcional, gerado automaticamente).
 * @param {(isLead: boolean) => void} [opts.onChange] Callback chamado ao ganhar ou perder liderança.
 * @param {(event: object) => void} [opts.onPeerEvent] Callback chamado ao receber evento de outra aba via canal.
 * @param {{ onCleanup?: (fn: () => void) => void }|null} [opts.scope] Escopo opcional para `stop` automático.
 * @returns {{ isLead: { get: () => boolean, peek: () => boolean }, get: () => boolean, peek: () => boolean, stop: () => void, dispose: () => void, tabId: string }} Controlador reativo de liderança.
 */
export function createLeadTabSignal(opts = {}) {
  const ctx = buildLeadContext(opts);
  const locks = opts?.locks !== undefined ? opts.locks : globalThis.navigator?.locks;
  const stop = () => stopLeadership(ctx);
  if (opts?.scope?.onCleanup) opts.scope.onCleanup(stop);
  beginElection(ctx, locks);
  return {
    isLead: { get: ctx.isLeadSig.get, peek: ctx.isLeadSig.peek },
    get: ctx.isLeadSig.get,
    peek: ctx.isLeadSig.peek,
    stop,
    dispose: stop,
    tabId: ctx.tabId,
  };
}

/**
 * Alias de {@link createLeadTabSignal} para criar um signal reativo de aba líder.
 * @param {object} [opts={}] Configurações da eleição.
 * @returns {{ isLead: { get: () => boolean, peek: () => boolean }, get: () => boolean, peek: () => boolean, stop: () => void, dispose: () => void, tabId: string }} Controlador reativo de liderança.
 */
export function leadTabSignal(opts = {}) {
  return createLeadTabSignal(opts);
}
