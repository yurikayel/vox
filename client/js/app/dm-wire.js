/** @file DM v2 — entrada e saída de envelopes cifrados (reação, leitura, mensagem e denúncia). */

import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as inbox from "../inbox.js";
import * as dmMsg from "../dm-messenger.js";
import { parseReportDm } from "../report-review.js";

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

export async function ingestDecryptedEnvelope(env, rawText) {
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
  return true;
}

export async function dispatchSealedEnvelope(peerAddress, envelope) {
  if (peers.sendDirectMessageTransport(peerAddress, envelope) === "rtc") {
    return "delivered";
  }
  try {
    await inbox.pushSealed(peerAddress, envelope);
    return "queued-relay";
  } catch {
    return "pending-retry";
  }
}
