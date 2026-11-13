/**
 * @file DM v2 — entrada e saída de envelopes cifrados: reação, leitura, mensagem, denúncia (PM-69) e papel em
 * aviso (chamada de ação).
 *
 * Na entrada, o envelope já chega decifrado; aqui ele vira mensagem no fio e, conforme o conteúdo,
 * dispara o tratamento especial. Na saída, tenta WebRTC, depois a caixa do relay e, por fim, a caixa de
 * saída local com novas tentativas (PM-78).
 *
 * @module app/dm-wire
 * @see client/js/crypto-dm.js
 * @see client/js/dm-outbox.js
 */

import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as dmMsg from "../dm-messenger.js";
import * as outbox from "../dm-outbox.js";
import { parseReportDm } from "../report-review.js";
import { parseRoleClaimDm } from "../aviso-roles.js";
import { parseCaseDm } from "../natural-mod.js";
import { parseContactAddedDm } from "../contact-notify.js";
import { receiveContactAddedDm } from "./contact-notify-flow.js";

/**
 * Liga ou desliga a reação de alguém numa mensagem do fio.
 *
 * @param {string} peerAddress Fio (rota da outra pessoa).
 * @param {string} actorAddress Quem reagiu.
 * @param {string} targetId Mensagem reagida.
 * @param {string} emoji Reação.
 * @returns {Promise<boolean>} `false` se a mensagem não está no fio.
 */
export async function applyBubbleReaction(peerAddress, actorAddress, targetId, emoji) {
  const msgs = await cacheNode.getDmMessages(peerAddress);
  const target = msgs.find((m) => m.id === targetId);
  if (!target) return false;
  target.reactions = dmMsg.toggleReactionMap(target.reactions, emoji, actorAddress);
  await cacheNode.saveDmMessage(target);
  return true;
}

async function applyReadReceipt(peerAddress, upToTs) {
  const msgs = await cacheNode.getDmMessages(peerAddress);
  let updated = false;
  for (const m of msgs) {
    if (m.from !== peerAddress && m.status !== "read" && (Number(m.ts) || 0) <= upToTs) {
      m.status = "read";
      await cacheNode.saveDmMessage(m);
      updated = true;
    }
  }
  return updated;
}

/** PM-69: a denúncia aparece no fio como mensagem e, no aparelho de quem modera, pode arquivar o post. */
async function handleReportPayload(env, rawText) {
  const signed = parseReportDm(rawText);
  if (!signed) return;
  try {
    const { receiveReportDm } = await import("./report-dm.js");
    await receiveReportDm(env, signed);
  } catch {}
}

/** Chamada de ação: a resposta com papel chega só ao aparelho de quem convocou. */
async function handleRoleClaimPayload(rawText) {
  const claim = parseRoleClaimDm(rawText);
  if (!claim) return;
  try {
    const { receiveRoleClaimDm } = await import("./aviso-roles-dm.js");
    await receiveRoleClaimDm(claim);
  } catch {}
}

/** PM-83: aviso de caso para o moderador natural (só com a flag de laboratório). */
async function handleNaturalCasePayload(env, rawText) {
  const notice = parseCaseDm(rawText);
  if (!notice) return;
  try {
    const [flow, cases] = await Promise.all([import("./natural-mod-flow.js"), import("./natural-case-flow.js")]);
    if (flow.naturalModLabOn() && cases.receiveCase(notice)) {
      (await import("../share.js")).showToast("Chegou uma denúncia para você decidir como moderador natural (Pessoas → Meus vínculos).");
    }
  } catch {}
}

/**
 * Processa um envelope recebido e já decifrado.
 *
 * Reação, confirmação de leitura e aviso de contato só atualizam o estado local sem abrir conversa.
 * Mensagem é guardada; se trouxer denúncia ou resposta de papel, o tratamento especial roda em seguida.
 *
 * @param {{id: string, from: string, to: string, ts?: number}} env Envelope.
 * @param {string} rawText Texto decifrado.
 * @returns {Promise<boolean|string>} `false` quando reação/leitura não acham mensagem; `"contact_added"` para aviso de contato.
 */
