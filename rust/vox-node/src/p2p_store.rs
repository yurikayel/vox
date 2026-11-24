//! In-memory P2P seeder and peer discovery (`VOX-PEER-v1`, `relay/p2p_seeder.py` parity).

use std::collections::{BTreeMap, HashSet};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::json::JsonValue;
use crate::sha1::sha1_digest;

/// Maximum total seeded storage bytes (512 MiB).
pub const DEFAULT_MAX_SEEDER_BYTES: u64 = 512 * 1024 * 1024;
/// Maximum concurrent active seeds.
pub const DEFAULT_MAX_SEEDS: usize = 64;
/// Default peer beacon TTL in seconds.
pub const DEFAULT_PEER_TTL_SECS: u64 = 60;
/// Maximum HTTP payload size for `/p2p/seed` and `/peer/beacon` (16 KiB).
pub const MAX_P2P_PAYLOAD_BYTES: usize = 16 * 1024;

/// Error returned by P2P seeder or peer discovery operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum P2pError {
    /// Validation or allowlist error (`400 Bad Request`).
    BadRequest(String),
    /// Seed count or storage quota exceeded (`413 Payload Too Large`).
    QuotaExceeded(String),
}

#[derive(Debug, Clone)]
struct SeedRecord {
    hash: String,
    info_hash: String,
    size_bytes: u64,
    mime_type: String,
    magnet_uri: String,
    started_at: u64,
}

impl SeedRecord {
    fn to_json(&self) -> JsonValue {
        JsonValue::Object(vec![
            ("hash".to_string(), JsonValue::String(self.hash.clone())),
            (
                "infoHash".to_string(),
                JsonValue::String(self.info_hash.clone()),
            ),
            (
                "sizeBytes".to_string(),
                JsonValue::Number(self.size_bytes.to_string()),
            ),
            (
                "mimeType".to_string(),
                JsonValue::String(self.mime_type.clone()),
            ),
            (
                "magnetUri".to_string(),
                JsonValue::String(self.magnet_uri.clone()),
            ),
            ("filePath".to_string(), JsonValue::Null),
            (
                "startedAt".to_string(),
                JsonValue::Number(self.started_at.to_string()),
            ),
            (
                "uploadedBytes".to_string(),
                JsonValue::Number("0".to_string()),
            ),
            (
                "downloadedBytes".to_string(),
                JsonValue::Number(self.size_bytes.to_string()),
            ),
            (
                "status".to_string(),
                JsonValue::String("seeding".to_string()),
            ),
        ])
    }
}

#[derive(Debug, Clone)]
struct PeerRecord {
    node_id: String,
    host: String,
    http_port: u16,
    control_port: Option<u16>,
    capabilities: Vec<String>,
    version: String,
    last_seen_ms: u64,
}

impl PeerRecord {
    fn to_json(&self) -> JsonValue {
        let caps = self
            .capabilities
            .iter()
            .map(|c| JsonValue::String(c.clone()))
            .collect();
        let ctrl = self
            .control_port
            .map(|p| JsonValue::Number(p.to_string()))
            .unwrap_or(JsonValue::Null);
        JsonValue::Object(vec![
            (
                "nodeId".to_string(),
                JsonValue::String(self.node_id.clone()),
            ),
            ("host".to_string(), JsonValue::String(self.host.clone())),
            (
                "httpPort".to_string(),
                JsonValue::Number(self.http_port.to_string()),
            ),
            ("controlPort".to_string(), ctrl),
            (
                "protocol".to_string(),
                JsonValue::String("VOX-PEER-v1".to_string()),
            ),
            ("capabilities".to_string(), JsonValue::Array(caps)),
            (
                "version".to_string(),
                JsonValue::String(self.version.clone()),
            ),
            (
                "lastSeenTs".to_string(),
                JsonValue::Number(self.last_seen_ms.to_string()),
            ),
            (
                "status".to_string(),
                JsonValue::String("online".to_string()),
            ),
        ])
    }
}

struct P2pInner {
    seeds: BTreeMap<String, SeedRecord>,
    allowed_hashes: HashSet<String>,
    peers: BTreeMap<String, PeerRecord>,
}

/// Thread-safe in-memory P2P seeder and peer discovery registry.
pub struct P2pStore {
    max_storage_bytes: u64,
    max_seeds: usize,
    peer_ttl_ms: u64,
    local_node_id: String,
    inner: Mutex<P2pInner>,
}

