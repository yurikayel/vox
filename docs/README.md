# Vox — índice de documentação

> **Status:** canônico (índice único) · **Owner:** voluntário doc (mutex: 1 PR por arquivo) · **Revisado:** 2026-11-07
> **Plano vivo e único checklist:** [ROADMAP.md](./ROADMAP.md) ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)) · **Release (SHA, testes, SW):** [release-metadata.json](./release-metadata.json) e tabela do [README](../README.md)

Entrada única para quem desenvolve, revisa ou opera. Todo `.md` novo em `docs/` entra aqui ([CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) §1).

## Comece aqui

1. [README do projeto](../README.md): o que é o Vox, como rodar, novidades.
2. [CONTRIBUTING.md](../CONTRIBUTING.md): setup em 5 min, fluxo de PR, regras.
3. [FEATURES.md](./FEATURES.md): catálogo do que está no ar, em lab, stub ou escrito e não plugado.
4. [ROADMAP.md](./ROADMAP.md): o que falta, por prioridade, com DoD.
5. [INFRA-CUSTOS.md](./INFRA-CUSTOS.md): onde tudo roda, secrets, free tiers, SPOFs.
6. [CHANGELOG.md](../CHANGELOG.md): o que mudou.

## Fonte de verdade — qual arquivo manda em quê

| Assunto | Documento canônico |
|---|---|
| Prioridades, caixas `[ ]`, DoD | [ROADMAP.md](./ROADMAP.md) |
| Estado real de cada funcionalidade | [FEATURES.md](./FEATURES.md) |
| SHA, contagem de testes, `CACHE_NAME` | [release-metadata.json](./release-metadata.json) (gerado por `npm run release-line`) |
| Infra, deploy, secrets, custos | [INFRA-CUSTOS.md](./INFRA-CUSTOS.md) |
| API do relay | [relay-api.md](./relay-api.md) |
| Testes e CI | [TESTES.md](./TESTES.md) |
| Limites de complexidade | [HARDENING.md](./HARDENING.md) |
| Mutex de agentes | [metodo-agentes-mutex-e-revisor.md](./metodo-agentes-mutex-e-revisor.md) |
| Licença | [ADR-015](./adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md) · [licenca-e-contribuicoes.md](./licenca-e-contribuicoes.md) |
| Decisões de arquitetura | [adr/README.md](./adr/README.md) |
| Tese de tração e preceitos | [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md) |
| Norma de documentação | [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) |

> [!IMPORTANT]
> **Regra anti-inflação:** é proibido criar outro plano mestre ("N=…", "T1–T10", checklist paralelo) sem um ADR que revogue o atual — hoje o [ADR-017](./adr/017-consolidacao-roadmap-unico.md). Ideias novas entram como brainstorm (banner + "Não substitui o ROADMAP").

---

## 1. Arquitetura e protocolo

- [../ARCHITECTURE.md](../ARCHITECTURE.md): protocolo, tags GraphQL, dados · [ARCHITECTURE.md](./ARCHITECTURE.md): camadas do cliente
- [../IDENTITY.md](../IDENTITY.md): chaves, cofre e recuperação · [DNS-HANDLES.md](./DNS-HANDLES.md): handles `@`
- [login-social.md](./login-social.md): login social, contas vinculadas e configuração de deploy do OAuth
- [relay-api.md](./relay-api.md): endpoints de `server.py` e `signaling.py`
- [../client/DEV.md](../client/DEV.md): guia do desenvolvedor §0–§44 (histórico por sprint)
- **ADRs:** [índice com status](./adr/README.md) (001–018) · **RFCs:** [rfc/README.md](./rfc/README.md) · [0001 — POSSE export](./rfc/0001-posse-export.md)

### Specs de protocolo (malha, cache, módulos)

- [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md): retratação no gossip (implementado)
- [antigravity-blob-soft-priority-v0.md](./antigravity-blob-soft-priority-v0.md): prioridade suave de blobs (flag desligada)
- [cache-manifest-v0.md](./cache-manifest-v0.md): manifestos de cache assinados
- [profile-card-gossip-v0.md](./profile-card-gossip-v0.md): cartão de perfil na malha (ver ADR-003)
- [listing-signed-gossip-v1.md](./listing-signed-gossip-v1.md): ofertas da Feira assinadas
- [mirror-validate-v1.md](./mirror-validate-v1.md): validação de espelho no relay
- [community-module-manifest-v0.md](./community-module-manifest-v0.md): manifesto de módulos de comunidade (backlog)
- [open-frames-v2.md](./open-frames-v2.md): Open Frames no feed
- [embed-integration.md](./embed-integration.md): widget embed · [vox-bridge-spike.md](./vox-bridge-spike.md): extensão MV3
- [governance-proposta-feira-pin-template.md](./governance-proposta-feira-pin-template.md): template de proposta Feira ↔ pin

