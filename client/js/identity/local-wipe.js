/**
 * @file Limpeza local da conta: o aviso do que some e do que fica, a dupla confirmação e a remoção das chaves do
 * armazenamento do navegador. Quais chaves saem é decidido por `local-account.js` (`wipeLocalAccount`), que é
 * quem conhece cada uma.
 */

import { closeKeystore } from "./keystore.js";

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

/** Quanto esperar, depois de o navegador avisar que outra conexão segura o banco, antes de dar a remoção por não feita. */
export const BLOCKED_WAIT_MS = 2000;

/**
 * Apaga um banco IndexedDB e diz se apagou de fato. Banco que não existe (ou IndexedDB ausente) conta como apagado;
 * recusa do navegador, exceção ou conexão de outra aba que não soltou o banco a tempo contam como NÃO apagado.
 * @param {string} name nome do banco
 * @param {number} [blockedWaitMs] espera após o aviso de "bloqueado" até desistir
 * @returns {Promise<boolean>} true só se o navegador confirmou a remoção
 */
export function deleteDatabase(name, blockedWaitMs = BLOCKED_WAIT_MS) {
  return new Promise((resolve) => {
    let timer = null;
    /**
     * Encerra a espera do apagamento com o resultado.
     *
     * @param {boolean} deleted
     */
    const finish = (deleted) => {
      clearTimeout(timer);
      resolve(deleted);
    };
    try {
      const req = globalThis.indexedDB?.deleteDatabase?.(name);
      if (!req) return resolve(true);
      req.onsuccess = () => finish(true);
      req.onerror = () => finish(false);
      req.onblocked = () => {
        timer = setTimeout(() => finish(false), blockedWaitMs);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Apaga os bancos IndexedDB do cliente, cada um isolado. Antes, fecha as conexões do próprio app (o cofre de
 * chaves) e esquece a chave do aparelho em memória, para a remoção não ficar presa por nós mesmos.
 * @param {string[]} [names] bancos
 * @param {number} [blockedWaitMs] espera por banco bloqueado (veja `deleteDatabase`)
 * @returns {Promise<string[]>} bancos que NÃO foram apagados (vazio = tudo apagado)
 */
export async function dropDatabases(names = DEVICE_DATABASES, blockedWaitMs = BLOCKED_WAIT_MS) {
  closeKeystore();
  const results = await Promise.all(names.map((n) => deleteDatabase(n, blockedWaitMs)));
  return names.filter((_, i) => !results[i]);
}

/** Apaga os dados pessoais de localStorage e sessionStorage (síncrono, vale antes de qualquer recarga). */
export function dropAllPersonalStorage() {
  dropPersonalStorage(globalThis.localStorage);
  dropPersonalStorage(globalThis.sessionStorage);
}