impl Default for P2pStore {
    fn default() -> Self {
        Self::new(
            DEFAULT_MAX_SEEDER_BYTES,
            DEFAULT_MAX_SEEDS,
            DEFAULT_PEER_TTL_SECS,
        )
    }
}

impl P2pStore {
    /// Creates a new [`P2pStore`] with explicit quotas and peer TTL.
    pub fn new(max_storage_bytes: u64, max_seeds: usize, peer_ttl_secs: u64) -> Self {
        Self {
            max_storage_bytes,
            max_seeds,
            peer_ttl_ms: peer_ttl_secs.saturating_mul(1000),
            local_node_id: "vox-populi-local".to_string(),
            inner: Mutex::new(P2pInner {
                seeds: BTreeMap::new(),
                allowed_hashes: HashSet::new(),
                peers: BTreeMap::new(),
            }),
        }
    }

    /// Authorizes a 64-hex SHA-256 hash for P2P seeding.
    pub fn authorize_hash(&self, hash: &str) -> bool {
        let clean = hash.trim().to_ascii_lowercase();
        if !is_sha256_hex(&clean) {
            return false;
        }
        if let Ok(mut guard) = self.inner.lock() {
            guard.allowed_hashes.insert(clean);
            return true;
        }
        false
    }

    /// Registers a blob seed from a JSON payload and optional memory-store blob metadata
    /// `(size_bytes, mime_type)`.
    pub fn register_seed(
        &self,
        payload: &JsonValue,
        memory_blob: Option<(u64, String)>,
    ) -> Result<JsonValue, P2pError> {
        if !matches!(payload, JsonValue::Object(_)) {
            return Err(P2pError::BadRequest(
                "Payload de seed deve ser um dicionario JSON".to_string(),
            ));
        }
        let clean_hash = payload
            .get("hash")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if !is_sha256_hex(&clean_hash) {
            return Err(P2pError::BadRequest(format!(
                "Hash SHA-256 invalido para seed: {clean_hash}"
            )));
        }
        let (size_bytes, mime_type, auto_auth) = match memory_blob {
            Some((sz, mime)) => (sz, mime, true),
            None => (
                parse_seed_size(payload.get("sizeBytes"))?,
                payload
                    .get("mimeType")
                    .and_then(JsonValue::as_str)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("application/octet-stream")
                    .to_string(),
                false,
            ),
        };
        if size_bytes == 0 {
            return Err(P2pError::BadRequest(
                "Tamanho do blob deve ser maior que zero".to_string(),
            ));
        }
        self.insert_seed(clean_hash, size_bytes, mime_type, auto_auth)
    }

