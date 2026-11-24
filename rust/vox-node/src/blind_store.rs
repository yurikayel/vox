//! Atomic file-backed zero-knowledge blind relay store
//! (`relay/blind_relay.py` + `relay/snapshot_auth.py` RFC 0002 parity).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::json::{write_escaped_str, JsonValue};
use crate::relay_store::{ct_eq, sanitize_name, sha256_hex};

/// Maximum serialized blind envelope size (64 KiB).
pub const MAX_BLIND_ENVELOPE_SIZE: usize = 64 * 1024;
/// Maximum serialized consolidated snapshot size (512 KiB).
pub const MAX_SNAPSHOT_SIZE: usize = 512 * 1024;
/// Default retention TTL for channel envelopes (7 days).
pub const DEFAULT_BLIND_TTL_SECS: u64 = 7 * 86_400;
/// Default maximum epoch jump for authenticated snapshots (RFC 0002).
pub const DEFAULT_MAX_EPOCH_JUMP: u64 = 16;
/// Default maximum coveredSerial jump above relay-seen serials (RFC 0002).
pub const DEFAULT_MAX_COVERED_JUMP: u64 = 1000;
/// Default page size for `GET /relay/envelope/<channel>`.
pub const DEFAULT_ENVELOPE_LIMIT: usize = 100;

const SNAPSHOT_FILE: &str = "latest_snapshot.json";
const OWNER_FIELD: &str = "ownerHash";

/// Snapshot authentication policy (`VOX_RELAY_SNAPSHOT_AUTH`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapshotAuthMode {
    /// Legacy-compatible mode: unauthenticated snapshots accepted on unowned channels.
    Compat,
    /// Strict mode: `X-Vox-Snapshot-Proof` required on every snapshot write.
    Enforce,
}

/// Configuration for blind relay snapshot authentication and jump limits.
#[derive(Debug, Clone, Copy)]
pub struct BlindConfig {
    /// Snapshot authentication mode (`compat` or `enforce`).
    pub auth_mode: SnapshotAuthMode,
    /// Maximum allowed epoch jump above current owner epoch.
    pub max_epoch_jump: u64,
    /// Maximum allowed `coveredSerial` jump above `max(owner_covered, max_live_serial)`.
    pub max_covered_jump: u64,
    /// Default envelope retention TTL in seconds.
    pub envelope_ttl_secs: u64,
}

impl Default for BlindConfig {
    fn default() -> Self {
        Self {
            auth_mode: SnapshotAuthMode::Compat,
            max_epoch_jump: DEFAULT_MAX_EPOCH_JUMP,
            max_covered_jump: DEFAULT_MAX_COVERED_JUMP,
            envelope_ttl_secs: DEFAULT_BLIND_TTL_SECS,
        }
    }
}

impl BlindConfig {
    /// Loads blind relay snapshot policy from environment variables.
    pub fn from_env() -> Self {
        let mode_raw = env::var("VOX_RELAY_SNAPSHOT_AUTH").unwrap_or_default();
        let auth_mode = if mode_raw.trim().eq_ignore_ascii_case("enforce") {
            SnapshotAuthMode::Enforce
        } else {
            SnapshotAuthMode::Compat
        };
        Self {
            auth_mode,
            max_epoch_jump: env_pos_u64(
                "VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP",
                DEFAULT_MAX_EPOCH_JUMP,
            ),
            max_covered_jump: env_pos_u64(
                "VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP",
                DEFAULT_MAX_COVERED_JUMP,
            ),
            envelope_ttl_secs: DEFAULT_BLIND_TTL_SECS,
        }
    }
}

/// Errors returned by blind relay operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlindError {
    /// Malformed payload, invalid proof format, or jump limit exceeded (`400`).
    BadRequest(String),
    /// Payload exceeds size limit (`413`).
    TooLarge,
    /// Missing or mismatched owner proof (`403`).
    Forbidden(String),
    /// Epoch or `coveredSerial` conflict against existing state (`409`).
    Conflict {
        /// Human-readable reason.
        message: String,
        /// Current channel epoch.
        current_epoch: u64,
        /// Current channel `coveredSerial`.
        current_covered_serial: u64,
    },
    /// Filesystem persistence error (`500`).
    Io(String),
}

