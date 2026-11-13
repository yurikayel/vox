import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const voxLink = await import("../client/js/vox-link.js");
const flow = await import("../client/js/app/vox-link-flow.js");
const card = await import("../client/js/render/vox-link.js");
const share = await import("../client/js/share.js");
const { verifyPayload } = await import("../client/js/local-account.js");
const { person } = await import("./signer.js");

class Store {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

/** Malha de mentira: todo mundo grava no mesmo lugar; cada pessoa tem seu armazenamento. */
function deviceDeps(who, mesh, { storage = new Store(), createdAt = 0, now = 1000 } = {}) {
  return {
    getAccount: async () => ({ routeId: who.routeId, createdAt }),
    sign: who.sign, verify: verifyPayload,
    save: async (item) => mesh.set(item.id, item), broadcast: () => {},
    loadRecords: async () => [...mesh.values()], onGossip: () => {},
    storage, now: () => now,
  };
}

test("vínculo - convite: token estável, troca quando esgota ou vence", () => {
  const storage = new Store();
  const first = voxLink.currentInvite({ storage, now: 0 });
  assert.ok(voxLink.isInviteToken(first.token));
  assert.equal(voxLink.currentInvite({ storage, now: 10 }).token, first.token);
  for (let i = 0; i < voxLink.INVITE_MAX_USES; i++) voxLink.recordConfirmed(`vx_${i}`, storage);
  assert.notEqual(voxLink.currentInvite({ storage, now: 20 }).token, first.token, "esgotado");
  const fresh = voxLink.currentInvite({ storage, now: 30 });
  assert.notEqual(voxLink.currentInvite({ storage, now: 30 + voxLink.INVITE_TTL_MS }).token, fresh.token, "vencido");
  assert.match(share.inviteShareUrl("vx_eu"), /#\/connect\/vx_eu\?convite=[A-Za-z0-9_-]{22}$/);
});

test("vínculo - aceite de B e confirmação de A fecham o vínculo com as duas assinaturas", async () => {
  const [ana, bia] = [await person(), await person()];
  const mesh = new Map();
  const anaDeps = deviceDeps(ana, mesh);
  const { token } = voxLink.currentInvite({ storage: anaDeps.storage, now: 1000 });
  await flow.acceptInvite({ inviter: ana.routeId, token, sponsor: true }, deviceDeps(bia, mesh));
  const [confirm] = await flow.confirmPendingInvites(anaDeps);
  const link = await voxLink.verifyLink(confirm, verifyPayload);
  assert.deepEqual(link, { inviter: ana.routeId, invitee: bia.routeId, sponsor: true, since: 1000, mediationOnly: false, switchFrom: "" });
  assert.deepEqual(await flow.confirmPendingInvites(anaDeps), [], "não confirma duas vezes");
  assert.equal(voxLink.linkState([...mesh.values()], { me: bia.routeId, inviter: ana.routeId }), "confirmed");
});

test("vínculo - adulterar qualquer metade ou confirmar aceite alheio não vale", async () => {
  const [ana, bia, caio] = [await person(), await person(), await person()];
  const mesh = new Map();
  const token = voxLink.currentInvite({ storage: new Store() }).token;
  const accept = await flow.acceptInvite({ inviter: ana.routeId, token, sponsor: false }, deviceDeps(bia, mesh));
  const good = await ana.sign(voxLink.buildConfirm(accept, 5));
  assert.ok(await voxLink.verifyLink(good, verifyPayload));
  const forgedSponsor = { ...good, accept: JSON.stringify({ ...accept, sponsor: true }), sponsor: true };
  assert.equal(await voxLink.verifyLink(await ana.sign(forgedSponsor), verifyPayload), null, "aceite alterado perde a assinatura de B");
  assert.equal(await voxLink.verifyLink({ ...good, sponsor: true }, verifyPayload), null, "confirmação alterada");
  assert.equal(await voxLink.verifyLink(await caio.sign(voxLink.buildConfirm(accept, 5)), verifyPayload), null, "aceite era para Ana");
});

test("vínculo - quem convidou só confirma o próprio convite aberto; padrinho uma vez só", async () => {
  const [ana, bia] = [await person(), await person()];
  const storage = new Store();
  const invite = voxLink.currentInvite({ storage, now: 0 });
  const accept = { ...voxLink.buildAccept({ me: bia.routeId, inviter: ana.routeId, token: invite.token }), author: bia.routeId };
  assert.equal(voxLink.shouldConfirm(accept, { me: ana.routeId, invite, now: 1 }), true);
  assert.equal(voxLink.shouldConfirm({ ...accept, token: "B".repeat(22) }, { me: ana.routeId, invite, now: 1 }), false);
  assert.equal(voxLink.shouldConfirm(accept, { me: bia.routeId, invite, now: 1 }), false);
  assert.equal(voxLink.shouldConfirm(accept, { me: ana.routeId, invite, now: voxLink.INVITE_TTL_MS + 1 }), false);
  assert.throws(() => voxLink.buildAccept({ me: ana.routeId, inviter: ana.routeId, token: invite.token }), /diferentes/);
  const mesh = new Map();
  const first = await flow.acceptInvite({ inviter: ana.routeId, token: invite.token, sponsor: true }, deviceDeps(bia, mesh));
  const second = await flow.acceptInvite({ inviter: "vx_outra", token: invite.token, sponsor: true }, deviceDeps(bia, mesh));
  assert.equal(first.sponsor, true);
  assert.equal(second.sponsor, false);
});

test("vínculo - cartão: aceitar, aguardando e confirmado", () => {
  const open = card.renderInviteCardHtml({ name: "Ana <b>", canSponsor: true, sponsorDefault: true });
  assert.match(open, /Ana &lt;b&gt; te convidou/);
  assert.match(open, /id="vox-link-sponsor" checked/);
  assert.ok(!card.renderInviteCardHtml({ name: "Ana", canSponsor: false }).includes("vox-link-sponsor"));
  assert.match(card.renderInviteCardHtml({ name: "Ana", state: "pending" }), /Aceite enviado/);
  assert.match(card.renderInviteCardHtml({ name: "Ana", state: "confirmed" }), /confirmado pelas duas pessoas/);
});
