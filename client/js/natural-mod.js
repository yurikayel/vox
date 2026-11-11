/**
 * @file Moderador natural (PM-83, ADR-023 §2 e emenda §4): quem responde por quem, a partir dos vínculos
 * assinados pelas duas pessoas (PM-82). Lógica pura, sem DOM.
 *
 * - Padrinho: quem a pessoa marcou ao aceitar o convite ("X me trouxe para o Vox").
 * - Mais próximo: na falta do padrinho, o vínculo comum mais antigo, preferindo membro da comunidade.
 *   Só vínculo assinado conta; sinais de interação (curtidas, mensagens) ficam de fora (emenda §4.2.2).
 * - Nunca a outra parte do caso.
 */

import { verifyLink } from "./vox-link.js";

/** Vínculos válidos (as duas assinaturas conferidas), sem repetir o mesmo par. */
export async function collectLinks(records = [], verify) {
  const out = new Map();
  for (const record of records) {
    const link = await verifyLink(record, verify).catch(() => null);
    if (!link) continue;
    const key = `${link.inviter}>${link.invitee}`;
    const prev = out.get(key);
    if (!prev || link.since < prev.since) out.set(key, link);
  }
  return [...out.values()];
}

const bySince = (a, b) => a.since - b.since;
const otherSide = (link, person) => (link.inviter === person ? link.invitee : link.inviter);

export const SWITCH_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/** Só os vínculos que servem ao propósito: "denuncia" deixa de fora os vínculos "só mediação". */
export const forPurpose = (links = [], purpose = "denuncia") => (purpose === "mediacao" ? links : links.filter((l) => !l.mediationOnly));

/**
 * Padrinho da pessoa: o vínculo de padrinho mais antigo em que ela foi convidada. Uma troca de padrinho
 * (lote F) vale 7 dias depois de confirmada; antes disso, o padrinho de antes continua.
 */
export function sponsorOf(links = [], person = "", now = Date.now()) {
  const mine = links.filter((l) => l.sponsor && l.invitee === person).sort(bySince);
  const switched = mine.find((l) => l.switchFrom && now >= l.since + SWITCH_DELAY_MS);
  return switched?.inviter || mine.find((l) => !l.switchFrom)?.inviter || "";
}

/** Troca de padrinho ainda em espera (confirmada há menos de 7 dias), ou null. */
export function pendingSwitch(links = [], person = "", now = Date.now()) {
  const l = links.filter((x) => x.sponsor && x.invitee === person && x.switchFrom).sort(bySince)[0];
  return l && now < l.since + SWITCH_DELAY_MS ? { to: l.inviter, from: l.switchFrom, at: l.since + SWITCH_DELAY_MS } : null;
}

/** Afilhados: quem tem a pessoa como padrinho hoje (trocas já valendo contam), do mais antigo ao mais novo. */
export function godchildrenOf(links = [], person = "", now = Date.now()) {
  return links.filter((l) => l.sponsor && l.inviter === person && sponsorOf(links, l.invitee, now) === person)
    .sort(bySince).map((l) => l.invitee);
}

/**
 * Pessoa mais próxima: vínculo comum (não de padrinho, em qualquer direção), membro da comunidade primeiro,
 * depois o mais antigo. `exclude`: quem não pode ser (as partes do caso).
 */
export function closestOf(links = [], person = "", { exclude = [], members = null } = {}) {
  const out = new Set(exclude);
  const candidates = links
    .filter((l) => !l.sponsor && (l.inviter === person || l.invitee === person))
    .map((l) => ({ route: otherSide(l, person), since: l.since }))
    .filter((c) => c.route !== person && !out.has(c.route));
  const isMember = (c) => (members?.has(c.route) ? 0 : 1);
  candidates.sort((a, b) => isMember(a) - isMember(b) || a.since - b.since);
  return candidates[0]?.route || "";
}

/**
 * Moderador natural da pessoa: `{ route, via: "padrinho" | "proximo" }`, ou null se ela não tem vínculo.
 * O padrinho vale se não for parte do caso; se for, cai para o mais próximo.
 */
export function naturalModeratorOf(links = [], person = "", { exclude = [], members = null } = {}) {
  const banned = new Set([person, ...exclude]);
  const sponsor = sponsorOf(links, person);
  if (sponsor && !banned.has(sponsor)) return { route: sponsor, via: "padrinho" };
  const closest = closestOf(links, person, { exclude: [...banned], members });
  return closest ? { route: closest, via: "proximo" } : null;
}

/** Os dois lados de um caso: N1 cuida de quem foi denunciado, N2 de quem denunciou (ADR-023 §2.3). */
export function caseModerators(allLinks = [], { target = "", reporter = "", members = null, purpose = "denuncia" } = {}) {
  const links = forPurpose(allLinks, purpose);
  const parties = [target, reporter].filter(Boolean);
  return {
    n1: target ? naturalModeratorOf(links, target, { exclude: parties, members }) : null,
    n2: reporter ? naturalModeratorOf(links, reporter, { exclude: parties, members }) : null,
  };
}

