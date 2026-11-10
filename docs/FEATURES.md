# Catálogo de funcionalidades — Vox

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08
> Fonte: rotas de `client/js/app/route-parse.js`, imports reais em `client/js/**` e `tests/*.test.js`. Ao plugar ou remover um módulo, atualize a linha correspondente aqui.

**Legenda de status**

| Status | Significado |
|---|---|
| **no ar** | Carregado pela UI e usável no PWA publicado. |
| **depende de config** | Código no ar, mas só funciona com app registrado, relay ou secret configurado. |
| **lab** | Rota experimental (`#/labs/*`) — não é produção. |
| **escrito, não plugado** | Módulo e testes existem; **nenhum ponto de entrada carrega**. Desde o PM-04 fica em `UNPLUGGED_MODULES` no `sw.js`, **fora do precache**; o teste `shell-reachability` mantém a lista honesta. |
| **stub** | Esqueleto ou lista de configuração, sem a lógica principal. |
| **demo** | Perfis fictícios de `mock.js` que só aparecem com o **modo demonstração** ligado em `#/settings/network`, sempre com a faixa "Modo demonstração" (LAN-10). Fora dele, falha de rede mostra "sem conexão", nunca conteúdo de exemplo. |

## 1. Social e feed

| Funcionalidade | Rota | Módulos principais | Status | Testes |
|---|---|---|---|---|
| Feed Social / Cívico | `#/`, `#/?feed=civic` | `app/screens-home.js`, `render/feed.js`, `civic-post.js` | no ar | `civic-post`, `render`, `feed-*` |
| Postar (Social ou Cívico, em etapas) | botão Postar | `app/compose-stepper.js`, `render/compose-steps.js`, `inline-composer.js`, `composer-media.js` | no ar | `compose-steps`, `stepped-flows`, `composer-*` |
| Aviso de permanência ("gravar no Arweave" × "só na malha") | 1º post com carteira | `permanence-notice.js` | no ar (LAN-11) | `permanence-notice` |
| Foto, áudio e vídeo lo-fi | composer | `media-lofi.js`, `media-blob.js`, `upload.js`, `ans104.js` | no ar (itens ≤105 KiB grátis **até a cota do Turbo**, ~10 MiB por carteira/IP; acima disso, crédito ou L1 pago) | `media-*`, `upload`, `verify-data-item` |
| Republicar com citação | post ⋯ | `repost.js`, `repost-draft.js`, `render/repost-cite.js` | no ar | `repost` |
| Marcação manual em fotos | foto | `photo-tags.js`, `app/photo-tag-*.js`, `render/photo-tag-pins.js` | no ar | `photo-tags`, `photo-aspect-lightbox-tagging` |
| Notas de perfil 24h | perfil | `profile-note.js` | no ar | `profile-note` |
| Hashtags e feed por tag (+ Pol.is-lite) | `#/tag/:slug` | `hashtags.js`, `render/tag-polis.js` | no ar. O agrupamento de opiniões de `polis.js` **não está plugado** (só o `bridging-rank.js`, também órfão, o importa) | `hashtags`, `polis` |
| Feed do Bluesky (leitura) | feed | `bsky-feed.js` | no ar | `bsky-feed` |
| Modo eleitoral (sem "Sugestões cívicas") | feed | `electoral-period.js`, `render/feed.js` | no ar: automático de 16/08 a 31/10 de ano par, ou forçado por `electoralMode` em `flags.json` (REV-24) | `electoral-period` |
| Open Frames (mini-apps no feed) | feed, `#/labs/frames` | `frames.js`, `open-frames-host.js` | no ar (host iframe em lab) | `frames`, `open-frames-host` |
| Cartuchos Webxdc + CRDT | — | `webxdc-crdt.js`, `webxdc-host.js`, `webxdc-loader.js` | **escrito, não plugado** | `webxdc-*` |
| Depoimentos | — | `testimonials.js` | **escrito, não plugado** | `testimonials` |

