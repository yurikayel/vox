import "./setup.js";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as idx from "../client/js/repost-index.js";

const KEY = "vox-own-reposts-v1";
beforeEach(() => {
  localStorage.removeItem(KEY);
  idx.rememberVisible([], "");
  localStorage.removeItem(KEY);
});

test("repost-index - estado vazio", () => {
  assert.equal(idx.hasOwnRepost("o1"), false);
  assert.equal(idx.getOwnRepostId("o1"), "");
  assert.equal(idx.getVisibleCount("o1"), 0);
  assert.equal(idx.hasOwnRepost(undefined), false);
});

test("repost-index - rememberVisible conta por originalId e ignora posts sem original", () => {
  idx.rememberVisible([{ id: "r1", originalId: "o1" }, { id: "r2", originalId: "o1" }, { id: "p3" }], "vx_me");
  assert.equal(idx.getVisibleCount("o1"), 2);
  assert.equal(idx.getVisibleCount("p3"), 0);
});

test("repost-index - rememberVisible reinicia as contagens a cada chamada", () => {
  idx.rememberVisible([{ id: "r1", originalId: "o1" }], "");
  idx.rememberVisible([], "");
  assert.equal(idx.getVisibleCount("o1"), 0);
});

test("repost-index - repost do próprio autor (author, owner ou isOwnLocalPost) fica registrado", () => {
  idx.rememberVisible([{ id: "r1", originalId: "o1", author: "vx_me" }], "vx_me");
  idx.rememberVisible([{ id: "r2", originalId: "o2", owner: "vx_me" }], "vx_me");
  idx.rememberVisible([{ id: "r3", originalId: "o3", isOwnLocalPost: true }], "");
  assert.equal(idx.getOwnRepostId("o1"), "r1");
  assert.equal(idx.getOwnRepostId("o2"), "r2");
  assert.equal(idx.getOwnRepostId("o3"), "r3");
});

test("repost-index - repost de outra pessoa não vira 'meu'", () => {
  idx.rememberVisible([{ id: "r1", originalId: "o1", author: "vx_other" }], "vx_me");
  assert.equal(idx.hasOwnRepost("o1"), false);
});

test("repost-index - sem authorId, autor vazio não casa por engano", () => {
  idx.rememberVisible([{ id: "r1", originalId: "o1" }], "");
  assert.equal(idx.hasOwnRepost("o1"), false);
});

test("repost-index - setOwn ignora argumentos vazios e persiste os válidos", () => {
  idx.setOwn("", "r1");
  idx.setOwn("o1", "");
  assert.equal(localStorage.getItem(KEY), null);
  idx.setOwn("o1", "r1");
  assert.equal(JSON.parse(localStorage.getItem(KEY)).o1, "r1");
});

test("repost-index - markCreated registra e soma; markRemoved remove e subtrai sem ir abaixo de 0", () => {
  idx.markCreated("o1", "r1");
  assert.equal(idx.hasOwnRepost("o1"), true);
  assert.equal(idx.getVisibleCount("o1"), 1);
  idx.markRemoved("o1");
  assert.equal(idx.hasOwnRepost("o1"), false);
  assert.equal(idx.getVisibleCount("o1"), 0);
  idx.markRemoved("o1");
  assert.equal(idx.getVisibleCount("o1"), 0);
});

test("repost-index - JSON corrompido no storage vira vazio, sem lançar", () => {
  localStorage.setItem(KEY, "{nao-json");
  assert.equal(idx.hasOwnRepost("o1"), false);
  idx.setOwn("o1", "r1");
  assert.equal(idx.getOwnRepostId("o1"), "r1");
});

test("repost-index - storage com array JSON não perde a escrita", { todo: "readOwn aceita '[]' (truthy); setOwn grava propriedade em array e JSON.stringify a descarta: o repost some em silêncio" }, () => {
  localStorage.setItem(KEY, "[]");
  idx.setOwn("o1", "r1");
  assert.equal(idx.getOwnRepostId("o1"), "r1");
});

test("repost-index - storage com string JSON não lança em setOwn", { todo: "readOwn devolve string para um JSON de texto; atribuir propriedade a primitivo em módulo ESM (strict) lança TypeError" }, () => {
  localStorage.setItem(KEY, JSON.stringify("x"));
  assert.doesNotThrow(() => idx.setOwn("o1", "r1"));
});
