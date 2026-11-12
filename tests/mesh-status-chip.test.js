import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderMeshStatusChip, renderNetworkChip } from "../client/js/render/shell.js";

const render = await import("../client/js/render.js");

test("selo de malha — segue o estado do chip de rede (ativa, offline, só leitura)", () => {
  const ativa = renderMeshStatusChip(renderNetworkChip({}, { remotePeersConnected: 2 }, { enabled: true }));
  assert.ok(ativa.includes("is-active") && ativa.includes(">Malha ativa<"));
  assert.ok(ativa.includes('title="2 aparelhos"'), "detalhe no title");
  assert.ok(ativa.includes('href="#/status"'));
  const offline = renderMeshStatusChip(renderNetworkChip({}, { isOnline: false }, { enabled: true }));
  assert.ok(offline.includes("is-offline") && offline.includes(">Offline<"));
  const pausada = renderMeshStatusChip(renderNetworkChip({}, {}, { enabled: false }));
  assert.ok(pausada.includes("is-paused") && pausada.includes(">Só leitura<"));
});

test("selo de malha — aparece no cabeçalho da tela de configurações da rede", () => {
  const main = { innerHTML: "" };
  render.renderNetworkSettings(main, { settings: { enabled: true }, rtcStatus: { remotePeersConnected: 1 }, metrics: {} });
  const status = main.innerHTML.slice(main.innerHTML.indexOf('class="network-status"'));
  assert.ok(status.includes('class="agora-mesh-chip is-active"'), "selo no topo da tela Sua rede");
  assert.ok(status.indexOf("agora-mesh-chip") < status.indexOf("Ajudando a rede"), "selo vem antes dos demais estados");
});