/// Outcome of storing a consolidated channel snapshot.
#[derive(Debug, Clone)]
pub struct SnapshotOutcome {
    /// Public JSON view (never includes `ownerHash`).
    pub record: JsonValue,
    /// `true` when identical snapshot was already stored by the owner (`200` vs `201`).
    pub idempotent: bool,
}

/// Thread-safe, atomic file-backed blind relay store.
pub struct BlindStore {
    root: PathBuf,
    config: BlindConfig,
    lock: Mutex<()>,
    tmp_seq: AtomicU64,
}

impl BlindStore {
    /// Creates a [`BlindStore`] rooted at `root`.
    pub fn new(root: PathBuf, config: BlindConfig) -> Self {
        Self {
            root,
            config,
            lock: Mutex::new(()),
            tmp_seq: AtomicU64::new(1),
        }
    }

    /// Validates and atomically stores a channel envelope.
    pub fn store_envelope(
        &self,
        channel_id: &str,
        raw_body: &[u8],
    ) -> Result<JsonValue, BlindError> {
        self.store_envelope_at(
            channel_id,
            raw_body,
            self.config.envelope_ttl_secs,
            unix_now_secs(),
        )
    }

    /// Stores a channel envelope with explicit TTL and current timestamp (deterministic tests).
    pub fn store_envelope_at(
        &self,
        channel_id: &str,
        raw_body: &[u8],
        ttl_secs: u64,
        now_secs: u64,
    ) -> Result<JsonValue, BlindError> {
        if raw_body.len() > MAX_BLIND_ENVELOPE_SIZE {
            return Err(BlindError::TooLarge);
        }
        let clean_ch = sanitize_name(channel_id);
        if clean_ch.is_empty() {
            return Err(BlindError::BadRequest(
                "ID de canal comunitário inválido".to_string(),
            ));
        }
        let text = std::str::from_utf8(raw_body)
            .map_err(|_| BlindError::BadRequest("UTF-8 inválido".to_string()))?;
        let envelope = JsonValue::parse(text)
            .map_err(|e| BlindError::BadRequest(format!("JSON inválido: {e}")))?;
        let ts = validate_envelope(&envelope, now_secs.saturating_mul(1000))?;
        let canonical = canonical_json(&envelope);
        let digest = sha256_hex(canonical.as_bytes());
        let msg_id = format!("env_{ts}_{}", &digest[..20]);

        let _guard = self
            .lock
            .lock()
            .map_err(|_| BlindError::Io("lock poisoned".to_string()))?;
        let ch_dir = self.root.join(&clean_ch);
        fs::create_dir_all(&ch_dir).map_err(|e| BlindError::Io(e.to_string()))?;
        let target = ch_dir.join(format!("{msg_id}.json"));
        if let Some(existing) = read_live_record(&target, now_secs) {
            return Ok(existing);
        }
        let record = build_envelope_record(&msg_id, channel_id, now_secs, ttl_secs, envelope);
        self.write_atomic(&ch_dir, &target, record.to_json_string().as_bytes())?;
        Ok(record)
    }

    /// Lists live envelopes for `channel_id` filtered by `since_serial` or `since_ts`.
    pub fn list_envelopes(
        &self,
        channel_id: &str,
        since_ts: u64,
        since_serial: u64,
        limit: usize,
    ) -> Vec<JsonValue> {
        self.list_envelopes_at(channel_id, since_ts, since_serial, limit, unix_now_secs())
    }

