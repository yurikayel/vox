/**
 * @file Pedir teste (SUB-24, modelo): o Mestre pede um teste de perícia a até 8 jogadores, com a CD pública ou oculta.
 * O sigilo vem por construção: um pedido com CD oculta não tem campo `dc` na op nem no estado; a CD só entra no log com
 * a op de revelação, que é pública. Sem filtro novo de envio nem projeção nova.
 * O texto dos ✓/✗ não é gravado: sai de `checkResults` na hora de exibir, sobre o log ordenado por `(lamport, opId)`.
 * Aqui: normalização, os dois sub-redutores (`CHECK_REQUEST`, `CHECK_REVEAL`), o resultado puro e o construtor da op.
 * @module dungeon/vtt-check-request
 */
import { createChronicleEntry, isValidVttId } from "./vtt-schema.js";

const SKILL_ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_TARGETS = 8;
const DC_MIN = 1;
const DC_MAX = 60;

function validDc(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= DC_MIN && n <= DC_MAX ? n : null;
}

function normalizeTargets(targets) {
  const list = (Array.isArray(targets) ? targets : []).map((t) => String(t ?? "").trim()).filter((t) => t && t.length <= 80);
  const unique = [...new Set(list)];
  return unique.length >= 1 && unique.length <= MAX_TARGETS && unique.length === list.length ? unique : null;
}

/**
 * Normaliza o payload de `CHECK_REQUEST`. Com `dcHidden`, descarta a `dc` (um cliente com defeito não grava a CD).
 * @param {object} payload `{ requestId, skillId, label, targets, dcHidden, dc?, rollVisibility }`.
 * @returns {{ requestId: string, skillId: string, label: string, targets: string[], dcHidden: boolean, dc?: number, rollVisibility: "public"|"gm" }|null} `null` se inválido.
 */
export function normalizeCheckRequest(payload) {
  const p = payload || {};
  const targets = normalizeTargets(p.targets);
  const dcHidden = p.dcHidden === true;
  const dc = dcHidden ? null : validDc(p.dc);
  if (!isValidVttId(p.requestId) || !SKILL_ID_RE.test(String(p.skillId)) || !targets || (!dcHidden && dc === null)) return null;
  const label = String(p.label ?? "").trim().slice(0, 80) || String(p.skillId);
  const base = { requestId: p.requestId, skillId: p.skillId, label, targets, dcHidden, rollVisibility: p.rollVisibility === "gm" ? "gm" : "public" };
  return dcHidden ? base : { ...base, dc };
}

/**
 * Monta a op `CHECK_REQUEST` pronta para `dispatchCampaignOp`, já normalizada (com CD oculta, sem `dc`).
 * @param {object} fields Campos do pedido (ver `normalizeCheckRequest`).
 * @returns {{ type: "CHECK_REQUEST", payload: object }|null} `null` se os campos forem inválidos.
 */
export function buildCheckRequestOp(fields) {
  const payload = normalizeCheckRequest(fields);
  return payload ? { type: "CHECK_REQUEST", payload } : null;
}

function requestText(request) {
  return `O Mestre pede ${request.label} · ${request.dcHidden ? "CD oculta" : `CD ${request.dc}`}`;
}

function chronicleOf(state, entry) {
  return [...(state.chronicle || []), createChronicleEntry(entry)];
}

function applyCheckRequest(state, op) {
  const payload = normalizeCheckRequest(op.payload);
  if (!payload || state.checkRequestsById?.[payload.requestId]) return state;
  const request = { ...payload, status: "open", ts: op.ts };
  return {
    ...state,
    checkRequestsById: { ...state.checkRequestsById, [request.requestId]: request },
    chronicle: chronicleOf(state, { id: `check-${request.requestId}`, speaker: "Mesa", badge: "Pedido", text: requestText(request), visibility: "public", author: op.actor, ts: op.ts, checkRequestId: request.requestId }),
  };
}

/** Ordem de duas ops no log: `(lamport, opId)`, a mesma do replay. */
function compareOrder(a, b) {
  return (Number(a.lamport) || 0) - (Number(b.lamport) || 0) || String(a.opId || "").localeCompare(String(b.opId || ""));
}

/** Rolagens públicas do alvo ligadas ao pedido, até a revelação (na ordem do log). Rolagem `gm` não conta: nem todo par a recebe. */
function publicRollsOf(state, request, target) {
  return (state.rolls || [])
    .filter((r) => r.requestId === request.requestId && r.author === target && r.visibility === "public" && compareOrder(r, request.revealKey) <= 0)
    .sort(compareOrder);
}

/**
 * Resultado por alvo de um pedido revelado: função pura do log ordenado por `(lamport, opId)`, igual em todo par e no replay.
 * Vale a PRIMEIRA rolagem pública do alvo até a revelação; sem ela, o alvo é "com o Mestre" (pedido com rolagem do Mestre) ou "não rolou".
 * @param {object} state Estado da campanha.
 * @param {object} request Pedido já revelado (`dc`, `revealKey`).
 * @returns {Array<{ target: string, speaker: string, outcome: "pass"|"fail"|"gm"|"none", total?: number }>} Um item por alvo.
 */
export function checkResults(state, request) {
  return request.targets.map((target) => {
    const first = publicRollsOf(state, request, target)[0];
    if (first) return { target, speaker: first.speaker, outcome: first.total >= request.dc ? "pass" : "fail", total: first.total };
    return { target, speaker: "", outcome: request.rollVisibility === "gm" ? "gm" : "none" };
  });
}

function resultLine(result, index) {
  const name = result.speaker || `Alvo ${index + 1}`;
  if (result.outcome === "gm") return `${name} resultado com o Mestre`;
  if (result.outcome === "none") return `${name} não rolou`;
  return `${name} ${result.outcome === "pass" ? "✓" : "✗"} ${result.total}`;
}

/**
 * Texto de exibição de uma entrada da Crônica ligada a um pedido: a linha "Resultado" ganha os ✓/✗ calculados na hora.
 * @param {object} entry Entrada da Crônica.
 * @param {object} state Estado da campanha.
 * @returns {string} Texto a mostrar (o gravado, se não for linha de resultado).
 */
export function checkEntryText(entry, state) {
  const request = entry.badge === "Resultado" ? state.checkRequestsById?.[entry.checkRequestId] : null;
  if (!request || request.status !== "revealed") return entry.text;
  return `${entry.text}: ${checkResults(state, request).map(resultLine).join("; ")}`;
}

function applyCheckReveal(state, op) {
  const request = state.checkRequestsById?.[op.payload?.requestId];
  if (!request || request.status !== "open") return state;
  const dc = request.dcHidden ? validDc(op.payload?.dc) : request.dc;
  if (dc === null) return state;
  const revealed = { ...request, status: "revealed", dc, revealKey: { lamport: op.lamport, opId: op.opId } };
  return {
    ...state,
    checkRequestsById: { ...state.checkRequestsById, [request.requestId]: revealed },
    chronicle: chronicleOf(state, { id: `reveal-${request.requestId}`, speaker: "Mesa", badge: "Resultado", text: `${request.label} · CD ${dc}`, visibility: "public", author: op.actor, ts: op.ts, checkRequestId: request.requestId }),
  };
}

/** @type {Record<string, (state: object, op: object) => object>} */
export const CHECK_OP_HANDLERS = {
  CHECK_REQUEST: applyCheckRequest,
  CHECK_REVEAL: applyCheckReveal,
};
