#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Unified Vox node library (`vox-node`, ADR-039 Phase 4, PR4.2b).
//!
//! Provides pure-`std` WebSocket RFC 6455 signaling and HTTP relay servers,
//! atomic file-backed cache (`.sha256` sidecars), inbox, blind relay (RFC 0002),
//! central memory (`vox_core::genesis_guard`) and v2 vaults, in-memory P2P
//! seeder/beacon, Host/Origin/CORS guards, and per-IP token bucket rate limiting.

pub mod blind_store;
pub mod cache_store;
pub mod guard;
pub mod http;
pub mod json;
pub mod limits;
pub mod memory_store;
pub mod p2p_store;
pub mod registry;
pub mod relay;
pub mod relay_store;
mod session;
pub mod sha1;
pub mod signaling;
pub mod ws;
