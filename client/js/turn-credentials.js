/**
 * @file REV-10 — credenciais TURN temporárias, pedidas ao Worker (`workers/turn`) só quando preciso:
 * depois de uma conexão direta que falhou, ou no modo "só TURN". Ficam só em memória até vencer.
 * Erro, teto do mês ou limite por IP: espera antes de pedir de novo e o app segue sem TURN.
 */

/** Margem antes do vencimento: credencial que vence em menos que isso já não é usada. */
export const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
/** Espera depois de falha de rede ou resposta estranha. */
export const RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
/** Espera máxima pedida pelo Worker (`Retry-After`) que o app respeita. */
export const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

const ICE_URL = /^(turns?|stun):/i;

/**
 * Só entradas com URLs `turn:`/`turns:`/`stun:` e usuário/senha em texto; o resto é descartado.
 * @param {any} list
 * @returns {Array<{ urls: string[], username?: string, credential?: string }>}
 */
export function sanitizeIceServers(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const urls = [].concat(s?.urls || []).filter((u) => typeof u === "string" && ICE_URL.test(u));
    if (!urls.length) continue;
    const entry = { urls };
    if (typeof s.username === "string") entry.username = s.username;
    if (typeof s.credential === "string") entry.credential = s.credential;
    out.push(entry);
  }
  return out;
}

function retryDelay(res) {
  const seconds = Number(res?.headers?.get?.("Retry-After"));
  if (!Number.isFinite(seconds) || seconds <= 0) return RETRY_AFTER_ERROR_MS;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * Um pedido ao Worker: credenciais válidas e a vida delas, ou quanto esperar antes de pedir de novo.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ servers: Array<object>, ttlMs: number } | { servers: null, retryMs: number }>}
 */
export async function fetchCredentials(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { method: "GET", cache: "no-store", credentials: "omit" });
    if (!res.ok) return { servers: null, retryMs: retryDelay(res) };
    const body = await res.json();
    const servers = sanitizeIceServers(body?.iceServers);
    const ttlMs = Number(body?.ttl) * 1000;
    if (servers.length && ttlMs > EXPIRY_MARGIN_MS) return { servers, ttlMs };
  } catch {
    /* rede ou JSON: cai na espera padrão */
  }
  return { servers: null, retryMs: RETRY_AFTER_ERROR_MS };
}

/**
 * Fonte de credenciais para um Worker. `current()` é síncrono (para montar o RTCPeerConnection);
 * `get()` pede ao Worker se não houver credencial válida e não estiver esperando.
 * @param {{ url: string, fetchImpl?: typeof fetch, now?: () => number }} opts
 * @returns {{ current: () => Array<object>, get: () => Promise<Array<object>> }}
 */
export function createTurnCredentials({ url, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now() }) {
  let servers = [];
  let expiresAt = 0;
  let waitUntil = 0;
  let inFlight = null;

  const current = () => (now() < expiresAt - EXPIRY_MARGIN_MS ? servers : []);

  async function request() {
    const got = await fetchCredentials(url, fetchImpl);
    if (!got.servers) {
      waitUntil = now() + got.retryMs;
      return [];
    }
    servers = got.servers;
    expiresAt = now() + got.ttlMs;
    return servers;
  }

  async function get() {
    if (current().length) return servers;
    if (now() < waitUntil) return [];
    inFlight ||= request().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return { current, get };
}

/**
 * Uma conexão falhou sem TURN: busca credencial e reconecta esse par uma vez nesta sessão.
 * @param {{ current: Function, get: Function } | null} source
 * @param {string} peerKey
 * @param {{ retried: Set<string>, hadTurn: boolean, reconnect: (peerKey: string) => void }} opts
 *   `hadTurn`: a conexão que falhou já tinha TURN (então não há o que tentar); `reconnect` só roda com credencial
 * @returns {Promise<boolean>} se pediu a reconexão
 */
export async function retryOnceViaTurn(source, peerKey, { retried, hadTurn, reconnect }) {
  if (!source || hadTurn || retried.has(peerKey)) return false;
  retried.add(peerKey);
  const servers = await source.get();
  if (!servers.length) return false;
  reconnect(peerKey);
  return true;
}

/**
 * O que o WebRTC precisa do TURN, num objeto só: credenciais para o ICE, a nova tentativa depois de falha
 * e o pedido antecipado do modo "só TURN". Sem `turnCredentialsUrl` (https) na configuração, não faz nada.
 * @param {{ getUrl: () => string | undefined, reconnect: (peerKey: string) => void, fetchImpl?: typeof fetch }} deps
 * @returns {{ iceServers: () => Array<object>, onFailed: (peerKey: string, hadTurn: boolean) => Promise<boolean>, prefetch: () => Promise<Array<object>> }}
 */
export function createTurnFallback({ getUrl, reconnect, fetchImpl }) {
  let source = null;
  const retried = new Set();
  const sourceFor = () => {
    const url = getUrl();
    if (!source && typeof url === "string" && url.startsWith("https://")) source = createTurnCredentials({ url, fetchImpl });
    return source;
  };
  return {
    iceServers: () => sourceFor()?.current() || [],
    onFailed: (peerKey, hadTurn) => retryOnceViaTurn(sourceFor(), peerKey, { retried, hadTurn, reconnect }),
    prefetch: async () => (await sourceFor()?.get()) || [],
  };
}
