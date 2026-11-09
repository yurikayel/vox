# Brainstorm — backlog de próximas melhorias e expansões (nov/2026)

> **Status:** brainstorm · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-09 (`main` em `e7f1343`, pós-PR #35; SW `v7.41`; **936 testes**; inclui adendo §4 e avaliação Canônica v3.2)
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). As ideias PM-01…PM-66 só viram linha com caixa quando ganham DoD e responsável. Não repete as [F1–F10](./brainstorm-autossustento-10-features-2026-11.md), as [B1–B12](../research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) nem o [backlog LAN](../strategy/backlog-lancamento-publico-2026-11.md): quando uma ideia encosta numa delas, a linha aponta para lá.

## 0. Estado em 09/11/2026 (consolidado pós-PR #35)

Tudo abaixo foi medido no `main` (`e7f1343`) e nos serviços no ar nesta data.

| Área | Estado | Evidência |
|---|---|---|
| Código e CI | PRs #1–#35 mergeados. CI verde. **936 testes** (847 JS + 89 Python). Complexidade com 0 violações em 181 arquivos. SW **v7.41** | [release-metadata.json](../release-metadata.json), [baseline 2026-11-09](../metrics/baseline-2026-11-09.md) |
| Shells | **A** (GitHub Pages) e **B** (Cloudflare, `vox-9df.pages.dev`) servem a versão publicada. Os dois deploys rodam a cada push no `main` | `sw.js` dos dois em 09/11; `gh run list` |
| Sinalização | Render, com keepalive passando, e Nostr em paralelo (6 relays) **com reconexão exponencial e troca de relay reserva (PM-17 ✅ PR #35)**. O teste de fumaça Nostr ainda aguarda 1ª execução agendada | `sentinel-keepalive.yml`, `nostr-smoke.yml`, `nostr-transport.js` |
| ROADMAP | **59 itens abertos**, dos quais **40 são só `ops-humano` ou `doc`**. Só o parecer do REV-12 trava 8 itens (LAN-02, 03, 04, 13, REV-18, 20, 23, LAN-19) | [ROADMAP](../ROADMAP.md) |
| Peso do app | 181 módulos, **1,44 MiB de JS** e 303 KiB de CSS. A instalação do SW baixa **2,1 MiB em 204 arquivos** (redução de ~116 KiB / 22 módulos em revisão na branch `feat/proximos-pm-0911` — PM-04/PM-02) | contagem em `client/` |
| Código solto | **17 módulos sem nenhum importador direto** (22 módulos desconectados do grafo de entrada, ~116 KiB) entram no cache da instalação: `airgap-webrtc`, `bridging-rank`, `chunked-transfer`, `civic-credential`, `identity-link`, `kit-genesis`, `seeder-guardian`, `storage-persistence`, `testimonials`, `vox-identity`, os três `webxdc-*`, `node-health-api`, `node-health-state`, `render/node-health-badge` e `render/settings-guardian` (🚧 remoção para `UNPLUGGED_MODULES` pronta na branch `feat/proximos-pm-0911`) | varredura de `import` em `client/js` |
| Testes de tela | 22 módulos, quase todos de UI, não aparecem em nenhum teste (`screens-dm`, `screens-people`, `screens-status`, `zap-modal`, `compose-stepper`…) | varredura em `tests/` |
| Segurança | A chave de assinatura fica em `localStorage` como JWK exportável (`vox-local-account-v1`). O `arweave` vem do esm.sh sem SRI (LAN-20). ~~No GitHub, secret scanning, push protection e alertas do Dependabot estão desligados~~ **Ligados em 09/11 (PM-10 ✅) junto com ruleset `main protegido` (PM-62 ◐)** | `local-account.js`, [DEPENDENCIAS.md](../DEPENDENCIAS.md), API do repo |
| Binários | ~~A página de download serve `VoxPopuli.exe` (12 MB), `Vox.exe` e dois APKs compilados numa máquina pessoal e commitados (04/11), sem build no CI~~ **Corrigido no PR #33 (PM-45 ✅):** binários saíram do git e agora são compilados no GitHub Actions (`release-binarios.yml`) com `SHA256SUMS` e `actions/attest-build-provenance`. Falta assinatura de código Authenticode (PM-46) | [DEPENDENCIAS.md §6](../DEPENDENCIAS.md#6-binários-no-repositório) |
| Comunidades | ~~Qualquer chave consegue mudar foto e título de qualquer comunidade: `applyCommunityUpdate` não confere o autor, e `resolveCommunityMetadata` espalha o último `community_update` inteiro sobre o registro, `id` e `author` inclusive~~ **Corrigido no PR #32 (PM-09 ✅)** | `community-updates.js`, `cache-node.js` |
| Gente | 0 issues, 0 forks, 0 estrelas, 1 pessoa com acesso a tudo (bus factor 1) | API do GitHub |
| Arrumação | 11 worktrees já mergeados ainda no disco (`vox-wt-*`). Três branches locais/remotas ativas de 09/11 (`chore/qualidade-limites`, `docs/backlog-adendo-0911`, `feat/proximos-pm-0911`) e dois branches antigos fora do `main`: `feat/social-login` e `feat/post-flow-instagram` | `git worktree list`, `git branch -r --no-merged` |

### Leitura crítica

1. **O gargalo não é código.** Mais da metade do que falta é parecer jurídico, piloto, segunda pessoa e espelho com outro operador. Cada feature nova aumenta o que uma pessoa sozinha precisa manter. **Regra proposta:** até o PIL-01 (comunidade e facilitador nomeados), só entra código que destrava o piloto, conserta segurança, fecha dívida de hardening ou reduz peso.
2. **O app é pesado para quem tem franquia.** São 2,1 MiB na primeira visita, e ~116 KiB disso (22 módulos desconectados) nunca rodam. O LAN-23 (orçamento de desempenho) ganha teto inicial no PM-02/PM-04 (`feat/proximos-pm-0911`).
3. **Os dois furos críticos de integridade no código foram fechados em 09/11:** `PM-09` (PR #32 — dono da comunidade) e `PM-45` (PR #33 — binários fora do git e compilados no CI com proveniência). Resta a assinatura Authenticode no Windows (`PM-46`) e a chave não exportável em IndexedDB (`PM-12`).
4. **Os documentos de operação envelhecem em silêncio.** A tabela de espelhos dizia v7.16 (29/10), e o runbook afirmava que push não aciona o shell B, mas aciona. O NET-01 continuava aberto mesmo com o B no ar. O README do Android publicava o hash de outro build. Tudo isso foi corrigido, mas sem conferência automática (PM-19) vai envelhecer de novo.
5. **Não existe canal de volta.** Por princípio, a telemetria é só local. Por isso, sem issues nem retrospectiva, nada sabemos de quem usa. O LAN-26 (suporte) e o PIL-03 são a única fonte de verdade sobre uso.
6. **Falta um pacote autocontido para destravar o jurídico (`REV-12` / `LAN-01`).** Pedir a uma clínica jurídica ou ONG que leia dezenas de arquivos do repositório atrasa a resposta; um dossiê executivo de 2 páginas com as 5 perguntas e um rascunho honesto de `terms.html` (`PM-65`) reduz o atrito humano.

## 1. Backlog

**Esforço:** P = até 1 dia · M = até 1 semana · G = mais de 1 semana. **Tipo:** `code`, `doc`, `ops-humano` (como no ROADMAP).

### A. Fundação técnica

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-01** | **Dieta do shell:** o SW guarda na instalação só o núcleo (feed, comunidade, compor, rede, DM). Telas raras (labs, assistentes, Voxpedia, steward, `data/profiles-brazil-uf.js`) entram no cache na primeira visita | A instalação baixa 2,1 MiB; quem tem franquia paga isso antes de ver o primeiro post | M | code | LAN-23 |
| **PM-02** 🚧 `feat/proximos-pm-0911` | **Orçamento de peso que quebra o CI:** um teste soma os bytes do núcleo do `SHELL_ASSETS` (teto inicial `2_080_000` bytes em `tests/shell-reachability.test.js`) | Sem número, o peso só cresce | P | code | LAN-23 |
| **PM-03** | **Minificar só no deploy:** `deploy-pages.yml` e `deploy-shell-b.yml` minificam o artefato, com source maps; o repositório continua legível e sem etapa de build para quem desenvolve | Corta boa parte do JS transferido. A economia exata precisa ser medida | M | code + ADR | LAN-23, LAN-20 (devDependency nova entra no inventário) |
| **PM-04** 🚧 `feat/proximos-pm-0911` | **Órfãos fora do cache:** os 22 módulos desconectados do grafo de entrada (~116 KiB) saem do `SHELL_ASSETS` para `UNPLUGGED_MODULES` até o REV-02 decidir cada um. Um teste impede módulo sem importador no shell *(nota v3.2: migrar parser regex do teste para AST antes do merge)* | ~116 KiB baixados que nunca rodam | P | code | REV-02 |
| **PM-05** | **Smoke de telas:** um teste por rota que monta a tela no DOM de teste e falha com exceção | 22 módulos, quase todos de UI, sem nenhum teste | M | code | TESTES.md |
| **PM-06** | **Cobertura no resumo do CI** (`node --test --experimental-test-coverage`), sem meta no começo | Hoje não se sabe o que a suíte cobre | P | code | — |
| **PM-07** | **Checagem de tipos sem build:** JSDoc + `tsc --noEmit --checkJs` só no CI, começando por cripto e protocolo (`local-account`, `crypto-dm`, `nostr-*`, `new-key-guard`, `rate-limit`) | Erro de formato em mensagem assinada é o bug mais caro de achar | M | code | LAN-18 |
| **PM-08** | **Quebrar os 4 maiores arquivos de tela** (`render/profile`, `render/community`, `render/feed`, `app/screens-community`, todos com mais de 45 KiB) por aba | Facilita o PM-01 e reduz conflito entre PRs | M | code | HARDENING |
| **PM-66** | **Hardening v3.2 e Ratchet de Parâmetros/AST:** mesclar `chore/qualidade-limites` (`complexity: 15`, `max-depth: 4`, `max-lines-per-function: 30` como `ERROR` em `client/`), refatorar as 18 funções legadas com `max-params > 5` em `client/` (promovendo `max-params` a `ERROR`) e as 12 funções `PLR0915` em `relay/`, e usar AST (`espree`) em `tests/shell-reachability.test.js` | Fecha a dívida residual mapeada em [HARDENING.md](../HARDENING.md) sob o Perfil Canônico v3.2 | M | code | HARDENING |

### B. Segurança e integridade

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-09** ✅ PR #32 | **`community_update` só do dono:** aplicar o update só quando `author` é o dono (ou moderador) e copiar só os campos permitidos (foto, título, descrição), sem espalhar `id`/`author` sobre o registro | Hoje qualquer chave muda foto e título de qualquer comunidade | P | code | LAN-14, PM-31 |
| **PM-10** ✅ 09/11 | **Ligar secret scanning, push protection e alertas do Dependabot** no repositório (ligados via API em 09/11; atualizações automáticas de segurança do Dependabot seguem desligadas por política) | Grátis em repositório público; hoje desligados | P | ops-humano | LAN-17 |
| **PM-11** | **Vendorizar o `arweave`** (o bundle de hash já anotado) e tirar `https://esm.sh` do `script-src` | Fecha o LAN-20. Precisa de um teste real de publicação | P | code | LAN-20 |
| **PM-12** | **Chave de assinatura não exportável:** guardar a `CryptoKey` com `extractable: false` no IndexedDB e manter só a cópia cifrada do cofre para backup. O backup vira passo obrigatório do onboarding | Hoje um XSS leva a identidade inteira | G | code | LAN-18, REV-14 |
| **PM-13** | **Revogar e trocar chave:** uma chave de recuperação, impressa num cartão QR (o mesmo do backup do REV-14), assina "esta chave foi substituída por X"; o gossip passa a respeitar a troca | Perdeu o celular ou vazou a chave: hoje não há saída | G | code + doc | IDENTITY.md, `vox-identity.js` |
| **PM-14** | **Fixar Actions por SHA e contêineres por digest**, começando pelo `cloudflare/wrangler-action` (que vê o token da Cloudflare), pelo `coturn:latest` e pelo `ruff` sem versão no CI | Tags móveis listadas em [DEPENDENCIAS.md](../DEPENDENCIAS.md) | P | code | LAN-20 |
| **PM-15** | **Shell verificável:** o deploy publica um manifesto assinado (SHA-256 de cada arquivo do shell + git SHA); o app e o `mirror-validate` comparam A, B e o repositório | Prova pública de que um espelho serve o mesmo código do git | M | code | [mirror-validate-v1](../specs/mirror-validate-v1.md), NET-05 |
| **PM-45** ✅ PR #33 | **Binários compilados no CI:** o `windows-node-zero-smoke.yml` já compila o Vox Populi com PyInstaller. Estender para o cliente Windows e os APKs, publicar como GitHub Release com SHA-256 e atestação de origem (`actions/attest-build-provenance`), e tirar `client/downloads/*.exe`/`*.apk` do git | Hoje ninguém consegue reproduzir o que a página de download entrega | M | code | T2, LAN-20, LAN-33 |
| **PM-46** | **Assinar os executáveis do Windows:** sem assinatura, o SmartScreen bloqueia e não há como provar a origem. Verificar se o programa de assinatura grátis para software livre da SignPath Foundation aceita o Vox | Confiança de quem instala o nó | M | ops-humano | PM-45 |
| **PM-16** | **Auditoria de `innerHTML`:** regra de lint que exige `escapeHtml` nas interpolações de `render/`; Trusted Types como passo seguinte | Quase toda a UI é HTML montado em string | M | code | LAN-18 |

### C. Rede e infraestrutura

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-17** ✅ PR #35 | **Relay Nostr que cai volta:** reconectar com espera crescente (1 s → 60 s) e, após 3 falhas consecutivas, trocar por outro relay reserva do pool | `nostr-transport` abria cada relay uma vez no `start()` e nunca reconectava. Corrigido no PR #35 (`SW v7.41`) | P | code | REV-09, LAN-21 |
| **PM-18** | **Medição de campo da sinalização:** contadores locais em `#/status` (tentativas e sucessos por caminho, WebSocket ou Nostr, e tempo até o primeiro par), exportáveis por opção para a retrospectiva do piloto | O REV-09 não fecha sem medida de campo, e não há telemetria central | M | code | REV-09, PIL-03, ADR-001 |
| **PM-19** | **Registro de espelhos que se confere sozinho:** depois de cada deploy, um workflow lê o `sw.js` de A e B e compara com o `main`; se divergir, abre um alerta | A tabela de espelhos estava 23 versões atrás | P | code + doc | NET-01, NET-05 |
| **PM-20** | **O app conhece os espelhos:** lista assinada de shells (A, B e de comunidade); se o atual falhar, a página de download e o `#/status` sugerem o próximo | Hoje o B só aparece num link da página de download | M | code | NET-05, PM-15 |
| **PM-21** | **Kit de steward para Linux de verdade:** o `packaging/steward-kit-linux/` é um script de 309 bytes; o de Windows tem instalador e painel. Fazer o equivalente para Raspberry Pi OS e Ubuntu (serviço `systemd`, atualização, painel) | O hardware de steward mais barato é um Pi ou um PC velho com Linux | M | code | REV-04, NET-04 |
| **PM-22** | **Notificação com o app fechado:** o relay de um steward atua como emissor de Web Push (VAPID), por opção de cada comunidade | Sem isso, DM e resposta só aparecem com o app aberto | G | code | REV-04. Risco: o steward vê metadados de quem recebe |

### D. Utilidade no primeiro dia (o que faz o piloto voltar amanhã)

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-23** | **Modo assembleia:** pauta, lista de presença assinada, votação com prazo (a governança já existe) e ata assinada exportável em Markdown/PDF, com hash no Arweave | É o uso concreto de coletivo, condomínio e grêmio, o primeiro público do [direcionamento](../strategy/direcionamento-crescimento-rede-2026-11.md#onde-crescer-primeiro) | M | code | PIL-01, `perma-notary.js` |
| **PM-24** | **Aviso fixado com "li":** confirmação de leitura assinada, só na malha, com contagem para a moderação | "Todo mundo viu?" é a pergunta de quem organiza | P | code | — |
| **PM-25** | **Agenda da comunidade:** eventos com data e local, arquivo `.ics` para a agenda do celular e lembrete local | Não existe nada de evento no app | M | code | — |
| **PM-26** | **Economia de dados:** com `saveData` ligado ou em 4G, foto e vídeo só carregam no toque. Mostrar quanto o app gastou no mês (já mede por dia) | Franquia é o custo real de quem mais precisa | P | code | LAN-23 |
| **PM-27** | **Ouvir post:** botão que lê o texto em voz alta no aparelho (`speechSynthesis`, pt-BR) | Inclui quem lê com dificuldade; combina com o áudio que o compositor já grava | P | code | LAN-22 |
| **PM-28** | **Busca unificada no aparelho:** pessoas, comunidades e posts num campo só | Hoje cada tela tem a própria busca | M | code | — |

O convite que já faz o pareamento ([F2](./brainstorm-autossustento-10-features-2026-11.md#f2--convite-que-já-faz-o-pareamento-qrlink)) e o resumo semanal ([F10](./brainstorm-autossustento-10-features-2026-11.md#f10--resumo-semanal-para-grupos--bot-do-telegram)) continuam sendo as maiores alavancas de crescimento.

### E. Comunidade, moderação e confiança

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-29** | **Aval tira da quarentena:** chave nova avalizada por um membro sai da quarentena do LAN-14 sem PoW | O PoW encarece, mas não separa gente de robô; o aval separa | M | code | F8, LAN-14 |
| **PM-30** | **Quarentena editável pelo dono**, por `community_update` assinado | Hoje a opção só existe na criação, e as comunidades antigas não conseguem ligá-la | P | code | LAN-14, PM-09 |
| **PM-31** | **Registro público de decisões de moderação** por comunidade (o que foi ocultado, por quem e qual regra), base do relatório de transparência | O STF pede transparência, e o PIL-05 pede evidência do ciclo | M | code + doc | REV-20, PIL-05 |
| **PM-32** | **Decisão grave por M-de-N:** banir ou ocultar para todos exige k de n moderadores (plugar `labs/collective-mofn`) | Tira o poder de uma pessoa só e reaproveita um lab pronto | M | code | REV-02 |

### F. Economia local

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-33** | **Prestação de contas da comunidade:** entradas e saídas declaradas e assinadas por quem cuida do caixa, com saldo e comprovante (hash), sem custódia | Associação e coletivo precisam mostrar as contas | M | code | F4, B1 |
| **PM-34** | **Feira com "recomendado por quem você conhece":** contagem só de avais da sua rede, sem nota pública nem ranking | Confiança sem placar, de acordo com os preceitos | M | code | F8 |

### G. Interoperabilidade e alcance

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-35** | **Publicar no Nostr (opcional):** post público do Vox vira também uma nota kind 1, assinada por uma chave Nostr derivada | Alcance em clientes Nostr sem servidor novo; o `nostr-event.js` já assina. Precisa do mesmo aviso de permanência do Arweave | M | code | REV-11 |
| **PM-36** | **Ler o Nostr numa comunidade:** seguir uma hashtag ou uma pessoa como fonte de uma comunidade, só leitura e com moderação local | Conteúdo no primeiro dia para comunidade vazia | M | code | — |
| **PM-37** | **Widget de embed com card de assembleia ou votação** | Vitrine no site do coletivo | M | code | EXP-02 |
| **PM-38** | **Pauta legislativa automática** (Tramitado/LCP) | Ver o [brainstorm de sinergia](./brainstorm-sinergia-tramitado-vox-2026-11.md) | G | code | F9 |

### H. Plataformas e idiomas

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-39** | **Android na Play Store:** publicar o APK próprio (`android/`, já assinado) ou um TWA sobre a mesma base PWA, sempre compilado no CI (PM-45) | Hoje o APK só sai pela página de download. A conta de desenvolvedor custa US$ 25, uma vez | M | code + ops-humano | depois do G2, PM-45 |
| **PM-40** | **Tirar as strings do código:** o `i18n-pt-br.js` tem 61 linhas e quase toda a copy está em `render/*` | Pré-requisito para espanhol (América Latina) e para revisar a copy | G | code | DOC-04 |

### I. Projeto, gente, jurídico e dinheiro

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-41** | **Porta de entrada para contribuidor:** 10 issues "boa primeira tarefa" tiradas deste backlog (PM-02, 06, 19, 24, 26, 27, 30…), formulários de issue e um guia de uma página | 0 issues e 0 forks; sem isso o bus factor não sai de 1 | P | doc | LAN-26, LAN-30 |
| **PM-42** | **Proposta ao NLnet até 03/01/2027**, usando este backlog e o LAN como plano de trabalho | O prazo mais próximo do ROADMAP: faltam 8 semanas | M | doc + ops-humano | LAN-36 |
| **PM-43** | **`FUNDING.yml` + GitHub Sponsors** | 10 minutos, custo zero | P | ops-humano | REV-22 |
| **PM-65** | **Pacote de Destravamento Jurídico (`REV-12` / `LAN-01`):** dossiê executivo de 2 páginas (arquitetura sem servidor de conteúdo, separação malha efêmera vs. Arweave, Feira sem custódia, DICT Pix e as 5 perguntas do `REV-12` prontas para clínicas jurídicas/ONGs) + rascunho honesto de `client/terms.html` com banner `[Rascunho pré-parecer]` | O `REV-12` trava 8 itens do ROADMAP; entregar o resumo pronto e um `terms.html` base reduz drasticamente o tempo de resposta de quem der o parecer | P | doc + code | LAN-01, REV-12, LAN-02, LAN-03 |

### J. Arrumação

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-44** | Remover os 11 worktrees já mergeados (`vox-wt-*`). Decidir o `feat/social-login` (entra ou arquiva) e apagar o `feat/post-flow-instagram` se o PR #20 o substituiu | Branch esquecido vira trabalho perdido ou conflito | P | ops-humano | — |

## 2. Histórico da 1ª ordem sugerida (manhã de 09/11 — ver §4.4 para a fila unificada atual)

*(Mantido para rastreabilidade; a fila ativa e consolidada está na **§4.4**).*

| # | O quê | Estado no fim do dia 09/11 |
|---|---|---|
| 1 | **PM-09** `community_update` só do dono | ✅ Entregue no PR #32 (`SW v7.40`) |
| 2 | **PM-45** binários pelo CI, com hash | ✅ Entregue no PR #33 (`release-binarios.yml`) |
| 3 | **PM-10** + **PM-43** proteções do GitHub e Sponsors | ✅ **PM-10** ativo via API; **PM-43** aguarda cadastro |
| 4 | **PM-42** proposta NLnet | Aberto (prazo 03/01/2027) |
| 5 | **PM-17** reconexão Nostr | ✅ Entregue no PR #35 (`SW v7.41`) |
| 6 | **PM-11** vendorizar o `arweave` | Aberto (fecha `LAN-20`) |
| 7 | **PM-19** registro de espelhos automático | Aberto |
| 8 | **PM-04** → **PM-02** → **PM-01** dieta do shell | 🚧 **PM-04** e **PM-02** em `feat/proximos-pm-0911`; **PM-01** aberto |
| 9 | **PM-23** modo assembleia | Aguardando `PIL-01` |
| 10 | **PM-12** chave não exportável | Aberto (junto com `LAN-18`) |
| 11 | **PM-41** porta de entrada para contribuidor | Aberto |

## 3. Não fazer agora

- **Feature grande antes do PIL-01.** Sem comunidade real, não há como saber se ajuda, e alguém precisa manter.
- **Play Store e espanhol antes do G2.** Multiplicam o suporte antes de existir quem suporte.
- **Push, TURN ou qualquer servidor central em nome do mantenedor.** Contraria o [direcionamento](../strategy/direcionamento-crescimento-rede-2026-11.md#o-que-não-fazer).
- **ActivityPub.** Exige servidor sempre ligado; o Nostr dá alcance parecido sem isso (PM-35).
- **Plugar módulo órfão sem dono e sem caso de uso no piloto.** O REV-02 decide primeiro (PM-04).
- **Ranking, placar, impulsionamento pago ou moeda própria.** Seguem proibidos pelos preceitos.

## 4. Adendo de 09/11 à tarde (PM-47…PM-66) e Fila Unificada

Revisão consolidada após o PR #35 (`e7f1343`, SW `v7.41`) e auditoria sob o Perfil Canônico v3.2.

### 4.1 O que mudou durante o dia 09/11

| Área | Agora (pós-PR #35 + branches de 09/11) | Evidência |
|---|---|---|
| Código | PR #32 fechou `PM-09`; PR #33 fechou `PM-45`; PR #35 fechou `PM-17` e a 1ª parte do `PM-50`. **936 testes** em `main` (944 na branch `feat/proximos-pm-0911`), SW **v7.41** (`v7.42` na branch) | [release-metadata.json](../release-metadata.json) |
| ROADMAP | **59 abertos**, 28 fechados (`PM-17` e `PM-10` somados a *Concluído*). O gargalo continua humano: `REV-12`, `PIL-01`, `NET-04` e `REV-18` seguem sem dono | [ROADMAP](../ROADMAP.md) |
| Arrumação | Os **11 worktrees** do `PM-44` continuam no disco, junto com 3 branches de 09/11 (`chore/qualidade-limites`, `docs/backlog-adendo-0911`, `feat/proximos-pm-0911`) e os 2 branches antigos (`feat/social-login`, `feat/post-flow-instagram`) | `git worktree list`, `git branch -a --no-merged main` |
| Pesquisa | As 7 recomendações da [pesquisa de ancoragem e churn](../research/pesquisa-ancoragem-churn-infra-2026-11.md#recomendações-para-virar-linhas-no-roadmap) (V-A1…V-S1) viraram **PM-47 a PM-53** abaixo | §4.2 abaixo |
| Gateways | ✅ **Corrigido no PR #35 (PM-50 parcial):** `ar-io.dev` saiu das testemunhas GraphQL (mantido só como `raw` em `client/config/gateways.json`); testemunhas GraphQL ativas: `turbo-gateway`, `arweave.net` e `ardrive.net` | `client/js/graphql.js`, `tests/graphql.test.js` |
| Funil de links | 🚧 **Em revisão na branch `feat/proximos-pm-0911` (PM-54):** links diretos (post, perfil, comunidade, tag, proposta) passam a abrir o conteúdo imediatamente com faixa "Entrar no Vox", acionando o portão só em ações de escrita (`client/js/app/read-first.js`) | `feat/proximos-pm-0911` |
| Nostr | ✅ **Corrigido no PR #35 (PM-17):** `nostr-transport.js` agora reconecta com backoff exponencial (1 s → 60 s) e troca para relay reserva após 3 falhas consecutivas | `client/js/nostr-transport.js`, `tests/nostr-transport.test.js` |
| Pacto Vox | 🚧 **Em revisão na branch `feat/proximos-pm-0911` (PM-52):** teto separado de 5 MB/dia no 4G quando a pessoa desliga `wifiOnly`, mantendo 50 MB/dia no Wi-Fi | `client/js/peers.js` em `feat/proximos-pm-0911` |

### 4.2 Da pesquisa de ancoragem e churn (vira backlog)

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-47** | **Raiz diária agregada (MMR)** de todas as comunidades, com folhas salgadas, assinada M-de-N por stewards e paga por Credit Sharing (V-A1) | Integridade da malha no Arweave em ~1 item/dia, sem gravar post. Folha salgada mantém o hash fora do alcance da LGPD | G | code + ADR | REV-11, PM-15, `perma-notary.js` |
| **PM-48** | **`Pins-Root` obrigatório** no cache-manifest; a lista de `pins` circula na malha com prova de inclusão (V-A2) | Com `pins` no corpo, a cota esgota em ~190 dias | M | code | [cache-manifest-v0](../specs/cache-manifest-v0.md) |
| **PM-49** | **Reconciliação por intervalos** (estilo NIP-77/Negentropy, código próprio) quando a comunidade passar de ~1.000 itens (V-R1) | O WANT/HAVE ingênuo cresce com o tamanho da comunidade | G | code + ADR | — |
| **PM-50** ◐ PR #35 | **ADR-009 realista:** ✅ `ar-io.dev` removido das testemunhas GraphQL no PR #35 (mantido só `raw`). **Falta:** sonda de cobertura antes de contar um gateway (consultar uma TX conhecida), `first ≤ 100` e cursor por gateway (V-R7) | Garante que gateways que não indexam o Vox nunca contem como omissão | M (sonda) | code | LAN-27, [ADR-009](../adr/009-multi-gateway-graphql-corroboration.md) |
| **PM-51** | **Telemetria local de ICE:** tipo de candidato (`host`/`srflx`/`relay`) × família IP × ASN, exportável para a retrospectiva, sem servidor (V-N1) | Diz se o TURN é mesmo necessário e para quem. Complementa o PM-18 | M | code | PM-18, REV-10 |
| **PM-52** 🚧 `feat/proximos-pm-0911` | **4G só por opção, com teto de 5 MB/dia** e medidor visível. Wi-Fi continua com 50 MB/dia (V-P1) | Custo regressivo: quem tem o plano mais barato paga mais pela "contribuição" | P | code + doc | PM-26, [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md) |
| **PM-53** | **Meta de piso por portão:** 2 stewards "na tomada" por comunidade antes do G1; orçamento de 1 nó em datacenter antes do G3 (V-S1) | Com *p* ≈ 0,04, celular não garante persistência | P | doc + ops-humano | LAN-28, NET-04, REV-04 |

### 4.3 Ideias novas (PM-54…PM-66)

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-54** 🚧 `feat/proximos-pm-0911` | **Ler antes de entrar:** link direto para post, comunidade ou perfil abre o conteúdo com uma faixa "Entrar no Vox". O portão e o pacto só aparecem na primeira ação que escreve *(nota v3.2: trocar flag global `guardsInstalled` por `WeakSet` de `Document` antes do merge)* | O POSSE e o compartilhamento no WhatsApp são o principal funil, e hoje o portão vem antes do conteúdo | M | code | F2, F10, POSSE |
| **PM-55** | **Prévia de link (Open Graph)** por um Worker opcional e sem estado, que monta título e imagem a partir do ID no Arweave. Cada espelho pode rodar o seu | Links do Vox chegam no WhatsApp sem prévia (rota em `#`, e o robô do WhatsApp não roda JS) | M | code | PM-54. Risco: um componente de servidor, ainda que sem estado |
| **PM-56** | **Voto secreto para decisões sensíveis:** pesquisa e ADR sobre assinatura cega ou de anel, com anti-coerção | Voto assinado e público expõe quem votou contra o patrão ou o síndico. Sindicato e condomínio precisam disso | G | doc + code | PM-23, governança |
| **PM-57** | **Do voto ao ofício:** proposta aprovada vira documento (ofício ou petição em PDF) com a ata, o resultado e apoiadores que **consentiram** em aparecer, pronto para o Fala.BR, o e-Cidadania ou a câmara municipal | Fecha o ciclo cívico: decisão da comunidade chega ao poder público | M | code | PM-23, F9, `perma-notary.js` |
| **PM-58** | **Mutirão:** quadro de tarefas da comunidade ("eu faço", prazo, feito), só na malha | Organizar é distribuir tarefa, não só debater | M | code | PM-23, PM-25 |
| **PM-59** | **Rotuladores assinados:** listas de ocultação publicadas por comunidades ou stewards que outras comunidades podem assinar e desassinar (moderação componível, estilo labelers) | Divide o trabalho de moderação sem moderador central | M | code + ADR | LAN-13, PM-31 |
| **PM-60** | **Portabilidade total:** exportar conta, posts, comunidades e votos num pacote aberto (JSON + Markdown), e importar em outro aparelho ou cliente | Sair do Vox sem perder nada é parte da promessa de soberania | M | code | EXP-04, ADR-014 |
| **PM-61** 🚧 `feat/proximos-pm-0911` | **Alerta que vira issue:** falha do `nostr-smoke`, do keepalive, do deploy do shell B ou divergência de espelho abre uma issue com label `alerta-automatico`, sem servidor | Hoje uma falha agendada só aparece para quem abre a aba Actions | P | code | PM-19, LAN-24 |
| **PM-62** ◐ 09/11 | **Proteger o `main`:** CI obrigatório antes do merge (ruleset), `.nvmrc`/`engines` e versão do Python fixadas. **Feito:** ruleset "main protegido (PM-62)" ativo — merge só por PR com os 5 checks do CI verdes, sem push direto/force-push. **Falta:** `.nvmrc`/`engines` e versão do Python | Várias sessões e agentes mergeiam no mesmo `main` | P | ops-humano + code | PM-10, PM-14 |
| **PM-63** | **`CODE_OF_CONDUCT.md`** (Contributor Covenant 2.1 em português) com contato de conduta | Peça que falta dos arquivos de comunidade do GitHub; pré-requisito para chamar contribuidor de fora | P | doc | PM-41 |
| **PM-64** | **Devcontainer/Codespaces:** abrir o repositório e rodar `npm test` num clique | Reduz o "funciona na minha máquina" de quem chega | P | code | PM-41 |

*(Ver também **PM-65** na §1.I e **PM-66** na §1.A).*

### 4.4 Fila Unificada de Execução (Duas Trilhas Paralelas)

A regra da §0 continua: até o `PIL-01`, só entra código que destrava o piloto, conserta segurança, fecha dívida de hardening ou reduz peso. Como o gargalo principal é humano/institucional, a execução divide-se em **duas trilhas sem bloqueio mútuo**:

#### Trilha 1 — Engenharia, Hardening & Redução de Peso (`code` / `doc` no repo)

| # | Item | Estado | Ação imediata |
|---|---|---|---|
| 1 | **PM-66 (parte 1)** + **PM-62 (parte 2)** | 🚧 Branch `chore/qualidade-limites` (`8cd4c46`) | Mesclar promoção de ESLint (`complexity`, `max-depth`, `max-lines-per-function` como `error` em `client/`) + adicionar `.nvmrc` / `engines` no `package.json` |
| 2 | **PM-54 + PM-52 + PM-04 + PM-02 + PM-61** | 🚧 Branch `feat/proximos-pm-0911` (`b4533cd`) | Ajustar os 2 achados v3.2 (`espree` AST em `tests/shell-reachability.test.js` e `WeakSet` em `read-first.js`) e mesclar o lote no `main` (`SW v7.42`) |
| 3 | **PM-65** Pacote de Destravamento Jurídico | Aberto (`P`) | Escrever o dossiê executivo de 2 páginas para `LAN-01`/`REV-12` + rascunho honesto de `client/terms.html` |
| 4 | **PM-11** + **PM-14** Supply-Chain final | Aberto (`P`) | Vendorizar `arweave` (tirando `esm.sh` da CSP e fechando `LAN-20`) e fixar Actions/imagens por SHA/digest |
| 5 | **PM-19** Conferência automática de espelhos | Aberto (`P`) | Workflow pós-deploy que compara `sw.js` de A (`github.io`) e B (`pages.dev`) e abre issue via `PM-61` se divergir |
| 6 | **PM-01** Dieta completa do shell (lazy cache) | Aberto (`M`) | Tirar labs, Voxpedia, steward e `profiles-brazil-uf.js` do precache inicial de instalação |
| 7 | **PM-66 (parte 2)** Zerar Ratchet `max-params` | Aberto (`M`) | Refatorar as 18 funções legadas de `client/` com `> 5` parâmetros para promover `max-params` a `ERROR` |

#### Trilha 2 — Operação, Institucional & Piloto (`ops-humano` / `doc`)

| # | Item | Prazo / Portão | Ação imediata |
|---|---|---|---|
| 1 | **PM-44** Higiene de worktrees e branches | Imediato (`P`) | Remover os 11 diretórios `vox-wt-*` já mesclados e decidir destino de `feat/social-login` e `feat/post-flow-instagram` |
| 2 | **LAN-01 / REV-12** Parecer jurídico | **G1 → G2** (caminho crítico) | Enviar o dossiê do **PM-65** para clínicas jurídicas universitárias / organizações de direitos digitais |
| 3 | **PIL-01 + PM-53** Comunidade piloto + 2 stewards | **G1** | Nomear o círculo inicial (10–30 pessoas), o facilitador e a meta de 2 stewards na tomada |
| 4 | **LAN-30 (parcial) + LAN-17** Bus factor e Security | **G1** | Adicionar 2ª pessoa no GitHub/Render e testar recebimento de relato via Private Vulnerability Reporting |
| 5 | **PM-42 (LAN-36) + PM-43 (REV-22)** Financiamento | **03/01/2027** | Submeter proposta ao NLnet Restack e ativar `FUNDING.yml` / GitHub Sponsors |
| 6 | **PM-23 → PM-57** Assembleia e Ofício | **Pós-PIL-01** | Desenvolver com a comunidade nomeada do piloto |

**Ficam para depois do G2:** PM-47, PM-49, PM-55, PM-56 e PM-59. São boas ideias, mas precisam de ADR e de escala que o piloto ainda não tem.

## 5. Como uma ideia daqui vira trabalho

1. Ganha **DoD** e **responsável** e entra no ROADMAP: em *Candidatas*, ou direto numa prioridade se for correção (PM-09, PM-17).
2. Uma ideia que encosta em linha existente (LAN, REV, F, B) **complementa aquela linha**, sem criar outra.
3. Ao sair daqui, o item ganha `→ REV-xx` ou `→ LAN-xx` na coluna "Liga com", para não ser feito duas vezes.
