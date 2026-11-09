# Roadmap — Vox

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-09 (G1 em `main` até o PR #28; revisão de estado no PR #29; LAN-14 e LAN-21 fechados no PR #30; NET-01 verificado e brainstorm PM-01…46 no PR #31; PM-09 no PR #32; PM-45 no PR #33; adendo PM-47…64 no PR #34; PM-17 e PM-50 parcial no PR #35; PM-10 e ruleset PM-62 em 09/11)
> **Único plano vivo e único lugar com caixas `[ ]`** ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)). Substitui o checklist do [dossiê N=25 §3.6](./archive/dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25).
> Estado do produto: [FEATURES.md](./FEATURES.md) · Infra e riscos: [INFRA-CUSTOS.md](./INFRA-CUSTOS.md) · Teses: [direcionamento-crescimento-rede-2026-11.md](./strategy/direcionamento-crescimento-rede-2026-11.md)

**Tipo de DoD** ([CONTRIBUTING-DOCS §3](./CONTRIBUTING-DOCS.md)): `doc` = texto revisado e indexado · `code` = merge em `main` com `npm test` verde · `ops-humano` = evidência fora do git (URL, print, ata) citada na linha. Marque `[x]` só com a evidência.

## Onde estamos (nov/2026)

O cliente está maduro: feed Social/Cívico, comunidades, governança, Feira, Pix Zaps, DMs E2E, contas vinculadas, fluxos em etapas. Ver o [CHANGELOG](../CHANGELOG.md). O que falta para a rede **se sustentar sem o mantenedor** é quase tudo **infra e gente**:

