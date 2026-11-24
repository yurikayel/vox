//! Atomic file-backed central memory and encrypted vault store
//! (`relay/central_memory.py` + `relay/vault_store.py` + `vox_core::genesis_guard` parity).

use std::collections::{BTreeMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use vox_core::genesis_guard;

use crate::json::JsonValue;
use crate::relay_store::{ct_eq, sha256_hex};

/// Maximum serialized size of a single memory item (512 KiB).
pub const MAX_ITEM_BYTES: usize = 512 * 1024;
/// Maximum serialized size of a single media blob (2 MiB).
pub const MAX_BLOB_BYTES: usize = 2 * 1024 * 1024;
/// Maximum HTTP payload size for `/memory/*` POST routes (4 MiB).
pub const MAX_MEMORY_PAYLOAD_BYTES: usize = MAX_BLOB_BYTES * 2;
/// Minimum PBKDF2 iterations accepted for v2 recovery vaults.
pub const VAULT_MIN_ITERATIONS: u64 = 100_000;
/// Maximum PBKDF2 iterations accepted for v2 recovery vaults.
pub const VAULT_MAX_ITERATIONS: u64 = 5_000_000;

const OWNER_FIELD: &str = "ownerHash";

/// Result of `POST /memory/vault/<key>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultOutcome {
    /// Vault validated, authorized, and persisted (`200 OK`).
    Saved,
    /// Invalid key, record format, or malformed `ownerToken` (`400 Bad Request`).
    Invalid,
    /// Missing or mismatched `ownerToken` (`403 Forbidden`).
    Forbidden,
}

impl VaultOutcome {
    /// Returns the wire status label matching `relay/vault_store.py`.
    pub fn as_str(self) -> &'static str {
        match self {
            VaultOutcome::Saved => "saved",
            VaultOutcome::Invalid => "invalid",
            VaultOutcome::Forbidden => "forbidden",
        }
    }
}

/// Error returned by central memory ingest/sync endpoints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryError {
    /// Invalid JSON or numeric parameter (`400 Bad Request`).
    BadRequest(String),
    /// Payload exceeds 4 MiB (`413 Payload Too Large`).
    TooLarge,
}

#[derive(Debug, Clone)]
struct MemoryState {
    revision: u64,
    updated_at: u64,
    posts: BTreeMap<String, JsonValue>,
    tombstones: BTreeMap<String, JsonValue>,
    profiles: BTreeMap<String, JsonValue>,
    manifests: BTreeMap<String, JsonValue>,
    blobs: BTreeMap<String, JsonValue>,
}

impl MemoryState {
    fn empty() -> Self {
        Self {
            revision: 0,
            updated_at: unix_now_ms(),
            posts: BTreeMap::new(),
            tombstones: BTreeMap::new(),
            profiles: BTreeMap::new(),
            manifests: BTreeMap::new(),
            blobs: BTreeMap::new(),
        }
    }

    fn counts_json(&self) -> JsonValue {
        JsonValue::Object(vec![
            (
                "posts".to_string(),
                JsonValue::Number(self.posts.len().to_string()),
            ),
            (
                "tombstones".to_string(),
                JsonValue::Number(self.tombstones.len().to_string()),
            ),
            (
                "profiles".to_string(),
                JsonValue::Number(self.profiles.len().to_string()),
            ),
            (
                "manifests".to_string(),
                JsonValue::Number(self.manifests.len().to_string()),
            ),
            (
                "blobs".to_string(),
                JsonValue::Number(self.blobs.len().to_string()),
            ),
        ])
    }

    fn to_json(&self) -> JsonValue {
        JsonValue::Object(vec![
            ("version".to_string(), JsonValue::Number("1".to_string())),
            (
                "mode".to_string(),
                JsonValue::String("zero-central-memory".to_string()),
            ),
            (
                "revision".to_string(),
                JsonValue::Number(self.revision.to_string()),
            ),
            (
                "updatedAt".to_string(),
                JsonValue::Number(self.updated_at.to_string()),
            ),
            ("posts".to_string(), map_to_json(&self.posts)),
            ("tombstones".to_string(), map_to_json(&self.tombstones)),
            ("profiles".to_string(), map_to_json(&self.profiles)),
            ("manifests".to_string(), map_to_json(&self.manifests)),
            ("blobs".to_string(), map_to_json(&self.blobs)),
        ])
    }
}

/// Thread-safe, atomic file-backed central memory and vault store.
pub struct MemoryStore {
    root: PathBuf,
    state: Mutex<Option<MemoryState>>,
    tmp_seq: AtomicU64,
}

