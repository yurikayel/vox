/**
 * @file Aviso local preventivo (v0): heurísticas síncronas, puras e estritamente consultivas
 * executadas apenas na memória do dispositivo antes de assinar ou enviar um rascunho.
 *
 * Invariantes:
 * - 100% offline, sem chamadas de rede, sem ML e sem WebAssembly.
 * - Nunca bloqueia publicação (`advisoryOnly: true`, `blocksPublish: false`).
 * - Nunca altera nem reescreve o texto da pessoa.
 *
 * @module shared/local-advisory
 */

import { escapeHtml } from "./html.js";

const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const BR_PHONE_RE = /(?:\+55\s*)?(?:\(\d{2}\)\s*|\b\d{2}[\s-])(?:9?\d{4})[\s-]?\d{4}\b/;

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;
const BARE_SHORTENER_RE =
  /(?:^|[\s(])((?:bit\.ly|tinyurl\.com|t\.co|is\.gd|ow\.ly|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|encurtador\.com\.br)\/[^\s<>"')]+)/gi;

const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "encurtador.com.br",
]);

const CAPS_MIN_LETTERS = 24;
const CAPS_MIN_RATIO = 0.8;

/**
 * Indica se um hostname aponta para loopback local (isento do alerta de `http://`).
 * @param {string} hostname Hostname extraído de uma URL.
 * @returns {boolean} `true` para `localhost`, `*.localhost`, `127.x.x.x` ou `::1`.
 */
function isLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "[::1]") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Detecta sinais locais de exposição acidental de dados pessoais (CPF, e-mail ou telefone BR).
 * @param {string} text Rascunho do usuário.
 * @returns {object|null} Aviso consultivo ou `null` quando nada foi detectado.
 */
function detectPiiExposure(text) {
  const kinds = [];
  if (CPF_RE.test(text)) kinds.push("CPF");
  if (EMAIL_RE.test(text)) kinds.push("e-mail");
  if (BR_PHONE_RE.test(text)) kinds.push("telefone");
  if (!kinds.length) return null;
  return {
    code: "pii-exposure",
    title: "Possível dado pessoal no texto",
    detail: `Encontramos sinal de ${kinds.join(", ")} no rascunho. Em publicação pública, esse dado fica visível na malha.`,
    kinds,
  };
}

/**
 * Inspeciona URLs com esquema (`http://` / `https://`) em busca de encurtadores ou HTTP não-loopback.
 * @param {string} text Rascunho do usuário.
 * @returns {{ hasShortener: boolean, hasInsecureHttp: boolean }} Sinais encontrados.
 */
function scanExplicitUrls(text) {
  let hasShortener = false;
  let hasInsecureHttp = false;
  const matches = text.match(URL_RE) || [];
  for (const raw of matches) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      if (SHORTENER_HOSTS.has(host)) hasShortener = true;
      if (parsed.protocol === "http:" && !isLoopbackHost(host)) hasInsecureHttp = true;
    } catch {
      // URL malformada é ignorada sem lançar erro.
    }
  }
  return { hasShortener, hasInsecureHttp };
}

/**
 * Detecta links encurtadores opacos (com ou sem protocolo) ou URLs `http://` não-loopback.
 * @param {string} text Rascunho do usuário.
 * @returns {object|null} Aviso consultivo ou `null` quando nenhum link suspeito aparece.
 */
function detectOpaqueOrInsecureLinks(text) {
  const { hasShortener: explicitShortener, hasInsecureHttp } = scanExplicitUrls(text);
  const hasBareShortener = BARE_SHORTENER_RE.test(text);
  BARE_SHORTENER_RE.lastIndex = 0;
  const hasShortener = explicitShortener || hasBareShortener;
  if (!hasShortener && !hasInsecureHttp) return null;

  const reasons = [];
  const parts = [];
  if (hasShortener) {
    reasons.push("shortener");
    parts.push("link encurtador opaco");
  }
  if (hasInsecureHttp) {
    reasons.push("insecure-http");
    parts.push("endereço http:// sem criptografia");
  }
  return {
    code: "opaque-or-insecure-link",
    title: "Link opaco ou sem HTTPS",
    detail: `Detectamos ${parts.join(" e ")}. Prefira links diretos em https:// para que quem lê saiba o destino.`,
    reasons,
  };
}

