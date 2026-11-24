//! Per-connection WebSocket signaling session lifecycle and message dispatch.

use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crate::http::{
    build_host_rejected_response, build_http_route_response, build_origin_rejected_response,
    build_rate_limited_response, build_ws_accept_response, parse_http_request,
    read_handshake_request,
};
use crate::json::JsonValue;
use crate::registry::{PeerRegistry, PeerSender};
use crate::sha1::compute_accept_key;
use crate::signaling::ServerContext;
use crate::ws::{
    is_control_opcode, is_data_opcode, make_frame, read_frame, MessageAssembler,
    MAX_CONTROL_PAYLOAD, MAX_WS_MESSAGE_SIZE, OP_CLOSE, OP_PING, OP_PONG, OP_TEXT,
};

struct PeerSession<'a> {
    conn_id: u64,
    peer_id: Option<String>,
    client_ip: String,
    sender: PeerSender,
    ctx: &'a ServerContext,
}

impl<'a> PeerSession<'a> {
    fn handle_text(&mut self, payload: &[u8]) {
        if self.ctx.limiter.check_signal_msg(&self.client_ip) > 0 {
            return;
        }
        let Ok(text) = std::str::from_utf8(payload) else {
            return;
        };
        let Ok(msg) = JsonValue::parse(text) else {
            return;
        };
        self.dispatch_message(msg);
    }

    fn dispatch_message(&mut self, msg: JsonValue) {
        let Some(mtype) = msg.get("type").and_then(JsonValue::as_str) else {
            return;
        };
        match mtype {
            "register" => self.on_register(&msg),
            "offer" | "answer" | "ice" => self.forward_peer_message(msg),
            "ping" => {
                let pong = JsonValue::Object(vec![(
                    "type".to_string(),
                    JsonValue::String("pong".to_string()),
                )]);
                let _ = self.sender.send_json(&pong);
            }
            _ => {}
        }
    }

    fn on_register(&mut self, msg: &JsonValue) {
        let Some(raw_id) = msg.get("peerId").and_then(JsonValue::as_str) else {
            return;
        };
        let clean_id = raw_id.trim();
        if clean_id.is_empty() {
            return;
        }
        let address = msg
            .get("address")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string();
        let dm_pub = msg
            .get("dmPub")
            .filter(|v| !matches!(v, JsonValue::Null))
            .cloned();

        self.unregister_previous_if_changed(clean_id);
        self.peer_id = Some(clean_id.to_string());
        let others = self.ctx.registry.register(
            clean_id.to_string(),
            self.conn_id,
            self.sender.clone(),
            address.clone(),
            dm_pub.clone(),
        );
        let addr_map = self.ctx.registry.address_map_json(clean_id);
        let _ = self
            .sender
            .send_json(&build_registered_msg(clean_id, others, addr_map));
        broadcast_peer_joined(&self.ctx.registry, clean_id, &address, dm_pub);
    }

    fn unregister_previous_if_changed(&self, new_id: &str) {
        if let Some(prev_id) = self.peer_id.as_deref() {
            if prev_id != new_id && self.ctx.registry.unregister(prev_id, self.conn_id) {
                broadcast_peer_left(&self.ctx.registry, prev_id);
            }
        }
    }

    fn forward_peer_message(&self, mut msg: JsonValue) {
        let Some(to_peer) = msg
            .get("to")
            .and_then(JsonValue::as_str)
            .map(str::to_string)
        else {
            return;
        };
        if to_peer.is_empty() {
            return;
        }
        let from_val = match &self.peer_id {
            Some(pid) => JsonValue::String(pid.clone()),
            None => JsonValue::Null,
        };
        msg.set_field("from", from_val);
        if let Some(target) = self.ctx.registry.get_sender(&to_peer) {
            let _ = target.send_json(&msg);
        }
    }

    fn cleanup(&mut self) {
        if let Some(pid) = self.peer_id.take() {
            if self.ctx.registry.unregister(&pid, self.conn_id) {
                broadcast_peer_left(&self.ctx.registry, &pid);
            }
        }
    }
}

fn build_registered_msg(peer_id: &str, others: Vec<String>, addr_map: JsonValue) -> JsonValue {
    JsonValue::Object(vec![
        (
            "type".to_string(),
            JsonValue::String("registered".to_string()),
        ),
        ("peerId".to_string(), JsonValue::String(peer_id.to_string())),
        (
            "peers".to_string(),
            JsonValue::Array(others.into_iter().map(JsonValue::String).collect()),
        ),
        ("addressMap".to_string(), addr_map),
    ])
}

