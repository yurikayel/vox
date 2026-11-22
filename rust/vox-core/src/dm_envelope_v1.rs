//! Closed domain reference types for DM v1 encrypted envelopes (ADR-039 Phase 1b).
//!
//! Mirrors `client/js/crypto-dm.js` and PM-94 sealed delete tokens:
//! - Enforces `v == 1` (`DM_V1_VERSION`) and `ts > 0`.
//! - Restricts `eph_pub` to public EC P-256 JWKs (`kty == "EC"`, `crv == "P-256"`), rejecting private members.
//! - Validates optional PM-94 [`DeleteTokenEnvelope`] with a 64-char lowercase SHA-256 hex digest.

use alloc::string::String;
use core::fmt;

use crate::sig_format::JsonValue;
use crate::vault_v2::{is_lowercase_hex_len, is_valid_base64_str};

/// Wire format version for DM v1 envelopes.
pub const DM_V1_VERSION: u8 = 1;

/// Maximum byte length allowed for a DM message identifier (`id`).
pub const MAX_DM_ID_LEN: usize = 128;

const PRIVATE_JWK_MEMBERS: &[&str] = &["d", "p", "q", "dp", "dq", "qi", "k", "oth"];

/// Validation and parsing errors for [`DmEnvelopeV1`], [`P256PublicJwk`], and [`DeleteTokenEnvelope`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DmEnvelopeError {
    /// Envelope version does not equal [`DM_V1_VERSION`].
    InvalidVersion(u8),
    /// Message identifier is empty, whitespace-only, or exceeds [`MAX_DM_ID_LEN`].
    InvalidMessageId,
    /// Sender (`from`) or recipient (`to`) identifier is empty or whitespace-only.
    InvalidParticipant,
    /// Timestamp (`ts`) is not strictly positive.
    InvalidTimestamp(i64),
    /// JWK `kty` is not `"EC"`.
    InvalidJwkKty,
    /// JWK `crv` is not `"P-256"`.
    InvalidJwkCrv,
    /// JWK coordinate (`x` or `y`) is empty or not valid base64url.
    InvalidJwkCoordinate,
    /// JWK input is not a JSON object or contains a private key member (e.g. `"d"`).
    PrivateJwkMemberForbidden,
    /// JWK input structure is malformed or missing required string fields.
    MalformedJwk,
    /// Envelope `iv` is empty or not valid base64url.
    InvalidIv,
    /// Envelope `ct` is empty or not valid base64url.
    InvalidCiphertext,
    /// Delete token `iv` or `ct` is empty or not valid base64url.
    InvalidDeleteTokenPayload,
    /// Delete token `hash` is not a 64-character lowercase SHA-256 hex string.
    InvalidDeleteTokenHash,
}

impl fmt::Display for DmEnvelopeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidVersion(v) => write!(f, "invalid dm envelope version: {v}"),
            Self::InvalidMessageId => f.write_str("invalid dm message id"),
            Self::InvalidParticipant => f.write_str("dm from/to participant must be non-empty"),
            Self::InvalidTimestamp(ts) => write!(f, "dm timestamp must be positive, got {ts}"),
            Self::InvalidJwkKty => f.write_str("ephemeral JWK kty must be EC"),
            Self::InvalidJwkCrv => f.write_str("ephemeral JWK crv must be P-256"),
            Self::InvalidJwkCoordinate => f.write_str("ephemeral JWK x/y must be valid base64url"),
            Self::PrivateJwkMemberForbidden => {
                f.write_str("ephemeral JWK must not contain private members")
            }
            Self::MalformedJwk => f.write_str("ephemeral JWK must be a valid JSON object"),
            Self::InvalidIv => f.write_str("dm iv must be non-empty base64url"),
            Self::InvalidCiphertext => f.write_str("dm ct must be non-empty base64url"),
            Self::InvalidDeleteTokenPayload => {
                f.write_str("delete token iv/ct must be non-empty base64url")
            }
            Self::InvalidDeleteTokenHash => {
                f.write_str("delete token hash must be 64 lowercase hex chars")
            }
        }
    }
}

/// Public ECDH P-256 JWK carried in [`DmEnvelopeV1::eph_pub`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct P256PublicJwk {
    /// Key type; must be `"EC"`.
    pub kty: String,
    /// Named curve; must be `"P-256"`.
    pub crv: String,
    /// Base64url-encoded X coordinate.
    pub x: String,
    /// Base64url-encoded Y coordinate.
    pub y: String,
}

