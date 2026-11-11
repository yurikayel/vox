# Vox — índice de documentação

> **Status:** canônico (índice único) · **Owner:** voluntário doc (mutex: 1 PR por arquivo) · **Revisado:** 2026-11-10 (v2.5: registro único de decisões, ADR-021…024, brainstorms dos 5 pontos fracos, do terceiro lugar, do público, da captação, do refino e dos nichos)
> **Plano vivo e único checklist:** [ROADMAP.md](./ROADMAP.md) ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)) · **Release (SHA, testes, SW):** [release-metadata.json](./release-metadata.json) e tabela do [README](../README.md)

Entrada única para quem desenvolve, revisa ou opera. Todo `.md` novo em `docs/` entra aqui ([CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) §1).

## Comece aqui

1. [README do projeto](../README.md): o que é o Vox, como rodar, novidades.
2. [CONTRIBUTING.md](../CONTRIBUTING.md): setup em 5 min, fluxo de PR, regras.
3. [FEATURES.md](./FEATURES.md): catálogo do que está no ar, em lab, stub ou escrito e não plugado.
4. [ROADMAP.md](./ROADMAP.md): o que falta, por prioridade, com DoD.
5. [INFRA-CUSTOS.md](./INFRA-CUSTOS.md): onde tudo roda, secrets, free tiers, SPOFs.
6. [CHANGELOG.md](../CHANGELOG.md): o que mudou.
7. [DECISOES.md](./DECISOES.md): as decisões institucionais e de arquitetura em vigor, numa página, com o estado real.

## Pastas de `docs/`

Na raiz de `docs/` ficam só os documentos canônicos (tabela "Fonte de verdade" abaixo). O resto mora numa pasta por tipo:

| Pasta | O que guarda |
|---|---|
| [`adr/`](./adr/README.md) | Decisões de arquitetura (ADR-001…) |
| [`rfc/`](./rfc/README.md) | Propostas de protocolo em discussão |
| [`specs/`](./specs/) | Especificações de protocolo e de API (manifestos, gossip, relay, handles, OAuth, embed) |
| [`operations/`](./operations/) | Runbooks: espelhos, rollback, drill de DR, kits e guias de steward |
| [`strategy/`](./strategy/) | Teses, direcionamento e backlogs (inclui o caminho até a rede pública) |
| [`pilot/`](./pilot/) | Piloto e teste aberto: go/no-go, retrospectiva, convite, carta de moderação |
| [`research/`](./research/) | Pesquisas verificadas (Deep Research, buscas complementares) |
| [`brainstorms/`](./brainstorms/) | Brainstorms ativos (não substituem o ROADMAP) |
| [`audits/`](./audits/) | Auditorias de copy, branding, segurança/descoberta |
| [`product/`](./product/) | Posicionamento, proposta pública, spikes e templates de produto |
| [`process/`](./process/) | Como trabalhamos: mutex de agentes, operação Antigravity, lições |
| [`legal/`](./legal/) | Conformidade (LGPD, Marco Civil) e licença |
| [`design/`](./design/) · [`branding/`](./branding/) | Design system Sovereign Agora e arquivos de marca |
| [`metrics/`](./metrics/) | Baselines de complexidade geradas por `npm run audit:complexity` |
| [`archive/`](./archive/) | Planos e brainstorms SUPERSEDED, mantidos como histórico |
| [`agent-reports/`](./agent-reports/) | Relatórios de agentes (template do workspace) |

## Fonte de verdade — qual arquivo manda em quê

