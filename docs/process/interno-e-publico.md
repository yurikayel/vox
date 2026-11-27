# O que é interno e o que é público

> **Status:** canônico · **Owner:** mantenedor

O repositório é público e guarda o produto: código, testes, specs, ADRs, roadmap e guia de contribuição.
O jeito como a equipe se organiza para produzir não faz parte do produto e fica fora do repositório.

## Transparência sobre IA

Parte do código é escrita com assistentes de IA e revisada pelo mantenedor. Esta é a única declaração sobre o assunto: ferramentas, papéis e sessões não são citados em código, docs, commits nem PRs.

## Público (entra no git)

- Código, testes, configuração de build e CI, specs, ADRs, roadmap e CHANGELOG do usuário.
- Regras de qualidade que valem para qualquer contribuidor (limites de código, evidência de testes, documentação).
- Integrações do produto com outros serviços, nomeadas só onde o código precisa (módulo e doc da integração).
- Atribuições exigidas por licença (SRD 5.2, CC-BY-4.0) e os sistemas de jogo suportados.

## Interno (fica fora do git)

- Nomes de ferramentas, assistentes, editores e modelos usados no processo, e de onde veio uma ideia.
- Orquestração: papéis, sessões, filas, travas de arquivo e identificadores de tarefa.
- Prompts e missões para assistentes, relatórios gerados por assistentes, brainstorms brutos e inventários de sessão.
- Caminhos, nomes de usuário e pastas da máquina de quem desenvolve; dados pessoais reais (fixtures usam `example.org`).
- Nomes de outros produtos ou serviços usados como comparação ou inspiração: use "Mesa A/B/C/D" ou descreva a função.
- Métricas geradas localmente (`docs/metrics/baseline-*`) e relatórios de máquina.

## Arquivos de regra das ferramentas

O arquivo de regras da raiz, `AGENTS.md` e `.agents/` ficam no repositório enquanto as ferramentas precisarem deles. São contados à parte e não reprovam. O texto vale para quem contribui.

## Commits e PRs

Título e corpo descrevem a mudança para quem usa ou mantém o produto. Sem trailer de coautoria, sem rodapé de ferramenta, sem papéis, sessões nem caminhos locais. O histórico antigo não é reescrito: só valem os commits depois do SHA de corte em `scripts/internal-audit.patterns.json`.

## Como é conferido

`npm run audit:internal` mostra as ocorrências (`arquivo:linha:padrão`) e o total por padrão; o texto que casou nunca é impresso.
`npm run audit:internal -- --check` roda no CI e reprova:

- arquivo novo com qualquer ocorrência;
- arquivo com mais ocorrências do que em `docs/metrics/internal-audit-baseline.json`;
- total de um padrão acima do baseline;
- trailer de coautoria ou rodapé de ferramenta em commit novo ou no título e corpo do PR (os outros padrões, nesses textos, só avisam).

A contagem só desce: `npm run audit:internal -- --write-baseline` regrava o baseline e recusa qualquer aumento. Um padrão que chega a zero passa a reprovar qualquer ocorrência.
Exceção nova entra em `scripts/internal-audit.allow.json` com motivo e dono, e passa pela revisão do mantenedor. Padrões que não podem aparecer nem na lista (nomes de terceiros) ficam num arquivo local fora do repositório, apontado por `VOX_AUDIT_EXTRA_PATTERNS`.
