/**
 * PM-105 — Testes do construtor e validador CLI de links canônicos de retorno POSSE.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditShareBatch,
  buildCanonicalReturnUrl,
  runCli,
  stripTrackingParams,
  validateReturnUrl,
} from "../scripts/posse-return-check.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/posse-return-check.mjs");

test("PM-105: constrói e valida URLs canônicas sem e com communityId", () => {
  const plain = buildCanonicalReturnUrl({ baseUrl: "https://vox.example/vox", topicId: "top_abc123" });
  assert.equal(plain, "https://vox.example/vox/#/t/top_abc123");
  assert.deepEqual(validateReturnUrl(plain), {
    ok: true,
    topicId: "top_abc123",
    normalizedUrl: "https://vox.example/vox/#/t/top_abc123",
  });

  const scoped = buildCanonicalReturnUrl({
    baseUrl: "https://vox.example/",
    topicId: "top_xyz-99",
    communityId: "feira_centro",
  });
  assert.equal(scoped, "https://vox.example/#/c/feira_centro/t/top_xyz-99");
  assert.deepEqual(validateReturnUrl(scoped), {
    ok: true,
    topicId: "top_xyz-99",
    communityId: "feira_centro",
    normalizedUrl: "https://vox.example/#/c/feira_centro/t/top_xyz-99",
  });

  const local = buildCanonicalReturnUrl({ baseUrl: "http://127.0.0.1:8080", topicId: "top_local1" });
  assert.equal(local, "http://127.0.0.1:8080/#/t/top_local1");
  assert.equal(validateReturnUrl(local).ok, true);
  assert.equal(validateReturnUrl("http://localhost:3000/#/t/top_local2").ok, true);
});

test("PM-105: rejeita esquemas perigosos, HTTP remoto e credenciais embutidas", () => {
  const badUrls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://evil.com/#/t/top_abc123",
    "https://user:secret@vox.example/#/t/top_abc123",
    "https://onlyuser@vox.example/#/t/top_abc123",
    "",
    "not-a-url",
  ];
  for (const url of badUrls) {
    const res = validateReturnUrl(url);
    assert.equal(res.ok, false, `esperava rejeição para ${url}`);
    assert.ok(res.reason);
  }
  assert.throws(() => buildCanonicalReturnUrl({ baseUrl: "http://evil.com", topicId: "top_123" }), TypeError);
  assert.throws(() => buildCanonicalReturnUrl({ baseUrl: "https://u:p@vox.example", topicId: "top_123" }), TypeError);
});

test("PM-105: rejeita traversal, IDs fora do padrão e rotas inválidas", () => {
  const invalidRoutes = [
    "https://vox.example/#/t/../etc/passwd",
    "https://vox.example/#/t/%2e%2e",
    "https://vox.example/#/t/ab",
    "https://vox.example/#/t/__proto__",
    "https://vox.example/#/c/constructor/t/top_123",
    "https://vox.example/#/c/com_1/x/top_123",
    "https://vox.example/t/top_123",
  ];
  for (const url of invalidRoutes) {
    assert.equal(validateReturnUrl(url).ok, false, `esperava rejeição para ${url}`);
  }
  assert.throws(() => buildCanonicalReturnUrl({ baseUrl: "https://vox.example", topicId: "../bad" }), RangeError);
  assert.throws(() => buildCanonicalReturnUrl({ baseUrl: "https://vox.example", topicId: "top_123", communityId: "x" }), RangeError);
});

test("PM-105: detecta e remove parâmetros de rastreamento via URLSearchParams", () => {
  const tracked = "https://vox.example/?utm_source=whatsapp&fbclid=fb1&gclid=gc1&si=share1&ref=blog#/t/top_abc123";
  const verdict = validateReturnUrl(tracked);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /rastreamento/i);

  const trackedHash = "https://vox.example/#/t/top_abc123?utm_medium=social&ref=x";
  assert.equal(validateReturnUrl(trackedHash).ok, false);

  const cleaned = stripTrackingParams(tracked);
  assert.equal(cleaned, "https://vox.example/#/t/top_abc123");
  assert.equal(validateReturnUrl(cleaned).ok, true);

  const cleanedHash = stripTrackingParams("https://vox.example/?keep=1&utm_campaign=c#/t/top_abc123?si=99&ok=2");
  assert.equal(cleanedHash, "https://vox.example/?keep=1#/t/top_abc123?ok=2");
});

test("PM-105: aplica allowlist de hosts e audita lote com stripTracking", () => {
  const allow = ["vox.example", "127.0.0.1:8080"];
  assert.equal(validateReturnUrl("https://vox.example/#/t/top_123", allow).ok, true);
  assert.equal(validateReturnUrl("http://127.0.0.1:8080/#/t/top_123", allow).ok, true);
  const denied = validateReturnUrl("https://attacker.example/#/t/top_123", allow);
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /Host não autorizado/);

  const batch = auditShareBatch(
    ["https://vox.example/?utm_source=x#/t/top_123", "https://attacker.example/#/t/top_123"],
    { allowedHosts: allow, stripTracking: true },
  );
  assert.equal(batch.total, 2);
  assert.equal(batch.validCount, 1);
  assert.equal(batch.invalidCount, 1);
  assert.equal(batch.allValid, false);
});

test("PM-105: CLI executa roundtrip em os.tmpdir() e falha em entrada ausente ou links inválidos", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm105-"));
  const inputPath = path.join(tmpDir, "links.json");
  const outPath = path.join(tmpDir, "audit.json");
  try {
    fs.writeFileSync(
      inputPath,
      JSON.stringify({
        allowedHosts: ["vox.example"],
        urls: ["https://vox.example/#/t/top_ok1", "https://vox.example/#/c/com_1/t/top_ok2"],
      }),
      "utf8",
    );
    execFileSync(process.execPath, [SCRIPT_PATH, "--input", inputPath, "--json", "--out", outPath], { encoding: "utf8" });
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    assert.equal(parsed.allValid, true);
    assert.equal(parsed.validCount, 2);

    const res = runCli(["--input", inputPath, "--json"]);
    assert.equal(res.report.total, 2);
    assert.throws(() => runCli(["--input", path.join(tmpDir, "missing.json")]), /Não foi possível ler/);

    fs.writeFileSync(inputPath, JSON.stringify(["javascript:alert(1)"]), "utf8");
    assert.throws(() => execFileSync(process.execPath, [SCRIPT_PATH, "--input", inputPath], { encoding: "utf8" }));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