export async function ingestDecryptedEnvelope(env, rawText) {
  if (parseContactAddedDm(rawText)) {
    await receiveContactAddedDm(env, rawText);
    return "contact_added";
  }
  const parsed = dmMsg.parseDmPayload(rawText);
  if (parsed.kind === "react") {
    return applyBubbleReaction(env.from, env.from, parsed.targetId, parsed.emoji);
  }
  if (parsed.kind === "read") {
    return applyReadReceipt(env.from, parsed.upToTs);
  }
  await cacheNode.saveDmMessage({
    id: env.id,
    peerAddress: env.from,
    from: env.from,
    to: env.to,
    text: parsed.text,
    replyTo: parsed.replyTo,
    contextCard: parsed.contextCard,
    mediaDataUrl: parsed.mediaDataUrl,
    ts: env.ts || Date.now(),
    status: "received",
  });
  await handleReportPayload(env, rawText);
  await handleRoleClaimPayload(rawText);
  await handleNaturalCasePayload(env, rawText);
  return true;
}

/**
 * Entrega um envelope cifrado pelo melhor caminho disponível.
 *
 * @param {string} peerAddress Destinatário.
 * @param {object} envelope Envelope já selado (`crypto-dm.seal`).
 * @returns {Promise<"delivered"|"queued-relay"|"pending-retry">} `pending-retry` quando ficou na caixa de saída local.
 */
export async function dispatchSealedEnvelope(peerAddress, envelope) {
  if (peers.sendDirectMessageTransport(peerAddress, envelope) === "rtc") {
    return "delivered";
  }
  try {
    await inbox.pushSealed(peerAddress, envelope);
    return "queued-relay";
  } catch {
    const { dropped } = outbox.enqueueEnvelope(peerAddress, envelope);
    for (const e of dropped) markDmStatus(e.to, e.envelope.id, "failed").catch(() => {});
    return "pending-retry";
  }
}

/** PM-78: atualiza o status de uma mensagem do próprio fio (não rebaixa "Lido"). */
async function markDmStatus(peerAddress, id, status) {
  const msgs = await cacheNode.getDmMessages(peerAddress);
  const msg = msgs.find((m) => m.id === id);
  if (!msg || msg.status === "read") return false;
  msg.status = status;
  await cacheNode.saveDmMessage(msg);
  return true;
}

function defaultOutboxDeps() {
  return {
    storage: globalThis.localStorage,
    now: () => Date.now(),
    isConnected: (addr) => peers.isAddressConnectedRtc(addr),
    sendDirect: (addr, env) => peers.sendDirectMessageTransport(addr, env) === "rtc",
    pushRelay: (addr, env) => inbox.pushSealed(addr, env),
    markStatus: markDmStatus,
  };
}

const OUTBOX_FLUSH_MS = 20 * 1000;
let outboxTimer = null;
let flushing = false;

/**
 * Faz uma passada pela caixa de saída; ignora a chamada enquanto outra passada está em curso.
 *
 * @param {object|null} [deps=null] Dependências injetáveis; `null` usa as reais.
 * @returns {Promise<object|null>} Resumo da passada (`dm-outbox.flushOutbox`), ou `null` se outra passada estava em curso ou se falhou.
 */
export async function flushDmOutbox(deps = null) {
  if (flushing) return null;
  flushing = true;
  try {
    return await outbox.flushOutbox(deps || defaultOutboxDeps());
  } catch {
    return null;
  } finally {
    flushing = false;
  }
}

/**
 * Com o app aberto: repassa a caixa de saída a cada 20 s, ao voltar a internet e já na chamada.
 *
 * @param {Window|typeof globalThis} [win=globalThis] Janela (injetável nos testes).
 * @returns {boolean} `false` se já estava ligado ou se não há `setInterval`.
 */
export function startDmOutbox(win = globalThis) {
  if (outboxTimer || typeof win?.setInterval !== "function") return false;
  outboxTimer = win.setInterval(() => flushDmOutbox(), OUTBOX_FLUSH_MS);
  win.addEventListener?.("online", () => flushDmOutbox());
  flushDmOutbox();
  return true;
}
