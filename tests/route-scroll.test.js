/**
 * Preservação de rolagem entre rotas (`client/js/app/route.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  rememberRouteScroll,
  restoreRouteScroll,
  __resetRouteScrollForTests,
} from "../client/js/app/route.js";

test("route scroll — restaura Y apenas quando volta pelo histórico (isBack)", () => {
  __resetRouteScrollForTests();
  const calls = [];
  const fakeWin = {
    scrollY: 640,
    scrollTo(x, y) { calls.push([x, y]); },
  };

  rememberRouteScroll("#/c/geral", fakeWin);
  assert.equal(restoreRouteScroll("#/c/geral", false, fakeWin), 0);
  assert.equal(restoreRouteScroll("#/c/geral", true, fakeWin), 640);
  assert.equal(restoreRouteScroll("#/nao-visitada", true, fakeWin), 0);
  assert.deepEqual(calls, [[0, 0], [0, 640], [0, 0]]);
});

test("route scroll — respeita teto de histórico mantendo rotas recentes", () => {
  __resetRouteScrollForTests();
  const fakeWin = { scrollY: 100, scrollTo() {} };
  for (let i = 0; i < 60; i += 1) {
    fakeWin.scrollY = i * 10;
    rememberRouteScroll(`#/r/${i}`, fakeWin);
  }
  assert.equal(restoreRouteScroll("#/r/0", true, fakeWin), 0);
  assert.equal(restoreRouteScroll("#/r/59", true, fakeWin), 590);
});
