# Brainstorm — observação Énóis (`enois.ia.br`)

> **Status:** brainstorm · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-19 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md))
> **Fontes:** observação em `enois.ia.br` (nov/2026); repositórios públicos [`Rede-ENois/enois-frontend`](https://github.com/Rede-ENois/enois-frontend) (React 19, TanStack Start, `@rede-enois/design-system`) e [`Rede-ENois/enois-backend`](https://github.com/Rede-ENois/enois-backend) (Spring Boot 4, Java 25, MariaDB, **GPL-3.0**). Parceira de **observação**, não de parceria formal — ver [mapa §4.2](../strategy/mapa-parceiras-e-concorrentes-2026-11.md).

Tudo aqui é **candidato** até virar linha no ROADMAP ou spec. Não copiar código GPL na Vox AGPL: só *clean-room* de UX e processo.

## 1. Decomposição por rota (11 telas)

| Rota | Elementos observados | Capacidade no repositório Énóis |
|---|---|---|
| `/feed` | Composer; filtro `Tipo de feed`; chips (`Insights`, `Dúvidas`, `Projetos`, …); selos no avatar; pills tipo+tema; **some em 24h**; nota de rodapé; reações arrastáveis; sidebar eventos, mini-jogos, sugestões | `ComposerCrossPost`; UX de gesto (reações arrastáveis) — lição de descoberta, não de cópia literal |
| `/mensagens` | Um card: senha para proteger mensagens + frase sobre E2E sem jargão | Referência de copy para DM E2E / Senha Soberana na Vox |
| `/rede` | Afinidade, não volume; molduras e nomes estilizados; `Conectar` | Calor identitário (lista fechada CSS na Vox, sem paywall) |
| `/comunidades` | Chips temáticos; filtro **Cidade / Estado**; bloco **Perto de você** | Descoberta hiperlocal declarada (sem GPS invasivo) — [ADR-038](../adr/038-subrede-malha-e-manifesto.md) |
| `/grupos` | Separado de comunidades; **Entrada aberta** vs **Entrada por aprovação** | Fronteira fórum público × sala fechada (paralelo comunidade × DM/grupo na Vox) |
| `/grupos/:slug` | Capa; **Tamo junto voz/vídeo**; sub-tópicos em pills horizontais | Pills de assunto na comunidade Vox (candidata); live **não** copiar (ANPD, INF-01) |
| `/eventos` | Abas **Todos** / **Rituais** (`Todo mês · Próximo: DD/MM`); confirmar presença; chamada ao vivo | Rituais → [aviso-assinado-v0](../specs/aviso-assinado-v0.md) + [modo-assembleia-v0](../specs/modo-assembleia-v0.md) (PM-97, PM-23) |
| `/blogs` | Cantinhos fora do feed (portfólio, *digital garden*) | Posts `kind: article` + perfil/comunidade (candidata pós-PM-01) |
| `/par-de-estudo` | Match 1-a-1 por objetivo; chips de quem busca par agora | Par de ação em comunidades pequenas (candidata) |
| `/explorar` | Salas por aba (**Comunidade 13**, **Brincar 2**, **Construir 3**); busca | `explorar.tsx`, `explore-items.ts`: **`disabledModules`** — usuário liga/desliga módulos |
| Contexto **Trabalho** | `/profissional`, `/vagas`, `/servicos`, `/mentoria` isolados da UI social | Inspira separar Feira/profissional do feed cívico (já parcial na Vox) |

**Bônus só no repo Énóis:** `/responsavel`, `/penalidades`, preferências de notificação + digest, `/agenda/assinatura` (iCal), **Faísca** (cosmético comunitário, sem dinheiro real), `docs/proof/` (screenshots por PR).

## 2. O que não copiar na Vox

1. **Backend central autoritativo** — decisão no servidor quebra assinatura verificável no aparelho (invariante Vox).
2. **`Tamo junto` voz/vídeo ao vivo** — risco regulatório (ANPD × Discord Go Live); SFU/TURN congelado ([INF-01](../ROADMAP.md)).
3. **Confessionário anônimo global** — risco jurídico CF/88, Marco Civil, ECA Digital.
4. **Carregar dezenas de salas no precache** — viola teto do shell; módulos extras só `import()` lazy, Webxdc ou flag ([PM-01](../ROADMAP.md), [ADR-012](../adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)).

## 3. Incrementos candidatos (ondas 1–3, catálogo IXV)

Códigos **`IXV-01`…`IXV-14`** (*inspirados Énóis → Vox*) organizam ideias até spec/DoD; **não** abrem linhas novas no [ROADMAP](../ROADMAP.md) ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Nomes canônicos de UI: [GLOSSARIO.md](../GLOSSARIO.md) (candidatos IXV).

**Ágora × Explorar:** o feed principal é `#/`, nome **Ágora** na UI ([ADR-016](../adr/016-design-system-sovereign-agora-e-democracia-direta.md), `shell.js`): praça grega + **agora** (o momento do espaço público) — ver [síntese praça](./brainstorm-sintese-praca-de-colunas-2026-11-10.md). **Explorar** (`#/explorar`, IXV-01) é outra tela: vitrine **lazy** de stoas, Feira, Mesa, Salas Precisas; não substitui a Ágora. Não promover rota `#/agora`.

### Onda 1 — alto impacto, custo mínimo

| IXV | Nome Vox (UI) | Rota / superfície | Encaixe técnico | ROADMAP / ADR | Por que vale | Inspiração Énóis |
| --- | --- | --- | --- | --- | --- | --- |
| **01** | **Explorar** | `#/explorar` | Preferências locais `modulosLigados`; lazy `route.js` | PM-01 | Menu enxuto; nada pesado no precache | `/explorar`, `disabledModules` por usuário |
| **02** | **Posts temporários** | Compositor + feed | `expiresAt` visível; [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md); `profile-note.js` | REV-11, ADR-019 | Esquecimento declarado no cotidiano | chip “some em 24h” |
| **03** | **Comunidades** (filtro cidade/UF) | `#/communities` | Manifesto `city`/`state`; filtro local “perto de você”, sem GPS | ADR-038 | Descoberta hiperlocal declarada | filtro Cidade/Estado, “Perto de você” |
| **04** | **Assuntos** | `#/c/:id` | Pills: *Tudo · Avisos · Pautas · Feira · Dúvidas* | candidata pós-PM-01 | Menos ruído no mural comunitário | pills horizontais em `/grupos/:slug` |
| **05** | **Recorrente** | Comunidade + aviso | `convocacao` + `ritualRule`; RSVP `aviso-resposta` | PM-97, PM-23, [modo-assembleia-v0](../specs/modo-assembleia-v0.md) | Hábito de assembleia sem feed tóxico | aba **Rituais** + confirmar presença |
| **06** | **Salvos** (pastas locais) | `#/salvos` | Evolui marcador em `social.js` → rota + pastas IDB | candidata | Acervo pessoal offline-first | coleções locais |
| **07** | **Mensagens protegidas** + **Para responsáveis** | `#/dm`, onboarding; `#/responsavel` / Voxpedia | Copy E2E mínima; 18+ | REV-23, LAN-03 | Confiança sem jargão de cripto | card senha + `/responsavel` |

### Onda 2 — pós-PM-01, lazy

| IXV | Nome Vox (UI) | Rota / superfície | Encaixe técnico | ROADMAP / ADR | Por que vale | Inspiração Énóis |
| --- | --- | --- | --- | --- | --- | --- |
| **08** | **Nota de contexto** | No tópico | Post filho assinado ligado ao pai | REV-02, `bridging-rank`, `polis.js` | Camada verificável sem apagar o original | nota de rodapé no post |
| **09** | **Coluna** | `#/perfil`, `#/c/:id` | `kind: "coluna"`; equivalente a **blog**; fora do fluxo da **Ágora** | candidata | Acervo longo (estatuto, diário) sem timeline | `/blogs`, *digital garden* |
| **10** | **Molduras cívicas** | `#/perfil` | Voxels + paleta CSS fechada | ADR-013 | Calor identitário sem paywall/XSS | molduras em `/rede` |
| **11** | *(adiado)* | — | Overlap com Recorrente, convocação, DM | fora do catálogo v1 | Ver §7 | `/par-de-estudo` |
| **12** | **Mural fixado** + **Sugestão na pauta** | `#/c/:id` | Curadoria de posts + proposta leve em governança | `governance.js` | Sinalização estável + mudança de regra visível | murais + sugestões votadas |

### Onda 3 — ecossistema e disciplina (gate)

| IXV | Nome Vox (UI) | Gate | Notas |
| --- | --- | --- | --- |
| **13** | **Salas Precisas** | PM-01 + contrato comunitário | Webxdc, CSP; **Mesa** (`#/dungeon`, `dungeon-chrome.js`) como referência |
| **14** | **Livro de transparência** | REV-20 | Relatório de ocultações + prova visual em PR |

## 4. Top quatro (se só couber pouco no shell)

1. **Explorar** (`#/explorar`, IXV-01) + módulos desligáveis (PM-01).
2. **Recorrente** + filtro cidade/UF em comunidades (IXV-05, IXV-03; PM-97, PM-23, ADR-038).
3. **Posts temporários** + **Nota de contexto** (IXV-02, IXV-08; ADR-019, labs).
4. **Molduras cívicas** + **Salas Precisas** (IXV-10, IXV-13; ADR-012, ADR-013).

## 5. Processo observável (não é roadmap imediato)

- **Transparência de punições** (`/penalidades`) inspira relatório anual REV-20.
- **Proof em PR** (desktop + mobile versionados) inspira checklist de UI no CI humano.
- **Digest semanal** inspira PM-103 “Estado da praça”, não notificação push centralizada.

## 6. Catálogo IXV (índice rápido)

| IXV | Nome Vox (UI) | Onda | Ativo em v1 |
| --- | --- | --- | --- |
| 01 | Explorar | 1 | sim |
| 02 | Posts temporários | 1 | sim |
| 03 | Comunidades (filtro cidade/UF) | 1 | sim |
| 04 | Assuntos | 1 | sim |
| 05 | Recorrente | 1 | sim |
| 06 | Salvos | 1 | sim |
| 07 | Mensagens protegidas + Para responsáveis | 1 | sim |
| 08 | Nota de contexto | 2 | sim |
| 09 | Coluna | 2 | sim |
| 10 | Molduras cívicas | 2 | sim |
| 11 | *(par de estudo — arquivado)* | — | **não** |
| 12 | Mural fixado + Sugestão na pauta | 2 | sim |
| 13 | Salas Precisas | 2 / gate 3 | sim |
| 14 | Livro de transparência | 3 | sim |

## 7. Explicações (IXV 08–14 e visão de Salas Precisas)

**IXV-08 — Nota de contexto:** post **filho assinado** preso a um tópico pai — quem leu o original vê um acrescento de outra pessoa (fonte, correção, “como ficou na reunião”). Não é censura: é **camada extra verificável**. Mesmo pipeline de assinatura; labs `bridging-rank` / Pol.is para destacar consenso depois.

**IXV-09 — Coluna:** equivalente ao **blog** do Énóis — **coluna da praça** ([síntese stoas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md)), textos longos **fora do fluxo da Ágora** (`#/`). Payload `kind: "coluna"` (não `article` na UI); aba **Coluna** no perfil e na comunidade. Acervo, não timeline.

**IXV-10 — Molduras cívicas:** Voxels desbloqueiam molduras/cores em lista CSS fechada (sem dinheiro real, sem XSS).

**IXV-11 — Adiado:** “Par de estudo” do Énóis parece evento (objetivo + data). Na Vox, **Recorrente** cobre encontro com data e RSVP; **convocação** avulsa cobre evento único; **DM** cobre combinar 1-a-1. Match público só faria sentido com spec nova — reabre se o piloto pedir.

**IXV-12 — Mural fixado + Sugestão na pauta:** **Mural fixado** = conjunto curado de posts pinados na comunidade. **Sugestão na pauta** = proposta leve (“mudar regra X”) com voto existente na aba Governança, não post no feed.

**IXV-13 — Salas Precisas:** **contexto fechado** dentro da comunidade maior — capacidades **explícitas e limitadas** à sala (sem vazar para feed, DM ou shell), ainda **assinadas e verificáveis**. A comunidade **escolhe e pluga** quais salas existem e com qual finalidade (manifesto/governança [ADR-038](../adr/038-subrede-malha-e-manifesto.md), [REV-02](../ROADMAP.md)), não preferência global como `disabledModules` do Énóis. Primeiro caso: **Mesa** (RPG) em `#/dungeon`; outras vias **Webxdc** ([ADR-012](../adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)) com CSP — *cartucho* só em doc técnico. **`#/explorar`** (IXV-01) vitrine para descobrir salas; a sala vive em `#/c/:id` e rotas dedicadas. Spec futura: `salas-precisas-v0.md`.

**IXV-14 — Livro de transparência:** agregado de moderação (REV-20) + prova visual em PR (`docs/proof/`), inspirado em transparência de punições e QA do Énóis.