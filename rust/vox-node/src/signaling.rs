//! WebSocket signaling server (`--mode signaling`) with HTTP health endpoints.

use std::env;
use std::io;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::guard::GuardPolicy;
use crate::http::DEFAULT_HANDSHAKE_TIMEOUT;
use crate::limits::{ConnectionSlots, LimitsConfig, SignalingLimiter};
use crate::registry::{PeerRegistry, DEFAULT_MAX_OUTBOUND_QUEUE};
use crate::session::handle_connection;
use crate::ws::DEFAULT_FRAME_TIMEOUT;

/// Default listen host in signaling mode (`0.0.0.0`, matching `relay/signaling.py`).
pub const DEFAULT_SIGNALING_HOST: &str = "0.0.0.0";
/// Default listen port in signaling mode (`3921`, matching `relay/signaling.py`).
pub const DEFAULT_SIGNALING_PORT: u16 = 3921;

/// Runtime configuration for the signaling server.
#[derive(Debug, Clone)]
pub struct SignalingConfig {
    /// Interface address to bind (e.g. `"127.0.0.1"` or `"0.0.0.0"`).
    pub host: String,
    /// TCP port to bind (`0` selects an ephemeral OS port).
    pub port: u16,
    /// Total deadline for receiving the HTTP handshake request.
    pub handshake_timeout: Duration,
    /// Deadline for receiving the remainder of a WebSocket frame after its 2-byte header.
    pub frame_timeout: Duration,
    /// Bounded outbound queue depth per peer.
    pub max_outbound_queue: usize,
    /// Host/Origin/CORS security policy.
    pub guard: GuardPolicy,
    /// Rate-limiting and connection-cap configuration.
    pub limits: LimitsConfig,
}

impl Default for SignalingConfig {
    fn default() -> Self {
        Self {
            host: DEFAULT_SIGNALING_HOST.to_string(),
            port: DEFAULT_SIGNALING_PORT,
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
            frame_timeout: DEFAULT_FRAME_TIMEOUT,
            max_outbound_queue: DEFAULT_MAX_OUTBOUND_QUEUE,
            guard: GuardPolicy::default(),
            limits: LimitsConfig::default(),
        }
    }
}

impl SignalingConfig {
    /// Builds a configuration from environment variables with optional host/port overrides.
    pub fn from_env(host_override: Option<String>, port_override: Option<u16>) -> Self {
        let host = host_override
            .or_else(|| env::var("HOST").ok().filter(|s| !s.trim().is_empty()))
            .unwrap_or_else(|| DEFAULT_SIGNALING_HOST.to_string());
        let port = port_override
            .or_else(|| {
                env::var("PORT")
                    .ok()
                    .and_then(|s| s.trim().parse::<u16>().ok())
            })
            .unwrap_or(DEFAULT_SIGNALING_PORT);
        let max_outbound_queue = env::var("VOX_SIGNAL_MAX_OUTBOUND_QUEUE")
            .ok()
            .and_then(|s| s.trim().parse::<usize>().ok())
            .filter(|&n| n > 0)
            .unwrap_or(DEFAULT_MAX_OUTBOUND_QUEUE);
        Self {
            host,
            port,
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
            frame_timeout: DEFAULT_FRAME_TIMEOUT,
            max_outbound_queue,
            guard: GuardPolicy::from_env(),
            limits: LimitsConfig::from_env(),
        }
    }
}

pub(crate) struct ServerContext {
    pub(crate) config: SignalingConfig,
    pub(crate) registry: PeerRegistry,
    pub(crate) limiter: SignalingLimiter,
    pub(crate) slots: ConnectionSlots,
    pub(crate) next_conn_id: AtomicU64,
}

/// Running signaling server bound to a local TCP socket.
pub struct SignalingServer {
    listener: TcpListener,
    local_addr: SocketAddr,
    ctx: Arc<ServerContext>,
    stop: Arc<AtomicBool>,
}

/// Handle to a background signaling server thread with graceful stop support.
pub struct ServerHandle {
    local_addr: SocketAddr,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl ServerHandle {
    /// Returns the actual bound socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Returns the actual bound TCP port.
    pub fn port(&self) -> u16 {
        self.local_addr.port()
    }

    /// Signals the accept loop to stop and joins the server thread.
    pub fn shutdown(mut self) {
        self.stop_inner();
    }

    fn stop_inner(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.local_addr);
        if let Some(handle) = self.join.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop_inner();
    }
}

impl SignalingServer {
    /// Binds a TCP listener for the signaling server using `config`.
    pub fn bind(config: SignalingConfig) -> io::Result<Self> {
        let listener = TcpListener::bind((config.host.as_str(), config.port))?;
        let local_addr = listener.local_addr()?;
        let slots = ConnectionSlots::new(config.limits.max_connections);
        let limiter = SignalingLimiter::new(config.limits);
        let ctx = Arc::new(ServerContext {
            config,
            registry: PeerRegistry::new(),
            limiter,
            slots,
            next_conn_id: AtomicU64::new(1),
        });
        Ok(Self {
            listener,
            local_addr,
            ctx,
            stop: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Returns the bound local socket address.
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Runs the blocking accept loop until stopped.
    pub fn serve_forever(self) {
        for incoming in self.listener.incoming() {
            if self.stop.load(Ordering::Acquire) {
                break;
            }
            let Ok(stream) = incoming else {
                continue;
            };
            let Some(slot_guard) = self.ctx.slots.try_acquire() else {
                drop(stream);
                continue;
            };
            let peer_addr = stream.peer_addr().ok();
            let ctx = Arc::clone(&self.ctx);
            let _ = thread::Builder::new()
                .name("vox-ws-conn".to_string())
                .spawn(move || {
                    let _guard = slot_guard;
                    handle_connection(stream, peer_addr, &ctx);
                });
        }
    }

    /// Spawns the accept loop on a background thread and returns a [`ServerHandle`].
    pub fn spawn(self) -> ServerHandle {
        let local_addr = self.local_addr;
        let stop = Arc::clone(&self.stop);
        let join = thread::Builder::new()
            .name("vox-signal-accept".to_string())
            .spawn(move || self.serve_forever())
            .ok();
        ServerHandle {
            local_addr,
            stop,
            join,
        }
    }
}
