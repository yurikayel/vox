/**
 * @file Escape de texto para HTML e parte aleatória de ids locais. Lógica pura: sem DOM, sem estado e sem imports.
 *
 * `randomBase36` mora aqui (e não em `random-id.js`) porque módulo novo de `client/js` precisa entrar no
 * `SHELL_ASSETS` do `client/sw.js`, que estava travado por outros PRs. Pode virar `shared/random-id.js` no mesmo
 * PR que subir o `CACHE_NAME`.
 *
 * Fica fora de `render/` para o domínio usar sem importar a camada de UI.
 *
 * @module shared/html
 * @see docs/ARCHITECTURE.md (seção "Camadas")
 */

/**
 * Troca `& < > " '` por entidades, para o texto não virar marcação em HTML nem fechar um atributo.
 * @param {*} s Valor a escapar; valor falsy (`null`, `undefined`, `0`) vira texto vazio.
 * @returns {string} Texto escapado.
 */
export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i;

/**
 * Aceita apenas URL segura para imagem de avatar (`https:`, `http:`, `./` relativo ou `data:image/*` raster em base64).
 * Rejeita `javascript:`, `data:text/html`, `data:image/svg+xml` e caminhos protocol-relative (`//`).
 * @param {*} raw URL recebida de cartão ou rede.
 * @returns {string} URL normalizada ou vazio quando inválida.
 */
export function sanitizeMediaUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.startsWith("//")) return "";
  if (SAFE_DATA_IMAGE_RE.test(s)) return s;
  if (s.startsWith("./")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
/** Maior múltiplo de 36 até 256 (7 × 36): bytes a partir daqui são descartados para o sorteio não ter viés. */
const UNBIASED_LIMIT = 252;
const MAX_LENGTH = 64;

/**
 * Fonte padrão de bytes aleatórios do navegador (ou do Node nos testes).
 * @param {Uint8Array} bytes Buffer a preencher.
 * @returns {Uint8Array} O mesmo buffer, preenchido.
 */
function cryptoFill(bytes) {
  return globalThis.crypto.getRandomValues(bytes);
}

/**
 * Sorteia `length` caracteres em base 36 (`0-9a-z`) com `crypto.getRandomValues`, sem viés de módulo.
 * @param {number} length Quantidade de caracteres, de 1 a 64.
 * @param {(bytes: Uint8Array) => Uint8Array} [fill] Fonte de bytes; só para teste determinístico.
 * @returns {string} Texto de `length` caracteres.
 * @throws {RangeError} Se `length` não for inteiro entre 1 e 64.
 * @example randomBase36(8) // "k3f9x0qa"
 */
export function randomBase36(length, fill = cryptoFill) {
  if (!Number.isInteger(length) || length < 1 || length > MAX_LENGTH) {
    throw new RangeError(`randomBase36: tamanho entre 1 e ${MAX_LENGTH}, recebido ${length}`);
  }
  let out = "";
  while (out.length < length) {
    const bytes = fill(new Uint8Array((length - out.length) * 2));
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < UNBIASED_LIMIT) out += ALPHABET[bytes[i] % 36];
    }
  }
  return out;
}
