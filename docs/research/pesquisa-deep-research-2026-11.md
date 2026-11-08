# Pesquisa Deep Research (nov/2026) — síntese verificada

> **Status:** pesquisa · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08 (v3: o Prompt 4 foi respondido em [pesquisa-complementar-2026-11.md](./pesquisa-complementar-2026-11.md), que corrige S1 e o REV-13)
> **Não substitui o [ROADMAP.md](../ROADMAP.md)**: as decisões abaixo viram linhas lá (REV-09 a REV-16). Origem: os 3 prompts de [brainstorm-autossustento-10-features-2026-11.md](../brainstorms/brainstorm-autossustento-10-features-2026-11.md#prompts-de-pesquisa-gemini-deep-research), rodados no Gemini Deep Research em 2026-11-07.

## Como ler

O Gemini gerou três relatórios (diagnóstico, viabilidade, especificação). Esta página guarda **só o que muda decisão**, separado em três grupos:

- **✅ Verificado:** conferido por nós, em 2026-11-08, na fonte primária citada.
- **🟡 Plausível, não verificado:** veio do relatório, com fonte citada, mas não foi conferido. Confirme antes de decidir.
- **❌ Descartado:** erro ou conteúdo inventado pelo relatório.

**Limitação importante:** o coletor do Gemini **não conseguiu abrir nenhum link `raw.githubusercontent.com` do repositório** (os links respondem HTTP 200 para nós). Consequências:

- O Relatório 2 renumerou as features F1–F10 por conta própria. Na seção dele sobre features, "F1–F10" **não** são as nossas.
- O Relatório 3 **inventou** como os módulos funcionam por dentro, além de rotas, nomes de testes e numeração de ADR.

Para rodar de novo, anexe os arquivos ao prompt (ver a nota nos prompts).

## 1. Fatos verificados que mudam o plano

| # | Fato | Fonte (acesso 2026-11-08) | Consequência |
|---|---|---|---|
| V1 | Upload grátis do Turbo: itens ≤ **105 KiB**, cota de **10 MiB** por carteira **e por sub-rede**, e "the allowance never resets". | [docs.ar.io — Turbo Credits](https://docs.ar.io/build/upload/turbo-credits) · `upload.ardrive.io/info` | A cota é **vitalícia**. Sob CGNAT móvel, muita gente divide a mesma sub-rede, então ela pode acabar para um bairro inteiro. Confirma a F5 revisada e o REV-07. |
| V2 | **Credit Sharing**: créditos Turbo podem ser compartilhados com outras carteiras, com limite, prazo e revogação. A taxa de infraestrutura é descontada no top-up (o exemplo da doc é 35%). | idem | A comunidade pode comprar créditos e delegar a membros **sem o Vox custodiar nada**. Liga a F4 ao F8. |
| V3 | Render Free: dorme após **15 min** sem tráfego de entrada (mensagens WebSocket contam). **750 h/mês** por workspace. Se a banda de saída esgotar e não houver cartão, suspende "for the remainder of the month". | [render.com/docs/free](https://render.com/docs/free) | O keepalive de 14 min tem só 60 s de folga. Com crescimento, suspender pelo resto do mês é risco real. |
| V4 | **Cloudflare Durable Objects existem no plano Workers Free** (backend SQLite): 100.000 req/dia e 13.000 GB-s/dia. Mensagens WebSocket **recebidas** contam 20:1, as enviadas não contam. Com Hibernation, objeto ocioso não cobra duração. | [CF — DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) | Candidato forte a **fallback de sinalização sem sleep**, na mesma conta que já serve o shell B. |
| V5 | **Cloudflare Realtime TURN**: 1.000 GB grátis antes de cobrar e depois US$ 0,05/GB (só egress). STUN grátis e ilimitado. Credenciais temporárias (até 48 h), geradas **do lado servidor** (backend ou Worker). | [CF — TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/) | Resolve a falta de TURN, mas **exige um Worker para gerar credencial**, e o segredo não pode ir no PWA. A página não diz se os 1.000 GB são mensais. |
| V6 | **Hugging Face Spaces com Docker exige plano pago** (PRO / Team) para criar. Conta grátis só tem Static e até 2 Gradio ZeroGPU. | [HF — Spaces overview](https://huggingface.co/docs/hub/en/spaces-overview) · [fórum HF](https://discuss.huggingface.co/t/docker-sdk-now-marked-as-paid-when-creating-a-new-space/177580) | O **relay buddy via `deploy-relay-hf.yml` não serve mais** para Spaces novos. O REV-01 muda de alvo. |
| V7 | **Briar entrou em modo de manutenção** (09/07/2026), sem financiamento. Os problemas citados incluem operação pouco confiável no Android moderno e troca offline de contatos difícil. | [briarproject.org](https://briarproject.org/news/2026-maintenance-mode/) · [AlternativeTo](https://alternativeto.net/news/2026/7/secure-messaging-app-briar-enters-maintenance-mode-will-only-receive-bug-and-security-fixes/) | Celular comum como nó em segundo plano (F6) é a armadilha que derrubou o Briar. A F6 vira "guardião na tomada, app aberto". |
| V8 | Periodic Background Sync só existe em navegadores Chromium e depende de PWA instalado e de engajamento. Não existe no Firefox Android nem no Safari iOS. | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API) | Confirma que a F6 original é **inviável**. |
| V9 | STF, 26/06/2025 (RE 1037396 / Tema 987 e RE 1057258 / Tema 533): o art. 19 do Marco Civil é parcialmente inconstitucional. Para crimes em geral, a plataforma responde se não remover após **notificação extrajudicial** (vale também para contas falsas). Para crimes graves, há **dever de cuidado** contra "falha sistêmica". Crimes contra a honra seguem exigindo ordem judicial. Os provedores devem ter **canal de notificação, devido processo e relatório anual de transparência**. | [notícia oficial do STF](https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/) — **lida em 2026-11-08**. Ela **não** menciona marketplaces/CDC nem exclusões (ver §5, S1) | Se o Vox (ou quem mantém o PWA) for "provedor de aplicação", precisa de canal de denúncia + lista de ocultação. **Se é provedor ainda está em aberto** (Prompt 4, B). Ver REV-12. |

## 2. Plausível, não verificado (confirmar antes de usar)

- **Nostr para sinalização:** convergência em `kind: 25050` com NIP-44, agrupando os candidatos ICE (~200 ms) para respeitar o rate limit dos relays. Implementações citadas: Trystero, RxDB, Iris Meet. *A faixa efêmera 20000–29999 do NIP-01 é fato; o kind 25050 é convenção de projetos, não NIP aprovado.* **Não** podemos importar essas bibliotecas (regra "sem dependência nova sem ADR"), só estudar o protocolo.
- **Rate limits dos relays:** o relatório cita valores do NIP-11, como Damus ~1 evento/s e Primal com 20 subscrições.
- **Atrasos do agendador do GitHub Actions** (20–60 min, execuções descartadas) e desativação do cron após 60 dias sem commit. *A desativação por inatividade é documentada pelo GitHub; a escala dos atrasos vem de relatos.*
- **Política de uso do Render** proibindo contornar limites para evitar pagamento: **não consegui ler o texto da política**. Trate o keepalive como risco, não como proibição confirmada.
- **Banda de saída do Render Free:** o Relatório 1 diz 100 GB, o Relatório 2 diz 5 GB. Os relatórios se contradizem e a doc não dá o número.
- **Koyeb** com instância grátis sempre ligada ("adquirida pela Mistral em fev/2026"). Não verificado.
- ✅ *(confirmado em 2026-11-08 no Manual de Iniciação do Pix do BCB — [complementar E1](./pesquisa-complementar-2026-11.md#e-pix-e-privacidade-do-recebedor))* **Pix revela o nome civil** (e parte do CPF/CNPJ) do recebedor no app do pagador, mesmo com chave aleatória. *Comportamento conhecido do Pix*, com efeito direto sobre os **Pix Zaps que já estão no ar**: quem usa pseudônimo é exposto.
- **Dados abertos:** a Câmara dá erro de CORS ao ser chamada do navegador ([issue #357](https://github.com/CamaraDosDeputados/dados-abertos/issues/357)); o Senado tem limite de 10 req/s e as rotas `/materia` foram depreciadas em favor de `/processo`; o e-Cidadania publica CSV diário.
- **Telegram:** limites de 1 msg/s por chat, 20/min por grupo e ~30/s no total. Polling por cron é lento, e webhook num Worker resolve.
- **Community Notes:** o modelo `r̂ = μ + i_u + i_n + f_u·f_n` (d = 1), com limiar `i_n ≥ 0,40`, é público no repo Apache-2.0. A vulnerabilidade a pequenos grupos coordenados (artigos de 2026 citados) **não foi conferida**.
- **ITP do Safari:** apaga o storage após 7 dias de uso do Safari sem interagir com o site. PWA instalado na Tela de Início tem contagem própria.

## 3. Descartado

- **Relatório 3:**
  - contratos internos dos módulos, rotas (`#/rede/…`, `#/apoiar/…`), arquivos de teste `tests/fN-*.test.js` e flags `FEATURE_*` **ligadas por padrão**: tudo inventado sem ler o código. As flags ligadas por padrão contrariam a nossa prática de rollout desligado;
  - os rascunhos "ADR-001 a ADR-006" (a numeração vigente vai até [018](../adr/README.md));
  - "LCP" lido como Lei Complementar 101. No nosso contexto, LCP é o *Legislative Context Protocol* do [brainstorm Tramitado](../brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md).
- **Relatório 2:** a lista F1–F10 dele (renumerada por módulo) e as contas de custo que dependem dela.
- **Números "precisos":** câmbio, contas de DAU e valores de ITCMD por estado. Servem como ordem de grandeza, não como fato.

## 4. Decisões (viram linhas no ROADMAP)

| ID | Decisão | Por quê |
|---|---|---|
| **REV-01** (revisado) | O 2º nó de sinalização passa a ser um **Cloudflare Durable Object** (Workers Free) ou o Koyeb, e **não mais o HF**. | V4, V6 |
| **REV-09** | **F1 sobe para P0**: sinalização por Nostr efêmero cifrado, com ICE agrupado. Depois disso, **aposentar o cron de keepalive** do Render. | V3, V4, seção 2 |
| **REV-10** | **TURN**: um Worker gera credenciais temporárias do Cloudflare Realtime TURN. Ativado só em caso de falha direta, com um modo "privacidade de IP" (`iceTransportPolicy: 'relay'`). | V5 |
| **REV-11** | **Política "efêmero por padrão, permanente por consenso"**: post social e Feira circulam na malha com TTL. No Arweave entram só propostas, votos consolidados e manifestos (ou o hash). O cliente consulta `getFreeStatus()` e mostra o medidor de cota. Fecha o REV-07. | V1, V2, LGPD |
| **REV-12** | **Jurídico do pós-STF**: canal de denúncia no PWA, lista de ocultação assinada lida pelo app oficial e a Feira sob o CDC. Exige parecer antes do código. | V9 |
| **REV-13** | **Aviso de privacidade nos Pix Zaps (já no ar)**: o pagador vê o nome civil de quem recebe. ~~Recomendar chave aleatória~~ (não protege: ver [complementar E1](./pesquisa-complementar-2026-11.md#e-pix-e-privacidade-do-recebedor)); dizer isso na UI. | Seção 2 (comportamento do Pix) |
| **REV-14** | **Proteção de chave no iOS**: plugar `storage-persistence`, guia "Adicionar à Tela de Início" no Safari e backup do cofre num cartão QR. | V8, ITP |
| **REV-15** | **F6 redesenhada** como "guardião na tomada": app aberto, Wake Lock, só no Wi-Fi. O `periodicSync` fica como complemento no Chromium. | V7, V8 |
| **REV-16** | Ao rodar de novo o Prompt 3, **anexar os arquivos** (ou usar outro agente com acesso ao repo). As specs atuais do Relatório 3 não valem como base. | Limitação acima |

**Dependências confirmadas pela pesquisa:** a **F7 só entra depois da F8** (sem o selo anti-Sybil, as notas são manipuláveis com poucos votos). A **F9** coleta por cron e serve JSON estático, nunca com o navegador chamando a API do Congresso. A **F10** usa webhook num Worker se o bot precisar responder rápido.

## 5. Falhas e equívocos (revisão crítica, 2026-11-08)

### 5.1 Desta síntese (erros meus)

| # | Erro | Correção |
|---|---|---|
| S1 | **V9 estava como ✅ sem a fonte ter sido lida.** Ao ler a notícia oficial do STF, ela confirma a data, os temas, o regime de notificação para crimes, o dever de cuidado contra "falha sistêmica" e a exigência de transparência. Ela **não menciona marketplaces/CDC**, e também não diz a quem a tese **não** se aplica. | V9 rebaixada: marketplaces/CDC e o alcance para um cliente de software livre vão para o Prompt 4 (B). |
| S2 | **REV-13 (código) apoiado num fato não verificado** (o Pix mostrar o nome civil ao pagador). O comportamento é conhecido, mas falta a norma do BCB. | REV-13 fica, condicionado à fonte oficial (Prompt 4, E). |
| S3 | **Os prompts originais só davam links `raw`** e não pediam anexo. Isso causou a principal falha dos relatórios. | Lição registrada; o Prompt 4 pede anexos e dá links `blob` como alternativa. |
| S4 | **Aceitei a premissa "CGNAT IPv4 = um bairro esgota a cota"** sem checar o que o Turbo chama de "sub-rede", nem quanto do móvel brasileiro já usa IPv6. Se o prefixo for IPv6 /64 por aparelho, o risco coletivo é bem menor. | Prompt 4 (A). |

### 5.2 Dos relatórios do Gemini

**Conceituais (os mais perigosos, porque parecem certos):**

- **WebAuthn não prova pessoa única** (Relatório 3, F8). Uma pessoa cria quantas credenciais quiser, em vários aparelhos ou com chaves de segurança. Isso só prova posse de um autenticador.
- **Nullifier HMAC sobre um segredo local não é anti-Sybil** (Relatório 3). Ele impede o *mesmo* titular de votar duas vezes, mas não impede alguém de ter vários titulares. A unicidade tem de vir da **emissão** da credencial (aval presencial, gov.br via parceiro), não do nullifier.
- **Assumir que o Vox é "provedor de aplicação"** (Relatórios 1 e 2). Isso não está demonstrado. Ainda é uma pergunta em aberto se um mantenedor de PWA estático que lê uma rede pública, ou um voluntário de relay, entra no regime do STF. Tratamos como risco, não como fato.
- **LGPD limitada aos doadores da F4** (Relatório 1). O problema maior são **os próprios posts** gravados no Arweave imutável, que também são dados pessoais. Esse ponto só aparece de passagem.

**Contradições entre os relatórios:**

- Para parear na rua (F2), o Relatório 1 diz que exige TURN, e o Relatório 3 diz que exige a mesma rede Wi-Fi local.
- A banda de saída do Render Free aparece como 100 GB num relatório e 5 GB no outro.
- O Relatório 1 proíbe dados pessoais *on-chain*. O Relatório 3 propõe um recibo público com `supporterPubkey` e valor declarado, que é um vínculo pessoal permanente.

**Fatos aplicados ao alvo errado:**

- O rate limit da **Goldsky** (50 req/10 s) foi aplicado ao Vox, que lê de `arweave.net` e `turbo-gateway.com` ([gateways.json](../../client/config/gateways.json)).
- As contas de DAU do Relatório 2 usam a lista F1–F10 renumerada por ele, e não a nossa.

**Precisão falsa:** números com duas casas decimais (custos em R$, UFESP, tarifas por item) sem fonte primária lida. Tratar como ordem de grandeza.

**Engenharia questionável:** o Relatório 3 manda blocos de mídia em `dataBase64` dentro de JSON pelo DataChannel. Isso tem ~33% de overhead e é pior que binário em `ArrayBuffer`, que é o que o próprio Relatório 2 recomenda. Ele também deixa as flags `FEATURE_*` ligadas por padrão.

### 5.3 O que nenhum relatório cobriu

- Financiamento real de software livre cívico brasileiro: editais, *fiscal hosts* que aceitam projetos do Brasil, e GitHub Sponsors e Apoia.se no Brasil.
- **Regras eleitorais (TSE)** para uma rede de conteúdo político: 2026 é ano eleitoral.
- **ECA Digital** (Lei 15.211/2025): a quem se aplica de fato.
- Quais gateways GraphQL do Arweave estão ativos em 2026 e quais os limites dos que **nós** usamos.
- A diretriz europeia sobre blockchain e dados pessoais, como referência de mitigação para a ANPD.

## 6. Prompt 4 — busca complementar

Cole no Gemini Deep Research (ou similar). **Anexe os arquivos listados no prompt.** Se o agente não aceitar anexos, use os links `github.com/.../blob/main/...`. O link de `docs/research/pesquisa-deep-research-2026-11.md` em `main` só existe depois do merge do PR yurikayel/vox#16; até lá, use `https://github.com/yurikayel/vox/blob/docs/sintese-deep-research/docs/pesquisa-deep-research-2026-11.md`.

```text
Responda em português do Brasil. Você é pesquisador técnico e jurídico. Esta é uma BUSCA COMPLEMENTAR:
uma rodada anterior já respondeu parte das perguntas, e você deve preencher lacunas e corrigir erros,
não repetir o que já está verificado.

## Arquivos anexados (leia antes; se não conseguir abrir algum, diga qual e NÃO invente o conteúdo)
- docs/research/pesquisa-deep-research-2026-11.md — o que já foi verificado, o que falta e os erros da rodada anterior
- docs/INFRA-CUSTOS.md — onde o Vox roda hoje e os riscos
- docs/FEATURES.md — o que existe no código
- docs/ROADMAP.md — itens REV-01 a REV-16
- docs/adr/018-selo-govbr-via-parceiro-publico.md — proposta de selo gov.br
- docs/legal/COMPLIANCE-BR.md
Alternativa aos anexos (links do GitHub):
https://github.com/yurikayel/vox/blob/main/docs/research/pesquisa-deep-research-2026-11.md
https://github.com/yurikayel/vox/blob/main/docs/INFRA-CUSTOS.md
https://github.com/yurikayel/vox/blob/main/docs/FEATURES.md
https://github.com/yurikayel/vox/blob/main/docs/ROADMAP.md
https://github.com/yurikayel/vox/blob/main/docs/adr/018-selo-govbr-via-parceiro-publico.md
https://github.com/yurikayel/vox/blob/main/docs/legal/COMPLIANCE-BR.md

## Contexto mínimo
Vox: rede social cívica brasileira, local-first, AGPL. PWA em JavaScript puro servido como site estático
(GitHub Pages + Cloudflare Pages); identidade é uma chave criada no aparelho; posts públicos assinados vão
para o Arweave pelo bundler Turbo (ArDrive); a descoberta de pares WebRTC usa um único servidor WebSocket
gratuito no Render. Não há servidor central próprio, não há custódia de dinheiro, não há alcance pago.
Mantido por uma pessoa e voluntários, sem CNPJ.

## NÃO refazer (já verificado em fonte primária em 2026-11-08)
Cota grátis do Turbo (105 KiB/item; 10 MiB por carteira e por sub-rede; nunca reseta; Credit Sharing);
sleep de 15 min e 750 h/mês do Render Free; Durable Objects no Workers Free (100k req/dia, 20:1 em
mensagens WS recebidas); Cloudflare Realtime TURN (1.000 GB antes de cobrar, US$ 0,05/GB); Docker
Spaces do Hugging Face exigindo plano pago; Briar em modo de manutenção (09/07/2026); Periodic Background
Sync só no Chromium; data e temas do julgamento do STF sobre o art. 19 (26/06/2025, Temas 987 e 533).

## Perguntas (para cada uma: resposta · fonte primária com URL e data · nível de evidência
[primária / secundária / inferência] · o que muda para o Vox)

A. Cota do Turbo e IPv6
 1. Como o Turbo define "subnet" na cota grátis: prefixo IPv4 /24? IPv6 /64 ou /48? Como identifica o IP
    (cabeçalhos de proxy)? Procure no código aberto do upload service e do turbo-sdk e na documentação ar.io.
 2. Qual a proporção de tráfego IPv6 no Brasil em 2025–2026, por operadora móvel (Vivo, Claro, TIM) e
    fixa? Fontes: NIC.br/CEPTRO (ipv6.br), estatísticas IPv6 do Google, APNIC, Cloudflare Radar.
 3. Conclusão: a cota "por sub-rede" esgota coletivamente sob CGNAT, ou é praticamente individual em IPv6?

B. Marco Civil pós-STF e a quem se aplica
 1. Texto integral da tese dos Temas 987 e 533: há item sobre marketplaces e CDC? Quais as exclusões
    (e-mail, mensageria, provedores sem fins lucrativos, enciclopédias, repositórios de software)?
 2. Um projeto de software livre sem servidor próprio, cujo site estático só exibe dados de uma rede
    pública (Arweave), é "provedor de aplicações de internet" (art. 5º, VII, Lei 12.965/2014)? E um
    voluntário que roda um relay? Há doutrina, precedente ou análise para Mastodon, Nostr, Bluesky ou
    Wikipedia no Brasil?
 3. ECA Digital (Lei 15.211/2025): a quem se aplica, quais deveres, e se alcança um app sem cadastro
    central nem coleta de dados.
 4. TSE: regras de propaganda eleitoral na internet para plataformas e aplicações (Res. 23.610/2019 e
    alterações de 2024 em diante), inclusive conteúdo gerado por IA e remoção; o que se aplica a uma rede
    cívica com debate político.

C. LGPD e dados imutáveis
 1. Posição da ANPD (guias, notas técnicas, consultas) sobre dados pessoais em blockchain pública
    imutável, e sobre o direito de eliminação (art. 18) quando o controlador não consegue apagar.
 2. Diretriz europeia sobre tratamento de dados pessoais com blockchain (EDPB, 2025) como referência:
    quais medidas recomenda (dados fora da cadeia, hash, chave de cifragem descartável)?
 3. Gateways AR.IO: como funciona a moderação/bloqueio de conteúdo (listas de bloqueio) e se serve como
    mitigação prática para pedidos de remoção.

D. Prova de pessoa única sem KYC (anti-Sybil)
 1. Compare para o contexto brasileiro: aval social presencial (web of trust), algoritmos de detecção
    em grafo (SybilGuard, SybilRank), BrightID, Proof of Humanity, Idena, World ID, Gitcoin Passport —
    custo para o usuário, privacidade, adoção no Brasil, falhas conhecidas.
 2. Confirme ou refute: WebAuthn/passkeys provam pessoa única? (Hipótese: não.)
 3. Selo gov.br via parceiro (ADR-018): o Login Único permite que um órgão parceiro emita atestados a
    terceiros? Existem credenciais verificáveis do gov.br ou da Carteira de Identidade Nacional usáveis
    por terceiros sem CPF exposto?

E. Pix e privacidade do recebedor
 1. Norma oficial do Banco Central (regulamento Pix, manual de UX, DICT) sobre o que o app do pagador
    exibe do recebedor antes de confirmar (nome, CPF/CNPJ parcial, instituição), inclusive com chave
    aleatória (EVP).

F. Infraestrutura que ficou sem confirmação
 1. Texto exato da Acceptable Use Policy do Render sobre contornar limites do plano grátis (keepalive).
 2. Cota de banda de saída do Render Free em 2026 (número oficial).
 3. Koyeb: o plano grátis atual (instância sempre ligada? limites) e se houve aquisição em 2026.
 4. GitHub Actions: o que a documentação oficial diz sobre atraso de `schedule` e desativação após
    60 dias sem atividade.
 5. Cloudflare: os 1.000 GB do TURN são por mês? O Workers Free exige cartão? Como gerar credenciais
    TURN temporárias (API) a partir de um Worker.

G. Nostr para sinalização WebRTC
 1. Relays públicos aceitam eventos efêmeros (20000–29999) de clientes sem autenticação? Quais exigem
    NIP-42 (auth) ou NIP-13 (proof-of-work)? Leia os documentos NIP-11 de pelo menos 5 relays, incluindo
    relays no Brasil ou na América do Sul, se houver.
 2. De onde vem a convenção kind 25050 (projeto, documento), e se há NIP em discussão para sinalização WebRTC.

H. Financiamento (não coberto antes)
 1. Editais abertos em 2026 para software livre cívico ou de privacidade que aceitam proponentes do
    Brasil: NLnet/NGI, Prototype Fund, OTF, Mozilla, Fundação Ford, outros; valores e prazos.
 2. Fiscal hosts que aceitam projetos brasileiros sem CNPJ (Open Collective: quais hosts operam hoje?),
    GitHub Sponsors com pagamento no Brasil, Apoia.se/Catarse (taxas).
 3. Custo e passos para abrir uma associação sem fins lucrativos no Brasil para receber doações.

I. Leitura do Arweave
 1. Quais gateways GraphQL públicos estão ativos em 2026 e os limites de taxa documentados de
    arweave.net e turbo-gateway.com (os que o Vox usa) e da rede AR.IO.

## Formato da resposta
- Uma seção por letra (A–I), com tabela: pergunta · resposta · fonte (URL + data) · nível de evidência.
- Uma seção "Correções à rodada anterior": liste o que a pesquisa anterior afirmou e esta busca desmente
  ou confirma.
- Uma seção "Não encontrado": perguntas sem fonte primária. Não preencha com suposição.
- Não especule sobre o código do Vox: use só os arquivos anexados.
- Não é parecer jurídico: indique onde é preciso advogado.
```
