/**
 * @file Testes unitários da Trilha A do Subversus VTT: Fairplay Commit-Reveal² (reuso de rpg-crypto-table.js),
 * detecção de fraude, resistência a Last Revealer Attack e projeção Zero-Spoiler de FloorDoc/volumes/portals.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createFairplayRollOffer,
  formatFairplayBadge,
  resolveFairplayRoll,
} from "../client/js/dungeon/vtt-fairplay-roll.js";
import {
  createFloorDoc,
  createPortalDoc,
  createTokenDoc,
  createVolumeDoc,
  createWallDoc,
} from "../client/js/dungeon/vtt-scene-schema.js";
import { projectTacticsFloorForPlayer } from "../client/js/dungeon/vtt-tactics-reducer.js";

test("subversus fairplay: resolve rolagem Commit-Reveal² válida com selo leigo", async () => {
  const offerA = await createFairplayRollOffer({ peerId: "gareth", rollId: "r-1" });
  const offerB = await createFairplayRollOffer({ peerId: "mestre", rollId: "r-1" });
  const res = await resolveFairplayRoll({ rollId: "r-1", sides: 20, participants: [offerA, offerB] });
  assert.equal(res.ok, true);
  assert.equal(res.verified, true);
  assert.ok(res.value >= 1 && res.value <= 20);
  const badge = formatFairplayBadge(res);
  assert.equal(badge.label, "✓ Verificada");
  assert.ok(!badge.label.includes("SHA-256") && !badge.title.includes("CRDT"));
});

test("subversus fairplay: detecta fraude quando semente revelada diverge do commitO", async () => {
  const offerA = await createFairplayRollOffer({ peerId: "gareth", rollId: "r-fraud" });
  const offerB = await createFairplayRollOffer({ peerId: "mestre", rollId: "r-fraud" });
  const tampered = new Uint8Array(offerA.seedBytes);
  tampered[0] ^= 0xff;
  const res = await resolveFairplayRoll({
    rollId: "r-fraud",
    sides: 20,
    participants: [{ ...offerA, seedBytes: tampered }, offerB],
  });
  assert.equal(res.ok, false);
  assert.equal(res.verified, false);
  assert.match(res.error, /inválida/i);
});

test("subversus fairplay: resiste a Last Revealer Attack recuperando semente via Shamir", async () => {
  const offerA = await createFairplayRollOffer({ peerId: "gareth", rollId: "r-abort", threshold: 3, totalPeers: 4 });
  const offerB = await createFairplayRollOffer({ peerId: "mestre", rollId: "r-abort", threshold: 3, totalPeers: 4 });
  const abortedA = {
    peerId: "gareth",
    aborted: true,
    commitO: offerA.commitO,
    threshold: 3,
    backupShares: offerA.backupShares.slice(0, 3),
  };
  const res = await resolveFairplayRoll({ rollId: "r-abort", sides: 20, participants: [abortedA, offerB] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.recoveredPeerIds, ["gareth"]);
  assert.match(formatFairplayBadge(res).title, /recuperação automática/i);
});

test("subversus schema & zero-spoiler: FloorDoc retrocompatível e oculta volumes/portals da camada GM", () => {
  const floor = createFloorDoc({
    z: -1,
    name: "Subsolo",
    walls: [createWallDoc({ wallId: "w1", x1: 1, y1: 1, x2: 5, y2: 1, height: 2.6 })],
    volumes: [
      createVolumeDoc({ volumeId: "v-pub", shape: "box", x: 3, y: 3, layer: "player" }),
      createVolumeDoc({ volumeId: "v-gm", shape: "ramp", x: 4, y: 4, layer: "gm" }),
    ],
    portals: [
      createPortalDoc({ portalId: "p-pub", x: 2, y: 2, targetSceneId: "taverna", layer: "player" }),
      createPortalDoc({ portalId: "p-gm", x: 6, y: 6, targetSceneId: "cripta-oculta", layer: "gm" }),
    ],
  });
  const tok = createTokenDoc({ name: "Gareth", elevation: 1.5, display: "standee" });
  assert.equal(floor.z, -1);
  assert.equal(floor.diorama.ambient, "dungeon");
  assert.equal(tok.elevation, 1.5);
  assert.equal(tok.display, "standee");

  const projected = projectTacticsFloorForPlayer(floor);
  assert.deepEqual(projected.volumes.map((v) => v.volumeId), ["v-pub"]);
  assert.deepEqual(projected.portals.map((p) => p.portalId), ["p-pub"]);
});
