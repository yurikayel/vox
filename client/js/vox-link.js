/**
 * @file PM-82 — vínculo assinado: registro com a assinatura das duas pessoas (quem convidou e quem aceitou).
 * Base do moderador natural (PM-83). Lógica pura; assinar, guardar e espalhar chegam de fora.
 * Spec: docs/specs/moderador-natural-v0.md.
 */

/** Tipo dos registros de vínculo (aceite e confirmação). */
export const VOX_LINK_TYPE = "vox-link";
/** Chave do `localStorage` com o convite em uso deste aparelho. */
export const INVITE_STORAGE_KEY = "vox-invite-v1";
/** Quantas pessoas um convite pode confirmar antes de ser trocado. */
export const INVITE_MAX_USES = 10;
/** Validade de um convite: 30 dias. */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Conta com menos de 7 dias é "nova": o cartão de convite já sugere aceitar como padrinho. */
export const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Indica se o texto tem o formato de token de convite (22 caracteres base64url, 16 bytes aleatórios).
 * @param {unknown} token Valor a conferir.
 * @returns {boolean} Verdadeiro para token bem formado.
 */
export const isInviteToken = (token) => typeof token === "string" && TOKEN_PATTERN.test(token);

const toB64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

function readInvite(storage) {
  try {
    const invite = JSON.parse(storage?.getItem(INVITE_STORAGE_KEY) || "null");
    if (!invite || !isInviteToken(invite.token)) return null;
    return { ...invite, confirmed: Array.isArray(invite.confirmed) ? invite.confirmed : [] };
  } catch {
    return null;
  }
}

function writeInvite(invite, storage) {
  try {
    storage?.setItem(INVITE_STORAGE_KEY, JSON.stringify(invite));
  } catch {}
  return invite;
}

/**
 * Convite ainda aceita gente nova: dentro do prazo e com vaga.
 * @param {object|null} invite Convite `{token, createdAt, confirmed}`.
 * @param {number} [now] Hora atual.
 * @returns {boolean} Verdadeiro se dentro de `INVITE_TTL_MS` e com menos de `INVITE_MAX_USES` confirmados.
 */
export const inviteOpen = (invite, now = Date.now()) =>
  Boolean(invite) && now - invite.createdAt < INVITE_TTL_MS && invite.confirmed.length < INVITE_MAX_USES;

/**
 * O convite em uso; esgotado ou vencido, troca por um novo (o token antigo para de valer).
 * @param {{storage?: Storage, now?: number, random?: (n: number) => Uint8Array}} [options] Armazenamento, hora e gerador de bytes.
 * @returns {object} Convite aberto `{token, createdAt, confirmed}`.
 */
export function currentInvite({ storage = globalThis.localStorage, now = Date.now(), random = randomBytes } = {}) {
  const invite = readInvite(storage);
  if (inviteOpen(invite, now)) return invite;
  return writeInvite({ token: toB64Url(random(16)), createdAt: now, confirmed: [] }, storage);
}

/**
 * O convite guardado, sem criar nem trocar (ao contrário de `currentInvite`).
 * @param {Storage} [storage] Armazenamento (padrão: `localStorage`).
 * @returns {object|null} Convite `{token, createdAt, confirmed}`, ou null se não houver um válido.
 */
export function peekInvite(storage = globalThis.localStorage) {
  return readInvite(storage);
}

/**
 * Anota no convite que esta pessoa foi confirmada (conta uma vaga; repetir não conta de novo).
 * @param {string} invitee Conta confirmada.
 * @param {Storage} [storage] Armazenamento (padrão: `localStorage`).
 * @returns {object|null} O convite atualizado, ou null se não houver convite.
 */
export function recordConfirmed(invitee, storage = globalThis.localStorage) {
  const invite = readInvite(storage);
  if (!invite || invite.confirmed.includes(invitee)) return invite;
  return writeInvite({ ...invite, confirmed: [...invite.confirmed, invitee] }, storage);
}

/**
 * Corpo do aceite que quem foi convidado assina.
 * PM-83 lote F: `mediationOnly` marca o vínculo como "só mediação" (não dá poder de arquivar);
 * `switchFrom` troca o padrinho (uma vez, vale 7 dias depois). Os dois ficam no aceite, que só quem aceita assina.
 * @param {{me: string, inviter: string, token: string, sponsor?: boolean, mediationOnly?: boolean, switchFrom?: string, now?: number}} input
 *   Quem aceita, quem convidou, o token do convite e as opções do vínculo.
 * @returns {object} Corpo `vox-link` de tipo `accept`, a assinar. Lança erro se as contas forem iguais ou o token inválido.
 */
