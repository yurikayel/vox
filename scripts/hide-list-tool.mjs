#!/usr/bin/env node
/**
 * @file LAN-13 — Official PWA signed hide-list CLI & AR.IO blocklist exporter.
 *
 * Signs, verifies, and exports versioned global hide-lists using Ed25519 over
 * deterministic recursive canonical JSON (`schemaVersion: 1`).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const MAX_REASON_CODE_LEN = 80;
const ED25519_SIG_BYTES = 64;

const TARGET_TYPES = new Set(["tx", "post", "profile", "community"]);
const CATEGORIES = new Set([
  "csam",
  "terrorism",
  "non-consensual-intimate",
  "doxxing-lgpd",
  "judicial-order",
  "fraud-phishing",
  "other",
]);
const STATUSES = new Set(["active", "retracted"]);

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL_PII_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CPF_PII_RE = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/;

/**
 * Diz se o valor é um objeto simples (não nulo e não array).
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Diz se o valor é texto não vazio com no máximo `maxLen` caracteres.
 * @param {unknown} value Valor a testar.
 * @param {number} maxLen Tamanho máximo, em caracteres.
 * @returns {boolean}
 */
function isNonEmptyString(value, maxLen) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

/**
 * Diz se o valor é um timestamp ISO válido.
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isIsoTimestamp(value) {
  return typeof value === "string" && ISO_TIMESTAMP_RE.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * Diz se o texto contém dado pessoal (e-mail ou CPF).
 * @param {string} text Texto a examinar.
 * @returns {boolean}
 */
function containsPii(text) {
  return EMAIL_PII_RE.test(text) || CPF_PII_RE.test(text);
}

/**
 * Valida um código de motivo: texto curto, sem quebra de linha e sem dado pessoal.
 * @param {unknown} value Valor a testar.
 * @returns {boolean}
 */
function isValidReasonCode(value) {
  if (!isNonEmptyString(value, MAX_REASON_CODE_LEN)) return false;
  if (/[\r\n\t]/.test(value)) return false;
  return !containsPii(value);
}

/**
 * Copia o valor ordenando as chaves dos objetos, para a assinatura ser determinística.
 * @param {unknown} value Valor a ordenar.
 * @returns {unknown}
 */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  const out = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = sortDeep(value[key]);
  }
  return out;
}

/**
 * Serializes any JSON-compatible value with recursively sorted object keys.
 * @param {unknown} value Input value to canonicalize.
 * @returns {string} Deterministic JSON string.
 */
export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

const ENTRY_RULES = [
  ["id", (v) => isNonEmptyString(v, 128), "must be a non-empty string (<=128)"],
  ["targetType", (v) => TARGET_TYPES.has(v), "must be tx|post|profile|community"],
  ["target", (v) => isNonEmptyString(v, 256), "must be a non-empty string (<=256)"],
  ["category", (v) => CATEGORIES.has(v), "invalid category"],
  ["reasonCode", isValidReasonCode, "must be <=80 chars without control chars or PII"],
  ["issuedAt", isIsoTimestamp, "must be a valid ISO-8601 timestamp"],
  ["status", (v) => STATUSES.has(v), "must be active|retracted"],
];

/**
 * Valida uma entrada da lista de ocultação e devolve os erros (lista vazia se válida).
 * @param {unknown} entry Entrada bruta.
 * @param {number} index Posição na lista, usada nas mensagens.
 * @returns {string[]}
 */
function validateEntry(entry, index) {
  if (!isPlainObject(entry)) return [`entries[${index}] must be an object`];
  const errors = [];
  for (const [field, check, msg] of ENTRY_RULES) {
    if (!check(entry[field])) errors.push(`entries[${index}].${field} ${msg}`);
  }
  if (entry.appealRef !== undefined) {
    if (!isNonEmptyString(entry.appealRef, 128) || containsPii(entry.appealRef)) {
      errors.push(`entries[${index}].appealRef must be a non-empty string (<=128) without PII`);
    }
  }
  return errors;
}