## 2. Comunidades, governança e economia local

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Comunidades estilo Orkut (fórum, tópicos) | `#/communities`, `#/c/:id`, `#/t/:id` | `app/screens-community.js`, `render/community.js`, `community-*.js` | no ar (sem rede: aviso "sem conexão", sem conteúdo de exemplo) | `community-*` |
| Moderação: fixar, trancar, ocultar | comunidade | `moderation.js` | no ar | `moderation*` |
| Denunciar publicação (motivos, canais oficiais para casos graves, DM cifrada ao moderador) | post ⋯ | `report.js`, `app/report-flow.js`, `app/report-dm.js`, `report-review.js` | no ar (LAN-12, PM-69): a denúncia assinada vai por DM à moderação, cujo aparelho arquiva até a revisão ("⏳ Em revisão", 48 h) se passar nas salvaguardas; sem fila central | `report`, `report-flow`, `report-review` |
| Canal: só a moderação publica posts, todos comentam | faixa na página da comunidade | `community-channel.js`, `app/community-channel-flow.js`, `render/channel-bar.js` | no ar (PM-81): `community_update` com `postingMode`; a regra vale na leitura de cada aparelho ([spec](./specs/canal-comunidade-v0.md)) | `community-channel` |
| Proposta com diff + voto assinado | `#/c/:id/proposal/:id`, `#/vote` | `governance.js`, `app/vote-confirm.js` | no ar | `governance`, `vote-stitch` |
| Enquete cívica 2–6 opções | composer cívico | `civic-post.js` | no ar | `civic-post` |
| Feira (classificados assinados) | `#/c/:id?tab=feira`, `#/compose/listing` | `listing.js`, `listing-ui.js` | no ar | `listing*` |
| Pix Zaps (BR Code offline) | post/perfil, `#/pix/:key` | `brcode.js`, `pix-key.js`, `app/zap-modal.js` | no ar (só Pix; sem Lightning). Avisa que o nome civil do DICT aparece com qualquer chave (REV-13) | `brcode`, `pix-key` |
| Cartório cívico (hash de atas no Arweave) | composer/tópico | `perma-notary.js` | no ar | `perma-notary` |
| Kits de comunidade (associação, sindicato…) | — | `kit-genesis.js` | **escrito, não plugado** | `kit-genesis` |
| Ranking por ponte (bridging) | — | `bridging-rank.js` | **escrito, não plugado** | `bridging-rank` |
| Perfil coletivo M-de-N | `#/labs/mofn` | `labs/collective-mofn.js`, `labs/mofn-lab.js` | lab | `collective-mofn` |

## 3. Pessoas, identidade e mensagens

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Onboarding em etapas + pacto | 1º acesso | `app/onboarding.js`, `render/oauth-modals.js` | no ar | `onboarding-steps` |
| Confirmação "tenho 18 anos ou mais" no pacto (piloto só 18+, ADR-020) | pacto | `age-gate.js`, `render/welcome-pact.js` | no ar (autodeclarada, só no aparelho) | `age-gate` |
| Identidade local P-256 `vx_*` | — | `local-account.js` | no ar | `local-account` |
| Cofre v2 por Senha Soberana, sync por link/QR (ADR-025) | `#/backup`, `#/sync` | `oauth-vault.js`, `vault-crypto.js`, `vault-legacy.js`, `account-backup-wrap.js` | no ar (precisa de servidor de memória escolhido; login Google/Meta só enriquece o perfil) | `account-backup`, `wallet-encryption` |
| Identidade Ed25519/X25519 (cintura fina) | — | `vox-identity.js` | **escrito, não plugado** | `vox-identity` |
| Credencial cívica / vínculo de identidade | — | `civic-credential.js`, `identity-link.js` | **escrito, não plugado** | `civic-credential`, `identity-link` |
| Handles `@` | `#/h/:slug`, `#/u/@x` | `handles.js` | no ar | `handles` |
| Diretório de pessoas | `#/people` | `people-index.js`, `profile-directory.js`, `contacts.js` | no ar; pares só com a chave `vx_…` (sem nome escolhido) ficam fora da lista, mas a busca pela chave os acha | `people-index`, `contacts` |
| Perfil, Voxels, passaporte | `#/perfil`, `#/u/:addr` | `app/screens-profile.js`, `voxels.js` | no ar (Voxels só locais) | `voxels`, `profile-*` |
| Importar nome/foto (Google, Meta, Bluesky, X, TikTok, GitHub) | onboarding | `social-login.js`, `oauth-profile.js`, `bsky-oauth.js` | depende de config (Kwai: "em breve") | `social-login`, `oauth-profile` |
| DMs E2E | `#/dm`, `#/dm/:addr` | `crypto-dm.js`, `dm-messenger.js`, `inbox.js`, `dm-outbox.js` | no ar; entrega offline **depende de relay** (inbox padrão `127.0.0.1:3920`). Caixa de saída (PM-78): o que não saiu é reenviado enquanto o app está aberto, por até 7 dias ("⏳ Aguardando" → "⚠ Não entregue") | `crypto-dm`, `dm-*`, `inbox`, `dm-outbox` |
| Convite com vínculo assinado (padrinho) | `#/connect/:id?convite=` | `vox-link.js`, `app/vox-link-flow.js`, `render/vox-link.js` | no ar (PM-82): aceite assinado por quem entra e confirmação automática de quem convidou (10 aceites, 30 dias); passa pela malha e pela memória central. É a base do moderador natural (PM-83, a fazer; [spec](./specs/moderador-natural-v0.md)) | `vox-link` |
| Pareamento por QR sem servidor | — | `airgap-webrtc.js` | **escrito, não plugado** | `airgap-webrtc` |
| Carteira Arweave + assistente | `#/wallet`, `#/wallet/guia` | `wallet.js`, `app/screens-guided.js` | no ar | `wallet` |

