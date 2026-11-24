//! HTTP handshake reader, parser, and signaling health/error responses.

use std::collections::HashMap;
use std::io::{self, Read};
use std::net::TcpStream;
use std::time::{Duration, Instant};

use crate::guard::GuardPolicy;

/// Maximum bytes allowed for an HTTP handshake header block (64 KiB).
pub const MAX_HEADER_SIZE: usize = 64 * 1024;
/// Default total deadline for receiving the HTTP handshake (10 seconds).
pub const DEFAULT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Parsed HTTP request line and lowercase headers.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    /// Uppercase HTTP method (defaults to `"GET"`).
    pub method: String,
    /// Raw request target path (defaults to `"/"`).
    pub path: String,
    /// Lowercase header map.
    pub headers: HashMap<String, String>,
}

impl HttpRequest {
    /// Looks up a header value by lowercase name.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).map(String::as_str)
    }
}

/// Reads an HTTP request up to `\r\n\r\n` within a total wall-clock `timeout`.
pub fn read_handshake_request(
    stream: &mut TcpStream,
    timeout: Duration,
) -> io::Result<Option<Vec<u8>>> {
    let deadline = Instant::now() + timeout;
    let mut buf = Vec::with_capacity(512);
    let mut chunk = [0u8; 1024];

    while !contains_header_end(&buf) {
        if buf.len() > MAX_HEADER_SIZE {
            return Ok(None);
        }
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return Ok(None);
        };
        if remaining.is_zero() {
            return Ok(None);
        }
        stream.set_read_timeout(Some(remaining))?;
        match stream.read(&mut chunk) {
            Ok(0) => return Ok(None),
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(err)
                if matches!(
                    err.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) =>
            {
                return Ok(None);
            }
            Err(err) => return Err(err),
        }
    }
    Ok(Some(buf))
}

fn contains_header_end(buf: &[u8]) -> bool {
    buf.windows(4).any(|w| w == b"\r\n\r\n")
}

/// Parses the HTTP request head (request line + headers) from raw bytes.
pub fn parse_http_request(raw: &[u8]) -> HttpRequest {
    let head_end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .unwrap_or(raw.len());
    let text = String::from_utf8_lossy(&raw[..head_end]);
    let mut lines = text.split("\r\n");
    let first = lines.next().unwrap_or("");
    let (method, path) = parse_request_line(first);
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    HttpRequest {
        method,
        path,
        headers,
    }
}

fn parse_request_line(line: &str) -> (String, String) {
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_ascii_uppercase();
    let path = parts.next().unwrap_or("/").to_string();
    (method, path)
}

/// Formats an HTTP/1.1 response with strict CORS allowlist and `Vary: Origin`.
pub fn make_http_response(
    status_code: u16,
    status_text: &str,
    body: &[u8],
    extra_headers: &[String],
    origin: Option<&str>,
    policy: &GuardPolicy,
) -> Vec<u8> {
    let has_custom_ct = extra_headers
        .iter()
        .any(|h| h.to_ascii_lowercase().starts_with("content-type:"));
    let mut head = format!("HTTP/1.1 {status_code} {status_text}\r\n");
    if !has_custom_ct {
        head.push_str("Content-Type: application/json\r\n");
    }
    head.push_str(&format!("Content-Length: {}\r\n", body.len()));
    for hdr in extra_headers {
        head.push_str(hdr);
        head.push_str("\r\n");
    }
    head.push_str("Vary: Origin\r\n");
    if let Some(allowed) = policy.cors_allow_origin(origin) {
        head.push_str(&format!("Access-Control-Allow-Origin: {allowed}\r\n"));
        head.push_str("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
        head.push_str("Access-Control-Allow-Headers: Content-Type\r\n");
    }
    head.push_str("Connection: close\r\n\r\n");
    let mut out = head.into_bytes();
    out.extend_from_slice(body);
    out
}

/// Builds the HTTP response for signaling health/status routes (`/`, `/health`, `/status`, `/ping`).
pub fn build_http_route_response(
    req: &HttpRequest,
    peer_count: usize,
    policy: &GuardPolicy,
) -> Vec<u8> {
    let origin = req.header("origin");
    if req.method == "OPTIONS" {
        return make_http_response(204, "No Content", b"", &[], origin, policy);
    }
    if req.method == "GET" || req.method == "HEAD" {
        let clean_path = req.path.split('?').next().unwrap_or("/");
        if matches!(clean_path, "/" | "/health" | "/status" | "/ping") {
            let payload = format!(
                "{{\"status\":\"ok\",\"service\":\"vox-signaling\",\"version\":\"1.0.0\",\"peers\":{peer_count}}}"
            );
            let body = if req.method == "HEAD" {
                b"".as_slice()
            } else {
                payload.as_bytes()
            };
            return make_http_response(200, "OK", body, &[], origin, policy);
        }
        return make_http_response(
            404,
            "Not Found",
            br#"{"error":"not_found"}"#,
            &[],
            origin,
            policy,
        );
    }
    make_http_response(
        405,
        "Method Not Allowed",
        br#"{"error":"method_not_allowed"}"#,
        &[],
        origin,
        policy,
    )
}

/// Builds a `101 Switching Protocols` WebSocket handshake response.
pub fn build_ws_accept_response(accept_key: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
    )
    .into_bytes()
}

/// Builds a `421 Misdirected Request` response for rejected `Host` headers on loopback.
pub fn build_host_rejected_response(policy: &GuardPolicy) -> Vec<u8> {
    make_http_response(
        421,
        "Misdirected Request",
        br#"{"error":"host_not_allowed"}"#,
        &[],
        None,
        policy,
    )
}

/// Builds a `403 Forbidden` response for rejected WebSocket `Origin` headers.
pub fn build_origin_rejected_response(policy: &GuardPolicy) -> Vec<u8> {
    make_http_response(
        403,
        "Forbidden",
        br#"{"error":"origin_not_allowed"}"#,
        &[],
        None,
        policy,
    )
}

/// Builds a `429 Too Many Requests` response with `Retry-After`.
pub fn build_rate_limited_response(retry_after: u64, policy: &GuardPolicy) -> Vec<u8> {
    let extra = [format!("Retry-After: {retry_after}")];
    make_http_response(
        429,
        "Too Many Requests",
        br#"{"error":"rate_limited"}"#,
        &extra,
        None,
        policy,
    )
}
