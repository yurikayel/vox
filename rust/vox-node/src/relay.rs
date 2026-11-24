//! Pure-`std` HTTP relay server (`--mode relay`, ADR-039 PR4.2b).
//!
//! Implements the Vox relay HTTP contract: `/health`, `/tx/<txId>`, `/vox/index/<commId>.json`,
//! `/vox/mirror` (with `.sha256` sidecars), `/inbox/*`, `/relay/envelope/*`, `/relay/snapshot/*`
//! (RFC 0002), `/memory/*` (with `vox_core::genesis_guard` and v2 vaults), `/p2p/*`,
//! `/peer/beacon`, deterministic TTL purging, Host/Origin/CORS guards, rate limiting, and `T31`
//! rejected-body draining.

use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use vox_core::genesis_data::GENESIS_MS;

use crate::blind_store::{
    BlindConfig, BlindError, BlindStore, DEFAULT_ENVELOPE_LIMIT, MAX_BLIND_ENVELOPE_SIZE,
    MAX_SNAPSHOT_SIZE,
};
use crate::cache_store::{
    is_tx_id, validate_mirror_body, CacheStore, DEFAULT_MAX_CACHE_BYTES, MAX_MIRROR_BODY_BYTES,
};
use crate::guard::GuardPolicy;
use crate::http::{parse_http_request, read_handshake_request, HttpRequest};
use crate::json::JsonValue;
use crate::limits::{ConnectionSlots, RelayLimiter, RelayLimitsConfig};
use crate::memory_store::{MemoryError, MemoryStore, VaultOutcome, MAX_MEMORY_PAYLOAD_BYTES};
use crate::p2p_store::{P2pError, P2pStore, MAX_P2P_PAYLOAD_BYTES};
use crate::relay_store::{
    DeleteOutcome, InboxStore, StoreError, DEFAULT_INBOX_TTL_SECS, MAX_ENVELOPE_SIZE,
};

/// Default listen host in relay mode (`127.0.0.1`, Cold Readiness).
pub const DEFAULT_RELAY_HOST: &str = "127.0.0.1";
/// Default listen port in relay mode (`3920`, matching `relay/server.py`).
pub const DEFAULT_RELAY_PORT: u16 = 3920;
/// Default per-connection socket read timeout (`10 s`, matching `VOX_RELAY_SOCKET_TIMEOUT`).
pub const DEFAULT_SOCKET_TIMEOUT: Duration = Duration::from_secs(10);
/// Default periodic purge interval in seconds (`0` disables background sweeper).
pub const DEFAULT_PURGE_INTERVAL_SECS: u64 = 900;

const RELAY_API_VERSION: &str = "0.2.1";
const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");
const REJECTED_DRAIN_MAX: usize = 1024 * 1024;
const REJECTED_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_OAUTH_BODY_BYTES: usize = 8192;

/// Summary of entries removed during a deterministic TTL purge pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PurgeReport {
    /// Expired inbox envelope files removed.
    pub inbox_removed: usize,
    /// Expired blind relay envelope files removed.
    pub blind_removed: usize,
    /// Expired in-memory P2P peer beacons removed.
    pub peers_removed: usize,
}

/// Runtime configuration for the HTTP relay server (`--mode relay`).
#[derive(Debug, Clone)]
pub struct RelayConfig {
    /// Interface address to bind (defaults to `127.0.0.1`).
    pub host: String,
    /// TCP port to bind (`0` selects an ephemeral OS port).
    pub port: u16,
    /// Base data/cache directory for relay persistence.
    pub data_dir: PathBuf,
    /// Optional explicit inbox directory override (`VOX_RELAY_INBOX_DIR`).
    pub inbox_dir: Option<PathBuf>,
    /// Optional explicit blind relay directory override (`VOX_RELAY_BLIND_DIR`).
    pub blind_dir: Option<PathBuf>,
    /// Optional explicit central memory directory override (`VOX_CENTRAL_MEMORY_DIR`).
    pub memory_dir: Option<PathBuf>,
    /// Optional cache disk quota in bytes (`None` = unlimited).
    pub max_cache_bytes: Option<u64>,
    /// Socket read deadline for headers and request bodies.
    pub socket_timeout: Duration,
    /// Inbox envelope TTL in seconds (default 72 hours).
    pub inbox_ttl_secs: u64,
    /// Periodic TTL purge interval in seconds (`0` disables background thread).
    pub purge_interval_secs: u64,
    /// Blind relay snapshot auth and retention policy.
    pub blind: BlindConfig,
    /// Host/Origin/CORS security policy.
    pub guard: GuardPolicy,
    /// Rate-limiting and connection-cap configuration.
    pub limits: RelayLimitsConfig,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            host: DEFAULT_RELAY_HOST.to_string(),
            port: DEFAULT_RELAY_PORT,
            data_dir: env::temp_dir().join("vox-relay-data"),
            inbox_dir: None,
            blind_dir: None,
            memory_dir: None,
            max_cache_bytes: Some(DEFAULT_MAX_CACHE_BYTES),
            socket_timeout: DEFAULT_SOCKET_TIMEOUT,
            inbox_ttl_secs: DEFAULT_INBOX_TTL_SECS,
            purge_interval_secs: 0,
            blind: BlindConfig::default(),
            guard: GuardPolicy::default(),
            limits: RelayLimitsConfig::default(),
        }
    }
}

