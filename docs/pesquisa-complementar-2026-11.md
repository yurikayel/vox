# Pesquisa complementar (nov/2026) — Prompt 4 executado + brainstorm B1–B12

> **Status:** pesquisa · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08 (v2: §5 avalia o relatório do Gemini para o Prompt 4)
> **Não substitui o [ROADMAP.md](./ROADMAP.md)**: as decisões viram linhas lá (REV-12, REV-13 revistos; REV-18 a REV-23 novos). Continua a [pesquisa-deep-research-2026-11.md](./pesquisa-deep-research-2026-11.md) e responde ao [Prompt 4](./pesquisa-deep-research-2026-11.md#6-prompt-4--busca-complementar).
> **Não é parecer jurídico.** As linhas marcadas ⚖️ precisam de advogado (REV-12).

## Como ler

O Prompt 4 foi respondido de dois jeitos: por **busca direta** (§1–§4) e pelo **Gemini Deep Research**, que é avaliado na §5. Prevalece o que tem fonte primária lida. A busca foi feita em 2026-11-08, com leitura da fonte quando ela abriu. Os níveis de evidência são:

- **P (primária):** li o texto na fonte oficial. Isso inclui PDFs do STF e do BCB extraídos localmente e JSON de endpoints.
- **S (secundária):** escritório de advocacia, imprensa ou terceiros. Confirme antes de citar como fato.
- **I (inferência):** raciocínio meu, sem fonte direta.

## 1. Respostas por letra do Prompt 4

### A. Cota do Turbo e IPv6

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| A1. Como o Turbo define "sub-rede"? | **Não publicado.** A doc de produção diz "per-wallet and per-subnet" sem definir. O endpoint `/info` chama o campo de `ipBytes` (10485760). Só a doc da **testnet** fala em "IP /24 subnet" (com 100 MiB). Uma busca por `subnet` no repo `ardriveapp/turbo-upload-service` não achou nada. | [docs.ar.io turbo-credits](https://docs.ar.io/build/upload/turbo-credits) · [upload.ardrive.io/info](https://upload.ardrive.io/info) · [docs.ar.io testnet](https://docs.ar.io/build/testnet/uploading-and-credits/) | P (ausência) + I (/24 em produção) |
| A2. Quanto do Brasil já usa IPv6? | No país, ~**60%** "IPv6 capable" (anúncio do NIC.br, métrica APNIC, out/2026). **Por rede (APNIC, 03/11/2026):** TIM AS26615 **90,6%**, Vivo AS26599 **87,3%**, Claro AS28573 **82,2%**, V.tal AS8167 83,1% e AS7738 78,6%, Vivo fixo AS18881 74,6%. A média nacional cai por causa dos provedores regionais. | [APNIC AS26615](https://stats.labs.apnic.net/ipv6/AS26615) · [AS26599](https://stats.labs.apnic.net/ipv6/AS26599) · [AS28573](https://stats.labs.apnic.net/ipv6/AS28573) · [Teletime 28/10/2026](https://teletime.com.br/28/10/2026/brasil-ipv6-60/) | P (APNIC por rede) · S (anúncio) |
| A3. A cota esgota em grupo sob CGNAT? | **Indefinido, e menos grave do que parecia.** Se for /24 IPv4, quem está atrás de CGNAT divide a cota. Mas nas três grandes operadoras móveis, 82–91% dos usuários já têm IPv6. Se o Turbo agrupar por /64 (não confirmado), a cota é praticamente individual para a maioria. O risco coletivo fica concentrado nos **provedores regionais com CGNAT**. A política tem que funcionar **nos dois casos**, e o REV-11 (efêmero por padrão) já faz isso. | — | I |
| A4. Existe saída paga sem custódia? | **x402:** pagamento por upload em **USDC na Base**, sem crédito pré-pago, com teto de gasto no SDK. Os itens até 105 KiB continuam grátis com qualquer assinante. Exige uma carteira EVM no navegador. | [docs.ar.io x402](https://docs.ar.io/build/upload/x402-uploading-to-turbo/) | P |

### B. Marco Civil pós-STF, decretos e ECA Digital ⚖️

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| B1. A tese fala de marketplaces? | **Sim.** O item 7 diz que os provedores "que funcionarem como marketplaces respondem civilmente de acordo com o Código de Defesa do Consumidor". **Isto corrige a §5.1 S1 da síntese**, que dizia que o STF não tratava do tema (a *notícia* não tratava, mas o documento oficial trata). | [STF — "Informação à sociedade" (PDF)](https://www.stf.jus.br/arquivo/cms/noticiaNoticiaStf/anexo/Informac807a771oa768SociedadeArt19MCI_vRev.pdf) | P |
| B1. Quem fica fora do novo regime? | O item 5 mantém o art. 19 para provedores "neutros": e-mail, reuniões fechadas por vídeo ou voz, e mensageria instantânea **só nas comunicações interpessoais**. Nos embargos (17/06/2026), o item 3.4 ganhou uma cláusula residual: "outros provedores … que não possuam interferência no fluxo comunicativo e informacional". **Não há corte por número de usuários.** | idem · [Gomes Altimari](https://gomesaltimari.com.br/stf-conclui-o-julgamento-do-tema-987-e-fecha-os-pontos-pendentes-o-que-a-tese-definitiva-muda-para-as-empresas-que-operam-no-ambiente-digital/) | P (item 5) · S (embargos) |
| B1. Deveres adicionais | Item 8: autorregulação com sistema de notificações, devido processo e **relatório anual de transparência**. Item 9: canais de atendimento para usuários **e não usuários**. Item 10: regras publicadas e revistas. Item 11: **sede e representante no país, "necessariamente pessoa jurídica"**. | STF PDF | P |
| B1b. O que veio depois da tese | **Decretos 12.975/2026 e 12.976/2026** (DOU de 21/05/2026, vigência em ~20/07/2026). Regulamentam o dever de cuidado e dão à **ANPD** a fiscalização, que é sistêmica e não post a post. Há PDLs no Senado pedindo para sustá-los. | [Teletime (íntegra)](https://teletime.com.br/21/05/2026/confira-a-integra-dos-decretos-com-novas-regras-para-plataformas-digitais/) · [DOU 12.975](https://www.in.gov.br/web/dou/-/decreto-n-12.975-de-20-de-maio-de-2026-706914947) (não abriu aqui) · [Senado PDL](https://www25.senado.leg.br/web/atividade/materias/-/materia/174294/pdf) | S (texto do DOU não lido) |
| B2. Software livre sem servidor, ou voluntário de relay, é "provedor"? | **Sem resposta.** Não achei doutrina nem precedente sobre Mastodon, Nostr ou Bluesky no Brasil. A cláusula residual dos embargos ("sem interferência no fluxo") é a porta mais próxima. Um **PWA oficial com ranking e curadoria provavelmente interfere**; um cliente cronológico talvez não. | — | I ⚖️ |
| B3. ECA Digital | Lei 15.211/2025, **em vigor desde 17/03/2026**, regulamentada pelo Decreto 12.880/2026 e fiscalizada pela ANPD. Alcança serviços "direcionados a crianças e adolescentes **ou de provável acesso** por eles". A intensidade varia com o grau de interferência e o número de usuários. Uma rede cívica aberta tem provável acesso de adolescentes. **Em redes sociais, contas de menores de 16 anos têm de ficar vinculadas a um responsável legal**, com ferramentas de supervisão. Proibir contas de menores de 13 (ou de 16) **existe só em projetos de lei**, como o PL 5.271/2026. | [Olhar Digital 17/03/2026](https://olhardigital.com.br/2026/03/17/internet-e-redes-sociais/eca-digital-entra-em-vigor-nesta-terca-saiba-o-que-muda-na-internet-brasileira/) · [Congresso em Foco (PL)](https://www.congressoemfoco.com.br/noticia/123095/projeto-proibe-conta-independente-nas-redes-para-menores-de-16) · [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/estatuto-digital-da-crianca-e-do-adolescente-lei-n-15-211-2025-entra-em-vigor-em-17-de-marco-de-2026) · [Mattos Filho (guia ANPD)](https://www.mattosfilho.com.br/?p=123338) | S |
| B4. TSE (Res. 23.610) | A **Res. 23.755, de 02/03/2026**, alterou a 23.610. Pontos: rotular todo conteúdo eleitoral feito ou muito alterado por IA; campo de declaração de IA no impulsionamento (art. 9º-B); **vedação de que plataformas ranqueiem, recomendem ou priorizem candidatos, campanhas ou partidos**; remoção de conteúdo sintético depois de ordem judicial. As eleições gerais de out/2026 já passaram e a próxima é a municipal de 2028. **Antes dela, o `bridging-rank` precisa de um modo eleitoral** que não ranqueie conteúdo sobre candidatos. | [TSE — Res. 23.755/2026](https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-755-de-2-de-marco-de-2026) (não lido na íntegra) · [Nota Artigo 19/IRIS](https://artigo19.org/wp-content/blogs.dir/24/files/2026/03/NOTA_TSE2026-VF.pdf) | S (texto do TSE não lido) |

### C. LGPD e dados imutáveis

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| C1. A ANPD já falou de blockchain? | **Não achei nada.** A série *Radar Tecnológico* cobre cidades inteligentes, biometria e IA generativa. Um artigo do CONPEDI (2026) defende que tornar o dado criptograficamente inacessível pode valer como eliminação (art. 18, VI). | [CONPEDI 2026](https://site.conpedi.org.br/publicacoes/4lbcgdye/4q96nk29/P2bTjL3i2lQeq852.pdf) | S (acadêmico) |
| C2. Diretriz europeia (EDPB 02/2025) | Ainda é **rascunho**: a consulta fechou em 09/06/2025 e não achei a versão final. Recomenda: dados pessoais **fora da cadeia** sempre que der, só uma referência não identificadora na cadeia, papéis definidos já no desenho, e DPIA quase sempre. | [EDPB consulta](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-022025-processing-personal-data_pt?page=6) | P (status) · S (conteúdo) |
| C3. Gateways AR.IO moderam? | **Sim, cada um no seu.** O modelo é "voluntary content moderation": cada operador bloqueia TX, endereço ou nome ArNS por uma API de admin (`/ar-io/admin/block-data`), com um campo `source` para dizer de qual lista veio. Não existe lista central. | [docs.ar.io moderation](https://docs.ar.io/gateways/moderation) | P |

### D. Pessoa única sem KYC

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| D1. Comparar BrightID, PoH, Idena, World ID, Gitcoin Passport | **Não fechado.** Só achei sinais fracos de que o BrightID segue ativo em 2026. Não há dado de adoção no Brasil. | [Caplight](https://www.caplight.com/company/brightid) | S (fraco) |
| D2. WebAuthn prova pessoa única? | **Não**, e a hipótese se mantém. O autenticador cria credenciais sem limite, e a atestação identifica o *modelo* do aparelho, não a pessoa. | Spec WebAuthn (raciocínio) | I |
| D3. gov.br emite credenciais para terceiros? | **Não há API pública para terceiros.** A CIN digital fica no app gov.br. Houve um workshop de credenciais verificáveis em Brasília (jun/2026) com protótipo de "maior de 18" sem CPF, mas é piloto. Vale acompanhar, porque o ECA Digital vai empurrar isso. | [DIO (workshop)](https://www.dio.me/articles/credenciais-verificaveis-e-confianca-digital-o-que-marcou-o-1-dia-do-2o-workshop-de-cv-75c4037953c2) · [SBSeg/UFOP](https://sol.sbc.org.br/index.php/sbseg/article/download/44296/44059/) | S |

### E. Pix e privacidade do recebedor

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| E1. O que o pagador vê? | O **Manual de Padrões para Iniciação do Pix** (v2.10.0) repete nas notas: "O nome que deve ser apresentado ao pagador é o nome do usuário recebedor **conforme registrado no DICT**". Os exemplos usam **chave aleatória (EVP)**, ou seja, **a chave aleatória não esconde o nome**. Fontes secundárias dizem que o CPF/CNPJ aparece parcialmente mascarado. | [BCB — Manual de Iniciação (PDF)](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf) | P (nome do DICT) · S (máscara do CPF) |

**Consequência:** o REV-13 dizia "recomendar chave aleatória". **Isso estava errado** e contradizia a própria §2 da síntese. Com qualquer tipo de chave, quem recebe aparece com o nome do DICT. O único jeito de não expor o nome civil é receber numa conta de **pessoa jurídica** (ver B1 abaixo).

### F. Infraestrutura

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| F1. O Render proíbe keepalive? | A página do Free **não tem regra sobre keepalive**. Mas o Render "pode suspender" um serviço grátis com **tráfego de saída anormalmente alto**. | [render.com/docs/free](https://render.com/docs/free) | P |
| F2. Horas e banda do Render Free | **750 h por *workspace*** por mês, e um mês de 31 dias tem 744 h. Ou seja, **cabe um único serviço sempre ligado por workspace**. A banda incluída **não aparece** na página do Free (ver em Billing → *Monthly Included Usage*). **Sem cartão, se a banda estourar, todos os serviços Free ficam suspensos até o fim do mês.** Os planos de workspace mudaram em 23/04/2026, e a contradição 100 GB × 5 GB continua sem fonte primária. | idem · [Render changelog](https://render.com/changelog/upcoming-changes-to-outbound-bandwidth) | P (horas, suspensão) · aberto (GB) |
| F3. Koyeb | Anunciou em 17/02/2026 que vai entrar na Mistral AI, e "o plano Starter será removido". A instância grátis ainda aparece na doc, mas **escala a zero depois de 1 h sem tráfego** (dado de terceiro). **Não serve de nó sem sleep.** | [Koyeb blog](https://koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure) | P (aquisição) · S (sleep) |
| F4. Agendador do GitHub Actions | "can be delayed during periods of high loads"; "some queued jobs may be dropped"; em repo público, os workflows agendados são **desativados depois de 60 dias sem atividade no repositório**. | [docs.github.com — schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) | P |
| F5. TURN da Cloudflare | "The first 1,000 GB **each month** is free", cota **compartilhada entre SFU e TURN**, e depois US$ 0,05/GB. A credencial se gera em `POST https://rtc.live.cloudflare.com/v1/turn/keys/$TURN_KEY_ID/credentials/generate-ice-servers` com `{"ttl": …}`. **Não achei se exige cartão.** | [CF Realtime pricing](https://developers.cloudflare.com/realtime/pricing/) · [generate-credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/) | P (cartão: aberto) |

### G. Nostr para sinalização

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| G1. Relays aceitam efêmeros sem auth? | Pelos documentos **NIP-11** lidos hoje, `relay.damus.io`, `nos.lol`, `nostr.mom`, `offchain.pub` e `relay.snort.social` **não declaram** auth, pagamento nem PoW. O limite de mensagem vai de 128 KiB a 1 MB, e um SDP cabe com folga. `nostr.wine` declara `payment_required`. `relay.primal.net` e `relay.nostr.band` não responderam NIP-11. **Falta o teste real** de publicar e receber um evento efêmero, porque NIP-11 só declara. | leitura direta de NIP-11 (`Accept: application/nostr+json`) | P (declarado) |
| G2. De onde vem o kind 25050? | É convenção do projeto **hashtree** (crates `hashtree-network`/`hashtree-cli`): `hello` em claro para descoberta, e oferta, resposta e ICE em **gift wrap estilo NIP-17**, com chave efêmera e tag `#p`. O rascunho **NIP-DC** (NostrGameEngine/nostr4j) também usa o kind 25050, com tags `t` (presence, offer, answer, route) e oferta e resposta cifradas. **Não existe NIP oficial.** O "NIP-AC (WebRTC Calls)" que o Gemini citou não foi encontrado; o mais próximo é o PR nostr-protocol/nips#2238, sobre chamadas de voz. | [docs.rs hashtree-cli signaling.rs](https://docs.rs/hashtree-cli/latest/src/hashtree_cli/webrtc/signaling.rs.html) · [NIP-DC (espelho)](https://github-users.yhajoa.workers.dev/NostrGameEngine/nostr4j/blob/master/NIP-DC.md) | P (código) · S (espelho do NIP-DC) |

### H. Financiamento

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| H1. Editais | **NGI Zero Commons Fund: a 13ª chamada, que foi a última, fechou em 01/06/2026.** Estão **abertos no NLnet o Restack** (Open Internet Stack, inclusive "alternativas de autonomia do usuário") e o CodeSupply. O prazo é o dia 3 de todo mês ímpar, e o próximo é **03/01/2027**. "In principle anyone can apply: individuals…", mas cada fundo tem sua seção de elegibilidade, que não foi lida. O **OTF Internet Freedom Fund** tem fluxo contínuo, com faixa de ~US$ 10k a 900k em listagens de terceiros. Prototype Fund e Mozilla: nada atual. | [nlnet.nl/commonsfund](https://nlnet.nl/commonsfund/) · [nlnet.nl/funding](https://nlnet.nl/funding.html) · [OTF](https://www.opentech.fund/) | P (NLnet) · S (OTF) |
| H2. Doações | O **GitHub Sponsors aceita o Brasil** como região de recebimento, com **0% de taxa** para patrocínio de conta pessoal (até 6% para organizações). Open Collective para brasileiros: não confirmado. Apoia.se e Catarse: não pesquisado. | [docs.github.com — Sponsors](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors) | P |
| H3. Custo de abrir uma associação | **Não pesquisado.** | — | — |

### I. Leitura do Arweave

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| I1. Limites do `turbo-gateway.com` | **5 GB grátis por visitante**, que recarregam ~2 GB/h. Depois disso, o download **para** e aparece um pedido de pagamento em USDC (~US$ 0,11/GB). Não há limite de GraphQL documentado. `arweave.net` e outros gateways AR.IO: não verificado. | [ArDrive — Turbo Gateway Rate Limits](https://ardrive.io/help/faqs-help-and-troubleshooting-guides-turbo-gateway-rate-limits/) | P (página sem data) |

## 2. Correções à rodada anterior

| Antes | Agora |
|---|---|
| §5.1 S1: "o STF não fala de marketplaces/CDC" | **Fala.** Item 7 da tese (documento oficial do STF). A notícia é que era incompleta. |
| REV-13: "recomendar chave aleatória" | **Errado.** O BCB manda mostrar o nome do DICT com qualquer chave. |
| REV-01: "Koyeb" como nó sem sleep | **Rebaixado.** Escala a zero depois de 1 h e o plano Starter vai sair. |
| REV-12 tratava "ser provedor" só como risco civil | Agora há **deveres concretos**: sede e representante PJ, canal para não usuários, relatório anual, além de ECA Digital e decretos com a ANPD fiscalizando. |
| Relatórios: Render "100 GB" × "5 GB" | **Continua aberto.** A página do Free não diz. Olhar no Billing (REV-21). |
| Síntese: cota do Turbo "por sub-rede" | O próprio `/info` chama o campo de `ipBytes`. A definição não foi publicada. |
| §5.1 S4 da síntese: "CGNAT faz um bairro esgotar a cota" | Menos grave: 82–91% de IPv6 nas três grandes operadoras móveis (APNIC). O risco fica nos provedores regionais. |

## 3. Não encontrado (não preencher com suposição)

- Definição de sub-rede do Turbo em produção, e se ele usa IPv6.
- Texto do DOU dos decretos 12.975/12.976 (a página não abriu). Texto integral da Res. TSE 23.755/2026.
- Política do Open Source Collective para recebedores no Brasil (só achei a regra geral: W-8BEN acima de US$ 600/ano, taxa de host ~5%).
- Doutrina sobre se software livre P2P é "provedor de aplicação".
- Posição da ANPD sobre blockchain.
- Se o Cloudflare Realtime exige cartão.
- Banda incluída do Render Free.
- Hosts do Open Collective que aceitam o Brasil.
- Custo de abrir uma associação.
- Limites do `arweave.net`.

## 4. Brainstorm B1–B10 (a partir dos achados)

Não repetem as F1–F10. Atacam o que a pesquisa revelou: **o problema principal agora é jurídico e institucional, mais do que técnico.**

| # | Ideia | Por que agora (achado) | Custo | Reaproveita | Risco |
|---|---|---|---|---|---|
| **B1** | **Associação Vox (pessoa jurídica) como guarda-chuva:** CNPJ, chave Pix do coletivo, representante legal, conta para editais | Item 11 do STF (representante "necessariamente pessoa jurídica"), E1 (Pix só esconde o nome civil numa PJ), H1 (editais pedem entidade) | Cartório + contador (H3 não pesquisado) | [COMPLIANCE-BR](../COMPLIANCE-BR.md), F4 | Trabalho humano recorrente; a PJ vira alvo jurídico |
| **B2** | **Pix Zap "pelo coletivo":** o Zap pode ir para a chave CNPJ da comunidade ou da associação, que repassa em público, e não para a pessoa. Na chave pessoal, a UI diz **"seu nome civil aparece para quem paga"** | E1: nome do DICT com qualquer chave | R$ 0 (UI) | `brcode.js`, `perma-notary.js` | Repasse vira custódia **da associação**, não do Vox ⚖️ |
| **B3** | **Kit de autorregulação mínimo** (itens 8–10 do STF): página `#/regras` versionada; canal de notificação para **não usuários** por formulário de issue do GitHub (grátis, público, com histórico); **relatório anual de transparência gerado** do log de ocultações assinado | B1 (deveres adicionais), fiscalização "sistêmica" da ANPD | R$ 0 | `bug-tester.yml` (padrão de issue form), log de moderação | Expor a fila de denúncias em público. Dados pessoais do denunciante vão por e-mail, não pela issue |
| **B4** | **Modo protocolo × PWA oficial:** o cliente AGPL tem um modo **cronológico e sem ranking** como padrão possível, e o ranking (`bridging-rank`) é opt-in e calculado no aparelho. Documentar a separação "software" × "instância" | Cláusula residual dos embargos ("sem interferência no fluxo") | R$ 0 | `bridging-rank.js`, `feed` | Hipótese jurídica não testada ⚖️. Pode piorar o engajamento |
| **B5** | **Ocultação federada com gateways:** a lista de ocultação assinada sai num formato que operadores AR.IO importam no `block-data` (campo `source: vox-hide-list`), e o PWA respeita a lista | C3 (moderação por gateway) + C2 (EDPB: dado fora da cadeia) | R$ 0 | `perma-notary.js`, ADR-004 | Não apaga do Arweave. Só reduz o alcance |
| **B6** | **Padrões seguros por idade, sem coletar dado:** autodeclaração de faixa etária, guardada só no aparelho. Abaixo de 18: sem DM de desconhecidos, sem Pix Zap, sem Feira geolocalizada. **Abaixo de 16: conta vinculada a um responsável**, que **também é uma chave**: o responsável assina um aval da conta do menor por QR, reaproveitando o fluxo de aval da F8, e recebe o painel de supervisão no próprio aparelho, sem servidor. Quando existir uma credencial "maior de 18" do gov.br, ela entra como opcional | B3 (ECA Digital: vínculo obrigatório abaixo de 16), D3 | R$ 0 | `local-account.js`, `identity-link.js`, onboarding em etapas | A autodeclaração pode não bastar como "mecanismo confiável" ⚖️. Vínculo por chave é desenho novo |
| **B7** | **Sinalização Nostr no padrão hashtree:** `hello` efêmero + oferta, resposta e ICE em gift wrap. Pool inicial: damus, nos.lol, nostr.mom, offchain.pub, snort. Antes da F1, um **teste de fumaça semanal** num workflow que publica e lê um efêmero em cada relay e grava a taxa de sucesso | G1 (NIP-11 sem auth), G2 (convenção existente) | R$ 0 | `nostr-signaling.js` (stub) | Os relays podem passar a exigir auth ou PoW. O pool precisa ser configurável |
| **B8** | **Disjuntor de banda no Render:** o nó só sinaliza (nunca faz proxy de mídia), tem limite de taxa por IP e expõe `/metrics` de bytes de saída. O cliente para de usar o nó perto do teto | F1/F2: sem cartão, estourar a banda **suspende tudo até o fim do mês**; tráfego alto pode suspender | R$ 0 | `relay/signaling.py` | Exige medir a banda incluída real (REV-21) |
| **B9** | **TURN com orçamento:** o Worker gera a credencial com TTL curto **só depois de falha de ICE**. Um contador num Durable Object mantém o uso abaixo de ~800 GB/mês e corta antes dos 1.000 | F5 (1.000 GB/mês compartilhados com o SFU) | R$ 0 até o teto | REV-10 | Pergunta do cartão ainda aberta |
| **B10** | **Financiamento em camadas:** `FUNDING.yml` + **GitHub Sponsors** já (pessoa física, Brasil aceito, 0%); OTF IFF quando houver piloto; NLnet acompanhando o prazo de 03/01/2027 (Commons Fund encerrado); vaquinha Pix só depois do B1 | H1, H2 | R$ 0 | F4 | Sponsors na conta pessoal concentra a dependência no mantenedor |

**Extras surgidos na avaliação do relatório do Gemini (§5):**

- **B11 — Modo eleitoral do ranking:** durante o período eleitoral, o `bridging-rank` e qualquer "em alta" deixam de ordenar conteúdo que cite candidato, partido ou campanha, e o feed vira cronológico (Res. TSE 23.755/2026). Precisa estar pronto antes de ago/2028.
- **B12 — Aviso de cota por rede:** quando `getFreeStatus()` voltar 0 e a conexão for IPv4, dizer "sua rede compartilha a cota; o post fica na malha e vai para o Arweave quando houver crédito ou outra rede". Não pedir ao usuário que "ative IPv6", que é a sugestão do Gemini e não é acionável.

**Ordem sugerida:**

1. **B10** (Sponsors) e **B2** (só o aviso na UI): baratos e imediatos.
2. **B7**, o teste de fumaça, que destrava a F1.
3. **B8**, antes de qualquer aumento de tráfego.
4. **B1**, **B3** e **B6**, que dependem do parecer (REV-12).
5. **B4** e **B5**, depois do parecer.
6. **B9**, junto com o REV-10.

## 5. Avaliação do relatório do Gemini para o Prompt 4 (colado em 2026-11-08)

O Gemini rodou o Prompt 4 sem conseguir abrir os arquivos de novo ("repositório bloqueado ADR-018"). O tom é de parecer ("dogmática", "inexorável", "draconiano"), mas boa parte das "fontes primárias" que ele marcou não traz URL nem trecho. Abaixo, cada afirmação nova, conferida.

### 5.1 Confirma o que a busca direta achou

- A cota do Turbo (105 KiB, 10 MiB vitalícios, por carteira e sub-rede) e a definição de sub-rede não publicada.
- A tese do STF: marketplaces sob o CDC; mensageria interpessoal fora; nenhuma exclusão para plataforma aberta sem fins lucrativos.
- O BCB: nome do recebedor com qualquer chave, inclusive a aleatória. Dado novo: limite de **5 chaves por CPF e 20 por CNPJ** (regra conhecida do DICT, não conferida).
- AR.IO: o bloqueio por gateway não apaga do Arweave.
- WebAuthn não prova pessoa única.
- Render: 15 min de sleep, 750 h/workspace, um serviço sempre ligado esgota a cota.

### 5.2 Erros e exageros

| Afirmação do Gemini | O que a fonte diz | Nível |
|---|---|---|
| "40% dos usuários em IPv4/CGNAT: a cota se extingue de forma coletiva e quase imediata" | Nas grandes operadoras, 75–91% já têm IPv6 (APNIC por rede, 03/11/2026). E a regra de sub-rede **não é conhecida**: ele tratou /24 como fato. | P |
| ECA Digital "proíbe o ingresso de menores de 13 anos" | A lei em vigor exige **vínculo com responsável abaixo de 16**. Proibição por idade está só em PLs. | S |
| "ANPD refuta salvo-condutos para blockchain" (fonte: "Declarações da Assessoria") | **Sem URL.** Não achei nenhuma manifestação da ANPD sobre blockchain. Tratar como inventado até aparecer fonte. | — |
| NLnet "NGI Zero Commons Fund" aberto, "até meio milhão", "sul-americanos podem concorrer" | O Commons Fund **encerrou** (última chamada em 01/06/2026). Abertos: Restack e CodeSupply. "Anyone can apply" vale em princípio, sem regra explícita para a América do Sul. O "meio milhão" não aparece na página do Commons Fund ("between 5.000 and 50.000", "significant scaling" possível). | P |
| Open Source Collective "sem extorsões tributárias": basta o W-8BEN | Correto quanto ao formulário (acima de US$ 600/ano). Ele omitiu a **taxa de host (~5%)** e não confirmou o pagamento para o Brasil. Abrir mão de uma PJ brasileira **não resolve o item 11 do STF** (representante PJ no país), que ele ignorou. | S |
| kind 25050 "originou-se" no iris/meet e posterchanai; "NIP-AC" em tramitação | O 25050 aparece no hashtree e no rascunho NIP-DC. **NIP-AC não encontrado.** iris/meet, posterchanai e nip-ees-core não foram verificados. | P/S |
| "Testes de varredura (infra-probe)": damus e nos.lol replicam efêmeros | Não há como reproduzir. O NIP-11 que li hoje não declara restrição, mas **falta o teste real** (REV-19). | — |
| Render: "/robots.txt é atendido pelo balanceador sem acordar o app" | Sem fonte. **Irrelevante para o Vox:** o `sentinel-keepalive.yml` pinga `/health`. | — |
| Render Hobby "5 GB" (fonte: livemy.app, ago/2026) | Fonte secundária. A contradição 100 × 5 GB continua; é preciso ler o Billing (REV-21). | S |
| Tema 987 "julgado em 2026" | O mérito é de 26/06/2025. Em 2026 foram os **embargos** (17/06/2026). | P/S |
| "Desenvolvedores de PWA e mantenedores de relays atraem a mesma responsabilidade solidária" | Inferência dele, sem doutrina. Ele ignorou a cláusula residual dos embargos e os decretos de 2026. Fica como pergunta ⚖️ (REV-12). | I |
| Cifrar posts cívicos e destruir a chave como "esquecimento aceito regulatoriamente" | O "aceito regulatoriamente" não tem fonte; há só um artigo acadêmico (CONPEDI 2026). Além disso, **post público cifrado deixa de ser público**: isso serve para dados de perfil e Feira, não para debate. | S/I |

### 5.3 O que o Gemini não cobriu e a busca direta cobriu

- Os itens 8–11 da tese do STF, inclusive o **representante pessoa jurídica**.
- Os Decretos 12.975/12.976/2026 e a ANPD como fiscal.
- A cláusula residual dos embargos.
- Koyeb/Mistral.
- O agendador do GitHub Actions.
- O TURN da Cloudflare (1.000 GB/mês e a API de credencial).
- O limite de 5 GB por visitante do `turbo-gateway.com`.
- O GitHub Sponsors no Brasil.

### 5.4 O que o Gemini trouxe de novo e se confirmou

- A **Res. TSE 23.755/2026**, com a vedação de ranquear candidatos. Isso vira o B11.
- O **x402** como pagamento por upload, que vira a linha A4.
- O 60% de IPv6 do NIC.br. A precisão "60,04%" não foi achada; as fontes dizem "60%".
