/**
 * @file Setas no canvas da Mesa: empurra o token selecionado e anuncia o resultado ao leitor de tela pela região viva
 * do HUD (`hud-live.js`). O canvas não tem texto, então sem o anúncio quem não enxerga aperta a seta e não sabe se o
 * token andou, nem para onde, nem se bateu na borda do mapa.
 * @module dungeon/token-nudge-live
 */
import { getActiveScene, nudgeTokenInScene } from "./dungeon-scene-actions.js";
import { announceHudLive } from "./hud-live.js";

function spotOf(scene, tokenId) {
  const tok = (scene.tokens || []).find((t) => t.tokenId === tokenId);
  return tok ? { name: tok.name, x: tok.x, y: tok.y } : null;
}

/**
 * Texto do movimento, com a mesma grade `(x, y)` que o editor do token mostra.
 * @param {{name: string, x: number, y: number}} before Token antes do empurrão.
 * @param {{name: string, x: number, y: number}} after Token depois.
 * @returns {string} Frase em português.
 */
export function describeTokenMove(before, after) {
  const at = `(${after.x}, ${after.y})`;
  if (before.x === after.x && before.y === after.y) return `${after.name} já está na borda do mapa, em ${at}.`;
  return `${after.name} movido para ${at}.`;
}

/**
 * Desloca o token em `(dx, dy)` células e anuncia o movimento na região viva do HUD.
 * @param {object} state Estado da sessão.
 * @param {string} tokenId Identificador do token.
 * @param {number} dx Deslocamento horizontal (`-1`, `0`, `1`).
 * @param {number} dy Deslocamento vertical (`-1`, `0`, `1`).
 * @param {object} [opts={}] Opções (`store`).
 * @returns {Promise<object>} Cena atualizada.
 */
export async function nudgeTokenAnnounced(state, tokenId, dx, dy, opts = {}) {
  const before = spotOf(getActiveScene(state), tokenId);
  const scene = await nudgeTokenInScene(state, tokenId, dx, dy, opts);
  const after = spotOf(scene, tokenId);
  if (before && after) announceHudLive(describeTokenMove(before, after));
  return scene;
}
