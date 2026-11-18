# ADR-035: Camadas e contextos no cliente — importar só para baixo, uma porta de entrada por assunto

**Status:** accepted (2026-11-17, pelo mantenedor; `audit:layers` no CI; contextos `vault/` e `identity/` feitos; ordem restante em §3.2) · **Revisado:** 2026-11-17 (`vault/` e `identity/` movidos; segunda porta; contagens atualizadas) · **Relacionados:** [ADR-007](./007-zero-complexity-monolith-decomposition.md), [HARDENING](../HARDENING.md), [documentação](../process/documentacao.md)

## 1. Contexto

O cliente é JavaScript sem passo de build: 291 módulos em `client/js` (develop `46f4570`, 17/11/2026). As pastas sugerem camadas: `app/` liga tela, rota e eventos; `render/` monta HTML; o resto é domínio, rede, cripto e armazenamento. Até aqui nada conferia isso, e a medição pelo grafo de imports mostrou:

- **11 imports sobem de camada, em 6 arquivos.** `render/post-more-actions.js` e `render/post-more-menu.js` importam fluxos de `app/`; `moderation.js`, `inline-composer.js` e `dom-delegates.js`, que estão na base, também importam de `app/`.
  - **Atualização 17/11/2026:** dívida zerada (#173 e o PR seguinte): os quatro módulos de controle foram para `app/`, e `moderation.js` recebe o fluxo do moderador natural por `setNaturalHideLoader`. `scripts/layers-debt.json` está vazio.
- **167 módulos soltos na raiz** de `client/js`, sem agrupamento por assunto. `local-account.js` é importado por 56 módulos.
  - **Atualização 17/11/2026 (develop `7a0f0c0`):** 297 módulos em `client/js`, 126 na raiz, depois de `vault/`, `identity/` (#161, #163) e `labs/parado/` (#177).
- **Estado espalhado:** 54 arquivos usam `localStorage` ou `sessionStorage` diretamente.
- **21 módulos não são carregados por nenhuma página.** Eles já ficam fora do precache, em `UNPLUGGED_MODULES` no `sw.js`, e o teste `tests/shell-reachability.test.js` (PM-04) reprova quem os puser de volta. Mas continuam no repositório, e as revisões e varreduras passam por eles como se fossem código do app.
  - **Atualização 17/11/2026:** os 21 foram para `client/js/labs/parado/` (decisão do mantenedor: guardar, não plugar agora). Lá a regra de camadas os isola do app; plugar um deles é um PR próprio.

Os bugs das últimas semanas vieram desse desenho:

| Bug | Causa |
|---|---|
| Restaurar conta herdava nome, Pix e chave de DM da anterior (#156) | Frase, guardiões, `.voxid` e cofre importavam a conta, cada um do seu jeito. |
| Revogação do cofre inconsistente (#158) | A regra "o que esta gravação substitui" estava em três funções. |
| Foto de login social confundida (#154) | A mesma detecção estava reimplementada em três módulos. |
| Fluxo do Bluesky roubava o login seguinte | Dois módulos usavam a mesma chave de `sessionStorage` sem um dono. |

Ao mesmo tempo, o `dungeon/` mostrou o que funciona: uma pasta por assunto, com 6 imports para fora.

## 2. Opções

1. **Reorganizar tudo de uma vez.** Recusada: um PR enorme, com conflito em todo o trabalho aberto e sem como revisar.
2. **Framework ou passo de build** (bundler, aliases, TypeScript compilado). Recusada: o cliente sem build é decisão do projeto (permaweb, auditável por quem abre o arquivo).
3. **Regras conferidas no CI como catraca, e mudança por partes.** **Escolhida.**

## 3. Decisão

### 3.1 Camadas (em vigor a partir deste ADR)

| Camada | O que é | Pode importar |
|---|---|---|
| `app` | `app.js` e `app/`: rota, telas, eventos, fluxos | qualquer camada |
| `render` | `render.js` e `render/`: monta HTML a partir de dados | `render`, `base` |
| `base` | o resto de `client/js` (inclusive `shared/` e `data/`): domínio, rede, cripto, armazenamento | `base` |
| `labs` | `labs/` e `dungeon/`: laboratório isolado do feed cívico | `labs`, `base` |

Só `app` e o próprio laboratório importam `labs`. Vale para import estático, reexportação e `import()` com texto literal.

**Conferência:** `npm run audit:layers` (`scripts/layers-audit.mjs`) lê os imports pela árvore sintática (espree), roda no `npm run validate` e no CI. Os 11 imports que já existiam ficam em `scripts/layers-debt.json`:
- import proibido novo reprova;
- dívida paga que continua no arquivo também reprova, até rodar `--prune`.

Assim a lista só pode diminuir. Quando chegar a zero, o arquivo fica vazio e a regra continua valendo.

**Como pagar a dívida:** um render que precisa disparar um fluxo recebe o fluxo por parâmetro (ou por um despachante de eventos que a `app` liga), em vez de importá-lo. O módulo da base que manipula a tela (`inline-composer.js`, `dom-delegates.js`) muda para `app/`, que é onde ele já age.

### 3.2 Contextos (direção; cada passo é um PR com a sua própria conferência)

1. **Uma pasta por assunto, com uma porta de entrada** (`index.js`) que reexporta só o que é público. Fora da pasta, importa-se pela porta; dentro, os módulos se importam livremente. O `dungeon/` é o modelo.
2. **Ordem:**
   1. `vault/` (cofre, por ter sido mexido e testado agora);
   2. `identity/` (conta, semente, travamento de chaves);
   3. `social/` (OAuth, Bluesky, contas vinculadas);
   4. `net/` (malha, WebRTC, sinalização);
   5. `qr/`.

   Cada mudança move os arquivos com `git mv`, atualiza imports e `SHELL_ASSETS` e acrescenta a regra "só pela porta" à auditoria daquela pasta (`CONTEXT_DOORS` em `scripts/layers-lib.mjs`).

   **Mais de uma porta, só com motivo escrito.** Uma pasta pode ter uma segunda porta quando ela expõe uma primitiva de nível mais baixo e passar pelo `index.js` criaria um ciclo de imports. Cada porta fica listada em `CONTEXT_DOORS` e explica, no cabeçalho, por que existe.

   **`vault/` (feito):** `vault-crypto`, `vault-store`, `vault-legacy`, `passphrase-vault` e `oauth-vault` estão em `client/js/vault/`. Portas:
   - `vault/index.js`: migração dos cofres v1, login social, Senha Soberana, cofre no link e servidores de memória;
   - `vault/envelope.js`: só cifrar e abrir um registro (`encryptVaultV2`, `decryptVaultRecord`). Existe porque `identity/key-lock.js` e `identity/inbox-backup.js` usam a cifra, e importá-la pelo `index.js` fecharia o ciclo `vault/index → passphrase-vault → identity/local-account → identity/key-lock → vault/index`.

   **`identity/` (feito):** `local-account`, `key-lock`, `keystore`, `key-at-rest`, `identity-seed`, `recovery-phrase`, `p256`, `account-phrase`, `account-backup`, `account-backup-wrap`, `account-exit`, `local-wipe`, `guardians`, `guardian-return` e `inbox-backup` estão em `client/js/identity/`. Ficaram na raiz, por não serem só da conta: `shamir-gf256` (também usado pela mesa do RPG), `signed-verify` e `sig-format` (formato de assinatura do protocolo) e os módulos de contas sociais (vão para `social/`). Portas:
   - `identity/index.js`: reexporta os módulos públicos inteiros, porque a maior parte do app usa a conta como espaço de nomes (`import * as localAccount`);
   - `identity/keys.js`: só a chave do aparelho (`isSealed`, `openSealed`, `sealJson`) e a chave privada de DM (`dmPrivateKey`). Existe porque `crypto-dm.js` e `wallet.js` usam essas primitivas, e `local-account.js` importa `crypto-dm.js`: pelo `index.js` fecharia o ciclo `crypto-dm → identity/index → local-account → crypto-dm`.

   **Custo medido da porta:** o grafo de imports estáticos já tinha um único componente com ciclo, de 113 módulos, antes da mudança. Depois dela, são 120: a própria porta e 6 módulos (`community-topic-order`, `community-unread`, `listing-ui`, `post-ownership`, `profile-card`, `voxels`) que só usavam `local-account` e agora, pela porta, alcançam também módulos da conta que voltam a eles. O app e os testes carregam igual; reduzir esse componente é trabalho da regra de camadas (§3.1), não desta pasta.
3. **Caminhos únicos.** Uma operação que mexe em estado de conta tem uma função dona, e os outros módulos passam por ela:
   - trocar de conta: `importLocalAccountBundle`;
   - gravar e aposentar o cofre: `savePassphraseVault` e `supersededVaults`;
   - fluxo de OAuth pendente;
   - revogação.
4. **Armazenamento local com dono:** cada chave de `localStorage`/`sessionStorage` pertence a um módulo e, quando é por conta, leva o escopo da conta no nome. Vira ADR próprio, com catraca na contagem de arquivos que acessam o armazenamento direto.
5. **Módulos não plugados:** o precache já é conferido pelo grafo (PM-04). O passo seguinte é tirar esses módulos da raiz: vão para `labs/`, com plano de quando entram, ou saem do repositório. Assim a revisão deixa de tratá-los como código do app.

### 3.3 O que não se faz

- Dividir arquivo só para baixar métrica (`_part1`, `_part2`) ou mover sem porta de entrada. Isso só troca uma bagunça grande por várias pequenas.
- Pôr exceção na auditoria para fazer um PR passar. Import proibido novo se resolve no código. Se a regra estiver errada, ela muda neste ADR, com revisão.

### 3.4 Ciclos dentro da mesma camada (catraca)

"Importar só para baixo" não enxerga ciclo entre módulos da mesma camada. `scripts/cycles-audit.mjs` (chamado por `npm run audit:layers`) monta o grafo de imports **estáticos** de `client/js` pela árvore sintática (espree), acha os componentes fortemente conexos de 2+ módulos e compara com `scripts/cycles-debt.json`. Reprova ciclo novo ou componente que ganhou módulo; componente menor ou desfeito reprova até `--prune` baixar o baseline (só desce). `import()` não conta: é o jeito aceito de quebrar ciclo, porque a carga é adiada e não há ciclo de avaliação.

Medição de 18/11: a auditoria por regex apontava ~24 módulos em `app/` e ~20 entre `identity/`, `peer-sync` e `central-memory`; contando também `import()` são esses mesmos 24 + 20 módulos, mas só **2 componentes de 3 módulos** são ciclos estáticos. Um foi desfeito (`identity/inbox-backup.js` passou a carregar `own-posts.js` por `import()`, pois `own-posts` → `identity/index` → `inbox-backup`). Resta `app/onboarding.js` ↔ `onboarding-email.js` ↔ `screens-network.js`, no baseline até a entrada de e-mail ser mexida de novo (identidade congelada).

## 4. Consequências

- **Positivas:**
  - a estrutura deixa de piorar sem que ninguém perceba;
  - cada assunto passa a ter uma superfície pública pequena para revisar e testar;
  - classes inteiras de bug (estado herdado entre contas, regra duplicada, dono ambíguo de chave) passam a ter um lugar só para corrigir.
- **Custos:**
  - mover arquivos mexe em imports e em `SHELL_ASSETS` e conflita com PRs abertos, por isso um assunto por vez;
  - a porta de entrada acrescenta um arquivo por pasta.
- **Riscos:** a auditoria só enxerga `import()` com texto literal. Import montado em tempo de execução escapa e deve ser evitado. Hoje o único em `client/js` é o do pacote externo do Arweave (`arweave-lib.js`, por URL), que não é módulo do cliente.
