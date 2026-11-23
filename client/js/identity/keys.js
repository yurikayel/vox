/**
 * @file Segunda porta da conta (ADR-035 §3.2): só a chave do aparelho (selar e abrir segredos em repouso) e a chave
 * privada de DM. Existe porque `crypto-dm.js` e `wallet.js` precisam dessas primitivas, e `identity/local-account.js`
 * importa `crypto-dm.js`: pela porta `identity/index.js`, o módulo de DM carregaria a conta inteira e fecharia um ciclo
 * `crypto-dm → identity/index → local-account → crypto-dm`. Esta porta só alcança `keystore.js`, `key-lock.js` e o
 * envelope do cofre.
 * @module identity/keys
 */

/** Chave do aparelho: selar e abrir JSON em repouso. */
export { isSealed, openSealed, sealJson, sealJsonStrict } from "./keystore.js";
/** Chave privada de DM, aberta pela chave do aparelho ou pela trava da Senha Soberana. */
export { dmPrivateKey } from "./key-lock.js";
