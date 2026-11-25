/**
 * @file Condutor do Fairplay de um aparelho (ADR-040 §5, PR-3b): olha o estado da campanha e manda a
 * próxima operação que cabe a este par — compromisso, partes cifradas, revelação, liberação de partes
 * para recuperar quem sumiu e, para quem abriu ou para o Mestre, o fechamento de fase no prazo.
 *
 * É idempotente pelo estado: chamar `onUpdate` de novo não reenvia o que já está no log. Quando o
 * Mestre devolve `OP_REJECTED` (por exemplo, dois pares com o mesmo `lamport`), libera o passo e tenta
 * de novo com o estado atual. A semente fica só na memória: se o aparelho recarregar, a rolagem segue
 * pela recuperação por quórum.
 * @module dungeon/vtt-fairplay-driver
 */
import { createFairplayRollOffer } from "./vtt-fairplay-roll.js";
import { createFairplaySessionKey, fairplayShareHash, openFairplayShare, sealFairplayShare } from "./vtt-fairplay-cipher.js";
import { fairplayMinHolders, fairplayQuorum } from "./vtt-fairplay-log.js";

const CLOSABLE = new Set(["commit", "shares", "reveal", "recovery"]);

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function committed(roll) {
  return roll.participants.filter((p) => Object.hasOwn(roll.commits, p));
}

function keyOf(campaign, peer) {
  return campaign.fairplay?.keys?.[peer]?.publicKeyJwk || null;
}

function createDriverContext(opts) {
  return {
    peerId: String(opts.peerId),
    dispatchOp: opts.dispatchOp,
    loadCampaign: opts.loadCampaign,
    now: opts.now || (() => Date.now()),
    schedule: opts.schedule || ((fn, ms) => setTimeout(fn, ms)),
    cancel: opts.cancel || ((h) => clearTimeout(h)),
    onWarn: opts.onWarn || (() => {}),
    onError: opts.onError || (() => {}),
    onStopped: opts.onStopped || (() => {}),
    rejection: null,
    warnings: [],
    sessionKey: null,
    offers: new Map(),
    pending: new Map(),
    timers: new Map(),
  };
}

function warn(ctx, message) {
  ctx.warnings.push(message);
  ctx.onWarn(message);
}

/**
 * Envia um passo uma vez. A marca `tmp:` sai sempre (inclusive se o envio lançar, para o passo poder ser
 * tentado de novo); sem `opId` na resposta não há como reconhecer uma recusa, então não se grava marca
 * e o próximo `onUpdate` reenvia se o log ainda não mostra o passo (o reducer recusa duplicata).
 */
async function send(ctx, stepKey, type, payload) {
  if ([...ctx.pending.values()].includes(stepKey)) return;
  const tmp = `tmp:${stepKey}`;
  ctx.pending.set(tmp, stepKey);
  try {
    const res = await ctx.dispatchOp({ type, payload });
    if (res?.opId) ctx.pending.set(res.opId, stepKey);
  } finally {
    ctx.pending.delete(tmp);
  }
}

/** A oferta (semente e partes) de uma rolagem nasce uma vez: reenviar o compromisso reaproveita a mesma. */
async function stepCommit(ctx, roll) {
  const offer = ctx.offers.get(roll.rollId) ?? await createFairplayRollOffer({ peerId: ctx.peerId, rollId: roll.rollId, ...fairplayQuorum(roll.participants.length) });
  ctx.offers.set(roll.rollId, offer);
  await send(ctx, `${roll.rollId}:commit`, "FAIRPLAY_COMMIT", { rollId: roll.rollId, commit: offer.commit });
}

async function sealedShares(ctx, campaign, roll, offer, holders) {
  const out = [];
  for (const [i, share] of offer.shares.entries()) {
    const to = holders[i % holders.length];
    const envelope = await sealFairplayShare({ share, rollId: roll.rollId, fromPeer: ctx.peerId, toPeer: to, privateKey: ctx.sessionKey.privateKey, recipientJwk: keyOf(campaign, to) });
    out.push({ to, share: envelope, shareHash: await fairplayShareHash(share) });
  }
  return out;
}

