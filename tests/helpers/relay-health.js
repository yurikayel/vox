/**
 * @file Ajudantes dos testes que sobem o relay Python de verdade: uma porta livre pedida ao sistema e a espera pelo
 * `/health`. A espera é por condição (`waitUntil`) com prazo de 20 s, não por um número fixo de tentativas curtas: o
 * Python sob carga (CI, Windows) leva mais de 2 s para importar e ouvir. Se o processo morrer, falha na hora com a causa
 * (código de saída e `stderr`) em vez de esperar o prazo inteiro.
 */
import net from "node:net";
import { waitUntil } from "./wait-until.js";

/**
 * Pede ao sistema uma porta de loopback livre. Evita a colisão de uma porta sorteada num intervalo curto, que fazia o relay
 * não ouvir ou outro processo responder no lugar dele.
 * @returns {Promise<number>} Porta livre no instante da consulta.
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Espera o `/health` do relay responder `status: "ok"`.
 * @param {number} port Porta de loopback do relay.
 * @param {object} [opts] Opções.
 * @param {number} [opts.timeoutMs] Prazo total (padrão 20 s).
 * @param {() => string|null} [opts.exitReason] Devolve o motivo se o processo já saiu (falha na hora), ou `null`.
 * @returns {Promise<object|null>} Corpo do `/health`, ou `null` se o prazo estourou.
 */
export async function waitForHealth(port, { timeoutMs = 20000, exitReason = () => null } = {}) {
  return waitUntil(async () => {
    const reason = exitReason();
    if (reason) throw new Error(`o relay saiu antes de responder em /health: ${reason}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      const body = res.ok ? await res.json() : null;
      return body?.status === "ok" ? body : null;
    } catch {
      return null;
    }
  }, timeoutMs);
}
