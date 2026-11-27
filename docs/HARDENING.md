# Code hardening — Vox (Perfil Canônico v3.2)

> **Status:** canônico (fonte única dos limites de código) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-12

**Fonte única** dos limites de complexidade e integridade do Vox ([AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), CONTRIBUTING e DEV apontam para cá). Evidência de testes e auditoria: [process/qualidade-e-evidencia.md](./process/qualidade-e-evidencia.md). Auditoria de complexidade: `npm run audit:complexity` ([ADR-007](./adr/007-zero-complexity-monolith-decomposition.md)).

> **Princípio Supremo:** Métricas são instrumentos de proteção da arquitetura, não objetivos a serem manipulados para satisfazer linters. Nenhum agente pode melhorar artificialmente uma métrica, um teste ou um relatório à custa da integridade do software.

## Thresholds e enforcement real (medido em 09/11/2026; dívidas de ESLint e Ruff remedidas em 12/11)

A coluna **Enforcement hoje** diz o que a ferramenta faz de fato; a coluna **Alvo** é o perfil v3.2. Uma linha só pode dizer `ERROR` se o CI quebra.

| Dimensão | Ideal | Máximo | Ferramenta (AST) | Enforcement hoje | Dívida medida | Alvo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Linhas por função de produção (sem comentários e brancas) | ≤ 20 | **30** | ESLint `max-lines-per-function` (`client/`) | **ERROR** no CI | 0 | ERROR |
| Linhas por caso de teste | ≤ 25 | **45** | ESLint `max-lines-per-function` (`tests/`, via `npm run lint:all`) | WARN, fora do CI | 23 testes em 17 arquivos (12/11; eram 25 em 09/11) | ERROR novo |
| Aninhamento | ≤ 2 | **4** | ESLint `max-depth` | **ERROR** no CI (`client/`) | 0 | ERROR |
| Complexidade ciclomática | ≤ 10 | **15** | ESLint `complexity` (JS) · Ruff `C901` (Python) | **ERROR** no CI (JS e Python) | 0 | ERROR |
| Complexidade cognitiva | ≤ 10 | **15** | **não medida** (pediria `eslint-plugin-sonarjs`, dependência nova no LAN-20) | — | desconhecida | ERROR |
| Parâmetros por função | ≤ 3 | **5** | ESLint `max-params` · Ruff `PLR0913` (configurado, fora do gate) | **ERROR** no CI (`client/`) | 0 (17 funções viraram objeto de opções e 1 parâmetro morto saiu, em 09/11) | ERROR |
| Linhas por arquivo | ≤ 250 | **350** | ESLint `max-lines` | WARN | 25 arquivos (12/11; eram 27 em 09/11) | ERROR novo |
| Comandos por função Python | — | **30** | Ruff `PLR0915` | só informa no CI (`--exit-zero`) | 7 funções (12/11) | ERROR |
| Erros de pyflakes (nome indefinido, import/variável sem uso) | 0 | **0** | Ruff `F` | **ERROR** no CI | 0 | ERROR |
| Imports que sobem de camada (ADR-035) | 0 | **0 novos** | `npm run audit:layers` (árvore sintática, espree) | **ERROR** no CI para import novo | 0 imports (18/11): `scripts/layers-debt.json` está com `violations: []` | catraca |
| Ciclos de import no cliente (ADR-035) | 0 | **0 novos, nenhum crescendo** | `npm run audit:layers` (`scripts/cycles-audit.mjs`, componentes fortemente conexos por árvore sintática; só import estático) | **ERROR** no CI para ciclo novo ou componente maior | 1 componente de 3 módulos (18/11; eram 2 componentes de 3 módulos estáticos, ou 24 + 20 módulos contando `import()`), em `scripts/cycles-debt.json` | catraca (baseline só desce, `--prune`) |
| Acoplamento CBO / coesão LCOM | por camada | por camada | **não medidos** | — | — | Ratchet |
| Herança DIT | composição | exceção justificada | revisão | arquitetural | — | — |

**Ratchet por símbolo:** `npm run audit:symbols` (`scripts/symbol-ratchet.mjs`, árvore sintática com espree) compara cada arquivo `.js`/`.mjs` alterado com a sua versão na base (`origin/develop`, via `git show`; não há arquivo de baseline). Mede por função de produção (linhas, parâmetros, aninhamento, complexidade), por caso de teste (`test`/`it`, só linhas) e por módulo (só linhas), e só julga o que passa do **Máximo**: símbolo novo, ou que cruza o Máximo, reprova; símbolo legado que já estava acima não pode piorar. Um arquivo movido ou renomeado conta como novo (saída: justificar no PR ou dividir o arquivo). Limite conhecido: função anônima é identificada pela ordem (`<anon>`, `<anon>#2`…); acima de 30 linhas, tirar ou incluir uma antes dela pode dar falso alarme ou deixar passar, e o autor justifica no PR. As métricas são uma aproximação das regras do ESLint (não contam `?.` nem valor padrão de parâmetro): vale a mesma medição na base e no código atual. **Ainda fora do CI** (o comando sai com 1 se houver violação; religar no `validate` e no workflow é o próximo passo, com `fetch-depth` que alcance a base). Enquanto isso, rode antes de pedir merge; a regra de revisão (o PR não piora métrica de símbolo tocado) continua valendo para o que fica abaixo do Máximo.

