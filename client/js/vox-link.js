/**
 * @file PM-82 — vínculo assinado: registro com a assinatura das duas pessoas (quem convidou e quem aceitou).
 * Base do moderador natural (PM-83). Lógica pura; assinar, guardar e espalhar chegam de fora.
 * Spec: docs/specs/moderador-natural-v0.md.
 */

export const VOX_LINK_TYPE = "vox-link";
export const INVITE_STORAGE_KEY = "vox-invite-v1";
export const INVITE_MAX_USES = 10;
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

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

/** Convite ainda aceita gente nova: dentro do prazo e com vaga. */
export const inviteOpen = (invite, now = Date.now()) =>
  Boolean(invite) && now - invite.createdAt < INVITE_TTL_MS && invite.confirmed.length < INVITE_MAX_USES;

/** O convite em uso; esgotado ou vencido, troca por um novo (o token antigo para de valer). */
export function currentInvite({ storage = globalThis.localStorage, now = Date.now(), random = randomBytes } = {}) {
  const invite = readInvite(storage);
  if (inviteOpen(invite, now)) return invite;
  return writeInvite({ token: toB64Url(random(16)), createdAt: now, confirmed: [] }, storage);
}

export function peekInvite(storage = globalThis.localStorage) {
  return readInvite(storage);
}

export function recordConfirmed(invitee, storage = globalThis.localStorage) {
  const invite = readInvite(storage);
  if (!invite || invite.confirmed.includes(invitee)) return invite;
  return writeInvite({ ...invite, confirmed: [...invite.confirmed, invitee] }, storage);
}

/**
 * Corpo do aceite que quem foi convidado assina.
 * PM-83 lote F: `mediationOnly` marca o vínculo como "só mediação" (não dá poder de arquivar);
 * `switchFrom` troca o padrinho (uma vez, vale 7 dias depois). Os dois ficam no aceite, que só quem aceita assina.
 */
export function buildAccept({ me, inviter, token, sponsor = false, mediationOnly = false, switchFrom = "", now = Date.now() }) {
  if (!me || !inviter || me === inviter) throw new Error("Vínculo precisa de duas pessoas diferentes.");
  if (!isInviteToken(token)) throw new Error("Convite inválido.");
  const body = { id: `vlk_acc_${me}_${inviter}`, type: VOX_LINK_TYPE, kind: "accept", to: inviter, token, sponsor: sponsor === true, ts: now };
  if (mediationOnly) body.scope = "mediacao";
  if (sponsor === true && switchFrom && switchFrom !== inviter) body.switchFrom = String(switchFrom);
  return body;
}

/** Quem convidou confirma este aceite? Só um convite seu, aberto, de quem ainda não confirmou. */
export function shouldConfirm(accept, { me, invite, now = Date.now() }) {
  if (accept?.type !== VOX_LINK_TYPE || accept.kind !== "accept") return false;
  if (accept.to !== me || !accept.author || accept.author === me) return false;
  if (!invite || accept.token !== invite.token) return false;
  return invite.confirmed.includes(accept.author) || inviteOpen(invite, now);
}

/**
 * Corpo da confirmação que fecha o vínculo. O aceite vai como texto JSON: o texto assinado
 * (`canonicalString`) só cobre as chaves de primeiro nível, e um objeto aninhado ficaria de fora.
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

/** Confere o vínculo inteiro (as duas assinaturas e as duas metades). Devolve as partes ou null. */
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

/** Situação do vínculo entre mim e quem convidou, pelos registros que o aparelho tem. */
export function linkState(records, { me, inviter }) {
  const confirmed = records.some((r) => r.kind === "confirm" && r.author === inviter && r.to === me);
  if (confirmed) return "confirmed";
  return records.some((r) => r.kind === "accept" && r.author === me && r.to === inviter) ? "pending" : "none";
}

/** Já assinei um aceite de padrinho? O aparelho só assina um (fora a troca, uma vez). */
export const hasSponsorClaim = (records, me) => records.some((r) => r.kind === "accept" && r.author === me && r.sponsor === true);

/**
 * Verifica se o autor já utilizou a troca única de padrinho.
 * @param {object[]} records Registros de vínculo verificados.
 * @param {string} me Identificador do autor.
 * @returns {boolean} Verdadeiro se já houve troca aceita.
 */
export const hasSwitched = (records, me) => records.some((r) => r.kind === "accept" && r.author === me && r.sponsor === true && r.switchFrom);
