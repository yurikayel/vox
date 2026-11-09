# Changelog — Vox

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões semânticas: cada entrada é identificada pela **linha do Service Worker** (`CACHE_NAME` em `client/sw.js`) e pelos PRs/commits. Números de testes e SHA da release atual: [docs/release-metadata.json](./docs/release-metadata.json).

Como manter: todo PR com mudança visível acrescenta uma linha em **Não lançado**. Ao fazer merge em `main` com bump de SW, a seção *Não lançado* vira a nova entrada datada.

## [Não lançado]

### Piloto G1: decisões e primeiras peças (SW v7.45)
- **Piloto só 18+ (PM-67, [ADR-020](./docs/adr/020-postura-de-operacao-do-piloto-g1.md)):** o pacto de entrada tem a caixa "tenho 18 anos ou mais"; sem ela, os botões ficam desativados. A confirmação é autodeclarada e fica só no aparelho. Quem aceitou o pacto antes vê o pacto uma vez mais.
- **"Algo errado aqui?" (PM-68):** link no rodapé de todas as telas para apontar, sobre o app, "não funcionou", "não entendi" ou "não faz o que diz". Guarda só o nome da tela, o tipo, a versão e uma nota opcional, no aparelho; "Compartilhar apontamentos" manda o resumo para o grupo do piloto.
- **Escrever exige o pacto completo:** curtir, responder, postar e votar ficam bloqueados até concluir o pacto com a confirmação de 18+ (as guardas do "ler antes de entrar" passam a valer desde a abertura do app); o próprio fluxo de entrada e o apontamento não são bloqueados.
- **"Apagar conta local"** também apaga o pacto, a confirmação de 18+ e os apontamentos guardados.
- **Compartilhar** (tópico, comunidade, convite, oferta e apontamentos) passa por um helper só (`shareOrCopy` em `share.js`).
- **Rodapé visível no celular:** a barra de abas fixa cobria o rodapé inteiro (inclusive "Teste aberto"); agora ele tem espaço embaixo.
- **Decisões registradas:** [ADR-019](./docs/adr/019-esquecer-por-padrao-e-memoria-civica.md) (esquecer por padrão; memória cívica por regra, moderador ou votação), [ADR-020](./docs/adr/020-postura-de-operacao-do-piloto-g1.md) (mantenedor como operador, voluntários só em baixo risco, 18+, uma denúncia arquiva), [mídia v2](./docs/specs/midia-v2.md), [replicação por grau](./docs/specs/replicacao-por-grau-v0.md) e [três trabalhos voluntários](./docs/product/voluntariado-tres-trabalhos.md). Itens PM-67…PM-76 no ROADMAP.

### Segurança e financiamento (SW v7.43)
- **PM-11 `arweave` vendorizado:** a biblioteca deixa de vir do `esm.sh` em tempo de execução. O bundle autocontido 1.15.7 (o mesmo arquivo, com o mesmo sha384 já anotado no inventário) fica em `client/vendor/` e é carregado por `client/js/arweave-lib.js`, usado por `upload.js` e `wallet.js`. `https://esm.sh` saiu do `script-src` da CSP; `tests/arweave-vendor.test.js` confere o hash, que o bundle não importa nada de fora e que ele assina e verifica uma transação sem rede. Fecha o LAN-20.
- **PM-42 rascunho da proposta ao NLnet Restack** (prazo 03/01/2027): [proposta-nlnet-restack-2027.md](./docs/strategy/proposta-nlnet-restack-2027.md), com os riscos que decidem a proposta (dimensão europeia eliminatória, política de IA generativa), checklist de submissão, respostas em inglês dentro dos limites do formulário e orçamento por marcos.

