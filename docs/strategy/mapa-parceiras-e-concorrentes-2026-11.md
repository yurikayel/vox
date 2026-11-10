# Mapa de parceiras e concorrentes — 20 + 20 para observar e aprender

> **Status:** brainstorm / pesquisa · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). É uma lista de observação: ninguém aqui é "inimigo" nem "aliado" por decreto. Parceira e concorrente descrevem **relação e função**, não caráter.
> **Aviso de método:** pesquisa web de 2026-11-10, com **fontes secundárias** na maior parte. Cada número traz tipo e data. Onde a busca não achou fonte, a linha diz **"não verificado"**. Nenhuma linha deve ser publicada fora do repositório sem checar a fonte primária.

## 1. Critérios

- **Parceira:** divide objetivo ou arquitetura com a Vox, e há algo concreto para trocar (protocolo, dados, público, conhecimento).
- **Concorrente:** disputa a mesma função e o mesmo público. A Vox pode **continuar publicando lá** (POSSE); concorrente não significa "não usar".
- Uma mesma rede pode estar nas duas colunas em planos diferentes. Por isso cada linha diz **onde cooperamos** ou **onde disputamos**.
- **Consentimento:** só chamar alguém de parceira em público depois de avisar. Hoje **nenhuma** parceria abaixo está formalizada (a do Tramitado está em conversa, ver [brainstorm](../brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md)).
- **Confiança da informação:** **A** = número de empresa ou órgão oficial; **B** = imprensa ou tracker; **C** = estimativa conflitante; **N** = não verificado.

## 2. Vinte parceiras (redes e plataformas)

Inclui projetos pedidos pelo mantenedor (Varanda, Etnias, Tramitado, Sua Voz). Algumas são plataformas cívicas, não "redes sociais" no sentido estrito.

