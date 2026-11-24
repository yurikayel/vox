//! Atomic file-backed inbox storage and pure-`std` SHA-256 token verification (`relay/inbox.py` parity).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::json::JsonValue;

/// Default TTL for stored inbox envelopes (72 hours).
pub const DEFAULT_INBOX_TTL_SECS: u64 = 72 * 3600;
/// Maximum serialized envelope size in bytes (32 KiB).
pub const MAX_ENVELOPE_SIZE: usize = 32 * 1024;

const SHA256_K: [u32; 64] = [
    0x428a_2f98,
    0x7137_4491,
    0xb5c0_fbcf,
    0xe9b5_dba5,
    0x3956_c25b,
    0x59f1_11f1,
    0x923f_82a4,
    0xab1c_5ed5,
    0xd807_aa98,
    0x1283_5b01,
    0x2431_85be,
    0x550c_7dc3,
    0x72be_5d74,
    0x80de_b1fe,
    0x9bdc_06a7,
    0xc19b_f174,
    0xe49b_69c1,
    0xefbe_4786,
    0x0fc1_9dc6,
    0x240c_a1cc,
    0x2de9_2c6f,
    0x4a74_84aa,
    0x5cb0_a9dc,
    0x76f9_88da,
    0x983e_5152,
    0xa831_c66d,
    0xb003_27c8,
    0xbf59_7fc7,
    0xc6e0_0bf3,
    0xd5a7_9147,
    0x06ca_6351,
    0x1429_2967,
    0x27b7_0a85,
    0x2e1b_2138,
    0x4d2c_6dfc,
    0x5338_0d13,
    0x650a_7354,
    0x766a_0abb,
    0x81c2_c92e,
    0x9272_2c85,
    0xa2bf_e8a1,
    0xa81a_664b,
    0xc24b_8b70,
    0xc76c_51a3,
    0xd192_e819,
    0xd699_0624,
    0xf40e_3585,
    0x106a_a070,
    0x19a4_c116,
    0x1e37_6c08,
    0x2748_774c,
    0x34b0_bcb5,
    0x391c_0cb3,
    0x4ed8_aa4a,
    0x5b9c_ca4f,
    0x682e_6ff3,
    0x748f_82ee,
    0x78a5_636f,
    0x84c8_7814,
    0x8cc7_0208,
    0x90be_fffa,
    0xa450_6ceb,
    0xbef9_a3f7,
    0xc671_78f2,
];

/// Errors returned when validating or persisting an inbox envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// Envelope JSON or metadata failed validation (`400 Bad Request`).
    Invalid(String),
    /// Envelope exceeds [`MAX_ENVELOPE_SIZE`] (`413 Payload Too Large`).
    TooLarge,
    /// Filesystem persistence error (`500 Internal Server Error`).
    Io(String),
}

/// Outcome of deleting an inbox envelope (`DELETE /inbox/<addr>/<msgId>`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeleteOutcome {
    /// Envelope existed and was removed (`200 OK`).
    Deleted,
    /// Envelope exists with a `delHash` and the presented token did not match (`403 Forbidden`).
    Forbidden,
    /// Envelope or address does not exist (`404 Not Found`).
    NotFound,
}

/// Metadata returned after queuing an envelope (`POST /inbox/<addr>`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueuedReceipt {
    /// Sanitized message identifier.
    pub id: String,
    /// Sanitized destination address.
    pub to: String,
    /// Expiration timestamp in Unix seconds.
    pub expires_at: u64,
    /// Serialized envelope size in bytes.
    pub size_bytes: usize,
}

impl QueuedReceipt {
    /// Serializes the receipt as JSON matching `relay/inbox.py`.
    pub fn to_json_string(&self) -> String {
        let obj = JsonValue::Object(vec![
            (
                "status".to_string(),
                JsonValue::String("queued".to_string()),
            ),
            ("id".to_string(), JsonValue::String(self.id.clone())),
            ("to".to_string(), JsonValue::String(self.to.clone())),
            (
                "expiresAt".to_string(),
                JsonValue::Number(self.expires_at.to_string()),
            ),
            (
                "sizeBytes".to_string(),
                JsonValue::Number(self.size_bytes.to_string()),
            ),
        ]);
        obj.to_json_string()
    }
}

