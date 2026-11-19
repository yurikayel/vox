# Modo assembleia (v0)

> **Status:** rascunho (stub antes do código, PM-23) · **Owner:** mantenedor · **Revisado:** 2026-11-19
> **Acompanhamento:** **PM-23** no [ROADMAP](../ROADMAP.md) · cunha do piloto G1 (decisão 10/11/2026)
> **Não substitui o ROADMAP** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Até o piloto fechado, [roteiro](../pilot/piloto-g1-roteiro-conversa.md) e [convite](../pilot/piloto-g1-convite.md) continuam honestos: **o modo assembleia ainda não existe no app**.
> Relacionados: [aviso assinado (PM-97)](./aviso-assinado-v0.md), [canal (PM-81)](./canal-comunidade-v0.md), `civic-post.js`, governança existente, [terceiro lugar](../brainstorms/brainstorm-terceiro-lugar-2026-11-10.md), inspiração Énóis (rituais) em [brainstorm-enois-observacao-2026-11.md](../brainstorms/brainstorm-enois-observacao-2026-11.md).

## Problema

Grupos que já decidem no WhatsApp precisam de **registro assinado** do que foi combinado (pauta, quórum, voto, ata), sem obrigar todo membro a ter conta ou sair do grupo.

## Escopo v0 (piloto)

- Pauta publicada na comunidade com prazo de votação.
- Lista de presença ou equivalente assinável (export conferível).
- Votação com prazo usando governança já no código onde couber.
- Ata assinada exportável (texto + hashes das assinaturas relevantes).
- Fluxo de menor atrito: enquete WhatsApp + conferência no Vox por quem organiza ([terceiro lugar §2](../brainstorms/brainstorm-terceiro-lugar-2026-11-10.md)).

## Formato assinado (regra geral)

Igual ao [aviso assinado](./aviso-assinado-v0.md): **campos no topo do objeto**, sem aninhamento que quebre `sigv` 1/2 ([PM-85](../ROADMAP.md), `sig-format.js`). Qualquer extensão do modo assembleia deve passar no mesmo pipeline de assinatura e verificação offline.

## Requisitos novos (observação mapa + Loomio + Decidim)

### Voto de discordância ou bloqueio

| Campo | Regra |
|---|---|
| `blockReason` | Obrigatório quando o voto for de **bloqueio** ou **discordância explícita** (inspiração Loomio). Mínimo 1 linha, máximo ~280 caracteres, campo plano no payload assinado do voto. |

### Status pós-decisão

| Campo | Regra |
|---|---|
| `decisionStatus` | Depois que a proposta encerra: `em_andamento`, `cumprida` ou `arquivada` (inspiração Decidim / Brasil Participativo). Campo plano no objeto da decisão assinada; atualizável só por quem a governança já autoriza a encerrar ou arquivar. |

## Rituais v0.1 (inspiração Énóis, dentro do PM-23)

Não criar tipo de post novo: estender **aviso** `convocacao` ([aviso-assinado-v0](./aviso-assinado-v0.md)):

| Campo | Regra |
|---|---|
| `ritualRule` | Opcional. Ex.: `monthly` para encontro recorrente. |
| `eventAt` | Obrigatório em `convocacao` (já na spec do aviso). |
| `eventPlace` | Opcional (já na spec do aviso). |
| Próxima ocorrência | Calculada na **leitura** a partir de `ritualRule` + último `eventAt` (exibir “Todo mês · Próximo: DD/MM”). |

**RSVP:** só via `type: "aviso-resposta"` existente (`ciente`, `vou`, `talvez`, `nao-vou`). Proibido duplicar confirmação em outro tipo de objeto.

## Fora do v0

- Pol.is / bridging em produção (só pós-**REV-02** e espaço de shell **PM-01**).
- Apoio mínimo estilo petição (funil Decidim completo).
- Live de voz/vídeo integrado.

## Labs (avaliação sob demanda)

`client/js/labs/parado/polis.js`, `bridging-rank.js`, `aviso-roles.js` — sem import no precache do núcleo até decisão explícita REV-02.

## Critérios de aceite (primeira implementação)

1. Pauta e resultado exportados conferem offline com `verifyPayload`.
2. Voto de bloqueio sem `blockReason` é recusado na leitura (mesma filosofia do aviso inválido).
3. `decisionStatus` só aceita os três valores; transição inválida é ignorada ou rejeitada conforme regra de governança já existente.
4. Ritual mensal reusa contagem de `aviso-resposta` sem novo endpoint de servidor.
5. Testes unitários cobrem pelo menos assinatura, export e validação de `blockReason` / `decisionStatus`.