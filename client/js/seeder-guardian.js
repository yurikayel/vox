/**
 * @file Modo Guardião (Fase 3.3): o celular vira nó de retransmissão quando está no Wi-Fi e carregando.
 *
 * Cota fixa de 2 GB e banda diária proporcional, definidas em `supporter-mode.js`. A configuração fica
 * em `localStorage`; a cota não é escolhida pela pessoa.
 *
 * @module seeder-guardian
 * @see client/js/supporter-mode.js
 */

import { GUARDIAN_LIMITS } from "./supporter-mode.js";

const STORAGE_KEY = "vox-guardian-config";

const DEFAULT_CONFIG = {
  enabled: false,
  /** Cota fixa de 2 GB (supporter-mode.js). */
  quotaMb: GUARDIAN_LIMITS.quotaMb,
  onlyWifi: true,
  onlyCharging: true,
  minBatteryLevel: 0.5,
};

/**
 * Configuração do Guardião neste aparelho, com a cota sempre fixa.
 *
 * @returns {{enabled: boolean, quotaMb: number, onlyWifi: boolean, onlyCharging: boolean, minBatteryLevel: number}} O padrão quando não há nada guardado ou o JSON está corrompido.
 */
export function getGuardianQuotaConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      quotaMb: GUARDIAN_LIMITS.quotaMb,
      onlyWifi: parsed.onlyWifi !== false,
      onlyCharging: parsed.onlyCharging !== false,
      minBatteryLevel: Number(parsed.minBatteryLevel) || DEFAULT_CONFIG.minBatteryLevel,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Guarda mudanças na configuração do Guardião. A cota enviada é ignorada (fica fixa).
 *
 * @param {object} [partial={}] Campos a mudar.
 * @returns {object} A configuração como ficou.
 * @throws {DOMException} Se o armazenamento está cheio ou bloqueado.
 */
export function saveGuardianQuotaConfig(partial = {}) {
  const current = getGuardianQuotaConfig();
  const updated = {
    ...current,
    ...partial,
    quotaMb: GUARDIAN_LIMITS.quotaMb,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Lê a bateria pela Battery Status API.
 *
 * Sem a API (iOS, Firefox), devolve "carregando, 100%": a falta da API não bloqueia o Guardião.
 *
 * @returns {Promise<{charging: boolean, level: number}>} `level` de 0 a 1.
 */
export async function readBatteryStatus() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getBattery === "function") {
      const b = await navigator.getBattery();
      return { charging: Boolean(b.charging), level: Number(b.level ?? 1) };
    }
  } catch {}
  return { charging: true, level: 1.0 };
}

/**
 * Lê o tipo de conexão pela Network Information API.
 *
 * Sem a API, supõe Wi-Fi sem franquia.
 *
 * @returns {{isWifi: boolean, isMetered: boolean}} Tipo de rede.
 */
export function readNetworkStatus() {
  try {
    const conn = typeof navigator !== "undefined" ? navigator.connection : null;
    if (!conn) return { isWifi: true, isMetered: false };
    const type = String(conn.type || "").toLowerCase();
    const isWifi = type === "wifi" || type === "ethernet" || !type;
    return { isWifi, isMetered: Boolean(conn.saveData) };
  } catch {
    return { isWifi: true, isMetered: false };
  }
}

/**
 * Diz se o Guardião pode repassar agora, conforme a configuração, a rede e a bateria.
 *
 * @param {object|null} [config=null] Configuração; `null` lê a guardada.
 * @returns {Promise<{permitted: boolean, reason: "disabled"|"cellular_connection"|"not_charging"|"low_battery"|"ready"}>} Decisão e motivo.
 */
export async function isSeedingPermitted(config = null) {
  const cfg = config || getGuardianQuotaConfig();
  if (!cfg.enabled) return { permitted: false, reason: "disabled" };

  const [battery, net] = await Promise.all([readBatteryStatus(), readNetworkStatus()]);
  if (cfg.onlyWifi && !net.isWifi) {
    return { permitted: false, reason: "cellular_connection" };
  }
  if (cfg.onlyCharging && !battery.charging) {
    return { permitted: false, reason: "not_charging" };
  }
  if (battery.level < cfg.minBatteryLevel) {
    return { permitted: false, reason: "low_battery" };
  }
  return { permitted: true, reason: "ready" };
}

/**
 * Estima uso e espaço disponível pela Storage API, em MB.
 *
 * Sem a API, devolve valores de reserva (5 MB usados de 500 MB), que não são medição.
 *
 * @returns {Promise<{usageMb: number, totalAvailableMb: number}>} Uso e espaço.
 */
export async function estimateGuardianStorage() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usage = est.usage ? Math.round(est.usage / (1024 * 1024)) : 0;
      const quota = est.quota ? Math.round(est.quota / (1024 * 1024)) : 1000;
      return { usageMb: usage, totalAvailableMb: quota };
    }
  } catch {}
  return { usageMb: 5, totalAvailableMb: 500 };
}
