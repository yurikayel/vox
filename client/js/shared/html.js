/**
 * @file Escape de texto para HTML. Lógica pura: sem DOM, sem estado e sem imports.
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
