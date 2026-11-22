# Caminho de volta do POSSE (`PM-105`) — spec e validador de link canônico

> **Status:** rascunho (spec técnica PM-105 e CLI validador de URL canônica; integração de UI pendente do lote PM-54/PM-55) · **Owner:** mantenedor · **Revisado:** 2026-11-22  
> **Relacionados:** [ROADMAP (PM-105)](../ROADMAP.md), [RFC 0001 — Export POSSE](../rfc/0001-posse-export.md), [Widget embed](./embed-integration.md), [Árvore do repasse (PM-106)](./arvore-repasse-pm106.md), [ADR-021 — Integridade na entrada](../adr/021-integridade-na-entrada-forma-assinada.md).

---

## 1. Objetivo e problema resolvido

Quando uma publicação do Vox circula fora da praça (WhatsApp, X ou Bluesky), ela costuma chegar sem contexto nem prova de autoria. O **PM-105** define o **caminho de volta do POSSE**: o link compartilhado fora do Vox abre diretamente a publicação original assinada e sua conversa, **sem exigir criação de conta**, combinando:

- **PM-54 (ler antes de entrar):** roteamento direto em modo leitura definido em [`client/js/app/read-first.js`](../../client/js/app/read-first.js), com o portão de entrada adiado até a primeira ação de escrita;
- **PM-55 (prévia de link sem estado):** camada opcional por espelho para bots de prévia (WhatsApp/X/Bluesky) que não executam JavaScript de roteamento em hash, apontando de volta para a URL canônica no Vox.

---

## 2. Gramática da URL canônica de retorno

Toda URL de retorno gerada ou aceita pelo Vox segue estritamente uma das duas formas abaixo:

```text
https://<host>[/<basePath>]/#/t/<topicId>
https://<host>[/<basePath>]/#/c/<communityId>/t/<topicId>
```

### 2.1 Regras sintáticas e sanitização

| Componente | Regra obrigatória | Rejeição imediata |
|---|---|---|
| **Esquema** | `https:` em produção; `http:` permitido **somente** para `127.0.0.1` ou `localhost` em teste local | `javascript:`, `data:`, `vbscript:`, `file:`, `http:` remoto |
| **Autoridade** | Host explícito; sem credenciais embutidas | `user:pass@host` (`username` ou `password` preenchidos) |
| **Query string** | Zero parâmetros de rastreamento | `utm_*`, `fbclid`, `gclid`, `si`, `ref` (na query ou após `?` no fragmento) |
| **Tokens de ID** | `topicId` e `communityId` no padrão `^[A-Za-z0-9_-]{3,96}$` | `../`, `%2e%2e`, barras extras, caracteres HTML, chaves reservadas (`__proto__`, `constructor`, `prototype`) |
| **Rota hash** | Exatamente `#/t/<topicId>` ou `#/c/<communityId>/t/<topicId>` | Segmentos extras ou prefixos fora da gramática |

> **Nota de migração:** o gerador atual em [`client/js/posse-dispatch.js`](../../client/js/posse-dispatch.js) ainda emite `?c=<communityId>` após `#/t/<topicId>`. O PM-105 padroniza a forma hierárquica `#/c/<communityId>/t/<topicId>` mantendo compatibilidade de leitura para `#/t/<topicId>`.

---

## 3. Fluxo de abertura sem conta (`read-first`)

Ao abrir uma URL canônica de retorno em um aparelho sem identidade configurada:

1. **Roteamento imediato (`PM-54`):** a rota `topic` pertence a `READ_FIRST_ROUTES` ([`client/js/app/read-first.js`](../../client/js/app/read-first.js)). O cliente renderiza o tópico e a faixa fixa `READ_FIRST_BANNER_ID` (*"Entrar no Vox"*), bloqueando apenas ações de escrita listadas em `WRITE_CLICK_SELECTOR` e `submitNeedsEntry`.
2. **Ordem de resolução do conteúdo (local-first):**
   1. **Cache local:** consulta o armazenamento residente no aparelho (`client/js/cache-node.js` / IndexedDB).
   2. **Malha P2P / memória compartilhada:** se houver peers conectados na sessão, solicita o tópico e respostas visíveis.
   3. **Rotação de gateways (`LAN-27`):** se ausente localmente, consulta [`fetchTopicById`](../../client/js/graphql.js) e `fetchReplies` com rotação resiliente entre os gateways configurados (`config/gateways.json`).
