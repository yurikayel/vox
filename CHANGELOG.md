# Changelog — Vox

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões semânticas: cada entrada é identificada pela **linha do Service Worker** (`CACHE_NAME` em `client/sw.js`) e pelos PRs/commits. Números de testes e SHA da release atual: [docs/release-metadata.json](./docs/release-metadata.json).

Como manter: todo PR com mudança visível acrescenta uma linha em **Não lançado**. Ao fazer merge em `main` com bump de SW, a seção *Não lançado* vira a nova entrada datada.

## [Não lançado]

### Organização do repositório
- Pacote de mockups `stitch_vox_civic_network_interface/` removido (já aplicado; ADR-016). A especificação foi para [docs/design/sovereign-agora.md](./docs/design/sovereign-agora.md).
- Raiz enxuta: `COMPLIANCE-BR.md` → `docs/legal/`, `IDENTITY.md` → `docs/`, `POSITIONING.md` → `docs/product/`, `LESSONS.md` → `docs/process/`; `Dockerfile` duplicado e `glitch.json` removidos; `railway.json`/`zbpack.json` → `relay/deploy/`; `.editorconfig` novo.
- `tools/` dividido: manutenção do repo em `scripts/`, instaladores em `packaging/`, ferramentas de uso em `tools/` (cada pasta com README).
- `docs/` organizado em pastas por tipo (`specs/`, `operations/`, `strategy/`, `pilot/`, `research/`, `brainstorms/`, `audits/`, `product/`, `process/`, `legal/`, `archive/`). Links internos e caminhos em código, testes e workflows reescritos; links do download apontavam para a branch inexistente `develop` e agora vão para `main`.

### Rumo à rede pública — G1 (branch `feat/lan-g1-fundamentos`)
- **LAN-10 demonstração isolada:** os 27 perfis fictícios (e suas chaves Pix) só aparecem com o modo demonstração ligado, com faixa fixa; o aviso de falha de rede deixou de dizer "conteúdo de exemplo".
- **REV-13 Pix:** quem cadastra a chave é avisado de que o nome civil (DICT) aparece com qualquer chave; quem paga é lembrado de conferir o nome no banco.
- **REV-19 teste de fumaça Nostr:** `scripts/nostr-smoke.mjs` + workflow semanal; `eden.nostr.land` (pago) saiu do pool, `offchain.pub` entrou.
- **REV-09 sinalização por Nostr:** `nostr-transport.js` roda em paralelo ao Render; só um peerId aleatório vai em claro, o resto é cifrado (ECDH secp256k1 + AES-GCM). Assinatura BIP-340 em JS puro (`nostr-event.js`, vetores oficiais nos testes).
- **LAN-08 kill-switch:** `config/flags.json` + `feature-flags.js` (sem cache do SW).
- **LAN-11 aviso de permanência:** antes de gravar no Arweave, a pessoa escolhe "permanente" ou "só na malha".
- **LAN-12 denunciar:** o botão deixou de ser de mentira; motivos, canais oficiais (SaferNet, Disque 100, Ligue 180, 190) e DM cifrada ao moderador.
- **LAN-16 CSP:** meta CSP sem script inline + `client/_headers` (frame-ancestors, nosniff, Referrer/Permissions-Policy); handlers inline viraram delegação (`dom-delegates.js`).
- **Docs:** [THREAT-MODEL.md](./docs/THREAT-MODEL.md) (LAN-15, rascunho) e critério de go do beta no go/no-go (LAN-28).

### Planejamento
- [docs/strategy/backlog-lancamento-publico-2026-11.md](./docs/strategy/backlog-lancamento-publico-2026-11.md): brainstorm + backlog completo até a rede pública (critérios, portões G1 piloto → G2 beta → G3 público, LAN-01 a LAN-36). ROADMAP ganhou a seção "Rumo à rede pública".

### Pesquisa
- [docs/research/pesquisa-complementar-2026-11.md](./docs/research/pesquisa-complementar-2026-11.md): Prompt 4 respondido por busca direta e pelo Gemini (avaliado na §5) + brainstorm B1–B12. Corrige a síntese: a tese do STF trata de marketplaces (item 7), a chave Pix aleatória não esconde o nome do DICT e o IPv6 já passa de 80% nas grandes operadoras móveis. Novos REV-18 a REV-24; REV-12 e REV-13 revistos; REV-17 concluído.
- [docs/research/pesquisa-deep-research-2026-11.md](./docs/research/pesquisa-deep-research-2026-11.md): síntese verificada dos 3 relatórios do Gemini Deep Research. Confirmados: cota do Turbo vitalícia por carteira/sub-rede, Credit Sharing, Durable Objects no Workers Free, TURN da Cloudflare com 1.000 GB grátis, Docker Spaces do HF pagos, Briar em manutenção. Novos itens REV-09 a REV-16 no ROADMAP (F1 vira P0, F6 redesenhada, jurídico pós-STF, aviso nos Pix Zaps, proteção de chave no iOS).

### Decisões
- [ADR-018](./docs/adr/018-selo-govbr-via-parceiro-publico.md) (proposed): o gov.br não será login (credencial de produção exige domínio oficial de governo; o CPF é o `sub`). A proposta é um selo opcional de nível prata/ouro emitido por parceiro público, com pseudônimo HMAC e sem o CPF chegar ao Vox. Rastreado como REV-08 no ROADMAP.

### Documentação
- Revisão de estado de nov/2026: novos [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md), [docs/specs/relay-api.md](./docs/specs/relay-api.md), [docs/TESTES.md](./docs/TESTES.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [índice de ADRs](./docs/adr/README.md) e [ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md) (ROADMAP único substitui o dossiê N=25 como checklist vivo).
- Números de testes e `CACHE_NAME` passam a viver só no README e no `release-metadata.json`.
- Corrigida a premissa de "upload grátis para sempre": o Turbo expõe uma cota grátis (~10 MiB por carteira/IP) em `upload.ardrive.io/info`. INFRA-CUSTOS, FEATURES, ROADMAP (REV-07) e a feature F5 foram revisados.
- Brainstorm de 10 features de autossustento a custo ~zero + 3 prompts de pesquisa: [docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md](./docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md).

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
