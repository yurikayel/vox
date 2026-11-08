# Roadmap — Vox

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08 (implementação do G1 em andamento na branch `feat/lan-g1-fundamentos`)
> **Único plano vivo e único lugar com caixas `[ ]`** ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)). Substitui o checklist do [dossiê N=25 §3.6](./archive/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25).
> Estado do produto: [FEATURES.md](./FEATURES.md) · Infra e riscos: [INFRA-CUSTOS.md](./INFRA-CUSTOS.md) · Teses: [direcionamento-crescimento-rede-2026-11.md](./strategy/direcionamento-crescimento-rede-2026-11.md)

**Tipo de DoD** ([CONTRIBUTING-DOCS §3](./CONTRIBUTING-DOCS.md)): `doc` = texto revisado e indexado · `code` = merge em `main` com `npm test` verde · `ops-humano` = evidência fora do git (URL, print, ata) citada na linha. Marque `[x]` só com a evidência.

## Onde estamos (nov/2026)

O cliente está maduro: feed Social/Cívico, comunidades, governança, Feira, Pix Zaps, DMs E2E, contas vinculadas, fluxos em etapas. Ver o [CHANGELOG](../CHANGELOG.md). O que falta para a rede **se sustentar sem o mantenedor** é quase tudo **infra e gente**:

