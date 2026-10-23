# ADR-001: Atestação exportável de contribuição P2P

**Status:** proposed · **Horizonte C**

## Decisão

Snapshot assinado (`signPayload`) de `getPeerMetrics()` — `type: contribution-attestation`, `schemaVersion: 0`. Export opt-in em `#/settings/network`. **Não** gossip automático; **não** afeta feed/WANT.

## Limites

- Self-attested (localStorage forgeable antes de assinar)
- Sem leaderboard; rate limit export; disclaimers Pix manual (COMPLIANCE-BR)

## Futuro

Log por evento ou transação Arweave opcional — fora v0.

*Spike: contribution attestation (23/10).*
