//! Per-IP token bucket rate limiting and connection slot caps matching `relay/rate_limit.py`.

use std::collections::{HashMap, VecDeque};
use std::env;
use std::net::{IpAddr, Ipv6Addr};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Default maximum simultaneous connections (`VOX_SIGNAL_MAX_CONNECTIONS`).
pub const DEFAULT_MAX_CONNECTIONS: usize = 64;
/// Maximum tracked IP buckets per rate-limit class.
pub const MAX_ENTRIES: usize = 20_000;

/// Rate-limit policy (tokens per minute and maximum burst).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RatePolicy {
    /// Sustained tokens replenished per minute.
    pub per_min: u32,
    /// Maximum burst capacity.
    pub burst: u32,
}

/// Rate-limit configuration for signaling classes and proxy trust.
#[derive(Debug, Clone, Copy)]
pub struct LimitsConfig {
    /// Policy for new WebSocket connections (`signal`, default 30/15).
    pub signal: RatePolicy,
    /// Policy for WebSocket messages (`signal_msg`, default 600/200).
    pub signal_msg: RatePolicy,
    /// Number of trusted reverse proxies (`VOX_RELAY_TRUST_PROXY_HOPS`).
    pub trusted_hops: usize,
    /// Maximum simultaneous connections (`VOX_SIGNAL_MAX_CONNECTIONS`).
    pub max_connections: usize,
}

impl Default for LimitsConfig {
    fn default() -> Self {
        Self {
            signal: RatePolicy {
                per_min: 30,
                burst: 15,
            },
            signal_msg: RatePolicy {
                per_min: 600,
                burst: 200,
            },
            trusted_hops: 0,
            max_connections: DEFAULT_MAX_CONNECTIONS,
        }
    }
}

