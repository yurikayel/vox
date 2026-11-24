//! Atomic file-backed cache store with `.sha256` sidecars and mirror validation
//! (`relay/server.py` + `relay/mirror_validate.py` parity).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::json::JsonValue;
use crate::relay_store::{ct_eq, sha256_hex};

/// Maximum accepted `POST /vox/mirror` body size (256 KiB).
pub const MAX_MIRROR_BODY_BYTES: usize = 256 * 1024;
/// Maximum topics allowed in a mirrored community index.
pub const MAX_MIRROR_TOPICS: usize = 500;
/// Exact length of an Arweave transaction identifier.
pub const TX_ID_LEN: usize = 43;
/// Default cache disk quota in bytes (512 MiB).
pub const DEFAULT_MAX_CACHE_BYTES: u64 = 512 * 1024 * 1024;

const HASH_SUFFIX: &str = ".sha256";
const INDEX_PREFIX: &str = "index_";
const INDEX_SUFFIX: &str = ".json";
const PIN_ROLES: &[&str] = &["community", "topic", "reply", "post", "blob", "index"];

/// Error returned when validating a `POST /vox/mirror` payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MirrorError {
    /// HTTP status code (`400` or `413`).
    pub status: u16,
    /// Stable machine-readable error code.
    pub code: &'static str,
    /// Human-readable error message.
    pub message: String,
}

impl MirrorError {
    fn new(status: u16, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    /// Serializes the error as `{"code":...,"error":...}` JSON.
    pub fn to_json_string(&self) -> String {
        JsonValue::Object(vec![
            ("code".to_string(), JsonValue::String(self.code.to_string())),
            ("error".to_string(), JsonValue::String(self.message.clone())),
        ])
        .to_json_string()
    }
}

/// Thread-safe cache store for `/tx/<txId>` and `/vox/index/<commId>.json` entries.
pub struct CacheStore {
    root: PathBuf,
    max_bytes: Option<u64>,
    lock: Mutex<()>,
    tmp_seq: AtomicU64,
    integrity_failures: AtomicU64,
}

impl CacheStore {
    /// Creates a [`CacheStore`] rooted at `root` with an optional disk quota (`None` = unlimited).
    pub fn new(root: PathBuf, max_bytes: Option<u64>) -> Self {
        Self {
            root,
            max_bytes,
            lock: Mutex::new(()),
            tmp_seq: AtomicU64::new(1),
            integrity_failures: AtomicU64::new(0),
        }
    }

    /// Returns the filesystem root of the cache directory.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Returns the configured maximum cache size in bytes, or `None` if unlimited.
    pub fn max_bytes(&self) -> Option<u64> {
        self.max_bytes
    }

    /// Returns the total number of detected SHA-256 sidecar integrity failures.
    pub fn integrity_failures(&self) -> u64 {
        self.integrity_failures.load(Ordering::Relaxed)
    }

    /// Ensures the cache directory exists and removes orphan `.sha256` sidecars.
    pub fn ensure_dir(&self) -> std::io::Result<()> {
        let _guard = self.lock.lock().ok();
        self.ensure_dir_locked()
    }

