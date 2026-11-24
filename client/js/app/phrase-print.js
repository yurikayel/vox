/**
 * @file Impressão do cartão da frase de recuperação (ADR-032 §3.3). Uma cópia do cartão vai direto no `body`,
 * recebe o QR offline da frase apenas em memória na janela de impressão, o CSS esconde o resto da página na
 * impressão e a cópia sai assim que der: no `afterprint`, ao trocar de rota (`hashchange`), ao sair da página
 * (`pagehide`) ou quando a tela da frase segue para a conferência.
 */

import { modulesToSvg } from "../qr-url.js";
import {
  QR_MAX_BYTES,
  VERSIONS,
  blocksToBits,
  chooseVersion,
  encodeBytePayload,
  splitDataBlocks,
} from "../qr-url-codec.js";
import { rsDivisor, rsRemainder } from "../qr-url-gf.js";
import { buildFunctionGrid, pickMaskedGrid } from "../qr-url-layout.js";
import { escapeHtml } from "../shared/html.js";

/** `id` da cópia do cartão colocada no `body` só durante a impressão. */
export const PRINT_ROOT_ID = "phrase-print-root";
/** Rótulo acessível do QR offline impresso no cartão da frase. */
export const PHRASE_QR_LABEL = "QR offline da frase de recuperação";

const PRINT_CLASS = "printing-phrase";
const QR_BOX_CLASS = "phrase-print-qr";
const QR_SIZE_PX = 160;
const SVG_NS = "http://www.w3.org/2000/svg";
const CLEANUP_EVENTS = ["afterprint", "hashchange", "pagehide"];
const DEFAULT_WARNING =
  "Quem tiver estas palavras entra como você. Escreva no papel, guarde longe do celular e não fotografe.";

/**
 * Normaliza entrada de palavras da frase (array ou texto separado por espaços).
 * @param {string[]|string|null|undefined} words Entrada bruta.
 * @returns {string[]} Palavras limpas não vazias.
 */
function normalizePhraseWords(words) {
  if (Array.isArray(words)) return words.map((w) => String(w ?? "").trim()).filter(Boolean);
  if (typeof words === "string") return words.trim().split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Codifica um payload offline em matriz QR (versões 2–9 ou 11, ECC L) sem exigir URL.
 * @param {string} payload Texto do payload offline.
 * @returns {{ payload: string, version: number, size: number, modules: boolean[][] }|null} Grade QR ou `null`.
 */
function encodeOfflinePayload(payload) {
  if (!payload) return null;
  const bytes = new TextEncoder().encode(payload);
  if (!bytes.length || bytes.length > QR_MAX_BYTES) return null;
  const version = chooseVersion(bytes.length);
  const spec = VERSIONS[version];
  const dataBlocks = splitDataBlocks(encodeBytePayload(bytes, spec.data, version), spec.blocks);
  const divisor = rsDivisor(spec.ec);
  const eccBlocks = dataBlocks.map((block) => rsRemainder(block, divisor));
  const picked = pickMaskedGrid(buildFunctionGrid(version), blocksToBits(dataBlocks, eccBlocks));
  return { payload, version, size: picked.size, modules: picked.modules };
}

/**
 * Codifica a frase de recuperação em matriz QR offline, ou devolve `null` se vazia ou maior que o limite.
 * @param {string[]|string} words Palavras da frase.
 * @returns {{ payload: string, version: number, size: number, modules: boolean[][] }|null} Grade QR ou `null`.
 */
export function encodePhraseQrModules(words) {
  const list = normalizePhraseWords(words);
  if (!list.length) return null;
  try {
    return encodeOfflinePayload(list.join(" "));
  } catch {
    return null;
  }
}

/**
 * Gera o SVG offline e acessível do QR da frase, ou string vazia se a frase estiver vazia ou exceder a capacidade.
 * @param {string[]|string} words Palavras da frase.
 * @returns {string} Marcação `<svg>` pronta ou `""`.
 */
export function buildPhraseQrSvg(words) {
  const encoded = encodePhraseQrModules(words);
  if (!encoded) return "";
  const attrs = `role="img" aria-label="${escapeHtml(PHRASE_QR_LABEL)}" width="${QR_SIZE_PX}" height="${QR_SIZE_PX}"`;
  return modulesToSvg(encoded.modules).replace("<svg ", `<svg ${attrs} `);
}

/**
 * Monta o HTML do cartão imprimível com palavras numeradas escapadas e QR offline opcional.
 * @param {{ words?: string[]|string, warning?: string }} [opts] Palavras da frase e texto de aviso.
 * @returns {string} HTML seguro do cartão.
 */
export function buildPhrasePrintCardHtml({ words = [], warning = DEFAULT_WARNING } = {}) {
  const list = normalizePhraseWords(words);
  const items = list.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const svg = buildPhraseQrSvg(list);
  const qrBlock = svg ? `<div class="${QR_BOX_CLASS}">${svg}</div>` : "";
  return `<div class="phrase-print-card" id="${PRINT_ROOT_ID}">
      <h1>Vox — frase de recuperação</h1>
      <p>${escapeHtml(warning)}</p>
      <ol class="phrase-words">${items}</ol>
      ${qrBlock}
      <p>Para entrar: Vox → Já tenho conta → digite as palavras na ordem.</p>
    </div>`;
}

/**
 * Cria nó SVG com atributos via DOM, evitando atribuição a `innerHTML`.
 * @param {Document} doc Documento alvo.
 * @param {string} tag Nome da tag SVG.
 * @param {Record<string, string|number>} attrs Atributos.
 * @returns {Element} Elemento criado.
 */
function createSvgNode(doc, tag, attrs) {
  const el = typeof doc.createElementNS === "function" ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute?.(k, String(v));
  return el;
}

/**
 * Anexa filho usando `append` ou `appendChild` conforme o DOM disponível.
 * @param {Element} parent Nó pai.
 * @param {Element} child Nó filho.
 */
function appendCompat(parent, child) {
  if (typeof parent?.append === "function") parent.append(child);
  else parent?.appendChild?.(child);
}

/**
 * Constrói elemento `<svg>` vetorial do QR a partir da matriz de módulos.
 * @param {Document} doc Documento alvo.
 * @param {boolean[][]} modules Matriz quadrada de módulos QR.
 * @returns {Element} Elemento `<svg>` pronto.
 */
function buildSvgDom(doc, modules) {
  const n = modules.length;
  const q = 4;
  const dim = n + q * 2;
  const svg = createSvgNode(doc, "svg", {
    xmlns: SVG_NS,
    role: "img",
    "aria-label": PHRASE_QR_LABEL,
    width: QR_SIZE_PX,
    height: QR_SIZE_PX,
    viewBox: `0 0 ${dim} ${dim}`,
    "shape-rendering": "crispEdges",
  });
  appendCompat(svg, createSvgNode(doc, "rect", { width: dim, height: dim, fill: "#fff" }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) appendCompat(svg, createSvgNode(doc, "rect", { x: x + q, y: y + q, width: 1, height: 1 }));
    }
  }
  return svg;
}

