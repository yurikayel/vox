# Norma de documentação (código e documentação técnica)

> **Status:** canônico (norma) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-12
> **Enforcement:** `npm run audit:docs` (no `npm run validate` e no CI) · **Complementa:** [CONTRIBUTING-DOCS.md](../CONTRIBUTING-DOCS.md) (navegação, banners e DoD de docs) e [HARDENING.md](../HARDENING.md) (limites de código).

Documentação faz parte da entrega, não é etapa posterior. Um PR que muda comportamento e não atualiza a documentação está **incompleto**, do mesmo jeito que um PR sem teste. Esta norma segue as práticas de mercado para projetos de código aberto: *docs-as-code* (a documentação mora no repositório, é revisada no PR e checada no CI), JSDoc na API pública dos módulos, ADR para decisões, Keep a Changelog para mudanças e uma fonte única para cada fato.

## 1. Princípios

1. **Fonte única.** Cada fato mora em um lugar e os outros apontam para ele (números de release: [release-metadata.json](../release-metadata.json); plano: [ROADMAP.md](../ROADMAP.md); decisões: [adr/](../adr/README.md) e [DECISOES.md](../DECISOES.md)).
2. **O porquê, não o quê.** O código já diz o que faz. O comentário diz por que é assim, que regra de produto ou de segurança ele protege e o que quebraria se mudasse.
3. **Para quem chega.** Escreva para quem nunca viu o módulo: sem apelido interno sem explicação e sem "como combinamos". Siglas (`PM-83`, `ADR-023`, `LAN-12`) entram junto com o caminho do documento.
4. **Verdade verificável.** A documentação descreve o que o código faz hoje. Valor de reserva, simulação ou limitação conhecida é dita com essas palavras (ex.: "sem a API, devolve valores de reserva, que não são medição").
5. **Português do Brasil**, frases curtas, voz ativa. Identificadores de código ficam como estão, entre crases.
6. **Divulgação responsável ([ADR-024](../adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md)).** Nenhum detalhe que permita explorar uma falha em aberto, nem em comentário, nem em commit, nem em doc.

## 2. Documentação no código (JavaScript)

### 2.1 Cabeçalho de módulo — obrigatório

Todo arquivo de `client/js/` e `client/aviso/` abre com um bloco que diz para que o módulo serve, o que fica de fora dele e onde está a especificação.

```js
/**
 * @file Termo de convivência da comunidade (civic lote 3).
 *
 * A moderação publica o texto assinado; quem entra assina o hash do termo junto com a entrada.
 * Lógica pura, sem DOM.
 *
 * @module community-termo
 * @see docs/specs/aviso-assinado-v0.md (seção "Termo de convivência e mediação")
 */
```

### 2.2 JSDoc em todo export — obrigatório

| Tipo de export | O que o bloco precisa ter |
|---|---|
| Função | Resumo em uma frase; um `@param {tipo} nome` por parâmetro; `@returns {tipo}` quando devolve valor; `@throws {Erro}` quando lança. Promessas: `@returns {Promise<tipo>}`. |
| Parâmetro de opções (`{ a, b } = {}`) | `@param {object} [options={}]` e uma linha `@param {tipo} [options.a]` por campo usado. |
| Dependências injetáveis (`deps`) | `@param {object\|null} [deps=null] Dependências injetáveis; null usa as reais.` |
| Constante | Resumo e `@type`. Número com **unidade** (ms, MB, caracteres). Chave de `localStorage`: dizer o que guarda e se sai do aparelho. |
| Classe | Resumo, responsabilidades e ciclo de vida. |

Tipos seguem a sintaxe do JSDoc/TypeScript (`string[]`, `{id: string}`, `"a"|"b"`, `Object<string, number>`). Parâmetro opcional entre colchetes, com o valor padrão: `[now=Date.now()]`. Use `@example` quando a entrada ou a saída não for óbvia (formatos de texto, códigos, parsers) e `{@link outroExport}` para ligar funções do mesmo módulo.

O bloco fica **colado** na declaração, sem linha em branco no meio; um bloco separado por linha em branco não documenta o export.

### 2.3 Comentários internos

- Funções internas com regra não óbvia ganham uma linha `/** … */` dizendo a regra.
- Comentário de linha (`//`) só para o porquê de uma escolha local (ordem que importa, contorno de navegador, limite de protocolo).
- Proibido: comentário que repete o código, código comentado, `TODO` sem item no [ROADMAP](../ROADMAP.md).

