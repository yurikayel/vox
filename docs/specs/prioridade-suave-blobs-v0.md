# Blob soft priority v0 — spec / ADR (a ferramenta de protocolo)

> **Status:** implementada (no ar com a flag desligada por padrão, conforme o FEATURES) · **Owner:** mantenedor · **Revisado:** 2026-10-23

**Tarefa V-I09** · spike ADR (implementação em branch separada)  
**Branch de implementação prevista:** `feat/blob-soft-priority-v0`  
**Baseline:** `main` · SW `vox-pwa-v6.18-cache-manifest-wire` · **194** testes  
**Relacionado:** [espacos-digitais-infra.md](../strategy/espacos-digitais-infra.md), [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md), V-I09, V-I05 (`peers-cache-manifest.js`)

---

## 1. Problema

`requestTxFromPeers` hoje inunda BroadcastChannel + WebRTC sem lembrar **qual par** acabou de servir um `BLOB` útil. V-I05 cobre pins de manifesto (steward); falta **afinidade comportamental local** — menos latência, **sem** ranking público.

**Objetivo v0:** com flag **desligada por padrão**, opcionalmente preferir unicast `WANT` para peers RTC que serviram `BLOB` recentemente, antes do flood atual.

**Fora de escopo v0:** novo tipo gossip, scoreboard UI, campos no relay/signaling, `HAVE` discovery, alterar política de servir (`commOnly`, teto diário, wifiOnly).

---

## 2. Decisão ADR

| Item | Escolha |
|------|---------|
| Wire | Reutilizar `WANT` / `BLOB` + `fromPeer` |
| Estado | Mapa local `vox-peer-blob-affinity` (TTL, cap ~16 peers) |
| Flag | `BLOB_PEER_SOFT_PRIORITY = false` + `isBlobPeerSoftPriorityEnabled()` |
| Empilhamento | V-I05 manifest priority primeiro; affinity ordena alvos RTC na mesma fase |
| Privacidade | Só conta `BLOB` que **cumpriu WANT local** ativo (recomendado) |

---

## 3. Algoritmo (flag on)

**Inbound `BLOB`:** se `fromPeer` presente e WANT pendente resolvido → `bumpAffinity(fromPeer)`.

**`requestTxFromPeers(txId)`:** após regras V-I05, para cada `peerId` em `rankAffinity(openRtcPeerIds())`, `sendVoxMessage(peerId, WANT)` com timeout curto (400–600 ms); senão fluxo atual (broadcast → RTC flood).

Score sugerido: decaimento exponencial + cap de hits; desempate aleatório entre iguais.

---

## 4. Touchpoints

| Módulo | Mudança |
|--------|---------|
| `peers-blob-affinity.js` | **novo** — store, decay, rank, flag |
| `peers.js` | bump no `BLOB`; ordenação em `requestTxFromPeers` |
| `webrtc-peer.js` | export `listOpenRtcPeerIds()` (ou equivalente) |
| `tests/peers-blob-soft-priority.test.js` | T1–T5 |

**A ferramenta de integração pós-merge:** `sw.js`, `DEV.md`, `ARCHITECTURE.md` § resolução; **sem** UI de ranking em `render.js` v0.

---

## 5. Testes T1–T5

| ID | Cenário | Esperado |
|----|---------|----------|
| T1 | Flag off; dois peers com cache | Comportamento idêntico ao atual; sem writes de affinity |
| T2 | Flag on; `peer_a` serviu antes; ambos têm `tx2` | Primeiro WANT unicast para `peer_a` |
| T3 | Flag on; `peer_a` expirado, `peer_b` recente | Preferir `peer_b` |
| T4 | Flag on; responder no cap / fora commOnly | Não servir; requester faz fallback |
| T5 | Flag on; `BLOB` sem `fromPeer` | Sem bump; degradar para flood |

---

## 6. Por que não scoreboard?

Alinhado a “sem score público de bom nó”: evita instrumento editorial, gamificação Sybil, grafo social vazado e conflito com compliance (participação não monitorada como serviço profissional). Métricas **próprias** (`blobsServed`) permanecem.

---

## 7. Handoff ferramenta de protocolo → ferramenta de integração

1. A ferramenta de protocolo: push `feat/blob-soft-priority-v0` com módulo + T1–T5 verdes.  
2. A ferramenta de integração: merge único em `main`, bump SW, `[x] V-I09` implementação.

Ver [operacao-protocolo-integracao.md](../process/operacao-protocolo-integracao.md).

*Spike consolidado a partir de explorador V-I09 (a ferramenta de integração, 23/10).*