/**
 * Validates a hide-list manifest against schemaVersion 1 and zero-PII rules.
 * @param {unknown} manifest Hide-list manifest object.
 * @returns {{ ok: boolean, errors: string[] }} Validation result and error list.
 */
export function validateHideList(manifest) {
  if (!isPlainObject(manifest)) return { ok: false, errors: ["manifest must be an object"] };
  const errors = [];
  if (manifest.schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!Number.isInteger(manifest.listVersion) || manifest.listVersion < 1) {
    errors.push("listVersion must be an integer >= 1");
  }
  if (!isIsoTimestamp(manifest.updatedAt)) errors.push("updatedAt must be a valid ISO-8601 timestamp");
  if (!isNonEmptyString(manifest.issuer, 128) || containsPii(manifest.issuer)) {
    errors.push("issuer must be a non-empty string (<=128) without PII");
  }
  if (!Array.isArray(manifest.entries)) {
    errors.push("entries must be an array");
  } else {
    manifest.entries.forEach((entry, idx) => errors.push(...validateEntry(entry, idx)));
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Lê a chave privada Ed25519 em PEM.
 * @param {string} privateKeyPem Chave privada em PEM.
 * @returns {crypto.KeyObject}
 */
function parseEd25519PrivateKey(privateKeyPem) {
  if (!isNonEmptyString(privateKeyPem, 16384)) {
    throw new Error("privateKeyPem must be a non-empty PEM string");
  }
  const key = crypto.createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Unsupported key type: ${key.asymmetricKeyType}`);
  }
  return key;
}

/**
 * Lê a chave pública Ed25519 em PEM.
 * @param {string} publicKeyPem Chave pública em PEM.
 * @returns {crypto.KeyObject}
 */
function parseEd25519PublicKey(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Unsupported public key type: ${key.asymmetricKeyType}`);
  }
  return key;
}

/**
 * Validates and signs a hide-list manifest with an Ed25519 private key in PEM format.
 * @param {object} manifest Hide-list manifest payload.
 * @param {string} privateKeyPem PKCS#8 Ed25519 private key in PEM format.
 * @returns {object} Signed hide-list envelope.
 */
export function signHideList(manifest, privateKeyPem) {
  if (!isPlainObject(manifest)) throw new Error("manifest must be an object");
  const { signature: _ignored, ...payload } = manifest;
  const validation = validateHideList(payload);
  if (!validation.ok) {
    throw new Error(`Invalid hide-list manifest: ${validation.errors.join("; ")}`);
  }
  const privateKey = parseEd25519PrivateKey(privateKeyPem);
  const publicKeyPem = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
  const canonicalBytes = Buffer.from(canonicalJson(payload), "utf8");
  const sigBase64 = crypto.sign(null, canonicalBytes, privateKey).toString("base64");
  return { ...payload, signature: { alg: "Ed25519", publicKeyPem, sigBase64 } };
}

/**
 * Confere se a chave que assinou é a chave fixada esperada. Sem chave esperada, aceita.
 * @param {crypto.KeyObject} actualKey Chave pública que assinou.
 * @param {string|null|undefined} expectedPublicKeyPem Chave pública esperada em PEM.
 * @returns {{ok: boolean, reason?: string}}
 */
function verifyPinnedKey(actualKey, expectedPublicKeyPem) {
  if (expectedPublicKeyPem === undefined || expectedPublicKeyPem === null) return { ok: true };
  if (!isNonEmptyString(expectedPublicKeyPem, 16384)) {
    return { ok: false, reason: "expectedPublicKeyPem must be a non-empty PEM string" };
  }
  let expectedKey;
  try {
    expectedKey = parseEd25519PublicKey(expectedPublicKeyPem);
  } catch (err) {
    return { ok: false, reason: `Invalid expectedPublicKeyPem: ${err.message}` };
  }
  const actualDer = actualKey.export({ type: "spki", format: "der" });
  const expectedDer = expectedKey.export({ type: "spki", format: "der" });
  const matches = actualDer.length === expectedDer.length && crypto.timingSafeEqual(actualDer, expectedDer);
  return matches ? { ok: true } : { ok: false, reason: "Public key mismatch against pinned key" };
}

