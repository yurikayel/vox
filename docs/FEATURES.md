# Catálogo de funcionalidades — Vox

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-24
> Fonte: rotas de `client/js/app/route-parse.js`, imports reais em `client/js/**` e `tests/*.test.js`. Ao plugar ou remover um módulo, atualize a linha correspondente aqui. Reflete `main` (`#480`) e itens prontos em `develop` (`#481`–`#486`, marcados como *pronto em `develop`*).

**Legenda de status**

| Status | Significado |
|---|---|
| **no ar** | Carregado pela UI e usável no PWA publicado. |
| **depende de config** | Código no ar, mas só funciona com app registrado, relay ou secret configurado. |
| **lab** | Rota experimental (`#/labs/*`) — não é produção. |
| **escrito, não plugado** | Módulo e testes existem; **nenhum ponto de entrada carrega**. Desde o PM-04 fica em `UNPLUGGED_MODULES` no `sw.js`, **fora do precache**; o teste `shell-reachability` mantém a lista honesta. |
| **planejado** | Decisão (ADR) e spec escritas; nenhum código. |
| **stub** | Esqueleto ou lista de configuração, sem a lógica principal. |
| **demo** | Perfis fictícios de `mock.js` que só aparecem com o **modo demonstração** ligado em `#/settings/network`, sempre com a faixa "Modo demonstração" (LAN-10). Fora dele, falha de rede mostra "sem conexão", nunca conteúdo de exemplo. |

## 1. Social e feed

| Funcionalidade | Rota | Módulos principais | Status | Testes |
|---|---|---|---|---|
| Feed Social / Cívico | `#/`, `#/?feed=civic` | `app/screens-home.js`, `render/feed.js`, `civic-post.js` | no ar | `civic-post`, `render`, `feed-*` |
| Postar (Social ou Cívico, em etapas) | botão Postar | `app/compose-stepper.js`, `render/compose-steps.js`, `app/inline-composer.js`, `composer-media.js` | no ar | `compose-steps`, `stepped-flows`, `composer-*` |
| Aviso local preventivo consultivo e borrão/ocultação em 1 toque (F11) | compositor e menu ⋯ do post | `shared/local-advisory.js`, `app/inline-composer-publish.js`, `moderation.js`, `app/post-more-actions.js` | **pronto em `develop`** (`#481`, `#484` via `#486`): heurística local consultiva sem ML antes de publicar + borrão/ocultação local em 1 toque ([spec](./specs/aviso-local-preventivo-v0.md)) | `local-advisory`, `f11-advisory-ui` |
| Aviso de permanência ("gravar no Arweave" × "só na malha") | 1º post com carteira | `permanence-notice.js` | pausado quando `arweaveUpload: false` (**política atual:** tudo via rede de seguidores; guardas em `topic-permaweb.js` e `screens-compose.js`) | `permanence-notice`, `topic-permaweb` |
| Foto, áudio e vídeo lo-fi | composer | `media-lofi.js`, `media-blob.js`, `upload.js`, `ans104.js` | no ar na malha/P2P e memória local; uploader Arweave/Turbo (`upload.js`) **bloqueado por padrão** (`arweaveUpload: false`) | `media-*`, `upload`, `verify-data-item` |
| Republicar com citação | post ⋯ | `repost.js`, `repost-draft.js`, `render/repost-cite.js` | no ar | `repost` |
| Marcação manual em fotos | foto | `photo-tags.js`, `app/photo-tag-*.js`, `render/photo-tag-pins.js` | no ar | `photo-tags`, `photo-aspect-lightbox-tagging` |
| Notas de perfil 24h | perfil | `profile-note.js` | no ar | `profile-note` |
| Hashtags e feed por tag (+ Pol.is-lite) | `#/tag/:slug` | `hashtags.js`, `render/tag-polis.js` | no ar. O agrupamento de opiniões de `polis.js` **não está plugado** (só o `bridging-rank.js`, também órfão, o importa) | `hashtags`, `polis` |
| Feed do Bluesky (leitura) | feed | `bsky-feed.js` | no ar | `bsky-feed` |
| Modo eleitoral (sem "Sugestões cívicas") | feed | `electoral-period.js`, `render/feed.js` | no ar: automático de 16/08 a 31/10 de ano par, ou forçado por `electoralMode` em `flags.json` (REV-24) | `electoral-period` |
| Open Frames (mini-apps no feed) | feed, `#/labs/frames` | `frames.js`, `open-frames-host.js` | no ar (host iframe em lab) | `frames`, `open-frames-host` |
| Cartuchos Webxdc + CRDT | — | `labs/parado/webxdc-crdt.js`, `labs/parado/webxdc-host.js`, `labs/parado/webxdc-loader.js` | **escrito, não plugado** | `webxdc-*` |
| Depoimentos | — | `labs/parado/testimonials.js` | **escrito, não plugado** | `testimonials` |

