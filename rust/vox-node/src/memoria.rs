//! Pure-`std` local control and central memory server (`--mode memoria`, ADR-039 PR4.3).
//!
//! Serves the embedded Vox Populi dashboard, host telemetry, vault listing,
//! `MemoryStore` routes guarded by `vox_core::genesis_guard`, and authenticated
//! control endpoints (`/control/shutdown`, `/control/pause`, `/control/resume`)
//! protected by a persisted `control.token` compared in constant time.

use std::collections::hash_map::RandomState;
use std::collections::VecDeque;
use std::env;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use vox_core::genesis_data::GENESIS_MS;

use crate::guard::GuardPolicy;
use crate::http::{parse_http_request, read_handshake_request, HttpRequest};
use crate::json::JsonValue;
use crate::limits::ConnectionSlots;
use crate::memory_store::{MemoryError, MemoryStore, VaultOutcome, MAX_MEMORY_PAYLOAD_BYTES};
use crate::relay_store::{ct_eq, sha256_hex};

/// Default listen host in memoria mode (`127.0.0.1`, Cold Readiness).
pub const DEFAULT_MEMORIA_HOST: &str = "127.0.0.1";
/// Default listen port in memoria mode (`3922`, local control & dashboard).
pub const DEFAULT_MEMORIA_PORT: u16 = 3922;
/// Default per-connection socket read timeout (`10 s`).
pub const DEFAULT_MEMORIA_TIMEOUT: Duration = Duration::from_secs(10);

const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_CONTROL_BODY_BYTES: usize = 16 * 1024;
const MAX_RECENT_LOGS: usize = 200;
const DASHBOARD_HTML: &str =
    include_str!("../../../packaging/zero-central-memory-windows/dashboard.html");

/// Runtime configuration for the local Vox Memoria server (`--mode memoria`).
#[derive(Debug, Clone)]
pub struct MemoriaConfig {
    /// Interface address to bind (defaults to `127.0.0.1`).
    pub host: String,
    /// TCP port to bind (`3922` by default; `0` selects an ephemeral OS port).
    pub port: u16,
    /// Base data directory for `control.token`, logs, and `central_memory/`.
    pub data_dir: PathBuf,
    /// Socket read deadline for headers and request bodies.
    pub socket_timeout: Duration,
    /// Maximum concurrent HTTP connections.
    pub max_connections: usize,
    /// Host/Origin/CORS security policy (allowlist only, never `*`).
    pub guard: GuardPolicy,
}

impl Default for MemoriaConfig {
    fn default() -> Self {
        Self {
            host: DEFAULT_MEMORIA_HOST.to_string(),
            port: DEFAULT_MEMORIA_PORT,
            data_dir: env::temp_dir().join("vox-memoria-data"),
            socket_timeout: DEFAULT_MEMORIA_TIMEOUT,
            max_connections: 64,
            guard: GuardPolicy::default(),
        }
    }
}

impl MemoriaConfig {
    /// Builds a memoria configuration from environment variables with optional CLI overrides.
    pub fn from_env(
        host_override: Option<String>,
        port_override: Option<u16>,
        data_dir_override: Option<PathBuf>,
    ) -> Self {
        let host = host_override
            .or_else(|| env_non_empty("HOST"))
            .unwrap_or_else(|| DEFAULT_MEMORIA_HOST.to_string());
        let port = port_override
            .or_else(|| env_u16("VOX_MEMORIA_PORT"))
            .or_else(|| env_u16("PORT"))
            .unwrap_or(DEFAULT_MEMORIA_PORT);
        let data_dir = data_dir_override
            .or_else(|| env_non_empty("VOX_MEMORIA_DATA_DIR").map(PathBuf::from))
            .or_else(|| env_non_empty("VOX_RELAY_CACHE_DIR").map(PathBuf::from))
            .unwrap_or_else(|| env::temp_dir().join("vox-memoria-data"));
        let timeout_secs = env_u64("VOX_RELAY_SOCKET_TIMEOUT")
            .filter(|&s| s > 0)
            .unwrap_or(DEFAULT_MEMORIA_TIMEOUT.as_secs());
        let max_connections = env_u64("VOX_RELAY_MAX_CONNECTIONS")
            .filter(|&n| n > 0)
            .map(|n| n as usize)
            .unwrap_or(64);
        Self {
            host,
            port,
            data_dir,
            socket_timeout: Duration::from_secs(timeout_secs),
            max_connections,
            guard: GuardPolicy::from_env(),
        }
    }
}

