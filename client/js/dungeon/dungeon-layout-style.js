/**
 * @file Injeta `dungeon-layout.css` e as folhas `sv-*.css` das telas v4 sob demanda (fora do precache civil).
 * @module dungeon/dungeon-layout-style
 */

import { watchTokenTrayStyles } from "./token-tray-style.js";

const LINK_ID = "dungeon-layout-stylesheet";

/**
 * Folhas por tela da UI v4: `{ id, href }`, cada uma com o próprio id de `<link>`. A fatia que cria uma folha acrescenta
 * só a sua linha aqui, junto com o arquivo em `client/css/`.
 * @type {ReadonlyArray<{ id: string, href: string }>}
 */
export const SV_SHEETS = Object.freeze([]);

function linkSheet(doc, id, href) {
  if (doc.getElementById(id)) return;
  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  doc.head.appendChild(link);
}

/**
 * Linka cada folha da lista no documento, uma vez (idempotente).
 *
 * @param {Document} [doc=document] Documento alvo.
 * @param {ReadonlyArray<{ id: string, href: string }>} [sheets=SV_SHEETS] Folhas a linkar.
 * @returns {void}
 */
export function ensureSvSheets(doc = document, sheets = SV_SHEETS) {
  if (!doc?.head) return;
  for (const sheet of sheets) linkSheet(doc, sheet.id, sheet.href);
}

/**
 * Garante que a folha de layout da Mesa e as folhas `sv-*.css` estão linkadas no documento.
 *
 * @param {Document} [doc=document] Documento alvo.
 * @param {ReadonlyArray<{ id: string, href: string }>} [sheets=SV_SHEETS] Folhas `sv-*.css` a linkar junto do layout.
 * @returns {void}
 */
export function ensureDungeonLayoutStyles(doc = document, sheets = SV_SHEETS) {
  watchTokenTrayStyles(doc);
  if (!doc?.head) return;
  /* Relativo à URL do cliente (`client/` servido na raiz); ver `client/DEV.md` se houver `<base href>`. */
  linkSheet(doc, LINK_ID, "css/dungeon-layout.css");
  ensureSvSheets(doc, sheets);
}