## 2. Comunidades, governança e economia local

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Comunidades estilo Orkut (fórum, tópicos) | `#/communities`, `#/c/:id`, `#/t/:id` | `app/screens-community.js`, `render/community.js`, `community-*.js` | no ar (sem rede: aviso "sem conexão", sem conteúdo de exemplo) | `community-*` |
| Aviso assinado da coordenação (selo, Ciente / Vou / Talvez, contagem colada do WhatsApp, cancelamento) | `#/c/:id/avisos`, `#/compose/aviso?c=:id` | `aviso.js`, `aviso-replies.js`, `render/aviso.js`, `app/aviso-flow.js` | **lab** (`vox.lab.aviso`) | `aviso`, `aviso-replies`, `aviso-ui` |
| Página leve de conferência do aviso (sem conta, sem o app) | `aviso.html#v=1&a=…` | `client/aviso/aviso-page.js`, `client/aviso/aviso-link.js`, `signed-verify.js` | **no ar** (só abre com link gerado no lab) | `aviso-page`, `assinaturas-e-sinais-malicioso` |
| Chamada de ação: papéis com vagas e quórum; resposta por DM cifrada | cartão do aviso | `aviso-roles.js`, `app/aviso-roles-dm.js` | **lab** (`vox.lab.aviso`) | `aviso-roles` |
| Competências só no aparelho (sugerem papel) | aba de avisos | `aviso-roles.js`, `app/aviso-roles-dm.js` | **lab** (`vox.lab.aviso`) | `aviso-roles` |
| Termo de convivência assinado na entrada | topo de `#/c/:id` | `community-termo.js`, `app/community-termo-flow.js` | **lab** (`vox.lab.aviso`) | `community-termo` |
| Pedir mediação (conversa cifrada com a moderação, sem ocultar nada) | menu ⋯ do post | `report.js` (`buildMediationDmHash`), `app/post-more-menu.js` | **no ar** | `community-termo` |
| Moderação: fixar, trancar, ocultar | comunidade | `moderation.js` | no ar | `moderation*` |
| Denunciar publicação (motivos, canais oficiais para casos graves, DM cifrada ao moderador) | post ⋯ | `report.js`, `app/report-flow.js`, `app/report-dm.js`, `report-review.js` | no ar (LAN-12, PM-69): a denúncia assinada vai por DM à moderação, cujo aparelho arquiva até a revisão ("⏳ Em revisão", 48 h) se passar nas salvaguardas; sem fila central | `report`, `report-flow`, `report-review` |
| Canal: só a moderação publica posts, todos comentam | faixa na página da comunidade | `community-channel.js`, `app/community-channel-flow.js`, `render/channel-bar.js` | no ar (PM-81): `community_update` com `postingMode`; a regra vale na leitura de cada aparelho ([spec](./specs/canal-comunidade-v0.md)) | `community-channel` |
| Manifesto de comunidade v1 (subrede: texto longo, tema de lista fechada, sugestões de relay que cada pessoa liga) | página da comunidade, Ajustes → Rede | — | **planejado** ([ADR-038](./adr/038-subrede-malha-e-manifesto.md) proposto, [spec v1](./specs/community-manifest-v1.md)) | — |
| Proposta com diff + voto assinado | `#/c/:id/proposal/:id`, `#/vote` | `governance.js`, `app/vote-confirm.js` | no ar | `governance`, `vote-stitch` |
| Modo Assembleia v0 (pauta, RSVP, lista de presença assinável, voto com prazo e ata assinada) | `#/c/:id` (painel de assembleia) | `app/assembly-ui.js`, `assembly-minutes.js`, `assembly-presence.js`, `render/assembly-panel.js` | no ar (`main` `#480`, via `#456` e `#463`, PM-23; validação de fluxo completo pré-PIL-02 pendente; [spec](./specs/modo-assembleia-v0.md)) | `pm23-*`, `assembly-*` |
| Enquete cívica 2–6 opções | composer cívico | `civic-post.js` | no ar | `civic-post` |
| Feira (classificados assinados) | `#/c/:id?tab=feira`, `#/compose/listing` | `listing.js`, `listing-ui.js` | no ar | `listing*` |
| Pix Zaps (BR Code offline) | post/perfil, `#/pix/:key` | `brcode.js`, `pix-key.js`, `app/zap-modal.js` | no ar (só Pix; sem Lightning). Avisa que o nome civil do DICT aparece com qualquer chave (REV-13) | `brcode`, `pix-key` |
| Cartório cívico (hash de atas no Arweave — uso futuro específico) | composer/tópico | `perma-notary.js` | módulo no ar (`createCivicNotaryRecord`, só SHA-256 local), **sem salvar no Arweave por enquanto** (`arweaveUpload: false`; aguarda fluxo consensual) | `perma-notary` |
| Kits de comunidade (associação, sindicato…) | `#/compose/community` | `app/compose-community-kit.js`, `labs/parado/kit-genesis*.js` | no ar sob demanda (`main` `#480`, via `#453` e `#461`, REV-02) | `kit-genesis` |
| Ranking por ponte (bridging) | — | `labs/parado/bridging-rank.js` | **escrito, não plugado** | `bridging-rank` |
| Perfil coletivo M-de-N | `#/labs/mofn` | `labs/collective-mofn.js`, `labs/mofn-lab.js` | lab | `collective-mofn` |
| AI Social Dungeon / **Mesa Soberana E1–E5** (lab) — VTT local-first (referenciais e UI: [`mesa-referenciais-vtt-v0.md`](specs/mesa-referenciais-vtt-v0.md) · [`mesa-ui-brainstorm-v0.md`](specs/mesa-ui-brainstorm-v0.md); precache cívico **0 bytes** `dungeon/`) em `#/dungeon`: campanhas `vox-vtt-db-v1`, dados (`2d20kh1`, `@for`, `/gmroll`), ficha CRDT, ficha portátil `.voxchar` (exportar e importar no painel Editar; `voxchar.js` sob demanda), backup portátil, mapa **8 camadas** (tático E3), campanha longa E4, **UI E5** (mapa hero + drawer Z3), join jogador `#/dungeon/entrar/...` (**BroadcastChannel**, mesma origem), handouts compartilhados + preset **tormenta20**; sync P2P ECDSA + `WANT_BLOB`; narrador/guardiões demo sem IA (ADR-033) | `#/dungeon`, `#/labs/dungeon`, `#/dungeon/entrar/:id` | `dungeon/*`, `labs/ai-social-dungeon-lab.js` | parcial (lab; sync multi-dispositivo fora do P0) | `ai-social-dungeon`, `vtt-*`, `ttrpg-*`, `test_mesa_ttrpg_e2e` |

