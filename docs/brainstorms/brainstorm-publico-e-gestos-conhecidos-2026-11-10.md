# Brainstorm — para quem o Vox serve e com que gestos

> **Status:** brainstorm · **Owner:** mantenedor · **Revisado:** 2026-11-10 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md))
> **Consolidado em:** [síntese — a praça de colunas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md). Quando este texto divergir da síntese, vale a síntese.
> **Origem:** rodadas de conversa do mantenedor com o Claude em 10/11/2026, a partir de uma pesquisa sobre os 10 perfis de usuários de redes sociais no Brasil (2025–2026) e de duas ilustrações desses perfis, trazidas pelo mantenedor. A estratégia de produto está no doc irmão: [o Vox como "terceiro lugar"](./brainstorm-terceiro-lugar-2026-11-10.md).
> Tudo aqui é **candidato**. Os números da pesquisa **não foram conferidos** (§6); as ilustrações **não estão no repositório** (§12).

## Resumo

| Ideia | Em uma frase |
|---|---|
| **Princípio** | Gesto conhecido, lugar diferente: as pessoas esperam que o app funcione como os outros que já usam. |
| **Limite** | Copiar a gramática, não o cassino: os gestos são os mesmos, os incentivos não. |
| **Lugar** | O grupo. Estrutura dos apps de grupo, gestos dos apps de audiência. |
| **Alvo** | Quem organiza tem 50+ e vive no WhatsApp e no Facebook; os membros são da periferia e só usam celular; associações rurais são o segundo nicho. |
| **Visual** | O visual escuro e neon de hoje fala com quem constrói, não com quem vai usar; o modo claro já existe. |

## 1. Princípio: gesto conhecido, lugar diferente

É a **Lei de Jakob**: as pessoas passam a maior parte do tempo em outros apps e esperam que o seu funcione igual. Os hábitos já estão treinados. O Vox mantém os gestos e muda o que eles fazem.

Limite, por causa da missão: **copiar os hábitos que as pessoas conhecem, não os truques que as prendem** (§4).

## 2. Dois tipos de rede

| Centradas na audiência de uma pessoa | Centradas num grupo |
|---|---|
| Instagram, X, TikTok | Grupos do WhatsApp e do Facebook, servidores do Discord, comunidades do Orkut |
| Seguidores, criadores, algoritmo | Membros, canais, papéis |

**O lugar do Vox é o grupo.** A estrutura vem dos apps de grupo (comunidades do Orkut, canais e papéis do Discord, conversa do WhatsApp). Os gestos vêm dos apps de audiência (stories, toque duplo, vídeo vertical, citação).

A idade importa: quem dirige associação costuma ser da geração Orkut, Facebook e WhatsApp; os mais jovens vivem no Instagram, no TikTok e no Discord. **Telas de quem organiza parecem Facebook e Orkut; gestos de membro parecem Instagram e TikTok.**

## 3. Mapa de gestos

Coluna "No código" conferida em 10/11/2026.

