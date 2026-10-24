# Rede Vox sustentada majoritariamente pelos participantes

Documento estratégico (v1.0). Complementa [espacos-digitais-infra.md](./espacos-digitais-infra.md) e [backlog-participacao-rede.md](./backlog-participacao-rede.md).

## Meta trimestre

Coletivo sobe relay + comunidade **sem loop do mantenedor**; retratação + manifest na malha; visitante lê via gateway **ou** relay comunitário.

## Definição operacional

| Indicador | Alvo |
|-----------|------|
| Leitura | Posts recentes resolvem via cache local / P2P / relay comunitário; gateway = **reserva visível** |
| Infra | ~1 steward por 3–5 comunidades, não um mantenedor central para todas |
| Contribuição | Default **Ativo**; **Apoiador** (`commOnly`) sweet spot; stewards minoria voluntária |
| Custo central | GitHub Pages + gateways públicos; **zero** VPS obrigatória do projeto |

Heurística de design (não KPI público): comunidade 50+ membros — ≥70% Ativo/Apoiador; 1–2 stewards; gateway &lt;30% leituras de posts recentes quando há steward + ≥5 pares (telemetry local opt-in).

## Diagnóstico resumido

**Pronto:** camadas 0→3, Pacto Vox (`peers.js`), `commOnly`, mirror, relay HTTP configurável, `CACHE_MANIFEST`, listing/feira, retratação gossip, UI `#/settings/network`.

**Gargalos:** atrito steward (deploy); gateway fallback opaco; reciprocidade fraca fora de settings; cold start sem ritual de seed; V-I09 affinity pendente impl.

**Brasil:** CGNAT — celular não substitui VPS; Passivo legítimo; sem scoreboard público ([ADR-001](./adr/001-contribution-attestation-export.md) só export opt-in).

## Loops produto

1. **Uso → espaço digital** — comunidade, handle, feira aumentam valor de cache perto.
2. **Benefício visível** — pill “Leitura reserva” quando gateway responde ([gateway-telemetry.js](../client/js/gateway-telemetry.js)).
3. **Contribuição escalonada** — Passivo → Ativo (default) → Apoiador → Steward (wizard).
4. **Governança suave** — feira sugere pin/espelho, não exige ([governance-proposta-feira-pin-template.md](./governance-proposta-feira-pin-template.md)).

## Anti-padrões

- Ranking público de nós, moeda in-app, alcance pago por infra.
- Obrigar steward para postar.
- Prometer 100% P2P no celular.

## Piloto recomendado

Ver [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md).

## Referências

- [steward-seed-15min.md](./steward-seed-15min.md) · [steward-relay-kit.md](./steward-relay-kit.md)
- [proposta-vox.html](./proposta-vox.html)
- Lobby politica: § Participação majoritária

**Versão:** 1.0 · **Dono:** Community-doc
