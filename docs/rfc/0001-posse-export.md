# RFC 0001 — Export POSSE (`vox-posse-export`)

**Status:** Exemplo aceito (documentação)  
**Data:** 2026-10-25

## Contexto

Criadores precisam replicar publicações do Vox para outras redes mantendo URL canônica `#/t/:id`.

## Payload

```json
{
  "v": 1,
  "type": "vox-posse-export",
  "topicId": "top_…",
  "communityId": "slug",
  "title": "",
  "body": "",
  "image": "",
  "canonicalUrl": "https://…/#/t/…",
  "exportedAt": "ISO-8601"
}
```

## Consumidores

- PWA sheet `posse-dispatch.js` (Tier A intents + export).
- CLI `tools/posse-cli/posse-cli.mjs` (webhooks headless).
- Extensão futura `vox-bridge-posse` v1 (stub MV3).

## Decisão

Versão `v: 1` congelada até RFC substituta; campos opcionais não quebram parsers.
