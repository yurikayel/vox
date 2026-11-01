# Agentes e Governança — Vox (.agents/AGENTS.md)

Instruções globais compartilhadas para agentes que operam no sub-repo `vox/`:

## 1. Doutrina e Princípios
- **Cold Readiness / Prontidão Fria:** Nenhuma ação pública, federação prematura ou deploy externo sem autorização expressa do usuário.
- **Local-First & P2P:** Aplicação PWA estática vanilla, sem frameworks pesados, com funcionamento 100% offline via Service Worker e IndexedDB.
- **Custos Recorrentes:** R$ 0,00 para sempre (Arweave Turbo Free Tier ≤100 KiB, WebTorrent, Nostr).

## 2. Protocolo Mutex (Um Agente por Arquivo)
- Nunca editar arquivos simultaneamente com outros agentes.
- Declarar caminhos antes de alterar.
- Não reescrever documentos inteiros para modificar trechos isolados.
- Handoff obrigatório ao concluir tarefas.

## 3. Limites de Hardening (Métricas Estritas)
- **LLOC por método:** $\le 30$
- **Nesting:** $\le 4$
- **Complexidade Cognitiva:** $\le 15$

## 4. Áreas Protegidas (Proibição Absoluta)
- `tools/wa_extension/`
- `tools/wa_live.py`
- `live/`
- Proibido investigar dados internos do WhatsApp Web (`window.require`, `WAWebMsgCollection`).

## 5. Invariante de Cache
- `CACHE_NAME`: `vox-pwa-v7.16-real-network-audio-video-upload` (estritamente preservado).
- 100% de paridade entre `SHELL_ASSETS` e os arquivos reais no disco.

## 6. Agente Principal do Antigravity
- Operador Técnico: `.agents/agents/vox-operator.md`
- Auditor Independente: `.agents/agents/antigravity-auditor.md`
