import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const g = await import("../client/js/genesis.js");

const SEC = Math.floor(g.GENESIS_MS / 1000);

test("gênese: bloco antes do corte some, depois fica", () => {
  assert.equal(g.isBeforeGenesisNode({ block: { timestamp: SEC - 1 } }), true);
  assert.equal(g.isBeforeGenesisNode({ block: { timestamp: SEC } }), false);
});

test("gênese: sem bloco usa a tag Timestamp; sem nada, é pendente e fica", () => {
  const tag = (ms) => ({ block: null, tags: [{ name: "Timestamp", value: String(ms) }] });
  assert.equal(g.isBeforeGenesisNode(tag(g.GENESIS_MS - 1)), true);
  assert.equal(g.isBeforeGenesisNode(tag(g.GENESIS_MS + 1)), false);
  assert.equal(g.isBeforeGenesisNode({ block: null, tags: [] }), false);
});

test("gênese: a hora do bloco vale mais que a tag (tag forjada não traz teste de volta)", () => {
  const node = { block: { timestamp: SEC - 60 }, tags: [{ name: "Timestamp", value: String(g.GENESIS_MS + 1e6) }] };
  assert.equal(g.isBeforeGenesisNode(node), true);
});

test("gênese: filtra edges e transaction das respostas GraphQL (data e conta expurgada)", () => {
  const old = { node: { id: "a", block: { timestamp: SEC - 1 } } };
  const neu = { node: { id: "b", block: { timestamp: SEC + 1 } } };
  const purged = { node: { id: "c", block: { timestamp: SEC + 10 }, tags: [{ name: "Route-Id", value: "vx_kdkteNeutXHoRgB8KwB8" }] } };
  const out = g.filterGraphqlData({ transactions: { pageInfo: {}, edges: [old, neu, purged] } });
  assert.deepEqual(out.transactions.edges.map((e) => e.node.id), ["b"]);
  assert.equal(g.filterGraphqlData({ transaction: old.node }).transaction, null);
  assert.equal(g.filterGraphqlData({ transaction: purged.node }).transaction, null);
  assert.equal(g.filterGraphqlData(null), null);
});

test("gênese: itens locais em ms; sem data ficam", () => {
  assert.equal(g.isBeforeGenesisMs(g.GENESIS_MS - 1), true);
  assert.equal(g.isBeforeGenesisMs(g.GENESIS_MS), false);
  assert.equal(g.isBeforeGenesisMs(0), false);
});

test("gênese: contas de teste e perfis Yuri Kayel excedentes saem; só o Vox oficial fica", async () => {
  const { TEST_ROUTE_IDS } = await import("../client/js/data/test-route-ids.js");
  assert.equal(TEST_ROUTE_IDS.length, new Set(TEST_ROUTE_IDS).size, "sem repetição");
  assert.ok(TEST_ROUTE_IDS.every((id) => /^vx_[\w-]+$/.test(id)));
  assert.equal(g.isTestRouteId("vx_WAqxgW1JLEg7GtkA-lP-"), true);
  assert.equal(g.isTestRouteId(` ${TEST_ROUTE_IDS[0]} `), true);
  assert.equal(g.isTestRouteId("vx_voxbrasil_welcome"), false);
  assert.equal(g.isTestRouteId("vx_WuSxKR0W901YTLOJe7Oa"), true);
  assert.equal(g.isTestRouteId("vx_kdkteNeutXHoRgB8KwB8"), true);
  assert.equal(g.isTestRouteId("vx_h_Ha71T7YrSLvc5Oqxgh"), true);
  assert.equal(g.isTestRouteId(""), false);
});
