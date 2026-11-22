#![no_std]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Zero-dependency `no_std` reference core for Vox (ADR-039 Phase 1).
//!
//! Provides pure reference implementations of:
//! - [`genesis_data`] & [`genesis_guard`]: genesis cutoff timestamp and purged test route IDs;
//! - [`shamir_gf256`]: constant-time GF(256) arithmetic and Shamir secret sharing;
//! - [`sig_format`]: v1 and v2 canonical JSON serialization for payload signing.

extern crate alloc;

pub mod genesis_data;
pub mod genesis_guard;
pub mod shamir_gf256;
pub mod sig_format;
