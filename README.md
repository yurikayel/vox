# 🇧🇷 Vox — A Voz Soberana da Rede

> **Poste uma vez. Pertença a comunidades reais. Ecoe em todas as redes.**  
> O Vox é uma iniciativa de rede social aberta, leve e descentralizada, desenhada para devolver a soberania digital e o controle do conteúdo às mãos dos brasileiros — sem dependência de Big Techs, sem servidores centrais para pagar e com foco em comunidades no estilo Orkut.

👉 **[Leia a Proposta Completa & Arquitetura de Sustentabilidade](./docs/proposta-vox.html)** (Página explicativa standalone para abrir no celular ou compartilhar no WhatsApp)

### Experimente o PWA

Demo ao vivo: **[https://yurikayel.github.io/vox/](https://yurikayel.github.io/vox/)**. Cliente **FOSS vanilla** (HTML, CSS e JavaScript nativo, *no-build*, sem runtime npm — `npm test` só roda a suíte local).

Na primeira visita, a **Porta da Cantina** é a ilustração anime (`client/images/cantina-gate.jpg`) com o gag no estilo Wuher em **dois balões pintados na arte** (*"Seus bots tem que esperar lá fora!"* e *"Aqui não servimos esse tipo."*). Não há H2 "Porta da Cantina", quote duplicada, subtítulo itálico nem balão HTML/CSS por cima da imagem — só a arte e *Entrar — sou humano*.

No feed, o layout é **híbrido**: texto estilo **X** (caption antes da toolbar), foto **4:5 full-bleed** estilo **IG**, bloco **README/diff** estilo **GitHub** quando aplicável — canvas `--bg` unificado (sem cards cinza no feed/perfil/comentários), abas underline, stories + **composer inline** na mesma janela (Postar com foto opcional). **Comentários abrem no próprio card**. Tour com **10 personas**, Open Frames (enquetes, abaixo-assinado, CLT). Cache PWA: ver `CACHE_NAME` em [`client/sw.js`](./client/sw.js).

### Linha de release (orgânico)

| Campo | Valor |
|-------|--------|
| **SHA** | `8217d18` |
| **Branch** | `main` |
| **Testes** | **355** (`333` JS + `22` Python) — `npm test` na raiz |
| **Service worker** | `vox-pwa-v6.83-steward-kit-v-i08` |
| **Deploy** | Push em `main` → GitHub Pages; após deploy use **hard refresh** (`Ctrl+Shift+R`) para trocar o SW |

Malha: gossip **`CACHE_MANIFEST`** + prioridade **WANT**; feira **Classificados** com ofertas assinadas, status/retratação na malha ([`listing-ui.js`](./client/js/listing-ui.js)). Seed steward: [`docs/steward-seed-15min.md`](./docs/steward-seed-15min.md).

---

## 🎯 Por que o Vox existe?

No modelo atual da internet, a comunicação de mais de 200 milhões de brasileiros está refém de um punhado de corporações estrangeiras:
1. **Risco de Apagão e Censura:** Contas bloqueadas arbitrariamente, algoritmos opacos que sufocam o alcance e a vulnerabilidade constante de ficar sem seus laços sociais caso uma plataforma estrangeira seja suspensa ou mude de dono.
2. **Dependência de Falsas Alternativas:** Redes alternativas comerciais mantêm infraestruturas centralizadas fora do país e respondem a interesses de investidores estrangeiros.
3. **Morte das Comunidades Reais:** O modelo de feed infinito individualizado sufocou a convivência comunitária orgânica que o Brasil dominava na era do Orkut.

O **Vox** adota o espírito do **Pix**: uma infraestrutura pública, descentralizada e aberta, onde você é dono da sua identidade e do seu conteúdo.

### Por que não Bluesky / Mastodon / P2P puro?
* **Sem dependência da Bluesky PBC:** O Bluesky centraliza seus serviços de busca e indexação (*AppViews*) em uma empresa privada sediada nos EUA. O Vox utiliza múltiplos gateways neutros distribuídos.
* **Sem o custo de VPS do Mastodon:** O Fediverso sobrecarrega administradores voluntários com contas mensais de servidor e confunde o usuário final com a "escolha de instâncias". O Vox é 100% serverless para os mantenedores.
* **Sem a fragilidade P2P do Varanda:** Dispensamos a necessidade de celulares atuarem como servidores de rede (*seeders*) e os bloqueios crônicos de NAT/CGNAT em redes móveis brasileiras.

*(Diagnóstico comparativo completo, matriz 5×5 e lições aprendidas em [LESSONS.md](./LESSONS.md))*

---

## 🏛️ Os Três Pilares do Vox (O Sweet Spot)

### 1. Comunidades Primeiro (Estilo Orkut)
* **Fóruns por Tópicos:** Discussões organizadas por assunto com tópicos e respostas encadeadas, resgatando a profundidade das conversas.
* **A Rua (Descoberta Pública):** A visualização global que permite descobrir o que está sendo debatido em todas as comunidades abertas, sem algoritmos de recomendação manipulativos.
* **Membros no Perfil:** As comunidades às quais você pertence definem a sua identidade e seus interesses no seu perfil.
* **Moderação Distribuída:** Os criadores e moderadores filtram abusos localmente via transações assinadas (`mod-action`), sem depender de comitês centrais.

### 2. Soberania Serverless (Permaweb / GraphQL)
* **Zero Servidores Centrais:** O Vox não possui backend Node, Python ou banco de dados que voluntários precisam bancar.
* **Linhagem Channel-01:** Aproveita a arquitetura comprovada de leitura via GraphQL aberto em gateways da rede Arweave/AR.IO (`turbo-gateway.com`, `arweave.net`), expandindo o canal estático para um ecossistema social bidirecional.
* **Sua Chave é Você:** Identidade criptográfica local no dispositivo (Ed25519; detalhes em [IDENTITY.md](./IDENTITY.md)).

### 3. Ponte, não Ilha (Crossposting)
* O Vox não exige que seus contatos abandonem outras plataformas para você ter voz.
* O post original assinado fica salvo perenemente no controle do usuário.
* Com **1 toque**, o app despacha o conteúdo para **WhatsApp, Instagram, TikTok e X** através da Web Share API nativa e web intents.

*(Mensagens Diretas E2E permanecem planejadas para a **Fase 3** após consolidação do protocolo de comunidades)*

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

### Rodar o PWA localmente

```bash
cd client
python -m http.server 8080
```

Abra `http://127.0.0.1:8080/` (módulos ES exigem servidor HTTP local, não `file://`).

### Executar os Testes Unitários Locais

```bash
npm test
# ou no Windows:
.\test.bat
```
Executa a suíte de **187 testes** (173 JS via `node:test` e 14 Python via `unittest`).

### 🚀 Pipelines de CI/CD (GitHub Actions)

O repositório possui automação contínua configurada em `.github/workflows/`:
* **CI — Testes & Validação (`.github/workflows/ci.yml`):** Matriz multiplataforma com Node.js (22, 24) e Python (3.11, 3.12) executando verificação de sintaxe, suíte completa de 187 testes e auditoria de segurança contra vazamento de chaves privadas.
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
