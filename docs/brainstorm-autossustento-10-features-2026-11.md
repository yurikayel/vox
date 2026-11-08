# Brainstorm — 10 features para a rede se sustentar sozinha a custo ~zero

> **Status:** brainstorm · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-07
> **Não substitui o [ROADMAP.md](./ROADMAP.md)**: as features entram lá como *Candidatas* F1–F10 e só ganham caixa com DoD e responsável. Também não substitui [brainstorm-sustentacao-perene-celulares-nos-base.md](./brainstorm-sustentacao-perene-celulares-nos-base.md) (tese de infra $0), que esta lista complementa com produto.

## Ponto de partida

A auditoria de nov/2026 ([FEATURES.md](./FEATURES.md), [INFRA-CUSTOS.md](./INFRA-CUSTOS.md)) mostra que o custo hoje é **R$ 0**, mas a rede ainda depende de pontos que não se sustentam sozinhos:

- **Infra:** 1 nó de sinalização (Render), nenhum TURN, nenhum relay completo público, e o subsídio do Turbo para itens ≤100 KiB.
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
| F5 | Mídia fatiada ≤100 KiB | infra | vídeo curto do TikTok e do Kwai (lo-fi) | `chunked-transfer.js`, `ans104.js` | M |
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

## F5 — Mídia fatiada em itens ≤100 KiB

- **Inspiração:** vídeo curto do TikTok e do Kwai, em versão lo-fi para dados móveis.
- **O que é:** plugar o `chunked-transfer.js`. A mídia é dividida em itens ANS-104 de até 100 KiB mais um manifesto (no padrão de path manifest do Arweave), e o cliente remonta na leitura. Vídeos de 10 s e carrosséis continuam no free tier do Turbo em vez de cair no L1 pago.
- **Por que sustenta:** remove o custo por byte, que é o único que cresce com o uso.
- **Custo:** R$ 0, **se** os termos permitirem.
- **Riscos:** **bloqueante.** É preciso confirmar se o Turbo/ArDrive permite fatiar mídia em vários itens subsidiados, e por quanto tempo vale o subsídio. Prompt 2, item 1. Se não permitir, a alternativa é a malha (F6) servir a mídia e só o hash ir para o Arweave.
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

## Prompts de pesquisa

Use na ordem: **1** (o que falta, olhando o código) → **2** (o que o mundo permite, olhando fontes externas) → **3** (como construir aqui).

### Prompt 1 — Auditoria do que falta (agente com acesso ao repo)

```text
Você é um revisor técnico do repositório Vox (PWA vanilla JS sem build em client/, relay Python stdlib em relay/,
testes node:test + unittest). Leia docs/FEATURES.md, docs/ROADMAP.md, docs/INFRA-CUSTOS.md,
client/js/app/route-parse.js e o precache (SHELL_ASSETS) de client/sw.js.

Para cada módulo em client/js/** classifique: no ar / depende de config / lab / escrito-não-plugado / stub / demo,
com evidência (quem importa o módulo, rota que o usa, arquivo de teste). Depois liste:
(a) módulos escritos mas não carregados e o que falta para plugar cada um (UI, rota, flag, testes);
(b) dependências de servidor que não existem publicamente (inbox de DM, /oauth/exchange, memória central, TURN);
(c) fluxos que caem em mock.js quando a rede falha e o que o usuário vê nesse caso;
(d) as lacunas de código para cada uma das 10 features de docs/brainstorm-autossustento-10-features-2026-11.md.

Saída: uma tabela priorizada com colunas item · impacto em autossustento (alto/médio/baixo) · esforço (P/M/G) ·
risco · arquivos envolvidos. Não proponha código novo onde já existe módulo. Aponte qualquer divergência entre
docs/FEATURES.md e o código. Não edite arquivos.
```

### Prompt 2 — Pesquisa externa: viabilidade a custo zero

