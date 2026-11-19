# Mapa de parceiras e concorrentes — 20 + 20 para observar e aprender

> **Status:** brainstorm / pesquisa · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-19
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). É uma lista de observação: ninguém aqui é "inimigo" nem "aliado" por decreto. Parceira e concorrente descrevem **relação e função**, não caráter.
> **Aviso de método:** rodada inicial 2026-11-10 (maioria **fontes secundárias**); addendum **2026-11-19** com **fontes primárias** onde indicado (GitHub `Varanda-org/varanda`, sites do Fediverso BR, repos Énóis). Cada número traz tipo e data. Onde não há fonte, a linha diz **"não verificado"**. Nenhuma linha deve ser publicada fora do repositório sem checar a fonte primária.

## 1. Critérios

- **Parceira:** divide objetivo ou arquitetura com a Vox, e há algo concreto para trocar (protocolo, dados, público, conhecimento).
- **Concorrente:** disputa a mesma função e o mesmo público. A Vox pode **continuar publicando lá** (POSSE); concorrente não significa "não usar".
- Uma mesma rede pode estar nas duas colunas em planos diferentes. Por isso cada linha diz **onde cooperamos** ou **onde disputamos**.
- **Consentimento:** só chamar alguém de parceira em público depois de avisar. Hoje **nenhuma** parceria abaixo está formalizada (a do Tramitado está em conversa, ver [brainstorm](../brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md)).
- **Confiança da informação:** **A** = número de empresa ou órgão oficial; **B** = imprensa ou tracker; **C** = estimativa conflitante; **N** = não verificado.
- **Homônimos:** conferir domínio e mantenedor antes de citar. Ex.: rede P2P **Varanda** (`varanda.app`, [GitHub](https://github.com/Varanda-org/varanda)) ≠ rede comercial de bairro **Varanda Campinas** (`varanda.app.br`).
- **Tracking:** atores com entrega rápida de produto estão também em **§3.1** com data da última verificação; atualizar na revisão trimestral.

## 2. Vinte parceiras (redes e plataformas)

Inclui projetos indicados pelo mantenedor (Etnias, Tramitado, **Sua Voz** — mantida na lista). Algumas são plataformas cívicas, não "redes sociais" no sentido estrito. **Varanda** saiu desta tabela (concorrente direto P2P BR, ver §3).

| # | Parceira | Tamanho ou adoção | Conf. | O que observar e aprender | Onde cooperamos |
|---|---|---|---|---|---|
| 1 | **Etnias** (`etnias.site`) | ~100 mil usuários, ~500 comunidades (reportagem, início nov/2026) [1][19] | B | Rede indígena (modelo *Opy*); 5 línguas; loja; pede telefone — soberania **cultural**, plataforma centralizada | Troca de termos e Feira; compartilhar por link; piloto só com **consentimento coletivo** |
| 2 | **Énóis** (`Rede-ENois/enois-*`) | Open source BR (tech); ~70★ backend, ~63★ frontend; commits nov/2026 [20] | A | Rede social brasileira para devs (React 19 + Spring Boot); ritmo de comunidade | Troca de contribuidores, POSSE, boas práticas BR (sem assumir parceria) |
| 3 | **Tramitado** | Sem repo/URL público confirmado. Conversa em andamento | N | Tradução de PLs e reflexão individual ([sinergia](../brainstorms/brainstorm-sinergia-tramitado-vox-2026-11.md)) | Protocolo LCP; pauta legislativa na Vox (F9) — **confirmar link com mantenedor** |
| 4 | **Sua Voz** | **Mantida na lista por decisão do mantenedor.** Não localizada como rede aberta em buscas (homônimos: ouvidoria/compliance) | N | Confirmar projeto, URL e responsável antes de qualquer contato | A definir (ex. ponte com dados abertos Câmara/Senado, ver [brainstorm F9](../brainstorms/brainstorm-autossustento-10-features-2026-11.md)) |
| 5 | **e-Cidadania (Senado)** | 35 mi+ perfis; 19,8 mil ideias em 2018; 105 mil ideias em 10 anos [2] | A | Participação em massa; funil ideia → apoio → projeto | Dados abertos; levar conversa de comunidade à consulta oficial |
| 6 | **Brasil Participativo** | Plataforma federal em Decidim; login gov.br [3] | A | Participação governamental; parceria UnB | Interoperar pautas. **Cuidado:** independência política da Vox |
| 7 | **Decidim** | 400+ organizações em 30 países [3] | A | Software livre de participação; governança da comunidade | Modelo de processos; possível ponte de dados |
| 8 | **Serenata de Amor (OKBR)** | Projeto OKBR [4] | B | IA contra gasto público irregular; voluntários | Pautas de fiscalização → enquetes na Vox |
| 9 | **Colab.re** | 100 mil cidadãos, 50+ clientes públicos (2017, autodeclarado) [5] | C | Cidadão ↔ prefeitura; B2G | O que falhou e o que sustentou |
| 10 | **Cidade Democrática / Pol.is** | Experimento governo aberto SP; sem números [6] | C | Agrupamento de opiniões; Vox tem "Pol.is-lite" | Método; consenso (bridging-rank, lab) |
| 11 | **Nossas / BONDE** | Associação sem fins lucrativos [7] | B | Mobilização sem anúncio comprado | Comunidades; financiamento |
| 12 | **Data Privacy Brasil** | Associação SP [8] | B | LGPD, crianças, relatórios | **REV-12 / LAN-01** — kit de privacidade e termos |
| 13 | **Coalizão Direitos na Rede** | 40–48 entidades [8] | C | Advocacy; regulação de plataformas | Apoio jurídico e de pauta |
| 14 | **Mastodon / Fediverso (global)** | ~10,5 mi contas; **&lt;1 mi** MAU; pico 2,6 mi nov/2022 [9] | C | Instâncias, custo voluntário, defederação | ActivityPub no longo prazo. **Fediverso BR:** §2.2 |
| 15 | **Bluesky / AT Protocol** | Cadastros e MAU **disputados** [9] | C | Protocolo aberto com empresa; leitura já na Vox | Contas vinculadas. Parceria condicional |
| 16 | **Nostr** | Sem número confiável | N | Protocolo sem dono; sinalização Vox (REV-09) | Pool de relays; teste fumaça (REV-19) |
| 17 | **Signal** | 70–100 mi (estimativa fundação, 2025) [10] | C | NGO; criptografia padrão; coleta mínima | Referência DM e ameaças |
| 18 | **Matrix / Element** | Sem número confiável | N | Mensageria descentralizada federada | Interoperabilidade; **MSG GOV** §2.3 |
| 19 | **Lemmy, PeerTube, Pixelfed** | Parte do Fediverso global [9] | C | Fórum, vídeo, foto federados | Comunidade e vídeo sem central |
| 20 | **Loomio** | Sem número achado | N | Decisão coletiva | Modo assembleia (PM-23) |

### 2.1 Parceiros a observar (fora das 20, sem contato e sem compromisso)

| Parceiro | Tamanho ou adoção | Conf. | O que observar | Para sair de "observar" |
|---|---|---|---|---|
| **OccupySaaS** | GitHub ~1 mil seguidores; ZeroAuthy 475★ [18] | B | Comunidade open source; `CLEAN_ROOM.md` | Governança e mantenedores claros |
| **Noosfero** (Colivre) | AGPLv3; referência BR madura | B | Economia solidária, autogestão web | Só referência técnica Feira — §2.3 |

### 2.2 Fediverso brasileiro e articulação (observação — não é parceira formal)

Coração organizado da soberania digital BR hoje; **ausente na rodada 2026-11-10**. Só observação; **não** chamar de parceira em público sem contato.

| Iniciativa | O que é | Conf. | O que aprender | Encaixe Vox |
|---|---|---|---|---|
| **Alquimídia** (`alquimidia.org`, `nossa.social.br`) | ONG SC; Observatório do Fediverso; instâncias culturais | B | Cultura digital livre, Pontos de Cultura | Pilotos futuros; distribuição sem Big Tech [21] |
| **Bolhaverse** (`bolha.us`, `bolha.io`, `bolha.photos`, `bolha.tube`) | Maior ecossistema comunitário BR (Mastodon, Pixelfed, PeerTube, Lemmy) | B | Moderação humana, custo de voluntários | Operação de stewards BR; POSSE [22] |
| **URSAL** (`ursal.zone`) | Mastodon BR/LatAm, movimentos sociais | B | Público cívico-alto | POSSE; moderação comunitária |
| **WebSocialBR** (`websocial.org.br`) | Fórum nacional do Fediverso (MCTI) | B | Gestores, devs, ativistas | Apresentar arquitetura local-first quando sair do modo fechado |
| **FediGov** (`fedigov.org.br`) | Adoção Fediverso no setor público (ex. museus) | B | Universidades, órgãos | PM-107; ADR-018 |
| **Rede pela Soberania Digital** (`red.org.br`) | Articulação política; decálogo código público | B | Alinhamento "dinheiro público, código público" | Tese AGPL / bem comum |

### 2.3 Plataformas cívicas e soberania pública (complemento)

| Iniciativa | Conf. | Nota para a Vox |
|---|---|---|
| **MSG GOV** (Matrix + `gov.br`) | B | Mensageiro soberano federal; valida direção [ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md) |
| **Mudamos** (Nupef / ITS) | B | IPL e participação; referência assembleia (PM-23) |
| **Noosfero** | B | AGPL; Feira e governança livre BR (ver §2.1) |

## 3. Vinte concorrentes

| # | Concorrente | Tamanho | Conf. | Função que disputa | O que aprender | Canal POSSE? |
|---|---|---|---|---|---|---|
| 1 | **WhatsApp** | 3 bi+ MAU [11] | B | Mensagem e grupo | Entrega, grupos, push | Sim |
| 2 | **Facebook** | 3 bi+ MAU [11] | A | Grupos, eventos, Marketplace | Comunidade local | Sim |
| 3 | **Instagram** | 3 bi MAU [11][12] | A | Vitrine, imagem | Perfil visual, Reels | Sim |
| 4 | **YouTube** | Alcance anúncios [11] | C | Vídeo longo | Busca, criadores | Sim (embed) |
| 5 | **TikTok** | Alcance 18+ [11] | C | Descoberta por recomendação | Feed por interesse | Só link |
| 6 | **Telegram** | 1 bi+ MAU [11] | B | Canais, grupos grandes | Fan-out, bots | Sim |
| 7 | **X (Twitter)** | Alcance anúncios [11][13] | C | Debate tempo real | Cultura de debate | Só intent |
| 8 | **Threads** | 500 mi+ MAU [11][12] | A | Texto curto | Crescimento via Instagram | Só intent |
| 9 | **LinkedIn** | Alcance anúncios [11] | C | Perfil profissional | Rede por trabalho | Eventual |
| 10 | **Snapchat** | 971 mi MAU [11] | A | Mensagem efêmera | TTL, câmera | Não |
| 11 | **Pinterest** | 640 mi MAU [11] | A | Descoberta visual | Curadoria | Não |
| 12 | **Reddit** | 515 mi semanais [15] | C | Fórum, subcomunidades | Moderação voluntária | Eventual |
| 13 | **Kwai** | ~60 mi MAU Brasil [16] | B | Vídeo curto BR | Baixa banda, live, comércio | Não |
| 14 | **Poosting** | ~4 mi (jan/2026, relatos); convite; narrativa anti-algoritmo, 18+ [17] | C | Rede BR centralizada "sem algoritmo" | Crescimento por convite; discurso soberania comercial | Não |
| 15 | **Discord** | Não verificado | N | Servidores e papéis | Cultura de comunidade | Eventual |
| 16 | **Varanda** (`varanda.app`, [GitHub](https://github.com/Varanda-org/varanda)) | Repo público; 846+ PRs; merge diário nov/2026 [19] | A | Rede social BR **P2P** (Holepunch/Bare), Feira, grupos, DMs | OG previews no seeder (**[PM-105](../ROADMAP.md)**); push nativo. **PolyForm Noncommercial** — **proibido copiar código** na Vox AGPL; só *clean-room* | Só link (preview futuro) |
| 17 | **Paçoca** | App BR independente; poucos dados públicos | N | Rede social nacional fechada/comercial | Confirmar modelo e escala | Não |
| 18 | **Spalhe** | Listado App Store [17] | N | Amizades BR | Confirmar | Não |
| 19 | **WeChat** | 1,44 bi MAU [11] | A | Superapp | Mini-apps, pagamento | Não |
| 20 | **Douyin** | Estimativa China [11] | C | Vídeo curto (sem presença BR) | Recomendação e comércio | Não |

**Deslocados desta tabela (observação global):** Nextdoor (hiperlocal EUA/Europa). Truth Social, Rumble e Gettr: dados fracos e situação legal BR variável.

**Varanda — features recentes (13–19/11/2026, GitHub):** link previews públicos + OG + capa JPEG no semeador (#550–552, #806–807, #840); push iOS/Android + sync de "visto" (#831–844); Feira, Páginas, Varandinha (#780–836); trending/descoberta no seeder (#804–830); rumo App Store (`docs/ios-gate.md`, SMS/cadastro). Contraste Vox: chave local P-256, sem SMS obrigatório ([ADR-032](../adr/032-login-perene-a-conta-nasce-com-saida.md), [ADR-037](../adr/037-cofre-na-malha.md)).

### 3.1 Tracking — concorrentes e alternativas BR (features recentes)

Modelo para rotações trimestrais. **Próxima checagem sugerida:** 2026-02-19.

| Ator | Última verificação | Entregas recentes (fonte) | O que a Vox pode espelhar (*clean-room*) | Próxima checagem |
|---|---|---|---|---|
| **Varanda** | 2026-11-19 | P2P ativo; previews OG/JPEG; push; Feira/Páginas; App Store gate [19] | Página pública de link compartilhado + assinatura (**PM-105**); não o modelo SMS/associação | 2026-02-19 |
| **Etnias** | 2026-11-19 | Lançamento nov/2026; escala declarada em imprensa [1] | Nicho identitário + Feira; termos e consentimento | 2026-02-19 |
| **Poosting** | 2026-11-11 | Feed cronológico; convite; marketing "sem algoritmo" [17] | Discurso POSSE vs centralização; não copiar produto fechado | 2026-02-19 |
| **Énóis** | 2026-11-19 | Commits ativos; stack web moderna [20] | Comunidade dev BR; POSSE e governança open source | 2026-02-19 |
| **Kwai** | 2025-12 (imprensa) | MAU BR; live e comércio [16] | Cache, baixa banda (não competir em vídeo recomendado) | 2026-02-19 |

## 4. O que a pesquisa mostrou (leitura crítica)

1. **Os números não são comparáveis.** MAU, alcance de anúncios e estimativas não devem ser misturados.
2. **Parceiras com mais escala continuam sendo as institucionais** (e-Cidadania, Brasil Participativo). Redes alternativas são pequenas no agregado global, mas **o Fediverso BR e o Varanda** são eixos vivos de soberania digital no Brasil — detalhe em §2.2 e §3.1.
3. **Varanda tem rastro público forte** (nov/2026): concorrente P2P BR com licença **não OSI**; lições são **conceituais**, não de fork de código. **Tramitado** e **Sua Voz** seguem sem URL/repo confirmado — **Sua Voz permanece na lista** até o mantenedor informar o projeto.
4. **Concorrentes BR "sem algoritmo"** (Poosting, Varanda) competem no mesmo discurso da Vox com modelos muito diferentes (centralizado convite vs P2P com SMS vs local-first AGPL).
5. **Etnias** exige consentimento coletivo antes de qualquer proposta de piloto.
6. **Homônimo Varanda Campinas** não é o produto P2P de `varanda.app`.

## 5. Como observar e aprender (rotina)

- **Revisão trimestral:** atualizar §3.1, revisar Conf. e datas em §7.
- **Checklist técnica:** para atores BR P2P/open, 1 passagem por GitHub (commits/PRs/releases) por rodada.
- **Ficha por organização** (1 página): só fontes públicas; observação **não é contato**.
- **Primeiras fichas sugeridas (atualizado):** Varanda (PM-105), Etnias, Data Privacy Brasil, Alquimídia/WebSocialBR, Poosting.

## 6. Pendências antes de usar fora do repositório

- [x] **Varanda** — verificado em fonte primária GitHub (2026-11-19); classificado como concorrente; homônimo Campinas documentado.
- [ ] Confirmar **Tramitado** (link, responsável, estado) com o mantenedor.
- [ ] Confirmar **Sua Voz** (mantida na lista): URL, responsável, se é rede aberta ou outro produto.
- [ ] Buscar dados primários de Matrix, Nostr, Loomio, Discord, **Paçoca** e **Spalhe**.
- [ ] Checar comunicado Reddit (divergência 2º/3º tri 2026).
- [ ] Trocar fontes secundárias por primárias onde possível (FediDB, comunicados).
- [ ] Rodar [parecer jurídico](../ROADMAP.md) (REV-12) se a lista virar página pública.

## 7. Fontes

1. [Brasil 247 — Etnias](https://www.brasil247.com/tecnologia/indigenas-do-para-e-de-ms-lancam-primeira-rede-social-para-povos-originarios/)
2. [Senado — e-Cidadania](https://www12.senado.leg.br/noticias/materias/2023/12/28/participacao-popular-no-processo-legislativo-triplicou-em-2023)
3. [Agência Gov — Brasil Participativo](https://agenciagov.ebc.com.br/noticias/202511/brasil-participativo-integra-comite-internacional-de-democracia-digital) · [Decidim](https://decidim.org/blog/2024-12-20-brazilian-government-and-decidim-association-formalize-partnership-with-a-memorandum-of-understanding/)
4. [BID — Serenata de Amor](https://knowledge.iadb.org/code-development/open-source-solutions/serenata-de-amor)
5. [New Cities — Colab.re](https://newcities.org/colab-re)
6. [Cidade Democrática — Pol.is](https://medium.com/cidades-democráticas/how-pol-is-is-being-adopted-by-cidade-democrática-in-brazil-1fd744b2aece)
7. [Nossas — política de privacidade](https://antigo2.meurio.org.br/static/politica-de-privacidade.pdf)
8. [Data Privacy Brasil](https://observatory.thedatasphere.org/Organizations/Data+Privacy+Brasil)
9. [FediView — Fediverso](https://fediview-project.pages.dev/articles/fediverse-in-numbers-mastodon-stats-2026) · [Bluesky](https://daringfireball.net/linked/2026/08/21/bluesky-user-base-is-tiny)
10. [SQ Magazine — Signal](https://sqmagazine.co.uk/signal-statistics/)
11. [Exploding Topics — ranking social](https://explodingtopics.com/blog/top-social-media-platforms)
12. [Meta 8-K 2º tri/2026](https://www.sec.gov/Archives/edgar/data/0001326801/000162828026050596/meta-06302026xexhibit991.htm)
13. [SQ Magazine — X](https://sqmagazine.co.uk/twitter-users-statistics/)
14. [Redes no Brasil 2026](https://viniensina.com.br/?p=4274)
15. [Reddit Q3/2026](https://s203.q4cdn.com/380862485/files/content_files/Q3-26-Earnings-Press-Release.pdf)
16. [Caixin — Kwai Brasil](https://www.caixinglobal.com/2025-12-11/kuaishous-kwai-conquers-brazil-by-ditching-the-time-machine-strategy-102392161.html)
17. [Mobile Time — Poosting](https://www.mobiletime.com.br/noticias/06/02/2026/poosting-rede-social-br/) · [Fast Company Brasil](https://fastcompanybrasil.com/tech/poosting-conheca-a-rede-social-sem-algoritmos-criada-pelo-zuckerberg-cearense/) · [Spalhe App Store](https://apps.apple.com/au/app/id6444139282)
18. [OccupySaaS](https://occupysaas.com/) · [GitHub](https://github.com/occupysaas)
19. [Varanda — GitHub `Varanda-org/varanda`](https://github.com/Varanda-org/varanda) · [varanda.app](https://varanda.app) (consultados 2026-11-19; atividade de PRs mergeados)
20. [Énóis — GitHub `Rede-ENois`](https://github.com/Rede-ENois) (consultado 2026-11-19)
21. [Alquimídia](https://alquimidia.org/) · [nossa.social.br](https://nossa.social.br)
22. [Bolha.us](https://bolha.us/) · [WebSocialBR](https://websocial.org.br/) · [FediGov](https://fedigov.org.br/) · [Rede pela Soberania Digital](https://red.org.br/) · [URSAL](https://ursal.zone/) (consultados 2026-11-19)