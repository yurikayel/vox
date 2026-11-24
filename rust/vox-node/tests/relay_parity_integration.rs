//! Full HTTP contract parity integration tests for `vox-node --mode relay` (ADR-039 PR4.2b).

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vox_core::genesis_data::{GENESIS_MS, TEST_ROUTE_IDS};
use vox_node::cache_store::CacheStore;
use vox_node::relay::{RelayConfig, RelayServer, RelayServerHandle};
use vox_node::relay_store::sha256_hex;

const ORIGIN: &str = "https://yurikayel.github.io";
static SEQ: AtomicU64 = AtomicU64::new(1);

fn temp_dir(label: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("vox-parity-{label}-{ts}-{n}"))
}

fn start(mut cfg: RelayConfig) -> RelayServerHandle {
    cfg.host = "127.0.0.1".to_string();
    cfg.port = 0;
    RelayServer::bind(cfg).expect("bind relay").spawn()
}

fn send(port: u16, req: &str) -> String {
    let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    s.set_read_timeout(Some(Duration::from_secs(3)))
        .expect("timeout");
    s.write_all(req.as_bytes()).expect("write");
    let mut buf = Vec::new();
    let _ = s.read_to_end(&mut buf);
    String::from_utf8_lossy(&buf).into_owned()
}

fn get(port: u16, path: &str) -> String {
    send(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {ORIGIN}\r\n\r\n"),
    )
}

fn post(port: u16, path: &str, body: &str, extra_hdr: &str) -> String {
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {ORIGIN}\r\n\
         Content-Type: application/json\r\n{extra_hdr}Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    send(port, &req)
}

fn delete_req(port: u16, path: &str) -> String {
    send(
        port,
        &format!("DELETE {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {ORIGIN}\r\n\r\n"),
    )
}

