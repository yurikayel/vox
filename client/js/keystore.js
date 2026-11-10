/**
 * @file PM-93 — chave do aparelho para guardar segredos em repouso.
 *
 * Uma chave AES-GCM-256 **não exportável** fica no IndexedDB deste navegador. Com ela, as chaves privadas
 * (identidade, DM, carteira) são gravadas cifradas no `localStorage` em vez de em texto claro. Quem copia o
 * armazenamento ou os arquivos do navegador leva só texto cifrado. Depois do backup com a Senha Soberana, a
 * chave privada vira uma referência travada (`LOCKED_TAG`) para uma `CryptoKey` não exportável guardada aqui
 * (`key-lock.js`, PM-93 etapa 2).
 *
 * Regras de segurança contra perda de identidade:
 * - se o IndexedDB não funciona, nada é cifrado (modo degradado, igual a antes);
 * - a chave só é usada depois de gravada e relida;
 * - um segredo cifrado que não abre agora lança `KeystoreUnavailableError`: quem chama nunca deve gerar uma
 *   chave nova por cima dele.
 */

const DB_NAME = "vox-keystore";
const STORE = "vox-keystore";
const DEVICE_KEY_ID = "device-key-v1";
export const SEALED_TAG = "vox-device-v1";
export const LOCKED_TAG = "vox-locked-v1";

export class KeystoreUnavailableError extends Error {
  constructor() {
    super("Não foi possível abrir as chaves guardadas neste aparelho. Recarregue a página e tente de novo.");
    this.name = "KeystoreUnavailableError";
  }
}

/** A chave está travada: só sai do aparelho pela cópia cifrada com a Senha Soberana. */
export class KeyLockedError extends Error {
  constructor(message = "Esta conta está travada pela Senha Soberana. Digite a senha para exportar o backup.") {
    super(message);
    this.name = "KeyLockedError";
  }
}

let devicePromise = null;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text) => Uint8Array.from(atob(String(text)), (c) => c.charCodeAt(0));

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB"));
  });
}

function openDb() {
  const idb = globalThis.indexedDB;
  if (!idb?.open) return Promise.resolve(null);
  const req = idb.open(DB_NAME, 1);
  req.onupgradeneeded = (event) => {
    const db = event?.target?.result || req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
  };
  return requestToPromise(req);
}

function storeOf(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** `CryptoKey` guardada no IndexedDB, ou null. */
export async function loadKey(id) {
  const db = await openDb();
  if (!db) return null;
  const entry = await requestToPromise(storeOf(db, "readonly").get(id));
  return entry?.key || null;
}

/** Guarda uma `CryptoKey` e devolve a que foi relida (null se não ficou gravada). */
export async function storeKey(id, key) {
  const db = await openDb();
  if (!db) return null;
  await requestToPromise(storeOf(db, "readwrite").put({ id, key, createdAt: Date.now() }));
  return loadKey(id);
}

export async function removeKey(id) {
  const db = await openDb();
  if (db) await requestToPromise(storeOf(db, "readwrite").delete(id));
}

async function loadOrCreateDeviceKey() {
  const existing = await loadKey(DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return storeKey(DEVICE_KEY_ID, key);
}

/** Chave do aparelho, ou null se este navegador não consegue guardá-la. Falha não fica em cache. */
export function getDeviceKey() {
  if (!devicePromise) {
    devicePromise = loadOrCreateDeviceKey()
      .catch(() => null)
      .then((key) => {
        if (!key) devicePromise = null;
        return key;
      });
  }
  return devicePromise;
}

export function isSealed(value) {
  return Boolean(value && typeof value === "object" && value.sealed === SEALED_TAG && value.iv && value.ct);
}

export function isLocked(value) {
  return Boolean(value && typeof value === "object" && value.locked === LOCKED_TAG && value.kid);
}

/** Cifra um valor JSON com a chave do aparelho. Sem chave disponível, devolve o valor como está. */
export async function sealJson(value) {
  if (value == null || isSealed(value) || isLocked(value)) return value;
  const key = await getDeviceKey();
  if (!key) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { sealed: SEALED_TAG, iv: toB64(iv), ct: toB64(ct) };
}

/** Abre um valor cifrado pelo aparelho; valor em claro passa direto; chave travada não abre aqui. */
export async function openSealed(value) {
  if (isLocked(value)) throw new KeyLockedError();
  if (!isSealed(value)) return value;
  const key = await getDeviceKey();
  if (!key) throw new KeystoreUnavailableError();
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(value.iv) }, key, fromB64(value.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new KeystoreUnavailableError();
  }
}

/** Pede ao navegador para não apagar os dados deste site sob pressão de espaço. */
export async function requestPersistentStorage() {
  try {
    if (await globalThis.navigator?.storage?.persisted?.()) return true;
    return Boolean(await globalThis.navigator?.storage?.persist?.());
  } catch {
    return false;
  }
}

export function __resetKeystoreForTests() {
  devicePromise = null;
}