    /// Lists live envelopes at an explicit timestamp `now_secs`.
    pub fn list_envelopes_at(
        &self,
        channel_id: &str,
        since_ts: u64,
        since_serial: u64,
        limit: usize,
        now_secs: u64,
    ) -> Vec<JsonValue> {
        let clean_ch = sanitize_name(channel_id);
        if clean_ch.is_empty() {
            return Vec::new();
        }
        let Ok(_guard) = self.lock.lock() else {
            return Vec::new();
        };
        let ch_dir = self.root.join(clean_ch);
        let Ok(entries) = fs::read_dir(&ch_dir) else {
            return Vec::new();
        };
        let by_serial = since_serial > 0;
        let mut items: Vec<(u64, u64, JsonValue)> = Vec::new();
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if !is_envelope_file(&path) {
                continue;
            }
            let Some((env, ts, serial)) = load_listable_envelope(&path, now_secs) else {
                continue;
            };
            let include = if by_serial {
                serial > since_serial
            } else {
                ts >= since_ts
            };
            if include {
                let key = if by_serial {
                    (serial, ts)
                } else {
                    (ts, serial)
                };
                items.push((key.0, key.1, env));
            }
        }
        items.sort_by_key(|(k1, k2, _)| (*k1, *k2));
        items.into_iter().take(limit).map(|(_, _, e)| e).collect()
    }

    /// Validates, authorizes (RFC 0002), and stores a consolidated channel snapshot.
    pub fn store_snapshot(
        &self,
        channel_id: &str,
        raw_body: &[u8],
        proof: Option<&str>,
    ) -> Result<SnapshotOutcome, BlindError> {
        if raw_body.len() > MAX_SNAPSHOT_SIZE {
            return Err(BlindError::TooLarge);
        }
        let clean_ch = sanitize_name(channel_id);
        if clean_ch.is_empty() {
            return Err(BlindError::BadRequest(
                "ID de canal comunitário inválido".to_string(),
            ));
        }
        let text = std::str::from_utf8(raw_body)
            .map_err(|_| BlindError::BadRequest("UTF-8 inválido".to_string()))?;
        let snap_data = JsonValue::parse(text)
            .map_err(|e| BlindError::BadRequest(format!("JSON inválido: {e}")))?;
        let (epoch, ts, covered) = parse_snapshot_numbers(&snap_data)?;
        let presented = proof_hash(proof)?;

        let _guard = self
            .lock
            .lock()
            .map_err(|_| BlindError::Io("lock poisoned".to_string()))?;
        let ch_dir = self.root.join(&clean_ch);
        fs::create_dir_all(&ch_dir).map_err(|e| BlindError::Io(e.to_string()))?;
        let snap_path = ch_dir.join(SNAPSHOT_FILE);
        let curr = read_json_object(&snap_path);
        let authed =
            authorize_snapshot(curr.as_ref(), presented.as_deref(), self.config.auth_mode)?;
        let digest = sha256_hex(canonical_json(&snap_data).as_bytes());
        if authed && is_same_snapshot(curr.as_ref(), epoch, &digest) {
            let view = public_snapshot_view(curr.as_ref().unwrap_or(&JsonValue::Null), true);
            return Ok(SnapshotOutcome {
                record: view,
                idempotent: true,
            });
        }
        check_snapshot_rules(
            &ch_dir,
            curr.as_ref(),
            authed,
            (epoch, covered),
            self.config,
        )?;
        let owner = if authed { presented } else { None };
        let record = build_snapshot_record(
            channel_id,
            snap_data,
            (epoch, ts, covered),
            owner.as_deref(),
            &digest,
        );
        self.write_atomic(&ch_dir, &snap_path, record.to_json_string().as_bytes())?;
        if authed {
            prune_covered_deltas(&ch_dir, covered);
        }
        Ok(SnapshotOutcome {
            record: public_snapshot_view(&record, false),
            idempotent: false,
        })
    }

    /// Returns the latest snapshot payload (`data` field) for `channel_id`, if present.
    pub fn get_latest_snapshot(&self, channel_id: &str) -> Option<JsonValue> {
        let clean_ch = sanitize_name(channel_id);
        if clean_ch.is_empty() {
            return None;
        }
        let _guard = self.lock.lock().ok()?;
        let snap_path = self.root.join(clean_ch).join(SNAPSHOT_FILE);
        let record = read_json_object(&snap_path)?;
        record.get("data").cloned()
    }

    /// Purges expired `env_*.json` records across all channel directories at `now_secs`.
    pub fn purge_expired_at(&self, now_secs: u64) -> usize {
        let Ok(_guard) = self.lock.lock() else {
            return 0;
        };
        let Ok(dirs) = fs::read_dir(&self.root) else {
            return 0;
        };
        let mut removed = 0;
        for entry in dirs.filter_map(Result::ok) {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            removed += purge_channel_dir(&dir, now_secs);
        }
        removed
    }

    fn write_atomic(&self, dir: &Path, target: &Path, bytes: &[u8]) -> Result<(), BlindError> {
        let seq = self.tmp_seq.fetch_add(1, Ordering::Relaxed);
        let tmp = dir.join(format!(".vox-blind-{}-{seq}.tmp", std::process::id()));
        fs::write(&tmp, bytes).map_err(|e| BlindError::Io(e.to_string()))?;
        if let Err(err) = fs::rename(&tmp, target) {
            let _ = fs::remove_file(target);
            if let Err(err2) = fs::rename(&tmp, target) {
                let _ = fs::remove_file(&tmp);
                return Err(BlindError::Io(format!("{err}; retry: {err2}")));
            }
        }
        Ok(())
    }
}

