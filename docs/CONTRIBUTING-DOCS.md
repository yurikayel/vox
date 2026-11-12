# Como manter a documentação (Vox)

> **Status:** canônico (norma curta) · **Owner:** mantenedor doc / revisor · **Revisado:** 2026-11-12  
> **Índice único:** [README.md](./README.md) — esta página não abre trilha paralela.
> **Documentação no código e o que atualizar a cada mudança:** [process/documentacao.md](./process/documentacao.md) (checada por `npm run audit:docs`).

Regras enforçáveis para voluntários e agentes. Objetivo: um revisor novo entende **onde entrar**, **o que está vivo** e **como marcar pronto** em ~30 minutos.

## 1. Porta única

- Só [docs/README.md](./README.md) organiza navegação. Plano vivo e caixas `[ ]`: **só** [ROADMAP.md](./ROADMAP.md) ([ADR-017](./adr/017-consolidacao-roadmap-unico.md)). Novos docs entram no índice ou ficam claramente **histórico** / **SUPERSEDED** no banner.
- Links **dentro do repo:** caminhos relativos (`./foo.md`, `../client/DEV.md`).
- Links **fora do repo** (Voxpedia, WhatsApp, Pages): URLs `https://github.com/yurikayel/vox/...` quando apontar para código/specs.

## 2. Banner de status (obrigatório em todo doc de `docs/`)

No topo (nas 12 primeiras linhas, depois do front matter se houver), uma linha com:

| Campo | Valores |
|-------|---------|
| **Status** | uma palavra do vocabulário abaixo; depois dela, detalhe livre entre parênteses ou após `·` |
| **Owner** | papel (ex.: mantenedor doc, steward ops, meta-processo) |
| **Revisado** | `AAAA-MM` ou data ISO da última vez que o **texto** foi revisto (não a data de mover o arquivo) |

Exemplo: `> **Status:** parcial (passo 0 implementado no PM-78) · **Owner:** mantenedor · **Revisado:** 2026-11-10`

### 2.1 Vocabulário fechado

A primeira palavra depois de `**Status:**` vem desta lista. O `npm run audit:docs` reprova doc de `docs/` sem banner (`status`) ou com palavra fora da lista do seu tipo (`status:<palavra>`). Maiúsculas não contam. Ficam de fora só os arquivos gerados em `metrics/`.

| Onde vale | Palavra | Quer dizer |
|---|---|---|
| Qualquer doc | `canônico` | Em vigor: é a referência atual do assunto |
| | `rascunho` | Em elaboração ou esperando aprovação; ainda não vale como norma nem como entrega |
| | `brainstorm` | Ideias; não é plano nem compromisso (leva também a frase "Não substitui X") |
| | `pesquisa` | Levantamento, medição ou spike: informa uma decisão, não é a decisão |
| | `auditoria` | Retrato datado de uma verificação; o que ela achou pode já ter mudado |
| | `histórico` | Retrato antigo, guardado para consulta; não seguir |
| | `SUPERSEDED` | Substituído; o banner aponta o sucessor |
| Decisão numerada (`adr/NNN-…`, `rfc/NNNN-…`), só estas | `proposed` | Em discussão |
| | `accepted` | Decidida (se já está no código, diga no detalhe) |
| | `superseded` | Substituída por outra decisão, citada no banner |
| Spec (`specs/`), além das gerais | `aceita` | Texto aprovado, nada implementado |
| | `parcial` | Parte implementada; o detalhe diz qual parte |
| | `implementada` | No código; se depende de flag ou de configuração, o detalhe diz |

Palavra nova no vocabulário entra aqui e em `scripts/docs-audit.mjs` no mesmo PR. O estado de implementação de uma spec tem de bater com o [FEATURES.md](./FEATURES.md), que é quem manda nisso.

**SHA / testes / SW:** não repetir em todo header — alinhar com a release line de [../README.md](../README.md) e o baseline de [README.md](./README.md). Se precisar citar commit, uma vez no índice basta.

Brainstorms novos: banner + frase **“Não substitui X”**. Proibido criar outra tabela **N=…** mestre sem ADR que retire/arquive a anterior ([brainstorm 10 fraquezas](./brainstorms/brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md) §1).

## 3. Definition of Done por item

Cada checkbox ou linha de checklist declara **um** tipo:

- `doc` — texto/spec revisado, link no índice, banner ok.
- `code` — merge em `main`, `npm test` verde, SW/README se aplicável (DOC-01).
- `ops-humano` — evidência fora do git (print, URL espelho, ata) referenciada no doc; **não** misturar com “feito” de código.

## 4. Mutex de arquivo

Regra completa (fonte única): [metodo-agentes-mutex-e-revisor.md](./process/metodo-agentes-mutex-e-revisor.md). Aplicação a docs:

- **Um autor ou agente por arquivo** (ou seção marcada) por vez. PRs que tocaram o mesmo canon em paralelo: rebase e reconciliar banners antes de merge.
- Lobby/agentes: ler [README.md](./README.md) + este arquivo antes de editar ROADMAP ou direcionamento.

## 5. Auditabilidade

- Contagens de testes, `CACHE_NAME` do SW e SHA de release devem bater com [../README.md](../README.md) (tabela release / footer DOC-01).
- Preferir atualizar o índice + README uma vez por release em vez de espalhar números novos em dezenas de headers.

## 6. Produto vs repositório

- **Código e specs técnicas:** GitHub ([docs/](https://github.com/yurikayel/vox/tree/main/docs), [client/DEV.md](https://github.com/yurikayel/vox/blob/main/client/DEV.md)) — fonte auditável, não helpdesk.
- **Voxpedia** (`#/voxpedia`): linguagem leiga in-app; aponta para o GitHub para quem for contribuir ou auditar.
- **Relays, moderação local, espelhos:** responsabilidade das comunidades e stewards ([GOVERNANCE.md](../GOVERNANCE.md)); o repo publica cliente e revisa código.

---

**Versão:** 1.2 · 2026-11-12 (vocabulário fechado de status, conferido pelo `audit:docs`; 1.1: ROADMAP único — ADR-017)
