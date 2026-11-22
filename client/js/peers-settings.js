/**
 * @file Preferências de ajuda à rede, tetos de banda (Wi-Fi e 4G) e contadores de uso deste nó.
 */

import { normalizeStorageCommitment } from "./supporter-mode.js";

const PEER_SETTINGS_KEY = "vox-peer-settings";
const PEER_METRICS_KEY = "vox-peer-metrics";
const DAILY_USAGE_KEY = "vox-daily-usage";

/** Chave de armazenamento do uso mensal no localStorage. */
export const MONTHLY_USAGE_KEY = "vox-monthly-usage";

const DEFAULT_PEER_SETTINGS = Object.freeze({
  enabled: true,
  maxMb: 100,
  wifiOnly: true,
  commOnly: false,
  supporter: false,
  backgroundRelay: false,
  /** Proporcional ao disco: 2 × 100 MB (supporter-mode.js). */
  dailyCapMb: 200,
  /** PM-52: no 4G o teto é próprio e baixo (quem tem o plano mais barato paga mais pela ajuda). */
  cellularCapMb: 5,
  webrtcEnabled: true,
});

/** PM-52: limites aceitos para o teto no 4G (MB/dia). */
export const CELLULAR_CAP_MIN_MB = 1;
/** PM-52: teto máximo aceito para o 4G (MB/dia). */
export const CELLULAR_CAP_MAX_MB = 50;

/**
 * PM-52: ajusta o teto do 4G ao intervalo aceito, arredondado em MB.
 * @param {unknown} value Valor escolhido pela pessoa.
 * @returns {number} Entre `CELLULAR_CAP_MIN_MB` e `CELLULAR_CAP_MAX_MB`; valor inválido, zero ou negativo vira o padrão (5).
 */
export function clampCellularCapMb(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PEER_SETTINGS.cellularCapMb;
  return Math.min(CELLULAR_CAP_MAX_MB, Math.max(CELLULAR_CAP_MIN_MB, Math.round(n)));
}

/**
 * Preferências de ajuda à rede guardadas neste aparelho, com os padrões no que faltar e disco e teto diário
 * normalizados (`normalizeStorageCommitment`).
 * @returns {{enabled: boolean, maxMb: number, wifiOnly: boolean, commOnly: boolean, supporter: boolean, backgroundRelay: boolean, dailyCapMb: number, cellularCapMb: number, webrtcEnabled: boolean}}
 *   Preferências; os padrões se não houver nada guardado ou a leitura falhar.
 */
export function getPeerSettings() {
  try {
    const raw = localStorage.getItem(PEER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PEER_SETTINGS };
    const p = JSON.parse(raw);
    return normalizeStorageCommitment({
      enabled: p.enabled !== undefined ? p.enabled : DEFAULT_PEER_SETTINGS.enabled,
      maxMb: p.maxMb || DEFAULT_PEER_SETTINGS.maxMb,
      wifiOnly: p.wifiOnly !== undefined ? p.wifiOnly : DEFAULT_PEER_SETTINGS.wifiOnly,
      commOnly: p.commOnly !== undefined ? p.commOnly : DEFAULT_PEER_SETTINGS.commOnly,
      supporter: Boolean(p.supporter),
      backgroundRelay: p.backgroundRelay !== undefined ? p.backgroundRelay : DEFAULT_PEER_SETTINGS.backgroundRelay,
      dailyCapMb: p.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb,
      cellularCapMb: clampCellularCapMb(p.cellularCapMb ?? DEFAULT_PEER_SETTINGS.cellularCapMb),
      webrtcEnabled: p.webrtcEnabled !== undefined ? p.webrtcEnabled : DEFAULT_PEER_SETTINGS.webrtcEnabled,
    });
  } catch {
    return { ...DEFAULT_PEER_SETTINGS };
  }
}

let onSettingsSavedListener = null;

/**
 * Registra retorno disparado sempre que `savePeerSettings` é invocado.
 * @param {(settings: object) => void} fn Ouvinte acionado com as novas preferências.
 */
export function setOnSettingsSavedListener(fn) {
  onSettingsSavedListener = fn;
}

/**
 * Grava as preferências, religa ou desliga os canais da malha conforme elas e avisa o service worker.
 * @param {object} settings Preferências completas (formato de `getPeerSettings`).
 */
export function savePeerSettings(settings) {
  localStorage.setItem(PEER_SETTINGS_KEY, JSON.stringify(settings));
  if (typeof onSettingsSavedListener === "function") {
    onSettingsSavedListener(settings);
  }
  updateServiceWorkerRelay(settings);
}

/**
 * Contadores acumulados de ajuda à rede deste aparelho.
 * @returns {{blobsServed: number, bytesServed: number, blobsReceived: number, bytesReceived: number, blobsServedRtc: number}}
 *   Contadores; zerados se não houver nada guardado ou a leitura falhar.
 */
