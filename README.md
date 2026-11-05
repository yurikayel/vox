# Vox — Rede Cívica de Participação Popular

[![Client](https://img.shields.io/badge/PWA-Vanilla%20ES%20Modules-orange.svg)](./client)
[![Identity](https://img.shields.io/badge/Identity-WebCrypto%20P--256-blueviolet.svg)](./client/js/local-account.js)
[![Storage](https://img.shields.io/badge/Storage-Arweave%20Permaweb-black.svg)](https://arweave.org)
[![Tests](https://img.shields.io/badge/Tests-751%20passing%20(677%20JS%20%2B%2074%20Py)-brightgreen.svg)](./tests)
[![Service Worker](https://img.shields.io/badge/SW-v7.20--real--network--audio--video--upload-informational.svg)](./client/sw.js)

O Vox é um projeto cívico em construção para ampliar a participação popular e a autonomia das comunidades na vida digital. Sua ambição é ser um bem comum aberto: o projeto deve permanecer transparente, copiável, modificável e maior que qualquer fundador, mantenedor, empresa ou plataforma.

Essa é uma direção e um compromisso, não uma descrição de governança já concluída. O desenvolvimento começou com uma pessoa; hoje o controle administrativo do repositório ainda está concentrado. O próprio Vox precisa construir formas públicas de contribuição, revisão, sucessão e custódia compartilhada para que ninguém tenha poder permanente e unilateral sobre o projeto.

O cliente é um PWA local-first. Identidade e chaves são criadas no aparelho; publicações públicas podem ser ancoradas no Arweave e lidas por gateways. Durante as fases Alpha e Beta, a rede também conta com suporte opcional ao nó de persistência local **`zero-central-memory`** (`VoxPopuli-ZeroMemory.exe` / `relay/central_memory.py`) para preservar histórico, perfis e blobs multimídia entre reinicializações. O projeto documenta capacidades reais e limitações conhecidas; propostas não são anunciadas como funcionalidades prontas.

> 📥 **Central de Downloads (Multiplataforma):** [https://yurikayel.github.io/vox/download](https://yurikayel.github.io/vox/download)  
> 🌐 **Aplicação Web (PWA Oficial):** [https://yurikayel.github.io/vox/](https://yurikayel.github.io/vox/)  
> 🧪 **Guia para Testadores:** [#/ajuda/teste](https://yurikayel.github.io/vox/#/ajuda/teste)  
> 📚 **Índice Mestre de Documentação:** [docs/README.md](./docs/README.md)  
> 📋 **Plano Mestre & Checklist Vivo:** [dossiê N=25 §3.6](./docs/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25)

---

## 📥 Central de Downloads e Matriz de Plataformas

Acesse a página visual interativa em **[https://yurikayel.github.io/vox/download](https://yurikayel.github.io/vox/download)** ou obtenha os pacotes diretamente abaixo.

O ecossistema é estritamente dividido em papéis complementares ([ADR-011](docs/adr/011-taxonomia-tripartite-produtos-vox.md)):
- **`vox` (Cliente):** Para quem quer **só usar a rede e fim**. Interface cívica, composição de mensagens (texto, áudio e vídeo), enquetes, votações populares, diretório unificado de pessoas e mensagens ponto a ponto criptografadas sem precisar entender de técnica ou servidores.
- **`vox populi` (Nó de Apoio):** Para quem quiser **colaborar ativamente com a infraestrutura**. Opera em segundo plano mantendo cache seguro (SHA-256) e provendo relay cego local (`blind_relay.py`), sem interface gráfica pesada e sem telemetria.
- **`VoxPopuli-ZeroMemory.exe` (Nó de Memória Central Dev Alpha/Beta — Modo 3):** Executável nativo ultraleve (*170 KB*, C#/.NET 4.x zero-deps) em *System Tray* para sustentar a memória da rede durante Alpha/Beta com **WAL em disco `< 0,2 ms`**, **Batch Snapshot a cada 2s**, **Delta Sync**, **Túnel HTTPS Cloudflare automático** e **Signaling Beacon** via `wss://vox-sentinel.onrender.com`.
- **⚡ Efeito Boost Local:** Abrir cliente e nó no mesmo computador conecta automaticamente o cliente em loopback HTTP (`127.0.0.1:3920` / `127.0.0.1:3921`), acelerando a renderização e sincronizando o estado local sem consumir franquia de internet.

### Matriz de Distribuição e Suporte aos 4 Sistemas Operacionais

| Sistema Operacional | Papel: `vox` (Cliente Cívico) | Papel: `vox populi` (Nó de Apoio Comunitário) | Como Funciona Sob o Capô |
|:---|:---|:---|:---|
| **1. Microsoft Windows**<br>(10 / 11) | [**`Vox.exe`**](client/downloads/Vox.exe) *(967 KiB)* | [**`VoxPopuli.exe`**](client/downloads/VoxPopuli.exe) *(11.7 MB)*<br>`tools/zero-central-memory-windows/` *(170 KB)* | **Cliente:** Executável nativo com runtime WebView2 já presente no Windows (sem empacotar o Chromium/Electron; consome ~40 MB RAM em medições locais).<br>**Nó:** Serviço sem janela com ícone na bandeja (*System Tray*), operando relay local HTTP (`:3920` / `:3921`), cache criptográfico e memória central persistente (Modo 3). |
| **2. Google Android**<br>(5.0+) | [**`vox.apk`**](client/downloads/vox.apk) *(74 KiB)* | [**`vox-populi.apk`**](client/downloads/vox-populi.apk) *(74 KiB)* | **Cliente (`org.vox.client`):** Micro-APK leve instalável via sideload direto. Roda a PWA em tela cheia via WebView do Android com aceleração gráfica.<br>**Nó (`org.vox.populi`):** Projetado para celulares ligados na tomada em Wi-Fi. Foreground service silencioso mantendo a malha viva 24/7 sem gastar dados móveis. |
| **3. GNU/Linux & Pi**<br>(x86_64, ARM64, SBC) | [**Guia Linux WebKitGTK**](tools/desktop-linux/) *(< 30 KiB)* | [**Guia Daemon systemd**](vox-populi/) *(daemon)* | **Cliente:** Lançador leve integrando com WebKitGTK nativo do GNOME/KDE.<br>**Nó:** Daemon de baixo consumo (~15 MB RAM em repouso) empacotado para `systemd`, ideal para Raspberry Pi (3, 4, 5, Zero 2W) e servidores domésticos. |
| **4. Apple**<br>(iOS / iPadOS & macOS) | [**Abrir Safari PWA**](https://vox-9df.pages.dev/) *(PWA)* | [**Guia macOS launchd**](tools/node-macos/) *(launchd)* | **Cliente (iOS):** Adicione à *Tela de Início* no Safari (*Compartilhar* &rarr; *Tela de Início*). Ganha contêiner isolado, **fica isento da limpeza de 7 dias do Safari (ITP)** e expande a quota de armazenamento para até 60% do disco.<br>**Nó (macOS):** Serviço de segundo plano via `launchd` para Mac Mini ou MacBooks como nó doméstico. |

---

## 🏛️ Visão: VOX POPULI

VOX POPULI — a voz do povo — é o propósito político do projeto: pessoas e comunidades devem poder participar, propor, contestar, construir e manter os espaços digitais que usam. O Vox não fala em nome do povo e não substitui organização, deliberação ou decisão humana.

Redes centralizadas, instâncias federadas e protocolos locais têm custos, vantagens e formas diferentes de organização. O Vox busca contribuir com uma alternativa local-first, aberta e comunitária; não trata outros projetos ou seus participantes como inferiores ou superados.

### As Três Lógicas de Rede

| Modelo | Como costuma funcionar | Trade-offs | O que o Vox busca oferecer |
|:---|:---|:---|:---|
| **Plataformas centralizadas** | Uma empresa opera serviço, identidade e distribuição. | Pode oferecer conveniência e alcance; também concentra dados, regras e continuidade no operador. | O Vox busca limitar dependência de um serviço central e manter código, formatos e dados públicos auditáveis. |
| **Serviços federados** | Servidores independentes se comunicam por protocolos compartilhados. | Distribuem operação, mas cada instância precisa de administração, recursos e regras próprias. | O Vox pode aprender e interoperar; não afirma substituir ou superar o Fediverso. |
| **Protocolos e clientes locais** | Dados, chaves e operação podem ser distribuídos entre aparelhos, gateways e operadores comunitários. | A autonomia depende da implementação, da disponibilidade dos pares e da capacidade de manter o software. | O Vox prioriza uso local, exportação de dados, participação comunitária e infraestrutura substituível. |

*(Diagnóstico comparativo aprofundado em [LESSONS.md](./LESSONS.md) e [POSITIONING.md](./POSITIONING.md).)*

---

## ⚡ Compromissos fundamentais

1. **Participação popular:** pessoas podem usar, propor, contestar e contribuir. Uma chave criptográfica identifica uma conta; não comprova que cada conta corresponde a uma pessoa única e não deve ser apresentada como prova de “uma pessoa, um voto”.
2. **Regras e decisões legíveis:** código, protocolos e mudanças devem ter histórico público e justificativas acessíveis. Votos em uma comunidade dizem respeito às regras daquela comunidade; não equivalem, por si só, à governança do repositório Vox.
3. **Sem alcance comprado:** o projeto não deve vender visibilidade nem ocultar critérios de ordenação. O feed e seus filtros devem ser explicáveis e controláveis por quem usa o cliente.
4. **Autonomia e portabilidade:** o PWA guarda dados locais e permite exportar credenciais e dados compatíveis. Gateway, relay ou hospedagem são dependências substituíveis quando a implementação permitir; não prometemos disponibilidade permanente nem operação sem infraestrutura.
5. **Código aberto e transparência:** nenhuma funcionalidade planejada deve ser descrita como pronta. Mudanças, limitações, falhas conhecidas e decisões precisam poder ser examinadas publicamente.

---

## 📊 Releases e validação

O histórico Git, a configuração de CI e [docs/release-metadata.json](./docs/release-metadata.json) são as referências para releases. Os metadados descrevem uma release registrada; não representam automaticamente o branch de trabalho, alterações locais ou o estado do deploy neste instante. Consulte os resultados da CI associados ao commit antes de tratar um build como validado.

O Service Worker pode manter uma versão anterior do cliente em cache. Depois de uma atualização, recarregue a página; se a versão não mudar, faça uma atualização forçada (`Ctrl+Shift+R`).

---

## 📦 Arquitetura dos Produtos: Vox (Cliente) e Vox Populi (Nó Dedicado)

Para garantir clareza entre o uso cotidiano pelas pessoas e a sustentação técnica por operadores comunitários, o ecossistema organiza-se em dois papéis complementares ([ADR-011](docs/adr/011-taxonomia-tripartite-produtos-vox.md)):

1. **Vox (Cliente):** Aplicativo voltado à pessoa usuária e à deliberação cívica. Disponível em Desktop (`Vox.exe`) e Android (`vox.apk`, `org.vox.client`), com PWA em tela cheia, navegação rápida, composição cívica e detecção de nó local para ativação automática de **boost**.
2. **Vox Populi (Nó Dedicado):** Serviço de infraestrutura comunitária de baixo consumo. Disponível em Windows (`VoxPopuli.exe`), Android (`vox-populi.apk`, `org.vox.populi`) e Linux (`vox-populi/`), operando relay HTTP em loopback (`127.0.0.1:3920`), cache SHA-256 e controle de recursos (com sinalização WebRTC opcional em `ws://127.0.0.1:3921`).
3. **Sinergia do Boost:** Abrir ambos potencializa a experiência: o cliente se conecta ao nó dedicado local em `127.0.0.1:3920`, acelerando o carregamento via cache local verificado e ativando o modo de alta prontidão.

---

## ⚙️ Arquitetura do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Vox Web Client (PWA Ultraleve < 50 KB)               │
│             Vanilla HTML5 + CSS Moderno + ES Modules Nativos           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
           [Leitura]                         [Autoria]
                    │                                │
                    ▼                                ▼
       Cascata de Leitura Híbrida:              Assinatura Criptográfica:
     1. Memória RAM / IndexedDB              • Identidade: ECDSA P-256 (vx_…)
     2. Cache local / peers quando disponíveis • Permaweb: Carteira Arweave JWK
     3. Relay HTTP local opcional              • Mensagens Privadas: ECDH P-256
     4. Gateways públicos Arweave                      │
                    │                                ▼
                    ▼                    Bundler Arweave / Turbo
            Gateways públicos e independentes         │
          (AR.IO / Turbo GraphQL)                    │
                    │                                │
                    └────────────────┬───────────────┘
                                     ▼
                  Arweave (dados públicos permanentes)
```

Este diagrama resume caminhos existentes do cliente, não garante descoberta global ou conexão entre quaisquer dois usuários. O Nó Zero atual escuta apenas em loopback; acesso LAN, descoberta automática e WebTorrent seeding não estão disponíveis.

### Esquema de tags e dados públicos

Os objetos públicos usam transações com tags semânticas. O cliente também mantém estado local em IndexedDB e outros armazenamentos do navegador; portanto, nem todo estado é uma transação pública. Não há um banco SQL global que opere o Vox.

| Ação | Tag `Type` | Tags Complementares Chave | Finalidade |
|:---|:---|:---|:---|
| **Criar Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` | Funda um espaço público de debate |
| **Adesão a Membro** | `membership` | `Community-Id` | Registra vínculo comunitário no perfil |
| **Publicar Tópico** | `topic` | `Community-Id`, `Topic-Title` | Abre uma nova discussão no fórum |
| **Responder Tópico** | `reply` | `Community-Id`, `Reply-To` (TX ID) | Adiciona resposta em árvore encadeada |
| **Ação de moderação comunitária** | `mod-action` | `Community-Id`, `Action` (hide/ban), `Target` | Filtro interpretado pelo cliente conforme as regras da comunidade |
| **Chave de DM** | `profile-key` | `Dm-Pub` (JWK pública P-256) | Habilita recebimento de mensagens diretas |
| **Handle Cívico** | `handle` | `Handle` (`[a-z0-9-]{3,24}`), `Owner-Addr` | Mnemônico `@slug` sem cartório central |
| **Proposta comunitária** | `governance-proposal` | `Community-Id`, `Proposal-Id`, `Diff` | Proposta de alteração das regras daquela comunidade |

---

## 🛠️ Capacidades implementadas e laboratório

O estado varia entre cliente, navegador e versão. A lista abaixo não é uma certificação de segurança, disponibilidade contínua ou funcionamento entre quaisquer dois hosts. Consulte a documentação vinculada e os testes do commit antes de depender de um recurso.

* **Fórum Cívico Oficial e Comunidades (Espírito Orkut):** A comunidade canônica `"vox"` atua como ágora central e fórum oficial de deliberação, issues abertas e governança transparente, inscrevendo novos participantes por padrão no onboarding mas garantindo o direito soberano de sair (`leave`) ou retornar (`join`) a qualquer momento.
* **Moderação Comunitária & Bumping de Fórum:** Suporte fail-closed estrito para moderadores fixarem tópicos no topo (`📌 Fixado`), trancarem discussões encerradas (`🔒 Encerrado`), reordenação dinâmica por atividade recente (`max(topic.ts, lastReplyTs)`) e busca instantânea de tópicos.
* **Recuperação Zero-Knowledge de Identidade & Sincronização Cross-Device ([ADR-014](./docs/adr/014-zero-knowledge-vault-recuperacao-soberana.md)):** Restauração canônica determinística do perfil (`routeId`, chave privada P-256 e chaves de DM) em qualquer navegador ou celular via cofre cifrado no cliente (PBKDF2 50k iters + AES-GCM-256) ancorado em Google (`sub`), Meta (`profile.id`) ou **Senha Soberana** (sem Big Tech). Sincronização instantânea entre computadores e celulares via rota segura `#/sync?p=...` e QR Code nativo sem digitação manual.
* **Áudio e Vídeo Nativos Lo-Fi (Walkie-Talkie & Vídeo Curto):** Gravação direta pelo navegador em 1 toque (toggle iniciar/parar) ou anexo de arquivo para posts e comentários, com compressão WebM/Opus e MP4/WebM $\le 320\text{p}$ (`media-lofi.js`), deduplicação por hash SHA-256 (`media-blob.js`) e replicação P2P/memória central.
* **Diretório Unificado de Pessoas (`#/people`) & Onboarding Direto:** Lista determinística completa de todas as contas cadastradas na rede com filtro em tempo real, entrada direta de nome/apelido no onboarding (sem obrigatoriedade de OAuth) e sincronização automática via `PROFILE_CARD` e `zero-central-memory`.
* **Nó Local `zero-central-memory` Modo 3 (`VoxPopuli-ZeroMemory.exe` / `central_memory.py`):** Persistência local em disco com journal append-only (`< 0,2 ms`), snapshot atômico em lote a cada 2s, delta sync incremental (`clientRevision`/`since`), túnel HTTPS Cloudflare integrado e descoberta zero-config via *Signaling Beacon* (`vx_zero_memory_beacon`).
* **Disparo Multi-Rede Assistido (`EXPLODE!`):** Publicação simultânea assistida de tópicos para X/Twitter, Bluesky, Threads, WhatsApp e Telegram, acompanhada de userscript opcional (`tools/auto-explode/vox-auto-explode.user.js`) para confirmação em 1 toque.
* **Chrome Compacto de Foto & Interações Sociais:** Header enxuto sobre mídia, **Notas de Perfil 24h** (`profile-note.js`), **Republicar** com citação honesta sem impulsionamento (`repost-draft.js` / `repost-cite.js`), aba **Salvos** (bookmarks locais) e **Marcação Manual em Fotos** por coordenada (`x%/y%` em `photo-tag-pins.js`, estritamente sem reconhecimento facial).
* **Cartuchos Cívicos Webxdc & Cintura Fina ([ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)):** Execução de mini-apps em `iframe` com sandbox estrito (CSP rede-zero) sincronizados por CRDT determinístico (`webxdc-crdt.js`) sobre o envelope canônico `vox-identity.js`.
* **Classificados / Feira Comunitária:** Ofertas locais assinadas com gossip de manifesto de cache (`CACHE_MANIFEST`), prioridade `WANT` e suporte a retratação na malha.
* **Mensagens Diretas E2E (WebRTC + Inbox TTL):** Criptografia ponta-a-ponta no navegador (`ECDH P-256` + `AES-GCM-256`). Mensagens privadas trafegam fora do permaweb; quando o par está offline, podem passar pelo relay transitório, que usa TTL padrão de 72 horas.
* **Cofre Multi-Identidade & Exportação (`.voxid`):** Alternância rápida entre múltiplas contas locais (`vox-accounts-vault-v1`) e export/import de credenciais com suporte a envelope criptografado com senha mestra (`.voxid` via PBKDF2 + AES-GCM-256).
* **Wipe Local de Emergência (T05):** Purga imediata de chaves locais, `localStorage`, caches e bases IndexedDB no aparelho (`local-wipe.js`), com aviso transparente sobre dados já ancorados no permaweb ou replicados em outros pares.
* **Quarentena pessoal de conteúdo:** Marcador local para ocultar publicações e evitar seu compartilhamento neste dispositivo; não remove conteúdo da rede nem impõe uma decisão a outras pessoas.
* **QR Code Canônico Vanilla (`qr-url.js`):** Gerador nativo de QR codes para links de tópicos, comunidades e convites, sem dependências externas de npm.
* **Laboratório M-de-N (`#/labs/mofn`):** Especificação ([ADR-005](./docs/adr/005-collective-profile-m-of-n.md)) e simulador experimental de multi-assinatura; não é o controle de governança do repositório nem uma carteira de produção.

---

## 🚀 Começando em 30 Segundos

### 1. Rodar o Cliente PWA Localmente

O cliente é 100% estático (no-build). Não requer `webpack`, `vite` ou compilação:

```bash
cd client
python -m http.server 8080
```
Acesse `http://127.0.0.1:8080/` no navegador. *(Módulos ES exigem protocolo HTTP/HTTPS, não abrindo via `file://`)*.

### 2. Executar a Suíte Completa de Testes

Na raiz do repositório:

```bash
npm test
```
Executa as suítes atuais de JavaScript (677 testes) e Python (74 testes), totalizando **751 testes automatizados**.

### 3. Rodar o Relay / Memória Central Doméstica (Opcional)

Para operadores que desejam apoiar a malha como *stewards* ou sustentar persistência local durante Alpha/Beta:

```bash
cd relay
python server.py
```
Ou, no Windows, execute **`dist/VoxPopuli-ZeroMemory.exe`** (ícone na bandeja do sistema, escutando em `127.0.0.1:3921` e `127.0.0.1:3920` com persistência em `%LOCALAPPDATA%\VoxPopuli\NodeZero\central_memory`).

---

## 🏛️ Ecossistema Cívico

O Vox explora interoperabilidade com iniciativas independentes de tecnologia cívica, incluindo plataformas de transparência legislativa.

**Proposta em estudo:** integração experimental com o Tramitado, preservando:
* Independência operacional.
* Privacidade das decisões individuais.
* Referências legislativas verificáveis.
* Interoperabilidade por padrões abertos.

Esta é uma proposta exploratória, não uma integração ou parceria formalizada.

Detalhes: [Brainstorm Tramitado × Vox](docs/brainstorm-sinergia-tramitado-vox-2026-11.md).

---

## 🔍 Compromisso de Transparência Técnica

Em conformidade com a auditoria de honestidade cívica ([docs/honest-copy-audit-2026-10-23.md](./docs/honest-copy-audit-2026-10-23.md)):

* **O Vox ainda não oferece P2P universal entre dispositivos:** gateways públicos Arweave, servidores de sinalização WebRTC e nós voluntários de memória/relay são usados para localizar e sincronizar dados; o comportamento depende da disponibilidade da rede e da implementação ativa.
* **O Vox NÃO promete imunidade judicial:** Toda postagem pública no permaweb é permanente e auditável. As normas da legislação brasileira ([COMPLIANCE-BR.md](./COMPLIANCE-BR.md) — Marco Civil da Internet e LGPD) aplicam-se integralmente.
* **O Vox NÃO publica sozinho nas redes sociais:** O protocolo POSSE gera rascunhos, links e compartilhamentos assistidos via intents oficiais; o envio final é sempre um ato consciente e deliberado do usuário.
* **O repositório e as comunidades são coisas distintas:** o código não opera nem governa automaticamente as comunidades. Relays e espelhos são opcionais e substituíveis; o Node Zero para Windows/Linux escuta localmente em loopback (com suporte opcional a túnel HTTPS Cloudflare no modo Dev Alpha/Beta).

---

## 📖 Mapa Canônico de Documentação

| Documento | Foco & Finalidade |
|:---|:---|
| **[docs/README.md](./docs/README.md)** | **Índice Mestre:** Ponto de partida único para desenvolvedores e revisores. |
| **[docs/dossie-geral-inventario-master-breakdown-2026-11.md](./docs/dossie-geral-inventario-master-breakdown-2026-11.md)** | **Plano Mestre N=25:** Único checklist vivo `[ ]` e Definition of Done global. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Topologia técnica, tags GraphQL, linhagem e protocolos de dados. |
| **[GOVERNANCE.md](./GOVERNANCE.md)** | Moderação e deliberação dentro das comunidades Vox; não define a governança do repositório. |
| **[COMPLIANCE-BR.md](./COMPLIANCE-BR.md)** | Adequação regulatória: Marco Civil da Internet (Art. 19), LGPD e minimização. |
| **[IDENTITY.md](./IDENTITY.md)** | Criptografia P-256 WebCrypto, gestão de chaves e carteiras Arweave. |
| **[docs/tese-praca-civica-militancia-pro-democratica-2026-10.md](./docs/tese-praca-civica-militancia-pro-democratica-2026-10.md)** | Tese de militância pró-democrática (cruzamento estratégico T01–T20). |
| **[docs/steward-seed-15min.md](./docs/steward-seed-15min.md)** | Guia rápido de 15 minutos para operadores e seeds voluntários de relay. |
| **[docs/CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md)** | Regras de governança de documentação, mutex de agentes e políticas de commit. |

### Decisões Arquiteturais Registradas (ADRs)

* **[ADR-001](./docs/adr/001-contribution-attestation-export.md):** Atestação exportável de contribuição P2P.
* **[ADR-002](./docs/adr/002-oauth-profile-enrich-client.md):** Enriquecimento de perfil client-only via OAuth.
* **[ADR-003](./docs/adr/003-profile-card-gossip.md):** Cartão de malha e propagação gossip de perfis.
* **[ADR-004](./docs/adr/004-gateway-honest-fallback.md):** Fallback transparente e honesto de leitura reserva de gateways.
* **[ADR-005](./docs/adr/005-collective-profile-m-of-n.md):** Perfil coletivo M-de-N via multi-assinatura independente (Tese T02).
* **[ADR-006](./docs/adr/006-p2p-profile-identity-gossip-hardening.md):** Hardening de identidade e gossip de perfis P2P.
* **[ADR-007](./docs/adr/007-zero-complexity-monolith-decomposition.md):** Decomposição de monólito e limite de complexidade cognitiva.
* **[ADR-008](./docs/adr/008-vox-populi-community-node-architecture.md):** Arquitetura do Nó Comunitário Vox Populi.
* **[ADR-009](./docs/adr/009-multi-gateway-graphql-corroboration.md):** Corroboração de múltiplos gateways GraphQL.
* **[ADR-010](./docs/adr/010-vox-contribution-engine-execute-e-ajude.md):** Motor de contribuição voluntária e nós anfitriões.
* **[ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md):** Taxonomia Canônica Dual — Vox (Cliente) e Vox Populi (Nó Dedicado).
* **[ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md):** Soberania Digital na Vox — Cintura Fina Criptográfica e Cartuchos Cívicos Webxdc.

---

## 🤝 Código aberto, participação e governança do projeto

O compromisso do Vox é permanecer aberto: código, protocolos, documentação e decisões devem poder ser examinados, reutilizados, modificados e mantidos pela comunidade. Nenhuma pessoa, empresa ou plataforma deve ter autoridade perpétua e unilateral sobre o projeto. O desenvolvimento inicial por uma pessoa explica a origem do Vox; não concede a essa pessoa um mandato permanente sobre sua direção.

**Estado atual, sem eufemismos:** o repositório ainda tem controle administrativo concentrado em uma pessoa. A governança descrita em [GOVERNANCE.md](./GOVERNANCE.md) trata principalmente das regras de moderação e deliberação de cada comunidade Vox; ela não distribui controle sobre o repositório, releases ou infraestrutura do projeto. Votos dentro de uma comunidade não elegem automaticamente mantenedores nem alteram o código canônico.

**Licença:** Este repositório é formalmente distribuído sob os termos da licença [MIT](LICENSE). A licença assegura a liberdade de uso, estudo, modificação e redistribuição do código por qualquer cidadão ou coletivo.

### Como a participação funciona hoje

* Qualquer pessoa pode ler o código e a documentação, testar, relatar problemas e propor mudanças por issues e pull requests públicos no [GitHub](https://github.com/yurikayel/vox).
* O histórico de revisão deve registrar motivação, evidências, testes e limitações. Mudanças que alterem protocolos ou regras precisam de explicação pública e tempo para contestação.
* A revisão do mantenedor é hoje o caminho de integração; uma proposta pública não garante merge. Enquanto a administração permanecer concentrada, isso deve ser reconhecido como limite real da participação, não descrito como governança popular já alcançada.
* O guia [CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md) cobre documentação e mutex de edição; ainda não existe neste repositório uma carta completa de governança, sucessão e seleção de múltiplos mantenedores.

### Trabalho necessário para que o projeto seja maior que qualquer indivíduo

1. Publicar uma licença livre após confirmar os direitos das contribuições existentes e estabelecer como novas contribuições serão licenciadas.
2. Definir critérios públicos e revisáveis para adicionar, remover e substituir mantenedores; incluir sucessão e recuperação de acesso.
3. Distribuir a custódia do repositório, releases, domínios e credenciais entre mais de uma pessoa confiável, com procedimentos auditáveis.
4. Manter builds, protocolos e dados portáveis o bastante para que a comunidade possa continuar por forks se o mantenedor ou a plataforma original sair do ar.
5. Separar decisões de código do projeto de decisões locais das comunidades, publicar conflitos de interesse e registrar como propostas foram aceitas ou recusadas.

Essas são condições de trabalho, não capacidades concluídas. Forks públicos ajudam a preservar código, mas não substituem licença, direitos claros, sucessão nem uma governança compartilhada do projeto.

---

*Vox — Soberania de dados, bem comum digital e comunicação comunitária livre.*