/** Modelo da tela "Meus vínculos": quem pode cuidar dos meus posts e de quem eu cuido. */
export function myLinksModel(allLinks = [], me = "", now = Date.now()) {
  const links = forPurpose(allLinks, "denuncia");
  const sponsor = sponsorOf(links, me, now);
  const closest = closestOf(links, me, { exclude: sponsor ? [sponsor] : [] });
  const common = links.filter((l) => !l.sponsor && (l.inviter === me || l.invitee === me)).map((l) => otherSide(l, me));
  const mediationOnly = allLinks.filter((l) => l.mediationOnly && (l.inviter === me || l.invitee === me)).map((l) => otherSide(l, me));
  return {
    sponsor, closest, godchildren: godchildrenOf(links, me, now), common: [...new Set(common)],
    mediationOnly: [...new Set(mediationOnly)], switching: pendingSwitch(links, me, now),
  };
}

/* ---- Lotes B a D: casos, arquivamento firme de N1, teto e perda do papel ---- */

export const CASE_DM_KIND = "moderacao-natural";
export const NATURAL_HIDE_TYPE = "natural-hide";
export const FIRM_GODCHILD_MAX = 30;
export const REVERSAL_LIMIT = 3;
export const REVERSAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Aviso de caso para um moderador natural. Nunca leva quem denunciou: N1 (lado do denunciado) não pode saber,
 * e o aviso de N1 sai do aparelho da moderação, não de quem denunciou. N2 recebe o aviso de quem denunciou
 * (o afilhado ou o próximo dele), então já sabe pela própria conversa.
 */
export function buildCaseNotice({ caseId, postId, communityId = "", target, reason = "", side }) {
  if (!caseId || !postId || !target || !["target", "reporter"].includes(side)) throw new Error("Caso incompleto.");
  return { caseId, postId, communityId, target, reason: String(reason).slice(0, 40), side };
}

export function serializeCaseDm(notice, text) {
  const card = { type: "topic", id: notice.postId, title: "Denúncia para você decidir" };
  return JSON.stringify({ __vox_dm_v2: 1, kind: CASE_DM_KIND, text: String(text), contextCard: card, natCase: notice });
}

/** O aviso de caso contido na DM, ou null. */
export function parseCaseDm(raw) {
  const str = String(raw ?? "");
  if (!str.startsWith('{"__vox_dm_v2":1')) return null;
  try {
    const parsed = JSON.parse(str);
    const c = parsed?.kind === CASE_DM_KIND ? parsed.natCase : null;
    return c?.caseId && c.postId && c.target && ["target", "reporter"].includes(c.side) ? c : null;
  } catch {
    return null;
  }
}

/** Corpo do arquivamento firme de N1: a prova é o vínculo de padrinho, como texto (assinatura v1). */
export function buildNaturalHide({ communityId, postId, target, proofRecord }, now = Date.now()) {
  if (!communityId || !postId || !target || !proofRecord) throw new Error("Arquivamento sem prova.");
  return { type: NATURAL_HIDE_TYPE, communityId, postId, target, proof: JSON.stringify(proofRecord), ts: now };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Confere um arquivamento firme: assinatura de quem arquivou e prova de que ele é padrinho do autor do post
 * (vínculo de padrinho com as duas assinaturas). Vínculo "só mediação" não dá esse poder. Devolve os dados ou null.
 */
export async function verifyNaturalHide(hide, verify) {
  if (hide?.type !== NATURAL_HIDE_TYPE || !hide.author || typeof hide.proof !== "string") return null;
  if (!(await Promise.resolve(verify(hide)).catch(() => false))) return null;
  const link = await verifyLink(parseJson(hide.proof), verify).catch(() => null);
  if (!link?.sponsor || link.mediationOnly || link.inviter !== hide.author || link.invitee !== hide.target) return null;
  return { hider: hide.author, target: hide.target, postId: hide.postId, communityId: hide.communityId, ts: Number(hide.ts) || 0 };
}

/** Reversões contra quem arquivou, numa comunidade: `unhide` da moderação depois de um arquivamento dele, em 90 dias. */
export function reversalsAgainst(hider, { hides = [], unhides = [], now = Date.now() } = {}) {
  const mine = hides.filter((h) => h.hider === hider);
  const since = now - REVERSAL_WINDOW_MS;
  return unhides.filter((u) => Number(u.ts) >= since && mine.some((h) => h.postId === u.target && Number(u.ts) > h.ts)).length;
}

/**
 * O padrinho tem poder firme sobre este afilhado? Só entre os 30 primeiros afilhados (pela data do vínculo)
 * e com menos de 3 reversões em 90 dias nesta comunidade (emenda §4.2.3 e §4.2.4).
 */
export function hasFirmPower(links, hider, target, { reversals = 0, now = Date.now() } = {}) {
  const rank = godchildrenOf(forPurpose(links, "denuncia"), hider, now).indexOf(target);
  return rank >= 0 && rank < FIRM_GODCHILD_MAX && reversals < REVERSAL_LIMIT;
}