| Assunto | Documento canônico |
|---|---|
| Prioridades, caixas `[ ]`, DoD | [ROADMAP.md](./ROADMAP.md) |
| Estado real de cada funcionalidade | [FEATURES.md](./FEATURES.md) |
| SHA, contagem de testes, `CACHE_NAME` | [release-metadata.json](./release-metadata.json) (gerado por `npm run release-line`) |
| Infra, deploy, secrets, custos | [INFRA-CUSTOS.md](./INFRA-CUSTOS.md) |
| API do relay | [relay-api.md](./specs/relay-api.md) |
| Testes e CI | [TESTES.md](./TESTES.md) |
| Limites de complexidade | [HARDENING.md](./HARDENING.md) |
| Modelo de ameaças | [THREAT-MODEL.md](./THREAT-MODEL.md) |
| Dependências e cadeia de suprimentos | [DEPENDENCIAS.md](./DEPENDENCIAS.md) |
| Resposta a incidentes | [runbook-incidentes.md](./operations/runbook-incidentes.md) |
| Mutex de agentes | [metodo-agentes-mutex-e-revisor.md](./process/metodo-agentes-mutex-e-revisor.md) |
| Evidência de testes, falso verde e auditoria | [qualidade-e-evidencia.md](./process/qualidade-e-evidencia.md) |
| Primeiras tarefas para contribuir (PM-41, rascunho) | [primeiras-tarefas-contribuidor.md](./process/primeiras-tarefas-contribuidor.md) |
| Segunda pessoa com acesso em etapas (LAN-30, rascunho) | [segunda-pessoa-acesso-gradual.md](./process/segunda-pessoa-acesso-gradual.md) |
| Licença | [ADR-015](./adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md) · [licenca-e-contribuicoes.md](./legal/licenca-e-contribuicoes.md) |
| Decisões institucionais e de arquitetura (registro) | [DECISOES.md](./DECISOES.md) |
| ADRs (detalhe de cada decisão) | [adr/README.md](./adr/README.md) |
| Tese de tração e preceitos | [direcionamento-crescimento-rede-2026-11.md](./strategy/direcionamento-crescimento-rede-2026-11.md) |
| Norma de documentação | [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) |

> [!IMPORTANT]
> **Regra anti-inflação:** é proibido criar outro plano mestre ("N=…", "T1–T10", checklist paralelo) sem um ADR que revogue o atual — hoje o [ADR-017](./adr/017-consolidacao-roadmap-unico.md). Ideias novas entram como brainstorm (banner + "Não substitui o ROADMAP").

---

## 1. Arquitetura e protocolo

- [../ARCHITECTURE.md](../ARCHITECTURE.md): protocolo, tags GraphQL, dados · [ARCHITECTURE.md](./ARCHITECTURE.md): camadas do cliente
- [IDENTITY.md](./IDENTITY.md): chaves, cofre e recuperação · [DNS-HANDLES.md](./specs/DNS-HANDLES.md): handles `@`
- [login-social.md](./specs/login-social.md): login social, contas vinculadas e configuração de deploy do OAuth
- [relay-api.md](./specs/relay-api.md): endpoints de `server.py` e `signaling.py`
- [medicao-midia-v2-pm70-2026-11.md](./research/medicao-midia-v2-pm70-2026-11.md): medição da mídia v2 no desktop (AVIF q66, H.264, Opus) e o que muda na implementação
- [midia-v2.md](./specs/midia-v2.md): mídia retrô: AVIF q70 em 540p, Opus 32 kbps e H.264 480p24, com pedaços abaixo de 100 KB (não implementada)
- [canal-comunidade-v0.md](./specs/canal-comunidade-v0.md): canal, comunidade em que só a moderação publica posts (implementado)
- [moderador-natural-v0.md](./specs/moderador-natural-v0.md): vínculo assinado (implementado) e moderador natural nas denúncias (a implementar)
- [sync-inventario-v0.md](./specs/sync-inventario-v0.md): sincronização ao conectar por inventário, só o que falta (implementada)
- [mochila-dm-v0.md](./specs/mochila-dm-v0.md): caixa de saída das DMs (implementada) e repasse cego por outros aparelhos (não implementado)
- [replicacao-por-grau-v0.md](./specs/replicacao-por-grau-v0.md): mídia no aparelho, replicação por grau de amizade com teto de 500 MB (não implementada)
- [voluntariado-tres-trabalhos.md](./product/voluntariado-tres-trabalhos.md): os três trabalhos voluntários do piloto
- [../client/DEV.md](../client/DEV.md): guia do desenvolvedor §0–§44 (histórico por sprint)
- **ADRs:** [índice com status](./adr/README.md) (001–027) · [registro de decisões](./DECISOES.md) · **RFCs:** [rfc/README.md](./rfc/README.md) · [0001 — POSSE export](./rfc/0001-posse-export.md)

