//! Embedded loopback node facade and C-ABI FFI surface (ADR-039 Phase 4, PR4.4).
//!
//! Provides a safe Rust wrapper ([`EmbeddedNode`]) capable of running `signaling`,
//! `relay`, or `memoria` strictly bound to `127.0.0.1` (Cold Readiness), plus a
//! minimal `extern "C"` ABI for native hosts such as the Android `vox-populi`
//! Foreground Service (`libvox_node.so`).
//!
//! All `unsafe` operations are confined to raw C-string boundary conversions and
//! pointer reclamation, each documented with explicit `// SAFETY:` invariants.

use std::env;
use std::ffi::{c_char, CStr, CString};
use std::io;
use std::path::PathBuf;
use std::ptr;
use std::sync::{Mutex, OnceLock};

use vox_core::genesis_data::GENESIS_MS;
use vox_core::genesis_guard;

use crate::memoria::{MemoriaConfig, MemoriaServer, MemoriaServerHandle};
use crate::relay::{RelayConfig, RelayServer, RelayServerHandle};
use crate::signaling::{ServerHandle, SignalingConfig, SignalingServer};

/// Loopback-only bind host enforced for embedded nodes (Cold Readiness).
pub const EMBEDDED_LOOPBACK_HOST: &str = "127.0.0.1";

/// C-ABI return code: operation succeeded.
pub const FFI_OK: i32 = 0;
/// C-ABI return code: node was already stopped.
pub const FFI_ALREADY_STOPPED: i32 = 1;
/// C-ABI return code: invalid argument, mode, or UTF-8 string.
pub const FFI_ERR_INVALID_ARG: i32 = -1;
/// C-ABI return code: TCP bind or filesystem I/O error.
pub const FFI_ERR_IO: i32 = -2;
/// C-ABI return code: an embedded node instance is already running.
pub const FFI_ERR_ALREADY_RUNNING: i32 = -3;
/// C-ABI return code: internal synchronization lock was poisoned.
pub const FFI_ERR_LOCK: i32 = -4;

const PKG_NAME: &str = env!("CARGO_PKG_NAME");
const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");

static EMBEDDED_SLOT: OnceLock<Mutex<Option<EmbeddedNode>>> = OnceLock::new();

fn embedded_slot() -> &'static Mutex<Option<EmbeddedNode>> {
    EMBEDDED_SLOT.get_or_init(|| Mutex::new(None))
}

/// Operating mode supported by [`EmbeddedNode`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbeddedMode {
    /// WebSocket RFC 6455 signaling server + HTTP health endpoints.
    Signaling,
    /// Full local HTTP relay server (cache, inbox, blind relay, memory, P2P).
    Relay,
    /// Local Vox Memoria dashboard, memory store, and authenticated control server.
    Memoria,
}

impl EmbeddedMode {
    /// Parses a mode name (`"signaling"`, `"relay"`, or `"memoria"`).
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "signaling" => Some(Self::Signaling),
            "relay" => Some(Self::Relay),
            "memoria" => Some(Self::Memoria),
            _ => None,
        }
    }

    /// Returns the canonical lowercase mode identifier.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Signaling => "signaling",
            Self::Relay => "relay",
            Self::Memoria => "memoria",
        }
    }
}

enum RunningHandle {
    Signaling(ServerHandle),
    Relay(RelayServerHandle),
    Memoria(MemoriaServerHandle),
}

/// Safe handle to an embedded `vox-node` server running on `127.0.0.1`.
pub struct EmbeddedNode {
    mode: EmbeddedMode,
    handle: RunningHandle,
}