fn validate_envelope(envelope: &JsonValue, default_ts_ms: u64) -> Result<u64, BlindError> {
    if !matches!(envelope, JsonValue::Object(_)) {
        return Err(BlindError::BadRequest(
            "Envelope deve ser um dicionário JSON".to_string(),
        ));
    }
    let has_sender = envelope.get("sender").is_some_and(is_truthy);
    let has_sig = envelope.get("sig").is_some_and(is_truthy);
    if !has_sender || !has_sig {
        return Err(BlindError::BadRequest(
            "Envelope deve conter sender e sig".to_string(),
        ));
    }
    let ts = coerce_u64(envelope.get("timestamp"), "timestamp", default_ts_ms)?;
    let _ = coerce_u64(envelope.get("serial"), "serial", 0)?;
    Ok(ts)
}

fn parse_snapshot_numbers(snap: &JsonValue) -> Result<(u64, u64, u64), BlindError> {
    if !matches!(snap, JsonValue::Object(_)) {
        return Err(BlindError::BadRequest(
            "Snapshot deve ser um dicionário JSON".to_string(),
        ));
    }
    if !snap.get("snapshot").is_some_and(is_truthy) {
        return Err(BlindError::BadRequest(
            "Snapshot deve conter o campo 'snapshot'".to_string(),
        ));
    }
    let epoch = coerce_u64(snap.get("epoch"), "epoch", 1)?;
    let ts = coerce_u64(snap.get("timestamp"), "timestamp", unix_now_ms())?;
    let covered_raw = snap
        .get("coveredSerial")
        .or_else(|| snap.get("covered_serial"));
    let covered = coerce_u64(covered_raw, "coveredSerial", 0)?;
    Ok((epoch, ts, covered))
}

fn proof_hash(proof: Option<&str>) -> Result<Option<String>, BlindError> {
    let Some(raw) = proof else {
        return Ok(None);
    };
    let clean = raw.trim().to_ascii_lowercase();
    let Some(bytes) = decode_hex_64(&clean) else {
        return Err(BlindError::BadRequest(
            "X-Vox-Snapshot-Proof deve ter 64 dígitos hexadecimais".to_string(),
        ));
    };
    Ok(Some(sha256_hex(&bytes)))
}

fn stored_owner(record: Option<&JsonValue>) -> Option<String> {
    let rec = record?;
    if !matches!(rec.get("auth"), Some(JsonValue::Bool(true))) {
        return None;
    }
    let owner = rec.get(OWNER_FIELD)?.as_str()?;
    if owner.len() == 64
        && owner
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    {
        Some(owner.to_string())
    } else {
        None
    }
}