| # | Parceira | Tamanho ou adoção | Conf. | O que observar e aprender | Onde cooperamos |
|---|---|---|---|---|---|
| 1 | **Etnias** | 100 mil usuários em 500 comunidades (declarado em reportagem) [1] | B | Como uma rede de identidade forte cresce; operação, moderação e cadastro (pede telefone, sem termos visíveis) | Troca de modelos de termos e privacidade; compartilhar por link; piloto só com consentimento coletivo. |
| 2 | **Varanda** | Sem dado. Não achei fonte pública em busca | N | Diagnóstico interno: P2P puro (Holepunch), identidade Ed25519, diários assinados; risco de seeders, NAT e CGNAT ([LESSONS.md](../process/LESSONS.md)) | Trocar lições de P2P móvel, vocabulário cultural, sem depender de seeders |
| 3 | **Tramitado** | Sem dado público. Parceria em conversa | N | Tradução de projetos de lei e reflexão individual (ver [sinergia](../brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md)) | Protocolo aberto LCP; pauta legislativa na Vox (F9) |
| 4 | **Sua Voz** | Sem dado. Não localizada em busca | N | Confirmar o que é e quem mantém antes de qualquer contato | A definir |
| 5 | **e-Cidadania (Senado)** | 35 mi+ perfis; 19,8 mil ideias em 2018; 105 mil ideias em 10 anos [2] | A | Como um órgão público atrai participação em massa; o funil ideia → apoio → projeto | Dados abertos; levar a conversa de comunidade à consulta oficial |
| 6 | **Brasil Participativo** | Plataforma federal em Decidim; login gov.br [3] | A | Participação em escala governamental; parceria com a UnB | Interoperar pautas. **Cuidado:** independência política da Vox |
| 7 | **Decidim** | 400+ organizações em 30 países [3] | A | Software livre de participação mais adotado; governança da comunidade | Aprender o modelo de processos participativos; possível ponte de dados |
| 8 | **Serenata de Amor (OKBR)** | Projeto de ciência de dados da Open Knowledge Brasil [4] | B | IA contra gasto público irregular; comunidade voluntária | Pautas de fiscalização que viram enquetes na Vox |
| 9 | **Colab.re** | 100 mil cidadãos e 50+ clientes públicos, em 2017 (autodeclarado) [5] | C | Relação cidadão ↔ prefeitura; modelo B2G | Aprender o que falhou e o que sustentou |
| 10 | **Cidade Democrática / Pol.is** | Uso do Pol.is em experimento com propostas de governo aberto em SP; sem números [6] | C | Mapeamento de opiniões por agrupamento; a Vox já tem "Pol.is-lite" | Troca de método; consenso entre divergentes (ranking por ponte) |
| 11 | **Nossas / BONDE** | Associação sem fins lucrativos que opera a plataforma BONDE [7] | B | Mobilização e campanha digital sem anúncio comprado | Mobilização de comunidades; modelo de financiamento |
| 12 | **Data Privacy Brasil** | Associação de pesquisa em proteção de dados, São Paulo [8] | B | Pareceres e relatórios (LGPD, crianças) | **Revisão do kit de privacidade e termos (LAN-02, 03).** Candidata natural ao REV-12 |
| 13 | **Coalizão Direitos na Rede** | 40 a 48 entidades, conforme a fonte [8] | C | Advocacia de direitos digitais, posição sobre regulação de plataformas | Rede de apoio jurídico e de pauta |
| 14 | **Mastodon / Fediverso** | ~10,5 mi de contas; **menos de 1 mi** de ativos mensais; pico de 2,6 mi em nov/2022 [9] | C | Governança de instâncias, custo ao voluntário, defederação | Interoperar (ActivityPub) no longo prazo |
| 15 | **Bluesky / AT Protocol** | 43 a 46 mi de cadastros; MAU entre 5,3 e 27,5 mi (**sem número oficial**); Similarweb: 10,4 mi (jun/2026) [9] | C | Protocolo aberto com empresa por trás; leitura pública já usada pela Vox | Contas vinculadas já plugadas. **Parceria condicional** à governança |
| 16 | **Nostr** | Sem número confiável achado | N | Protocolo sem dono; a Vox já usa na sinalização (REV-09) | Pool de relays, teste de fumaça semanal (REV-19) |
| 17 | **Signal** | 70 a 100 mi (presidente da fundação, abr/2025); 2026 sem fonte oficial [10] | C | Fundação sem fins lucrativos; criptografia por padrão; coleta mínima | Referência para o modelo de DM e de ameaças |
| 18 | **Matrix / Element** | Sem número confiável achado | N | Protocolo aberto de mensagem descentralizada | Estudar interoperabilidade de comunidades |
| 19 | **Lemmy, PeerTube, Pixelfed** | Parte do Fediverso, ~12 mi de cadastros e ~2 mi de ativos no conjunto [9] | C | Comunidade (fórum), vídeo e foto federados | Referência de comunidades e de vídeo sem central |
| 20 | **Loomio** | Sem número achado | N | Ferramenta de decisão coletiva | Referência para o modo assembleia (PM-23) |

## 3. Vinte concorrentes

