/**
 * @file Porta de entrada da conta (ADR-035 §3.2): conta local, frase de recuperação, saídas soberanas, arquivo de
 * soberania (`.voxid`), backup no e-mail, guardiões e chaves em repouso. Fora de `identity/`, importa-se daqui (ou de
 * `identity/keys.js`, para quem só precisa da chave do aparelho e da chave de DM); dentro da pasta, os módulos se
 * importam livremente. `npm run audit:layers` reprova import de fora que pule as portas.
 *
 * Reexporta módulos inteiros porque a maior parte do app usa a conta como espaço de nomes
 * (`import * as localAccount from "./identity/index.js"`); nomes repetidos entre eles são a mesma ligação
 * (reexportação), então não há ambiguidade. Módulos só internos (`identity-seed`, `p256`, `key-lock`,
 * `account-backup-wrap`, `local-wipe`) chegam aqui apenas pelo que os públicos já reexportam.
 * @module identity
 */

/** Conta local: criar, trocar, assinar, nome, Pix, contas guardadas neste aparelho. */
export * from "./local-account.js";
/** Saídas soberanas da conta (frase, guardiões, Senha Soberana) e o aviso de conta provisória (ADR-032). */
export * from "./account-exit.js";
/** Frase de 12 palavras da conta ativa: mostrar, conferir e entrar por ela. */
export * from "./account-phrase.js";
/** Frase de recuperação: codificar e decodificar a conta em palavras. */
export * from "./recovery-phrase.js";
/** Arquivo de soberania (`.voxid`): exportar e restaurar, com envelope opcional de senha. */
export * from "./account-backup.js";
/** Backup semanal e mensal no e-mail da própria pessoa. */
export * from "./inbox-backup.js";
/** Guardiões: dividir a conta, guardar pedaços e pedir a conta de volta. */
export * from "./guardians.js";
export * from "./guardian-return.js";
/** Escalar P-256 a partir de bytes de HKDF (ADR-032 §5.2), para chaves derivadas fora da conta (ADR-037). */
export { scalarFromBytes } from "./p256.js";
/** Chave do aparelho para segredos em repouso e migração das chaves antigas guardadas em claro. */
export * from "./keystore.js";
export * from "./key-at-rest.js";
/** Sincronização de conta e rota entre abas do mesmo origin (S30-S5). */
export { startTabSync, reloadIdentityFromStorage, readStoredRouteId, TAB_SYNC_CHANNEL } from "./tab-sync.js";
