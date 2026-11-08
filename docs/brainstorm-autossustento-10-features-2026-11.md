# Brainstorm — 10 features para a rede se sustentar sozinha a custo ~zero

> **Status:** brainstorm · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-07
> **Não substitui o [ROADMAP.md](./ROADMAP.md)**: as features entram lá como *Candidatas* F1–F10 e só ganham caixa com DoD e responsável. Também não substitui [brainstorm-sustentacao-perene-celulares-nos-base.md](./brainstorm-sustentacao-perene-celulares-nos-base.md) (tese de infra $0), que esta lista complementa com produto.

## Ponto de partida

A auditoria de nov/2026 ([FEATURES.md](./FEATURES.md), [INFRA-CUSTOS.md](./INFRA-CUSTOS.md)) mostra que o custo hoje é **R$ 0**, mas a rede ainda depende de pontos que não se sustentam sozinhos:

- **Infra:** 1 nó de sinalização (Render), nenhum TURN, nenhum relay completo público, e o upload grátis do Turbo, que **tem cota**: `https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB). O "R$ 0 para sempre" dos docs antigos não vale para quem posta muito.
- **Trabalho:** moderação e operação de nós dependem de poucas pessoas.
- **Conteúdo e crescimento:** não há fonte constante de pauta, e a entrada acontece por link ou onboarding, sem efeito de rede.
- **Dinheiro:** só existe o Pix entre pessoas. Nada financia os poucos custos reais.

**Critérios de cada feature:** custo marginal ≈ 0; nenhuma custódia de dinheiro; nenhum alcance pago; reaproveitar um módulo que já existe sempre que possível; e respeitar [POSITIONING.md](../POSITIONING.md) e [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

**Fora da lista, porque já existem:** Pix Zaps, Feira, Voxels, POSSE/EXPLODE!, contas vinculadas, governança com voto assinado, Open Frames.

| # | Feature | Eixo | Inspiração | Reaproveita | Esforço |
|---|---|---|---|---|---|
| F1 | Sinalização sem servidor | infra | Nostr | `nostr-signaling.js`, `webrtc-peer.js` | M |
| F2 | Convite que já faz o pareamento | crescimento + infra | links de convite do WhatsApp e Telegram | `airgap-webrtc.js`, `qr-url.js` | P |
| F3 | Canal de transmissão da comunidade | alcance | Canais do WhatsApp e do Telegram | `peers.js`, `posse-dispatch.js` | M |
| F4 | Vaquinha transparente | dinheiro sem custódia | Apoia.se, Super Follows (X), assinaturas do Instagram, Wikipedia | `brcode.js`, `perma-notary.js` | P |
| F5 | Mídia pela malha, hash no Arweave | infra | vídeo curto do TikTok e do Kwai (lo-fi) | `chunked-transfer.js`, `media-blob.js` | M |
| F6 | Modo Guardião noturno | infra | BitTorrent, economia de dados do Telegram | `seeder-guardian.js`, `storage-persistence.js`, `voxels.js` | M |
| F7 | Notas da Comunidade por ponte | moderação | Community Notes (X) | `bridging-rank.js` | M |
| F8 | Selo de confiança por aval | anti-sybil | selo do Instagram e do Threads (grátis e distribuído) | `civic-credential.js`, `identity-link.js` | M |
| F9 | Pauta legislativa automática | conteúdo | Tramitado, Sua Voz, e-Cidadania | `frames.js`, contrato LCP | G |
| F10 | Resumo semanal + bot do Telegram | crescimento | newsletter do Substack, bots do Telegram | `story-card.js`, `share.js` | P |

Esforço: **P** = plugar um módulo que já existe, com UI pequena · **M** = lógica nova moderada + testes · **G** = componente novo, como um cron externo.

---

## F1 — Sinalização sem servidor (Nostr + trackers WebTorrent)

- **Inspiração:** Nostr, que usa relays públicos e baratos operados por terceiros.
- **O que é:** terminar o `nostr-signaling.js` (hoje só lista relays) para trocar ofertas e respostas SDP como eventos efêmeros assinados em relays Nostr públicos, usando os trackers WebTorrent de `signaling.json` como segundo caminho. O Render vira um entre vários caminhos, e não o único.
- **Por que sustenta:** elimina o SPOF nº 1 de [INFRA-CUSTOS §4](./INFRA-CUSTOS.md#4-pontos-únicos-de-falha-ordem-de-gravidade) e a dependência do cron de keepalive.
- **Custo:** R$ 0 (relays públicos).
- **Riscos:** rate limit dos relays, políticas sobre kinds efêmeros e privacidade de metadados (SDP expõe IP), que pede cifrar o SDP para o par. Pesquisar no Prompt 2, item 3.
- **DoD:** dois aparelhos conectam com o Render desligado; teste em `tests/nostr-signaling.test.js` cobrindo o envelope; flag `signaling.nostr` desligada por padrão no primeiro release.

## F2 — Convite que já faz o pareamento (QR/link)

- **Inspiração:** links de convite de grupo do WhatsApp e do Telegram.
- **O que é:** plugar o `airgap-webrtc.js` (pareamento SDP por QR, já testado). O convite carrega a comunidade e uma oferta de pareamento: quem entra conecta direto em quem convidou, sem passar por servidor, e já recebe o espelho da comunidade por gossip.
- **Por que sustenta:** o crescimento passa a ser um laço gratuito pessoa→pessoa, e cada entrada já cria uma aresta da malha.
- **Custo:** R$ 0.
- **Riscos:** QR grande (SDP), e o convite expira rápido. Usar um link curto e trocar o SDP por F1 quando houver rede.
- **DoD:** fluxo "Convidar" no perfil e na comunidade; entrada funcionando sem sinalização pública; métrica honesta de convites aceitos, guardada só localmente.

## F3 — Canal de transmissão da comunidade

- **Inspiração:** Canais do WhatsApp e canais do Telegram (um-para-muitos, sem resposta no fio).
- **O que é:** um tipo de post `broadcast` que só a moderação ou o steward da comunidade publica, assinado. Os aparelhos de quem segue priorizam retransmitir por gossip (reaproveitando a prioridade de WANT) e um resumo sai automaticamente pelo POSSE para o WhatsApp e o Telegram, sempre com confirmação humana.
- **Por que sustenta:** alcance garantido para avisos (assembleia, mutirão) sem algoritmo e sem impulsionamento pago, porque a distribuição vem dos próprios seguidores.
- **Custo:** R$ 0.
- **Riscos:** virar spam. Limite de frequência por comunidade, decidido em governança.
- **DoD:** tag `Type: broadcast` documentada; aba "Avisos" na comunidade; teste de propagação no gossip.

## F4 — Vaquinha transparente (comunidade e projeto)

- **Inspiração:** Apoia.se e catarse, Super Follows do X, assinaturas do Instagram, banner de doação da Wikipedia.
- **O que é:** uma **meta mensal pública** por comunidade ("R$ 30/mês: VPS do relay buddy + TURN"), com a chave Pix do coletivo e QR gerados offline (`brcode.js`). A prestação de contas fica ancorada no `perma-notary.js` (recibo e uso, com hash no Arweave). Quem apoia pode se autodeclarar, e o Vox não verifica nem custodia nada. Para o projeto: `.github/FUNDING.yml` e uma página de transparência ligada ao [INFRA-CUSTOS.md](./INFRA-CUSTOS.md).
- **Por que sustenta:** cobre os únicos custos reais que podem surgir (TURN, AR para mídia >100 KiB, relay público) sem anúncio e sem taxa.
- **Custo:** R$ 0 para a plataforma; o dinheiro vai direto entre as pontas.
- **Riscos:** regulatório (não é arranjo de pagamento, mas é preciso revisar a COMPLIANCE-BR) e confiança, o que pede contas públicas obrigatórias para manter o selo de "meta ativa". Pesquisar no Prompt 2, item 8.
- **DoD:** bloco "Meta da comunidade" na aba Membros; template de prestação de contas; nota no COMPLIANCE-BR; nenhum endpoint novo.

## F5 — Mídia pela malha, só o hash no Arweave

> **Revisado em 2026-11-07:** a ideia original era fatiar a mídia em itens de até 100 KiB para ficar no grátis do Turbo. O endpoint público do Turbo mostra que a gratuidade tem **cota por bytes totais** (`https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB)), então fatiar não economiza nada. A versão abaixo inverte a lógica.

