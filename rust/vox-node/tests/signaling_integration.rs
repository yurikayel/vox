//! Integration tests for `vox-node` WebSocket signaling and HTTP health endpoints.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

use vox_node::guard::GuardPolicy;
use vox_node::json::JsonValue;
use vox_node::limits::{LimitsConfig, RatePolicy};
use vox_node::sha1::compute_accept_key;
use vox_node::signaling::{ServerHandle, SignalingConfig, SignalingServer};
use vox_node::ws::{make_masked_frame, read_frame, OP_CONT, OP_PING, OP_PONG, OP_TEXT};

const APP_ORIGIN: &str = "https://yurikayel.github.io";
const TEST_MASK: [u8; 4] = [0x11, 0x22, 0x33, 0x44];

fn start_test_server(mut cfg: SignalingConfig) -> ServerHandle {
    cfg.host = "127.0.0.1".to_string();
    cfg.port = 0;
    SignalingServer::bind(cfg)
        .expect("bind test signaling server")
        .spawn()
}

fn send_raw_http(port: u16, request: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("timeout");
    stream.write_all(request.as_bytes()).expect("write");
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).into_owned()
}

fn ws_connect(port: u16, origin: Option<&str>) -> (TcpStream, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("timeout");
    let key = "dGhlIHNhbXBsZSBub25jZQ==";
    let mut req = format!(
        "GET / HTTP/1.1\r\n\
         Host: 127.0.0.1:{port}\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Key: {key}\r\n\
         Sec-WebSocket-Version: 13\r\n"
    );
    if let Some(orig) = origin {
        req.push_str(&format!("Origin: {orig}\r\n"));
    }
    req.push_str("\r\n");
    stream.write_all(req.as_bytes()).expect("write handshake");
    let mut buf = vec![0u8; 2048];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]).into_owned();
    (stream, head)
}

fn send_ws_text(stream: &mut TcpStream, text: &str) {
    let frame = make_masked_frame(text.as_bytes(), OP_TEXT, true, TEST_MASK);
    stream.write_all(&frame).expect("send ws text");
}

fn read_ws_json(stream: &mut TcpStream) -> JsonValue {
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("timeout");
    let frame = read_frame(stream, Duration::from_secs(3))
        .expect("read frame")
        .expect("frame present");
    assert_eq!(frame.opcode, OP_TEXT);
    let text = std::str::from_utf8(&frame.payload).expect("utf8");
    JsonValue::parse(text).expect("valid json")
}