### Qualidade (Perfil Canônico v3.2)
- **`max-params` zerado e promovido a erro:** as 17 funções com mais de 5 parâmetros passaram a receber um objeto de opções com nomes (`f({ a, b })`), sem mudar comportamento; o 5º parâmetro de `renderProfile` (`_dmPubStr`) não era usado e saiu das 17 chamadas. **PM-62 completo:** `.nvmrc` (22), `engines.node >=22` e `.python-version` (3.12).
- **Limites que quebram o CI:** no `client/`, função com mais de 30 linhas, aninhamento > 4, complexidade > 15, `==` e variável sem uso são erro de ESLint (antes, só aviso e passo com `continue-on-error`). No Python, Ruff `F` (pyflakes) e `C901` (complexidade > 15) em `relay/`, `scripts/` e `packaging/`, com versão fixa (0.17.4); antes o ruff era opcional.
- **Dívida medida e informada:** 18 funções JS com mais de 5 parâmetros, 27 arquivos com mais de 350 linhas, 25 testes com mais de 45 linhas (`npm run lint:all`), 7 funções Python com mais de 30 comandos. `docs/HARDENING.md` mostra, regra a regra, o que bloqueia de fato, a dívida e o alvo; complexidade cognitiva e CBO/LCOM aparecem como **não medidos**.
- **Bug achado pelo pyflakes:** `save_vault()` da memória central chamava `_atomic_write`, que não existe; salvar cofre no relay estourava `NameError`. Corrigido, com teste que falha no código antigo. O `ruff --fix` também apagava o import que verifica o WebKit no cliente Linux; restaurado com `noqa`.
- **Evidência e auditoria:** [docs/process/qualidade-e-evidencia.md](./docs/process/qualidade-e-evidencia.md) (PASS / FAIL / NOT RUN / BLOCKED, falso verde, determinismo, papéis sem modelo fixo), auditor só-leitura em `.agents/agents/vox-auditor.md`, template de PR com tabela de evidência, `CLAUDE.md` e `npm run validate`.

### Distribuição (PR #33)
- **PM-45 binários pelo CI:** `Vox.exe`, `VoxPopuli.exe`, `vox.apk` e `vox-populi.apk` saem do workflow `release-binarios.yml` (runner do GitHub, a cada tag `v*`), com `SHA256SUMS` e atestação de origem (`gh attestation verify <arquivo> --repo yurikayel/vox`). A página de download e o README apontam para `releases/latest/download/…`, e os binários saíram do git (eram compilados numa máquina pessoal). PR que mexe em `android/` ou `packaging/` compila os quatro para provar que o build funciona. `android/build.ps1` aceita `VOX_JAVA_HOME` e `ANDROID_HOME`.

### Planejamento (09/11, tarde)
- [Backlog de próximas melhorias](./docs/brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md) §4: adendo com PM-47…PM-64. As 7 recomendações da pesquisa de ancoragem e churn viram itens; achados novos: `ar-io.dev` não indexa o Vox mas está no catálogo de gateways, e links diretos abrem atrás do portão de boas-vindas.

### Comunidades (SW v7.40, PR #32)
- **PM-09 foto e título só do dono:** um `community_update` só vale quando quem assina é o dono da comunidade ou um moderador listado, e só muda foto, título, descrição e categoria. Antes, qualquer chave trocava a foto e o título de qualquer comunidade, e o update inteiro (com `id` e `author`) era espalhado sobre o registro. O gossip não grava nem repassa update de quem não pode. Corrigidos junto: a atualização **mais antiga** vencia (a lista vem do mais novo para o mais velho), e um segundo post `community` com o mesmo `communityId` e `ts` antigo tomava a comunidade. Agora só o post `c_<communityId>` define o dono (`community-updates.js`).
- O botão "Alterar foto" segue a mesma regra, com a chave local (`vx_…`) que assina o update. Em comunidade publicada só no Arweave, cujo dono é um endereço de carteira, o botão some: não há como provar que a chave local é dessa carteira.

### Rede, peso e operação (SW v7.42)
- **PM-54 ler antes de entrar:** link direto para post, comunidade, perfil, tag ou proposta abre o conteúdo na hora, com uma faixa "Entrar no Vox". O portão de boas-vindas e o pacto só aparecem na primeira ação que escreve (curtir, responder, votar, entrar na comunidade). Antes, quem recebia um link no WhatsApp via o portão em tela cheia antes do conteúdo.
- **PM-52 4G só por opção:** no 4G, o aparelho só repassa dados se a pessoa desligar "apenas no Wi-Fi", e até um teto próprio (padrão 5 MB/dia, 1–50). O Wi-Fi continua com 50 MB/dia. O painel mostra quanto foi no 4G.
- **PM-04 órfãos fora do cache:** os 22 módulos que nenhuma tela carrega saíram do precache (~116 KB a menos na instalação) e ficam listados em `UNPLUGGED_MODULES`. Um teste segue os imports a partir dos pontos de entrada e quebra se um módulo morto voltar ao precache.
- **PM-02 orçamento de peso:** teste que soma o precache (2.038.578 bytes em 182 arquivos) com teto de 2.080.000 bytes.
- **PM-61 alerta vira issue:** falha do keepalive do Render, do teste de fumaça Nostr, da rotina mensal de dependências ou do deploy do shell B abre uma issue `alerta-automatico` (uma por tipo enquanto estiver aberta). O keepalive passou a contar falhas: antes terminava verde mesmo com o Render fora.