**Ideia original (descartada):**

- **Inspiração:** vídeo curto do TikTok e do Kwai, em versão lo-fi para dados móveis.
- **O que é:** plugar o `chunked-transfer.js`. A mídia é dividida em itens ANS-104 de até 100 KiB mais um manifesto (no padrão de path manifest do Arweave), e o cliente remonta na leitura. Vídeos de 10 s e carrosséis continuam no free tier do Turbo em vez de cair no L1 pago.
- **Por que sustenta:** remove o custo por byte, que é o único que cresce com o uso.
- **Custo:** R$ 0, **se** os termos permitirem.
- **Riscos:** inviável como economia, porque a cota é por bytes.

**Versão revisada:** a mídia circula pela malha (gossip de BLOB, cache local, espelhos de steward e modo Guardião da F6, reaproveitando `chunked-transfer.js` para dividir o blob entre pares). Só o post de texto, com o **SHA-256 da mídia**, vai para o Arweave. Quem quiser a mídia permanente paga o crédito, ou a comunidade paga pela vaquinha (F4). Assim a cota grátis rende para texto, que é o registro cívico que importa.
- **Risco da versão revisada:** a mídia some se nenhum par guardar. A UI precisa dizer isso com honestidade ("mídia mantida pela comunidade" × "permanente").
- **DoD:** upload de vídeo de 10 s sem AR na carteira; leitura remonta e confere o SHA-256; teste em `chunked-transfer.test.js` e `upload.test.js`.

