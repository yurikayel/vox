import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const ics = await import("../client/js/aviso-ics.js");
const view = await import("../client/js/render/aviso.js");
const share = await import("../client/js/share.js");

const MOCK_DATE = Date.UTC(2026, 10, 22, 10, 0, 0);

test("formatIcsUtc — formata timestamps válidos e rejeita inválidos", () => {
  assert.equal(ics.formatIcsUtc(MOCK_DATE), "20261122T100000Z");
  assert.equal(ics.formatIcsUtc("1763805600000"), "20251122T100000Z");
  assert.equal(ics.formatIcsUtc(0), "");
  assert.equal(ics.formatIcsUtc(-100), "");
  assert.equal(ics.formatIcsUtc(NaN), "");
  assert.equal(ics.formatIcsUtc(null), "");
  assert.equal(ics.formatIcsUtc("invalido"), "");
});

test("escapeIcsText — escapa caracteres especiais conforme RFC 5545 §3.3.11", () => {
  assert.equal(ics.escapeIcsText("Simples"), "Simples");
  assert.equal(ics.escapeIcsText("Barra \\ e vírgula, e ponto;"), "Barra \\\\ e vírgula\\, e ponto\\;");
  assert.equal(ics.escapeIcsText("Linha 1\nLinha 2\r\nLinha 3"), "Linha 1\\nLinha 2\\nLinha 3");
  assert.equal(ics.escapeIcsText(null), "");
  assert.equal(ics.escapeIcsText(undefined), "");
});

test("foldIcsLine — não dobra linhas curtas e divide linhas longas em 75 chars", () => {
  const shortLine = "SUMMARY:Reunião de moradores";
  assert.equal(ics.foldIcsLine(shortLine), shortLine);
  const longLine = "DESCRIPTION:" + "a".repeat(100);
  const folded = ics.foldIcsLine(longLine);
  assert.ok(folded.includes("\r\n "));
  const lines = folded.split("\r\n");
  assert.equal(lines[0].length, 75);
  assert.ok(lines[1].startsWith(" "));
  assert.equal(folded.replaceAll("\r\n ", ""), longLine);
  assert.equal(ics.foldIcsLine(""), "");
});

test("icsDownloadFilename — gera slugs seguros terminados em .ics", () => {
  assert.equal(ics.icsDownloadFilename({ title: "Assembleia Geral da Vila!" }), "assembleia-geral-da-vila.ics");
  assert.equal(ics.icsDownloadFilename({ aviso: { title: "Mutirão na Praça" } }), "mutirao-na-praca.ics");
  assert.equal(ics.icsDownloadFilename({ id: "avi_123" }), "avi_123.ics");
  assert.equal(ics.icsDownloadFilename({}), "evento.ics");
  assert.equal(ics.icsDownloadFilename(null), "evento.ics");
});

test("buildAvisoIcs — gera VCALENDAR e VEVENT completos com UID estável", () => {
  const item = {
    id: "avi_xyz",
    title: "Encontro dos Moradores",
    body: "Pauta importante sobre água e luz",
    eventAt: MOCK_DATE,
    eventPlace: "Salão Comunitário",
  };
  const content = ics.buildAvisoIcs(item, { nowMs: MOCK_DATE, url: "https://vox.local/#/c/vila" });
  assert.ok(content.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(content.endsWith("END:VCALENDAR\r\n"));
  assert.ok(content.includes("PRODID:-//Vox//Agenda Comunidade//PT-BR\r\n"));
  assert.ok(content.includes("METHOD:PUBLISH\r\n"));
  assert.ok(content.includes("UID:avi_xyz@vox\r\n"));
  assert.ok(content.includes("DTSTART:20261122T100000Z\r\n"));
  assert.ok(content.includes("DTEND:20261122T110000Z\r\n"));
  assert.ok(content.includes("SUMMARY:Encontro dos Moradores\r\n"));
  assert.ok(content.includes("DESCRIPTION:Pauta importante sobre água e luz\r\n"));
  assert.ok(content.includes("LOCATION:Salão Comunitário\r\n"));
  assert.ok(content.includes("URL:https://vox.local/#/c/vila\r\n"));
});

test("buildAvisoIcs — aceita objeto aninhado e retorna vazio para data inválida", () => {
  const nested = { aviso: { id: "avi_nested", title: "Roda", eventAt: MOCK_DATE } };
  const ok = ics.buildAvisoIcs(nested, { durationMs: 7200000, nowMs: MOCK_DATE });
  assert.ok(ok.includes("UID:avi_nested@vox\r\n"));
  assert.ok(ok.includes("DTEND:20261122T120000Z\r\n"));
  assert.equal(ics.buildAvisoIcs({ id: "a1", eventAt: 0 }), "");
  assert.equal(ics.buildAvisoIcs({ id: "a1", eventAt: NaN }), "");
  assert.equal(ics.buildAvisoIcs(null), "");
});

test("renderAvisoCard — renderiza botão .btn-aviso-ics apenas quando há eventAt", () => {
  const comData = {
    aviso: { id: "a1", title: "Mutirão", eventAt: MOCK_DATE, avisoKind: "convocacao", avisoState: "ativo" },
    code: "CODE1",
  };
  const htmlCom = view.renderAvisoCard(comData);
  assert.ok(htmlCom.includes('class="btn btn-sm btn-outline btn-aviso-ics" data-id="a1"'));
  assert.ok(htmlCom.includes("📅 Agenda (.ics)"));

  const semData = {
    aviso: { id: "a2", title: "Informe geral", avisoKind: "informe", avisoState: "ativo" },
    code: "CODE2",
  };
  const htmlSem = view.renderAvisoCard(semData);
  assert.ok(!htmlSem.includes("btn-aviso-ics"));
});

test("share.downloadBlob — dispara clique de download com URL temporária do Blob", () => {
  const item = { id: "a1", title: "Assembleia", eventAt: MOCK_DATE };
  const content = ics.buildAvisoIcs(item);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  let clicked = false;
  let downloadedName = "";
  let objectUrlCreated = "";
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const prevDoc = globalThis.document;

  URL.createObjectURL = () => {
    objectUrlCreated = "blob:test-ics";
    return objectUrlCreated;
  };
  URL.revokeObjectURL = () => {};

  globalThis.document = {
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      click: () => { clicked = true; },
      set href(v) { this._href = v; },
      get href() { return this._href; },
      set download(v) { downloadedName = v; },
      get download() { return downloadedName; },
    }),
  };

  share.downloadBlob(blob, ics.icsDownloadFilename(item));

  assert.equal(clicked, true);
  assert.equal(downloadedName, "assembleia.ics");
  assert.equal(objectUrlCreated, "blob:test-ics");

  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
  if (prevDoc) {
    globalThis.document = prevDoc;
  } else {
    delete globalThis.document;
  }
});
