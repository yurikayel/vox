/** PROFILE_CARD gossip v0 — validate, TTL, assinatura (V-MESH). */

import * as localAccount from "./identity/index.js";
import * as profileNote from "./profile-note.js";
import { getLocalIdentityMeta, pickIdentityMeta } from "./profile-identity-meta.js";
import * as upload from "./upload.js";

/** Tipo de payload de cartão de perfil na malha e no Arweave. */
export const PROFILE_CARD_TYPE = "profile-card";
/** Tempo máximo de vida de um cartão de perfil (30 dias). */
export const CARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Monta o ID determinístico do cartão de perfil a partir do `routeId`.
 * @param {string} routeId Identificador `vx_…` da conta.
 * @returns {string} ID canônico (`pc_vx_…`) ou string vazia.
 */
export function canonicalProfileCardId(routeId) {
  const id = String(routeId || "").trim();
  return id ? `pc_${id}` : "";
}

/**
 * Indica se o cartão ultrapassou `CARD_TTL_MS` ou não traz timestamp válido.
 * @param {object} item Cartão de perfil recebido.
 * @returns {boolean} `true` se expirado ou sem timestamp.
 */
export function isProfileCardExpired(item) {
  const t = Number(item?.editedAt || item?.ts || 0);
  if (!t) return true;
  return Date.now() - t > CARD_TTL_MS;
}

/**
 * Valida a forma, identidade, assinatura e validade de um cartão de perfil.
 * @param {object} item Cartão candidato.
 * @returns {{ ok: boolean, reason?: string }} Resultado da validação.
 */
