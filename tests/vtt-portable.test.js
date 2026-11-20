/**
 * Mesa Soberana E1 — testes de `.voxrpg.zip` (STORE) e backup cifrado (`vtt-portable.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  VOXRPG_ENCRYPTED_KIND,
  decodeZipStore,
  encodeZipStore,
  packEncryptedVoxRpg,
  packVoxRpg,
  unpackEncryptedVoxRpg,
  unpackVoxRpg,
} from "../client/js/dungeon/vtt-portable.js";
import { createCampaign, createNoteDoc } from "../client/js/dungeon/vtt-schema.js";

const PASS = "minha senha soberana vtt 2026";

test("vtt-portable: roundtrip .voxrpg.zip preserva campanha, blobs e estrutura Vault Obsidian", async () => {
  const note = createNoteDoc({ id: "ermitao", title: "Ermitão", publicMarkdown: "Vive em [[Vila Nova]].", gmSecretMarkdown: "Segredo oculto" });
  const camp = createCampaign({ id: "mesa-alpha", name: "Mesa Alpha", notesById: { ermitao: note } });
  const fakeImg = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const blobs = new Map([["aabbcc11", fakeImg]]);

  const zip = await packVoxRpg(camp, blobs, { includeGmSecrets: true });
  const out = await unpackVoxRpg(zip);
  assert.equal(out.campaign.id, "mesa-alpha");
  assert.equal(out.campaign.name, "Mesa Alpha");
  assert.deepEqual(out.blobs.get("aabbcc11"), fakeImg);
  assert.ok(out.markdownFiles.has("fichas/lyra.md"));
  assert.ok(out.markdownFiles.has("notas/ermitao.md"));
  assert.ok(out.markdownFiles.has("sessoes/cronica.md"));
  assert.ok(out.markdownFiles.get("notas/ermitao.md").includes("%%Segredo oculto%%"));

  const pubZip = await packVoxRpg(camp, blobs, { includeGmSecrets: false });
  const pubOut = await unpackVoxRpg(pubZip);
  assert.ok(!pubOut.markdownFiles.get("notas/ermitao.md").includes("Segredo oculto"));
});

test("vtt-portable: rejeita manifest com hash adulterado, CRC corrompido e path traversal (INV-4/INV-6)", async () => {
  const camp = createCampaign({ id: "mesa-check", name: "Mesa Check" });
  const zip = await packVoxRpg(camp);
  const files = decodeZipStore(zip);
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
  manifest.files["campaign.json"] = "0".repeat(64);
  files.set("manifest.json", new TextEncoder().encode(JSON.stringify(manifest)));
  const tampered = encodeZipStore([...files.entries()].map(([name, data]) => ({ name, data })));
  await assert.rejects(() => unpackVoxRpg(tampered), /SHA-256 inválido/i);

  const flipped = new Uint8Array(zip);
  flipped[60] ^= 0xff;
  assert.throws(() => decodeZipStore(flipped), /CRC32|inválido|corrompido/i);
  assert.throws(() => encodeZipStore([{ name: "../fora.txt", data: "x" }]), /Caminho inválido/i);
  assert.throws(() => decodeZipStore(new Uint8Array([1, 2, 3])), /truncado|inválido/i);
});

test("vtt-portable: backup cifrado com Senha Soberana abre com a senha certa e recusa senha errada", async () => {
  const camp = createCampaign({ id: "mesa-sec", name: "Mesa Secreta" });
  await assert.rejects(() => packEncryptedVoxRpg(camp, "curta"), /12 caracteres/i);
  const enc = await packEncryptedVoxRpg(camp, PASS);
  const parsed = JSON.parse(enc);
  assert.equal(parsed.kind, VOXRPG_ENCRYPTED_KIND);
  assert.ok(!enc.includes("Mesa Secreta"), "conteúdo cifrado não vaza em claro");

  const opened = await unpackEncryptedVoxRpg(enc, PASS);
  assert.equal(opened.campaign.id, "mesa-sec");
  assert.equal(opened.campaign.name, "Mesa Secreta");
  await assert.rejects(() => unpackEncryptedVoxRpg(enc, "outra senha bem diferente"));
});
