/**
 * @file Cartão de estado de tela, o mesmo para toda a Vox: carregando, vazio, erro e sem conexão. Só renderização
 * (HTML em texto); o CSS fica em `client/css/sv-estados.css`, carregado pela tela que usa o cartão.
 *
 * O botão é opcional e só existe com `action`: ele leva `data-*` para o tratador da tela (sem `data-*` não há como o
 * tratador achar o botão, então o cartão recusa). Assim nenhum estado traz botão morto. O link secundário (`link`) é
 * só navegação interna (`#/…`), sem tratador, e vem depois do botão.
 * @module shared/state-card
 */
import { escapeHtml } from "./html.js";

/** Os 4 estados de tela. Estados particulares (por exemplo "enviando") são um destes com texto próprio. */
export const STATE_KINDS = Object.freeze(["loading", "empty", "error", "offline"]);

const DEFAULT_ROWS = 3;
const MAX_ROWS = 8;
const DATA_KEY_RE = /^[a-z][a-z0-9-]*$/;
const LINK_HREF_RE = /^#\/[A-Za-z0-9\-._~%/?=&]*$/;

const ICONS = Object.freeze({
  empty: `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  error: `<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>`,
  offline: `<path d="M3 3l18 18"/><path d="M5 12a10 10 0 0 1 3-2M10 6.2A10 10 0 0 1 19 12M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19v.5"/>`,
});

function iconSvg(kind) {
  return `<svg class="sv-state-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg>`;
}

function dataAttributes(data) {
  const entries = Object.entries(data || {});
  if (!entries.length) throw new Error("Botão de estado sem data-*: o tratador da tela não acharia o botão.");
  return entries
    .map(([key, value]) => {
      if (!DATA_KEY_RE.test(key)) throw new Error(`Chave data-* inválida no botão de estado: ${key}`);
      return `data-${key}="${escapeHtml(value)}"`;
    })
    .join(" ");
}

function actionButton(action) {
  if (!action) return "";
  const label = String(action.label || "").trim();
  if (!label) throw new Error("Botão de estado sem rótulo.");
  return `<button type="button" class="sv-state-action" ${dataAttributes(action.data)}>${escapeHtml(label)}</button>`;
}

function secondaryLink(link) {
  if (!link) return "";
  const label = String(link.label || "").trim();
  if (!label) throw new Error("Link de estado sem rótulo.");
  if (!LINK_HREF_RE.test(String(link.href || ""))) throw new Error(`Link de estado só aceita rota interna (#/…): ${link.href}`);
  return `<a class="sv-state-link" href="${escapeHtml(link.href)}">${escapeHtml(label)}</a>`;
}

function skeletonRows(rows) {
  const count = Math.min(MAX_ROWS, Math.max(1, Math.trunc(Number(rows)) || DEFAULT_ROWS));
  return `<span class="sv-skeleton-row"></span>`.repeat(count);
}

function loadingCard({ text, rows }) {
  const label = String(text || "").trim();
  const message = label ? `<p class="sv-state-text">${escapeHtml(label)}</p>` : `<span class="sr-only">Carregando…</span>`;
  return `<div class="sv-state sv-state--loading" role="status" aria-busy="true">${message}${skeletonRows(rows)}</div>`;
}

/**
 * Desenha o cartão de um dos 4 estados de tela.
 * - `loading`: `aria-busy`, `rows` barras de esqueleto (padrão 3) e "Carregando…" só para leitor de tela, ou o `text` visível.
 * - `empty`, `error`, `offline`: ícone decorativo, uma frase, no máximo 1 botão e no máximo 1 link secundário.
 * @param {object} spec Descrição do cartão.
 * @param {"loading"|"empty"|"error"|"offline"} spec.kind Estado; qualquer outro valor lança erro.
 * @param {string} [spec.text] Frase do estado (escapada); nos 3 últimos kinds é o corpo do cartão.
 * @param {{label: string, data: Object<string, string>}} [spec.action] Botão único; `data` vira `data-*` escapado e
 * não pode ser vazio. Sem `action` não há `<button>`.
 * @param {{label: string, href: string}} [spec.link] Link secundário para uma rota interna (`#/…`); outro endereço lança erro.
 * @param {number} [spec.rows=3] Barras do esqueleto (de 1 a 8), só em `loading`.
 * @returns {string} HTML do cartão, com `role="status"`.
 */
export function renderStateCard({ kind, text = "", action = null, link = null, rows = DEFAULT_ROWS } = {}) {
  if (!STATE_KINDS.includes(kind)) throw new Error(`Estado de tela desconhecido: ${kind}`);
  if (kind === "loading") return loadingCard({ text, rows });
  return `<div class="sv-state sv-state--${kind}" role="status">${iconSvg(kind)}<p class="sv-state-text">${escapeHtml(text)}</p>${actionButton(action)}${secondaryLink(link)}</div>`;
}
