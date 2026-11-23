/**
 * @file Kill-switch de recursos por `client/config/flags.json` (LAN-08).
 *
 * Lê flags remotas a cada abertura; offline usa cache em `localStorage` ou padrões.
 * @see docs/strategy/backlog-lancamento-publico-2026-11.md (LAN-08, LAN-24)
 */

/** URL relativa do JSON de flags servido pelo Pages. @type {string} */
export const FLAGS_URL = "./config/flags.json";
const STORAGE_KEY = "vox-remote-flags-v1";
const MAX_NOTICE_LEN = 280;

/** Valores padrão quando não há config remota nem cache. @type {Readonly<object>} */
export const FLAG_DEFAULTS = Object.freeze({
  arweaveUpload: false,
  feira: true,
  pixZaps: true,
  communityCreate: true,
});

const DISABLED_MESSAGES_PT = Object.freeze({
  arweaveUpload: "Gravar no Arweave está pausado por enquanto — tudo circula pela rede de seguidores.",
  feira: "A Feira está pausada pela equipe do Vox por segurança. Tente de novo mais tarde.",
  pixZaps: "Os Pix Zaps estão pausados pela equipe do Vox por segurança.",
  communityCreate: "Criar comunidades está pausado pela equipe do Vox por segurança.",
});

let current = { flags: { ...FLAG_DEFAULTS }, notice: "", electoralMode: false };

/**
 * Erro lançado ao usar recurso desligado pelo kill-switch.
 */
export class FeatureDisabledError extends Error {
  /**
   * Cria o erro de recurso desligado.
   * @param {string} name Nome da flag
   */
  constructor(name) {
    super(disabledMessage(name));
    this.name = "FeatureDisabledError";
    this.flag = name;
  }
}

/**
 * Sanitiza payload remoto: só chaves conhecidas, aviso curto e flag eleitoral.
 * @param {object|null} raw JSON bruto ou envelope `{ flags }`.
 * @returns {{ flags: object, notice: string, electoralMode: boolean }}
 */
export function sanitizeFlags(raw) {
  const flags = { ...FLAG_DEFAULTS };
  const src = raw && typeof raw === "object" ? raw.flags || raw : {};
  for (const key of Object.keys(FLAG_DEFAULTS)) {
    if (typeof src[key] === "boolean") flags[key] = src[key];
  }
  const notice = typeof raw?.notice === "string" ? raw.notice.trim().slice(0, MAX_NOTICE_LEN) : "";
  // REV-24: força o modo eleitoral fora da janela automática (não é kill-switch).
  const electoralMode = raw?.electoralMode === true;
  return { flags, notice, electoralMode };
}

/**
 * Aplica flags sanitizadas ao estado em memória.
 * @param {object|null} raw Payload remoto ou cache.
 * @returns {{ flags: object, notice: string }}
 */
export function applyFlags(raw) {
  current = sanitizeFlags(raw);
  return getFlags();
}

/**
 * Snapshot atual das flags e aviso operacional.
 * @returns {{ flags: object, notice: string }}
 */
export function getFlags() {
  return { flags: { ...current.flags }, notice: current.notice };
}

/**
 * Indica modo eleitoral forçado via config (REV-24).
 * @returns {boolean}
 */
export function isElectoralModeForced() {
  return current.electoralMode === true;
}

/**
 * Verifica se a flag nomeada está habilitada.
 * @param {string} name Chave em {@link FLAG_DEFAULTS}.
 * @returns {boolean}
 */
export function isFeatureEnabled(name) {
  return current.flags[name] !== false;
}

/**
 * Mensagem em português para recurso pausado.
 * @param {string} name Chave da flag.
 * @returns {string}
 */
export function disabledMessage(name) {
  return DISABLED_MESSAGES_PT[name] || "Este recurso está pausado pela equipe do Vox.";
}

/**
 * Lança {@link FeatureDisabledError} se a flag estiver desligada.
 * @param {string} name Chave da flag.
 * @returns {void}
 * @throws {FeatureDisabledError}
 */
export function assertFeatureEnabled(name) {
  if (!isFeatureEnabled(name)) throw new FeatureDisabledError(name);
}

/**
 * Lê o estado das flags guardado no `localStorage`.
 * @returns {object|null} Estado guardado, ou `null`.
 */
function readCached() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Grava o estado das flags no `localStorage`; se falhar, segue sem gravar.
 * @param {object} state Estado
 */
function writeCached(state) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Busca flags remotas; falha de rede mantém o último estado conhecido.
 * @param {object} [options={}]
 * @param {typeof fetch} [options.fetchFn=globalThis.fetch] Função HTTP.
 * @param {number} [options.timeoutMs=2500] Tempo máximo da requisição em ms.
 * @returns {Promise<{ flags: object, notice: string }>}
 */
export async function loadRemoteFlags({ fetchFn = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const cached = readCached();
  if (cached) applyFlags(cached);
  if (typeof fetchFn !== "function") return getFlags();
  try {
    const res = await Promise.race([
      fetchFn(FLAGS_URL, { cache: "no-store" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (!res?.ok) return getFlags();
    const state = applyFlags(await res.json());
    writeCached(state);
  } catch {}
  return getFlags();
}