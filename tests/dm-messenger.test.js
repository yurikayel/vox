import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as dmMsg from "../client/js/dm-messenger.js";
import * as render from "../client/js/render.js";
import { WELCOME_ROUTE_ID } from "../client/js/vox-welcome-profile.js";

function createContainer() {
  return { innerHTML: "" };
}

test("dm-messenger: plain text payload preserves backward compatibility", () => {
  const wire = dmMsg.serializeDmPayload({ text: "Oi camarada!" });
  assert.equal(wire, "Oi camarada!");
  const parsed = dmMsg.parseDmPayload(wire);
  assert.equal(parsed.kind, "message");
  assert.equal(parsed.text, "Oi camarada!");
  assert.equal(parsed.replyTo, null);
  assert.equal(parsed.contextCard, null);
});

test("dm-messenger: structured quote-reply and contextCard roundtrip", () => {
  const wire = dmMsg.serializeDmPayload({
    text: "Ainda tem essa cesta?",
    replyTo: { id: "dm_123", author: "@feira_sp", snippet: "Cesta agroecológica R$ 45" },
    contextCard: {
      type: "listing",
      id: "lst_9",
      title: "Cesta Agroecológica",
      priceBrl: "R$ 45,00",
      pixKey: "feira@org.br",
      communityId: "sp-horta",
      href: "#/c/sp-horta?tab=listings",
    },
  });
  assert.ok(wire.startsWith('{"__vox_dm_v2":1'));
  const parsed = dmMsg.parseDmPayload(wire);
  assert.equal(parsed.kind, "message");
  assert.equal(parsed.text, "Ainda tem essa cesta?");
  assert.deepEqual(parsed.replyTo, {
    id: "dm_123",
    author: "@feira_sp",
    snippet: "Cesta agroecológica R$ 45",
  });
  assert.equal(parsed.contextCard?.type, "listing");
  assert.equal(parsed.contextCard?.title, "Cesta Agroecológica");
  assert.equal(parsed.contextCard?.priceBrl, "R$ 45,00");
  assert.equal(parsed.contextCard?.pixKey, "feira@org.br");
});

test("dm-messenger: reaction payload roundtrip and validation", () => {
  const wire = dmMsg.serializeDmReaction({ targetId: "dm_555", emoji: "🔥" });
  const parsed = dmMsg.parseDmPayload(wire);
  assert.equal(parsed.kind, "react");
  assert.equal(parsed.targetId, "dm_555");
  assert.equal(parsed.emoji, "🔥");

  assert.throws(() => {
    dmMsg.serializeDmReaction({ targetId: "dm_555", emoji: "🤡" });
  }, /inválida/i);
});

test("dm-messenger: toggleReactionMap adds, toggles off, and cleans empty keys", () => {
  let map = dmMsg.toggleReactionMap(null, "👍", "vx_alice");
  assert.deepEqual(map, { "👍": ["vx_alice"] });

  map = dmMsg.toggleReactionMap(map, "👍", "vx_bob");
  assert.deepEqual(map, { "👍": ["vx_alice", "vx_bob"] });

  map = dmMsg.toggleReactionMap(map, "👍", "vx_alice");
  assert.deepEqual(map, { "👍": ["vx_bob"] });

  map = dmMsg.toggleReactionMap(map, "👍", "vx_bob");
  assert.deepEqual(map, {});
});

test("dm-messenger: unread count and markThreadRead", () => {
  localStorage.clear();
  const me = "vx_me_0001";
  const peer = "vx_peer_0002";
  const msgs = [
    { id: "m1", from: peer, to: me, text: "Oi 1", ts: 1000 },
    { id: "m2", from: me, to: peer, text: "Oi 2", ts: 2000 },
    { id: "m3", from: peer, to: me, text: "Oi 3", ts: 3000 },
  ];
  assert.equal(dmMsg.computeUnreadCount(msgs, peer, me), 2);

  dmMsg.markThreadRead(peer, 1500);
  assert.equal(dmMsg.computeUnreadCount(msgs, peer, me), 1);

  dmMsg.markThreadRead(peer, 3500);
  assert.equal(dmMsg.computeUnreadCount(msgs, peer, me), 0);
});

