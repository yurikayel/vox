# Pesquisa Deep Research (nov/2026) — síntese verificada

> **Status:** pesquisa · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08
> **Não substitui o [ROADMAP.md](./ROADMAP.md)**: as decisões abaixo viram linhas lá (REV-09 a REV-16). Origem: os 3 prompts de [brainstorm-autossustento-10-features-2026-11.md](./brainstorm-autossustento-10-features-2026-11.md#prompts-de-pesquisa-gemini-deep-research), rodados no Gemini Deep Research em 2026-11-07.

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
| V9 | STF, 26/06/2025 (Temas 987 e 533): o art. 19 do Marco Civil foi declarado parcialmente inconstitucional. Para crimes e ilícitos passa a bastar **notificação extrajudicial**; há dever de cuidado para crimes graves; marketplaces respondem pelo CDC. | Decisão pública amplamente noticiada ([STF](https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/)). O teor exato e o alcance para o Vox **dependem de parecer jurídico** | O PWA oficial precisa de **canal de denúncia + lista de ocultação**, e a Feira entra em regime de consumo. Ver REV-12. |

## 2. Plausível, não verificado (confirmar antes de usar)

- **Nostr para sinalização:** convergência em `kind: 25050` com NIP-44, agrupando os candidatos ICE (~200 ms) para respeitar o rate limit dos relays. Implementações citadas: Trystero, RxDB, Iris Meet. *A faixa efêmera 20000–29999 do NIP-01 é fato; o kind 25050 é convenção de projetos, não NIP aprovado.* **Não** podemos importar essas bibliotecas (regra "sem dependência nova sem ADR"), só estudar o protocolo.
- **Rate limits dos relays:** o relatório cita valores do NIP-11, como Damus ~1 evento/s e Primal com 20 subscrições.
- **Atrasos do agendador do GitHub Actions** (20–60 min, execuções descartadas) e desativação do cron após 60 dias sem commit. *A desativação por inatividade é documentada pelo GitHub; a escala dos atrasos vem de relatos.*
- **Política de uso do Render** proibindo contornar limites para evitar pagamento: **não consegui ler o texto da política**. Trate o keepalive como risco, não como proibição confirmada.
- **Banda de saída do Render Free:** o Relatório 1 diz 100 GB, o Relatório 2 diz 5 GB. Os relatórios se contradizem e a doc não dá o número.
- **Koyeb** com instância grátis sempre ligada ("adquirida pela Mistral em fev/2026"). Não verificado.
- **Pix revela o nome civil** (e parte do CPF/CNPJ) do recebedor no app do pagador, mesmo com chave aleatória. *Comportamento conhecido do Pix*, com efeito direto sobre os **Pix Zaps que já estão no ar**: quem usa pseudônimo é exposto.
- **Dados abertos:** a Câmara dá erro de CORS ao ser chamada do navegador ([issue #357](https://github.com/CamaraDosDeputados/dados-abertos/issues/357)); o Senado tem limite de 10 req/s e as rotas `/materia` foram depreciadas em favor de `/processo`; o e-Cidadania publica CSV diário.
- **Telegram:** limites de 1 msg/s por chat, 20/min por grupo e ~30/s no total. Polling por cron é lento, e webhook num Worker resolve.
- **Community Notes:** o modelo `r̂ = μ + i_u + i_n + f_u·f_n` (d = 1), com limiar `i_n ≥ 0,40`, é público no repo Apache-2.0. A vulnerabilidade a pequenos grupos coordenados (artigos de 2026 citados) **não foi conferida**.
- **ITP do Safari:** apaga o storage após 7 dias de uso do Safari sem interagir com o site. PWA instalado na Tela de Início tem contagem própria.

## 3. Descartado

- **Relatório 3:**
  - contratos internos dos módulos, rotas (`#/rede/…`, `#/apoiar/…`), arquivos de teste `tests/fN-*.test.js` e flags `FEATURE_*` **ligadas por padrão**: tudo inventado sem ler o código. As flags ligadas por padrão contrariam a nossa prática de rollout desligado;
  - os rascunhos "ADR-001 a ADR-006" (a numeração vigente vai até [018](./adr/README.md));
  - "LCP" lido como Lei Complementar 101. No nosso contexto, LCP é o *Legislative Context Protocol* do [brainstorm Tramitado](./brainstorm-sinergia-tramitado-vox-2026-11.md).
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
| **REV-13** | **Aviso de privacidade nos Pix Zaps (já no ar)**: o pagador vê o nome civil de quem recebe. Recomendar chave aleatória e dizer isso na UI. | Seção 2 (comportamento do Pix) |
| **REV-14** | **Proteção de chave no iOS**: plugar `storage-persistence`, guia "Adicionar à Tela de Início" no Safari e backup do cofre num cartão QR. | V8, ITP |
| **REV-15** | **F6 redesenhada** como "guardião na tomada": app aberto, Wake Lock, só no Wi-Fi. O `periodicSync` fica como complemento no Chromium. | V7, V8 |
| **REV-16** | Ao rodar de novo o Prompt 3, **anexar os arquivos** (ou usar outro agente com acesso ao repo). As specs atuais do Relatório 3 não valem como base. | Limitação acima |

**Dependências confirmadas pela pesquisa:** a **F7 só entra depois da F8** (sem o selo anti-Sybil, as notas são manipuláveis com poucos votos). A **F9** coleta por cron e serve JSON estático, nunca com o navegador chamando a API do Congresso. A **F10** usa webhook num Worker se o bot precisar responder rápido.