## 3. Pessoas, identidade e mensagens

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Onboarding em etapas + pacto + kit por e-mail (ADR-032 §6) | 1º acesso, Já tenho conta | `app/onboarding.js`, `render/oauth-modals.js`, `email-kit.js` | no ar (nome, e-mail e senha geram cofre + rascunho `mailto:` com `#/sync?b=…` e `VOX1:…`, cartão §6.5 e entrada só com nome opcional) | `onboarding-steps`, `email-kit` |
| Confirmação "tenho 18 anos ou mais" no pacto (piloto só 18+, ADR-020) | pacto | `age-gate.js`, `render/welcome-pact.js` | no ar (autodeclarada, só no aparelho) | `age-gate` |
| Identidade local P-256 `vx_*` | — | `identity/local-account.js` | no ar | `local-account` |
| Modo Ensaio (conta de teste 100% local, sem vazamento) | faixa "Ensaio" | `rehearsal-mode.js` | no ar (`main` `#480`, via `#459`, PM-100): fora do gossip, memória central, Arweave e POSSE, com botão para apagar tudo | `pm100-rehearsal-mode` |
| Sincronização de conta e rota entre abas (mesmo origin) | — | `identity/tab-sync.js` | no ar (`BroadcastChannel` `vox-tab-sync-v0` + evento `storage`; evita divergência entre abas abertas) | `tab-sync` |
| Saída da conta e faixa de conta provisória (ADR-032 passo 1) | todas as telas, `#/backup` | `identity/account-exit.js`, `app/account-exit-banner.js`, `render/oauth-import.js` | no ar (faixa até haver saída soberana: cofre aceito por servidor, `.voxid` com senha baixado ou backup no e-mail mandado; frase e guardiões nos passos seguintes) | `account-exit`, `account-exit-banner`, `onboarding-steps` |
| Frase de recuperação (ADR-032 passo 2) | `#/frase`, Já tenho conta | `identity/recovery-phrase.js`, `identity/identity-seed.js`, `identity/p256.js`, `data/bip39-pt.js`, `identity/account-phrase.js`, `app/screens-phrase.js`, `app/screens-phrase-view.js`, `app/phrase-print.js`, `render/recovery-phrase.js` | no ar: contas novas nascem da semente (12 palavras), antigas têm 24; ver, imprimir cartão com QR SVG offline (`REV-14`, `#451`/`#480`), conferir 3 palavras (conta como saída) e entrar pela frase sem rede; **pronto em `develop` (`#486`, PM-01):** tela `#/frase` carregada sob demanda (`-16,2 KiB`) | `recovery-phrase`, `account-phrase`, `phrase-qr`, `pm01-lazy-third-screen` |
| Guardiões (ADR-032 passo 3) | `#/guardioes`, `#/guardiao?…`, `#/voltar` | `shamir-gf256.js`, `identity/guardians.js`, `identity/guardian-return.js`, `app/guardians-flow.js`, `app/guardian-return-flow.js`, `app/screens-guardians.js`, `app/screens-guardian-return.js`, `render/guardians.js`, `render/guardian-return.js` | parcial: escolher entre laços mútuos, dividir (padrão 3 de 5), guardar em caixa preta, recibos e saída com o mínimo; **devolver a conta (3c):** pedido com chave temporária, código de 4 palavras conferido por voz ou pessoalmente, resposta pela caixa `vxtmp_` ou colada; QR do pedido; **trocar e tirar todos (3d)**: divisão nova revoga a anterior, tirar todos revoga e tira a saída ([spec](./specs/guardioes-v0.md)) | `shamir-gf256`, `guardians`, `guardians-trocar`, `guardian-return` |
| Cofre na malha (ADR-037, passo 4) | Já tenho conta, `#/backup` | `vault/mesh-vault.js`, `app/mesh-vault-flow.js`, `app/onboarding-email.js` | no ar: cópias cifradas do cofre guardadas em laços mútuos, pedido cego no relay com espera de 24 h ou aprovação "Fui eu" e veto "Não fui eu" ([ADR-037](./adr/037-cofre-na-malha.md)) | `mesh-vault*`, `login-network-faults`, `login-rede-ruim` |
| Seus posts num arquivo (PM-72) | `#/settings/network` | `own-posts.js`, `post-supersede.js`, `app/own-posts-ui.js` | no ar (baixa `.json` com os próprios posts assinados e a mídia; restaurar confere autor, assinatura, versão e hash; sem servidor) | `own-posts`, `inbox-backup` |
| Cofre v2 por e-mail/Senha Soberana, sync por link/QR, backup no e-mail e convergência multi-aparelho (ADR-025, ADR-032 §6, PM-13) | `#/backup`, `#/sync`, `#/settings/network` | `vault/oauth-vault.js`, `vault/vault-crypto.js`, `email-kit.js`, `identity/inbox-backup.js`, `shared/device-merge.js` | no ar (`main` `#480`: preserva semente e DM; busca local/remota com anti-rollback ou colagem de `#/sync?b=…` / `VOX1:…`; backup `.txt` semanal/mensal; convergência Tier A de contatos em `#476`); **pronto em `develop` (`#485` via `#486`):** convergência de `followedCommunities` e `localLists` no restore | `vault-v2`, `email-kit`, `account-backup`, `wallet-encryption`, `inbox-backup`, `device-merge`, `pm13-communities-lists-merge` |
| Credencial cívica / vínculo de identidade | — | `labs/parado/civic-credential.js`, `labs/parado/identity-link.js` | **escrito, não plugado** | `civic-credential`, `identity-link` |
| Handles `@` | `#/h/:slug`, `#/u/@x` | `handles.js` | no ar | `handles` |
| Diretório de pessoas | `#/people` | `people-index.js`, `profile-directory.js`, `contacts.js` | no ar; pares só com a chave `vx_…` (sem nome escolhido) ficam fora da lista, mas a busca pela chave os acha | `people-index`, `contacts` |
| Perfil, Voxels, passaporte | `#/perfil`, `#/u/:addr` | `app/screens-profile.js`, `voxels.js` | no ar (Voxels só locais) | `voxels`, `profile-*` |
| Importar nome/foto (Google, Meta, Bluesky, X, TikTok, GitHub) | Perfil (fora da entrada desde o ADR-032) | `social-login.js`, `oauth-profile.js`, `bsky-oauth.js` | depende de config (Kwai: "em breve") | `social-login`, `oauth-profile` |
| DMs E2E | `#/dm`, `#/dm/:addr` | `crypto-dm.js`, `dm-messenger.js`, `inbox.js`, `dm-outbox.js` | no ar; entrega offline **depende de relay** (inbox padrão `127.0.0.1:3920`). Caixa de saída (PM-78): o que não saiu é reenviado enquanto o app está aberto, por até 7 dias ("⏳ Aguardando" → "⚠ Não entregue") | `crypto-dm`, `dm-*`, `inbox`, `dm-outbox` |
| Mochila de DMs (repasse cego entre aparelhos) | — | `dm-outbox.js` (só o passo 0, PM-78); `dm-mochila.js` ainda não existe | **parcial**: caixa de saída no ar; envelope v2 e repasse (PM-79, passos 1 e 2) não implementados; [spec](./specs/mochila-dm-v0.md) | `dm-outbox` |
| Convite com vínculo assinado (padrinho) | `#/connect/:id?convite=` | `vox-link.js`, `app/vox-link-flow.js`, `render/vox-link.js` | no ar (PM-82): aceite assinado por quem entra e confirmação automática de quem convidou (10 aceites, 30 dias); passa pela malha e pela memória central. Base do moderador natural (PM-83, em **lab** `vox.lab.moderador`; [spec](./specs/moderador-natural-v0.md)) | `vox-link` |
| Pareamento por QR sem servidor | — | `labs/parado/airgap-webrtc.js` | **escrito, não plugado** | `airgap-webrtc` |
| Carteira Arweave + assistente | `#/wallet`, `#/wallet/guia` | `wallet.js`, `app/screens-guided.js` | no ar | `wallet` |

