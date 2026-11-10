/**
 * @file PM-69 — denúncia por DM: envio assinado (quem denuncia) e arquivamento automático
 * com salvaguardas (aparelho de quem modera). Regras em ADR-020 §2.1; lógica pura em `report-review.js`.
 */

import * as review from "../report-review.js";
import { isModerator } from "../moderation.js";
import { normalizeContextCard } from "../dm-messenger.js";

async function defaultSendDeps() {
  const [gql, peers, cryptoDm, cacheNode, localAccount, wire] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"),
    import("../cache-node.js"), import("../local-account.js"), import("./dm-wire.js"),
  ]);
  return {
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    sign: (body) => localAccount.signPayload(body),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, envelope) => wire.dispatchSealedEnvelope(addr, envelope),
    saveDm: (msg) => cacheNode.saveDmMessage(msg),
  };
}

/**
 * Manda a denúncia assinada à moderação e guarda a mensagem no fio de quem denunciou.
 * Devolve o estado da entrega: "delivered", "queued-relay", "pending-retry" ou "no-key".
 */
export async function sendReportToModerator(user, moderator, rec, deps = null) {
  const d = deps || (await defaultSendDeps());
  const pub = await d.getDmPub(moderator).catch(() => null);
  if (!pub) return "no-key";
  const signed = await d.sign(review.buildSignedReportBody(rec));
  const msg = review.buildReportDmMessage(rec);
  const envelope = await d.seal(pub, review.serializeReportDm(signed, msg), { from: user, to: moderator });
  const status = await d.dispatch(moderator, envelope);
  await d.saveDm({
    id: envelope.id,
    peerAddress: moderator,
    from: user,
    to: moderator,
    text: msg.text,
    contextCard: normalizeContextCard(msg.contextCard),
    ts: envelope.ts,
    status,
  });
  return status;
}

async function defaultReceiveDeps() {
  const [community, cacheNode, localAccount, context, share] = await Promise.all([
    import("./screens-community.js"), import("../cache-node.js"), import("../local-account.js"),
    import("./context.js"), import("../share.js"),
  ]);
  return {
    verify: (signed) => localAccount.verifyPayload(signed),
    /** As duas identidades do próprio aparelho: a ativa (carteira, se houver) e a conta local que assina. */
    getSelves: async () => [await context.getActiveUser().catch(() => ""), await localAccount.getRouteId().catch(() => "")],
    getCommunity: (id) => community.resolveCommunityMetadata(id),
    getPost: (id) => cacheNode.getLocalPost(id),
    checkMembership: (id, who, meta) => community.checkCommunityMembership(id, who, meta),
    dispatchModAction: (id, action, target, opts) => community.dispatchCommunityModAction(id, action, target, opts),
    notify: (kase) => share.showToast(describeReceivedCase(kase)),
    storage: globalThis.localStorage,
    now: () => Date.now(),
  };
}

/** Texto curto para quem modera, ao receber. */
export function describeReceivedCase(kase) {
  if (kase.status === "pending" && kase.why === "ok") {
    return `Denúncia recebida: a publicação foi arquivada para todos até você revisar (${review.describeDeadline(kase.receivedAt, kase.receivedAt)}).`;
  }
  const why = review.describeSkip(kase.why);
  return `Denúncia recebida e não arquivou sozinha${why ? `: ${why}` : ""}. Revise pela conversa.`;
}

async function loadReportContext(signed, d) {
  const meta = await d.getCommunity(signed.communityId).catch(() => null);
  const selves = await d.getSelves().catch(() => []);
  if (!meta || !selves.some((self) => isModerator(self, meta.owner, meta.moderators))) return null;
  const post = await d.getPost(signed.postId).catch(() => null);
  const target = post?.owner || post?.author || "";
  return {
    isMember: Boolean(await d.checkMembership(signed.communityId, signed.author, meta).catch(() => false)),
    targetIsModerator: Boolean(target) && isModerator(target, meta.owner, meta.moderators),
  };
}

/**
 * Aparelho de quem modera: confere assinatura, salvaguardas e, se passar, publica `review-hide`
 * só na malha (gossip), sem gravar no Arweave (ADR-019). Devolve o caso criado, ou null.
 */
export async function receiveReportDm(env, signed, deps = null) {
  const d = deps || (await defaultReceiveDeps());
  if (!(await review.verifySignedReport(signed, { verify: d.verify, now: d.now() }))) return null;
  const cases = review.listCases(d.storage);
  if (cases.some((c) => c.reportId === signed.reportId)) return null;
  const ctx = await loadReportContext(signed, d);
  if (!ctx) return null;
  const decision = review.decideAutoArchive({ cases, reportId: signed.reportId, postId: signed.postId, reporter: signed.author, ...ctx });
  const kase = review.buildCase(signed, decision, d.now());
  review.addCase(kase, d.storage);
  if (decision.archive) {
    await d.dispatchModAction(signed.communityId, review.REVIEW_HIDE_ACTION, signed.postId, { upload: false });
  }
  d.notify(kase);
  return kase;
}