fn authorize_snapshot(
    curr: Option<&JsonValue>,
    presented: Option<&str>,
    mode: SnapshotAuthMode,
) -> Result<bool, BlindError> {
    if let Some(owner) = stored_owner(curr) {
        if let Some(p) = presented {
            if ct_eq(p.as_bytes(), owner.as_bytes()) {
                return Ok(true);
            }
        }
        return Err(BlindError::Forbidden(
            "prova do dono do snapshot ausente ou incorreta".to_string(),
        ));
    }
    if presented.is_some() {
        return Ok(true);
    }
    if mode == SnapshotAuthMode::Enforce {
        return Err(BlindError::Forbidden(
            "este relay exige a prova do dono do snapshot".to_string(),
        ));
    }
    Ok(false)
}

fn is_same_snapshot(curr: Option<&JsonValue>, epoch: u64, digest: &str) -> bool {
    if stored_owner(curr).is_none() {
        return false;
    }
    let Some(rec) = curr else {
        return false;
    };
    let same_digest = rec.get("digest").and_then(JsonValue::as_str) == Some(digest);
    let curr_epoch = coerce_u64(rec.get("epoch"), "epoch", 0).unwrap_or(0);
    same_digest && curr_epoch == epoch
}

fn check_snapshot_rules(
    ch_dir: &Path,
    curr: Option<&JsonValue>,
    authed: bool,
    incoming: (u64, u64),
    config: BlindConfig,
) -> Result<(), BlindError> {
    let (epoch, covered) = incoming;
    if !authed {
        if let Some(rec) = curr {
            assert_snapshot_advances(rec, epoch, covered)?;
        }
        return Ok(());
    }
    let owner_base = if stored_owner(curr).is_some() {
        let rec = curr.unwrap_or(&JsonValue::Null);
        assert_snapshot_advances(rec, epoch, covered)?;
        let ce = coerce_u64(rec.get("epoch"), "epoch", 0).unwrap_or(0);
        let cc = coerce_u64(rec.get("coveredSerial"), "coveredSerial", 0).unwrap_or(0);
        (ce, cc)
    } else {
        (0, 0)
    };
    if epoch > owner_base.0.saturating_add(config.max_epoch_jump) {
        return Err(BlindError::BadRequest(format!(
            "Época do snapshot ({epoch}) salta mais de {} sobre a atual ({})",
            config.max_epoch_jump, owner_base.0
        )));
    }
    let max_seen = max_live_serial(ch_dir, unix_now_secs());
    let base_cov = owner_base.1.max(max_seen);
    if covered > base_cov.saturating_add(config.max_covered_jump) {
        return Err(BlindError::BadRequest(format!(
            "coveredSerial ({covered}) passa de {} acima do que o relay já viu",
            config.max_covered_jump
        )));
    }
    Ok(())
}

fn assert_snapshot_advances(curr: &JsonValue, epoch: u64, covered: u64) -> Result<(), BlindError> {
    let curr_epoch = coerce_u64(curr.get("epoch"), "epoch", 0).unwrap_or(0);
    let curr_covered = coerce_u64(curr.get("coveredSerial"), "coveredSerial", 0).unwrap_or(0);
    if epoch <= curr_epoch {
        return Err(BlindError::Conflict {
            message: format!(
                "Época do snapshot ({epoch}) deve ser estritamente maior que a época atual ({curr_epoch})"
            ),
            current_epoch: curr_epoch,
            current_covered_serial: curr_covered,
        });
    }
    if covered < curr_covered {
        return Err(BlindError::Conflict {
            message: format!(
                "coveredSerial ({covered}) não pode ficar abaixo do atual ({curr_covered})"
            ),
            current_epoch: curr_epoch,
            current_covered_serial: curr_covered,
        });
    }
    Ok(())
}

fn build_envelope_record(
    msg_id: &str,
    channel_id: &str,
    now_secs: u64,
    ttl_secs: u64,
    envelope: JsonValue,
) -> JsonValue {
    JsonValue::Object(vec![
        ("id".to_string(), JsonValue::String(msg_id.to_string())),
        (
            "channelId".to_string(),
            JsonValue::String(channel_id.to_string()),
        ),
        (
            "storedAt".to_string(),
            JsonValue::Number(now_secs.to_string()),
        ),
        (
            "expiresAt".to_string(),
            JsonValue::Number(now_secs.saturating_add(ttl_secs).to_string()),
        ),
        ("envelope".to_string(), envelope),
    ])
}