## 4. Distribuição (POSSE) e outras redes

| Funcionalidade | Rota | Módulos | Status | Testes |
|---|---|---|---|---|
| Contas vinculadas + auto-replicação | `#/settings/linked-accounts` | `linked-accounts.js`, `render/linked-accounts-ui.js` | Bluesky no ar; X/Threads/GitHub/TikTok/IG **dependem de** `/oauth/exchange` | `linked-accounts` |
| Compartilhar / intents (X, Bluesky, WhatsApp, Telegram) | post | `share.js`, `posse-dispatch.js` | no ar (envio final sempre pela pessoa) | `share`, `posse-dispatch` |
| Caminho de volta POSSE read-first (PM-105) | `#/posse/:id`, `#/c/:id/t/:id` | `app/screens-posse-return.js`, `render/posse-return.js` | no ar (`main` `#480`, via `#467`): abre o original sem conta e confere a assinatura offline ([spec](./specs/caminho-volta-posse-pm105.md)) | `pm105-posse-ui` |
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
| Cache local "Pacto Vox" (IndexedDB) | — | `cache-node.js` | no ar (`cache-node.js`) | `cache-node` |
| Malha WebRTC + gossip (WANT/HAVE/BLOB, perfis, manifestos) | — | `peers*.js`, `webrtc-peer.js`, `profile-card.js`, `mesh-profile.js` | no ar; **depende da sinalização** (1 nó Render + Nostr em paralelo); eco de cartão de perfil corrigido no PM-84 | `peers*`, `webrtc`, `profile-card` |
| Sincronização ao conectar por inventário | — | `peer-sync.js`, `post-wire.js`, `cache-node.js` | no ar (PM-80): manda hashes e só o que falta (≈ 157 KB → ≈ 7 KB por sentido). Os itens saem na forma assinada desde a correção #49; antes, quem recebia descartava tudo o que vinha por aqui. Troca entre dois aparelhos reais ainda não medida | `peer-sync`, `post-wire` |
| Prioridade suave de blobs (V-I09) | — | `peers-blob-affinity.js` | no ar, flag padrão **desligada** | `peers-blob-soft-priority` |
| Sinalização via Nostr (efêmero kind 25050, cifrada entre pares) | — | `nostr-transport.js`, `nostr-event.js` (BIP-340), `nostr-signaling.js` | **no ar em paralelo ao Render** (REV-09; desligável em `signaling.json` → `nostrSignaling.enabled`). Ida e volta validada em relays reais; conexão entre dois navegadores ainda não testada em campo. Relay que cai reconecta com espera crescente e, depois de 3 falhas, troca por outro do pool (PM-17) | `nostr-transport`, `nostr-event`, `nostr-signaling` |
| Teste de fumaça dos relays Nostr | workflow semanal | `scripts/nostr-smoke.mjs`, `.github/workflows/nostr-smoke.yml` | no ar (REV-19) | `nostr-smoke` |
| Kill-switch por configuração | `config/flags.json` | `feature-flags.js` | no ar (LAN-08): pausa upload, Feira, Pix Zaps, criar comunidade | `feature-flags` |
| Nó leve por padrão + modo Apoiador (nó pesado) | `#/settings/network` (botão "Seja um apoiador da rede") | `supporter-mode.js`, `render/network.js` | no ar: leve = 100 MB de disco (fixo) e até 200 MB/dia; Apoiador = 512 MB a 1 GB e até o dobro por dia, só no Wi-Fi | `supporter-mode` |
| "Esconder meu IP" (só TURN) + aviso de IP | `#/settings/network` | `webrtc-peer.js` (`setTurnOnly`, `iceTransportPolicy: relay`) | no ar, mas **sem efeito prático enquanto não houver TURN** em `signaling.json` (REV-10). LAN-19 parcial | `webrtc` |
| Limite de taxa por chave no gossip | — | `rate-limit.js` (chamado em `peers.js`) | no ar: 20 posts por chave a cada 10 min; o excesso é descartado e não repassado (LAN-14) | `rate-limit` |
| Quarentena de chave nova + PoW leve | criar comunidade ("Quarentena para chave nova"); aviso "Ver mesmo assim" no feed da comunidade | `new-key-guard.js` (usado em `app/screens-community.js`, `app/inline-composer.js`, `app/screens-compose.js`, `peers.js`) | no ar (LAN-14): na comunidade que pediu, post de chave vista há menos de 24 h fica recolhido, salvo PoW de 14 bits (~1 s ao publicar); moderação vê tudo, com selo "Chave nova". A opção só existe na criação | `new-key-guard` |
| Mensagens de erro honestas | upload, leitura, DM | `honest-errors.js` | no ar (LAN-21): cota, 402, 429, offline, timeout, gateways fora, DM sem relay e sinalização caída (WebSocket e Nostr fora por mais de 5 s: aviso e selo em `#/settings/network`, e aviso de volta) | `honest-errors`, `nostr-transport`, `render` |
| Trackers WebTorrent | — | `client/config/signaling.json` | **stub** (configurados, não usados) | — |
| Modo guardião (aparelho como nó) | — | `labs/parado/seeder-guardian.js`, `labs/parado/settings-guardian.js` | **escrito, não plugado** (cota fixa de 2 GB e banda proporcional já valem no módulo, mas nenhuma tela monta o cartão) | `seeder-guardian` |
| Persistência de storage (anti-evicção) | — | `storage-persistence.js`, `app/storage-durability-flow.js` | no ar (PM-72 / REV-14 parte 1: pede `navigator.storage.persist()` ao ter conta e exibe faixa iOS Safari para Tela de Início) | `storage-persistence`, `storage-durability-flow` |
| Transferência em blocos | — | `labs/parado/chunked-transfer.js` | **escrito, não plugado** | `chunked-transfer` |
| Configurações de rede, assistente, steward | `#/settings/network[/guia\|/steward]` | `app/screens-network.js`, `steward-wizard.js` | no ar | `steward-wizard`, `status-render` |
| Backup HTML standalone offline (EXP-04) | `#/settings/network` | `export-html-backup.js`, `app/screens-network.js`, `scripts/export-html-backup.mjs` | no ar (`main` `#480`, via `#466`): gera arquivo HTML navegável 100% offline com seus posts | `exp04-html-backup-ui` |
| Espelho de comunidade no relay | comunidade | `community-mirror.js` | no ar, depende de relay | `community-mirror` |
| Memória central (Modo 3) | — | `central-memory.js` + `relay/central_memory.py` | depende de Vox Populi / Vox Memoria / relay | `central-memory` |
| Atestação de contribuição (ADR-001) | `#/settings/network` | `contribution-attestation.js` | no ar (opt-in, export local) | `contribution-attestation` |
| Saúde do nó e métrica local de disponibilidade (PM-75) | `#/status` (telemetria e disponibilidade); cadeia `node-health-*` sem UI | `render/status.js`, `signaling-telemetry.js`, `availability-metrics.js`, `app/screens-status.js`; `labs/parado/node-health-*.js` (fora do precache) | `#/status` **no ar** (`main` `#480`, via `#454`, disponibilidade local-only 1 h/6 h/24 h); `node-health-*` **escrito, não plugado** (`UNPLUGGED_MODULES`) | `status-render`, `pm75-availability-ui`, `node-health-*` |
| Nó dedicado Vox Populi | — | `android/`, `vox-populi/`, `tools/*` | no ar (loopback; seeder `not_implemented`) | `vox-populi` |
| Binário único Rust `vox-node` (ADR-039 `PR4.1`–`PR4.4`) | — | `rust/vox-node/`, `rust/vox-core/` | **parcial** (`main` `#480`, via `#446`, `#462`, `#468`, `#469`, `#471`, `#479`): sinalização WS, paridade HTTP do relay + sidecars SHA-256/`genesis_guard`, `--mode memoria` Windows, fachada loopback embarcada, `cdylib` C-ABI e fallback JNI Android; empacotamento NDK/`.so` em CI pendente ([spec](./specs/vox-node-rust-fase4.md)) | `cargo test`, `rust-genesis-parity` |

