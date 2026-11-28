# Árvore do repasse (`PM-106`) — spec e análise de privacidade

> **Status:** rascunho (spec PM-106 e análise de privacidade obrigatória antes de qualquer código) · **Owner:** mantenedor / privacidade · **Revisado:** 2026-11-22  
> **Relacionados:** [ROADMAP (PM-106)](../ROADMAP.md), [replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md), [lapide-conta-pm101.md](./lapide-conta-pm101.md), [retratacao-gossip-v1.md](./retratacao-gossip-v1.md), [ADR-021](../adr/021-integridade-na-entrada-forma-assinada.md), [THREAT-MODEL.md](../THREAT-MODEL.md).

---

## 1. Objetivo e princípio inegociável

Mostrar ao leitor **quem criou** a publicação original (raiz) e **por quais saltos visíveis** ela circulou até chegar ao seu aparelho, estendendo a citação simples existente hoje em `client/js/render/repost-cite.js` e `client/js/repost-draft.js`.

**Invariante de privacidade (regra de ouro):**
1. A árvore é construída **estritamente a partir de publicações e saltos já visíveis localmente** no aparelho do leitor (IndexedDB / `cache-node.js` e lista local de contatos/seguidos).
2. O aparelho **nunca** consulta a rede, pares ou memória central para pedir listas de seguidores, amigos ou saltos intermediários ausentes.
3. O payload de rede de uma republicação **nunca** transporta a lista de contatos do autor nem uma cadeia acumulada de intermediários privados (mesmo princípio de [replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md) §"Grau por salto (sem expor o grafo social)").
4. Mantém-se o princípio `sem impulsionar` de `client/js/render/repost-cite.js`: **nenhum** ranking algorítmico, pontuação viral ou placar público de "quem espalha mais".

---

## 2. Base atual no código

Hoje, uma republicação é um post local normal (`type: "topic"`, assinado com `signPayload` em `client/js/repost.js`) com apenas **um nível plano** de referência (`client/js/repost-draft.js`):

- `originalId`: ID do post citado (`getOriginalId(post)`).
- `originalAuthor`: string `vx_…` do autor do post citado (vinda do rascunho `buildRepostDraft`).
- `excerpt`: trecho sanitizado até 160 caracteres.
- `isRepost: true`.

Na renderização (`client/js/render/repost-cite.js`), `renderRepostCiteHtml(post)` exibe apenas `<blockquote class="repost-cite">` com link `#/t/${originalId}` e `De ${who} · sem impulsionar`. Se alguém republicar uma republicação, a ligação para a raiz original ou para os saltos intermediários se perde ou depende de o autor original já estar visível diretamente.

---

## 3. Modelo de dados e regras de resolução local

### 3.1 O que viaja no payload assinado (wire mínimo)

Para preservar a linhagem sem transformar cada post num mapa do grafo social:

| Campo | Tipo | Obrigatório | Significado e limite |
|---|---|---|---|
| `originalId` | `string` | sim (já existe) | ID do post **imediatamente** republicado por este autor (o pai direto). |
| `originalAuthor` | `string` | sim (já existe) | `vx_…` do autor do pai imediato. |
| `rootId` | `string` | opcional | ID do post original na raiz da cadeia (igual a `originalId` no 1º salto; copiado do pai em saltos seguintes quando o pai é público). |
| `rootAuthor` | `string` | opcional | `vx_…` do autor da raiz, **apenas** como dica para exibição quando o post raiz existir localmente e for verificado. |
| `provenanceOptOut` | `boolean` | opcional | `true` se quem republica **não** autoriza exibir seu nome como ponte intermediária em repasses futuros. |

**Por que NÃO incluir um array `hops: [...]` no wire?**  
Um array de saltos viajando junto do JSON permitiria que qualquer par na malha ou servidor de memória central (`relay/central_memory.py`) coletasse arestas sociais (`A → B → C → D`) entre pessoas que o observador nem segue. Ao enviar apenas o vínculo direto com o pai (`originalId`) e a raiz (`rootId`), o wire não expõe mais informação do que uma citação pública individual já declara.

### 3.2 Reconstrução local da árvore/cadeia (`resolveLocalProvenanceChain`)

Dado um post exibido no feed ou na tela de tópico (`client/js/render/topic.js`):

1. **Fonte única:** consultar exclusivamente o store local (`cache-node.js`) via mapa em memória dos posts já carregados/verificados. Zero chamadas de rede.
2. **Percurso pai-a-pai com proteção contra ciclos:**
   - Inicializar `chain = []` e `visited = new Set([post.id])`.
   - Caminhar `curr = getLocalPost(curr.originalId)` enquanto houver `originalId`:
     - Se `visited.has(nextId)`: **interromper** imediatamente (`cycleDetected = true`) para evitar loop infinito por dados malformados ou maliciosos.
     - Adicionar `nextId` a `visited`.
     - Verificar `chain.length < MAX_TRAVERSE_DEPTH` (teto duro `8` passos, prevenindo cadeias degeneradas ou custo de CPU).
     - Checar verificação criptográfica do nó local (`verifyPayload(node) === true` e `node.author === declaredAuthor` do filho).
