/**
 * @file Guardas do jogador na sincronização da mesa para o Fairplay (ADR-040): quais ops só valem com assinatura
 * válida e quando um snapshot é de outra mesa. Funções puras, usadas por `vtt-sync.js`.
 * @module dungeon/vtt-sync-fairplay-guard
 */

/**
 * Diz se a op é uma das fases Fairplay (`FAIRPLAY_*`).
 * @param {{type?: string}|null} op Op da campanha.
 * @returns {boolean} `true` para qualquer tipo que comece com `FAIRPLAY_`.
 */
export function isFairplayOp(op) {
  return String(op?.type || "").startsWith("FAIRPLAY_");
}

/**
 * Op que o jogador só aceita com assinatura válida: as `FAIRPLAY_*`, a rolagem Fairplay e a falta registrada.
 * @param {{type?: string, payload?: object}} op Op recebida do Mestre.
 * @returns {boolean} `true` quando a assinatura precisa ser conferida antes de aplicar.
 */
export function needsSignature(op) {
  if (isFairplayOp(op)) return true;
  if (op.type === "ROLL_RECORDED") return Boolean((op.payload?.rollResult || op.payload)?.fairplay);
  return op.type === "CHRONICLE_APPEND" && Boolean(op.payload?.fairplayFault);
}

/**
 * Diz se o snapshot pertence à mesa do convite: a campanha tem de apontar para o Mestre do convite.
 * @param {{gmRouteId?: string}} ctx Contexto do par (Mestre do convite).
 * @param {{campaign?: {gmRouteId?: string}}} msg Mensagem `SNAPSHOT_FILTERED`.
 * @returns {boolean} `false` quando não há Mestre do convite ou a campanha é de outro Mestre.
 */
export function snapshotFromInvitedGm(ctx, msg) {
  return Boolean(ctx.gmRouteId) && msg.campaign?.gmRouteId === ctx.gmRouteId;
}
