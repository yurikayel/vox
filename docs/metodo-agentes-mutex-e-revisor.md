# Método — mutex de agentes e modo revisor

Operacional (repo `vox`). Tese longa: [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md).

## Mutex (markdown canônico)

- **Um agente por arquivo** — ou **por §N** em arquivos com **>200 linhas**.
- **Handoff** ao encerrar o turno: listar paths tocados + o que **não** mexer neste lote.
- **Proibido:** duas sessões editando o **mesmo** markdown canônico em paralelo (PRs concorrentes no mesmo doc = rebase + dono único).

## Mantenedor → revisor (o que muda na prática)

### Mantenedor **faz**

- Revisar PR (RFC quando protocolo/malha mudar).
- Manter **CI verde** na linha de release.
- Contribuir como **cidadão** em **um** quadrado local (uma comunidade / um PR pequeno), sem operar a rede inteira.

### Mantenedor **não faz**

- VPS relay/comunidade, TURN ou inbox global do projeto.
- Suporte **1:1** (WhatsApp/Zap “salva minha comunidade”).
- Ritual de **SHA à mão** no lobby ou em chat — quando existir, usar [`release-metadata.json`](./release-metadata.json) gerado no CI (até lá: tag/release notes no PR).

### Definição: semana em **modo revisor**

Conta como revisor-mode se, na semana civil:

1. **Zero** commits próprios em `main`/`develop` que não sejam **review merge**, **docs** ou **hotfix** mínimo; e  
2. **Zero** registros de suporte 1:1 atribuídos ao mantenedor (issues “ops emergência” viram tarefa comunitária ou ficam abertas).

Fora do modo revisor: ok feature branch + PR normal — desde que não viole freeze de piloto (CODE-01).

**Versão:** 1.0
