// Servidor de Sinalização WebRTC Vox para Deno Deploy / Edge Runtime
// Compatível com RFC 6455 e protocolo de mensagens do Vox (register, offer, answer, ice)
// Usa BroadcastChannel para sincronizar nós de borda globalmente sem banco de dados.

const channel = new BroadcastChannel("vox-mesh-signaling");
const peers = new Map(); // peerId -> WebSocket
const addresses = new Map(); // peerId -> Arweave address
const dmPubs = new Map(); // peerId -> public JWK

Deno.serve((req) => {
  const url = new URL(req.url);

  // Requisição HTTP de Health Check e Status
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/status" || url.pathname === "/ping") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "vox-signaling",
          version: "1.0.0",
          platform: "deno-edge",
          peers: peers.size,
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, HEAD, OPTIONS",
          },
        }
      );
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Upgrade para WebSocket RFC 6455
  const { socket, response } = Deno.upgradeWebSocket(req);
  let currentPeerId = null;

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const mtype = msg.type;

      if (mtype === "register" && msg.peerId) {
        currentPeerId = msg.peerId;
        peers.set(currentPeerId, socket);
        if (msg.address) addresses.set(currentPeerId, String(msg.address));
        if (msg.dmPub) dmPubs.set(currentPeerId, msg.dmPub);

        const otherPeers = Array.from(peers.keys()).filter((id) => id !== currentPeerId);
        const addressMap = {};
        for (const [id, addr] of addresses.entries()) {
          if (id !== currentPeerId) {
            addressMap[addr] = { peerId: id, dmPub: dmPubs.get(id) };
          }
        }

        socket.send(
          JSON.stringify({
            type: "registered",
            peerId: currentPeerId,
            peers: otherPeers,
            addressMap,
          })
        );

        const joinMsg = {
          type: "peer-joined",
          peerId: currentPeerId,
          address: msg.address || "",
          dmPub: msg.dmPub,
        };
        broadcastLocal(currentPeerId, joinMsg);
        channel.postMessage({ kind: "broadcast", from: currentPeerId, data: joinMsg });
      } else if (mtype === "offer" || mtype === "answer" || mtype === "ice") {
        msg.from = currentPeerId;
        const target = peers.get(msg.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(msg));
        } else {
          channel.postMessage({ kind: "route", to: msg.to, data: msg });
        }
      } else if (mtype === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
      }
    } catch {}
  };

  socket.onclose = () => {
    if (currentPeerId) {
      peers.delete(currentPeerId);
      addresses.delete(currentPeerId);
      dmPubs.delete(currentPeerId);
      const leftMsg = { type: "peer-left", peerId: currentPeerId };
      broadcastLocal(currentPeerId, leftMsg);
      channel.postMessage({ kind: "broadcast", from: currentPeerId, data: leftMsg });
      currentPeerId = null;
    }
  };

  socket.onerror = () => {
    try { socket.close(); } catch {}
  };

  return response;
});

channel.onmessage = (event) => {
  const { kind, to, from, data } = event.data || {};
  if (kind === "broadcast") {
    broadcastLocal(from, data);
  } else if (kind === "route" && to) {
    const target = peers.get(to);
    if (target && target.readyState === WebSocket.OPEN) {
      target.send(JSON.stringify(data));
    }
  }
};

function broadcastLocal(excludeId, data) {
  const raw = JSON.stringify(data);
  for (const [id, ws] of peers.entries()) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      try { ws.send(raw); } catch {}
    }
  }
}
