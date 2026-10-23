/**
 * Módulo de Feira Comunitária e Classificados (Fase M1).
 * Suporte a ofertas locais (Type: listing) sem intermediação de pagamento.
 */

export const LISTING_DISCLAIMER =
  "O Vox não intermedia pagamento nem cobra taxas. Combine no DM e use Pix direto.";

export function isCommercialEnabled(communityMeta) {
  if (!communityMeta) return false;
  if (communityMeta.commercialEnabled === true || communityMeta.commercialEnabled === "true") {
    return true;
  }
  if (communityMeta.tags && communityMeta.tags["Commercial-Posts"] === "enabled") {
    return true;
  }
  return false;
}

export function normalizePriceLabel(raw) {
  if (!raw) return "";
  const cleaned = String(raw).trim();
  if (!cleaned) return "";
  if (/^r\$/i.test(cleaned)) {
    return `R$ ${cleaned.replace(/^r\$\s*/i, "")}`.trim();
  }
  return `R$ ${cleaned}`;
}

export function normalizeLocationLabel(raw, maxLen = 60) {
  if (!raw) return "";
  return String(raw).trim().slice(0, maxLen);
}

export function formatListingStatus(status) {
  const s = String(status || "available").toLowerCase();
  if (s === "sold") return "Vendido";
  if (s === "reserved") return "Reservado";
  return "Disponível";
}

export function validateListingInput({ title, body, priceLabel } = {}) {
  const cleanTitle = String(title || "").trim();
  const cleanBody = String(body || "").trim();

  if (!cleanTitle) {
    return { valid: false, error: "Informe o título do produto ou serviço." };
  }
  if (cleanTitle.length > 120) {
    return { valid: false, error: "Título muito longo (máximo 120 caracteres)." };
  }
  if (!cleanBody) {
    return { valid: false, error: "Descreva o item ou oferta." };
  }
  return { valid: true, error: null };
}
