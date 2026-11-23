/**
 * @file Ids vindos de fora (comunidade, endereço, gateway, rota, aba, `data-base`) não podem mexer no protótipo
 * nem escolher funções fora da tabela. Achados do CodeQL no release #407.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { isSafeKey } from "../client/js/shared/safe-key.js";
import { recordGatewayAttempt, __resetGatewayHealthForTests } from "../client/js/gateway-telemetry.js";
import { markCommunitySeen, loadLastSeenMap } from "../client/js/community-unread.js";
import { parseRoute } from "../client/js/app/route-parse.js";
import { renderCommunityTabContent } from "../client/js/render/community-page.js";

test("isSafeKey: recusa nomes de protótipo e o que não é string", () => {
  for (const k of ["__proto__", "constructor", "prototype", "", null, 1]) assert.equal(isSafeKey(k), false, String(k));
  assert.equal(isSafeKey("demo-feira-local"), true);
});

test("gateway-telemetry: rótulo `__proto__` não polui Object.prototype", () => {
  __resetGatewayHealthForTests();
  try {
    recordGatewayAttempt("__proto__", true);
    assert.equal({}.ok, undefined, "um objeto qualquer ganhou `ok` pelo protótipo");
  } finally {
    delete Object.prototype.ok;
    delete Object.prototype.fail;
    __resetGatewayHealthForTests();
  }
});

test("community-unread: id `__proto__` não troca o protótipo do mapa salvo", () => {
  markCommunitySeen("__proto__", 123);
  assert.equal(Object.getPrototypeOf(loadLastSeenMap()), Object.prototype);
  assert.deepEqual(Object.keys(loadLastSeenMap()).filter((k) => k === "__proto__"), []);
});

test("route-parse: `#/constructor` não chama função herdada como se fosse rota", () => {
  const prev = globalThis.location;
  globalThis.location = { hash: "#/constructor", search: "" };
  try {
    const r = parseRoute();
    assert.equal(typeof r?.name, "string", `rota sem nome: ${JSON.stringify(r)}`);
    assert.notEqual(r.name, undefined);
  } finally {
    globalThis.location = prev;
  }
});

test("community-page: aba `toString` cai na aba padrão em vez de chamar função herdada", () => {
  const html = renderCommunityTabContent("toString", { communityId: "x", commTitle: "X", meta: {}, topics: [] });
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /community-vox-posts-wrap/);
});

test("vox-embed: `data-base` com `javascript:` volta para o endereço padrão", () => {
  const src = fs.readFileSync(new URL("../client/embed/vox-embed.js", import.meta.url), "utf8");
  let link = null;
  const attrs = { "data-topic": "top_1", "data-base": "javascript:alert(1)//" };
  const script = {
    getAttribute: (n) => attrs[n] ?? null,
    insertAdjacentElement: (_pos, el) => {
      link = el;
    },
  };
  const document = { currentScript: script, createElement: () => ({ style: {} }) };
  vm.runInNewContext(src, { document, encodeURIComponent });
  assert.match(link.href, /^https:\/\/yurikayel\.github\.io\/vox\/#\/t\/top_1/);
});
