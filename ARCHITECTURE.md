# Arquitetura Técnica — Vox

> **Status:** canônico (protocolo e dados) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-13
> Este arquivo cobre o **protocolo e os dados**. Camadas do cliente: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Decisões em vigor: [docs/DECISOES.md](./docs/DECISOES.md).

## 1. Visão Geral e Linhagem Channel-01

O Vox é **local-first**: não existe servidor que diga o que é verdade ([DECISOES A-01](./docs/DECISOES.md)). Um post vale porque o autor o assinou (ECDSA P-256), e cada aparelho confere sozinho tudo o que recebe, por qualquer caminho ([ADR-021](./docs/adr/021-integridade-na-entrada-forma-assinada.md)). O aparelho guarda os dados e troca com outros aparelhos pela **rede de seguidores** (gossip WebRTC, sincronização por inventário e replicação do conteúdo de quem você segue, nos termos do [ADR-019](./docs/adr/019-esquecer-por-padrao-e-memoria-civica.md), [ADR-029](./docs/adr/029-midia-em-duas-camadas-360p-720p.md) e [replicacao-por-grau-v0](./docs/specs/replicacao-por-grau-v0.md)). **Diretriz atual (nov/2026): por enquanto nada deve ser salvo usando Arweave.** O Arweave continua previsto apenas para leitura de registros públicos existentes e recursos específicos futuros (como cartório cívico e memória cívica por consenso), nunca como fonte de verdade nem como destino padrão de escrita (`arweaveUpload` em `client/config/flags.json` ainda aguarda desligamento em config/código).

A parte de permaweb herda a fundação demonstrada pelo **Channel-01 (`arboard`)**:

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
1. **Client (PWA):** Todo o processamento de visualização, roteamento, validação e criptografia ocorre diretamente no navegador ou celular do usuário. JavaScript puro, sem etapa de build.
2. **Armazenamento local e rede de seguidores:** Posts, cartões de perfil, mídia e ações ficam no IndexedDB do aparelho, na forma assinada (`cache-node.js`, `post-wire.js`), e circulam entre aparelhos por gossip e por sincronização por inventário ao conectar (`peers.js`, `peer-sync.js`; [sync-inventario-v0](./docs/specs/sync-inventario-v0.md)). A preservação segue o modelo de **rede de seguidores** (você replica e serve o conteúdo de quem segue; especificação de graus em [replicacao-por-grau-v0](./docs/specs/replicacao-por-grau-v0.md), `PM-74` pendente).
3. **Memória central (opcional):** Cópia num servidor escolhido pela pessoa, que nunca é fonte de verdade: o que volta dela é conferido como qualquer outra entrada ([ADR-022](./docs/adr/022-memoria-central-por-consentimento.md)).
4. **Leitura de gateways Arweave (legado e reserva):** Para registros já existentes no Arweave e futuros recursos específicos, em vez de manter PostgreSQL/Redis centrais, o cliente pode consultar GraphQL distribuído nos nós Arweave/AR.IO (seção 2; `client/config/gateways.json`), sem proxy central.
5. **Escrita no permaweb (suspensa pela diretriz atual; reservada para recursos específicos futuros):** O cliente mantém o módulo ANS-104/Turbo (`ans104.js`, `upload.js`, assinatura RSA-PSS), porém a diretriz vigente em nov/2026 determina que **por enquanto nada seja salvo usando Arweave** (aguardando desligamento da flag `arweaveUpload` em `client/config/flags.json`).

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

### 2.6 Resolução de Handles e Identidade Amigável (Fase 5)
```graphql
query GetHandleBySlug($slug: String!) {
  transactions(
    first: 10
    tags: [
      { name: "App-Name", values: ["vox-brasil"] },
      { name: "Type", values: ["handle"] },
      { name: "Handle", values: [$slug] }
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

O Vox adota uma arquitetura em camadas para leitura de transações, reduzindo a dependência de gateways centrais e garantindo navegação rápida mesmo com conectividade intermitente. Esta seção trata do que está no Arweave; os itens que vivem só na malha não passam por gateway (seção 1, item 2):

```
┌─────────────────────────────────────────────────────────────┐
│                    Permaweb (Arweave)                       │
│        Permanência opcional (o que foi gravado lá)          │
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
4. **Resolução ICE / STUN / TURN:** O cliente utiliza servidores STUN públicos (ex: `stun:stun.l.google.com:19302`) configurados em `config/signaling.json` para travessia de NAT. Em redes com NAT simétrico corporativo restritivo, operadores podem apontar relays TURN próprios; a lista `turn` vem vazia, então hoje não há TURN.
5. **Sinalização por Nostr (em paralelo ao WebSocket):** A sinalização também trafega como eventos efêmeros (kind 25050) cifrados entre pares, por relays Nostr públicos listados em `nostrRelays` (`nostr-transport.js`, `nostr-event.js`, `nostr-signaling.js`); desligável em `nostrSignaling.enabled`. Estado real em [docs/FEATURES.md](./docs/FEATURES.md) §5.

