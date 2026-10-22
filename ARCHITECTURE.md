# Arquitetura Técnica — Vox

## 1. Visão Geral e Linhagem Channel-01

O Vox é projetado como uma aplicação **Client-First / Serverless Soberana**, herdando a fundação de arquitetura demonstrada pelo **Channel-01 (`arboard`)**:

* **Linhagem Channel-01:** O `channel-01` provou que uma interface estática de poucos kilobytes consegue carregar mídias, textos e feeds em tempo real sem servidor intermediário, consultando diretamente nós públicos de gateway Arweave/AR.IO (`turbo-gateway.com/graphql`, `arweave.net/graphql`, etc.).
* **A Extensão do Vox (De Unilateral para Bidirecional):** Enquanto o Channel-01 opera como um canal de transmissão unidirecional (um único emissor para vários leitores), o Vox transforma essa infraestrutura em um **ecossistema social comunitário bidirecional**, introduzindo esquemas de tags para criação de comunidades, tópicos encadeados, respostas públicas, filiação de membros e moderação distribuída.

```
[Channel-01 / Arboard]                  [Vox — Rede Comunitária]
Canal Unilateral                        Ecossistema Bidirecional
(1 Dono -> N Leitores)                 (Múltiplos Membros, Tópicos e Fóruns)
┌──────────────────────┐               ┌─────────────────────────────────────┐
│ Tag: App-Name        │               │ Tags: App-Name, Type (community),   │
│ Tag: Channel (UUID)  │      ───►     │       Community-Id, Topic, Reply-To,│
│                      │               │       Membership, Mod-Action        │
└──────────────────────┘               └─────────────────────────────────────┘
```

Componentes centrais:
1. **Client (PWA):** Todo o processamento de visualização, roteamento, validação e criptografia ocorre diretamente no navegador ou celular do usuário.
2. **Camada de Leitura (GraphQL aberto):** Em vez de manter instâncias de PostgreSQL/Redis, o cliente consome consultas GraphQL distribuídas fornecidas pelos nós da rede Arweave/AR.IO.
3. **Camada de Escrita (Bundler L2):** Upload de transações assinado via chave criptográfica local (Ed25519) e enviado via gateways Turbo para inclusão otimista e propagação permanente.

---

## 2. Consultas GraphQL Padronizadas

### 2.1 Listar Comunidades Recentes
```graphql
query ListCommunities($after: String) {
  transactions(
    first: 30
    after: $after
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["community"] }
    ]
    sort: HEIGHT_DESC
  ) {
    pageInfo { hasNextPage }
    edges {
      cursor
      node {
        id
        owner { address }
        tags { name value }
      }
    }
  }
}
```

### 2.2 Listar Tópicos de uma Comunidade
```graphql
query ListTopics($communityId: String!, $after: String) {
  transactions(
    first: 50
    after: $after
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["topic"] },
      { name: "Community-Id", values: [$communityId] }
    ]
    sort: HEIGHT_DESC
  ) {
    pageInfo { hasNextPage }
    edges {
      cursor
      node {
        id
        owner { address }
        tags { name value }
      }
    }
  }
}
```

### 2.3 Listar Respostas de um Tópico
```graphql
query ListReplies($topicId: String!) {
  transactions(
    first: 100
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["reply"] },
      { name: "Reply-To", values: [$topicId] }
    ]
    sort: HEIGHT_ASC
  ) {
    edges {
      node {
        id
        owner { address }
        tags { name value }
      }
    }
  }
}
```

### 2.4 Listar Membresias de um Usuário
```graphql
query ListMemberships($address: String!) {
  transactions(
    first: 50
    owners: [$address]
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["membership"] }
    ]
    sort: HEIGHT_DESC
  ) {
    edges {
      node {
        id
        tags { name value }
      }
    }
  }
}
```

### 2.5 Listar Ações de Moderação de uma Comunidade
```graphql
query ListModActions($communityId: String!) {
  transactions(
    first: 50
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["mod-action"] },
      { name: "Community-Id", values: [$communityId] }
    ]
    sort: HEIGHT_DESC
  ) {
    edges {
      node {
        id
        owner { address }
        tags { name value }
      }
    }
  }
}
```

---

## 3. Nós Participativos e Rede de Leitura Distribuída (Fases 3, 3.1 e 3.2)

O Vox adota uma arquitetura em camadas para leitura de transações, reduzindo a dependência de gateways centrais e garantindo navegação rápida mesmo com conectividade intermitente:

```
┌─────────────────────────────────────────────────────────────┐
│                    Permaweb (Arweave)                       │
│                     Fonte Canônica                          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           Gateways Públicos (AR.IO / Turbo GraphQL)         │
└──────────────┬───────────────────────────────┬──────────────┘
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│     Vox Relay Desktop       │ │   Signaling WS (3921)       │
│ Proxy Cache (127.0.0.1:3920)│ │ Troca SDP/ICE (Self-host)   │
└──────────────┬──────────────┘ └──────────────┬──────────────┘
               │                               ▼
               │                ┌─────────────────────────────┐
               │                │   WebRTC DataChannel Mesh   │
               │                │  P2P entre dispositivos     │
               ▼                └──────────────┬──────────────┘
┌──────────────────────────────────────────────▼──────────────┐
│                      Cliente Vox PWA                        │
│   Hierarquia: Memória -> IndexedDB -> Relay -> Peers -> GW  │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Protocolo `vox-peer` e WebRTC Mesh (Fase 3.2)

Entre abas e dispositivos, clientes trocam mensagens JSON simples sob o protocolo `vox-peer-v0`:
* `WANT`: Pedido de payload de uma transação específica (`{ type: "WANT", txId, fromPeer }`).
* `BLOB`: Resposta contendo o dado cacheado (`{ type: "BLOB", txId, data, fromPeer }`).
* `HAVE`: Anúncio opcional de disponibilidade de conteúdo.

**Camadas de Transporte de Pares:**
1. **Local (Mesmo Navegador):** `BroadcastChannel` nativo do navegador, sem tráfego de rede.
2. **Remota (Dispositivos Distintos):** `RTCDataChannel` ("vox-peer-v0") estabelecido ponto a ponto após sinalização.
3. **Servidor de Sinalização (`relay/signaling.py`):** WebSocket autohospedado em Python (stdlib, porta 3921) que apenas encaminha ofertas SDP e candidatos ICE sem inspecionar ou persistir mensagens.
4. **Resolução ICE / STUN / TURN:** O cliente utiliza servidores STUN públicos (ex: `stun:stun.l.google.com:19302`) configurados em `config/signaling.json` para travessia de NAT. Em redes com NAT simétrico corporativo restritivo, operadores podem apontar relays TURN próprios.

### 3.2 Ordem de Resolução Hierárquica (`fetchTransactionData`):
1. **Cache de Memória:** Resolução em 0 ms para itens já abertos na sessão ativa.
2. **Cache Local Persistente (IndexedDB):** Consulta via `cache-node.js` com política LRU e teto de armazenamento configurável (padrão 25 MB).
3. **Vox Relay Desktop (Opcional):** Consulta a `http://127.0.0.1:3920/tx/<txId>` se o relay Python local estiver em execução.
4. **Rede de Pares (`peers.js`):**
   * *Passo A (Local):* Consulta broadcast a abas locais (timeout 600 ms).
   * *Passo B (WebRTC):* Consulta a pares remotos conectados via RTCDataChannel (timeout 2000 ms).
5. **Gateways Públicos:** Fallback aos nós de infraestrutura global (`arweave.net`, `turbo-gateway.com`).

---

## 4. Mensagens Diretas (DMs) — Criptografia (Fase 4)

As mensagens diretas não passam por servidor em texto aberto:
* Cada usuário possui um par de chaves assimétricas de troca de chave (ECDH P-256 ou X25519) gerado no navegador via `window.crypto.subtle`.
* O remetente obtém a chave pública do destinatário (anunciada no perfil).
* O segredo compartilhado deriva uma chave simétrica AES-GCM-256.
* O conteúdo da mensagem cifrado é enviado com a tag `Type: "dm"` e `Recipient: "<endereço-publico>"`.
* Somente o detentor da chave privada correspondente consegue decifrar o payload ao baixar a transação.

---

## 5. Moderação Descentralizada

Como os dados na permaweb são imutáveis, a moderação ocorre na **camada de renderização (Client-Side filtering)**:
1. O dono da comunidade cria uma lista de moderadores autorizados.
2. Quando um moderador emite uma transação `{ Type: "mod-action", Action: "hide", Target: "<tx-id>" }`, o cliente Vox valida a assinatura do moderador e suprime o item da visualização do fórum.
3. Cada usuário também tem autonomia para silenciar ou bloquear autores localmente.
