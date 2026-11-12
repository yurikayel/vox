# ADR-009: Corroboração Multi-Gateway GraphQL e Resiliência sem Quorum Bloqueante

**Status:** proposed · **P1 / Task Order 001** · **Cold Readiness**

---

## 1. Contexto

O Vox é uma rede cívica local-first e descentralizada cujo armazenamento canônico reside no Arweave / permaweb. O acesso à leitura pública de dados permanentes indexados (comunidades, tópicos, réplicas, perfis, handles, identidades e ações de moderação) é realizado via consultas GraphQL para gateways HTTP públicos.

Atualmente, [`client/js/graphql.js`](../../client/js/graphql.js) possui limitações estruturais:
1. **Fallback Sequencial Ingênuo (`withGateways`):** Itera sequencialmente sobre `client/config/gateways.json` (atualmente contendo apenas `turbo` e `arweave-net`). Se o primeiro gateway responder com HTTP 200, a resposta é consumida sem validação estrutural nem corroboração externa.
2. **Ausência de Timeout em Nível de Query (`queryOne`):** O método `fetch(gqlUrl)` em `queryOne` não define `AbortSignal.timeout`. Um gateway lento ou em estado zumbi (hanging TCP socket / slowloris) trava a renderização da interface até o timeout padrão do navegador (tipicamente 60–120 segundos).
3. **Corroboração Restrita a uma Única Rota:** A função `queryAllGateways` e `mergeTopicEdgesWithConsensus` existe experimentalmente, mas só é invocada opcionalmente em `fetchRecentTopics({ crossCheck: true })`. Todas as demais 8 rotas de consulta utilizam resposta de gateway único sem qualquer checagem.
4. **Fragilidade de Catálogo de Gateways:** Gateways públicos mudam com frequência. Por exemplo, `g8way.io` (referência clássica no ecossistema) encontra-se inoperante em nível de DNS (`SERVFAIL`), enquanto `ar-io.dev` opera o endpoint GraphQL com índice parcial/dessincronizado em relação aos data items empacotados via ANS-104.
5. **Risco de Falso Consenso vs. Bloqueio Indevido:** Tratar o GraphQL de um gateway como oráculo infalível é perigoso (ataque de omissão ou adulteração de tags). Por outro lado, exigir quorum de maioria estrita bloqueia leituras válidas durante a latência de propagação e indexação entre mineradores L1, bundlers Turbo/Irys e nós de gateway AR.IO.

---

## 2. Decisão

Adota-se uma arquitetura de **Corroboração Progressiva com Degradação Honesta e Desacoplamento Criptográfico**:

### 2.1. Princípio de Separação: Descoberta vs. Autenticidade
- O GraphQL de gateways atua estritamente como **camada de indexação e descoberta** (localização de IDs de transação e apontadores).
- A **autenticidade e integridade dos dados** repousa exclusivamente nas assinaturas criptográficas da transação (ANS-104 RSA-PSS via WebCrypto em [`ans104.js`](../../client/js/ans104.js), ou assinaturas Ed25519 em cartões de perfil/links de identidade).
- Um gateway malicioso ou corrompido **não consegue forjar** uma assinatura criptográfica válida, mas pode omitir transações ou forjar metadados de tags na listagem.

### 2.2. Algoritmo em 7 Estágios de Resiliência
1. **Consulta Oportunista / Hedged com Timeout Rígido:**
   - Consulta o gateway primário com timeout restrito (ex: 3500ms).
   - Se o primário falhar ou estourar o timeout, dispara fallback imediato para o próximo gateway da lista ativa.
   - Quando ativado o modo de corroboração (background ou explícito), consulta até 2 gateways independentes sem sobrecarregar a rede do usuário.
2. **Validação Estrutural e Higienização de Respostas:**
   - Valida o schema JSON retornado (`errors`, `data.transactions.edges`, estrutura de `node`, `id`, `owner.address`, `tags`). Respostas com HTML, scripts ou chaves faltantes são descartadas e registradas como falha na telemetria.
3. **Normalização e Deduplicação Canônica:**
   - Indexação por ID canônico de transação Arweave (Base64URL de 43 caracteres derivado do SHA-256 da assinatura).
   - União idempotente de listas (`edges`), eliminando duplicatas entre gateways.
4. **Verificação Criptográfica de Hashes e Assinaturas Aplicáveis:**
   - Ao receber o payload binário de transações críticas, executa `parseAndVerifyDataItem` de [`ans104.js`](../../client/js/ans104.js) ou `verifyPayload` local.
5. **Comparação de Metadados e Detecção de Divergências:**
   - Compara metadados de tags (`App-Name`, `Type`, `Community-Id`, `Owner`) entre respostas de diferentes gateways.
   - Conflitos de autoria ou tags para o mesmo ID disparam marcação de `conflict: true` e alerta local.