### 2.4 Python (relay)

Docstring de módulo e de toda função pública (sem `_` na frente), no estilo PEP 257: resumo em uma linha, parâmetros, retorno e exceções quando não são óbvios. Endpoints novos entram na tabela de [relay/README.md](../../relay/README.md). Ainda sem checagem automática: vale na revisão do PR.

## 3. Documentação técnica atrelada à mudança

| A mudança… | Atualize no mesmo PR |
|---|---|
| Qualquer mudança visível | [CHANGELOG.md](../../CHANGELOG.md), seção *Não lançado* (formato Keep a Changelog) |
| Feature nova ou mudada | spec em [specs/](../specs/) com banner de status · linha em [FEATURES.md](../FEATURES.md) · item no [ROADMAP.md](../ROADMAP.md) |
| Decisão de arquitetura, produto ou segurança | ADR novo ou emenda ([adr/README.md](../adr/README.md): Status, Contexto, Decisão, Consequências) · linha em [DECISOES.md](../DECISOES.md) |
| Formato assinado, DM ou protocolo de rede | a spec do formato · [THREAT-MODEL.md](../THREAT-MODEL.md) se muda a superfície de ataque · RFC se é protocolo de rede ([rfc/](../rfc/README.md)) |
| Rota, tela ou flag de laboratório | [client/DEV.md](../../client/DEV.md) e a coluna de status em FEATURES |
| Endpoint do relay | tabela de endpoints em [relay/README.md](../../relay/README.md) |
| Shell do PWA | bump de `CACHE_NAME` e [release-metadata.json](../release-metadata.json) (`python scripts/release_line.py`) |
| Doc novo | link no índice [docs/README.md](../README.md) e banner de status no topo (o `audit:docs` reprova doc órfão, sem banner ou com status fora do vocabulário) |

## 4. O que a máquina confere e o que fica com quem revisa

`npm run audit:docs` ([scripts/docs-audit.mjs](../../scripts/docs-audit.mjs)) lê a árvore sintática do código (espree, o parser do ESLint) e reprova:

| Achado | Regra |
|---|---|
| `header` | módulo sem bloco de abertura |
| `jsdoc:<export>` | export sem JSDoc colado |
| `param:<função>:<parâmetro>` | parâmetro sem `@param` |
| `returns:<função>` | função que devolve valor sem `@returns` |
| `link:<alvo>` | link relativo em Markdown para arquivo que não existe |
| `orphan` | doc em `docs/` que o índice não alcança |
| `status` | doc em `docs/` sem o banner `**Status:**` no topo (fora `metrics/`, que é gerado) |
| `status:<palavra>` | banner com palavra fora do vocabulário fechado do tipo do doc ([CONTRIBUTING-DOCS.md §2.1](../CONTRIBUTING-DOCS.md)) |

Fica com quem revisa (checklist do [modelo de PR](../../.github/PULL_REQUEST_TEMPLATE.md)): se o texto está certo, se o porquê está dito e se a tabela da seção 3 foi cumprida.

### 4.1 Dívida antiga e catraca

A dívida medida em 2026-11-11 está em [scripts/docs-debt.json](../../scripts/docs-debt.json). Ela funciona como catraca, igual aos limites de complexidade:

- **Símbolo novo nasce documentado.** Qualquer achado fora da dívida reprova o CI.
- **Arquivo tocado paga o que tocou.** Mexeu numa função legada: documente essa função.
- **Dívida paga sai do arquivo.** Se um item da dívida deixa de existir, o audit reprova até alguém rodar `npm run audit:docs -- --prune`, que só remove itens e nunca acrescenta.
- Acrescentar item à mão na dívida para um achado novo passar é manipulação de métrica e é proibido ([qualidade-e-evidencia.md](./qualidade-e-evidencia.md)).

## 5. Definition of Done de documentação

- [ ] `npm run audit:docs` passa (já roda dentro de `npm run validate`).
- [ ] Todo export novo ou mudado tem JSDoc completo (seção 2.2).
- [ ] A tabela da seção 3 foi cumprida para o tipo de mudança.
- [ ] O texto descreve o que o código faz hoje, inclusive limitações e valores de reserva.
- [ ] Nenhum número de release fora do README e do `release-metadata.json`.

---

**Versão:** 1.0 · 2026-11-11
