/**
 * @file Empacotamento portátil `.voxrpg.zip` (método STORE, zero dependências, compatível com Vault Obsidian)
 * e backup cifrado opcional via Senha Soberana (`vault/envelope.js`).
 * @module dungeon/vtt-portable
 */
import { sha256Hex } from "../rpg-crypto-table.js";
import { decryptVaultRecord, encryptVaultV2 } from "../vault/envelope.js";
import { chronicleToMarkdown, exportNoteCanvas, noteToMarkdown, sheetToMarkdown } from "./obsidian-bridge.js";
import { createCampaign, validateCampaignDoc } from "./vtt-schema.js";

/** Tamanho máximo aceito por entrada no ZIP (16 MiB — INV-4/INV-6). */
export const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
/** Tamanho máximo somado aceito por pacote ZIP (64 MiB — anti-OOM). */
export const MAX_ZIP_TOTAL_BYTES = 64 * 1024 * 1024;
/** Quantidade máxima de arquivos aceita por pacote `.voxrpg.zip`. */
export const MAX_ZIP_ENTRIES = 512;
/** Tipo de envelope para backup cifrado de campanha via Senha Soberana. */
export const VOXRPG_ENCRYPTED_KIND = "voxrpg-encrypted-v1";
const MIN_BACKUP_PASS_LEN = 12;

const ENC = new TextEncoder();
const DEC = new TextDecoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * Calcula o CRC32 IEEE-802.3 de um vetor de bytes.
 * @param {Uint8Array} bytes Dados de entrada.
 * @returns {number} Inteiro sem sinal de 32 bits.
 */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function assertSafeZipPath(name) {
  const s = String(name || "");
  if (!s || s.startsWith("/") || s.includes("\\") || s.includes("..") || s.includes("\0")) {
    throw new Error(`Caminho inválido no ZIP: "${s}".`);
  }
}

function concatChunks(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function buildLocalHeader(nameBytes, dataBytes, crc) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, dataBytes.length, true);
  view.setUint32(22, dataBytes.length, true);
  view.setUint16(26, nameBytes.length, true);
  header.set(nameBytes, 30);
  return header;
}

function buildCentralHeader(nameBytes, size, crc, offset) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  header.set(nameBytes, 46);
  return header;
}

function buildEocd(count, cdSize, cdOffset) {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, cdSize, true);
  view.setUint32(16, cdOffset, true);
  return eocd;
}

/**
 * Empacota entradas `{ name, data }` em um arquivo ZIP padrão método STORE (0).
 * @param {Array<{ name: string, data: Uint8Array|string }>} entries Arquivos do pacote.
 * @returns {Uint8Array} Bytes do arquivo `.zip`.
 */
export function encodeZipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    assertSafeZipPath(entry.name);
    const nameBytes = ENC.encode(entry.name);
    const dataBytes = entry.data instanceof Uint8Array ? entry.data : ENC.encode(String(entry.data ?? ""));
    const crc = crc32(dataBytes);
    const local = buildLocalHeader(nameBytes, dataBytes, crc);
    locals.push(local, dataBytes);
    centrals.push(buildCentralHeader(nameBytes, dataBytes.length, crc, offset));
    offset += local.length + dataBytes.length;
  }
  const cdBytes = concatChunks(centrals);
  return concatChunks([...locals, cdBytes, buildEocd(entries.length, cdBytes.length, offset)]);
}

function findEocdOffset(bytes) {
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

function readZipEntryAt(bytes, view, cdPos) {
  if (cdPos < 0 || cdPos + 46 > bytes.length || view.getUint32(cdPos, true) !== 0x02014b50) {
    throw new Error("Diretório central do ZIP corrompido.");
  }
  const method = view.getUint16(cdPos + 10, true);
  if (method !== 0) throw new Error(`Método ZIP não suportado (${method}); esperado STORE (0).`);
  const expectedCrc = view.getUint32(cdPos + 16, true);
  const size = view.getUint32(cdPos + 20, true);
  if (size > MAX_ZIP_ENTRY_BYTES) throw new Error("Entrada do ZIP excede o limite de tamanho.");
  const nameLen = view.getUint16(cdPos + 28, true);
  const extraLen = view.getUint16(cdPos + 30, true);
  const commentLen = view.getUint16(cdPos + 32, true);
  const localOffset = view.getUint32(cdPos + 42, true);
  if (cdPos + 46 + nameLen + extraLen + commentLen > bytes.length) throw new Error("Entrada do diretório central truncada.");
  const name = DEC.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
  assertSafeZipPath(name);
  if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error(`Cabeçalho local inválido para "${name}".`);
  }
  const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
  if (dataStart + size > bytes.length) throw new Error(`Conteúdo truncado para "${name}".`);
  const data = bytes.slice(dataStart, dataStart + size);
  if (crc32(data) !== expectedCrc) throw new Error(`CRC32 inválido para "${name}".`);
  return { name, data, nextCdPos: cdPos + 46 + nameLen + extraLen + commentLen };
}

