# Gateway fallback — UX honesta (brainstorm)

**Problema:** `withGateways` / `fetchRawFromGateways` fazem fallback silencioso; chip P2P não reflete leitura Arweave.

**Proposta:** módulo `gateway-telemetry.js` + `localStorage` `vox-gateway-health`; estados `all_ok` | `degraded` | `critical`; chip ou pill “Leitura reserva”; bloco em `#/settings/network`; **sem phone-home**.

**Testes:** mock fetch primário 503 + backup 200; export diagnóstico opt-in sem `txId`.

*Brainstorm completo: spike gateway fallback (23/10).*