/// Thread-safe, atomic file-backed inbox store compatible with `relay/inbox.py`.
pub struct InboxStore {
    root: PathBuf,
    lock: Mutex<()>,
    tmp_seq: AtomicU64,
}

impl InboxStore {
    /// Creates an [`InboxStore`] rooted at `root`.
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            lock: Mutex::new(()),
            tmp_seq: AtomicU64::new(1),
        }
    }

    /// Returns the filesystem root directory of this inbox store.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Validates and atomically stores an encrypted envelope under `to_addr`.
    pub fn store_envelope(
        &self,
        to_addr: &str,
        raw_body: &[u8],
        ttl_secs: u64,
    ) -> Result<QueuedReceipt, StoreError> {
        if raw_body.len() > MAX_ENVELOPE_SIZE {
            return Err(StoreError::TooLarge);
        }
        let clean_addr = sanitize_name(to_addr);
        if clean_addr.is_empty() {
            return Err(StoreError::Invalid(
                "invalid destination address".to_string(),
            ));
        }
        let text = std::str::from_utf8(raw_body)
            .map_err(|_| StoreError::Invalid("invalid UTF-8 body".to_string()))?;
        let envelope = JsonValue::parse(text)
            .map_err(|e| StoreError::Invalid(format!("invalid JSON: {e}")))?;
        let (clean_id, del_hash) = validate_envelope(&envelope)?;
        let now = unix_now_secs();
        let expires_at = now.saturating_add(ttl_secs);
        let record = build_record(
            &clean_id,
            &clean_addr,
            (now, expires_at),
            envelope,
            del_hash,
        );
        let _guard = self
            .lock
            .lock()
            .map_err(|_| StoreError::Io("lock poisoned".to_string()))?;
        let addr_dir = self.root.join(&clean_addr);
        fs::create_dir_all(&addr_dir).map_err(|e| StoreError::Io(e.to_string()))?;
        let target = addr_dir.join(format!("{clean_id}.json"));
        self.write_atomic(&addr_dir, &target, record.to_json_string().as_bytes())?;
        Ok(QueuedReceipt {
            id: clean_id,
            to: clean_addr,
            expires_at,
            size_bytes: raw_body.len(),
        })
    }

    /// Lists all non-expired envelopes for `to_addr`, purging expired or corrupt entries.
    pub fn list_envelopes(&self, to_addr: &str) -> Vec<JsonValue> {
        let clean_addr = sanitize_name(to_addr);
        if clean_addr.is_empty() {
            return Vec::new();
        }
        let Ok(_guard) = self.lock.lock() else {
            return Vec::new();
        };
        let addr_dir = self.root.join(clean_addr);
        let Ok(entries) = fs::read_dir(&addr_dir) else {
            return Vec::new();
        };
        let now = unix_now_secs();
        let mut paths: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
            .collect();
        paths.sort();
        let mut results = Vec::new();
        for path in paths {
            if let Some(env) = read_live_envelope(&path, now) {
                results.push(env);
            } else {
                let _ = fs::remove_file(&path);
            }
        }
        results
    }

    /// Deletes `msg_id` from `to_addr`, verifying `X-Vox-Delete-Token` when `delHash` is present.
    pub fn delete_envelope(
        &self,
        to_addr: &str,
        msg_id: &str,
        delete_token: Option<&str>,
    ) -> DeleteOutcome {
        let clean_addr = sanitize_name(to_addr);
        let clean_id = sanitize_name(msg_id);
        if clean_addr.is_empty() || clean_id.is_empty() {
            return DeleteOutcome::NotFound;
        }
        let Ok(_guard) = self.lock.lock() else {
            return DeleteOutcome::NotFound;
        };
        let target = self.root.join(clean_addr).join(format!("{clean_id}.json"));
        if !target.is_file() {
            return DeleteOutcome::NotFound;
        }
        if let Some(expected_hash) = read_del_hash(&target) {
            if !token_matches_hash(delete_token, &expected_hash) {
                return DeleteOutcome::Forbidden;
            }
        }
        let _ = fs::remove_file(&target);
        DeleteOutcome::Deleted
    }

    /// Counts stored `.json` envelope files across all addresses for `/health` reporting.
    pub fn count_envelopes(&self) -> usize {
        let Ok(_guard) = self.lock.lock() else {
            return 0;
        };
        let Ok(dirs) = fs::read_dir(&self.root) else {
            return 0;
        };
        let mut count = 0;
        for entry in dirs.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Ok(files) = fs::read_dir(path) {
                count += files
                    .filter_map(Result::ok)
                    .filter(|f| f.path().extension().is_some_and(|ext| ext == "json"))
                    .count();
            }
        }
        count
    }

    fn write_atomic(&self, dir: &Path, target: &Path, bytes: &[u8]) -> Result<(), StoreError> {
        let seq = self.tmp_seq.fetch_add(1, Ordering::Relaxed);
        let tmp = dir.join(format!(".vox-{}-{seq}.tmp", std::process::id()));
        fs::write(&tmp, bytes).map_err(|e| StoreError::Io(e.to_string()))?;
        if let Err(err) = fs::rename(&tmp, target) {
            let _ = fs::remove_file(target);
            if let Err(err2) = fs::rename(&tmp, target) {
                let _ = fs::remove_file(&tmp);
                return Err(StoreError::Io(format!("{err}; retry: {err2}")));
            }
        }
        Ok(())
    }
}

