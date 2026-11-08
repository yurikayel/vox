# Plano de lançamento em ondas (LAN-34)

**Status:** rascunho de 08/11/2026, para aprovar antes de qualquer anúncio público.
**Decide abrir e pausar:** o mantenedor, ouvidos os stewards ativos. Qualquer pessoa do plantão (LAN-24) pode **pausar** sozinha; só o mantenedor **reabre**.

## Ondas

| Onda | Quem entra | Tamanho | Pré-requisito | Duração mínima |
|---|---|---|---|---|
| **0 — Piloto fechado** | 1 comunidade, facilitador nomeado | 10–30 | Portão **G1** | 4 semanas (PIL-02) |
| **1 — Beta por convite** | Comunidades parceiras, convite pessoal | até 300 | Portão **G2** + retrospectiva do piloto (PIL-03) | 4 semanas |
| **2 — Beta aberto com fila** | Qualquer pessoa com link, convites limitados por membro | até 3.000 | Relatório da onda 1 sem gatilho de pausa aberto | 6 semanas |
| **3 — Público** | Qualquer pessoa | — | Portão **G3** + relatório do beta (LAN-29) | — |

A passagem de onda é registrada no ROADMAP com data e quem decidiu.

## Gatilhos de pausa

Qualquer um destes faz voltar à onda anterior ou pausar o recurso:

| Gatilho | Ação imediata |
|---|---|
| Conteúdo grave sem resposta dentro do prazo do LAN-04 | Fechar convites; `communityCreate: false` |
| Incidente de segurança com dado de usuário | `notice` + pausar o recurso afetado; pós-incidente antes de reabrir |
| Spam passando do limite por chave (LAN-14) por mais de 24 h | `arweaveUpload: false` até ajustar os parâmetros |
| Sinalização fora por mais de 2 h sem caminho reserva | Fechar convites até o 2º caminho existir |
| Custo mensal acima do orçamento coberto (LAN-32) | Fechar convites; revisar INFRA-CUSTOS |
| Ordem judicial que o projeto não consegue cumprir tecnicamente | Pausar a onda e acionar o jurídico |

Como pausar: kill-switch em [`client/config/flags.json`](../../client/config/flags.json) e o runbook [runbook-incidentes.md](../operations/runbook-incidentes.md). "Fechar convites" hoje é manual (parar de distribuir links); um flag de convites fica para quando houver convite no app.

## O que medir em cada onda

Os critérios de go do beta ficam no [go/no-go do piloto](../pilot/piloto-comunidade-go-no-go.md) (LAN-28): retenção, steward externo, incidentes, saúde do P2P e uso da cota.
