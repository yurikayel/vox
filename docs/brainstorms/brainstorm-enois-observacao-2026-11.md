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

## 3. Incrementos candidatos (impacto × custo de shell)

### Onda 1 — alto impacto, custo mínimo

| # | Inspiração Énóis | Encaixe Vox | ROADMAP / ADR |
|---|---|---|---|
| 1 | Hub `#/explorar` + módulos opcionais locais | Lazy routing, menu enxuto | PM-01 |
| 2 | Post efêmero (`some em 24h` / 7d) | Compositor + política de esquecimento | ADR-019, `profile-note.js` |
| 3 | Filtro Cidade/UF em comunidades | Manifesto + filtro IndexedDB | ADR-038 |
| 4 | Sub-tópicos em pills em `#/c/:id` | `screens-community.js` | candidata |
| 5 | Rituais + confirmar presença | Aviso `convocacao` + PM-23 | PM-97, PM-23, [modo-assembleia-v0](../specs/modo-assembleia-v0.md) |
| 6 | Coleções locais nos salvos | IDB / `localStorage` | candidata |
| 7 | Copy E2E enxuta + página `#/responsavel` | Onboarding, DM, 18+ | REV-23, LAN-03 |

### Onda 2 — pós-PM-01, lazy

| # | Inspiração | Encaixe | Notas |
|---|---|---|---|
| 8 | Notas de rodapé no post | Post filho assinado | `labs/parado/bridging-rank.js`, `polis.js` |
| 9 | Blogs / cantinhos | `kind: article` | acervo evergreen |
| 10 | Cosméticos de perfil | `voxels.js`, CSS lista fechada | sem dinheiro, sem XSS |
| 11 | Par de estudo / par de ação | Match por objetivo | cold start 10–30 pessoas |
| 12 | Murais + sugestões votadas | `governance.js` | feedback comunitário |

### Onda 3 — ecossistema e disciplina

| # | Inspiração | Encaixe | Notas |
|---|---|---|---|
| 13 | Sala Brincar + jogos | Webxdc, `#/dungeon` | retenção diária sem algoritmo |
| 14 | Moderação transparente + `docs/proof/` em PRs | Relatório de ocultações | REV-20 |

## 4. Top quatro (se só couber pouco no shell)

1. Hub explorar + módulos desligáveis (PM-01).
2. Rituais recorrentes + filtro Cidade/UF (PM-97, PM-23, ADR-038).
3. Efemeridade visível no feed + notas de rodapé (ADR-019, labs).
4. Cosméticos seguros via Voxels + Brincar via Webxdc (ADR-012).

## 5. Processo observável (não é roadmap imediato)

- **Transparência de punições** (`/penalidades`) inspira relatório anual REV-20.
- **Proof em PR** (desktop + mobile versionados) inspira checklist de UI no CI humano.
- **Digest semanal** inspira PM-103 “Estado da praça”, não notificação push centralizada.