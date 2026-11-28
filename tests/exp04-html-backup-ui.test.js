/**
 * EXP-04 — Testes do backup HTML standalone offline no cliente e controle na tela de rede.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHtmlBackupFilename,
  buildStandaloneHtmlBackup,
  escapeHtml,
  parseBackupBundle,
  renderStandaloneBackupHtml,
  sanitizeSafeImageDataUrl,
  verifyBundleStats,
} from "../client/js/export-html-backup.js";
import { renderStandaloneBackupHtml as renderCliHtml, parseBackupBundle as parseCliBundle } from "../scripts/export-html-backup.mjs";
import { renderHtmlBackupCard, renderNetworkSettings } from "../client/js/render/network.js";
import { bindHtmlBackupButton, exportHtmlBackupNow } from "../client/js/app/screens-network-view.js";
import { waitUntil } from "./helpers/wait-until.js";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function makeSampleBundle() {
  return {
    type: "vox-meus-posts",
    v: 1,
    author: "vx_autora_exp04",
    exportedAt: 1730000000000,
    count: 2,
    entries: [
      {
        post: {
          id: "t_antigo",
          type: "topic",
          communityId: "geral",
          title: "Post antigo",
          body: "Parágrafo 1\n\nParágrafo 2\nLinha 2",
          author: "vx_autora_exp04",
          ts: 1710000000000,
          editedAt: 1715000000000,
          deleted: true,
          sigv: 2,
          sig: "sig_antiga_1234567890abcdef",
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
          author: "vx_autora_exp04",
          authorDisplay: "Ana",
          ts: 1720000000000,
          mediaHash: "hash_png_01",
          mediaRef: { hash: "hash_png_01", mime: "image/png", byteLength: 68 },
          sigv: 2,
          sig: "sig_recente_abcdef1234567890",
        },
        blob: { hash: "hash_png_01", mime: "image/png", byteLength: 68, data: PNG_DATA_URL },
      },
    ],
  };
}

function mountBackupButton() {
  const btn = {
    disabled: false,
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => (id === "btn-export-html-backup" ? btn : null),
  };
  return {
    btn,
    restore() {
      globalThis.document = prevDoc;
    },
  };
}

test("EXP-04 cliente: paridade exata com scripts/export-html-backup.mjs e estrutura offline-forever", () => {
  const raw = JSON.stringify(makeSampleBundle());
  const clientHtml = renderStandaloneBackupHtml(parseBackupBundle(raw));
  const cliHtml = renderCliHtml(parseCliBundle(raw));

  assert.equal(clientHtml, cliHtml, "HTML do cliente deve espelhar o exportador CLI");
  assert.match(clientHtml, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">/);
  assert.match(clientHtml, /<style>[\s\S]*@media print[\s\S]*<\/style>/);
  assert.equal(/<script/i.test(clientHtml), false, "zero tags <script>");
  assert.equal(/<link\b/i.test(clientHtml), false, "zero <link> externo");
  assert.equal(/https?:\/\//i.test(clientHtml), false, "zero URLs externas/CDN");
  assert.ok(clientHtml.indexOf("Mutirão com foto") < clientHtml.indexOf("Post antigo"));
  assert.ok(clientHtml.includes(`<img src="${PNG_DATA_URL}"`));
});

function makeXssPayload() {
  return {
    type: "vox-meus-posts",
    v: 1,
    author: `" onclick="alert(1)`,
    posts: [
      {
        id: `id_<script>x()</script>`,
        title: `<img src=x onerror=alert(1)>`,
        text: `<script>evil()</script>\n\n" onmouseover="pwn()`,
        community: `<svg onload=alert(1)>`,
        timestamp: "2026-01-15T12:00:00Z",
        mediaHash: "h_bad",
      },
      { id: "p_inline", body: "", createdAt: "invalid-date", image: PNG_DATA_URL },
    ],
    media: {
      __proto__: PNG_DATA_URL,
      h_bad: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      h_ok: { url: PNG_DATA_URL },
      h_str: PNG_DATA_URL,
      h_empty: 123,
    },
  };
}

test("EXP-04 cliente: escapeHtml neutraliza XSS em todos os campos e bloqueia mídia insegura", () => {
  assert.equal(escapeHtml(`<script>"'&`), "&lt;script&gt;&quot;&#39;&amp;");
  assert.equal(sanitizeSafeImageDataUrl(null), null);
  assert.equal(sanitizeSafeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(sanitizeSafeImageDataUrl("https://evil.example/a.png"), null);
  assert.equal(sanitizeSafeImageDataUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeSafeImageDataUrl(PNG_DATA_URL), PNG_DATA_URL);

  const bundle = parseBackupBundle(`\uFEFF${JSON.stringify(makeXssPayload())}`);
  assert.deepEqual(verifyBundleStats(bundle), { postCount: 2, signedCount: 0, mediaCount: 2, missingMediaRefs: 1 });

  const html = renderStandaloneBackupHtml(bundle);
  assert.equal(/<script/i.test(html), false);
  assert.equal(/<img\b[^>]*onerror=/i.test(html), false);
  assert.equal(/" onclick=/i.test(html), false);
  assert.equal(html.includes("data:image/svg+xml"), false);
  assert.ok(html.includes("Mídia não incluída ou rejeitada"));
  assert.ok(html.includes("Sem texto."));
  assert.ok(html.includes("Data não informada"));
});

test("EXP-04 cliente: buildStandaloneHtmlBackup, casos vazios, autores por pubkey e erros de validação", () => {
  const fixedNow = Date.UTC(2026, 10, 24, 15, 0, 0);
  assert.equal(buildHtmlBackupFilename(fixedNow), "vox-backup-offline-2026-11-24.html");

  const built = buildStandaloneHtmlBackup(makeSampleBundle(), fixedNow);
  assert.equal(built.name, "vox-backup-offline-2026-11-24.html");
  assert.equal(built.stats.postCount, 2);
  assert.ok(built.html.includes("Arquivo Offline Vox — Meus Posts"));

  assert.ok(renderStandaloneBackupHtml(null).includes("Nenhuma publicação encontrada"));
  assert.ok(renderStandaloneBackupHtml({ posts: [], pubkey: "pk_str_123" }).includes("pk_str_123"));
  assert.ok(renderStandaloneBackupHtml({ posts: [], pubkey: { kty: "EC" } }).includes("Chave pública registrada"));
  assert.ok(renderStandaloneBackupHtml({ posts: [] }).includes("Autor não identificado"));

  for (const bad of [
    "",
    "{malformado",
    "[]",
    "null",
    "{}",
    { author: "vx_1", entries: "bad" },
    { author: "vx_1", posts: "bad" },
    { author: "vx_1", entries: [null] },
    { author: "vx_1", posts: [null] },
  ]) {
    assert.throws(() => parseBackupBundle(bad));
  }
});

test("EXP-04 UI: renderNetworkSettings inclui botão visível 'Baixar backup HTML (offline)'", () => {
  const cardHtml = renderHtmlBackupCard();
  assert.match(cardHtml, /id="btn-export-html-backup"/);
  assert.match(cardHtml, /Baixar backup HTML \(offline\)/);

  const main = { innerHTML: "" };
  renderNetworkSettings(main, { routeId: "vx_autora_exp04", inviteLink: "https://vox.local/#/connect/vx", settings: { enabled: true }, metrics: {} });
  assert.match(main.innerHTML, /id="btn-export-html-backup"/);
  assert.match(main.innerHTML, /Baixar backup HTML \(offline\)/);
});

test("EXP-04 UI: clique no botão gera download local HTML com zero chamadas de rede/upload", async () => {
  const prevFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("Rede não pode ser chamada durante backup HTML offline");
  };

  const dom = mountBackupButton();
  const downloads = [];
  const toasts = [];
  const fixedNow = Date.UTC(2026, 10, 24, 10, 0, 0);

  try {
    const bound = bindHtmlBackupButton({
      exportOwnPosts: async () => ({ count: 2, text: JSON.stringify(makeSampleBundle()), name: "vox-meus-posts.json" }),
      downloadBlob: (blob, name) => downloads.push({ blob, name }),
      showToast: (msg, type = "info") => toasts.push({ msg, type }),
      now: () => fixedNow,
    });
    assert.equal(bound, true);

    dom.btn.listeners.click();
    await waitUntil(() => dom.btn.disabled === false);

    assert.equal(fetchCalls, 0, "zero chamadas de rede/upload");
    assert.equal(dom.btn.disabled, false, "botão reabilitado após download");
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].name, "vox-backup-offline-2026-11-24.html");
    assert.equal(downloads[0].blob.type, "text/html;charset=utf-8");

    const html = await downloads[0].blob.text();
    assert.match(html, /<!doctype html>/i);
    assert.equal(/<script/i.test(html), false);
    assert.equal(/https?:\/\//i.test(html), false);
    assert.ok(toasts.some((t) => t.type === "info" && t.msg.includes("vox-backup-offline-2026-11-24.html")));
  } finally {
    dom.restore();
    globalThis.fetch = prevFetch;
  }
});

test("EXP-04 UI: sem botão no DOM, sem posts e erro na exportação são tratados sem rede", async () => {
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: () => null };
  assert.equal(bindHtmlBackupButton(), false);
  globalThis.document = prevDoc;

  const toasts = [];
  let downloads = 0;
  const btn = { disabled: false };

  const emptyRes = await exportHtmlBackupNow(btn, {
    exportOwnPosts: async () => ({ count: 0, text: "{}" }),
    downloadBlob: () => { downloads++; },
    showToast: (msg, type = "info") => toasts.push({ msg, type }),
  });
  assert.deepEqual(emptyRes, { downloaded: false, count: 0 });
  assert.equal(downloads, 0);
  assert.equal(btn.disabled, false);

  const errRes = await exportHtmlBackupNow(btn, {
    exportOwnPosts: async () => { throw new Error("falha local"); },
    downloadBlob: () => { downloads++; },
    showToast: (msg, type = "info") => toasts.push({ msg, type }),
  });
  assert.deepEqual(errRes, { downloaded: false, count: 0 });
  assert.equal(downloads, 0);
  assert.equal(btn.disabled, false);
  assert.ok(toasts.some((t) => t.type === "error" && t.msg.includes("falha local")));
});
