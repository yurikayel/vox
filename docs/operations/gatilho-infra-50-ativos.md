# Gatilho de infraestrutura — mais de 50 usuários ativos

> **Status:** canônico (esboço operacional, sem deploy) · **Owner:** mantenedor · **Revisado:** 2026-11-19 · **Decisão:** infra relay/TURN adiada até passar deste limiar ([ROADMAP.md](../ROADMAP.md), seção INF).

## Quando disparar

Abrir checklist **só** quando houver evidência sustentada de **>50 contas ativas** (definição operacional a fixar com o mantenedor: ex. ≥50 `routeId` distintos com atividade nos últimos 7 dias, medida por telemetria já presente no cliente ou contagem conservadora no relay — **sem** inventar métrica central nova neste doc).

Abaixo de 50: manter **1× relay** no Render, keepalive GitHub (#282), sem TURN pago nem segundo nó.

## Checklist INF (ordem sugerida)

| ID | Ação humana / código | Referência |
| :--- | :--- | :--- |
| **INF-01** | Credencial TURN em produção (Worker Cloudflare), teste `curl`, depois preencher `turnCredentialsUrl` em `client/config/signaling.json` (+ bump SW) | [turn-e-segundo-no.md](./turn-e-segundo-no.md) |
| **INF-02** | Segundo nó de sinalização na lista `signalingUrls`; validar `/health` e `wscat` nos dois | runbook §4 |
| **INF-03** | `VOX_RELAY_TRUST_PROXY_HOPS` no Render + pinger externo 5 min em `/health` | `relay/render.yaml`, lacuna 2 da relay API |
| **INF-04** | Snapshot autenticado no cliente (`X-Vox-Snapshot-Proof`, `sig` de autores); relay `compat` → `enforce` | [RFC 0002](../rfc/0002-snapshot-autenticado-do-relay-cego.md) |

## O que **não** fazer antes do gatilho

- Deploy de TURN ou segundo relay “por precaução”.
- Abrir piloto público (V-P09) ou convites em massa.
- Assumir verba NLnet/associação como substituto deste gatilho — financiamento é trilha paralela (fora deste arquivo).

## Evidência ao fechar cada INF

Para cada item: captura sem segredos, comando executado, data e link para o PR que alterou config ou cliente. Registrar handoff em `lobby.md` (SHA, testes CI).

## Relação com fraquezas #1–#3

TURN (#1), relay 24/7 (#2) e rate limit / proxy trust (#3) dependem deste gatilho ou de decisão explícita do mantenedor **acima** do limiar. Sem isso, permanecem dormentes conforme Fase 0 (nov/2026).