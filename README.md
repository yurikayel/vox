# 📣 Vox — Rede Cívica Local-First de Participação Popular

[![Client](https://img.shields.io/badge/PWA-Vanilla%20ES%20Modules-orange.svg)](./client)
[![Identity](https://img.shields.io/badge/Identity-WebCrypto%20P--256-blueviolet.svg)](./client/js/identity/local-account.js)
[![Preservação](https://img.shields.io/badge/Preserva%C3%A7%C3%A3o-rede%20de%20seguidores-black.svg)](./docs/adr/019-esquecer-por-padrao-e-memoria-civica.md)
[![License: AGPL v3](https://img.shields.io/badge/License-GNU%20AGPLv3-crimson.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-2276%20passing%20%C2%B7%209%20skipped%20%C2%B7%2016%20todo-success.svg)](./docs/TESTES.md)
[![Service Worker](https://img.shields.io/badge/SW-v7.143--real--network--audio--video--upload-informational.svg)](./client/sw.js)

**Vox** é um PWA cívico *local-first* — sem bundler, sem servidor central de login e sem leilão de alcance — construído para ampliar a participação popular e a autonomia das comunidades. Sua ambição é ser um **bem comum aberto**: transparente, copiável, modificável e maior que qualquer fundador, mantenedor, empresa ou plataforma.

> ⚠️ **Honestidade de estado (nov/2026):** o controle administrativo do repositório ainda está concentrado em uma pessoa; **gravação no Arweave está pausada** (`arweaveUpload: false`, [REV-07](./docs/ROADMAP.md)) — tudo circula e se preserva pela **rede de seguidores** (malha P2P + cache local + nó opcional **Vox Memoria**). Nenhuma funcionalidade planejada é anunciada como pronta.

| Acesso rápido | Link |
|---|---|
| 🌐 **PWA Oficial** | [yurikayel.github.io/vox](https://yurikayel.github.io/vox/) · 🧪 [Guia de Testes](https://yurikayel.github.io/vox/#/ajuda/teste) · 📥 [Downloads](https://yurikayel.github.io/vox/download) |
| 🗺️ **Plano Único & Estado** | [ROADMAP.md](./docs/ROADMAP.md) ([ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md)) · [FEATURES.md](./docs/FEATURES.md) · [CHANGELOG.md](./CHANGELOG.md) |
| 🔎 **Retrato, MVP & Auditoria** | [Análise do repo](./docs/strategy/analise-repositorio-vox-2026-11.md) · [Spec MVP técnico](./docs/strategy/mvp-tecnico-vox-2026-11.md) · [Auditoria nov/2026](./docs/audits/auditoria-features-arquitetura-2026-11.md) |
| 📚 **Documentação & Custos** | [Índice docs/README.md](./docs/README.md) · [GLOSSARIO.md](./docs/GLOSSARIO.md) · [INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md) |

---

## 🧩 Ecossistema: 1 Cliente + 2 Perfis de Nó Local ([ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md))

Todo mundo usa **o mesmo cliente (`Vox`)**. Quem quiser contribuir com a infraestrutura escolhe entre dois nós locais com **dashboard simplificado** em loopback (`127.0.0.1`):

| Papel | Produto | Para quem | O que faz |
|---|---|---|---|
| 📱 **Só usar** | **`Vox`** *(cliente único)* | Qualquer pessoa | PWA / `Vox.exe` / `vox.apk`: feed, comunidades, enquetes, votações, Feira, diretório e DMs E2E — sem configurar servidor. |
| 🤝 **Apoiar** | **`Vox Populi`** *(nó de apoio)* | Apoiadores no dia a dia | Serviço leve em segundo plano (`VoxPopuli.exe` / `vox-populi.apk` / daemon): cache SHA-256, relay cego local (`blind_relay.py`) e painel simples (ligar/pausar, só Wi-Fi, cota leve). |
| 🧠 **Manter memória** | **`Vox Memoria`** *(nó de memória)* | Mantenedores dedicados | Dedica **X CPU, disco e banda** à memória perene da rede (`relay/central_memory.py` ou build local `packaging/zero-central-memory-windows/`): WAL `< 0,2 ms`, snapshot a cada 2 s, delta sync e dashboard de cotas. |

- 🔌 **Conexão local (*Usando seu nó*):** abrir o `Vox` com `Vox Populi` ou `Vox Memoria` rodando na mesma máquina conecta automaticamente em loopback (`127.0.0.1:3920` / `:3921`).
- 🔁 **Nó local único (XOR):** apenas **um nó** roda por vez no aparelho — abrir `Vox Populi` com `Vox Memoria` ativo (ou vice-versa) oferece encerramento limpo do ativo (flush de WAL/snapshot) e substituição sem conflito de portas.
- 🧰 **Steward kit ≠ 4º produto:** [`packaging/steward-kit-*`](./packaging/) e [`relay/deploy/`](./relay/deploy/) são o **pacote de ops** para voluntários implantarem o **`Vox Memoria` em modo VPS/coletivo** (HTTPS/WSS com Caddy/TLS e cotas — ver [steward-relay-kit.md](./docs/operations/steward-relay-kit.md)).

### 📥 Matriz de Plataformas & Binários

> 🔐 **Proveniência:** `.exe` e `.apk` não ficam no git — são compilados no GitHub Actions ([`release-binarios.yml`](./.github/workflows/release-binarios.yml)) por tag `v*`, com `SHA256SUMS` e atestação `actions/attest-build-provenance`. *Última Release publicada: **`v7.40` (09/11/2026)** — os binários não acompanham cada versão do PWA.*

| SO | 📱 `Vox` (Cliente) | 🤝 `Vox Populi` (Apoio) | 🧠 `Vox Memoria` (Memória) | Sob o capô |
|---|---|---|---|---|
| **Windows** (10/11) | [`Vox.exe`](https://github.com/yurikayel/vox/releases/latest/download/Vox.exe) | [`VoxPopuli.exe`](https://github.com/yurikayel/vox/releases/latest/download/VoxPopuli.exe) | [`build.ps1`](./packaging/zero-central-memory-windows/) *(build local, fora da Release)* | WebView2 nativo (~40 MB RAM); nós em bandeja (*System Tray*) em loopback `:3920`/`:3921`. |
| **Android** (7.0+) | [`vox.apk`](https://github.com/yurikayel/vox/releases/latest/download/vox.apk) | [`vox-populi.apk`](https://github.com/yurikayel/vox/releases/latest/download/vox-populi.apk) | — *(desktop / SBC / VPS)* | Micro-APKs `< 100 KiB` (`org.vox.client` e `org.vox.populi`, foreground service em Wi-Fi). |
| **Linux & Pi** | [Guia WebKitGTK](./packaging/desktop-linux/) | [Guia `systemd`](./vox-populi/) | `relay/server.py` + [Kit steward](./docs/operations/steward-relay-kit.md) | Daemon leve (~15 MB RAM em repouso) para Raspberry Pi e servidores domésticos. |
| **Apple** (iOS / macOS) | [Safari PWA](https://vox-9df.pages.dev/) *(espelho opcional; oficial: [GitHub Pages](https://yurikayel.github.io/vox/))* | [Guia `launchd`](./packaging/node-macos/) | `relay/server.py` | No iOS, *Compartilhar → Tela de Início* evita a limpeza de 7 dias do Safari (ITP). |

---

## 🚀 Começando em 30 Segundos

### 1. Rodar o Cliente PWA (zero build)

```bash
cd client
python -m http.server 8080
```

Acesse `http://127.0.0.1:8080/` *(ES Modules exigem HTTP/HTTPS, não `file://`)*.

### 2. Rodar Testes e Validação Completa

```bash
npm test          # suíte JS (node:test) + relay Python (unittest)
npm run validate  # lint + lint:relay + complexidade + docs + camadas + testes
```

Guia completo de testes e tiers: [docs/TESTES.md](./docs/TESTES.md).

### 3. Rodar Sinalização ou Relay Completo (opcional)

```bash
npm start                 # sinalização WebRTC (relay/signaling.py, :3921)
cd relay && python server.py  # relay completo (:3920): cache, inbox, mirror, memória, OAuth
```

Endpoints em [docs/specs/relay-api.md](./docs/specs/relay-api.md). No Windows, o nó **Vox Memoria** local pode ser compilado com `packaging/zero-central-memory-windows/build.ps1` (loopback `127.0.0.1:3920`/`:3921`, dados em `%LOCALAPPDATA%\VoxPopuli\NodeZero\central_memory`).

---

## 📊 Releases e Validação

| Campo | Valor |
|---|---|
| **Commit SHA** | `667fcda` |
| **Suíte de Testes** | **2301** (`1981` JS + `320` Python) |
| **Service Worker** | `vox-pwa-v7.143-real-network-audio-video-upload` |

*Tabela regenerada por `npm run release-line` (grava [docs/release-metadata.json](./docs/release-metadata.json)). Nenhum outro documento deve repetir esses números.*

*Medido em `develop`. A `main` pública está no release #262 (`bda1dd4`) e não inclui os PRs posteriores (#281–#283 e docs/fixes posteriores); o README na `main` atualiza no próximo release. O total **2301** inclui **9** testes pulados (8 JS + 1 Python) e **16** `todo` (JS) — testes que efetivamente passam: **2276** (1957 JS + 319 Python). Última Release de binários no GitHub: `v7.40` (09/11/2026), anterior ao Service Worker atual.*

> 💡 O Service Worker pode manter versão anterior em cache. Após atualização, recarregue ou use `Ctrl+Shift+R`. Consulte sempre os checks do CI no commit exato antes de tratar um build como validado.

---

## ⚙️ Arquitetura do Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│            Vox Web Client (PWA estático — HTML5 + CSS + ESM)           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
               [Leitura]                        [Autoria]
                    │                                │
                    ▼                                ▼
       Cascata de Leitura Híbrida:         Assinatura & Replicação:
     1. RAM / IndexedDB local            • Identidade ECDSA P-256 (vx_…)
     2. Cache / rede de seguidores       • Rede de seguidores (gossip + sync)
     3. Conexão local (Populi/Memoria)   • DMs E2E: ECDH P-256 + AES-GCM
     4. Gateways Arweave (só leitura)    • Arweave write: pausado (REV-07)
                    │                                │
                    ▼                                ▼
          Gateways (AR.IO/Turbo)          Malha WebRTC + Sync + Relays
                    └───────────────┬────────────────┘
                                    ▼
         Aparelhos dos seguidores + Vox Memoria + Arweave (legado)
```

- 📡 **Malha WebRTC + gossip (`WANT`/`HAVE`/`BLOB`):** sinalização em dois caminhos paralelos — 1 nó Render (`wss://vox-sentinel.onrender.com`) + **Nostr efêmero cifrado** (`kind 25050`, reconexão com backoff; REV-09, PM-17, ainda sem medição de campo). Sem TURN em produção abaixo de >50 ativos (`INF-01`).
- 🔒 **Loopback-only nos nós locais:** `Vox Populi` e `Vox Memoria` locais escutam só em `127.0.0.1`; descoberta LAN automática e WebTorrent seeding não estão implementados.
- 🌐 **Leitura multi-gateway:** 4 gateways com timeout de 8 s; 3 servem de testemunha GraphQL ([ADR-009](./docs/adr/009-multi-gateway-graphql-corroboration.md), `proposed`).

### 🏷️ Esquema de Tags e Dados Públicos

Nem todo estado é transação pública (parte vive em IndexedDB/storage local; não há banco SQL global). **Denúncias (`report.js`, LAN-12) nunca são públicas:** ficam no aparelho e seguem por DM cifrada à moderação.

| Ação | Tag `Type` | Campos / Tags-chave | Finalidade |
|---|---|---|---|
| **Comunidade** | `community` | `Community-Id`, `Title`, `Description`, `Category` | Funda espaço de debate |
| **Adesão** | `membership` | `Community-Id` | Registra vínculo no perfil |
| **Tópico / Resposta** | `topic` / `reply` | `Community-Id`, `Topic-Title`, `Reply-To` | Fórum e árvore de respostas |
| **Moderação** | `mod-action` | `Community-Id`, `Action` (`hide`/`ban`), `Target` | Filtro interpretado no cliente |
| **Chave DM / Handle** | `profile-key` / `handle` | `Dm-Pub` (JWK P-256), `Handle`, `Owner-Addr` | DMs E2E e `@slug` sem cartório central |
| **Governança / Feira** | `governance-proposal` / `listing` | `Community-Id`, `Proposal-Id`, `Diff` | Propostas com diff e classificados assinados |
| **Update / Posicionamento** | `community_update` / `civic-vote` | foto/título/descrição (PM-09) · voto cívico | Só dono/mod altera comunidade; 1 voto por pessoa |

---

## 🆕 Destaques de Novembro/2026

*(Histórico completo em [CHANGELOG.md](./CHANGELOG.md) e [client/DEV.md §42–§44](./client/DEV.md#42-postar-em-etapas--social-ou-cívico).)*

- 🎨 **Experiência & Produto:** design system *Sovereign Agora* ([ADR-016](./docs/adr/016-design-system-sovereign-agora-e-democracia-direta.md)); feeds `#/` (Social) e `#/?feed=civic` (Cívico com posicionamento e enquetes 2–6 opções); fluxos em etapas (onboarding, compositor, proposta, comunidade, Feira); assistentes (`#/settings/network/guia`, `#/backup`, `#/wallet/guia`); modo Canal (`PM-81`); modo eleitoral automático (`REV-24`, Res. TSE 23.755/2026); contas vinculadas Bluesky (AT Protocol no navegador) e OAuth via `/oauth/exchange` quando configurado.
- 🔐 **Identidade, Recuperação & Segurança ([DevSecOps 10/11](./docs/audits/revisao-devsecops-2026-11-10.md)):**
  - **Cofre v2 (`PM-90`, [ADR-025](./docs/adr/025-cofre-v2-so-a-senha-abre.md)):** só a Senha Soberana abre (PBKDF2 600k); Google/Meta não abrem cofre.
  - **Chaves em repouso (`PM-93`, [ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md)):** chaves não exportáveis após backup + sincronização segura entre abas (`identity/tab-sync.js`).
  - **Recuperação soberana ([ADR-032](./docs/adr/032-login-perene-a-conta-nasce-com-saida.md), [ADR-037](./docs/adr/037-cofre-na-malha.md)):** frase de 12/24 palavras (`#/frase`), guardiões Shamir (`#/guardioes`, `#/voltar`) e **cofre na malha** com espera 24 h / veto.
  - **Assinatura v2 (`PM-85`) e integridade (`#49`, `PM-84/86/87`):** `sigv: 2` cobre campos aninhados (`SIGV2_FROM` ativa em **24/11/2026**); fotos viajam com `mediaHash` assinado; memória central verifica assinatura; cartão de perfil sem eco infinito.
  - **Relay & Pipeline (`PM-94/95`, #281):** autorização por dono/origem ([ADR-027](./docs/adr/027-autorizacao-no-relay-dono-e-origem.md)), snapshot do relay cego em modo `compat` ([RFC 0002](./docs/rfc/0002-snapshot-autenticado-do-relay-cego.md)), CodeQL, Dependabot, actions fixadas por SHA e catraca de camadas ([ADR-035](./docs/adr/035-camadas-e-contextos.md)).
- 📡 **Malha & Resiliência:** sync por inventário (`PM-80`, ≈157 KB → ≈7 KB); caixa de saída de DMs com reenvio 7 dias (`PM-78`); denúncia assinada com arquivamento até revisão 48 h (`PM-69`); quarentena de chave nova + PoW 14 bits (`LAN-14`); nó leve (100 MB) vs Apoiador (512 MB–1 GB no Wi-Fi); mensagens de erro honestas (`LAN-21`); vínculo assinado (`PM-82`) e moderador natural em laboratório (`PM-83`, flag `vox.lab.moderador`).
- ⚠️ **Limites abertos:** grafo de convites continua visível na malha ([THREAT-MODEL T19](./docs/THREAT-MODEL.md)); sem relay completo público (`REV-04`); sem TURN abaixo de >50 ativos (`INF-01`); Deno Deploy pausado; infra extra congelada até >50 ativos ([INF-01…04](./docs/ROADMAP.md)).

---

## 🛠️ Capacidades Implementadas e Laboratório

*(Lista canônica com rotas, módulos e testes em [docs/FEATURES.md](./docs/FEATURES.md).)*

- 💬 **Fórum, Comunidades & Moderação:** comunidade oficial `"vox"` (saída/entrada livres), `📌 Fixado`, `🔒 Encerrado`, bumping por atividade, quarentena pessoal e denúncia cifrada ao moderador.
- 🎙️ **Mídia Lo-Fi & Social:** áudio/vídeo nativos (≤ 320p, `media-lofi.js`), deduplicação SHA-256 (`media-blob.js`), Notas de Perfil 24 h, Republicar com citação sem impulsionamento, marcação manual em fotos (sem reconhecimento facial), `EXPLODE!` assistido (POSSE) e QR Code vanilla (`qr-url.js`).
- 🛒 **Feira, Pix & Cartório:** classificados assinados, Pix Zaps offline (`brcode.js`, com aviso de nome civil no DICT — `REV-13`), Cartório Cívico (`perma-notary.js`, hoje só hash local por `REV-07`), hashtags (`#/tag/:slug`; `polis.js` em `labs/parado/`, não plugado) e Voxels locais ([ADR-013](./docs/adr/013-sistema-voxels-e-conquistas-civicas.md)).
- 🔐 **Identidade & Mensagens:** DMs E2E (`ECDH P-256` + `AES-GCM-256`; offline depende de relay de steward), cofre multi-identidade `.voxid`, wipe local de emergência (`identity/local-account.js`) e diretório `#/people`.
- 🧪 **Laboratório / Não plugado:** Webxdc + CRDT ([ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)) e mais 18 módulos isolados em `client/js/labs/parado/` (fora do precache); laboratório M-de-N (`#/labs/mofn`, [ADR-005](./docs/adr/005-collective-profile-m-of-n.md)); AI Social Dungeon (demo sem IA/rede, [ADR-033](./docs/adr/033-ia-so-no-rpg-local-primeiro.md)).

---

## 🏛️ Visão, Compromissos e Transparência

**VOX POPULI** — *a voz do povo* — expressa o propósito de que comunidades construam e mantenham os espaços digitais que usam. O Vox não fala em nome do povo, não substitui organização humana e não trata plataformas centralizadas ou o Fediverso como inferiores — oferece uma alternativa *local-first* aberta e auditável ([LESSONS.md](./docs/process/LESSONS.md) · [POSITIONING.md](./docs/product/POSITIONING.md)).

| Modelo | Como opera | Trade-off | Foco do Vox |
|---|---|---|---|
| **Centralizado** | Uma empresa controla serviço, identidade e alcance. | Conveniência vs concentração de poder e dados. | Reduzir dependência central; formatos públicos auditáveis. |
| **Federado** | Instâncias independentes interoperam por protocolo. | Distribui poder, mas exige administrar servidores. | Aprender e interoperar sem competir com o Fediverso. |
| **Local-first** | Chaves, dados e operação começam no aparelho. | Depende de pares, implementação e manutenção real. | Uso local, portabilidade e infraestrutura substituível. |

### ⚖️ Compromissos de Transparência ([auditoria copy](./docs/audits/honest-copy-audit-2026-10-23.md))

1. **Sem alcance comprado:** sem venda de visibilidade nem ranking opaco.
2. **Sem falsa prova de identidade humana:** uma chave `vx_…` identifica uma conta, não prova “uma pessoa, um voto”.
3. **Sem P2P mágico:** descoberta e sync ainda dependem de sinalização WebRTC/Nostr e nós voluntários conforme disponibilidade.
4. **Sem imunidade judicial:** o que já foi gravado no Arweave é permanente e o que circula na rede de seguidores pode ser replicado por outros aparelhos. Hoje o cliente não grava no Arweave (`arweaveUpload: false`). Marco Civil da Internet e LGPD aplicam-se integralmente ([COMPLIANCE-BR.md](./docs/legal/COMPLIANCE-BR.md)).
5. **Sem publicação automática:** POSSE só gera rascunhos/intents; quem publica é sempre a pessoa.
6. **Repositório ≠ comunidades:** o código não governa comunidades; votos em comunidades valem localmente e não alteram o código canônico.

> 🔎 **Ecossistema cívico (exploratório):** há um estudo inicial de interoperabilidade aberta com o *Tramitado* (sem integração nem parceria formalizada — [brainstorm](./docs/brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md)).

---

## 🗂️ Estrutura do Repositório & Mapa de Docs

```text
vox/
├── client/       PWA (JS puro sem build): app/, render/, identity/, vault/, labs/, sw.js
├── relay/        Backend Python stdlib: signaling.py, server.py, blind_relay.py, deploy/
├── workers/      Cloudflare Workers (ex.: credenciais TURN)
├── android/      Micro-APKs Android (vox.apk e vox-populi.apk)
├── vox-populi/   Daemon systemd para Linux / Raspberry Pi
├── vox-bridge/   Extensão de navegador MV3 (stub)
├── packaging/    Instaladores desktop, Vox Memoria Windows e kits de steward
├── tools/        Utilitários (posse-cli, userscript auto-explode, media-bench)
├── scripts/      Qualidade & CI: release-line, complexidade, camadas, docs-audit, e2e-mesh
├── tests/        Suíte cliente (node:test); testes do relay em relay/test_*.py
├── docs/         Documentação canônica — índice único em docs/README.md
└── .github/      CI, CodeQL, builds de binários e templates
```

| Documento | Finalidade |
|---|---|
| **[docs/README.md](./docs/README.md)** · **[GLOSSARIO.md](./docs/GLOSSARIO.md)** | Índice mestre de docs · termos da UI em português claro |
| **[docs/ROADMAP.md](./docs/ROADMAP.md)** · **[FEATURES.md](./docs/FEATURES.md)** | Único checklist vivo `[ ]` ([ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md)) · catálogo real |
| **[mvp-tecnico-vox-2026-11.md](./docs/strategy/mvp-tecnico-vox-2026-11.md)** · **[auditoria](./docs/audits/auditoria-features-arquitetura-2026-11.md)** | Spec do MVP técnico (10 seções) · auditoria empírica nov/2026 |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** · **[docs/IDENTITY.md](./docs/IDENTITY.md)** | Protocolo/tags, camadas do cliente ([docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)) e WebCrypto |
| **[docs/HARDENING.md](./docs/HARDENING.md)** · **[docs/TESTES.md](./docs/TESTES.md)** | Métricas de qualidade (LLOC/CC/nesting) e suíte/CI |
| **[docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md)** · **[docs/DEPENDENCIAS.md](./docs/DEPENDENCIAS.md)** | Modelo de ameaças (LAN-15) e cadeia de suprimentos (LAN-20) |
| **[docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md)** · **[steward-relay-kit.md](./docs/operations/steward-relay-kit.md)** | Free tiers, SPOFs e implantação de `Vox Memoria` em VPS |
| **[CONTRIBUTING.md](./CONTRIBUTING.md)** · **[CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md)** | Fluxo PR → `develop`, testes e mutex de docs |
| **[GOVERNANCE.md](./GOVERNANCE.md)** · **[COMPLIANCE-BR.md](./docs/legal/COMPLIANCE-BR.md)** | Regras de comunidades · Marco Civil e LGPD |

**ADRs (39 decisões — índice e status em [docs/adr/README.md](./docs/adr/README.md)):** destaques em [ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md) (taxonomia `Vox` / `Vox Populi` / `Vox Memoria`), [ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md) (ROADMAP único), [ADR-019](./docs/adr/019-esquecer-por-padrao-e-memoria-civica.md) (rede de seguidores), [ADR-025](./docs/adr/025-cofre-v2-so-a-senha-abre.md) (cofre v2), [ADR-035](./docs/adr/035-camadas-e-contextos.md) (camadas/contextos) e [ADR-037](./docs/adr/037-cofre-na-malha.md) (cofre na malha). Decisões institucionais numa página: [docs/DECISOES.md](./docs/DECISOES.md).

---

## 🤝 Código Aberto, Licença e Governança

- 📜 **Licença:** **GNU AGPL-3.0-or-later** ([`LICENSE`](./LICENSE)) — fecha a brecha de SaaS/nuvem privada (Seção 13; [ADR-015](./docs/adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md) · [licenca-e-contribuicoes.md](./docs/legal/licenca-e-contribuicoes.md)).
- 👥 **Contribuição & Segurança:** [`AUTHORS.md`](./AUTHORS.md) · [`CONTRIBUTORS.md`](./CONTRIBUTORS.md) (DCO) · [`SECURITY.md`](./SECURITY.md) (divulgação responsável) · PRs sempre para **`develop`** ([CONTRIBUTING.md](./CONTRIBUTING.md)).
- 🧭 **Estado real da governança:** hoje a revisão e o controle administrativo estão concentrados em uma pessoa; proposta pública não garante merge. **Trabalho necessário para superar o bus factor 1:**
  1. ~~Publicar licença livre (AGPL-3.0-or-later) + `AUTHORS.md`, `CONTRIBUTORS.md`, `SECURITY.md` e ADR-015.~~ ✅ **Concluído.**
  2. Definir critérios públicos para adicionar, remover e substituir mantenedores (com sucessão).
  3. Distribuir custódia do repositório, releases, domínios e credenciais entre ≥2 pessoas confiáveis.
  4. Manter builds, protocolos e dados portáveis para continuidade via fork.
  5. Separar governança de código de decisões das comunidades, publicando conflitos de interesse.

---

*Vox — Soberania de dados, bem comum digital e comunicação comunitária livre.*
