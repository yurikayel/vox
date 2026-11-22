/**
 * @file Testes unitários para scripts/e2e-lib.mjs (PM-113).
 * Valida funções puras, roteamento, dicionários e servidor HTTP estático local sem depender de browser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIME,
  DEFAULT_SIGNALING_CONFIG,
  resolveClientPath,
  classifyRequestUrl,
  getFreePort,
  startStaticClientServer,
} from "../scripts/e2e-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "client");

test("resolveClientPath mapeia raiz para index.html e limpa queries", () => {
  const rootPath = resolveClientPath("/", CLIENT_DIR);
  assert.equal(rootPath, path.join(CLIENT_DIR, "index.html"));

  const queryPath = resolveClientPath("/sw.js?cache=test", CLIENT_DIR);
  assert.equal(queryPath, path.join(CLIENT_DIR, "sw.js"));

  const directPath = resolveClientPath("/manifest.json", CLIENT_DIR);
  assert.equal(directPath, path.join(CLIENT_DIR, "manifest.json"));
});

test("resolveClientPath bloqueia path traversal e acessos fora da raiz", () => {
  const traversal = resolveClientPath("/../../package.json", CLIENT_DIR);
  assert.equal(traversal, null);

  const encodedTraversal = resolveClientPath("/%2e%2e%2fpackage.json", CLIENT_DIR);
  assert.equal(encodedTraversal, null);

  const subOutside = resolveClientPath("/../client/index.html", CLIENT_DIR);
  assert.equal(subOutside, path.join(CLIENT_DIR, "index.html"));
});

test("classifyRequestUrl categoriza rotas de sinalização, oauth, local e externa", () => {
  const base = "http://127.0.0.1:4567";

  assert.equal(classifyRequestUrl("http://127.0.0.1:4567/config/signaling.json", base), "signaling");
  assert.equal(classifyRequestUrl("http://127.0.0.1:4567/config/oauth.json", base), "oauth");
  assert.equal(classifyRequestUrl("http://127.0.0.1:4567/index.html", base), "local");
  assert.equal(classifyRequestUrl("http://127.0.0.1:4567/js/app.js", base), "local");
  assert.equal(classifyRequestUrl("https://arweave.net/tx-123", base), "external");
  assert.equal(classifyRequestUrl("https://relay.damus.io", base), "external");
  assert.equal(classifyRequestUrl(null, base), "external");
  assert.equal(classifyRequestUrl(undefined, base), "external");
});

test("MIME e DEFAULT_SIGNALING_CONFIG possuem estruturas congeladas e canônicas", () => {
  assert.ok(Object.isFrozen(MIME));
  assert.equal(MIME[".html"], "text/html; charset=utf-8");
  assert.equal(MIME[".js"], "application/javascript; charset=utf-8");
  assert.equal(MIME[".mjs"], "application/javascript; charset=utf-8");
  assert.equal(MIME[".json"], "application/json; charset=utf-8");

  assert.ok(Object.isFrozen(DEFAULT_SIGNALING_CONFIG));
  assert.equal(DEFAULT_SIGNALING_CONFIG.nostrSignaling.enabled, false);
  assert.deepEqual(DEFAULT_SIGNALING_CONFIG.signalingUrls, []);
  assert.deepEqual(DEFAULT_SIGNALING_CONFIG.nostrRelays, []);
});

test("getFreePort aloca porta TCP válida em loopback", async () => {
  const port = await getFreePort();
  assert.equal(typeof port, "number");
  assert.ok(port > 1024, `Porta deve ser maior que 1024 (recebeu ${port})`);
  assert.ok(port <= 65535, `Porta deve ser <= 65535 (recebeu ${port})`);
});

test("startStaticClientServer serve arquivos locais e 404 para inexistentes", async () => {
  const server = await startStaticClientServer({ clientDir: CLIENT_DIR });
  try {
    assert.ok(server.port > 0);
    assert.equal(server.baseUrl, `http://127.0.0.1:${server.port}`);

    const indexRes = await fetch(`${server.baseUrl}/`);
    assert.equal(indexRes.status, 200);
    assert.ok(indexRes.headers.get("content-type")?.includes("text/html"));
    const html = await indexRes.text();
    assert.ok(html.length > 50);

    const missingRes = await fetch(`${server.baseUrl}/arquivo-inexistente-e2e.xyz`);
    assert.equal(missingRes.status, 404);
  } finally {
    await server.close();
  }
});
