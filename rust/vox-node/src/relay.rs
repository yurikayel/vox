//! Pure-`std` HTTP relay server (`--mode relay`, ADR-039 PR4.2a).
//!
//! Implements essential relay health/status routes (`/`, `/health`, `/status`, `/ping`, `/version`),
//! atomic file-backed `/inbox/<addr>` and `/inbox/<addr>/<msgId>` routes, `Host`/`Origin`/CORS
//! guards, `Content-Type` validation, per-IP rate limiting, and `T31` rejected-body draining.

use std::env;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use vox_core::genesis_data::GENESIS_MS;

use crate::guard::GuardPolicy;
use crate::http::{parse_http_request, read_handshake_request, HttpRequest};
use crate::json::JsonValue;
use crate::limits::{ConnectionSlots, RelayLimiter, RelayLimitsConfig};
use crate::relay_store::{
    DeleteOutcome, InboxStore, StoreError, DEFAULT_INBOX_TTL_SECS, MAX_ENVELOPE_SIZE,
};

/// Default listen host in relay mode (`127.0.0.1`, Cold Readiness).
pub const DEFAULT_RELAY_HOST: &str = "127.0.0.1";
/// Default listen port in relay mode (`3920`, matching `relay/server.py`).
pub const DEFAULT_RELAY_PORT: u16 = 3920;
/// Default per-connection socket read timeout (`10 s`, matching `VOX_RELAY_SOCKET_TIMEOUT`).
pub const DEFAULT_SOCKET_TIMEOUT: Duration = Duration::from_secs(10);

const RELAY_API_VERSION: &str = "0.2.1";
const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");
const REJECTED_DRAIN_MAX: usize = 1024 * 1024;
const REJECTED_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);