struct MemoriaContext {
    config: MemoriaConfig,
    store: MemoryStore,
    control_token: String,
    local_addr: SocketAddr,
    stop: Arc<AtomicBool>,
    paused: AtomicBool,
    requests: AtomicU64,
    started_at: Instant,
    logs: Mutex<VecDeque<String>>,
    slots: ConnectionSlots,
}

impl MemoriaContext {
    fn record_log(&self, category: &str, message: &str) {
        let entry = format!("[{}] [{category}] {message}", unix_now_ms());
        if let Ok(mut ring) = self.logs.lock() {
            ring.push_back(entry);
            while ring.len() > MAX_RECENT_LOGS {
                ring.pop_front();
            }
        }
    }

    fn recent_logs(&self) -> Vec<String> {
        self.logs
            .lock()
            .map(|ring| ring.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Acquire)
    }

    fn is_running(&self) -> bool {
        !self.stop.load(Ordering::Acquire)
    }

    fn trigger_shutdown(&self) {
        self.stop.store(true, Ordering::Release);
        let wake_addr = self.local_addr;
        let _ = thread::Builder::new()
            .name("vox-memoria-wake".to_string())
            .spawn(move || {
                thread::sleep(Duration::from_millis(25));
                let _ = TcpStream::connect(wake_addr);
            });
    }
}

/// Running local Vox Memoria server bound to a TCP socket.
pub struct MemoriaServer {
    listener: TcpListener,
    local_addr: SocketAddr,
    ctx: Arc<MemoriaContext>,
}

/// Handle to a background Vox Memoria server thread with graceful shutdown.
pub struct MemoriaServerHandle {
    local_addr: SocketAddr,
    control_token: String,
    ctx: Arc<MemoriaContext>,
    join: Option<JoinHandle<()>>,
}

impl MemoriaServerHandle {
    /// Returns the actual bound socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Returns the actual bound TCP port.
    pub fn port(&self) -> u16 {
        self.local_addr.port()
    }

    /// Returns the active `control.token` loaded or generated in `data_dir`.
    pub fn control_token(&self) -> &str {
        &self.control_token
    }

    /// Returns `true` while the server accept loop has not been signaled to stop.
    pub fn is_running(&self) -> bool {
        self.ctx.is_running()
    }

    /// Signals the accept loop to stop and joins the server thread cleanly.
    pub fn shutdown(mut self) {
        self.stop_inner();
    }

    /// Waits for the server accept loop thread to finish (for example after `/control/shutdown`).
    pub fn wait_for_exit(&mut self) {
        if let Some(handle) = self.join.take() {
            let _ = handle.join();
        }
    }