impl MemoryStore {
    /// Creates a [`MemoryStore`] rooted at `root`.
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            state: Mutex::new(None),
            tmp_seq: AtomicU64::new(1),
        }
    }

    /// Returns the filesystem root of the central memory store.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Returns the `/memory` and `/memory/status` summary JSON.
    pub fn status_summary(&self) -> JsonValue {
        let Ok(mut guard) = self.state.lock() else {
            return JsonValue::Object(vec![(
                "status".to_string(),
                JsonValue::String("ok".to_string()),
            )]);
        };
        let st = self.ensure_loaded(&mut guard);
        JsonValue::Object(vec![
            ("status".to_string(), JsonValue::String("ok".to_string())),
            (
                "mode".to_string(),
                JsonValue::String("zero-central-memory".to_string()),
            ),
            (
                "revision".to_string(),
                JsonValue::Number(st.revision.to_string()),
            ),
            (
                "updatedAt".to_string(),
                JsonValue::Number(st.updated_at.to_string()),
            ),
            (
                "memoryDir".to_string(),
                JsonValue::String(self.root.to_string_lossy().into_owned()),
            ),
            (
                "persistedOnDisk".to_string(),
                JsonValue::Bool(self.root.join("state.json").is_file()),
            ),
            (
                "backupOnDisk".to_string(),
                JsonValue::Bool(self.root.join("state.json.bak").is_file()),
            ),
            ("counts".to_string(), st.counts_json()),
        ])
    }

    /// Exports the delta state for `GET /memory/state`.
    pub fn export_state(&self, since: u64, include_blobs: bool) -> JsonValue {
        let Ok(mut guard) = self.state.lock() else {
            return JsonValue::Object(Vec::new());
        };
        let st = self.ensure_loaded(&mut guard);
        self.build_export_json(st, since, include_blobs, &HashSet::new())
    }

    /// Ingests a single event (`POST /memory/ingest`) and returns `(changed, summary_json)`.
    pub fn ingest_event(&self, raw_body: &[u8]) -> Result<(bool, JsonValue), MemoryError> {
        let payload = parse_memory_object(raw_body)?;
        let Ok(mut guard) = self.state.lock() else {
            return Err(MemoryError::BadRequest("lock poisoned".to_string()));
        };
        let st = self.ensure_loaded(&mut guard);
        let changed = self.apply_event(st, &payload);
        if changed {
            self.append_journal(&payload);
            self.persist_state(st);
        }
        let summary = JsonValue::Object(vec![
            (
                "status".to_string(),
                JsonValue::String(if changed { "saved" } else { "unchanged" }.to_string()),
            ),
            ("changed".to_string(), JsonValue::Bool(changed)),
            (
                "revision".to_string(),
                JsonValue::Number(st.revision.to_string()),
            ),
            ("counts".to_string(), st.counts_json()),
        ]);
        Ok((changed, summary))
    }

    /// Synchronizes a client bundle (`POST /memory/sync`).
    pub fn sync_bundle(&self, raw_body: &[u8]) -> Result<JsonValue, MemoryError> {
        let payload = parse_memory_object(raw_body)?;
        let client_rev = parse_nonneg_u64(payload.get("clientRevision"), "clientRevision")?;
        let since = parse_nonneg_u64(payload.get("since"), "since")?;
        let Ok(mut guard) = self.state.lock() else {
            return Err(MemoryError::BadRequest("lock poisoned".to_string()));
        };
        let st = self.ensure_loaded(&mut guard);
        let changes = self.apply_sync_collections(st, &payload);
        if changes > 0 {
            self.persist_state(st);
        }
        if changes == 0 && client_rev > 0 && client_rev == st.revision {
            return Ok(build_up_to_date_json(st));
        }
        let include_blobs = !matches!(payload.get("includeBlobs"), Some(JsonValue::Bool(false)));
        let known = extract_known_blobs(payload.get("knownBlobs"));
        let mut exported = self.build_export_json(st, since, include_blobs, &known);
        exported.set_field("ingestedCount", JsonValue::Number(changes.to_string()));
        Ok(exported)
    }

    /// Reads a deduplicated blob by 64-hex SHA-256 hash (`GET /memory/blob/<hash>`).
    pub fn get_blob(&self, hash: &str) -> Option<JsonValue> {
        let clean = hash.trim().to_ascii_lowercase();
        if !is_sha256_hex(&clean) {
            return None;
        }
        let path = self.root.join("blobs").join(format!("{clean}.json"));
        read_json_object(&path)
    }

    /// Returns `(size_bytes, mime_type)` if `hash` exists in `blobs/`, for P2P auto-authorization.
    pub fn get_blob_meta(&self, hash: &str) -> Option<(u64, String)> {
        let blob = self.get_blob(hash)?;
        let size = blob
            .get("sizeBytes")
            .or_else(|| blob.get("byteLength"))
            .and_then(json_as_u64)
            .or_else(|| {
                blob.get("data")
                    .and_then(JsonValue::as_str)
                    .map(|s| s.len() as u64)
            })
            .unwrap_or(0);
        let mime = blob
            .get("mimeType")
            .or_else(|| blob.get("mime"))
            .and_then(JsonValue::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or("application/octet-stream")
            .to_string();
        Some((size, mime))
    }

    /// Reads a servable v2 (or revoked) vault record without `ownerHash` (`GET /memory/vault/<key>`).
    pub fn get_vault(&self, key: &str) -> Option<JsonValue> {
        let path = self.vault_path(key)?;
        let stored = read_json_object(&path)?;
        if !is_servable_vault(&stored) {
            return None;
        }
        Some(strip_owner_field(&stored))
    }

    /// Validates, authorizes, and atomically persists a v2/revoked vault (`POST /memory/vault/<key>`).
    pub fn save_vault(&self, key: &str, raw_body: &[u8]) -> Result<VaultOutcome, MemoryError> {
        let payload = parse_memory_object(raw_body)?;
        let Ok(_guard) = self.state.lock() else {
            return Ok(VaultOutcome::Invalid);
        };
        let Some(path) = self.vault_path(key) else {
            return Ok(VaultOutcome::Invalid);
        };
        let (record, token) = split_vault_payload(&payload);
        if !is_servable_vault(record) {
            return Ok(VaultOutcome::Invalid);
        }
        let existing = read_json_object(&path);
        let (outcome, owner) = authorize_vault(existing.as_ref(), record, token);
        if outcome != VaultOutcome::Saved {
            return Ok(outcome);
        }
        let mut to_store = strip_owner_field(record);
        if let Some(hash) = owner {
            to_store.set_field(OWNER_FIELD, JsonValue::String(hash));
        }
        let vaults_dir = self.root.join("vaults");
        if fs::create_dir_all(&vaults_dir).is_err() {
            return Ok(VaultOutcome::Invalid);
        }
        if self
            .write_atomic(&vaults_dir, &path, to_store.to_json_string().as_bytes())
            .is_err()
        {
            return Ok(VaultOutcome::Invalid);
        }
        Ok(VaultOutcome::Saved)
    }

    fn vault_path(&self, key: &str) -> Option<PathBuf> {
        let clean = key.trim().to_ascii_lowercase();
        if !is_valid_id(&clean) {
            return None;
        }
        Some(self.root.join("vaults").join(format!("{clean}.json")))
    }

    fn ensure_loaded<'a>(&self, slot: &'a mut Option<MemoryState>) -> &'a mut MemoryState {
        if slot.is_none() {
            let loaded = self.load_from_disk();
            *slot = Some(loaded);
        }
        slot.as_mut().expect("state initialized")
    }

    fn load_from_disk(&self) -> MemoryState {
        let state_file = self.root.join("state.json");
        let bak_file = self.root.join("state.json.bak");
        let journal_file = self.root.join("events.jsonl");
        let (raw, used_backup) = match read_json_object(&state_file) {
            Some(obj) => (Some(obj), false),
            None => {
                let bak = read_json_object(&bak_file);
                let flag = bak.is_some();
                (bak, flag)
            }
        };
        let mut st = normalize_state(raw.as_ref());
        let pruned = prune_genesis_state(&mut st);
        if pruned > 0 {
            st.revision = st.revision.saturating_add(1);
        }
        let replayed = self.replay_journal(&mut st, &journal_file);
        if used_backup || replayed {
            self.persist_state(&mut st);
        }
        st
    }

    fn replay_journal(&self, st: &mut MemoryState, journal: &Path) -> bool {
        let Ok(content) = fs::read_to_string(journal) else {
            return false;
        };
        let mut replayed = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(event) = JsonValue::parse(trimmed) {
                if self.apply_event(st, &event) {
                    replayed = true;
                }
            }
        }
        replayed
    }

    fn append_journal(&self, event: &JsonValue) {
        let _ = fs::create_dir_all(&self.root);
        let path = self.root.join("events.jsonl");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", event.to_json_string());
        }
    }

    fn persist_state(&self, st: &mut MemoryState) {
        st.updated_at = unix_now_ms();
        if fs::create_dir_all(&self.root).is_err() {
            return;
        }
        let state_file = self.root.join("state.json");
        let bak_file = self.root.join("state.json.bak");
        let journal_file = self.root.join("events.jsonl");
        if let Ok(existing) = fs::read(&state_file) {
            let _ = self.write_atomic(&self.root, &bak_file, &existing);
        }
        let encoded = st.to_json().to_json_string();
        if self
            .write_atomic(&self.root, &state_file, encoded.as_bytes())
            .is_ok()
        {
            let _ = fs::remove_file(journal_file);
        }
    }

    fn apply_sync_collections(&self, st: &mut MemoryState, payload: &JsonValue) -> usize {
        let mut count = 0;
        for key in [
            "tombstones",
            "posts",
            "items",
            "profiles",
            "manifests",
            "blobs",
        ] {
            let Some(JsonValue::Array(items)) = payload.get(key) else {
                continue;
            };
            for item in items {
                let changed = match key {
                    "tombstones" => apply_tombstone(st, item),
                    "posts" | "items" => apply_post(st, item),
                    "profiles" => apply_profile(st, item),
                    "manifests" => apply_manifest(st, item),
                    "blobs" => self.apply_blob(st, item),
                    _ => false,
                };
                if changed {
                    count += 1;
                }
            }
        }
        count
    }

    fn apply_event(&self, st: &mut MemoryState, payload: &JsonValue) -> bool {
        if !matches!(payload, JsonValue::Object(_)) {
            return false;
        }
        let etype = payload
            .get("type")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_ascii_uppercase();
        match etype.as_str() {
            "GOSSIP" | "GOSSIP_UPDATE" => payload.get("item").is_some_and(|it| apply_post(st, it)),
            "GOSSIP_DELETE" => payload
                .get("tombstone")
                .or_else(|| payload.get("item"))
                .is_some_and(|it| apply_tombstone(st, it)),
            "PROFILE_CARD_HELLO" | "PROFILE_CARD" => {
                let card = payload
                    .get("card")
                    .or_else(|| payload.get("item"))
                    .unwrap_or(payload);
                apply_profile(st, card)
            }
            "CACHE_MANIFEST" => {
                let man = payload
                    .get("item")
                    .or_else(|| payload.get("manifest"))
                    .unwrap_or(payload);
                apply_manifest(st, man)
            }
            "MEDIA_BLOB" => self.apply_blob(st, payload.get("blob").unwrap_or(payload)),
            _ if payload.get("hash").is_some() && payload.get("data").is_some() => {
                self.apply_blob(st, payload)
            }
            _ if payload.get("id").is_some() => apply_post(st, payload),
            _ => false,
        }
    }

    fn apply_blob(&self, st: &mut MemoryState, blob: &JsonValue) -> bool {
        let Some(hash_raw) = blob.get("hash").and_then(JsonValue::as_str) else {
            return false;
        };
        let hash = hash_raw.trim().to_ascii_lowercase();
        let Some(data) = blob.get("data").and_then(JsonValue::as_str) else {
            return false;
        };
        if !is_sha256_hex(&hash) || data.is_empty() {
            return false;
        }
        if compute_blob_sha256(data).as_deref() != Some(hash.as_str()) {
            return false;
        }
        let byte_len = blob
            .get("byteLength")
            .and_then(json_as_u64)
            .filter(|&n| n > 0)
            .unwrap_or(data.len() as u64);
        let mime = blob
            .get("mime")
            .and_then(JsonValue::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or("application/octet-stream");
        let stored = JsonValue::Object(vec![
            ("hash".to_string(), JsonValue::String(hash.clone())),
            ("mime".to_string(), JsonValue::String(mime.to_string())),
            (
                "byteLength".to_string(),
                JsonValue::Number(byte_len.to_string()),
            ),
            ("data".to_string(), JsonValue::String(data.to_string())),
        ]);
        let encoded = stored.to_json_string();
        if encoded.len() > MAX_BLOB_BYTES {
            return false;
        }
        let blobs_dir = self.root.join("blobs");
        let path = blobs_dir.join(format!("{hash}.json"));
        if path.is_file() && st.blobs.contains_key(&hash) {
            return false;
        }
        if fs::create_dir_all(&blobs_dir).is_err()
            || self
                .write_atomic(&blobs_dir, &path, encoded.as_bytes())
                .is_err()
        {
            return false;
        }
        st.blobs.insert(
            hash.clone(),
            JsonValue::Object(vec![
                ("hash".to_string(), JsonValue::String(hash)),
                ("mime".to_string(), JsonValue::String(mime.to_string())),
                (
                    "byteLength".to_string(),
                    JsonValue::Number(byte_len.to_string()),
                ),
                (
                    "storedAt".to_string(),
                    JsonValue::Number(unix_now_ms().to_string()),
                ),
            ]),
        );
        st.revision = st.revision.saturating_add(1);
        true
    }

    fn build_export_json(
        &self,
        st: &MemoryState,
        since: u64,
        include_blobs: bool,
        known_blobs: &HashSet<String>,
    ) -> JsonValue {
        let blobs = self.export_blobs(st, include_blobs, known_blobs);
        JsonValue::Object(vec![
            ("status".to_string(), JsonValue::String("ok".to_string())),
            (
                "mode".to_string(),
                JsonValue::String("zero-central-memory".to_string()),
            ),
            (
                "revision".to_string(),
                JsonValue::Number(st.revision.to_string()),
            ),
            (
                "updatedAt".to_string(),
                JsonValue::Number(st.updated_at.to_string()),
            ),
            (
                "memoryDir".to_string(),
                JsonValue::String(self.root.to_string_lossy().into_owned()),
            ),
            ("counts".to_string(), st.counts_json()),
            (
                "posts".to_string(),
                JsonValue::Array(filter_since(&st.posts, since)),
            ),
            (
                "tombstones".to_string(),
                JsonValue::Array(filter_since(&st.tombstones, since)),
            ),
            (
                "profiles".to_string(),
                JsonValue::Array(filter_since(&st.profiles, since)),
            ),
            (
                "manifests".to_string(),
                JsonValue::Array(filter_since(&st.manifests, since)),
            ),
            ("blobs".to_string(), JsonValue::Array(blobs)),
        ])
    }

    fn export_blobs(
        &self,
        st: &MemoryState,
        include_blobs: bool,
        known: &HashSet<String>,
    ) -> Vec<JsonValue> {
        let mut out = Vec::new();
        for (hash, meta) in &st.blobs {
            if known.contains(hash) {
                continue;
            }
            if include_blobs {
                if let Some(full) = self.get_blob(hash) {
                    out.push(full);
                }
            } else {
                out.push(meta.clone());
            }
        }
        out
    }

    fn write_atomic(&self, dir: &Path, target: &Path, bytes: &[u8]) -> std::io::Result<()> {
        let seq = self.tmp_seq.fetch_add(1, Ordering::Relaxed);
        let tmp = dir.join(format!(".mem-{}-{seq}.tmp", std::process::id()));
        fs::write(&tmp, bytes)?;
        if fs::rename(&tmp, target).is_err() {
            let _ = fs::remove_file(target);
            if let Err(err) = fs::rename(&tmp, target) {
                let _ = fs::remove_file(&tmp);
                return Err(err);
            }
        }
        Ok(())
    }
}

