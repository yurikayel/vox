/**
 * @file Faltas do Fairplay (ADR-040 §3): quem é apontado quando uma rolagem é anulada e o texto leigo disso.
 * Tudo aqui é puro e determinístico: cada aparelho refaz a falta pelo próprio log e pela própria conta;
 * nada vindo de outro par (nem o texto da entrada que o Mestre grava) é lido como verdade.
 * @module dungeon/vtt-fairplay-faltas
 */

const SHALL_NOT_FAULT = new Set(["verified", "pending"]);

function committedOf(roll) {
  return (roll.participants || []).filter((p) => Object.hasOwn(roll.commits || {}, p));
}

/**
 * Faltas de uma rolagem, como este aparelho a vê. Rolagem que passou da fase de revelação e não saiu
 * `verified` aponta cada par que se comprometeu e não revelou; rolagem `verified` (mesmo recuperada) não tem falta.
 * @param {object} [roll] Rolagem do bloco `fairplay` do estado.
 * @param {{status?: string}} [verdict] Veredito local de `verifyFairplayRecord` (sem veredito, não há como acusar).
 * @param {{invalidShares?: string}} [local] Achado só deste aparelho: dono das partes que não refazem o número.
 * @returns {Array<{peer: string, kind: "no_reveal"|"invalid_shares"}>} Faltas por par.
 */
export function fairplayRollFaults(roll, verdict, local = {}) {
  if (!roll) return [];
  const owner = String(local.invalidShares || "");
  if (owner && (roll.participants || []).includes(owner)) return [{ peer: owner, kind: "invalid_shares" }];
  if (roll.phase !== "done" || !verdict || SHALL_NOT_FAULT.has(verdict.status)) return [];
  return committedOf(roll).filter((p) => !Object.hasOwn(roll.reveals || {}, p)).map((peer) => ({ peer, kind: "no_reveal" }));
}

/**
 * Texto leigo de uma falta.
 * @param {{peer: string, kind: string}} fault Falta de {@link fairplayRollFaults}.
 * @param {{name: string, mine?: boolean, sent?: boolean}} who Nome de quem é apontado, se é este aparelho e se a revelação dele saiu daqui.
 * @returns {string} Frase para a Crônica.
 */
export function faultText(fault, who) {
  if (fault.kind === "invalid_shares") return `As partes de ${who.name} não refazem o número que ele escondeu; a rolagem foi anulada.`;
  if (who.mine && who.sent) return "Sua revelação foi segurada no caminho: ela não aparece no registro da mesa.";
  if (who.mine) return "Você não revelou o seu número a tempo; a rolagem foi anulada.";
  return `${who.name} não revelou o número a tempo; a rolagem foi anulada.`;
}
