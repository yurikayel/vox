# Cache manifest v0 — spec kickoff (Antigravity)

**Tarefa Vox V-I05** · rascunho de protocolo (sem cliente mirror completo neste PR)  
**Branch de spec:** `feat/cache-manifest-spec`  
**Implementação prevista:** `V-I03` (gerar índice + `POST /vox/mirror`) + validação no relay  
**Baseline:** `main` · **155** testes (`141` JS + `14` Python)  
**Relacionado:** [espacos-digitais-infra.md](./espacos-digitais-infra.md), `relay/` `/vox/mirror`, lobby `V-I05`

---

## 1. Problema

Stewards espelham índices via `POST /vox/mirror` e `GET /vox/index/<commId>.json`, mas **não há prova on-chain** de quais TXs Arweave o operador **compromete-se a pinar** no relay/cache.

Leitores precisam de: (1) lista canônica de TXs por `Community-Id`; (2) integridade via `Pins-Root`; (3) cadeia `Previous-Manifest`.

**Objetivo v0:** transação `Type: cache-manifest` + corpo JSON + tags; helpers em `cache-manifest.js`.

**Fora de escopo v0:** enforcement no relay; gossip de manifestos; UI steward.

---

## 2. Transação Arweave

### Tags obrigatórias

| Tag | Valor |
|-----|-------|
| `App-Name` | `vox-brasil` |
| `Type` | `cache-manifest` |
| `Community-Id` | slug da comunidade |
| `Manifest-Version` | `0` |
| `Unix-Time` | ms epoch |
| `Content-Type` | `application/json; charset=utf-8` |

### Tags opcionais

| Tag | Uso |
|-----|-----|
| `Owner-Addr` | Endereço Arweave do emissor |
| `Previous-Manifest` | TX id do manifesto anterior |
| `Pins-Root` | SHA-256 hex de `pins` canônico (ordenado por `txId`) |

### Corpo JSON (v0)

```json
{
  "v": 0,
  "communityId": "demo-aprenda-vox",
  "issuedAt": 1730000000000,
  "issuerRouteId": "vx_optional_local_steward",
  "previousManifestTx": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "pins": [
    { "txId": "…43…", "role": "community", "sha256": "64_hex_opcional" },
    { "txId": "…43…", "role": "topic" }
  ]
}
```

| Campo | Regras |
|-------|--------|
| `pins` | 1–512 entradas; `txId` único; regex `^[A-Za-z0-9_-]{43}$` |
| `pins[].role` | `community`, `topic`, `reply`, `post`, `blob`, `index` (default `blob`) |

A transação Arweave assinada **é** a attestation on-chain.

---

## 3. Attestation espelho (relay)

`POST /vox/mirror` pode incluir `cacheManifest` assinado com `localAccount.signPayload` (local, não permaweb). Relay v0 persiste opaco; validação em `V-I03`/`V-I08`.

---

## 4. Módulo `cache-manifest.js`

Exports: `CACHE_MANIFEST_TYPE`, `MANIFEST_VERSION`, `validateManifestBody`, `buildManifestBody`, `pinsRootSha256`, `buildCacheManifestTags`, `extractCacheManifestMeta`.

Testes: `tests/cache-manifest.test.js` (M1–M4).

---

## 5. Referências

- [espacos-digitais-infra.md](./espacos-digitais-infra.md)
- [relay/README.md](../relay/README.md)
- Lobby `politica/lobby.md` — V-I05

*Kickoff Antigravity — spec + tipagem de tags v0.*