## F6 — Modo Guardião noturno

- **Inspiração:** seeding do BitTorrent e economia de dados do Telegram ("só no Wi-Fi").
- **O que é:** plugar `seeder-guardian.js` + `storage-persistence.js` e registrar `periodicSync` no `sw.js`. Com o aparelho no carregador e no Wi-Fi, ele vira relay/cache da comunidade (gossip, espelho, blobs) e soma **Voxels de uptime**, que já existem no `voxels.js`. O PWA pede `navigator.storage.persist()` para não ser despejado.
- **Por que sustenta:** a infra passa a vir dos usuários, aplicando na prática a tese "Adote um Vox Populi".
- **Custo:** R$ 0 (energia de quem participa).
- **Riscos:** suporte desigual a `periodicSync` (bom no Chrome Android, ausente no iOS) e bateria. Prompt 2, item 5. Sempre opt-in, com aviso honesto.
- **DoD:** interruptor em `#/settings/network`; estado visível na estela do nó; teste das condições (carregador, Wi-Fi) com mocks.

## F7 — Notas da Comunidade por ponte

- **Inspiração:** Community Notes do X, com algoritmo de *bridging*: a nota só aparece quando pessoas que costumam discordar concordam.
- **O que é:** plugar o `bridging-rank.js`. Qualquer membro propõe uma nota de contexto em um post; a nota é exibida só quando avaliada como útil por perfis de "lados" diferentes, usando o histórico de posicionamentos `civic-vote` como sinal. Tudo calculado no cliente.
- **Por que sustenta:** escala a moderação sem moderador pago nem central, reduz a carga de E1–E5 e combina com a tese da praça E+D.
- **Custo:** R$ 0.
- **Riscos:** cold start (poucas avaliações) e manipulação coordenada. Mitigar exigindo F8 para avaliar.
- **DoD:** tags `Type: context-note` e `note-rating`; exibição com "por que esta nota aparece"; teste do ranking com casos de brigada.

## F8 — Selo de confiança por aval de pessoas

- **Inspiração:** selo azul do Instagram e do Threads, só que grátis, distribuído e revogável.
- **O que é:** plugar `civic-credential.js` + `identity-link.js`. Uma conta recebe o selo "conhecida pela comunidade" quando M membros já avalizados assinam um aval, como uma web of trust local. O aval pode ser revogado, e o selo vale por comunidade.
- **Por que sustenta:** anti-spam e anti-sybil sem KYC e sem custo, e sustenta a legitimidade de enquetes e votos (o README já admite que "1 chave ≠ 1 pessoa").
- **Custo:** R$ 0.
- **Riscos:** exclusão de quem chega sozinho e panelinha. Mitigar com o selo opcional para postar e exigido só para votar em pauta formal, com o limiar M decidido em governança.
- **DoD:** fluxo "Avalizar" no perfil; selo na UI com M/N visível; teste de revogação e de limiar.

