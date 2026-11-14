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
