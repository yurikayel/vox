# ADR-004: Fallback de gateway — pill honesta (Leitura reserva)

**Status:** accepted · **V-P02**

## Contexto

`withGateways` / `fetchRawFromGateways` em [`graphql.js`](../../client/js/graphql.js) tentam gateways públicos Arweave/Turbo em sequência. Fallback silencioso confunde quem espera leitura “só na malha”. O brainstorm ([`gateway-honest-fallback-brainstorm.md`](../gateway-honest-fallback-brainstorm.md)) propôs telemetria local, estados de saúde e copy na UI — **sem** phone-home.

Implementação atual: [`gateway-telemetry.js`](../../client/js/gateway-telemetry.js) (`localStorage` `vox-gateway-health`), estados `all_ok` | `degraded` | `critical`, pill **Leitura reserva** em `#/settings/network` e `#/status` ([`network.js`](../../client/js/render/network.js), [`status.js`](../../client/js/render/status.js)).

## Decisão

- **Manter** a pill **Leitura reserva** (e variantes de copy) quando gateways falham ou a leitura usa cache local / relay comunitário — transparência sobre origem da leitura, não culpar o usuário.
- **Não** introduzir proxy central proprietário Vox que mascarar degradação, agregue telemetria de usuários ou substitua gateways públicos por um “backend Vox” de leitura.
- Telemetria de tentativas permanece **100% local** no aparelho; export diagnóstico continua **opt-in** e sem `txId` quando aplicável (V-P02).
- Melhorias futuras (segundo espelho, steward, lista de gateways editável) seguem camadas cooperativas documentadas — não revertem esta decisão.

## Rejeitado

- Proxy único operado pelo projeto para “esconder” falhas de gateway.
- Phone-home de saúde de rede para ranking, SLO central ou moderação de infra.
- Spinner infinito ou copy que finja malha plena enquanto só há cache/reserva.

## LGPD / COMPLIANCE-BR

- Consultas GraphQL vão a **terceiros**; IPs e logs ficam sob política dos operadores de gateway ([COMPLIANCE-BR.md](../../COMPLIANCE-BR.md) § LGPD).
- Contadores de falha/sucesso por gateway ficam em `localStorage` — minimização, sem identificação de titular enviada ao repositório Vox.
- Sem backend Vox de leitura: o mantenedor do repo **não** vira provedor de aplicação central por causa desta telemetria.

## Consequências

- CODE-05 fechado por ADR; brainstorm arquivado com banner SUPERSEDED.
- Testes: `gateway-telemetry.test.js`, render com pill em `render.test.js`, copy em `ajuda-teste.test.js`.
- Documentação canônica: este ADR + [COMPLIANCE-BR.md](../../COMPLIANCE-BR.md) § Leitura reserva.

*Brainstorm: gateway fallback UX honesta (23/10).*