| Gesto conhecido | Onde se aprendeu | Versão no Vox | O que muda | No código |
|---|---|---|---|---|
| Mensagem de voz | WhatsApp | Áudio no post, no aviso e na decisão | Fica no registro; inclui quem lê com dificuldade | **Sim**: gravação de até 60 s no compositor (`inline-composer.js`, botão `btn-inline-mic`) |
| Tique azul | WhatsApp | **"Ciente"** num aviso de reunião | Prova que o membro foi avisado, o que a assembleia precisa | Não |
| Enquete | WhatsApp | Enquete com prazo e quórum | Termina numa ata assinada | Sim (`compose-poll`, `civic-post`) |
| Encaminhar | WhatsApp | Encaminhar com a assinatura intacta | A origem continua conferível depois de vários encaminhamentos | Em parte (`repost`, POSSE) |
| Stories e Destaques | Instagram | Avisos de 24 h no avatar da comunidade, com **"Fixar no mural"** | O que é passageiro vira registro de propósito | Só a nota pessoal de 24 h (`profile-note.js`) |
| Post em colaboração | Instagram | **Nota conjunta** assinada por várias comunidades | Assinatura de várias partes | Não |
| Melhores Amigos | Instagram | Círculo interno para um post | Menos exposição para militantes | Não |
| Grade do perfil | Instagram | O "antes e depois" das conquistas da comunidade (o buraco tapado) | Orgulho e prova | O kit de bairro já tem canal de zeladoria e obras |
| Citação | X | Repost com citação | Assinado | Sim (`repost-cite.js`) |
| Notas da Comunidade | X | Nota que só aparece quando gente de lados diferentes concorda | Moderação sem moderador pago | `bridging-rank.js` **escrito, sem nenhum import** |
| Assuntos do momento | X | "Em alta no bairro" | Ordenado por acordo entre grupos, não por indignação | `hashtags.js` sim; a ordenação não |
| Rolagem vertical | TikTok | "Pautas da semana" em cartões de tela cheia | **Voto por botão explícito, nunca pela direção do deslize** | Não |
| Dueto | TikTok | Responder a uma proposta com vídeo ou áudio curto | Ligado a uma decisão, não a um som da moda | Não |
| Evento com "Vou" | Facebook | Reunião com "Vou / Talvez / Não vou" | Vira lista de presença e estimativa de quórum | Não |
| Lembranças | Facebook | "Há um ano decidimos…" | Pergunta: fizemos o que decidimos? | Não |
| Marcar-se em segurança | Facebook | "Estou bem / Preciso de ajuda" num desastre | Funciona em rede local sem internet | Não (`airgap-webrtc.js` não plugado) |
| Marketplace, vaquinha | Facebook | Feira e Pix Zaps | O Vox nunca segura o dinheiro; livro-caixa aberto | Sim |
| Servidor com #canais e modelos | Discord | Canais e kits de comunidade | A mesma ideia | Sim (`community-channel`, `kit-genesis`) |
| Cargos | Discord | Cargos reais: secretaria, tesouraria, coordenação | **O cargo assina**: a secretaria assina a ata, a tesouraria o livro-caixa | Em parte (`governance.js`) |
| Bots e atividades | Discord | Miniapps dentro da comunidade | Sem servidor central | `webxdc-host.js` **escrito, sem nenhum import** |
| Depoimentos com aprovação | Orkut | Aval de quem conhece a pessoa | Assinado; serve também contra conta falsa | `testimonials.js` **escrito, sem nenhum import** |
| Comunidades como crachá | Orkut | Crachás dos grupos de que a pessoa participa | **Escondidos por padrão** (exposição de militantes) | Em `testimonials.js`, não plugado |

A maior surpresa: **o módulo do Orkut já está pronto** e ninguém consegue vê-lo.

## 4. O que não copiar

- Rolagem infinita com recompensa imprevisível, e reprodução automática.
- Ofensivas (*streaks*) e notificação de culpa.
- Contagem de seguidores como status, ou ordenação por engajamento (a indignação ganha).
- Nota para pessoas (o "confiável / legal / sexy" do Orkut).
- "Quem visitou seu perfil": para militante é vigilância.
- Subir a agenda de contatos para "achar amigos".
- Nomes, marcas e aparência dos outros apps: usar palavras genéricas em português ("Avisos", "Depoimentos", "Ciente"). O código já faz isso (`profile-note.js` diz "Não é Stories do Instagram").

## 5. Onde o lugar é diferente

Quatro coisas que os outros não fazem, mostradas com gestos que as pessoas já conhecem:

1. **A assinatura sobrevive ao encaminhamento**, resposta ao "Encaminhado com frequência".
2. **O passageiro vira registro**: stories viram destaque, que vira mural e ata.
3. **O dinheiro vem com comprovante**: a vaquinha vira livro-caixa aberto.
4. **Funciona sem internet**: o "estou bem" offline.

## 6. Os 10 perfis (resumo da pesquisa trazida)

A pesquisa cita TIC Domicílios e TIC Kids Online (CETIC.br), PNAD Contínua TIC (IBGE), DataReportal, Opinion Box, Mobile Time, Data Favela, Data8, ABMRA, Reuters Institute e outros. **Não conferimos os números**, e vários são de depois de junho de 2026. Nenhuma conclusão abaixo depende de um número só; antes de citar qualquer número em público (pitch, briefing), conferir na fonte.