async function keyImports(jwk) {
  if (!jwk) return "sem chave na mesa";
  const err = await crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []).then(() => null, (e) => e);
  return err ? `chave não importa (${err.message || err})` : "";
}

/** Pares para os quais dá para cifrar; os demais ficam de fora, com aviso. */
async function usableHolders(ctx, campaign, roll) {
  const holders = [];
  for (const p of committed(roll).filter((o) => o !== ctx.peerId)) {
    const problem = await keyImports(keyOf(campaign, p));
    if (problem) warn(ctx, `Fairplay: ${p}: ${problem}; sem partes para ele.`);
    else holders.push(p);
  }
  return holders;
}

async function stepShares(ctx, campaign, roll) {
  const offer = ctx.offers.get(roll.rollId);
  if (!offer) return;
  const mine = roll.commits[ctx.peerId];
  const holders = await usableHolders(ctx, campaign, roll);
  if (holders.length < fairplayMinHolders(mine.totalPeers, mine.threshold, roll.participants.length)) {
    warn(ctx, `Fairplay: guardiões com chave utilizável insuficientes na rolagem ${roll.rollId}; as partes não foram enviadas e a rolagem não vai fechar.`);
    return;
  }
  const shares = await sealedShares(ctx, campaign, roll, offer, holders);
  await send(ctx, `${roll.rollId}:shares`, "FAIRPLAY_SHARES", { rollId: roll.rollId, shares });
}

/** Só revela quando o log mostra que todo participante se comprometeu e entregou as partes. */
function logShowsEveryoneReady(roll) {
  return roll.participants.every((p) => Object.hasOwn(roll.commits, p) && Object.hasOwn(roll.shares, p));
}

async function stepReveal(ctx, roll) {
  const offer = ctx.offers.get(roll.rollId);
  if (!offer || !logShowsEveryoneReady(roll)) return;
  await send(ctx, `${roll.rollId}:reveal`, "FAIRPLAY_REVEAL", { rollId: roll.rollId, seedHex: toHex(offer.secret.seedBytes) });
}

async function openHeld(ctx, campaign, roll, ofPeer) {
  const mine = (roll.shares[ofPeer] || []).filter((s) => s.to === ctx.peerId);
  const shares = [];
  for (const s of mine) {
    const plain = await openFairplayShare({ envelope: s.share, rollId: roll.rollId, fromPeer: ofPeer, toPeer: ctx.peerId, privateKey: ctx.sessionKey.privateKey, senderJwk: keyOf(campaign, ofPeer) });
    if (await fairplayShareHash(plain) !== s.shareHash) {
      warn(ctx, `Fairplay: a parte de ${ofPeer} não bate com o hash publicado; não foi liberada.`);
      continue;
    }
    shares.push({ splitId: plain.splitId, x: plain.x, y: toHex(plain.y) });
  }
  return shares;
}

async function stepRecovery(ctx, campaign, roll) {
  const missing = committed(roll).filter((p) => p !== ctx.peerId && !Object.hasOwn(roll.reveals, p));
  for (const ofPeer of missing) {
    if (Object.hasOwn(roll.released[ofPeer] || {}, ctx.peerId)) continue;
    const shares = await openHeld(ctx, campaign, roll, ofPeer).catch(() => []);
    if (shares.length) await send(ctx, `${roll.rollId}:share:${ofPeer}`, "FAIRPLAY_SHARE", { rollId: roll.rollId, ofPeer, shares });
  }
}

function scheduleClose(ctx, campaign, roll) {
  const mayClose = roll.opener === ctx.peerId || campaign.gmRouteId === ctx.peerId;
  const timerKey = `${roll.rollId}:${roll.phase}`;
  if (!mayClose || !CLOSABLE.has(roll.phase) || ctx.timers.has(timerKey)) return;
  const wait = Math.max(0, Number(roll.phaseStartTs) + Number(roll.phaseMs) - ctx.now());
  ctx.timers.set(timerKey, ctx.schedule(() => {
    send(ctx, `${timerKey}:close`, "FAIRPLAY_CLOSE", { rollId: roll.rollId, phase: roll.phase }).catch((err) => ctx.onError(err));
  }, wait));
}