3. **Verificação criptográfica (`ADR-021`):**
   - O payload recuperado passa por [`verifyPayload`](../../client/js/signed-verify.js), que deriva `vx_…` via `computeRouteId(signed.pubKey)` e valida a assinatura ECDSA P-256 sobre a forma canônica v1 ou v2 ([`client/js/sig-format.js`](../../client/js/sig-format.js)).
   - A interface exibe o **selo honesto de verificação** e a **origem da leitura** (`cache local`, `malha P2P` ou o gateway que respondeu).
   - Se a assinatura falhar ou `sigv` for desconhecido, o conteúdo não é marcado como autêntico; exibe aviso explícito de assinatura não verificada.

---

## 4. Degradação honesta (`LAN-21`)

Quando o aparelho está offline ou o conteúdo ainda não propagou:

- **Proibido inventar ou simular conteúdo:** nunca exibir textos placeholder, autores fictícios ou respostas mockadas.
- **Estados honestos:** reutilizar as mensagens de [`client/js/honest-errors.js`](../../client/js/honest-errors.js) (`offline`, `timeout`, `gatewaysDown`, `payment`) conforme a falha observada na leitura.
- **Ausência confirmada:** se os gateways responderem normalmente e o `topicId` não existir em nenhuma camada, informar claramente que a publicação não foi encontrada ou ainda aguarda confirmação na rede, oferecendo apenas o caminho de recarregar ou voltar à praça.

---

## 5. Invariantes de segurança e orçamento de boot (`LAN-23`)

1. **Parsing estrito via `new URL(...)`:** toda validação e limpeza de parâmetros de rastreamento usa `URL` e `URLSearchParams` nativos — nunca regex sobre HTML ou concatenação crua de strings não validadas.
2. **Zero vazamento de rastreamento:** parâmetros `utm_*`, `fbclid`, `gclid`, `si` e `ref` são removidos antes de gerar links de saída (WhatsApp, X, Bluesky) e rejeitados na auditoria de links canônicos.
3. **Zero regressão no orçamento crítico (`LAN-23`):**
   - Esta especificação e o validador CLI ([`scripts/posse-return-check.mjs`](../../scripts/posse-return-check.mjs)) não adicionam **nenhum byte** (`0 B`) ao bundle crítico do shell medido por `scripts/shell-budget-check.mjs`.
   - A futura integração no cliente reutiliza `read-first.js`, `signed-verify.js` e `graphql.js` já presentes no app.

---

## 6. Validador CLI e matriz de testes (`DoD`)

O módulo zero-dependências [`scripts/posse-return-check.mjs`](../../scripts/posse-return-check.mjs) implementa a gramática e a auditoria em lote via `node scripts/posse-return-check.mjs --input <links.json> [--json]`, coberto por [`tests/posse-return-check.test.js`](../../tests/posse-return-check.test.js).

| Critério (`DoD`) | Tipo | Evidência exigida |
|---|---|---|
| **D1 — Gramática e construção canônica** | `code` | `buildCanonicalReturnUrl` gera `#/t/<topicId>` e `#/c/<communityId>/t/<topicId>` sem query de rastreamento |
| **D2 — Rejeição de URLs perigosas** | `code` | `validateReturnUrl` bloqueia `javascript:`, `data:`, `http://` remoto, credenciais embutidas e IDs com `../` |
| **D3 — Limpeza e bloqueio de trackers** | `code` | `stripTrackingParams` remove `utm_*`, `fbclid`, `gclid`, `si`, `ref`; `validateReturnUrl` reprova links com trackers |
| **D4 — Allowlist de hosts e CLI em lote** | `code` | `auditShareBatch` e `runCli` validam lotes JSON com `--allowed-hosts` e `--json` em diretório temporário |
| **D5 — Hardening, lint e doc audit** | `doc` / `code` | `eslint --max-warnings=0`, `npm run audit:docs` (`0 achados`), `npm run audit:layers` e testes verdes |
| **D6 — Integração UI PM-54 + PM-55** | `code` (próxima etapa) | Abertura direta de `#/c/<cid>/t/<tid>` sem conta com selo de assinatura `verifyPayload` e fallback `LAN-21` |
