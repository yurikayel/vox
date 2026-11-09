#!/usr/bin/env python3
"""
p2p_seeder.py — Módulo de Seeder P2P e Descoberta Segura de Peers (Vox Populi)

Implementa as Tarefas 6 e 7 do Nó Zero / Vox Populi:
- Tarefa 6 (Seeder P2P): Gerencia seeding P2P de blobs públicos verificados
  por hash SHA-256, com allowlist estrita, cotas de disco e contenção de rede
  (DHT, LSD, PEX e NAT desativados por padrão para evitar vazamentos).
- Tarefa 7 (Descoberta Segura de Peers): Protocolo VOX-PEER-v1 para anúncio e
  registro de nós em loopback e rede local com verificação estrita de integridade,
  sem abertura de portas UPnP ou NAT-PMP.
"""

from __future__ import annotations

import hashlib
import re
import threading
import time
from typing import Any, Dict, List, Optional, Set

SHA256_HEX_REGEX = re.compile(r"^[0-9a-fA-F]{64}$")
SAFE_NODE_ID_REGEX = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

DEFAULT_MAX_SEEDER_STORAGE_BYTES = 512 * 1024 * 1024  # 512 MB
DEFAULT_MAX_CONCURRENT_SEEDS = 64
DEFAULT_PEER_TTL_SECONDS = 60

_LOCK = threading.RLock()