### Specs de protocolo (malha, cache, módulos)

- [antigravity-gossip-retract-v1.md](./specs/antigravity-gossip-retract-v1.md): retratação no gossip (implementado)
- [antigravity-blob-soft-priority-v0.md](./specs/antigravity-blob-soft-priority-v0.md): prioridade suave de blobs (flag desligada)
- [cache-manifest-v0.md](./specs/cache-manifest-v0.md): manifestos de cache assinados
- [profile-card-gossip-v0.md](./specs/profile-card-gossip-v0.md): cartão de perfil na malha (ver ADR-003)
- [listing-signed-gossip-v1.md](./specs/listing-signed-gossip-v1.md): ofertas da Feira assinadas
- [mirror-validate-v1.md](./specs/mirror-validate-v1.md): validação de espelho no relay
- [community-module-manifest-v0.md](./specs/community-module-manifest-v0.md): manifesto de módulos de comunidade (backlog)
- [open-frames-v2.md](./specs/open-frames-v2.md): Open Frames no feed
- [embed-integration.md](./specs/embed-integration.md): widget embed · [vox-bridge-spike.md](./product/vox-bridge-spike.md): extensão MV3
- [governance-proposta-feira-pin-template.md](./product/governance-proposta-feira-pin-template.md): template de proposta Feira ↔ pin

## 2. Roadmap, estratégia e teses

- [ROADMAP.md](./ROADMAP.md): **plano vivo**
- [direcionamento-crescimento-rede-2026-11.md](./strategy/direcionamento-crescimento-rede-2026-11.md): preceitos, escada de 4 camadas, moderação E1–E5
- [rede-sustentada-participantes.md](./strategy/rede-sustentada-participantes.md) · [backlog-participacao-rede.md](./strategy/backlog-participacao-rede.md) (IDs V-P) · [infra-participativa-blindagem-crescimento.md](./strategy/infra-participativa-blindagem-crescimento.md) · [espacos-digitais-infra.md](./strategy/espacos-digitais-infra.md) (V-I01)
- [campo-debate-aberto-ndp-2026-10.md](./strategy/campo-debate-aberto-ndp-2026-10.md): notas de campo, modelos A–D
- [estrategia-5-pontos-fracos-90-dias-2026-11.md](./strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md): **plano de 90 dias por ponto fraco**, com as decisões de 10/11 (cunha do piloto: modo assembleia)
- [mapa-parceiras-e-concorrentes-2026-11.md](./strategy/mapa-parceiras-e-concorrentes-2026-11.md): **20 parceiras e 20 concorrentes para observar** (com fonte, confiança e pendências)
- [tese-praca-civica-militancia-pro-democratica-2026-10.md](./strategy/tese-praca-civica-militancia-pro-democratica-2026-10.md): praça E+D, T01–T20
- [antigravity-estrategia-mantenedor-revisor-2026.md](./strategy/antigravity-estrategia-mantenedor-revisor-2026.md): transição mantenedor → revisor
- [POSITIONING.md](./product/POSITIONING.md) · [LESSONS.md](./process/LESSONS.md) · [../GOVERNANCE.md](../GOVERNANCE.md) · [COMPLIANCE-BR.md](./legal/COMPLIANCE-BR.md) · [briefing-parecer-g1.md](./legal/briefing-parecer-g1.md) (rascunho do pedido de parecer do G1, REV-12/LAN-01)

### Rede pública (portões G1–G3)