fn broadcast_peer_joined(
    registry: &PeerRegistry,
    peer_id: &str,
    address: &str,
    dm_pub: Option<JsonValue>,
) {
    let msg = JsonValue::Object(vec![
        (
            "type".to_string(),
            JsonValue::String("peer-joined".to_string()),
        ),
        ("peerId".to_string(), JsonValue::String(peer_id.to_string())),
        (
            "address".to_string(),
            JsonValue::String(address.to_string()),
        ),
        ("dmPub".to_string(), dm_pub.unwrap_or(JsonValue::Null)),
    ]);
    let frame = Arc::new(make_frame(msg.to_json_string().as_bytes(), OP_TEXT));
    registry.broadcast_others(peer_id, frame);
}

fn broadcast_peer_left(registry: &PeerRegistry, peer_id: &str) {
    let msg = JsonValue::Object(vec![
        (
            "type".to_string(),
            JsonValue::String("peer-left".to_string()),
        ),
        ("peerId".to_string(), JsonValue::String(peer_id.to_string())),
    ]);
    let frame = Arc::new(make_frame(msg.to_json_string().as_bytes(), OP_TEXT));
    registry.broadcast_others(peer_id, frame);
}

/// Handles one accepted TCP connection (either HTTP health route or WebSocket session).
pub(crate) fn handle_connection(
    mut stream: TcpStream,
    peer_addr: Option<SocketAddr>,
    ctx: &ServerContext,
) {
    let Some(client_ip) = perform_ws_upgrade(&mut stream, peer_addr, ctx) else {
        return;
    };
    let _ = stream.set_read_timeout(None);
    let _ = stream.set_nodelay(true);
    let Ok(writer_stream) = stream.try_clone() else {
        return;
    };
    let sender = PeerSender::spawn(writer_stream, ctx.config.max_outbound_queue);
    let conn_id = ctx.next_conn_id.fetch_add(1, Ordering::Relaxed);
    let mut session = PeerSession {
        conn_id,
        peer_id: None,
        client_ip,
        sender,
        ctx,
    };
    receive_loop(&mut stream, &mut session);
    session.cleanup();
}

fn perform_ws_upgrade(
    stream: &mut TcpStream,
    peer_addr: Option<SocketAddr>,
    ctx: &ServerContext,
) -> Option<String> {
    let raw_req = read_handshake_request(stream, ctx.config.handshake_timeout)
        .ok()
        .flatten()?;
    let req = parse_http_request(&raw_req);
    if !ctx
        .config
        .guard
        .host_allowed(req.header("host"), &ctx.config.host)
    {
        let _ = stream.write_all(&build_host_rejected_response(&ctx.config.guard));
        return None;
    }
    let Some(sec_key) = req.header("sec-websocket-key") else {
        let resp = build_http_route_response(&req, ctx.registry.peer_count(), &ctx.config.guard);
        let _ = stream.write_all(&resp);
        return None;
    };
    if !ctx.config.guard.ws_origin_allowed(req.header("origin")) {
        let _ = stream.write_all(&build_origin_rejected_response(&ctx.config.guard));
        return None;
    }
    let client_ip = resolve_peer_ip(peer_addr, req.header("x-forwarded-for"), ctx);
    let wait = ctx.limiter.check_signal(&client_ip);
    if wait > 0 {
        let _ = stream.write_all(&build_rate_limited_response(wait, &ctx.config.guard));
        return None;
    }
    let accept = compute_accept_key(sec_key);
    stream.write_all(&build_ws_accept_response(&accept)).ok()?;
    Some(client_ip)
}

fn resolve_peer_ip(
    peer_addr: Option<SocketAddr>,
    forwarded_for: Option<&str>,
    ctx: &ServerContext,
) -> String {
    match peer_addr {
        Some(addr) => ctx.limiter.resolve_client_ip(addr.ip(), forwarded_for),
        None => "127.0.0.1".to_string(),
    }
}

fn receive_loop(stream: &mut TcpStream, session: &mut PeerSession<'_>) {
    let mut assembler = MessageAssembler::new(MAX_WS_MESSAGE_SIZE);
    while let Ok(Some(frame)) = read_frame(stream, session.ctx.config.frame_timeout) {
        if frame.opcode == OP_CLOSE {
            break;
        }
        if is_control_opcode(frame.opcode) {
            if !frame.fin || frame.payload.len() > MAX_CONTROL_PAYLOAD {
                break;
            }
            if frame.opcode == OP_PING {
                let pong = Arc::new(make_frame(&frame.payload, OP_PONG));
                let _ = session.sender.try_send_frame(pong);
            }
            continue;
        }
        if !is_data_opcode(frame.opcode) {
            break;
        }
        match assembler.feed(frame.fin, frame.opcode, &frame.payload) {
            Ok(Some((OP_TEXT, data))) => session.handle_text(&data),
            Ok(Some(_)) | Ok(None) => {}
            Err(_) => break,
        }
    }
}