    fn stop_inner(&mut self) {
        self.ctx.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.local_addr);
        if let Some(handle) = self.join.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for MemoriaServerHandle {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

impl MemoriaServer {
    /// Binds a TCP listener for `--mode memoria` and ensures `control.token` exists in `data_dir`.
    pub fn bind(config: MemoriaConfig) -> io::Result<Self> {
        fs::create_dir_all(&config.data_dir)?;
        let token_path = config.data_dir.join("control.token");
        let control_token = ensure_control_token(&token_path)?;
        let listener = TcpListener::bind((config.host.as_str(), config.port))?;
        let local_addr = listener.local_addr()?;
        let store = MemoryStore::new(config.data_dir.join("central_memory"));
        let slots = ConnectionSlots::new(config.max_connections);
        let ctx = Arc::new(MemoriaContext {
            config,
            store,
            control_token,
            local_addr,
            stop: Arc::new(AtomicBool::new(false)),
            paused: AtomicBool::new(false),
            requests: AtomicU64::new(0),
            started_at: Instant::now(),
            logs: Mutex::new(VecDeque::with_capacity(MAX_RECENT_LOGS)),
            slots,
        });
        ctx.record_log(
            "BOOT",
            &format!("Vox Memoria active on http://{local_addr}"),
        );
        Ok(Self {
            listener,
            local_addr,
            ctx,
        })
    }

    /// Returns the bound local socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Returns the active `control.token` string.
    pub fn control_token(&self) -> &str {
        &self.ctx.control_token
    }

    /// Runs the blocking accept loop until stopped (e.g. via `POST /control/shutdown`).
    pub fn serve_forever(self) {
        for incoming in self.listener.incoming() {
            if self.ctx.stop.load(Ordering::Acquire) {
                break;
            }
            let Ok(stream) = incoming else {
                continue;
            };
            let Some(slot_guard) = self.ctx.slots.try_acquire() else {
                drop(stream);
                continue;
            };
            let ctx = Arc::clone(&self.ctx);
            let _ = thread::Builder::new()
                .name("vox-memoria-http".to_string())
                .spawn(move || {
                    let _guard = slot_guard;
                    handle_connection(stream, &ctx);
                });
        }
    }

    /// Spawns the accept loop on a background thread and returns a [`MemoriaServerHandle`].
    pub fn spawn(self) -> MemoriaServerHandle {
        let local_addr = self.local_addr;
        let control_token = self.ctx.control_token.clone();
        let ctx = Arc::clone(&self.ctx);
        let join = thread::Builder::new()
            .name("vox-memoria-accept".to_string())
            .spawn(move || self.serve_forever())
            .ok();
        MemoriaServerHandle {
            local_addr,
            control_token,
            ctx,
            join,
        }
    }
}

/// Ensures `path` contains a non-empty `control.token`, generating one if missing.
pub fn ensure_control_token(path: &Path) -> io::Result<String> {
    if let Ok(existing) = fs::read_to_string(path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let token = generate_control_token();
    write_token_atomic(path, &token)?;
    Ok(token)
}

fn generate_control_token() -> String {
    let mut seed = Vec::with_capacity(96);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    seed.extend_from_slice(&now.as_nanos().to_le_bytes());
    seed.extend_from_slice(&std::process::id().to_le_bytes());
    let stack_marker = 0u64;
    let addr = (&stack_marker as *const u64) as usize;
    seed.extend_from_slice(&addr.to_le_bytes());
    for i in 0u64..4 {
        let state = RandomState::new();
        let mut hasher = state.build_hasher();
        hasher.write_u64(i);
        hasher.write_u128(now.as_nanos());
        seed.extend_from_slice(&hasher.finish().to_le_bytes());
    }
    sha256_hex(&seed)
}

fn write_token_atomic(path: &Path, token: &str) -> io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp = dir.join(format!(".control-token-{}.tmp", std::process::id()));
    fs::write(&tmp, token.as_bytes())?;
    if fs::rename(&tmp, path).is_err() {
        let _ = fs::remove_file(path);
        if let Err(err) = fs::rename(&tmp, path) {
            let _ = fs::remove_file(&tmp);
            return Err(err);
        }
    }
    Ok(())
}

struct HttpReply {
    status: u16,
    reason: &'static str,
    content_type: &'static str,
    body: Vec<u8>,
}

impl HttpReply {
    fn json(status: u16, reason: &'static str, body: String) -> Self {
        Self {
            status,
            reason,
            content_type: "application/json; charset=utf-8",
            body: body.into_bytes(),
        }
    }

    fn html(status: u16, reason: &'static str, body: &str) -> Self {
        Self {
            status,
            reason,
            content_type: "text/html; charset=utf-8",
            body: body.as_bytes().to_vec(),
        }
    }

    fn empty(status: u16, reason: &'static str) -> Self {
        Self {
            status,
            reason,
            content_type: "application/json; charset=utf-8",
            body: Vec::new(),
        }
    }

    fn into_head(mut self) -> Self {
        self.body.clear();
        self
    }
}

fn handle_connection(mut stream: TcpStream, ctx: &MemoriaContext) {
    let Ok(Some(raw)) = read_handshake_request(&mut stream, ctx.config.socket_timeout) else {
        return;
    };
    ctx.requests.fetch_add(1, Ordering::Relaxed);
    let head_end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|pos| pos + 4)
        .unwrap_or(raw.len());
    let req = parse_http_request(&raw[..head_end]);
    let initial_body = &raw[head_end..];
    let reply = dispatch_request(&mut stream, &req, initial_body, ctx);
    let encoded = format_http_response(&reply, req.header("origin"), &ctx.config.guard);
    let _ = stream.write_all(&encoded);
    let _ = stream.flush();
}

fn dispatch_request(
    stream: &mut TcpStream,
    req: &HttpRequest,
    initial_body: &[u8],
    ctx: &MemoriaContext,
) -> HttpReply {
    if req.method == "OPTIONS" {
        return HttpReply::empty(204, "No Content");
    }
    if let Some(rejected) = check_guards(req, ctx) {
        return rejected;
    }
    let clean_path = normalize_path(&req.path);
    match req.method.as_str() {
        "GET" | "HEAD" => {
            let reply = route_get(clean_path, &req.path, ctx);
            if req.method == "HEAD" && reply.status == 200 {
                reply.into_head()
            } else {
                reply
            }
        }
        "POST" => route_post(clean_path, req, initial_body, stream, ctx),
        _ => HttpReply::json(
            405,
            "Method Not Allowed",
            r#"{"error":"method_not_allowed"}"#.to_string(),
        ),
    }
}

fn check_guards(req: &HttpRequest, ctx: &MemoriaContext) -> Option<HttpReply> {
    if !ctx
        .config
        .guard
        .host_allowed(req.header("host"), &ctx.config.host)
    {
        return Some(HttpReply::json(
            421,
            "Misdirected Request",
            r#"{"error":"host_not_allowed"}"#.to_string(),
        ));
    }
    if req.method == "POST" && !ctx.config.guard.ws_origin_allowed(req.header("origin")) {
        return Some(HttpReply::json(
            403,
            "Forbidden",
            r#"{"error":"origin_not_allowed"}"#.to_string(),
        ));
    }
    None
}

fn route_get(clean_path: &str, raw_path: &str, ctx: &MemoriaContext) -> HttpReply {
    match clean_path {
        "" | "/" | "/dashboard" | "/monitor" => HttpReply::html(200, "OK", DASHBOARD_HTML),
        "/health" => HttpReply::json(200, "OK", build_health_json(ctx)),
        "/status" | "/api/status" | "/ping" => HttpReply::json(200, "OK", build_status_json(ctx)),
        "/api/telemetry" | "/memory/telemetry" => {
            HttpReply::json(200, "OK", build_telemetry_envelope(ctx))
        }
        "/memory/logs" | "/api/logs" => HttpReply::json(200, "OK", build_logs_json(ctx)),
        "/memory/vaults" | "/api/vaults" => HttpReply::json(200, "OK", build_vaults_json(ctx)),
        "/memory" | "/memory/status" => HttpReply::json(200, "OK", build_memory_status_json(ctx)),
        "/memory/state" => handle_memory_state_get(raw_path, ctx),
        _ if clean_path.starts_with("/memory/blob/") => {
            handle_memory_blob_get(&clean_path["/memory/blob/".len()..], ctx)
        }
        _ if clean_path.starts_with("/memory/vault/") => {
            handle_memory_vault_get(&clean_path["/memory/vault/".len()..], ctx)
        }
        _ => not_found(),
    }
}

fn route_post(
    clean_path: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &MemoriaContext,
) -> HttpReply {
    if is_control_route(clean_path) {
        return handle_control_post(clean_path, req, initial_body, stream, ctx);
    }
    if ctx.is_paused() {
        return HttpReply::json(
            503,
            "Service Unavailable",
            r#"{"error":"node_paused"}"#.to_string(),
        );
    }
    if !is_json_content_type(req.header("content-type")) {
        return HttpReply::json(
            415,
            "Unsupported Media Type",
            r#"{"error":"unsupported_media_type"}"#.to_string(),
        );
    }
    let body = match read_request_body(
        stream,
        req,
        initial_body,
        MAX_MEMORY_PAYLOAD_BYTES,
        ctx.config.socket_timeout,
    ) {
        Ok(bytes) => bytes,
        Err(reply) => return reply,
    };
    match clean_path {
        "/memory/ingest" => handle_memory_ingest(&body, ctx),
        "/memory/sync" => handle_memory_sync(&body, ctx),
        _ if clean_path.starts_with("/memory/vault/") => {
            handle_memory_vault_post(&clean_path["/memory/vault/".len()..], &body, ctx)
        }
        _ => not_found(),
    }
}

fn is_control_route(path: &str) -> bool {
    matches!(
        path,
        "/control/shutdown"
            | "/api/stop"
            | "/control/pause"
            | "/api/pause"
            | "/memory/pause"
            | "/control/resume"
            | "/api/resume"
            | "/memory/resume"
            | "/memory/checkpoint"
    )
}

fn handle_control_post(
    clean_path: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &MemoriaContext,
) -> HttpReply {
    if let Some(auth_err) = verify_control_token(req, &ctx.control_token) {
        return auth_err;
    }
    let _ = read_request_body(
        stream,
        req,
        initial_body,
        MAX_CONTROL_BODY_BYTES,
        ctx.config.socket_timeout,
    );
    match clean_path {
        "/control/shutdown" | "/api/stop" => {
            ctx.record_log("CONTROL", "Shutdown requested via control.token");
            ctx.trigger_shutdown();
            HttpReply::json(
                200,
                "OK",
                r#"{"status":"accepted","action":"shutdown"}"#.to_string(),
            )
        }
        "/control/pause" | "/api/pause" | "/memory/pause" => {
            ctx.paused.store(true, Ordering::Release);
            ctx.record_log("CONTROL", "Node paused");
            HttpReply::json(
                200,
                "OK",
                r#"{"status":"accepted","action":"pause","paused":true}"#.to_string(),
            )
        }
        "/control/resume" | "/api/resume" | "/memory/resume" => {
            ctx.paused.store(false, Ordering::Release);
            ctx.record_log("CONTROL", "Node resumed");
            HttpReply::json(
                200,
                "OK",
                r#"{"status":"accepted","action":"resume","paused":false}"#.to_string(),
            )
        }
        "/memory/checkpoint" => handle_checkpoint(ctx),
        _ => not_found(),
    }
}

fn verify_control_token(req: &HttpRequest, expected: &str) -> Option<HttpReply> {
    let presented = extract_control_token(req);
    let Some(token) = presented else {
        return Some(HttpReply::json(
            401,
            "Unauthorized",
            r#"{"error":"unauthorized"}"#.to_string(),
        ));
    };
    if !ct_eq(token.as_bytes(), expected.as_bytes()) {
        return Some(HttpReply::json(
            403,
            "Forbidden",
            r#"{"error":"forbidden"}"#.to_string(),
        ));
    }
    None
}

fn extract_control_token(req: &HttpRequest) -> Option<&str> {
    if let Some(hdr) = req
        .header("x-vox-control-token")
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(hdr);
    }
    let auth = req.header("authorization")?.trim();
    let (scheme, token) = auth.split_once(' ')?;
    if scheme.eq_ignore_ascii_case("bearer") {
        let cleaned = token.trim();
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

fn handle_checkpoint(ctx: &MemoriaContext) -> HttpReply {
    let state_file = ctx.store.root().join("state.json");
    let ckpt_dir = ctx.store.root().join("checkpoints");
    if fs::create_dir_all(&ckpt_dir).is_err() {
        return HttpReply::json(
            500,
            "Internal Server Error",
            r#"{"error":"checkpoint_io_error"}"#.to_string(),
        );
    }
    let name = format!("state-{}.json", unix_now_ms());
    let target = ckpt_dir.join(&name);
    let data = fs::read(&state_file).unwrap_or_else(|_| {
        ctx.store
            .export_state(0, false)
            .to_json_string()
            .into_bytes()
    });
    if fs::write(&target, data).is_err() {
        return HttpReply::json(
            500,
            "Internal Server Error",
            r#"{"error":"checkpoint_write_failed"}"#.to_string(),
        );
    }
    ctx.record_log("CHECKPOINT", &format!("Saved {name}"));
    let payload = JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        ("checkpointFile".to_string(), JsonValue::String(name)),
        (
            "fullPath".to_string(),
            JsonValue::String(target.to_string_lossy().into_owned()),
        ),
    ]);
    HttpReply::json(200, "OK", payload.to_json_string())
}