| # | Concorrente | Tamanho | Conf. | Função que disputa | O que aprender | A Vox pode usar como canal? |
|---|---|---|---|---|---|---|
| 1 | **WhatsApp** | 3 bi+ MAU (1º tri/2025, via imprensa) [11] | B | Mensagem e grupo | Confiabilidade de entrega, grupos, notificação | Sim (compartilhar, convite) |
| 2 | **Facebook** | 3 bi+ MAU (4º tri/2024, Meta) [11] | A | Grupos, eventos, Marketplace | Retenção de comunidade local | Sim |
| 3 | **Instagram** | 3 bi MAU (set/2025, Meta); 2 bi diários (jun/2026) [11][12] | A | Vitrine e imagem | Perfil visual, Reels, criadores | Sim (card 9:16) |
| 4 | **YouTube** | 2,65 bi, **alcance de anúncios** (abr/2026) [11] | C | Acervo e vídeo longo | Busca, pagamento a criadores | Sim (embed) |
| 5 | **TikTok** | 2,21 bi, **alcance de anúncios 18+** (abr/2026) [11] | C | Descoberta por recomendação | Feed por interesse | Só link |
| 6 | **Telegram** | 1 bi+ MAU (mar/2025, via imprensa) [11] | B | Canais e grupos grandes | Fan-out de canal, bots | Sim |
| 7 | **X (Twitter)** | 450 mi alcance de anúncios (abr/2026); outras fontes: 388 a 650 mi [11][13] | C | Debate público em tempo real | Cultura de debate, queda de usuários no Brasil (~4 mi) [14] | Só intent |
| 8 | **Threads** | 500 mi+ MAU (jun/2026, Meta) [11][12] | A | Texto curto e conversa | Crescimento a partir do Instagram | Só intent |
| 9 | **LinkedIn** | 1,43 bi, alcance de anúncios (abr/2026) [11] | C | Perfil profissional | Rede por vínculo de trabalho | Eventual |
| 10 | **Snapchat** | 971 mi MAU (2º tri/2026, Snap) [11] | A | Mensagem efêmera | TTL, câmera | Não |
| 11 | **Pinterest** | 640 mi MAU (2º tri/2026) [11] | A | Descoberta visual | Curadoria por interesse | Não |
| 12 | **Reddit** | 515 mi **semanais** e 130 mi diários (2026, a conferir: dois comunicados divergem) [15] | C | Fórum e comunidade | Moderação voluntária, subcomunidades | Eventual |
| 13 | **Kwai** | ~60 mi de MAU no Brasil (Caixin, dez/2025); 48 mi em 2022 [16] | B | Vídeo curto, forte no Brasil | Baixa banda, cache, live e comércio | Não |
| 14 | **Poosting** | 4 mi de usuários (jan/2026, relatos); entrada só por convite (fev/2026): informações conflitantes [17] | C | Rede brasileira sem algoritmo, feed cronológico | Crescimento por convite, discurso "sem algoritmo" | Não |
| 15 | **Discord** | Sem número confiável achado | N | Comunidades por servidor | Cultura de comunidade e moderação por papéis | Eventual |
| 16 | **Nextdoor** | Sem número confiável achado | N | Vizinhança e local | Hiperlocalidade | Não |
| 17 | **Paçoca** | Sem dado | N | Rede brasileira independente | Confirmar | Não |
| 18 | **Spalhe** | Sem dado; listada na App Store [17] | N | Rede brasileira de amizade | Confirmar | Não |
| 19 | **WeChat** | 1,44 bi MAU (jun/2026, Tencent) [11] | A | Superapp: mensagem, pagamento, mini-apps | Mini-apps, pagamento (Webxdc, Pix Zap) | Não |
| 20 | **Douyin** | ~714 mi diários, **estimativa** (jul/2026) [11] | C | Vídeo curto na China | Referência de recomendação e comércio; sem presença no Brasil | Não |

Truth Social, Rumble e Gettr **não entraram**: a busca não achou dados e a situação legal no Brasil é variável. Rever na próxima rodada.

## 4. O que a pesquisa mostrou (leitura crítica)

1. **Os números não são comparáveis.** Há MAU declarado, alcance de anúncios, usuário semanal e estimativas. Misturar tudo numa lista única engana.
2. **As parceiras com mais gente são as públicas e institucionais** (e-Cidadania, Brasil Participativo), não as redes alternativas. As redes abertas são pequenas: o Mastodon tem menos de 1 mi de ativos e o Bluesky tem número disputado.
3. **Três projetos que o mantenedor indicou (Varanda, Tramitado, Sua Voz) não têm rastro público** na busca. Isso não os invalida, mas significa que a Vox não pode usar nenhum deles como argumento de escala.
4. **Concorrente nacional pequeno cresce no mesmo discurso** (Poosting: sem algoritmo, brasileira). Vale observar mais de perto que as Big Techs.
5. **A Etnias** é a parceira com adoção expressiva e a que mais exige cuidado: soberania de dados indígenas e consentimento antes de qualquer proposta.

## 5. Como observar e aprender (rotina)

