/** @file Celeste sky palette by local clock (data-sky-period on documentElement). */

import { readColorMode, resolveEffectiveDark } from "./color-mode.js";

export const SKY_PERIOD_HOURS = Object.freeze({
  madrugada: { start: 0, end: 5, label: "Madrugada" },
  manha: { start: 6, end: 11, label: "Manhã" },
  tarde: { start: 12, end: 17, label: "Tarde" },
  entardecer: { start: 18, end: 20, label: "Entardecer" },
  noite: { start: 21, end: 23, label: "Noite" },
});

export const SKY_FOLLOW_CLOCK_KEY = "vox-sky-follow-clock";

const THEME_COLOR = Object.freeze({
  madrugada: { light: "#1e4976", dark: "#0c1929" },
  manha: { light: "#0284c7", dark: "#0a1628" },
  tarde: { light: "#0369a1", dark: "#0b1a2e" },
  entardecer: { light: "#0e7490", dark: "#0f2038" },
  noite: { light: "#1d4ed8", dark: "#081422" },
});

const REFRESH_MS = 15 * 60 * 1000;

/** @param {number} hour 0-23 local */
export function hourToSkyPeriod(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h <= SKY_PERIOD_HOURS.madrugada.end) return "madrugada";
  if (h <= SKY_PERIOD_HOURS.manha.end) return "manha";
  if (h <= SKY_PERIOD_HOURS.tarde.end) return "tarde";
  if (h <= SKY_PERIOD_HOURS.entardecer.end) return "entardecer";
  return "noite";
}

export function prefersDarkScheme(view = globalThis) {
  return Boolean(view.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

function readFollowClock(storage) {
  if (!storage) return true;
  const raw = storage.getItem(SKY_FOLLOW_CLOCK_KEY);
  if (raw === "0" || raw === "false") return false;
  return true;
}

function syncThemeColorMeta(doc, period, dark) {
  const color = THEME_COLOR[period]?.[dark ? "dark" : "light"];
  if (!color) return;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    const media = meta.getAttribute("media") || "";
    if (media.includes("dark") && !dark) continue;
    if (media.includes("light") && dark) continue;
    meta.setAttribute("content", color);
  }
}

export function applySkyTheme(doc, hour = new Date().getHours(), opts = {}) {
  const root = doc.documentElement;
  const storage = doc.defaultView?.localStorage;
  const followClock = opts.followClock ?? readFollowClock(storage);
  const colorMode = readColorMode(storage);
  const schemeDark = prefersDarkScheme(doc.defaultView);
  const dark = opts.dark ?? resolveEffectiveDark(colorMode, schemeDark);
  if (!followClock) {
    root.removeAttribute("data-sky-period");
    root.removeAttribute("data-sky-palette");
    return { period: null, dark, followClock: false, colorMode };
  }
  const period = hourToSkyPeriod(hour);
  root.setAttribute("data-sky-period", period);
  root.setAttribute("data-sky-palette", period);
  syncThemeColorMeta(doc, period, dark);
  return {
    period,
    dark,
    followClock: true,
    themeColor: THEME_COLOR[period][dark ? "dark" : "light"],
  };
}

export function initSkyTheme(doc = document, hooks = {}) {
  const view = doc.defaultView ?? globalThis;
  const getHour = hooks.getHour ?? (() => new Date().getHours());
  const refresh = () => applySkyTheme(doc, getHour());
  refresh();
  const mq = view.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq) {
    const onScheme = () => refresh();
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onScheme);
    else mq.addListener(onScheme);
  }
  view.addEventListener?.("visibilitychange", () => {
    if (doc.visibilityState === "visible") refresh();
  });
  const timer = view.setInterval?.(refresh, REFRESH_MS);
  return () => {
    if (timer != null) view.clearInterval(timer);
  };
}
