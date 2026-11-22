# Critérios formais de Go/No-Go — Beta para Lançamento Público (LAN-28)

> **Status:** rascunho (aguardando validação do piloto e stewards) · **Owner:** revisor / mantenedor · **Revisado:** 2026-11-21
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Complementa os critérios de entrada do beta no [go/no-go do piloto](../pilot/piloto-comunidade-go-no-go.md#critério-de-go-para-o-beta-por-convite-lan-28) e as ondas de abertura em [plano-lancamento-ondas.md](./plano-lancamento-ondas.md).

Este documento define os **critérios quantitativos e verificáveis de saída** para graduar o Vox da fase de **beta fechado por convite (50–100 testadores em 5–10 comunidades, portão G2)** para o **lançamento público (portão G3 / Onda 3)**, conforme [backlog-lancamento-publico-2026-11.md](./backlog-lancamento-publico-2026-11.md).

---

## 1. Confiabilidade e Sincronização

Medição feita exclusivamente com **métricas locais e relatórios de testadores** (`#/status`, `signaling-telemetry.js`, `CODE-02`, formulários de bug), sem telemetria central invasiva.

| Critério | Meta para Go | Como verificar |
|---|---|---|
| **Sessões sem crash crítico** | **≥ 99,0%** das sessões reportadas sem erro fatal de runtime ou travamento irrecuperável de UI | Ausência de regressão aberta em issues de testadores (`bug-tester.yml`) e contagem local na amostra do beta |
| **Taxa de conexão P2P (com fallback)** | **≥ 85%** das tentativas de pareamento com pares online bem-sucedidas (direto ou via TURN `REV-10` em CGNAT) | Exportação de `#/status` (`signaling-telemetry.js`) nas comunidades do beta |
| **Convergência de sincronização na malha** | **≥ 95%** dos posts/ações assinados entregues entre pares conectados em **≤ 60 s** | Relato da amostra do beta + testes E2E de malha no CI (`PM-99`) verdes |
| **Estabilidade da sinalização** | **≥ 99,0%** de disponibilidade combinada (Render + Nostr `REV-09` + 2º nó `REV-01`); **0** janela **> 2 h** sem nenhum caminho funcional | Histórico da página de status (`LAN-07`) + `nostr-smoke.yml` |
| **Recuperação de conta** | **0** perda irrecuperável de identidade entre testadores que completaram o backup/guardiões (`REV-14`, `PM-72`) | Retrospectiva do beta (`LAN-29`) |
| **Disciplina de armazenamento** | Nenhuma gravação acidental no Arweave enquanto `arweaveUpload: false` (`REV-07`), ou uso dentro da cota documentada se `REV-11` estiver ativo | Conferência de `client/config/flags.json` e relatório de cota |

---

## 2. Segurança e Criptografia

| Critério | Meta para Go | Como verificar |
|---|---|---|
| **Auditoria externa de criptografia (`LAN-18`)** | Relatório externo concluído cobrindo DM (ECDH P-256 / AES-GCM), cofre ZK (`ADR-025`/`ADR-037`) e assinaturas (`sigv: 2`, `PM-85`) | Relatório datado e referenciado no repositório |
| **Vulnerabilidades abertas** | **0** vulnerabilidade **crítica ou alta** em aberto (no relatório `LAN-18`, CodeQL ou `npm audit`) | Status de alertas no GitHub Security e resumo do `LAN-18` |
| **Modelo de ameaças (`LAN-15`)** | Revisão externa de [THREAT-MODEL.md](../THREAT-MODEL.md) concluída e mitigações G2/G3 verificadas | Assinatura/revisão registrada fora do time original |
| **Cadeia de suprimentos e SRI (`LAN-20`)** | 100% das dependências no inventário [DEPENDENCIAS.md](../DEPENDENCIAS.md); bundle Arweave vendorizado com hash verificado (`PM-11`); `deps-mensal.yml` verde; CSP (`LAN-16`) sem violações em console | Suite de testes + job mensal verdes |
| **Canal de vulnerabilidades (`LAN-17`)** | GitHub Private Vulnerability Reporting ativo e testado com prazo de resposta cumprido conforme [SECURITY.md](../../SECURITY.md) | Registro do teste de recebimento e resposta |

---

## 3. Jurídico, Moderação e Confiança

| Critério | Meta para Go | Como verificar |
|---|---|---|
| **Parecer e enquadramento institucional (`REV-12` / `REV-18`)** | Parecer jurídico entregue (`REV-12`); associação/representante PJ no Brasil (`REV-18`) formalmente constituída ou formalmente dispensada pelo parecer | Referência documental no `ROADMAP.md` (sem inventar dados no repo) |
| **Termos, Privacidade e Jurisdição (`LAN-02` / `LAN-03`)** | `client/terms.html` publicado com aceite no onboarding; [privacy.html](../../client/privacy.html), [data-deletion.html](../../client/data-deletion.html) e [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md) revisados para STF Temas 987/533, Decretos 12.975/12.976/2026, ECA Digital (`REV-23`) e TSE (`REV-24`) | Páginas no ar + validação jurídica humana registrada |
| **Autorregulação e ocultação oficial (`REV-20` / `LAN-13`)** | Kit mínimo publicado (regras versionadas, canal para não usuários, modelo de relatório anual) e lista de ocultação assinada do PWA oficial (`LAN-13`) operacional e auditável | Fluxo testado e regra publicada em [GOVERNANCE.md](../../GOVERNANCE.md) |
| **SLA de abuso e plantão (`LAN-04` / `LAN-24`)** | Plantão ativo com **≥ 2 pessoas** em rodízio; **≥ 1 simulado datado** em [runbook-incidentes.md](../operations/runbook-incidentes.md); **100%** das denúncias de conteúdo grave (abuso infantil, terrorismo, íntimo não consentido) contidas no PWA oficial em **≤ 2 h** (Decreto 12.976/2026); **0** denúncia grave sem resposta em 24 h | Log de moderação/plantão na retrospectiva do beta (`LAN-29`) |
| **Privacidade de IP e LGPD (`LAN-19` / `REV-23`)** | Aviso explícito de exposição de IP no WebRTC, modo "só TURN" funcional, padrões seguros por idade (< 18 e vínculo de responsável < 16 anos) operacionais conforme `REV-12` | Testes automatizados e verificação manual no onboarding |

---

## 4. Desempenho e Acessibilidade

| Critério | Meta para Go | Como verificar |
|---|---|---|
| **Acessibilidade WCAG 2.2 AA (`LAN-22`)** | Auditoria nas 10 rotas principais concluída (contraste, navegação por teclado, foco visível, alvo de toque ≥ 24 px, leitores TalkBack/VoiceOver) com **0** bloqueador aberto | Relatório de auditoria + checagem automatizada no CI verde |
| **Orçamento em 3G lento / Android de entrada (`LAN-23`)** | Orçamento de bytes do shell e tempo até a primeira tela medido em Slow-3G / dispositivo 2 GB RAM, publicado na release e travado no CI contra regressão | Job de orçamento no CI + registro em `CHANGELOG.md` na v1.0 |
| **Onboarding com leigos (`LAN-25`)** | Sessões concluídas com **≥ 5 pessoas** fora da bolha técnica (criar identidade, backup, postar, entrar em comunidade, recuperar conta) e os 5 principais atritos corrigidos | Notas consolidadas das sessões e PRs de correção |

---

## 5. Operações e Orçamento

| Critério | Meta para Go | Como verificar |
|---|---|---|
| **Teste de carga (`LAN-09`)** | **≥ 500 pares simulados** na sinalização e **≥ 50 pares reais** em malha validados, com gargalos e limites documentados em [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) | Script em `tools/` + relatório datado |
| **Orçamento e cobertura de 12 meses (`LAN-32`)** | Projeção de 12 meses (1.000 e 10.000 usuários) publicada em [INFRA-CUSTOS.md](../INFRA-CUSTOS.md#6-projeção-orçamentária-de-12-meses--1000-e-10000-usuários-ativos-lan-32), com **cobertura financeira confirmada para ≥ 12 meses** (edital, GitHub Sponsors ou caixa da entidade) | Evidência de cobertura confirmada pelos titulares |
| **Independência operacional (`LAN-30` / `NET-02` / `NET-04`)** | Bus factor **≥ 2** em organização GitHub, Render, Cloudflare, domínio próprio (`LAN-06`) e cofre de credenciais; **≥ 2 stewards externos** operando sem o mantenedor; **≥ 1 drill de DR datado** (`NET-02`) | Inventário de titulares (sem segredos) e ata de drill |
| **Relatório do beta (`LAN-29`)** | Relatório consolidado do beta (5–10 comunidades, 50–100+ testadores) sem nenhum gatilho de pausa em aberto | Documento datado aprovado antes da tag `v1.0.0` (`LAN-33`) |

---

## 6. Protocolo Explícito de Decisão (Sign-off, No-Go e Cadência)

### 6.1 Quem assina o Go para o público (G3)

A abertura da Onda 3 (Público) exige aprovação unânime por registro escrito (PR/ata ligada ao `ROADMAP.md` e ao `LAN-29`) de:

1. **Mantenedor técnico** (conferência de CI, `LAN-09`, `LAN-18`, `LAN-22`, `LAN-23`, `LAN-33`);
2. **Pelo menos 2 Stewards externos ativos** (`LAN-30`, `NET-04`) confirmando independência operacional, drill de DR (`NET-02`) e espelho B;
3. **Responsável pelo plantão de moderação e confiança** (`LAN-04`, `LAN-13`, `REV-20`);
4. **Conferência documental do representante jurídico/institucional** (`REV-12`, `REV-18`, `LAN-02`, `LAN-03`) e confirmação de cobertura do orçamento de 12 meses (`LAN-32`).

Nenhum papel individual pode declarar "Go" unilateralmente pulando itens bloqueantes.

### 6.2 Gatilhos automáticos de No-Go, Hold e Rollback

| Condição observada | Decisão automática | Ação imediata |
|---|---|---|
| Qualquer item de **Segurança** (`LAN-18`, vulnerabilidade crítica/alta, vazamento de chave) ou **Jurídico** (`REV-12`/`REV-18`/`LAN-02`/`LAN-04`) ausente | **NO-GO** | Bloqueia passagem para G3 até evidência completa e reavaliação |
| Conteúdo grave sem contenção no SLA (`≤ 2 h` no `LAN-04`) ou falha no plantão de 2 pessoas | **HOLD / Pausa imediata** | Qualquer plantonista fecha convites e desliga recursos afetados via `client/config/flags.json` (`LAN-08`) |
| Sinalização fora do ar **> 2 h** sem caminho reserva ou estouro iminente de cota free tier sem cobertura | **HOLD / Rollback de onda** | Pausar novos convites ([plano-lancamento-ondas.md](./plano-lancamento-ondas.md)), publicar `notice` e acionar [runbook-incidentes.md](../operations/runbook-incidentes.md) / [ops-pages-rollback.md](../operations/ops-pages-rollback.md) |
| Bus factor = 1 em qualquer conta crítica (`LAN-30`) ou cobertura financeira < 12 meses (`LAN-32`) | **NO-GO** | Permanecer em beta fechado até regularização dos titulares ou verba |
| Regressão após abertura pública | **Rollback para Onda 2** | Fechar convites, aplicar kill-switch (`flags.json`) ou reverter deploy no Pages; publicar pós-incidente em até 7 dias |

### 6.3 Cadência de revisão

- **Durante o beta fechado (F2 / Ondas 1–2):** revisão **semanal** das métricas locais (`#/status`, `bug-tester.yml`, fila de moderação e consumo de cota TURN/Render) pelo plantão e stewards ativos.
- **Portão G3 (Go/No-Go formal):** avaliação completa ao término da janela mínima do beta (8–12 semanas no `ROADMAP.md`, mínimo de 4 semanas por onda).
- **Em caso de No-Go:** abrir plano de remediação com responsáveis e datas, executar novo ciclo de verificação de no mínimo **2 semanas** antes de nova votação de Go/No-Go.
