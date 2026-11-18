/**
 * @file Carregador único do bundle arweave vendorizado (`client/vendor/`).
 *
 * Confere o sha384 anotado em docs/DEPENDENCIAS.md antes de executar o bundle e valida o timeout HTTP.
 * Só é baixado ao publicar no Arweave ou consultar saldo (PM-11).
 *
 * @module arweave-lib
 * @see docs/DEPENDENCIAS.md (seção 1, bundle 1.15.7)
 */
export const ARWEAVE_BUNDLE_URL = "../vendor/arweave-1.15.7.bundle.js";

/** sha384 anotado em docs/DEPENDENCIAS.md para `client/vendor/arweave-1.15.7.bundle.js`. */
export const ARWEAVE_BUNDLE_SHA384 =
  "sha384-OW68l9kk3+Mp45NcS58vH/fvXYo2zzlCBqk+EtgezkH3Yr/VmvfqofABTTUvVYV3";

const TIMEOUT_MIN_MS = 1;
const TIMEOUT_MAX_MS = 120_000;

function assertTimeoutMs(timeout) {
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) {
    throw new TypeError("timeout precisa ser número finito em milissegundos");
  }
  if (timeout < TIMEOUT_MIN_MS || timeout > TIMEOUT_MAX_MS) {
    throw new RangeError(`timeout fora do intervalo ${TIMEOUT_MIN_MS}–${TIMEOUT_MAX_MS} ms`);
  }
}

function bytesToBase64(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function readBundleBytes(bundleUrl) {
  const resolved = new URL(bundleUrl, import.meta.url);
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    return readFileSync(fileURLToPath(resolved));
  }
  const resp = await fetch(resolved);
  if (!resp.ok) throw new Error(`bundle arweave indisponível: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function assertVendorIntegrity(bundleUrl) {
  const digest = await crypto.subtle.digest("SHA-384", await readBundleBytes(bundleUrl));
  const actual = `sha384-${bytesToBase64(digest)}`;
  if (actual !== ARWEAVE_BUNDLE_SHA384) {
    throw new Error("integridade do bundle arweave não confere com docs/DEPENDENCIAS.md");
  }
}

/**
 * Carrega o bundle vendorizado e devolve uma instância apontando para arweave.net.
 * @param {number} timeout tempo limite HTTP da biblioteca, em milissegundos (1 a 120000).
 */
export async function loadArweave(timeout) {
  assertTimeoutMs(timeout);
  await assertVendorIntegrity(ARWEAVE_BUNDLE_URL);
  const module = await import(ARWEAVE_BUNDLE_URL);
  const Arweave = module.default || module;
  return Arweave.init({ host: "arweave.net", port: 443, protocol: "https", timeout });
}