### Rede (SW v7.41)
- **PM-50 gateways:** o `ar-io.dev` saiu das testemunhas GraphQL (devolve 0 itens `vox-brasil`, medido em 08 e 09/11) e ficou só para leitura `raw`. `graphqlGateways()` filtra o catálogo, então um gateway que não indexa o Vox não conta mais como "omissão" na corroboração. Testemunhas GraphQL: turbo-gateway, arweave.net e ardrive.net.
- **Testes de binário olham só o que o git rastreia:** o LAN-20 e o PM-45 varriam o disco e falhavam em qualquer máquina com build local ignorado (ex.: APK em `android/build/`); agora usam `git ls-files`, com varredura do disco só sem git.
- **PM-17 reconexão Nostr:** relay que cai volta sozinho com espera crescente (1 s, 2 s, 4 s… até 60 s); depois de 3 tentativas sem abrir, a vaga troca para outro relay do pool. Antes, cada relay abria uma vez e, se caísse, o caminho paralelo morria em silêncio. Sockets fechados saem da lista.

### Documentação (PR #31)
- **Revisão de estado de 09/11 e backlog de próximas melhorias:** [brainstorm PM-01…PM-46](./docs/brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md) com o estado medido (peso da instalação, módulos órfãos, telas sem teste, chave em `localStorage`, `community_update` sem conferência de autor) e a ordem sugerida das próximas 10.
- **LAN-20, binários:** [DEPENDENCIAS.md §6](./docs/DEPENDENCIAS.md#6-binários-no-repositório) lista os `.exe`, `.apk` e DLLs do repositório com SHA-256, e o teste de inventário quebra se um binário mudar sem atualizar a tabela. O `android/README.md` publicava um hash e um tamanho de outro build (corrigidos).
- **NET-01 fechado com evidência:** o shell B (`vox-9df.pages.dev`) serve a v7.39, igual ao A; a tabela de espelhos estava em v7.16 e o runbook dizia que push não aciona o B (aciona).

### Rede e anti-spam (SW v7.39, PR #30)
- **LAN-21 sinalização caída:** quando o servidor WebSocket desistiu de todos os nós e nenhum relay Nostr está aberto por mais de 5 s, o app avisa que a troca com outros aparelhos parou e que ler e escrever continuam; avisa também quando volta. Em `#/settings/network`, "Conectando a aparelhos próximos…" deixa de aparecer para sempre (`honest-errors.js` → `createSignalingHealth`, `nostr-transport.js` conta relays abertos).
- **LAN-14 quarentena de chave nova e PoW leve:** ao criar uma comunidade, dá para pedir quarentena; posts de chave vista há menos de 24 h ficam recolhidos ("Ver mesmo assim"), a menos que tragam prova de trabalho de 14 bits, que o app calcula sozinho ao publicar (~1 s). Moderação vê tudo, com selo "Chave nova" (`new-key-guard.js`).

### Segurança
- **LAN-20 inventário de dependências:** [docs/DEPENDENCIAS.md](./docs/DEPENDENCIAS.md) lista o código de terceiros (CDN, SDKs, npm, contêineres, Actions); `tests/dependencias-inventory.test.js` quebra o CI se algo novo entrar sem linha; `deps-mensal.yml` roda `npm audit` e confere o hash do bundle do `arweave` todo mês. Achado: a entrada `esm.sh/arweave@1.15.7` puxa dependências com `^` e varia por User-Agent; vendorizar o bundle fica pendente.

### Documentação
- Revisão de estado de 08/11/2026: README, ROADMAP, FEATURES, INFRA-CUSTOS, THREAT-MODEL, TESTES, índice de `docs/` e DEV §27 alinhados ao `main` depois dos PRs #17–#28. ROADMAP com linhas de tabela consertadas, itens fechados movidos para *Concluído* e parciais marcados com 🚧. README sem a afirmação "PWA < 50 KB" (o `client/js` tem ~1,9 MB). Release line regenerada.

### Qualidade
- `npm test` travava localmente: o teste "dois pares" do `nostr-transport` esperava tempos fixos, falhava com a suíte inteira no mesmo processo e deixava o `setInterval` do hello vivo. Agora espera a condição e para os transportes no `finally`; a suíte roda em segundos.

## SW v7.33 → v7.38 — 2026-11-08 (PRs #13–#28)

### Rede, privacidade e resiliência
- **Nó leve por padrão, modo Apoiador por opção** (PR #21): todo aparelho ajuda a malha com 50 MB/dia e 25 MB em disco; o botão "Seja um apoiador da rede" sobe para 500 MB/dia e 250 MB, só no Wi-Fi (`supporter-mode.js`).
- **REV-24 modo eleitoral** (PR #24): de 16/08 a 31/10 de ano par, ou com `electoralMode` em `flags.json`, some a linha "Sugestões cívicas" (`electoral-period.js`).
- **LAN-19 privacidade de IP** (PR #25): aviso de que outros aparelhos veem o IP e opção "Esconder meu IP" (`iceTransportPolicy: relay`). Só funciona quando houver TURN (REV-10).
- **LAN-27 leitura resiliente e LAN-21 erros honestos** (PR #26): 4 gateways com tempo limite de 8 s; `honest-errors.js` explica cota, 402, 429, offline, timeout, gateways fora e DM sem relay.
- **LAN-14 limite de taxa** (PR #27): 20 posts por chave a cada 10 min no gossip; o excesso é descartado e não é repassado (`rate-limit.js`).

### Marca e diretório
- **Logo do megafone** como marca do topo, favicon, ícones do app e avatar oficial (PR #20); avatares em squircle sem contorno.
- Diretório: pares só com a chave `vx_…` (sem nome escolhido) saem da lista; a busca pela chave ainda os acha (PR #20).

### Qualidade
- **REV-03** `tests/release-metadata-drift.test.js`; **REV-06** os 35 hotlinks do Unsplash viraram imagens locais; **LAN-20 (parcial)** `npm audit --audit-level=high` no CI (PR #22).
- Teste T11 do `gossip-retract` sem corrida de milissegundo no `editedAt` (PR #28).

### Operação
- [Runbook de incidentes](./docs/operations/runbook-incidentes.md) (LAN-24) e [plano de lançamento em ondas](./docs/strategy/plano-lancamento-ondas.md) (LAN-34), ambos rascunho (PR #28).
- ROADMAP: itens já entregues no PR #17 marcados como feitos (PR #23).

### Organização do repositório
- Pacote de mockups `stitch_vox_civic_network_interface/` removido (já aplicado; ADR-016). A especificação foi para [docs/design/sovereign-agora.md](./docs/design/sovereign-agora.md).
- Raiz enxuta: `COMPLIANCE-BR.md` → `docs/legal/`, `IDENTITY.md` → `docs/`, `POSITIONING.md` → `docs/product/`, `LESSONS.md` → `docs/process/`; `Dockerfile` duplicado e `glitch.json` removidos; `railway.json`/`zbpack.json` → `relay/deploy/`; `.editorconfig` novo.
- `tools/` dividido: manutenção do repo em `scripts/`, instaladores em `packaging/`, ferramentas de uso em `tools/` (cada pasta com README).
- `docs/` organizado em pastas por tipo (`specs/`, `operations/`, `strategy/`, `pilot/`, `research/`, `brainstorms/`, `audits/`, `product/`, `process/`, `legal/`, `archive/`). Links internos e caminhos em código, testes e workflows reescritos; links do download apontavam para a branch inexistente `develop` e agora vão para `main`.

### Rumo à rede pública — G1 (PR #17)
- **LAN-10 demonstração isolada:** os 27 perfis fictícios (e suas chaves Pix) só aparecem com o modo demonstração ligado, com faixa fixa; o aviso de falha de rede deixou de dizer "conteúdo de exemplo".
- **REV-13 Pix:** quem cadastra a chave é avisado de que o nome civil (DICT) aparece com qualquer chave; quem paga é lembrado de conferir o nome no banco.
- **REV-19 teste de fumaça Nostr:** `scripts/nostr-smoke.mjs` + workflow semanal; `eden.nostr.land` (pago) saiu do pool, `offchain.pub` entrou.
- **REV-09 sinalização por Nostr:** `nostr-transport.js` roda em paralelo ao Render; só um peerId aleatório vai em claro, o resto é cifrado (ECDH secp256k1 + AES-GCM). Assinatura BIP-340 em JS puro (`nostr-event.js`, vetores oficiais nos testes).
- **LAN-08 kill-switch:** `config/flags.json` + `feature-flags.js` (sem cache do SW).
- **LAN-11 aviso de permanência:** antes de gravar no Arweave, a pessoa escolhe "permanente" ou "só na malha".
- **LAN-12 denunciar:** o botão deixou de ser de mentira; motivos, canais oficiais (SaferNet, Disque 100, Ligue 180, 190) e DM cifrada ao moderador.
- **LAN-16 CSP:** meta CSP sem script inline + `client/_headers` (frame-ancestors, nosniff, Referrer/Permissions-Policy); handlers inline viraram delegação (`dom-delegates.js`).
- **Docs:** [THREAT-MODEL.md](./docs/THREAT-MODEL.md) (LAN-15, rascunho) e critério de go do beta no go/no-go (LAN-28).

### Planejamento
- [docs/strategy/backlog-lancamento-publico-2026-11.md](./docs/strategy/backlog-lancamento-publico-2026-11.md): brainstorm + backlog completo até a rede pública (critérios, portões G1 piloto → G2 beta → G3 público, LAN-01 a LAN-36). ROADMAP ganhou a seção "Rumo à rede pública".

### Pesquisa
- [docs/research/pesquisa-complementar-2026-11.md](./docs/research/pesquisa-complementar-2026-11.md): Prompt 4 respondido por busca direta e pelo Gemini (avaliado na §5) + brainstorm B1–B12. Corrige a síntese: a tese do STF trata de marketplaces (item 7), a chave Pix aleatória não esconde o nome do DICT e o IPv6 já passa de 80% nas grandes operadoras móveis. Novos REV-18 a REV-24; REV-12 e REV-13 revistos; REV-17 concluído.
- [docs/research/pesquisa-deep-research-2026-11.md](./docs/research/pesquisa-deep-research-2026-11.md): síntese verificada dos 3 relatórios do Gemini Deep Research. Confirmados: cota do Turbo vitalícia por carteira/sub-rede, Credit Sharing, Durable Objects no Workers Free, TURN da Cloudflare com 1.000 GB grátis, Docker Spaces do HF pagos, Briar em manutenção. Novos itens REV-09 a REV-16 no ROADMAP (F1 vira P0, F6 redesenhada, jurídico pós-STF, aviso nos Pix Zaps, proteção de chave no iOS).

### Decisões
- [ADR-018](./docs/adr/018-selo-govbr-via-parceiro-publico.md) (proposed): o gov.br não será login (credencial de produção exige domínio oficial de governo; o CPF é o `sub`). A proposta é um selo opcional de nível prata/ouro emitido por parceiro público, com pseudônimo HMAC e sem o CPF chegar ao Vox. Rastreado como REV-08 no ROADMAP.

### Documentação
- Revisão de estado de nov/2026: novos [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md), [docs/specs/relay-api.md](./docs/specs/relay-api.md), [docs/TESTES.md](./docs/TESTES.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [índice de ADRs](./docs/adr/README.md) e [ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md) (ROADMAP único substitui o dossiê N=25 como checklist vivo).
- Números de testes e `CACHE_NAME` passam a viver só no README e no `release-metadata.json`.
- Corrigida a premissa de "upload grátis para sempre": o Turbo expõe uma cota grátis (~10 MiB por carteira/IP) em `upload.ardrive.io/info`. INFRA-CUSTOS, FEATURES, ROADMAP (REV-07) e a feature F5 foram revisados.
- Brainstorm de 10 features de autossustento a custo ~zero + 3 prompts de pesquisa: [docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md](./docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md).

## SW v7.32 — 2026-11-07

### Marca
- Favicon e avatar oficial com o logo **VOX tricolor**; avatares em squircle em toda a UI.

## SW v7.24 → v7.31 — 2026-11-07 (PRs #1–#11)

### Adicionado
- **Design system Sovereign Agora** (PR #1, [ADR-016](./docs/adr/016-design-system-sovereign-agora-e-democracia-direta.md)): paleta `--sa-*`, Domine + Work Sans, variante clara, wordmark "VOX · Ágora Soberana", círculos territoriais sem contagem fictícia.
- **Feed Social e Cívico** (PR #2): `#/` e `#/?feed=civic`; classificador `civic-post.js`; posicionamento/enquete com voto assinado `civic-vote` (1 por pessoa).
- **Mensagens:** contador de não lidas no menu e no topo (PR #3).
- **Compositor em 5 etapas** (PR #6) e **onboarding em etapas** com pacto como etapa final (PR #7).
- **Proposta, comunidade e oferta da Feira em etapas**; **enquete** com construtor de 2–6 opções; **voto com confirmação**; assistentes de **rede**, **Senha Soberana** e **carteira** (PR #8).
- **Contas vinculadas por login** (PRs #9, #10): Bluesky OAuth no navegador, Facebook (identidade), X/Threads/GitHub/TikTok/Instagram via `/oauth/exchange`; tela simplificada com uma linha por rede; importar nome e foto no onboarding.
- **Postar estilo Instagram** (PR #11): escolha Social ou Cívico, mídias completas em Social, painel do anexo organizado.

### Alterado
- Feed sem cartões, sem fundo e sem letterbox; hover só com filete dourado (PR #5).

### Corrigido
- Contas vinculadas: sem handle inventado e sem verificação falsa (PR #9).
- Pattern do slug de comunidade inválido no modo `v` do Chrome.

### Infra
- **Deno Deploy pausado** (organização suspensa): removido de `client/config/signaling.json` e do keepalive; sinalização pública = Render + local (PR #4).

## SW v7.16 → v7.20 — 2026-11-05/06

### Adicionado
- **Cofre zero-knowledge** e recuperação cross-device via Google `sub`, Meta e Senha Soberana; sync por QR `#/sync` ([ADR-014](./docs/adr/014-zero-knowledge-vault-recuperacao-soberana.md)).
- **Memória central Modo 3** (`central_memory.py`, `VoxPopuli-ZeroMemory.exe`) com túnel Cloudflare e beacon de descoberta.
- Diretório unificado de pessoas (`#/people`) e entrada direta de nome no onboarding.
- Moderação de fórum: fixar, trancar, busca e ordenação de tópicos.
- **AGPL-3.0-or-later** ([ADR-015](./docs/adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md)); seeder P2P e descoberta `VOX-PEER-v1`.
- Cockpit POSSE ("Postar e Ecoar"), canal `#/revolucao`, Voxels no perfil ([ADR-013](./docs/adr/013-sistema-voxels-e-conquistas-civicas.md)).
- Runtime Webxdc em sandbox, relay cego e cintura fina `vox-identity` ([ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)).
- Página de downloads e executáveis nativos (Windows 967 KiB, Android micro-APK, Linux, macOS).

## Out/2026 — fundação (SW v5.x → v7.15)

- Fases 1–5: leitura GraphQL multi-gateway, autoria ANS-104 via Turbo, malha WebRTC com gossip, DMs E2E com inbox TTL, handles `@`.
- Comunidades estilo Orkut, governança com diff e voto assinado, Feira, Pix Zaps (BR Code offline), Open Frames, POSSE.
- Hardening: zero violações de complexidade ([ADR-007](./docs/adr/007-zero-complexity-monolith-decomposition.md)), paridade de precache do SW.
- Vox Populi (nó dedicado: Linux/Pi, Android, Windows) — [ADR-008](./docs/adr/008-vox-populi-community-node-architecture.md), [ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md).

Histórico detalhado sprint a sprint: [client/DEV.md](./client/DEV.md).
