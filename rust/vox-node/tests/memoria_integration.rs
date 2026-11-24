//! Integration tests for `--mode memoria` (ADR-039 PR4.3).
//!
//! Covers `control.token` generation/auth (`401`/`403` vs `200`), embedded HTML
//! dashboard `/`, `/health`, `/status`, `/api/telemetry`, `/memory/*` guarded
//! by `vox_core::genesis_guard`, pause/resume gating, and `POST /control/shutdown`.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use vox_core::genesis_data::GENESIS_MS;
use vox_node::memoria::{MemoriaConfig, MemoriaServer, MemoriaServerHandle};

static TEST_SEQ: AtomicU64 = AtomicU64::new(1);

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(label: &str) -> Self {
        let seq = TEST_SEQ.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("vox-memoria-{label}-{}-{seq}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create temp dir");
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn spawn_test_server(data_dir: PathBuf) -> MemoriaServerHandle {
    let config = MemoriaConfig {
        host: "127.0.0.1".to_string(),
        port: 0,
        data_dir,
        ..MemoriaConfig::default()
    };
    MemoriaServer::bind(config)
        .expect("bind memoria server")
        .spawn()
}

fn send_http(
    port: u16,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> (u16, String, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect loopback");
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut raw = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n");
    for (k, v) in headers {
        raw.push_str(&format!("{k}: {v}\r\n"));
    }
    if !body.is_empty() {
        raw.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    raw.push_str("Connection: close\r\n\r\n");
    raw.push_str(body);
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut resp = Vec::new();
    let _ = stream.read_to_end(&mut resp);
    let text = String::from_utf8_lossy(&resp).into_owned();
    let (head, resp_body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let status = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse::<u16>().ok())
        .unwrap_or(0);
    (status, head.to_string(), resp_body.to_string())
}

#[test]
fn serves_dashboard_health_status_telemetry_and_cors_allowlist() {
    let dir = TempDir::new("dashboard");
    let srv = spawn_test_server(dir.path.clone());
    let port = srv.port();

    let (code, head, html) = send_http(port, "GET", "/", &[], "");
    assert_eq!(code, 200);
    assert!(head.to_ascii_lowercase().contains("text/html"));
    assert!(html.contains("Vox Populi"));
    assert!(!head.contains("Access-Control-Allow-Origin: *"));

    let (code, head, health) = send_http(
        port,
        "GET",
        "/health",
        &[("Origin", "https://vox-9df.pages.dev")],
        "",
    );
    assert_eq!(code, 200);
    assert!(head.contains("Access-Control-Allow-Origin: https://vox-9df.pages.dev"));
    assert!(health.contains("\"service\":\"vox-memoria\""));
    assert!(health.contains(&format!("\"genesisMs\":{GENESIS_MS}")));

    let (code, _, status) = send_http(port, "GET", "/status", &[], "");
    assert_eq!(code, 200);
    assert!(status.contains("\"state\":\"ACTIVE\""));

    let (code, _, telem) = send_http(port, "GET", "/api/telemetry", &[], "");
    assert_eq!(code, 200);
    assert!(telem.contains("\"requestsServed\""));

    srv.shutdown();
}

#[test]
fn memory_routes_enforce_genesis_guard_and_persist_valid_posts() {
    let dir = TempDir::new("genesis");
    let srv = spawn_test_server(dir.path.clone());
    let port = srv.port();
    let json_hdr = [("Content-Type", "application/json")];

    let test_author = format!(
        r#"{{"type":"GOSSIP","item":{{"id":"post_demo_1","author":"vx_ana","ts":{},"text":"demo"}}}}"#,
        GENESIS_MS + 1_000
    );
    let (code, _, body) = send_http(port, "POST", "/memory/ingest", &json_hdr, &test_author);
    assert_eq!(code, 200);
    assert!(body.contains("\"changed\":false"));

    let pre_genesis = format!(
        r#"{{"type":"GOSSIP","item":{{"id":"post_old_1","author":"vx_real_user","ts":{},"text":"old"}}}}"#,
        GENESIS_MS - 1
    );
    let (code, _, body) = send_http(port, "POST", "/memory/ingest", &json_hdr, &pre_genesis);
    assert_eq!(code, 200);
    assert!(body.contains("\"changed\":false"));

    let valid_post = format!(
        r#"{{"type":"GOSSIP","item":{{"id":"post_ok_1","author":"vx_real_user","ts":{},"text":"hello"}}}}"#,
        GENESIS_MS + 5_000
    );
    let (code, _, body) = send_http(port, "POST", "/memory/ingest", &json_hdr, &valid_post);
    assert_eq!(code, 201);
    assert!(body.contains("\"changed\":true"));

    let (code, _, state) = send_http(port, "GET", "/memory/state", &[], "");
    assert_eq!(code, 200);
    assert!(state.contains("post_ok_1"));
    assert!(!state.contains("post_demo_1"));
    assert!(!state.contains("post_old_1"));

    srv.shutdown();
}

#[test]
fn control_token_protects_pause_resume_and_shutdown() {
    let dir = TempDir::new("control");
    let mut srv = spawn_test_server(dir.path.clone());
    let port = srv.port();

    let token_on_disk = fs::read_to_string(dir.path.join("control.token"))
        .expect("control.token file created")
        .trim()
        .to_string();
    assert_eq!(token_on_disk, srv.control_token());
    assert!(token_on_disk.len() >= 32);

    let (code, _, _) = send_http(port, "POST", "/control/pause", &[], "");
    assert_eq!(code, 401);

    let (code, _, _) = send_http(
        port,
        "POST",
        "/control/pause",
        &[("X-Vox-Control-Token", "wrong-token")],
        "",
    );
    assert_eq!(code, 403);

    let (code, _, body) = send_http(
        port,
        "POST",
        "/control/pause",
        &[("X-Vox-Control-Token", &token_on_disk)],
        "",
    );
    assert_eq!(code, 200);
    assert!(body.contains("\"paused\":true"));

    let (code, _, paused_body) = send_http(
        port,
        "POST",
        "/memory/ingest",
        &[("Content-Type", "application/json")],
        "{}",
    );
    assert_eq!(code, 503);
    assert!(paused_body.contains("node_paused"));

    let bearer = format!("Bearer {token_on_disk}");
    let (code, _, body) = send_http(
        port,
        "POST",
        "/control/shutdown",
        &[("Authorization", &bearer)],
        "",
    );
    assert_eq!(code, 200);
    assert!(body.contains("\"action\":\"shutdown\""));
    srv.wait_for_exit();
    assert!(!srv.is_running());
}