fn apply_post(st: &mut MemoryState, item: &JsonValue) -> bool {
    if !matches!(item, JsonValue::Object(_)) || item.to_json_string().len() > MAX_ITEM_BYTES {
        return false;
    }
    let id = item
        .get("id")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_valid_id(id) {
        return false;
    }
    let kind = item.get("type").and_then(JsonValue::as_str).unwrap_or("");
    if matches!(kind, "tombstone" | "post-tombstone")
        || item.get("kind").and_then(JsonValue::as_str) == Some("post-tombstone")
    {
        return apply_tombstone(st, item);
    }
    if kind == "profile-card" {
        return apply_profile(st, item);
    }
    if kind == "cache-manifest" {
        return apply_manifest(st, item);
    }
    if refuses_post_json(item) {
        return false;
    }
    let incoming_ts = item_timestamp(item);
    if let Some(tomb) = st.tombstones.get(id) {
        if incoming_ts > 0 && item_timestamp(tomb) >= incoming_ts {
            return false;
        }
    }
    if let Some(existing) = st.posts.get(id) {
        let ex_author = post_author(existing).unwrap_or("");
        let in_author = post_author(item).unwrap_or("");
        if !ex_author.is_empty() && !in_author.is_empty() && ex_author != in_author {
            return false;
        }
        if item_timestamp(existing) > incoming_ts || existing == item {
            return false;
        }
    }
    st.posts.insert(id.to_string(), item.clone());
    st.revision = st.revision.saturating_add(1);
    true
}

