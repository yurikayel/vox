/**
 * REV-24 — Modo eleitoral (Res. TSE 23.755/2026): no período eleitoral o Vox não
 * ranqueia nem recomenda conteúdo sobre candidato, partido ou campanha.
 * O feed já é cronológico; aqui se desligam as sugestões de perfis.
 *
 * Janela automática: anos pares (eleições gerais e municipais), de 16/08
 * (início da propaganda) até 31/10 (cobre o 2º turno). O kill-switch
 * `electoralMode` em client/config/flags.json força o modo fora da janela.
 */
import { isElectoralModeForced } from "./feature-flags.js";

export function isInElectoralWindow(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  if (y % 2 !== 0) return false;
  const start = new Date(y, 7, 16);
  const end = new Date(y, 9, 31, 23, 59, 59);
  return d >= start && d <= end;
}

export function isElectoralModeActive(date = new Date(), { forced = isElectoralModeForced() } = {}) {
  return Boolean(forced) || isInElectoralWindow(date);
}