async function advanceRoll(ctx, campaign, roll) {
  scheduleClose(ctx, campaign, roll);
  if (!roll.participants.includes(ctx.peerId)) return;
  const mine = Object.hasOwn(roll.commits, ctx.peerId);
  if (roll.phase === "commit" && !mine) return stepCommit(ctx, roll);
  if (roll.phase === "shares" && mine && !Object.hasOwn(roll.shares, ctx.peerId)) return stepShares(ctx, campaign, roll);
  if (roll.phase === "reveal" && mine && !Object.hasOwn(roll.reveals, ctx.peerId)) return stepReveal(ctx, roll);
  if (roll.phase === "recovery") return stepRecovery(ctx, campaign, roll);
  return undefined;
}

async function handleUpdate(ctx, campaign) {
  if (!ctx.sessionKey || !campaign?.fairplay) return;
  for (const roll of Object.values(campaign.fairplay.rolls || {})) await advanceRoll(ctx, campaign, roll);
}

/**
 * Só `out_of_phase` (a ordem do log mudou sob o passo) merece nova tentativa com o estado atual. Qualquer
 * outro motivo (assinatura, autorização, relógio fora da faixa) para o passo e é entregue à interface:
 * insistir só repetiria a recusa.
 */
async function handleRejected(ctx, msg) {
  const stepKey = ctx.pending.get(msg?.opId);
  if (!stepKey) return;
  if (msg.reason !== "out_of_phase") {
    ctx.rejection = { reason: String(msg.reason || "unknown"), opId: msg.opId, stepKey };
    ctx.onStopped(ctx.rejection);
    return;
  }
  ctx.pending.delete(msg.opId);
  await handleUpdate(ctx, await ctx.loadCampaign());
}

/**
 * Cria o condutor Fairplay de um aparelho da mesa.
 * @param {{peerId: string, dispatchOp: (rawOp: object) => Promise<object>, loadCampaign: () => Promise<object>, now?: () => number, schedule?: Function, cancel?: Function, onWarn?: (message: string) => void, onError?: (err: unknown) => void, onStopped?: (info: {reason: string, opId: string, stepKey: string}) => void}} opts
 *   `dispatchOp` é o do par de sincronização (`createVttSyncPeer`); `schedule`/`cancel` trocam o relógio nos testes.
 * @returns {{warnings: () => string[], lastRejection: () => ?object, start: () => Promise<void>, openRoll: (o?: object) => Promise<string>, onUpdate: (campaign: object) => Promise<void>, onRejected: (msg: object) => Promise<void>, close: () => void}} Controlador.
 */
export function createFairplayDriver(opts) {
  const ctx = createDriverContext(opts);
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn).catch((err) => ctx.onError(err)));
  return {
    async start() {
      ctx.sessionKey = await createFairplaySessionKey();
      await ctx.dispatchOp({ type: "FAIRPLAY_KEY", payload: { publicKeyJwk: ctx.sessionKey.publicKeyJwk } });
    },
    async openRoll(o = {}) {
      const rollId = o.rollId || `roll-${crypto.randomUUID().slice(0, 8)}`;
      await ctx.dispatchOp({ type: "FAIRPLAY_OPEN", payload: { rollId, sides: o.sides, formula: o.formula, phaseMs: o.phaseMs } });
      return rollId;
    },
    onUpdate: (campaign) => queue(() => handleUpdate(ctx, campaign)),
    onRejected: (msg) => queue(() => handleRejected(ctx, msg)),
    warnings: () => [...ctx.warnings],
    lastRejection: () => ctx.rejection,
    close() {
      for (const h of ctx.timers.values()) ctx.cancel(h);
      ctx.timers.clear();
    },
  };
}
