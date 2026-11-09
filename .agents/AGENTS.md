# Agentes e Governança — Vox (.agents/AGENTS.md)

Instruções globais compartilhadas para agentes que operam no sub-repo `vox/`:

## 1. Doutrina e Princípios
- **Cold Readiness / Prontidão Fria:** Nenhuma ação pública, federação prematura ou deploy externo sem autorização expressa do usuário.
- **Local-First & P2P:** Aplicação PWA estática vanilla, sem frameworks pesados, com funcionamento 100% offline via Service Worker e IndexedDB.
- **Custos Recorrentes:** R$ 0,00 hoje, dependendo de free tiers com cota (o upload grátis do Turbo tem limite por carteira/IP; ver `docs/INFRA-CUSTOS.md`). Não prometer "para sempre".

## 2. Protocolo Mutex (Um Agente por Arquivo)
Fonte única: [`docs/process/metodo-agentes-mutex-e-revisor.md`](../docs/process/metodo-agentes-mutex-e-revisor.md). Resumo:
- Nunca editar arquivos simultaneamente com outros agentes.
- Declarar caminhos antes de alterar.
- Não reescrever documentos inteiros para modificar trechos isolados.
- Handoff obrigatório ao concluir tarefas.

## 3. Limites de Hardening (Métricas Estritas)
LLOC ≤ 30 · Nesting ≤ 4 · Complexidade Cognitiva ≤ 15 — fonte única: [`docs/HARDENING.md`](../docs/HARDENING.md).

## 4. Áreas Protegidas (Proibição Absoluta)
- `tools/wa_extension/`
- `tools/wa_live.py`
- `live/`
- Proibido investigar dados internos do WhatsApp Web (`window.require`, `WAWebMsgCollection`).

## 5. Invariante de Cache
- `CACHE_NAME`: valor canônico só em `client/sw.js` (espelhado em `docs/release-metadata.json`). Bump obrigatório quando o shell muda; nunca duplicar a string em docs.
- 100% de paridade entre `SHELL_ASSETS` e os arquivos reais no disco.

## 6. Agente Principal do Antigravity
- Operador Técnico: `.agents/agents/vox-operator.md`
- Auditor independente (só leitura, veredito PASS / PASS_WITH_FINDINGS / BLOCK): `.agents/agents/vox-auditor.md`
- Auditor Independente: perfil `antigravity-auditor` definido em `../AGENTS.md` (lobby `politica/`; sem arquivo dedicado aqui).
