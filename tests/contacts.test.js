import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as contacts from "../client/js/contacts.js";

test("contacts - add list remove dedupe", () => {
  contacts.__resetContactsForTests();
  assert.equal(contacts.listContacts().length, 0);
  contacts.addContact("vx_a", "Alice");
  contacts.addContact("vx_b", "Bob");
  assert.equal(contacts.listContacts().length, 2);
  contacts.addContact("vx_a", "Alice 2");
  assert.equal(contacts.listContacts().length, 2);
  assert.equal(contacts.listContacts()[0].label, "Alice 2");
  assert.equal(contacts.hasContact("vx_a"), true);
  contacts.removeContact("vx_a");
  assert.equal(contacts.hasContact("vx_a"), false);
});