## 4. Distribuição (POSSE) e outras redes

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Contas vinculadas + auto-replicação | `#/settings/linked-accounts` | `linked-accounts.js`, `render/linked-accounts-ui.js` | Bluesky no ar; X/Threads/GitHub/TikTok/IG **dependem de** `/oauth/exchange` | `linked-accounts` |
| Compartilhar / intents (X, Bluesky, WhatsApp, Telegram) | post | `share.js`, `posse-dispatch.js` | no ar (envio final sempre pela pessoa) | `share`, `posse-dispatch` |
| EXPLODE! (disparo multi-rede assistido) | post | `explode-dispatch.js`, `tools/auto-explode/` | no ar | `explode` |
| Story card 9:16 | post | `story-card.js` | no ar | `story-card` |
| Webhooks Discord/Slack | contas vinculadas | `chat-bridge.js` | no ar | `chat-bridge` |
| Widget embed | — | `client/embed/vox-embed.js` | demo (`embed/demo.html`) | `embed-vox` |
| Extensão Vox Bridge (MV3) | — | `vox-bridge/` | stub | `vox-bridge-schema` |
| `posse-cli` | terminal | `tools/posse-cli/` | no ar (ferramenta) | `posse-cli` |

## 5. Rede, malha e infraestrutura

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Leitura multi-gateway + pill "Leitura reserva" | — | `graphql.js`, `gateway-telemetry.js` | no ar: 4 gateways em `config/gateways.json` (3 testemunhas GraphQL: turbo, arweave.net, ardrive.net; o `ar-io.dev` só serve conteúdo `raw` porque não indexa o Vox — PM-50), tempo limite de 8 s cada; se todos falham, erro "gateways fora" (LAN-27) | `graphql`, `multi-gateway`, `gateway-telemetry` |
| Cache local "Pacto Vox" (IndexedDB) | — | `cache-node.js`, `idb-store.js` | no ar | `cache-node`, `idb-store` |
| Malha WebRTC + gossip (WANT/HAVE/BLOB, perfis, manifestos) | — | `peers*.js`, `webrtc-peer.js`, `profile-card.js`, `mesh-profile.js` | no ar; **depende da sinalização** (1 nó Render + Nostr em paralelo). **Defeito aberto (PM-84):** cartão de perfil sem "já visto" pode circular sem fim entre abas e pares | `peers*`, `webrtc`, `profile-card` |
| Sincronização ao conectar por inventário | — | `peer-sync.js`, `post-wire.js`, `cache-node.js` | no ar (PM-80): manda hashes e só o que falta (≈ 157 KB → ≈ 7 KB por sentido). Os itens saem na forma assinada desde a correção #49; antes, quem recebia descartava tudo o que vinha por aqui. Troca entre dois aparelhos reais ainda não medida | `peer-sync`, `post-wire` |
| Prioridade suave de blobs (V-I09) | — | `peers-blob-affinity.js` | no ar, flag padrão **desligada** | `peers-blob-soft-priority` |
| Sinalização via Nostr (efêmero kind 25050, cifrada entre pares) | — | `nostr-transport.js`, `nostr-event.js` (BIP-340), `nostr-signaling.js` | **no ar em paralelo ao Render** (REV-09; desligável em `signaling.json` → `nostrSignaling.enabled`). Ida e volta validada em relays reais; conexão entre dois navegadores ainda não testada em campo. Relay que cai reconecta com espera crescente e, depois de 3 falhas, troca por outro do pool (PM-17) | `nostr-transport`, `nostr-event`, `nostr-signaling` |
| Teste de fumaça dos relays Nostr | workflow semanal | `scripts/nostr-smoke.mjs`, `.github/workflows/nostr-smoke.yml` | no ar (REV-19) | `nostr-smoke` |
| Kill-switch por configuração | `config/flags.json` | `feature-flags.js` | no ar (LAN-08): pausa upload, Feira, Pix Zaps, criar comunidade | `feature-flags` |
| Nó leve por padrão + modo Apoiador (nó pesado) | `#/settings/network` (botão "Seja um apoiador da rede") | `supporter-mode.js`, `render/network.js` | no ar: leve = 50 MB/dia e 25 MB em disco; Apoiador = 500 MB/dia e 250 MB, só no Wi-Fi | `supporter-mode` |
| "Esconder meu IP" (só TURN) + aviso de IP | `#/settings/network` | `webrtc-peer.js` (`setTurnOnly`, `iceTransportPolicy: relay`) | no ar, mas **sem efeito prático enquanto não houver TURN** em `signaling.json` (REV-10). LAN-19 parcial | `webrtc` |
| Limite de taxa por chave no gossip | — | `rate-limit.js` (chamado em `peers.js`) | no ar: 20 posts por chave a cada 10 min; o excesso é descartado e não repassado (LAN-14) | `rate-limit` |
| Quarentena de chave nova + PoW leve | criar comunidade ("Quarentena para chave nova"); aviso "Ver mesmo assim" no feed da comunidade | `new-key-guard.js` (usado em `screens-community.js`, `inline-composer.js`, `screens-compose.js`, `peers.js`) | no ar (LAN-14): na comunidade que pediu, post de chave vista há menos de 24 h fica recolhido, salvo PoW de 14 bits (~1 s ao publicar); moderação vê tudo, com selo "Chave nova". A opção só existe na criação | `new-key-guard` |
| Mensagens de erro honestas | upload, leitura, DM | `honest-errors.js` | no ar (LAN-21): cota, 402, 429, offline, timeout, gateways fora, DM sem relay e sinalização caída (WebSocket e Nostr fora por mais de 5 s: aviso e selo em `#/settings/network`, e aviso de volta) | `honest-errors`, `nostr-transport`, `render` |
| Trackers WebTorrent | — | `client/config/signaling.json` | **stub** (configurados, não usados) | — |
| Modo guardião (aparelho como nó) | — | `seeder-guardian.js` | **escrito, não plugado** | `seeder-guardian` |
| Persistência de storage (anti-evicção) | — | `storage-persistence.js` | **escrito, não plugado** | `storage-persistence` |
| Transferência em blocos | — | `chunked-transfer.js` | **escrito, não plugado** | `chunked-transfer` |
| Configurações de rede, assistente, steward | `#/settings/network[/guia\|/steward]` | `app/screens-network.js`, `steward-wizard.js` | no ar | `steward-wizard`, `status-render` |
| Espelho de comunidade no relay | comunidade | `community-mirror.js` | no ar, depende de relay | `community-mirror` |
| Memória central (Modo 3) | — | `central-memory.js` + `relay/central_memory.py` | depende de Node Zero / relay | `central-memory` |
| Atestação de contribuição (ADR-001) | `#/settings/network` | `contribution-attestation.js` | no ar (opt-in, export local) | `contribution-attestation` |
| Saúde do nó | `#/status`, topbar | `node-health-*.js` | parcial (`node-health-api`/`-state` sem importadores) | `node-health-*` |
| Nó dedicado Vox Populi | — | `android/`, `vox-populi/`, `tools/*` | no ar (loopback; seeder `not_implemented`) | `vox-populi` |