fn handle_memory_state_get(raw_path: &str, ctx: &MemoriaContext) -> HttpReply {
    let since = query_param(raw_path, "since")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let include_blobs = query_param(raw_path, "includeBlobs")
        .map(|v| !matches!(v.to_ascii_lowercase().as_str(), "0" | "false" | "no"))
        .unwrap_or(true);
    let mut exported = ctx.store.export_state(since, include_blobs);
    exported.set_field("telemetry", build_telemetry_object(ctx));
    HttpReply::json(200, "OK", exported.to_json_string())
}

fn handle_memory_blob_get(hash: &str, ctx: &MemoriaContext) -> HttpReply {
    match ctx.store.get_blob(hash) {
        Some(blob) => HttpReply::json(200, "OK", blob.to_json_string()),
        None => HttpReply::json(
            404,
            "Not Found",
            r#"{"error":"blob_not_found"}"#.to_string(),
        ),
    }
}

fn handle_memory_vault_get(key: &str, ctx: &MemoriaContext) -> HttpReply {
    match ctx.store.get_vault(key) {
        Some(record) => {
            let payload = JsonValue::Object(vec![
                ("status".to_string(), JsonValue::String("ok".to_string())),
                (
                    "vaultKey".to_string(),
                    JsonValue::String(key.trim().to_ascii_lowercase()),
                ),
                ("record".to_string(), record),
            ]);
            HttpReply::json(200, "OK", payload.to_json_string())
        }
        None => HttpReply::json(
            404,
            "Not Found",
            r#"{"error":"vault_not_found"}"#.to_string(),
        ),
    }
}