## F9 — Pauta legislativa automática

- **Inspiração:** Tramitado (explica PLs), Sua Voz e e-Cidadania (consulta pública), usando as APIs de dados abertos da Câmara e do Senado.
- **O que é:** um workflow agendado no GitHub Actions (grátis em repositório público) lê as APIs abertas e publica no Pages um **manifesto assinado** de proposições da semana, no contrato LCP H1 do [brainstorm Tramitado × Vox](./brainstorm-sinergia-tramitado-vox-2026-11.md). O cliente mostra um Open Frame `legislative-card` e abre um tópico por PL (`vox:topic:br-camara-pl-NNNN-AAAA`), com aviso de versão quando sai um substitutivo.
- **Por que sustenta:** fonte constante de conteúdo cívico sem custo editorial, que dá motivo para voltar ao app.
- **Custo:** R$ 0 (Actions + Pages).
- **Riscos:** limites das APIs públicas, neutralidade editorial (mostrar só dados oficiais, sem resumo opinativo próprio) e a barreira de privacidade "Decidir" do Tramitado. Prompt 2, item 6.
- **DoD:** workflow com manifesto assinado (Ed25519) e proteção contra rollback; frame renderizado; teste do parser do manifesto.

## F10 — Resumo semanal para grupos + bot do Telegram

- **Inspiração:** newsletter do Substack (digest semanal) e bots do Telegram.
- **O que é:** um cartão "o que rolou na comunidade esta semana" gerado no cliente (`story-card.js`: top tópicos, votações abertas, avisos de F3) e compartilhado no WhatsApp ou Instagram Stories com um toque. Um bot do Telegram (Bot API grátis, com polling feito por GitHub Actions agendado, sem servidor) responde `/comunidade` com o link canônico e o resumo público.
- **Por que sustenta:** funil de volta para o Vox a partir de onde as pessoas já estão, sem anúncio.
- **Custo:** R$ 0.
- **Riscos:** o atraso do polling (aceitável para digest) e o token do bot, que precisa ficar em secret do Actions. Só conteúdo público.
- **DoD:** botão "Resumo da semana" na comunidade; workflow do bot documentado no INFRA-CUSTOS; teste do gerador de cartão.

**Bônus (fora das 10):** plugar o `kit-genesis.js` (modelos de associação de moradores, sindicato e coletivo com regras e Feira já configuradas) para baixar o custo de quem organiza a primeira comunidade.

## Ordem sugerida

1. **F1 + F2**: tiram o SPOF e criam crescimento pessoa→pessoa. Base para todo o resto.
2. **F6**: a infra passa a vir dos usuários.
3. **F8 → F7**: a confiança destrava a moderação por ponte.
4. **F4**: só quando surgir o primeiro custo real (TURN ou relay público).
5. **F3, F10, F9**: alcance e conteúdo.
6. **F5**: só depois da resposta do Prompt 2, item 1.

---

## Prompts de pesquisa (Gemini Deep Research)

Os três prompts são **autossuficientes**: cada um traz o contexto do projeto, os links públicos dos arquivos do repositório e as fontes externas por onde começar, para que um agente **sem acesso local ao código** (Gemini Deep Research, Perplexity, ChatGPT Deep Research) consiga trabalhar. Cole um de cada vez, na ordem **1 → 2 → 3**. Se quiser, cole o relatório do anterior no fim do seguinte.

