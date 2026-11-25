/**
 * @file Rolagem pública pela mesa (ADR-040, P1/P2): com a flag `vox.lab.fairplay` ligada e ao menos 2 pares
 * com chave na sala, a rolagem de um dado só é aberta pelo condutor, espera fechar e só então entra na
 * Crônica com `fairplay: {rollId, value}`. Sem flag, sem condutor ou com um par só, nada disso acontece.
 * @module dungeon/vtt-fairplay-roll-flow
 */
import { rollDiceFormula, singleDieSides } from "./dice-engine.js";
import { dispatchCampaignOp } from "./dungeon-sync-bridge.js";
import { verifyFairplayRecord } from "./vtt-fairplay-log.js";
import { isFairplayLabEnabled } from "./vtt-fairplay-selo.js";

const POLL_MS = 400;
const MAX_WAIT_MS = 4 * 125_000;

function campaignIdOf(state) {
  return state.campaignId || state.tableId || "";
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEnd(ctx, rollId) {
  const deadline = Date.now() + (ctx.maxWaitMs || MAX_WAIT_MS);
  let campaign = null;
  while (Date.now() < deadline) {
    campaign = await ctx.store.loadCampaign(ctx.campaignId);
    const phase = campaign?.fairplay?.rolls?.[rollId]?.phase;
    if (phase === "done" || phase === "aborted") return campaign;
    await (ctx.sleep || defaultSleep)(ctx.pollMs || POLL_MS);
  }
  return campaign;
}

async function recordClosedRoll(state, ctx, rollId, campaign) {
  const verdict = await verifyFairplayRecord(campaign, rollId);
  if (verdict.status !== "verified") return false;
  const result = rollDiceFormula(ctx.rawInput, { sheet: state.sheet, fairplayValue: verdict.value });
  if (!result.ok) return false;
  state.lastFormulaRoll = result;
  const rollResult = { ...result, fairplay: { rollId, value: verdict.value } };
  await dispatchCampaignOp(state, "ROLL_RECORDED", { speaker: state.sheet?.name || "Aventureiro", rollResult }, { store: ctx.store, refreshCampaignsList: true });
  return true;
}

async function settleFairplayRoll(state, ctx, rollId) {
  try {
    const campaign = await waitForEnd(ctx, rollId);
    if (campaign) await recordClosedRoll(state, ctx, rollId, campaign);
  } catch {
    /* a rolagem fica no log como não fechada; o aviso mostra o motivo */
  } finally {
    delete state.fairplayPending?.[rollId];
    ctx.onSettled?.();
  }
}

/**
 * Tenta tratar a rolagem pela mesa. Devolve `null` quando a rolagem deve seguir como sempre foi.
 * @param {object} state Estado da sessão (com `fairplayDriver` quando a flag está ligada).
 * @param {string} rawInput Comando ou fórmula de dados.
 * @param {{store: object, mode?: string, storage?: Storage, onSettled?: Function, sleep?: Function, pollMs?: number, maxWaitMs?: number}} opts Opções.
 * @returns {Promise<{ok: true, pending: true, rollId: string, formula: string}|null>} Rolagem em andamento, ou `null`.
 */
export async function tryStartFairplayRoll(state, rawInput, opts) {
  if (!state.fairplayDriver || !isFairplayLabEnabled(opts.storage)) return null;
  const sides = singleDieSides(rawInput, opts.mode || state.rollMode);
  const campaignId = campaignIdOf(state);
  if (!sides || !campaignId) return null;
  const campaign = await opts.store.loadCampaign(campaignId);
  if (Object.keys(campaign?.fairplay?.keys || {}).length < 2) return null;
  const rollId = await state.fairplayDriver.openRoll({ sides, formula: rawInput });
  state.fairplayPending = { ...(state.fairplayPending || {}), [rollId]: { formula: rawInput } };
  const ctx = { ...opts, rawInput, campaignId, onSettled: opts.onSettled || (() => state._onSyncUpdate?.()) };
  settleFairplayRoll(state, ctx, rollId);
  return { ok: true, pending: true, rollId, formula: rawInput, total: 0, rolls: [] };
}
