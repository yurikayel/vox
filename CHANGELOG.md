# Changelog — Vox

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões semânticas: cada entrada é identificada pela **linha do Service Worker** (`CACHE_NAME` em `client/sw.js`) e pelos PRs/commits. Números de testes e SHA da release atual: [docs/release-metadata.json](./docs/release-metadata.json).

Como manter: todo PR com mudança visível acrescenta uma linha em **Não lançado**. Ao fazer merge em `main` com bump de SW, a seção *Não lançado* vira a nova entrada datada.

## [Não lançado]

### Decisões
- [ADR-018](./docs/adr/018-selo-govbr-via-parceiro-publico.md) (proposed): o gov.br não será login (credencial de produção exige domínio oficial de governo; o CPF é o `sub`). A proposta é um selo opcional de nível prata/ouro emitido por parceiro público, com pseudônimo HMAC e sem o CPF chegar ao Vox. Rastreado como REV-08 no ROADMAP.

### Documentação
- Revisão de estado de nov/2026: novos [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md), [docs/relay-api.md](./docs/relay-api.md), [docs/TESTES.md](./docs/TESTES.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [índice de ADRs](./docs/adr/README.md) e [ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md) (ROADMAP único substitui o dossiê N=25 como checklist vivo).
- Números de testes e `CACHE_NAME` passam a viver só no README e no `release-metadata.json`.
- Corrigida a premissa de "upload grátis para sempre": o Turbo expõe uma cota grátis (~10 MiB por carteira/IP) em `upload.ardrive.io/info`. INFRA-CUSTOS, FEATURES, ROADMAP (REV-07) e a feature F5 foram revisados.
- Brainstorm de 10 features de autossustento a custo ~zero + 3 prompts de pesquisa: [docs/brainstorm-autossustento-10-features-2026-11.md](./docs/brainstorm-autossustento-10-features-2026-11.md).

## SW v7.32 — 2026-11-07

### Marca
- Favicon e avatar oficial com o logo **VOX tricolor**; avatares em squircle em toda a UI.

## SW v7.24 → v7.31 — 2026-11-07 (PRs #1–#11)

### Adicionado
- **Design system Sovereign Agora** (PR #1, [ADR-016](./docs/adr/016-design-system-sovereign-agora-e-democracia-direta.md)): paleta `--sa-*`, Domine + Work Sans, variante clara, wordmark "VOX · Ágora Soberana", círculos territoriais sem contagem fictícia.
- **Feed Social e Cívico** (PR #2): `#/` e `#/?feed=civic`; classificador `civic-post.js`; posicionamento/enquete com voto assinado `civic-vote` (1 por pessoa).
- **Mensagens:** contador de não lidas no menu e no topo (PR #3).
- **Compositor em 5 etapas** (PR #6) e **onboarding em etapas** com pacto como etapa final (PR #7).
- **Proposta, comunidade e oferta da Feira em etapas**; **enquete** com construtor de 2–6 opções; **voto com confirmação**; assistentes de **rede**, **Senha Soberana** e **carteira** (PR #8).
- **Contas vinculadas por login** (PRs #9, #10): Bluesky OAuth no navegador, Facebook (identidade), X/Threads/GitHub/TikTok/Instagram via `/oauth/exchange`; tela simplificada com uma linha por rede; importar nome e foto no onboarding.
- **Postar estilo Instagram** (PR #11): escolha Social ou Cívico, mídias completas em Social, painel do anexo organizado.

### Alterado
- Feed sem cartões, sem fundo e sem letterbox; hover só com filete dourado (PR #5).

### Corrigido
- Contas vinculadas: sem handle inventado e sem verificação falsa (PR #9).
- Pattern do slug de comunidade inválido no modo `v` do Chrome.

### Infra
- **Deno Deploy pausado** (organização suspensa): removido de `client/config/signaling.json` e do keepalive; sinalização pública = Render + local (PR #4).

## SW v7.16 → v7.20 — 2026-11-05/06

### Adicionado
- **Cofre zero-knowledge** e recuperação cross-device via Google `sub`, Meta e Senha Soberana; sync por QR `#/sync` ([ADR-014](./docs/adr/014-zero-knowledge-vault-recuperacao-soberana.md)).
- **Memória central Modo 3** (`central_memory.py`, `VoxPopuli-ZeroMemory.exe`) com túnel Cloudflare e beacon de descoberta.
- Diretório unificado de pessoas (`#/people`) e entrada direta de nome no onboarding.
- Moderação de fórum: fixar, trancar, busca e ordenação de tópicos.
- **AGPL-3.0-or-later** ([ADR-015](./docs/adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md)); seeder P2P e descoberta `VOX-PEER-v1`.
- Cockpit POSSE ("Postar e Ecoar"), canal `#/revolucao`, Voxels no perfil ([ADR-013](./docs/adr/013-sistema-voxels-e-conquistas-civicas.md)).
- Runtime Webxdc em sandbox, relay cego e cintura fina `vox-identity` ([ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)).
- Página de downloads e executáveis nativos (Windows 967 KiB, Android micro-APK, Linux, macOS).

## Out/2026 — fundação (SW v5.x → v7.15)

- Fases 1–5: leitura GraphQL multi-gateway, autoria ANS-104 via Turbo, malha WebRTC com gossip, DMs E2E com inbox TTL, handles `@`.
- Comunidades estilo Orkut, governança com diff e voto assinado, Feira, Pix Zaps (BR Code offline), Open Frames, POSSE.
- Hardening: zero violações de complexidade ([ADR-007](./docs/adr/007-zero-complexity-monolith-decomposition.md)), paridade de precache do SW.
- Vox Populi (nó dedicado: Linux/Pi, Android, Windows) — [ADR-008](./docs/adr/008-vox-populi-community-node-architecture.md), [ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md).

Histórico detalhado sprint a sprint: [client/DEV.md](./client/DEV.md).