### Semântica e Regras Complementares
1. **Ideal vs. Máximo:** `Ideal` é meta de design (não bloqueia CI); `Máximo` é o limite de violação.
2. **`WARN` legado / `ERROR` novo e Ratchet por Símbolo:**
   - Símbolos ou módulos **novos** que ultrapassem o `Máximo` geram `ERROR` imediato.
   - Símbolos **legados** emitem `WARN` e são governados por **Ratchet por Símbolo** ($\text{Métrica}_{\text{atual}}(s) \le \text{Métrica}_{\text{baseline}}(s)$) somado ao controle agregado por arquivo: uma função não pode piorar mesmo que outra função no mesmo arquivo melhore.
   - **Promoção (`WARN → ERROR`):** Quando o baseline da regra atingir `0` na `main`, a regra passa definitivamente para `ERROR` global.
3. **Independência CK:** CBO e LCOM nunca são comparados entre si por desigualdade; variantes e ferramentas devem ser explicitadas quando coletadas.
4. **Coleta Sintática (AST):** Medição só via AST (ESLint 9 em JS; Ruff em Python), descontando linhas em branco e comentários. Contador por regex não vale como evidência. Observação: o ESLint conta **linhas físicas** sem comentários e brancas, não LLOC no sentido estrito; o Ruff conta **comandos** (`PLR0915`).

## Como medir

```bash
npm run audit:complexity   # JSON + Markdown em docs/metrics/
npm run lint               # ESLint do client (é o que o CI exige)
npm run lint:all           # + scripts, tools e tests (avisos de dívida)
npm run lint:relay         # Ruff em relay, scripts e packaging (ruff.toml)
npm run audit:docs         # JSDoc nos exports, links, docs fora do índice e banner de status (catraca; quebra o CI)
npm run validate           # lint + lint:relay + audit:complexity + audit:docs + npm test
# Versões: Node ≥ 22 (.nvmrc, engines; CI testa 22 e 24) · Python 3.12 (.python-version; CI testa 3.11, 3.12 e 3.15)
npm test                   # Regressão obrigatória (Node:test + Python unittest)
```

## Política de refactor (SLAP & Anti-Ravioli)

- PRs de hardening **não** aumentam CC/LLOC/Nesting/Parâmetros nos símbolos ou módulos tocados.
- **Proibido Fragmentação Artificial:** Nunca fatiar funções em `_part1()`/`_part2()` repassando dezenas de variáveis locais apenas para caber em 30 LLOC; toda subfunção extraída deve ter semântica própria de domínio (*Single Level of Abstraction*).
- Comportamento idêntico: testes 100% verdes antes de merge.
- Comentários: explicar *por quê* (protocolo, LGPD, gossip), não narrar o óbvio.
- JSDoc em **exports públicos** (`@param`, `@returns`).

## Waivers

Exceções temporárias — exigem justificativa técnica, responsável e data de revisão.

| Arquivo | Função | Motivo | Responsável | Revisão |
|---------|--------|--------|-------------|---------|
| `mock.js` | (várias) | Dados demo legado excluídos da coleta produtiva | Core Maintainers | 2026-Q4 |
| `render/topic.js`, `app/screens-*.js` | funções grandes | Split feito; flatten incremental pós-baseline | Core Maintainers | 2026-Q4 |

## CI

- **Bloqueia** (`ci.yml`): `npm run lint:all`; `node scripts/shell-budget-check.mjs` (`LAN-23`); `node scripts/secrets-audit.mjs`; `npm run audit:docs` ([process/documentacao.md](./process/documentacao.md)); `npm run audit:layers` ([ADR-035](./adr/035-camadas-e-contextos.md)); ESLint do `client/` (linhas por função, aninhamento, complexidade, parâmetros, `===`, variável sem uso) e Ruff `F` + `C901` em `relay/`, `scripts/` e `packaging/` (versão fixa 0.17.4); suíte JS (`node --test`) e relay Python; mutação Tier A no diff (`PM-112`); vermelho-na-base (`PM-111`).
- **`npm run validate` local** espelha o núcleo dos gates acima: `lint:all` + `shell-budget-check` + `secrets-audit` + `lint:relay` + `audit:complexity` + `audit:docs` + `audit:layers` + `npm test`.
- **Só informa / fora do CI:** `max-lines` no `client/`; avisos de `scripts/`, `tools/` e `tests/` já cobertos por `lint:all` no job; Ruff `E`, `I` e `PLR0915` (`--exit-zero`); **E2E Python** (`npm run test:e2e` / `e2e/`) — dívida explícita: não roda no `ci.yml` (depende de browser/stack local; promover quando houver job estável).
- `audit:complexity` gera o artefato de baseline em `docs/metrics/` e não quebra o build.
- **Promoção `WARN → ERROR`:** quando a dívida de uma regra chega a 0 no `main`, a regra muda para `error` no mesmo PR que a zerou.
- Não afrouxe limite nem teste para ficar verde: quebre a função com semântica própria (extract method) ou registre waiver acima com motivo, responsável e data.

## Peso do precache (PM-02)

**O precache não tem teto de bytes** (decisão do mantenedor em 2026-11-12). O teste [`tests/shell-reachability.test.js`](../tests/shell-reachability.test.js) soma o shell offline e imprime o total, mas nenhum número reprova o CI, e ninguém precisa "pagar" bytes com cortes para uma mudança entrar.

O que continua valendo é a disciplina de manter o precache enxuto dentro do razoável, cobrada na revisão do PR:

- nada de imagem sem otimizar, cópia duplicada de asset ou código morto no `SHELL_ASSETS`;
- módulo que nenhuma tela alcança fica fora do precache (o teste PM-04 do mesmo arquivo continua reprovando);
- salto grande de peso (dezenas de KB) é dito no texto do PR, com o motivo;
- não se corta comentário, JSDoc nem código útil para economizar bytes.

O fim do teto vale só para o peso do precache; os limites de função, aninhamento, complexidade, parâmetros e a norma de JSDoc continuam rígidos.