    fn ensure_dir_locked(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.root)?;
        if let Ok(entries) = fs::read_dir(&self.root) {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if let Some(stem) = name.strip_suffix(HASH_SUFFIX) {
                    if !self.root.join(stem).is_file() {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
        Ok(())
    }

    /// Reads a cached transaction by `tx_id`, verifying its `.sha256` sidecar.
    pub fn read_tx(&self, tx_id: &str) -> Option<Vec<u8>> {
        if !is_tx_id(tx_id) {
            return None;
        }
        let _guard = self.lock.lock().ok()?;
        let path = self.root.join(tx_id);
        self.read_verified_locked(&path)
    }

    /// Stores a transaction payload and its `.sha256` sidecar respecting the cache quota.
    pub fn store_tx(&self, tx_id: &str, data: &[u8]) -> Result<bool, String> {
        if !is_tx_id(tx_id) {
            return Err("invalid txId".to_string());
        }
        let _guard = self.lock.lock().map_err(|_| "lock poisoned".to_string())?;
        let path = self.root.join(tx_id);
        self.store_with_quota_locked(&path, data)
    }

    /// Reads a cached community index (`index_<comm_id>.json`), verifying its `.sha256` sidecar.
    pub fn read_index(&self, comm_id: &str) -> Option<Vec<u8>> {
        if !is_comm_id(comm_id) {
            return None;
        }
        let _guard = self.lock.lock().ok()?;
        let path = self
            .root
            .join(format!("{INDEX_PREFIX}{comm_id}{INDEX_SUFFIX}"));
        self.read_verified_locked(&path)
    }

    /// Stores a mirrored community index and its `.sha256` sidecar respecting the cache quota.
    pub fn store_index(&self, comm_id: &str, data: &[u8]) -> Result<bool, String> {
        if !is_comm_id(comm_id) {
            return Err("invalid communityId".to_string());
        }
        let _guard = self.lock.lock().map_err(|_| "lock poisoned".to_string())?;
        let path = self
            .root
            .join(format!("{INDEX_PREFIX}{comm_id}{INDEX_SUFFIX}"));
        self.store_with_quota_locked(&path, data)
    }

    /// Counts non-index, non-sidecar cached transaction items.
    pub fn cached_item_count(&self) -> usize {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return 0;
        };
        entries
            .filter_map(Result::ok)
            .filter(|e| {
                let name = e.file_name();
                let s = name.to_string_lossy();
                e.path().is_file()
                    && !s.starts_with(INDEX_PREFIX)
                    && !s.starts_with(".vox-")
                    && !s.ends_with(HASH_SUFFIX)
            })
            .count()
    }

    /// Returns sorted community slugs with cached index files.
    pub fn list_community_indexes(&self) -> Vec<String> {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return Vec::new();
        };
        let mut out: Vec<String> = entries
            .filter_map(Result::ok)
            .filter_map(|e| {
                if !e.path().is_file() {
                    return None;
                }
                let name = e.file_name().to_string_lossy().into_owned();
                name.strip_prefix(INDEX_PREFIX)
                    .and_then(|rest| rest.strip_suffix(INDEX_SUFFIX))
                    .map(str::to_string)
            })
            .collect();
        out.sort();
        out
    }

    /// Computes total byte size of all files in the cache directory.
    pub fn total_bytes(&self) -> u64 {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return 0;
        };
        entries
            .filter_map(Result::ok)
            .filter_map(|e| e.metadata().ok().filter(|m| m.is_file()).map(|m| m.len()))
            .sum()
    }

    fn read_verified_locked(&self, path: &Path) -> Option<Vec<u8>> {
        if !path.is_file() {
            return None;
        }
        let sidecar = sidecar_path(path);
        if is_symlink(path) || is_symlink(&sidecar) {
            self.record_corruption(path);
            return None;
        }
        let Ok(data) = fs::read(path) else {
            self.record_corruption(path);
            return None;
        };
        let Ok(expected_raw) = fs::read_to_string(&sidecar) else {
            self.record_corruption(path);
            return None;
        };
        let expected = expected_raw.trim();
        let actual = sha256_hex(&data);
        if expected.len() != 64
            || !is_lower_hex(expected)
            || !ct_eq(expected.as_bytes(), actual.as_bytes())
        {
            self.record_corruption(path);
            return None;
        }
        Some(data)
    }

    fn record_corruption(&self, path: &Path) {
        self.integrity_failures.fetch_add(1, Ordering::Relaxed);
        remove_entry_and_sidecar(path);
    }

    fn store_with_quota_locked(&self, target: &Path, data: &[u8]) -> Result<bool, String> {
        self.ensure_dir_locked().map_err(|e| e.to_string())?;
        let digest = sha256_hex(data);
        let incoming = (data.len() + digest.len()) as u64;
        let existing = entry_disk_bytes(target);
        let additional = incoming.saturating_sub(existing);
        if let Some(limit) = self.max_bytes {
            self.evict_if_needed_locked(additional, target, limit);
            if self.total_bytes().saturating_add(additional) > limit {
                return Ok(false);
            }
        }
        if let Err(err) = self.write_entry_locked(target, data, digest.as_bytes()) {
            remove_entry_and_sidecar(target);
            return Err(err);
        }
        Ok(true)
    }

