# POST /vox/mirror — validação estrutural v1 (ADR)

**Status:** proposta · implementação em `relay/mirror_validate.py`

## Verificar no POST

- Tamanho corpo ≤ 256 KiB
- JSON objeto; `communityId` regex `^[a-zA-Z0-9._-]{1,128}$` (path-safe)
- `topics` array ≤ 500; ids locais (`post_1`) **permitidos** (≠ Arweave)
- `cacheManifest` opcional: regras v0 de `cache-manifest.js` (sem assinatura v1)

## Erros JSON

```json
{ "code": "mirror.community_id_invalid", "error": "…" }
```

HTTP: 400 estrutural, 413 corpo grande, 500 só I/O.

## Compat

Campos desconhecidos permitidos; sucesso `{ "status": "mirrored", "communityId" }` inalterado.

*Detalhe: spike mirror validate (23/10).*
