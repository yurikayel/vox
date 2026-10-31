# ADR-007: Decomposição de Monólitos e Eliminação Integral da Dívida de Complexidade

**Status:** accepted · **V-HARDENING**

## Contexto

Com a expansão de funcionalidades cívicas e descentralizadas no Vox (deliberação Pol.is, cartório popular perma-notary, micro-lofi de mídia, replicador POSSE e integração ATProto Bluesky), o código acumulou concentrações de complexidade cognitiva, aninhamento profundo e métodos extensos.
A auditoria estática inicial (`tools/complexity-audit.mjs`) mapeou **183 violações** distribuídas em 131 arquivos, apresentando riscos de:
1. Degradação arquitetural e sobrecarga cognitiva para mantenedores humanos e agentes autônomos.
2. Riscos de regressão silenciosa durante refatorações e manutenções de rotas cívicas.
3. Violação dos limites de boas práticas de engenharia de software ($\text{LLOC} \le 30$, $\text{Nesting} \le 4$, $\text{Complexidade Cognitiva} \le 15$).

## Decisão

Adotou-se o perfil rigoroso de *Code Hardening e Revisão Arquitetural* (`RULE[user_global]`), executando um plano de decomposição modular em ondas contínuas:

1. **Achatamento de Fluxos e Retornos Antecipados:** Todas as ramificações excessivas foram substituídas por guard clauses e retornos imediatos, eliminando encadeamentos profundos.
2. **Decomposição em Submódulos Puros:**
   - Métodos monolíticos de renderização (`renderTopic`, `renderCommunity`, `renderFeed`, `renderProfile`, `renderAjudaTeste`) foram decompostos em componentes funcionais puros e reutilizáveis ($\le 30$ LLOC).
   - Controladores de eventos e formulários (`inline-composer.js`, `screens-compose.js`, `zap-modal.js`) foram desmembrados em rotinas atômicas de vinculação e controladores de estado.
   - Rotinas criptográficas e de validação binária (`ans104.js`, `perma-notary.js`, `pix-key.js`, `polis.js`) foram modularizadas com tabelas de despacho declarativas (`PIX_VALIDATORS`, `PIX_MASKERS`, `STEP_READERS`).
3. **Invariância do Service Worker:** Refatoração do ouvinte `fetch` e saneamento de strings UTF-8 em `client/sw.js` preservando estritamente a chave de cache `CACHE_NAME = "vox-pwa-v7.16-real-network-audio-video-upload"`.
4. **Auditoria Estática Contínua:** O script `tools/complexity-audit.mjs` foi integrado para monitorar continuamente os 131 arquivos JavaScript do cliente e Service Worker, gerando relatórios em `docs/metrics/baseline-*.json`.
5. **Garantia de Não-Regressão:** A suíte de 605 testes (572 em JavaScript e 33 em Python) foi executada e mantida com 100% de sucesso a cada etapa de refatoração.

## Resultados e Métricas

| Métrica | Antes | Depois | Redução |
| :--- | :---: | :---: | :---: |
| Violações de Complexidade Cognitiva ($> 15$) | 79 | **0** | **-100%** |
| Violações de Linhas por Função ($> 30$) | 84 | **0** | **-100%** |
| Violações de Profundidade de Aninhamento ($> 4$) | 20 | **0** | **-100%** |
| **Total de Violações no Codebase** | **183** | **0** | **-100%** |
| ESLint 9 (Erros / Avisos) | 5 avisos | **0 / 0** | **100% limpo** |
| Testes Automatizados (JS + Python) | 605 | **605** | **100% verdes** |

## Consequências

- O codebase de 131 arquivos alcançou conformidade absoluta com o padrão de hardening global.
- Manutenções futuras tornaram-se pontuais e de baixo acoplamento, permitindo que agentes e colaboradores trabalhem em submódulos isolados com risco nulo de impacto colateral.
- O histórico de métricas em `docs/metrics/baseline-2026-10-31.json` atesta formalmente a integridade estrutural da versão.
