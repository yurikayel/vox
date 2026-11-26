/**
 * @file Região viva estável do HUD: um único nó fora da área que a Mesa redesenha, para o leitor de tela anunciar só
 * mudanças reais do PV próprio (a região recriada a cada redesenho pode não anunciar).
 * @module dungeon/hud-live
 */
const LIVE_ID = "dungeon-hud-live";

/**
 * Atualiza o texto da região viva; só mexe no nó quando o texto muda. Sem DOM, não faz nada.
 * @param {string} text Texto a anunciar (ex.: "PV 18/24").
 * @param {Document|undefined} [doc] Documento (padrão: o global).
 * @returns {boolean} Se o texto foi trocado.
 */
export function syncHudLive(text, doc = globalThis.document) {
  if (!doc?.body) return false;
  let node = doc.getElementById(LIVE_ID);
  if (!node) {
    node = doc.createElement("div");
    node.id = LIVE_ID;
    node.className = "sr-only";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    doc.body.appendChild(node);
  }
  if (node.textContent === text) return false;
  node.textContent = text;
  return true;
}