/**
 * Separa a assinatura do manifesto em um envelope assinado e valida o manifesto.
 * @param {unknown} signedEnvelope Envelope assinado.
 * @returns {object}
 */
function parseSignatureEnvelope(signedEnvelope) {
  if (!isPlainObject(signedEnvelope)) return { error: "signedEnvelope must be an object" };
  const { signature, ...manifest } = signedEnvelope;
  const validation = validateHideList(manifest);
  if (!validation.ok) return { error: `Invalid manifest: ${validation.errors.join("; ")}` };
  if (!isPlainObject(signature)) return { error: "Missing signature object" };
  if (signature.alg !== "Ed25519") return { error: `Unsupported signature algorithm: ${signature.alg}` };
  if (!isNonEmptyString(signature.publicKeyPem, 16384) || !isNonEmptyString(signature.sigBase64, 512)) {
    return { error: "Missing publicKeyPem or sigBase64" };
  }
  return { manifest, signature };
}

/**
 * Verifies a signed hide-list envelope (schema, optional pinned public key, and Ed25519 signature).
 * @param {unknown} signedEnvelope Signed hide-list envelope.
 * @param {string} [expectedPublicKeyPem] Optional pinned Ed25519 public key PEM.
 * @returns {{ ok: boolean, reason?: string }} Verification verdict.
 */
export function verifyHideList(signedEnvelope, expectedPublicKeyPem) {
  const parsed = parseSignatureEnvelope(signedEnvelope);
  if (parsed.error) return { ok: false, reason: parsed.error };
  let publicKey;
  try {
    publicKey = parseEd25519PublicKey(parsed.signature.publicKeyPem);
  } catch (err) {
    return { ok: false, reason: `Invalid embedded publicKeyPem: ${err.message}` };
  }
  const pinResult = verifyPinnedKey(publicKey, expectedPublicKeyPem);
  if (!pinResult.ok) return pinResult;
  const sigBuf = Buffer.from(parsed.signature.sigBase64, "base64");
  if (sigBuf.length !== ED25519_SIG_BYTES) return { ok: false, reason: "Invalid Ed25519 signature length" };
  const payloadBytes = Buffer.from(canonicalJson(parsed.manifest), "utf8");
  const valid = crypto.verify(null, payloadBytes, publicKey, sigBuf);
  return valid ? { ok: true } : { ok: false, reason: "Ed25519 signature verification failed" };
}

/**
 * Resolve o formato de exportação (`json` ou `txt`) a partir de texto ou de opções.
 * @param {string|object|undefined} options Formato ou objeto com `format`.
 * @returns {string}
 */
function normalizeExportFormat(options) {
  const fmt = typeof options === "string" ? options : options?.format ?? "json";
  if (fmt !== "json" && fmt !== "txt") {
    throw new Error(`Unsupported export format: ${fmt}`);
  }
  return fmt;
}

/**
 * Exports active Arweave `tx` entries from a hide-list envelope into AR.IO gateway blocklist format.
 * @param {object} signedEnvelope Signed (or validated) hide-list envelope.
 * @param {{ format?: 'json' | 'txt' } | 'json' | 'txt'} [options] Export format options.
 * @returns {object | string} AR.IO JSON blocklist object or newline-delimited TX IDs string.
 */
export function exportArioBlocklist(signedEnvelope, options = {}) {
  if (!isPlainObject(signedEnvelope)) throw new Error("signedEnvelope must be an object");
  const format = normalizeExportFormat(options);
  const { signature: _sig, ...manifest } = signedEnvelope;
  const validation = validateHideList(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid hide-list manifest: ${validation.errors.join("; ")}`);
  }
  const activeTx = manifest.entries.filter((e) => e.status === "active" && e.targetType === "tx");
  const blockedIds = [...new Set(activeTx.map((e) => e.target))];
  if (format === "txt") return blockedIds.length ? `${blockedIds.join("\n")}\n` : "";
  return {
    version: manifest.listVersion,
    generatedAt: manifest.updatedAt,
    issuer: manifest.issuer,
    blockedIds,
    entries: activeTx.map((e) => ({
      id: e.target,
      notes: e.category,
      source: manifest.issuer,
      created: e.issuedAt,
    })),
  };
}

/**
 * Lê um arquivo em UTF-8, com erro identificando o arquivo pelo rótulo.
 * @param {string} filePath Caminho do arquivo.
 * @param {string} label Rótulo usado na mensagem de erro.
 * @returns {string}
 */
function readUtf8File(filePath, label) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${label} (${filePath}): ${err.message}`);
  }
}

