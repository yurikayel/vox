//! Integration tests for `vox-node` HTTP relay mode (`--mode relay`, ADR-039 PR4.2a).

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vox_node::limits::{RatePolicy, RelayLimitsConfig};
use vox_node::relay::{RelayConfig, RelayServer, RelayServerHandle};
use vox_node::relay_store::sha256_hex;

const APP_ORIGIN: &str = "https://yurikayel.github.io";
static DIR_SEQ: AtomicU64 = AtomicU64::new(1);

fn unique_temp_dir(label: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = DIR_SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("vox-relay-it-{label}-{ts}-{seq}"))
}

fn start_relay(mut cfg: RelayConfig) -> RelayServerHandle {
    cfg.host = "127.0.0.1".to_string();
    cfg.port = 0;
    RelayServer::bind(cfg)
        .expect("bind test relay server")
        .spawn()
}

fn send_http(port: u16, request: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("read timeout");
    stream.write_all(request.as_bytes()).expect("write request");
    let mut response = Vec::new();
    let _ = stream.read_to_end(&mut response);
    String::from_utf8_lossy(&response).into_owned()
}

fn post_inbox(port: u16, addr: &str, body: &str, origin: &str, content_type: &str) -> String {
    let req = format!(
        "POST /inbox/{addr} HTTP/1.1\r\n\
         Host: 127.0.0.1:{port}\r\n\
         Origin: {origin}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\r\n\
         {body}",
        body.len()
    );
    send_http(port, &req)
}

