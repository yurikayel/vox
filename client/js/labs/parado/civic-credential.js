/**
 * @file Emissão, verificação e badge HTML de credenciais cívicas (laboratório).
 * @module labs/parado/civic-credential
 */
import { computeBlobHash } from "../../media-blob.js";
import { escapeHtml } from "../../shared/html.js";

/**
 * Versão do esquema canônico da credencial.
 * @type {string}
 */
export const CREDENTIAL_SCHEMA_VERSION = "vox-civic-cred-v1";

function validateAndNormalizeCredentialInput(params = {}) {
  const cleanIssuer = String(params.issuerRouteId || "").trim();
  const cleanRecipient = String(params.recipientRouteId || "").trim();
  if (!cleanIssuer || !cleanRecipient) {
    throw new Error("Emissor e destinatário são obrigatórios para emissão de credencial");
  }
  const cleanCourse = String(params.courseTitle || "Formação em Soberania Digital").trim();
  if (!cleanCourse) {
    throw new Error("Título da formação é obrigatório");
  }
  return {
    cleanIssuer,
    cleanRecipient,
    cleanCourse,
    issuerName: String(params.issuerName || "Comitê Popular").trim(),
    recipientName: String(params.recipientName || "Militante").trim(),
    workloadHours: Number(params.workloadHours) || 8,
    skills: Array.isArray(params.skills) ? [...params.skills] : ["Soberania Digital", "Criptografia Local"],
  };
}

function buildCredentialArweaveTags(id, hash, issuer, recipient) {
  return [
    { name: "App-Name", value: "vox-civic-credential" },
    { name: "Type", value: "civic-credential" },
    { name: "Credential-Id", value: id },
    { name: "Credential-Hash", value: hash },
    { name: "Issuer", value: issuer },
    { name: "Recipient", value: recipient },
  ];
}

/**
 * Gera credencial assinável com hash determinístico do payload canônico.
 * @param {object} params Campos da formação.
 * @param {string} params.issuerRouteId Rota do emissor.
 * @param {string} params.recipientRouteId Rota do destinatário.
 * @param {string} [params.courseTitle] Nome do curso.
 * @param {string} [params.issuerName] Nome exibido do emissor.
 * @param {string} [params.recipientName] Nome exibido do destinatário.
 * @param {number} [params.workloadHours] Carga horária.
 * @param {string[]} [params.skills] Competências listadas.
 * @returns {Promise<object>} Objeto de credencial com `credentialHash` e tags Arweave.
 * @throws {Error} Quando faltam emissor, destinatário ou título.
 */
export async function issueCivicCredential(params) {
  const norm = validateAndNormalizeCredentialInput(params);
  const issuedAt = Date.now();
  const canonicalPayload = JSON.stringify({
    schema: CREDENTIAL_SCHEMA_VERSION,
    issuer: norm.cleanIssuer,
    recipient: norm.cleanRecipient,
    courseTitle: norm.cleanCourse,
    workloadHours: norm.workloadHours,
    skills: [...norm.skills].sort(),
    issuedAt,
  });

  const credentialHash = await computeBlobHash(canonicalPayload);
  const credentialId = `cred_${credentialHash.slice(0, 16)}`;

  return {
    schema: CREDENTIAL_SCHEMA_VERSION,
    id: credentialId,
    credentialHash,
    issuer: { routeId: norm.cleanIssuer, name: norm.issuerName },
    recipient: { routeId: norm.cleanRecipient, name: norm.recipientName },
    courseTitle: norm.cleanCourse,
    workloadHours: norm.workloadHours,
    skills: norm.skills,
    issuedAt,
    arweaveTags: buildCredentialArweaveTags(credentialId, credentialHash, norm.cleanIssuer, norm.cleanRecipient),
  };
}

/**
 * Recalcula o hash e confere integridade da credencial.
 * @param {object|null|undefined} credential Credencial emitida.
 * @returns {Promise<{isValid: boolean, reason: string, credentialId?: string, issuer?: object, recipient?: object, courseTitle?: string}>}
 */
export async function verifyCivicCredential(credential) {
  if (!credential || !credential.credentialHash || !credential.issuer?.routeId || !credential.recipient?.routeId) {
    return { isValid: false, reason: "Estrutura de credencial cívica inválida ou incompleta" };
  }

  const canonicalPayload = JSON.stringify({
    schema: credential.schema || CREDENTIAL_SCHEMA_VERSION,
    issuer: credential.issuer.routeId,
    recipient: credential.recipient.routeId,
    courseTitle: credential.courseTitle,
    workloadHours: Number(credential.workloadHours) || 1,
    skills: Array.isArray(credential.skills) ? [...credential.skills].sort() : [],
    issuedAt: credential.issuedAt,
  });

  const computedHash = await computeBlobHash(canonicalPayload);
  const isMatch = computedHash === credential.credentialHash;

  return {
    isValid: isMatch,
    credentialId: credential.id,
    issuer: credential.issuer,
    recipient: credential.recipient,
    courseTitle: credential.courseTitle,
    reason: isMatch ? "Credencial autêntica e íntegra" : "Hash da credencial diverge do conteúdo",
  };
}

/**
 * Card HTML para exibir credencial aprovada.
 * @param {object|null|undefined} credential Credencial com hash e metadados.
 * @returns {string} HTML ou string vazia se inválido.
 */
export function renderCivicCredentialBadgeHtml(credential) {
  if (!credential?.credentialHash) return "";
  const dateStr = credential.issuedAt
    ? new Date(credential.issuedAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  const skillsHtml = Array.isArray(credential.skills)
    ? credential.skills.map((s) => `<span class="badge-pill" style="font-size:0.7rem; margin-right:4px;">${escapeHtml(s)}</span>`).join("")
    : "";

  return `
    <div class="card civic-credential-card" style="margin:10px 0; padding:12px 16px; border:1px solid #16a34a; background:rgba(22, 163, 74, 0.05); border-radius:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:1.2rem;">🎓</span>
          <strong style="font-size:0.9rem; color:#15803d;">Certificado Cívico Popular</strong>
        </div>
        <span class="meta" style="font-size:0.75rem;">${escapeHtml(dateStr)}</span>
      </div>
      <p style="margin:6px 0 4px; font-size:0.86rem; font-weight:600;">${escapeHtml(credential.courseTitle)}</p>
      <div class="meta" style="font-size:0.78rem;">
        Conferido a <strong>${escapeHtml(credential.recipient?.name || "Militante")}</strong> por <strong>${escapeHtml(credential.issuer?.name || "Comitê")}</strong> (${credential.workloadHours} horas).
      </div>
      ${skillsHtml ? `<div style="margin-top:6px;">${skillsHtml}</div>` : ""}
    </div>`;
}