export function validateProfileCardItem(item) {
  if (!item || typeof item !== "object") return { ok: false, reason: "missing" };
  if (item.type !== PROFILE_CARD_TYPE) return { ok: false, reason: "type" };
  const routeId = String(item.routeId || "").trim();
  const author = String(item.author || "").trim();
  if (!routeId.startsWith("vx_") || !author.startsWith("vx_")) return { ok: false, reason: "route" };
  if (routeId !== author) return { ok: false, reason: "author-mismatch" };
  const expectedId = canonicalProfileCardId(routeId);
  if (item.id !== expectedId) return { ok: false, reason: "id" };
  if (typeof item.discoverable !== "boolean") return { ok: false, reason: "discoverable" };
  if (!item.sig || !item.pubKey) return { ok: false, reason: "sig" };
  if (isProfileCardExpired(item)) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * Resolve o nome do cartão (informado, da conta ou do enriquecimento).
 * @param {string} displayName Nome informado
 * @param {object} enrich Enriquecimento do perfil
 * @returns {string} Nome.
 */
function resolveCardDisplayName(displayName, enrich) {
  if (displayName) return displayName;
  const local = localAccount.getDisplayName();
  if (local) return local;
  return (enrich && enrich.displayName) ? enrich.displayName : "";
}

/**
 * Resolve o avatar do cartão.
 * @param {string} avatarUrl Avatar informado
 * @param {object} enrich Enriquecimento do perfil
 * @returns {string} Avatar, ou texto vazio.
 */
function resolveCardAvatar(avatarUrl, enrich) {
  if (avatarUrl) return avatarUrl;
  return (enrich && enrich.avatarUrl) ? enrich.avatarUrl : "";
}

/**
 * Resolve a bio do cartão.
 * @param {string} bio Bio informada
 * @param {object} enrich Enriquecimento do perfil
 * @returns {string} Bio, ou texto vazio.
 */
function resolveCardBio(bio, enrich) {
  if (bio) return bio;
  return (enrich && enrich.bio) ? enrich.bio : "";
}

/**
 * Resolve os metadados de identidade do cartão.
 * @param {object} metaOverride Metadados informados
 * @param {string} routeId Id de rota
 * @returns {object} Metadados.
 */
function resolveCardIdentityMeta(metaOverride, routeId) {
  return pickIdentityMeta(metaOverride, getLocalIdentityMeta(routeId));
}

/**
 * Monta e assina o cartão de perfil da conta ativa para divulgação na malha.
 * @param {{ displayName?: string, avatarUrl?: string, bio?: string, pronouns?: string, gender?: string, orientation?: string }} [opts] Sobrescritas de campos.
 * @returns {Promise<object>} Cartão assinado.
 */
export async function buildSignedProfileCard({ displayName = "", avatarUrl = "", bio = "", pronouns = "", gender = "", orientation = "" } = {}) {
  const routeId = await localAccount.getRouteId();
  const enrich = localAccount.getProfileEnrichment();
  const note = profileNote.getNote(routeId);
  const name = resolveCardDisplayName(displayName, enrich);
  const avatar = resolveCardAvatar(avatarUrl, enrich);
  const resolvedBio = resolveCardBio(bio, enrich);
  const meta = resolveCardIdentityMeta({ pronouns, gender, orientation }, routeId);

  const payload = {
    id: canonicalProfileCardId(routeId),
    type: PROFILE_CARD_TYPE,
    routeId,
    displayName: String(name).slice(0, 80),
    avatarUrl: String(avatar).slice(0, 512),
    bio: String(resolvedBio).slice(0, 280),
    ...(meta.pronouns ? { pronouns: meta.pronouns } : {}),
    ...(meta.gender ? { gender: meta.gender } : {}),
    ...(meta.orientation ? { orientation: meta.orientation } : {}),
    note: (note && note.text) ? note.text : "",
    noteAt: (note && note.updatedAt) ? note.updatedAt : 0,
    discoverable: true,
    editedAt: Date.now(),
  };
  return localAccount.signPayload(payload);
}

/**
 * Monta e assina um cartão de revogação (`discoverable: false`) para a conta ativa.
 * @returns {Promise<object>} Cartão assinado de revogação.
 */
export async function buildRevokeProfileCard() {
  const routeId = await localAccount.getRouteId();
  const payload = {
    id: canonicalProfileCardId(routeId),
    type: PROFILE_CARD_TYPE,
    routeId,
    displayName: localAccount.getDisplayName() || "",
    avatarUrl: "",
    bio: "",
    discoverable: false,
    editedAt: Date.now(),
  };
  return localAccount.signPayload(payload);
}

/**
 * Aparia o valor e corta no tamanho máximo, se houver.
 * @param {*} val Valor
 * @param {number} maxLen Tamanho máximo
 * @returns {string} Texto.
 */
function getCardTagValue(val, maxLen) {
  const str = String(val || "").trim();
  return maxLen ? str.slice(0, maxLen) : str;
}

/**
 * Constrói as tags Arweave de um cartão de perfil.
 * @param {object} card Cartão de perfil.
 * @returns {{ name: string, value: string }[]} Lista de tags.
 */
export function buildProfileCardArweaveTags(card) {
  const c = card || {};
  const name = c.displayName || c.name || "";
  const ts = c.editedAt || c.ts || Date.now();
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: PROFILE_CARD_TYPE },
    { name: "Route-Id", value: getCardTagValue(c.routeId) },
    { name: "Display-Name", value: getCardTagValue(name, 80) },
    { name: "Bio", value: getCardTagValue(c.bio, 280) },
    { name: "Avatar-Url", value: getCardTagValue(c.avatarUrl, 512) },
    { name: "Discoverable", value: c.discoverable !== false ? "true" : "false" },
    { name: "Timestamp", value: String(ts) },
    { name: "Content-Type", value: "application/json" },
  ];
  if (c.pronouns) tags.push({ name: "Pronouns", value: getCardTagValue(c.pronouns, 40) });
  if (c.gender) tags.push({ name: "Gender", value: getCardTagValue(c.gender, 48) });
  if (c.orientation) tags.push({ name: "Orientation", value: getCardTagValue(c.orientation, 48) });
  return tags;
}

/**
 * Publica o cartão de perfil no Arweave usando `uploadFn` (sujeito às guardas de upload).
 * @param {object} card Cartão assinado.
 * @param {{ uploadFn?: Function }} [opts] Função de upload injetável.
 * @returns {Promise<{ ok: boolean, id?: string, via?: string, reason?: string, error?: string }>} Resultado do envio.
 */
export async function publishProfileCardOnChain(card, { uploadFn = upload.postData } = {}) {
  if (!card?.routeId) return { ok: false, reason: "invalid-card" };
  const tags = buildProfileCardArweaveTags(card);
  const data = JSON.stringify(card);
  try {
    const res = await uploadFn(data, tags, { autoCreate: true });
    return { ok: true, id: res.id, via: res.via };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