- a sinalização depende de 1 nó Render; o caminho Nostr (REV-09 + reconexão automática PM-17) roda em paralelo, mas ainda não foi medido em campo;
- não há relay completo público nem TURN;
- o espelho B (`vox-9df.pages.dev`, NET-01) está no ar e registrado, mas ainda sob o mesmo operador do A (independência depende do LAN-30);
- o piloto humano (V-P09) não começou;
- para abrir ao público faltam o parecer jurídico, a resposta a conteúdo grave e bus factor ≥2 — ver [Rumo à rede pública](#rumo-à-rede-pública-lan).

## Agora (P0)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **NET-02** | ops-humano | Drill de DR datado | [ops-dr-drill-checklist.md](./operations/ops-dr-drill-checklist.md) |
| [ ] | **REV-01** | ops-humano | **2º nó de sinalização** em `client/config/signaling.json` — **Cloudflare Durable Object** (Workers Free, sem sleep). ~~Koyeb~~: escala a zero após 1 h e o Starter vai sair ([complementar F3](./research/pesquisa-complementar-2026-11.md#f-infraestrutura)). ~~HF Space~~: Docker Spaces agora exigem plano pago ([pesquisa V6](./research/pesquisa-deep-research-2026-11.md)) | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade) |
| [ ] | **REV-09** | code | **F1 sobe para P0:** sinalização por Nostr efêmero cifrado (faixa 20000–29999, ICE agrupado, sem dependência nova). Depois dela, aposentar o cron de keepalive do Render | 🚧 no `main` desde o PR #17, em paralelo ao Render. Ida e volta ok em relays reais (3,3 s). Aposentar o keepalive só depois de medir em campo · [pesquisa §4](./research/pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-12** | ops-humano | **Escopo reduzido pelo [ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md):** operador pessoa física, piloto só 18+, voluntários só em baixo risco. **Jurídico pós-STF (Temas 987/533) + Decretos 12.975/12.976/2026 + ECA Digital:** parecer sobre (1) se o Vox/mantenedor ou um voluntário de relay é "provedor de aplicação" e se a cláusula residual "sem interferência no fluxo" alcança um cliente cronológico (B4); (2) o item 11 da tese — **sede e representante pessoa jurídica no país** — para um projeto sem CNPJ (B1); (3) itens 8–10: autorregulação, canal para não usuários, relatório anual (B3); (4) a Feira sob o CDC (**o item 7 confirma** que marketplaces respondem pelo CDC); (5) ECA Digital para um serviço de "provável acesso" de adolescentes (B6) — antes de qualquer código | [complementar §1-B](./research/pesquisa-complementar-2026-11.md) |
| [ ] | **REV-18** | ops-humano | **Fora do caminho crítico do G1 ([ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md)); volta antes do G2 ou de receber edital.** **Decidir a associação/PJ (B1):** CNPJ, chave Pix do coletivo, representante legal, conta para editais. Depende do REV-12 e de pesquisar o custo de abertura | [complementar B1](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **PIL-01** | ops-humano | Comunidade + facilitador nomeados (10–30 pessoas) | [piloto-comunidade-go-no-go.md](./pilot/piloto-comunidade-go-no-go.md) |
| [ ] | **PIL-02** | ops-humano | **V-P09** semanas 0–4 (*blocked-human*) | [template de retrospectiva](./pilot/piloto-comunidade-retrospectiva-template.md) |
| [ ] | **PIL-03** | ops-humano | Retrospectiva preenchida | idem |
| [ ] | **REV-07** | doc | ✅ cota confirmada (vitalícia, por carteira e por sub-rede — [pesquisa V1](./research/pesquisa-deep-research-2026-11.md)); falta a decisão de política, que é o **REV-11**. **Confirmar o modelo de cota do Turbo** (`https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB)) e decidir a política: o que vai para o permaweb, o que fica só na malha, e quem paga o crédito | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade), Prompt 2 do brainstorm |
| [ ] | **DOC-04** | doc | Re-auditoria de copy honesta, incluindo "Capacidades" do README × [FEATURES.md](./FEATURES.md) (Webxdc já corrigido para "laboratório") | [honest-copy-audit](./audits/honest-copy-audit-2026-10-23.md) · 🚧 **parcial (PR #39, 09/11):** README do vox alinhado com o FEATURES (Capacidades e arquitetura). **Falta:** a copy da interface (`client/js/render/*`, Voxpedia, onboarding) contra o FEATURES |

## Próximo (P1)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **REV-11** | code | **Política em [ADR-019](./adr/019-esquecer-por-padrao-e-memoria-civica.md): esquecer por padrão, memória cívica por três caminhos.** **Efêmero por padrão, permanente por consenso:** post social e Feira só na malha (TTL); no Arweave só propostas, votos consolidados e manifestos (ou hash). Medidor de cota via `getFreeStatus()` | [pesquisa §4](./research/pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-14** | code | **Chave no iOS:** plugar `storage-persistence`, guia "Adicionar à Tela de Início" no Safari e backup do cofre em cartão QR | [pesquisa §2](./research/pesquisa-deep-research-2026-11.md#2-plausível-não-verificado-confirmar-antes-de-usar) |
| [ ] | **REV-10** | code | **TURN:** um Worker gera credenciais temporárias do Cloudflare Realtime TURN (1.000 GB/mês grátis, compartilhados com o SFU; `POST …/credentials/generate-ice-servers`); uso só em falha direta, **com orçamento num Durable Object abaixo de ~800 GB/mês (B9)** + modo "privacidade de IP" | [pesquisa V5](./research/pesquisa-deep-research-2026-11.md) |
| [ ] | **REV-20** | doc | **Kit de autorregulação mínimo (B3):** página de regras versionada, canal de notificação para não usuários (issue form), relatório anual de transparência gerado do log de ocultações — redação final depois do REV-12 | [complementar B3](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-21** | ops-humano | **Banda do Render (B8):** anotar a banda incluída real (Billing → *Monthly Included Usage*). Garantir que o nó só sinaliza, com limite de taxa e `/metrics` de bytes de saída. Sem cartão, estourar a banda suspende **todos** os serviços Free até o fim do mês; 750 h/workspace = um só serviço sempre ligado | [complementar §1-F](./research/pesquisa-complementar-2026-11.md#f-infraestrutura) |
| [ ] | **REV-22** | ops-humano | **`FUNDING.yml` + GitHub Sponsors (B10):** Brasil é região aceita, 0% em patrocínio pessoal. NGI Zero Commons encerrado (01/06/2026); acompanhar NLnet (03/01/2027) e OTF IFF | [complementar §1-H](./research/pesquisa-complementar-2026-11.md#h-financiamento) |
| [ ] | **REV-02** | code | Decidir, módulo a módulo, **plugar ou arquivar** os 11 módulos "escritos, não plugados" | lista em [FEATURES.md](./FEATURES.md); vários viram features do brainstorm |
| [ ] | **REV-04** | ops-humano | **Relay completo público** operado por steward (inbox de DM, `/oauth/exchange`, cofre) com buddy | [relay-api.md](./specs/relay-api.md), [steward-relay-buddy.md](./operations/steward-relay-buddy.md) |
| [ ] | **NET-04** | ops-humano | Smoke de steward por alguém que não seja o mantenedor | [steward-relay-kit.md](./operations/steward-relay-kit.md) |
| [ ] | **PIL-04** | ops-humano | Barra da semana 4: ≥3 Apoiadores ou 1 steward + espelho OK | V-P04/05/06 |
| [ ] | **PIL-05** | ops-humano | Ciclo de moderação E1–E5 evidenciado | [auto-escala § C.5](./brainstorms/brainstorm-auto-escala-organica-2026-10.md) |
| [ ] | **CODE-02** | code | Métricas honestas v2 (T5) — `read_origin` local | [pós-v82 T5](./archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **REV-05** | doc | Voxpedia (`#/voxpedia`) atualizada com as features de nov/2026 | `render/voxpedia.js` |
| [ ] | **PM-70** | code | **Protótipo de medição da mídia v2:** tamanho do AVIF q66 em ~20 fotos reais, tempo de codificação AVIF (WebAssembly) e H.264 (WebCodecs) num celular barato, calibrar o "q66" do vídeo, Opus em MP4 no iPhone | [mídia v2](./specs/midia-v2.md) |
| [ ] | **PM-71** | code | **Pipeline de mídia v2:** AVIF q66 em 1280×720/720×1280, Opus 48 kbps até 60 s, H.264 720p24 até 10 s, pedaços ≤ 99.999 bytes, trava final, miniatura embutida | [mídia v2](./specs/midia-v2.md) · depende do PM-70 |
| [ ] | **PM-72** | code | **Armazenamento durável no aparelho:** `navigator.storage.persist`, plugar `idb-store.js` e `storage-persistence.js`, backup exportável dos próprios posts | [ADR-019](./adr/019-esquecer-por-padrao-e-memoria-civica.md) · EXP-04 |
| [ ] | **PM-73** | code | **"Testar no seu celular"** (trabalho voluntário 1): roteiro guiado de 5 min com relatório automático (passos, modelo, navegador) | [voluntariado](./product/voluntariado-tres-trabalhos.md) · REV-14 |
| [ ] | **PM-74** | code | **Replicação por grau v0:** teto de 500 MB, subcota de vídeo, grau por salto sem expor o grafo, visibilidade e moderação acima do grau | [replicação por grau](./specs/replicacao-por-grau-v0.md) · depende do PM-71 e PM-72 |
| [ ] | **PM-75** | code | **Métrica de disponibilidade:** % de posts acessíveis com o autor offline em 1 h, 6 h e 24 h | [replicação por grau](./specs/replicacao-por-grau-v0.md) · NLnet M2 |

## Depois (P2)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **NET-05** | doc | Registro de espelhos de comunidade | [COMPLIANCE-BR](legal/COMPLIANCE-BR.md) |
| [ ] | **EXP-02** | code | Widget embed | [embed-integration.md](./specs/embed-integration.md) |
| [ ] | **EXP-03** | doc | Spec de fork de comunidade | [pós-v82 T9](./archive/brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **EXP-04** | code | Backup em HTML standalone | — |
| [ ] | **EXP-05** | doc | Decisão sobre o Bridge MV3 depois do piloto | [vox-bridge-spike.md](./product/vox-bridge-spike.md) |
| [ ] | **REV-08** | ops-humano | **Selo gov.br opcional via parceiro público** ([ADR-018](./adr/018-selo-govbr-via-parceiro-publico.md), proposed): achar parceiro com domínio oficial (`*.edu.br`, `*.leg.br`), confirmar o uso permitido do Login Único, obter parecer LGPD e escrever RFC do atestado | Parceiro nomeado + resposta do Serviço de Integração + parecer citados aqui |
| [ ] | **REV-15** | code | **F6 redesenhada:** guardião na tomada (app aberto, Wake Lock, só no Wi-Fi); `periodicSync` só como complemento no Chromium | [pesquisa V7/V8](./research/pesquisa-deep-research-2026-11.md) |
| [ ] | **REV-23** | code | **Fora do G1: piloto só 18+ ([ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md), PM-67); volta antes do G3.** **Padrões seguros por idade sem coletar dado (B6):** faixa etária autodeclarada só no aparelho; abaixo de 18 sem DM de desconhecidos, Pix Zap e Feira geolocalizada; **abaixo de 16, conta vinculada a um responsável** (exigência do ECA Digital) por aval de chave via QR. Depois do REV-12 | [complementar B6](./research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-16** | doc | Rodar de novo o Prompt 3 **com os arquivos anexados** (o Gemini não abriu os links do repo) e só então escrever as specs F1–F10 | [pesquisa — Como ler](./research/pesquisa-deep-research-2026-11.md#como-ler) |

## Rumo à rede pública (LAN)

Porquê, critérios, fases e ordem: [backlog-lancamento-publico-2026-11.md](./strategy/backlog-lancamento-publico-2026-11.md). Três portões: **G1** piloto fechado → **G2** beta por convite → **G3** público. O caminho crítico é o **REV-12** (parecer), via LAN-01. "Resp." fica no backlog como papel até haver pessoa nomeada.

### G1 — piloto fechado

Também exige: REV-13 · REV-19 + (REV-01 ou REV-09) · NET-01 ou waiver · PIL-01 · carta E2.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-01** | ops-humano | **Contratar o parecer do REV-12** (clínica jurídica / direitos digitais), escopo e prazo acordados | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-10** | code | **Demonstração isolada:** `mock.js` só em `#/demo` com faixa; falha de rede mostra "sem conexão", nunca perfis/propostas fictícios | ✅ entregue no PR #17 · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-11** | code | **Aviso de permanência** antes do 1º post que vai para o Arweave | ✅ entregue no PR #17 (escolha "só na malha" também cobre parte do REV-11) · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-17** | ops-humano | **Divulgação de vulnerabilidades funcionando** (Private Vulnerability Reporting + contato do SECURITY.md testado) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-30** | ops-humano | **Bus factor ≥2** — G1: 2ª pessoa no GitHub e no Render; G3: todas as contas, domínio e secrets, em organização | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **PM-67** | code | **Piloto só 18+:** caixa "tenho 18 anos ou mais" no pacto; sem ela, os botões ficam desativados. Autodeclarada, só no aparelho; quem aceitou antes vê o pacto uma vez mais | ✅ SW v7.45; `client/js/age-gate.js`, `tests/age-gate.test.js` · [ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md) |
| [x] | **PM-68** | code | **"Algo errado aqui?"** (trabalho voluntário 3): apontamento sobre o app no rodapé de todas as telas, guardado só no aparelho e compartilhável com o grupo do piloto | ✅ SW v7.45; `client/js/app-feedback.js`, `client/js/app/feedback-flow.js`, `tests/app-feedback.test.js` · [voluntariado](./product/voluntariado-tres-trabalhos.md) |
| [ ] | **PM-69** | code | **Uma denúncia arquiva** até a revisão: o aparelho do moderador arquiva para todos ao receber a denúncia; autor vê "em revisão"; só membros; 3 pendentes por pessoa; prazo de revisão visível | [ADR-020 §2.1](./adr/020-postura-de-operacao-do-piloto-g1.md) |
| [ ] | **PM-76** | ops-humano | **Confirmar G1 sem relay completo público** (DM só online; cofre e login social desligados no piloto) | [ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md) item 5 |

### G2 — beta por convite

Também exige: PIL-02…05 · REV-12 · REV-20 · REV-23 · REV-09 · REV-10 · NET-02 · REV-21 · REV-14 · REV-11.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-02** | doc+code | **Termos de Uso** (`client/terms.html`) com aceite no onboarding — revisados pelo parecer | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-03** | doc | **Atualizar privacy, data-deletion e COMPLIANCE-BR** (STF 5–11, Decretos 2026, ECA Digital, TSE 23.755, Pix/DICT, IP na malha) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-04** | doc+ops-humano | **Procedimento de conteúdo grave** (≤2 h para íntimo não consentido), plantão de 2 pessoas, simulado datado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-07** | code | **Página de status pública** gerada por workflow (nós, relays Nostr, gateways) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-08** | code | **Kill-switch por configuração** (`client/config/flags.json`: upload, Feira, Pix Zaps, convites) | ✅ entregue no PR #17 · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-12** | code | **Denunciar no app** (post/perfil/comunidade) → moderadores; graves → canal do projeto | ✅ entregue no PR #17; denúncia é local + DM cifrada ao moderador, sem fila central · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-13** | code | **Lista de ocultação assinada do PWA oficial**, exportável para gateways AR.IO | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-15** | doc | **Modelo de ameaças** (`docs/THREAT-MODEL.md`) revisado por alguém de segurança fora do time | 🚧 rascunho em [THREAT-MODEL.md](./THREAT-MODEL.md); falta revisão externa · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-16** | code | **CSP e headers** (`_headers` no CF Pages + meta CSP no GitHub Pages) | ✅ entregue no PR #17; scripts inline viraram `js/boot-*.js` · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-21** | code | **Estados de erro honestos** (sinalização caída, cota esgotada, 402 do gateway, DM sem relay) | ✅ PR #26 (`honest-errors.js`: cota, 402, 429, offline, timeout, gateways fora, DM sem relay) + PR #30: aviso de sinalização caída só quando WebSocket e Nostr falham juntos por mais de 5 s, com aviso de volta (`createSignalingHealth`, toast e `#/settings/network`) · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-24** | doc | **Runbook de incidentes** + 1 simulado datado | 🚧 [runbook](./operations/runbook-incidentes.md) escrito; falta 1 simulado datado · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-28** | doc | **Critério de go para o beta** escrito antes do piloto (retenção, steward externo, incidentes, P2P, cota) | 🚧 rascunho no [go/no-go](./pilot/piloto-comunidade-go-no-go.md#critério-de-go-para-o-beta-por-convite-lan-28); falta o grupo aceitar · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

### G3 — público

Também exige: REV-18 · DOC-04 · REV-02 · REV-04 (ou LAN-21 cobrindo DM offline) · F8 antes de enquete cívica pública com peso.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-05** | ops-humano | **Busca de anterioridade da marca "Vox"** no INPI | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-06** | ops-humano | **Domínio próprio** com dois titulares (ou titular PJ) e DNS documentado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-09** | code+doc | **Teste de carga** (≥500 pares na sinalização, 50 reais na malha); capacidade em INFRA-CUSTOS | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-14** | code | **Anti-spam e limite de taxa** por chave; quarentena de chave nova | ✅ PR #27: 20 posts por chave a cada 10 min no gossip (`rate-limit.js`) + PR #30: quarentena de chave nova por comunidade (opção na criação) e PoW leve de 14 bits preso a autor e id (`new-key-guard.js`). Chave nova = vista neste aparelho há menos de 24 h; parâmetros no topo do módulo · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-18** | ops-humano | **Revisão externa de cripto** (DM, cofre, assinaturas); críticos corrigidos | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-19** | code | **Privacidade de IP:** aviso + modo "só TURN" (padrão para menores) | 🚧 PR #25: aviso de IP + "Esconder meu IP" (`iceTransportPolicy: relay`) em `#/settings/network`; falta o padrão ligado para menores (REV-23, depois do REV-12) e um TURN público (REV-10) · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-20** | code | **Cadeia de suprimentos:** inventário de dependências com SRI + `npm audit` no CI | ✅ PR #22: `npm audit` no CI + PR #30: inventário em [DEPENDENCIAS.md](./DEPENDENCIAS.md), teste que quebra com dependência fora dele e rotina mensal (`deps-mensal.yml`, confere hash de CDN) + PM-11: `arweave` vendorizado em `client/vendor/` com hash conferido em teste e `esm.sh` fora da CSP. Ainda fora: SDKs do Google e da Meta sem versão fixa (risco aceito, só carregam com login configurado) · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-22** | code | **Acessibilidade WCAG 2.2 AA básica** nas 10 rotas principais | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-23** | code | **Desempenho em Android de entrada** com orçamento que quebra o CI | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-25** | ops-humano | **Onboarding com 5 leigos** (identidade, backup, post, comunidade, recuperação) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-26** | ops-humano | **Suporte:** formulários de issue + canal Zap/Telegram, triagem semanal | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [x] | **LAN-27** | code | **Leitura resiliente:** ≥4 gateways, 402 do turbo-gateway = trocar de gateway | ✅ PR #26: 4 gateways (turbo, arweave.net, ardrive.net, ar-io.dev) + timeout de 8 s por gateway · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) · PM-50 (09/11): `ar-io.dev` saiu das testemunhas GraphQL (0 itens vox-brasil), fica só `raw` |
| [ ] | **LAN-29** | doc | **Relatório do beta** e decisão de go público | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-31** | doc | **Governança do PWA oficial** (lista de ocultação, Termos, releases) no GOVERNANCE.md | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-32** | doc | **Orçamento de 12 meses** para 1k/10k usuários com cobertura confirmada | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-33** | doc+code | **Release v1.0.0** com checklist e rollback ensaiado | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-34** | doc | **Plano de lançamento em ondas** com critérios de pausa | 🚧 [rascunho](./strategy/plano-lancamento-ondas.md) no PR #28; falta aprovação do mantenedor · [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |
| [ ] | **LAN-35** | doc+code | **Página de apresentação e kit de imprensa** (o que é e o que não é) | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

### Financiamento (sem portão)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **LAN-36** | ops-humano | **Proposta ao NLnet Restack até 03/01/2027** usando o backlog como plano de trabalho. 🚧 PM-42: rascunho e riscos em [proposta-nlnet-restack-2027.md](./strategy/proposta-nlnet-restack-2027.md). **Dimensão europeia é eliminatória**: perguntar ao NLnet antes; reescrever com as próprias palavras e declarar o uso de IA | [backlog §4](./strategy/backlog-lancamento-publico-2026-11.md#4-backlog-por-épico) |

## Candidatas (sem caixa até ganharem DoD e responsável)

Do [brainstorm de autossustento](./brainstorms/brainstorm-autossustento-10-features-2026-11.md). Pesquisar antes com os 3 prompts do mesmo doc.
Mais 66 ideias (PM-01…PM-66: dieta do shell, segurança, hardening v3.2, pacote de destravamento jurídico, assembleia, Nostr, contribuidores), com a revisão de estado de 09/11: [brainstorm de próximas melhorias](./brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md).

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

## Concluído

Itens fechados de Agora, Próximo e Depois. Nas tabelas dos portões (LAN), a linha `[x]` fica no portão, para mostrar o que falta em cada um.

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [x] | **PM-11** | code | `arweave` vendorizado (`client/vendor/arweave-1.15.7.bundle.js`, carregado por `client/js/arweave-lib.js`) e `https://esm.sh` fora do `script-src` | ✅ SW v7.43; `tests/arweave-vendor.test.js` confere hash, bundle autocontido e assinatura sem rede; testado no navegador sob a CSP nova (assina, verifica e lê saldo real). Não testado: publicação L1 paga (custa AR) |
| [x] | **PM-17** | code | Reconexão automática de relay Nostr com backoff exponencial (1 s → 60 s) e troca por relay reserva após 3 falhas consecutivas | ✅ PR #35, SW v7.41; `client/js/nostr-transport.js`, `tests/nostr-transport.test.js` |
| [x] | **PM-10** | ops-humano | Secret scanning, push protection e alertas do Dependabot ligados no repositório GitHub | ✅ ativados via API do GitHub em 09/11/2026 (junto com ruleset `main protegido` do PM-62 exigindo PR + 5 checks do CI) |
| [x] | **PM-45** | code | `Vox.exe`, `VoxPopuli.exe` e os dois APKs compilados no CI e publicados como GitHub Release com `SHA256SUMS` e atestação de origem; fora do git | ✅ PR #33; [`release-binarios.yml`](../.github/workflows/release-binarios.yml), [DEPENDENCIAS §6](./DEPENDENCIAS.md#6-binários-no-repositório). Assinatura de código do Windows: PM-46 |
| [x] | **PM-09** | code | `community_update` só do dono ou de moderador, só com foto, título, descrição e categoria; só o post `c_<communityId>` define o dono | ✅ PR #32, SW v7.40; `client/js/community-updates.js`, `tests/community-updates.test.js` (3 dos 9 testes falham no código anterior). Origem: [brainstorm PM-09](./brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md#b-segurança-e-integridade) |
| [x] | **NET-01** | ops-humano | Espelho shell **B** no ar + registro público | ✅ https://vox-9df.pages.dev/ serve o mesmo `sw.js` do A (v7.39) em 09/11/2026; deploy a cada push em `main` (`deploy-shell-b.yml`); linha `shell-b` em [ops-shell-mirrors.md](./operations/ops-shell-mirrors.md#tabela-de-espelhos). Mesmo operador do A: a independência fica com o LAN-30 |
| [x] | **REV-13** | code | **Aviso nos Pix Zaps (já no ar):** o BCB manda mostrar ao pagador o nome do recebedor **conforme o DICT, com qualquer chave** (inclusive aleatória). A UI deve dizer "seu nome civil aparece para quem paga" e oferecer Zap para a chave do coletivo (B2). ~~Recomendar chave aleatória~~ (não protege) | ✅ entregue no PR #17 · [complementar §1-E](./research/pesquisa-complementar-2026-11.md#e-pix-e-privacidade-do-recebedor) |
| [x] | **REV-19** | code | **Teste de fumaça Nostr (B7):** workflow semanal que publica e lê um evento efêmero em cada relay do pool (damus, nos.lol, nostr.mom, offchain.pub, snort) e grava a taxa de sucesso. Pré-requisito do REV-09 | ✅ entregue no PR #17; 1ª execução local: 6/7 relays ok, `eden.nostr.land` pede pagamento · [complementar §1-G](./research/pesquisa-complementar-2026-11.md#g-nostr-para-sinalização) |
| [x] | **REV-03** | code | Teste que falha se `docs/release-metadata.json.cache_name` ≠ `CACHE_NAME` do `sw.js` (impede drift) | ✅ PR #22: `tests/release-metadata-drift.test.js` · [TESTES.md](./TESTES.md) |
| [x] | **CODE-04** | doc | Documentar a flag V-I09 (soft priority, padrão desligado) em DEV | [antigravity-blob-soft-priority-v0](./specs/antigravity-blob-soft-priority-v0.md) |
| [x] | **CODE-03** | code | V-P07: UI de exportação de atestação (ADR-001) | `contribution-attestation.js` já aparece em `#/settings/network`; ✅ verificado em 08/11/2026 |
| [x] | **CODE-05** | doc | ADR de fallback de gateway | [ADR-004](./adr/004-gateway-honest-fallback.md) existe (accepted); ✅ verificado em 08/11/2026 |
| [x] | **REV-17** | doc | Rodar o **Prompt 4 (busca complementar)** e incorporar o resultado — feito por busca direta em 2026-11-08; lacunas na §3 | [pesquisa-complementar-2026-11.md](./research/pesquisa-complementar-2026-11.md) |
| [x] | **REV-24** | code | **Modo eleitoral do ranking (B11):** no período eleitoral, nada de ranquear ou recomendar conteúdo sobre candidato, partido ou campanha (Res. TSE 23.755/2026); feed cronológico. | ✅ PR #24: `electoral-period.js` (janela automática 16/08–31/10 de ano par + `electoralMode` em `flags.json`) esconde "Sugestões cívicas" · [complementar §1-B](./research/pesquisa-complementar-2026-11.md) |
| [x] | **REV-06** | code | Trocar hotlinks `images.unsplash.com` (~35) por assets locais ou remover | ✅ PR #22: os 35 viraram arquivos em `client/images/` · [INFRA-CUSTOS §1](./INFRA-CUSTOS.md) |
| [x] | DOC-01 | doc | Release line do README ↔ `release-metadata.json` (refeito em 2026-11-08 com `npm run release-line`) | herdado do dossiê §3.6 |
| [x] | DOC-02 | doc | Contagem única de testes (agora só no README e na metadata) | herdado do dossiê §3.6 |
| [x] | DOC-03 | doc | Índice [docs/README.md](./README.md) (v2.2 em 2026-11-08) | herdado do dossiê §3.6 |
| [x] | DOC-05 | doc | `steward-wizard-brainstorm` com banner SUPERSEDED | herdado do dossiê §3.6 |
| [x] | NET-03 | doc | Runbook V-P08 — [steward-relay-buddy.md](./operations/steward-relay-buddy.md) | herdado do dossiê §3.6 |
| [x] | CODE-01 | code | Job `pilot-freeze` no CI + DEV §0.1 | herdado do dossiê §3.6 |
| [x] | EXP-01 | code | POSSE Tier A/B | herdado do dossiê §3.6 |

## Como atualizar

1. Ao abrir trabalho: a linha precisa ter ID, tipo e evidência esperada.
2. Ao fechar: marque `[x]` **com** a evidência (PR, URL, ata). Em Agora, Próximo e Depois, mova a linha para *Concluído*; nos portões LAN, deixe-a no portão. Parcial = `[ ]` com 🚧 e o que falta.
3. Ideia nova vai para um brainstorm ou para *Candidatas*; só ganha caixa quando tiver DoD.
4. Mudou prioridade? Mova a linha entre Agora, Próximo e Depois no mesmo PR que justifica a mudança.
