/**
 * @file Envio de dados e mídia ao Arweave via Turbo (cota gratuita) ou L1.
 */
import { fetchWithTimeout, readResponseText } from "./fetch-timeout.js";
import { getStoredJwk, ensureWallet } from "./wallet.js";
import { loadArweave } from "./arweave-lib.js";
import { createSignedDataItem } from "./ans104.js";
import { assertFeatureEnabled } from "./feature-flags.js";
import { toHonestError } from "./honest-errors.js";

/** Endpoints Turbo usados em ordem para upload gratuito até `FREE_TIER_MAX_BYTES`. */
export const TURBO_ENDPOINTS = Object.freeze([
  "https://upload.ardrive.io/v1/tx",
  "https://turbo-gateway.com/tx",
]);

/** Teto seguro (99 KiB) dentro da faixa gratuita do Turbo (<= 100 KiB). */
export const FREE_TIER_MAX_BYTES = 101376; // 99 KiB safe ceiling (Turbo free tier <= 100 KiB)

function getArweave() {
  return loadArweave(30000);
}

const isFilledTag = (val) => val !== undefined && val !== null && String(val).trim() !== "";

/**
 * Tags do Vox. Um `Content-Type` em `fields` substitui o padrão JSON (mídia binária), em vez de virar uma segunda tag.
 * @param {string} type Tipo de item (`topic`, `media`, `profile-card`, etc.).
 * @param {Record<string, string>} [fields={}] Tags extras do item.
 * @returns {{ name: string, value: string }[]} Lista de tags ANS-104/Arweave.
 */
export function buildTags(type, fields = {}) {
  const contentType = isFilledTag(fields["Content-Type"]) ? String(fields["Content-Type"]).trim() : "application/json; charset=utf-8";
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: type },
    { name: "Unix-Time", value: String(Date.now()) },
    { name: "Client", value: "vox-web-fase2" },
    { name: "Content-Type", value: contentType },
  ];

  for (const [key, val] of Object.entries(fields)) {
    if (key !== "Content-Type" && isFilledTag(val)) {
      tags.push({ name: key, value: String(val).trim() });
    }
  }

  return tags;
}

/** Corpo JSON de resposta Turbo (texto drenado ou `json()` em mocks de teste). */
async function parseTurboOkBody(res, text) {
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  if (typeof res.json !== "function") return {};
  return res.json().catch(() => ({}));
}

/**
 * Envia bytes ANS-104 já assinados tentando os endpoints Turbo em sequência.
 * @param {Uint8Array} itemBytes Bytes assinados do DataItem.
 * @returns {Promise<{ ok: boolean, status?: number, body?: object, error?: Error }>} Resultado do upload.
 */
export async function uploadToTurbo(itemBytes) {
  let lastErr = null;
  for (const url of TURBO_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: itemBytes,
      }, { timeoutMs: 15000 });
      const text = typeof res.text === "function" ? await readResponseText(res) : "";
      if (res.ok) {
        const body = await parseTurboOkBody(res, text);
        return { ok: true, status: res.status, body };
      }
      lastErr = new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
      lastErr.status = res.status;
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr };
}

async function postViaL1(payload, tags, jwk) {
  const arweave = await getArweave();
  const tx = await arweave.createTransaction({ data: payload }, jwk);
  for (const t of tags) tx.addTag(t.name, t.value);
  await arweave.transactions.sign(tx, jwk);
  const response = await arweave.transactions.post(tx);
  if (response.status !== 200 && response.status !== 208) {
    const err = new Error(`Falha no envio da transação (HTTP ${response.status})`);
    err.status = response.status;
    throw toHonestError(err);
  }
  return { success: true, id: tx.id, status: response.status, via: "arweave-l1" };
}

/**
 * Publica JSON/texto no Arweave (via Turbo quando <= `FREE_TIER_MAX_BYTES` ou fallback L1).
 * @param {string|object} dataObj Conteúdo a publicar.
 * @param {{ name: string, value: string }[]} [tags=[]] Tags Arweave/ANS-104.
 * @param {{ jwk?: object, autoCreate?: boolean, forceL1?: boolean, fallbackL1?: boolean }} [options={}] Opções de carteira e rota.
 * @returns {Promise<{ success: boolean, id: string, status: number, via: string, size?: number }>} Recibo da publicação.
 */
export async function postData(dataObj, tags = [], options = {}) {
  assertFeatureEnabled("arweaveUpload");
  let jwk = options.jwk || getStoredJwk();
  if (!jwk && options.autoCreate) {
    jwk = await ensureWallet();
  }
  if (!jwk) {
    throw new Error("Nenhuma carteira encontrada. Conecte sua carteira em #/wallet antes de publicar.");
  }

  const payload = typeof dataObj === "string" ? dataObj : JSON.stringify(dataObj || {});
  const bytes = new TextEncoder().encode(payload);

  if (bytes.length <= FREE_TIER_MAX_BYTES && options.forceL1 !== true) {
    const item = await createSignedDataItem(payload, tags, jwk);
    const turbo = await uploadToTurbo(item.bytes);
    if (turbo.ok) {
      return {
        success: true,
        id: item.id,
        status: turbo.status,
        via: "turbo",
        size: item.bytes.length,
      };
    }
    if (options.fallbackL1 === false) {
      throw toHonestError(turbo.error || new Error("Falha no upload Turbo"));
    }
  }

  return postViaL1(payload, tags, jwk);
}

/**
 * Publica bytes binários (mídia) via Turbo.
 * @param {Uint8Array} rawBytes Bytes brutos do arquivo.
 * @param {{ name: string, value: string }[]} [tags=[]] Tags Arweave/ANS-104.
 * @param {{ jwk?: object, autoCreate?: boolean }} [options={}] Opções de carteira.
 * @returns {Promise<{ success: boolean, id: string, status: number, via: string, size: number }>} Recibo do envio.
 */
export async function postBinary(rawBytes, tags = [], options = {}) {
  assertFeatureEnabled("arweaveUpload");
  let jwk = options.jwk || getStoredJwk();
  if (!jwk && options.autoCreate) {
    jwk = await ensureWallet();
  }
  if (!jwk) throw new Error("Nenhuma carteira encontrada. Conecte sua carteira em #/wallet.");

  const item = await createSignedDataItem(rawBytes, tags, jwk);
  const turbo = await uploadToTurbo(item.bytes);
  if (!turbo.ok) {
    throw toHonestError(turbo.error || new Error("Falha no upload binário Turbo: indisponível"));
  }
  return {
    success: true,
    id: item.id,
    status: turbo.status,
    via: "turbo",
    size: item.bytes.length,
  };
}
