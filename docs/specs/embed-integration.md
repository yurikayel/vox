# Widget “Comente com Vox”

> **Status:** parcial (script de botão e demo existem; o item EXP-02 do [ROADMAP](../ROADMAP.md) segue aberto) · **Owner:** mantenedor · **Revisado:** 2026-11-17
> **O que existe (conferido no código em 17/11):** `client/embed/vox-embed.js` (24 linhas: insere um link `Comentar no Vox` para `#/t/<topic>` ou `#/compose/topic`), `client/embed/demo.html`, entradas no `client/sw.js` e `tests/embed-vox.test.js` (2 testes que só leem o texto do script e do demo; não rodam o widget). **A confirmar:** o app ainda não lê o parâmetro `?ref=` que o widget envia (nenhuma leitura em `client/js`); não há registro de uso em site externo; a URL `yurikayel.github.io/vox/embed/vox-embed.js` não foi testada nesta revisão.

Script estático: [`client/embed/vox-embed.js`](../../client/embed/vox-embed.js)

```html
<script
  src="https://yurikayel.github.io/vox/embed/vox-embed.js"
  data-topic="top_abc123"
  data-label="Comentar no Vox"
  data-ref="meu-blog"
  async
></script>
```

Sem `data-topic`, abre compose com `?ref=`.

Demo local: [`client/embed/demo.html`](../../client/embed/demo.html).

Ver também: [Caminho de volta do POSSE (`PM-105`)](./caminho-volta-posse-pm105.md) — especificação da gramática canônica de links de retorno (`#/t/<topicId>` e `#/c/<communityId>/t/<topicId>`) sem rastreadores nem exigência de conta.
