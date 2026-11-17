/**
 * @file Limpeza local da conta: o aviso do que some e do que fica, a dupla confirmação e a remoção das chaves do
 * armazenamento do navegador. Quais chaves saem é decidido por `local-account.js` (`wipeLocalAccount`), que é
 * quem conhece cada uma.
 */

/** O que a limpeza apaga e o que ela não alcança (mostrado no Perfil e nas duas confirmações). */
export const LOCAL_WIPE_NOTICE =
  "Apaga chaves JWK DESTE navegador. Posts no permaweb, relay/inbox e arquivo .json/.voxid em disco NÃO são apagados.";

const SESSION_PASSPHRASE_KEYS = ["vox-sovereignty-passphrase", "vox-backup-passphrase"];

/**
 * Pede a mesma confirmação duas vezes; qualquer "não" cancela.
 * @param {(message: string) => boolean} [ask]
 * @returns {boolean}
 */
export function confirmLocalWipe(ask = globalThis.confirm) {
  const prompt = typeof ask === "function" ? ask : () => false;
  return Boolean(prompt(LOCAL_WIPE_NOTICE) && prompt(LOCAL_WIPE_NOTICE));
}

/**
 * Remove chaves de um armazenamento, ignorando as que falharem (modo privado, armazenamento bloqueado).
 * @param {Storage} store
 * @param {string[]} keys
 */
export function dropStorageKeys(store, keys) {
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      /* armazenamento indisponível: nada a apagar */
    }
  }
}

/** Esquece a Senha Soberana guardada nesta aba. */
export function dropSessionPassphrase() {
  const ss = globalThis.sessionStorage;
  if (ss) dropStorageKeys(ss, SESSION_PASSPHRASE_KEYS);
}

/**
 * Preferências neutras e caches do app que ficam no aparelho depois de "apagar conta local": nada aqui identifica
 * a pessoa nem guarda conta, perfil, contato, mensagem ou credencial. Tudo o mais que o cliente grava com prefixo
 * `vox` (veja `DEVICE_WIPE_PREFIXES`) sai; chave nova de dado pessoal já nasce apagável, sem precisar entrar numa lista.
 */
export const DEVICE_KEEP_KEYS = [
  "vox-color-mode",
  "vox-sky-follow-clock",
  "vox-sidebar-collapsed",
  "vox-safari-banner-dismissed-v1",
  "vox-remote-flags-v1",
  "vox-demo-mode",
  "vox-mock-purged-v1",
  "vox-custom-signaling-url",
  "vox-custom-turn-config",
  "vox-turn-only",
  "vox-relay-http-url",
  "vox-relay-buddy-http-url",
  "vox-peer-settings",
  "vox-blob-peer-soft-priority",
  "vox-gateway-health",
  "vox-read-origin",
  "vox-signaling-telemetry-v1",
  "vox-mirror-telemetry",
  "vox-peer-metrics",
  "vox-daily-usage",
  "vox-metric-people-search-ok",
  "vox-handles-cache",
  "vox-cache-manifest-by-comm",
];

/** Prefixos de preferência/cache do aparelho que também ficam (servidor de memória escolhido, semente de demo, labs, caches do SW). */
export const DEVICE_KEEP_PREFIXES = ["vox-central-memory-", "vox-demo-seeded-", "vox.lab.", "vox-pwa"];

/** Todo nome de chave do cliente começa com um destes; o que não estiver na lista de "fica" é apagado. */
export const DEVICE_WIPE_PREFIXES = ["vox-", "vox_", "vox."];

/** Bancos IndexedDB do cliente: posts e DMs locais, chaves travadas e o armazém de laboratório. */
export const DEVICE_DATABASES = ["vox-cache-db", "vox-keystore", "vox-store-db"];

/**
 * Diz se uma chave de armazenamento é dado pessoal ou de conta (deve sair).
 * @param {string} key nome da chave
 * @returns {boolean}
 */
export function isPersonalStorageKey(key) {
  if (DEVICE_KEEP_KEYS.includes(key)) return false;
  if (DEVICE_KEEP_PREFIXES.some((p) => key.startsWith(p))) return false;
  return DEVICE_WIPE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Apaga de um armazenamento toda chave pessoal, uma a uma; a que falhar não impede as outras.
 * @param {Storage|undefined} store localStorage ou sessionStorage
 */
export function dropPersonalStorage(store) {
  if (!store) return;
  const keys = [];
  try {
    for (let i = 0; i < store.length; i++) keys.push(store.key(i));
  } catch {
    return;
  }
  dropStorageKeys(store, keys.filter((k) => typeof k === "string" && isPersonalStorageKey(k)));
}

/**
 * Apaga um banco IndexedDB; termina também se o navegador recusar ou segurar a remoção (conexão aberta).
 * @param {string} name nome do banco
 * @returns {Promise<void>}
 */
export function deleteDatabase(name) {
  return new Promise((resolve) => {
    try {
      const req = globalThis.indexedDB?.deleteDatabase?.(name);
      if (!req) return resolve();
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Apaga os bancos IndexedDB do cliente, cada um isolado.
 * @param {string[]} [names] bancos
 * @returns {Promise<void>}
 */
export async function dropDatabases(names = DEVICE_DATABASES) {
  await Promise.all(names.map((n) => deleteDatabase(n)));
}

/** Apaga os dados pessoais de localStorage e sessionStorage (síncrono, vale antes de qualquer recarga). */
export function dropAllPersonalStorage() {
  dropPersonalStorage(globalThis.localStorage);
  dropPersonalStorage(globalThis.sessionStorage);
}
