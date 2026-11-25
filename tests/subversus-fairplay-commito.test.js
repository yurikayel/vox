/**
 * @file Lacuna da camada de baixo do Commit-Reveal² (ADR-040 §2.3a): revelação ou recuperação sem
 * `commitO` não pode virar rolagem válida. Importa só o que já existe na base.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCommitReveal2Slot, resolveCommitReveal2Roll } from "../client/js/rpg-crypto-table.js";

test("revelação sem commitO é recusada", async () => {
  await assert.rejects(
    () => resolveCommitReveal2Roll([{ peerId: "a", seedBytes: new Uint8Array([1, 2, 3]) }], 20),
    /commitO/,
  );
});

test("recuperação sem commitO é recusada", async () => {
  const slot = await createCommitReveal2Slot(new Uint8Array([4, 5, 6]), { threshold: 2, totalPeers: 3 });
  await assert.rejects(
    () => resolveCommitReveal2Roll([{ peerId: "b", aborted: true, threshold: 2, backupShares: slot.backupShares.slice(0, 2) }], 20),
    /commitO/,
  );
});
