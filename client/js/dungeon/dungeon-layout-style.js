/**
 * @file Injeta `dungeon-layout.css` sob demanda (não entra no precache civil por padrão).
 * @module dungeon/dungeon-layout-style
 */

import { watchTokenTrayStyles } from "./token-tray-style.js";

const LINK_ID = "dungeon-layout-stylesheet";

/**
 * Garante que a folha de layout da Mesa está linkada no documento.
 *
 * @param {Document} [doc=document] Documento alvo.
 * @returns {void}
 */
export function ensureDungeonLayoutStyles(doc = document) {
  watchTokenTrayStyles(doc);
  if (!doc?.head || doc.getElementById(LINK_ID)) return;
  const link = doc.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  /* Relativo à URL do cliente (`client/` servido na raiz); ver `client/DEV.md` se houver `<base href>`. */
  link.href = "css/dungeon-layout.css";
  doc.head.appendChild(link);
}