/**
 * @file PM-78 — caixa de saída das DMs: guarda o envelope cifrado que não saiu e reenvia
 * enquanto o app está aberto (passo 0 da mochila; spec em docs/specs/mochila-dm-v0.md).
 * Lógica pura; o transporte e o fio de mensagens chegam por dependências.
 */

import { createLeadTabSignal, withWebLock } from "./shared/lead-tab.js";

/** Chave em `localStorage` (só neste aparelho). @type {string} */
export const OUTBOX_KEY = "vox-dm-outbox-v1";
/** Trava Web Lock para serializar o repasse da caixa de saída entre abas. @type {string} */
export const OUTBOX_LOCK_NAME = "vox-dm-outbox-v0";
/** Trava de eleição da aba líder para o poll periódico da caixa de saída. @type {string} */
export const OUTBOX_LEAD_LOCK = "vox-dm-outbox-lead-v0";
/** Limite ou intervalo em milissegundos. @type {*} */
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Limite numérico do módulo. @type {number} */
export const OUTBOX_MAX_ITEMS = 100;
/** Limite numérico do módulo. @type {*} */
export const OUTBOX_MAX_BYTES = 2 * 1024 * 1024;
const RELAY_BACKOFF_BASE_MS = 60 * 1000;
const RELAY_BACKOFF_MAX_MS = 30 * 60 * 1000;

/** Caixa ilegível: guarda o texto original à parte antes que a próxima gravação o apague. */
function setAsideUnreadable(storage, raw) {
  try {
    storage?.setItem(`${OUTBOX_KEY}-ilegivel`, raw);
  } catch {}
}

/**
 * Lê a fila de saída do armazenamento; se falhar, devolve lista vazia.
 * @param {Storage|null} storage Armazenamento
 * @returns {object[]} Fila lida.
 */
function readList(storage) {
  let raw = null;
  try {
    raw = storage?.getItem(OUTBOX_KEY) || "[]";
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list.filter((e) => e?.to && e?.envelope?.id);
  } catch {}
  if (raw !== null) setAsideUnreadable(storage, raw);
  return [];
}

/**
 * Grava a fila de saída no armazenamento.
 * @param {object[]} list Fila
 * @param {Storage|null} storage Armazenamento
 * @returns {boolean} `true` se gravou.
 */
