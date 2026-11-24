/**
 * @file Sincroniza conta e rota entre abas do mesmo origin (BroadcastChannel + evento `storage`).
 * Outras abas recarregam a identidade do `localStorage` sem criar conta nova.
 * @module identity/tab-sync
 */

import { randomBase36 } from "../shared/html.js";
import { withWebLock } from "../shared/lead-tab.js";

const CHANNEL_NAME = "vox-tab-sync-v0";
const MSG_VERSION = 1;
const ACCOUNT_STORAGE = "vox-local-account-v1";

/** Web Lock entre abas: só uma cria conta nova por vez (LT-06a; complementa LT-06c). */
export const LOCAL_ACCOUNT_CREATE_LOCK = "vox-local-account-create-v0";

const IDENTITY_KEYS = new Set([
  ACCOUNT_STORAGE,
  "vox-accounts-vault-v1",
  "vox-display-name",
  "vox-profile-enrichment-v1",
  "vox-pix-key-v1",
  "vox-dm-keypair",
]);

let tabId = "";
let channel = null;
let started = false;
let onReload = null;
let applyingRemoteRoute = false;
/** @type {Window} */
let boundWin = globalThis.window;

/**
 * Nome do canal entre abas (testes e diagnóstico).
 * @type {string}
 */
export const TAB_SYNC_CHANNEL = CHANNEL_NAME;

/**
 * Serializa criação de conta entre abas via Web Locks; sem API, executa direto.
 * @template T
 * @param {() => Promise<T>} work criação ou leitura pós-lock
 * @returns {Promise<T>}
 */
export function withLocalAccountCreationLock(work) {
  return withWebLock(LOCAL_ACCOUNT_CREATE_LOCK, work);
}

/**
 * Lê o `routeId` da conta ativa gravada no `localStorage`.
 * @param {Storage} [storage] área de armazenamento (padrão: `localStorage`)
 * @returns {string} `vx_…` ou ""
 */
export function readStoredRouteId(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ACCOUNT_STORAGE);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.routeId === "string" ? parsed.routeId : "";
  } catch {
    return "";
  }
}

/**
 * Alinha o cache em memória com a conta em `localStorage` (troca ou recarga; não gera conta se já houver dados).
 * @param {{ localAccount?: object, storage?: Storage }} [deps] injeção para testes
 * @returns {Promise<{ adopted: boolean, routeId: string }>}
 */
export async function reloadIdentityFromStorage(deps = {}) {
  const localAccount = deps.localAccount || (await import("./index.js"));
  const storage = deps.storage || globalThis.localStorage;
  const stored = readStoredRouteId(storage);
  const cached = localAccount.getCachedRouteIdSync();

  if (!stored) {
    await localAccount.wipeLocalAccount();
    return { adopted: false, routeId: "" };
  }

  if (stored !== cached) {
    const switched = await localAccount.switchActiveAccount(stored);
    if (!switched) await localAccount.ensureLocalAccount();
  } else {
    await localAccount.ensureLocalAccount();
  }
  return { adopted: true, routeId: localAccount.getCachedRouteIdSync() };
}

/**
 * Gera o identificador desta aba.
 *
 * @returns {string}
 */
function randomTabId() {
  return `${Date.now().toString(36)}_${randomBase36(8)}`;
}

/**
 * Avisa as outras abas da rota atual.
 *
 * @param {string} hash
 */
function postRoute(hash) {
  try {
    channel?.postMessage({ v: MSG_VERSION, kind: "route", tabId, hash });
  } catch {}
}

/**
 * Navega esta aba para a rota anunciada por outra, se for diferente.
 *
 * @param {string} hash
 * @param {Window} win
 */
function applyRemoteHash(hash, win) {
  const next = String(hash || "#/");
  const cur = win?.location?.hash || "#/";
  if (next === cur) return;
  applyingRemoteRoute = true;
  try {
    win.location.hash = next.startsWith("#") ? next : `#${next}`;
  } finally {
    queueMicrotask(() => {
      applyingRemoteRoute = false;
    });
  }
}

/**
 * Trata mensagem do canal entre abas (rota ou identidade).
 *
 * @param {object} data
 * @returns {Promise<void>}
 */
async function onChannelMessage(data) {
  if (!data || data.v !== MSG_VERSION || data.tabId === tabId) return;
  if (data.kind === "route" && data.hash) {
    applyRemoteHash(data.hash, boundWin);
    onReload?.({ reason: "route" });
    return;
  }
  if (data.kind === "identity") {
    await reloadIdentityFromStorage();
    onReload?.({ reason: "identity" });
  }
}

/**
 * Recarrega a identidade quando outra aba muda uma chave de identidade.
 *
 * @param {StorageEvent} ev
 * @param {Storage} storage
 */
function onStorageEvent(ev, storage) {
  if (ev.storageArea !== storage) return;
  if (ev.key && !IDENTITY_KEYS.has(ev.key)) return;
  void reloadIdentityFromStorage({ storage }).then(() => onReload?.({ reason: "identity" }));
}

/**
 * Liga escuta entre abas: `storage` para conta e BroadcastChannel para hash de rota.
 * @param {{ onReload?: (ctx: { reason: "identity"|"route" }) => void, win?: Window, storage?: Storage }} [opts]
 * @returns {void}
 */
export function startTabSync({ onReload: reloadFn, win = globalThis.window, storage = globalThis.localStorage } = {}) {
  if (started) return;
  started = true;
  onReload = reloadFn;
  boundWin = win;
  tabId = randomTabId();

  const BC = win?.BroadcastChannel;
  if (BC) {
    channel = new BC(CHANNEL_NAME);
    channel.onmessage = (ev) => void onChannelMessage(ev?.data);
    win.addEventListener("hashchange", () => {
      if (applyingRemoteRoute) return;
      postRoute(win.location?.hash || "#/");
    });
  }

  win?.addEventListener?.("storage", (ev) => onStorageEvent(ev, storage));
}