- [backlog-lancamento-publico-2026-11.md](./strategy/backlog-lancamento-publico-2026-11.md): **caminho até a rede pública** — 10 critérios, portões G1–G3, backlog LAN-01…36 por épico, ordem e cortes de escopo
- [proposta-nlnet-restack-2027.md](./strategy/proposta-nlnet-restack-2027.md): rascunho da proposta ao NLnet Restack (PM-42, prazo 03/01/2027), riscos e checklist
- [plano-lancamento-ondas.md](./strategy/plano-lancamento-ondas.md): ondas 0–3, quem decide abrir e pausar, gatilhos de pausa (LAN-34, rascunho)

### Pesquisa verificada

- [pesquisa-deep-research-2026-11.md](./research/pesquisa-deep-research-2026-11.md): **resultado verificado dos 3 prompts** (o que se confirmou, o que falta conferir, o que foi descartado)
- [pesquisa-complementar-2026-11.md](./research/pesquisa-complementar-2026-11.md): **Prompt 4 respondido (busca direta + avaliação do relatório do Gemini) + brainstorm B1–B12** (STF itens 7–11, decretos de 2026, ECA Digital, TSE 23.755, Pix/DICT, IPv6 por operadora, Render, Nostr, financiamento)
- [pesquisa-ancoragem-churn-infra-2026-11.md](./research/pesquisa-ancoragem-churn-infra-2026-11.md): ancoragem no Arweave, churn P2P, WebRTC móvel, LGPD e auditoria R1–R9, com a comparação ao relatório do Gemini

### Brainstorms (ideias; não são plano)

- [brainstorm-backlog-proximas-melhorias-2026-11.md](./brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md): **revisão de estado de 09/11 + backlog PM-01…PM-64** (peso, segurança, rede, assembleia, Nostr, contribuidores; adendo com a pesquisa de churn, ler antes de entrar, voto secreto, ofício) e ordem sugerida
- [brainstorm-autossustento-10-features-2026-11.md](./brainstorms/brainstorm-autossustento-10-features-2026-11.md): **10 features de autossustento a custo ~zero + 3 prompts de pesquisa**
- [brainstorm-sustentacao-perene-celulares-nos-base.md](./brainstorms/brainstorm-sustentacao-perene-celulares-nos-base.md): infra $0, celulares como nós
- [brainstorm-sinergia-tramitado-vox-2026-11.md](./brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md): Tramitado × Vox, contrato LCP
- [brainstorm-auto-escala-organica-2026-10.md](./brainstorms/brainstorm-auto-escala-organica-2026-10.md): flywheel, SLOs, moderação voluntária
- [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorms/brainstorm-tracao-escalabilidade-incubacao.md) · [incubacao-p2-backlog.md](./strategy/incubacao-p2-backlog.md)
- [brainstorm-oauth-tradicional-descoberta-2026-10-24.md](./brainstorms/brainstorm-oauth-tradicional-descoberta-2026-10-24.md): OAuth e descoberta social
- [brainstorm-5-pontos-fracos-2026-11-10.md](./brainstorms/brainstorm-5-pontos-fracos-2026-11-10.md): **os 5 pontos fracos do produto hoje** (identidade, falso verde, densidade da rede, exposição de quem participa, concentração), com ação e métrica para cada um
- [brainstorm-terceiro-lugar-2026-11-10.md](./brainstorms/brainstorm-terceiro-lugar-2026-11-10.md): **o Vox como "terceiro lugar"**: raiz comum dos pontos fracos, ferramentas de quem organiza usadas a partir do WhatsApp, escada de esforço do membro, ata em sessão permanente (Lei 14.309/2022), distribuição de guerrilha
- [brainstorm-publico-e-gestos-conhecidos-2026-11-10.md](./brainstorms/brainstorm-publico-e-gestos-conhecidos-2026-11-10.md): **para quem e com que gestos**: 10 perfis de usuários no Brasil, alvo (quem organiza 50+, membros só-celular, associações rurais), mapa de gestos conhecidos com o estado no código, identidade visual
- [brainstorm-captacao-por-perfil-2026-11-10.md](./brainstorms/brainstorm-captacao-por-perfil-2026-11-10.md): **dez estratégias de captação, uma por perfil**: papel de cada perfil (quem organiza, membro, quem constrói, quem ensina, parceiro, embaixador; Geração Alpha não é captada), gancho, canal, primeiro passo sem código, no máximo três frentes ao mesmo tempo
- [brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md](./brainstorms/brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md): **da praça-cartório à rede de ação**: onda de soberania digital (Estado, regulação, militância organizada; não migração de usuários), oito verbos de uma rede viva com a missão no centro, fórmula dor → ponte → núcleo → missão → registro, grupos engajados e regras de neutralidade
- [brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md](./brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md): **nichos fiéis como colunas de um "WeChat democrático"**: nove nichos com compromisso que volta (associações, agricultura familiar/PNAE, escola/PDDE, conselhos, movimentos…), teto comum de identidade, registro e mini-apps, seis regras para integrar com o governo sem ser do governo
- [brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md](./brainstorms/brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md): crítica ao método (motivou o ADR-017)

