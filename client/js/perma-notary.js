/**
 * @file Cartório cívico Perma-Notary: prova de existência de atas na Arweave.
 *
 * Hash canônico, registro assinável e selo HTML verificável.
 */
import { computeBlobHash } from "./media-blob.js";
import { escapeHtml } from "./shared/html.js";

/** Versão do protocolo de notário cívico. @type {string} */
export const NOTARY_PROTOCOL = "vox-notary-v1";

/**
 * Normaliza texto para hash estável (fins de linha e espaços nas bordas).
 * @param {string} text Texto bruto.
 * @returns {string}
 */
export function canonicalizeDocumentText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function buildNotaryArweaveTags(documentHash, communityId, timestamp) {
  return [
    { name: "App-Name", value: "vox-perma-notary" },
    { name: "Protocol", value: NOTARY_PROTOCOL },
    { name: "Document-Hash", value: documentHash },
    { name: "Type", value: "civic-notary-record" },
    { name: "Community-Id", value: communityId },
    { name: "Unix-Time", value: String(timestamp) },
  ];
}

function sanitizeWitnesses(witnesses) {
  if (!Array.isArray(witnesses)) return [];
  return [...new Set(witnesses.map((w) => String(w || "").trim()).filter(Boolean))];
}

/**
 * Cria registro de cartório com hash SHA-256 e metadados para tags Arweave.
 * @param {object} [options={}]
 * @param {string} [options.title] Título curto do documento.
 * @param {string} [options.bodyText] Corpo do documento.
 * @param {string} [options.author] Autoria exibida.
 * @param {string} [options.communityId] Comunidade associada.
 * @param {string[]} [options.witnesses] Rotas ou ids de testemunhas.
 * @returns {Promise<object>}
 * @throws {Error} Se o corpo canônico ficar vazio.
 */
export async function createCivicNotaryRecord({
  title = "Ata de Deliberação Comunitária",
  bodyText = "",
  author = "",
  communityId = "",
  witnesses = [],
} = {}) {
  const canonical = canonicalizeDocumentText(bodyText);
  if (!canonical) {
    throw new Error("Texto do documento não pode ser vazio para cartório cívico");
  }

  const documentHash = await computeBlobHash(canonical);
  const timestamp = Date.now();
  const cleanWitnesses = sanitizeWitnesses(witnesses);

  return {
    protocol: NOTARY_PROTOCOL,
    type: "civic-notary-record",
    documentHash,
    title: String(title || "").trim().slice(0, 160),
    author: String(author || "").trim(),
    communityId: String(communityId || "").trim().toLowerCase(),
    timestamp,
    witnessCount: cleanWitnesses.length,
    witnesses: cleanWitnesses,
    byteLength: new TextEncoder().encode(canonical).byteLength,
    arweaveTags: buildNotaryArweaveTags(documentHash, communityId, timestamp),
  };
}

/**
 * Valida a autenticidade de um texto contra um registro de cartório cívico.
 */
/**
 * Compara texto atual ao hash gravado no registro de cartório.
 * @param {object} notaryRecord Registro emitido por {@link createCivicNotaryRecord}.
 * @param {string} [currentText=""] Texto a verificar.
 * @returns {Promise<{ isValid: boolean, reason: string, expectedHash?: string, computedHash?: string, timestamp?: number }>}
 */
export async function verifyCivicNotaryRecord(notaryRecord, currentText = "") {
  if (!notaryRecord || !notaryRecord.documentHash) {
    return {
      isValid: false,
      reason: "Registro de cartório ausente ou inválido",
    };
  }

  const canonical = canonicalizeDocumentText(currentText);
  if (!canonical) {
    return {
      isValid: false,
      reason: "Texto fornecido para verificação está vazio",
    };
  }

  const computedHash = await computeBlobHash(canonical);
  const isMatch = computedHash === notaryRecord.documentHash;

  return {
    isValid: isMatch,
    expectedHash: notaryRecord.documentHash,
    computedHash,
    timestamp: notaryRecord.timestamp,
    reason: isMatch
      ? "Documento autêntico e íntegro (100% idêntico ao carimbo permanente)"
      : "Documento adulterado ou divergente do carimbo original da Arweave",
  };
}

function formatNotaryDate(timestamp) {
  if (!timestamp) return "Data registrada";
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renderiza o selo visual de cartório popular para inclusão em atas e posts.
 */
/**
 * HTML do selo de ata cívica para embutir em posts.
 * @param {object} notaryRecord Registro com `documentHash` e `timestamp`.
 * @param {object} [options={}]
 * @param {boolean} [options.isVerified=true] Se a verificação local passou.
 * @returns {string} HTML ou string vazia sem registro válido.
 */
export function renderNotaryBadgeHtml(notaryRecord, { isVerified = true } = {}) {
  if (!notaryRecord?.documentHash) return "";
  const shortHash = notaryRecord.documentHash.slice(0, 12);
  const dateStr = formatNotaryDate(notaryRecord.timestamp);
  const statusCls = isVerified ? "notary-badge--verified" : "notary-badge--tampered";
  const icon = isVerified ? "📜" : "⚠️";
  const label = isVerified ? "Ata Cívica Imutável" : "Carimbo Divergente";

  return `
    <div class="card notary-badge ${statusCls}" style="margin:10px 0; padding:10px 14px; border-left:4px solid var(--accent, #2563eb); background:var(--surface-soft, rgba(0,0,0,0.03)); border-radius:6px;" data-hash="${escapeHtml(notaryRecord.documentHash)}">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:1.15rem;" aria-hidden="true">${icon}</span>
          <strong style="font-size:0.85rem;">${escapeHtml(label)}</strong>
          <span class="badge-pill" style="font-size:0.72rem; padding:2px 6px;">Arweave Free</span>
        </div>
        <span class="meta" style="font-size:0.75rem;">${escapeHtml(dateStr)}</span>
      </div>
      <div style="margin-top:6px; font-size:0.76rem; color:var(--text-muted, #64748b); font-family:monospace; word-break:break-all;">
        sha256:${escapeHtml(shortHash)}…${escapeHtml(notaryRecord.documentHash.slice(-6))}
        ${notaryRecord.witnessCount ? ` · <span>👥 ${notaryRecord.witnessCount} testemunhas</span>` : ""}
      </div>
    </div>`;
}
