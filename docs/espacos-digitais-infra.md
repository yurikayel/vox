# Espaços digitais e infra comunitária — spec canônica (V-I01)

Documento normativo curto. **Não é parecer jurídico.** Implementação segue backlog `V-I02`–`V-I10`; copy de UI em `V-I06`.

## Tese

Quem **usa** o Vox e **adquire espaços digitais** (comunidade, handle `@`, feira local, posts assinados) ganha quando a malha lê e entrega conteúdo mais rápido. O vínculo é **opt-in**, transparente e **sem pay-to-win de alcance** — ajudar a infra não compra visibilidade algorítmica.

## Espaço digital (definição)

Conjunto de **ativos de protocolo** que o usuário possui ou participa, já publicados ou em trânsito local:

| Ativo | Onde vive | Malha se beneficia quando… |
|-------|-----------|----------------------------|
| Comunidade (`Type: community`) | Permaweb + cache local | Índice/espelho da comunidade está perto do leitor |
| Handle (`Type: handle`) | Permaweb | Resolução e perfil carregam sem depender só de gateway remoto |
| Feira (classificados habilitados na comunidade) | Tags + posts locais/on-chain | Ofertas recentes ficam em cache P2P/relay |
| Posts/tópicos/respostas | Permaweb e/ou gossip local | BLOBs públicos são servidos por pares ou relay |

**Espaço digital ≠ conta corporativa.** Identidade é chave local; infra é cooperativa voluntária ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md), [GOVERNANCE.md](../GOVERNANCE.md)).

## Camadas de participação na malha

Quatro camadas **ordinais** (0→3). O cliente mapeia preferências em `#/settings/network`; termos técnicos ficam em `<details class="advanced-settings">` (`V-I06`).

### 0 — Passivo (somente leitura)

- **Comportamento:** consome feeds, perfis e DMs; **não** serve BLOBs a terceiros (`enabled: false` / “Pausar ajuda à rede”).
- **Obrigação:** nenhuma para a malha; respeitar LGPD e conteúdo público que escolheu baixar.
- **Oportunidade:** uso mínimo de banda/disco; adequado a dados móveis ou bateria fraca.

### 1 — Ativo (nó leve default-on)

- **Comportamento:** cache local + gossip/WebRTC dentro dos tetos (banda diária, disco, Wi-Fi opcional) — [Pacto Vox](../COMPLIANCE-BR.md).
- **Obrigação:** servir **apenas dados já públicos** que o cliente possui; honrar pausa e limites configurados.
- **Oportunidade:** acelera **seus** espaços digitais indiretamente (reciprocidade); melhora experiência geral da rede.

### 2 — Apoiador (escopo comunitário)

- **Comportamento:** como Ativo, mas **`commOnly`**: repassa WANT/BLOB preferencialmente das **comunidades em que participa** (`V-I02` wire).
- **Obrigação:** não usar escopo comunitário para amplificar spam fora das comunidades aderidas.
- **Oportunidade:** quem mantém comunidade/feira **prioriza** vizinhança de cache daquele `Community-Id`; alinha custo de banda ao território digital que importa.

### 3 — Steward (espelho / relay)

- **Comportamento:** operador de **relay desktop** ou VPS (`vox/relay/`), espelho multi-comunidade, quotas de disco, deploy documentado (`V-I08`); opcionalmente URL remota configurável no PWA (`V-I04`).
- **Obrigação:** Marco Civil / papel de espelho ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)); TTL e limpeza de cache; **sem** inspecionar DMs (relay de inbox permanece transitório).
- **Oportunidade:** handle/comunidade/feira **legível offline ou em link lento** via `GET /vox/index/<commId>.json` e `POST /vox/mirror` (`V-I03`); manifesto assinado de pin (`V-I05`, rascunho).

```
Leitor ──► Passivo
         └► Ativo ──► Apoiador (commOnly) ──► Steward (relay/espelho)
              ↑ opt-out a qualquer momento (#/settings/network)
```

## Mapa obrigações × oportunidades

| Camada | Obrigações (mínimas) | Oportunidades (para espaços digitais) |
|--------|----------------------|----------------------------------------|
| Passivo | Não servir terceiros; pausa explícita | Ler sem custo de uplink |
| Ativo | Tetos de banda/disco; só payload público | Cache P2P acelera re-leitura própria e vizinhos |
| Apoiador | Escopo honesto às comunidades (`commOnly`) | Feira/comunidade do bairro “perto” na malha |
| Steward | Quotas, saúde do relay, conformidade espelho | Índice consolidado; LAN/VPS para coletivo |

**Governança suave (não vinculante, `V-I07`):** comunidade que **habilita feira** pode **sugerir** pin/espelho leve a membros Apoiador/Steward — nunca exigir como condição de postar.

## Estado do código (24/10/2026)

| Item | Status |
|------|--------|
| Relay HTTP `/health`, `/tx/:id`, `/vox/mirror`, `/vox/index/*.json` | **Integrado** (`relay/server.py`; health com inventário de espelhos) |
| Cliente mirror comunidade | **Integrado** (`community-mirror.js`, hook pós-comunidade) |
| `commOnly` filtra WANT/BLOB | **Integrado** (`peers.js`, SW v6.7+) |
| Relay remoto configurável | **Integrado** (`vox-relay-http-url`, badge host) |
| Manifesto `Type: cache-manifest` + gossip | **Integrado** (`cache-manifest.js`, `peers-cache-manifest.js`) |
| UI camadas Passivo→Steward | **Integrado** (`render.js`, `#/settings/network`) |
| Gateway telemetry (Leitura reserva) | **Integrado** (`gateway-telemetry.js`, V-P02) |
| Wizard steward | **MVP** `#/settings/network/steward` (V-P01) |
| Kit steward deploy | **Parcial** (`relay/deploy`, `steward-relay-kit.md`, quota env) |
| Blob soft priority V-I09 | **Integrado** (`peers-blob-affinity.js`, `main` cc6239a) |

## Princípios inegociáveis

1. **Opt-in / opt-out soberano** — downgrade para Passivo a qualquer momento.
2. **Sem score público de “bom nó”** — prioridade gossip suave (`V-I09`) sem ranking visível.
3. **Sem alcance pago** — infra não compra feed ([GOVERNANCE.md](../GOVERNANCE.md)).
4. **Transparência** — badges de relay/saúde e estatísticas já expostas em `#/settings/network`; stewards documentam URL e política de cache.

## Referências

- [relay/README.md](../relay/README.md) — endpoints espelho
- [docs/DNS-HANDLES.md](./DNS-HANDLES.md) — handle como espaço digital
- Backlog detalhado: `lobby.md` (repo politica) § Infra + espaços digitais

**Versão:** 1.0 · **Branch normativa:** `docs/espacos-digitais-infra` · **Dono doc:** Community-doc