fn build_snapshot_record(
    channel_id: &str,
    data: JsonValue,
    numbers: (u64, u64, u64),
    owner_hash: Option<&str>,
    digest: &str,
) -> JsonValue {
    let (epoch, ts, covered) = numbers;
    let mut entries = vec![
        (
            "channelId".to_string(),
            JsonValue::String(channel_id.to_string()),
        ),
        ("epoch".to_string(), JsonValue::Number(epoch.to_string())),
        ("timestamp".to_string(), JsonValue::Number(ts.to_string())),
        (
            "coveredSerial".to_string(),
            JsonValue::Number(covered.to_string()),
        ),
        (
            "storedAt".to_string(),
            JsonValue::Number(unix_now_secs().to_string()),
        ),
        ("data".to_string(), data),
        ("auth".to_string(), JsonValue::Bool(owner_hash.is_some())),
    ];
    if let Some(owner) = owner_hash {
        entries.push((
            OWNER_FIELD.to_string(),
            JsonValue::String(owner.to_string()),
        ));
        entries.push(("digest".to_string(), JsonValue::String(digest.to_string())));
    }
    JsonValue::Object(entries)
}

fn public_snapshot_view(record: &JsonValue, idempotent: bool) -> JsonValue {
    let JsonValue::Object(entries) = record else {
        return JsonValue::Object(Vec::new());
    };
    let is_authed = matches!(record.get("auth"), Some(JsonValue::Bool(true)));
    let mut out: Vec<(String, JsonValue)> = entries
        .iter()
        .filter(|(k, _)| k != OWNER_FIELD && k != "digest" && k != "auth")
        .cloned()
        .collect();
    out.push((
        "auth".to_string(),
        if is_authed {
            JsonValue::String("owner".to_string())
        } else {
            JsonValue::Bool(false)
        },
    ));
    if idempotent {
        out.push(("idempotent".to_string(), JsonValue::Bool(true)));
    }
    JsonValue::Object(out)
}

fn prune_covered_deltas(ch_dir: &Path, covered_serial: u64) -> usize {
    if covered_serial == 0 {
        return 0;
    }
    let Ok(entries) = fs::read_dir(ch_dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !is_envelope_file(&path) {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(parsed) = JsonValue::parse(&text) else {
            let _ = fs::remove_file(&path);
            removed += 1;
            continue;
        };
        let serial = parsed
            .get("envelope")
            .and_then(|e| coerce_u64(e.get("serial"), "serial", 0).ok())
            .unwrap_or(0);
        if serial > 0 && serial <= covered_serial {
            let _ = fs::remove_file(&path);
            removed += 1;
        }
    }
    removed
}

fn max_live_serial(ch_dir: &Path, now_secs: u64) -> u64 {
    let Ok(entries) = fs::read_dir(ch_dir) else {
        return 0;
    };
    let mut top = 0u64;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if is_envelope_file(&path) {
            if let Some((_, _, serial)) = load_listable_envelope(&path, now_secs) {
                top = top.max(serial);
            }
        }
    }
    top
}

fn purge_channel_dir(dir: &Path, now_secs: u64) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !is_envelope_file(&path) {
            continue;
        }
        let expired = match read_json_object(&path) {
            Some(rec) => coerce_u64(rec.get("expiresAt"), "expiresAt", 0).unwrap_or(0) <= now_secs,
            None => true,
        };
        if expired {
            let _ = fs::remove_file(&path);
            removed += 1;
        }
    }
    if fs::read_dir(dir)
        .map(|mut it| it.next().is_none())
        .unwrap_or(false)
    {
        let _ = fs::remove_dir(dir);
    }
    removed
}

fn read_live_record(path: &Path, now_secs: u64) -> Option<JsonValue> {
    let rec = read_json_object(path)?;
    let exp = coerce_u64(rec.get("expiresAt"), "expiresAt", 0).ok()?;
    if exp >= now_secs {
        Some(rec)
    } else {
        None
    }
}

