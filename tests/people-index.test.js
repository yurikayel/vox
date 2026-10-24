import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as peopleIndex from "../client/js/people-index.js";
import * as contacts from "../client/js/contacts.js";
import { WELCOME_ROUTE_ID } from "../client/js/vox-welcome-profile.js";

test("people-index - includes welcome and search", async () => {
  contacts.__resetContactsForTests();
  const all = await peopleIndex.buildPeopleIndex();
  assert.ok(all.some((p) => p.routeId === WELCOME_ROUTE_ID));
  const found = await peopleIndex.searchPeople("vox brasil");
  assert.ok(found.some((p) => p.routeId === WELCOME_ROUTE_ID));
});

test("people-index - parseConnectTarget", () => {
  assert.equal(peopleIndex.parseConnectTarget("vx_abc123"), "vx_abc123");
  assert.equal(
    peopleIndex.parseConnectTarget("https://x.test/#/connect/vx_peer"),
    "vx_peer"
  );
  assert.equal(peopleIndex.parseConnectTarget(""), null);
});

test("people-index - extractRecentAuthors dedupes", () => {
  const topics = [
    { author: "vx_a" },
    { author: "vx_b" },
    { author: "vx_a" },
  ];
  const recent = peopleIndex.extractRecentAuthors(topics, 5);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].routeId, "vx_a");
});