## 3. Operações: steward, espelhos, DR

- [INFRA-CUSTOS.md](./INFRA-CUSTOS.md): mapa de hosts, workflows e secrets
- [runbook-incidentes.md](./operations/runbook-incidentes.md): o que fazer nos primeiros 15 min de cada incidente, kill-switch e simulados (LAN-24, falta o 1º simulado)
- [steward-relay-kit.md](./operations/steward-relay-kit.md) · [steward-seed-15min.md](./operations/steward-seed-15min.md) · [steward-relay-buddy.md](./operations/steward-relay-buddy.md) (V-P08: segundo voluntário antes do burnout)
- [ops-shell-mirrors.md](./operations/ops-shell-mirrors.md): espelhos shell A/B · [ops-dr-drill-checklist.md](./operations/ops-dr-drill-checklist.md) · [ops-pages-rollback.md](./operations/ops-pages-rollback.md)
- [antigravity-operating.md](./process/antigravity-operating.md): operação da malha
- Emergência de **72 h** (relay + TTL do inbox): restaurar ou usar URL alternativa. Se o PWA cair, use o shell A/B. Steward ≠ mod ([GOVERNANCE.md](../GOVERNANCE.md)).
- Componentes: [relay/README.md](../relay/README.md) · [relay/deploy/README.md](../relay/deploy/README.md) (VPS + TURN) · [vox-populi/README.md](../vox-populi/README.md) · [android/README.md](../android/README.md) · [vox-bridge/README.md](../vox-bridge/README.md)
- Ferramentas: [desktop-linux](../packaging/desktop-linux/README.md) · [desktop-seeder-windows](../packaging/desktop-seeder-windows/README.md) · [desktop-windows-native](../packaging/desktop-windows-native/README.md) · [node-macos](../packaging/node-macos/README.md) · [node-zero-windows](../packaging/node-zero-windows/README.md) · [steward-kit-windows](../packaging/steward-kit-windows/README.md) · [posse-cli](../tools/posse-cli/README.md)
- [vox-populi-task-order-004-hardware-validation.md](./operations/vox-populi-task-order-004-hardware-validation.md): validação de hardware do nó

## 4. Piloto e teste aberto

- [piloto-g1-roteiro-conversa.md](./pilot/piloto-g1-roteiro-conversa.md) · [piloto-g1-convite.md](./pilot/piloto-g1-convite.md): rascunhos da conversa com comunidades candidatas e do convite (PIL-01)
- [piloto-comunidade-go-no-go.md](./pilot/piloto-comunidade-go-no-go.md): gate humano (V-P09) · [piloto-comunidade-retrospectiva-template.md](./pilot/piloto-comunidade-retrospectiva-template.md)
- [teste-aberto-convite.md](./pilot/teste-aberto-convite.md) · [teste-aberto-canal-apoio.md](./pilot/teste-aberto-canal-apoio.md) · [teste-aberto-carta-moderacao-e2.md](./pilot/teste-aberto-carta-moderacao-e2.md) · [teste-aberto-demo.md](./pilot/teste-aberto-demo.md) (comunidade `demo-aprenda-vox`)
- [vox-brasil-welcome-profile.md](./pilot/vox-brasil-welcome-profile.md): perfil de boas-vindas · [formulário de bug para testadores](../.github/ISSUE_TEMPLATE/bug-tester.yml)

