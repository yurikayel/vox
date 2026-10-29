import { getStoredJwk, ensureWallet } from "./wallet.js";
import { createSignedDataItem } from "./ans104.js";

export const TURBO_ENDPOINTS = Object.freeze([
  "https://upload.ardrive.io/v1/tx",
  "https://turbo-gateway.com/tx",
]);

export const FREE_TIER_MAX_BYTES = 101376; // 99 KiB safe ceiling (Turbo free tier <= 100 KiB)

async function getArweave() {
  const module = await import("https://esm.sh/arweave@1.15.7");
  const Arweave = module.default || module;
  return Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 30000,
  });
}

export function buildTags(type, fields = {}) {
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: type },
    { name: "Unix-Time", value: String(Date.now()) },
    { name: "Client", value: "vox-web-fase2" },
    { name: "Content-Type", value: "application/json; charset=utf-8" },
  ];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      tags.push({ name: key, value: String(val).trim() });
    }
  }

  return tags;
}

export async function uploadToTurbo(itemBytes) {
  let lastErr = null;
  for (const url of TURBO_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: itemBytes,
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, body };
      }
      lastErr = new Error(`HTTP ${res.status}`);
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
    throw new Error(`Falha no envio da transação (HTTP ${response.status})`);
  }
  return { success: true, id: tx.id, status: response.status, via: "arweave-l1" };
}

export async function postData(dataObj, tags = [], options = {}) {
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
      throw new Error(`Falha no upload Turbo: ${turbo.error?.message || "erro"}`);
    }
  }

  return postViaL1(payload, tags, jwk);
}

export async function postBinary(rawBytes, tags = [], options = {}) {
  let jwk = options.jwk || getStoredJwk();
  if (!jwk && options.autoCreate) {
    jwk = await ensureWallet();
  }
  if (!jwk) throw new Error("Nenhuma carteira encontrada. Conecte sua carteira em #/wallet.");

  const item = await createSignedDataItem(rawBytes, tags, jwk);
  const turbo = await uploadToTurbo(item.bytes);
  if (!turbo.ok) {
    throw new Error(`Falha no upload binário Turbo: ${turbo.error?.message || "indisponível"}`);
  }
  return {
    success: true,
    id: item.id,
    status: turbo.status,
    via: "turbo",
    size: item.bytes.length,
  };
}