## 6. Ajuda e conteúdo

| Funcionalidade | Rota | Status |
|---|---|---|
| Voxpedia (ajuda leiga) | `#/voxpedia` | no ar |
| Sobre, licença (`AGPL-3.0-or-later`) e canal DPO (`LAN-03`, `render/about.js`, `tests/about-dpo.test.js`) | `#/sobre` | no ar (`main` `#480`, via `#473`, carregamento sob demanda) |
| Guia para testadores e roteiro de 5 min no celular (`PM-73`, `app/mobile-test-guide.js`, `tests/pm73-mobile-guide.test.js`) | `#/ajuda/teste` | no ar (`main` `#480`, via `#455`, relatório local) |
| "Algo errado aqui?": apontamento sobre o app (trabalho voluntário 3; `app-feedback.js`, `app/feedback-flow.js`) | rodapé de todas as telas | no ar; fica no aparelho e a pessoa compartilha com o grupo do piloto (sem envio automático) |
| Downloads | `#/download`, `client/download/` | no ar |
| Canal Revolução | `#/revolucao` | no ar |
| Comunidade oficial `vox` + demos | — | no ar + demo (`mock.js`, 27 perfis por UF) |

## 7. Lacunas que bloqueiam funcionar sem o mantenedor

1. Sinalização pública: Render + **Nostr em paralelo** (REV-09). Trackers WebTorrent continuam stub. Falta um 2º nó sem sleep (REV-01) e medir em campo.
2. **Sem relay completo público**: entrega offline de DM, cofre remoto e OAuth de várias redes dependem de stewards.
3. **Sem TURN**: pares atrás de CGNAT podem não conectar, e o "Esconder meu IP" não tem por onde passar (REV-10).
4. **Gravação no Arweave pausada (`arweaveUpload: false`, 13/11/2026):** por enquanto **nada é salvo usando Arweave** (fica reservado para alguns recursos futuros e leitura de registros públicos). Toda circulação e preservação ocorre pela **rede de seguidores** (malha WebRTC + sync por inventário no ar; replicação por grau completa em `PM-74` pendente). Em código, `arweaveUpload` vem desligado por padrão em `client/config/flags.json` e em `client/js/feature-flags.js`, com bloqueio em `upload.js` e guardas nos fluxos de publicação/perfil/comunidade.
5. **19 módulos** não são carregados por nenhuma tela; desde 17/11 ficam em [`client/js/labs/parado/`](../client/js/labs/parado/README.md) (lista em `UNPLUGGED_MODULES` no `sw.js`: os marcados acima, mais `polis` e a cadeia `node-health-*`). Desde o PM-04 eles ficam fora do precache (~113 KB a menos na instalação). Plugar é o caminho mais barato para várias das [10 features de autossustento](./brainstorms/brainstorm-autossustento-10-features-2026-11.md).

Detalhes de custo e risco: [INFRA-CUSTOS.md](./INFRA-CUSTOS.md). Prioridades: [ROADMAP.md](./ROADMAP.md).
