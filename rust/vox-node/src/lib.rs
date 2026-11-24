#![deny(unsafe_code)]
#![deny(missing_docs)]

//! Unified Vox node library (`vox-node`, ADR-039 Phase 4, PR4.4).
//!
//! Provides pure-`std` WebSocket RFC 6455 signaling, HTTP relay, and local
//! Vox Memoria (`--mode memoria`) servers, atomic file-backed cache (`.sha256`
//! sidecars), inbox, blind relay (RFC 0002), central memory (`vox_core::genesis_guard`)
//! and v2 vaults, in-memory P2P seeder/beacon, Host/Origin/CORS guards,
//! per-IP token bucket rate limiting, and an embedded C-ABI/FFI facade (`ffi`).

pub mod blind_store;
pub mod cache_store;
pub mod ffi;
pub mod guard;
pub mod http;
pub mod json;
pub mod limits;
pub mod memoria;
pub mod memory_store;
pub mod p2p_store;
pub mod registry;
pub mod relay;
pub mod relay_store;
mod session;
pub mod sha1;
pub mod signaling;
pub mod ws;
