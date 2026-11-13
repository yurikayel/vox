# Decisões do Vox — registro único

> **Status:** canônico (registro) · **Owner:** mantenedor · **Revisado:** 2026-11-13
> Uma linha por decisão em vigor, com a fonte que manda. **Institucional** (I) é o que o projeto promete às pessoas e como ele se governa. **Arquitetura** (A) é como o software cumpre isso. O detalhe mora no ADR ou no documento citado. Aqui fica só a decisão e o estado real.

**Como usar.** Antes de propor uma mudança, procure aqui se ela contraria uma decisão. Se contrariar, escreva um ADR novo que **substitua** o antigo, nunca uma exceção silenciosa. Toda decisão nova entra nesta tabela no mesmo PR do ADR.

Legenda de estado:
- **em vigor**: implementado e valendo;
- **parcial**: vale como regra, mas o código ainda não cobre tudo;
- **em revisão**: a decisão está de pé, mas a implementação atual não cumpre a promessa;
- **proposta**: ainda não aceita.

## 1. Institucionais — o que o Vox promete e como se governa

| ID | Decisão | Estado | Fonte |
|---|---|---|---|
| I-01 | O Vox é bem comum: licença AGPL-3.0-or-later. Quem roda uma versão modificada como serviço publica o código. | em vigor | [ADR-015](./adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md) |
| I-02 | O Vox **nunca custodia dinheiro** e não é instituição de pagamento. Pix e apoio vão direto de pessoa a pessoa. | em vigor | [COMPLIANCE-BR](./legal/COMPLIANCE-BR.md) |
| I-03 | Nada de CPF, documento ou dado civil para entrar. Selo gov.br, se vier, é opcional, emitido por parceiro público, e o CPF nunca chega ao Vox. | em vigor (selo: proposta) | [COMPLIANCE-BR §Anti-CPF](./legal/COMPLIANCE-BR.md) · [ADR-018](./adr/018-selo-govbr-via-parceiro-publico.md) |
| I-04 | Sem telemetria que liga para casa. Contadores ficam no aparelho, e o diagnóstico só sai se a pessoa exportar. | em vigor | [ADR-004](./adr/004-gateway-honest-fallback.md) · [COMPLIANCE-BR](./legal/COMPLIANCE-BR.md) |
| I-05 | **Esquecer por padrão; rede de seguidores como base.** **Por enquanto nada deve ser salvo no Arweave:** tudo circula e se preserva pela rede de seguidores (cada aparelho replica o conteúdo de quem segue). O Arweave fica reservado para recursos específicos futuros (leitura/cartório/consenso). | parcial (`arweaveUpload: false` ativo no cliente; `PM-74` completo pendente) | [ADR-019](./adr/019-esquecer-por-padrao-e-memoria-civica.md) · [replicação por grau](./specs/replicacao-por-grau-v0.md) |
| I-06 | **Esconder não é apagar.** Moderação é pública e assinada, e quem quiser pode ver o que foi escondido. | em vigor | [GOVERNANCE](../GOVERNANCE.md) |
| I-07 | Piloto G1: o mantenedor é o operador responsável. Voluntários fazem só trabalho de baixo risco. Só 18+. Uma denúncia arquiva o post até a revisão. | em vigor | [ADR-020](./adr/020-postura-de-operacao-do-piloto-g1.md) |
| I-08 | Moderação em camadas: aparelho → moderador natural (padrinho, com peso assimétrico) → comunidade → operador. Quem denuncia não é revelado ao padrinho do denunciado. | em laboratório (vínculo assinado: em vigor; moderador natural: PM-83, flag `vox.lab.moderador`; emenda 1 aceita: mediação pelos padrinhos, teto de 30 afilhados, reversões por comunidade) | [ADR-023](./adr/023-moderacao-em-camadas-e-moderador-natural.md) |
| I-09 | Um só plano vivo: o [ROADMAP](./ROADMAP.md). Ideia nova entra como brainstorm, sem caixa `[ ]`. | em vigor | [ADR-017](./adr/017-consolidacao-roadmap-unico.md) |
| I-10 | Falha grave aberta não se detalha em público. Afirmação de segurança precisa de prova no código e no teste. O aviso ao usuário vem antes da correção. | em vigor | [ADR-024](./adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md) · [SECURITY](../SECURITY.md) |
| I-11 | Texto honesto: a interface e os documentos não prometem o que o código não faz. Contribuição sob DCO. | em vigor | [CONTRIBUTORS](../CONTRIBUTORS.md) · [auditoria de copy](./audits/honest-copy-audit-2026-10-23.md) |
| I-12 | Merge em `main` só por PR, com os checks obrigatórios verdes e dentro dos limites de complexidade v3.2. | em vigor (0 aprovações exigidas: ver [pontos fracos](./brainstorms/brainstorm-5-pontos-fracos-2026-11-10.md), ponto 5) | [HARDENING](./HARDENING.md) · [qualidade-e-evidencia](./process/qualidade-e-evidencia.md) |