> **Links do repositório:** apontam para a branch `docs/revisao-estado-2026-11` (PR yurikayel/vox#13). Depois do merge, se a branch for apagada, troque `docs/revisao-estado-2026-11` por `main` nas URLs. Os links `raw.githubusercontent.com` entregam o texto puro, que é mais fácil de o agente ler; para navegar, use `https://github.com/yurikayel/vox/tree/main`.

### Prompt 1 — O que falta para o Vox se sustentar sozinho (diagnóstico + comparação)

```text
Responda em português do Brasil. Você é um pesquisador de arquitetura de redes sociais descentralizadas e de
sustentabilidade de projetos de software livre. Faça uma pesquisa profunda e entregue um relatório.

## Contexto do projeto (resumo confiável, nov/2026)
O Vox (github.com/yurikayel/vox, AGPL-3.0) é uma rede social cívica brasileira, local-first:
- Cliente: PWA em JavaScript puro (ES modules, sem build, sem framework), publicado no GitHub Pages
  (https://yurikayel.github.io/vox/) e num espelho no Cloudflare Pages. Também há micro-APK Android e
  executáveis desktop que abrem o PWA.
- Identidade: chave ECDSA P-256 gerada no aparelho; cofre cifrado para recuperação (PBKDF2 + AES-GCM).
- Dados públicos: posts assinados como itens ANS-104 e enviados direto do navegador ao bundler Turbo
  (ArDrive) para ficarem permanentes no Arweave; leitura por GraphQL em gateways públicos.
- Malha P2P: WebRTC DataChannel com gossip (WANT/HAVE/BLOB, cartões de perfil, manifestos de cache).
  A descoberta de pares depende de UM servidor de sinalização WebSocket no plano gratuito do Render,
  mantido acordado por um cron do GitHub Actions a cada 14 min. Não há TURN.
- Relay opcional em Python (stdlib): cache, inbox de DM com TTL de 72 h, espelho de comunidade, memória
  central, troca de código OAuth. Hoje NÃO existe instância pública; só roda na máquina de voluntários.
- Produto: feed Social/Cívico, comunidades estilo Orkut, propostas com diff e voto assinado, enquetes,
  Feira (classificados), Pix Zaps (QR Pix gerado offline, 0% de taxa, sem custódia), DMs E2E,
  republicação assistida para Bluesky/X/WhatsApp/Telegram (POSSE).
- Princípios inegociáveis: nenhuma custódia de dinheiro, nenhum alcance pago, nenhuma telemetria de
  terceiros, copy honesta (nada anunciado como pronto antes de estar no ar), LGPD e Marco Civil.
- Custo atual em dinheiro: R$ 0/mês, mas sobre free tiers de terceiros. Fato observado em 2026-11-07 no
  endpoint público https://upload.ardrive.io/info: "freeTier":{"lifetimeBytes":10485760,
  "ipBytes":10485760,"maxItemBytes":107520} — ou seja, o upload grátis tem cota (~10 MiB por carteira e
  por IP), e não é ilimitado como a documentação antiga dizia.
- Onze módulos já escritos e testados não estão plugados na interface: pareamento WebRTC por QR
  (airgap-webrtc), ranking por ponte estilo Community Notes (bridging-rank), transferência em blocos
  (chunked-transfer), credencial cívica e vínculo de identidade (civic-credential, identity-link), kits de
  comunidade (kit-genesis), modo guardião / celular como nó (seeder-guardian), persistência de storage
  (storage-persistence), depoimentos (testimonials), identidade Ed25519 (vox-identity) e runtime Webxdc.
  A sinalização via Nostr é só um stub.

## Leia primeiro (fontes do projeto)
- Estado real de cada funcionalidade: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/FEATURES.md
- Infra, custos e pontos únicos de falha: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/INFRA-CUSTOS.md
- Roadmap atual: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/ROADMAP.md
- As 10 features candidatas (F1–F10): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/brainstorm-autossustento-10-features-2026-11.md
- Posicionamento e limites: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/POSITIONING.md
- Tese de infra a custo zero (celulares como nós): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/brainstorm-sustentacao-perene-celulares-nos-base.md
- Meta de rede sustentada por participantes: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/rede-sustentada-participantes.md
- API do relay: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/relay-api.md
- Configuração real de sinalização: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/client/config/signaling.json
- Upload (Turbo / L1): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/client/js/upload.js
- Stub de Nostr: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/client/js/nostr-signaling.js

## Projetos para comparar (pesquise como cada um se sustenta e onde gasta dinheiro)
- Nostr: https://github.com/nostr-protocol/nips (relays pagos, zaps, NIP-01 eventos efêmeros)
- Bluesky / AT Protocol: https://docs.bsky.app/ (quem paga PDS, relay e AppView)
- Mastodon / Fediverso: https://joinmastodon.org/ (custos de instância, financiamento via Patreon/Open Collective)
- Briar (mesh P2P sem servidor): https://briarproject.org/
- Delta Chat + Webxdc: https://delta.chat/ e https://webxdc.org/
- Scuttlebutt / Manyverse: https://scuttlebutt.nz/
- Financiamento de bens comuns: https://opencollective.com/ e o modelo de doações da Wikipedia

## Perguntas
1. Que dependências do Vox são pontos únicos de falha ou têm custo escondido que vai aparecer com
   crescimento (100, 1.000 e 10.000 usuários ativos)? Estime ordem de grandeza.
2. Para cada uma das 10 features F1–F10: ela ataca um problema real do diagnóstico? Existe projeto que
   já fez algo parecido? Funcionou? O que deu errado?
3. Quais lacunas NÃO estão cobertas pelas F1–F10 (ex.: moderação de conteúdo ilegal, abuso, spam em
   escala, backup de chaves, descoberta de comunidades, onboarding de quem não é técnico)? Proponha até
   5 features extras com o mesmo critério: custo marginal ~zero, sem custódia, sem alcance pago.
4. Entre os 11 módulos escritos e não plugados, quais dão mais retorno de sustentabilidade se forem
   plugados primeiro, e por quê?

## Formato da resposta
- Resumo executivo (10 linhas).
- Tabela: item · problema que resolve · evidência (fonte com URL e data) · impacto (alto/médio/baixo) ·
  esforço estimado (P/M/G) · risco.
- Seção de comparação com os projetos acima.
- Lista final priorizada (top 10) do que o Vox deve fazer primeiro.
Separe claramente FATO (com fonte) de INFERÊNCIA (sua análise). Não invente números; se não achar, diga.
```

### Prompt 2 — Viabilidade a custo zero (limites, termos de uso e lei)

```text
Responda em português do Brasil. Você é um pesquisador técnico e regulatório. Faça uma pesquisa profunda
com fontes primárias e datadas (documentação oficial, termos de uso, changelogs, código-fonte, leis e
normas — de preferência de 2025–2026) e entregue um relatório.

## Contexto
O Vox (github.com/yurikayel/vox) é uma rede social cívica brasileira, local-first, em PWA JavaScript puro,
sem servidor próprio pago. Ele publica posts assinados (itens ANS-104) direto do navegador no bundler
Turbo/ArDrive (Arweave), descobre pares WebRTC por UM servidor de sinalização WebSocket no plano gratuito do
Render (mantido acordado por cron do GitHub Actions a cada 14 min), não tem TURN e hospeda o app no GitHub
Pages + Cloudflare Pages. Regras do projeto: nenhuma custódia de dinheiro, nenhum alcance pago, LGPD.
Mapa de infra: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/INFRA-CUSTOS.md
Features em avaliação: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/brainstorm-autossustento-10-features-2026-11.md
F1 sinalização WebRTC via relays Nostr públicos + trackers WebTorrent; F2 convite por QR que já faz o
pareamento WebRTC; F3 canal de avisos repassado por gossip; F4 vaquinha transparente via Pix direto na chave
do coletivo; F5 mídia servida pela malha P2P com só o hash no Arweave; F6 modo guardião (celular no
carregador + Wi-Fi vira nó, usando Periodic Background Sync); F7 notas de contexto por algoritmo de ponte;
F8 selo de confiança por aval de M membros; F9 pauta legislativa automática a partir de dados abertos;
F10 resumo semanal + bot do Telegram por polling no GitHub Actions.

## Itens a pesquisar (para cada um: o que vale hoje · fonte com URL e data · risco de mudar · impacto nas F1–F10)
1. Turbo/ArDrive — cota grátis. Em 2026-11-07, https://upload.ardrive.io/info retornou
   "freeTier":{"lifetimeBytes":10485760,"ipBytes":10485760,"maxItemBytes":107520}. Confirme o significado
   exato (vitalício por carteira? por IP por período?), quando a política mudou, como o SDK expõe isso
   (getFreeStatus) e quanto custa o crédito depois da cota. Fontes:
   https://upload.ardrive.io/info · https://github.com/ardriveapp/turbo-sdk · https://docs.ar.io/learn/turbo ·
   https://docs.ar.io/build/upload/turbo-credits · ANS-104: https://github.com/ArweaveTeam/arweave-standards/blob/master/ans/ANS-104.md
2. Free tiers para servidor WebSocket de sinalização: horas/mês, sleep por inatividade, conexões
   simultâneas, proibições (ex.: keepalive artificial). Render https://render.com/docs/free ·
   Hugging Face Spaces https://huggingface.co/docs/hub/spaces-overview ·
   Cloudflare Workers/Durable Objects https://developers.cloudflare.com/workers/platform/limits/ e
   https://developers.cloudflare.com/durable-objects/ · Deno Deploy https://deno.com/deploy/pricing ·
   Koyeb https://www.koyeb.com/pricing · Fly.io https://fly.io/docs/about/pricing/ ·
   GitHub Actions https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
3. Sinalização WebRTC sobre Nostr: kinds efêmeros (NIP-01, faixa 20000–29999), NIPs relevantes, rate limits
   típicos de relays públicos (damus, nos.lol, primal…), projetos que já fazem isso, e como esconder o IP
   que vai no SDP. Fontes: https://github.com/nostr-protocol/nips/blob/master/01.md ·
   https://github.com/nostr-protocol/nips · trackers WebTorrent como sinalização:
   https://github.com/webtorrent/bittorrent-tracker
4. TURN: opções gratuitas ou comunitárias confiáveis, custo de banda de um coturn em VPS barata e
   alternativas (TURN em TCP 443, um par fazendo relay para outro). Fontes: https://github.com/coturn/coturn ·
   https://webrtc.org/getting-started/turn-server
5. Suporte real, em 2026, a Periodic Background Sync, Storage Persistence (navigator.storage.persist) e
   Web Push em PWA instalado no Chrome Android, Samsung Internet, Firefox Android e Safari iOS.
   Fontes: https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API ·
   https://caniuse.com/periodic-background-sync ·
   https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist ·
   https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
6. Dados abertos legislativos: endpoints de proposições, tramitação e votações, limites de uso, licença;
   como o Tramitado, o e-Cidadania do Senado e plataformas "Sua Voz" usam esses dados.
   Fontes: https://dadosabertos.camara.leg.br/swagger/api.html · https://legis.senado.leg.br/dadosabertos/docs/ ·
   https://www12.senado.leg.br/ecidadania · https://tramitado.com.br
7. Mecânicas copiáveis sem servidor central: algoritmo de Community Notes (matrix factorization, "bridging"),
   Canais do WhatsApp, links de convite, Super Follows/assinaturas, bots do Telegram por polling (getUpdates).
   Fontes: https://github.com/twitter/communitynotes ·
   https://communitynotes.x.com/guide/en/under-the-hood/ranking-notes ·
   https://faq.whatsapp.com/549900560675125 · https://core.telegram.org/bots/api
8. Brasil — vaquinha por Pix direto na chave de um coletivo, sem intermediação: quando vira arranjo de
   pagamento, quando exige CNPJ, implicações tributárias e de transparência, e como a LGPD trata a lista
   pública de apoiadores. Fontes: https://www.bcb.gov.br/estabilidadefinanceira/pix ·
   LGPD https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm ·
   Marco Civil https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm ·
   ANPD https://www.gov.br/anpd/pt-br

## Formato da resposta
- Uma seção por item (1–8): resposta direta · evidência citada (URL + data de acesso/publicação) · risco ·
  quais features muda e como.
- Tabela final: feature F1–F10 · viável? (sim / sim com ressalva / não) · motivo · fonte principal.
- Listas: (a) features bloqueadas ou inviáveis; (b) features mais baratas ou fáceis do que o previsto;
  (c) as 3 perguntas que continuam abertas.
Não é parecer jurídico: indique onde é preciso advogado. Separe FATO (com fonte) de INFERÊNCIA.
```

### Prompt 3 — Como construir cada feature no Vox (especificação técnica)

```text
Responda em português do Brasil. Você é um arquiteto de software sênior especialista em PWA, WebRTC e
protocolos P2P. Leia o código e os documentos públicos indicados abaixo e escreva especificações de
implementação. Não escreva o código completo; escreva specs que um desenvolvedor ou agente consiga executar.
Se você tiver os relatórios das pesquisas anteriores (diagnóstico e viabilidade), use as conclusões deles e
descarte ou adapte as features marcadas como inviáveis.

## Contexto e regras do projeto Vox (github.com/yurikayel/vox)
- PWA em JavaScript puro, ES modules, SEM build e SEM framework; nenhuma dependência de runtime nova sem ADR.
- Limites de complexidade por função: LLOC ≤ 30, aninhamento ≤ 4, complexidade cognitiva ≤ 15
  (auditados por ESLint em CI).
- Service Worker com precache: todo módulo novo entra em SHELL_ASSETS e exige bump de CACHE_NAME.
- Testes: node:test em tests/*.test.js (com mocks de navegador em tests/setup.js); relay Python com unittest.
- Fluxos de UI em etapas ("uma decisão por tela") usando o componente genérico de etapas já existente.
- Transações públicas usam a tag App-Name: vox-brasil e uma tag Type; mensagens de malha são gossip
  assinado (GOSSIP, UPDATE, DELETE, WANT, BLOB, PROFILE_CARD, CACHE_MANIFEST).
- Princípios: sem custódia de dinheiro, sem alcance pago, sem telemetria de terceiros, LGPD, copy honesta.
- Fato importante: o upload grátis do Turbo tem cota (~10 MiB por carteira/IP, maxItemBytes 107520,
  segundo https://upload.ardrive.io/info em 2026-11-07). Planeje para gastar pouco permaweb.
- Edição por agentes de IA: um agente por arquivo por vez, então a divisão em lotes não pode pôr dois
  lotes no mesmo arquivo.

## Documentos (leia antes)
- Features F1–F10: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/brainstorm-autossustento-10-features-2026-11.md
- Catálogo do que existe: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/FEATURES.md
- Arquitetura (protocolo e tags): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/ARCHITECTURE.md
- Arquitetura (camadas do cliente): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/ARCHITECTURE.md
- Limites de complexidade: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/HARDENING.md
- Testes e CI: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/TESTES.md
- Como contribuir: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/CONTRIBUTING.md
- Contrato legislativo LCP (para F9): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/brainstorm-sinergia-tramitado-vox-2026-11.md
- Conformidade Brasil (para F4): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/COMPLIANCE-BR.md
- Índice de decisões (ADRs): https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/docs/adr/README.md

## Código a reaproveitar (prefixo de URL — acrescente o caminho do arquivo; o prefixo sozinho não abre: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/client/js/)
- F1: nostr-signaling.js, webrtc-peer.js, ../config/signaling.json
- F2: airgap-webrtc.js, qr-url.js
- F3: peers.js, posse-dispatch.js, share.js
- F4: brcode.js, pix-key.js, perma-notary.js
- F5: chunked-transfer.js, media-blob.js, upload.js, peers-blob-affinity.js
- F6: seeder-guardian.js, storage-persistence.js, voxels.js, ../sw.js
- F7: bridging-rank.js, civic-post.js, moderation.js
- F8: civic-credential.js, identity-link.js, governance.js
- F9: frames.js, open-frames-host.js
- F10: story-card.js, share.js
- Componente de etapas: app/compose-stepper.js, render/compose-steps.js
- Rotas: app/route-parse.js
(Exemplo de URL completa: https://raw.githubusercontent.com/yurikayel/vox/docs/revisao-estado-2026-11/client/js/airgap-webrtc.js)

## Para cada feature F1–F10, entregue
1. Objetivo em 1 frase e o problema de sustentabilidade que resolve.
2. Módulos existentes a reaproveitar (caminhos exatos) e o que já fazem hoje (cite o que leu no código).
3. Arquivos novos e alterados.
4. Formato de dados: tags (App-Name/Type/…) ou mensagem de gossip, com exemplo JSON.
5. Fluxo de UI em etapas (rota, telas, textos honestos para o usuário).
6. Casos de teste (nome do arquivo em tests/ e o que cada caso verifica).
7. Flag de rollout e valor padrão; métrica honesta de sucesso (local, sem telemetria).
8. Riscos (segurança, privacidade, abuso, custo) e plano de reversão.
9. Esforço P/M/G.

## Termine com
- Sequência recomendada de implementação e o porquê (dependências entre features).
- Divisão em lotes paralelos sem dois lotes no mesmo arquivo.
- Rascunhos de ADR necessários (título + decisão em 3 linhas cada).
- Linhas novas para o ROADMAP no formato: ID · tipo (doc/code/ops-humano) · item · evidência esperada.
Cite trechos de código pelo caminho do arquivo. Quando não conseguir ler um arquivo, diga qual.
```
