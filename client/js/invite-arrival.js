/**
 * @file Chegada por convite: guarda quem chamou (link `#/connect/<id>?convite=`) até a pessoa entrar.
 * A entrada diz "Ana te chamou" e, depois do pacto, a pessoa cai na tela de quem chamou, já com o contato.
 * Fica só neste aparelho, vence em 7 dias e some ao ser usada. Grava só a chave de quem chamou e o token;
 * o nome (que pode ter vindo do perfil de login de alguém) fica só na memória desta aba.
 */

import { isInviteToken } from "./vox-link.js";

/** Chave no localStorage do convite guardado. */
export const INVITE_ARRIVAL_KEY = "vox-convite-chegada-v1";
/** O convite guardado vale 7 dias. */
export const INVITE_ARRIVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NAME_MAX = 60;
/** Nome de quem chamou, só em memória: inviter → nome. */
const namesInMemory = new Map();

/**
 * Guarda o convite pelo qual a pessoa chegou. O nome fica só em memória e só se não for a própria chave.
 * @param {{ inviter: string, token: string, name?: string }} arrival
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {boolean} se gravou
 */
export function rememberInviteArrival({ inviter, token, name = "" }, storage = globalThis.localStorage, now = Date.now()) {
  const id = String(inviter || "").trim();
  if (!id || !isInviteToken(token)) return false;
  const label = String(name || "").trim();
  if (label && label !== id) namesInMemory.set(id, label.slice(0, NAME_MAX));
  else namesInMemory.delete(id);
  try {
    storage.setItem(INVITE_ARRIVAL_KEY, JSON.stringify({ inviter: id, token, at: now }));
    return true;
  } catch {
    return false;
  }
}

function readRecord(storage) {
  try {
    return JSON.parse(storage.getItem(INVITE_ARRIVAL_KEY) || "null");
  } catch {
    return null;
  }
}

/**
 * O convite guardado, se ainda valer.
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {{ inviter: string, token: string, name: string, at: number } | null}
 */
export function peekInviteArrival(storage = globalThis.localStorage, now = Date.now()) {
  const rec = readRecord(storage);
  if (!rec || typeof rec.inviter !== "string" || !rec.inviter || !isInviteToken(rec.token)) return null;
  const age = now - Number(rec.at);
  if (!(age >= 0 && age <= INVITE_ARRIVAL_TTL_MS)) return null;
  return { inviter: rec.inviter, token: rec.token, name: namesInMemory.get(rec.inviter) || "", at: Number(rec.at) };
}

/**
 * Esquece o convite guardado.
 * @param {Storage} [storage]
 */
export function clearInviteArrival(storage = globalThis.localStorage) {
  try {
    namesInMemory.clear();
    storage.removeItem(INVITE_ARRIVAL_KEY);
  } catch {
    /* armazenamento indisponível: nada a esquecer */
  }
}

/**
 * Rota da tela de quem convidou, com o token, para o cartão do vínculo aparecer.
 * @param {{ inviter: string, token: string }} arrival
 * @returns {string}
 */
export function inviteArrivalHash({ inviter, token }) {
  return `#/connect/${encodeURIComponent(inviter)}?convite=${encodeURIComponent(token)}`;
}