fn apply_tombstone(st: &mut MemoryState, tomb: &JsonValue) -> bool {
    if !matches!(tomb, JsonValue::Object(_)) || tomb.to_json_string().len() > MAX_ITEM_BYTES {
        return false;
    }
    let id = tomb
        .get("id")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_valid_id(id) {
        return false;
    }
    let del_ts = {
        let t = item_timestamp(tomb);
        if t > 0 {
            t
        } else {
            unix_now_ms()
        }
    };
    if let Some(existing_post) = st.posts.get(id) {
        let ex_author = existing_post
            .get("author")
            .and_then(JsonValue::as_str)
            .unwrap_or("");
        let tb_author = tomb.get("author").and_then(JsonValue::as_str).unwrap_or("");
        if !ex_author.is_empty() && !tb_author.is_empty() && ex_author != tb_author {
            return false;
        }
        if del_ts < item_timestamp(existing_post) {
            return false;
        }
    }
    if let Some(existing_tomb) = st.tombstones.get(id) {
        if item_timestamp(existing_tomb) >= del_ts {
            return false;
        }
    }
    let mut normalized = tomb.clone();
    normalized.set_field("id", JsonValue::String(id.to_string()));
    normalized.set_field("type", JsonValue::String("tombstone".to_string()));
    normalized.set_field("editedAt", JsonValue::Number(del_ts.to_string()));
    st.tombstones.insert(id.to_string(), normalized);
    st.posts.remove(id);
    st.revision = st.revision.saturating_add(1);
    true
}