```text
Pesquise, usando fontes primárias com data (documentação oficial, termos de uso, changelogs e posts de engenharia
de 2025–2026), a viabilidade técnica e contratual de manter uma rede social P2P cívica brasileira a custo ~zero.
Para cada item, responda: o que vale hoje, a fonte com URL e data, o risco de mudar, e se isso altera alguma das
features F1–F10 descritas abaixo.

1. Turbo/ArDrive: limite atual do upload subsidiado (≤100 KiB?), se é permitido fatiar uma mídia em vários itens
   subsidiados, limites de taxa por IP/carteira, e o histórico de mudanças nessa política.
2. Free tiers para WebSocket/sinalização: Render, Hugging Face Spaces, Cloudflare Workers/Durable Objects/Pages,
   Deno Deploy, Koyeb, Fly.io — horas, sleep, conexões simultâneas, proibições de uso.
3. Sinalização WebRTC sobre relays Nostr públicos: NIPs e kinds efêmeros aplicáveis, rate limits típicos,
   projetos que já fazem isso, e privacidade do SDP (IP). E também trackers WebTorrent públicos como sinalização.
4. TURN: opções gratuitas ou comunitárias confiáveis, custo de banda de um coturn em VPS barata, e alternativas
   (relay pelo próprio par, TURN-over-TCP 443).
5. Periodic Background Sync, Storage Persistence (navigator.storage.persist) e Web Push sem servidor próprio:
   suporte real em Chrome Android, Samsung Internet, Firefox Android e Safari iOS 18/19 (PWA instalado).
6. Dados abertos da Câmara e do Senado: endpoints de proposições e votações, limites, licença de uso; como
   Tramitado, e-Cidadania (Senado) e "Sua Voz" usam esses dados.
7. Mecânica de produto copiável sem servidor central: algoritmo de Community Notes (bridging, código aberto do X),
   Canais do WhatsApp e do Telegram, links de convite, Super Follows/assinaturas, bots do Telegram via polling.
8. Brasil: regras do Bacen e da LGPD para "vaquinha" via Pix direto à chave de um coletivo, sem custódia nem
   intermediação; quando algo vira arranjo de pagamento ou exige CNPJ; obrigações de transparência.

Features: F1 sinalização via Nostr/trackers; F2 convite com pareamento por QR; F3 canal de transmissão por gossip;
F4 vaquinha Pix transparente; F5 mídia fatiada ≤100 KiB no Turbo; F6 modo guardião noturno (periodicSync);
F7 notas da comunidade por ponte; F8 selo por aval M-de-N; F9 pauta legislativa por cron + manifesto assinado;
F10 resumo semanal + bot do Telegram por polling no GitHub Actions.

Termine com: (a) as features bloqueadas ou inviáveis; (b) as que ficam mais baratas ou fáceis do que o previsto;
(c) as 3 perguntas que continuam abertas.
```

### Prompt 3 — Como construir aqui (agente com acesso ao repo, modo design)

```text
Para cada feature F1–F10 de docs/brainstorm-autossustento-10-features-2026-11.md (use as conclusões da pesquisa
externa do Prompt 2 se estiverem disponíveis; descarte ou adapte o que ela marcou como inviável), escreva uma
mini-spec de implementação no Vox, respeitando as regras do projeto:
- JS vanilla, ES modules, sem build e sem nova dependência de runtime sem ADR;
- limites de docs/HARDENING.md (LLOC ≤ 30 por método, nesting ≤ 4, complexidade cognitiva ≤ 15),
  conferidos com npm run audit:complexity;
- bump de CACHE_NAME e SHELL_ASSETS em client/sw.js quando o shell mudar;
- mutex de um agente por arquivo (docs/metodo-agentes-mutex-e-revisor.md);
- AGPL-3.0-or-later; LGPD e COMPLIANCE-BR.md; o Vox não custodia dinheiro nem vende alcance;
- copy honesta: nada descrito como pronto antes de estar no ar.

Cada spec deve ter: objetivo em 1 frase; módulos existentes a reaproveitar (caminhos exatos em client/js/);
arquivos novos e alterados; formato de mensagem/tag (App-Name: vox-brasil, Type: …) ou de gossip; fluxo de UI
em etapas no padrão de app/compose-stepper.js e render/compose-steps.js; casos de teste em tests/*.test.js
(e relay/test_*.py, se tocar o relay); flag de rollout e default; métrica honesta de sucesso, local e sem
telemetria; riscos e plano de reversão; esforço P/M/G.

Termine com: (1) a sequência recomendada e o porquê, considerando as dependências entre features;
(2) a divisão em lotes para agentes paralelos sem dois agentes no mesmo arquivo;
(3) os rascunhos de ADR necessários (título + decisão em 3 linhas);
(4) as linhas a acrescentar em docs/ROADMAP.md (ID, tipo de DoD, evidência esperada).
Não edite arquivos; entregue a spec como texto.
```