| # | Perfil | Recorte | Redes | Marca |
|---|---|---|---|---|
| 1 | Geração Z discreta | 15–24, A/B/C1, urbana | Instagram, TikTok, WhatsApp, Pinterest | Feed vazio, Melhores Amigos, conta secundária fechada |
| 2 | Mulher multiplataforma | 25–44, B/C | Instagram, WhatsApp, TikTok, Pinterest | Stories, curadoria, compra pela rede |
| 3 | Trabalhador da periferia, só celular | 18–49, C2/D/E | WhatsApp, TikTok, Kwai, Facebook | Áudio, app leve, venda local pelo WhatsApp |
| 4 | Profissional que só observa | 25–44, A/B, superior | LinkedIn, Instagram, YouTube | Lê muito, quase nunca posta |
| 5 | Geração prateada | 50+ e 60+ | WhatsApp, Facebook, YouTube | Família, fé, áudio, vulnerável a golpe |
| 6 | Debatedor anônimo | 18–34, maioria homens, A/B | Reddit, X, Threads, Bluesky, Telegram | Pseudônimo, texto, militância |
| 7 | Audiovisual de tela grande | 25–54, B/C | YouTube (TV conectada), WhatsApp | Vídeo longo, tutorial, pesquisa antes de comprar |
| 8 | Geração Alpha | 9–14 | YouTube, WhatsApp, TikTok, jogos | Mediação dos pais, ECA Digital |
| 9 | Criador que vende | 18–39, B/C | Instagram, TikTok, YouTube, WhatsApp | Retenção, live commerce |
| 10 | Produtor do interior e do agro | 30–60+, rural | WhatsApp, YouTube, Facebook, Kwai | Uso técnico: clima, cotação, negócio |

## 7. Seis coisas que os dados mudam

1. **Falar vence escrever.** Mensagem de áudio é o recurso mais usado do WhatsApp (80%); texto caiu para sétimo (57%). A gravação já existe; o trabalho é pô-la no centro do modo assembleia: aviso com áudio, resumo falado anexado à ata, "Ouvir" (PM-27) para quem lê com dificuldade. Sem transcrição automática por enquanto (IA e privacidade).
2. **Menos gente posta em público** (de 41% para 30% em um ano; Melhores Amigos; conta secundária fechada; 65% do LinkedIn quase nunca posta). Desenhar para quem lê: grupo fechado por padrão, e não medir sucesso por quantidade de posts.
3. **A base escolhe app leve e fácil de compartilhar.** Motivos para usar o Kwai: fácil de começar (47%), leve (36%), baixar vídeo para mandar no WhatsApp (29%). 87% das classes D e E só usam celular. O PM-01 importa justamente para esses membros, e tudo o que o Vox produz deve ir fácil para o WhatsApp.
4. **A confiança caiu e o golpe cresceu.** Confiança em notícia em 36%; 47% evitam notícia; 60+ são os mais expostos a fraude. Conteúdo cívico local e prático (a rua, a obra, a reunião), não política nacional. Assinatura explicada como "veio mesmo da tesouraria", não como ideologia.
5. **Menor de idade está fora.** ECA Digital em vigor desde março de 2026, celular proibido na escola, decisão do STF sobre responsabilidade das plataformas em 2025. Manter o 18+. O [briefing](../legal/briefing-parecer-g1.md) já cobre o STF (Temas 987 e 533) e deixa o ECA Digital para depois (REV-23); fica urgente se um grupo do piloto tiver membros de 16 ou 17 anos.
6. **Meta AI dentro do WhatsApp** (49% já usaram) pode lançar "ata" própria. O Vox ganha no que a Meta não oferece: assinado, permanente, do grupo, conferível por terceiros, portátil.

## 8. Papel de cada perfil