6. **Mapeamento de Testemunhas e Telemetria Local:**
   - Cada nó deduplicado recebe o array `witnesses: string[]` com os gateways que o indexaram.
   - Gateways que falharem ou retornarem erros 4xx/5xx/timeout são registrados em `localStorage` (`vox-gateway-health`) para despriorização temporária dinâmica.
7. **Apresentação em Modo Degradado (Sem Bloqueio):**
   - Transações vistas por apenas 1 gateway são exibidas com flag `corroboration: "single_gateway"` (modo degradado honesto).
   - Transações vistas por 2+ gateways são marcadas como `corroboration: "corroborated"`.
   - Nenhum item é ocultado simplesmente porque um segundo gateway ainda não o indexou (evita que a latência de indexação de nós lentos censure postagens recentes).

---

## 3. Catálogo de Gateways e Configuração de Redundância

O catálogo padrão de gateways em `client/config/gateways.json` passa a ser estruturado em camadas:

| Gateway | Host GraphQL | Host Raw | Papel Arquitetural |
| :--- | :--- | :--- | :--- |
| **Turbo Gateway** | `https://turbo-gateway.com/graphql` | `https://turbo-gateway.com/raw/{txId}` | Primário para ANS-104 (indexação rápida de uploads Turbo) |
| **Arweave.net** | `https://arweave.net/graphql` | `https://arweave.net/{txId}` | Secundário canônico L1 + fallback de corroboração |
| **AR.IO Core** | `https://ar-io.dev/graphql` | `https://ar-io.dev/{txId}` | Terciário (raw ativo; GraphQL em modo de fallback/complementar) |

*Nota:* `g8way.io` é removido/desativado por falha persistente de DNS (`SERVFAIL`), documentando sua inoperância.

---

## 4. O Que Fica Rejeitado

1. **Quorum Bloqueante de Maioria:**
   - Rejeitado exigir $M$-de-$N$ gateways para exibir uma postagem. Se um usuário postou há 2 minutos, o bundler Turbo já indexou, mas o gateway L1 pode demorar blocos para sincronizar. Bloquear geraria tela vazia artificial.
2. **Tempestade de Requisições Paralelas (Request Storming):**
   - Rejeitado disparar simultaneamente 4 consultas pesadas a cada clique de navegação. Isso consome a franquia de dados móveis do usuário, satura a bateria e aciona rate limits (HTTP 429) nos gateways públicos.
3. **Proxy Centralizador de Corroboração:**
   - Rejeitado criar qualquer serviço backend que consulte os gateways em nome do usuário. Viola o princípio de Cold Readiness e o compliance LGPD (ADR-004).
4. **Execução ou Injeção de Código Não Sanitizado:**
   - Rejeitado confiar em strings de tags ou bodies retornados por gateways sem parsing estrito e renderização segura via DOM textContent.

---

## 5. Consequências e Trade-Offs

### 5.1. Vantagens (Pros)
- **Imunidade a Quedas Individuais:** Quedas de DNS ou manutenção de gateways (como a de `g8way.io`) não interrompem o uso da rede.
- **Proteção contra Hangs:** Timeout rígido de 3500ms em cada requisição GraphQL evita que a UI trave indefinidamente.
- **Transparência Cívica:** O usuário vê o grau de corroboração dos dados (pill ou indicador de telemetria local honesto).
- **Consumo Mínimo de Dados:** Fallback oportunista e hedging conservador preservam a banda em dispositivos móveis.
- **Compatibilidade Retroativa:** Preserva 100% das assinaturas de funções públicas exportadas em `client/js/graphql.js`.

### 5.2. Mitigações e Cuidados (Cons/Risks)
- **Complexidade de Cache:** A deduplicação precisa manter cursores de paginação consistentes quando resultados vêm de gateways com ordenações ligeiramente distintas.
  - *Mitigação:* Ordenação final em memória baseada em `block.height` e timestamps de tags quando disponíveis.
- **Taxonomia de Erros:** Diferenciar erro de rede de resposta vazia legítima (uma comunidade recém-criada pode ter 0 tópicos).
  - *Mitigação:* Uma resposta HTTP 200 com array vazio é um resultado válido, mas não deve despriorizar o gateway se outros também retornarem vazio.

---

## 6. Governança e Transição de Fase

- **Fase 1 (Atual):** Diagnóstico técnico, matriz de compatibilidade e este ADR. Nenhuma alteração em código de produção ou Service Worker.
- **Fase 2 (Pendente):** Implementação autorizada em branch `audit/multi-gateway-graphql`, criação de suíte de testes unitários dedicada (`tests/graphql-resilience.test.js`) e auditoria de complexidade ciclomática (LLOC $\le 30$, Nesting $\le 4$, CC $\le 15$).