fn handle_memory_ingest(body: &[u8], ctx: &MemoriaContext) -> HttpReply {
    match ctx.store.ingest_event(body) {
        Ok((changed, summary)) => {
            if changed {
                ctx.record_log("INGEST", "Central memory updated");
            }
            let (code, reason) = if changed {
                (201, "Created")
            } else {
                (200, "OK")
            };
            HttpReply::json(code, reason, summary.to_json_string())
        }
        Err(MemoryError::TooLarge) => payload_too_large(),
        Err(MemoryError::BadRequest(msg)) => bad_request(&msg),
    }
}

fn handle_memory_sync(body: &[u8], ctx: &MemoriaContext) -> HttpReply {
    match ctx.store.sync_bundle(body) {
        Ok(result) => HttpReply::json(200, "OK", result.to_json_string()),
        Err(MemoryError::TooLarge) => payload_too_large(),
        Err(MemoryError::BadRequest(msg)) => bad_request(&msg),
    }
}

fn handle_memory_vault_post(key: &str, body: &[u8], ctx: &MemoriaContext) -> HttpReply {
    match ctx.store.save_vault(key, body) {
        Ok(outcome) => {
            let (code, reason) = match outcome {
                VaultOutcome::Saved => (200, "OK"),
                VaultOutcome::Forbidden => (403, "Forbidden"),
                VaultOutcome::Invalid => (400, "Bad Request"),
            };
            HttpReply::json(
                code,
                reason,
                format!(r#"{{"status":"{}"}}"#, outcome.as_str()),
            )
        }
        Err(MemoryError::TooLarge) => payload_too_large(),
        Err(MemoryError::BadRequest(msg)) => bad_request(&msg),
    }
}

fn build_telemetry_object(ctx: &MemoriaContext) -> JsonValue {
    JsonValue::Object(vec![
        (
            "pid".to_string(),
            JsonValue::Number(std::process::id().to_string()),
        ),
        (
            "uptimeSec".to_string(),
            JsonValue::Number(ctx.started_at.elapsed().as_secs().to_string()),
        ),
        (
            "requestsServed".to_string(),
            JsonValue::Number(ctx.requests.load(Ordering::Relaxed).to_string()),
        ),
        ("isPaused".to_string(), JsonValue::Bool(ctx.is_paused())),
        ("isRunning".to_string(), JsonValue::Bool(ctx.is_running())),
        (
            "platform".to_string(),
            JsonValue::String(env::consts::OS.to_string()),
        ),
        (
            "timestamp".to_string(),
            JsonValue::Number(unix_now_ms().to_string()),
        ),
    ])
}

fn build_health_json(ctx: &MemoriaContext) -> String {
    let mut summary = ctx.store.status_summary();
    summary.set_field("telemetry", build_telemetry_object(ctx));
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "app".to_string(),
            JsonValue::String("Vox Memoria".to_string()),
        ),
        (
            "service".to_string(),
            JsonValue::String("vox-memoria".to_string()),
        ),
        (
            "package".to_string(),
            JsonValue::String(PKG_NAME.to_string()),
        ),
        (
            "version".to_string(),
            JsonValue::String(PKG_VERSION.to_string()),
        ),
        ("mode".to_string(), JsonValue::String("memoria".to_string())),
        (
            "genesisMs".to_string(),
            JsonValue::Number(GENESIS_MS.to_string()),
        ),
        ("paused".to_string(), JsonValue::Bool(ctx.is_paused())),
        ("centralMemory".to_string(), summary),
        ("telemetry".to_string(), build_telemetry_object(ctx)),
    ])
    .to_json_string()
}