/**
 * Lê e interpreta um arquivo JSON, com erro identificando o arquivo pelo rótulo.
 * @param {string} filePath Caminho do arquivo.
 * @param {string} label Rótulo usado na mensagem de erro.
 * @returns {unknown}
 */
function readJsonFile(filePath, label) {
  const raw = readUtf8File(filePath, label);
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${err.message}`);
  }
}

/**
 * Interpreta pares `--chave valor` da linha de comando.
 * @param {string[]} args Argumentos do subcomando.
 * @returns {Object<string, string>}
 */
function parseFlags(args) {
  const flags = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid CLI argument near "${key}"`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

/**
 * Subcomando `sign`: assina o manifesto e grava o envelope.
 * @param {Object<string, string>} flags Flags (`input`, `key`, `out`).
 */
function runSign(flags) {
  if (!flags.input || !flags.key || !flags.out) {
    throw new Error("Usage: sign --input <manifest.json> --key <priv.pem> --out <signed.json>");
  }
  const manifest = readJsonFile(flags.input, "manifest");
  const privateKeyPem = readUtf8File(flags.key, "private key");
  const signed = signHideList(manifest, privateKeyPem);
  fs.writeFileSync(flags.out, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
  console.log(`Signed hide-list v${signed.listVersion} -> ${flags.out}`);
  return 0;
}

/**
 * Subcomando `verify`: verifica a assinatura de um envelope e, opcionalmente, a chave fixada.
 * @param {Object<string, string>} flags Flags (`input`, `pubkey`).
 */
function runVerify(flags) {
  if (!flags.input) {
    throw new Error("Usage: verify --input <signed.json> [--pubkey <pub.pem>]");
  }
  const envelope = readJsonFile(flags.input, "signed hide-list");
  const expectedPub = flags.pubkey ? readUtf8File(flags.pubkey, "public key") : undefined;
  const result = verifyHideList(envelope, expectedPub);
  if (!result.ok) {
    console.error(`Verification failed: ${result.reason}`);
    return 1;
  }
  console.log(`Verified hide-list v${envelope.listVersion} (${envelope.entries.length} entries)`);
  return 0;
}

/**
 * Subcomando `export-ario`: exporta o envelope assinado em `json` ou `txt`.
 * @param {Object<string, string>} flags Flags (`input`, `format`, `out`).
 */
function runExportArio(flags) {
  if (!flags.input) {
    throw new Error("Usage: export-ario --input <signed.json> [--format json|txt] [--out <file>]");
  }
  const envelope = readJsonFile(flags.input, "signed hide-list");
  const expectedPub = flags.pubkey ? readUtf8File(flags.pubkey, "public key") : undefined;
  const check = verifyHideList(envelope, expectedPub);
  if (!check.ok) {
    console.error(`Cannot export unverified hide-list: ${check.reason}`);
    return 1;
  }
  const format = flags.format ?? "json";
  const exported = exportArioBlocklist(envelope, { format });
  const serialized = typeof exported === "string" ? exported : `${JSON.stringify(exported, null, 2)}\n`;
  if (flags.out) {
    fs.writeFileSync(flags.out, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
  return 0;
}

/**
 * Executa o subcomando pedido (`sign`, `verify` ou `export-ario`).
 * @param {string[]} [argv=process.argv.slice(2)] Argumentos sem `node` e o script.
 */
function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const handlers = { sign: runSign, verify: runVerify, "export-ario": runExportArio };
  if (!command || !Object.hasOwn(handlers, command)) {
    console.error("Usage: hide-list-tool.mjs <sign|verify|export-ario> [options]");
    return 1;
  }
  try {
    const flags = parseFlags(rest);
    return handlers[command](flags);
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
