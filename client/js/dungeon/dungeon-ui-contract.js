/**
 * @file Contrato de zonas e modos de cromo da Mesa Soberana (UI E5.0, sem DOM).
 * @module dungeon/dungeon-ui-contract
 */

/** @typedef {'segregation'|'topbar'|'mapHero'|'narrativeRoll'|'gmRail'|'campaignHub'} DungeonZoneId */

/**
 * Identificadores de zona de layout (Z0–Z5).
 * @type {Readonly<Record<string, DungeonZoneId>>}
 */
export const ZONES = Object.freeze({
  Z0: "segregation",
  Z1: "topbar",
  Z2: "mapHero",
  Z3: "narrativeRoll",
  Z4: "gmRail",
  Z5: "campaignHub",
});

/**
 * Modos de sessão / cromo.
 * @type {Readonly<Record<string, string>>}
 */
export const SESSION_MODES = Object.freeze({
  CAMPAIGN: "campaign",
  PLAYER_SESSION: "player_session",
  GM_SESSION: "gm_session",
  GM_SCREEN: "gm_screen",
  SHEET: "sheet",
});

/** Painéis colapsáveis da zona Z3. */
export const DRAWER_IDS = Object.freeze({
  CHRONICLE: "chronicle",
  DICE: "dice",
});

/** Variantes de cromo aplicadas em `.dungeon-sanctum`. */
export const CHROME_VARIANTS = Object.freeze({
  DEFAULT: "default",
  SESSION_PLAYER: "session-player",
  SESSION_GM: "session-gm",
});

const TAB_BY_MODE = Object.freeze({
  [SESSION_MODES.CAMPAIGN]: ["acampamento", "mesa", "ficha", "mestre"],
  [SESSION_MODES.PLAYER_SESSION]: ["acampamento", "mesa", "ficha"],
  [SESSION_MODES.GM_SESSION]: ["acampamento", "mesa", "ficha", "mestre"],
  [SESSION_MODES.GM_SCREEN]: ["acampamento", "mesa", "ficha", "mestre"],
  [SESSION_MODES.SHEET]: ["acampamento", "mesa", "ficha", "mestre"],
});

const SCREEN_TO_TAB = Object.freeze({
  acampamento: "acampamento",
  mesa: "mesa",
  ficha: "ficha",
  mestre: "mestre",
});

/**
 * Resolve o modo de sessão a partir da aba ativa e do papel do espectador.
 *
 * @param {string} activeTab Identificador da tela (`acampamento`|`mesa`|`ficha`|`mestre`).
 * @param {string} [viewerRole="player"] `player` ou `gm`.
 * @returns {string} Um valor de {@link SESSION_MODES}.
 */
export function resolveSessionMode(activeTab, viewerRole = "player") {
  const tab = SCREEN_TO_TAB[activeTab] || "acampamento";
  if (tab === "acampamento") return SESSION_MODES.CAMPAIGN;
  if (tab === "ficha") return SESSION_MODES.SHEET;
  if (tab === "mestre") return SESSION_MODES.GM_SCREEN;
  if (tab === "mesa") {
    return viewerRole === "gm" ? SESSION_MODES.GM_SESSION : SESSION_MODES.PLAYER_SESSION;
  }
  return SESSION_MODES.CAMPAIGN;
}

/**
 * Lista ids de abas visíveis no chrome para o modo e papel dados.
 *
 * @param {string} mode Valor de {@link SESSION_MODES}.
 * @param {boolean} [isGm=false] Se o usuário local é mestre.
 * @returns {string[]} Ids de aba (`acampamento`, `mesa`, etc.).
 */
export function visibleChromeTabs(mode, isGm = false) {
  let base = [...(TAB_BY_MODE[mode] || TAB_BY_MODE[SESSION_MODES.CAMPAIGN])];
  if (mode === SESSION_MODES.PLAYER_SESSION && isGm && !base.includes("mestre")) {
    base.push("mestre");
  }
  if (!isGm) base = base.filter((id) => id !== "mestre");
  return base;
}

/**
 * Variante de CSS/classe para a moldura `.dungeon-sanctum`.
 *
 * @param {string} mode Valor de {@link SESSION_MODES}.
 * @returns {string} Um valor de {@link CHROME_VARIANTS}.
 */
export function chromeVariantForMode(mode) {
  if (mode === SESSION_MODES.PLAYER_SESSION) return CHROME_VARIANTS.SESSION_PLAYER;
  if (mode === SESSION_MODES.GM_SESSION || mode === SESSION_MODES.GM_SCREEN) {
    return CHROME_VARIANTS.SESSION_GM;
  }
  return CHROME_VARIANTS.DEFAULT;
}

/**
 * Indica se formulários de mapa (tokens, upload) devem aparecer na Mesa.
 *
 * @param {string} mode Modo de sessão.
 * @returns {boolean}
 */
export function showMapGmChrome(mode) {
  return mode === SESSION_MODES.GM_SESSION || mode === SESSION_MODES.GM_SCREEN;
}