/// Sanitizes an address or message identifier to ASCII `[A-Za-z0-9_-]`.
pub fn sanitize_name(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

fn validate_envelope(envelope: &JsonValue) -> Result<(String, Option<String>), StoreError> {
    if !matches!(envelope, JsonValue::Object(_)) {
        return Err(StoreError::Invalid(
            "envelope must be a JSON object".to_string(),
        ));
    }
    let valid_v = matches!(envelope.get("v"), Some(JsonValue::Number(n)) if n == "1");
    let has_eph = envelope.get("ephPub").is_some_and(is_truthy_json);
    let has_ct = envelope.get("ct").is_some_and(is_truthy_json);
    if !valid_v || !has_eph || !has_ct {
        return Err(StoreError::Invalid(
            "envelope requires v:1, ephPub, and ct".to_string(),
        ));
    }
    let raw_id = envelope
        .get("id")
        .and_then(JsonValue::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("dm_{}", unix_now_ms()));
    let clean_id = sanitize_name(&raw_id);
    if clean_id.is_empty() {
        return Err(StoreError::Invalid("invalid envelope id".to_string()));
    }
    let del_hash = parse_delete_hash(envelope)?;
    Ok((clean_id, del_hash))
}

fn parse_delete_hash(envelope: &JsonValue) -> Result<Option<String>, StoreError> {
    let Some(sealed) = envelope.get("del") else {
        return Ok(None);
    };
    if matches!(sealed, JsonValue::Null) {
        return Ok(None);
    }
    let hash = sealed
        .get("hash")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let has_ct = sealed.get("ct").is_some_and(is_truthy_json);
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) || !has_ct {
        return Err(StoreError::Invalid(
            "invalid del field: requires 64-hex SHA-256 hash and ct".to_string(),
        ));
    }
    Ok(Some(hash))
}

fn is_truthy_json(val: &JsonValue) -> bool {
    match val {
        JsonValue::Null => false,
        JsonValue::Bool(b) => *b,
        JsonValue::Number(n) => n != "0",
        JsonValue::String(s) => !s.is_empty(),
        JsonValue::Array(items) => !items.is_empty(),
        JsonValue::Object(entries) => !entries.is_empty(),
    }
}

fn build_record(
    clean_id: &str,
    clean_addr: &str,
    times: (u64, u64),
    envelope: JsonValue,
    del_hash: Option<String>,
) -> JsonValue {
    let (now, expires_at) = times;
    let from = envelope
        .get("from")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_string();
    let mut entries = vec![
        ("id".to_string(), JsonValue::String(clean_id.to_string())),
        ("to".to_string(), JsonValue::String(clean_addr.to_string())),
        ("from".to_string(), JsonValue::String(from)),
        ("receivedAt".to_string(), JsonValue::Number(now.to_string())),
        (
            "expiresAt".to_string(),
            JsonValue::Number(expires_at.to_string()),
        ),
        ("envelope".to_string(), envelope),
    ];
    if let Some(hash) = del_hash {
        entries.push(("delHash".to_string(), JsonValue::String(hash)));
    }
    JsonValue::Object(entries)
}

