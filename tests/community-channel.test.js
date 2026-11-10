import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const channel = await import("../client/js/community-channel.js");
const updates = await import("../client/js/community-updates.js");
const bar = await import("../client/js/render/channel-bar.js");
const toolbar = await import("../client/js/render/community-toolbar.js");
const badges = await import("../client/js/render/topic-badges.js");
const flow = await import("../client/js/app/community-channel-flow.js");

const META = { id: "bairro", owner: "vx_dono", moderators: "vx_mod", postingMode: "mods" };
const topic = (id, author) => ({ id, author, ts: 10 });

test("canal - só dono e moderação publicam; comunidade aberta deixa todos", () => {
  assert.equal(channel.isChannel(META), true);
  assert.equal(channel.canPostTopic(META, ["", "vx_mod"]), true, "qualquer identidade do aparelho que modera serve");
  assert.equal(channel.canPostTopic(META, "VX_DONO"), true);
  assert.equal(channel.canPostTopic(META, ["vx_ana", ""]), false);
  assert.equal(channel.canPostTopic({ ...META, postingMode: "open" }, "vx_ana"), true);
  assert.equal(channel.canPostTopic(null, "vx_ana"), true);
});

test("canal - leitura: post de quem não modera some para os outros e fica marcado para autor e moderação", () => {
  const list = [topic("t1", "vx_dono"), topic("t2", "vx_ana"), { id: "t3", owner: "vx_mod", ts: 1 }];
  assert.deepEqual(channel.filterChannelTopics(list, META, "vx_bia").map((t) => t.id), ["t1", "t3"]);
  const forAuthor = channel.filterChannelTopics(list, META, ["0xCarteira", "vx_ana"]);
  assert.equal(forAuthor.find((t) => t.id === "t2").channelHeld, true);
  assert.equal(channel.filterChannelTopics(list, META, "vx_mod").length, 3);
  assert.equal(channel.filterChannelTopics(list, { ...META, postingMode: "open" }, "vx_bia").length, 3);
  const backdated = { id: "t4", author: "vx_ana", ts: 1 };
  assert.deepEqual(channel.filterChannelTopics([backdated], META, "vx_bia"), [], "data antiga não escapa do canal");
  assert.equal(channel.filterChannelTopic(topic("t2", "vx_ana"), META, "vx_bia").channelHidden, true);
  assert.equal(channel.filterChannelTopic(topic("t1", "vx_dono"), META, "vx_bia").channelHidden, undefined);
});

test("canal - o modo vem de community_update assinado por dono ou moderação; de outra pessoa não vale", () => {
  const body = channel.buildPostingModeUpdate("bairro", "mods", 1000);
  assert.equal(body.postingMode, "mods");
  assert.equal(body.postingModeSince, "1000");
  assert.throws(() => channel.buildPostingModeUpdate("bairro", "todos"), /inválido/);
  const base = { id: "bairro", owner: "vx_dono", moderators: "vx_mod" };
  assert.equal(updates.applyCommunityUpdates(base, [{ ...body, author: "vx_mod" }]).postingMode, "mods");
  assert.equal(updates.applyCommunityUpdates(base, [{ ...body, author: "vx_ana" }]).postingMode, undefined);
  const reopened = { ...channel.buildPostingModeUpdate("bairro", "open", 2000), author: "vx_dono" };
  assert.equal(updates.applyCommunityUpdates(base, [{ ...body, author: "vx_mod" }, reopened]).postingMode, "open");
});

test("canal - telas: faixa, botão de modo, selo e Novo post só para quem pode", () => {
  assert.match(bar.renderChannelBarHtml(META, { isMod: true }), /Abrir para todos publicarem/);
  const member = bar.renderChannelBarHtml(META, { isMod: false });
  assert.match(member, /só a moderação publica/);
  assert.ok(!member.includes("btn-channel-mode"));
  assert.match(bar.renderChannelBarHtml({ id: "x" }, { isMod: true }), /data-mode="mods"/);
  assert.equal(bar.renderChannelBarHtml({ id: "x" }, { isMod: false }), "");
  assert.ok(!toolbar.renderCommunityHeaderToolbar("bairro", "Bairro", true, bar.showsComposeButton(META, false)).includes("Novo post"));
  assert.ok(toolbar.renderCommunityHeaderToolbar("bairro", "Bairro", true, bar.showsComposeButton(META, true)).includes("Novo post"));
  assert.match(badges.resolveTopicBadgesHtml({ channelHeld: true }), /Fora do canal/);
});

test("canal - aba de posts: sem '+ Post' nem 'Criar o primeiro post' para quem não modera", async () => {
  const { renderCommunityTabContent } = await import("../client/js/render/community.js");
  const ctx = { communityId: "bairro", commTitle: "Bairro", meta: META, topics: [], recentPeople: [] };
  const member = renderCommunityTabContent("posts", { ...ctx, isMod: false });
  assert.ok(!member.includes("#/compose/topic"), "quem não modera não vê botão de novo post no canal");
  assert.match(member, /Nenhum post nesta comunidade ainda/);
  assert.match(renderCommunityTabContent("posts", { ...ctx, isMod: true }), /Criar o primeiro post/);
  assert.match(renderCommunityTabContent("posts", { ...ctx, meta: { id: "bairro" }, isMod: false }), /#\/compose\/topic\?c=bairro/);
});

test("canal - compor avisa quem não modera; trocar o modo exige ser dono ou moderador", async () => {
  const notes = [];
  const deps = (selves) => ({ getMeta: async () => META, getSelves: async () => selves, notify: (m) => notes.push(m) });
  assert.equal(await flow.assertCanPostTopic("bairro", deps(["vx_ana"])), false);
  assert.match(notes[0], /é um canal/);
  assert.equal(await flow.assertCanPostTopic("bairro", deps(["vx_mod"])), true);
  const saved = [];
  const modeDeps = (routeId) => ({
    getMeta: async () => META, getRouteId: async () => routeId, now: () => 5,
    sign: async (p) => ({ ...p, author: routeId, sig: "s" }), save: async (x) => saved.push(x), broadcast: () => {},
  });
  await assert.rejects(() => flow.setPostingMode("bairro", "open", modeDeps("vx_ana")), /Só o dono ou um moderador/);
  const signed = await flow.setPostingMode("bairro", "open", modeDeps("vx_mod"));
  assert.equal(signed.postingMode, "open");
  assert.equal(saved.length, 1);
});

test("canal - depois de trocar o modo, a página montada sai para a faixa ser refeita", () => {
  const removed = [];
  const page = (id) => ({ dataset: { communityId: id }, remove: () => removed.push(id) });
  const doc = { querySelectorAll: () => [page("outra"), page("bairro")] };
  assert.equal(flow.dropMountedCommunityPage("bairro", doc), true);
  assert.deepEqual(removed, ["bairro"]);
  assert.equal(flow.dropMountedCommunityPage("nenhuma", doc), false);
});