    fn evict_if_needed_locked(&self, needed: u64, protected: &Path, limit: u64) {
        let mut current = self.total_bytes();
        if current.saturating_add(needed) <= limit {
            return;
        }
        let mut candidates = self.eviction_candidates(protected);
        candidates.sort_by_key(|(_, mtime)| *mtime);
        for (path, _) in candidates {
            if current.saturating_add(needed) <= limit {
                break;
            }
            let freed = entry_disk_bytes(&path);
            remove_entry_and_sidecar(&path);
            current = current.saturating_sub(freed);
        }
    }

    fn eviction_candidates(&self, protected: &Path) -> Vec<(PathBuf, u128)> {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .filter_map(|e| {
                let path = e.path();
                let name = e.file_name().to_string_lossy().into_owned();
                if !path.is_file()
                    || path == protected
                    || name.ends_with(HASH_SUFFIX)
                    || name.starts_with(".vox-")
                {
                    return None;
                }
                let mtime = e
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                Some((path, mtime))
            })
            .collect()
    }

    fn write_entry_locked(&self, target: &Path, data: &[u8], digest: &[u8]) -> Result<(), String> {
        self.write_atomic_locked(target, data)?;
        self.write_atomic_locked(&sidecar_path(target), digest)
    }

    fn write_atomic_locked(&self, target: &Path, bytes: &[u8]) -> Result<(), String> {
        let seq = self.tmp_seq.fetch_add(1, Ordering::Relaxed);
        let tmp = self
            .root
            .join(format!(".vox-{}-{seq}.tmp", std::process::id()));
        fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        if let Err(err) = fs::rename(&tmp, target) {
            let _ = fs::remove_file(target);
            if let Err(err2) = fs::rename(&tmp, target) {
                let _ = fs::remove_file(&tmp);
                return Err(format!("{err}; retry: {err2}"));
            }
        }
        Ok(())
    }
}

