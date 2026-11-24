/**
 * @file Sincronização com servidor de memória central (push/pull e hidratação): fachada com o ciclo e o envio.
 *
 * As partes moram em `central-memory-urls.js` (endereços e transporte), `central-memory-bundle.js` (pacote e
 * cursor), `central-memory-apply.js` (aplicar o pacote remoto) e `central-memory-directory.js` (cartões).
 
 * @module central-memory
 * Cliente de sincronização automática com o nó local zero-central-memory.
 * Copia todos os artefatos locais para o disco do nó local e reidrata o estado
 * completo ao iniciar ou reconectar, evitando perda de memória da rede.*/

import * as cacheNode from "./cache-node.js";
import * as mediaBlob from "./media-blob.js";
import * as serverChoice from "./memory-server-choice.js";
import * as profileDirectory from "./profile-directory.js";
import { captureMemoryUrlFromLocation, postToFirstAvailable, registerDiscoveredMemoryUrl } from "./central-memory-urls.js";
import { buildLocalSyncBundle, syncCursor } from "./central-memory-bundle.js";
import { applyRemoteBundle, isHydratingFromCentralMemory } from "./central-memory-apply.js";
import { isRehearsalMode, isRehearsalPayload } from "./rehearsal-mode.js";

export {
  registerDiscoveredMemoryUrl, getDiscoveredPublicMemoryUrl, captureMemoryUrlFromLocation, getCentralMemoryUrls,
} from "./central-memory-urls.js";
export { isHydratingFromCentralMemory } from "./central-memory-apply.js";

let syncInFlight = false;
let syncTimerId = null;
let autoPushEnabled = false;
let lastHydratedCallback = null;

/** Operação `resetCentralMemoryCursor` do módulo.
 */
export function resetCentralMemoryCursor() {
  syncCursor.lastServerRevision = 0;
  syncCursor.lastServerTimestamp = 0;
  syncCursor.lastLocalSyncMs = 0;
}

/** Define CentralMemoryAutoPush.
 * @param {*} [enabled] Parâmetro `enabled`.
 */
export function setCentralMemoryAutoPush(enabled) {
  autoPushEnabled = Boolean(enabled);
  const sink = autoPushEnabled ? notifyCentralMemory : null;
  cacheNode.registerCentralMemorySink(sink);
  mediaBlob.registerBlobMemorySink(sink);
  profileDirectory.registerProfileMemorySink(sink);
}

/** Operação `notifyCentralMemory` do módulo.
 * @param {*} [event] Evento Nostr.
 */
export function notifyCentralMemory(event) {
  if (isRehearsalMode() || isRehearsalPayload(event)) return;
  if (!autoPushEnabled || !event || isHydratingFromCentralMemory()) return;
  void pushEventToCentralMemory(event);
  const blob = event?.item?.mediaBlob || event?.mediaBlob;
  if (blob?.hash && blob?.data) {
    void pushEventToCentralMemory({ type: "MEDIA_BLOB", blob });
  }
}

/** Operação `pushEventToCentralMemory` do módulo.
 * @param {*} [event] Evento Nostr.
 * @returns {*} Resultado da operação.
 */
export async function pushEventToCentralMemory(event) {
  if (isRehearsalMode() || isRehearsalPayload(event)) return null;
  if (!event || typeof event !== "object" || isHydratingFromCentralMemory()) {
    return null;
  }
  return postToFirstAvailable("/memory/ingest", event);
}

/**
 * Registra a marca d'água da sincronização e os endereços descobertos.
 * @param {object} remote Resposta remota
 * @param {number} syncStartedMs Início da sincronização (ms)
 */
function recordRemoteSyncWatermark(remote, syncStartedMs) {
  if (remote.tunnelUrl) {
    registerDiscoveredMemoryUrl(remote.tunnelUrl, "servidor");
  }
  syncCursor.lastServerRevision = Number(remote.revision || syncCursor.lastServerRevision);
  syncCursor.lastServerTimestamp = Number(remote.updatedAt || syncCursor.lastServerTimestamp);
  syncCursor.lastLocalSyncMs = syncStartedMs;
}

/** Operação `syncWithCentralMemory` do módulo.
 * @param {object} [options={}] Opções da operação.
 * @returns {*} Resultado da operação.
 */
export async function syncWithCentralMemory({ onHydrated } = {}) {
  if (isRehearsalMode()) return { ok: false, skipped: true, rehearsal: true };
  if (syncInFlight) return { ok: false, skipped: true };
  syncInFlight = true;
  try {
    const syncStartedMs = Date.now();
    const bundle = await buildLocalSyncBundle();
    const remote = await postToFirstAvailable("/memory/sync", bundle);
    if (!remote || remote.status !== "ok") {
      return { ok: false, hydratedCount: 0 };
    }
    recordRemoteSyncWatermark(remote, syncStartedMs);
    const hydratedCount = remote.upToDate ? 0 : await applyRemoteBundle(remote);
    const cb = typeof onHydrated === "function" ? onHydrated : lastHydratedCallback;
    if (hydratedCount > 0 && typeof cb === "function") {
      cb({ hydratedCount, revision: remote.revision });
    }
    return { ok: true, hydratedCount, revision: remote.revision, counts: remote.counts };
  } finally {
    syncInFlight = false;
  }
}

/** Operação `startCentralMemoryLoop` do módulo.
 * @param {object} [options={}] Opções da operação.
 * @returns {*} Resultado da operação.
 */
export function startCentralMemoryLoop({ intervalMs = 15000, onHydrated } = {}) {
  if (typeof onHydrated === "function") lastHydratedCallback = onHydrated;
  setCentralMemoryAutoPush(true);
  serverChoice.migrateLegacyMemoryServer();
  captureMemoryUrlFromLocation();
  if (serverChoice.askAboutMemorySuggestion()) resetCentralMemoryCursor();
  if (syncTimerId !== null) clearInterval(syncTimerId);
  void syncWithCentralMemory({ onHydrated });
  syncTimerId = setInterval(() => {
    void syncWithCentralMemory({ onHydrated });
  }, intervalMs);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void syncWithCentralMemory({ onHydrated });
      }
    });
  }
  return () => {
    if (syncTimerId !== null) {
      clearInterval(syncTimerId);
      syncTimerId = null;
    }
  };
}
