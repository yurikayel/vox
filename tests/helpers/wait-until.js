/**
 * @file Espera por condição nos testes assíncronos: no lugar de dormir um tempo fixo (que falha sob carga),
 * repete a checagem até ela valer ou até o limite, e então devolve o último valor para o `assert` explicar.
 */

/**
 * Repete `probe` a cada poucos ms até devolver um valor verdadeiro ou estourar `timeoutMs`.
 * @param {() => unknown | Promise<unknown>} probe Condição a conferir (pode ser assíncrona).
 * @param {number} [timeoutMs] Limite total de espera.
 * @returns {Promise<unknown>} Último valor devolvido por `probe` (falso se estourou o limite).
 */
export async function waitUntil(probe, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  let value = await probe();
  while (!value && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5));
    value = await probe();
  }
  return value;
}

/**
 * Barreira determinística para pares `createVttSyncPeer`: o hub em memória entrega na hora e cada par enfileira os
 * tratadores em `flush()`; repetir as passadas cobre respostas que um par manda a outro (op → recusa → pedido de snapshot).
 * Serve também para provar ausência: quando todas as cadeias esvaziam, nada mais vai chegar.
 * @param {...{flush: () => Promise<void>}} peers Pares a esperar.
 * @returns {Promise<void>} Resolve quando todas as filas esvaziaram.
 */
export async function settlePeers(...peers) {
  for (let pass = 0; pass < 5; pass += 1) await Promise.all(peers.map((p) => p.flush()));
}
