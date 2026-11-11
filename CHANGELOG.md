# Changelog — Vox

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões semânticas: cada entrada é identificada pela **linha do Service Worker** (`CACHE_NAME` em `client/sw.js`) e pelos PRs/commits. Números de testes e SHA da release atual: [docs/release-metadata.json](./docs/release-metadata.json).

Como manter: todo PR com mudança visível acrescenta uma linha em **Não lançado**. Ao fazer merge em `main` com bump de SW, a seção *Não lançado* vira a nova entrada datada.

## [Não lançado]

### ADR-029 (aceito): mídia em duas camadas, 360p e 720p
- Decisões do mantenedor (11/11/2026):
  - **sem teto de 100 KB por item**: os pedaços ficam só como unidade de transporte;
  - **duas camadas**: Half em 360p para a malha pública e Full em 720p para o autor e os amigos, que a guardam e a servem;
  - **30 fps** em todo vídeo.
- O Arweave fica como cartório (texto e hash).
- A [spec da mídia v2](./docs/specs/midia-v2.md), a [replicação por grau](./docs/specs/replicacao-por-grau-v0.md) e o PM-71 foram atualizados. A ferramenta de medição passou a 30 fps.
- Tamanhos das camadas novas ainda não medidos. Não há codificador no app ainda, então nada muda na tela.

### ADR-028 (aceito): ponte com o Fediverso via Bluesky
- Sem servidor ActivityPub próprio. Quem quiser ser seguido no Mastodon ou no Threads liga o Bridgy Fed na própria conta do Bluesky, para onde o Vox já publica. Aviso de núcleo não atravessa automaticamente. Gatilho para rever registrado no [ADR](./docs/adr/028-ponte-activitypub-via-bluesky.md).

### Aviso assinado: lote D (no app, atrás da flag de laboratório)
- Aba `#/c/<id>/avisos` e compositor `#/compose/aviso?c=<id>` em três etapas (tipo, texto, quando e onde), só para dono e moderação. Cartão com selo, código, respostas assinadas (membros e de fora separados) e contagem colada.
- Depois de publicar, a folha de envio mostra o texto do WhatsApp; o link de conferência só aparece quando a coordenação pede. "Colar respostas do WhatsApp" publica só os números; "Cancelar ou corrigir" publica um cancelamento assinado.
- Com `localStorage["vox.lab.aviso"] = "1"`, a comunidade mostra o aviso ativo no topo e o caminho para a aba. Sem a flag, nada aparece.
- Precache: os módulos do aviso (~31 KB) foram pagos tirando do precache o `icon-white-512.png` (41 KB), que dentro do app só aparecia em 48 px e agora usa o de 192 px, já cacheado. O arquivo de 512 px continua no ar para o manifesto do PWA e o OAuth. O teto desce pela catraca (2.062.350). SW `v7.69`. 6 testes.
- Corrigido antes do merge: o link de conferência gerado no app agora leva a forma assinada do aviso (`getPostRecord`); o registro local normalizado tem campos a mais e abria como "Não confie".

### Aviso assinado: lote C (página leve de conferência)
- `client/aviso.html` + `client/aviso/aviso-page.js`: abre o link de conferência sem conta e sem carregar o app, confere a assinatura no aparelho e mostra verde (chave já conhecida), amarelo (primeira vez: guarda a chave), vermelho (alterado) ou vermelho de chave nova para grupo **ou nome** já conhecido, com botão "A coordenação confirmou este código". Respostas prontas para colar no grupo (`wa.me`). CSP própria, sem rede (`connect-src 'none'`), fora do precache.
- A conferência de assinatura saiu de `local-account.js` para `client/js/signed-verify.js` (sem mudar comportamento) e a lógica de link/códigos para `client/aviso/aviso-link.js`, sem dependências (a página é entrada à parte, como `embed/`: fora do app e do precache). SW `v7.68`. 6 testes.