/**
 * Decodifica e valida estritamente um arquivo ZIP STORE (magic bytes, CRC32, limites, duplicatas e path traversal).
 * @param {Uint8Array} zipBytes Bytes brutos do arquivo ZIP.
 * @returns {Map<string, Uint8Array>} Mapa `caminho -> bytes`.
 */
export function decodeZipStore(zipBytes) {
  if (!(zipBytes instanceof Uint8Array) || zipBytes.length < 22) throw new Error("Arquivo ZIP inválido ou truncado.");
  const eocdPos = findEocdOffset(zipBytes);
  if (eocdPos < 0) throw new Error("Assinatura EOCD ausente: não é um ZIP válido.");
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const count = view.getUint16(eocdPos + 10, true);
  const cdOffset = view.getUint32(eocdPos + 16, true);
  if (count > MAX_ZIP_ENTRIES) throw new Error(`ZIP excede o teto de ${MAX_ZIP_ENTRIES} entradas.`);
  if (cdOffset > eocdPos) throw new Error("Offset do diretório central inválido.");
  const out = new Map();
  let pos = cdOffset;
  let totalBytes = 0;
  for (let i = 0; i < count; i += 1) {
    const entry = readZipEntryAt(zipBytes, view, pos);
    if (out.has(entry.name)) throw new Error(`Entrada duplicada no ZIP: "${entry.name}".`);
    totalBytes += entry.data.length;
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new Error("Tamanho total do ZIP excede o teto de segurança.");
    out.set(entry.name, entry.data);
    pos = entry.nextCdPos;
  }
  return out;
}

/**
 * Empacota uma campanha completa em `.voxrpg.zip` (Vault Obsidian + `campaign.json` + `manifest.json` SHA-256).
 * @param {object} campaign Documento `CampaignDoc`.
 * @param {Map<string, Uint8Array>} [blobs] Blobs binários opcionais (`sha256 -> Uint8Array`).
 * @param {{ includeGmSecrets?: boolean }} [opts={}] Se `false`, omite segredos GM nos `.md`.
 * @returns {Promise<Uint8Array>} Bytes do arquivo `.voxrpg.zip`.
 */
export async function packVoxRpg(campaign, blobs = new Map(), { includeGmSecrets = true } = {}) {
  const valid = validateCampaignDoc(campaign);
  if (!valid.valid) throw new Error(valid.error);
  const rawEntries = [{ name: "campaign.json", data: ENC.encode(JSON.stringify(campaign, null, 2)) }];
  for (const sheet of Object.values(campaign.sheetsById || {})) {
    rawEntries.push({ name: `fichas/${sheet.character_id}.md`, data: ENC.encode(sheetToMarkdown(sheet, { includeGmNotes: includeGmSecrets })) });
  }
  for (const note of Object.values(campaign.notesById || {})) {
    rawEntries.push({ name: `notas/${note.id}.md`, data: ENC.encode(noteToMarkdown(note, { includeGmSecrets })) });
    const canvas = exportNoteCanvas(note);
    if (canvas) rawEntries.push({ name: `mapas/${note.id}.canvas`, data: ENC.encode(canvas) });
  }
  rawEntries.push({ name: "sessoes/cronica.md", data: ENC.encode(chronicleToMarkdown(campaign, { includePrivate: includeGmSecrets })) });
  for (const [hash, bytes] of blobs instanceof Map ? blobs.entries() : []) {
    rawEntries.push({ name: `assets/${hash}`, data: bytes });
  }
  const files = {};
  for (const item of rawEntries) files[item.name] = await sha256Hex(item.data);
  const manifest = { format: "voxrpg-zip-v1", campaignId: campaign.id, exportedAt: Date.now(), files };
  return encodeZipStore([{ name: "manifest.json", data: ENC.encode(JSON.stringify(manifest, null, 2)) }, ...rawEntries]);
}

