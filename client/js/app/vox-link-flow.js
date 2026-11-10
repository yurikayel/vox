/** @file PM-82 — vínculo assinado: aceitar o convite, confirmar sozinho quem aceitou o seu e o cartão do convite. */

import * as share from "../share.js";
import * as voxLink from "../vox-link.js";
import { renderInviteCardHtml } from "../render/vox-link.js";

async function defaultDeps() {
  const [localAccount, cacheNode, peers] = await Promise.all([
    import("../local-account.js"), import("../cache-node.js"), import("../peers.js"),
  ]);
  return {
    getAccount: () => localAccount.ensureLocalAccount(),
    sign: (payload) => localAccount.signPayload(payload),
    verify: (signed) => localAccount.verifyPayload(signed),
    save: (signed) => cacheNode.saveLocalPost(signed),
    broadcast: (signed) => peers.broadcastGossip(signed),
    loadRecords: async () => (await cacheNode.getWirePosts()).filter((p) => p.type === voxLink.VOX_LINK_TYPE),
    onGossip: (fn) => peers.onGossipPost(fn),
    storage: globalThis.localStorage,
    now: () => Date.now(),
  };
}

async function publish(payload, d) {
  const signed = await d.sign(payload);
  await d.save(signed);
  d.broadcast(signed);
  return signed;
}

/** Quem foi convidado assina o aceite. Padrinho só uma vez por aparelho. */
export async function acceptInvite({ inviter, token, sponsor = false }, deps = null) {
  const d = deps || (await defaultDeps());
  const { routeId: me } = await d.getAccount();
  const claimed = voxLink.hasSponsorClaim(await d.loadRecords(), me);
  return publish(voxLink.buildAccept({ me, inviter, token, sponsor: sponsor && !claimed, now: d.now() }), d);
}

async function confirmOne(accept, me, d) {
  const invite = voxLink.peekInvite(d.storage);
  if (!voxLink.shouldConfirm(accept, { me, invite, now: d.now() })) return null;
  if (!(await d.verify(accept))) return null;
  const signed = await publish(voxLink.buildConfirm(accept, d.now()), d);
  voxLink.recordConfirmed(accept.author, d.storage);
  return signed;
}

/** Confirma os aceites dos meus convites que chegaram e ainda não têm confirmação. */
export async function confirmPendingInvites(deps = null) {
  const d = deps || (await defaultDeps());
  const { routeId: me } = await d.getAccount();
  const records = await d.loadRecords();
  const done = new Set(records.filter((r) => r.kind === "confirm" && r.author === me).map((r) => r.to));
  const out = [];
  for (const accept of records) {
    if (accept.kind !== "accept" || done.has(accept.author)) continue;
    const signed = await confirmOne(accept, me, d);
    if (!signed) continue;
    out.push(signed);
    done.add(accept.author);
  }
  return out;
}

let started = false;

/** Ao abrir o app e a cada aceite que chega pela malha. */
export async function startVoxLinks(deps = null) {
  if (started) return;
  started = true;
  const d = deps || (await defaultDeps());
  d.onGossip((item) => {
    if (item?.type === voxLink.VOX_LINK_TYPE && item.kind === "accept") void confirmPendingInvites(d).catch(() => {});
  });
  await confirmPendingInvites(d).catch(() => {});
}

async function inviteCardModel(inviter, d) {
  const account = await d.getAccount();
  const records = await d.loadRecords();
  const isNew = d.now() - (account.createdAt || 0) < voxLink.NEW_ACCOUNT_MS;
  const canSponsor = !voxLink.hasSponsorClaim(records, account.routeId);
  return { state: voxLink.linkState(records, { me: account.routeId, inviter }), canSponsor, sponsorDefault: canSponsor && isNew, isSelf: account.routeId === inviter };
}

/** Na tela "Conectar" aberta por um link com `?convite=`: cartão para aceitar o vínculo. */
export async function mountInviteCard(main, { inviter, token, name = "" }, deps = null) {
  if (!main || !voxLink.isInviteToken(token)) return;
  const d = deps || (await defaultDeps());
  const model = await inviteCardModel(inviter, d);
  if (model.isSelf) return;
  main.insertAdjacentHTML("afterbegin", renderInviteCardHtml({ ...model, name: name || inviter }));
  main.querySelector("#btn-vox-link-accept")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const sponsor = Boolean(main.querySelector("#vox-link-sponsor")?.checked);
    try {
      await acceptInvite({ inviter, token, sponsor }, d);
      share.showToast("Vínculo aceito. Ele fecha quando o aparelho de quem convidou receber.");
      const card = main.querySelector(".vox-link-card");
      if (card) card.outerHTML = renderInviteCardHtml({ ...model, state: "pending", name: name || inviter });
    } catch (err) {
      share.showToast(err.message || "Não foi possível aceitar o vínculo.", "error");
      e.currentTarget.disabled = false;
    }
  });
}
