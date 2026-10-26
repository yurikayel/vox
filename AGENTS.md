# Agentes — Vox (local)

Escopo **somente** o sub-repo [`vox/`](.). Não escrever roteiro Matrix/vídeo aqui nem promover conteúdo de `politica/` para `~/.gemini/config/AGENTS.md`.

## Mutex

- **Um agente por arquivo** (ou por **§N** se o markdown tiver **>200 linhas**).
- **Handoff:** paths alterados + lista explícita do que **não** tocar neste lote.
- **Proibido:** edição paralela do mesmo doc canônico em `docs/` (coordenar via PR ou fila no chat).

## Revisor vs implementação

Operação curta: [docs/metodo-agentes-mutex-e-revisor.md](docs/metodo-agentes-mutex-e-revisor.md).

## Testes

Antes de merge em `main`: `npm test` na raiz de `vox/`.