## 2. Roadmap, estratégia e teses

- [ROADMAP.md](./ROADMAP.md): **plano vivo**
- [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md): preceitos, escada de 4 camadas, moderação E1–E5
- [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) · [backlog-participacao-rede.md](./backlog-participacao-rede.md) (IDs V-P) · [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) · [espacos-digitais-infra.md](./espacos-digitais-infra.md) (V-I01)
- [campo-debate-aberto-ndp-2026-10.md](./campo-debate-aberto-ndp-2026-10.md): notas de campo, modelos A–D
- [tese-praca-civica-militancia-pro-democratica-2026-10.md](./tese-praca-civica-militancia-pro-democratica-2026-10.md): praça E+D, T01–T20
- [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md): transição mantenedor → revisor
- [../POSITIONING.md](../POSITIONING.md) · [../LESSONS.md](../LESSONS.md) · [../GOVERNANCE.md](../GOVERNANCE.md) · [../COMPLIANCE-BR.md](../COMPLIANCE-BR.md)

### Brainstorms (ideias; não são plano)

- [brainstorm-autossustento-10-features-2026-11.md](./brainstorm-autossustento-10-features-2026-11.md): **10 features de autossustento a custo ~zero + 3 prompts de pesquisa**
- [pesquisa-deep-research-2026-11.md](./pesquisa-deep-research-2026-11.md): **resultado verificado dos 3 prompts** (o que se confirmou, o que falta conferir, o que foi descartado)
- [pesquisa-complementar-2026-11.md](./pesquisa-complementar-2026-11.md): **Prompt 4 respondido (busca direta + avaliação do relatório do Gemini) + brainstorm B1–B12** (STF itens 7–11, decretos de 2026, ECA Digital, TSE 23.755, Pix/DICT, IPv6 por operadora, Render, Nostr, financiamento)
- [brainstorm-sustentacao-perene-celulares-nos-base.md](./brainstorm-sustentacao-perene-celulares-nos-base.md): infra $0, celulares como nós
- [brainstorm-sinergia-tramitado-vox-2026-11.md](./brainstorm-sinergia-tramitado-vox-2026-11.md): Tramitado × Vox, contrato LCP
- [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md): flywheel, SLOs, moderação voluntária
- [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md) · [incubacao-p2-backlog.md](./incubacao-p2-backlog.md)
- [brainstorm-oauth-tradicional-descoberta-2026-10-24.md](./brainstorm-oauth-tradicional-descoberta-2026-10-24.md): OAuth e descoberta social
- [brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md](./brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md): crítica ao método (motivou o ADR-017)

## 3. Operações: steward, espelhos, DR

- [INFRA-CUSTOS.md](./INFRA-CUSTOS.md): mapa de hosts, workflows e secrets
- [steward-relay-kit.md](./steward-relay-kit.md) · [steward-seed-15min.md](./steward-seed-15min.md) · [steward-relay-buddy.md](./steward-relay-buddy.md) (V-P08: segundo voluntário antes do burnout)
- [ops-shell-mirrors.md](./ops-shell-mirrors.md): espelhos shell A/B · [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md) · [ops-pages-rollback.md](./ops-pages-rollback.md)
- [antigravity-operating.md](./antigravity-operating.md): operação da malha
- Emergência de **72 h** (relay + TTL do inbox): restaurar ou usar URL alternativa. Se o PWA cair, use o shell A/B. Steward ≠ mod ([GOVERNANCE.md](../GOVERNANCE.md)).
- Componentes: [relay/README.md](../relay/README.md) · [relay/deploy/README.md](../relay/deploy/README.md) (VPS + TURN) · [vox-populi/README.md](../vox-populi/README.md) · [android/README.md](../android/README.md) · [vox-bridge/README.md](../vox-bridge/README.md)
- Ferramentas: [desktop-linux](../tools/desktop-linux/README.md) · [desktop-seeder-windows](../tools/desktop-seeder-windows/README.md) · [desktop-windows-native](../tools/desktop-windows-native/README.md) · [node-macos](../tools/node-macos/README.md) · [node-zero-windows](../tools/node-zero-windows/README.md) · [steward-kit-windows](../tools/steward-kit-windows/README.md) · [posse-cli](../tools/posse-cli/README.md)
- [vox-populi-task-order-004-hardware-validation.md](./vox-populi-task-order-004-hardware-validation.md): validação de hardware do nó