    fn insert_seed(
        &self,
        clean_hash: String,
        size_bytes: u64,
        mime_type: String,
        auto_auth: bool,
    ) -> Result<JsonValue, P2pError> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| P2pError::BadRequest("lock poisoned".to_string()))?;
        if auto_auth {
            guard.allowed_hashes.insert(clean_hash.clone());
        }
        if !guard.allowed_hashes.contains(&clean_hash) {
            return Err(P2pError::BadRequest(format!(
                "Hash {clean_hash} nao esta na allowlist de blobs autorizados"
            )));
        }
        if !guard.seeds.contains_key(&clean_hash) && guard.seeds.len() >= self.max_seeds {
            return Err(P2pError::QuotaExceeded(format!(
                "Teto maximo de seeds simultaneos ({}) atingido",
                self.max_seeds
            )));
        }
        let current_bytes: u64 = guard
            .seeds
            .values()
            .filter(|s| s.hash != clean_hash)
            .map(|s| s.size_bytes)
            .sum();
        if current_bytes.saturating_add(size_bytes) > self.max_storage_bytes {
            return Err(P2pError::QuotaExceeded(format!(
                "Cota de armazenamento P2P ({} bytes) excedida",
                self.max_storage_bytes
            )));
        }
        let info_hash = hex_encode(&sha1_digest(clean_hash.as_bytes()));
        let magnet_uri = format!(
            "magnet:?xt=urn:btih:{info_hash}&dn=vox-blob-{}&x.sha256={clean_hash}",
            &clean_hash[..12]
        );
        let record = SeedRecord {
            hash: clean_hash.clone(),
            info_hash,
            size_bytes,
            mime_type,
            magnet_uri,
            started_at: unix_now_ms(),
        };
        let out = record.to_json();
        guard.seeds.insert(clean_hash, record);
        Ok(out)
    }

    /// Returns a single active seed by SHA-256 hash.
    pub fn get_seed(&self, hash: &str) -> Option<JsonValue> {
        let clean = hash.trim().to_ascii_lowercase();
        let guard = self.inner.lock().ok()?;
        guard.seeds.get(&clean).map(SeedRecord::to_json)
    }

    /// Lists all active seeds.
    pub fn list_seeds(&self) -> Vec<JsonValue> {
        let Ok(guard) = self.inner.lock() else {
            return Vec::new();
        };
        guard.seeds.values().map(SeedRecord::to_json).collect()
    }

    /// Removes an active seed by SHA-256 hash, returning `true` if it existed.
    pub fn unregister_seed(&self, hash: &str) -> bool {
        let clean = hash.trim().to_ascii_lowercase();
        let Ok(mut guard) = self.inner.lock() else {
            return false;
        };
        guard.seeds.remove(&clean).is_some()
    }

    /// Validates and registers a `VOX-PEER-v1` peer beacon.
    pub fn register_peer(&self, payload: &JsonValue) -> Result<JsonValue, P2pError> {
        self.register_peer_at(payload, unix_now_ms())
    }

    /// Registers a peer beacon at an explicit timestamp `now_ms` (for deterministic TTL tests).
    pub fn register_peer_at(
        &self,
        payload: &JsonValue,
        now_ms: u64,
    ) -> Result<JsonValue, P2pError> {
        let record = parse_peer_record(payload, now_ms)?;
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| P2pError::BadRequest("lock poisoned".to_string()))?;
        let out = record.to_json();
        guard.peers.insert(record.node_id.clone(), record);
        prune_peers_locked(&mut guard.peers, now_ms, self.peer_ttl_ms);
        Ok(out)
    }

    /// Lists non-expired peers as of now.
    pub fn list_peers(&self) -> Vec<JsonValue> {
        self.list_peers_at(unix_now_ms())
    }

    /// Lists non-expired peers as of `now_ms`, pruning expired entries.
    pub fn list_peers_at(&self, now_ms: u64) -> Vec<JsonValue> {
        let Ok(mut guard) = self.inner.lock() else {
            return Vec::new();
        };
        prune_peers_locked(&mut guard.peers, now_ms, self.peer_ttl_ms);
        guard.peers.values().map(PeerRecord::to_json).collect()
    }

    /// Prunes expired peers as of `now_ms` and returns how many were removed.
    pub fn prune_expired_peers_at(&self, now_ms: u64) -> usize {
        let Ok(mut guard) = self.inner.lock() else {
            return 0;
        };
        prune_peers_locked(&mut guard.peers, now_ms, self.peer_ttl_ms)
    }

    /// Builds the unified `/p2p/status` JSON summary.
    pub fn summary(&self) -> JsonValue {
        let now_ms = unix_now_ms();
        let Ok(mut guard) = self.inner.lock() else {
            return JsonValue::Object(vec![(
                "status".to_string(),
                JsonValue::String("ok".to_string()),
            )]);
        };
        prune_peers_locked(&mut guard.peers, now_ms, self.peer_ttl_ms);
        let total_seeded: u64 = guard.seeds.values().map(|s| s.size_bytes).sum();
        let seeder = build_seeder_status(
            guard.seeds.len(),
            total_seeded,
            self.max_storage_bytes,
            self.max_seeds,
            guard.allowed_hashes.len(),
        );
        let discovery = build_discovery_status(&self.local_node_id, guard.peers.len());
        JsonValue::Object(vec![
            ("status".to_string(), JsonValue::String("ok".to_string())),
            ("seeder".to_string(), seeder),
            ("discovery".to_string(), discovery),
        ])
    }
}

fn build_seeder_status(
    seeds_count: usize,
    total_seeded: u64,
    max_storage: u64,
    max_seeds: usize,
    allowed_count: usize,
) -> JsonValue {
    let confinement = JsonValue::Object(vec![
        ("dht".to_string(), JsonValue::Bool(false)),
        ("lsd".to_string(), JsonValue::Bool(false)),
        ("pex".to_string(), JsonValue::Bool(false)),
        ("natPmp".to_string(), JsonValue::Bool(false)),
    ]);
    JsonValue::Object(vec![
        ("seederActive".to_string(), JsonValue::Bool(seeds_count > 0)),
        (
            "seederStatus".to_string(),
            JsonValue::String(if seeds_count > 0 { "active" } else { "ready" }.to_string()),
        ),
        (
            "seedsCount".to_string(),
            JsonValue::Number(seeds_count.to_string()),
        ),
        (
            "totalSeededBytes".to_string(),
            JsonValue::Number(total_seeded.to_string()),
        ),
        (
            "maxStorageBytes".to_string(),
            JsonValue::Number(max_storage.to_string()),
        ),
        (
            "maxSeeds".to_string(),
            JsonValue::Number(max_seeds.to_string()),
        ),
        (
            "allowedHashesCount".to_string(),
            JsonValue::Number(allowed_count.to_string()),
        ),
        ("confinement".to_string(), confinement),
    ])
}