/**
 * Extrai palavras da lista numerada de um cartão já renderizado no DOM.
 * @param {Element} card Elemento do cartão.
 * @returns {string[]} Palavras extraídas.
 */
function extractWordsFromCard(card) {
  const items = card?.querySelectorAll?.(".phrase-words li") || card?.querySelectorAll?.("li");
  return items ? [...items].map((el) => String(el.textContent || "").trim()).filter(Boolean) : [];
}

/**
 * Anexa o contêiner com o QR SVG offline ao clone do cartão em memória, degradando silenciosamente se vazio ou longo.
 * @param {Element} card Clone do cartão a imprimir.
 * @param {Document} doc Documento alvo.
 * @param {string[]|string|undefined} words Palavras em memória (opcional).
 */
function attachQrToCard(card, doc, words) {
  if (typeof doc?.createElement !== "function" && typeof doc?.createElementNS !== "function") return;
  if (card.querySelector?.(`.${QR_BOX_CLASS}`)) return;
  const resolved = words === undefined ? extractWordsFromCard(card) : words;
  const encoded = encodePhraseQrModules(resolved);
  if (!encoded) return;
  const box = typeof doc.createElement === "function" ? doc.createElement("div") : createSvgNode(doc, "div", {});
  box.className = QR_BOX_CLASS;
  box.setAttribute?.("class", QR_BOX_CLASS);
  appendCompat(box, buildSvgDom(doc, encoded.modules));
  appendCompat(card, box);
}

/**
 * Tira do `body` a cópia do cartão (com a frase) e a classe de impressão. Pode ser chamada a qualquer momento.
 * @param {Document} [doc] documento (padrão: o da página)
 * @returns {void}
 */
export function discardPhrasePrintCopy(doc = globalThis.document) {
  if (!doc?.body) return;
  doc.body.classList.remove(PRINT_CLASS);
  doc.getElementById(PRINT_ROOT_ID)?.remove();
}

/**
 * Imprime só o cartão da frase com QR offline em memória. Sem `print()` no navegador, a cópia nem fica no `body`.
 * @param {{ doc?: Document, win?: Window, words?: string[]|string }} [env] documento, janela e palavras da frase
 * @returns {boolean} se o diálogo de impressão foi pedido
 */
export function printPhraseCard({ doc = globalThis.document, win = globalThis, words } = {}) {
  discardPhrasePrintCopy(doc);
  const card = doc?.getElementById("phrase-print-card")?.cloneNode(true);
  if (!card) return false;
  if (typeof win?.print !== "function") return false;
  card.id = PRINT_ROOT_ID;
  card.removeAttribute?.("aria-hidden");
  attachQrToCard(card, doc, words);
  appendCompat(doc.body, card);
  doc.body.classList.add(PRINT_CLASS);
  /**
   * Descarta a cópia impressa da frase.
   *
   * @returns {void}
   */
  const cleanup = () => discardPhrasePrintCopy(doc);
  for (const type of CLEANUP_EVENTS) win.addEventListener?.(type, cleanup, { once: true });
  win.print();
  return true;
}
