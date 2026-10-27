# Vox — rede social cívica no permaweb

## O que é

O **Vox** é uma rede social **livre e de código aberto (FOSS)** pensada para **comunidades primeiro** — fóruns, membros no perfil e uma praça pública de descoberta, no espírito útil do Orkut. Sua **identidade e chaves ficam no aparelho**; posts públicos podem ser publicados no **permaweb** (Arweave) e replicados por **malha entre vizinhos** (cache local, relay opcional, peers na mesma rede).

É para **coletivos e grupos brasileiros** que querem conversa com profundidade, moderação local e transparência sobre onde os dados circulam. **Este repositório** é o código, a documentação e os testes — **não** é uma empresa, **não** hospeda sua comunidade por você e **não** substitui facilitadores humanos no piloto.

## A proposta

Plataformas fechadas concentram regras opacas, risco de apagão de contas e feeds que substituem a **praça** por engajamento solitário. Fediverso e instâncias próprias empurram **custo de servidor** para voluntários; P2P puro esbarra em NAT e operação frágil no celular.

Não somos um clone soberano em datacenter central (Modelo A) nem exigimos que voluntários paguem VPS para manter instâncias (Modelo B). Somos **local-first (Modelo C)**: praça cronológica sem ranking opaco, chaves no aparelho, leitura de backup via gateways públicos e estratégia POSSE para onde as pessoas já conversam (WhatsApp, redes). Pontes governamentais e de dados públicos (Modelo D) ficam para depois do piloto humano — ver [docs/campo-debate-aberto-ndp-2026-10.md](./docs/campo-debate-aberto-ndp-2026-10.md) e [POSITIONING.md](./POSITIONING.md).

O Vox combina um **cliente estático** (PWA) com **leitura via gateways** da rede Arweave/Turbo quando a malha local não tem o blob — gateways são **leitura reserva**, não um “backend Vox” central. Você publica onde controla (incluindo **POSSE**: ecoar para outras redes com Web Share / intents, sem prender o original). Quem participa pode **contribuir com cache** (Pacto Vox, com limites e opt-out); **stewards** podem rodar relay/sinalização **opcional e comunitário**. Métricas no app são **estimativas locais** — não há ranking público de nós nem promessa de “imunidade” regulatória.