/// Runtime configuration for the HTTP relay server (`--mode relay`).
#[derive(Debug, Clone)]
pub struct RelayConfig {
    /// Interface address to bind (defaults to `127.0.0.1`).
    pub host: String,
    /// TCP port to bind (`0` selects an ephemeral OS port).
    pub port: u16,
    /// Base data directory for relay persistence (`inbox/`).
    pub data_dir: PathBuf,
    /// Optional explicit inbox directory override (`VOX_RELAY_INBOX_DIR`).
    pub inbox_dir: Option<PathBuf>,
    /// Socket read deadline for headers and request bodies.
    pub socket_timeout: Duration,
    /// Inbox envelope TTL in seconds (default 72 hours).
    pub inbox_ttl_secs: u64,
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
            socket_timeout: DEFAULT_SOCKET_TIMEOUT,
            inbox_ttl_secs: DEFAULT_INBOX_TTL_SECS,
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
        let inbox_dir = if data_dir_override.is_some() {
            None
        } else {
            env_non_empty("VOX_RELAY_INBOX_DIR").map(PathBuf::from)
        };
        let timeout_secs = env_non_empty("VOX_RELAY_SOCKET_TIMEOUT")
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|&s| s > 0)
            .unwrap_or(DEFAULT_SOCKET_TIMEOUT.as_secs());
        Self {
            host,
            port,
            data_dir,
            inbox_dir,
            socket_timeout: Duration::from_secs(timeout_secs),
            inbox_ttl_secs: DEFAULT_INBOX_TTL_SECS,
            guard: GuardPolicy::from_env(),
            limits: RelayLimitsConfig::from_env(),
        }
    }

    fn resolved_inbox_dir(&self) -> PathBuf {
        self.inbox_dir
            .clone()
            .unwrap_or_else(|| self.data_dir.join("inbox"))
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

struct RelayContext {
    config: RelayConfig,
    store: InboxStore,
    limiter: RelayLimiter,
    slots: ConnectionSlots,
}

/// Running HTTP relay server bound to a local TCP socket.
pub struct RelayServer {
    listener: TcpListener,
    local_addr: SocketAddr,
    ctx: Arc<RelayContext>,
    stop: Arc<AtomicBool>,
}

/// Handle to a background relay server thread with graceful shutdown support.
pub struct RelayServerHandle {
    local_addr: SocketAddr,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
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

    /// Signals the accept loop to stop and joins the server thread.
    pub fn shutdown(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.local_addr);
        if let Some(handle) = self.join.take() {
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
        let store = InboxStore::new(config.resolved_inbox_dir());
        let limiter = RelayLimiter::new(config.limits);
        let slots = ConnectionSlots::new(config.limits.max_connections);
        let ctx = Arc::new(RelayContext {
            config,
            store,
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

    /// Spawns the accept loop on a background thread and returns a [`RelayServerHandle`].
    pub fn spawn(self) -> RelayServerHandle {
        let local_addr = self.local_addr;
        let stop = Arc::clone(&self.stop);
        let join = thread::Builder::new()
            .name("vox-relay-accept".to_string())
            .spawn(move || self.serve_forever())
            .ok();
        RelayServerHandle {
            local_addr,
            stop,
            join,
        }
    }
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
        "GET" | "HEAD" => route_read(clean_path, req.method == "HEAD", ctx),
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

fn route_read(clean_path: &str, is_head: bool, ctx: &RelayContext) -> RelayReply {
    let payload = match clean_path {
        "" | "/" | "/health" => Some(build_health_json(ctx)),
        "/status" | "/ping" => Some(format!(
            r#"{{"status":"ok","service":"vox-relay","version":"{RELAY_API_VERSION}"}}"#
        )),
        "/version" => Some(format!(
            r#"{{"service":"vox-relay","version":"{RELAY_API_VERSION}","package":"{PKG_NAME}","packageVersion":"{PKG_VERSION}"}}"#
        )),
        _ if clean_path.starts_with("/inbox/") => {
            let addr = clean_path
                .trim_start_matches("/inbox/")
                .split('/')
                .next()
                .unwrap_or("");
            let list = ctx.store.list_envelopes(addr);
            let obj = JsonValue::Object(vec![("envelopes".to_string(), JsonValue::Array(list))]);
            Some(obj.to_json_string())
        }
        _ => None,
    };
    match payload {
        Some(_) if is_head => RelayReply::empty(200, "OK"),
        Some(json) => RelayReply::json(200, "OK", json),
        None => RelayReply::json(404, "Not Found", r#"{"error":"not_found"}"#.to_string()),
    }
}

fn route_post(
    clean_path: &str,
    req: &HttpRequest,
    initial_body: &[u8],
    stream: &mut TcpStream,
    ctx: &RelayContext,
) -> RelayReply {
    let Some(rest) = clean_path.strip_prefix("/inbox/") else {
        return RelayReply::json(404, "Not Found", r#"{"error":"not_found"}"#.to_string());
    };
    let addr = rest.split('/').next().unwrap_or("");
    let content_length = parse_content_length(req);
    if content_length > MAX_ENVELOPE_SIZE {
        return RelayReply::json(
            413,
            "Payload Too Large",
            r#"{"error":"payload_too_large"}"#.to_string(),
        );
    }
    let body = match read_exact_body(
        stream,
        initial_body,
        content_length,
        ctx.config.socket_timeout,
    ) {
        Ok(b) => b,
        Err(_) => {
            return RelayReply::json(
                400,
                "Bad Request",
                r#"{"error":"incomplete_request_body"}"#.to_string(),
            );
        }
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

fn route_delete(clean_path: &str, req: &HttpRequest, ctx: &RelayContext) -> RelayReply {
    let Some(rest) = clean_path.strip_prefix("/inbox/") else {
        return RelayReply::json(404, "Not Found", r#"{"error":"not_found"}"#.to_string());
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
    let inbox_count = ctx.store.count_envelopes();
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
        ("dataDir".to_string(), JsonValue::String(data_dir)),
        (
            "inboxCount".to_string(),
            JsonValue::Number(inbox_count.to_string()),
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

fn json_error(message: &str) -> String {
    JsonValue::Object(vec![(
        "error".to_string(),
        JsonValue::String(message.to_string()),
    )])
    .to_json_string()
}
