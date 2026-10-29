/**
 * Vox Civic Credential — Certificados Populares e Credenciais Cívicas de Formação.
 * Permite emissão e validação descentralizada de certificados para cursos, mutirões
 * e capacitações de movimentos populares (letramento digital, arquitetura aberta).
 */
import { computeBlobHash } from "./media-blob.js";
import { escapeHtml } from "./render/util.js";

export const CREDENTIAL_SCHEMA_VERSION = "vox-civic-cred-v1";

export async function issueCivicCredential({
  issuerRouteId = "",
  issuerName = "Comitê Popular",
  recipientRouteId = "",
  recipientName = "Militante",
  courseTitle = "Formação em Soberania Digital",
  workloadHours = 8,
  skills = ["Soberania Digital", "Criptografia Local"],
} = {}) {
  const cleanIssuer = String(issuerRouteId || "").trim();
  const cleanRecipient = String(recipientRouteId || "").trim();
  if (!cleanIssuer || !cleanRecipient) {
    throw new Error("Emissor e destinatário são obrigatórios para emissão de credencial");
  }

  const cleanCourse = String(courseTitle || "").trim();
  if (!cleanCourse) {
    throw new Error("Título da formação é obrigatório");
  }

  const issuedAt = Date.now();
  const canonicalPayload = JSON.stringify({
    schema: CREDENTIAL_SCHEMA_VERSION,
    issuer: cleanIssuer,
    recipient: cleanRecipient,
    courseTitle: cleanCourse,
    workloadHours: Number(workloadHours) || 1,
    skills: Array.isArray(skills) ? skills.sort() : [],
    issuedAt,
  });

  const credentialHash = await computeBlobHash(canonicalPayload);
  const credentialId = `cred_${credentialHash.slice(0, 16)}`;

  return {
    schema: CREDENTIAL_SCHEMA_VERSION,
    id: credentialId,
    credentialHash,
    issuer: {
      routeId: cleanIssuer,
      name: String(issuerName || "Comitê").trim(),
    },
    recipient: {
      routeId: cleanRecipient,
      name: String(recipientName || "Estudante").trim(),
    },
    courseTitle: cleanCourse,
    workloadHours: Number(workloadHours) || 1,
    skills: Array.isArray(skills) ? skills : [],
    issuedAt,
    arweaveTags: [
      { name: "App-Name", value: "vox-civic-credential" },
      { name: "Type", value: "civic-credential" },
      { name: "Credential-Id", value: credentialId },
      { name: "Credential-Hash", value: credentialHash },
      { name: "Issuer", value: cleanIssuer },
      { name: "Recipient", value: cleanRecipient },
    ],
  };
}

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
