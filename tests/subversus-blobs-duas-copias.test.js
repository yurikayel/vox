/**
 * @file A regra de quais campos de uma campanha apontam para um blob existe em duas cópias: `referencedBlobHashes`
 * (exportação, `vtt-portable.js`) e a privada de `vtt-sync.js`. Este teste as amarra pela API pública: o jogador que
 * recebe o estado do Mestre pede (WANT_BLOB) exatamente os hashes que a regra do sync enxerga, e esses têm de ser
 * os mesmos que a exportação empacota. Acrescentar um campo em só uma das cópias derruba por assert.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { referencedBlobHashes } from "../client/js/dungeon/vtt-portable.js";
import { generateRoomKey, generateVttKeypair } from "../client/js/dungeon/vtt-sync-codec.js";
import { createInMemorySyncHub, createVttSyncPeer } from "../client/js/dungeon/vtt-sync.js";
import { settlePeers } from "./helpers/wait-until.js";

const ID = "mesa-blobs";

/** Campos que a regra de hoje usa e nomes plausíveis de campos novos; cada nome recebe um hash próprio em cada nível. */
const CAMPOS = ["mapBlobHash", "avatarBlobHash", "portraitBlobHash", "iconBlobHash", "imageBlobHash", "bgBlobHash"];

/** Preenche todos os `CAMPOS` do objeto com hashes `<prefixo>-<campo>`, para que qualquer campo lido apareça. */
function comTodosOsCampos(obj, prefixo) {
  for (const campo of CAMPOS) obj[campo] = `${prefixo}-${campo}`;
  return obj;
}

/** Campanha de exemplo: `forma` decide quantas cenas, pisos e tokens e se cada um traz todos os campos. */
function campanha({ cenas, pisos, tokens, gmRouteId }) {
  const doc = createCampaign({ id: ID, name: "Mesa", gmRouteId });
  doc.scenesById = {};
  for (let s = 0; s < cenas; s += 1) {
    const cena = comTodosOsCampos({ sceneId: `cena-${s}`, name: `Cena ${s}`, floors: [], tokens: [] }, `c${s}`);
    for (let p = 0; p < pisos; p += 1) cena.floors.push(comTodosOsCampos({ z: p }, `c${s}p${p}`));
    for (let t = 0; t < tokens; t += 1) cena.tokens.push(comTodosOsCampos({ tokenId: `t${s}${t}`, layer: "player", floorZ: 0, x: 1, y: 1 }, `c${s}t${t}`));
    doc.scenesById[cena.sceneId] = cena;
  }
  doc.activeSceneId = cenas ? "cena-0" : doc.activeSceneId;
  return doc;
}

const FORMAS = [
  { cenas: 0, pisos: 0, tokens: 0 },
  { cenas: 1, pisos: 1, tokens: 0 },
  { cenas: 1, pisos: 0, tokens: 2 },
  { cenas: 2, pisos: 2, tokens: 3 },
];

/** Mesa mínima: um jogador sem nenhum blob recebe o snapshot do Mestre e devolve os hashes que pediu. */
async function hashesPedidosPeloJogador(doc, gm) {
  const [player, hub, roomKey] = [await generateVttKeypair(), createInMemorySyncHub(), generateRoomKey()];
  const store = createVttStore(createMemoryVttBackend());
  const peer = createVttSyncPeer({ role: "player", campaignId: ID, keypair: player, store, transport: hub.connect(player.routeId), roomKey, gmRouteId: gm.routeId });
  const pedidos = [];
  const fromGm = hub.connect(gm.routeId);
  fromGm.onMessage((m) => { if (m.kind === "WANT_BLOB") pedidos.push(m.sha256); });
  fromGm.send(player.routeId, { kind: "SNAPSHOT_FILTERED", roomKey, campaign: doc, fairplayOps: [] });
  await settlePeers(peer);
  const salvo = await store.loadCampaign(ID);
  peer.close();
  return { pedidos: new Set(pedidos), salvo };
}

test("exportação e sync enxergam os mesmos hashes de blob, para campanhas de formas diferentes", async () => {
  const gm = await generateVttKeypair();
  for (const forma of FORMAS) {
    const { pedidos, salvo } = await hashesPedidosPeloJogador(campanha({ ...forma, gmRouteId: gm.routeId }), gm);
    const exportados = referencedBlobHashes(salvo);
    assert.deepEqual([...exportados].sort(), [...pedidos].sort(), JSON.stringify(forma));
  }
});

test("a amostra é útil: a campanha cheia chega ao jogador e gera um pedido por campo de blob que o esquema guarda", async () => {
  const gm = await generateVttKeypair();
  const { pedidos, salvo } = await hashesPedidosPeloJogador(campanha({ cenas: 2, pisos: 2, tokens: 3, gmRouteId: gm.routeId }), gm);
  assert.ok(pedidos.size >= 2 * (2 + 3), `2 cenas × (2 pisos + 3 tokens): ${[...pedidos].join(",")}`);
  assert.deepEqual([...new Set([...pedidos].map((h) => h.slice(0, 2)))].sort(), ["c0", "c1"], "as duas cenas chegam, não uma só");
  assert.ok([...pedidos].every((h) => h.endsWith("BlobHash")), "só campos de blob viram pedido");
  assert.equal(referencedBlobHashes(salvo).size, pedidos.size);
});