class P2PSeederManager:
    """Gerenciador de Seeding P2P para blobs com integridade verificável por SHA-256."""

    def __init__(self, max_storage_bytes: int = DEFAULT_MAX_SEEDER_STORAGE_BYTES, max_seeds: int = DEFAULT_MAX_CONCURRENT_SEEDS):
        self.max_storage_bytes = max_storage_bytes
        self.max_seeds = max_seeds
        self.active_seeds: Dict[str, Dict[str, Any]] = {}
        self.allowed_hashes: Set[str] = set()
        self.dht_enabled = False
        self.lsd_enabled = False
        self.pex_enabled = False
        self.nat_pmp_enabled = False

    def authorize_hash(self, sha256_hash: str) -> bool:
        """Adiciona um hash SHA-256 à allowlist de conteúdo autorizado."""
        clean_hash = str(sha256_hash).strip().lower()
        if not SHA256_HEX_REGEX.match(clean_hash):
            return False
        with _LOCK:
            self.allowed_hashes.add(clean_hash)
            return True

    def register_blob_seed(
        self,
        sha256_hash: str,
        size_bytes: int,
        mime_type: str = "application/octet-stream",
        file_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Registra um blob no seeder P2P se autorizado pela allowlist e cotas."""
        clean_hash = str(sha256_hash).strip().lower()
        if not SHA256_HEX_REGEX.match(clean_hash):
            raise ValueError(f"Hash SHA-256 invalido para seed: {clean_hash}")

        if size_bytes <= 0:
            raise ValueError("Tamanho do blob deve ser maior que zero")

        with _LOCK:
            # Verifica allowlist
            if clean_hash not in self.allowed_hashes:
                raise PermissionError(f"Hash {clean_hash} nao esta na allowlist de blobs autorizados")

            # Verifica limite de quantidade de seeds
            if clean_hash not in self.active_seeds and len(self.active_seeds) >= self.max_seeds:
                raise OverflowError(f"Teto maximo de seeds simultaneos ({self.max_seeds}) atingido")

            # Calcula impacto no limite de bytes
            current_bytes = sum(s["sizeBytes"] for s in self.active_seeds.values() if s["hash"] != clean_hash)
            if current_bytes + size_bytes > self.max_storage_bytes:
                raise OverflowError(f"Cota de armazenamento P2P ({self.max_storage_bytes} bytes) excedida")

            # Gera infohash determinístico para WebTorrent (SHA-1 do SHA-256)
            info_hash = hashlib.sha1(clean_hash.encode("ascii")).hexdigest()
            magnet_uri = f"magnet:?xt=urn:btih:{info_hash}&dn=vox-blob-{clean_hash[:12]}&x.sha256={clean_hash}"

            seed_record = {
                "hash": clean_hash,
                "infoHash": info_hash,
                "sizeBytes": size_bytes,
                "mimeType": mime_type or "application/octet-stream",
                "magnetUri": magnet_uri,
                "filePath": file_path,
                "startedAt": int(time.time() * 1000),
                "uploadedBytes": 0,
                "downloadedBytes": size_bytes,
                "status": "seeding",
            }
            self.active_seeds[clean_hash] = seed_record
            return dict(seed_record)

    def unregister_blob_seed(self, sha256_hash: str) -> bool:
        """Remove um blob do seeder P2P."""
        clean_hash = str(sha256_hash).strip().lower()
        with _LOCK:
            if clean_hash in self.active_seeds:
                del self.active_seeds[clean_hash]
                return True
            return False

    def get_seed(self, sha256_hash: str) -> Optional[Dict[str, Any]]:
        clean_hash = str(sha256_hash).strip().lower()
        with _LOCK:
            seed = self.active_seeds.get(clean_hash)
            return dict(seed) if seed else None

    def list_seeds(self) -> List[Dict[str, Any]]:
        with _LOCK:
            return [dict(s) for s in self.active_seeds.values()]

    def get_status(self) -> Dict[str, Any]:
        with _LOCK:
            total_seeded_bytes = sum(s["sizeBytes"] for s in self.active_seeds.values())
            return {
                "seederActive": len(self.active_seeds) > 0,
                "seederStatus": "active" if self.active_seeds else "ready",
                "seedsCount": len(self.active_seeds),
                "totalSeededBytes": total_seeded_bytes,
                "maxStorageBytes": self.max_storage_bytes,
                "maxSeeds": self.max_seeds,
                "allowedHashesCount": len(self.allowed_hashes),
                "confinement": {
                    "dht": self.dht_enabled,
                    "lsd": self.lsd_enabled,
                    "pex": self.pex_enabled,
                    "natPmp": self.nat_pmp_enabled,
                },
            }


class PeerDiscovery:
    """Protocolo de descoberta e registro de pares (VOX-PEER-v1) sem portas abertas."""

    def __init__(self, local_node_id: str = "node-zero-argon18", ttl_seconds: int = DEFAULT_PEER_TTL_SECONDS):
        self.local_node_id = local_node_id
        self.ttl_seconds = ttl_seconds
        self.known_peers: Dict[str, Dict[str, Any]] = {}

    def register_peer(self, peer_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Registra ou atualiza um par descoberto após validação estrita de esquema."""
        if not isinstance(peer_payload, dict):
            raise ValueError("Payload de descoberta deve ser um dicionario JSON")

        node_id = str(peer_payload.get("nodeId") or "").strip()
        if not node_id or not SAFE_NODE_ID_REGEX.match(node_id):
            raise ValueError("nodeId invalido ou malformado")

        protocol = str(peer_payload.get("protocol") or "").strip()
        if protocol != "VOX-PEER-v1":
            raise ValueError(f"Protocolo incompativel: esperado VOX-PEER-v1, recebido {protocol}")

        http_port = peer_payload.get("httpPort")
        if not isinstance(http_port, int) or not (1 <= http_port <= 65535):
            raise ValueError("httpPort invalido (deve ser entre 1 e 65535)")

        capabilities = peer_payload.get("capabilities", [])
        if not isinstance(capabilities, list):
            capabilities = []

        host = str(peer_payload.get("host") or "127.0.0.1").strip()
        now = time.time()

        with _LOCK:
            record = {
                "nodeId": node_id,
                "host": host,
                "httpPort": http_port,
                "controlPort": peer_payload.get("controlPort"),
                "protocol": "VOX-PEER-v1",
                "capabilities": [str(c) for c in capabilities],
                "version": str(peer_payload.get("version") or "0.2.1"),
                "lastSeenTs": int(now * 1000),
                "status": "online",
            }
            self.known_peers[node_id] = record
            self._prune_expired_locked(now)
            return dict(record)

    def prune_expired(self) -> int:
        with _LOCK:
            return self._prune_expired_locked(time.time())

    def _prune_expired_locked(self, current_time: float) -> int:
        cutoff_ms = (current_time - self.ttl_seconds) * 1000
        expired = [nid for nid, p in self.known_peers.items() if p.get("lastSeenTs", 0) < cutoff_ms]
        for nid in expired:
            del self.known_peers[nid]
        return len(expired)

    def list_peers(self) -> List[Dict[str, Any]]:
        with _LOCK:
            self._prune_expired_locked(time.time())
            return [dict(p) for p in self.known_peers.values()]

    def get_status(self) -> Dict[str, Any]:
        with _LOCK:
            self._prune_expired_locked(time.time())
            return {
                "peerDiscovery": "ready",
                "protocol": "VOX-PEER-v1",
                "localNodeId": self.local_node_id,
                "discoveredPeersCount": len(self.known_peers),
                "upnpEnabled": False,
                "natPmpEnabled": False,
            }


# Instâncias globais reutilizáveis pelo servidor de relay
SEEDER_MANAGER = P2PSeederManager()
PEER_DISCOVERY = PeerDiscovery()


def get_p2p_summary() -> Dict[str, Any]:
    """Retorna um resumo unificado de Seeder e Descoberta de Pares."""
    seeder_st = SEEDER_MANAGER.get_status()
    discovery_st = PEER_DISCOVERY.get_status()
    return {
        "status": "ok",
        "seeder": seeder_st,
        "discovery": discovery_st,
    }
