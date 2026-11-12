import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as contacts from "../client/js/contacts.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
import * as contactNotify from "../client/js/contact-notify.js";
import * as flow from "../client/js/app/contact-notify-flow.js";
import { ingestDecryptedEnvelope } from "../client/js/app/dm-wire.js";
import { renderAddedYouSection, renderPeopleSearch } from "../client/js/render/oauth-modals.js";
import { WELCOME_ROUTE_ID } from "../client/js/vox-welcome-profile.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("contact-notify - build, serialize e parse validam envelope v2", () => {
  const payload = contactNotify.buildContactAddedPayload({ to: "vx_bob", displayName: "Alice", avatarUrl: "https://ex/a.png", now: 1000 });
  const wire = contactNotify.serializeContactAddedDm({ ...payload, author: "vx_alice", pubKey: { kty: "RSA" }, sig: "sig" });
  const parsed = contactNotify.parseContactAddedDm(wire);
  assert.equal(parsed?.author, "vx_alice");
  assert.equal(parsed?.to, "vx_bob");
  assert.equal(contactNotify.parseContactAddedDm("oi"), null);
  assert.equal(contactNotify.parseContactAddedDm(JSON.stringify({ __vox_dm_v2: 1, kind: "read" })), null);
});

test("contact-notify - armazenamento deduplica, respeita dispensa e filtra quem já é contato", () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  const s = memStorage();
  const first = contactNotify.recordIncomingContactNotice({ author: "vx_alice", displayName: "Alice", ts: 2000 }, s);
  assert.equal(first.added, true);
  assert.equal(contactNotify.recordIncomingContactNotice({ author: "vx_alice", ts: 2000 }, s).added, false);
  assert.equal(contactNotify.listIncomingContactNotices(s).length, 1);

  assert.equal(contactNotify.dismissIncomingContactNotice("vx_alice", s), true);
  assert.equal(contactNotify.listIncomingContactNotices(s).length, 0);
  assert.equal(contactNotify.recordIncomingContactNotice({ author: "vx_alice", ts: 1500 }, s).added, false);
  assert.equal(contactNotify.recordIncomingContactNotice({ author: "vx_alice", ts: 3000 }, s).added, true);

  contacts.addContact("vx_alice", "Alice");
  assert.equal(flow.listPendingAddedYouNotices(s).length, 0);
});

test("contact-notify-flow - notifyContactAdded pula sistema/self, trata sem chave e só avisa novo contato", async () => {
  localStorage.clear();
  contacts.__resetContactsForTests();
  assert.equal(await flow.notifyContactAdded(WELCOME_ROUTE_ID), "skipped");
  assert.equal(await flow.notifyContactAdded("vx_me", { getMe: () => "vx_me" }), "skipped");

  const sent = [];
  const deps = {
    getMe: () => "vx_me",
    getSenderMeta: () => ({ displayName: "Yuri", avatarUrl: "https://ex/y.png" }),
    getDmPub: async () => ({ kty: "EC", crv: "P-256", x: "1", y: "2" }),
    sign: async (b) => ({ ...b, author: "vx_me", pubKey: {}, sig: "s" }),
    seal: async (_pub, text, meta) => ({ text, meta }),
    dispatch: async (to, env) => { sent.push({ to, env }); return "delivered"; },
  };
  assert.equal(flow.addContactAndNotify("vx_bob", "Bob", deps), true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "vx_bob");

  assert.equal(flow.addContactAndNotify("vx_bob", "Bob", deps), true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 1, "não reenvia para quem já era contato");
});

test("contact-notify-flow - receiveContactAddedDm valida remetente/assinatura e dm-wire não cria chat", async () => {
  localStorage.clear();
  const me = await localAccount.getRouteId();
  const signed = await localAccount.signPayload(
    contactNotify.buildContactAddedPayload({ to: me, displayName: "Alice", avatarUrl: "https://ex/a.png", now: 5000 }),
  );
  const wire = contactNotify.serializeContactAddedDm(signed);

  const alerts = [];
  const deps = {
    verify: (p) => localAccount.verifyPayload(p),
    getSelves: async () => [me],
    resolveLabel: (e) => e.name || e.routeId,
    alertUser: (entry, label) => alerts.push({ entry, label }),
    storage: memStorage(),
  };
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_impostor" }, wire, deps), true);
  assert.equal(alerts.length, 0, "rejeita remetente divergente");

  const wrongRecipient = await localAccount.signPayload(contactNotify.buildContactAddedPayload({ to: "vx_outra", now: 5001 }));
  assert.equal(await flow.receiveContactAddedDm({ from: me }, contactNotify.serializeContactAddedDm(wrongRecipient), deps), true);
  assert.equal(alerts.length, 0, "ignora quando destino não é este aparelho");

  const otherSig = { ...signed, to: me, author: "vx_alice", sig: "invalida" };
  assert.equal(await flow.receiveContactAddedDm({ from: "vx_alice" }, contactNotify.serializeContactAddedDm(otherSig), deps), true);
  assert.equal(alerts.length, 0, "rejeita assinatura inválida");

  const validSelfTest = await flow.receiveContactAddedDm(
    { from: "vx_alice" },
    contactNotify.serializeContactAddedDm({ ...signed, author: "vx_alice" }),
    { ...deps, verify: async () => true },
  );
  assert.equal(validSelfTest, true);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].label, "Alice");

  const wireOutcome = await ingestDecryptedEnvelope({ id: "dm_1", from: "vx_alice", to: me, ts: 5000 }, wire);
  assert.equal(wireOutcome, "contact_added");
  assert.equal((await cacheNode.getDmMessages("vx_alice")).length, 0, "não cria mensagem falsa na conversa DM");
});

test("renderAddedYouSection e renderPeopleSearch exibem quem adicionou você com ações", () => {
  const html = renderAddedYouSection([{ routeId: "vx_alice123456", name: "Alice", avatarUrl: "https://ex/a.png", ts: Date.now() }]);
  assert.ok(html.includes("Quem adicionou você"));
  assert.ok(html.includes("Adicionar de volta"));
  assert.ok(html.includes("Dispensar"));
  assert.ok(html.includes('src="https://ex/a.png"'));

  const main = { innerHTML: "" };
  renderPeopleSearch(main, { sections: { all: [] }, query: "", addedBy: [{ routeId: "vx_alice123456", name: "Alice", ts: Date.now() }] });
  assert.ok(main.innerHTML.includes("Quem adicionou você"));
});

test("contact-notify - no máximo 3 alertas por hora; os demais avisos só entram na lista", async () => {
  const storage = memStorage();
  const alerts = [];
  const deps = {
    verify: async () => true,
    getSelves: async () => ["vx_eu"],
    resolveLabel: (e) => e.name,
    alertUser: (entry) => alerts.push(entry.routeId),
    storage,
    now: () => 1_000_000,
  };
  for (let i = 0; i < 5; i++) {
    const signed = { type: contactNotify.CONTACT_ADDED_TYPE, to: "vx_eu", author: `vx_spam${i}`, sig: "s", pubKey: {}, ts: 10 + i, displayName: `S${i}` };
    await flow.receiveContactAddedDm({ from: signed.author }, contactNotify.serializeContactAddedDm(signed), deps);
  }
  assert.equal(alerts.length, 3, "só 3 alertas na hora");
  assert.equal(contactNotify.listIncomingContactNotices(storage).length, 5, "todos ficam na lista");
  assert.equal(contactNotify.takeContactAlertSlot(storage, 1_000_000 + 60 * 60 * 1000), true, "depois de uma hora volta a alertar");
});