- a sinalização depende de 1 nó Render;
- não há relay completo público nem TURN;
- não existe espelho B registrado;
- o piloto humano (V-P09) não começou;
- para abrir ao público faltam jurídico, resposta a conteúdo grave, demo isolada e bus factor ≥2 — ver [Rumo à rede pública](#rumo-à-rede-pública-lan).

## Agora (P0)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **NET-01** | ops-humano | Espelho shell **B** no ar + registro público | [ops-shell-mirrors.md](./operations/ops-shell-mirrors.md) — não marcar só por doc |
| [ ] | **NET-02** | ops-humano | Drill de DR datado | [ops-dr-drill-checklist.md](./operations/ops-dr-drill-checklist.md) |
| [ ] | **REV-01** | ops-humano | **2º nó de sinalização** em `client/config/signaling.json` — **Cloudflare Durable Object** (Workers Free, sem sleep). ~~Koyeb~~: escala a zero após 1 h e o Starter vai sair ([complementar F3](./research/pesquisa-complementar-2026-11.md#f-infraestrutura)). ~~HF Space~~: Docker Spaces agora exigem plano pago ([pesquisa V6](./research/pesquisa-deep-research-2026-11.md)) | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade) |
| [ ] | **REV-09** | code | **F1 sobe para P0:** sinalização por Nostr efêmero cifrado (faixa 20000–29999, ICE agrupado, sem dependência nova). Depois dela, aposentar o cron de keepalive do Render | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge; em paralelo ao Render. Ida e volta ok em relays reais (3,3 s). Aposentar o keepalive só depois de medir em campo · [pesquisa §4](./research/pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-12** | ops-humano | **Jurídico pós-STF (Temas 987/533) + Decretos 12.975/12.976/2026 + ECA Digital:** parecer sobre (1) se o Vox/mantenedor ou um voluntário de relay é "provedor de aplicação" e se a cláusula residual "sem interferência no fluxo" alcança um cliente cronológico (B4); (2) o item 11 da tese — **sede e representante pessoa jurídica no país** — para um projeto sem CNPJ (B1); (3) itens 8–10: autorregulação, canal para não usuários, relatório anual (B3); (4) a Feira sob o CDC (**o item 7 confirma** que marketplaces respondem pelo CDC); (5) ECA Digital para um serviço de "provável acesso" de adolescentes (B6) — antes de qualquer código | [complementar §1-B](./research/pesquisa-complementar-2026-11.md) |
| [ ] | **REV-13** | code | **Aviso nos Pix Zaps (já no ar):** o BCB manda mostrar ao pagador o nome do recebedor **conforme o DICT, com qualquer chave** (inclusive aleatória). A UI deve dizer "seu nome civil aparece para quem paga" e oferecer Zap para a chave do coletivo (B2). ~~Recomendar chave aleatória~~ (não protege) | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge · [complementar §1-E](./research/pesquisa-complementar-2026-11.md#e-pix-e-privacidade-do-recebedor) |
| [ ] | **REV-18** | ops-humano | **Decidir a associação/PJ (B1):** CNPJ, chave Pix do coletivo, representante legal, conta para editais. Depende do REV-12 e de pesquisar o custo de abertura | [complementar B1](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-19** | code | **Teste de fumaça Nostr (B7):** workflow semanal que publica e lê um evento efêmero em cada relay do pool (damus, nos.lol, nostr.mom, offchain.pub, snort) e grava a taxa de sucesso. Pré-requisito do REV-09 | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge; 1ª execução local: 6/7 relays ok, `eden.nostr.land` pede pagamento · [complementar §1-G](./research/pesquisa-complementar-2026-11.md#g-nostr-para-sinalização) |
| [ ] | **PIL-01** | ops-humano | Comunidade + facilitador nomeados (10–30 pessoas) | [piloto-comunidade-go-no-go.md](./pilot/piloto-comunidade-go-no-go.md) |
| [ ] | **PIL-02** | ops-humano | **V-P09** semanas 0–4 (*blocked-human*) | [template de retrospectiva](./pilot/piloto-comunidade-retrospectiva-template.md) |
| [ ] | **PIL-03** | ops-humano | Retrospectiva preenchida | idem |
| [ ] | **REV-07** | doc | ✅ cota confirmada (vitalícia, por carteira e por sub-rede — [pesquisa V1](./research/pesquisa-deep-research-2026-11.md)); falta a decisão de política, que é o **REV-11**. **Confirmar o modelo de cota do Turbo** (`https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB)) e decidir a política: o que vai para o permaweb, o que fica só na malha, e quem paga o crédito | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade), Prompt 2 do brainstorm |
| [ ] | **DOC-04** | doc | Re-auditoria de copy honesta, incluindo "Capacidades" do README × [FEATURES.md](./FEATURES.md) (Webxdc já corrigido para "laboratório") | [honest-copy-audit](./audits/honest-copy-audit-2026-10-23.md) |

## Próximo (P1)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **REV-11** | code | **Efêmero por padrão, permanente por consenso:** post social e Feira só na malha (TTL); no Arweave só propostas, votos consolidados e manifestos (ou hash). Medidor de cota via `getFreeStatus()` | [pesquisa §4](./research/pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-14** | code | **Chave no iOS:** plugar `storage-persistence`, guia "Adicionar à Tela de Início" no Safari e backup do cofre em cartão QR | [pesquisa §2](./research/pesquisa-deep-research-2026-11.md#2-plausível-não-verificado-confirmar-antes-de-usar) |
| [ ] | **REV-10** | code | **TURN:** um Worker gera credenciais temporárias do Cloudflare Realtime TURN (1.000 GB/mês grátis, compartilhados com o SFU; `POST …/credentials/generate-ice-servers`); uso só em falha direta, **com orçamento num Durable Object abaixo de ~800 GB/mês (B9)** + modo "privacidade de IP" | [pesquisa V5](./research/pesquisa-deep-research-2026-11.md) |
| [ ] | **REV-20** | doc | **Kit de autorregulação mínimo (B3):** página de regras versionada, canal de notificação para não usuários (issue form), relatório anual de transparência gerado do log de ocultações — redação final depois do REV-12 | [complementar B3](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-21** | ops-humano | **Banda do Render (B8):** anotar a banda incluída real (Billing → *Monthly Included Usage*). Garantir que o nó só sinaliza, com limite de taxa e `/metrics` de bytes de saída. Sem cartão, estourar a banda suspende **todos** os serviços Free até o fim do mês; 750 h/workspace = um só serviço sempre ligado | [complementar §1-F](./research/pesquisa-complementar-2026-11.md#f-infraestrutura) |
| [ ] | **REV-22** | ops-humano | **`FUNDING.yml` + GitHub Sponsors (B10):** Brasil é região aceita, 0% em patrocínio pessoal. NGI Zero Commons encerrado (01/06/2026); acompanhar NLnet (03/01/2027) e OTF IFF | [complementar §1-H](./research/pesquisa-complementar-2026-11.md#h-financiamento) |
| [ ] | **REV-02** | code | Decidir, módulo a módulo, **plugar ou arquivar** os 11 módulos "escritos, não plugados" | lista em [FEATURES.md](./FEATURES.md); vários viram features do brainstorm |
| [ ] | **REV-03** | code | Teste que falha se `docs/release-metadata.json.cache_name` ≠ `CACHE_NAME` do `sw.js` (impede drift) | [TESTES.md](./TESTES.md) |
| [ ] | **REV-04** | ops-humano | **Relay completo público** operado por steward (inbox de DM, `/oauth/exchange`, cofre) com buddy | [relay-api.md](./specs/relay-api.md), [steward-relay-buddy.md](./operations/steward-relay-buddy.md) |
| [ ] | **NET-04** | ops-humano | Smoke de steward por alguém que não seja o mantenedor | [steward-relay-kit.md](./operations/steward-relay-kit.md) |
| [ ] | **PIL-04** | ops-humano | Barra da semana 4: ≥3 Apoiadores ou 1 steward + espelho OK | V-P04/05/06 |
| [ ] | **PIL-05** | ops-humano | Ciclo de moderação E1–E5 evidenciado | [auto-escala § C.5](./brainstorms/brainstorm-auto-escala-organica-2026-10.md) |
| [ ] | **CODE-02** | code | Métricas honestas v2 (T5) — `read_origin` local | [pós-v82 T5](./archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **CODE-04** | doc | Documentar a flag V-I09 (soft priority, padrão desligado) em DEV | [antigravity-blob-soft-priority-v0](./specs/antigravity-blob-soft-priority-v0.md) |
| [ ] | **REV-05** | doc | Voxpedia (`#/voxpedia`) atualizada com as features de nov/2026 | `render/voxpedia.js` |

## Depois (P2)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **CODE-03** | code | V-P07: UI de exportação de atestação (ADR-001) | `contribution-attestation.js` já aparece em `#/settings/network`; **verificar se fecha** |
| [ ] | **CODE-05** | doc | ADR de fallback de gateway | [ADR-004](./adr/004-gateway-honest-fallback.md) existe (accepted); **verificar se fecha** |
| [ ] | **NET-05** | doc | Registro de espelhos de comunidade | [COMPLIANCE-BR](legal/COMPLIANCE-BR.md) |
| [ ] | **EXP-02** | code | Widget embed | [embed-integration.md](./specs/embed-integration.md) |
| [ ] | **EXP-03** | doc | Spec de fork de comunidade | [pós-v82 T9](./archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **EXP-04** | code | Backup em HTML standalone | — |
| [ ] | **EXP-05** | doc | Decisão sobre o Bridge MV3 depois do piloto | [vox-bridge-spike.md](./product/vox-bridge-spike.md) |
| [ ] | **REV-08** | ops-humano | **Selo gov.br opcional via parceiro público** ([ADR-018](./adr/018-selo-govbr-via-parceiro-publico.md), proposed): achar parceiro com domínio oficial (`*.edu.br`, `*.leg.br`), confirmar o uso permitido do Login Único, obter parecer LGPD e escrever RFC do atestado | Parceiro nomeado + resposta do Serviço de Integração + parecer citados aqui |
| [ ] | **REV-15** | code | **F6 redesenhada:** guardião na tomada (app aberto, Wake Lock, só no Wi-Fi); `periodicSync` só como complemento no Chromium | [pesquisa V7/V8](./research/pesquisa-deep-research-2026-11.md) |
| [x] | **REV-17** | doc | Rodar o **Prompt 4 (busca complementar)** e incorporar o resultado — feito por busca direta em 2026-11-08; lacunas na §3 | [pesquisa-complementar-2026-11.md](./research/pesquisa-complementar-2026-11.md) |
| [ ] | **REV-23** | code | **Padrões seguros por idade sem coletar dado (B6):** faixa etária autodeclarada só no aparelho; abaixo de 18 sem DM de desconhecidos, Pix Zap e Feira geolocalizada; **abaixo de 16, conta vinculada a um responsável** (exigência do ECA Digital) por aval de chave via QR. Depois do REV-12 |
| [ ] | **REV-24** | code | **Modo eleitoral do ranking (B11):** no período eleitoral, nada de ranquear ou recomendar conteúdo sobre candidato, partido ou campanha (Res. TSE 23.755/2026); feed cronológico. Prazo: antes de ago/2028 | [complementar §1-B](./research/pesquisa-complementar-2026-11.md) | [complementar B6](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-16** | doc | Rodar de novo o Prompt 3 **com os arquivos anexados** (o Gemini não abriu os links do repo) e só então escrever as specs F1–F10 | [pesquisa — Como ler](./research/pesquisa-deep-research-2026-11.md#como-ler) |
| [ ] | **REV-06** | code | Trocar hotlinks `images.unsplash.com` (~35) por assets locais ou remover | [INFRA-CUSTOS §1](./INFRA-CUSTOS.md) |

## Rumo à rede pública (LAN)

Porquê, critérios, fases e ordem: [backlog-lancamento-publico-2026-11.md](./strategy/backlog-lancamento-publico-2026-11.md). Três portões: **G1** piloto fechado → **G2** beta por convite → **G3** público. O caminho crítico é o **REV-12** (parecer), via LAN-01. "Resp." fica no backlog como papel até haver pessoa nomeada.

### G1 — piloto fechado

Também exige: REV-13 · REV-19 + (REV-01 ou REV-09) · NET-01 ou waiver · PIL-01 · carta E2.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-01** | ops-humano | **Contratar o parecer do REV-12** (clínica jurídica / direitos digitais), escopo e prazo acordados | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-10** | code | **Demonstração isolada:** `mock.js` só em `#/demo` com faixa; falha de rede mostra "sem conexão", nunca perfis/propostas fictícios | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-11** | code | **Aviso de permanência** antes do 1º post que vai para o Arweave | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge (escolha "só na malha" também cobre parte do REV-11) · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-17** | ops-humano | **Divulgação de vulnerabilidades funcionando** (Private Vulnerability Reporting + contato do SECURITY.md testado) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-30** | ops-humano | **Bus factor ≥2** — G1: 2ª pessoa no GitHub e no Render; G3: todas as contas, domínio e secrets, em organização | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

### G2 — beta por convite

Também exige: PIL-02…05 · REV-12 · REV-20 · REV-23 · REV-09 · REV-10 · NET-02 · REV-21 · REV-14 · REV-11.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-02** | doc+code | **Termos de Uso** (`client/terms.html`) com aceite no onboarding — revisados pelo parecer | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-03** | doc | **Atualizar privacy, data-deletion e COMPLIANCE-BR** (STF 5–11, Decretos 2026, ECA Digital, TSE 23.755, Pix/DICT, IP na malha) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-04** | doc+ops-humano | **Procedimento de conteúdo grave** (≤2 h para íntimo não consentido), plantão de 2 pessoas, simulado datado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-07** | code | **Página de status pública** gerada por workflow (nós, relays Nostr, gateways) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-08** | code | **Kill-switch por configuração** (`client/config/flags.json`: upload, Feira, Pix Zaps, convites) | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-12** | code | **Denunciar no app** (post/perfil/comunidade) → moderadores; graves → canal do projeto | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge; denúncia é local + DM cifrada ao moderador, sem fila central · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-13** | code | **Lista de ocultação assinada do PWA oficial**, exportável para gateways AR.IO | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-15** | doc | **Modelo de ameaças** (`docs/THREAT-MODEL.md`) revisado por alguém de segurança fora do time | 🚧 rascunho em [THREAT-MODEL.md](./THREAT-MODEL.md); falta revisão externa · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-16** | code | **CSP e headers** (`_headers` no CF Pages + meta CSP no GitHub Pages) | 🚧 implementado em `feat/lan-g1-fundamentos`, falta merge; scripts inline viraram `js/boot-*.js` · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-21** | code | **Estados de erro honestos** (sinalização caída, cota esgotada, 402 do gateway, DM sem relay) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-24** | doc | **Runbook de incidentes** + 1 simulado datado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-28** | doc | **Critério de go para o beta** escrito antes do piloto (retenção, steward externo, incidentes, P2P, cota) | 🚧 rascunho no [go/no-go](./pilot/piloto-comunidade-go-no-go.md#critério-de-go-para-o-beta-por-convite-lan-28); falta o grupo aceitar · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

### G3 — público

Também exige: REV-18 · DOC-04 · REV-02 · REV-04 (ou LAN-21 cobrindo DM offline) · F8 antes de enquete cívica pública com peso.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-05** | ops-humano | **Busca de anterioridade da marca "Vox"** no INPI | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-06** | ops-humano | **Domínio próprio** com dois titulares (ou titular PJ) e DNS documentado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-09** | code+doc | **Teste de carga** (≥500 pares na sinalização, 50 reais na malha); capacidade em INFRA-CUSTOS | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-14** | code | **Anti-spam e limite de taxa** por chave; quarentena de chave nova | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-18** | ops-humano | **Revisão externa de cripto** (DM, cofre, assinaturas); críticos corrigidos | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-19** | code | **Privacidade de IP:** aviso + modo "só TURN" (padrão para menores) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-20** | code | **Cadeia de suprimentos:** inventário de dependências com SRI + `npm audit` no CI | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-22** | code | **Acessibilidade WCAG 2.2 AA básica** nas 10 rotas principais | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-23** | code | **Desempenho em Android de entrada** com orçamento que quebra o CI | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-25** | ops-humano | **Onboarding com 5 leigos** (identidade, backup, post, comunidade, recuperação) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-26** | ops-humano | **Suporte:** formulários de issue + canal Zap/Telegram, triagem semanal | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-27** | code | **Leitura resiliente:** ≥4 gateways, 402 do turbo-gateway = trocar de gateway | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-29** | doc | **Relatório do beta** e decisão de go público | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-31** | doc | **Governança do PWA oficial** (lista de ocultação, Termos, releases) no GOVERNANCE.md | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-32** | doc | **Orçamento de 12 meses** para 1k/10k usuários com cobertura confirmada | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-33** | doc+code | **Release v1.0.0** com checklist e rollback ensaiado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-34** | doc | **Plano de lançamento em ondas** com critérios de pausa | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-35** | doc+code | **Página de apresentação e kit de imprensa** (o que é e o que não é) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

### Financiamento (sem portão)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-36** | ops-humano | **Proposta ao NLnet Restack até 03/01/2027** usando o backlog como plano de trabalho | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

## Candidatas (sem caixa até ganharem DoD e responsável)

Do [brainstorm de autossustento](./brainstorms/brainstorm-autossustento-10-features-2026-11.md). Pesquisar antes com os 3 prompts do mesmo doc.

| # | Feature | Eixo | Reaproveita |
|---|---|---|---|
| F1 | Sinalização sem servidor (Nostr + trackers) | infra | `nostr-signaling.js`, `webrtc-peer.js` |
| F2 | Convite por QR/link que já faz o pareamento | crescimento | `airgap-webrtc.js`, `qr-url.js` |
| F3 | Canal de transmissão da comunidade | alcance | `peers.js`, `posse-dispatch.js` |
| F4 | Vaquinha transparente (comunidade e projeto) | dinheiro sem custódia | `brcode.js`, `perma-notary.js` |
| F5 | ~~Mídia fatiada ≤100 KiB~~ → mídia pela malha, hash no Arweave (a cota do Turbo é por bytes totais) | infra | `chunked-transfer.js`, `media-blob.js` |
| F6 | Modo Guardião ~~noturno em segundo plano~~ → **na tomada, app aberto** (REV-15) | infra | `seeder-guardian.js`, `storage-persistence.js`, `voxels.js` |
| F7 | Notas da Comunidade por ponte — **só depois da F8** (anti-Sybil) | moderação | `bridging-rank.js` |
| F8 | Selo de confiança por aval | anti-sybil | `civic-credential.js`, `identity-link.js` |
| F9 | Pauta legislativa automática | conteúdo | `frames.js`, contrato LCP |
| F10 | Resumo semanal + bot do Telegram | crescimento | `story-card.js`, `share.js` |

## Concluído (herdado do dossiê §3.6)

| | ID | Tipo | Item |
|---|---|---|---|
| [x] | DOC-01 | doc | Release line do README ↔ `release-metadata.json` (refeito em 2026-11-07 com `npm run release-line`) |
| [x] | DOC-02 | doc | Contagem única de testes (agora só no README e na metadata) |
| [x] | DOC-03 | doc | Índice [docs/README.md](./README.md) (v2.0 em 2026-11-07) |
| [x] | DOC-05 | doc | `steward-wizard-brainstorm` com banner SUPERSEDED |
| [x] | NET-03 | doc | Runbook V-P08 — [steward-relay-buddy.md](./operations/steward-relay-buddy.md) |
| [x] | CODE-01 | code | Job `pilot-freeze` no CI + DEV §0.1 |
| [x] | EXP-01 | code | POSSE Tier A/B |

## Como atualizar

1. Ao abrir trabalho: a linha precisa ter ID, tipo e evidência esperada.
2. Ao fechar: marque `[x]` **com** a evidência (PR, URL, ata) e mova a linha para *Concluído*.
3. Ideia nova vai para um brainstorm ou para *Candidatas*; só ganha caixa quando tiver DoD.
4. Mudou prioridade? Mova a linha entre Agora, Próximo e Depois no mesmo PR que justifica a mudança.
