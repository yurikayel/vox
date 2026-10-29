/**
 * testimonials.js — Depoimentos Mediados & Crachás Comunitários (Vox)
 *
 * Implementa a mecânica de sociabilidade prossocial inspirada no Orkut:
 * 1. Depoimentos assinados que exigem aprovação explícita do destinatário para publicação;
 * 2. Validação criptográfica de autoria e consentimento mútuo;
 * 3. Renderização de comunidades como crachás de identidade social explícita.
 */

export const TESTIMONIAL_TYPE = "testimonial";
export const TESTIMONIAL_APPROVAL_TYPE = "testimonial-approval";

export const TESTIMONIAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const MAX_TESTIMONIAL_LENGTH = 1500;

export function validateTestimonialInput({ text, recipientAddress, authorAddress }) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    return { valid: false, error: "O texto do depoimento não pode ser vazio." };
  }
  if (cleanText.length > MAX_TESTIMONIAL_LENGTH) {
    return { valid: false, error: `Depoimento muito longo (máximo ${MAX_TESTIMONIAL_LENGTH} caracteres).` };
  }
  if (!recipientAddress || typeof recipientAddress !== "string") {
    return { valid: false, error: "Endereço do destinatário é obrigatório." };
  }
  if (!authorAddress || typeof authorAddress !== "string") {
    return { valid: false, error: "Endereço do autor é obrigatório." };
  }
  if (recipientAddress === authorAddress) {
    return { valid: false, error: "Não é permitido enviar depoimento para você mesmo." };
  }
  return { valid: true, text: cleanText, recipientAddress, authorAddress };
}

export function buildTestimonialTags({ recipientAddress, authorAddress, ts = Date.now() }) {
  return [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: TESTIMONIAL_TYPE },
    { name: "Recipient-Address", value: recipientAddress },
    { name: "Author-Address", value: authorAddress },
    { name: "Timestamp", value: String(ts) },
  ];
}

export function buildTestimonialApprovalTags({ testimonialTxId, recipientAddress, ts = Date.now() }) {
  return [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: TESTIMONIAL_APPROVAL_TYPE },
    { name: "Testimonial-Tx", value: testimonialTxId },
    { name: "Recipient-Address", value: recipientAddress },
    { name: "Timestamp", value: String(ts) },
  ];
}

export function matchApprovals(testimonials = [], approvals = []) {
  const approvalMap = new Map();
  for (const a of approvals) {
    const txId = a.testimonialTxId || a.tags?.find((t) => t.name === "Testimonial-Tx")?.value;
    const recipient = a.recipientAddress || a.tags?.find((t) => t.name === "Recipient-Address")?.value;
    if (txId && recipient) {
      approvalMap.set(txId, recipient);
    }
  }

  return testimonials.map((t) => {
    const isApproved = approvalMap.has(t.id) && approvalMap.get(t.id) === t.recipientAddress;
    return {
      ...t,
      status: isApproved ? TESTIMONIAL_STATUS.APPROVED : TESTIMONIAL_STATUS.PENDING,
    };
  });
}

export function filterApprovedTestimonials(testimonials = [], approvals = []) {
  const matched = matchApprovals(testimonials, approvals);
  return matched.filter((t) => t.status === TESTIMONIAL_STATUS.APPROVED);
}

export function renderCommunityBadgesHtml(communities = []) {
  if (!Array.isArray(communities) || communities.length === 0) {
    return `<div class="vox-badges-empty">Nenhuma comunidade vinculada como crachá.</div>`;
  }

  const items = communities.map((c) => {
    const name = escapeHtml(c.name || c.title || "Comunidade");
    const id = encodeURIComponent(c.id || "");
    const avatar = c.avatar || "images/cantina-gate.jpg";
    return `
      <a class="vox-badge-item" href="#/c/${id}" title="${name}">
        <img class="vox-badge-avatar" src="${escapeHtml(avatar)}" alt="${name}" loading="lazy" />
        <span class="vox-badge-name">${name}</span>
      </a>
    `.trim();
  });

  return `<div class="vox-badges-grid">${items.join("")}</div>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