#[test]
fn http_health_status_ping_options_404_and_405() {
    let server = start_test_server(SignalingConfig::default());
    let port = server.port();

    for path in ["/", "/health", "/status", "/ping"] {
        let resp = send_raw_http(
            port,
            &format!(
                "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {APP_ORIGIN}\r\n\r\n"
            ),
        );
        assert!(resp.starts_with("HTTP/1.1 200 OK"), "{path}: {resp}");
        assert!(resp.contains("\"service\":\"vox-signaling\""));
        assert!(resp.contains("\"peers\":0"));
        assert!(resp.contains(&format!("Access-Control-Allow-Origin: {APP_ORIGIN}\r\n")));
        assert!(resp.contains("Vary: Origin\r\n"));
        assert!(!resp.contains("Access-Control-Allow-Origin: *"));
    }

    let head = send_raw_http(
        port,
        &format!("HEAD /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(head.starts_with("HTTP/1.1 200 OK"));
    assert!(head.contains("Content-Length: 0\r\n"));

    let opt = send_raw_http(
        port,
        &format!(
            "OPTIONS /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {}\r\n\r\n",
            APP_ORIGIN.to_ascii_uppercase()
        ),
    );
    assert!(opt.starts_with("HTTP/1.1 204 No Content"));
    assert!(opt.contains(&format!("Access-Control-Allow-Origin: {APP_ORIGIN}\r\n")));

    let missing = send_raw_http(
        port,
        &format!("GET /nao-existe HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(missing.starts_with("HTTP/1.1 404 Not Found"));

    let bad_method = send_raw_http(
        port,
        &format!("POST /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(bad_method.starts_with("HTTP/1.1 405 Method Not Allowed"));
}

#[test]
fn host_and_origin_guards_enforce_421_and_403() {
    let cfg = SignalingConfig {
        guard: GuardPolicy {
            allowed_hosts: vec!["tunnel.example".to_string()],
            allowed_origins: vec!["https://meu.exemplo".to_string()],
        },
        ..SignalingConfig::default()
    };
    let server = start_test_server(cfg);
    let port = server.port();

    let bad_host = send_raw_http(port, "GET /health HTTP/1.1\r\nHost: evil.example\r\n\r\n");
    assert!(bad_host.starts_with("HTTP/1.1 421 Misdirected Request"));

    let ok_tunnel = send_raw_http(port, "GET /health HTTP/1.1\r\nHost: tunnel.example\r\n\r\n");
    assert!(ok_tunnel.starts_with("HTTP/1.1 200 OK"));

    let (_, foreign) = ws_connect(port, Some("https://evil.example"));
    assert!(foreign.contains("403 Forbidden"));
    assert!(foreign.contains("origin_not_allowed"));

    let (_, ctrl) = ws_connect(port, Some("https://yurikayel.github.io\x01"));
    assert!(ctrl.contains("403 Forbidden"));

    let (_, app) = ws_connect(port, Some(APP_ORIGIN));
    assert!(app.contains("101 Switching Protocols"));
    assert!(app.contains(&format!(
        "Sec-WebSocket-Accept: {}",
        compute_accept_key("dGhlIHNhbXBsZSBub25jZQ==")
    )));

    let (_, local) = ws_connect(port, Some("http://localhost:8080"));
    assert!(local.contains("101 Switching Protocols"));

    let (_, env_orig) = ws_connect(port, Some("https://meu.exemplo"));
    assert!(env_orig.contains("101 Switching Protocols"));

    let (_, no_orig) = ws_connect(port, None);
    assert!(no_orig.contains("101 Switching Protocols"));
}

#[test]
fn rate_limit_signal_returns_429_with_retry_after() {
    let cfg = SignalingConfig {
        limits: LimitsConfig {
            signal: RatePolicy {
                per_min: 60,
                burst: 2,
            },
            ..LimitsConfig::default()
        },
        ..SignalingConfig::default()
    };
    let server = start_test_server(cfg);
    let port = server.port();

    let (_, r1) = ws_connect(port, None);
    let (_, r2) = ws_connect(port, None);
    let (_, r3) = ws_connect(port, None);
    assert!(r1.contains("101 Switching Protocols"));
    assert!(r2.contains("101 Switching Protocols"));
    assert!(r3.contains("429 Too Many Requests"));
    assert!(r3.contains("Retry-After:"));
}

#[test]
fn connection_cap_drops_excess_and_recovers_after_close() {
    let cfg = SignalingConfig {
        limits: LimitsConfig {
            max_connections: 2,
            ..LimitsConfig::default()
        },
        ..SignalingConfig::default()
    };
    let server = start_test_server(cfg);
    let port = server.port();

    let (s1, h1) = ws_connect(port, None);
    let (_s2, h2) = ws_connect(port, None);
    assert!(h1.contains("101 Switching Protocols"));
    assert!(h2.contains("101 Switching Protocols"));

    let (_, h3) = ws_connect(port, None);
    assert!(
        h3.is_empty(),
        "3rd connection should be closed immediately: {h3}"
    );

    drop(s1);
    thread::sleep(Duration::from_millis(80));
    let (_, h4) = ws_connect(port, None);
    assert!(h4.contains("101 Switching Protocols"));
}

#[test]
fn ws_relay_between_two_peers_forges_from_and_notifies_left() {
    let server = start_test_server(SignalingConfig::default());
    let port = server.port();

    let (mut peer_a, h_a) = ws_connect(port, Some(APP_ORIGIN));
    let (mut peer_b, h_b) = ws_connect(port, Some(APP_ORIGIN));
    assert!(h_a.contains("101 Switching Protocols"));
    assert!(h_b.contains("101 Switching Protocols"));

    send_ws_text(
        &mut peer_a,
        r#"{"type":"register","peerId":"peer-a","address":"addrA","dmPub":{"kty":"EC"}}"#,
    );
    let reg_a = read_ws_json(&mut peer_a);
    assert_eq!(
        reg_a.get("type").and_then(JsonValue::as_str),
        Some("registered")
    );
    assert_eq!(
        reg_a.get("peerId").and_then(JsonValue::as_str),
        Some("peer-a")
    );

    send_ws_text(
        &mut peer_b,
        r#"{"type":"register","peerId":"peer-b","address":"addrB"}"#,
    );
    let reg_b = read_ws_json(&mut peer_b);
    assert_eq!(
        reg_b.get("type").and_then(JsonValue::as_str),
        Some("registered")
    );
    assert!(reg_b.to_json_string().contains("\"peer-a\""));
    assert!(reg_b.to_json_string().contains("\"addrA\""));

    let joined = read_ws_json(&mut peer_a);
    assert_eq!(
        joined.get("type").and_then(JsonValue::as_str),
        Some("peer-joined")
    );
    assert_eq!(
        joined.get("peerId").and_then(JsonValue::as_str),
        Some("peer-b")
    );

    send_ws_text(
        &mut peer_a,
        r#"{"type":"offer","to":"peer-b","from":"spoofed","sdp":{"type":"offer"}}"#,
    );
    let offer = read_ws_json(&mut peer_b);
    assert_eq!(offer.get("type").and_then(JsonValue::as_str), Some("offer"));
    assert_eq!(
        offer.get("from").and_then(JsonValue::as_str),
        Some("peer-a")
    );

    send_ws_text(&mut peer_a, r#"{"type":"ping"}"#);
    let pong = read_ws_json(&mut peer_a);
    assert_eq!(pong.get("type").and_then(JsonValue::as_str), Some("pong"));

    drop(peer_b);
    let left = read_ws_json(&mut peer_a);
    assert_eq!(
        left.get("type").and_then(JsonValue::as_str),
        Some("peer-left")
    );
    assert_eq!(
        left.get("peerId").and_then(JsonValue::as_str),
        Some("peer-b")
    );
}

#[test]
fn fragmented_message_with_ping_and_timeouts() {
    let cfg = SignalingConfig {
        handshake_timeout: Duration::from_millis(300),
        frame_timeout: Duration::from_millis(300),
        ..SignalingConfig::default()
    };
    let server = start_test_server(cfg);
    let port = server.port();

    // Fragmented register with interleaved Ping
    let (mut ws, head) = ws_connect(port, None);
    assert!(head.contains("101 Switching Protocols"));
    let payload = br#"{"type":"register","peerId":"peer-frag"}"#;
    ws.write_all(&make_masked_frame(
        &payload[..10],
        OP_TEXT,
        false,
        TEST_MASK,
    ))
    .unwrap();
    ws.write_all(&make_masked_frame(b"oi", OP_PING, true, TEST_MASK))
        .unwrap();
    ws.write_all(&make_masked_frame(
        &payload[10..20],
        OP_CONT,
        false,
        TEST_MASK,
    ))
    .unwrap();
    ws.write_all(&make_masked_frame(&payload[20..], OP_CONT, true, TEST_MASK))
        .unwrap();

    let pong = read_frame(&mut ws, Duration::from_secs(2))
        .unwrap()
        .unwrap();
    assert_eq!(pong.opcode, OP_PONG);
    assert_eq!(pong.payload, b"oi");

    let reg = read_ws_json(&mut ws);
    assert_eq!(
        reg.get("peerId").and_then(JsonValue::as_str),
        Some("peer-frag")
    );

    // Incomplete handshake times out and closes
    let mut slow = TcpStream::connect(("127.0.0.1", port)).unwrap();
    slow.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    slow.write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n")
        .unwrap();
    let mut buf = [0u8; 64];
    assert_eq!(slow.read(&mut buf).unwrap_or(0), 0);

    // Stalled frame closes while quiet peer survives past frame_timeout
    let (mut quiet, _) = ws_connect(port, None);
    let (mut stalled, _) = ws_connect(port, None);
    stalled
        .write_all(&[0x81, 0x80 | 100, 0x11, 0x22, 0x33, 0x44, b'a', b'b'])
        .unwrap();
    assert_eq!(stalled.read(&mut buf).unwrap_or(0), 0);

    thread::sleep(Duration::from_millis(380));
    send_ws_text(&mut quiet, r#"{"type":"register","peerId":"peer-quiet"}"#);
    let reg_q = read_ws_json(&mut quiet);
    assert_eq!(
        reg_q.get("peerId").and_then(JsonValue::as_str),
        Some("peer-quiet")
    );
}