impl P256PublicJwk {
    /// Parses a [`JsonValue::Object`] into a validated [`P256PublicJwk`], rejecting private key members.
    pub fn from_json(value: &JsonValue) -> Result<Self, DmEnvelopeError> {
        let JsonValue::Object(entries) = value else {
            return Err(DmEnvelopeError::MalformedJwk);
        };
        if entries
            .iter()
            .any(|(k, _)| PRIVATE_JWK_MEMBERS.contains(&k.as_str()))
        {
            return Err(DmEnvelopeError::PrivateJwkMemberForbidden);
        }
        let jwk = Self {
            kty: get_str_field(entries, "kty")?,
            crv: get_str_field(entries, "crv")?,
            x: get_str_field(entries, "x")?,
            y: get_str_field(entries, "y")?,
        };
        jwk.validate()?;
        Ok(jwk)
    }

    /// Validates that this JWK represents a public EC P-256 key with valid coordinates.
    pub fn validate(&self) -> Result<(), DmEnvelopeError> {
        if self.kty != "EC" {
            return Err(DmEnvelopeError::InvalidJwkKty);
        }
        if self.crv != "P-256" {
            return Err(DmEnvelopeError::InvalidJwkCrv);
        }
        if !is_valid_base64_str(&self.x, false) || !is_valid_base64_str(&self.y, false) {
            return Err(DmEnvelopeError::InvalidJwkCoordinate);
        }
        Ok(())
    }
}

fn get_str_field(entries: &[(String, JsonValue)], name: &str) -> Result<String, DmEnvelopeError> {
    entries
        .iter()
        .rev()
        .find(|(k, _)| k == name)
        .and_then(|(_, v)| match v {
            JsonValue::Str(s) => Some(s.clone()),
            _ => None,
        })
        .ok_or(DmEnvelopeError::MalformedJwk)
}

/// Sealed PM-94 delete token embedded in [`DmEnvelopeV1::del`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteTokenEnvelope {
    /// Base64url-encoded AES-GCM IV for the delete token.
    pub iv: String,
    /// Base64url-encoded encrypted 16-byte delete token.
    pub ct: String,
    /// Lowercase SHA-256 hex digest (64 chars) verified by the relay.
    pub hash: String,
}

impl DeleteTokenEnvelope {
    /// Validates the delete token IV, ciphertext, and 64-char lowercase hex hash.
    pub fn validate(&self) -> Result<(), DmEnvelopeError> {
        if !is_valid_base64_str(&self.iv, false) || !is_valid_base64_str(&self.ct, false) {
            return Err(DmEnvelopeError::InvalidDeleteTokenPayload);
        }
        if !is_lowercase_hex_len(&self.hash, 64) {
            return Err(DmEnvelopeError::InvalidDeleteTokenHash);
        }
        Ok(())
    }
}

/// Reference DM v1 encrypted envelope matching `client/js/crypto-dm.js`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DmEnvelopeV1 {
    /// Envelope version; must equal [`DM_V1_VERSION`] (`1`).
    pub v: u8,
    /// Unique message ID (1..=[`MAX_DM_ID_LEN`] bytes).
    pub id: String,
    /// Sender route ID (non-empty).
    pub from: String,
    /// Recipient route ID (non-empty).
    pub to: String,
    /// UTC millisecond timestamp (`ts > 0`).
    pub ts: i64,
    /// Ephemeral ECDH P-256 public JWK.
    pub eph_pub: P256PublicJwk,
    /// Base64url-encoded AES-GCM IV.
    pub iv: String,
    /// Base64url-encoded AES-GCM ciphertext.
    pub ct: String,
    /// Optional sealed PM-94 delete token.
    pub del: Option<DeleteTokenEnvelope>,
}

impl DmEnvelopeV1 {
    /// Validates all structural and cryptographic invariants of a DM v1 envelope.
    pub fn validate(&self) -> Result<(), DmEnvelopeError> {
        if self.v != DM_V1_VERSION {
            return Err(DmEnvelopeError::InvalidVersion(self.v));
        }
        if self.id.trim().is_empty() || self.id.len() > MAX_DM_ID_LEN {
            return Err(DmEnvelopeError::InvalidMessageId);
        }
        if self.from.trim().is_empty() || self.to.trim().is_empty() {
            return Err(DmEnvelopeError::InvalidParticipant);
        }
        if self.ts <= 0 {
            return Err(DmEnvelopeError::InvalidTimestamp(self.ts));
        }
        self.eph_pub.validate()?;
        if !is_valid_base64_str(&self.iv, false) {
            return Err(DmEnvelopeError::InvalidIv);
        }
        if !is_valid_base64_str(&self.ct, false) {
            return Err(DmEnvelopeError::InvalidCiphertext);
        }
        if let Some(del) = &self.del {
            del.validate()?;
        }
        Ok(())
    }
}
