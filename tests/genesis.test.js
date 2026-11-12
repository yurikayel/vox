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

test("gênese: filtra edges e transaction das respostas GraphQL", () => {
  const old = { node: { id: "a", block: { timestamp: SEC - 1 } } };
  const neu = { node: { id: "b", block: { timestamp: SEC + 1 } } };
  const out = g.filterGraphqlData({ transactions: { pageInfo: {}, edges: [old, neu] } });
  assert.deepEqual(out.transactions.edges.map((e) => e.node.id), ["b"]);
  assert.equal(g.filterGraphqlData({ transaction: old.node }).transaction, null);
  assert.equal(g.filterGraphqlData(null), null);
});

test("gênese: itens locais em ms; sem data ficam", () => {
  assert.equal(g.isBeforeGenesisMs(g.GENESIS_MS - 1), true);
  assert.equal(g.isBeforeGenesisMs(g.GENESIS_MS), false);
  assert.equal(g.isBeforeGenesisMs(0), false);
});