3. **Profundidade máxima exibida (`MAX_DISPLAY_HOPS = 3`):**
   - A UI mostra no máximo **Origem (raiz) + até 2–3 saltos visíveis mais recentes** até o leitor.
   - Saltos intermediários além desse limite são agregados em um único texto neutro (`"+ N repasses anteriores"`).
4. **Degradação graciosa para saltos ausentes ou retratados:**
   - **Salto intermediário ausente no cache local:** interrompe a resolução nominal naquele ponto; se `rootId` for conhecido e existir localmente (verificado), mostra `Raiz → via N repasse(s) → Pai visível`; se a raiz não existir localmente, mostra apenas o trecho visível e `"via repasses anteriores"` (sem adivinhar nem exibir `rootAuthor` não verificado).
   - **Salto ou raiz apagados por `GOSSIP_DELETE` ou `account_tombstone` ([PM-101](./lapide-conta-pm101.md)):** o nó removido nunca expõe nome/rota antigo; colapsa para `"repasse removido"` ou `"publicação original removida"`.
   - **Autor com `provenanceOptOut: true`:** se o nó intermediário marcou opt-out, ele é tratado como opaco para terceiros na cadeia e entra na contagem agregada (`"via N repasses"`) sem exibir nome nem `routeId`.

---

## 4. Análise obrigatória de ameaças à privacidade

Esta análise é pré-requisito bloqueante antes de qualquer linha de código do `PM-106`.

| ID | Ameaça | Vetor e impacto | Mitigação obrigatória no desenho |
|---|---|---|---|
| **P1** | **Inferência de grafo social no wire / memória central** | Se o payload carregasse a lista completa de intermediários (`[A, B, C, D]`), qualquer par ou servidor de memória central reconstruiria a topologia de quem segue quem mesmo fora da sua vizinhança. | Proibido transportar array de `hops` no wire. Só o pai imediato (`originalId`) e a raiz pública (`rootId`) existem no post; o resto só é montado localmente se o leitor já recebeu os posts intermediários. |
| **P2** | **Correlação e vigilância (*stalking*) via caminhos raros** | Um observador que segue apenas alguns nós pode inferir conexões privadas ("X só recebeu esse texto porque segue Y em segredo") quando um post percorre uma ponte única entre dois grupos. | **Regra de visibilidade por vínculo na UI:** um salto intermediário só mostra nome/avatar quando (a) o repost intermediário já é público no aparelho do leitor, (b) `provenanceOptOut` não está ativo **e** (modo conservador recomendado para o piloto) o intermediário faz parte dos contatos/seguidos do leitor. Intermediários que o leitor não segue viram contagem anônima (`"via N repasses"`). |
| **P3** | **Desanonimização de comunidades pequenas ou posts restritos** | Citar um post nascido em grupo fechado ou visibilidade `só amigos` ([replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md)) vaza a existência do autor e de membros do grupo para fora da comunidade. | **Barreira de escopo:** `buildRepostDraft` / `persistRepost` bloqueiam republicação para fora de posts marcados como `só amigos` ou de comunidade fechada. Se um filho órfão chegar referenciando `rootId` de escopo restrito ou inacessível localmente, a UI **nunca** exibe `rootAuthor` nem tenta buscar perfil da raiz. |
| **P4** | **Assédio e retaliação contra intermediários ("quem trouxe isso")** | Expor nominalmente quem serviu de ponte para um post polêmico transforma cidadãos comuns em alvo de assédio coordenado. | **(1)** Opt-out explícito (`provenanceOptOut`, configurável por conta em configurações e por post); **(2)** desfazer repost (`undoOwnRepost` em `repost.js` + propagação de remoção) e `account_tombstone` (`PM-101`) removem imediatamente qualquer atribuição nominal na árvore; **(3)** zero contagem pública global ou ranking de "principais pontes". |
| **P5** | **Falsificação de linhagem ("atribuição fabricada")** | Um par malicioso altera manualmente `rootAuthor` ou `originalAuthor` no JSON assinado para fazer parecer que uma liderança respeitada criou ou repassou uma fala falsa. | **Verificação por elo:** o cliente **nunca** exibe `rootAuthor` ou `originalAuthor` como autoria confirmada usando apenas a string declarada pelo filho. Nome/link verificável só aparece se o post pai/raiz estiver no cache local com `verifyPayload(hopPost) === true` e `hopPost.author` coincidir. Sem o post local verificado, exibir apenas `"origem não verificada localmente"` (sem nome nem link de perfil). |
| **P6** | **Vazamento pós-encerramento (`PM-101`)** | Mesmo após o usuário encerrar a conta ou apagar um post, citações antigas poderiam manter seu nome/trecho visível na árvore de terceiros. | Integração obrigatória com `GOSSIP_DELETE` e `GOSSIP_ACCOUNT_TOMBSTONE` ([lapide-conta-pm101.md](./lapide-conta-pm101.md)): quando um nó da cadeia é tombstoned, seu autor e trecho são substituídos por marcador neutro sem `routeId`. |