### Aviso assinado: link de conferência sob demanda
- O teste no WhatsApp mostrou que o link funciona, mas o paredão de texto é hostil. O aviso agora vai limpo; o link vai numa segunda mensagem, só quando a coordenação pede (`buildAvisoLinkMessage`). Dilemas e saídas futuras (link curto pelo Arweave, formato compacto) registrados na [spec](./docs/specs/aviso-assinado-v0.md#dilemas-registrados-em-11112026).

### Aviso assinado: lote B (contar respostas coladas, ainda não plugado)
- `client/js/aviso-replies.js`: lê os dois formatos de exportação do WhatsApp e linhas soltas, reconhece ciente, vou, talvez e não vou (palavras e emojis), fica com a última resposta de cada nome, ignora resposta com código de outro aviso e devolve só números. Em `UNPLUGGED_MODULES`: precache e `CACHE_NAME` sem mudança. 4 testes.

### Aviso assinado: lote A (lógica pura, ainda não plugada)
- `client/js/aviso.js`: montar e validar o aviso (`cobranca` recusado), selo só de dono ou moderação, topo, vencimento e cancelamento, respostas e contagem colada, códigos, texto do WhatsApp e link de conferência ([spec](./docs/specs/aviso-assinado-v0.md)). Fica em `UNPLUGGED_MODULES`: precache e `CACHE_NAME` sem mudança. 9 testes em `tests/aviso.test.js`.

### Docs: spec do aviso assinado (proposta)
- [Aviso assinado v0](./docs/specs/aviso-assinado-v0.md), primeira peça da [síntese](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md):
  - o aviso é um tópico com campos de aviso, e só tem selo quando vem de dono ou moderação;
  - o texto vai pronto para o WhatsApp;
  - uma página leve, sem conta, confere a assinatura no celular de quem abre;
  - respostas assinadas no Vox e contagem das respostas coladas do WhatsApp, só com números.
- Proposta, **não implementada**: nada de código neste PR.
- As três perguntas abertas da spec respondidas: tipo desconhecido é guardado e repassado sem aparecer no feed; código de 4 caracteres basta; limite do link no WhatsApp fica para teste no piloto.

### Docs: a síntese troca a analogia "WeChat" pela ágora
- A [síntese — a praça de colunas](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) ganha a seção "A imagem: a ágora": mapa entre os edifícios da ágora de Atenas e as peças do Vox, o **sorteio** como peça candidata depois das seis, e onde a palavra não entra (marca pública, tela, romantização). O [doc dos nichos](./docs/brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md) aponta a troca.

### Docs: brainstorms da captação, do refino e dos nichos, e a síntese dos seis
- [Dez estratégias de captação](./docs/brainstorms/brainstorm-captacao-por-perfil-2026-11-10.md), [refino: da praça-cartório à rede de ação](./docs/brainstorms/brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md) e [nichos como colunas de um "WeChat democrático"](./docs/brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md), ligados ao [índice](./docs/README.md) e à [estratégia de 90 dias](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md). Só ideias; nada de código.
- [Síntese — a praça de colunas](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) consolida os seis brainstorms de 10/11 (vale a síntese quando divergirem), com pesquisa nova sobre o PL 5.746/2026 e o campo pró-democrático de centro e de direita. As seis peças comuns entram no ROADMAP como **candidatas**, sem caixa.

### Docs: brainstorms do terceiro lugar e do público
- [O Vox como "terceiro lugar"](./docs/brainstorms/brainstorm-terceiro-lugar-2026-11-10.md) e [para quem e com que gestos](./docs/brainstorms/brainstorm-publico-e-gestos-conhecidos-2026-11-10.md), ligados à [estratégia de 90 dias](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md) e ao índice. Ações candidatas; nada vira caixa no ROADMAP sem o mantenedor.

### Correção: o texto dizia Ed25519, a conta usa P-256 (SW v7.67)
- Três textos do app afirmavam que a chave da conta é **Ed25519**; a conta assina com **ECDSA P-256** (`key-lock.js`, `local-account.js`). Ed25519 só existe em `vox-identity.js`, ainda não plugado. O compositor e a criação de identidade deixam de citar algoritmo; a tela de status mostra "P-256 (ECDSA)".
- Mesma correção nas páginas de download e da revolução e em dois docs ([POSITIONING](./docs/product/POSITIONING.md), [infra participativa](./docs/strategy/infra-participativa-blindagem-crescimento.md)). Teste novo (`tests/rotulos-algoritmo-assinatura.test.js`) impede a volta do texto errado.

### Docs: rascunhos para o piloto G1 (estratégia de 90 dias)
- [Estratégia por ponto fraco](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md) registrada, com as decisões de 10/11: cunha do piloto é o modo assembleia para grupos de WhatsApp; segunda pessoa ainda não escolhida.
- Rascunhos prontos, **nada enviado e nenhuma issue criada**: [briefing do parecer do G1](./docs/legal/briefing-parecer-g1.md) (5 perguntas fechadas, REV-12/LAN-01), [roteiro da conversa](./docs/pilot/piloto-g1-roteiro-conversa.md) e [convite](./docs/pilot/piloto-g1-convite.md) do piloto (PIL-01), [10 primeiras tarefas e guia](./docs/process/primeiras-tarefas-contribuidor.md) (PM-41) e [segunda pessoa em etapas](./docs/process/segunda-pessoa-acesso-gradual.md) (LAN-30).

### Segurança: assinatura cobre campos aninhados (PM-85, SW v7.66)
- **Forma `sigv: 2`** (`client/js/sig-format.js`, [ADR-021 §2.6](./docs/adr/021-integridade-na-entrada-forma-assinada.md)): o texto assinado leva todas as chaves, ordenadas, em qualquer profundidade, então `photoTags` e `mediaRef` passam a ser cobertos. O `sigv` vai dentro do que é assinado; versão desconhecida não verifica.
- **Convivência:** o aparelho confere v1 e v2 desde já e passa a assinar v2 em **24/11/2026**, para quem ainda não atualizou não descartar os posts novos.
- **Marca de foto em post alheio v1** aparece como "não verificada".
- **Peso:** `sig-format.js` entrou no precache pago com a remoção de três funções que nada chamava (`renderPhotoTitleHtml`, `renderIgLikesLine`, `formatBlobSize`); o teto do PM-02 não mudou.

### Segurança: pipeline (PM-95)
- **CodeQL** (`.github/workflows/codeql.yml`): análise estática de actions, JS, Python e C# em todo PR, no `main` e toda segunda-feira (`security-extended`).
- **Dependabot** (`.github/dependabot.yml`): npm, imagem Docker do relay e GitHub Actions. O relay usa só a stdlib, então não há pip.
- **Actions fixadas por SHA de commit**, com a versão em comentário; o teste de inventário ([DEPENDENCIAS §5](./docs/DEPENDENCIAS.md)) quebra se aparecer action por tag.
- **Token do CI só lê** (`permissions: contents: read` no `ci.yml`).
- **Auditoria de segredos** (`scripts/secrets-audit.mjs`, com teste): pega chave PEM privada de qualquer tipo e JWK privada (o formato das chaves do Vox), em vez do grep de duas frases.
- **`.github/CODEOWNERS`** e ruleset do `main` com branch atualizada antes do merge (`strict`). Aprovação obrigatória fica para quando houver segunda pessoa revisora.

### Segurança: autorização no relay e no nó local (PM-94, SW v7.65)
- **Cofre com dono** ([ADR-027](./docs/adr/027-autorizacao-no-relay-dono-e-origem.md)): ao salvar, o aparelho manda uma prova derivada da Senha Soberana (`vault-crypto.deriveVaultOwnerToken`, outro sal, mesmo custo). O relay e o nó Windows guardam só o hash e passam a exigir a mesma prova para regravar ou revogar.
- **Caixa de DMs:** cada envelope leva uma chave de apagar cifrada para o destinatário (`del`). O relay só remove o envelope com ela (`X-Vox-Delete-Token`). Envelope de cliente antigo segue apagável até expirar.
- **Política de pedido** (`relay/request_guard.py`, `NodeRequestGuard` no nó Windows): `Host` de loopback (ou túnel liberado), escrita só das origens do app, `POST` só em `application/json` e limite de escritas por IP no relay Python. Novas variáveis: `VOX_RELAY_ALLOWED_HOSTS`, `VOX_RELAY_ALLOWED_ORIGINS`, `VOX_RELAY_WRITE_LIMIT_PER_MIN` ([kit do steward](./docs/operations/steward-relay-kit.md)).
- **Peso:** `server.py` não cresceu (731 → 722 linhas): o registro de seed saiu para `p2p_seeder.register_seed_request`; os cofres do nó Windows saíram para `VaultOwnerGuard.cs`.
- **Falta:** dono para memória central e relay cego (o conteúdo já é conferido por assinatura no aparelho).

### Segurança: trava das chaves depois do backup (PM-93 etapa 2, SW v7.64)
- **Depois do backup com a Senha Soberana** (cofre ou `.voxid` cifrado, senha de 12+ caracteres), assinatura e DM usam chaves **não exportáveis** no IndexedDB (`key-lock.js`, [ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md)). A cópia cifrada pelo aparelho sai do `localStorage`; a única cópia exportável é a cifrada pela senha.
- **Backup novo** pede a mesma senha. Restaurar pelo cofre ou pelo `.voxid` cifrado já volta travado.
- **Ordem segura:** a chave só troca depois de gravada e testada no IndexedDB e da cópia por senha salva. Se a chave travada some do aparelho, o app avisa e a conta volta pelo cofre com a senha.
- **Arquivo `.voxid`:** exportar e restaurar saíram de `local-account.js` (714 → 575 linhas) para `account-backup.js`.
- **Precache:** os 2 módulos novos foram pagos com a remoção do texto, das fotos e das respostas de demonstração por UF que ninguém lia (−20,6 KB); o teto do PM-02 desceu para 2.068.300 bytes.
- **Falta:** trocar a senha de uma conta travada; a carteira continua só cifrada pelo aparelho; sessão do Bluesky no PM-96.

### Segurança: chaves privadas cifradas no aparelho (PM-93 etapa 1, SW v7.63)
- **Chave do aparelho** ([ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md), `keystore.js`): uma chave AES-GCM-256 não exportável, guardada no IndexedDB, cifra as chaves privadas da conta, das contas extras, da DM e da carteira no `localStorage`. Elas só abrem na hora de assinar, abrir DM, publicar ou exportar backup.
- **Migração na abertura** (`key-at-rest.js`): o que estava em claro é cifrado; se o armazenamento mudar no meio, o item fica para a próxima abertura.
- **Sem troca de identidade:** se a chave do aparelho não abre, o app mostra erro em vez de gerar chave nova por cima. Navegador sem IndexedDB segue como antes.
- **Armazenamento persistente:** o app pede ao navegador para não apagar os dados sob pressão.
- **Falta (etapa 2):** assinatura com chave não exportável e trava depois do backup com a Senha Soberana.

### Segurança: cofre de recuperação v2 — só a Senha Soberana abre (PM-90, SW v7.62)
- **Cofre novo** ([ADR-025](./docs/adr/025-cofre-v2-so-a-senha-abre.md), `vault-crypto.js`): a chave sai só da Senha Soberana, por PBKDF2-SHA256 com 600 mil iterações e um sal aleatório por cofre, guardado no envelope. O endereço no servidor também sai da senha, pelo mesmo custo.
- **Login com Google ou Meta não abre mais o cofre.** Ele só enriquece o perfil e reencontra contas que já estão no aparelho. Em outro aparelho, a conta volta com a Senha Soberana, com o link ou QR de sincronização, ou com o arquivo de backup.
- **Cofres antigos** (`vault-legacy.js`):
  - **Na abertura:** o app revoga os cofres antigos que conhece e avisa uma vez para criar a Senha Soberana de novo.
  - **Cofre antigo de senha:** é cifrado de novo no formato v2 assim que abre.
  - **Servidores atualizados** (`relay/vault_store.py` e o nó Windows) só aceitam e servem o formato v2 ou a marca de revogado.
- **Link de sincronização:** leva o sal e as iterações do cofre v2; iterações fora da faixa são recusadas.
- **Relay:** o cofre saiu de `central_memory.py` para `relay/vault_store.py` (551 → 523 linhas).

### Segurança: servidor de memória por escolha e sincronização sem senha no link (PM-91, PM-92, SW v7.61)
- **O servidor de memória central só muda quando a pessoa aceita** (`memory-server-choice.js`).
  - **O que mudou:** link com `?memory=`, aviso de um aparelho conectado e endereço de túnel informado pelo servidor viram **sugestão**. Ao abrir, o app pergunta mostrando o domínio e explicando o que vai para lá.
  - **Recusa:** a sugestão recusada não volta.
  - **Endereço antigo:** o que uma versão anterior gravou sem perguntar vira sugestão, e o relay das DMs gravado junto com ele sai.
  - **Antes:** cada uma dessas fontes trocava o servidor sozinha, e tudo o que o aparelho gravava, inclusive o cofre, passava a ir para lá.
- **O link e o QR de sincronização não levam mais a Senha Soberana.**
  - **Na tela nova `#/sync`:** a senha é digitada no outro aparelho, e o cofre sai da barra de endereço e do histórico.
  - **Link antigo:** quem abre um link da versão anterior recebe o aviso para criar uma senha nova.
  - **Senha:** a Senha Soberana passa a exigir 12 caracteres.
- **Peso:** `images/cantina-gate.jpg` foi recomprimida (JPEG q85 progressivo, PSNR 39,6 dB, 143 → 119 KB) e pagou os dois módulos novos sem subir o teto do PM-02.

### Revisão de estado, arquitetura e DevSecOps (10/11, sem mudança no app)
- **[Revisão DevSecOps](./docs/audits/revisao-devsecops-2026-11-10.md):** a integridade do conteúdo na malha ficou sólida depois de #49 e PM-84…89, mas a custódia e a recuperação da identidade e a confiança no servidor de memória central têm **3 achados críticos e 3 altos**. Estão sob divulgação responsável e entram no ROADMAP como PM-90…PM-94; o PM-95 endurece o pipeline (CodeQL, Dependabot, actions por SHA, aprovação em arquivos de cripto).
- **Promessas corrigidas:** `SECURITY.md`, `IDENTITY.md` e ADR-014 diziam que o cofre era de "conhecimento zero" e que as chaves nunca ficavam em claro. Agora dizem o que o código faz hoje.
- THREAT-MODEL ganhou T20–T23.

### Correção: cartão de perfil não circula mais sem fim (PM-84, SW v7.60)
- **O aparelho só repassa o cartão de perfil que é novo para ele.** Antes, todo `PROFILE_CARD` que chegava pelo gossip era reaplicado e repassado, porque o "já visto" só olhava o banco de posts. Com duas abas da mesma origem ligadas aos mesmos pares, o cartão circulava sem fim: medimos 358 cartões/s e cerca de 1.100 requisições/s à memória central.
- **Como sabe que já viu:** guarda a versão de cada cartão (`editedAt` e assinatura), na memória da sessão e junto do cartão no diretório (`gossipCardAt`, `gossipCardSig`). Cartão de mesma versão ou mais velho não é reaplicado nem repassado. Mesma data com outra assinatura conta como outro cartão. O próprio cartão publicado já nasce marcado (`peers-gossip-profile.js`, `mesh-profile.js`).

### Correção: foto do composer volta a ir ao Arweave (PM-89, SW v7.59)
- **A mídia do post agora sobe:** com carteira conectada, o post com foto feito pelo composer ia ao Arweave sem a imagem e sem a tag `Media-Tx`. O código procurava a imagem num campo (`dataUrl`) que o blob separado do post não tem (ele usa `data`). O envio saiu do `inline-composer.js` para `topic-permaweb.js`, que lê o campo certo e tem teste.
- **Tipo da mídia certo:** `buildTags` punha sempre `Content-Type: application/json` e, para a mídia, acrescentava `image/webp` como segunda tag. Agora um `Content-Type` passado substitui o padrão; a foto vai com uma só tag, a do arquivo.
- **Peso do precache:** o módulo novo foi pago com a remoção de `buildUfDemoTopics` e das funções e textos que só ele usava (nada o chamava).

### Correção: foto chega também pela sincronização ao conectar (PM-88, SW v7.58)
- **A sincronização ao conectar (PM-80) leva a foto ao lado do post**, como a fofoca ao vivo (PM-87). Antes, quem recebia um post com foto por ela via o marcador "Mídia P2P". O blob sai do que está em memória ou, depois de recarregar, da mídia guardada no registro (`_media`); quem recebe só aceita o blob cujo conteúdo bate com `mediaHash`.
- **Teto de bytes:** até 128 KiB por foto e 2 MiB de fotos por conexão, gastos nos posts mais novos. Passou do teto, o post vai sem a foto (como antes). Aparelhos já sincronizados continuam trocando só o inventário.
- **Peso do precache:** pago com a remoção de código que nada chamava (`fetchIdentityLinkOnChain` e suas 2 consultas em `graphql.js`, `isInlineComposerActive`, `stripSignatureFields`, `buildSandboxedFrameSrc`, `JANONES_DEFAULT_TAGS`); saldo de +120 bytes, dentro do teto.

### Correção: foto enviada ao vivo chega a quem recebe (PM-87, SW v7.57)
- **Post com foto volta a bater com a assinatura:** o composer assinava o post com a imagem e mandava ao vivo a versão sem ela (`image: null` + `mediaRef`); quem recebia descartava. Agora a imagem sai **antes** da assinatura: o post assinado leva `mediaRef` e `mediaHash`, e a imagem fica no aparelho em `_media`, fora da forma assinada.
- **A imagem viaja ao lado do post:** a mensagem `GOSSIP` leva o blob junto (`blob`). Quem recebe só guarda, mostra e repassa o blob cujo conteúdo bate com `mediaHash`; sem blob, usa o que já tem guardado. `mediaHash` fica no primeiro nível porque a assinatura ainda não cobre chaves aninhadas (PM-85): trocar `mediaRef.hash` no caminho não troca a imagem.
- **Ainda sem imagem:** a sincronização ao conectar (PM-80) manda o post sem o blob; quem recebe por ela vê o marcador "Mídia P2P" até a imagem chegar pela memória central ou ao vivo. Resolvido no PM-88.
- **Peso do precache:** pago com a remoção de código que nada chamava (`readComposerImageFromFile` e `measureDataUrlImage` em `composer-media.js`; `formatGatewayHealthPill` e `exportGatewayDiagnostic` em `gateway-telemetry.js`); o precache ficou 370 bytes menor.

### Correção: memória central confere o que recebe (PM-86, SW v7.56)
- **O que volta da memória central passa pelas regras da malha** (`central-memory-hydrate.js`). Antes, posts e remoções do servidor eram gravados sem conferir nada; quem controlasse o servidor punha post em nome de outra pessoa, edição de comunidade, vínculo ou arquivamento falsos. Agora entra só o que tem assinatura válida de quem diz ser o autor e cujo autor não está bloqueado. Edição de comunidade segue a regra do PM-09. Post existente só é trocado pelo mesmo autor, e remoção só vale se for do autor do post.
- **Mídia fora da assinatura:** a imagem, o vídeo ou o áudio de um `mediaRef` que chega com o post fica no registro, fora da forma assinada (`_media`). Antes, era colada no post, que deixava de bater com a assinatura ao ser repassado. Blob cujo conteúdo não bate com o hash é descartado.
- **Peso do precache:** o módulo novo foi pago com a remoção de duas funções que nada chamava (`buildUfDemoListings` e `myInviteToken`) e com o corte de `attachMedia`, que ficou sem uso.
- **Defeito novo registrado (PM-87):** o post com foto publicado pelo app é assinado com a imagem e enviado ao vivo sem ela (`detachMedia` troca `image` por `mediaRef`), então quem recebe ao vivo descarta. A sincronização ao conectar e a memória central levam a forma assinada, com a imagem.

### Revisão de 10/11 (SW v7.55)
- **Aviso de privacidade corrigido:** o cartão do convite e a documentação diziam que o vínculo (PM-82) e o arquivamento por denúncia (PM-69) circulam "só na malha". Na verdade, todo item gravado no aparelho também vai à **memória central** (servidor de steward), embora nunca ao Arweave. O texto agora diz isso.
- **Defeitos registrados, ainda abertos:** memória central sem conferência de assinatura (PM-86), campos aninhados fora da assinatura (PM-85) e eco de cartão de perfil (PM-84). Estão no ROADMAP e no [modelo de ameaças](./docs/THREAT-MODEL.md) (T16–T19).

### Vínculo assinado (PM-82, SW v7.54)
- **Convite que vira vínculo:** o seu link "Convide amigos" (e o QR do seu perfil) leva um token. Quem abre vê "Fulano te convidou" e aceita. O app de quem convidou confirma sozinho ao receber o aceite, e o vínculo passa a ter a assinatura das duas pessoas. Para uma conta nova, quem convidou vira **padrinho**; é a base do moderador natural (PM-83, [spec](./docs/specs/moderador-natural-v0.md)).
- Cada convite aceita até 10 pessoas em 30 dias; depois, o link troca sozinho. O vínculo circula entre os aparelhos e pela memória central (servidor de steward), não vai ao Arweave, e o aceite avisa isso antes do botão.
- **Precache mais enxuto:** o `favicon.png` de 64 px saiu do que o app guarda no aparelho (a página só usa os de 16 e 32 px).

### Canal: comunidade em que só a moderação publica (PM-81, SW v7.53)
- **Mural de avisos sem objeto novo:** dono ou moderação transforma a comunidade em **canal** com um botão na página dela. A partir daí, só a moderação publica posts e todo mundo continua comentando. "Abrir para todos publicarem" desfaz.
- **A regra vale em cada aparelho:** post de quem não modera some da lista e o link direto mostra "Publicação fora do canal". O autor e a moderação ainda veem o post, com o selo "📣 Fora do canal". Quem não modera recebe um aviso ao tentar publicar, e o botão "Novo post" some. Não há exceção para posts antigos, porque a data é escrita por quem publica; voltar a "aberta" mostra tudo de novo ([spec](./docs/specs/canal-comunidade-v0.md)).
- **Logo mais leve:** a marca do topo (exibida em 28 px) era um PNG de 256 px; agora tem 128 px, 17 KB a menos no precache.

### Correção: post guardado volta a bater com a assinatura (SW v7.51)
- **Sincronização entre aparelhos destravada:** ao gravar um post, o app misturava cerca de 35 campos padrão no registro. O post guardado deixava de bater com a assinatura e quem recebia descartava. Na prática, só o que circulava ao vivo chegava a outro aparelho; o que vinha da sincronização ao conectar (PM-80), do envio completo e da memória central era jogado fora. O defeito existia desde o primeiro commit P2P.
- Agora o aparelho guarda o post exatamente como foi assinado, e os padrões só entram na hora de mostrar. Posts gravados antes da correção são recuperados no melhor esforço. Remoções guardam todos os campos assinados.

### Sincronização por inventário ao conectar (PM-80, SW v7.48)
- **Menos dados a cada conexão:** em vez de mandar às cegas até 128 posts, 64 remoções e 256 cartões de perfil, cada aparelho manda primeiro um inventário curto (hash do id e versão) e só pede o que falta. Com dois aparelhos já sincronizados, cai de ≈ 157 KB para ≈ 7 KB por sentido, o que poupa o teto de 5 MB do 4G. Aparelho com versão antiga do app recebe o envio completo depois de 8 s.
- A sincronização saiu do `peers.js` para `peer-sync.js` ([spec](./docs/specs/sync-inventario-v0.md)); é ali que a mochila de DMs (PM-79) vai entrar.
- **Ícone mais leve:** o `icon.svg` embutia a mesma imagem duas vezes (`href` e `xlink:href`); ficou só a primeira, 18 KB a menos no que o app guarda no aparelho. O teto de peso do precache desceu junto.

### Caixa de saída das DMs (PM-78, SW v7.47)
- **Mensagem que não saiu não se perde mais:** sem conexão direta e sem relay, a DM (e a denúncia do PM-69) fica na caixa de saída do aparelho. Com o Vox aberto, o app tenta de novo sozinho: a cada 20 s, ao voltar a internet e ao abrir, e no relay com espera crescente (1 a 30 min). Antes, nada reenviava, embora o aviso dissesse que a mensagem seria entregue.
- **No fio:** "⏳ Aguardando" enquanto espera; depois de 7 dias, ou se a caixa encher (100 mensagens ou 2 MB), "⚠ Não entregue". O aviso e a tela da denúncia dizem que o reenvio só acontece com o app aberto.
- **Spec da mochila de DMs** ([mochila-dm-v0.md](./docs/specs/mochila-dm-v0.md)): o próximo passo (PM-79) é outros aparelhos conectados levarem envelopes cegos até quem não estava online.

### Uma denúncia arquiva até a revisão (PM-69, SW v7.46)
- **Denúncia chega à moderação sozinha:** ao denunciar um post de comunidade, o app manda à moderação, por mensagem cifrada, a denúncia **assinada pela conta** de quem denunciou (a identidade não vai para a malha). Se não der para entregar, o app diz isso e oferece mandar pela conversa.
- **O aparelho de quem modera arquiva para todos** ao receber, se quem denunciou é membro, tem menos de 3 denúncias pendentes e não teve as 3 últimas rejeitadas, e se o post não é de alguém da moderação. Senão, a denúncia fica para decisão manual, com o motivo. O arquivamento circula pela malha e pela memória central (servidor de steward); não vai ao Arweave.
- **Autor e moderação veem "⏳ Em revisão"** com o prazo de 48 h; os outros não veem o post, e o link direto mostra "Publicação arquivada". Quem modera decide no tópico: **Volta para todos** ou **Mantém arquivado**.

### Mídia v2 retrô e medição (PM-70, sem mudança no app)
- **Carrossel na spec:** até 4 fotos, 4 áudios (4 min, cada um com imagem opcional) ou 4 clipes de vídeo (40 s), do mesmo tipo, com playback sem emenda (PM-77).
- **Spec revista para estética retrô** ([mídia v2](./docs/specs/midia-v2.md)): imagem AVIF **q70 em 960×540/540×960**, áudio **Opus 32 kbps**, vídeo **até 480p a 24 fps** (H.264 Q28), sempre em pedaços de até 99.999 bytes.
- Bancada `tools/media-bench/` (só desenvolvimento) e [medição no desktop](./docs/research/medicao-midia-v2-pm70-2026-11.md) com 29 imagens e 2 vídeos reais: AVIF 540p q70 coube em todas sem degrau (mediana de 43 KiB) e teve qualidade maior que o WebP 0,78 em todas; vídeo 480p de 10 s entre 0,5 e 1,0 MiB; Opus 32 kbps = 237 KiB/min. Achados para o PM-71: codificador AVIF de 3,4 MB, CSP com `'wasm-unsafe-eval'` e `wasm-feature-detect` quebrado no Chrome 152. `@jsquash/avif` 2.1.1 entra só como dependência de desenvolvimento.

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
