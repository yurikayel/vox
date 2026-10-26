# Como manter a documentação (Vox)

> **Status:** canônico (norma curta) · **Owner:** mantenedor doc / revisor · **Revisado:** 2026-11  
> **Índice único:** [README.md](./README.md) — esta página não abre trilha paralela.

Regras enforçáveis para voluntários e agentes. Objetivo: um revisor novo entende **onde entrar**, **o que está vivo** e **como marcar pronto** em ~30 minutos.

## 1. Porta única

- Só [docs/README.md](./README.md) organiza navegação (4 trilhas). Novos docs entram no índice ou ficam claramente **histórico** / **SUPERSEDED** no banner.
- Links **dentro do repo:** caminhos relativos (`./foo.md`, `../client/DEV.md`).
- Links **fora do repo** (Voxpedia, WhatsApp, Pages): URLs `https://github.com/yurikayel/vox/...` quando apontar para código/specs.

## 2. Banner de status (obrigatório em doc estratégico)

No topo, uma linha (blockquote) com:

| Campo | Valores |
|-------|---------|
| **Status** | `canônico` · `histórico` · `SUPERSEDED` |
| **Owner** | papel (ex.: mantenedor doc, steward ops, meta-processo) |
| **Revisado** | `AAAA-MM` ou data ISO |

**SHA / testes / SW:** não repetir em todo header — alinhar com a release line de [../README.md](../README.md) e o baseline de [README.md](./README.md). Se precisar citar commit, uma vez no índice basta.

Brainstorms novos: banner + frase **“Não substitui X”**. Proibido criar outra tabela **N=…** mestre sem ADR que retire/arquive a anterior ([brainstorm 10 fraquezas](./brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md) §1).

## 3. Definition of Done por item

Cada checkbox ou linha de checklist declara **um** tipo:

- `doc` — texto/spec revisado, link no índice, banner ok.
- `code` — merge em `main`, `npm test` verde, SW/README se aplicável (DOC-01).
- `ops-humano` — evidência fora do git (print, URL espelho, ata) referenciada no doc; **não** misturar com “feito” de código.

## 4. Mutex de arquivo

- **Um autor ou agente por arquivo** (ou seção marcada) por vez. PRs que tocaram o mesmo canon em paralelo: rebase e reconciliar banners antes de merge.
- Lobby/agentes: ler [README.md](./README.md) + este arquivo antes de editar dossiê, inventário ou direcionamento.

## 5. Auditabilidade

- Contagens de testes, `CACHE_NAME` do SW e SHA de release devem bater com [../README.md](../README.md) (tabela release / footer DOC-01).
- Preferir atualizar o índice + README uma vez por release em vez de espalhar números novos em dezenas de headers.

## 6. Produto vs repositório

- **Código e specs técnicas:** GitHub ([docs/](https://github.com/yurikayel/vox/tree/main/docs), [client/DEV.md](https://github.com/yurikayel/vox/blob/main/client/DEV.md)) — fonte auditável, não helpdesk.
- **Voxpedia** (`#/voxpedia`): linguagem leiga in-app; aponta para o GitHub para quem for contribuir ou auditar.
- **Relays, moderação local, espelhos:** responsabilidade das comunidades e stewards ([GOVERNANCE.md](../GOVERNANCE.md)); o repo publica cliente e revisa código.

---

**Versão:** 1.0 · nov/2026
