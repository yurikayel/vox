# Prompt Claude — auditoria, docs e MVP técnico (nov/2026)

> **Status:** canônico (missão para agente externo; não substitui o [ROADMAP](../ROADMAP.md)) · **Owner:** mantenedor · **Revisado:** 2026-11-19

Este arquivo é o **texto completo** para colar no Claude Code, Cursor ou Antigravity. Entrega esperada: relatório em `docs/audits/` + até **3 PRs só de documentação** + spec `docs/strategy/mvp-tecnico-vox-2026-11.md`. Sem código de produto, sem ops de relay (INF-01…04) até >50 ativos, sem piloto humano (V-P09).

Contexto: [analise-repositorio-vox-2026-11.md](../strategy/analise-repositorio-vox-2026-11.md) · `develop` `e994a1b` (pós #281–#283) · `main` release #262 (`bda1dd4`).

---

## Como usar

1. Copie o bloco **§ PROMPT INTEGRAL** abaixo (do primeiro `---` de missão até o fim).
2. Anexe ou peça leitura dos paths citados no briefing antes de executar.
3. Exija handoff com `npm run validate` e classificação PASS/FAIL/NOT RUN/BLOCKED ([qualidade-e-evidencia.md](./qualidade-e-evidencia.md)).

---

## § PROMPT INTEGRAL (copiar daqui)

```text
=== INÍCIO DO PROMPT — NÃO EDITAR O ARQUIVO-FONTE NO REPO ===

Repositório: vox/ (GitHub yurikayel/vox). Branch base: develop (HEAD ~e994a1b após #281–#283).
main: release #262 (bda1dd4) — drift intencional até próximo release.

Leia antes de agir (nesta ordem):
- AGENTS.md
- docs/HARDENING.md
- docs/process/qualidade-e-evidencia.md
- docs/process/documentacao.md
- docs/FEATURES.md
- docs/ROADMAP.md (seção INF >50 ativos)
- docs/strategy/analise-repositorio-vox-2026-11.md
- docs/adr/035-camadas-e-contextos.md
- lobby na raiz do workspace politica: ../../../lobby.md (se disponível)

Restrições (decisão do dono, nov/2026):
- Piloto / convite / divulgação: BLOQUEADO (validação = CI + testes + uso local).
- Infra substituível (INF-01…04): só documentar/preparar; ops após >50 ativos.
- Um agente por arquivo canônico em docs/; PRs → develop; npm run validate antes de pedir merge.
- Não commitar docs/metrics/baseline-* gerados localmente.
- Divulgação responsável (ADR-024): detalhe de exploração só em canal privado ao mantenedor.
- Não alterar testes para forçar verde; não remover skips sem justificativa no PR.
- Não implementar PM-01, REV-02 plug, deploy Cloudflare/Render, TURN, 2º signaling.

Missão:
(1) Validação robusta: features × arquitetura × modularidade.
(2) README e docs defasados confrontados com código, testes e CI.
(3) Spec MVP **técnico** da plataforma (PWA + malha mínima + recuperação + modularidade incremental),
    sem escolher nicho de praça — nicho fica para G1 futuro (citar direcionamento-crescimento-rede-2026-11.md).

Execute as FASES 1→4 em ordem. Cada afirmação "PASS" exige comando, exit code e contagem literal do log.

────────────────────────────────────────
FASE 1 — README e narrativa pública vs fatos
────────────────────────────────────────

Tarefa: reler README.md e cruzar com fontes canônicas.

Confirmar empiricamente:
- git rev-parse origin/main e origin/develop
- Contagem de testes: npm test (ou leia docs/TESTES.md + saída CI)
- CACHE_NAME em client/sw.js
- docs/release-metadata.json vs tabela "Releases e validação" do README
- Badge "Arweave Permaweb" vs política REV-07 (arweaveUpload: false)
- Matriz de binários vs .github/workflows/release-binarios.yml e última Release GitHub

Saída:
- Tabela: Alegação (README/badge) | Evidência (path/CI) | Veredito (OK | defasado | enganoso)
- Lista de correções para PR doc #1 (README, release-metadata, badges, link para analise-repositorio-vox-2026-11.md)
- Lembrete: plano de produto único = ROADMAP.md (ADR-017), não o README

────────────────────────────────────────
FASE 2 — Arquitetura e modularidade
────────────────────────────────────────

Referências:
- ADR-035, scripts/layers-lib.mjs, npm run audit:layers
- identity/, vault/ (portas index.js)
- PM-01 + tests/shell-reachability.test.js
- REV-02 + client/js/labs/parado/ + UNPLUGGED_MODULES em client/sw.js
- scripts/cycles-debt.json + npm run audit:complexity (se existir no package.json)

Tarefa:
1. Rodar audit:layers e audit:complexity — registrar PASS/FAIL.
2. Listar imports de app/ que violam camada ou alto acoplamento (top 10).
3. Proposta incremental (3–5 passos) para mais modularidade conforme escala, amarrada a PM-01/REV-02 e hardening v3.2 (LLOC≤30, CC≤15).

Saída:
- Seção no relatório + bullets que alimentarão a spec MVP (núcleo precache vs lazy vs labs).

────────────────────────────────────────
FASE 3 — Validação robusta de features
────────────────────────────────────────

Fonte: docs/FEATURES.md (status: no ar, lab, escrito não plugado, etc.).

Metodologia — para cada seção do FEATURES (se muito longo: 100% "no ar", 100% "lab", amostra de "não plugado"):

| Verificar | Como |
|-----------|------|
| Rota | client/js/app/route-parse.js |
| Entrada UI | imports em app/screens-*.js, app/init.js |
| Testes | arquivos em coluna Testes — existem? skips documentados? |
| Doc | FEATURES + spec/ADR linkados |
| Honestidade | flags arweaveUpload, feature-flags.js, REV-07 |

Cruzar com docs/TESTES.md, lacunas LT-02/06/07 em docs/process/plano-testes-login.md, DOC-04 (README × FEATURES).

Saída:
- Matriz: Feature | status FEATURES | evidência código | testes | gap
- Top 10 gaps (doc promete / sem teste / órfão / skip sem razão)
- Itens para PR doc #2 (FEATURES, docs/README.md índice, DOC-04 parcial)

────────────────────────────────────────
FASE 4 — Spec MVP técnico
────────────────────────────────────────

Criar em PR doc #3: docs/strategy/mvp-tecnico-vox-2026-11.md

Banner: auditoria ou rascunho · Owner: mantenedor · Revisado: data · "Não substitui ROADMAP.md"

Seções obrigatórias:
1. Definição MVP técnico — offline/local + 1 nó, sem expandir INF
2. Núcleo obrigatório — recorte justificado com FEATURES (feed/comunidade mínima ou identidade+DM+sync)
3. Recuperação de acesso — frase, guardiões, cofre malha (ADR-037); no ar vs LT-xx
4. Segurança — crypto-dm, genesis, relay snapshot compat (RFC 0002); fora: enforce = INF-04
5. Descentralização honesta — malha, seguidores, Nostr/relay; CGNAT sem TURN até gatilho
6. Escalabilidade no tempo — PM-01 → REV-02 seletivo → contextos ADR-035; INF após >50
7. Acesso e divulgação — PWA, POSSE, ajuda; sem campanha pública
8. Interesses/nicho — hashtags, comunidades, feira como opcionais pós-núcleo; ref. direcionamento
9. Fora do MVP — Arweave write, webxdc plugado, piloto G1, stewards, etc.
10. DoD — npm run validate, PM-99, conjunto de testes nomeado, docs atualizados

Ligar a analise-repositorio-vox-2026-11.md (três portões).

────────────────────────────────────────
ENTREGÁVEIS E PRS (docs only)
────────────────────────────────────────

Branch sugerida: docs/claude-auditoria-mvp-2026-11 (a partir de develop atualizado).

1. Relatório: docs/audits/auditoria-features-arquitetura-2026-11.md (matrizes Fases 1–3 + sumário)
2. PR #1: README + release-metadata + badges (+ CHANGELOG)
3. PR #2: FEATURES + índice docs/README + DOC-04 parcial (+ CHANGELOG)
4. PR #3: mvp-tecnico-vox-2026-11.md + índice strategy + CHANGELOG

Cada PR: node scripts/docs-audit.mjs exit 0; mutex um arquivo canônico por vez; npm run validate no último PR se tocar vários arquivos.

────────────────────────────────────────
FECHAMENTO DO PROMPT
────────────────────────────────────────

MVP = plataforma técnica, não campanha de nicho. Decentralização e escala são progressivas
(modularidade + gatilho INF), não promessas day-one.

Conflito doc: FEATURES e código ganham; README é corrigido.

Encerre com:
- Gaps que exigem código (fora do escopo desta missão)
- Gaps só documentação (em quais PRs)
- Recomendação develop→main: esperar lote de docs (#284 analise-repositorio em aberto?) ou release maior
- Handoff: SHA, Branch, Arquivos, Testes (PASS/FAIL/NOT RUN/BLOCKED com evidência), Ownership, Pendências

=== FIM DO PROMPT ===
```

---

## Referência rápida (mantenedor)

| Fase | Foco | Artefato principal |
|------|------|-------------------|
| 1 | README × release-metadata, REV-07 | Tabela vereditos → PR #1 |
| 2 | ADR-035, audit:layers, PM-01, REV-02 | Relatório + inputs da spec |
| 3 | FEATURES × código × testes | Matriz gaps → PR #2 |
| 4 | MVP técnico sem nicho | `mvp-tecnico-vox-2026-11.md` → PR #3 |

**Fora do escopo desta missão:** código de produto, ops INF, piloto, marketing de nicho.