/**
 * Detecta texto extenso escrito majoritariamente em CAIXA ALTA agressiva.
 * @param {string} text Rascunho do usuário.
 * @returns {object|null} Aviso consultivo ou `null` quando abaixo do limiar.
 */
function detectAggressiveCaps(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < CAPS_MIN_LETTERS) return null;
  let upperCount = 0;
  for (const ch of letters) {
    if (/\p{Lu}/u.test(ch)) upperCount += 1;
  }
  const ratio = upperCount / letters.length;
  if (ratio < CAPS_MIN_RATIO) return null;
  return {
    code: "aggressive-caps",
    title: "Texto quase todo em CAIXA ALTA",
    detail: "Mais de 80% das letras estão em maiúsculas, o que costuma soar agressivo na leitura.",
    ratio: Number(ratio.toFixed(2)),
  };
}

/**
 * Analisa localmente um rascunho antes de assinar ou publicar, retornando apenas avisos consultivos.
 * Nunca bloqueia a publicação (`advisoryOnly: true`, `blocksPublish: false`) nem faz chamadas remotas.
 * @param {string} text Texto do rascunho a inspecionar localmente.
 * @returns {{ advisoryOnly: true, blocksPublish: false, hasWarnings: boolean, warnings: object[] }}
 * Resultado consultivo da inspeção local.
 */
export function analyzePrePublishAdvisory(text) {
  const normalized = typeof text === "string" ? text : "";
  const warnings = [
    detectPiiExposure(normalized),
    detectOpaqueOrInsecureLinks(normalized),
    detectAggressiveCaps(normalized),
  ].filter(Boolean);

  return {
    advisoryOnly: true,
    blocksPublish: false,
    hasWarnings: warnings.length > 0,
    warnings,
  };
}

/**
 * Renderiza o banner HTML consultivo do aviso local preventivo com todos os campos escapados via `escapeHtml`.
 * Inclui ação explícita para revisar o texto ou ignorar o aviso e publicar assim mesmo.
 * @param {{ hasWarnings?: boolean, warnings?: Array<{ code?: string, title?: string, detail?: string }> }|null} result
 * Resultado retornado por `analyzePrePublishAdvisory`.
 * @returns {string} Marcação HTML segura (`role="status"`) ou texto vazio quando não houver avisos.
 */
export function renderLocalAdvisoryBanner(result) {
  if (!result || !Array.isArray(result.warnings) || result.warnings.length === 0) {
    return "";
  }
  const items = result.warnings
    .map((w) => {
      const code = escapeHtml(w?.code || "advisory");
      const title = escapeHtml(w?.title || "Aviso consultivo");
      const detail = escapeHtml(w?.detail || "");
      return `<li data-advisory-code="${code}"><strong>${title}:</strong> ${detail}</li>`;
    })
    .join("");

  return [
    `<aside class="vox-local-advisory" role="status" aria-live="polite" data-advisory-only="true">`,
    `<p class="vox-local-advisory-heading">Aviso local consultivo (nunca bloqueia sua publicação):</p>`,
    `<ul class="vox-local-advisory-list">${items}</ul>`,
    `<div class="vox-local-advisory-actions">`,
    `<button type="button" class="vox-advisory-review" data-advisory-action="review">Revisar texto</button>`,
    `<button type="button" class="vox-advisory-ignore" data-advisory-action="publish-anyway">Ignorar e publicar assim mesmo</button>`,
    `</div>`,
    `</aside>`,
  ].join("");
}
