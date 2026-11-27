/**
 * Folha de layout da Mesa injetada sob demanda no documento.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ensureDungeonLayoutStyles, SV_SHEETS } from "../client/js/dungeon/dungeon-layout-style.js";

const LINK_ID = "dungeon-layout-stylesheet";
const TOTAL_LINKS = 1 + SV_SHEETS.length;

function buildLayoutDoc() {
  const byId = new Map();
  const headChildren = [];
  let createCalls = 0;
  const head = {
    appendChild(el) {
      headChildren.push(el);
      if (el.id) byId.set(el.id, el);
    },
  };
  const doc = {
    head,
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => {
      createCalls += 1;
      return { tagName: tag.toUpperCase(), id: "", rel: "", href: "" };
    },
  };
  return { doc, headChildren, getCreateCalls: () => createCalls };
}

test("ensureDungeonLayoutStyles — linka css/dungeon-layout.css no head", () => {
  const { doc, headChildren } = buildLayoutDoc();
  ensureDungeonLayoutStyles(doc);
  assert.equal(headChildren.length, TOTAL_LINKS);
  const link = headChildren[0];
  assert.equal(link.tagName, "LINK");
  assert.equal(link.id, LINK_ID);
  assert.equal(link.rel, "stylesheet");
  assert.equal(link.href, "css/dungeon-layout.css");
  assert.equal(doc.getElementById(LINK_ID), link);
});

test("ensureDungeonLayoutStyles — segunda chamada é idempotente", () => {
  const { doc, headChildren, getCreateCalls } = buildLayoutDoc();
  ensureDungeonLayoutStyles(doc);
  const first = headChildren[0];
  ensureDungeonLayoutStyles(doc);
  ensureDungeonLayoutStyles(doc);
  assert.equal(headChildren.length, TOTAL_LINKS);
  assert.equal(headChildren[0], first);
  assert.equal(getCreateCalls(), TOTAL_LINKS);
});

test("ensureDungeonLayoutStyles — sem head não cria link", () => {
  const doc = { getElementById: () => null, createElement: () => assert.fail("createElement") };
  ensureDungeonLayoutStyles(doc);
});