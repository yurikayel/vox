#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Unified Vox node library (`vox-node`, ADR-039 Phase 4, PR4.1b).
//!
//! Provides a pure-`std` WebSocket RFC 6455 signaling server, HTTP health endpoints,
//! Host/Origin/CORS guards, and per-IP token bucket rate limiting.

pub mod guard;
pub mod http;
pub mod json;
pub mod limits;
pub mod registry;
mod session;
pub mod sha1;
pub mod signaling;
pub mod ws;