| # | Papel | O que significa para o desenho |
|---|---|---|
| 1 | Lição, ainda não alvo | Grupo fechado por padrão; nunca empurrar post público. Centro acadêmico universitário (18+) depois. |
| 2 | Depois, pela Feira | Avisos de 24 h e Feira. Hipótese a checar: associações de pais em escolas. |
| 3 | **Membros**: a voz do povo | Nada para instalar; resposta por texto ou áudio no WhatsApp; mural que abre em celular barato e conexão fraca. |
| 4 | Não é alvo | No máximo, trabalho voluntário depois (advocacia, contabilidade). |
| 5 | **Quem organiza** | Telas no jeito do Facebook (grupos, eventos, "Vou/Talvez", "Neste dia"); letra grande, poucos passos, áudio; o selo contra golpe é para essas pessoas. Testar com gente de 50+, não com quem programa. |
| 6 | **Quem constrói**, não a primeira turma | As 10 primeiras tarefas e a segunda pessoa provavelmente vêm daqui (por exemplo a comunidade r/brdev). Como primeira turma do piloto, transformariam o Vox em outro X. |
| 7 | **Onde se ensina** | Vídeos curtos como "como fazer a ata da associação pelo celular": é no YouTube que os perfis 5 e 10 aprendem. |
| 8 | **Fora** | ECA Digital e regra de 18+. |
| 9 | Não é alvo | O Vox não tem alcance algorítmico para oferecer; não construir ferramenta de criador. |
| 10 | **Segundo nicho** | Associações e cooperativas de agricultura familiar: obrigação legal de assembleia, ata e contas; os programas públicos de compra (PNAE, PAA) passam por organizações formais; WhatsApp em 96%; conexão fraca, então offline importa. A assistência técnica rural (Emater/ATER) já forma essas associações. |

## 9. O alvo em uma frase

**Quem organiza tem 50+ (perfil 5), vive no WhatsApp e no Facebook e fala por áudio, e cuida de um grupo de membros da periferia que só usam celular (perfil 3).** O Vox é construído pelo perfil 6 e ensinado no YouTube (perfil 7); associações rurais (perfil 10) são o segundo nicho.

**A armadilha:** quem constrói (6) é o oposto de quem usa (3 e 5). Quem constrói gosta de texto, criptografia e anonimato, e tende a construir para si. Regra de proteção: toda funcionalidade do modo assembleia passa pelas mãos de alguém com mais de 50 anos antes de entrar. Cabe no teste com 5 leigos (LAN-25).

## 10. O que muda nas ideias anteriores

- **Telas de quem organiza seguem o Facebook**, não o Instagram nem o TikTok. Os cartões de pauta estilo TikTok descem na lista.
- **Voz no centro do modo assembleia**, com o gravador que já existe.
- **Grupo fechado por padrão.** O mural público mostra só o que o grupo decidir mostrar.
- **O selo contra golpe sobe**: responde ao maior medo do perfil 5.
- **Feira e vaquinha nunca encostam em rifa nem aposta.** O perfil 3 é o mais exposto a aposta online e rifa paga, e rifa é regulada no Brasil.
- **Conteúdo local e prático**; política nacional fica fora do piloto.

## 11. Identidade visual

As ilustrações trazidas mostram o contraste. Os perfis escolhidos (3, 5 e 10) aparecem em cenas quentes, de dia, ao ar livre ou em casa: ondas sonoras douradas saindo do celular (3), um brilho dourado com fotos de família e uma pomba (5), clima e cotação sobre a lavoura (10). Quem constrói aparece no escuro, iluminado pela tela, com neon e máscara (4 e 6).

**Hoje o Vox se parece com o perfil 6.** O design system ([ADR-016](../adr/016-design-system-sovereign-agora-e-democracia-direta.md)) usa fundo preto, gradiente neon de esmeralda a cobalto com brilho no botão de postar, anel neon no avatar e um vocabulário de "basalto", "estelas" e letra epigráfica. Para a avó do perfil 5, que tem medo de golpe, isso pode parecer app de cripto. É hipótese a testar, não fato.

**Não precisa de redesenho.** O modo claro "pergaminho" já existe (`color-mode.js`), e também a paleta de céu que acompanha a hora do dia (`sky-theme.js`); o padrão é "auto", que segue o celular. A mudança candidata:

1. O modo claro e quente vira a cara das ferramentas de quem organiza e do piloto.
2. Tirar palavra técnica de tudo o que um leigo lê.
3. Teste barato: mostrar a tela clara e a escura a três pessoas com mais de 50 anos e perguntar qual parece confiável e qual parece golpe.

**Achado nesta revisão:** três textos do app diziam que a chave da conta é Ed25519, mas a conta assina com ECDSA P-256. Correção em [yurikayel/vox#71](https://github.com/yurikayel/vox/pull/71), com teste que impede a volta.

| Perfil | Pista visual | O que o Vox pode fazer com ela |
|---|---|---|
| 3 | Ondas sonoras | No modo assembleia, o microfone como botão principal; a onda do áudio visível no aviso |
| 5 | Brilho dourado, fotos, pomba | Calor e rostos conhecidos: fotos de "antes e depois" do grupo, "Neste dia", letra grande |
| 10 | Clima e cotação | Cartões práticos: data, lugar, pauta, prazo |
| 1 | Anel verde de círculo fechado | Marca clara de "só o grupo vê" nos grupos fechados |
| 9 | Ring light e seta subindo | **Evitar**: nada de contagem de seguidores nem métrica de desempenho |
| 6 | Máscara | **Evitar** na divulgação: é a cara do "hacker anônimo" |
| 8 | Redoma de proteção | Fora (18+) |

## 12. Ilustrações e infográfico: cautelas

As duas imagens **não foram versionadas**, pelos motivos abaixo.

- **Marcas de terceiros:** logotipo da Apple nos notebooks e ícones no estilo do Instagram e do Facebook; na primeira imagem, uma máscara parecida com uma máscara de protesto conhecida. Servem para pensar; não publicar no repo, no site ou num pitch sem redesenhar.
- **O perfil 3 aparece como homem nas duas**, mas a pesquisa diz que as favelas são 62% mulheres, e 58% têm de 30 a 49 anos. Desenhar a partir da imagem é desenhar para a pessoa errada. As personas de verdade vêm da tabela de anotações do [roteiro da conversa](../pilot/piloto-g1-roteiro-conversa.md); as ilustrações só ajudam a pensar.
- **O infográfico troca dois perfis:** no lugar do 9 (criador que vende) e do 10 (produtor rural) aparecem "Adulto Conectado Funcional" e "Jovem Adulto Urbano Cosmopolita", que a pesquisa não tem. Some justamente o segundo nicho.
- **Outros desvios do infográfico:** "50+, 74,5% online" (na pesquisa, 74,5% é de quem tem 60+); "65% não postam" (são 34% que nunca postam e 31% que postam menos de uma vez por mês); "84% abrem o YouTube" (é todo dia); texto em português de Portugal ("Utilizadores", "Anónimo"); visual escuro e neon.
- **Arquétipo achata pessoas.** Proteção barata: uma linha no modelo de PR, "Serve a quem: organizador 50+ / membro só-celular / associação rural / ninguém do piloto".

## 13. Ordem sugerida (candidata)

Filtros: o modo assembleia precisa? Já está escrito e só falta plugar? Cabe no cache? (A folga do precache é de ~0,5 KB: o que for novo carrega só quando usado, ou espera o PM-01.)

| Ordem | Gesto | Por quê |
|---|---|---|
| 1 | Evento com "Vou/Talvez" e "Ciente" | Núcleo do modo assembleia: presença, quórum, prova de aviso |
| 2 | Avisos da comunidade com "Fixar no mural" | Como a convocação se espalha e o registro começa |
| 3 | Plugar `testimonials.js` como aval | Já escrito; ajuda identidade e barra conta falsa; memória afetiva do Orkut |
| 4 | Ata com resumo falado | Usa o gravador que existe; inclusão |
| Depois | Cartões de pauta, notas por acordo, "estou bem" offline, nota conjunta | — |

**Como testar familiaridade:** no teste com 5 leigos (LAN-25), mostrar uma tela sem explicar e perguntar "onde você tocaria para confirmar que vai?". Se a mão não vai lá por hábito, o gesto ainda não é conhecido.
