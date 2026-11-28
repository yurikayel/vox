/**
 * @file Relay de borda (Deno): um endereço com dono conectado não é tomado por outra conexão. Mesma regra do relay em
 * Python (`relay/test_registro_conexao_viva.py`). O módulo roda `Deno.serve` ao importar, então o teste instala um
 * `Deno` e um `BroadcastChannel` de mentira e conversa com o manipulador como um cliente WebSocket faria.
 */
import test from "node:test";
import assert from "node:assert/strict";

let handler = null;
const sockets = [];
globalThis.Deno = {
  serve(fn) { handler = fn; },
  upgradeWebSocket() {
    const socket = { readyState: 1, sent: [], send(raw) { this.sent.push(JSON.parse(raw)); }, close() { this.readyState = 3; } };
    sockets.push(socket);
    return { socket, response: {} };
  },
};
globalThis.BroadcastChannel = class { postMessage() {} };

await import("../relay/deno-signaling.js");

const PUB_DONO = { kty: "EC", crv: "P-256", x: "dono", y: "dono" };
const PUB_ALHEIA = { kty: "EC", crv: "P-256", x: "alheia", y: "alheia" };
const PUB_NOVA = { kty: "EC", crv: "P-256", x: "nova", y: "nova" };
let contador = 0;

/** Abre uma conexão WebSocket de mentira no relay. */
function conectar() {
  handler({ url: "http://relay.local/", headers: { get: (nome) => (nome === "upgrade" ? "websocket" : null) } });
  return sockets.at(-1);
}

/** Registra `peerId` por uma conexão nova e devolve a resposta `registered`. */
function registrar(peerId, address, dmPub) {
  const socket = conectar();
  const msg = { type: "register", peerId };
  if (address) msg.address = address;
  if (dmPub) msg.dmPub = dmPub;
  socket.onmessage({ data: JSON.stringify(msg) });
  return { socket, resposta: socket.sent.find((m) => m.type === "registered") };
}

/** O mapa de endereços como um terceiro par (sem endereço) o recebe ao entrar. */
function mapaAtual() {
  return registrar(`obs${contador += 1}`, "", null).resposta;
}

/** Cena de cada teste: ids e endereço próprios, porque o módulo guarda o estado entre os testes. */
function cena() {
  const n = contador += 1;
  const c = { dono: `dono${n}`, intruso: `intruso${n}`, address: `vx_a${n}` };
  c.donoRegistro = registrar(c.dono, c.address, PUB_DONO);
  return c;
}

test("conexão alheia não toma o endereço de um par conectado", () => {
  const c = cena();
  registrar(c.intruso, c.address, PUB_ALHEIA);
  const entrada = mapaAtual().addressMap[c.address];
  assert.equal(entrada.peerId, c.dono);
  assert.deepEqual(entrada.dmPub, PUB_DONO);
});

test("o dono que registra de novo continua no mapa", () => {
  const c = cena();
  registrar(c.intruso, c.address, PUB_ALHEIA);
  registrar(c.dono, c.address, PUB_DONO);
  const entrada = mapaAtual().addressMap[c.address];
  assert.equal(entrada.peerId, c.dono);
  assert.deepEqual(entrada.dmPub, PUB_DONO);
});

test("o dono se registra de novo com chave nova", () => {
  const c = cena();
  registrar(c.dono, c.address, PUB_NOVA);
  const entrada = mapaAtual().addressMap[c.address];
  assert.equal(entrada.peerId, c.dono);
  assert.deepEqual(entrada.dmPub, PUB_NOVA);
});

test("o par alheio ainda entra na sala e não deixa chave solta", () => {
  const c = cena();
  const { resposta } = registrar(c.intruso, c.address, PUB_ALHEIA);
  assert.ok(resposta.peers.includes(c.dono), "o intruso vê o dono na sala");
  const mapa = mapaAtual();
  assert.ok(mapa.peers.includes(c.intruso), "o intruso segue na sala");
  const donos = Object.values(mapa.addressMap).filter((e) => e.peerId === c.intruso);
  assert.equal(donos.length, 0, "o intruso não deixa endereço nem chave");
});

test("um endereço livre pode ser registrado por outro par", () => {
  const c = cena();
  registrar(`outra${contador}`, `${c.address}_b`, PUB_ALHEIA);
  const entrada = mapaAtual().addressMap[`${c.address}_b`];
  assert.deepEqual(entrada.dmPub, PUB_ALHEIA);
});

test("o endereço é liberado quando o dono sai", () => {
  const c = cena();
  c.donoRegistro.socket.onclose();
  registrar(`novo${contador}`, c.address, PUB_ALHEIA);
  assert.deepEqual(mapaAtual().addressMap[c.address].dmPub, PUB_ALHEIA);
});