fn build_status_json(ctx: &MemoriaContext) -> String {
    let state_label = if !ctx.is_running() {
        "STOPPED"
    } else if ctx.is_paused() {
        "PAUSED"
    } else {
        "ACTIVE"
    };
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "app".to_string(),
            JsonValue::String("Vox Memoria".to_string()),
        ),
        (
            "service".to_string(),
            JsonValue::String("vox-memoria".to_string()),
        ),
        ("mode".to_string(), JsonValue::String("memoria".to_string())),
        (
            "state".to_string(),
            JsonValue::String(state_label.to_string()),
        ),
        ("paused".to_string(), JsonValue::Bool(ctx.is_paused())),
        (
            "platform".to_string(),
            JsonValue::String(env::consts::OS.to_string()),
        ),
        (
            "requestsServed".to_string(),
            JsonValue::Number(ctx.requests.load(Ordering::Relaxed).to_string()),
        ),
        ("telemetry".to_string(), build_telemetry_object(ctx)),
        ("centralMemory".to_string(), ctx.store.status_summary()),
    ])
    .to_json_string()
}

fn build_telemetry_envelope(ctx: &MemoriaContext) -> String {
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        ("telemetry".to_string(), build_telemetry_object(ctx)),
    ])
    .to_json_string()
}

fn build_memory_status_json(ctx: &MemoriaContext) -> String {
    let mut summary = ctx.store.status_summary();
    summary.set_field("telemetry", build_telemetry_object(ctx));
    summary.to_json_string()
}

