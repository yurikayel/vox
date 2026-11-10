/**
 * @file PM-78 — caixa de saída das DMs: guarda o envelope cifrado que não saiu e reenvia
 * enquanto o app está aberto (passo 0 da mochila; spec em docs/specs/mochila-dm-v0.md).
 * Lógica pura; o transporte e o fio de mensagens chegam por dependências.
 */

export const OUTBOX_KEY = "vox-dm-outbox-v1";
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OUTBOX_MAX_ITEMS = 100;
export const OUTBOX_MAX_BYTES = 2 * 1024 * 1024;
const RELAY_BACKOFF_BASE_MS = 60 * 1000;
const RELAY_BACKOFF_MAX_MS = 30 * 60 * 1000;

function readList(storage) {
  try {
    const list = JSON.parse(storage?.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(list) ? list.filter((e) => e?.to && e?.envelope?.id) : [];
  } catch {
    return [];
  }
}

function writeList(list, storage) {
  try {
    storage?.setItem(OUTBOX_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function listOutbox(storage = globalThis.localStorage) {
  return readList(storage);
}

/** Espera antes da tentativa n no relay: 1, 2, 4… até 30 min. */
export function relayBackoffMs(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(RELAY_BACKOFF_MAX_MS, RELAY_BACKOFF_BASE_MS * 2 ** (n - 1));
}

const entryBytes = (entry) => JSON.stringify(entry).length;

/** Aplica os limites de quantidade e de tamanho: sai o mais antigo. */
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

/** Põe o envelope na caixa. Devolve os que saíram por falta de espaço (viram "Não entregue"). */
export function enqueueEnvelope(to, envelope, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!to || !envelope?.id) return { queued: false, dropped: [] };
  const list = readList(storage).filter((e) => e.envelope.id !== envelope.id);
  list.push({ to, envelope, queuedAt: now, relayAttempts: 1, nextRelayAt: now + relayBackoffMs(1) });
  const { kept, dropped } = trimOutbox(list);
  const queued = kept.some((e) => e.envelope.id === envelope.id) && writeList(kept, storage);
  return { queued, dropped };
}

/** Separa a caixa em: entregar direto, tentar o relay, vencido e esperar. */
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

async function markSafe(d, entry, status) {
  try {
    await d.markStatus(entry.to, entry.envelope.id, status);
  } catch {}
}

/**
 * Uma passada pela caixa. `d`: { storage, now(), isConnected(addr), sendDirect(addr, env) → bool,
 * pushRelay(addr, env) → Promise, markStatus(addr, id, status) }.
 */
export async function flushOutbox(d) {
  const now = d.now();
  const plan = planOutbox(readList(d.storage), { isConnected: d.isConnected, now });
  const done = new Set();
  for (const entry of [...plan.direct, ...plan.relay]) {
    const status = await deliverOne(entry, plan.direct.includes(entry), d, now);
    if (!status) continue;
    done.add(entry.envelope.id);
    await markSafe(d, entry, status);
  }
  for (const entry of plan.expired) {
    done.add(entry.envelope.id);
    await markSafe(d, entry, "failed");
  }
  const touched = new Map([...plan.direct, ...plan.relay].map((e) => [e.envelope.id, e]));
  const rest = readList(d.storage)
    .filter((e) => !done.has(e.envelope.id))
    .map((e) => touched.get(e.envelope.id) || e);
  writeList(rest, d.storage);
  return { sent: done.size - plan.expired.length, expired: plan.expired.length, waiting: rest.length };
}