impl LimitsConfig {
    /// Loads signaling limits from process environment variables.
    pub fn from_env() -> Self {
        let signal = policy_from_env("SIGNAL", 30, 15);
        let signal_msg = policy_from_env("SIGNAL_MSG", 600, 200);
        let trusted_hops = env_positive_usize("VOX_RELAY_TRUST_PROXY_HOPS", 0);
        let max_connections =
            env_positive_usize("VOX_SIGNAL_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS);
        Self {
            signal,
            signal_msg,
            trusted_hops,
            max_connections,
        }
    }
}

fn env_positive_u32(name: &str, fallback: u32) -> u32 {
    env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(fallback)
}

fn env_positive_usize(name: &str, fallback: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(fallback)
}

fn policy_from_env(class_upper: &str, default_per_min: u32, default_burst: u32) -> RatePolicy {
    let per_min = env_positive_u32(
        &format!("VOX_RELAY_RATE_{class_upper}_PER_MIN"),
        default_per_min,
    );
    let burst = env_positive_u32(
        &format!("VOX_RELAY_RATE_{class_upper}_BURST"),
        default_burst.min(per_min),
    );
    RatePolicy { per_min, burst }
}

struct BucketEntry {
    tokens: f64,
    stamp: Instant,
    seq: u64,
}

struct BucketMap {
    rate_per_sec: f64,
    burst: f64,
    max_entries: usize,
    seq: u64,
    entries: HashMap<String, BucketEntry>,
    order: VecDeque<(String, u64)>,
}

impl BucketMap {
    fn new(policy: RatePolicy, max_entries: usize) -> Self {
        Self {
            rate_per_sec: f64::from(policy.per_min) / 60.0,
            burst: f64::from(policy.burst),
            max_entries,
            seq: 0,
            entries: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn refilled(&self, tokens: f64, stamp: Instant, now: Instant) -> f64 {
        let elapsed = now.saturating_duration_since(stamp).as_secs_f64();
        (tokens + elapsed * self.rate_per_sec).min(self.burst)
    }

    fn sweep(&mut self, now: Instant) {
        while let Some((key, seq)) = self.order.front() {
            match self.entries.get(key) {
                Some(entry) if entry.seq == *seq => {
                    if self.refilled(entry.tokens, entry.stamp, now) < self.burst {
                        break;
                    }
                    let key_owned = key.clone();
                    self.order.pop_front();
                    self.entries.remove(&key_owned);
                }
                _ => {
                    self.order.pop_front();
                }
            }
        }
    }

    fn evict_overflow(&mut self) {
        while self.entries.len() > self.max_entries {
            let Some((old_key, old_seq)) = self.order.pop_front() else {
                break;
            };
            if self.entries.get(&old_key).is_some_and(|e| e.seq == old_seq) {
                self.entries.remove(&old_key);
            }
        }
    }

    fn take(&mut self, key: &str, now: Instant) -> u64 {
        self.sweep(now);
        let current = match self.entries.get(key) {
            Some(entry) => self.refilled(entry.tokens, entry.stamp, now),
            None => self.burst,
        };
        let wait = if current >= 1.0 {
            0
        } else {
            ((1.0 - current) / self.rate_per_sec).ceil().max(1.0) as u64
        };
        let next_tokens = if wait == 0 { current - 1.0 } else { current };
        self.seq = self.seq.wrapping_add(1);
        let key_str = key.to_string();
        self.entries.insert(
            key_str.clone(),
            BucketEntry {
                tokens: next_tokens,
                stamp: now,
                seq: self.seq,
            },
        );
        self.order.push_back((key_str, self.seq));
        self.evict_overflow();
        wait
    }
}

/// Thread-safe token bucket limiter for `signal` and `signal_msg` classes.
pub struct SignalingLimiter {
    signal: Mutex<BucketMap>,
    signal_msg: Mutex<BucketMap>,
    trusted_hops: usize,
}

impl SignalingLimiter {
    /// Creates a new limiter from `LimitsConfig`.
    pub fn new(config: LimitsConfig) -> Self {
        Self {
            signal: Mutex::new(BucketMap::new(config.signal, MAX_ENTRIES)),
            signal_msg: Mutex::new(BucketMap::new(config.signal_msg, MAX_ENTRIES)),
            trusted_hops: config.trusted_hops,
        }
    }

    /// Consumes a `signal` connection token; returns `0` if allowed or `Retry-After` seconds.
    pub fn check_signal(&self, ip: &str) -> u64 {
        self.signal
            .lock()
            .map(|mut map| map.take(ip, Instant::now()))
            .unwrap_or(0)
    }

    /// Consumes a `signal_msg` token; returns `0` if allowed or wait seconds.
    pub fn check_signal_msg(&self, ip: &str) -> u64 {
        self.signal_msg
            .lock()
            .map(|mut map| map.take(ip, Instant::now()))
            .unwrap_or(0)
    }

    /// Resolves the normalized client IP key respecting `VOX_RELAY_TRUST_PROXY_HOPS`.
    pub fn resolve_client_ip(&self, peer_ip: IpAddr, forwarded_for: Option<&str>) -> String {
        resolve_client_ip(peer_ip, forwarded_for, self.trusted_hops)
    }
}

/// Rate-limit configuration for HTTP relay write classes (`mailbox`, `write`).
#[derive(Debug, Clone, Copy)]
pub struct RelayLimitsConfig {
    /// Policy for `/inbox`, `/memory/*`, `/relay/*` writes (`mailbox`, default 120/60).
    pub mailbox: RatePolicy,
    /// Policy for other HTTP writes (`write`, default 60/30).
    pub write: RatePolicy,
    /// Number of trusted reverse proxies (`VOX_RELAY_TRUST_PROXY_HOPS`).
    pub trusted_hops: usize,
    /// Maximum simultaneous connections (`VOX_RELAY_MAX_CONNECTIONS`).
    pub max_connections: usize,
}

impl Default for RelayLimitsConfig {
    fn default() -> Self {
        Self {
            mailbox: RatePolicy {
                per_min: 120,
                burst: 60,
            },
            write: RatePolicy {
                per_min: 60,
                burst: 30,
            },
            trusted_hops: 0,
            max_connections: DEFAULT_MAX_CONNECTIONS,
        }
    }
}

impl RelayLimitsConfig {
    /// Loads HTTP relay limits from environment variables (`relay/rate_limit.py` parity).
    pub fn from_env() -> Self {
        let legacy = env_opt_positive_u32("VOX_RELAY_WRITE_LIMIT_PER_MIN");
        let mailbox = policy_from_env("MAILBOX", legacy.unwrap_or(120), 60);
        let write = policy_from_env("WRITE", legacy.unwrap_or(60), 30);
        let trusted_hops = env_positive_usize("VOX_RELAY_TRUST_PROXY_HOPS", 0);
        let max_connections =
            env_positive_usize("VOX_RELAY_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS);
        Self {
            mailbox,
            write,
            trusted_hops,
            max_connections,
        }
    }
}

fn env_opt_positive_u32(name: &str) -> Option<u32> {
    env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .filter(|&n| n > 0)
}

/// Thread-safe token bucket limiter for HTTP relay write endpoints (`mailbox` and `write`).
pub struct RelayLimiter {
    mailbox: Mutex<BucketMap>,
    write: Mutex<BucketMap>,
    trusted_hops: usize,
}

impl RelayLimiter {
    /// Creates a new HTTP relay limiter from [`RelayLimitsConfig`].
    pub fn new(config: RelayLimitsConfig) -> Self {
        Self {
            mailbox: Mutex::new(BucketMap::new(config.mailbox, MAX_ENTRIES)),
            write: Mutex::new(BucketMap::new(config.write, MAX_ENTRIES)),
            trusted_hops: config.trusted_hops,
        }
    }

    /// Consumes a token for a write request (`POST`/`DELETE`) on `path`.
    ///
    /// Returns `0` when allowed or the `Retry-After` wait in seconds when rate-limited.
    pub fn check_http_write(&self, path: &str, ip: &str) -> u64 {
        let bucket = if path.starts_with("/inbox")
            || path.starts_with("/memory/")
            || path.starts_with("/relay/")
        {
            &self.mailbox
        } else {
            &self.write
        };
        bucket
            .lock()
            .map(|mut map| map.take(ip, Instant::now()))
            .unwrap_or(0)
    }

    /// Resolves the normalized client IP key respecting `VOX_RELAY_TRUST_PROXY_HOPS`.
    pub fn resolve_client_ip(&self, peer_ip: IpAddr, forwarded_for: Option<&str>) -> String {
        resolve_client_ip(peer_ip, forwarded_for, self.trusted_hops)
    }
}

/// Normalizes an IP address for bucketing (IPv4-mapped -> IPv4, IPv6 -> `/64` prefix).
pub fn normalize_bucket_ip(raw: &str) -> Option<String> {
    let cleaned = raw.trim().trim_start_matches('[').trim_end_matches(']');
    let addr: IpAddr = cleaned.parse().ok()?;
    Some(match addr {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => normalize_v6(v6),
    })
}

fn normalize_v6(v6: Ipv6Addr) -> String {
    if let Some(v4) = v6.to_ipv4_mapped() {
        return v4.to_string();
    }
    let segs = v6.segments();
    Ipv6Addr::new(segs[0], segs[1], segs[2], segs[3], 0, 0, 0, 0).to_string()
}

/// Resolves the client IP using `X-Forwarded-For` when `trusted_hops >= 1`.
pub fn resolve_client_ip(
    peer_ip: IpAddr,
    forwarded_for: Option<&str>,
    trusted_hops: usize,
) -> String {
    if trusted_hops > 0 {
        if let Some(xff) = forwarded_for {
            let entries: Vec<&str> = xff
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect();
            if entries.len() >= trusted_hops {
                let idx = entries.len() - trusted_hops;
                if let Some(chosen) = normalize_bucket_ip(entries[idx]) {
                    return chosen;
                }
            }
        }
    }
    normalize_bucket_ip(&peer_ip.to_string()).unwrap_or_else(|| peer_ip.to_string())
}

/// Non-blocking global connection slot cap (`VOX_SIGNAL_MAX_CONNECTIONS`).
#[derive(Clone)]
pub struct ConnectionSlots {
    active: Arc<AtomicUsize>,
    max: usize,
}

/// RAII guard that releases a connection slot when dropped.
pub struct SlotGuard {
    active: Arc<AtomicUsize>,
}

impl Drop for SlotGuard {
    fn drop(&mut self) {
        self.active.fetch_sub(1, Ordering::AcqRel);
    }
}

impl ConnectionSlots {
    /// Creates a new connection limiter with capacity `max`.
    pub fn new(max: usize) -> Self {
        Self {
            active: Arc::new(AtomicUsize::new(0)),
            max: max.max(1),
        }
    }

    /// Tries to acquire a slot without blocking; returns `None` when at capacity.
    pub fn try_acquire(&self) -> Option<SlotGuard> {
        let mut current = self.active.load(Ordering::Acquire);
        loop {
            if current >= self.max {
                return None;
            }
            match self.active.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    return Some(SlotGuard {
                        active: Arc::clone(&self.active),
                    });
                }
                Err(actual) => current = actual,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipv6_buckets_by_64_and_unmaps_v4() {
        assert_eq!(
            normalize_bucket_ip("2001:db8:abcd:0012::cafe:1"),
            Some("2001:db8:abcd:12::".to_string())
        );
        assert_eq!(
            normalize_bucket_ip("::ffff:192.0.2.10"),
            Some("192.0.2.10".to_string())
        );
    }

    #[test]
    fn xff_picks_nth_from_right_when_trusted() {
        let peer: IpAddr = "127.0.0.1".parse().unwrap();
        assert_eq!(
            resolve_client_ip(peer, Some("1.1.1.1, 2.2.2.2"), 0),
            "127.0.0.1"
        );
        assert_eq!(
            resolve_client_ip(peer, Some("1.1.1.1, 2.2.2.2"), 1),
            "2.2.2.2"
        );
        assert_eq!(
            resolve_client_ip(peer, Some("1.1.1.1, 2.2.2.2"), 2),
            "1.1.1.1"
        );
        assert_eq!(resolve_client_ip(peer, Some("not-an-ip"), 1), "127.0.0.1");
    }

    #[test]
    fn token_bucket_enforces_burst_and_returns_retry_after() {
        let cfg = LimitsConfig {
            signal: RatePolicy {
                per_min: 60,
                burst: 2,
            },
            ..LimitsConfig::default()
        };
        let limiter = SignalingLimiter::new(cfg);
        assert_eq!(limiter.check_signal("127.0.0.1"), 0);
        assert_eq!(limiter.check_signal("127.0.0.1"), 0);
        assert!(limiter.check_signal("127.0.0.1") >= 1);
    }

    #[test]
    fn connection_slots_enforces_cap_and_releases_on_drop() {
        let slots = ConnectionSlots::new(2);
        let g1 = slots.try_acquire().expect("slot 1");
        let _g2 = slots.try_acquire().expect("slot 2");
        assert!(slots.try_acquire().is_none());
        drop(g1);
        assert!(slots.try_acquire().is_some());
    }
}
