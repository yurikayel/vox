# ADR-006: Hardening do Protocolo de Identidade P2P, WebRTC e Cache de Respostas

**Status:** accepted · **V-HARDENING**

## Contexto

Com a expansão da topologia WebRTC para nós distribuídos (Render, Hugging Face, Deno Deploy Edge) e a circulação de envelopes de gossip no cliente PWA, identificou-se a necessidade de:
1. Prevenir vazamento de conexões WebRTC lentas ou caídas (`ICE failed/disconnected`).
2. Blindar o processamento de envelopes de sinalização RFC 6455 contra flood e frames excessivos no nó Python e Deno.
3. Proteger a recepção de cartões de perfil (`PROFILE_CARD_HELLO`) e mensagens `BLOB` contra injeção de payload e corrupção de memória.
4. Otimizar a agregação contínua de respostas em `getReplyCountsMap` via cache indexado em memória para evitar gargalo de I/O em IndexedDB no feed.

## Decisão

- **WebRTC Lifecycle:** Introduzido timeout de negociação de 15 segundos (`NEGOTIATION_TIMEOUT_MS`) e listener `onconnectionstatechange` com encerramento automático em estados `failed`, `closed` e `disconnected`. Todos os event handlers (`onopen`, `onmessage`, `onerror`, `onclose`, `onicecandidate`) são desalocados explicitamente em `closePeerConnection`.
- **Validação Defensiva de Envelopes:** Envelopes `PROFILE_CARD_HELLO` são limitados a 64 KB (`MAX_PROFILE_CARD_SIZE`), verificados com chave pública ECDSA P-256 e validados contra moderação prévia. IDs de transação em `WANT` e `BLOB` são estritamente validados contra a regex `^[a-zA-Z0-9_-]{3,128}$`.
- **Memoização com Invalidação Reativa:** A função `getReplyCountsMap` em `client/js/cache-node.js` utiliza cache em memória invalidado automaticamente por `saveLocalPost`, `deleteLocalPost` e `clearLocalPosts`.
- **Segurança de Sinalização RFC 6455:** O relay Python impõe `MAX_WS_FRAME_SIZE = 1024 * 1024` (1 MB) e `MAX_HEADER_SIZE = 64 * 1024` (64 KB). O nó Deno Edge implementa limpeza de sockets mortos (`cleanupPeer`) tanto no fechamento quanto na falha de broadcast local.
- **Resiliência do Service Worker:** O identificador `CACHE_NAME = "vox-pwa-v7.16-real-network-audio-video-upload"` permanece inviolado como single source of truth para retrocompatibilidade do shell offline.

## Segurança e Resiliência

- **Anti-DDoS P2P:** Frames maliciosos com tamanhos declarados anômalos são rejeitados no nível do frame reader sem alocação prévia de buffer.
- **Anti-Memory Leak:** Remoção estrita de referências circulares em mapas de peers remotos e canais RTCDataChannel.
- **Integridade Local:** O cache em memória de contagem de respostas é derivado estritamente de dados assinados persistidos no IndexedDB local.

## Consequências

- Módulos endurecidos: `client/js/webrtc-peer.js`, `client/js/peers.js`, `client/js/cache-node.js`, `relay/signaling.py`, `relay/deno-signaling.js`.
- Redução significativa do tempo de renderização do feed e estabilização de conexões em redes móveis instáveis.
