/**
 * Contrato de UI da Mesa — modos e abas visíveis.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHROME_VARIANTS,
  SESSION_MODES,
  chromeVariantForMode,
  resolveSessionMode,
  showMapGmChrome,
  visibleChromeTabs,
} from "../client/js/dungeon/dungeon-ui-contract.js";

test("resolveSessionMode — mesa jogador vs mestre", () => {
  assert.equal(resolveSessionMode("mesa", "player"), SESSION_MODES.PLAYER_SESSION);
  assert.equal(resolveSessionMode("mesa", "gm"), SESSION_MODES.GM_SESSION);
  assert.equal(resolveSessionMode("mestre", "player"), SESSION_MODES.GM_SCREEN);
  assert.equal(resolveSessionMode("acampamento"), SESSION_MODES.CAMPAIGN);
});

test("visibleChromeTabs — jogador na mesa não vê aba Mestre", () => {
  const tabs = visibleChromeTabs(SESSION_MODES.PLAYER_SESSION, false);
  assert.deepEqual(tabs, ["acampamento", "mesa", "ficha"]);
  const gmTabs = visibleChromeTabs(SESSION_MODES.PLAYER_SESSION, true);
  assert.ok(gmTabs.includes("mestre"));
});

test("chromeVariantForMode — player session usa session-player", () => {
  assert.equal(chromeVariantForMode(SESSION_MODES.PLAYER_SESSION), "session-player");
  assert.equal(chromeVariantForMode(SESSION_MODES.CAMPAIGN), "default");
});

test("resolveSessionMode — activeTab inválido cai em CAMPAIGN", () => {
  assert.equal(resolveSessionMode(""), SESSION_MODES.CAMPAIGN);
  assert.equal(resolveSessionMode("desconhecido"), SESSION_MODES.CAMPAIGN);
  assert.equal(resolveSessionMode(undefined), SESSION_MODES.CAMPAIGN);
});

test("visibleChromeTabs — jogador em ficha e campanha não vê Mestre", () => {
  assert.deepEqual(visibleChromeTabs(SESSION_MODES.SHEET, false), ["acampamento", "mesa", "ficha"]);
  assert.deepEqual(visibleChromeTabs(SESSION_MODES.CAMPAIGN, false), ["acampamento", "mesa", "ficha"]);
});

test("visibleChromeTabs — GM em qualquer modo vê Mestre", () => {
  const tabs = visibleChromeTabs(SESSION_MODES.GM_SCREEN, true);
  assert.deepEqual(tabs, ["acampamento", "mesa", "ficha", "mestre"]);
});

test("showMapGmChrome — habilita mapa GM só em sessão de mestre", () => {
  assert.equal(showMapGmChrome(SESSION_MODES.GM_SESSION), true);
  assert.equal(showMapGmChrome(SESSION_MODES.GM_SCREEN), true);
  assert.equal(showMapGmChrome(SESSION_MODES.PLAYER_SESSION), false);
  assert.equal(showMapGmChrome(SESSION_MODES.SHEET), false);
});

test("chromeVariantForMode — GM_SESSION e GM_SCREEN usam session-gm", () => {
  const gm = CHROME_VARIANTS.SESSION_GM;
  assert.equal(chromeVariantForMode(SESSION_MODES.GM_SESSION), gm);
  assert.equal(chromeVariantForMode(SESSION_MODES.GM_SCREEN), gm);
});