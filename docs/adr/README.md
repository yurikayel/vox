# ADRs — Decisões arquiteturais do Vox

> **Status:** canônico (índice) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10
> Nova decisão = novo arquivo `NNN-slug.md` com **Status**, **Contexto**, **Decisão**, **Consequências**. Mudança de protocolo de rede: RFC em [../rfc/](../rfc/README.md).

| ADR | Título | Status |
|---|---|---|
| [001](./001-contribution-attestation-export.md) | Atestação exportável de contribuição P2P | proposed |
| [002](./002-oauth-profile-enrich-client.md) | Enriquecimento de perfil via OAuth (client-only) | accepted (emenda 1: relay de troca OAuth) |
| [003](./003-profile-card-gossip.md) | Cartão de perfil na malha (PROFILE_CARD gossip, opt-in) | accepted |
| [004](./004-gateway-honest-fallback.md) | Fallback de gateway — pill honesta (Leitura reserva) | accepted |
| [005](./005-collective-profile-m-of-n.md) | Perfil coletivo M-de-N (tese T02) | proposed (spec + lab) |
| [006](./006-p2p-profile-identity-gossip-hardening.md) | Hardening de identidade P2P, WebRTC e cache de respostas | accepted (Deno pausado desde 2026-11) |
| [007](./007-zero-complexity-monolith-decomposition.md) | Decomposição de monólitos e dívida de complexidade zero | accepted |
| [008](./008-vox-populi-community-node-architecture.md) | Vox Populi — nó comunitário autônomo de baixo consumo | accepted |
| [009](./009-multi-gateway-graphql-corroboration.md) | Corroboração multi-gateway GraphQL sem quorum bloqueante | proposed |
| [010](./010-vox-contribution-engine-execute-e-ajude.md) | Contribution Engine "Execute e Ajude" | proposed |
| [011](./011-taxonomia-tripartite-produtos-vox.md) | Taxonomia dual: Vox (cliente) e Vox Populi (nó) | accepted |
| [012](./012-soberania-digital-cintura-fina-cartuchos-webxdc.md) | Cintura fina criptográfica e cartuchos Webxdc | accepted (runtime ainda não plugado na UI) |
| [013](./013-sistema-voxels-e-conquistas-civicas.md) | Voxels e conquistas cívicas verificáveis | accepted |
| [014](./014-zero-knowledge-vault-recuperacao-soberana.md) | Cofre cifrado e restauração cross-device | superseded pelo 025 |
| [015](./015-licenciamento-agplv3-e-governanca-de-bem-comum.md) | Licença AGPL-3.0-or-later e governança de bem comum | accepted |
| [016](./016-design-system-sovereign-agora-e-democracia-direta.md) | Design system Sovereign Agora e democracia direta | accepted (rev. 2026-11-06) |
| [017](./017-consolidacao-roadmap-unico.md) | Consolidação do planejamento — ROADMAP único | accepted |
| [018](./018-selo-govbr-via-parceiro-publico.md) | Selo gov.br opcional via parceiro público, desacoplado do login | proposed |
| [019](./019-esquecer-por-padrao-e-memoria-civica.md) | Esquecer por padrão; memória cívica por três caminhos | accepted (não implementado) |
| [020](./020-postura-de-operacao-do-piloto-g1.md) | Postura de operação do piloto G1: operador, voluntários em baixo risco, 18+, uma denúncia arquiva | accepted (18+ implementado) |
| [021](./021-integridade-na-entrada-forma-assinada.md) | Integridade na entrada: forma assinada guardada, tudo que entra é conferido | accepted (implementado; §2.6 aberta: v1 aninhado sem proteção; `sigv: 2` em PM-85) |
| [022](./022-memoria-central-por-consentimento.md) | Memória central: servidor escolhido pela pessoa, nunca fonte de verdade | accepted (implementado) |
| [023](./023-moderacao-em-camadas-e-moderador-natural.md) | Moderação em camadas: moderador natural assimétrico e vínculo assinado | accepted (vínculo implementado; moderador natural em PM-83; emenda 1 aceita) |
| [024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md) | Divulgação responsável e honestidade sobre segurança (institucional) | accepted |
| [025](./025-cofre-v2-so-a-senha-abre.md) | Cofre de recuperação v2: só a Senha Soberana abre | accepted (implementado, SW v7.62) |
| [026](./026-chaves-em-repouso-trava-depois-do-backup.md) | Chaves privadas em repouso: chave do aparelho e trava depois do backup | accepted (implementado: etapa 1 no SW v7.63, etapa 2 no SW v7.64) |
| [027](./027-autorizacao-no-relay-dono-e-origem.md) | Autorização no relay: prova do dono, chave de apagar e política de origem | accepted (implementado, SW v7.65) |
| [028](./028-ponte-activitypub-via-bluesky.md) | Ponte com o Fediverso (ActivityPub) via Bluesky, sem servidor próprio | accepted (UI de orientação pendente) |
| [029](./029-midia-em-duas-camadas-360p-720p.md) | Mídia em duas camadas (360p e 720p), sem teto de 100 KB por item | accepted (não implementado; medição pendente) |
| [030](./030-trazer-do-bluesky-pesos.md) | Trazer do Bluesky (PESOS): arquivo assinado da própria voz, sem servidor | accepted (não implementado) |
| [031](./031-passkey-abre-a-mesma-conta.md) | Passkey abre a mesma conta em outro aparelho (WebAuthn PRF), sem servidor de login | accepted (não implementado; spike de suporte ao PRF antes de liberar) |
| [032](./032-login-perene-a-conta-nasce-com-saida.md) | Login perene: a conta nasce com saída (frase, guardiões, Senha); Google e Meta saem da entrada | accepted (passos 1 e 2, guardiões 3a/3b e emenda 1 — entrada com e-mail, senha e kit no e-mail — implementados)
| [033](./033-ia-so-no-rpg-local-primeiro.md) | IA só no RPG, primeiro no próprio aparelho; serviço externo só com a chave da mesa e o consentimento de todos | accepted (nenhuma IA implementada; o AI Social Dungeon é demonstração sem IA) |
| [034](./034-raiz-e-subchaves-por-aparelho.md) | Raiz e subchaves por aparelho: a chave de hoje vira a raiz (o `vx_…` não muda); perder o celular é revogar uma subchave | aceito como direção (RFC 0002 e LAN-18 antes do código) |
| [035](./035-camadas-e-contextos.md) | Camadas e contextos no cliente: importar só para baixo (catraca no CI), uma porta de entrada por assunto | accepted (`audit:layers` no CI; `vault/` e `identity/` feitos) |
| [036](./036-agilidade-criptografica-pos-quantica.md) | Agilidade criptográfica e transição pós-quântica: todo formato diz o seu algoritmo; DM híbrida (ECDH + ML-KEM) primeiro; assinatura por pré-compromisso ML-DSA até o "dia Q" | aceito como direção (RFC/LAN-18 antes do código; assinatura depende da RFC 0002) |
| [037](./037-cofre-na-malha.md) | Cofre na malha: cópias do cofre cifrado com até 7 laços mútuos, pedido por caixa cega, espera de 24 h com veto da dona e tela única de volta | accepted (SW v7.141) |
| [038](./038-subrede-malha-e-manifesto.md) | Subrede: a comunidade é um território assinado na malha (regra do PM-09) mais um manifesto que só sugere tema, infraestrutura e, na v2, cartuchos; fork é `communityId` novo | proposed (só documentação) |
| [039](./039-rust-por-fases.md) | Rust por fases: mais Rust com o tempo, onde ganha em segurança (cripto que o WebCrypto não tem, formatos tipados, relay, nó nativo); a chave privada no navegador continua no WebCrypto | proposed (só documentação) |
| [040](./040-fairplay-rolagem-verificavel-na-mesa.md) | Fairplay: rolagem verificável na mesa em três fases (compromisso, revelação, recuperação por quórum), selo recalculado em cada aparelho, partes cifradas com chave efêmera da sessão; o Mestre-hub pode censurar, não forjar | proposed (só documentação) |

**Registro de uma página** com as decisões institucionais e de arquitetura em vigor, o estado real de cada uma e o que ainda está em aberto: [DECISOES.md](../DECISOES.md).

Convenção: título no arquivo como `# ADR-NNN: …` (os ADRs 014 e 015 usam `ADR 0NN`, por histórico).