impl RelayConfig {
    /// Builds a relay configuration from environment variables with optional CLI overrides.
    pub fn from_env(
        host_override: Option<String>,
        port_override: Option<u16>,
        data_dir_override: Option<PathBuf>,
    ) -> Self {
        let host = host_override
            .or_else(|| env_non_empty("HOST"))
            .unwrap_or_else(|| DEFAULT_RELAY_HOST.to_string());
        let port = port_override
            .or_else(|| env_u16("VOX_RELAY_PORT"))
            .or_else(|| env_u16("PORT"))
            .unwrap_or(DEFAULT_RELAY_PORT);
        let data_dir = data_dir_override
            .clone()
            .or_else(|| env_non_empty("VOX_RELAY_CACHE_DIR").map(PathBuf::from))
            .unwrap_or_else(|| env::temp_dir().join("vox-relay-data"));
        let use_env_dirs = data_dir_override.is_none();
        let timeout_secs = env_u64("VOX_RELAY_SOCKET_TIMEOUT")
            .filter(|&s| s > 0)
            .unwrap_or(DEFAULT_SOCKET_TIMEOUT.as_secs());
        Self {
            host,
            port,
            data_dir,
            inbox_dir: use_env_dirs
                .then(|| env_non_empty("VOX_RELAY_INBOX_DIR").map(PathBuf::from))
                .flatten(),
            blind_dir: use_env_dirs
                .then(|| env_non_empty("VOX_RELAY_BLIND_DIR").map(PathBuf::from))
                .flatten(),
            memory_dir: use_env_dirs
                .then(|| env_non_empty("VOX_CENTRAL_MEMORY_DIR").map(PathBuf::from))
                .flatten(),
            max_cache_bytes: resolve_max_cache_bytes(),
            socket_timeout: Duration::from_secs(timeout_secs),
            inbox_ttl_secs: DEFAULT_INBOX_TTL_SECS,
            purge_interval_secs: env_u64("VOX_RELAY_PURGE_INTERVAL_SECONDS")
                .unwrap_or(DEFAULT_PURGE_INTERVAL_SECS),
            blind: BlindConfig::from_env(),
            guard: GuardPolicy::from_env(),
            limits: RelayLimitsConfig::from_env(),
        }
    }

    fn resolved_inbox_dir(&self) -> PathBuf {
        self.inbox_dir
            .clone()
            .unwrap_or_else(|| self.data_dir.join("inbox"))
    }

    fn resolved_blind_dir(&self) -> PathBuf {
        self.blind_dir
            .clone()
            .unwrap_or_else(|| self.data_dir.join("blind_relay"))
    }

    fn resolved_memory_dir(&self) -> PathBuf {
        self.memory_dir
            .clone()
            .unwrap_or_else(|| self.data_dir.join("central_memory"))
    }
}

fn resolve_max_cache_bytes() -> Option<u64> {
    match env_u64("VOX_RELAY_MAX_CACHE_MB") {
        Some(0) => None,
        Some(mb) => Some(mb.saturating_mul(1024 * 1024)),
        None => Some(DEFAULT_MAX_CACHE_BYTES),
    }
}