- **Revisão trimestral** desta lista, com data por linha.
- **Ficha por organização** (1 página): o que fazem, o que podemos aprender, o que perguntaríamos. Só a partir de fontes públicas.
- **Observação não é contato.** Nenhuma abordagem sem decisão do mantenedor.
- **Primeiras 5 fichas sugeridas:** Etnias, Data Privacy Brasil, Decidim, Poosting e Signal.

## 6. Pendências antes de usar fora do repositório

- [ ] Confirmar **Varanda, Tramitado e Sua Voz** com o mantenedor (links, responsáveis, estado).
- [ ] Buscar dados de Matrix, Nostr, Loomio, Discord, Nextdoor, Paçoca e Spalhe.
- [ ] Checar o comunicado do Reddit (130,3 mi aparece no 2º e no 3º tri com crescimentos diferentes).
- [ ] Trocar fontes secundárias por primárias (DataReportal, comunicados das empresas, FediDB).
- [ ] Rodar o [parecer jurídico](../ROADMAP.md) (REV-12) se a lista virar página pública com nomes de empresas.

## Fontes

1. [Brasil 247 — Etnias](https://www.brasil247.com/tecnologia/indigenas-do-para-e-de-ms-lancam-primeira-rede-social-para-povos-originarios/)
2. [Senado — e-Cidadania 2018](https://www12.senado.leg.br/noticias/materias/2019/01/18/portal-e-cidadania-teve-recorde-de-participacao-em-2018-embalado-pelas-eleicoes) · [10 anos](https://www12.senado.leg.br/noticias/materias/2023/12/28/participacao-popular-no-processo-legislativo-triplicou-em-2023)
3. [Agência Gov — Brasil Participativo e Decidim](https://agenciagov.ebc.com.br/noticias/202511/brasil-participativo-integra-comite-internacional-de-democracia-digital) · [Decidim](https://decidim.org/blog/2024-12-20-brazilian-government-and-decidim-association-formalize-partnership-with-a-memorandum-of-understanding/)
4. [BID — Serenata de Amor](https://knowledge.iadb.org/code-development/open-source-solutions/serenata-de-amor)
5. [New Cities — Colab.re](https://newcities.org/colab-re)
6. [Cidade Democrática — Pol.is](https://medium.com/cidades-democráticas/how-pol-is-is-being-adopted-by-cidade-democrática-in-brazil-1fd744b2aece)
7. [Nossas — política de privacidade](https://antigo2.meurio.org.br/static/politica-de-privacidade.pdf)
8. [Data Privacy Brasil](https://observatory.thedatasphere.org/Organizations/Data+Privacy+Brasil)
9. [FediView — Fediverso em números](https://fediview-project.pages.dev/articles/fediverse-in-numbers-mastodon-stats-2026) · [Daring Fireball — Bluesky](https://daringfireball.net/linked/2026/08/21/bluesky-user-base-is-tiny)
10. [SQ Magazine — Signal](https://sqmagazine.co.uk/signal-statistics/)
11. [Exploding Topics — ranking](https://explodingtopics.com/blog/top-social-media-platforms)
12. [Meta, 8-K 2º tri/2026](https://www.sec.gov/Archives/edgar/data/0001326801/000162828026050596/meta-06302026xexhibit991.htm)
13. [SQ Magazine — X](https://sqmagazine.co.uk/twitter-users-statistics/)
14. [Redes sociais mais usadas no Brasil 2026](https://viniensina.com.br/?p=4274)
15. [Reddit, comunicado do 3º tri/2026](https://s203.q4cdn.com/380862485/files/content_files/Q3-26-Earnings-Press-Release.pdf)
16. [Caixin — Kwai no Brasil](https://www.caixinglobal.com/2025-12-11/kuaishous-kwai-conquers-brazil-by-ditching-the-time-machine-strategy-102392161.html)
17. [Mobile Time — Poosting](https://www.mobiletime.com.br/noticias/06/02/2026/poosting-rede-social-br/) · [Fast Company Brasil](https://fastcompanybrasil.com/tech/poosting-conheca-a-rede-social-sem-algoritmos-criada-pelo-zuckerberg-cearense/) · [Spalhe na App Store](https://apps.apple.com/au/app/id6444139282)