test("dm-messenger: pin limit (max 3) and sortAndFilterConversations", () => {
  localStorage.clear();

  assert.equal(dmMsg.togglePinPeer("vx_p1").pinned, true);
  assert.equal(dmMsg.togglePinPeer("vx_p2").pinned, true);
  assert.equal(dmMsg.togglePinPeer("vx_p3").pinned, true);
  const fourth = dmMsg.togglePinPeer("vx_p4");
  assert.equal(fourth.pinned, false);
  assert.equal(fourth.reason, "limit");

  assert.equal(dmMsg.togglePinPeer("vx_p2").pinned, false);
  assert.deepEqual(dmMsg.getPinnedPeers(), ["vx_p1", "vx_p3"]);

  const convs = [
    { peerAddress: "vx_normal_old", lastMessage: { text: "antiga", ts: 100 } },
    { peerAddress: "vx_p1", lastMessage: { text: "fixada 1", ts: 50 } },
    { peerAddress: WELCOME_ROUTE_ID, lastMessage: { text: "boas vindas", ts: 10 } },
    { peerAddress: "vx_normal_new", lastMessage: { text: "recente feira", ts: 500 } },
  ];

  const sorted = dmMsg.sortAndFilterConversations(convs, {
    query: "",
    resolveLabel: (addr) => addr,
  });
  assert.deepEqual(
    sorted.map((c) => c.peerAddress),
    [WELCOME_ROUTE_ID, "vx_p1", "vx_normal_new", "vx_normal_old"]
  );

  const filtered = dmMsg.sortAndFilterConversations(convs, {
    query: "feira",
    resolveLabel: (addr) => addr,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].peerAddress, "vx_normal_new");
});

test("dm-messenger: buildListingDmHref, parseDmContextFromHash, and extractInlineVoxCard", () => {
  const href = dmMsg.buildListingDmHref(
    {
      id: "lst_42",
      author: "vx_vendedor_99",
      title: "Mel Orgânico 500g",
      priceBrl: "R$ 28,00",
      pixKey: "mel@coop.br",
    },
    "feira-sul"
  );
  assert.ok(href.startsWith("#/dm/vx_vendedor_99?"));
  const card = dmMsg.parseDmContextFromHash(href);
  assert.equal(card?.type, "listing");
  assert.equal(card?.id, "lst_42");
  assert.equal(card?.title, "Mel Orgânico 500g");
  assert.equal(card?.priceBrl, "R$ 28,00");
  assert.equal(card?.pixKey, "mel@coop.br");
  assert.equal(card?.communityId, "feira-sul");

  const inlineTopic = dmMsg.extractInlineVoxCard("Veja o debate em #/t/mutirao-2026?c=sp-centro");
  assert.equal(inlineTopic?.type, "topic");
  assert.equal(inlineTopic?.id, "mutirao-2026");

  const inlineComm = dmMsg.extractInlineVoxCard("Entre na comunidade #/c/horta-urbana");
  assert.equal(inlineComm?.type, "community");
  assert.equal(inlineComm?.id, "horta-urbana");
});

test("dm-messenger: renderDmList and renderDmThread render DM v2 UI controls", () => {
  const main = createContainer();
  localStorage.clear();
  const me = "vx_eu_1234567890";
  const peer = "vx_parceiro_9876543210";

  dmMsg.togglePinPeer(peer);
  render.renderDmList(
    main,
    [
      {
        peerAddress: peer,
        unreadCount: 3,
        lastMessage: { from: peer, to: me, text: "Bora organizar!", ts: Date.now() },
      },
    ],
    me,
    { contactList: [] }
  );

  assert.ok(main.innerHTML.includes('id="dm-search-input"'), "search input rendered when conversations exist");
  assert.ok(main.innerHTML.includes("dm-unread-badge"), "unread badge rendered");
  assert.ok(main.innerHTML.includes("btn-dm-pin active"), "active pin button rendered");

  const threadMessages = [
    {
      id: "dm_msg_1",
      peerAddress: peer,
      from: peer,
      to: me,
      text: "Tenho 2 caixas disponíveis",
      replyTo: { id: "dm_msg_0", author: "Você", snippet: "Ainda tem tomate?" },
      contextCard: {
        type: "listing",
        id: "lst_1",
        title: "Tomate Orgânico",
        priceBrl: "R$ 15,00",
        pixKey: "tomate@pix.br",
        href: "#/c/horta?tab=listings",
      },
      reactions: { "❤️": [me], "🔥": [peer] },
      ts: Date.now(),
      status: "received",
    },
  ];

  render.renderDmThread(main, peer, threadMessages, me, {
    isRtcOnline: true,
    hasDmPub: true,
    pendingContextCard: {
      type: "listing",
      id: "lst_2",
      title: "Alface Crespa",
      priceBrl: "R$ 5,00",
    },
  });

  assert.ok(main.innerHTML.includes("dm-quote-block"));
  assert.ok(main.innerHTML.includes("Ainda tem tomate?"));
  assert.ok(main.innerHTML.includes("dm-context-card"));
  assert.ok(main.innerHTML.includes("Tomate Orgânico"));
  assert.ok(main.innerHTML.includes('data-pix="tomate@pix.br"'));
  assert.ok(main.innerHTML.includes("dm-reaction-pill"));
  assert.ok(main.innerHTML.includes("btn-dm-reply-msg"));
  assert.ok(main.innerHTML.includes('id="dm-context-draft-bar"'));
  assert.ok(main.innerHTML.includes("Alface Crespa"));
});