async function verifyManifestHashes(filesMap, manifest) {
  if (!manifest?.files || typeof manifest.files !== "object") throw new Error("Manifesto inválido no pacote .voxrpg.zip.");
  if (typeof manifest.files["campaign.json"] !== "string") throw new Error("Manifesto não declara o hash de campaign.json.");
  for (const name of filesMap.keys()) {
    if (name !== "manifest.json" && !(name in manifest.files)) {
      throw new Error(`Arquivo não declarado no manifesto: "${name}".`);
    }
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = filesMap.get(name);
    if (!bytes) throw new Error(`Arquivo declarado ausente no pacote: "${name}".`);
    const actual = await sha256Hex(bytes);
    if (actual !== expected) throw new Error(`Hash SHA-256 inválido para "${name}".`);
  }
}

/**
 * Desempacota e verifica um `.voxrpg.zip` (confere `manifest.json`, SHA-256 de cada arquivo e schema da campanha).
 * @param {Uint8Array} zipBytes Bytes do pacote `.voxrpg.zip`.
 * @returns {Promise<{ campaign: object, blobs: Map<string, Uint8Array>, manifest: object, markdownFiles: Map<string, string> }>} Conteúdo validado.
 */
export async function unpackVoxRpg(zipBytes) {
  const filesMap = decodeZipStore(zipBytes);
  const manifestRaw = filesMap.get("manifest.json");
  const campaignRaw = filesMap.get("campaign.json");
  if (!manifestRaw || !campaignRaw) throw new Error("Pacote .voxrpg.zip incompleto (falta manifest.json ou campaign.json).");
  const manifest = JSON.parse(DEC.decode(manifestRaw));
  await verifyManifestHashes(filesMap, manifest);
  const parsed = JSON.parse(DEC.decode(campaignRaw));
  const check = validateCampaignDoc(parsed);
  if (!check.valid) throw new Error(check.error);
  const blobs = new Map();
  const markdownFiles = new Map();
  for (const [name, bytes] of filesMap.entries()) {
    if (name.startsWith("assets/")) blobs.set(name.slice("assets/".length), bytes);
    else if (name.endsWith(".md")) markdownFiles.set(name, DEC.decode(bytes));
    else if (name.endsWith(".canvas") && name.startsWith("mapas/")) {
      const noteId = name.slice("mapas/".length, -".canvas".length);
      const campaignNote = parsed.notesById?.[noteId];
      if (campaignNote) parsed.notesById[noteId] = { ...campaignNote, canvasJson: JSON.parse(DEC.decode(bytes)) };
    }
  }
  // O estado Fairplay de um arquivo importado não é verificável: descartado (volta a ser refeito pelas ops da mesa).
  return { campaign: createCampaign({ ...parsed, fairplay: null }), blobs, manifest, markdownFiles };
}

function bytesToBase64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Empacota a campanha em `.voxrpg.zip` e a cifra com a Senha Soberana (`vault/envelope.js`, PBKDF2 600k + AES-GCM).
 * @param {object} campaign Documento `CampaignDoc`.
 * @param {string} passphrase Senha Soberana (mínimo 12 caracteres).
 * @param {Map<string, Uint8Array>} [blobs] Blobs binários opcionais.
 * @returns {Promise<string>} JSON do envelope cifrado `.voxrpg.enc`.
 */
export async function packEncryptedVoxRpg(campaign, passphrase, blobs = new Map()) {
  const clean = String(passphrase || "").trim();
  if (clean.length < MIN_BACKUP_PASS_LEN) throw new Error(`Use uma Senha Soberana com pelo menos ${MIN_BACKUP_PASS_LEN} caracteres.`);
  const zipBytes = await packVoxRpg(campaign, blobs);
  const record = await encryptVaultV2({ zipB64: bytesToBase64(zipBytes), campaignId: campaign.id }, clean);
  return JSON.stringify({ kind: VOXRPG_ENCRYPTED_KIND, record }, null, 2);
}

/**
 * Abre um backup cifrado `.voxrpg.enc` usando a Senha Soberana e valida o `.voxrpg.zip` interno.
 * @param {string|object} rawEnvelope Texto JSON ou objeto do envelope cifrado.
 * @param {string} passphrase Senha Soberana.
 * @returns {Promise<{ campaign: object, blobs: Map<string, Uint8Array>, manifest: object, markdownFiles: Map<string, string> }>} Campanha restaurada.
 */
export async function unpackEncryptedVoxRpg(rawEnvelope, passphrase) {
  const parsed = typeof rawEnvelope === "string" ? JSON.parse(rawEnvelope) : rawEnvelope;
  if (parsed?.kind !== VOXRPG_ENCRYPTED_KIND || !parsed?.record) throw new Error("Formato de backup cifrado inválido.");
  const payload = await decryptVaultRecord(parsed.record, String(passphrase || "").trim());
  if (!payload?.zipB64) throw new Error("Backup cifrado corrompido.");
  return unpackVoxRpg(base64ToBytes(payload.zipB64));
}