fn apply_profile(st: &mut MemoryState, card: &JsonValue) -> bool {
    if !matches!(card, JsonValue::Object(_)) || card.to_json_string().len() > MAX_ITEM_BYTES {
        return false;
    }
    let route_id = card
        .get("author")
        .or_else(|| card.get("routeId"))
        .or_else(|| card.get("id"))
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_valid_id(route_id) || genesis_guard::refuses_profile_card(Some(route_id)) {
        return false;
    }
    let incoming_ts = item_timestamp(card);
    if let Some(existing) = st.profiles.get(route_id) {
        if item_timestamp(existing) > incoming_ts || existing == card {
            return false;
        }
    }
    st.profiles.insert(route_id.to_string(), card.clone());
    st.revision = st.revision.saturating_add(1);
    true
}

fn apply_manifest(st: &mut MemoryState, manifest: &JsonValue) -> bool {
    if !matches!(manifest, JsonValue::Object(_)) || manifest.to_json_string().len() > MAX_ITEM_BYTES
    {
        return false;
    }
    let comm_id = manifest
        .get("communityId")
        .or_else(|| manifest.get("id"))
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .trim();
    if !is_valid_id(comm_id) {
        return false;
    }
    let incoming_ts = item_timestamp(manifest);
    if let Some(existing) = st.manifests.get(comm_id) {
        if item_timestamp(existing) > incoming_ts || existing == manifest {
            return false;
        }
    }
    st.manifests.insert(comm_id.to_string(), manifest.clone());
    st.revision = st.revision.saturating_add(1);
    true
}

