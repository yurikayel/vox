import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as profileNote from "../client/js/profile-note.js";

test("profile-note - set get clip and expire 24h", () => {
  profileNote.__resetNotesForTests();
  assert.equal(profileNote.getNote("vx_me"), null);

  const rec = profileNote.setNote("vx_me", "  oi do perfil  ");
  assert.equal(rec.text, "oi do perfil");
  assert.equal(profileNote.getNote("vx_me").text, "oi do perfil");

  const long = "x".repeat(200);
  assert.equal(profileNote.setNote("vx_me", long).text.length, profileNote.NOTE_MAX);

  const staleAt = Date.now() - profileNote.NOTE_TTL_MS - 10;
  profileNote.ingestRemoteNote("vx_peer", "nota velha", staleAt);
  assert.equal(profileNote.getNote("vx_peer"), null);

  profileNote.ingestRemoteNote("vx_peer", "nota fresca", Date.now());
  assert.equal(profileNote.getNote("vx_peer").text, "nota fresca");

  profileNote.clearNote("vx_me");
  assert.equal(profileNote.getNote("vx_me"), null);
  assert.match(profileNote.NOTE_HINT, /neste aparelho/i);
});
