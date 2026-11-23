/**
 * @file Concatena `webrtc-peer.js` e módulos `webrtc-peer-*.js` / `webrtc-signaling-*.js` / `webrtc-connection.js` / `webrtc-messaging.js` para asserções de string nos testes.
 */
import fs from "node:fs";
import path from "node:path";

const EXTRA_MODULES = [
  "webrtc-connection.js",
  "webrtc-messaging.js",
  "webrtc-signaling-config.js",
  "webrtc-signaling-send.js",
  "webrtc-signaling-ws.js",
];

/**
 * Lê a fachada `webrtc-peer.js` e módulos WebRTC relacionados (ordenados) do `clientRoot`.
 * @param {string} clientRoot Caminho da pasta `client/` (ex.: `…/vox/client`).
 * @returns {string} Código concatenado para busca de marcadores.
 */
export function readWebRtcPeerSource(clientRoot) {
  const jsDir = path.join(clientRoot, "js");
  const parts = [path.join(jsDir, "webrtc-peer.js")];
  const entries = fs.readdirSync(jsDir);
  const peerModules = entries
    .filter((name) => name.startsWith("webrtc-peer-") && name.endsWith(".js"))
    .sort();
  for (const name of peerModules) {
    parts.push(path.join(jsDir, name));
  }
  for (const name of EXTRA_MODULES) {
    parts.push(path.join(jsDir, name));
  }
  return parts.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}