//! Closed domain reference types for Vault v2 records (PM-90 / ADR-036 / ADR-039 Phase 1b).
//!
//! Mirrors `client/js/vault/vault-crypto.js`:
//! - Enforces `v == 2` (`VAULT_V2_VERSION`) with no silent fallback to v1.
//! - Rejects unknown KDF identifiers via closed enum [`VaultKdf`] (ADR-036).
//! - Enforces `iter >= MIN_PBKDF2_ITERATIONS` (`600_000`) and non-empty encoded `salt`, `iv`, `ciphertext`.

use alloc::string::String;
use core::fmt;

/// Wire format version for Vault v2 records.
pub const VAULT_V2_VERSION: u8 = 2;

/// Minimum PBKDF2-SHA256 iteration count matching `VAULT_V2_ITERATIONS` in `vault-crypto.js`.
pub const MIN_PBKDF2_ITERATIONS: u32 = 600_000;

/// Closed set of Key Derivation Functions accepted by Vault v2 (ADR-036).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultKdf {
    /// PBKDF2 with HMAC-SHA-256 (`"pbkdf2-sha256"`).
    Pbkdf2Sha256,
}

impl VaultKdf {
    /// Parses a wire-format KDF identifier, failing closed on any unknown algorithm.
    pub fn parse(raw: &str) -> Result<Self, VaultV2Error> {
        match raw {
            "pbkdf2-sha256" => Ok(Self::Pbkdf2Sha256),
            _ => Err(VaultV2Error::UnsupportedKdf),
        }
    }

    /// Returns the canonical wire-format KDF string.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pbkdf2Sha256 => "pbkdf2-sha256",
        }
    }
}

/// Validation and parsing errors for [`VaultRecordV2`] and [`VaultKdf`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultV2Error {
    /// Record version does not equal [`VAULT_V2_VERSION`].
    InvalidVersion(u8),
    /// KDF identifier is unknown or unsupported (ADR-036).
    UnsupportedKdf,
    /// PBKDF2 iteration count is below [`MIN_PBKDF2_ITERATIONS`].
    InsufficientIterations(u32),
    /// Salt field is empty or not valid base64/base64url.
    InvalidSalt,
    /// IV field is empty or not valid base64/base64url.
    InvalidIv,
    /// Ciphertext field is empty or not valid base64/base64url.
    InvalidCiphertext,
}

impl fmt::Display for VaultV2Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidVersion(v) => write!(f, "invalid vault v2 version: {v}"),
            Self::UnsupportedKdf => f.write_str("unsupported vault v2 kdf"),
            Self::InsufficientIterations(n) => {
                write!(
                    f,
                    "vault v2 iterations {n} below minimum {MIN_PBKDF2_ITERATIONS}"
                )
            }
            Self::InvalidSalt => f.write_str("vault v2 salt must be non-empty base64/base64url"),
            Self::InvalidIv => f.write_str("vault v2 iv must be non-empty base64/base64url"),
            Self::InvalidCiphertext => {
                f.write_str("vault v2 ciphertext must be non-empty base64/base64url")
            }
        }
    }
}

/// Reference Vault v2 encrypted account bundle record (PM-90).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultRecordV2 {
    /// Record format version; must equal [`VAULT_V2_VERSION`] (`2`).
    pub version: u8,
    /// Closed key derivation algorithm.
    pub kdf: VaultKdf,
    /// PBKDF2 iteration count; must be at least [`MIN_PBKDF2_ITERATIONS`].
    pub iter: u32,
    /// Encoded salt (non-empty valid base64/base64url, including lowercase hex).
    pub salt: String,
    /// Encoded AES-GCM IV (non-empty valid base64/base64url, including lowercase hex).
    pub iv: String,
    /// Encoded AES-GCM ciphertext and authentication tag (non-empty valid base64/base64url).
    pub ciphertext: String,
}

impl VaultRecordV2 {
    /// Validates all structural and cryptographic policy invariants for a Vault v2 record.
    pub fn validate(&self) -> Result<(), VaultV2Error> {
        if self.version != VAULT_V2_VERSION {
            return Err(VaultV2Error::InvalidVersion(self.version));
        }
        if self.iter < MIN_PBKDF2_ITERATIONS {
            return Err(VaultV2Error::InsufficientIterations(self.iter));
        }
        if !is_valid_base64_str(&self.salt, true) {
            return Err(VaultV2Error::InvalidSalt);
        }
        if !is_valid_base64_str(&self.iv, true) {
            return Err(VaultV2Error::InvalidIv);
        }
        if !is_valid_base64_str(&self.ciphertext, true) {
            return Err(VaultV2Error::InvalidCiphertext);
        }
        Ok(())
    }
}

/// Validates a non-empty base64url (or standard base64 when `allow_standard` is `true`) string.
pub(crate) fn is_valid_base64_str(s: &str, allow_standard: bool) -> bool {
    if s.is_empty() {
        return false;
    }
    let bytes = s.as_bytes();
    let pad = bytes.iter().rev().take_while(|&&b| b == b'=').count();
    if pad > 2 || (pad > 0 && bytes.len() % 4 != 0) {
        return false;
    }
    let body = &bytes[..bytes.len() - pad];
    if body.is_empty() || (pad == 0 && body.len() % 4 == 1) {
        return false;
    }
    has_valid_base64_body(body, allow_standard)
}

fn has_valid_base64_body(body: &[u8], allow_standard: bool) -> bool {
    let mut has_std = false;
    let mut has_url = false;
    for &b in body {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' => {}
            b'+' | b'/' => has_std = true,
            b'-' | b'_' => has_url = true,
            _ => return false,
        }
    }
    !has_std || (allow_standard && !has_url)
}

/// Returns `true` if `s` consists exclusively of `expected_len` lowercase ASCII hex digits.
pub(crate) fn is_lowercase_hex_len(s: &str, expected_len: usize) -> bool {
    s.len() == expected_len && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}
