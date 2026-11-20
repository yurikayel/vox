# Plano de testes do login — Vox

> **Status:** canônico (rascunho vivo) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-19 (alinhado ao `develop` pós-S30: `tab-sync`, `onboarding-reload-keyboard`, `login-rede-ruim`)
> Evidência de testes: [qualidade-e-evidencia.md](./qualidade-e-evidencia.md) · Como rodar a suíte: [TESTES.md](../TESTES.md) · Ameaças: [THREAT-MODEL.md](../THREAT-MODEL.md) T20–T27
> Decisões cobertas: [ADR-025](../adr/025-cofre-v2-so-a-senha-abre.md), [ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md), [ADR-032](../adr/032-login-perene-a-conta-nasce-com-saida.md), [ADR-037](../adr/037-cofre-na-malha.md).

O login do Vox não tem servidor de contas. "Entrar" é **abrir uma chave que já existe** (neste aparelho, num cofre,
numa frase, em pedaços com guardiões ou em cópias com os laços). Por isso testar o login é testar três coisas:

1. **A pessoa certa sempre volta** para o mesmo `routeId`, por pelo menos um caminho, sem servidor do Vox.
2. **A pessoa errada nunca entra**, nem quem guarda cópias, nem o relay, nem quem lê o e-mail sem a senha.
3. **Nada se perde em silêncio**: toda falha diz o que aconteceu e o que fazer, e nenhuma ação apaga a única saída.

Este plano lista os comportamentos que precisam valer, onde cada um está testado hoje e o que falta automatizar.
Pessoas reais ficam fora até nova decisão: toda validação é por máquina ou pelo mantenedor.

## 1. Invariantes (valem para todos os caminhos)

| ID | Invariante | Como se prova |
|---|---|---|
| INV-1 | Todo caminho de volta devolve o **mesmo `routeId`** e as mesmas chaves de conta da origem | teste de ida e volta por caminho (§3), comparando `routeId` e assinatura de um payload fixo |
| INV-2 | **A senha nunca sai do aparelho**: não aparece em `fetch`, relay, DM, `mailto:`, `localStorage` em claro nem em log | espião de rede e de storage nos testes de fluxo (padrão de `mesh-vault-flow.test.js`) |
| INV-3 | O relay só vê envelopes `{v:1, ephPub, ct}` e caixas derivadas; nunca e-mail, endereço do cofre, `routeId` da dona nem `from` de quem guarda | verificação de vazamento sobre tudo o que foi escrito no relay falso |
| INV-4 | Senha errada, e-mail errado, frase errada ou pedaço trocado **falham fechado** (sem conta parcial, sem chave trocada) | casos negativos por caminho; snapshot do storage antes e depois |
| INV-5 | Nenhuma ação remove a última saída sem aviso (ADR-032) | testes de saída (`account-exit*`) e de troca/remoção (guardiões, cofre, malha) |
| INV-6 | Dados corrompidos no storage não derrubam o app: são ignorados ou recusados | storage com JSON inválido, tipos errados e valores enormes em cada chave do login |
| INV-7 | Tudo o que chega por rede é verificado (assinatura, autor = `computeRouteId(pubKey)`, destinatário, idade) antes de mudar estado | casos de remetente falso, assinatura trocada, autor ≠ chave, pedido velho ou do futuro |
| INV-8 | Repetir uma ação é seguro (idempotência): segundo clique, segundo pedido, mesma DM duas vezes | testes de reenvio e de reentrega |

## 2. Camadas de teste

| Camada | Ferramenta | Onde | Roda no CI |
|---|---|---|---|
| Unidade (formatos, derivações, decisões) | `node:test` | `tests/*.test.js` | sim |
| Fluxo com vários aparelhos | `node:test` com troca de storage por aparelho e relay falso em memória (`as(w, quem, fn)` de `mesh-vault-flow.test.js`; `guardians-harness.js`) | `tests/*-flow.test.js`, `tests/guardian*.test.js` | sim |
| Vetores de criptografia | valores fixos de PBKDF2, HKDF, P-256 e Shamir conferidos contra referência | `tests/vault-v2.test.js`, `tests/mesh-vault.test.js`, `tests/recovery-phrase.test.js` | sim |
| Propriedade / fuzz | entradas aleatórias com semente fixa (sem dependência nova) | `tests/login-properties-phrase.test.js`, `tests/login-properties-files.test.js` | sim |
| Tela (HTML e ligação de eventos) | render em string + documento falso | `tests/onboarding-steps.test.js`, `tests/mesh-vault-ui.test.js` | sim |
| Navegador local | Chrome headless contra `npx serve client` em loopback, sem tráfego para fora | `scripts/login-e2e.mjs` | não no início (manual do mantenedor) |
| Relay real | `unittest` do relay + ida e volta pelo `relay/server.py` local | `relay/test_*.py` | sim |