### 3.2 Ordem de Resolução Hierárquica (`fetchTransactionData`):
1. **Cache de Memória:** Resolução em 0 ms para itens já abertos na sessão ativa.
2. **Cache Local Persistente (IndexedDB):** Consulta via `cache-node.js` com política LRU e teto de armazenamento configurável (padrão 25 MB).
3. **Vox Relay Desktop (Opcional):** Consulta a `http://127.0.0.1:3920/tx/<txId>` se o relay Python local estiver em execução.
4. **Rede de Pares (`peers.js`):**
   * *Passo A (Local):* Consulta broadcast a abas locais (timeout 600 ms).
   * *Passo B (WebRTC):* Consulta a pares remotos conectados via RTCDataChannel (timeout 2000 ms).
5. **Gateways Públicos:** Fallback aos nós de infraestrutura global (`arweave.net`, `turbo-gateway.com`).

---

## 4. Mensagens Diretas (DMs) — Criptografia E2E & Transporte Efêmero (Fase 4)

O Vox rejeita categoricamente gravar mensagens diretas na imutabilidade do permaweb (não existe `Type: dm` on-chain). Conversas privadas são estritamente efêmeras e criptografadas ponta-a-ponta:

```
                  ┌──────────────────────┐
                  │      Alice (PWA)     │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            │ [Se Bob estiver online via RTC] │ [Se Bob estiver offline]
            ▼                                 ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│ WebRTC DataChannel Dedicado│     │     Relay Comunitário     │
│       ("vox-dm-v0")       │     │     Inbox com TTL 72h     │
│   P2P Direto (Sem Relay)  │     │   (Ciphertext opaco <32KB)│
└───────────┬───────────────┘     └───────────┬───────────────┘
            │                                 │
            │                                 ▼
            │                     ┌───────────────────────────┐
            │                     │       Bob (Ao abrir)      │
            │                     │ GET /inbox/:addr & DELETE │
            ▼                     └───────────┬───────────────┘
┌─────────────────────────────────────────────▼───────────────┐
│                    Bob (Decifra Localmente)                 │
│      Abre envelope ECDH P-256 + AES-GCM no WebCrypto        │
│       Histórico salvo unicamente em IndexedDB local         │
└─────────────────────────────────────────────────────────────┘
```

1. **Geração e Publicação de Chave:**
   * Cada usuário gera localmente um par assimétrico **ECDH P-256** (`crypto-dm.js`).
   * A chave pública de recebimento é opcionalmente anunciada em uma transação pública leve (`Type: "profile-key"`, tag `Dm-Pub: "<jwk-json>"`), servindo apenas como endereço criptográfico de entrega.
2. **Criptografia por Mensagem (Forward Secrecy em Nível de Envelope):**
   * Ao enviar uma DM, o remetente gera um par ECDH efêmero e deriva uma chave de sessão simétrica AES-GCM-256 com os bytes públicos da chave do destinatário.
   * O envelope selado possui o formato: `{ v: 1, id: "<dm_id>", from, to, ts, ephPub, iv, ct }`.
   * Metadados críticos (`v1|from|to`) são vinculados via *Additional Authenticated Data* (AAD), impedindo qualquer tentativa de adulteração de rota ou falsificação de remetente.
3. **Transporte em Dois Níveis:**
   * **Online (WebRTC DataChannel):** Se o destinatário estiver conectado à malha de sinalização, a mensagem é transmitida via canal dedicado `"vox-dm-v0"` em milissegundos, sem qualquer contato com discos ou servidores.
   * **Offline (Relay Comunitário com TTL):** Se o destinatário estiver offline, o envelope cifrado é postado em `POST /inbox/:toAddress` no relay comunitário (`inbox.py`). O relay armazena apenas o JSON opaco com limite de 32 KB por mensagem e descarta o arquivo automaticamente após 72 horas (ou imediatamente quando o destinatário faz `DELETE /inbox/:toAddress/:id`).
4. **Isolamento de Banda e Armazenamento:**
   * DMs não são computadas no teto diário de banda de leitura pública do Pacto 3.1.
   * O histórico de mensagens fica armazenado estritamente no IndexedDB local do usuário (store `dm-threads`), sem persistência na nuvem do projeto.

---

## 5. Moderação Descentralizada

Como os dados na permaweb são imutáveis, a moderação ocorre na **camada de renderização (Client-Side filtering)**:
1. O dono da comunidade cria uma lista de moderadores autorizados.
2. Quando um moderador emite uma transação `{ Type: "mod-action", Action: "hide", Target: "<tx-id>" }`, o cliente Vox valida a assinatura do moderador e suprime o item da visualização do fórum.
3. Cada usuário também tem autonomia para silenciar ou bloquear autores localmente.