fn load_listable_envelope(path: &Path, now_secs: u64) -> Option<(JsonValue, u64, u64)> {
    let rec = read_json_object(path)?;
    let exp = coerce_u64(rec.get("expiresAt"), "expiresAt", 0).ok()?;
    if exp < now_secs {
        let _ = fs::remove_file(path);
        return None;
    }
    let env = rec.get("envelope")?.clone();
    let ts = coerce_u64(env.get("timestamp"), "timestamp", 0).ok()?;
    let serial = coerce_u64(env.get("serial"), "serial", 0).ok()?;
    Some((env, ts, serial))
}

fn read_json_object(path: &Path) -> Option<JsonValue> {
    let text = fs::read_to_string(path).ok()?;
    let val = JsonValue::parse(&text).ok()?;
    if matches!(val, JsonValue::Object(_)) {
        Some(val)
    } else {
        None
    }
}

fn is_envelope_file(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with("env_") && n.ends_with(".json"))
}

fn coerce_u64(val: Option<&JsonValue>, field: &str, default: u64) -> Result<u64, BlindError> {
    match val {
        None | Some(JsonValue::Null) => Ok(default),
        Some(JsonValue::Number(n)) => {
            if n == "0" {
                return Ok(default);
            }
            if n.starts_with('-') || n.contains('.') || n.contains('e') || n.contains('E') {
                return Err(BlindError::BadRequest(format!(
                    "Campo '{field}' deve ser inteiro"
                )));
            }
            let num = n.parse::<u64>().map_err(|_| {
                BlindError::BadRequest(format!("Campo '{field}' fora do intervalo"))
            })?;
            if num > (1u64 << 63) {
                return Err(BlindError::BadRequest(format!(
                    "Campo '{field}' fora do intervalo"
                )));
            }
            Ok(num)
        }
        Some(JsonValue::String(s)) => {
            if s.is_empty() {
                return Ok(default);
            }
            if !s.bytes().all(|b| b.is_ascii_digit()) || s.len() > 19 {
                return Err(BlindError::BadRequest(format!(
                    "Campo '{field}' deve ser inteiro"
                )));
            }
            let num = s.parse::<u64>().map_err(|_| {
                BlindError::BadRequest(format!("Campo '{field}' fora do intervalo"))
            })?;
            Ok(if num == 0 { default } else { num })
        }
        _ => Err(BlindError::BadRequest(format!(
            "Campo '{field}' deve ser inteiro"
        ))),
    }
}

fn canonical_json(val: &JsonValue) -> String {
    let mut out = String::new();
    write_canonical(val, &mut out);
    out
}

fn write_canonical(val: &JsonValue, out: &mut String) {
    match val {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        JsonValue::Number(n) => out.push_str(n),
        JsonValue::String(s) => write_escaped_str(s, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        JsonValue::Object(entries) => {
            let mut sorted: Vec<&(String, JsonValue)> = entries.iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            out.push('{');
            for (i, (k, v)) in sorted.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_escaped_str(k, out);
                out.push(':');
                write_canonical(v, out);
            }
            out.push('}');
        }
    }
}

fn decode_hex_64(hex: &str) -> Option<Vec<u8>> {
    if hex.len() != 64 {
        return None;
    }
    let bytes = hex.as_bytes();
    let mut out = Vec::with_capacity(32);
    for pair in bytes.chunks_exact(2) {
        let hi = hex_nibble(pair[0])?;
        let lo = hex_nibble(pair[1])?;
        out.push((hi << 4) | lo);
    }
    Some(out)
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

fn is_truthy(val: &JsonValue) -> bool {
    match val {
        JsonValue::Null => false,
        JsonValue::Bool(b) => *b,
        JsonValue::Number(n) => n != "0",
        JsonValue::String(s) => !s.is_empty(),
        JsonValue::Array(a) => !a.is_empty(),
        JsonValue::Object(o) => !o.is_empty(),
    }
}

fn env_pos_u64(name: &str, default: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(default)
}

fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
