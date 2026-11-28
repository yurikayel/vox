/**
 * @file Espera do `/health` do relay nos testes de integração (`helpers/relay-health.js`): o relay Python sob carga leva
 * mais de 2 s para ouvir, e a espera antiga (20 tentativas de 100 ms, só o erro de conexão dormia) desistia antes. Aqui um
 * servidor falso começa a ouvir 2,6 s depois, e a espera tem de achá-lo; o processo que morre falha na hora, com a causa; e
 * quem nunca sobe estoura o prazo devolvendo `null`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { freePort, waitForHealth } from "./helpers/relay-health.js";

const healthServer = () => http.createServer((_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", app: "vox-relay" }));
});

test("freePort devolve portas de loopback que dá para ouvir", async () => {
  const port = await freePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const srv = healthServer();
  await new Promise((resolve, reject) => { srv.once("error", reject); srv.listen(port, "127.0.0.1", resolve); });
  srv.close();
});

test("waitForHealth acha o servidor que só começa a ouvir depois de 2,6 s (mais que a espera antiga de ~2 s)", async () => {
  const port = await freePort();
  const srv = healthServer();
  const timer = setTimeout(() => srv.listen(port, "127.0.0.1"), 2600);
  try {
    const body = await waitForHealth(port);
    assert.equal(body?.status, "ok");
    assert.equal(body?.app, "vox-relay");
  } finally {
    clearTimeout(timer);
    srv.close();
    srv.closeAllConnections?.();
  }
});

test("waitForHealth falha na hora, com a causa, quando o processo já saiu", async () => {
  const port = await freePort();
  await assert.rejects(
    waitForHealth(port, { timeoutMs: 20000, exitReason: () => "código 1: ModuleNotFoundError" }),
    /o relay saiu antes de responder em \/health: código 1: ModuleNotFoundError/,
  );
});

test("waitForHealth devolve null quando nada sobe dentro do prazo", async () => {
  const port = await freePort();
  assert.equal(await waitForHealth(port, { timeoutMs: 300 }), null);
});

test("resposta que não é status ok (503) não conta como pronta", async () => {
  const port = await freePort();
  const srv = http.createServer((_req, res) => { res.statusCode = 503; res.end("{}"); });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  try {
    assert.equal(await waitForHealth(port, { timeoutMs: 300 }), null);
  } finally {
    srv.close();
    srv.closeAllConnections?.();
  }
});