## 4. Piloto e teste aberto

- [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md): gate humano (V-P09) · [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md)
- [teste-aberto-convite.md](./teste-aberto-convite.md) · [teste-aberto-canal-apoio.md](./teste-aberto-canal-apoio.md) · [teste-aberto-carta-moderacao-e2.md](./teste-aberto-carta-moderacao-e2.md) · [teste-aberto-demo.md](./teste-aberto-demo.md) (comunidade `demo-aprenda-vox`)
- [vox-brasil-welcome-profile.md](./vox-brasil-welcome-profile.md): perfil de boas-vindas · [formulário de bug para testadores](../.github/ISSUE_TEMPLATE/bug-tester.yml)

## 5. Desenvolvimento, qualidade e governança do repo

- [../CONTRIBUTING.md](../CONTRIBUTING.md) · [../CONTRIBUTORS.md](../CONTRIBUTORS.md) (DCO) · [../SECURITY.md](../SECURITY.md) · [../AUTHORS.md](../AUTHORS.md)
- [TESTES.md](./TESTES.md) · [HARDENING.md](./HARDENING.md) · métricas de complexidade: `metrics/baseline-AAAA-MM-DD.md`, geradas por `npm run audit:complexity` (a mais recente: [2026-11-06](./metrics/baseline-2026-11-06.md))
- [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) · [metodo-agentes-mutex-e-revisor.md](./metodo-agentes-mutex-e-revisor.md) · [licenca-e-contribuicoes.md](./licenca-e-contribuicoes.md)
- Design: [ADR-016](./adr/016-design-system-sovereign-agora-e-democracia-direta.md) · [Sovereign Agora DESIGN.md](../stitch_vox_civic_network_interface/sovereign_agora/DESIGN.md) · [design/stitch-telas-faltantes.md](./design/stitch-telas-faltantes.md)
- [proposta-vox.html](./proposta-vox.html): proposta em linguagem leiga

## 6. Auditorias e snapshots

- [honest-copy-audit-2026-10-23.md](./honest-copy-audit-2026-10-23.md): copy honesta (re-auditoria = DOC-04 no ROADMAP)
- [auditoria-permaweb-descoberta-seguranca-2026-10-29.md](./auditoria-permaweb-descoberta-seguranca-2026-10-29.md)
- [branding-audit-2026-11-01.md](./branding-audit-2026-11-01.md)
- [agent-reports/2026-11-05-auditoria-independente.md](./agent-reports/2026-11-05-auditoria-independente.md)

## 7. Histórico / SUPERSEDED (não usar como plano)

Mantidos para registro; cada um tem banner apontando o sucessor.

- [dossie-geral-inventario-master-breakdown-2026-11.md](./dossie-geral-inventario-master-breakdown-2026-11.md): plano N=25 → [ROADMAP.md](./ROADMAP.md)
- [inventario-estado-e-tarefas-documentacao-2026-11.md](./inventario-estado-e-tarefas-documentacao-2026-11.md) → [FEATURES.md](./FEATURES.md) + ROADMAP
- [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) e [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) → ROADMAP
- [revisao-estado-2026-10-25.md](./revisao-estado-2026-10-25.md): snapshot de 25/out
- [gateway-honest-fallback-brainstorm.md](./gateway-honest-fallback-brainstorm.md) → ADR-004 · [steward-wizard-brainstorm.md](./steward-wizard-brainstorm.md) → steward-relay-kit
- Métricas antigas: [10-24](./metrics/baseline-2026-10-24.md) · [10-30](./metrics/baseline-2026-10-30.md) · [10-31](./metrics/baseline-2026-10-31.md) · [11-01](./metrics/baseline-2026-11-01.md) · [11-04](./metrics/baseline-2026-11-04.md) · [11-05](./metrics/baseline-2026-11-05.md)

**Versão:** 2.0 · 2026-11-07