---

## 5. UX proposta (extensão mínima de `repost-cite.js`)

Sem inflar o card nem quebrar o layout cronológico:

- **Caso simples (1 salto direto visível):** mantém o padrão atual de `repost-cite.js` (`Republicação · De <Autor verificado> · sem impulsionar`).
- **Caso com cadeia local (`>= 2` saltos):**
  - Cabeçalho discreto: `Origem: <Raiz verificada ou "não verificada localmente">`
  - Linha de caminho colapsada por padrão ou compacta (máximo 1 linha): `via <Contato seguido> (+ N repasses) · sem impulsionar`
  - Ao expandir (se houver mais de 1 salto visível), lista linear curta limitada a `MAX_DISPLAY_HOPS` (3), sem grafo visual pesado nem métricas de engajamento.
- **Aviso ao republicar:** no modal/ação de republicar, informar de forma simples que a republicação pública fica visível para quem segue o usuário, com toggle acessível para ocultar o nome como ponte intermediária (`provenanceOptOut`).

---

## 6. Critérios Go / No-Go antes de qualquer código

A implementação (`client/js/render/repost-cite.js`, `client/js/repost-draft.js` e UI associada) **só** pode sair do status `rascunho` para linha de código no `ROADMAP.md` se **todos** os critérios abaixo forem aprovados pelo mantenedor e pelo revisor de privacidade:

### Condições GO (todas obrigatórias)
1. **GO-1 (Wire minimalista):** Nenhum campo de lista de contatos ou array multi-salto de intermediários entra no JSON trafegado na malha ou memória central.
2. **GO-2 (Local-only estrito):** 100% da montagem da árvore ocorre sobre dados já residentes no aparelho (`cache-node.js` + contatos locais), com zero pedidos de rede para resolver nós faltantes.
3. **GO-3 (Elo verificado):** Nenhuma atribuição nominal (`rootAuthor` / `originalAuthor`) é exibida como confiável sem o post referenciado presente localmente e aprovado por `verifyPayload` (prevenção de P5).
4. **GO-4 (Modo estrito de intermediários):** Saltos intermediários que o leitor não segue (ou com `provenanceOptOut`) são colapsados em `"via N repasses"`, sem expor `routeId` ou `displayName` (mitigação de P2 e P4).
5. **GO-5 (Barreira de visibilidade e retratação):** Posts `só amigos` / comunidade fechada bloqueiam repasse externo; `GOSSIP_DELETE` e `account_tombstone` (`PM-101`) colapsam o nó na árvore sem vazar identidade.
6. **GO-6 (Orçamento de hardening e bundle):** Implementação respeita `LLOC <= 30`, `Nesting <= 4`, `CC <= 15` e o teto de precache do shell (`PM-01`).

### Condições NO-GO (bloqueio imediato)
- Qualquer requisito que peça para consultar peers ou `central_memory.py` para "completar" quem repassou o post fora da vizinhança visível do leitor.
- Qualquer UI que exponha lista completa de republicadores nominais sem opt-out ou crie ranking de alcance/influenciadores.

---

## 7. Plano de testes mínimo (quando liberado para código)

| ID | Cenário | Expectativa |
|---|---|---|
| **T1** | Cadeia `Raiz → B (seguido) → C (seguido)` toda presente e assinada no cache | Exibe `Origem: Raiz` + `via B` (verificados). |
| **T2** | Salto intermediário `B` **não** seguido pelo leitor (ou com `provenanceOptOut: true`) | `B` colapsa para `"via 1 repasse"`, sem expor `routeId`/nome de `B`. |
| **T3** | Ciclo forjado (`A.originalId = B`, `B.originalId = A`) | Interrompe via `visited` sem travar o navegador (`cycleDetected`). |
| **T4** | Filho declara `rootAuthor = vx_vitima`, mas `root` não existe localmente ou `verifyPayload` falha | Nunca exibe `vx_vitima`; mostra `"origem não verificada localmente"`. |
| **T5** | Salto ou raiz recebe `GOSSIP_DELETE` ou `account_tombstone` (`PM-101`) | Nó colapsa para marcador neutro sem vazar autor/trecho removido. |
| **T6** | Post com visibilidade `só amigos` / comunidade fechada | `buildRepostDraft` recusa criação de repasse externo. |
