# ADRs — Decisões arquiteturais do Vox

> **Status:** canônico (índice) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10
> Nova decisão = novo arquivo `NNN-slug.md` com **Status**, **Contexto**, **Decisão**, **Consequências**. Mudança de protocolo de rede: RFC em [../rfc/](../rfc/README.md).

| ADR | Título | Status |
|---|---|---|
| [001](./001-contribution-attestation-export.md) | Atestação exportável de contribuição P2P | proposed |
| [002](./002-oauth-profile-enrich-client.md) | Enriquecimento de perfil via OAuth (client-only) | accepted |
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
| [021](./021-integridade-na-entrada-forma-assinada.md) | Integridade na entrada: forma assinada guardada, tudo que entra é conferido | accepted (implementado; `sigv: 2` em PM-85) |
| [022](./022-memoria-central-por-consentimento.md) | Memória central: servidor escolhido pela pessoa, nunca fonte de verdade | accepted (implementado) |
| [023](./023-moderacao-em-camadas-e-moderador-natural.md) | Moderação em camadas: moderador natural assimétrico e vínculo assinado | accepted (vínculo implementado; moderador natural em PM-83) |
| [024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md) | Divulgação responsável e honestidade sobre segurança (institucional) | accepted |
| [025](./025-cofre-v2-so-a-senha-abre.md) | Cofre de recuperação v2: só a Senha Soberana abre | accepted (implementado, SW v7.62) |
| [026](./026-chaves-em-repouso-trava-depois-do-backup.md) | Chaves privadas em repouso: chave do aparelho e trava depois do backup | accepted (implementado: etapa 1 no SW v7.63, etapa 2 no SW v7.64) |
| [027](./027-autorizacao-no-relay-dono-e-origem.md) | Autorização no relay: prova do dono, chave de apagar e política de origem | accepted (implementado, SW v7.65) |
| [028](./028-ponte-activitypub-via-bluesky.md) | Ponte com o Fediverso (ActivityPub) via Bluesky, sem servidor próprio | proposed |

**Registro de uma página** com as decisões institucionais e de arquitetura em vigor, o estado real de cada uma e o que ainda está em aberto: [DECISOES.md](../DECISOES.md).

Convenção: título no arquivo como `# ADR-NNN: …` (os ADRs 014 e 015 usam `ADR 0NN`, por histórico).