A demo pública ([GitHub Pages](https://yurikayel.github.io/vox/)) é um **shell estático** útil para testar; espelhos adicionais seguem [docs/ops-shell-mirrors.md](./docs/ops-shell-mirrors.md).

## Metodologia

Construímos em camadas verificáveis:

- **Cliente serverless, vanilla, sem build de produção** — HTML, CSS e ES modules em [`client/`](./client/); `npm` só para **lint e testes** na raiz.
- **Checklist vivo único** no [dossiê §3.6](./docs/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25) (N=25); inventário e DoD detalhado em [docs/inventario-estado-e-tarefas-documentacao-2026-11.md](./docs/inventario-estado-e-tarefas-documentacao-2026-11.md).
- **Definition of Done** por tipo: `doc`, `code`, `ops-humano` — ver [docs/CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md).
- **Mantenedor do repo = revisor de código**, não VPS da comunidade nem suporte 1:1 — ver [docs/antigravity-estrategia-mantenedor-revisor-2026.md](./docs/antigravity-estrategia-mantenedor-revisor-2026.md).
- **Piloto humano (V-P09) antes de escalar P2**; quando o piloto abre, **feature freeze** ([CODE-01](./docs/dossie-geral-inventario-master-breakdown-2026-11.md)) — só hotfix e documentação entram em `main`.

Porta de entrada da documentação: **[docs/README.md](./docs/README.md)**. Testadores: [https://yurikayel.github.io/vox/#/ajuda/teste](https://yurikayel.github.io/vox/#/ajuda/teste) e convite em [docs/teste-aberto-convite.md](./docs/teste-aberto-convite.md).

## Características open source

| Aspecto | Como funciona neste repo |
|--------|---------------------------|
| **Licença** | [MIT](./LICENSE) |
| **Runtime do PWA** | Vanilla no navegador — **sem** dependência npm em produção |
| **Testes** | **385** (`362` JS + `23` Python) — `npm test` na raiz |
| **Relay / inbox** | Python sem dependências externas em [`relay/`](./relay/) |
| **Bugs de teste** | Issue **[tester] Bug report** ([`.github/ISSUE_TEMPLATE/bug-tester.yml`](./.github/ISSUE_TEMPLATE/bug-tester.yml)) |
| **Docs** | Norma [docs/CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md); **GitHub = fonte de verdade** (a [Voxpedia](https://yurikayel.github.io/vox/#/voxpedia) no app explica; desenvolvimento e release line ficam aqui) |
| **Governança & BR** | [GOVERNANCE.md](./GOVERNANCE.md) · [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) |

**Rodar localmente** (porta **8080**, não 8765):

```bash
cd client
python -m http.server 8080
```

Abra `http://127.0.0.1:8080/` — módulos ES exigem HTTP, não `file://`.

**Validar alterações:** na raiz do repo, `npm test` (contagens canônicas em [docs/release-metadata.json](./docs/release-metadata.json)).

Proposta longa para compartilhar: **[docs/proposta-vox.html](./docs/proposta-vox.html)**

### Experimente o PWA

Demo: **[https://yurikayel.github.io/vox/](https://yurikayel.github.io/vox/)** — PWA instalável, tour com personas demo e rota **[#/ajuda/teste](https://yurikayel.github.io/vox/#/ajuda/teste)** para quem testa sem ser dev. Após deploy, use **hard refresh** (`Ctrl+Shift+R`) se o service worker não atualizar.

### Linha de release (orgânico)

| Campo | Valor |
|-------|--------|
| **SHA** | `8cb5440` |
| **Branch** | `main` |
| **Testes** | **385** (`362` JS + `23` Python) — `npm test` na raiz |
| **Service worker** | `vox-pwa-v6.87-quarantine-local` |
| **Deploy** | Push em `main` → GitHub Pages; após deploy use **hard refresh** (`Ctrl+Shift+R`) para trocar o SW |

Malha: gossip **`CACHE_MANIFEST`** + prioridade **WANT**; feira **Classificados** com ofertas assinadas, status/retratação na malha ([`listing-ui.js`](./client/js/listing-ui.js)). Seed steward: [`docs/steward-seed-15min.md`](./docs/steward-seed-15min.md).

---

## 🎯 Por que o Vox existe?

No modelo atual da internet, a comunicação cívica brasileira está refém de corporações centralizadas: risco de apagão de contas, morte das comunidades orgânicas em prol de feeds algorítmicos opacos e dependência de infraestruturas fora do país. O **Vox** adota a filosofia do **Pix**: protocolo público, leve e aberto, com chaves no aparelho e soberania comunitária.

* **Vs. Bluesky (PBC):** Sem serviços centrais de busca e indexação (*AppViews*) em empresa privada; múltiplos gateways neutros distribuídos e leitura de reserva.
* **Vs. Mastodon (Fediverso):** Sem custo mensal de VPS sobrecarregando mantenedores nem confusão de "escolha de instâncias"; cliente estático no-build servido via Pages/espelhos.
* **Vs. P2P puro móvel:** Sem exigir que celulares em redes 4G atuem como seeders 24/7 (inviabilizado pelo CGNAT e consumo de franquia no Brasil).

*(Diagnóstico comparativo completo e lições aprendidas em [LESSONS.md](./LESSONS.md) e [POSITIONING.md](./POSITIONING.md).)*

---

## 🏛️ Os Três Pilares do Vox

1. **Comunidades Primeiro (Estilo Orkut):** Fóruns por tópicos com respostas encadeadas, descoberta pública sem algoritmo manipulativo, membros no perfil e moderação local via `mod-action` client-side ([GOVERNANCE.md](./GOVERNANCE.md)).
2. **Soberania Serverless (Permaweb / GraphQL):** Zero servidores centrais de aplicação; leitura via GraphQL aberto em gateways Arweave/AR.IO (`turbo-gateway.com`, `arweave.net`) e chaves criptográficas Ed25519 no dispositivo ([IDENTITY.md](./IDENTITY.md)).
3. **Ponte, não Ilha (Crossposting POSSE):** O post canônico permanente é salvo no Vox e despachado com 1 toque para WhatsApp, Instagram, TikTok e X via Web Share API nativa e web intents ([docs/rfc/0001-posse-export.md](./docs/rfc/0001-posse-export.md)).

---

## ⚙️ Arquitetura Técnica do MVP

```
┌─────────────────────────────────────────────────────────────┐
│                 Vox Web Client (PWA Ultraleve)              │
│       HTML5 + CSS Minimalista + Vanilla JS (< 50 KB)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
        [Leitura Pública]               [Escrita & DMs]
               │                               │
               ▼                               ▼
      Gateways Descentralizados       Assinatura Local
        (AR.IO / Turbo GraphQL)        (WebCrypto no Aparelho)
               │                               │
               ▼                               ▼
    Consultas de Comunidades/Posts     Turbo Bundler (L2 Arweave)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                       Permaweb (Arweave)
```

### Esquema de Tags (Sem Banco de Dados)
Todo dado no Vox é identificado por tags semânticas universais:

| Ação | Tag `Type` | Tags Adicionais |
|---|---|---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` |
| **Entrar em Comunidade** | `membership` | `Community-Id` |
| **Criar Tópico** | `topic` | `Community-Id`, `Topic-Title` |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) |
| **Moderação** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` |
| **Chave de DM** | `profile-key` | `Dm-Pub` (Chave pública ECDH JWK; conversas privadas trafegam fora do permaweb) |
| **Reivindicar Handle** | `handle` | `Handle` (slug `[a-z0-9-]{3,24}`), `Owner-Addr` |

---

## 🗺️ Roadmap de Execução

- [x] **Fase 0: Concepção & Arquitetura**
  - Definição da estratégia de soberania digital sem servidor central.
  - Adoção do modelo Permaweb + Turbo Gateway.
- [x] **Fase 1: MVP do Fórum & Leitura (A Rua + Comunidades)**
  - Cliente PWA em [`client/`](./client/) — comunidades, tópicos e respostas via GraphQL (`App-Name: vox-brasil`).
  - Interface nostálgica e limpa (estilo Orkut moderno); demo offline se gateway falhar.
- [x] **Fase 2: Autoria, Chaves & Ponte de Crossposting**
  - Carteira Arweave JWK local (`wallet.js`) com geração e importação.
  - Upload de transações (`upload.js`) para comunidades, tópicos e respostas.
  - Leitura de corpo de transações com cache de dados (`graphql.js: fetchTransactionData`).
  - Botão de compartilhamento Web Share API + fallback de área de transferência (`share.js`).
  - Perfil de membro com listagem de comunidades seguidas (`membership`).
  - Governança distribuída via transações `mod-action` com supressão client-side (`moderation.js`).
  - Guia de testes e faucet em [`client/DEV.md`](./client/DEV.md).
  - *Critério de Sucesso (DoD atingido):* Criação de tópicos assinados, leitura via GraphQL e compartilhamento em < 30s sem backend próprio.
- [x] **Fase 3: Nós Participativos & Espelhos Locais**
  - Cache persistente IndexedDB com política LRU (`cache-node.js`).
  - Protocolo peer `vox-peer` v0 com mensagens `WANT`/`BLOB` via BroadcastChannel (`peers.js`).
  - Interface de configuração de rede distribuída e métricas em `#/settings/network`.
  - Servidor desktop local de cache e espelho em Python sem dependências (`vox/relay/`).
  - *Critério de Sucesso (DoD atingido):* Resolução em cascata (Cache -> Relay -> Peer -> Gateway) acelerando leitura e suportando navegação offline.
- [x] **Fase 3.1: Rede Distribuída por Padrão (Pacto Vox)**
  - Participação distribuída ativa por padrão com contrato transparente na 1ª abertura (Modal Pacto Vox).
  - Inversão de valor: soberania de chaves e dados ↔ cache local cooperativo sem servidores centrais.
  - Salvaguardas rigorosas: teto diário de banda (padrão 50 MB/dia), limite de cache (25 MB) e priorização Wi-Fi.
  - Suporte a Service Worker (`sw.js`) para relay em background com notificação visível no sistema operacional.
  - Direito incondicional de opt-out preservado em `#/settings/network` ("Pausar contribuição").
- [x] **Fase 3.2: Conectividade entre Dispositivos (WebRTC Mesh)**
  - Protocolo `vox-peer-v0` estendido para conexões diretas entre dispositivos via `RTCDataChannel` (`webrtc-peer.js`).
  - Servidor de sinalização WebSocket leve em Python stdlib (`relay/signaling.py`, porta 3921), opcional e autohospedado.
  - Configuração de STUN e sinalização comunitária (`config/signaling.json` e campo customizado na UI).
  - Integração às salvaguardas do Pacto 3.1: teto de 50 MB/dia, salvaguarda de Wi-Fi e opt-out.
  - Cascata completa: Memória -> IndexedDB -> Relay Desktop -> Broadcast -> WebRTC -> Gateways.
- [x] **Fase 3.3: Deploy Público, Signaling WSS & TURN Comunitário**
  - Pipelines GitHub Actions para CI multiplataforma (`.github/workflows/ci.yml`) e deploy estático no GitHub Pages (`.github/workflows/deploy-pages.yml`).
  - Suporte completo a servidores TURN no cliente (`createRtcConfig`, `saveCustomTurnConfig`) e na UI (`#/settings/network`) para travessia de 4G/NAT simétrico.
  - Kit de deploy self-host em Docker (`relay/deploy/docker-compose.yml`) com Caddy (WSS TLS automático) e Coturn blindado contra SSRF/abuso.
- [x] **Fase 4: Mensagens Diretas Efêmeras (WebRTC + Inbox TTL)**
  - Criptografia ponta-a-ponta com WebCrypto API (ECDH P-256 com chave efêmera + AES-GCM-256 e AAD) em `crypto-dm.js`.
  - **Proibição estrita on-chain:** nenhuma mensagem privada gravada na imutabilidade do Arweave.
  - Canal dedicado WebRTC `"vox-dm-v0"` para entrega online P2P direta sem servidores.
  - Inbox efêmero com TTL de 72h em `relay/inbox.py` (`POST /inbox/:toAddress`, `GET` e `DELETE`) para mensagens offline.
  - Histórico de conversas gravado exclusivamente no IndexedDB local do usuário (`dm-threads`).
  - Interface completa com rotas `#/dm` e `#/dm/:address`, e botão de mensagem direta no perfil de membros.
  - *Critério de Sucesso (DoD atingido):* Troca de mensagens E2E entre Alice e Bob online via WebRTC, e entrega assíncrona com auto-expiração via relay inbox quando offline.
- [x] **Fase 5: Handles Amigáveis & Resolução (@handle + DNS Comunitário)**
  - Identidade mnemônica `@handle` registrada on-chain via transações `Type: handle` (`handles.js`).
  - Resolução no PWA via rotas `#/h/:slug` e `#/u/@slug` apontando para o perfil do proprietário.
  - Detecção e interface de desambiguação transparente para **conflitos de handle** sem tribunal central.
  - Suporte a CNAME comunitário e wildcard DNS (`docs/DNS-HANDLES.md` e `client/redirect.html`).
  - ArNS documentado como evolução futura (Fase 5.1).
  - *Critério de Sucesso (DoD atingido):* Reivindicação de `@slug`, resolução direta no PWA e navegação via query `?h=slug`.

---

## 📚 Documentação

| Arquivo | Conteúdo |
|---------|----------|
| [LESSONS.md](./LESSONS.md) | **Diagnóstico comparativo (Varanda, Bluesky, Mastodon, Channel-01, Pix) e matriz 5×5** |
| [POSITIONING.md](./POSITIONING.md) | Posicionamento, honestidade permaweb e metáfora Pix |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Linhagem Channel-01, GraphQL, tags e fluxos técnicos |
| [GOVERNANCE.md](./GOVERNANCE.md) | Moderação `mod-action` client-side e espelhos comunitários |
| [IDENTITY.md](./IDENTITY.md) | Ed25519, Passkeys e fases de identidade |
| [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) | LGPD, Marco Civil Art. 19 e notas regulatórias |
| [client/DEV.md](./client/DEV.md) | Guia do desenvolvedor: carteira Arweave local, faucets e testes |
| [relay/README.md](./relay/README.md) | Guia do Vox Relay Desktop: cache proxy local em Python |
| [relay/deploy/README.md](./relay/deploy/README.md) | Guia de Deploy VPS: Signaling WSS (Caddy) + TURN Comunitário (Coturn) |
| [docs/DNS-HANDLES.md](./docs/DNS-HANDLES.md) | Guia de Identidade Amigável, CNAME Comunitário e DNS Wildcard |
| [docs/governance-proposta-feira-pin-template.md](./docs/governance-proposta-feira-pin-template.md) | Modelo de proposta: feira comunitária + recomendação não vinculante de espelho leve (V-I07) |
| [docs/antigravity-operating.md](./docs/antigravity-operating.md) | Contrato operacional Antigravity × Cursor (malha P2P, gossip, integração em `main`) |
| [docs/proposta-vox.html](./docs/proposta-vox.html) | Página explicativa completa: proposta, economia distribuída e sustentabilidade |

### 🚀 Pipelines de CI/CD (GitHub Actions)

O repositório possui automação contínua configurada em `.github/workflows/`:
* **CI — Testes & Validação (`.github/workflows/ci.yml`):** Matriz multiplataforma com Node.js (22, 24) e Python (3.11, 3.12) executando verificação de sintaxe, suíte completa de **385** testes e auditoria de segurança contra vazamento de chaves privadas.
* **Deploy PWA — GitHub Pages (`.github/workflows/deploy-pages.yml`):** Publicação contínua da pasta `client/` no GitHub Pages com suporte a HTTPS nativo e PWA instalável a cada push na branch `main`.

---

## 🤝 Como Contribuir

O Vox é mantido pela boa vontade de desenvolvedores, designers e entusiastas brasileiros da soberania digital.

* Código aberto sob licença MIT.
* Princípio de projeto: **Menor esforço, maior impacto**. Zero inchaço algorítmico, sem dependência de Big Techs.

### Desenvolvimento (branches)

* A branch **`main`** permanece **sempre publicável** — o [GitHub Pages](https://yurikayel.github.io/vox/) publica a cada push em `main`.
* **Novas features e correções:** atualize `main` (`git pull`), crie branch (`git checkout -b feat/nome-curto` ou `fix/...`) e trabalhe nela.
* **Integração:** envie a branch (`git push -u origin feat/...`) e abra PR, ou faça merge quando estiver pronto — sem commits diretos em `main` para trabalho de feature (humano ou agente).
* Hotfix urgente em produção: branch `fix/...` ou `hotfix/...`, mesmo fluxo.
