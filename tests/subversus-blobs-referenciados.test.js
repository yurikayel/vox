/**
 * @file SUB-30: `referencedBlobHashes` lista os hashes de mapa e de avatar que a campanha usa. Fica num arquivo à parte
 * para que o teste de exportação carregue (e falhe por asserção) mesmo onde este export ainda não existe.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { referencedBlobHashes } from "../client/js/dungeon/vtt-portable.js";

test("referencedBlobHashes ignora vazios e campanha sem cenas", () => {
  assert.equal(referencedBlobHashes(null).size, 0);
  const doc = { scenesById: { s: { floors: [{ mapBlobHash: "" }, { mapBlobHash: "m" }], tokens: [{ avatarBlobHash: "" }, { avatarBlobHash: "t" }] } } };
  assert.deepEqual([...referencedBlobHashes(doc)].sort(), ["m", "t"]);
});
