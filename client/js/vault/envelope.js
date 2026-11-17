/**
 * @file Segunda porta do cofre (ADR-035 §3.2): só a cifra do envelope v2 (PBKDF2 + AES-GCM), para quem está abaixo do
 * cofre e não pode importar a porta principal sem criar ciclo — a identidade (`key-lock.js`) e o backup da caixa de
 * entrada (`inbox-backup.js`). As operações do cofre dependem da identidade; a identidade só depende desta cifra.
 * @module vault/envelope
 */

/** Cifra um objeto com a senha (envelope v2) e abre um envelope com a mesma senha. */
export { decryptVaultRecord, encryptVaultV2 } from "./vault-crypto.js";
