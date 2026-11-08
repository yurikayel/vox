# Roadmap — Vox

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08
> **Único plano vivo e único lugar com caixas `[ ]`** ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)). Substitui o checklist do [dossiê N=25 §3.6](./dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25).
> Estado do produto: [FEATURES.md](./FEATURES.md) · Infra e riscos: [INFRA-CUSTOS.md](./INFRA-CUSTOS.md) · Teses: [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md)

**Tipo de DoD** ([CONTRIBUTING-DOCS §3](./CONTRIBUTING-DOCS.md)): `doc` = texto revisado e indexado · `code` = merge em `main` com `npm test` verde · `ops-humano` = evidência fora do git (URL, print, ata) citada na linha. Marque `[x]` só com a evidência.

## Onde estamos (nov/2026)

O cliente está maduro: feed Social/Cívico, comunidades, governança, Feira, Pix Zaps, DMs E2E, contas vinculadas, fluxos em etapas. Ver o [CHANGELOG](../CHANGELOG.md). O que falta para a rede **se sustentar sem o mantenedor** é quase tudo **infra e gente**:

- a sinalização depende de 1 nó Render;
- não há relay completo público nem TURN;
- não existe espelho B registrado;
- o piloto humano (V-P09) não começou.

## Agora (P0)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **NET-01** | ops-humano | Espelho shell **B** no ar + registro público | [ops-shell-mirrors.md](./ops-shell-mirrors.md) — não marcar só por doc |
| [ ] | **NET-02** | ops-humano | Drill de DR datado | [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md) |
| [ ] | **REV-01** | ops-humano | **2º nó de sinalização** em `client/config/signaling.json` — **Cloudflare Durable Object** (Workers Free, sem sleep). ~~Koyeb~~: escala a zero após 1 h e o Starter vai sair ([complementar F3](./pesquisa-complementar-2026-11.md#f-infraestrutura)). ~~HF Space~~: Docker Spaces agora exigem plano pago ([pesquisa V6](./pesquisa-deep-research-2026-11.md)) | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade) |
| [ ] | **REV-09** | code | **F1 sobe para P0:** sinalização por Nostr efêmero cifrado (faixa 20000–29999, ICE agrupado, sem dependência nova). Depois dela, aposentar o cron de keepalive do Render | [pesquisa §4](./pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-12** | ops-humano | **Jurídico pós-STF (Temas 987/533) + Decretos 12.975/12.976/2026 + ECA Digital:** parecer sobre (1) se o Vox/mantenedor ou um voluntário de relay é "provedor de aplicação" e se a cláusula residual "sem interferência no fluxo" alcança um cliente cronológico (B4); (2) o item 11 da tese — **sede e representante pessoa jurídica no país** — para um projeto sem CNPJ (B1); (3) itens 8–10: autorregulação, canal para não usuários, relatório anual (B3); (4) a Feira sob o CDC (**o item 7 confirma** que marketplaces respondem pelo CDC); (5) ECA Digital para um serviço de "provável acesso" de adolescentes (B6) — antes de qualquer código | [complementar §1-B](./pesquisa-complementar-2026-11.md) |
| [ ] | **REV-13** | code | **Aviso nos Pix Zaps (já no ar):** o BCB manda mostrar ao pagador o nome do recebedor **conforme o DICT, com qualquer chave** (inclusive aleatória). A UI deve dizer "seu nome civil aparece para quem paga" e oferecer Zap para a chave do coletivo (B2). ~~Recomendar chave aleatória~~ (não protege) | [complementar §1-E](./pesquisa-complementar-2026-11.md#e-pix-e-privacidade-do-recebedor) |
| [ ] | **REV-18** | ops-humano | **Decidir a associação/PJ (B1):** CNPJ, chave Pix do coletivo, representante legal, conta para editais. Depende do REV-12 e de pesquisar o custo de abertura | [complementar B1](./pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-19** | code | **Teste de fumaça Nostr (B7):** workflow semanal que publica e lê um evento efêmero em cada relay do pool (damus, nos.lol, nostr.mom, offchain.pub, snort) e grava a taxa de sucesso. Pré-requisito do REV-09 | [complementar §1-G](./pesquisa-complementar-2026-11.md#g-nostr-para-sinalização) |
| [ ] | **PIL-01** | ops-humano | Comunidade + facilitador nomeados (10–30 pessoas) | [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) |
| [ ] | **PIL-02** | ops-humano | **V-P09** semanas 0–4 (*blocked-human*) | [template de retrospectiva](./piloto-comunidade-retrospectiva-template.md) |
| [ ] | **PIL-03** | ops-humano | Retrospectiva preenchida | idem |
| [ ] | **REV-07** | doc | ✅ cota confirmada (vitalícia, por carteira e por sub-rede — [pesquisa V1](./pesquisa-deep-research-2026-11.md)); falta a decisão de política, que é o **REV-11**. **Confirmar o modelo de cota do Turbo** (`https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB)) e decidir a política: o que vai para o permaweb, o que fica só na malha, e quem paga o crédito | [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade), Prompt 2 do brainstorm |
| [ ] | **DOC-04** | doc | Re-auditoria de copy honesta, incluindo "Capacidades" do README × [FEATURES.md](./FEATURES.md) (Webxdc já corrigido para "laboratório") | [honest-copy-audit](./honest-copy-audit-2026-10-23.md) |

## Próximo (P1)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **REV-11** | code | **Efêmero por padrão, permanente por consenso:** post social e Feira só na malha (TTL); no Arweave só propostas, votos consolidados e manifestos (ou hash). Medidor de cota via `getFreeStatus()` | [pesquisa §4](./pesquisa-deep-research-2026-11.md#4-decisões-viram-linhas-no-roadmap) |
| [ ] | **REV-14** | code | **Chave no iOS:** plugar `storage-persistence`, guia "Adicionar à Tela de Início" no Safari e backup do cofre em cartão QR | [pesquisa §2](./pesquisa-deep-research-2026-11.md#2-plausível-não-verificado-confirmar-antes-de-usar) |
| [ ] | **REV-10** | code | **TURN:** um Worker gera credenciais temporárias do Cloudflare Realtime TURN (1.000 GB/mês grátis, compartilhados com o SFU; `POST …/credentials/generate-ice-servers`); uso só em falha direta, **com orçamento num Durable Object abaixo de ~800 GB/mês (B9)** + modo "privacidade de IP" | [pesquisa V5](./pesquisa-deep-research-2026-11.md) |
| [ ] | **REV-20** | doc | **Kit de autorregulação mínimo (B3):** página de regras versionada, canal de notificação para não usuários (issue form), relatório anual de transparência gerado do log de ocultações — redação final depois do REV-12 | [complementar B3](./pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-21** | ops-humano | **Banda do Render (B8):** anotar a banda incluída real (Billing → *Monthly Included Usage*). Garantir que o nó só sinaliza, com limite de taxa e `/metrics` de bytes de saída. Sem cartão, estourar a banda suspende **todos** os serviços Free até o fim do mês; 750 h/workspace = um só serviço sempre ligado | [complementar §1-F](./pesquisa-complementar-2026-11.md#f-infraestrutura) |
| [ ] | **REV-22** | ops-humano | **`FUNDING.yml` + GitHub Sponsors (B10):** Brasil é região aceita, 0% em patrocínio pessoal. NGI Zero Commons encerrado (01/06/2026); acompanhar NLnet (03/01/2027) e OTF IFF | [complementar §1-H](./pesquisa-complementar-2026-11.md#h-financiamento) |
| [ ] | **REV-02** | code | Decidir, módulo a módulo, **plugar ou arquivar** os 11 módulos "escritos, não plugados" | lista em [FEATURES.md](./FEATURES.md); vários viram features do brainstorm |
| [ ] | **REV-03** | code | Teste que falha se `docs/release-metadata.json.cache_name` ≠ `CACHE_NAME` do `sw.js` (impede drift) | [TESTES.md](./TESTES.md) |
| [ ] | **REV-04** | ops-humano | **Relay completo público** operado por steward (inbox de DM, `/oauth/exchange`, cofre) com buddy | [relay-api.md](./relay-api.md), [steward-relay-buddy.md](./steward-relay-buddy.md) |
| [ ] | **NET-04** | ops-humano | Smoke de steward por alguém que não seja o mantenedor | [steward-relay-kit.md](./steward-relay-kit.md) |
| [ ] | **PIL-04** | ops-humano | Barra da semana 4: ≥3 Apoiadores ou 1 steward + espelho OK | V-P04/05/06 |
| [ ] | **PIL-05** | ops-humano | Ciclo de moderação E1–E5 evidenciado | [auto-escala § C.5](./brainstorm-auto-escala-organica-2026-10.md) |
| [ ] | **CODE-02** | code | Métricas honestas v2 (T5) — `read_origin` local | [pós-v82 T5](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **CODE-04** | doc | Documentar a flag V-I09 (soft priority, padrão desligado) em DEV | [antigravity-blob-soft-priority-v0](./antigravity-blob-soft-priority-v0.md) |
| [ ] | **REV-05** | doc | Voxpedia (`#/voxpedia`) atualizada com as features de nov/2026 | `render/voxpedia.js` |

## Depois (P2)

| | ID | Tipo | Item | Evidência / nota |
|---|---|---|---|---|
| [ ] | **CODE-03** | code | V-P07: UI de exportação de atestação (ADR-001) | `contribution-attestation.js` já aparece em `#/settings/network`; **verificar se fecha** |
| [ ] | **CODE-05** | doc | ADR de fallback de gateway | [ADR-004](./adr/004-gateway-honest-fallback.md) existe (accepted); **verificar se fecha** |
| [ ] | **NET-05** | doc | Registro de espelhos de comunidade | [COMPLIANCE-BR](../COMPLIANCE-BR.md) |
| [ ] | **EXP-02** | code | Widget embed | [embed-integration.md](./embed-integration.md) |
| [ ] | **EXP-03** | doc | Spec de fork de comunidade | [pós-v82 T9](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| [ ] | **EXP-04** | code | Backup em HTML standalone | — |
| [ ] | **EXP-05** | doc | Decisão sobre o Bridge MV3 depois do piloto | [vox-bridge-spike.md](./vox-bridge-spike.md) |
| [ ] | **REV-08** | ops-humano | **Selo gov.br opcional via parceiro público** ([ADR-018](./adr/018-selo-govbr-via-parceiro-publico.md), proposed): achar parceiro com domínio oficial (`*.edu.br`, `*.leg.br`), confirmar o uso permitido do Login Único, obter parecer LGPD e escrever RFC do atestado | Parceiro nomeado + resposta do Serviço de Integração + parecer citados aqui |
| [ ] | **REV-15** | code | **F6 redesenhada:** guardião na tomada (app aberto, Wake Lock, só no Wi-Fi); `periodicSync` só como complemento no Chromium | [pesquisa V7/V8](./pesquisa-deep-research-2026-11.md) |
| [x] | **REV-17** | doc | Rodar o **Prompt 4 (busca complementar)** e incorporar o resultado — feito por busca direta em 2026-11-08; lacunas na §3 | [pesquisa-complementar-2026-11.md](./pesquisa-complementar-2026-11.md) |
| [ ] | **REV-23** | code | **Padrões seguros por idade sem coletar dado (B6):** faixa etária autodeclarada só no aparelho; abaixo de 18 sem DM de desconhecidos, Pix Zap e Feira geolocalizada; **abaixo de 16, conta vinculada a um responsável** (exigência do ECA Digital) por aval de chave via QR. Depois do REV-12 |
| [ ] | **REV-24** | code | **Modo eleitoral do ranking (B11):** no período eleitoral, nada de ranquear ou recomendar conteúdo sobre candidato, partido ou campanha (Res. TSE 23.755/2026); feed cronológico. Prazo: antes de ago/2028 | [complementar §1-B](./pesquisa-complementar-2026-11.md) | [complementar B6](./pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) |
| [ ] | **REV-16** | doc | Rodar de novo o Prompt 3 **com os arquivos anexados** (o Gemini não abriu os links do repo) e só então escrever as specs F1–F10 | [pesquisa — Como ler](./pesquisa-deep-research-2026-11.md#como-ler) |
| [ ] | **REV-06** | code | Trocar hotlinks `images.unsplash.com` (~35) por assets locais ou remover | [INFRA-CUSTOS §1](./INFRA-CUSTOS.md) |

## Candidatas (sem caixa até ganharem DoD e responsável)

Do [brainstorm de autossustento](./brainstorm-autossustento-10-features-2026-11.md). Pesquisar antes com os 3 prompts do mesmo doc.

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
| [x] | NET-03 | doc | Runbook V-P08 — [steward-relay-buddy.md](./steward-relay-buddy.md) |
| [x] | CODE-01 | code | Job `pilot-freeze` no CI + DEV §0.1 |
| [x] | EXP-01 | code | POSSE Tier A/B |

## Como atualizar

1. Ao abrir trabalho: a linha precisa ter ID, tipo e evidência esperada.
2. Ao fechar: marque `[x]` **com** a evidência (PR, URL, ata) e mova a linha para *Concluído*.
3. Ideia nova vai para um brainstorm ou para *Candidatas*; só ganha caixa quando tiver DoD.
4. Mudou prioridade? Mova a linha entre Agora, Próximo e Depois no mesmo PR que justifica a mudança.
