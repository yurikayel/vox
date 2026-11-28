/**
 * @file Região viva estável do HUD: um único nó fora da área que a Mesa redesenha, para o leitor de tela anunciar só
 * mudanças reais do PV próprio (a região recriada a cada redesenho pode não anunciar) e avisos pontuais, como o
 * movimento do token pelas setas. O PV anunciado fica guardado à parte: um redesenho com o mesmo PV não apaga o aviso.
 * @module dungeon/hud-live
 */
const LIVE_ID = "dungeon-hud-live";
const bases = new WeakMap();

function liveNode(doc) {
  if (!doc?.body) return null;
  let node = doc.getElementById(LIVE_ID);
  if (!node) {
    node = doc.createElement("div");
    node.id = LIVE_ID;
    node.className = "sr-only";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    doc.body.appendChild(node);
  }
  return node;
}

/**
 * Atualiza o texto da região viva; só mexe no nó quando o texto muda. Sem DOM, não faz nada.
 * @param {string} text Texto a anunciar (ex.: "PV 18/24").
 * @param {Document|undefined} [doc] Documento (padrão: o global).
 * @returns {boolean} Se o texto foi trocado.
 */
export function syncHudLive(text, doc = globalThis.document) {
  const node = liveNode(doc);
  if (!node) return false;
  const same = bases.has(node) ? bases.get(node) === text : node.textContent === text;
  bases.set(node, text);
  if (same) return false;
  node.textContent = text;
  return true;
}

/**
 * Anuncia um aviso pontual na mesma região viva (sem criar outra). O aviso fica até o PV mudar de verdade.
 * @param {string} text Texto a anunciar (ex.: `Lyra movido para (3, 2).`).
 * @param {Document|undefined} [doc] Documento (padrão: o global).
 * @returns {boolean} Se o texto foi trocado.
 */
export function announceHudLive(text, doc = globalThis.document) {
  const node = liveNode(doc);
  if (!node || !text || node.textContent === text) return false;
  if (!bases.has(node)) bases.set(node, node.textContent);
  node.textContent = text;
  return true;
}