function writeList(list, storage) {
  try {
    storage?.setItem(OUTBOX_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Operação `listOutbox` do módulo.
 * @param {*} [storage] Armazenamento injetável.
 * @returns {*} Resultado da operação.
 */
export function listOutbox(storage = globalThis.localStorage) {
  return readList(storage);
}

/** Espera antes da tentativa n no relay: 1, 2, 4… até 30 min. 
 * @param {*} [attempts] Número da tentativa (a partir de 1).
 * @returns {*} Resultado da operação.*/
export function relayBackoffMs(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(RELAY_BACKOFF_MAX_MS, RELAY_BACKOFF_BASE_MS * 2 ** (n - 1));
}

/**
 * Tamanho aproximado de uma entrada, em caracteres do JSON.
 * @param {object} entry Entrada da fila
 * @returns {number} Tamanho.
 */
const entryBytes = (entry) => JSON.stringify(entry).length;

/** Aplica os limites de quantidade e de tamanho: sai o mais antigo. 
 * @param {*} [list] Lista em memória.
 * @returns {*} Resultado da operação.*/
export function trimOutbox(list) {
  const kept = [...list].sort((a, b) => a.queuedAt - b.queuedAt);
  const dropped = [];
  let bytes = kept.reduce((sum, e) => sum + entryBytes(e), 0);
  while (kept.length && (kept.length > OUTBOX_MAX_ITEMS || bytes > OUTBOX_MAX_BYTES)) {
    const oldest = kept.shift();
    bytes -= entryBytes(oldest);
    dropped.push(oldest);
  }
  return { kept, dropped };
}

/** Põe o envelope na caixa. Devolve os que saíram por falta de espaço (viram "Não entregue"). 
 * @param {*} [to] Destinatário (endereço ou rota).
 * @param {*} [envelope] Envelope cifrado da DM.
 * @param {object} [opts] `storage` e `now` opcionais.
 * @returns {*} Resultado da operação.*/
export function enqueueEnvelope(to, envelope, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!to || !envelope?.id) return { queued: false, dropped: [] };
  const list = readList(storage).filter((e) => e.envelope.id !== envelope.id);
  list.push({ to, envelope, queuedAt: now, relayAttempts: 1, nextRelayAt: now + relayBackoffMs(1) });
  const { kept, dropped } = trimOutbox(list);
  const queued = kept.some((e) => e.envelope.id === envelope.id) && writeList(kept, storage);
  return { queued, dropped };
}

/** Separa a caixa em: entregar direto, tentar o relay, vencido e esperar. 
 * @param {*} [list] Lista em memória.
 * @param {object} [ctx] `isConnected` e `now` para planejar envios.
 * @returns {*} Resultado da operação.*/
export function planOutbox(list, { isConnected, now }) {
  const plan = { direct: [], relay: [], expired: [], wait: [] };
  for (const e of list) {
    if (now - e.queuedAt > OUTBOX_MAX_AGE_MS) plan.expired.push(e);
    else if (isConnected(e.to)) plan.direct.push(e);
    else if (now >= e.nextRelayAt) plan.relay.push(e);
    else plan.wait.push(e);
  }
  return plan;
}

/**
 * Tenta entregar uma entrada, direto ou pelo relay.
 * @param {object} entry Entrada da fila
 * @param {boolean} direct Se há canal direto
 * @param {object} d Dependências de entrega
 * @param {number} now Agora (ms)
 * @returns {Promise<string>} Resultado da entrega.
 */
async function deliverOne(entry, direct, d, now) {
  if (direct && d.sendDirect(entry.to, entry.envelope)) return "delivered";
  try {
    await d.pushRelay(entry.to, entry.envelope);
    return "queued-relay";
  } catch {
    entry.relayAttempts += 1;
    entry.nextRelayAt = now + relayBackoffMs(entry.relayAttempts);
    return "";
  }
}

/**
 * Atualiza o estado da mensagem sem deixar o erro subir.
 * @param {object} d Dependências
 * @param {object} entry Entrada da fila
 * @param {string} status Novo estado
 * @returns {Promise<boolean>} `true` se atualizou.
 */
async function markSafe(d, entry, status) {
  try {
    await d.markStatus(entry.to, entry.envelope.id, status);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executa uma passada pela caixa de saída sobre o armazenamento injetado.
 * @param {object} d Dependências de armazenamento e transporte.
 * @returns {Promise<{ sent: number, expired: number, waiting: number }>} Resumo da passada.
 */
async function runFlushOutbox(d) {
  const now = d.now();
  const plan = planOutbox(readList(d.storage), { isConnected: d.isConnected, now });
  const done = new Set();
  for (const entry of [...plan.direct, ...plan.relay]) {
    const status = await deliverOne(entry, plan.direct.includes(entry), d, now);
    if (!status) continue;
    done.add(entry.envelope.id);
    await markSafe(d, entry, status);
  }
  let expired = 0;
  for (const entry of plan.expired) {
    // Sem a marca "Não entregue" a mensagem sumiria sem aviso: fica na caixa e tenta marcar na próxima passada.
    if (!(await markSafe(d, entry, "failed"))) continue;
    done.add(entry.envelope.id);
    expired += 1;
  }
  const touched = new Map([...plan.direct, ...plan.relay].map((e) => [e.envelope.id, e]));
  const rest = readList(d.storage)
    .filter((e) => !done.has(e.envelope.id))
    .map((e) => touched.get(e.envelope.id) || e);
  writeList(rest, d.storage);
  return { sent: done.size - expired, expired, waiting: rest.length };
}

/**
 * Uma passada pela caixa, serializada entre abas via Web Locks quando disponível.
 * `d`: `{ storage, now(), isConnected(addr), sendDirect(addr, env) → bool, pushRelay(addr, env) → Promise, markStatus(addr, id, status) }`.
 *
 * @param {object} d Dependências da caixa de saída.
 * @returns {Promise<{ sent: number, expired: number, waiting: number }>} Resumo da passada.
 */
export function flushOutbox(d) {
  return withWebLock(OUTBOX_LOCK_NAME, () => runFlushOutbox(d), { locks: d?.locks });
}

/**
 * Inicia um agendador periódico da caixa de saída em que só a aba líder dispara o tick automático.
 * Envios manuais (`flushNow`) e WebRTC continuam funcionando em qualquer aba.
 *
 * @param {() => (void|Promise<unknown>)} tickFn Rotina de repasse executada nos ticks da aba líder.
 * @param {object} [opts={}] Opções do agendador.
 * @param {number} [opts.intervalMs=20000] Intervalo do tick automático em ms.
 * @param {Window|typeof globalThis} [opts.win=globalThis] Alvo com `setInterval`/`clearInterval`.
 * @param {string} [opts.lockName=OUTBOX_LEAD_LOCK] Nome da trava de liderança.
 * @param {object} [opts.locks] `LockManager` injetável para testes.
 * @param {typeof BroadcastChannel} [opts.BroadcastChannel] Construtor `BroadcastChannel` injetável.
 * @returns {{ isLead: { get: () => boolean, peek: () => boolean }, flushNow: () => (void|Promise<unknown>), stop: () => void }} Controlador do agendador.
 */
export function createOutboxLeadPoll(tickFn, opts = {}) {
  if (typeof tickFn !== "function") throw new TypeError("dm-outbox: tickFn obrigatória");
  const win = opts.win !== undefined ? opts.win : globalThis;
  const intervalMs = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 20_000;
  const lead = createLeadTabSignal({
    lockName: opts.lockName || OUTBOX_LEAD_LOCK,
    locks: opts.locks,
    BroadcastChannel: opts.BroadcastChannel,
    channelName: opts.channelName,
    scope: opts.scope,
  });
  const timerId = typeof win?.setInterval === "function"
    ? win.setInterval(() => {
      if (lead.isLead.peek()) void tickFn();
    }, intervalMs)
    : null;
  const stop = () => {
    if (timerId !== null) win?.clearInterval?.(timerId);
    lead.stop();
  };
  return { isLead: lead.isLead, flushNow: () => tickFn(), stop };
}
