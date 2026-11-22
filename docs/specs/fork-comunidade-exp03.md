# Fork de comunidade v1 (EXP-03)

> **Status:** rascunho (aguarda aceite do [ADR-038](../adr/038-subrede-malha-e-manifesto.md) e de [community-manifest-v1.md](./community-manifest-v1.md); nada implementado) · **Owner:** mantenedor · **Revisado:** 2026-11-22

Especificação técnica do fluxo de **fork de comunidade (EXP-03)**, derivada de [ADR-038 §3.7](../adr/038-subrede-malha-e-manifesto.md#37-fork-exp-03-communityid-novo-manifesto-derivado) e [community-manifest-v1.md §7](./community-manifest-v1.md#7-fork-exp-03). Ameaças cobertas: [T1, T15, T22 e T28](../THREAT-MODEL.md).

---

## 1. Motivação ("direito de saída" soberano)

No modelo de três anéis do [ADR-038](../adr/038-subrede-malha-e-manifesto.md), o dono de uma comunidade é fixo no post canônico `c_<communityId>` e não há servidor central, votação arbitrária ou transferência de posse no v1. Quando a moderação diverge, o dono original desaparece ou sua chave é comprometida, o **fork** oferece o **direito de saída**:

- Qualquer participante pode abrir uma **nova comunidade** herdando a carta de apresentação, regras (`about`), paleta (`theme`) e lista de sugestões de infraestrutura (`modules`) efetivas da comunidade de origem, sem precisar de permissão do dono anterior nem de arbitragem externa.
- O fork **não** altera, suspende nem disputa o `communityId` original; quem quiser continuar nas duas comunidades segue as duas de forma independente.

---

## 2. Estrutura exata do fork (Post canônico + Manifesto derivado)

Um fork válido é composto por **dois itens assinados** emitidos pela **nova chave do dono** (`author` + `pubKey` próprios, assinados com `sigv: 2` segundo [`sig-format.js`](../../client/js/sig-format.js)):

1. **Novo post canônico `c_<communityId>` (`type: "community"`):**
   - `id`: `"c_" + communityId` (com `communityId` novo e distinto do original, respeitando `^[a-zA-Z0-9._-]{1,128}$`).
   - `type`: `"community"`.
   - `author`: `"vx_..."` do novo dono; `pubKey`: chave pública P-256 do novo dono.
   - `createdAt`: timestamp inteiro em milissegundos.
   - `title`, `description`, `category`, `visibility`, `image`/`avatar` e `moderators` (opcional, escolhidos explicitamente pelo novo dono — nunca copiados de forma oculta).
   - `sigv: 2` e `sig`.
2. **Primeiro manifesto derivado (`type: "community_manifest"`, `v: 1`, `prev: null`):**

```json
{
  "type": "community_manifest",
  "v": 1,
  "id": "cm_<novoCommunityId>_<issuedAt>_<8 hex aleatórios>",
  "communityId": "<novoCommunityId>",
  "author": "vx_<novoDono>",
  "pubKey": { "...": "chave pública do novo dono" },
  "issuedAt": 1795430400000,
  "prev": null,
  "forkOf": {
    "communityId": "<communityIdOriginal>",
    "manifest": "sha256:<hex minúsculo de 64 chars>"
  },
  "about": {
    "text": "…",
    "rules": "…",
    "links": [{ "label": "…", "url": "https://…" }]
  },
  "theme": {
    "accent": "#1f6feb",
    "onAccent": "#ffffff",
    "link": "#0b57d0",
    "surface": "#ffffff",
    "text": "#1b1b1b"
  },
  "modules": [
    {
      "kind": "relay-http",
      "url": "https://…",
      "label": "…",
      "operator": "vx_…"
    }
  ],
  "sigv": 2,
  "sig": "…"
}
```

### 2.1 Contrato normativo dos campos no wire format v1

Todos os nomes de campo seguem estritamente [community-manifest-v1.md §1](./community-manifest-v1.md#1-item-na-malha) e [ADR-036](../adr/036-agilidade-criptografica-pos-quantica.md):

| Conceito de proveniência | Campo canônico v1 | Regra obrigatória |
|---|---|---|
| Novo identificador da comunidade | `communityId` | Novo e distinto de `forkOf.communityId`; `^[a-zA-Z0-9._-]{1,128}$` |
| Comunidade de origem | `forkOf.communityId` | `communityId` da comunidade original (`!== communityId`) |
| Hash do manifesto original | `forkOf.manifest` | `"sha256:<64 hex minúsculos>"` da forma canônica assinada do manifesto de origem no momento do fork |
| Momento do fork | `issuedAt` (manifesto) / `createdAt` (`c_<communityId>`) | Inteiro em ms; sujeito ao limite de até +10 min no futuro do aparelho ([spec §3](./community-manifest-v1.md#3-versão-efetiva)) |
| Nova chave do dono | `author` (`vx_…`) + `pubKey` | Deve coincidir com o `author` / `pubKey` de `c_<communityId>` |
| Versão de assinatura | `sigv` | `2` (JSON canônico com chaves ordenadas em profundidade, [`sig-format.js`](../../client/js/sig-format.js)) |
| Cadeia inicial | `prev` | **Obrigatório ser `null`** quando `forkOf` está presente |
| Carta e regras copiadas/editadas | `about` | `{ text, rules, links }`; `text` e `rules` ≤ 2.000 chars cada; `links` ≤ 8 URLs `https:` |
| Paleta copiada/editada | `theme` | Lista fechada (`accent`, `onAccent`, `link`, `surface`, `text`) em `#rrggbb` com contraste WCAG 2.1 AA ≥ 4,5:1 |
| Módulos sugeridos permitidos | `modules` | ≤ 32 entradas; `kind` ∈ `{ index, turn, ar-pool, signaling, relay-http }`; URLs `https:`/`wss:` (ou `turns:` para `turn`) sem credenciais nem segredos |
| Extensões | `extensions` | **Proibido no v1** (presença do campo recusa o manifesto inteiro) |
| Limite de tamanho do item | — | Item completo ≤ 16 KB |

> **Nota de nomenclatura:** o payload v1 na malha usa exatamente `forkOf: { communityId, manifest }` e `issuedAt` (definidos em [community-manifest-v1.md](./community-manifest-v1.md)). Não emitir aliases paralelos (`forkedFrom`, `manifestHash`, `forkedAt`, `ownerPubKey`) no JSON assinado para não quebrar validação estrita de versão.

---

## 3. Invariantes rígidos de segurança e integridade

### I1 — Zero impersonação do `communityId` e da chave original ([PM-09](../../client/js/community-updates.js), T15, T28)

1. O portão do gossip e da hidratação ([`isCommunityUpdateAcceptable`](../../client/js/cache-node.js), [`central-memory-hydrate.js`](../../client/js/central-memory-hydrate.js)) **continua** vinculando a comunidade original exclusivamente ao post canônico `c_<originalCommunityId>` e ao seu `author`/`pubKey` original.
2. `forkOf` é **puramente informativo**: não concede autoridade de dono, moderador ou atualização (`community_update` ou `community_manifest`) sobre a comunidade original, nem permite reaproveitar o mesmo `communityId`.
3. Manifesto com `forkOf` cujo `prev !== null` ou cujo `forkOf.communityId === communityId` é **recusado inteiro** na validação.
4. Na criação local, se `c_<communityId>` já existir no cache/malha com outro `author`, o cliente **recusa** publicar com o mesmo `communityId` e exige um slug distinto.

### I2 — Migração estritamente opt-in de membros e módulos

1. **Zero assinatura silenciosa de membros:** seguidores, assinantes ou participantes da comunidade de origem **nunca** são inscritos, movidos ou redirecionados automaticamente para o fork.
2. **Zero herança automática de moderação ou bans:** listas de `moderators` e ações `mod-action` da comunidade original **não** se aplicam ao fork (e vice-versa). O novo dono define explicitamente sua própria lista no novo `c_<communityId>`.
3. **Zero ativação automática de infraestrutura:** mesmo quando `modules[]` é copiado do manifesto efetivo da comunidade original, cada módulo no fork é tratado como sugestão nova em **Ajustes → Rede** e **exige aceite explícito** da pessoa (anel da pessoa, T22). Módulos que a pessoa já aceitou para a comunidade original **não** passam a valer automaticamente para o fork.

### I3 — Referências históricas read-only sem re-assinatura de terceiros

1. Tópicos, respostas e votos anteriores ao fork pertencem permanentemente ao `communityId` original e às chaves `author`/`pubKey`/`sig` de seus autores originais.
2. O fork pode citar ou referenciar posts pré-fork (por exemplo via links em `about.links` ou citações de leitura `#/t/<postId>`) **estritamente em modo somente leitura**.
3. O dono do fork (ou o cliente no fluxo de criação) **nunca** deve clonar, re-empacotar com outro `communityId` ou re-assinar publicações de terceiros como se tivessem sido emitidas dentro do fork.

### I4 — Banner anti-phishing obrigatório na UI

1. Como o fork pode legitimamente copiar `title`, foto, `about` e `theme` da comunidade original, toda tela da comunidade derivada (cabeçalho da comunidade, modal/cartão de entrada e aba Sobre) **deve** exibir um banner fixo e não tematizável:
   - Texto mínimo: **`"Derivada de <nome original ou communityId>"`**, acompanhado do `communityId` próprio do fork e da identificação `vx_…` do novo dono.
2. Esse banner **não pode** ser ocultado nem estilizado por `theme` (segue a regra de isolamento do [ADR-038 §3.4](../adr/038-subrede-malha-e-manifesto.md#34-theme-lista-fechada-de-tokens-contraste-conferido-nada-que-imite-o-app)), garantindo que avisos de segurança, selo de assinatura e faixa `"Foi você?"` permaneçam sempre com a aparência global do app.

---

## 4. Modos de falha e casos de borda

| Caso de borda | Comportamento exigido |
|---|---|
| **Fork de um fork (`A → B → C`)** | O manifesto inicial de `C` aponta `forkOf` apenas para o pai imediato (`B`). Não há resolução recursiva obrigatória de toda a árvore; o banner de `C` exibe `"Derivada de <B>"`. |
| **Comunidade-mãe ausente, offline ou com dono sumido/tombstoned** | O fork **deve** validar e funcionar mesmo quando `c_<originalCommunityId>` ou o manifesto referenciado em `forkOf.manifest` não estão presentes no aparelho. O cliente valida sintaticamente `forkOf.manifest` (`^sha256:[0-9a-f]{64}$`); se o manifesto pai existir localmente e divergir do hash citado, a UI apenas sinaliza `"referência de origem não conferida localmente"` sem quebrar a leitura do fork. |
| **Conflito de slug ou nome/título idêntico** | Duas comunidades podem ter o mesmo `title` (ex.: original e fork, ou dois forks concorrentes). A chave única na malha e nas rotas (`#/c/<communityId>`) é sempre `communityId`, nunca `title`. O fluxo de criação bloqueia colisão de `communityId` conhecido e sugere sufixo distinto (ex.: `<slug>-fork`). Listagens de busca mostram `communityId` + dono `vx_…` + badge `"Derivada de …"` para desambiguação. |
| **Origem sem manifesto v1 prévio** | Se a comunidade original só possui `c_<communityId>` + `community_update` (sem `community_manifest` prévio), o campo `forkOf` pode referenciar o hash SHA-256 canônico do `c_<communityId>` (ou do último `community_update` conhecido), mantendo o formato `sha256:<hex>` e documentando na UI que partiu do registro base. |
| **Chave do dono original comprometida** | O fork nasce com novo `communityId` e novo par de chaves (`author`/`pubKey` com `sigv: 2`), isolando totalmente as futuras atualizações e sugestões de `modules[]` da chave comprometida. |
| **Tentativa de injetar `forkOf` em manifesto posterior (`prev !== null`)** | Recusado inteiro na validação estrutural; `forkOf` só é aceito quando `prev === null`. |

---

## 5. Matriz de verificação e Definition of Done (`DoD`)

### 5.1 Casos de teste exigidos antes da implementação (`code`)

| ID | Cenário | Resultado esperado |
|---|---|---|
| **F1** | Criar fork válido com novo `communityId`, novo `c_<communityId>`, `prev: null`, `forkOf: { communityId, manifest }`, `sigv: 2` | Aceito e gravado; `author` do manifesto coincide com o dono de `c_<communityId>` |
| **F2** | Manifesto com `forkOf` usando `communityId` já ocupado por outro dono | Recusado no portão (PM-09 / anti-impersonação) |
| **F3** | Manifesto com `forkOf` e `prev !== null` (ou `forkOf.communityId === communityId`) | Recusado inteiro na validação estrutural |
| **F4** | `forkOf.manifest` fora do padrão `sha256:<64 hex minúsculos>` | Recusado inteiro |
| **F5** | Fork declara `author` sem `sigv: 2` (ou assinatura inválida / de outra chave que não a do dono de `c_<newId>`) | Recusado |
| **F6** | Fork recebe `modules[]` copiados da comunidade original | Nenhum módulo é ativado automaticamente; usuário precisa aceitar um a um em Ajustes → Rede |
| **F7** | Fork com `extensions` presente no v1 | Recusado inteiro |
| **F8** | Usuário inscrito na comunidade original recebe gossip do fork | Usuário **não** é inscrito automaticamente no fork; feeds permanecem separados |
| **F9** | Tentativa de re-empacotar post antigo de terceiro dentro do fork com assinatura do dono do fork | Recusado; apenas referências read-only mantendo assinatura original são permitidas |
| **F10** | Renderizar comunidade derivada com pai ausente no aparelho e com `theme` copiado | UI exibe banner não tematizável `"Derivada de <communityIdOriginal>"` e dono `vx_…` sem erro |

### 5.2 Checklist de conclusão (`CONTRIBUTING-DOCS.md` §3)

- **DoD `doc`:**
  - [x] Spec publicada com banner `**Status:** rascunho`, regras derivadas de [ADR-038 §3.7](../adr/038-subrede-malha-e-manifesto.md#37-fork-exp-03-communityid-novo-manifesto-derivado) e [community-manifest-v1.md §7](./community-manifest-v1.md#7-fork-exp-03), invariantes I1–I4, casos de borda e matriz F1–F10.
  - [x] Link cruzado registrado em [community-manifest-v1.md §7](./community-manifest-v1.md#7-fork-exp-03).
- **DoD `code` (futuro, após aceite do ADR-038):**
  - [ ] Suíte `F1`–`F10` escrita e passando em `npm test` antes do merge em `main` ([GOVERNANCE.md](../../GOVERNANCE.md)).