impl EmbeddedNode {
    /// Starts an embedded `vox-node` instance strictly bound to `127.0.0.1:<port>`.
    ///
    /// Pass `port = 0` to let the OS assign an ephemeral loopback port.
    pub fn start(mode: EmbeddedMode, port: u16, data_dir: Option<PathBuf>) -> io::Result<Self> {
        let handle = match mode {
            EmbeddedMode::Signaling => {
                let cfg = SignalingConfig {
                    host: EMBEDDED_LOOPBACK_HOST.to_string(),
                    port,
                    ..SignalingConfig::default()
                };
                RunningHandle::Signaling(SignalingServer::bind(cfg)?.spawn())
            }
            EmbeddedMode::Relay => {
                let dir =
                    data_dir.unwrap_or_else(|| env::temp_dir().join("vox-node-embedded-relay"));
                let cfg = RelayConfig {
                    host: EMBEDDED_LOOPBACK_HOST.to_string(),
                    port,
                    data_dir: dir,
                    ..RelayConfig::default()
                };
                RunningHandle::Relay(RelayServer::bind(cfg)?.spawn())
            }
            EmbeddedMode::Memoria => {
                let dir =
                    data_dir.unwrap_or_else(|| env::temp_dir().join("vox-node-embedded-memoria"));
                let cfg = MemoriaConfig {
                    host: EMBEDDED_LOOPBACK_HOST.to_string(),
                    port,
                    data_dir: dir,
                    ..MemoriaConfig::default()
                };
                RunningHandle::Memoria(MemoriaServer::bind(cfg)?.spawn())
            }
        };
        Ok(Self { mode, handle })
    }

    /// Returns the active [`EmbeddedMode`].
    pub fn mode(&self) -> EmbeddedMode {
        self.mode
    }

    /// Returns the bound loopback TCP port.
    pub fn port(&self) -> u16 {
        match &self.handle {
            RunningHandle::Signaling(h) => h.port(),
            RunningHandle::Relay(h) => h.port(),
            RunningHandle::Memoria(h) => h.port(),
        }
    }

    /// Renders a JSON health payload describing the running embedded node.
    pub fn health_json(&self) -> String {
        format_health_json(true, self.mode.as_str(), self.port())
    }

    /// Signals the background server thread to stop and waits for clean shutdown.
    pub fn stop(self) {
        match self.handle {
            RunningHandle::Signaling(h) => h.shutdown(),
            RunningHandle::Relay(h) => h.shutdown(),
            RunningHandle::Memoria(h) => h.shutdown(),
        }
    }
}

fn genesis_guard_status() -> &'static str {
    let ok = genesis_guard::is_before_genesis_ms(GENESIS_MS - 1)
        && !genesis_guard::is_before_genesis_ms(GENESIS_MS)
        && genesis_guard::refuses_post(Some("vx_ana"), None)
        && !genesis_guard::refuses_post(None, Some(GENESIS_MS))
        && genesis_guard::refuses_profile_card(Some("vx_ana"));
    if ok {
        "ok"
    } else {
        "error"
    }
}

fn format_health_json(running: bool, mode: &str, port: u16) -> String {
    let status = if running { "ok" } else { "stopped" };
    let guard = genesis_guard_status();
    format!(
        "{{\"status\":\"{status}\",\"running\":{running},\"service\":\"{PKG_NAME}\",\
         \"version\":\"{PKG_VERSION}\",\"mode\":\"{mode}\",\"host\":\"{EMBEDDED_LOOPBACK_HOST}\",\
         \"port\":{port},\"genesis_ms\":{GENESIS_MS},\"genesis_guard\":\"{guard}\"}}"
    )
}