export function getPeerMetrics() {
  try {
    const raw = localStorage.getItem(PEER_METRICS_KEY);
    if (!raw) {
      return {
        blobsServed: 0,
        bytesServed: 0,
        blobsReceived: 0,
        bytesReceived: 0,
        blobsServedRtc: 0,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      blobsServed: parsed.blobsServed || 0,
      bytesServed: parsed.bytesServed || 0,
      blobsReceived: parsed.blobsReceived || 0,
      bytesReceived: parsed.bytesReceived || 0,
      blobsServedRtc: parsed.blobsServedRtc || 0,
    };
  } catch {
    return {
      blobsServed: 0,
      bytesServed: 0,
      blobsReceived: 0,
      bytesReceived: 0,
      blobsServedRtc: 0,
    };
  }
}

/**
 * Atualiza um campo das métricas de tráfego de pares.
 * @param {string} field Campo a incrementar (`blobsServed`, `bytesServed`, etc.).
 * @param {number} [amount=1] Quantidade a somar.
 */
export function updateMetrics(field, amount = 1) {
  const metrics = getPeerMetrics();
  metrics[field] = (metrics[field] || 0) + amount;
  localStorage.setItem(PEER_METRICS_KEY, JSON.stringify(metrics));
}

/**
 * Uso de banda servida hoje (data UTC). Registro de outro dia não conta: o dia começa zerado.
 * @returns {{date: string, bytesServedToday: number, bytesCellularToday: number}} Uso do dia.
 */
export function getDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(DAILY_USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) return data;
    }
  } catch {}
  return { date: today, bytesServedToday: 0, bytesCellularToday: 0 };
}

/**
 * Uso de banda servida no mês (ano-mês UTC, formato YYYY-MM). Registro de outro mês não conta: o mês começa zerado.
 * @param {string} [month] Mês de referência em formato YYYY-MM (padrão: mês corrente UTC).
 * @returns {{month: string, bytesServedMonth: number, bytesCellularMonth: number}} Uso acumulado no mês.
 */
export function getMonthlyUsage(month = new Date().toISOString().slice(0, 7)) {
  try {
    const raw = localStorage.getItem(MONTHLY_USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.month === month) {
        return {
          month,
          bytesServedMonth: Number(data.bytesServedMonth) || 0,
          bytesCellularMonth: Number(data.bytesCellularMonth) || 0,
        };
      }
    }
  } catch {}
  return { month, bytesServedMonth: 0, bytesCellularMonth: 0 };
}

/**
 * Palpite da conexão pela Network Information API: sem a API, conta como Wi-Fi; economia de dados ou tipo
 * `cellular` contam como 4G.
 * @returns {boolean} Verdadeiro para Wi-Fi ou conexão sem limite conhecido.
 */
export function isWifiOrUnlimited() {
  const nav = globalThis.navigator || {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.type && conn.type === "cellular") return false;
  return true;
}

/**
 * Indica se a economia de dados ou rede celular/móvel está ativa neste aparelho.
 * @returns {boolean} Verdadeiro se a conexão atual tiver economia de dados ativa ou for celular.
 */
export function isDataSaverActive() {
  return !isWifiOrUnlimited();
}

/**
 * Soma bytes servidos ao uso do dia (e ao uso no 4G, se for o caso).
 * @param {number} bytes Quantidade servida.
 * @param {boolean} [onCellular] Se foi no 4G (padrão: a conexão atual não é Wi-Fi nem ilimitada).
 */
export function recordBytesServed(bytes, onCellular = !isWifiOrUnlimited()) {
  const usage = getDailyUsage();
  usage.bytesServedToday += bytes;
  if (onCellular) usage.bytesCellularToday = (usage.bytesCellularToday || 0) + bytes;
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(usage));

  const monthly = getMonthlyUsage();
  monthly.bytesServedMonth += bytes;
  if (onCellular) monthly.bytesCellularMonth = (monthly.bytesCellularMonth || 0) + bytes;
  localStorage.setItem(MONTHLY_USAGE_KEY, JSON.stringify(monthly));
}

/**
 * PM-52: pode servir dados agora? No Wi-Fi vale o teto diário; no 4G, só se a pessoa
 * desligou o "só Wi-Fi", e até o teto do 4G (padrão 5 MB/dia).
 * @param {object} [settings] Preferências (padrão: `getPeerSettings()`).
 * @param {boolean} [onWifi] Se a conexão é Wi-Fi ou ilimitada (padrão: `isWifiOrUnlimited()`).
 * @param {{bytesServedToday: number, bytesCellularToday?: number}} [usage] Uso do dia (padrão: `getDailyUsage()`).
 * @returns {boolean} Verdadeiro se ainda pode servir.
 */
export function canServeNow(settings = getPeerSettings(), onWifi = isWifiOrUnlimited(), usage = getDailyUsage()) {
  if (usage.bytesServedToday >= (settings.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb) * 1024 * 1024) return false;
  if (onWifi) return true;
  if (settings.wifiOnly) return false;
  return (usage.bytesCellularToday || 0) < clampCellularCapMb(settings.cellularCapMb) * 1024 * 1024;
}

/**
 * Indica se o teto diário de banda servida já foi atingido.
 * @returns {boolean} Verdadeiro se o uso de hoje alcançou `dailyCapMb`.
 */
export function isDailyCapReached() {
  const settings = getPeerSettings();
  const usage = getDailyUsage();
  const capBytes = (settings.dailyCapMb || DEFAULT_PEER_SETTINGS.dailyCapMb) * 1024 * 1024;
  return usage.bytesServedToday >= capBytes;
}

/**
 * Pede permissão de notificação só se ainda não houve resposta.
 * @returns {Promise<NotificationPermission>} `"granted"`, `"denied"` ou `"default"`; `"denied"` onde não há a API.
 */
export async function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  }
  return "denied";
}

/**
 * Envia mensagem ao Service Worker quando as preferências do nó são atualizadas.
 * @param {object} settings Preferências completas do nó.
 */
export function updateServiceWorkerRelay(settings) {
  const nav = globalThis.navigator;
  if (nav && "serviceWorker" in nav && nav.serviceWorker.controller) {
    nav.serviceWorker.controller.postMessage({
      type: "VOX_SETTINGS_UPDATED",
      settings,
    });
  }
}
