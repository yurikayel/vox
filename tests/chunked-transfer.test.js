import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as chunkedTransfer from "../client/js/chunked-transfer.js";

test("chunked-transfer - fatiamento de payload pequeno resulta em chunk único", () => {
  const payload = "Pequena mensagem cívica";
  const chunks = chunkedTransfer.slicePayloadIntoChunks(payload, 1024, "xfer_small");

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].transferId, "xfer_small");
  assert.equal(chunks[0].index, 0);
  assert.equal(chunks[0].total, 1);
  assert.equal(chunks[0].data, payload);
  assert.ok(chunks[0].checksum > 0);
});

test("chunked-transfer - fatiamento de payload grande (> 40 KiB) e remontagem", () => {
  const bigPayload = "A".repeat(45000); // 45 KB
  const chunkSize = 16 * 1024; // 16 KB chunks -> 3 chunks
  const chunks = chunkedTransfer.slicePayloadIntoChunks(bigPayload, chunkSize, "xfer_big");

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].data.length, 16384);
  assert.equal(chunks[1].data.length, 16384);
  assert.equal(chunks[2].data.length, 45000 - 32768);

  const reassembler = new chunkedTransfer.ChunkReassembler();

  const r1 = reassembler.addChunk(chunks[0]);
  assert.equal(r1.complete, false);
  assert.ok(r1.progress > 0 && r1.progress < 1);

  const r2 = reassembler.addChunk(chunks[1]);
  assert.equal(r2.complete, false);

  const r3 = reassembler.addChunk(chunks[2]);
  assert.equal(r3.complete, true);
  assert.equal(r3.payload, bigPayload);
});

test("chunked-transfer - remontagem fora de ordem e rastreamento de fatias faltantes", () => {
  const payload = "B".repeat(50000);
  const chunks = chunkedTransfer.slicePayloadIntoChunks(payload, 10000, "xfer_unordered");
  assert.equal(chunks.length, 5);

  const reassembler = new chunkedTransfer.ChunkReassembler();

  reassembler.addChunk(chunks[0]);
  reassembler.addChunk(chunks[3]);
  reassembler.addChunk(chunks[4]);

  const missing = reassembler.getMissingIndices("xfer_unordered");
  assert.deepEqual(missing, [1, 2]);

  reassembler.addChunk(chunks[2]);
  const rFinal = reassembler.addChunk(chunks[1]);

  assert.equal(rFinal.complete, true);
  assert.equal(rFinal.payload, payload);
});

test("chunked-transfer - detecta e rejeita adulteração de checksum", () => {
  const payload = "Dados invioláveis";
  const chunks = chunkedTransfer.slicePayloadIntoChunks(payload, 500);

  const tamperedChunk = { ...chunks[0], data: "Dados corrompidos" };
  const reassembler = new chunkedTransfer.ChunkReassembler();
  const res = reassembler.addChunk(tamperedChunk);

  assert.equal(res.valid, false);
  assert.match(res.error, /Checksum/);
});

test("chunked-transfer - despacho com backpressure emula dreno do buffer", async () => {
  const sentMessages = [];
  const mockChannel = {
    bufferedAmount: 80000, // Acima do limite de 64 KiB
    send(msg) {
      sentMessages.push(msg);
    },
  };

  // Simula esvaziamento assíncrono do buffer após 30ms
  setTimeout(() => {
    mockChannel.bufferedAmount = 10000;
  }, 30);

  const chunks = chunkedTransfer.slicePayloadIntoChunks("Mensagem rápida", 100);
  let progressCalls = 0;

  const ok = await chunkedTransfer.sendChunksWithBackpressure(mockChannel, chunks, () => {
    progressCalls++;
  });

  assert.equal(ok, true);
  assert.equal(sentMessages.length, chunks.length);
  assert.equal(progressCalls, chunks.length);
});
