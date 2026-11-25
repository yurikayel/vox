/**
 * @file Refaz o estado Fairplay de uma campanha a partir das ops assinadas já verificadas (snapshot do Mestre).
 * O estado pronto que veio de fora nunca é usado: o reducer reaplica as ops na ordem do replay, em tempo linear.
 * @module dungeon/vtt-fairplay-rebuild
 */
import { limitFairplayOps, normalizeFairplayState } from "./vtt-fairplay-log.js";
import { reduceCampaign } from "./vtt-reducer.js";

/**
 * Descarta o `fairplay` de `base` e o refaz reaplicando `ops` (já verificadas) sobre uma campanha sem Fairplay.
 * @param {object} base Campanha recebida; o bloco `fairplay` dela é ignorado.
 * @param {object[]} ops Ops Fairplay com assinatura já conferida pelo chamador.
 * @returns {object} Campanha com o estado Fairplay refeito e os `appliedOpIds` consistentes.
 */
export function rebuildFairplayState(base, ops) {
  const ordered = limitFairplayOps(ops);
  const replayIds = new Set(ordered.map((o) => o.opId));
  const kept = (base.appliedOpIds || []).filter((id) => !replayIds.has(id));
  const start = { ...base, appliedOpIds: [], fairplay: normalizeFairplayState(null) };
  const doc = ordered.reduce((acc, op) => reduceCampaign(acc, op), start);
  return { ...doc, appliedOpIds: [...kept, ...doc.appliedOpIds] };
}
