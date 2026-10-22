import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mod from "../client/js/moderation.js";

test("moderation - parseModerators limpa e divide strings", () => {
  const mods = mod.parseModerators("addr1, addr2,  addr3 ,, addr4 ");
  assert.deepEqual(mods, ["addr1", "addr2", "addr3", "addr4"]);
  assert.deepEqual(mod.parseModerators(""), []);
  assert.deepEqual(mod.parseModerators(null), []);
});

test("moderation - isModerator reconhece dono e moderadores da lista", () => {
  assert.equal(mod.isModerator("owner123", "owner123", "mod1,mod2"), true);
  assert.equal(mod.isModerator("mod1", "owner123", "mod1,mod2"), true);
  assert.equal(mod.isModerator("user_comum", "owner123", "mod1,mod2"), false);
  assert.equal(mod.isModerator("", "owner123"), false);
});

test("moderation - applyFilters oculta tópicos marcados com hide", () => {
  const topics = [
    { id: "tx_1", title: "Topico Bom", owner: "user_a" },
    { id: "tx_spam", title: "Spam", owner: "user_b" },
    { id: "tx_2", title: "Outro Topico", owner: "user_c" },
  ];

  const actions = [
    { action: "hide", target: "tx_spam", owner: "owner123" },
  ];

  const filtered = mod.applyFilters(topics, actions, "owner123");
  assert.equal(filtered.length, 2);
  assert.equal(filtered.find((t) => t.id === "tx_spam"), undefined);
});

test("moderation - applyFilters ignora mod-actions de usuarios nao autorizados", () => {
  const topics = [
    { id: "tx_1", title: "Topico Legítimo", owner: "user_a" },
  ];

  const fakeActions = [
    { action: "hide", target: "tx_1", owner: "hacker_nao_mod" },
  ];

  const filtered = mod.applyFilters(topics, fakeActions, "owner_real");
  assert.equal(filtered.length, 1);
});

test("moderation - applyFilters filtra autores banidos", () => {
  const replies = [
    { id: "r1", body: "Oi", owner: "autor_gentil" },
    { id: "r2", body: "Ataque", owner: "troll_1" },
    { id: "r3", body: "Outro Ataque", owner: "troll_1" },
  ];

  const actions = [
    { action: "ban", target: "troll_1", owner: "owner_real" },
  ];

  const filtered = mod.applyFilters(replies, actions, "owner_real");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].owner, "autor_gentil");
});