export function buildAccept({ me, inviter, token, sponsor = false, mediationOnly = false, switchFrom = "", now = Date.now() }) {
  if (!me || !inviter || me === inviter) throw new Error("Vínculo precisa de duas pessoas diferentes.");
  if (!isInviteToken(token)) throw new Error("Convite inválido.");
  const body = { id: `vlk_acc_${me}_${inviter}`, type: VOX_LINK_TYPE, kind: "accept", to: inviter, token, sponsor: sponsor === true, ts: now };
  if (mediationOnly) body.scope = "mediacao";
  if (sponsor === true && switchFrom && switchFrom !== inviter) body.switchFrom = String(switchFrom);
  return body;
}

/**
 * Quem convidou confirma este aceite? Só um convite seu, aberto, de quem ainda não confirmou (quem já foi confirmado
 * pode ser confirmado de novo mesmo com o convite fechado).
 * @param {object} accept Aceite assinado recebido.
 * @param {{me: string, invite: object|null, now?: number}} context Conta deste aparelho, convite em uso e hora atual.
 * @returns {boolean} Verdadeiro se este aparelho deve assinar a confirmação.
 */
export function shouldConfirm(accept, { me, invite, now = Date.now() }) {
  if (accept?.type !== VOX_LINK_TYPE || accept.kind !== "accept") return false;
  if (accept.to !== me || !accept.author || accept.author === me) return false;
  if (!invite || accept.token !== invite.token) return false;
  return invite.confirmed.includes(accept.author) || inviteOpen(invite, now);
}

/**
 * Corpo da confirmação que fecha o vínculo. O aceite vai como texto JSON: o texto assinado
 * (`canonicalString`) só cobre as chaves de primeiro nível, e um objeto aninhado ficaria de fora.
 * @param {object} accept Aceite assinado por quem foi convidado.
 * @param {number} [now] Hora da confirmação.
 * @returns {object} Corpo `vox-link` de tipo `confirm`, a assinar por quem convidou.
 */
export function buildConfirm(accept, now = Date.now()) {
  return {
    id: `vlk_${accept.to}_${accept.author}`,
    type: VOX_LINK_TYPE,
    kind: "confirm",
    to: accept.author,
    token: accept.token,
    sponsor: accept.sponsor === true,
    accept: JSON.stringify(accept),
    ts: now,
  };
}

function halvesMatch(confirm, accept) {
  return accept?.type === VOX_LINK_TYPE && accept.kind === "accept"
    && accept.to === confirm.author && confirm.to === accept.author && accept.author !== confirm.author
    && isInviteToken(accept.token) && accept.token === confirm.token
    && (accept.sponsor === true) === (confirm.sponsor === true);
}

function parseAccept(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Confere o vínculo inteiro (as duas assinaturas e as duas metades). Devolve as partes ou null.
 * @param {object} record Confirmação assinada, com o aceite em texto JSON.
 * @param {(signed: object) => Promise<boolean>} verify Confere a assinatura de um registro.
 * @returns {Promise<{inviter: string, invitee: string, sponsor: boolean, since: number, mediationOnly: boolean, switchFrom: string}|null>}
 *   As partes do vínculo, ou null se algo não bater.
 */
export async function verifyLink(record, verify) {
  if (record?.type !== VOX_LINK_TYPE || record.kind !== "confirm" || typeof record.accept !== "string") return null;
  const accept = parseAccept(record.accept);
  if (!halvesMatch(record, accept)) return null;
  if (!(await verify(record)) || !(await verify(accept))) return null;
  return {
    inviter: record.author, invitee: accept.author, sponsor: record.sponsor === true, since: Number(record.ts) || 0,
    mediationOnly: accept.scope === "mediacao", switchFrom: typeof accept.switchFrom === "string" ? accept.switchFrom : "",
  };
}

/**
 * Situação do vínculo entre mim e quem convidou, pelos registros que o aparelho tem.
 * @param {object[]} records Registros de vínculo.
 * @param {{me: string, inviter: string}} pair As duas contas.
 * @returns {"confirmed"|"pending"|"none"} Confirmado, aceito sem confirmação, ou nada.
 */
export function linkState(records, { me, inviter }) {
  const confirmed = records.some((r) => r.kind === "confirm" && r.author === inviter && r.to === me);
  if (confirmed) return "confirmed";
  return records.some((r) => r.kind === "accept" && r.author === me && r.to === inviter) ? "pending" : "none";
}

/**
 * Já assinei um aceite de padrinho? O aparelho só assina um (fora a troca, uma vez).
 * @param {object[]} records Registros de vínculo.
 * @param {string} me Conta deste aparelho.
 * @returns {boolean} Verdadeiro se já existe um aceite de padrinho assinado por mim.
 */
export const hasSponsorClaim = (records, me) => records.some((r) => r.kind === "accept" && r.author === me && r.sponsor === true);

/**
 * Verifica se o autor já utilizou a troca única de padrinho.
 * @param {object[]} records Registros de vínculo verificados.
 * @param {string} me Identificador do autor.
 * @returns {boolean} Verdadeiro se já houve troca aceita.
 */
export const hasSwitched = (records, me) => records.some((r) => r.kind === "accept" && r.author === me && r.sponsor === true && r.switchFrom);