#[test]
fn tx_and_mirror_verify_sha256_sidecars_and_reject_tampering() {
    let dir = temp_dir("cache");
    let tx_id = "A".repeat(43);
    let cache = CacheStore::new(dir.clone(), None);
    assert!(cache.store_tx(&tx_id, br#"{"tx":"ok"}"#).expect("store tx"));
    let srv = start(RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    });
    let port = srv.port();

    assert!(get(port, "/tx/short").starts_with("HTTP/1.1 400"));
    assert!(get(port, &format!("/tx/{}", "B".repeat(43))).starts_with("HTTP/1.1 404"));
    let hit = get(port, &format!("/tx/{tx_id}"));
    assert!(hit.starts_with("HTTP/1.1 200 OK") && hit.contains("X-Vox-Cache: HIT"));

    assert!(post(port, "/vox/mirror", r#"{"topics":"bad"}"#, "").starts_with("HTTP/1.1 400"));
    let mir = post(
        port,
        "/vox/mirror",
        r#"{"communityId":"comm_c1","topics":[]}"#,
        "",
    );
    assert!(mir.starts_with("HTTP/1.1 200 OK") && mir.contains(r#""status":"mirrored""#));
    let idx = get(port, "/vox/index/comm_c1.json");
    assert!(idx.starts_with("HTTP/1.1 200 OK") && idx.contains("X-Vox-Cache: HIT"));

    fs::write(dir.join("index_comm_c1.json"), b"tampered").expect("tamper");
    assert!(get(port, "/vox/index/comm_c1.json").starts_with("HTTP/1.1 404"));
    let health = get(port, "/health");
    assert!(health.contains(r#""failures":1"#));

    srv.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn blind_relay_envelopes_snapshots_auth_conflict_jump_and_prune() {
    let dir = temp_dir("blind");
    let srv = start(RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    });
    let port = srv.port();

    assert!(post(port, "/relay/envelope/ch1", r#"{"serial":-1}"#, "").starts_with("HTTP/1.1 400"));
    let e1 = r#"{"sender":"vx_a","sig":"s1","serial":1,"timestamp":1000}"#;
    let e2 = r#"{"sender":"vx_a","sig":"s2","serial":6,"timestamp":2000}"#;
    assert!(post(port, "/relay/envelope/ch1", e1, "").starts_with("HTTP/1.1 201"));
    assert!(post(port, "/relay/envelope/ch1", e2, "").starts_with("HTTP/1.1 201"));
    let filtered = get(port, "/relay/envelope/ch1?since_serial=1");
    assert!(filtered.contains(r#""sig":"s2""#) && !filtered.contains(r#""sig":"s1""#));

    let proof = format!("X-Vox-Snapshot-Proof: {}\r\n", "01".repeat(32));
    let snap = r#"{"snapshot":{"items":[1]},"epoch":1,"coveredSerial":5}"#;
    assert!(post(port, "/relay/snapshot/ch1", snap, &proof).starts_with("HTTP/1.1 201"));
    let idem = post(port, "/relay/snapshot/ch1", snap, &proof);
    assert!(idem.starts_with("HTTP/1.1 200 OK") && idem.contains(r#""idempotent":true"#));
    assert!(post(
        port,
        "/relay/snapshot/ch1",
        r#"{"snapshot":{"k":1},"epoch":2}"#,
        ""
    )
    .starts_with("HTTP/1.1 403"));
    assert!(post(
        port,
        "/relay/snapshot/ch1",
        r#"{"snapshot":{"items":[2]},"epoch":1,"coveredSerial":5}"#,
        &proof
    )
    .starts_with("HTTP/1.1 409"));
    assert!(post(
        port,
        "/relay/snapshot/ch1",
        r#"{"snapshot":{"items":[3]},"epoch":30,"coveredSerial":5}"#,
        &proof
    )
    .starts_with("HTTP/1.1 400"));

    let after_prune = get(port, "/relay/envelope/ch1?since=0");
    assert!(!after_prune.contains(r#""sig":"s1""#) && after_prune.contains(r#""sig":"s2""#));
    assert!(get(port, "/relay/snapshot/ch1").starts_with("HTTP/1.1 200 OK"));

    srv.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn memory_genesis_guard_blobs_and_vault_v2_enforce_contract() {
    let dir = temp_dir("memory");
    let srv = start(RelayConfig {
        data_dir: dir.clone(),
        ..RelayConfig::default()
    });
    let port = srv.port();
    let test_id = TEST_ROUTE_IDS[0];
    let after = GENESIS_MS + 60_000;
    let before = GENESIS_MS - 60_000;

    let sync_body = format!(
        r#"{{"since":0,"posts":[{{"id":"old","author":"vx_real","ts":{before}}},{{"id":"tst","author":"{test_id}","ts":{after}}},{{"id":"ok1","author":"vx_real","ts":{after}}}],"profiles":[{{"routeId":"{test_id}","name":"bad"}},{{"routeId":"vx_real","name":"ok"}}]}}"#
    );
    let synced = post(port, "/memory/sync", &sync_body, "");
    assert!(synced.starts_with("HTTP/1.1 200 OK") && synced.contains(r#""ingestedCount":2"#));
    assert!(
        synced.contains(r#""ok1""#) && !synced.contains(r#""old""#) && !synced.contains(test_id)
    );

    let blob_data = "hello-vox-blob";
    let blob_hash = sha256_hex(blob_data.as_bytes());
    let blob_ev = format!(r#"{{"type":"MEDIA_BLOB","hash":"{blob_hash}","data":"{blob_data}"}}"#);
    assert!(post(port, "/memory/ingest", &blob_ev, "").starts_with("HTTP/1.1 201"));
    assert!(get(port, &format!("/memory/blob/{blob_hash}")).starts_with("HTTP/1.1 200 OK"));

    let bad_v = r#"{"record":{"v":2,"salt":"01","iter":500,"ciphertext":"aa"}}"#;
    assert!(post(port, "/memory/vault/vx_k1", bad_v, "").starts_with("HTTP/1.1 400"));
    let v_rec = r#"{"v":2,"salt":"01020304","iter":100000,"iv":"0202","ciphertext":"0303"}"#;
    assert!(post(
        port,
        "/memory/vault/vx_k1",
        &format!(r#"{{"record":{v_rec}}}"#),
        ""
    )
    .starts_with("HTTP/1.1 403"));
    let tok = "f0".repeat(32);
    assert!(post(
        port,
        "/memory/vault/vx_k1",
        &format!(r#"{{"record":{v_rec},"ownerToken":"{tok}"}}"#),
        ""
    )
    .starts_with("HTTP/1.1 200 OK"));
    let got = get(port, "/memory/vault/vx_k1");
    assert!(got.starts_with("HTTP/1.1 200 OK") && !got.contains("ownerHash"));

    srv.shutdown();
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn p2p_seeder_beacon_oauth_gap_and_deterministic_ttl_purge() {
    let dir = temp_dir("p2p");
    let srv = start(RelayConfig {
        data_dir: dir.clone(),
        inbox_ttl_secs: 10,
        ..RelayConfig::default()
    });
    let port = srv.port();

    let h = "a".repeat(64);
    assert!(get(port, &format!("/p2p/seed/{h}")).starts_with("HTTP/1.1 404"));
    assert!(post(port, "/p2p/seed", "{}", "").starts_with("HTTP/1.1 400"));
    assert!(srv.authorize_p2p_hash(&h));
    let seed_body = format!(r#"{{"hash":"{h}","sizeBytes":128,"mimeType":"text/plain"}}"#);
    assert!(post(port, "/p2p/seed", &seed_body, "").starts_with("HTTP/1.1 201"));
    assert!(get(port, &format!("/p2p/seed/{h}")).starts_with("HTTP/1.1 200 OK"));
    assert!(delete_req(port, &format!("/p2p/seed/{h}")).starts_with("HTTP/1.1 200 OK"));

    let beacon = r#"{"nodeId":"n1","protocol":"VOX-PEER-v1","httpPort":3920}"#;
    assert!(post(port, "/peer/beacon", beacon, "").starts_with("HTTP/1.1 201"));
    assert!(get(port, "/p2p/peers").contains(r#""nodeId":"n1""#));

    assert!(post(port, "/oauth/exchange", "{}", "").starts_with("HTTP/1.1 400"));
    let big_oa = format!(r#"{{"code":"{}"}}"#, "x".repeat(9000));
    assert!(post(port, "/oauth/exchange", &big_oa, "").starts_with("HTTP/1.1 413"));
    assert!(post(
        port,
        "/oauth/exchange",
        r#"{"provider":"github","code":"abc"}"#,
        ""
    )
    .starts_with("HTTP/1.1 501"));

    let env = r#"{"v":1,"id":"p1","ephPub":{"kty":"EC"},"ct":"enc"}"#;
    assert!(post(port, "/inbox/vx_p", env, "").starts_with("HTTP/1.1 200 OK"));
    let b_env = r#"{"sender":"vx_a","sig":"s1","serial":1,"timestamp":1000}"#;
    assert!(post(port, "/relay/envelope/ch_p", b_env, "").starts_with("HTTP/1.1 201"));
    let future = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() + 10 * 86_400)
        .unwrap_or(u64::MAX / 2);
    let report = srv.purge_expired_at(future);
    assert_eq!(report.inbox_removed, 1);
    assert_eq!(report.blind_removed, 1);
    assert_eq!(report.peers_removed, 1);

    srv.shutdown();
    let _ = fs::remove_dir_all(dir);
}