fn build_discovery_status(local_node_id: &str, peers_count: usize) -> JsonValue {
    JsonValue::Object(vec![
        (
            "peerDiscovery".to_string(),
            JsonValue::String("ready".to_string()),
        ),
        (
            "protocol".to_string(),
            JsonValue::String("VOX-PEER-v1".to_string()),
        ),
        (
            "localNodeId".to_string(),
            JsonValue::String(local_node_id.to_string()),
        ),
        (
            "discoveredPeersCount".to_string(),
            JsonValue::Number(peers_count.to_string()),
        ),
        ("upnpEnabled".to_string(), JsonValue::Bool(false)),
        ("natPmpEnabled".to_string(), JsonValue::Bool(false)),
    ])
}

fn parse_peer_record(payload: &JsonValue, now_ms: u64) -> Result<PeerRecord, P2pError> {
    if !matches!(payload, JsonValue::Object(_)) {
        return Err(P2pError::BadRequest(
            "Payload de descoberta deve ser um dicionario JSON".to_string(),
        ));
    }
    let node_id = payload
        .get("nodeId")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_safe_node_id(node_id) {
        return Err(P2pError::BadRequest(
            "nodeId invalido ou malformado".to_string(),
        ));
    }
    let protocol = payload
        .get("protocol")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if protocol != "VOX-PEER-v1" {
        return Err(P2pError::BadRequest(format!(
            "Protocolo incompativel: esperado VOX-PEER-v1, recebido {protocol}"
        )));
    }
    let http_port = parse_port(payload.get("httpPort"))?;
    let control_port = payload
        .get("controlPort")
        .and_then(|v| parse_port(Some(v)).ok());
    let capabilities = match payload.get("capabilities") {
        Some(JsonValue::Array(items)) => items
            .iter()
            .filter_map(JsonValue::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    };
    let host = payload
        .get("host")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("127.0.0.1")
        .to_string();
    let version = payload
        .get("version")
        .and_then(JsonValue::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("0.2.1")
        .to_string();
    Ok(PeerRecord {
        node_id: node_id.to_string(),
        host,
        http_port,
        control_port,
        capabilities,
        version,
        last_seen_ms: now_ms,
    })
}

fn parse_port(val: Option<&JsonValue>) -> Result<u16, P2pError> {
    let Some(JsonValue::Number(raw)) = val else {
        return Err(P2pError::BadRequest(
            "httpPort invalido (deve ser entre 1 e 65535)".to_string(),
        ));
    };
    let port = raw.parse::<u16>().map_err(|_| {
        P2pError::BadRequest("httpPort invalido (deve ser entre 1 e 65535)".to_string())
    })?;
    if port == 0 {
        return Err(P2pError::BadRequest(
            "httpPort invalido (deve ser entre 1 e 65535)".to_string(),
        ));
    }
    Ok(port)
}

fn parse_seed_size(val: Option<&JsonValue>) -> Result<u64, P2pError> {
    match val {
        Some(JsonValue::Number(n)) => n
            .parse::<u64>()
            .map_err(|_| P2pError::BadRequest("sizeBytes deve ser inteiro positivo".to_string())),
        Some(JsonValue::String(s)) => s
            .trim()
            .parse::<u64>()
            .map_err(|_| P2pError::BadRequest("sizeBytes deve ser inteiro positivo".to_string())),
        None => Ok(0),
        _ => Err(P2pError::BadRequest(
            "sizeBytes deve ser inteiro positivo".to_string(),
        )),
    }
}

fn prune_peers_locked(peers: &mut BTreeMap<String, PeerRecord>, now_ms: u64, ttl_ms: u64) -> usize {
    let cutoff = now_ms.saturating_sub(ttl_ms);
    let before = peers.len();
    peers.retain(|_, p| p.last_seen_ms >= cutoff);
    before - peers.len()
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn is_safe_node_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
