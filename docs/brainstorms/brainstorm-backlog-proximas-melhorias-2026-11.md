# Brainstorm — backlog de próximas melhorias e expansões (nov/2026)

> **Status:** brainstorm · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-09 (`main` em `e8629a9`, depois do PR #30; adendo §4 em `1a79122`, depois do PR #32)
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). As ideias PM-01…PM-64 só viram linha com caixa quando ganham DoD e responsável. Não repete as [F1–F10](./brainstorm-autossustento-10-features-2026-11.md), as [B1–B12](../research/pesquisa-complementar-2026-11.md#4-brainstorm-b1b10-a-partir-dos-achados) nem o [backlog LAN](../strategy/backlog-lancamento-publico-2026-11.md): quando uma ideia encosta numa delas, a linha aponta para lá.

## 0. Estado em 09/11/2026

Tudo abaixo foi medido no `main` e nos serviços no ar nesta data.

| Área | Estado | Evidência |
|---|---|---|
| Código e CI | PRs #1–#30 mergeados, nenhum aberto. CI verde. **920 testes** (831 JS + 89 Python). Complexidade com 0 violações. SW v7.39 | [release-metadata.json](../release-metadata.json), [baseline 2026-11-09](../metrics/baseline-2026-11-09.md) |
| Shells | **A** (GitHub Pages) e **B** (Cloudflare, `vox-9df.pages.dev`) servem a v7.39. Os dois deploys rodam a cada push no `main` | `sw.js` dos dois em 09/11; `gh run list` |
| Sinalização | Render, com keepalive passando, e Nostr em paralelo (6 relays). O teste de fumaça Nostr ainda não rodou nenhuma vez (agenda semanal recém-criada) | `sentinel-keepalive.yml`, `nostr-smoke.yml` |
| ROADMAP | **61 itens abertos**, dos quais **41 são só `ops-humano` ou `doc`**. Só o parecer do REV-12 trava 8 itens (LAN-02, 03, 04, 13, REV-18, 20, 23, LAN-19) | [ROADMAP](../ROADMAP.md) |
| Peso do app | 180 módulos, **1,44 MiB de JS** e 303 KiB de CSS. A instalação do SW baixa **2,1 MiB em 204 arquivos** | contagem em `client/` |
| Código solto | **17 módulos sem nenhum importador** (99 KiB) entram no cache da instalação: `airgap-webrtc`, `bridging-rank`, `chunked-transfer`, `civic-credential`, `identity-link`, `kit-genesis`, `seeder-guardian`, `storage-persistence`, `testimonials`, `vox-identity`, os três `webxdc-*`, `node-health-api`, `node-health-state`, `render/node-health-badge` e `render/settings-guardian` | varredura de `import` em `client/js` |
| Testes de tela | 22 módulos, quase todos de UI, não aparecem em nenhum teste (`screens-dm`, `screens-people`, `screens-status`, `zap-modal`, `compose-stepper`…) | varredura em `tests/` |
| Segurança | A chave de assinatura fica em `localStorage` como JWK exportável (`vox-local-account-v1`). O `arweave` vem do esm.sh sem SRI (LAN-20). No GitHub, secret scanning, push protection e alertas do Dependabot estão **desligados** | `local-account.js`, [DEPENDENCIAS.md](../DEPENDENCIAS.md), API do repo |
| Binários | A página de download serve `VoxPopuli.exe` (12 MB), `Vox.exe` e dois APKs **compilados numa máquina pessoal e commitados** (04/11), sem build no CI e sem assinatura de código. O README do Android publicava um SHA-256 e um tamanho que não batiam com o APK atual (corrigido neste PR). A DLL do WebView2 está vendorizada sem versão anotada | [DEPENDENCIAS.md §6](../DEPENDENCIAS.md#6-binários-no-repositório) |
| Comunidades | ~~Qualquer chave consegue mudar foto e título de qualquer comunidade: `applyCommunityUpdate` não confere o autor, e `resolveCommunityMetadata` espalha o último `community_update` inteiro sobre o registro, `id` e `author` inclusive~~ **Corrigido no PR #32 (PM-09)** | `cache-node.js`, `app/screens-community.js` |
| Gente | 0 issues, 0 forks, 0 estrelas, 1 pessoa com acesso a tudo (bus factor 1) | API do GitHub |
| Arrumação | 11 worktrees já mergeados. Dois branches remotos com trabalho fora do `main`: `feat/social-login` (importar nome e foto do Bluesky, X e TikTok; 54 commits atrás) e `feat/post-flow-instagram` (favicon tricolor; provavelmente superado pelo PR #20) | `git worktree list`, `git branch -r --no-merged` |

### Leitura crítica

1. **O gargalo não é código.** Mais da metade do que falta é parecer jurídico, piloto, segunda pessoa e espelho com outro operador. Cada feature nova aumenta o que uma pessoa sozinha precisa manter. **Regra proposta:** até o PIL-01 (comunidade e facilitador nomeados), só entra código que destrava o piloto, conserta segurança ou reduz peso.
2. **O app é pesado para quem tem franquia.** São 2,1 MiB na primeira visita, e 99 KiB disso nunca rodam. O LAN-23 (orçamento de desempenho) não tem número.
3. **Há dois furos de integridade.** Um nas comunidades (a linha "Comunidades" acima). O outro, maior, nos binários: quem baixa o `.exe` confia na máquina de uma pessoa, e nada permite conferir. Os dois deveriam vir antes de qualquer piloto.
4. **Os documentos de operação envelhecem em silêncio.** A tabela de espelhos dizia v7.16 (29/10), e o runbook afirmava que push não aciona o shell B, mas aciona. O NET-01 continuava aberto mesmo com o B no ar. O README do Android publicava o hash de outro build. Tudo isso foi corrigido neste PR, mas sem conferência automática (PM-19) vai envelhecer de novo.
5. **Não existe canal de volta.** Por princípio, a telemetria é só local. Por isso, sem issues nem retrospectiva, nada sabemos de quem usa. O LAN-26 (suporte) e o PIL-03 são a única fonte de verdade sobre uso.

## 1. Backlog

**Esforço:** P = até 1 dia · M = até 1 semana · G = mais de 1 semana. **Tipo:** `code`, `doc`, `ops-humano` (como no ROADMAP).

### A. Fundação técnica

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-01** | **Dieta do shell:** o SW guarda na instalação só o núcleo (feed, comunidade, compor, rede, DM). Telas raras (labs, assistentes, Voxpedia, steward, `data/profiles-brazil-uf.js`) entram no cache na primeira visita | A instalação baixa 2,1 MiB; quem tem franquia paga isso antes de ver o primeiro post | M | code | LAN-23 |
| **PM-02** | **Orçamento de peso que quebra o CI:** um teste soma os bytes do núcleo do `SHELL_ASSETS`, com teto inicial 20% abaixo do valor de hoje | Sem número, o peso só cresce | P | code | LAN-23 |
| **PM-03** | **Minificar só no deploy:** `deploy-pages.yml` e `deploy-shell-b.yml` minificam o artefato, com source maps; o repositório continua legível e sem etapa de build para quem desenvolve | Corta boa parte do JS transferido. A economia exata precisa ser medida | M | code + ADR | LAN-23, LAN-20 (devDependency nova entra no inventário) |
| **PM-04** | **Órfãos fora do cache:** os 17 módulos sem importador saem do `SHELL_ASSETS` (ou vão para `client/js/unplugged/`) até o REV-02 decidir cada um. Um teste impede módulo sem importador no shell | 99 KiB baixados que nunca rodam | P | code | REV-02 |
| **PM-05** | **Smoke de telas:** um teste por rota que monta a tela no DOM de teste e falha com exceção | 22 módulos, quase todos de UI, sem nenhum teste | M | code | TESTES.md |
| **PM-06** | **Cobertura no resumo do CI** (`node --test --experimental-test-coverage`), sem meta no começo | Hoje não se sabe o que a suíte cobre | P | code | — |
| **PM-07** | **Checagem de tipos sem build:** JSDoc + `tsc --noEmit --checkJs` só no CI, começando por cripto e protocolo (`local-account`, `crypto-dm`, `nostr-*`, `new-key-guard`, `rate-limit`) | Erro de formato em mensagem assinada é o bug mais caro de achar | M | code | LAN-18 |
| **PM-08** | **Quebrar os 4 maiores arquivos de tela** (`render/profile`, `render/community`, `render/feed`, `app/screens-community`, todos com mais de 45 KiB) por aba | Facilita o PM-01 e reduz conflito entre PRs | M | code | HARDENING |

### B. Segurança e integridade

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-09** ✅ PR #32 | **`community_update` só do dono:** aplicar o update só quando `author` é o dono (ou moderador) e copiar só os campos permitidos (foto, título, descrição), sem espalhar `id`/`author` sobre o registro | Hoje qualquer chave muda foto e título de qualquer comunidade | P | code | LAN-14, PM-31 |
| **PM-10** | **Ligar secret scanning, push protection e alertas do Dependabot** no repositório | Grátis em repositório público; hoje desligados | P | ops-humano | LAN-17 |
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
| **PM-17** | **Relay Nostr que cai volta:** reconectar com espera crescente e, se não voltar, trocar por outro relay do pool | `nostr-transport` abre cada relay uma vez no `start()` e nunca reconecta. Numa sessão longa, o caminho paralelo morre em silêncio | P | code | REV-09, LAN-21 |
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

### I. Projeto, gente e dinheiro

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-41** | **Porta de entrada para contribuidor:** 10 issues "boa primeira tarefa" tiradas deste backlog (PM-02, 06, 17, 19, 24, 26, 27, 30…), formulários de issue e um guia de uma página | 0 issues e 0 forks; sem isso o bus factor não sai de 1 | P | doc | LAN-26, LAN-30 |
| **PM-42** | **Proposta ao NLnet até 03/01/2027**, usando este backlog e o LAN como plano de trabalho | O prazo mais próximo do ROADMAP: faltam 8 semanas | M | doc + ops-humano | LAN-36 |
| **PM-43** | **`FUNDING.yml` + GitHub Sponsors** | 10 minutos, custo zero | P | ops-humano | REV-22 |

### J. Arrumação

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-44** | Remover os 11 worktrees já mergeados. Decidir o `feat/social-login` (entra ou arquiva) e apagar o `feat/post-flow-instagram` se o PR #20 o substituiu | Branch esquecido vira trabalho perdido ou conflito | P | ops-humano | — |

## 2. Ordem sugerida (próximas 11)

| # | O quê | Por que nesta posição |
|---|---|---|
| 1 | ✅ **PM-09** `community_update` só do dono (PR #32) | Furo de integridade barato; precisa estar fechado antes de qualquer piloto |
| 2 | ✅ **PM-45** binários pelo CI, com hash (PR #33) | É o caminho mais curto para alguém entregar código malicioso a quem instala o nó |
| 3 | **PM-10** + **PM-43** ligar proteções do GitHub e Sponsors | Cinco a dez minutos cada |
| 4 | **PM-42** proposta NLnet | Tem prazo (03/01/2027) e financia o resto |
| 5 | **PM-17** reconexão Nostr | Bug real no caminho que segura a rede quando o Render cai |
| 6 | **PM-11** vendorizar o `arweave` | Fecha o LAN-20; só falta o teste de publicação |
| 7 | **PM-19** registro de espelhos automático | Evita que o NET-01 volte a mentir |
| 8 | **PM-04** → **PM-02** → **PM-01** dieta do shell | Do mais barato ao maior; cada passo já reduz a instalação |
| 9 | **PM-23** modo assembleia | **Só depois do PIL-01**: é feature para a comunidade nomeada, não para hipótese |
| 10 | **PM-12** chave não exportável | Junto com a revisão externa de cripto (LAN-18) |
| 11 | **PM-41** porta de entrada para contribuidor | Começa a tirar o projeto de uma pessoa só |

## 3. Não fazer agora

- **Feature grande antes do PIL-01.** Sem comunidade real, não há como saber se ajuda, e alguém precisa manter.
- **Play Store e espanhol antes do G2.** Multiplicam o suporte antes de existir quem suporte.
- **Push, TURN ou qualquer servidor central em nome do mantenedor.** Contraria o [direcionamento](../strategy/direcionamento-crescimento-rede-2026-11.md#o-que-não-fazer).
- **ActivityPub.** Exige servidor sempre ligado; o Nostr dá alcance parecido sem isso (PM-35).
- **Plugar módulo órfão sem dono e sem caso de uso no piloto.** O REV-02 decide primeiro (PM-04).
- **Ranking, placar, impulsionamento pago ou moeda própria.** Seguem proibidos pelos preceitos.

## 4. Adendo de 09/11 à tarde (PM-47…PM-64)

Revisão feita no `main` em `1a79122` (depois do PR #32). A §0 continua valendo; abaixo, só o que mudou ou faltava.

### 4.1 O que mudou desde a §0

| Área | Agora | Evidência |
|---|---|---|
| Código | PR #32 fechou o PM-09. **931 testes**, SW **v7.40**. Nenhum PR aberto | [release-metadata.json](../release-metadata.json) |
| ROADMAP | **60 abertos**, 26 fechados. O gargalo continua humano: REV-12, PIL-01, NET-04 e REV-18 seguem sem dono | [ROADMAP](../ROADMAP.md) |
| Arrumação | Os **11 worktrees** do PM-44 continuam lá, e `feat/social-login` e `feat/post-flow-instagram` continuam fora do `main` | `git worktree list`, `git branch -r --no-merged` |
| Pesquisa | As 7 recomendações da [pesquisa de ancoragem e churn](../research/pesquisa-ancoragem-churn-infra-2026-11.md#recomendações-para-virar-linhas-no-roadmap) (V-A1…V-S1) **não viraram linha em lugar nenhum**: nem no ROADMAP nem neste backlog. Viram PM-47 a PM-53 abaixo | busca no ROADMAP |
| Gateways | Medido hoje com `App-Name: vox-brasil`: **turbo-gateway, arweave.net e ardrive.net indexam o Vox; `ar-io.dev` devolve 0 itens.** O `ar-io.dev` está em `client/config/gateways.json` desde o LAN-27, então pode contar como "testemunha que não viu" e gerar falsa omissão | consulta GraphQL em 09/11 |
| Funil de links | Na primeira visita, **qualquer link direto** (post, perfil, comunidade) abre atrás do portão de boas-vindas em tela cheia (`shouldShowCantinaGate` só abre exceção para `#/ajuda/teste`). Quem recebe um link no WhatsApp vê o portão antes do conteúdo | `app/cantina-gate.js` |
| Nostr | O PM-17 continua válido: o `onclose` do `nostr-transport` atualiza o contador do LAN-21, mas não reconecta | `client/js/nostr-transport.js` |
| Pacto Vox | O padrão já é **só Wi-Fi** (`wifiOnly: true`), mas o teto é o mesmo de 50 MB/dia em qualquer rede. A pesquisa recomenda 5 MB/dia no 4G, só por opção | `client/js/peers.js` |

### 4.2 Da pesquisa de ancoragem e churn (vira backlog)

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-47** | **Raiz diária agregada (MMR)** de todas as comunidades, com folhas salgadas, assinada M-de-N por stewards e paga por Credit Sharing (V-A1) | Integridade da malha no Arweave em ~1 item/dia, sem gravar post. Folha salgada mantém o hash fora do alcance da LGPD | G | code + ADR | REV-11, PM-15, `perma-notary.js` |
| **PM-48** | **`Pins-Root` obrigatório** no cache-manifest; a lista de `pins` circula na malha com prova de inclusão (V-A2) | Com `pins` no corpo, a cota esgota em ~190 dias | M | code | [cache-manifest-v0](../specs/cache-manifest-v0.md) |
| **PM-49** | **Reconciliação por intervalos** (estilo NIP-77/Negentropy, código próprio) quando a comunidade passar de ~1.000 itens (V-R1) | O WANT/HAVE ingênuo cresce com o tamanho da comunidade | G | code + ADR | — |
| **PM-50** | **ADR-009 realista:** 2 testemunhas de verdade (mais o `ardrive.net`, se for independente), **sonda de cobertura** antes de contar um gateway (consultar uma TX conhecida), `first ≤ 100` e cursor por gateway. **Tirar o `ar-io.dev` das testemunhas GraphQL já** (manter só como `raw`) (V-R7) | Hoje um gateway que não indexa o Vox entra na corroboração | P (tirar) · M (sonda) | code | LAN-27, [ADR-009](../adr/009-multi-gateway-graphql-corroboration.md) |
| **PM-51** | **Telemetria local de ICE:** tipo de candidato (`host`/`srflx`/`relay`) × família IP × ASN, exportável para a retrospectiva, sem servidor (V-N1) | Diz se o TURN é mesmo necessário e para quem. Complementa o PM-18 | M | code | PM-18, REV-10 |
| **PM-52** | **4G só por opção, com teto de 5 MB/dia** e medidor visível. Wi-Fi continua com 50 MB/dia (V-P1) | Custo regressivo: quem tem o plano mais barato paga mais pela "contribuição" | P | code + doc | PM-26, [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md) |
| **PM-53** | **Meta de piso por portão:** 2 stewards "na tomada" por comunidade antes do G1; orçamento de 1 nó em datacenter antes do G3 (V-S1) | Com *p* ≈ 0,04, celular não garante persistência | P | doc + ops-humano | LAN-28, NET-04, REV-04 |

### 4.3 Ideias novas

| ID | Ideia | Por que | Esforço | Tipo | Liga com |
|---|---|---|---|---|---|
| **PM-54** | **Ler antes de entrar:** link direto para post, comunidade ou perfil abre o conteúdo com uma faixa "Entrar no Vox". O portão e o pacto só aparecem na primeira ação que escreve (postar, votar, mandar DM) | O POSSE e o compartilhamento no WhatsApp são o principal funil, e hoje o portão vem antes do conteúdo | M | code | F2, F10, POSSE |
| **PM-55** | **Prévia de link (Open Graph)** por um Worker opcional e sem estado, que monta título e imagem a partir do ID no Arweave. Cada espelho pode rodar o seu | Links do Vox chegam no WhatsApp sem prévia (rota em `#`, e o robô do WhatsApp não roda JS) | M | code | PM-54. Risco: um componente de servidor, ainda que sem estado |
| **PM-56** | **Voto secreto para decisões sensíveis:** pesquisa e ADR sobre assinatura cega ou de anel, com anti-coerção | Voto assinado e público expõe quem votou contra o patrão ou o síndico. Sindicato e condomínio precisam disso | G | doc + code | PM-23, governança |
| **PM-57** | **Do voto ao ofício:** proposta aprovada vira documento (ofício ou petição em PDF) com a ata, o resultado e apoiadores que **consentiram** em aparecer, pronto para o Fala.BR, o e-Cidadania ou a câmara municipal | Fecha o ciclo cívico: decisão da comunidade chega ao poder público | M | code | PM-23, F9, `perma-notary.js` |
| **PM-58** | **Mutirão:** quadro de tarefas da comunidade ("eu faço", prazo, feito), só na malha | Organizar é distribuir tarefa, não só debater | M | code | PM-23, PM-25 |
| **PM-59** | **Rotuladores assinados:** listas de ocultação publicadas por comunidades ou stewards que outras comunidades podem assinar e desassinar (moderação componível, estilo labelers) | Divide o trabalho de moderação sem moderador central | M | code + ADR | LAN-13, PM-31 |
| **PM-60** | **Portabilidade total:** exportar conta, posts, comunidades e votos num pacote aberto (JSON + Markdown), e importar em outro aparelho ou cliente | Sair do Vox sem perder nada é parte da promessa de soberania | M | code | EXP-04, ADR-014 |
| **PM-61** | **Alerta que vira issue:** falha do `nostr-smoke`, do keepalive, do deploy do shell B ou divergência de espelho abre uma issue com label, sem servidor | Hoje uma falha agendada só aparece para quem abre a aba Actions | P | code | PM-19, LAN-24 |
| **PM-62** | **Proteger o `main`:** CI obrigatório antes do merge (ruleset), `.nvmrc`/`engines` e versão do Python fixadas | Várias sessões e agentes mergeiam no mesmo `main` | P | ops-humano + code | PM-10, PM-14 |
| **PM-63** | **`CODE_OF_CONDUCT.md`** (Contributor Covenant 2.1 em português) com contato de conduta | Peça que falta dos arquivos de comunidade do GitHub; pré-requisito para chamar contribuidor de fora | P | doc | PM-41 |
| **PM-64** | **Devcontainer/Codespaces:** abrir o repositório e rodar `npm test` num clique | Reduz o "funciona na minha máquina" de quem chega | P | code | PM-41 |

### 4.4 Ordem sugerida, revista

A regra da §0 continua: até o PIL-01, só entra código que destrava o piloto, conserta segurança ou reduz peso. Dentro dela:

| # | O quê | Por que agora |
|---|---|---|
| 1 | **PM-50 (só tirar o `ar-io.dev`)** + **PM-17** reconexão Nostr | Dois bugs reais de rede, cada um com menos de um dia de trabalho |
| 2 | **PM-45** binários pelo CI | Continua o maior furo de integridade |
| 3 | **PM-10, PM-43, PM-62** proteções do GitHub, Sponsors e `main` protegido | Minutos cada, e ninguém mais precisa lembrar |
| 4 | **PM-42** proposta NLnet (03/01/2027) | Prazo fixo |
| 5 | **PM-54** ler antes de entrar | Destrava o piloto: o grupo vai trocar links no WhatsApp desde o primeiro dia |
| 6 | **PM-52** 4G com 5 MB/dia | Pequeno e protege quem tem o plano mais barato |
| 7 | **PM-04 → PM-02 → PM-01** dieta do shell | Peso continua sendo custo |
| 8 | **PM-53** meta de 2 stewards por comunidade | Tem de estar escrita antes do PIL-01 |
| 9 | **PM-61** alertas viram issue | Junto com o PM-19 |
| 10 | **PM-23 → PM-57** assembleia e ofício | Só depois do PIL-01, com a comunidade real |

**Ficam para depois do G2:** PM-47, PM-49, PM-55, PM-56 e PM-59. São boas ideias, mas precisam de ADR e de escala que o piloto ainda não tem.

## 5. Como uma ideia daqui vira trabalho

1. Ganha **DoD** e **responsável** e entra no ROADMAP: em *Candidatas*, ou direto numa prioridade se for correção (PM-09, PM-17).
2. Uma ideia que encosta em linha existente (LAN, REV, F, B) **complementa aquela linha**, sem criar outra.
3. Ao sair daqui, o item ganha `→ REV-xx` ou `→ LAN-xx` na coluna "Liga com", para não ser feito duas vezes.
