const STORAGE_KEY = "vox-wallet-jwk";
let arweaveInstance = null;

async function getArweave() {
  if (arweaveInstance) return arweaveInstance;
  const module = await import("https://esm.sh/arweave@1.15.7");
  const Arweave = module.default || module;
  arweaveInstance = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 20000,
  });
  return arweaveInstance;
}

export function getStoredJwk() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveJwk(jwk) {
  if (!jwk || typeof jwk !== "object") {
    throw new Error("JWK inválido");
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
}

export function removeWallet() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasWallet() {
  return Boolean(getStoredJwk());
}

export async function getAddress() {
  const jwk = getStoredJwk();
  if (!jwk) return null;
  const arweave = await getArweave();
  return arweave.wallets.jwkToAddress(jwk);
}

export async function getBalance(address) {
  if (!address) return "0.000";
  const arweave = await getArweave();
  const winston = await arweave.wallets.getBalance(address);
  return arweave.ar.winstonToAr(winston);
}

export async function generateNewWallet() {
  const arweave = await getArweave();
  const jwk = await arweave.wallets.generate();
  const address = await arweave.wallets.jwkToAddress(jwk);
  saveJwk(jwk);
  return { jwk, address };
}
