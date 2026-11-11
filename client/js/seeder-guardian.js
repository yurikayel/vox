/**
 * Módulo Seeder Guardian / Modo Guardião Mobile (Fase 3.3)
 * Mobiliza smartphones e dispositivos dos usuários como nós de retransmissão
 * cívica P2P com política de preservação de bateria e dados móveis.
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

export async function readBatteryStatus() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getBattery === "function") {
      const b = await navigator.getBattery();
      return { charging: Boolean(b.charging), level: Number(b.level ?? 1) };
    }
  } catch {}
  return { charging: true, level: 1.0 };
}

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
