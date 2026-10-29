import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as notary from "../client/js/perma-notary.js";

const SAMPLE_ATA_TEXT = `Resumo da reunião – Comitê Popular de Tecnologia (28/10)
Quatro princípios:
1. Denunciar as Big Techs
2. Não enfrentar o inimigo com as armas dele: construir software soberano
3. Não abandonar trabalho de base
4. Apoiar Lula no defensável e ir além`;

test("perma-notary: canonicalizeDocumentText normaliza CRLF e espaços", () => {
  const t1 = "Linha 1\r\nLinha 2\r\n  ";
  const t2 = "Linha 1\nLinha 2";
  assert.equal(notary.canonicalizeDocumentText(t1), t2);
});

test("perma-notary: createCivicNotaryRecord gera registro determinístico", async () => {
  const record = await notary.createCivicNotaryRecord({
    title: "Ata Plenária Outubro",
    bodyText: SAMPLE_ATA_TEXT,
    author: "vx_raul",
    communityId: "cplt",
    witnesses: ["vx_maria", "vx_tiago", "vx_maria"], // deduplica
  });

  assert.equal(record.protocol, "vox-notary-v1");
  assert.equal(record.type, "civic-notary-record");
  assert.equal(typeof record.documentHash, "string");
  assert.equal(record.documentHash.length, 64);
  assert.equal(record.witnessCount, 2);
  assert.equal(record.communityId, "cplt");
  assert.ok(record.byteLength > 0);
  assert.ok(record.arweaveTags.some((t) => t.name === "Document-Hash" && t.value === record.documentHash));
});

test("perma-notary: verifyCivicNotaryRecord detecta integridade e adulteração", async () => {
  const record = await notary.createCivicNotaryRecord({
    title: "Ata Plenária",
    bodyText: SAMPLE_ATA_TEXT,
    author: "vx_raul",
  });

  // Verificação de texto idêntico
  const validCheck = await notary.verifyCivicNotaryRecord(record, SAMPLE_ATA_TEXT);
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.computedHash, record.documentHash);

  // Verificação com texto adulterado (uma palavra trocada)
  const tamperedText = SAMPLE_ATA_TEXT.replace("Big Techs", "Plataformas Digitais");
  const invalidCheck = await notary.verifyCivicNotaryRecord(record, tamperedText);
  assert.equal(invalidCheck.isValid, false);
  assert.notEqual(invalidCheck.computedHash, record.documentHash);
  assert.ok(invalidCheck.reason.includes("adulterado"));
});

test("perma-notary: renderNotaryBadgeHtml renderiza selo de cartório cívico", async () => {
  const record = await notary.createCivicNotaryRecord({
    title: "Ata Teste",
    bodyText: "Decisão aprovada por unanimidade",
    author: "vx_secretario",
    witnesses: ["vx_w1"],
  });

  const html = notary.renderNotaryBadgeHtml(record);
  assert.ok(html.includes("Ata Cívica Imutável"));
  assert.ok(html.includes("Arweave Free"));
  assert.ok(html.includes("sha256:"));
  assert.ok(html.includes("1 testemunhas"));
});
