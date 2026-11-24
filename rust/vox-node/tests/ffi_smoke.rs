//! Smoke tests for the embedded loopback node facade and C-ABI FFI exports (ADR-039 PR4.4).

use std::ffi::{CStr, CString};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::ptr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vox_node::ffi::{
    vox_node_free_string, vox_node_health_json, vox_node_port, vox_node_start, vox_node_stop,
    EmbeddedMode, EmbeddedNode, FFI_ALREADY_STOPPED, FFI_ERR_ALREADY_RUNNING, FFI_ERR_INVALID_ARG,
    FFI_OK,
};
use vox_node::json::JsonValue;

fn unique_temp_dir(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("vox-ffi-{tag}-{}-{nanos}", std::process::id()));
    let _ = fs::create_dir_all(&dir);
    dir
}

fn http_get_health(port: u16) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect loopback");
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let req =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).expect("write request");
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf
}

#[allow(unsafe_code)]
fn read_and_free_health_json() -> String {
    let raw = vox_node_health_json();
    assert!(!raw.is_null(), "vox_node_health_json must return non-null");
    // SAFETY: `raw` was just returned non-null by `vox_node_health_json` and is freed below.
    let text = unsafe { CStr::from_ptr(raw) }
        .to_str()
        .expect("health json must be valid UTF-8")
        .to_string();
    // SAFETY: `raw` was allocated by `vox_node_health_json` and is freed exactly once.
    unsafe { vox_node_free_string(raw) };
    text
}

fn json_str<'a>(val: &'a JsonValue, key: &str) -> Option<&'a str> {
    val.get(key).and_then(JsonValue::as_str)
}

#[test]
fn embedded_node_runs_all_modes_on_ephemeral_loopback_ports() {
    for mode in [
        EmbeddedMode::Signaling,
        EmbeddedMode::Relay,
        EmbeddedMode::Memoria,
    ] {
        let dir = unique_temp_dir(mode.as_str());
        let node = EmbeddedNode::start(mode, 0, Some(dir.clone())).expect("start embedded node");
        let port = node.port();
        assert!(port > 0, "ephemeral port must be non-zero");
        assert_eq!(node.mode(), mode);

        let health = node.health_json();
        let parsed = JsonValue::parse(&health).expect("valid embedded health json");
        assert_eq!(json_str(&parsed, "status"), Some("ok"));
        assert_eq!(json_str(&parsed, "mode"), Some(mode.as_str()));
        assert_eq!(json_str(&parsed, "genesis_guard"), Some("ok"));

        let http_resp = http_get_health(port);
        assert!(
            http_resp.starts_with("HTTP/1.1 200"),
            "expected HTTP 200 on /health for {}: {http_resp}",
            mode.as_str()
        );

        node.stop();
        let _ = fs::remove_dir_all(&dir);
    }
}

#[test]
#[allow(unsafe_code)]
fn c_abi_lifecycle_health_json_and_null_safety() {
    // SAFETY: Null pointer is explicitly documented as a safe no-op.
    unsafe { vox_node_free_string(ptr::null_mut()) };
    assert_eq!(vox_node_port(), 0);
    assert_eq!(vox_node_stop(), FFI_ALREADY_STOPPED);

    let stopped = JsonValue::parse(&read_and_free_health_json()).expect("valid stopped json");
    assert_eq!(json_str(&stopped, "status"), Some("stopped"));

    let bad_mode = CString::new("invalid-mode").expect("cstring");
    // SAFETY: `bad_mode` is a valid NUL-terminated C string; `data_dir` is null.
    assert_eq!(
        unsafe { vox_node_start(bad_mode.as_ptr(), ptr::null(), 0) },
        FFI_ERR_INVALID_ARG
    );

    let mode = CString::new("memoria").expect("cstring");
    let dir = unique_temp_dir("c-abi");
    let dir_c = CString::new(dir.to_string_lossy().as_ref()).expect("cstring");

    // SAFETY: `mode` and `dir_c` are valid NUL-terminated C strings.
    assert_eq!(
        unsafe { vox_node_start(mode.as_ptr(), dir_c.as_ptr(), 0) },
        FFI_OK
    );
    let port = vox_node_port();
    assert!(port > 0, "C-ABI bound port must be > 0");

    // SAFETY: Re-starting while running must return FFI_ERR_ALREADY_RUNNING.
    assert_eq!(
        unsafe { vox_node_start(mode.as_ptr(), dir_c.as_ptr(), 0) },
        FFI_ERR_ALREADY_RUNNING
    );

    let running = JsonValue::parse(&read_and_free_health_json()).expect("valid running json");
    assert_eq!(json_str(&running, "status"), Some("ok"));
    assert_eq!(json_str(&running, "mode"), Some("memoria"));
    assert!(http_get_health(port).starts_with("HTTP/1.1 200"));

    assert_eq!(vox_node_stop(), FFI_OK);
    assert_eq!(vox_node_port(), 0);
    assert_eq!(vox_node_stop(), FFI_ALREADY_STOPPED);
    let _ = fs::remove_dir_all(&dir);
}
