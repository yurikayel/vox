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

/** Padrinho da pessoa: o vínculo de padrinho mais antigo em que ela foi convidada. */
export function sponsorOf(links = [], person = "") {
  return links.filter((l) => l.sponsor && l.invitee === person).sort(bySince)[0]?.inviter || "";
}

/** Afilhados: quem marcou a pessoa como padrinho, do mais antigo ao mais novo. */
export function godchildrenOf(links = [], person = "") {
  return links.filter((l) => l.sponsor && l.inviter === person).sort(bySince).map((l) => l.invitee);
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
export function caseModerators(links = [], { target = "", reporter = "", members = null } = {}) {
  const parties = [target, reporter].filter(Boolean);
  return {
    n1: target ? naturalModeratorOf(links, target, { exclude: parties, members }) : null,
    n2: reporter ? naturalModeratorOf(links, reporter, { exclude: parties, members }) : null,
  };
}

/** Modelo da tela "Meus vínculos": quem pode cuidar dos meus posts e de quem eu cuido. */
export function myLinksModel(links = [], me = "") {
  const sponsor = sponsorOf(links, me);
  const closest = closestOf(links, me, { exclude: sponsor ? [sponsor] : [] });
  const common = links.filter((l) => !l.sponsor && (l.inviter === me || l.invitee === me)).map((l) => otherSide(l, me));
  return { sponsor, closest, godchildren: godchildrenOf(links, me), common: [...new Set(common)] };
}
