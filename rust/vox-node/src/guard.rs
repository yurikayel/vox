//! Host, Origin, and CORS request guard matching `relay/request_guard.py` (T22, T32).

use std::env;

/// Built-in allowed application origins (GitHub Pages and Cloudflare Pages).
pub const APP_ORIGINS: &[&str] = &["https://yurikayel.github.io", "https://vox-9df.pages.dev"];

const LOOPBACK_NAMES: &[&str] = &["127.0.0.1", "localhost", "::1"];

/// Configuration snapshot for Host/Origin allowlists.
#[derive(Debug, Clone, Default)]
pub struct GuardPolicy {
    /// Additional allowed hostnames for loopback DNS-rebinding guard (`VOX_RELAY_ALLOWED_HOSTS`).
    pub allowed_hosts: Vec<String>,
    /// Additional allowed origins for CORS and WebSocket upgrades (`VOX_RELAY_ALLOWED_ORIGINS`).
    pub allowed_origins: Vec<String>,
}

impl GuardPolicy {
    /// Loads allowlists from process environment variables.
    pub fn from_env() -> Self {
        Self {
            allowed_hosts: parse_env_list("VOX_RELAY_ALLOWED_HOSTS"),
            allowed_origins: parse_env_list("VOX_RELAY_ALLOWED_ORIGINS"),
        }
    }

    /// Returns `true` if `host_header` is permitted when bound to `bound_host`.
    ///
    /// Restriction applies only when `bound_host` is a loopback address.
    pub fn host_allowed(&self, host_header: Option<&str>, bound_host: &str) -> bool {
        if !is_loopback(bound_host) {
            return true;
        }
        let name = extract_hostname(host_header.unwrap_or(""));
        if name.is_empty() {
            return false;
        }
        LOOPBACK_NAMES.contains(&name.as_str()) || self.allowed_hosts.iter().any(|h| h == &name)
    }

    /// Reconstructs an allowed `Access-Control-Allow-Origin` header value, or `None`.
    ///
    /// Never echoes raw untrusted input and rejects control characters (`<= 0x20` or `0x7F`).
    pub fn cors_allow_origin(&self, origin: Option<&str>) -> Option<String> {
        let raw = origin?;
        if raw.is_empty() || has_control_chars(raw) {
            return None;
        }
        let lowered = raw.to_ascii_lowercase();
        let trimmed = lowered.trim_end_matches('/');
        if let Some(&app) = APP_ORIGINS.iter().find(|&&entry| entry == trimmed) {
            return Some(app.to_string());
        }
        if let Some(extra) = self
            .allowed_origins
            .iter()
            .find(|entry| entry.as_str() == trimmed)
        {
            return Some(extra.clone());
        }
        reconstruct_loopback_origin(trimmed)
    }

    /// Returns `true` if an `Origin` header is allowed for WebSocket upgrade.
    ///
    /// Absent `Origin` (native clients / CLI) is permitted.
    pub fn ws_origin_allowed(&self, origin: Option<&str>) -> bool {
        match origin {
            None | Some("") => true,
            Some(val) => self.cors_allow_origin(Some(val)).is_some(),
        }
    }
}

/// Returns `true` if `name` (host, `host:port`, or origin URL) resolves to loopback.
pub fn is_loopback(name: &str) -> bool {
    let host = extract_hostname(name);
    LOOPBACK_NAMES.contains(&host.as_str())
}

fn parse_env_list(var: &str) -> Vec<String> {
    let raw = env::var(var).unwrap_or_default();
    raw.split(',')
        .map(|item| {
            item.trim()
                .to_ascii_lowercase()
                .trim_end_matches('/')
                .to_string()
        })
        .filter(|item| !item.is_empty())
        .collect()
}

fn has_control_chars(value: &str) -> bool {
    value.bytes().any(|b| b <= 0x20 || b == 0x7F)
}