fn env_non_empty(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn env_u16(name: &str) -> Option<u16> {
    env_non_empty(name).and_then(|s| s.parse::<u16>().ok())
}

fn env_u64(name: &str) -> Option<u64> {
    env_non_empty(name).and_then(|s| s.parse::<u64>().ok())
}

struct RelayContext {
    config: RelayConfig,
    cache: CacheStore,
    store: InboxStore,
    blind: BlindStore,
    memory: MemoryStore,
    p2p: P2pStore,
    limiter: RelayLimiter,
    slots: ConnectionSlots,
}

impl RelayContext {
    fn purge_expired_at(&self, now_secs: u64) -> PurgeReport {
        let inbox_removed = purge_inbox_root(self.store.root(), now_secs);
        let blind_removed = self.blind.purge_expired_at(now_secs);
        let peers_removed = self
            .p2p
            .prune_expired_peers_at(now_secs.saturating_mul(1000));
        PurgeReport {
            inbox_removed,
            blind_removed,
            peers_removed,
        }
    }
}

/// Running HTTP relay server bound to a local TCP socket.
pub struct RelayServer {
    listener: TcpListener,
    local_addr: SocketAddr,
    ctx: Arc<RelayContext>,
    stop: Arc<AtomicBool>,
}

/// Handle to a background relay server thread with graceful shutdown and purge support.
pub struct RelayServerHandle {
    local_addr: SocketAddr,
    ctx: Arc<RelayContext>,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
    purge_join: Option<JoinHandle<()>>,
}

impl RelayServerHandle {
    /// Returns the actual bound socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Returns the actual bound TCP port.
    pub fn port(&self) -> u16 {
        self.local_addr.port()
    }

    /// Runs one deterministic TTL purge pass at `now_secs` across inbox, blind relay, and peers.
    pub fn purge_expired_at(&self, now_secs: u64) -> PurgeReport {
        self.ctx.purge_expired_at(now_secs)
    }

    /// Pre-authorizes a 64-hex SHA-256 hash in the P2P seeder allowlist.
    pub fn authorize_p2p_hash(&self, hash: &str) -> bool {
        self.ctx.p2p.authorize_hash(hash)
    }

    /// Signals the accept loop and purge sweeper to stop and joins both threads cleanly.
    pub fn shutdown(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.local_addr);
        if let Some(handle) = self.join.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.purge_join.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for RelayServerHandle {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

impl RelayServer {
    /// Binds a TCP listener for the HTTP relay server using `config`.
    pub fn bind(config: RelayConfig) -> io::Result<Self> {
        let listener = TcpListener::bind((config.host.as_str(), config.port))?;
        let local_addr = listener.local_addr()?;
        let cache = CacheStore::new(config.data_dir.clone(), config.max_cache_bytes);
        let _ = cache.ensure_dir();
        let store = InboxStore::new(config.resolved_inbox_dir());
        let blind = BlindStore::new(config.resolved_blind_dir(), config.blind);
        let memory = MemoryStore::new(config.resolved_memory_dir());
        let p2p = P2pStore::default();
        let limiter = RelayLimiter::new(config.limits);
        let slots = ConnectionSlots::new(config.limits.max_connections);
        let ctx = Arc::new(RelayContext {
            config,
            cache,
            store,
            blind,
            memory,
            p2p,
            limiter,
            slots,
        });
        Ok(Self {
            listener,
            local_addr,
            ctx,
            stop: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Returns the bound local socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Runs the blocking accept loop until stopped.
    pub fn serve_forever(self) {
        for incoming in self.listener.incoming() {
            if self.stop.load(Ordering::Acquire) {
                break;
            }
            let Ok(stream) = incoming else {
                continue;
            };
            let Some(slot_guard) = self.ctx.slots.try_acquire() else {
                drop(stream);
                continue;
            };
            let peer_addr = stream.peer_addr().ok();
            let ctx = Arc::clone(&self.ctx);
            let _ = thread::Builder::new()
                .name("vox-relay-http".to_string())
                .spawn(move || {
                    let _guard = slot_guard;
                    handle_http_connection(stream, peer_addr, &ctx);
                });
        }
    }

    /// Spawns the accept loop (and optional purge sweeper) on background threads.
    pub fn spawn(self) -> RelayServerHandle {
        let local_addr = self.local_addr;
        let stop = Arc::clone(&self.stop);
        let ctx = Arc::clone(&self.ctx);
        let purge_join = spawn_purge_sweeper(
            Arc::clone(&ctx),
            Arc::clone(&stop),
            ctx.config.purge_interval_secs,
        );
        let join = thread::Builder::new()
            .name("vox-relay-accept".to_string())
            .spawn(move || self.serve_forever())
            .ok();
        RelayServerHandle {
            local_addr,
            ctx,
            stop,
            join,
            purge_join,
        }
    }
}

fn spawn_purge_sweeper(
    ctx: Arc<RelayContext>,
    stop: Arc<AtomicBool>,
    interval_secs: u64,
) -> Option<JoinHandle<()>> {
    if interval_secs == 0 {
        return None;
    }
    let step = Duration::from_millis(200);
    let interval = Duration::from_secs(interval_secs);
    thread::Builder::new()
        .name("vox-relay-purge".to_string())
        .spawn(move || {
            let mut last_run = Instant::now();
            while !stop.load(Ordering::Acquire) {
                thread::sleep(step);
                if stop.load(Ordering::Acquire) {
                    break;
                }
                if last_run.elapsed() >= interval {
                    let _ = ctx.purge_expired_at(unix_now_secs());
                    last_run = Instant::now();
                }
            }
        })
        .ok()
}

struct RelayReply {
    status: u16,
    reason: &'static str,
    body: Vec<u8>,
    extra_headers: Vec<String>,
    drain_unread: bool,
}

impl RelayReply {
    fn json(status: u16, reason: &'static str, body: String) -> Self {
        Self {
            status,
            reason,
            body: body.into_bytes(),
            extra_headers: Vec::new(),
            drain_unread: status >= 400,
        }
    }

    fn raw_json(status: u16, reason: &'static str, body: Vec<u8>) -> Self {
        Self {
            status,
            reason,
            body,
            extra_headers: Vec::new(),
            drain_unread: status >= 400,
        }
    }

    fn empty(status: u16, reason: &'static str) -> Self {
        Self {
            status,
            reason,
            body: Vec::new(),
            extra_headers: Vec::new(),
            drain_unread: false,
        }
    }

    fn with_header(mut self, header: String) -> Self {
        self.extra_headers.push(header);
        self
    }

    fn into_head(mut self) -> Self {
        self.body.clear();
        self
    }
}

fn handle_http_connection(mut stream: TcpStream, peer: Option<SocketAddr>, ctx: &RelayContext) {
    let Ok(Some(raw)) = read_handshake_request(&mut stream, ctx.config.socket_timeout) else {
        return;
    };
    let head_end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|pos| pos + 4)
        .unwrap_or(raw.len());
    let req = parse_http_request(&raw[..head_end]);
    let initial_body = &raw[head_end..];
    let content_length = parse_content_length(&req);
    let reply = dispatch_request(&mut stream, &req, initial_body, peer, ctx);
    let encoded = format_relay_response(&reply, req.header("origin"), &ctx.config.guard);
    let _ = stream.write_all(&encoded);
    let _ = stream.flush();
    if reply.drain_unread && content_length > initial_body.len() {
        let remaining = content_length - initial_body.len();
        drain_rejected_body(&mut stream, remaining);
    }
}

fn dispatch_request(
    stream: &mut TcpStream,
    req: &HttpRequest,
    initial_body: &[u8],
    peer: Option<SocketAddr>,
    ctx: &RelayContext,
) -> RelayReply {
    if req.method == "OPTIONS" {
        return RelayReply::empty(204, "No Content");
    }
    if let Some(rejected) = check_guards(req, peer, ctx) {
        return rejected;
    }
    let clean_path = normalize_path(&req.path);
    match req.method.as_str() {
        "GET" | "HEAD" => {
            let reply = route_read(clean_path, &req.path, ctx);
            if req.method == "HEAD" && reply.status == 200 {
                reply.into_head()
            } else {
                reply
            }
        }
        "POST" => route_post(clean_path, req, initial_body, stream, ctx),
        "DELETE" => route_delete(clean_path, req, ctx),
        _ => RelayReply::json(
            405,
            "Method Not Allowed",
            r#"{"error":"method_not_allowed"}"#.to_string(),
        ),
    }
}

fn check_guards(
    req: &HttpRequest,
    peer: Option<SocketAddr>,
    ctx: &RelayContext,
) -> Option<RelayReply> {
    if !ctx
        .config
        .guard
        .host_allowed(req.header("host"), &ctx.config.host)
    {
        return Some(RelayReply::json(
            421,
            "Misdirected Request",
            r#"{"error":"host_not_allowed"}"#.to_string(),
        ));
    }
    if !matches!(req.method.as_str(), "POST" | "DELETE") {
        return None;
    }
    if !ctx.config.guard.ws_origin_allowed(req.header("origin")) {
        return Some(RelayReply::json(
            403,
            "Forbidden",
            r#"{"error":"origin_not_allowed"}"#.to_string(),
        ));
    }
    if req.method == "POST" && !is_json_content_type(req.header("content-type")) {
        return Some(RelayReply::json(
            415,
            "Unsupported Media Type",
            r#"{"error":"unsupported_media_type"}"#.to_string(),
        ));
    }
    let peer_ip = peer
        .map(|a| a.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let client_ip = ctx
        .limiter
        .resolve_client_ip(peer_ip, req.header("x-forwarded-for"));
    let clean_path = normalize_path(&req.path);
    let wait = ctx.limiter.check_http_write(clean_path, &client_ip);
    if wait > 0 {
        return Some(
            RelayReply::json(
                429,
                "Too Many Requests",
                r#"{"error":"rate_limited"}"#.to_string(),
            )
            .with_header(format!("Retry-After: {wait}")),
        );
    }
    None
}

fn route_read(clean_path: &str, raw_path: &str, ctx: &RelayContext) -> RelayReply {
    match clean_path {
        "" | "/" | "/health" => RelayReply::json(200, "OK", build_health_json(ctx)),
        "/status" | "/ping" => RelayReply::json(
            200,
            "OK",
            format!(r#"{{"status":"ok","service":"vox-relay","version":"{RELAY_API_VERSION}"}}"#),
        ),
        "/version" => RelayReply::json(
            200,
            "OK",
            format!(
                r#"{{"service":"vox-relay","version":"{RELAY_API_VERSION}","package":"{PKG_NAME}","packageVersion":"{PKG_VERSION}"}}"#
            ),
        ),
        _ if clean_path.starts_with("/tx/") => handle_tx_get(&clean_path[4..], ctx),
        _ if clean_path.starts_with("/vox/index/") && clean_path.ends_with(".json") => {
            let slug = &clean_path["/vox/index/".len()..clean_path.len() - 5];
            handle_index_get(slug, ctx)
        }
        _ if clean_path.starts_with("/inbox/") => handle_inbox_get(clean_path, ctx),
        _ if clean_path.starts_with("/relay/") => handle_blind_get(clean_path, raw_path, ctx),
        _ if clean_path == "/memory" || clean_path.starts_with("/memory/") => {
            handle_memory_get(clean_path, raw_path, ctx)
        }
        _ if clean_path.starts_with("/p2p/") || clean_path == "/peer/beacon" => {
            handle_p2p_get(clean_path, ctx)
        }
        _ => not_found(),
    }
}

fn handle_tx_get(tx_id: &str, ctx: &RelayContext) -> RelayReply {
    if !is_tx_id(tx_id) {
        return RelayReply::json(400, "Bad Request", json_error("TX ID invalido"));
    }
    match ctx.cache.read_tx(tx_id) {
        Some(data) => {
            RelayReply::raw_json(200, "OK", data).with_header("X-Vox-Cache: HIT".to_string())
        }
        None => RelayReply::json(
            404,
            "Not Found",
            json_error("Transacao nao encontrada no cache local"),
        ),
    }
}

fn handle_index_get(slug: &str, ctx: &RelayContext) -> RelayReply {
    match ctx.cache.read_index(slug) {
        Some(data) => {
            RelayReply::raw_json(200, "OK", data).with_header("X-Vox-Cache: HIT".to_string())
        }
        None => RelayReply::json(
            404,
            "Not Found",
            json_error("Espelho de comunidade nao encontrado"),
        ),
    }
}

fn handle_inbox_get(clean_path: &str, ctx: &RelayContext) -> RelayReply {
    let addr = first_segment(clean_path, "/inbox/");
    let list = ctx.store.list_envelopes(addr);
    let obj = JsonValue::Object(vec![("envelopes".to_string(), JsonValue::Array(list))]);
    RelayReply::json(200, "OK", obj.to_json_string())
}

fn handle_blind_get(clean_path: &str, raw_path: &str, ctx: &RelayContext) -> RelayReply {
    if clean_path.starts_with("/relay/envelope/") {
        let ch = first_segment(clean_path, "/relay/envelope/");
        let since = query_param_u64(raw_path, "since", 0);
        let since_serial = query_param_u64(raw_path, "since_serial", 0);
        let list = ctx
            .blind
            .list_envelopes(ch, since, since_serial, DEFAULT_ENVELOPE_LIMIT);
        return RelayReply::json(200, "OK", JsonValue::Array(list).to_json_string());
    }
    if clean_path.starts_with("/relay/snapshot/") {
        let ch = first_segment(clean_path, "/relay/snapshot/");
        return match ctx.blind.get_latest_snapshot(ch) {
            Some(snap) => RelayReply::json(200, "OK", snap.to_json_string()),
            None => RelayReply::json(404, "Not Found", json_error("Snapshot nao encontrado")),
        };
    }
    not_found()
}

fn handle_memory_get(clean_path: &str, raw_path: &str, ctx: &RelayContext) -> RelayReply {
    match clean_path {
        "/memory" | "/memory/status" => {
            RelayReply::json(200, "OK", ctx.memory.status_summary().to_json_string())
        }
        "/memory/state" => {
            let since = query_param_u64(raw_path, "since", 0);
            let include_blobs = query_param_u64(raw_path, "includeBlobs", 1) != 0;
            let state = ctx.memory.export_state(since, include_blobs);
            RelayReply::json(200, "OK", state.to_json_string())
        }
        _ if clean_path.starts_with("/memory/blob/") => {
            let hash = first_segment(clean_path, "/memory/blob/");
            match ctx.memory.get_blob(hash) {
                Some(blob) => RelayReply::json(200, "OK", blob.to_json_string()),
                None => RelayReply::json(404, "Not Found", json_error("Blob nao encontrado")),
            }
        }
        _ if clean_path.starts_with("/memory/vault/") => {
            let key = first_segment(clean_path, "/memory/vault/");
            match ctx.memory.get_vault(key) {
                Some(rec) => {
                    let obj = JsonValue::Object(vec![
                        ("status".to_string(), JsonValue::String("ok".to_string())),
                        ("vaultKey".to_string(), JsonValue::String(key.to_string())),
                        ("record".to_string(), rec),
                    ]);
                    RelayReply::json(200, "OK", obj.to_json_string())
                }
                None => RelayReply::json(404, "Not Found", json_error("Vault nao encontrado")),
            }
        }
        _ => not_found(),
    }
}

fn handle_p2p_get(clean_path: &str, ctx: &RelayContext) -> RelayReply {
    match clean_path {
        "/p2p/status" => RelayReply::json(200, "OK", ctx.p2p.summary().to_json_string()),
        "/p2p/blobs" => {
            let obj = JsonValue::Object(vec![(
                "seeds".to_string(),
                JsonValue::Array(ctx.p2p.list_seeds()),
            )]);
            RelayReply::json(200, "OK", obj.to_json_string())
        }
        "/peer/beacon" | "/p2p/peers" => {
            let obj = JsonValue::Object(vec![(
                "peers".to_string(),
                JsonValue::Array(ctx.p2p.list_peers()),
            )]);
            RelayReply::json(200, "OK", obj.to_json_string())
        }
        _ if clean_path.starts_with("/p2p/seed/") => {
            let hash = first_segment(clean_path, "/p2p/seed/");
            match ctx.p2p.get_seed(hash) {
                Some(seed) => RelayReply::json(200, "OK", seed.to_json_string()),
                None => RelayReply::json(404, "Not Found", json_error("Seed P2P nao encontrado")),
            }
        }
        _ => not_found(),
    }
}

fn route_post(
    clean_path: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    match clean_path {
        "/vox/mirror" => handle_mirror_post(req, initial_body, stream, ctx),
        _ if clean_path.starts_with("/inbox/") => handle_inbox_post(
            first_segment(clean_path, "/inbox/"),
            req,
            initial_body,
            stream,
            ctx,
        ),
        _ if clean_path.starts_with("/relay/envelope/") => handle_blind_envelope_post(
            first_segment(clean_path, "/relay/envelope/"),
            req,
            initial_body,
            stream,
            ctx,
        ),
        _ if clean_path.starts_with("/relay/snapshot/") => handle_blind_snapshot_post(
            first_segment(clean_path, "/relay/snapshot/"),
            req,
            initial_body,
            stream,
            ctx,
        ),
        "/memory/ingest" | "/memory/sync" => {
            handle_memory_post(clean_path, req, initial_body, stream, ctx)
        }
        _ if clean_path.starts_with("/memory/vault/") => {
            handle_memory_post(clean_path, req, initial_body, stream, ctx)
        }
        "/p2p/seed" => handle_p2p_seed_post(req, initial_body, stream, ctx),
        "/peer/beacon" => handle_peer_beacon_post(req, initial_body, stream, ctx),
        "/oauth/exchange" => handle_oauth_exchange_post(req, initial_body, stream, ctx),
        _ => not_found(),
    }
}

fn read_capped_body(
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    max_bytes: usize,
    timeout: Duration,
) -> Result<Vec<u8>, RelayReply> {
    let content_length = parse_content_length(req);
    if content_length > max_bytes {
        return Err(RelayReply::json(
            413,
            "Payload Too Large",
            r#"{"error":"payload_too_large"}"#.to_string(),
        ));
    }
    read_exact_body(stream, initial_body, content_length, timeout).map_err(|_| {
        RelayReply::json(
            400,
            "Bad Request",
            r#"{"error":"incomplete_request_body"}"#.to_string(),
        )
    })
}

fn handle_mirror_post(
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_MIRROR_BODY_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    let comm_id = match validate_mirror_body(&body) {
        Ok(id) => id,
        Err(err) => {
            let reason = if err.status == 413 {
                "Payload Too Large"
            } else {
                "Bad Request"
            };
            return RelayReply::json(err.status, reason, err.to_json_string());
        }
    };
    match ctx.cache.store_index(&comm_id, &body) {
        Ok(true) => {
            let obj = JsonValue::Object(vec![
                (
                    "status".to_string(),
                    JsonValue::String("mirrored".to_string()),
                ),
                ("communityId".to_string(), JsonValue::String(comm_id)),
            ]);
            RelayReply::json(200, "OK", obj.to_json_string())
        }
        Ok(false) => RelayReply::json(
            507,
            "Insufficient Storage",
            json_error("quota de cache excedida"),
        ),
        Err(msg) => RelayReply::json(500, "Internal Server Error", json_error(&msg)),
    }
}

fn handle_inbox_post(
    addr: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_ENVELOPE_SIZE,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    match ctx
        .store
        .store_envelope(addr, &body, ctx.config.inbox_ttl_secs)
    {
        Ok(receipt) => RelayReply::json(200, "OK", receipt.to_json_string()),
        Err(StoreError::TooLarge) => RelayReply::json(
            413,
            "Payload Too Large",
            r#"{"error":"payload_too_large"}"#.to_string(),
        ),
        Err(StoreError::Invalid(msg)) => RelayReply::json(400, "Bad Request", json_error(&msg)),
        Err(StoreError::Io(msg)) => {
            RelayReply::json(500, "Internal Server Error", json_error(&msg))
        }
    }
}

fn handle_blind_envelope_post(
    ch: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_BLIND_ENVELOPE_SIZE,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    match ctx.blind.store_envelope(ch, &body) {
        Ok(record) => RelayReply::json(201, "Created", record.to_json_string()),
        Err(err) => blind_error_reply(err),
    }
}

fn handle_blind_snapshot_post(
    ch: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_SNAPSHOT_SIZE,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    let proof = req.header("x-vox-snapshot-proof");
    match ctx.blind.store_snapshot(ch, &body, proof) {
        Ok(out) => {
            let (status, reason) = if out.idempotent {
                (200, "OK")
            } else {
                (201, "Created")
            };
            RelayReply::json(status, reason, out.record.to_json_string())
        }
        Err(err) => blind_error_reply(err),
    }
}

fn blind_error_reply(err: BlindError) -> RelayReply {
    match err {
        BlindError::TooLarge => RelayReply::json(
            413,
            "Payload Too Large",
            r#"{"error":"payload_too_large"}"#.to_string(),
        ),
        BlindError::BadRequest(msg) => RelayReply::json(400, "Bad Request", json_error(&msg)),
        BlindError::Forbidden(msg) => RelayReply::json(403, "Forbidden", json_error(&msg)),
        BlindError::Conflict {
            message,
            current_epoch,
            current_covered_serial,
        } => {
            let obj = JsonValue::Object(vec![
                ("error".to_string(), JsonValue::String(message)),
                (
                    "currentEpoch".to_string(),
                    JsonValue::Number(current_epoch.to_string()),
                ),
                (
                    "currentCoveredSerial".to_string(),
                    JsonValue::Number(current_covered_serial.to_string()),
                ),
            ]);
            RelayReply::json(409, "Conflict", obj.to_json_string())
        }
        BlindError::Io(msg) => RelayReply::json(500, "Internal Server Error", json_error(&msg)),
    }
}

fn handle_memory_post(
    clean_path: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_MEMORY_PAYLOAD_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    if let Some(rest) = clean_path.strip_prefix("/memory/vault/") {
        let key = rest.split('/').next().unwrap_or("");
        return match ctx.memory.save_vault(key, &body) {
            Ok(outcome) => {
                let (status, reason) = match outcome {
                    VaultOutcome::Saved => (200, "OK"),
                    VaultOutcome::Forbidden => (403, "Forbidden"),
                    VaultOutcome::Invalid => (400, "Bad Request"),
                };
                let obj = JsonValue::Object(vec![(
                    "status".to_string(),
                    JsonValue::String(outcome.as_str().to_string()),
                )]);
                RelayReply::json(status, reason, obj.to_json_string())
            }
            Err(MemoryError::TooLarge) => RelayReply::json(
                413,
                "Payload Too Large",
                r#"{"error":"payload_too_large"}"#.to_string(),
            ),
            Err(MemoryError::BadRequest(msg)) => {
                RelayReply::json(400, "Bad Request", json_error(&msg))
            }
        };
    }
    if clean_path == "/memory/ingest" {
        return match ctx.memory.ingest_event(&body) {
            Ok((changed, summary)) => {
                let (status, reason) = if changed {
                    (201, "Created")
                } else {
                    (200, "OK")
                };
                RelayReply::json(status, reason, summary.to_json_string())
            }
            Err(MemoryError::TooLarge) => RelayReply::json(
                413,
                "Payload Too Large",
                r#"{"error":"payload_too_large"}"#.to_string(),
            ),
            Err(MemoryError::BadRequest(msg)) => {
                RelayReply::json(400, "Bad Request", json_error(&msg))
            }
        };
    }
    match ctx.memory.sync_bundle(&body) {
        Ok(exported) => RelayReply::json(200, "OK", exported.to_json_string()),
        Err(MemoryError::TooLarge) => RelayReply::json(
            413,
            "Payload Too Large",
            r#"{"error":"payload_too_large"}"#.to_string(),
        ),
        Err(MemoryError::BadRequest(msg)) => RelayReply::json(400, "Bad Request", json_error(&msg)),
    }
}

fn handle_p2p_seed_post(
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_P2P_PAYLOAD_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    let Ok(payload) = std::str::from_utf8(&body)
        .ok()
        .and_then(|s| JsonValue::parse(s).ok())
        .ok_or(())
    else {
        return RelayReply::json(400, "Bad Request", json_error("JSON invalido"));
    };
    let blob_hash = payload
        .get("hash")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let meta = ctx.memory.get_blob_meta(&blob_hash);
    match ctx.p2p.register_seed(&payload, meta) {
        Ok(rec) => RelayReply::json(201, "Created", rec.to_json_string()),
        Err(P2pError::BadRequest(msg)) => RelayReply::json(400, "Bad Request", json_error(&msg)),
        Err(P2pError::QuotaExceeded(msg)) => {
            RelayReply::json(413, "Payload Too Large", json_error(&msg))
        }
    }
}

fn handle_peer_beacon_post(
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_P2P_PAYLOAD_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    let Ok(payload) = std::str::from_utf8(&body)
        .ok()
        .and_then(|s| JsonValue::parse(s).ok())
        .ok_or(())
    else {
        return RelayReply::json(400, "Bad Request", json_error("JSON invalido"));
    };
    match ctx.p2p.register_peer(&payload) {
        Ok(rec) => RelayReply::json(201, "Created", rec.to_json_string()),
        Err(P2pError::BadRequest(msg)) => RelayReply::json(400, "Bad Request", json_error(&msg)),
        Err(P2pError::QuotaExceeded(msg)) => {
            RelayReply::json(413, "Payload Too Large", json_error(&msg))
        }
    }
}

fn handle_oauth_exchange_post(
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let body = match read_capped_body(
        req,
        initial_body,
        stream,
        MAX_OAUTH_BODY_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(reply) => return reply,
    };
    let Ok(payload) = std::str::from_utf8(&body)
        .ok()
        .and_then(|s| JsonValue::parse(s).ok())
        .ok_or(())
    else {
        return RelayReply::json(400, "Bad Request", json_error("JSON invalido"));
    };
    let has_provider = payload
        .get("provider")
        .and_then(JsonValue::as_str)
        .is_some_and(|s| !s.trim().is_empty());
    let has_code = payload
        .get("code")
        .and_then(JsonValue::as_str)
        .is_some_and(|s| !s.trim().is_empty());
    if !has_provider || !has_code {
        return RelayReply::json(
            400,
            "Bad Request",
            json_error("provider e code obrigatorios"),
        );
    }
    RelayReply::json(
        501,
        "Not Implemented",
        json_error("oauth_exchange_requires_tls_client"),
    )
}

fn route_delete(clean_path: &str, req: &HttpRequest, ctx: &RelayContext) -> RelayReply {
    if clean_path.starts_with("/p2p/seed/") {
        let hash = first_segment(clean_path, "/p2p/seed/");
        if ctx.p2p.unregister_seed(hash) {
            let obj = JsonValue::Object(vec![
                (
                    "status".to_string(),
                    JsonValue::String("unseeded".to_string()),
                ),
                ("hash".to_string(), JsonValue::String(hash.to_string())),
            ]);
            return RelayReply::json(200, "OK", obj.to_json_string());
        }
        return RelayReply::json(404, "Not Found", json_error("Seed P2P nao encontrado"));
    }
    let Some(rest) = clean_path.strip_prefix("/inbox/") else {
        return not_found();
    };
    let mut parts = rest.split('/');
    let addr = parts.next().unwrap_or("");
    let msg_id = parts.next().unwrap_or("");
    let token = req.header("x-vox-delete-token");
    let (status, reason, label) = match ctx.store.delete_envelope(addr, msg_id, token) {
        DeleteOutcome::Deleted => (200, "OK", "deleted"),
        DeleteOutcome::Forbidden => (403, "Forbidden", "forbidden"),
        DeleteOutcome::NotFound => (404, "Not Found", "not_found"),
    };
    let payload = JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String(label.to_string())),
        ("id".to_string(), JsonValue::String(msg_id.to_string())),
    ]);
    RelayReply::json(status, reason, payload.to_json_string())
}

fn build_health_json(ctx: &RelayContext) -> String {
    let indexes = ctx.cache.list_community_indexes();
    let idx_json: Vec<JsonValue> = indexes.iter().cloned().map(JsonValue::String).collect();
    let max_cache = ctx
        .cache
        .max_bytes()
        .map(|b| JsonValue::Number(b.to_string()))
        .unwrap_or(JsonValue::Null);
    let integrity = JsonValue::Object(vec![
        (
            "algorithm".to_string(),
            JsonValue::String("sha256".to_string()),
        ),
        ("verifiedReads".to_string(), JsonValue::Bool(true)),
        (
            "failures".to_string(),
            JsonValue::Number(ctx.cache.integrity_failures().to_string()),
        ),
    ]);
    let data_dir = ctx.config.data_dir.to_string_lossy().into_owned();
    let obj = JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "app".to_string(),
            JsonValue::String("vox-relay".to_string()),
        ),
        (
            "service".to_string(),
            JsonValue::String("vox-relay".to_string()),
        ),
        (
            "version".to_string(),
            JsonValue::String(RELAY_API_VERSION.to_string()),
        ),
        (
            "cachedCount".to_string(),
            JsonValue::Number(ctx.cache.cached_item_count().to_string()),
        ),
        ("communityIndexes".to_string(), JsonValue::Array(idx_json)),
        (
            "communityIndexCount".to_string(),
            JsonValue::Number(indexes.len().to_string()),
        ),
        (
            "cacheBytes".to_string(),
            JsonValue::Number(ctx.cache.total_bytes().to_string()),
        ),
        ("maxCacheBytes".to_string(), max_cache),
        ("cacheDir".to_string(), JsonValue::String(data_dir.clone())),
        ("dataDir".to_string(), JsonValue::String(data_dir)),
        ("cacheIntegrity".to_string(), integrity),
        ("centralMemory".to_string(), ctx.memory.status_summary()),
        ("p2p".to_string(), ctx.p2p.summary()),
        (
            "inboxCount".to_string(),
            JsonValue::Number(ctx.store.count_envelopes().to_string()),
        ),
        (
            "genesis_ms".to_string(),
            JsonValue::Number(GENESIS_MS.to_string()),
        ),
        (
            "genesis_guard".to_string(),
            JsonValue::String("ok".to_string()),
        ),
    ]);
    obj.to_json_string()
}

fn purge_inbox_root(root: &Path, now_secs: u64) -> usize {
    let Ok(dirs) = fs::read_dir(root) else {
        return 0;
    };
    let mut removed = 0;
    for entry in dirs.filter_map(Result::ok) {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        if let Ok(files) = fs::read_dir(&dir) {
            for f in files.filter_map(Result::ok) {
                let path = f.path();
                if path.extension().is_some_and(|e| e == "json") && is_expired_json(&path, now_secs)
                {
                    let _ = fs::remove_file(&path);
                    removed += 1;
                }
            }
        }
        if fs::read_dir(&dir)
            .map(|mut it| it.next().is_none())
            .unwrap_or(false)
        {
            let _ = fs::remove_dir(&dir);
        }
    }
    removed
}

fn is_expired_json(path: &Path, now_secs: u64) -> bool {
    let Ok(text) = fs::read_to_string(path) else {
        return true;
    };
    let Ok(val) = JsonValue::parse(&text) else {
        return true;
    };
    let exp = match val.get("expiresAt") {
        Some(JsonValue::Number(n)) => n.parse::<u64>().unwrap_or(0),
        _ => 0,
    };
    exp <= now_secs
}

fn format_relay_response(
    reply: &RelayReply,
    origin: Option<&str>,
    policy: &GuardPolicy,
) -> Vec<u8> {
    let mut head = format!("HTTP/1.1 {} {}\r\n", reply.status, reply.reason);
    if !reply.body.is_empty() || reply.status != 204 {
        head.push_str("Content-Type: application/json; charset=utf-8\r\n");
    }
    head.push_str(&format!("Content-Length: {}\r\n", reply.body.len()));
    for hdr in &reply.extra_headers {
        head.push_str(hdr);
        head.push_str("\r\n");
    }
    head.push_str("Vary: Origin\r\n");
    head.push_str("Access-Control-Expose-Headers: Retry-After\r\n");
    if let Some(allowed) = policy.cors_allow_origin(origin) {
        head.push_str(&format!("Access-Control-Allow-Origin: {allowed}\r\n"));
        head.push_str("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n");
        head.push_str(
            "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, \
             X-Vox-Delete-Token, X-Vox-Snapshot-Proof\r\n",
        );
        head.push_str("Access-Control-Allow-Private-Network: true\r\n");
    }
    head.push_str("Connection: close\r\n\r\n");
    let mut out = head.into_bytes();
    out.extend_from_slice(&reply.body);
    out
}

fn first_segment<'a>(clean_path: &'a str, prefix: &str) -> &'a str {
    clean_path
        .strip_prefix(prefix)
        .unwrap_or("")
        .split('/')
        .next()
        .unwrap_or("")
}

