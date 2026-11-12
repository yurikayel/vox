/**
 * @file Backup semanal e mensal na caixa de e-mail da própria pessoa, sem servidor (decisão de 2026-11-12).
 * Ao ligar, a Senha Soberana cifra as chaves da conta (`.voxid`) e a metade secreta de um par de backup (cofre v2);
 * cada arquivo leva as duas e o conteúdo do período cifrado para a metade pública. Enviar não pede a Senha; abrir pede.
 */

import * as cacheNode from "./cache-node.js";
import * as contacts from "./contacts.js";
import * as cryptoDm from "./crypto-dm.js";
import { exportAccountBundle, importAccountBundle } from "./account-backup.js";
import * as localAccount from "./local-account.js";
import { decryptVaultRecord, encryptVaultV2 } from "./vault-crypto.js";

/** Marca do arquivo de backup do e-mail. */
export const INBOX_BACKUP_TYPE = "vox-inbox-backup";
const STATE_PREFIX = "vox-inbox-backup-v1:";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const stateKey = () => STATE_PREFIX + (localAccount.getCachedRouteIdSync() || "");

function readState() {
  try {
    return JSON.parse(localStorage.getItem(stateKey()) || "null");
  } catch {
    return null;
  }
}

function writeState(next) {
  localStorage.setItem(stateKey(), JSON.stringify(next));
}

const monthOf = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};

/**
 * Estado dos backups da conta ativa.
 * @returns {{ready: boolean, weekly: boolean, monthly: boolean, lastWeekly: number, lastMonthly: number}}
 */
export function getInboxBackupSettings() {
  const s = readState() || {};
  return {
    ready: Boolean(s.backupPub),
    weekly: s.weekly !== false,
    monthly: s.monthly !== false,
    lastWeekly: s.lastWeekly || 0,
    lastMonthly: s.lastMonthly || 0,
  };
}

/**
 * Liga ou desliga o semanal e o mensal.
 * @param {{weekly?: boolean, monthly?: boolean}} cadence O que muda.
 */
export function setInboxBackupCadence({ weekly, monthly } = {}) {
  const s = readState();
  if (!s) return;
  if (typeof weekly === "boolean") s.weekly = weekly;
  if (typeof monthly === "boolean") s.monthly = monthly;
  writeState(s);
}

/**
 * Liga os backups; única vez em que a Senha é pedida (e, como todo backup com senha, trava as chaves, PM-93).
 * @param {string} passphrase Senha Soberana (12+ caracteres).
 */
export async function enableInboxBackup(passphrase) {
  const secret = String(passphrase || "").trim();
  if (secret.length < 12) throw new Error("A Senha Soberana precisa ter 12 caracteres ou mais.");
  const account = JSON.parse(await exportAccountBundle(secret));
  const pair = await cryptoDm.generateDmKeypair();
  const backupKey = await encryptVaultV2({ privateJwk: pair.privateJwk }, secret);
  const now = Date.now();
  writeState({ account, backupKey, backupPub: pair.publicJwk, lastWeekly: now, lastMonthly: now });
}

/**
 * Vencidos: o mensal no primeiro uso de um mês novo, o semanal 7 dias depois do último.
 * @param {number} [now] Agora, em ms.
 * @returns {Array<"semana"|"mes">} Períodos a enviar.
 */
export function dueInboxBackups(now = Date.now()) {
  const s = readState();
  if (!s?.backupPub) return [];
  const due = [];
  if (s.monthly !== false && monthOf(now) !== monthOf(s.lastMonthly || 0)) due.push("mes");
  if (s.weekly !== false && now - (s.lastWeekly || 0) >= WEEK_MS) due.push("semana");
  return due;
}

