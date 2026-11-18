/**
 * @file Porta de entrada do cofre (ADR-035): o que o resto do app usa para gravar, restaurar, sincronizar e migrar o
 * cofre de recuperação. Fora de `vault/`, importa-se daqui (ou de `envelope.js`, só a cifra); os módulos internos
 * (`vault-crypto`, `vault-store`, `vault-legacy`, `passphrase-vault`, `oauth-vault`) podem mudar sem aviso.
 * @module vault
 */

/** Migração dos cofres antigos e vínculo com login OAuth (Google, Meta). */
export {
  LEGACY_VAULT_NOTICE,
  restoreOrBindGoogleIdentity,
  restoreOrBindMetaIdentity,
  restoreOrBindOAuthIdentity,
  runLegacyVaultMigration,
  startVaultMigration,
} from "./oauth-vault.js";

/** Cofre por Senha Soberana: gravar, restaurar e montar o cofre mínimo do QR. */
export { VAULT_PASSPHRASE_MIN, buildQrSyncRecord, restoreFromPassphraseVault, savePassphraseVault } from "./passphrase-vault.js";

/** Cofre no link `#/sync?b=` e e-mail normalizado como entra na derivação do endereço. */
export { decodeVaultBundleFromUrl, encodeVaultBundleForUrl, normalizeVaultEmail } from "./vault-crypto.js";

/** Servidores de memória: ler e gravar um cofre pelo endereço. */
export { fetchRemoteVaultRecord, saveRemoteVaultRecord } from "./vault-store.js";

/** Cofre na malha (ADR-037): formatos, caixa, guarda, decisão e o cofre desta conta. */
export {
  DECISION_TYPE,
  GUARD_TYPE,
  MAX_HOLDERS,
  NOTICE_TYPE,
  RELEASE_TYPE,
  REQUEST_MAX_AGE_MS,
  WAIT_MS,
  acceptGuard,
  addNotice as addMeshNotice,
  boxKeyPair,
  boxMailbox,
  buildDecisionBody,
  buildGuardBody,
  buildNoticeBody,
  buildReleaseBody,
  buildReplyText,
  buildRequest as buildMeshRequest,
  decideRequest,
  decodeMeshTempPub,
  dropHeld,
  forgetAllMesh,
  forgetMine as forgetMeshMine,
  heldCount,
  isVaultAddress,
  loadHeld,
  loadMine as loadMeshMine,
  loadNotices as loadMeshNotices,
  loadPending as loadMeshPending,
  markSent as markMeshSent,
  meshVaultAddress,
  parseMeshDm,
  parseReplyText,
  parseRequest,
  pickHolders,
  replyMailbox,
  requestIdOf,
  saveHeld,
  savePending as saveMeshPending,
  serializeMeshDm,
  takeNotices as takeMeshNotices,
} from "./mesh-vault.js";
