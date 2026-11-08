/**
 * LAN-08 — kill-switch por configuração, sem servidor.
 * `client/config/flags.json` é servido pelo Pages e lido a cada abertura do app (sem cache do SW).
 * Num incidente, o operador muda o JSON e faz deploy: na próxima recarga o cliente obedece.
 * Offline, vale o último estado lido (localStorage); sem nada lido, valem os padrões (tudo ligado).
 * Runbook: docs/backlog-lancamento-publico-2026-11.md (LAN-08, LAN-24).
 */

export const FLAGS_URL = "./config/flags.json";
const STORAGE_KEY = "vox-remote-flags-v1";
const MAX_NOTICE_LEN = 280;

export const FLAG_DEFAULTS = Object.freeze({
  arweaveUpload: true,
  feira: true,
  pixZaps: true,
  communityCreate: true,
});

const DISABLED_MESSAGES_PT = Object.freeze({
  arweaveUpload: "Publicar no Arweave está pausado pela equipe do Vox por segurança. Tente de novo mais tarde.",
  feira: "A Feira está pausada pela equipe do Vox por segurança. Tente de novo mais tarde.",
  pixZaps: "Os Pix Zaps estão pausados pela equipe do Vox por segurança.",
  communityCreate: "Criar comunidades está pausado pela equipe do Vox por segurança.",
});

let current = { flags: { ...FLAG_DEFAULTS }, notice: "" };

export class FeatureDisabledError extends Error {
  constructor(name) {
    super(disabledMessage(name));
    this.name = "FeatureDisabledError";
    this.flag = name;
  }
}

/** Aceita só chaves conhecidas com valor booleano e um aviso curto em texto. */
export function sanitizeFlags(raw) {
  const flags = { ...FLAG_DEFAULTS };
  const src = raw && typeof raw === "object" ? raw.flags || raw : {};
  for (const key of Object.keys(FLAG_DEFAULTS)) {
    if (typeof src[key] === "boolean") flags[key] = src[key];
  }
  const notice = typeof raw?.notice === "string" ? raw.notice.trim().slice(0, MAX_NOTICE_LEN) : "";
  return { flags, notice };
}

export function applyFlags(raw) {
  current = sanitizeFlags(raw);
  return getFlags();
}

export function getFlags() {
  return { flags: { ...current.flags }, notice: current.notice };
}

export function isFeatureEnabled(name) {
  return current.flags[name] !== false;
}

export function disabledMessage(name) {
  return DISABLED_MESSAGES_PT[name] || "Este recurso está pausado pela equipe do Vox.";
}

export function assertFeatureEnabled(name) {
  if (!isFeatureEnabled(name)) throw new FeatureDisabledError(name);
}

function readCached() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCached(state) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Carrega flags remotas; falha de rede mantém o último estado conhecido. */
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