async function collectContent(from, to) {
  const me = localAccount.getCachedRouteIdSync();
  const inRange = (ts) => (ts || 0) >= from && (ts || 0) <= to;
  const posts = (await cacheNode.getAllLocalPosts())
    .filter((p) => p.author === me && inRange(p.ts))
    .map(({ mediaBlob: _blob, ...post }) => post);
  const dms = [];
  for (const c of await cacheNode.getDmConversations()) {
    const msgs = await cacheNode.getDmMessages(c.peerAddress);
    dms.push(...msgs.filter((m) => inRange(m.ts)).map((m) => ({ ...m, mediaDataUrl: "" })));
  }
  const profile = {
    displayName: localAccount.getDisplayName(),
    enrichment: localAccount.getProfileEnrichment(),
    pix: localAccount.getPixKey(),
  };
  return { profile, contacts: contacts.listContacts(), posts, dms };
}

/**
 * Monta o arquivo: "completo" desde o começo; os outros desde o último envio do mesmo tipo.
 * @param {"semana"|"mes"|"completo"} period Período.
 * @param {number} [now] Agora, em ms.
 * @returns {Promise<{name: string, text: string, to: number}>} Nome do arquivo, conteúdo e fim do período.
 */
export async function buildInboxBackup(period, now = Date.now()) {
  const s = readState();
  if (!s?.backupPub) throw new Error("Ligue os backups em Sua rede primeiro.");
  const from = { semana: s.lastWeekly, mes: s.lastMonthly }[period] || 0;
  const content = await collectContent(from, now);
  const sealed = await cryptoDm.seal(s.backupPub, JSON.stringify(content));
  const file = { type: INBOX_BACKUP_TYPE, v: 1, period, from, to: now, account: s.account, backupKey: s.backupKey, sealed };
  const day = new Date(now).toISOString().slice(0, 10);
  return { name: `vox-backup-${period}-${day}.txt`, text: JSON.stringify(file), to: now };
}

/**
 * Registra o envio; o próximo do mesmo tipo começa daqui.
 * @param {"semana"|"mes"|"completo"} period Período enviado.
 * @param {number} to Fim do período enviado.
 */
export function markInboxBackupSent(period, to) {
  const s = readState();
  if (!s) return;
  if (period === "semana") s.lastWeekly = to;
  if (period === "mes") s.lastMonthly = to;
  writeState(s);
}

async function applyContent(c) {
  if (c.profile?.displayName) localAccount.setDisplayName(c.profile.displayName);
  if (c.profile?.enrichment) localAccount.setProfileEnrichment(c.profile.enrichment);
  if (c.profile?.pix) localAccount.setPixKey(c.profile.pix);
  for (const x of c.contacts || []) contacts.addContact(x.routeId, x.label);
  for (const m of c.dms || []) await cacheNode.saveDmMessage(m);
  for (const p of c.posts || []) await cacheNode.saveLocalPost(p);
}

/**
 * Diz se o texto é um backup da caixa de e-mail.
 * @param {string} text Conteúdo do arquivo.
 * @returns {boolean} True se for.
 */
export function isInboxBackupText(text) {
  return String(text || "").includes(`"type":"${INBOX_BACKUP_TYPE}"`);
}

/**
 * Restaura conta e conteúdo; os backups seguem neste aparelho sem pedir a Senha de novo.
 * @param {string} text Conteúdo do arquivo.
 * @param {string} passphrase Senha Soberana.
 * @returns {Promise<object>} A conta restaurada.
 */
export async function restoreInboxBackup(text, passphrase) {
  const file = JSON.parse(text);
  if (file?.type !== INBOX_BACKUP_TYPE) throw new Error("Este arquivo não é um backup do Vox.");
  const keys = await decryptVaultRecord(file.backupKey, passphrase).catch(() => null);
  if (!keys?.privateJwk) throw new Error("Senha Soberana incorreta.");
  const acc = await importAccountBundle(file.account, passphrase);
  await applyContent(JSON.parse(await cryptoDm.open(file.sealed, keys.privateJwk)));
  const { kty, crv, x, y } = keys.privateJwk;
  const now = Date.now();
  writeState({ account: file.account, backupKey: file.backupKey, backupPub: { kty, crv, x, y }, lastWeekly: now, lastMonthly: now });
  return acc;
}