fn extract_hostname(value: &str) -> String {
    let text = value.trim().to_ascii_lowercase();
    if text.is_empty() {
        return String::new();
    }
    let after_scheme = match text.split_once("://") {
        Some((_, rest)) => rest,
        None => text.as_str(),
    };
    let authority = after_scheme.split('/').next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    if let Some(rest) = host_port.strip_prefix('[') {
        return rest.split(']').next().unwrap_or("").to_string();
    }
    if host_port.matches(':').count() > 1 {
        return host_port.to_string();
    }
    host_port.split(':').next().unwrap_or("").to_string()
}

fn reconstruct_loopback_origin(text: &str) -> Option<String> {
    let (scheme, rest) = if let Some(r) = text.strip_prefix("http://") {
        ("http", r)
    } else {
        ("https", text.strip_prefix("https://")?)
    };
    if rest.contains('/') || rest.contains('@') || rest.contains('?') || rest.contains('#') {
        return None;
    }
    let (host, port) = split_loopback_host_port(rest)?;
    let rebuilt = match port {
        Some(p) => format!("{scheme}://{host}:{p}"),
        None => format!("{scheme}://{host}"),
    };
    (rebuilt == text).then_some(rebuilt)
}

fn split_loopback_host_port(rest: &str) -> Option<(&'static str, Option<u16>)> {
    if let Some(after_v6) = rest.strip_prefix("[::1]") {
        let port = parse_optional_port(after_v6)?;
        return Some(("[::1]", port));
    }
    let (h, port_str) = match rest.split_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (rest, None),
    };
    let canonical = match h {
        "127.0.0.1" => "127.0.0.1",
        "localhost" => "localhost",
        _ => return None,
    };
    let port = match port_str {
        Some(p) => Some(p.parse::<u16>().ok()?),
        None => None,
    };
    Some((canonical, port))
}

fn parse_optional_port(suffix: &str) -> Option<Option<u16>> {
    if suffix.is_empty() {
        return Some(None);
    }
    let port_str = suffix.strip_prefix(':')?;
    let port = port_str.parse::<u16>().ok()?;
    Some(Some(port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_guard_restricts_only_loopback_bind() {
        let policy = GuardPolicy {
            allowed_hosts: vec!["tunnel.example".to_string()],
            allowed_origins: vec![],
        };
        assert!(policy.host_allowed(Some("127.0.0.1:3921"), "127.0.0.1"));
        assert!(policy.host_allowed(Some("localhost:3921"), "127.0.0.1"));
        assert!(policy.host_allowed(Some("[::1]:3921"), "::1"));
        assert!(policy.host_allowed(Some("tunnel.example"), "127.0.0.1"));
        assert!(!policy.host_allowed(Some("evil.example"), "127.0.0.1"));
        assert!(!policy.host_allowed(None, "127.0.0.1"));
        assert!(policy.host_allowed(Some("evil.example"), "0.0.0.0"));
    }

    #[test]
    fn cors_and_ws_origin_match_python_contract() {
        let policy = GuardPolicy {
            allowed_hosts: vec![],
            allowed_origins: vec!["https://meu.exemplo".to_string()],
        };
        assert_eq!(
            policy.cors_allow_origin(Some("HTTPS://YURIKAYEL.GITHUB.IO")),
            Some("https://yurikayel.github.io".to_string())
        );
        assert_eq!(
            policy.cors_allow_origin(Some("http://localhost:8080")),
            Some("http://localhost:8080".to_string())
        );
        assert_eq!(
            policy.cors_allow_origin(Some("https://meu.exemplo")),
            Some("https://meu.exemplo".to_string())
        );
        assert_eq!(policy.cors_allow_origin(Some("https://evil.example")), None);
        assert_eq!(
            policy.cors_allow_origin(Some("https://yurikayel.github.io\x01")),
            None
        );
        assert_eq!(policy.cors_allow_origin(None), None);
        assert!(policy.ws_origin_allowed(None));
        assert!(!policy.ws_origin_allowed(Some("https://evil.example")));
    }
}
