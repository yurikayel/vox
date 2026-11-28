//! Thread-safe peer registry with non-blocking bounded fan-out (LAN-09 mitigation).

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, TcpStream};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, RwLock};
use std::thread;

use crate::json::JsonValue;
use crate::ws::{make_frame, OP_TEXT};

/// Default per-peer outbound frame queue capacity (`VOX_SIGNAL_MAX_OUTBOUND_QUEUE`).
pub const DEFAULT_MAX_OUTBOUND_QUEUE: usize = 256;

/// Shared immutable WebSocket frame bytes for O(1) fan-out across peers.
pub type SharedFrame = Arc<Vec<u8>>;

/// Outbound handle to a connected peer's non-blocking writer queue.
#[derive(Clone)]
pub struct PeerSender {
    tx: SyncSender<SharedFrame>,
}

impl PeerSender {
    /// Spawns a dedicated writer thread draining a bounded channel onto `stream`.
    pub fn spawn(stream: TcpStream, capacity: usize) -> Self {
        let (tx, rx) = mpsc::sync_channel::<SharedFrame>(capacity.max(1));
        let _ = thread::Builder::new()
            .name("vox-ws-writer".to_string())
            .spawn(move || writer_loop(stream, rx));
        Self { tx }
    }

    /// Enqueues a pre-encoded WebSocket frame without blocking the caller.
    ///
    /// Returns `false` if the peer disconnected or its bounded queue overflowed.
    pub fn try_send_frame(&self, frame: SharedFrame) -> bool {
        match self.tx.try_send(frame) {
            Ok(()) => true,
            Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) => false,
        }
    }

    /// Encodes a JSON value into a text WebSocket frame and enqueues it without blocking.
    pub fn send_json(&self, value: &JsonValue) -> bool {
        let raw = value.to_json_string();
        self.try_send_frame(Arc::new(make_frame(raw.as_bytes(), OP_TEXT)))
    }
}

fn writer_loop(mut stream: TcpStream, rx: Receiver<SharedFrame>) {
    while let Ok(first) = rx.recv() {
        if stream.write_all(&first).is_err() {
            break;
        }
        while let Ok(next) = rx.try_recv() {
            if stream.write_all(&next).is_err() {
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
        }
        if stream.flush().is_err() {
            break;
        }
    }
    let _ = stream.shutdown(Shutdown::Both);
}

struct PeerEntry {
    conn_id: u64,
    sender: PeerSender,
    address: String,
    dm_pub: Option<JsonValue>,
}

/// Tells whether a peer other than `peer_id` is connected and already answers for `address`.
fn address_held_by_other(peers: &HashMap<String, PeerEntry>, address: &str, peer_id: &str) -> bool {
    !address.is_empty()
        && peers
            .iter()
            .any(|(pid, entry)| pid != peer_id && entry.address == address)
}

/// Thread-safe registry of active signaling peers.
#[derive(Default)]
pub struct PeerRegistry {
    peers: RwLock<HashMap<String, PeerEntry>>,
}

impl PeerRegistry {
    /// Creates an empty peer registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the number of currently registered peers.
    pub fn peer_count(&self) -> usize {
        self.peers.read().map(|g| g.len()).unwrap_or(0)
    }

    /// Registers a peer and returns the list of peer IDs that were already connected.
    pub fn register(
        &self,
        peer_id: String,
        conn_id: u64,
        sender: PeerSender,
        address: String,
        dm_pub: Option<JsonValue>,
    ) -> Vec<String> {
        let Ok(mut guard) = self.peers.write() else {
            return Vec::new();
        };
        let existing: Vec<String> = guard.keys().cloned().collect();
        let (address, dm_pub) = if address_held_by_other(&guard, &address, &peer_id) {
            // The connected owner keeps the address and key; the newcomer still joins the room.
            guard
                .get(&peer_id)
                .map(|entry| (entry.address.clone(), entry.dm_pub.clone()))
                .unwrap_or_default()
        } else {
            (address, dm_pub)
        };
        guard.insert(
            peer_id,
            PeerEntry {
                conn_id,
                sender,
                address,
                dm_pub,
            },
        );
        existing
    }

    /// Removes `peer_id` only if it is still owned by `conn_id`.
    pub fn unregister(&self, peer_id: &str, conn_id: u64) -> bool {
        let Ok(mut guard) = self.peers.write() else {
            return false;
        };
        if guard
            .get(peer_id)
            .is_some_and(|entry| entry.conn_id == conn_id)
        {
            guard.remove(peer_id);
            return true;
        }
        false
    }

    /// Returns a cloned sender for `peer_id`, if registered.
    pub fn get_sender(&self, peer_id: &str) -> Option<PeerSender> {
        self.peers
            .read()
            .ok()
            .and_then(|guard| guard.get(peer_id).map(|e| e.sender.clone()))
    }

    /// Builds the `addressMap` JSON object excluding `exclude_peer` and empty addresses.
    pub fn address_map_json(&self, exclude_peer: &str) -> JsonValue {
        let Ok(guard) = self.peers.read() else {
            return JsonValue::Object(Vec::new());
        };
        let mut entries = Vec::new();
        for (pid, entry) in guard.iter() {
            if pid != exclude_peer && !entry.address.is_empty() {
                let info = JsonValue::Object(vec![
                    ("peerId".to_string(), JsonValue::String(pid.clone())),
                    (
                        "dmPub".to_string(),
                        entry.dm_pub.clone().unwrap_or(JsonValue::Null),
                    ),
                ]);
                entries.push((entry.address.clone(), info));
            }
        }
        JsonValue::Object(entries)
    }

    /// Broadcasts a pre-encoded WebSocket frame to all peers except `sender_id` without blocking.
    pub fn broadcast_others(&self, sender_id: &str, frame: SharedFrame) {
        let targets: Vec<PeerSender> = match self.peers.read() {
            Ok(guard) => guard
                .iter()
                .filter(|(pid, _)| pid.as_str() != sender_id)
                .map(|(_, entry)| entry.sender.clone())
                .collect(),
            Err(_) => return,
        };
        for target in targets {
            let _ = target.try_send_frame(Arc::clone(&frame));
        }
    }
}