/// Returns `true` if `text` is a valid 43-character base64url Arweave TX ID.
pub fn is_tx_id(text: &str) -> bool {
    text.len() == TX_ID_LEN
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Returns `true` if `text` is a valid path-safe community identifier (`1..=128` chars).
pub fn is_comm_id(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 128
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// Validates a `POST /vox/mirror` payload according to `mirror-validate-v1.md` and returns the
/// sanitized `communityId` on success.
pub fn validate_mirror_body(raw: &[u8]) -> Result<String, MirrorError> {
    if raw.len() > MAX_MIRROR_BODY_BYTES {
        return Err(MirrorError::new(
            413,
            "mirror.body_too_large",
            "Corpo excede 256 KiB.",
        ));
    }
    let text = std::str::from_utf8(raw)
        .map_err(|_| MirrorError::new(400, "mirror.invalid_json", "JSON inválido."))?;
    let payload = JsonValue::parse(text)
        .map_err(|_| MirrorError::new(400, "mirror.invalid_json", "JSON inválido."))?;
    if !matches!(payload, JsonValue::Object(_)) {
        return Err(MirrorError::new(
            400,
            "mirror.not_object",
            "Corpo deve ser um objeto JSON.",
        ));
    }
    let comm_id = extract_comm_id(&payload)?;
    validate_topics_field(&payload)?;
    validate_optional_manifest(&payload)?;
    Ok(comm_id)
}

fn extract_comm_id(payload: &JsonValue) -> Result<String, MirrorError> {
    let raw = payload.get("communityId").and_then(JsonValue::as_str);
    let trimmed = raw.map(str::trim).unwrap_or("");
    if trimmed.is_empty() || !is_comm_id(trimmed) {
        return Err(MirrorError::new(
            400,
            "mirror.community_id_invalid",
            "communityId inválido ou ausente.",
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_topics_field(payload: &JsonValue) -> Result<(), MirrorError> {
    let Some(topics) = payload.get("topics") else {
        return Ok(());
    };
    let JsonValue::Array(items) = topics else {
        return Err(MirrorError::new(
            400,
            "mirror.topics_invalid",
            "topics deve ser um array.",
        ));
    };
    if items.len() > MAX_MIRROR_TOPICS {
        return Err(MirrorError::new(
            400,
            "mirror.topics_limit",
            format!("topics excede limite de {MAX_MIRROR_TOPICS} entradas."),
        ));
    }
    Ok(())
}

fn validate_optional_manifest(payload: &JsonValue) -> Result<(), MirrorError> {
    let Some(cm) = payload.get("cacheManifest") else {
        return Ok(());
    };
    if matches!(cm, JsonValue::Null) {
        return Ok(());
    }
    if !matches!(cm, JsonValue::Object(_)) {
        return Err(MirrorError::new(
            400,
            "mirror.cache_manifest_invalid",
            "cacheManifest deve ser um objeto.",
        ));
    }
    validate_cache_manifest(cm)
        .map_err(|msg| MirrorError::new(400, "mirror.cache_manifest_invalid", msg))
}

fn validate_cache_manifest(cm: &JsonValue) -> Result<(), &'static str> {
    let comm = cm
        .get("communityId")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if comm.is_empty() {
        return Err("communityId obrigatório.");
    }
    let version_val = cm.get("v").or_else(|| cm.get("manifestVersion"));
    if let Some(v) = version_val {
        let parsed = match v {
            JsonValue::Number(n) => n.parse::<i64>().ok(),
            JsonValue::String(s) => s.trim().parse::<i64>().ok(),
            _ => None,
        };
        if parsed != Some(0) {
            return Err("manifestVersion incompatível.");
        }
    }
    validate_manifest_pins(cm)?;
    if let Some(prev) = cm.get("previousManifestTx").and_then(JsonValue::as_str) {
        let trimmed = prev.trim();
        if !trimmed.is_empty() && !is_tx_id(trimmed) {
            return Err("previousManifestTx inválido.");
        }
    }
    Ok(())
}

fn validate_manifest_pins(cm: &JsonValue) -> Result<(), &'static str> {
    let Some(JsonValue::Array(pins)) = cm.get("pins") else {
        return Err("pins não pode ser vazio.");
    };
    if pins.is_empty() {
        return Err("pins não pode ser vazio.");
    }
    if pins.len() > 512 {
        return Err("pins excede limite de 512 entradas.");
    }
    let mut seen = HashSet::with_capacity(pins.len());
    for pin in pins {
        let tx_id = validate_single_pin(pin)?;
        if !seen.insert(tx_id) {
            return Err("txId duplicado no manifesto.");
        }
    }
    Ok(())
}

fn validate_single_pin(pin: &JsonValue) -> Result<String, &'static str> {
    if !matches!(pin, JsonValue::Object(_)) {
        return Err("pin inválido.");
    }
    let tx_id = pin
        .get("txId")
        .or_else(|| pin.get("id"))
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_tx_id(tx_id) {
        return Err("txId inválido (43 caracteres base64url).");
    }
    let role = pin
        .get("role")
        .or_else(|| pin.get("kind"))
        .and_then(JsonValue::as_str)
        .unwrap_or("blob")
        .trim()
        .to_ascii_lowercase();
    if !role.is_empty() && !PIN_ROLES.contains(&role.as_str()) {
        return Err("role de pin não reconhecida.");
    }
    if let Some(sha) = pin.get("sha256").and_then(JsonValue::as_str) {
        let clean = sha.trim().to_ascii_lowercase();
        if !clean.is_empty() && (clean.len() != 64 || !is_lower_hex(&clean)) {
            return Err("sha256 deve ser hex de 64 caracteres.");
        }
    }
    Ok(tx_id.to_string())
}

fn sidecar_path(path: &Path) -> PathBuf {
    let mut os = path.as_os_str().to_os_string();
    os.push(HASH_SUFFIX);
    PathBuf::from(os)
}

fn remove_entry_and_sidecar(path: &Path) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(sidecar_path(path));
}

fn entry_disk_bytes(path: &Path) -> u64 {
    let a = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let b = fs::metadata(sidecar_path(path))
        .map(|m| m.len())
        .unwrap_or(0);
    a.saturating_add(b)
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_lower_hex(s: &str) -> bool {
    s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

#[allow(dead_code)]
fn _now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