#[allow(unsafe_code)]
unsafe fn read_optional_cstr(ptr: *const c_char) -> Result<Option<String>, i32> {
    if ptr.is_null() {
        return Ok(None);
    }
    // SAFETY: Caller guarantees `ptr` is either null (checked above) or points to a
    // valid NUL-terminated C string that remains immutable for the duration of this call.
    let text = unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map_err(|_| FFI_ERR_INVALID_ARG)?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

/// Starts the global embedded `vox-node` instance on `127.0.0.1:<port>`.
///
/// - `mode`: optional UTF-8 C string (`"signaling"`, `"relay"`, `"memoria"`); null/empty defaults to `"memoria"`.
/// - `data_dir`: optional UTF-8 C string path for relay/memoria persistence; null/empty uses a temp directory.
/// - `port`: TCP port (`0` selects an ephemeral loopback port).
///
/// Returns [`FFI_OK`] (`0`) on success, or a negative `FFI_ERR_*` code on failure.
///
/// # Safety
///
/// `mode` and `data_dir` must each be either null or a valid pointer to a NUL-terminated
/// C string that remains readable for the duration of this call.
#[no_mangle]
#[allow(unsafe_code)]
pub unsafe extern "C" fn vox_node_start(
    mode: *const c_char,
    data_dir: *const c_char,
    port: u16,
) -> i32 {
    // SAFETY: Preconditions on `mode` and `data_dir` are delegated to the caller's `# Safety` contract.
    let mode_raw = match unsafe { read_optional_cstr(mode) } {
        Ok(val) => val,
        Err(code) => return code,
    };
    let resolved_mode = match mode_raw.as_deref() {
        None => EmbeddedMode::Memoria,
        Some(name) => match EmbeddedMode::parse(name) {
            Some(parsed) => parsed,
            None => return FFI_ERR_INVALID_ARG,
        },
    };
    // SAFETY: Preconditions on `data_dir` are delegated to the caller's `# Safety` contract.
    let resolved_dir = match unsafe { read_optional_cstr(data_dir) } {
        Ok(val) => val.map(PathBuf::from),
        Err(code) => return code,
    };

    let Ok(mut guard) = embedded_slot().lock() else {
        return FFI_ERR_LOCK;
    };
    if guard.is_some() {
        return FFI_ERR_ALREADY_RUNNING;
    }
    match EmbeddedNode::start(resolved_mode, port, resolved_dir) {
        Ok(node) => {
            *guard = Some(node);
            FFI_OK
        }
        Err(_) => FFI_ERR_IO,
    }
}

/// Returns the active loopback TCP port of the embedded node, or `0` if not running.
// SAFETY: Symbol name `vox_node_port` is unique to the `vox-node` C-ABI namespace.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "C" fn vox_node_port() -> u16 {
    let Ok(guard) = embedded_slot().lock() else {
        return 0;
    };
    guard.as_ref().map_or(0, EmbeddedNode::port)
}

/// Allocates and returns a NUL-terminated JSON health string for the embedded node.
///
/// The caller owns the returned pointer and must release it with [`vox_node_free_string`].
/// Returns a null pointer only if string conversion fails unexpectedly.
// SAFETY: Symbol name `vox_node_health_json` is unique to the `vox-node` C-ABI namespace.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "C" fn vox_node_health_json() -> *mut c_char {
    let payload = match embedded_slot().lock() {
        Ok(guard) => match guard.as_ref() {
            Some(node) => node.health_json(),
            None => format_health_json(false, "none", 0),
        },
        Err(_) => format_health_json(false, "error", 0),
    };
    match CString::new(payload) {
        Ok(cstr) => cstr.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

/// Stops the running embedded node and joins its background threads.
///
/// Returns [`FFI_OK`] (`0`) if a running node was stopped, [`FFI_ALREADY_STOPPED`] (`1`)
/// if no node was active, or [`FFI_ERR_LOCK`] if the internal lock was poisoned.
// SAFETY: Symbol name `vox_node_stop` is unique to the `vox-node` C-ABI namespace.
#[no_mangle]
#[allow(unsafe_code)]
pub extern "C" fn vox_node_stop() -> i32 {
    let Ok(mut guard) = embedded_slot().lock() else {
        return FFI_ERR_LOCK;
    };
    match guard.take() {
        Some(node) => {
            node.stop();
            FFI_OK
        }
        None => FFI_ALREADY_STOPPED,
    }
}

/// Frees a NUL-terminated string previously returned by [`vox_node_health_json`].
///
/// Passing a null pointer is a safe no-op.
///
/// # Safety
///
/// `ptr` must be either null or a pointer previously returned by [`vox_node_health_json`]
/// that has not already been freed.
#[no_mangle]
#[allow(unsafe_code)]
pub unsafe extern "C" fn vox_node_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    // SAFETY: Caller guarantees `ptr` was allocated by `CString::into_raw()` in
    // `vox_node_health_json` and is freed at most once.
    drop(unsafe { CString::from_raw(ptr) });
}
