/**
 * EXP-04 — Testes do exportador autônomo de backup HTML offline (`scripts/export-html-backup.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  escapeHtml,
  parseBackupBundle,
  renderStandaloneBackupHtml,
  sanitizeSafeImageDataUrl,
  verifyBundleStats,
} from "../scripts/export-html-backup.mjs";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/export-html-backup.mjs");

function makeRealOwnPostsBundle() {
  return {
    type: "vox-meus-posts",
    v: 1,
    author: "vx_autora_123",
    exportedAt: 1730000000000,
    count: 2,
    entries: [
      {
        post: {
          id: "t_antigo",
          type: "topic",
          communityId: "geral",
          title: "Post antigo",
          body: "Primeiro parágrafo\n\nSegundo parágrafo",
          author: "vx_autora_123",
          ts: 1710000000000,
          sigv: 2,
          sig: "sig_antiga_abcdef1234567890",
        },
        blob: null,
      },
      {
        post: {
          id: "t_foto",
          type: "topic",
          communityId: "bairro",
          title: "Mutirão com foto",
          body: "Domingo às 9h",
          author: "vx_autora_123",
          authorDisplay: "Ana",
          ts: 1720000000000,
          mediaHash: "hash_png_01",
          mediaRef: { hash: "hash_png_01", mime: "image/png", byteLength: 68 },
          sigv: 2,
          sig: "sig_recente_0987654321fedcba",
        },
        blob: { hash: "hash_png_01", mime: "image/png", byteLength: 68, data: PNG_DATA_URL },
      },
    ],
  };
}

test("EXP-04: parseBackupBundle e renderStandaloneBackupHtml suportam esquema real own-posts em ordem reversa", () => {
  const bundle = parseBackupBundle(JSON.stringify(makeRealOwnPostsBundle()));
  assert.equal(bundle.author, "vx_autora_123");
  assert.equal(bundle.posts.length, 2);
  assert.equal(bundle.media.hash_png_01, PNG_DATA_URL);

  const stats = verifyBundleStats(bundle);
  assert.deepEqual(stats, { postCount: 2, signedCount: 2, mediaCount: 1, missingMediaRefs: 0 });

  const html = renderStandaloneBackupHtml(bundle);
  assert.match(html, /<html lang="pt-BR">/);
  assert.ok(html.indexOf("Mutirão com foto") < html.indexOf("Post antigo"), "ordem cronológica reversa");
  assert.ok(html.includes(`<img src="${PNG_DATA_URL}"`), "imagem raster segura preservada");
  assert.ok(html.includes("<p>Primeiro parágrafo</p>\n<p>Segundo parágrafo</p>"));
  assert.ok(html.includes("sig_recente_0987654321fedcba"));
});

test("EXP-04: escapeHtml e renderStandaloneBackupHtml neutralizam payloads XSS em todos os campos", () => {
  assert.equal(escapeHtml(`<script>"'&`), "&lt;script&gt;&quot;&#39;&amp;");
  const xssPayload = {
    type: "vox-meus-posts",
    v: 1,
    author: `" onclick="alert(1)`,
    entries: [
      {
        post: {
          id: `id_<script>alert(1)</script>`,
          title: `<img src=x onerror=alert(1)>`,
          body: `<script>evil()</script>\n\n" onmouseover="pwn()`,
          communityId: `<svg onload=alert(1)>`,
          ts: 1720000000000,
          sig: `sig_" onclick="x()`,
          sigv: 2,
        },
        blob: null,
      },
    ],
  };
  const html = renderStandaloneBackupHtml(parseBackupBundle(JSON.stringify(xssPayload)));
  assert.equal(/<script/i.test(html), false, "zero tags <script> no HTML");
  assert.equal(/<img\b[^>]*onerror=/i.test(html), false, "payload <img onerror=...> escapado");
  assert.equal(/" onclick=/i.test(html), false, "atributo onclick escapado");
  assert.ok(html.includes("&lt;script&gt;evil()&lt;/script&gt;"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("EXP-04: sanitizeSafeImageDataUrl aceita apenas raster base64 e bloqueia SVG/HTML/JS/HTTPS", () => {
  assert.equal(sanitizeSafeImageDataUrl(PNG_DATA_URL), PNG_DATA_URL);
  assert.equal(sanitizeSafeImageDataUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(sanitizeSafeImageDataUrl("data:image/webp;base64,UklGRg=="), "data:image/webp;base64,UklGRg==");
  assert.equal(sanitizeSafeImageDataUrl("data:image/gif;base64,R0lGODlh"), "data:image/gif;base64,R0lGODlh");

  for (const bad of [
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "javascript:alert(1)",
    "https://example.com/tracker.png",
    "http://localhost:8080/img.png",
    "data:image/png;base64,",
  ]) {
    assert.equal(sanitizeSafeImageDataUrl(bad), null, `deve rejeitar ${bad}`);
  }
});

test("EXP-04: HTML contém CSP estrita e rejeita mídia insegura no bundle", () => {
  const bundle = parseBackupBundle({
    version: 1,
    address: "vx_compat",
    posts: [{ id: "p1", title: "Teste", text: "Corpo", timestamp: 1720000000000, mediaHash: "h_svg" }],
    media: { h_svg: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
  });
  assert.deepEqual(verifyBundleStats(bundle), { postCount: 1, signedCount: 0, mediaCount: 0, missingMediaRefs: 1 });
  const html = renderStandaloneBackupHtml(bundle);
  assert.ok(
    html.includes('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;">')
  );
  assert.equal(html.includes("data:image/svg+xml"), false);
  assert.ok(html.includes("Mídia não incluída ou rejeitada"));
});

test("EXP-04: lida com array de posts vazio/ausente e rejeita entradas malformadas", () => {
  const emptyEntries = parseBackupBundle(JSON.stringify({ type: "vox-meus-posts", author: "vx_vazio", entries: [] }));
  assert.equal(emptyEntries.posts.length, 0);
  assert.ok(renderStandaloneBackupHtml(emptyEntries).includes("Nenhuma publicação encontrada"));

  const omittedEntries = parseBackupBundle(JSON.stringify({ type: "vox-meus-posts", author: "vx_sem_lista" }));
  assert.equal(omittedEntries.posts.length, 0);

  for (const bad of ["", "{nao-e-json", "[]", "null", "{}", JSON.stringify({ author: "vx_1", entries: "bad" })]) {
    assert.throws(() => parseBackupBundle(bad));
  }
});

test("EXP-04: CLI ponta a ponta (--verify e --input/--output) com limpeza em tmpdir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-exp04-"));
  try {
    const inFile = path.join(dir, "backup.json");
    const outFile = path.join(dir, "archive.html");
    fs.writeFileSync(inFile, JSON.stringify(makeRealOwnPostsBundle()), "utf8");

    const verifyOut = execFileSync(process.execPath, [SCRIPT_PATH, "--input", inFile, "--verify"], { encoding: "utf8" });
    assert.ok(verifyOut.includes('"postCount":2'));
    assert.ok(verifyOut.includes('"mediaCount":1'));
    assert.equal(fs.existsSync(outFile), false, "--verify sem --output não grava arquivo");

    execFileSync(process.execPath, [SCRIPT_PATH, "--input", inFile, "--output", outFile], { encoding: "utf8" });
    const html = fs.readFileSync(outFile, "utf8");
    assert.ok(html.includes("Arquivo Offline Vox — Meus Posts"));
    assert.equal(/<script/i.test(html), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