fn read_live_envelope(path: &Path, now: u64) -> Option<JsonValue> {
    let text = fs::read_to_string(path).ok()?;
    let parsed = JsonValue::parse(&text).ok()?;
    let expires_at = parsed
        .get("expiresAt")
        .and_then(|v| match v {
            JsonValue::Number(n) => n.parse::<u64>().ok(),
            _ => None,
        })
        .unwrap_or(0);
    if expires_at <= now {
        return None;
    }
    parsed.get("envelope").cloned()
}

fn read_del_hash(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let parsed = JsonValue::parse(&text).ok()?;
    parsed
        .get("delHash")
        .and_then(JsonValue::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn token_matches_hash(token: Option<&str>, expected_hash: &str) -> bool {
    let Some(raw) = token.filter(|s| !s.is_empty()) else {
        return false;
    };
    let Some(decoded) = decode_hex(raw) else {
        return false;
    };
    let digest = sha256_hex(&decoded);
    ct_eq(digest.as_bytes(), expected_hash.as_bytes())
}

fn decode_hex(hex: &str) -> Option<Vec<u8>> {
    let bytes = hex.as_bytes();
    if bytes.is_empty() || bytes.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() / 2);
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
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Constant-time byte-slice comparison.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Computes lowercase hex SHA-256 digest of `data` using pure Rust `std`.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09_e667,
        0xbb67_ae85,
        0x3c6e_f372,
        0xa54f_f53a,
        0x510e_527f,
        0x9b05_688c,
        0x1f83_d9ab,
        0x5be0_cd19,
    ];
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    let bit_len = (data.len() as u64).wrapping_mul(8);
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for block in msg.chunks_exact(64) {
        sha256_compress(&mut h, block);
    }
    let mut out = String::with_capacity(64);
    for word in h {
        out.push_str(&format!("{word:08x}"));
    }
    out
}

fn sha256_compress(h: &mut [u32; 8], block: &[u8]) {
    let mut w = [0u32; 64];
    for (i, chunk) in block.chunks_exact(4).enumerate() {
        w[i] = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16]
            .wrapping_add(s0)
            .wrapping_add(w[i - 7])
            .wrapping_add(s1);
    }
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = *h;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let t1 = hh
            .wrapping_add(s1)
            .wrapping_add(ch)
            .wrapping_add(SHA256_K[i])
            .wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let t2 = s0.wrapping_add(maj);
        hh = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    for (slot, delta) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
        *slot = slot.wrapping_add(delta);
    }
}

fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn unix_now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_nist_vectors_and_delete_token() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let token = "0102030405060708090a0b0c0d0e0f10";
        let digest = sha256_hex(&decode_hex(token).expect("valid hex"));
        assert!(token_matches_hash(Some(token), &digest));
        assert!(!token_matches_hash(Some("deadbeef"), &digest));
        assert!(!token_matches_hash(None, &digest));
    }

    #[test]
    fn store_list_and_authenticated_delete_work_atomically() {
        let dir = std::env::temp_dir().join(format!("vox-inbox-unit-{}", unix_now_ms()));
        let store = InboxStore::new(dir.clone());
        let token = "0102030405060708090a0b0c0d0e0f10";
        let del_hash = sha256_hex(&decode_hex(token).expect("hex"));
        let body = format!(
            r#"{{"v":1,"id":"m1","ephPub":{{"kty":"EC"}},"ct":"cipher","del":{{"hash":"{del_hash}","ct":"sealed","iv":"iv1"}}}}"#
        );
        let receipt = store
            .store_envelope("vx_alice", body.as_bytes(), DEFAULT_INBOX_TTL_SECS)
            .expect("store ok");
        assert_eq!(receipt.id, "m1");
        assert_eq!(store.list_envelopes("vx_alice").len(), 1);
        assert_eq!(
            store.delete_envelope("vx_alice", "m1", Some("bad")),
            DeleteOutcome::Forbidden
        );
        assert_eq!(
            store.delete_envelope("vx_alice", "m1", Some(token)),
            DeleteOutcome::Deleted
        );
        assert_eq!(
            store.delete_envelope("vx_alice", "m1", Some(token)),
            DeleteOutcome::NotFound
        );
        let _ = fs::remove_dir_all(dir);
    }
}
