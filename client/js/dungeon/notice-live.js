/**
 * @file Região viva estável dos avisos da Mesa (`state.campaignNotice`): um único nó `role="status"` fora da área que
 * a Mesa redesenha, que só troca o `textContent`. O aviso desenhado dentro do contêiner é recriado a cada redesenho,
 * e uma região viva recriada repete o texto ou não diz nada nem da 1ª vez; aqui o leitor de tela ouve cada aviso uma vez.
 * @module dungeon/notice-live
 */
const LIVE_ID = "dungeon-notice-live";
const NBSP = "\u00A0";

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
 * Anuncia o aviso pendente da sessão (`noticePending`) na região viva fixa e o zera, para o mesmo texto não voltar a
 * cada redesenho. O aviso visível (`campaignNotice`) não é tocado: o `<p>` continua na tela como antes.
 * Um aviso igual ao anterior, repetido de propósito, alterna um espaço sem quebra no fim (não é falado, mas conta como
 * mudança da região) e é anunciado de novo. Sem aviso ou sem DOM, não faz nada e o aviso fica como está.
 * @param {{noticePending?: string}} state Estado da sessão da Mesa.
 * @param {Document|undefined} [doc] Documento (padrão: o global).
 * @returns {boolean} Se um aviso foi anunciado.
 */
export function announceNotice(state, doc = globalThis.document) {
  const text = state?.noticePending;
  const node = text ? liveNode(doc) : null;
  if (!node) return false;
  node.textContent = node.textContent === text ? `${text}${NBSP}` : text;
  state.noticePending = "";
  return true;
}
