/**
 * @file Folha da bandeja de tokens (`css/sv-token-tray.css`) injetada sob demanda: só quando a bandeja abre.
 * @module dungeon/token-tray-style
 */

const LINK_ID = "sv-token-tray-stylesheet";
const TRAY_KEY = "token-tray";
const watched = new WeakSet();

/**
 * Garante que a folha da bandeja está linkada no documento (idempotente).
 * @param {Document} [doc=document] Documento alvo.
 * @returns {void}
 */
export function ensureTokenTrayStyles(doc = document) {
  if (!doc?.head || doc.getElementById(LINK_ID)) return;
  const link = doc.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = "css/sv-token-tray.css";
  doc.head.appendChild(link);
}

/**
 * Passa a injetar a folha da bandeja quando o `<details data-dungeon-details="token-tray">` abre. O evento `toggle` não
 * borbulha, então a escuta é em captura no documento; só vale uma vez por documento.
 * @param {Document} [doc=document] Documento alvo.
 * @returns {void}
 */
export function watchTokenTrayStyles(doc = document) {
  if (!doc || typeof doc.addEventListener !== "function" || watched.has(doc)) return;
  watched.add(doc);
  doc.addEventListener("toggle", (ev) => {
    const tray = ev?.target;
    if (tray?.dataset?.dungeonDetails === TRAY_KEY && tray.open) ensureTokenTrayStyles(doc);
  }, true);
}
