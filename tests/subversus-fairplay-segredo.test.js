/**
 * @file Fairplay: o que vai para a mesa não leva a semente nem as partes de backup, e revelação sem compromisso
 * não vira rolagem verificada. Importa só o que já existia antes da separação (PM-111).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFairplayRollOffer, resolveFairplayRoll } from "../client/js/dungeon/vtt-fairplay-roll.js";

test("subversus fairplay: o compromisso público não carrega a semente nem as partes de backup", async () => {
  const offer = await createFairplayRollOffer({ peerId: "gareth", rollId: "r-pub" });
  assert.equal(offer.seedBytes, undefined, "a semente não pode estar no objeto que vai para a mesa");
  assert.equal(offer.backupShares, undefined, "as partes de backup não podem ir todas juntas para a mesa");
  assert.equal(offer.commit?.seedBytes, undefined);
  assert.equal(offer.commit?.backupShares, undefined);
});

test("subversus fairplay: revelação sem compromisso prévio é recusada", async () => {
  const res = await resolveFairplayRoll({
    rollId: "r-sem-commit",
    sides: 20,
    participants: [{ peerId: "intruso", seedBytes: new Uint8Array(32).fill(7) }],
  });
  assert.equal(res.ok, false, "semente sem compromisso não pode virar rolagem verificada");
  assert.equal(res.verified, false);
});
