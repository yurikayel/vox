/** @file Celeste sky palette by local clock (data-sky-period on documentElement). */

import { readColorMode, resolveEffectiveDark } from "./color-mode.js";

/** Faixas horárias dos períodos do céu usados na paleta Celeste. */
export const SKY_PERIOD_HOURS = Object.freeze({
  madrugada: { start: 0, end: 5, label: "Madrugada" },
  manha: { start: 6, end: 11, label: "Manhã" },
  tarde: { start: 12, end: 17, label: "Tarde" },
  entardecer: { start: 18, end: 20, label: "Entardecer" },
  noite: { start: 21, end: 23, label: "Noite" },
});

/** Chave do `localStorage` que controla se a paleta acompanha o relógio local. */
export const SKY_FOLLOW_CLOCK_KEY = "vox-sky-follow-clock";

const THEME_COLOR = Object.freeze({
  madrugada: { light: "#1e4976", dark: "#0c1929" },
  manha: { light: "#0284c7", dark: "#0a1628" },
  tarde: { light: "#0369a1", dark: "#0b1a2e" },
  entardecer: { light: "#0e7490", dark: "#0f2038" },
  noite: { light: "#1d4ed8", dark: "#081422" },
});

const REFRESH_MS = 15 * 60 * 1000;

/**
 * Converte a hora local (0–23) no identificador do período do céu.
 * @param {number} hour Hora local (0–23).
 * @returns {"madrugada"|"manha"|"tarde"|"entardecer"|"noite"} Período correspondente.
 */
export function hourToSkyPeriod(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h <= SKY_PERIOD_HOURS.madrugada.end) return "madrugada";
  if (h <= SKY_PERIOD_HOURS.manha.end) return "manha";
  if (h <= SKY_PERIOD_HOURS.tarde.end) return "tarde";
  if (h <= SKY_PERIOD_HOURS.entardecer.end) return "entardecer";
  return "noite";
}

/**
 * Verifica se o ambiente prefere esquema de cores escuro (`prefers-color-scheme: dark`).
 * @param {Window|typeof globalThis} [view=globalThis] Janela alvo.
 * @returns {boolean} `true` quando o sistema prefere modo escuro.
 */
export function prefersDarkScheme(view = globalThis) {
  return Boolean(view.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

/**
 * Lê se o tema segue o relógio (ligado por padrão).
 * @param {Storage|null} storage Armazenamento
 * @returns {boolean} `true` se segue o relógio.
 */
function readFollowClock(storage) {
  if (!storage) return true;
  const raw = storage.getItem(SKY_FOLLOW_CLOCK_KEY);
  if (raw === "0" || raw === "false") return false;
  return true;
}

/**
 * Atualiza a cor do tema (`theme-color`) conforme o período e o modo escuro.
 * @param {Document} doc Documento
 * @param {string} period Período do dia
 * @param {boolean} dark Se o modo é escuro
 */
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

/**
 * Aplica os atributos `data-sky-period`/`data-sky-palette` e atualiza a meta tag `theme-color`.
 * @param {Document} doc Documento alvo.
 * @param {number} [hour=new Date().getHours()] Hora local usada para escolher o período.
 * @param {{ followClock?: boolean, dark?: boolean }} [opts={}] Sobrescritas opcionais.
 * @returns {{ period: string|null, dark: boolean, followClock: boolean, colorMode?: string, themeColor?: string }} Estado aplicado.
 */
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

/**
 * Inicializa o tema Celeste e agenda atualizações em trocas de esquema, visibilidade e intervalo.
 * @param {Document} [doc=document] Documento alvo.
 * @param {{ getHour?: () => number }} [hooks={}] Gancho opcional de relógio para testes.
 * @returns {() => void} Função de limpeza que cancela o temporizador periódico.
 */
export function initSkyTheme(doc = document, hooks = {}) {
  const view = doc.defaultView ?? globalThis;
  const getHour = hooks.getHour ?? (() => new Date().getHours());
  /**
   * Reaplica o tema do céu à hora atual.
   */
  const refresh = () => applySkyTheme(doc, getHour());
  refresh();
  const mq = view.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq) {
    /**
     * Reaplica o tema quando o esquema de cores do sistema muda.
     */
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