fn build_logs_json(ctx: &MemoriaContext) -> String {
    let logs = ctx.recent_logs();
    let items: Vec<JsonValue> = logs.into_iter().map(JsonValue::String).collect();
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "count".to_string(),
            JsonValue::Number(items.len().to_string()),
        ),
        ("logs".to_string(), JsonValue::Array(items)),
    ])
    .to_json_string()
}

fn build_vaults_json(ctx: &MemoriaContext) -> String {
    let vaults_dir = ctx.store.root().join("vaults");
    let mut items = Vec::new();
    if let Ok(entries) = fs::read_dir(vaults_dir) {
        for entry in entries.flatten() {
            if let Some(meta) = vault_entry_metadata(&entry.path()) {
                items.push(meta);
            }
        }
    }
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "count".to_string(),
            JsonValue::Number(items.len().to_string()),
        ),
        ("vaults".to_string(), JsonValue::Array(items)),
    ])
    .to_json_string()
}

fn vault_entry_metadata(path: &Path) -> Option<JsonValue> {
    if path.extension().and_then(|e| e.to_str()) != Some("json") {
        return None;
    }
    let key = path.file_stem()?.to_str()?.to_string();
    let meta = fs::metadata(path).ok()?;
    let updated_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some(JsonValue::Object(vec![
        ("key".to_string(), JsonValue::String(key)),
        (
            "sizeBytes".to_string(),
            JsonValue::Number(meta.len().to_string()),
        ),
        (
            "updatedAt".to_string(),
            JsonValue::Number(updated_ms.to_string()),
        ),
        (
            "algorithm".to_string(),
            JsonValue::String("AES-256-GCM / PBKDF2".to_string()),
        ),
        ("isEncrypted".to_string(), JsonValue::Bool(true)),
    ]))
}