Regra: teste novo de login usa **criptografia real** (WebCrypto do Node) e só falsifica a rede e o storage. Mock de
criptografia esconde exatamente os erros que importam.

## 3. Matriz por caminho

Legenda: ✅ coberto · ◐ parcial · ✖ falta. A coluna "Falta" vira item da §5.

### 3.1 Criar conta

| Comportamento | Testes hoje | Falta |
|---|---|---|
| Só com nome: conta nasce, `routeId` estável depois de recarregar | ✅ `genesis.test.js`, `local-account.test.js` | — |
| Com e-mail e senha: cofre v2 gravado, endereço normalizado (maiúsculas, espaços) | ✅ `vault-v2.test.js`, `mesh-vault.test.js` | — |
| Senha abaixo do mínimo (`VAULT_PASSPHRASE_MIN`) recusada com mensagem e foco no campo que errou | ✅ `vault-v2.test.js`, `onboarding-steps.test.js`, `email-kit.test.js` (#210) | — |
| Conta nasce com saída (kit, frase ou cofre) e o aviso de saída some só depois | ✅ `account-exit.test.js`, `account-exit-banner.test.js` | — |
| Duas abas criando ao mesmo tempo não geram duas contas | ◐ duas chamadas na mesma aba dão uma conta só (`local-account-race.test.js`, #209) | duas abas de verdade (LT-06) |

### 3.2 Voltar com e-mail e senha (caminho principal, ADR-037 §3.4)

| Comportamento | Testes hoje | Falta |
|---|---|---|
| Cofre neste aparelho ou na memória escolhida abre e devolve o mesmo `routeId` | ✅ `vault-v2.test.js`, `memory-server-choice.test.js` | — |
| Cofre ausente → pedido na malha, aviso "esperando", 24 h ou "Fui eu", e volta | ✅ `mesh-vault-flow.test.js`, `mesh-vault-ui.test.js` | — |
| "Não fui eu" bloqueia para sempre; decisão forjada é ignorada | ✅ `mesh-vault-flow.test.js` | — |
| Senha errada: nenhum aviso chega à dona, nada é liberado | ✅ `mesh-vault-flow.test.js` | — |
| Pedido expira em 72 h; quem guarda offline responde quando volta; relógio: pedido do futuro (folga de 5 min), 24 h e 72 h exatas, relógio de quem guarda voltando | ✅ `mesh-vault-flow.test.js`, `mesh-vault-clock.test.js` | — |
| Recarregar a página no meio retoma o mesmo pedido | ◐ `startMeshRestore` retoma por endereço; a senha nunca é gravada, então após recarregar é digitada de novo | teste de tela com recarga (LT-07) |
| Cofre chega de vários guardiões: abre uma vez, sem conta duplicada | ✅ `login-network-faults.test.js` (três guardiões no mesmo tick, resposta duplicada; #207) | — |
| Senha trocada depois das cópias: cópia velha não abre com a senha nova e é substituída | ✅ `mesh-vault-flow.test.js`, `profile-vault-change.test.js` | — |

### 3.3 Kit por e-mail, link `#/sync` e código `VOX1`

| Comportamento | Testes hoje | Falta |
|---|---|---|
| `mailto:` leva o cofre cifrado, **nunca a senha**; a frase só vai se marcada | ✅ `email-kit.test.js` | — |
| Link e código abrem com a senha e recusam com outra | ✅ `qr-sync-record.test.js`, `qr-url.test.js`, `login-properties-phrase.test.js` (links e `VOX1:` truncados, espaço colado; #208) | — |
| "Corrigir e-mail" revoga o endereço errado | ✅ `tests/email-kit-correct.test.js` (#190) | — |

### 3.4 Frase de recuperação (12 ou 24 palavras)

| Comportamento | Testes hoje | Falta |
|---|---|---|
| Frase gera as mesmas chaves (HKDF "vox-semente-v1") | ✅ `recovery-phrase.test.js`, `account-phrase.test.js` | — |
| Palavra errada, ordem trocada ou soma de verificação inválida recusadas | ✅ `recovery-phrase.test.js`, `login-properties-phrase.test.js` (trocas de uma palavra; #208) | — |
| Conta travada pede a senha para mostrar a frase | ✅ `key-lock.test.js` | — |
| Só conta como saída depois de digitar 3 palavras sorteadas | ✅ `account-phrase.test.js` | — |

### 3.5 Guardiões (Shamir)

| Comportamento | Testes hoje | Falta |
|---|---|---|
| M de N junta, M−1 não junta; divisões diferentes não se misturam | ✅ `guardians.test.js`, `login-properties-files.test.js` (todas as combinações de M de N para N ≤ 7; #208) | — |
| Pedido aberto só no app do guardião, com idade e código curto | ✅ `guardian-return.test.js` | — |
| Trocar ou tirar guardiões revoga os pedaços antigos | ✅ `guardians-trocar.test.js` | — |
| Veto da dona também no caminho dos guardiões | ✖ (adiado no ADR-037 §3.5) | LT-09 |

### 3.6 Outros aparelhos e arquivos

| Comportamento | Testes hoje | Falta |
|---|---|---|
| QR/link entre aparelhos e `peer-sync` | ✅ `peer-sync.test.js`, `qr-sync-record.test.js` | — |
| Arquivo `.voxid` / `.txt` abre e recusa arquivo de outro formato | ✅ `account-backup.test.js`, `login-properties-files.test.js` (vazio, ~600 KB e binário; #208) | — |
| Login social só liga contas e nunca vira chave do Vox | ✅ `social-login.test.js`, `linked-accounts.test.js` | — |

### 3.7 Conta no aparelho

| Comportamento | Testes hoje | Falta |
|---|---|---|
| Chaves em repouso travam depois do backup e destravam com a senha | ✅ `key-lock.test.js` | — |
| Trocar de conta na volta não mistura dados das duas | ✅ `restore-account-switch.test.js` | — |
| Apagar o aparelho remove chaves, cofre, cópias guardadas e pedidos da malha | ✅ `local-account.test.js`, `mesh-vault-ui.test.js` (LT-01, achado deste plano) | — |
| Storage cheio ou bloqueado (aba privada) avisa em vez de perder a conta | ✖ | LT-06 |

## 4. Falhas de rede e de ambiente

Cada caminho que usa rede roda contra um relay falso que pode: estar fora do ar, demorar, devolver erro 4xx/5xx,
devolver JSON inválido, entregar a mesma mensagem duas vezes, entregar fora de ordem e perder mensagens. O que se
espera em todos os casos: **nenhuma exceção sem tratamento, nenhum estado meio escrito, mensagem clara na tela e
nova tentativa na próxima volta** (10 min para quem guarda, 15 s para quem espera). Cobertos na malha: "fora do ar",
"reentrega", erro 5xx, JSON inválido e mensagem duplicada (`login-network-faults.test.js`, #207). Faltam relay lento,
entrega fora de ordem e mensagem perdida (resto do LT-02).

Ambiente: relógio errado (±5 min aceito, mais que isso recusado), aparelho sem chave do aparelho (cópias não são
guardadas), WebCrypto ausente (tela avisa), duas abas abertas (uma volta por aba, sem corrida no storage).

## 5. O que falta automatizar (em ordem)

| ID | Item | Arquivo | Tamanho |
|---|---|---|---|
| LT-01 | ~~Wipe apaga também as quatro chaves `vox-cofre-malha-*`~~ **feito** (o wipe esquecia as cópias guardadas; corrigido com `forgetAllMesh`) | `tests/mesh-vault-ui.test.js` | P |
| LT-02 | Relay falso com falhas programáveis (fora, lento, 5xx, JSON ruim, duplicado, fora de ordem) e vários guardiões respondendo juntos — **em parte** (#207 + `tests/login-rede-ruim.test.js`: fora do ar, 5xx, JSON ruim, duplicado, queda no meio e três guardiões no mesmo tick; faltam timeout em `probeVaultUrl` e `lockAfterPasswordBackup` com `remote=0` anotados em `test.todo`, além de fora de ordem/perda) | `tests/login-network-faults.test.js`, `tests/login-rede-ruim.test.js` | M |
| LT-03 | ~~"Corrigir e-mail" revoga o endereço errado e o novo abre~~ **feito** (#190, `tests/email-kit-correct.test.js`; guarda em `email-kit.js`) | `tests/email-kit-correct.test.js` | P |
| LT-04 | ~~Propriedade com semente fixa: troca de uma palavra da frase, links truncados, combinações de Shamir, arquivos estranhos, JSON aleatório em cada chave de storage~~ **feito** (#208; exclusões de `holderTick` e `writeSeed` removidas do sorteio após blindagem de storage) | `tests/login-properties-phrase.test.js`, `tests/login-properties-files.test.js` | M |
| LT-05 | ~~Relógio: pedido do futuro, relógio voltando, virada de 24 h e de 72 h exatas~~ **feito** (nenhum defeito: a espera conta do relógio de quem guarda, então relógio para trás só atrasa a entrega) | `tests/mesh-vault-clock.test.js`, `tests/mesh-vault-flow.test.js` | P |
| LT-06 | Duas abas e storage cheio ou bloqueado — **em parte** (#209: duas chamadas na mesma aba dão uma conta só; S30-S5 `identity/tab-sync.js` + `tests/tab-sync.test.js` sincronizam troca de conta e rota entre abas via `BroadcastChannel` `vox-tab-sync-v0` e evento `storage`; faltam corrida real de criação entre duas abas e aviso de storage cheio na criação; §5.1 LT-06b/c abertos) | `tests/local-account-race.test.js`, `tests/login-storage-edge.test.js`, `tests/tab-sync.test.js` | M |
| LT-07 | Tela: foco, mensagens de erro, `aria-live`, recarga no meio da espera, teclado só — **em parte** (#210: foco no campo que errou; `tests/onboarding-reload-keyboard.test.js` cobre retomada de rascunho/espera da malha via `sessionStorage` após recarga e foco inicial na frase; faltam focus trap/Escape no modal e persistência do kit de e-mail em §5.1 LT-07b/c) | `tests/mesh-vault-ui.test.js`, `tests/onboarding-steps.test.js`, `tests/onboarding-reload-keyboard.test.js` | M |
| LT-08 | ~~Navegador local: criar → kit → apagar → voltar por cada caminho, em Chrome headless, só loopback~~ **feito** (#198; um aparelho: só nome, e-mail+senha+frase; volta por link, código VOX1, arquivo e frase em aparelho novo; recusas; senha fora de rede e storage. Guardiões, QR e malha com dois aparelhos ficam nos testes de fluxo. Achado: após apagar, o app mostra o pacto, não a entrada) | `scripts/login-e2e.mjs` (manual do mantenedor até entrar no CI) | G |
| LT-09 | Veto da dona no caminho dos guardiões (depende de decisão no ADR-037 §3.5) | `tests/guardian-return.test.js` | M |
| LT-10 | ~~Matriz de ida e volta: para cada par (como criou × como volta), mesmo `routeId` e mesma assinatura~~ **feito** (#213: 20 pares; os pares sem caminho de volta estão listados no cabeçalho do arnês; cofre na malha × malha fica em `mesh-vault-flow.test.js`) | `tests/login-roundtrip-keys.test.js`, `tests/login-roundtrip-vault.test.js` (arnês `tests/login-roundtrip-harness.js`) | M |

LT-10 é o teste que mais prova INV-1: cruza todos os jeitos de criar com todos os jeitos de voltar que o código tem
hoje.

### 5.1 Sub-itens abertos de LT-06 e LT-07 (achados conferidos no código)

Conferidos em `client/js` na base `8eee7e4`. Todos **abertos**: são o que o código faz hoje, sem promessa de correção;
cada um vira teste (e, se o mantenedor decidir, correção) em PR próprio.

| Sub-item | Achado | Onde |
|---|---|---|
| LT-06a | **Parcialmente fechado (S30-S5):** `client/js/identity/tab-sync.js` liga `BroadcastChannel("vox-tab-sync-v0")` (rota/hash) e evento `storage` (chaves de identidade) em `initGossipListeners`, recarregando a identidade sem criar conta nova (`tests/tab-sync.test.js`). Ainda sem Web Locks para criação simultânea (ver LT-06c). | `identity/tab-sync.js`; `tests/tab-sync.test.js` |
| LT-06b | **Fechado (`local-account.js`, `tab-sync.js`, `tests/tab-sync.test.js`):** quando `vox-local-account-v1` some do `localStorage` (sem falha de persistência), `getCachedRouteIdSync` e `syncCurrentAccountMetadataToVault` descartam `cachedAccount` em memória, impedindo que a aba antiga devolva o `routeId` apagado ou o regrave em `vox-accounts-vault-v1`. | `identity/local-account.js`; `tests/tab-sync.test.js` |
| LT-06c | **Fechado (`local-account.js`, `tests/local-account-race.test.js`):** `createAccountUnlessWiped` confere `!hasStoredAccount()` antes de gravar a chave de DM e concluir a conta; se outra aba gravou `vox-local-account-v1` durante a geração assíncrona das chaves, descarta a semente gerada em voo e adota a conta já gravada. | `identity/local-account.js`; `tests/local-account-race.test.js` |
| LT-07a | **Fechado (`app/onboarding.js`, `tests/onboarding-reload-keyboard.test.js`):** `checkOAuthEnrichStep` retorna sem redesenhar quando `#oauth-enrich-overlay` já está no DOM, preservando o que a pessoa digitou em trocas de rota (`hashchange`). | `app/onboarding.js`; `tests/onboarding-reload-keyboard.test.js` |
| LT-07b | **Fechado (`render/genesis-entry.js`, `render/focus-trap.js`, `tests/onboarding-reload-keyboard.test.js`):** `renderOAuthEnrich` ativa `createFocusTrap` (ignorando ancestrais `[hidden]`, tratando `Escape` para voltar da etapa `have` ou fechar no modo `import`), foca o primeiro campo ao abrir e `closeOAuthEnrich` desativa e devolve o foco a quem abriu. | `render/genesis-entry.js`, `render/focus-trap.js`; `tests/onboarding-reload-keyboard.test.js` |
| LT-07c | **Fechado (`app/onboarding-email.js`, `tests/onboarding-reload-keyboard.test.js`):** `resumeGenesisEmailKit` reconstrói `to`, `subject`, `body` e `copyText` a partir do `mailtoUrl` já salvo em `sessionStorage`, mantendo os botões de copiar e baixar funcionais após recarga. | `app/onboarding-email.js`; `tests/onboarding-reload-keyboard.test.js` |
| LT-07d | A espera da malha não retoma após recarga: o pedido persiste (`loadMeshPending`), mas o `poll` só nasce dentro de `startMeshRestore`, chamado pelo envio do formulário de volta, e para quando `#oauth-mesh-status` some. Depois da recarga o e-mail volta preenchido, mas a pessoa precisa digitar a senha de novo (por segurança ela não fica em storage; CodeQL 282) para voltar a olhar a resposta (aí o pedido é retomado pelo endereço). | `app/onboarding-email.js:147-165,175` |

Pendência de confirmação em LT-06b: não foi rastreado se algum caminho da aba velha regrava a conta sozinho; a leitura
acima vale para o que o código permite, não para o que já foi observado em duas abas reais.

## 6. Critério de pronto para mudanças no login

Uma mudança que toca `client/js/vault/`, `client/js/identity/`, `onboarding*.js`, `mesh-vault*.js`, guardiões ou
chaves em repouso só entra com:

- teste novo ou alterado que falha no código de antes (descrito no PR);
- caso negativo para cada caso positivo novo (INV-4);
- verificação de vazamento quando há rede (INV-2, INV-3);
- `npm run validate` verde no SHA do PR, com contagem;
- linha nova ou atualizada na matriz da §3 deste documento.
