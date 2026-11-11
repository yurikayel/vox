/**
 * @file PM-83 lote E (ADR-023 emenda §4.2.1): "Pedir mediação" vai, por mensagem cifrada, para o moderador
 * natural de cada parte (o padrinho, ou o mais próximo). Ninguém arquiva nada neste caminho.
 * Sem moderador natural de nenhum lado, quem chama cai na moderação da comunidade (lote 3).
 */
import { caseModerators } from "../natural-mod.js";
import { serializeDmPayload } from "../dm-messenger.js";

async function defaultDeps() {
  const [gql, peers, cryptoDm, cacheNode, wire, flow, aviso] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"), import("../cache-node.js"),
    import("./dm-wire.js"), import("./natural-mod-flow.js"), import("./aviso-flow.js"),
  ]);
  const posts = (type, communityId) => cacheNode.getLocalPosts({ type, communityId }).catch(() => []);
  return {
    loadLinks: () => flow.loadLinks(),
    getMembers: async (communityId) => (communityId
      ? aviso.memberSet(await posts("membership", communityId), await posts("membership_leave", communityId)) : null),
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, envelope) => wire.dispatchSealedEnvelope(addr, envelope),
    saveDm: (msg) => cacheNode.saveDmMessage(msg),
  };
}

const TEXT = {
  target: "Pedido de mediação sobre um post de alguém que você conhece pelo vínculo no Vox. Ninguém arquivou nada: a ideia é conversar antes.",
  requester: "Pedido de mediação: alguém do seu vínculo no Vox quer conversar sobre este post. Ninguém arquivou nada.",
};

/** Destinatários: N1 (lado de quem publicou) e N2 (lado de quem pede), sem repetir e sem a própria pessoa. */
export function mediationRecipients(links, { self, target, members = null }) {
  const { n1, n2 } = caseModerators(links, { target, reporter: self, members });
  const out = [];
  if (n1) out.push({ ...n1, side: "target" });
  if (n2 && n2.route !== n1?.route) out.push({ ...n2, side: "requester" });
  return out.filter((r) => r.route !== self);
}

async function sendOne(self, recipient, card, d) {
  const pub = await d.getDmPub(recipient.route).catch(() => null);
  if (!pub) return { ...recipient, status: "no-key" };
  const text = TEXT[recipient.side];
  const envelope = await d.seal(pub, serializeDmPayload({ text, contextCard: card }), { from: self, to: recipient.route });
  const status = await d.dispatch(recipient.route, envelope);
  await d.saveDm({ id: envelope.id, peerAddress: recipient.route, from: self, to: recipient.route, text, contextCard: card, ts: envelope.ts, status });
  return { ...recipient, status };
}

/**
 * Manda o pedido aos moderadores naturais das duas partes. Devolve `[{ route, via, side, status }]`
 * (vazio = ninguém com vínculo: quem chama usa a moderação da comunidade).
 */
export async function requestMediation(self, { postId, communityId = "", target = "" }, deps = null) {
  const d = deps || (await defaultDeps());
  const recipients = mediationRecipients(await d.loadLinks(), { self, target, members: await d.getMembers(communityId) });
  const card = { type: "topic", id: postId, title: "Pedido de mediação" };
  const out = [];
  for (const r of recipients) out.push(await sendOne(self, r, card, d));
  return out;
}
