/**
 * @file Admissão e revogação de pares no Fairplay (ADR-040 §3.1): quem pode entrar nas rolagens, quem foi
 * revogado e a recusa de qualquer op de revogado depois da revogação. Puro e síncrono, como o reducer.
 * @module dungeon/vtt-fairplay-admission
 */
import { isSafeKey, withEntry } from "../shared/safe-key.js";
import { MAX_KEYS, fairplayOf, seal } from "./vtt-fairplay-state.js";

/**
 * O Mestre vale sempre; os demais só com uma admissão de `lamport` menor que o da chave (a ordem do replay é a da chegada).
 * @param {object} state Estado da campanha.
 * @param {object} fp Bloco `fairplay` normalizado.
 * @param {object} op Operação a conferir.
 * @returns {boolean} `true` se o autor está admitido para esta op.
 */
export function isAdmitted(state, fp, op) {
  const gm = String(state.gmRouteId || "");
  if (gm && op.actor === gm) return true;
  const entry = Object.hasOwn(fp.admitted, op.actor) ? fp.admitted[op.actor] : null;
  return Boolean(entry && Number(entry.lamport) < Number(op.lamport));
}

/**
 * `FAIRPLAY_ADMIT`: só o Mestre admite; readmitir depois de revogar exige `lamport` maior que o da revogação.
 * @param {object} state Estado da campanha.
 * @param {object} op Operação `FAIRPLAY_ADMIT`.
 * @returns {object} Novo estado, ou o mesmo se a op for recusada.
 */
export function applyFairplayAdmit(state, op) {
  const gm = String(state.gmRouteId || "");
  const target = String(op.payload?.actor || "");
  if (!gm || op.actor !== gm || !isSafeKey(target)) return state;
  const fp = fairplayOf(state);
  const revokedAt = Object.hasOwn(fp.revoked, target) ? Number(fp.revoked[target].lamport) : null;
  if (revokedAt !== null && Number(op.lamport) <= revokedAt) return state; // readmitir só com `lamport` maior que o da revogação
  if (Object.hasOwn(fp.admitted, target) || Object.keys(fp.admitted).length >= MAX_KEYS) return state;
  return { ...state, fairplay: seal({ ...fp, admitted: withEntry(fp.admitted, target, { lamport: Number(op.lamport) }), revoked: without(fp.revoked, target) }) };
}

function without(map, key) {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
}

/**
 * `FAIRPLAY_REVOKE`: só o Mestre revoga, e só quem está admitido; repetida, de par desconhecido ou do próprio Mestre não faz nada.
 * @param {object} state Estado da campanha.
 * @param {object} op Operação `FAIRPLAY_REVOKE`.
 * @returns {object} Novo estado, ou o mesmo se a op for recusada.
 */
export function applyFairplayRevoke(state, op) {
  const gm = String(state.gmRouteId || "");
  const target = String(op.payload?.actor || "");
  if (!gm || op.actor !== gm || target === gm || !isSafeKey(target)) return state;
  const fp = fairplayOf(state);
  if (!Object.hasOwn(fp.admitted, target)) return state;
  const revoked = withEntry(fp.revoked, target, { lamport: Number(op.lamport) });
  return { ...state, fairplay: seal({ ...fp, admitted: without(fp.admitted, target), keys: without(fp.keys, target), revoked }) };
}

/**
 * Op de par revogado, com `lamport` depois da revogação, é recusada em qualquer fase.
 * @param {object} fp Bloco `fairplay` normalizado.
 * @param {object} op Operação a conferir.
 * @returns {boolean} `true` se o autor estava revogado quando a op foi assinada.
 */
export function isRevokedAt(fp, op) {
  return Object.hasOwn(fp.revoked, op.actor) && Number(op.lamport) > Number(fp.revoked[op.actor].lamport);
}