## 2. Arquitetura — como o software cumpre isso

| ID | Decisão | Estado | Fonte |
|---|---|---|---|
| A-01 | **Local-first, sem servidor que diga o que é verdade.** O aparelho guarda e decide. O PWA é JavaScript puro, sem build. | em vigor | [ARCHITECTURE (cliente)](./ARCHITECTURE.md) · [ARCHITECTURE (protocolo)](../ARCHITECTURE.md) |
| A-02 | Identidade = par de chaves ECDSA P-256 criado no aparelho. Todo post, cartão e ação vai assinado. A carteira Arweave (RSA) fica restrita a eventuais recursos futuros específicos no Arweave (nada é salvo lá por enquanto). | em vigor | [IDENTITY](./IDENTITY.md) · [ADR-006](./adr/006-p2p-profile-identity-gossip-hardening.md) |
| A-03 | **Integridade na entrada.** O banco guarda a forma assinada. Tudo o que entra, por qualquer caminho, é conferido. Mídia fica fora da assinatura, presa por `mediaHash`. Só se repassa o que é novo. | em vigor | [ADR-021](./adr/021-integridade-na-entrada-forma-assinada.md) |
| A-04 | A assinatura cobre o post inteiro, em qualquer profundidade (`sigv: 2`). A forma v1 (só campos de topo) segue aceita; o aparelho assina v2 a partir de 24/11/2026, depois de duas semanas de convivência. | em vigor (SW v7.66, PM-85) | [ADR-021 §2.6](./adr/021-integridade-na-entrada-forma-assinada.md) · [ROADMAP](./ROADMAP.md) |
| A-05 | **Memória central é cópia escolhida pela pessoa**, nunca fonte de verdade. Link e par só sugerem. Só `https`, exceto o próprio aparelho. | em vigor | [ADR-022](./adr/022-memoria-central-por-consentimento.md) |
| A-06 | Recuperação da conta por cofre cifrado **só com a Senha Soberana** (PBKDF2 600 mil, sal aleatório). Login social não é chave. Cofres v1 revogados. | em vigor (SW v7.62) | [ADR-025](./adr/025-cofre-v2-so-a-senha-abre.md) (substitui o [ADR-014](./adr/014-zero-knowledge-vault-recuperacao-soberana.md)) |
| A-07 | Malha P2P por WebRTC com gossip assinado. A sinalização vem do nó local, do Render e de outros caminhos de reserva. Sincronização ao conectar por inventário. | em vigor | [ARCHITECTURE §3](../ARCHITECTURE.md) · [sync-inventario-v0](./specs/sync-inventario-v0.md) · [INFRA-CUSTOS](./INFRA-CUSTOS.md) |
| A-08 | **Sem gravação no Arweave por enquanto:** nada deve ser salvo usando Arweave no momento; o protocolo permanece só para leitura pública existente/recursos futuros específicos (cartório cívico, memória consensual), com fallback honesto entre gateways. Preservação ativa via **rede de seguidores** (malha P2P/sync + `PM-74`). | em vigor (`arweaveUpload: false` ativo no cliente; `REV-07`) | [ADR-004](./adr/004-gateway-honest-fallback.md) · [ADR-019](./adr/019-esquecer-por-padrao-e-memoria-civica.md) · [ADR-009](./adr/009-multi-gateway-graphql-corroboration.md) (proposta) |
| A-09 | DM com cifra de ponta a ponta (ECDH P-256 + AES-GCM), entregue pela malha. Caixa de saída no aparelho. No G1, só entre quem está online. | parcial (repasse cego: não implementado) | [ARCHITECTURE §4](../ARCHITECTURE.md) · [mochila-dm-v0](./specs/mochila-dm-v0.md) |
| A-10 | Cartão de perfil na malha é opcional e assinado. A versão já vista não é repassada de novo. | em vigor | [ADR-003](./adr/003-profile-card-gossip.md) · [profile-card-gossip-v0](./specs/profile-card-gossip-v0.md) |
| A-11 | Nó comunitário (Vox Populi) separado do cliente (Vox): o nó serve, o cliente decide. | em vigor | [ADR-008](./adr/008-vox-populi-community-node-architecture.md) · [ADR-011](./adr/011-taxonomia-tripartite-produtos-vox.md) |
| A-12 | Extensões em cartuchos webxdc, atrás de uma "cintura fina" criptográfica. | parcial (runtime não plugado na UI) | [ADR-012](./adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md) |
| A-13 | Código pequeno por regra: função de no máximo 30 LLOC, complexidade de no máximo 15, arquivo grande não cresce. | em vigor | [ADR-007](./adr/007-zero-complexity-monolith-decomposition.md) · [HARDENING](./HARDENING.md) |
| A-14 | Design system Sovereign Agora e Voxels (conquistas verificáveis). | em vigor | [ADR-016](./adr/016-design-system-sovereign-agora-e-democracia-direta.md) · [ADR-013](./adr/013-sistema-voxels-e-conquistas-civicas.md) |
| A-15 | **Relay sem conta, com dono por prova.** Cofre regrava só com a prova derivada da Senha Soberana; envelope de DM sai só com a chave de apagar do destinatário. Escrita só das origens do app, `application/json`, `Host` conferido e limite por IP. | em vigor (SW v7.65) | [ADR-027](./adr/027-autorizacao-no-relay-dono-e-origem.md) |
| A-16 | **Fediverso pela pessoa, sem servidor.** O Vox não roda ActivityPub; quem quiser ser seguido no Mastodon ou no Threads liga o Bridgy Fed na própria conta do Bluesky. Aviso de núcleo não atravessa automaticamente. | aceito (UI de orientação pendente) | [ADR-028](./adr/028-ponte-activitypub-via-bluesky.md) |
| A-17 | **Mídia em duas camadas.** Quem **segue** o autor recebe a Full (720p, q80, Opus 96 kbps) sem fazer nada, e a guarda e serve a outros seguidores; quem não segue recebe só a Half (360p, q60, 48 kbps). Nas configurações, dá para preferir a Half. Vídeo a 30 fps, sem teto de 100 KB por item, Arweave só como cartório. A camada só economiza banda e espaço: não é controle de acesso. | aceito (não implementado; medição pendente) | [ADR-029](./adr/029-midia-em-duas-camadas-360p-720p.md) |
| A-18 | **Trazer do Bluesky, pela pessoa.** Ela traz os próprios posts de raiz do Bluesky (conta vinculada por login) por uma fila com confirmação, assinados pela chave dela e com o original dentro da assinatura. Destino padrão no perfil; comunidade só por escolha. Apagar na origem segue a preferência nas configurações. A preservação vem das cópias de quem segue; Arweave só cartório. | aceito (não implementado) | [ADR-030](./adr/030-trazer-do-bluesky-pesos.md) |
| A-19 | **Passkey abre a mesma conta.** Passkey com PRF vira um segundo envelope do cofre, tudo no aparelho e sem servidor de login. A Senha Soberana continua sendo a chave universal (link e QR, troca de ecossistema). Não prova pessoa única; presa ao domínio. | aceito (não implementado; spike do PRF antes de liberar) | [ADR-031](./adr/031-passkey-abre-a-mesma-conta.md) |
| A-20 | **Login perene: a conta nasce com saída.** Google e Meta saem da entrada (só importam nome e foto em Perfil). A conta fica provisória até ter uma saída soberana: frase de recuperação ou cartão no papel, guardiões (Shamir pela malha) ou Senha Soberana. Passkey e segundo aparelho são atalhos, não saída. | parcial (passo 1: entrada sem Google/Meta e faixa de conta provisória; frase e guardiões a fazer) | [ADR-032](./adr/032-login-perene-a-conta-nasce-com-saida.md) |