fn query_param_u64(raw_path: &str, name: &str, default: u64) -> u64 {
    let Some((_, query)) = raw_path.split_once('?') else {
        return default;
    };
    for part in query.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == name {
                return v.parse::<u64>().unwrap_or(default);
            }
        }
    }
    default
}

fn normalize_path(raw: &str) -> &str {
    let without_query = raw.split('?').next().unwrap_or("/");
    let trimmed = without_query.trim_end_matches('/');
    if trimmed.is_empty() {
        "/"
    } else {
        trimmed
    }
}

fn parse_content_length(req: &HttpRequest) -> usize {
    req.header("content-length")
        .and_then(|v| v.trim().parse::<usize>().ok())
        .unwrap_or(0)
}

fn is_json_content_type(header: Option<&str>) -> bool {
    header
        .and_then(|v| v.split(';').next())
        .map(|media| media.trim().eq_ignore_ascii_case("application/json"))
        .unwrap_or(false)
}

fn read_exact_body(
    stream: &mut TcpStream,
    initial: &[u8],
    expected: usize,
    timeout: Duration,
) -> io::Result<Vec<u8>> {
    if initial.len() >= expected {
        return Ok(initial[..expected].to_vec());
    }
    let mut body = Vec::with_capacity(expected);
    body.extend_from_slice(initial);
    let deadline = Instant::now() + timeout;
    let mut buf = [0u8; 4096];
    while body.len() < expected {
        let Some(remaining_time) = deadline.checked_duration_since(Instant::now()) else {
            return Err(io::Error::new(io::ErrorKind::TimedOut, "body timeout"));
        };
        stream.set_read_timeout(Some(remaining_time))?;
        let to_read = (expected - body.len()).min(buf.len());
        let n = stream.read(&mut buf[..to_read])?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "eof"));
        }
        body.extend_from_slice(&buf[..n]);
    }
    Ok(body)
}

fn drain_rejected_body(stream: &mut TcpStream, unread_bytes: usize) {
    let mut pending = unread_bytes.min(REJECTED_DRAIN_MAX);
    let deadline = Instant::now() + REJECTED_DRAIN_TIMEOUT;
    let mut sink = [0u8; 8192];
    while pending > 0 {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            break;
        };
        if stream.set_read_timeout(Some(remaining)).is_err() {
            break;
        }
        let to_read = pending.min(sink.len());
        match stream.read(&mut sink[..to_read]) {
            Ok(0) | Err(_) => break,
            Ok(n) => pending -= n,
        }
    }
}

fn not_found() -> RelayReply {
    RelayReply::json(404, "Not Found", r#"{"error":"not_found"}"#.to_string())
}

fn json_error(message: &str) -> String {
    JsonValue::Object(vec![(
        "error".to_string(),
        JsonValue::String(message.to_string()),
    )])
    .to_json_string()
}

fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