## 6. Ajuda e conteúdo

| Funcionalidade | Rota | Status |
|---|---|---|
| Voxpedia (ajuda leiga) | `#/voxpedia` | no ar |
| Guia para testadores | `#/ajuda/teste` | no ar |
| "Algo errado aqui?": apontamento sobre o app (trabalho voluntário 3; `app-feedback.js`, `app/feedback-flow.js`) | rodapé de todas as telas | no ar; fica no aparelho e a pessoa compartilha com o grupo do piloto (sem envio automático) |
| Downloads | `#/download`, `client/download/` | no ar |
| Canal Revolução | `#/revolucao` | no ar |
| Comunidade oficial `vox` + demos | — | no ar + demo (`mock.js`, 27 perfis por UF) |

## 7. Lacunas que bloqueiam funcionar sem o mantenedor

1. Sinalização pública: Render + **Nostr em paralelo** (REV-09). Trackers WebTorrent continuam stub. Falta um 2º nó sem sleep (REV-01) e medir em campo.
2. **Sem relay completo público**: entrega offline de DM, cofre remoto e OAuth de várias redes dependem de stewards.
3. **Sem TURN**: pares atrás de CGNAT podem não conectar, e o "Esconder meu IP" não tem por onde passar (REV-10).
4. O upload grátis do Turbo tem **cota** (~10 MiB por carteira/IP, segundo `upload.ardrive.io/info`); depois dela, e para itens acima de 105 KiB, publicar custa.
5. **22 módulos** não são carregados por nenhuma tela (lista em `UNPLUGGED_MODULES` no `sw.js`: os marcados acima, mais `polis`, `idb-store` e a cadeia `node-health-*`). Desde o PM-04 eles ficam fora do precache (~116 KB a menos na instalação). Plugar é o caminho mais barato para várias das [10 features de autossustento](./brainstorms/brainstorm-autossustento-10-features-2026-11.md).

Detalhes de custo e risco: [INFRA-CUSTOS.md](./INFRA-CUSTOS.md). Prioridades: [ROADMAP.md](./ROADMAP.md).
