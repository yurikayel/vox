#![no_std]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Zero-dependency `no_std` reference core for Vox (ADR-039 Phase 1).
//!
//! Provides pure reference implementations of:
//! - [`genesis_data`] & [`genesis_guard`]: genesis cutoff timestamp and purged test route IDs;
//! - [`shamir_gf256`]: constant-time GF(256) arithmetic and Shamir secret sharing;
//! - [`sig_format`]: v1 and v2 canonical JSON serialization for payload signing;
//! - [`vault_v2`]: closed Vault v2 record format and KDF validation (PM-90 / ADR-036);
//! - [`dm_envelope_v1`]: DM v1 encrypted envelope, P-256 public JWK, and delete token types;
//! - [`community_manifest_v1`]: Community Manifest v1 schema and invariants (ADR-038).

extern crate alloc;

pub mod community_manifest_v1;
pub mod dm_envelope_v1;
pub mod genesis_data;
pub mod genesis_guard;
pub mod shamir_gf256;
pub mod sig_format;
pub mod vault_v2;