fn read_request_body(
    stream: &mut TcpStream,
    req: &HttpRequest,
    initial_body: &[u8],
    max_bytes: usize,
    timeout: Duration,
) -> Result<Vec<u8>, HttpReply> {
    let content_len = match req.header("content-length") {
        None => 0,
        Some(raw) => raw
            .trim()
            .parse::<usize>()
            .map_err(|_| bad_request("invalid Content-Length"))?,
    };
    if content_len > max_bytes {
        return Err(payload_too_large());
    }
    if content_len == 0 {
        return Ok(Vec::new());
    }
    let mut buf = Vec::with_capacity(content_len);
    let take = initial_body.len().min(content_len);
    buf.extend_from_slice(&initial_body[..take]);
    let deadline = Instant::now() + timeout;
    let mut chunk = [0u8; 4096];
    while buf.len() < content_len {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return Err(bad_request("request body timeout"));
        };
        let _ = stream.set_read_timeout(Some(remaining));
        let want = (content_len - buf.len()).min(chunk.len());
        match stream.read(&mut chunk[..want]) {
            Ok(0) => return Err(bad_request("truncated request body")),
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => return Err(bad_request("failed reading request body")),
        }
    }
    Ok(buf)
}

fn format_http_response(reply: &HttpReply, origin: Option<&str>, guard: &GuardPolicy) -> Vec<u8> {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Vary: Origin\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD\r\n\
         Access-Control-Allow-Headers: Content-Type, Authorization, X-Vox-Control-Token\r\n\
         X-Content-Type-Options: nosniff\r\n\
         X-Frame-Options: SAMEORIGIN\r\n\
         Connection: close\r\n",
        reply.status,
        reply.reason,
        reply.content_type,
        reply.body.len()
    );
    if let Some(allowed) = guard.cors_allow_origin(origin) {
        head.push_str(&format!("Access-Control-Allow-Origin: {allowed}\r\n"));
    }
    head.push_str("\r\n");
    let mut out = head.into_bytes();
    out.extend_from_slice(&reply.body);
    out
}

fn normalize_path(raw: &str) -> &str {
    let without_query = raw.split('?').next().unwrap_or(raw);
    let trimmed = without_query.trim_end_matches('/');
    if trimmed.is_empty() {
        "/"
    } else {
        trimmed
    }
}

fn query_param<'a>(raw_path: &'a str, key: &str) -> Option<&'a str> {
    let (_, query) = raw_path.split_once('?')?;
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v);
            }
        }
    }
    None
}

fn is_json_content_type(header: Option<&str>) -> bool {
    let Some(raw) = header else {
        return false;
    };
    let mime = raw.split(';').next().unwrap_or("").trim();
    mime.eq_ignore_ascii_case("application/json")
}

fn not_found() -> HttpReply {
    HttpReply::json(404, "Not Found", r#"{"error":"not_found"}"#.to_string())
}

fn payload_too_large() -> HttpReply {
    HttpReply::json(
        413,
        "Payload Too Large",
        r#"{"error":"payload_too_large"}"#.to_string(),
    )
}

fn bad_request(msg: &str) -> HttpReply {
    let err = JsonValue::Object(vec![(
        "error".to_string(),
        JsonValue::String(msg.to_string()),
    )]);
    HttpReply::json(400, "Bad Request", err.to_json_string())
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

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
