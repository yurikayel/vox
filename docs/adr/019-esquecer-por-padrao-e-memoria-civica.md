# ADR-019: Esquecer por padrão; memória cívica por três caminhos

**Status:** accepted · **Revisado:** 2026-11-09 · **Relacionados:** REV-11 (efêmero por padrão), [ADR-020](./020-postura-de-operacao-do-piloto-g1.md), [replicação por grau](../specs/replicacao-por-grau-v0.md), [mídia v2](../specs/midia-v2.md)

## 1. Contexto

O Vox guarda os posts nos aparelhos das pessoas e os replica por proximidade de amizade, com teto de espaço por aparelho ([replicação por grau](../specs/replicacao-por-grau-v0.md)). Quando o espaço enche, o que é mais distante e mais antigo sai primeiro. Ou seja: um post que ninguém guarda acaba sumindo da rede.

Isso pode ser tratado como defeito (e o Arweave entraria para segurar tudo) ou como recurso. A cota grátis do Turbo é de 10 MiB **para a vida toda**, por carteira e por sub-rede; depois disso, o Arweave cobra por byte (≈ R$ 0,38/MiB em 09/11/2026, conferido em `payment.ardrive.io/v1/rates`). E o que entra no Arweave não sai mais.

## 2. Decisão

1. **Esquecer é recurso.** Um post vive enquanto alguém o guarda. Ele perde cópias à medida que se afasta do autor e envelhece, e some quando ninguém o fixou.
2. **"Guardar" é um gesto com peso:** põe o post no espaço da pessoa sem prazo de saída e o mantém vivo para os outros.
3. **A interface diz isso com honestidade:** "este post vive enquanto alguém o guardar"; o post pode mostrar em quantos aparelhos está. A interface **não promete apagamento**: "o Vox esquece, mas as pessoas podem lembrar" (print, cópia, aparelho modificado).
4. **Exceções que não esquecem:**
   - os **seus próprios originais**, que nunca são apagados do seu aparelho para abrir espaço;
   - **prova de abuso:** denunciar guarda uma cópia para a moderação até o caso fechar, e haverá um "guardar como prova" no aparelho de quem sofreu;
   - **memória cívica**, pelos três caminhos abaixo.

### 2.1 Memória cívica: três caminhos, cada um para o que serve

O permanente não tem volta. Por isso, quanto maior o risco de arrependimento, mais legitimidade o caminho exige.

| Caminho | Para quê | Exemplos | Salvaguarda |
|---|---|---|---|
| **Automático, por tipo** | Registros de governança, previsíveis e sem conteúdo pessoal | Resultado de enquete encerrada (contagem, **nunca quem votou**); versão nova das regras; troca de moderadores; prestação de contas da associação | Tipos fixos no código; ninguém escolhe caso a caso |
| **Moderador** | Documentos oficiais da comunidade | Atas, comunicados, precedentes de moderação sem identificação | Prazo de contestação (ex.: 72 h) antes de gravar; contestou, vai para votação |
| **Votação** | O que a comunidade quiser preservar | Depoimento, denúncia pública, marco da comunidade | Quórum **e consentimento do autor** do post |

### 2.2 Regras para os três caminhos

1. **Post de uma pessoa só fica permanente com o consentimento dela.** O texto é dela, e a LGPD dá a ela o direito de pedir apagamento, o que no Arweave é impossível. A votação não substitui esse "sim".
2. **Nada de dado pessoal de quem não é membro**, nem dado sensível, no registro permanente.
3. **Orçamento visível:** o crédito da comunidade (Turbo Credit Sharing, sem o Vox custodiar dinheiro) aparece na tela, com teto mensal; gravar mostra o custo antes.

### 2.3 Três níveis de permanência

| Nível | O que vai para o Arweave | Uso |
|---|---|---|
| **Âncora** | Só o hash (≈ 1,5 KiB) | Prova de existência e integridade; o conteúdo continua na malha e pode esquecer. Para o que tem dado pessoal, como atas com nomes |
| **Texto** | O texto, sem mídia | Comunicados, regras |
| **Completo** | Texto e mídia | Só o que é público e cívico de verdade |

O caminho automático usa quase sempre âncora ou texto.

## 3. Consequências

- **Jurídico:** o conteúdo não fica hospedado para sempre, o que combina com a minimização da LGPD e reduz a exposição do operador ([ADR-020](./020-postura-de-operacao-do-piloto-g1.md)).
- **Custo:** o Arweave deixa de ser o destino padrão; a cota grátis de uma carteira da comunidade dura muito (≈ 7 mil âncoras).
- **Produto:** o feed valoriza o que está vivo agora, não o acúmulo.
- **Risco:** a pessoa pode perder memórias se perder o aparelho. Por isso o backup dos próprios posts (EXP-04, depois o Drive) ganha prioridade.
- **Não implementado ainda:** os três caminhos ficam para depois do piloto; no G1 vale o REV-11 (efêmero por padrão, permanente por consenso) com o fluxo atual.