fn refuses_post_json(item: &JsonValue) -> bool {
    let author = post_author(item);
    let created_ms = creation_timestamp_i64(item);
    genesis_guard::refuses_post(author, created_ms)
}

fn post_author(item: &JsonValue) -> Option<&str> {
    item.get("author")
        .or_else(|| item.get("owner"))
        .and_then(JsonValue::as_str)
}

fn creation_timestamp_i64(item: &JsonValue) -> Option<i64> {
    for field in ["ts", "timestamp", "createdAt"] {
        if let Some(JsonValue::Number(raw)) = item.get(field) {
            if let Ok(v) = raw.parse::<i64>() {
                if v > 0 {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn prune_genesis_state(st: &mut MemoryState) -> usize {
    let before_posts = st.posts.len();
    st.posts.retain(|_, post| !refuses_post_json(post));
    let before_profiles = st.profiles.len();
    st.profiles.retain(|k, card| {
        let rid = card
            .get("routeId")
            .or_else(|| card.get("author"))
            .and_then(JsonValue::as_str)
            .unwrap_or(k.as_str());
        !genesis_guard::refuses_profile_card(Some(rid))
    });
    (before_posts - st.posts.len()) + (before_profiles - st.profiles.len())
}

fn normalize_state(raw: Option<&JsonValue>) -> MemoryState {
    let mut st = MemoryState::empty();
    let Some(obj) = raw else {
        return st;
    };
    st.revision = obj.get("revision").and_then(json_as_u64).unwrap_or(0);
    if let Some(ts) = obj.get("updatedAt").and_then(json_as_u64) {
        st.updated_at = ts;
    }
    copy_map(obj.get("posts"), &mut st.posts);
    copy_map(obj.get("tombstones"), &mut st.tombstones);
    copy_map(obj.get("profiles"), &mut st.profiles);
    copy_map(obj.get("manifests"), &mut st.manifests);
    copy_map(obj.get("blobs"), &mut st.blobs);
    st
}

fn copy_map(val: Option<&JsonValue>, dst: &mut BTreeMap<String, JsonValue>) {
    if let Some(JsonValue::Object(entries)) = val {
        for (k, v) in entries {
            dst.insert(k.clone(), v.clone());
        }
    }
}

fn map_to_json(map: &BTreeMap<String, JsonValue>) -> JsonValue {
    JsonValue::Object(map.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
}

fn filter_since(map: &BTreeMap<String, JsonValue>, since: u64) -> Vec<JsonValue> {
    let mut items: Vec<JsonValue> = map
        .values()
        .filter(|it| since == 0 || item_timestamp(it) >= since)
        .cloned()
        .collect();
    items.sort_by_key(item_timestamp);
    items
}

fn build_up_to_date_json(st: &MemoryState) -> JsonValue {
    JsonValue::Object(vec![
        ("status".to_string(), JsonValue::String("ok".to_string())),
        (
            "mode".to_string(),
            JsonValue::String("zero-central-memory".to_string()),
        ),
        ("upToDate".to_string(), JsonValue::Bool(true)),
        (
            "revision".to_string(),
            JsonValue::Number(st.revision.to_string()),
        ),
        (
            "updatedAt".to_string(),
            JsonValue::Number(st.updated_at.to_string()),
        ),
        (
            "ingestedCount".to_string(),
            JsonValue::Number("0".to_string()),
        ),
        ("counts".to_string(), st.counts_json()),
        ("posts".to_string(), JsonValue::Array(Vec::new())),
        ("tombstones".to_string(), JsonValue::Array(Vec::new())),
        ("profiles".to_string(), JsonValue::Array(Vec::new())),
        ("manifests".to_string(), JsonValue::Array(Vec::new())),
        ("blobs".to_string(), JsonValue::Array(Vec::new())),
    ])
}

fn is_servable_vault(record: &JsonValue) -> bool {
    if !matches!(record, JsonValue::Object(_)) {
        return false;
    }
    if matches!(record.get("revoked"), Some(JsonValue::Bool(true))) {
        return true;
    }
    let valid_v = matches!(record.get("v"), Some(JsonValue::Number(n)) if n == "2");
    let has_salt = record
        .get("salt")
        .and_then(JsonValue::as_str)
        .is_some_and(|s| !s.is_empty());
    let valid_iter = record
        .get("iter")
        .and_then(json_as_u64)
        .is_some_and(|it| (VAULT_MIN_ITERATIONS..=VAULT_MAX_ITERATIONS).contains(&it));
    valid_v && has_salt && valid_iter
}

fn split_vault_payload(payload: &JsonValue) -> (&JsonValue, Option<&JsonValue>) {
    if let Some(rec) = payload.get("record") {
        (rec, payload.get("ownerToken"))
    } else {
        (payload, None)
    }
}

fn authorize_vault(
    existing: Option<&JsonValue>,
    record: &JsonValue,
    token_val: Option<&JsonValue>,
) -> (VaultOutcome, Option<String>) {
    let current = existing
        .and_then(|e| e.get(OWNER_FIELD))
        .and_then(JsonValue::as_str);
    let token_present = token_val.is_some_and(|v| !matches!(v, JsonValue::Null));
    let presented = token_val
        .and_then(JsonValue::as_str)
        .and_then(vault_owner_hash);
    if let Some(owner) = current {
        if let Some(p) = presented {
            if ct_eq(p.as_bytes(), owner.as_bytes()) {
                return (VaultOutcome::Saved, Some(owner.to_string()));
            }
        }
        return (VaultOutcome::Forbidden, None);
    }
    if token_present && presented.is_none() {
        return (VaultOutcome::Invalid, None);
    }
    let is_revoked = matches!(record.get("revoked"), Some(JsonValue::Bool(true)));
    if presented.is_none() && !is_revoked {
        return (VaultOutcome::Forbidden, None);
    }
    (VaultOutcome::Saved, presented)
}

fn vault_owner_hash(token: &str) -> Option<String> {
    let clean = token.trim().to_ascii_lowercase();
    if clean.len() != 64 {
        return None;
    }
    let bytes = clean.as_bytes();
    let mut raw = Vec::with_capacity(32);
    for pair in bytes.chunks_exact(2) {
        let hi = hex_nibble(pair[0])?;
        let lo = hex_nibble(pair[1])?;
        raw.push((hi << 4) | lo);
    }
    Some(sha256_hex(&raw))
}

fn strip_owner_field(record: &JsonValue) -> JsonValue {
    let JsonValue::Object(entries) = record else {
        return record.clone();
    };
    JsonValue::Object(
        entries
            .iter()
            .filter(|(k, _)| k != OWNER_FIELD)
            .cloned()
            .collect(),
    )
}

fn parse_memory_object(raw_body: &[u8]) -> Result<JsonValue, MemoryError> {
    if raw_body.is_empty() {
        return Err(MemoryError::BadRequest("payload vazio".to_string()));
    }
    if raw_body.len() > MAX_MEMORY_PAYLOAD_BYTES {
        return Err(MemoryError::TooLarge);
    }
    let text = std::str::from_utf8(raw_body)
        .map_err(|_| MemoryError::BadRequest("UTF-8 inválido".to_string()))?;
    let val = JsonValue::parse(text)
        .map_err(|e| MemoryError::BadRequest(format!("JSON inválido: {e}")))?;
    if !matches!(val, JsonValue::Object(_)) {
        return Err(MemoryError::BadRequest(
            "Payload deve ser um objeto JSON".to_string(),
        ));
    }
    Ok(val)
}

fn parse_nonneg_u64(val: Option<&JsonValue>, field: &str) -> Result<u64, MemoryError> {
    match val {
        None | Some(JsonValue::Null) => Ok(0),
        Some(JsonValue::Number(n)) => n.parse::<u64>().map_err(|_| {
            MemoryError::BadRequest(format!("Campo '{field}' deve ser inteiro não negativo"))
        }),
        Some(JsonValue::String(s)) if s.is_empty() => Ok(0),
        Some(JsonValue::String(s)) => s.trim().parse::<u64>().map_err(|_| {
            MemoryError::BadRequest(format!("Campo '{field}' deve ser inteiro não negativo"))
        }),
        _ => Err(MemoryError::BadRequest(format!(
            "Campo '{field}' deve ser inteiro não negativo"
        ))),
    }
}

fn extract_known_blobs(val: Option<&JsonValue>) -> HashSet<String> {
    let Some(JsonValue::Array(items)) = val else {
        return HashSet::new();
    };
    items
        .iter()
        .filter_map(JsonValue::as_str)
        .map(|s| s.trim().to_ascii_lowercase())
        .collect()
}

fn item_timestamp(item: &JsonValue) -> u64 {
    for field in ["editedAt", "ts", "timestamp", "createdAt"] {
        if let Some(n) = item.get(field).and_then(json_as_u64) {
            if n > 0 {
                return n;
            }
        }
    }
    0
}

fn json_as_u64(val: &JsonValue) -> Option<u64> {
    match val {
        JsonValue::Number(n) => n.parse::<u64>().ok(),
        _ => None,
    }
}

fn compute_blob_sha256(data: &str) -> Option<String> {
    let trimmed = data.trim();
    if let Some(rest) = trimmed.strip_prefix("data:") {
        if let Some((_mime, b64)) = rest.split_once(";base64,") {
            let decoded = decode_base64(b64)?;
            return Some(sha256_hex(&decoded));
        }
    }
    Some(sha256_hex(data.as_bytes()))
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|b| !matches!(b, b'\r' | b'\n'))
        .collect();
    let pad = (4 - (cleaned.len() % 4)) % 4;
    let mut padded = cleaned;
    padded.resize(padded.len() + pad, b'=');
    let mut out = Vec::with_capacity((padded.len() / 4) * 3);
    for chunk in padded.chunks_exact(4) {
        let a = b64_val(chunk[0])?;
        let b = b64_val(chunk[1])?;
        out.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            let c = b64_val(chunk[2])?;
            out.push((b << 4) | (c >> 2));
            if chunk[3] != b'=' {
                let d = b64_val(chunk[3])?;
                out.push((c << 6) | d);
            }
        }
    }
    Some(out)
}

fn b64_val(b: u8) -> Option<u8> {
    match b {
        b'A'..=b'Z' => Some(b - b'A'),
        b'a'..=b'z' => Some(b - b'a' + 26),
        b'0'..=b'9' => Some(b - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
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

fn is_valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 160
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