## 3. Em aberto — decisões que ainda precisam ser tomadas

| Tema | O que falta decidir | Onde |
|---|---|---|
| Custódia da chave | Em vigor (SW v7.64): chaves cifradas pelo aparelho; depois do backup com a Senha Soberana, identidade e DM só saem pela cópia cifrada com a senha | PM-93, [ADR-026](./adr/026-chaves-em-repouso-trava-depois-do-backup.md) |
| Cadeia de suprimentos | Em vigor (PM-95): CodeQL, Dependabot, actions por SHA, ruleset `strict`. Falta decidir quando a revisão vira obrigatória (CODEOWNERS já existe) e se o CodeQL vira check obrigatório | PM-95 · [DEPENDENCIAS](./DEPENDENCIAS.md) |
| Login perene | Aceito no ADR-032, passo 1 no ar; falta escolher a lista de palavras e a derivação P-256 a partir da semente, e implementar na ordem do §5 | [ADR-032](./adr/032-login-perene-a-conta-nasce-com-saida.md) |
| Mesma conta sem senha | Aceito no ADR-031; falta o spike de suporte ao PRF nos aparelhos do piloto e o domínio definitivo | [ADR-031](./adr/031-passkey-abre-a-mesma-conta.md) |
| Formato de assinatura | Quando parar de aceitar v1 (posts antigos assinados só nos campos de topo) | PM-85 · [ADR-021 §2.6](./adr/021-integridade-na-entrada-forma-assinada.md) |
| Quantizador do vídeo | Quantizador H.264 equivalente a q60 (Half) e q80 (Full); medir | [ADR-029 §4](./adr/029-midia-em-duas-camadas-360p-720p.md#4-em-aberto) |
| Propostas antigas | Atestação (001), perfil coletivo (005), corroboração multi-gateway (009) e Contribution Engine (010): aceitar, adiar ou arquivar | [índice de ADRs](./adr/README.md) |
