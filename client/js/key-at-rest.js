/**
 * @file PM-93 — migração das chaves privadas guardadas em claro para a forma cifrada pelo aparelho.
 *
 * Roda na abertura do app. Cada item é lido, cifrado (async) e só é regravado se o `localStorage` não mudou
 * nesse meio-tempo; se mudou, fica para a próxima abertura. Nada é apagado.
 */

import { getDeviceKey, isSealed, requestPersistentStorage, sealJson } from "./keystore.js";

/** Onde há chave privada e como achá-la dentro do JSON guardado. */
const TARGETS = [
  { key: "vox-local-account-v1", seal: sealPrivateField },
  { key: "vox-dm-keypair", seal: sealPrivateField },
  { key: "vox-accounts-vault-v1", seal: sealVaultMap },
  { key: "vox-wallet-jwk", seal: sealWalletJwk },
];

async function sealPrivateField(record) {
  if (!record?.privateJwk || isSealed(record.privateJwk)) return null;
  return { ...record, privateJwk: await sealJson(record.privateJwk) };
}

async function sealVaultEntry(entry) {
  const withKey = (await sealPrivateField(entry)) || entry;
  const dm = await sealPrivateField(entry?.dmKeypair);
  if (withKey === entry && !dm) return null;
  return dm ? { ...withKey, dmKeypair: dm } : withKey;
}

async function sealVaultMap(map) {
  if (!map || typeof map !== "object") return null;
  let changed = false;
  const next = {};
  for (const [id, entry] of Object.entries(map)) {
    const sealed = await sealVaultEntry(entry);
    next[id] = sealed || entry;
    changed = changed || Boolean(sealed);
  }
  return changed ? next : null;
}

/** Carteira em claro é o próprio JWK RSA; a cifrada por senha (`kind`) fica como está. */
async function sealWalletJwk(jwk) {
  if (!jwk?.kty || jwk.kind || isSealed(jwk)) return null;
  return sealJson(jwk);
}

async function migrateTarget(storage, { key, seal }) {
  const before = storage.getItem(key);
  if (!before) return false;
  let next = null;
  try {
    next = await seal(JSON.parse(before));
  } catch {
    return false;
  }
  if (!next || storage.getItem(key) !== before) return false;
  storage.setItem(key, JSON.stringify(next));
  return true;
}

/** Cifra o que ainda está em claro. Devolve quantos itens mudaram, ou -1 se o aparelho não guarda a chave. */
export async function sealKeysAtRest(storage = globalThis.localStorage) {
  if (!(await getDeviceKey())) return -1;
  let changed = 0;
  for (const target of TARGETS) {
    if (await migrateTarget(storage, target)) changed += 1;
  }
  return changed;
}

/** Abertura do app: cifra o que estiver em claro e pede armazenamento persistente. */
export async function startKeysAtRest() {
  const changed = await sealKeysAtRest();
  await requestPersistentStorage();
  return changed;
}