#[test]
fn health_status_ping_version_options_head_404_and_405() {
    let dir = unique_temp_dir("health");
    let cfg = RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    };
    let server = start_relay(cfg);
    let port = server.port();

    for path in ["/", "/health", "/status", "/ping", "/version"] {
        let resp = send_http(
            port,
            &format!(
                "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {APP_ORIGIN}\r\n\r\n"
            ),
        );
        assert!(resp.starts_with("HTTP/1.1 200 OK"), "{path}: {resp}");
        assert!(resp.contains(&format!("Access-Control-Allow-Origin: {APP_ORIGIN}\r\n")));
        assert!(resp.contains("Vary: Origin\r\n"));
        assert!(resp.contains("Access-Control-Expose-Headers: Retry-After\r\n"));
        assert!(!resp.contains("Access-Control-Allow-Origin: *"));
    }

    let head = send_http(
        port,
        &format!("HEAD /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(head.starts_with("HTTP/1.1 200 OK"));
    assert!(head.contains("Content-Length: 0\r\n"));

    let opt = send_http(
        port,
        &format!(
            "OPTIONS /inbox/vx_a HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {}\r\n\r\n",
            APP_ORIGIN.to_ascii_uppercase()
        ),
    );
    assert!(opt.starts_with("HTTP/1.1 204 No Content"));
    assert!(opt.contains(&format!("Access-Control-Allow-Origin: {APP_ORIGIN}\r\n")));

    let missing = send_http(
        port,
        &format!("GET /unknown/route HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(missing.starts_with("HTTP/1.1 404 Not Found"));

    let bad_method = send_http(
        port,
        &format!("PUT /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(bad_method.starts_with("HTTP/1.1 405 Method Not Allowed"));

    server.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn host_origin_and_content_type_guards_enforce_421_403_415() {
    let dir = unique_temp_dir("guards");
    let cfg = RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    };
    let server = start_relay(cfg);
    let port = server.port();

    let bad_host = send_http(
        port,
        "GET /health HTTP/1.1\r\nHost: evil-domain.example\r\n\r\n",
    );
    assert!(bad_host.starts_with("HTTP/1.1 421 Misdirected Request"));

    let bad_origin = post_inbox(
        port,
        "vx_alice",
        "{}",
        "https://evil.example",
        "application/json",
    );
    assert!(bad_origin.starts_with("HTTP/1.1 403 Forbidden"));
    assert!(!bad_origin.contains("Access-Control-Allow-Origin:"));

    let bad_ct = post_inbox(port, "vx_alice", "{}", APP_ORIGIN, "text/plain");
    assert!(bad_ct.starts_with("HTTP/1.1 415 Unsupported Media Type"));

    server.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn inbox_store_list_persistence_size_cap_and_authenticated_delete() {
    let dir = unique_temp_dir("inbox");
    let server = start_relay(RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    });
    let port = server.port();

    let empty = send_http(
        port,
        &format!("GET /inbox/vx_alice HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(empty.starts_with("HTTP/1.1 200 OK"));
    assert!(empty.contains(r#"{"envelopes":[]}"#));

    let bad_del = post_inbox(
        port,
        "vx_alice",
        r#"{"v":1,"ephPub":{"kty":"EC"},"ct":"x","del":"bad"}"#,
        APP_ORIGIN,
        "application/json",
    );
    assert!(bad_del.starts_with("HTTP/1.1 400 Bad Request"));

    let oversized = format!(
        r#"{{"v":1,"ephPub":{{"kty":"EC"}},"ct":"{}"}}"#,
        "a".repeat(33_000)
    );
    let too_big = post_inbox(port, "vx_alice", &oversized, APP_ORIGIN, "application/json");
    assert!(too_big.starts_with("HTTP/1.1 413 Payload Too Large"));

    let token_bytes = [1u8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    let del_token = "0102030405060708090a0b0c0d0e0f10";
    let del_hash = sha256_hex(&token_bytes);
    let env_json = format!(
        r#"{{"v":1,"id":"m1","ephPub":{{"kty":"EC"}},"ct":"enc","del":{{"hash":"{del_hash}","ct":"sealed","iv":"iv1"}}}}"#
    );
    let queued = post_inbox(
        port,
        "vx_alice",
        &env_json,
        APP_ORIGIN,
        "application/json; charset=utf-8",
    );
    assert!(queued.starts_with("HTTP/1.1 200 OK"), "{queued}");
    assert!(queued.contains(r#""status":"queued""#));
    server.shutdown();

    let server2 = start_relay(RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    });
    let port2 = server2.port();
    let listed = send_http(
        port2,
        &format!("GET /inbox/vx_alice HTTP/1.1\r\nHost: 127.0.0.1:{port2}\r\n\r\n"),
    );
    assert!(listed.starts_with("HTTP/1.1 200 OK"));
    assert!(listed.contains(r#""id":"m1""#));

    let del_403 = send_http(
        port2,
        &format!(
            "DELETE /inbox/vx_alice/m1 HTTP/1.1\r\nHost: 127.0.0.1:{port2}\r\nOrigin: {APP_ORIGIN}\r\nX-Vox-Delete-Token: bad\r\n\r\n"
        ),
    );
    assert!(del_403.starts_with("HTTP/1.1 403 Forbidden"));

    let del_200 = send_http(
        port2,
        &format!(
            "DELETE /inbox/vx_alice/m1 HTTP/1.1\r\nHost: 127.0.0.1:{port2}\r\nOrigin: {APP_ORIGIN}\r\nX-Vox-Delete-Token: {del_token}\r\n\r\n"
        ),
    );
    assert!(del_200.starts_with("HTTP/1.1 200 OK"));
    assert!(del_200.contains(r#""status":"deleted""#));

    let del_404 = send_http(
        port2,
        &format!(
            "DELETE /inbox/vx_alice/m1 HTTP/1.1\r\nHost: 127.0.0.1:{port2}\r\nOrigin: {APP_ORIGIN}\r\n\r\n"
        ),
    );
    assert!(del_404.starts_with("HTTP/1.1 404 Not Found"));

    server2.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn rate_limiter_returns_429_with_retry_after_on_mailbox_burst() {
    let dir = unique_temp_dir("ratelimit");
    let cfg = RelayConfig {
        data_dir: dir.clone(),
        limits: RelayLimitsConfig {
            mailbox: RatePolicy {
                per_min: 60,
                burst: 2,
            },
            ..RelayLimitsConfig::default()
        },
        ..RelayConfig::default()
    };
    let server = start_relay(cfg);
    let port = server.port();

    let env = r#"{"v":1,"id":"rl1","ephPub":{"kty":"EC"},"ct":"enc"}"#;
    let r1 = post_inbox(port, "vx_bob", env, APP_ORIGIN, "application/json");
    let r2 = post_inbox(port, "vx_bob", env, APP_ORIGIN, "application/json");
    let r3 = post_inbox(port, "vx_bob", env, APP_ORIGIN, "application/json");
    assert!(r1.starts_with("HTTP/1.1 200 OK"));
    assert!(r2.starts_with("HTTP/1.1 200 OK"));
    assert!(r3.starts_with("HTTP/1.1 429 Too Many Requests"), "{r3}");
    assert!(r3.contains("Retry-After:"));

    let health = send_http(
        port,
        &format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
    );
    assert!(health.starts_with("HTTP/1.1 200 OK"));

    server.shutdown();
    let _ = fs::remove_dir_all(dir);
}