## 5. Desenvolvimento, qualidade e governança do repo

- [../CONTRIBUTING.md](../CONTRIBUTING.md) · [../CONTRIBUTORS.md](../CONTRIBUTORS.md) (DCO) · [../SECURITY.md](../SECURITY.md) · [../AUTHORS.md](../AUTHORS.md)
- [TESTES.md](./TESTES.md) · [HARDENING.md](./HARDENING.md) · [DEPENDENCIAS.md](./DEPENDENCIAS.md) (inventário e rotina mensal, LAN-20) · métricas de complexidade: `metrics/baseline-AAAA-MM-DD.md`, geradas por `npm run audit:complexity` (a mais recente: [2026-11-09](./metrics/baseline-2026-11-09.md))
- [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) · [metodo-agentes-mutex-e-revisor.md](./process/metodo-agentes-mutex-e-revisor.md) · [licenca-e-contribuicoes.md](./legal/licenca-e-contribuicoes.md)
- Design: [ADR-016](./adr/016-design-system-sovereign-agora-e-democracia-direta.md) · [Sovereign Agora DESIGN.md](design/sovereign-agora.md) · [design/stitch-telas-faltantes.md](./design/stitch-telas-faltantes.md)
- [proposta-vox.html](./product/proposta-vox.html): proposta em linguagem leiga

## 6. Auditorias e snapshots

- [honest-copy-audit-2026-10-23.md](./audits/honest-copy-audit-2026-10-23.md): copy honesta (re-auditoria = DOC-04 no ROADMAP)
- [revisao-devsecops-2026-11-10.md](./audits/revisao-devsecops-2026-11-10.md) — estado, arquitetura, segurança e pipeline (10/11/2026)
- [auditoria-permaweb-descoberta-seguranca-2026-10-29.md](./audits/auditoria-permaweb-descoberta-seguranca-2026-10-29.md)
- [branding-audit-2026-11-01.md](./audits/branding-audit-2026-11-01.md)
- [agent-reports/2026-11-05-auditoria-independente.md](./agent-reports/2026-11-05-auditoria-independente.md)

## 7. Histórico / SUPERSEDED (não usar como plano)

Mantidos para registro; cada um tem banner apontando o sucessor.

- [dossie-geral-inventario-master-breakdown-2026-11.md](./archive/dossie-geral-inventario-master-breakdown-2026-11.md): plano N=25 → [ROADMAP.md](./ROADMAP.md)
- [inventario-estado-e-tarefas-documentacao-2026-11.md](./archive/inventario-estado-e-tarefas-documentacao-2026-11.md) → [FEATURES.md](./FEATURES.md) + ROADMAP
- [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) e [brainstorm-dez-tarefas-estrategia-2026-10.md](./archive/brainstorm-dez-tarefas-estrategia-2026-10.md) → ROADMAP
- [revisao-estado-2026-10-25.md](./archive/revisao-estado-2026-10-25.md): snapshot de 25/out
- [gateway-honest-fallback-brainstorm.md](./archive/gateway-honest-fallback-brainstorm.md) → ADR-004 · [steward-wizard-brainstorm.md](./archive/steward-wizard-brainstorm.md) → steward-relay-kit
- Métricas antigas: [10-24](./metrics/baseline-2026-10-24.md) · [10-30](./metrics/baseline-2026-10-30.md) · [10-31](./metrics/baseline-2026-10-31.md) · [11-01](./metrics/baseline-2026-11-01.md) · [11-04](./metrics/baseline-2026-11-04.md) · [11-05](./metrics/baseline-2026-11-05.md) · [11-06](./metrics/baseline-2026-11-06.md)

**Versão:** 2.2 · 2026-11-08
