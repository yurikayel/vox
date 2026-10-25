# Vox — Auto-escala orgânica, confiabilidade e moderação voluntária

> **Status:** Brainstorm estratégico consolidado (out/2026)  
> **Tom:** cívico, honesto, sem promessas de P2P total no celular  
> **Público:** mantenedor do repositório (papel reduzido a revisor/aprovador), stewards, moderadores comunitários, fundadores de comunidade  

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md), [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md), [GOVERNANCE.md](../GOVERNANCE.md) e [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

---

## A — Tração orgânica

### Tese

Tração orgânica no Vox **não é campanha de mídia paga** nem growth hack de ranking global. É o encadeamento de três forças já descritas em [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) e no dossiê de incubação:

1. **Utilidade no primeiro dia** — POSSE, Pix Zap, feira e deliberação valem mesmo com poucos membros locais (modo “single-player” honesto).
2. **Convite relacional, não evangelismo da “federação”** — a lição do Fediverse (FediForum, Hachyderm) é *one-to-one*: quem migra traz três pessoas de confiança, oficina “sair do Meta”, install party no coletivo — não pitch técnico de protocolo.
3. **Egoísmo esclarecido na malha** — quem cria comunidade, vende na feira ou publica todo dia **ganha** cache perto (Pacto Vox, `commOnly`, steward de gaveta); o mantenedor do repo **não** compra VPS para “salvar” crescimento.

**Meta operacional (trimestre):** coletivo sobe relay + comunidade **sem loop do mantenedor**; visitante lê via gateway **ou** relay comunitário; default **Ativo** com sweet spot **Apoiador** (`commOnly`).

### Dez ideias de auto-escala

| # | Ideia | Mecanismo | Quem executa | Custo mantenedor | Risco principal |
|---|--------|-----------|--------------|------------------|-----------------|
| 1 | **Link canônico POSSE** | Post no Vox → share WhatsApp/X/blog; leitor externo cai no PWA/gateway | Criador, comunicador, MEI | R$ 0 (só Pages + CI) | Bridge ainda manual (P2); expectativa de crosspost 100% automático |
| 2 | **Ritual seed pós-comunidade** (V-P05) | Wizard 3 min: aba Ativa, 2 convites, 1º tópico + pin na feira | Fundador da comunidade | R$ 0 (copy + checklist no client) | Cold start se fundador some antes do seed |
| 3 | **Pacto Vox default-on** | Nó leve serve BLOB público lido na sessão; tetos 50 MB/dia, Wi-Fi preferido | Todo visitante (opt-out em `#/settings/network`) | R$ 0 | CGNAT no 4G — **não** prometer P2P total no celular |
| 4 | **Nudge `commOnly`** (V-P04) | UI na comunidade convida Apoiador a cachear só aquele `Community-Id` | Membros engajados, comerciantes da feira | R$ 0 | Reciprocidade invisível se ninguém explica o benefício |
| 5 | **Oficina / install party** | 90 min: Cantina + 3 perfis se seguem + escolher steward buddy | ONG, grêmio, biblioteca, FACIL/CHATONS-style allies | R$ 0 (slide `proposta-vox.html` + demo Pages) | Burnout do animador se não houver trio mod/steward |
| 6 | **Feira como motor de bairro** | Classificados cronológicos; vendedor mantém nó ativo para fotos rápidas | MEI, artesão, vizinho | R$ 0 | Spam comercial no debate — mods locais (`mod-action`) |
| 7 | **Deliberação com cutoff** | Proposta/voto só para quem já era membro antes da abertura | Coletivo, sindicato, condomínio | R$ 0 | Brigading externo se cutoff mal comunicado |
| 8 | **Kit steward 1-clique** (V-I08) | Relay HTTP + índice `/vox/index` na LAN ou VPS **do coletivo** | 1 steward / 3–5 comunidades (heurística doc) | R$ 0 central; steward paga VPS opcional | Modelo Mastodon: um herói paga tudo e desiste |
| 9 | **Honestidade “Leitura reserva”** (V-P02) + **2º espelho shell** | Pill quando gateway responde; fork Pages/Cloudflare espelha SHA do `main` | Voluntário espelho; stewards registram URL | R$ 0 | Usuário interpreta fallback como “rede quebrada” sem copy |
| 10 | **Convite em círculo fechado** | “Troque Messenger comigo aqui” — padrão Signal/FediForum | Cada membro (MLM **ético**, 3 pessoas) | R$ 0 | Sala vazia se só convite sem conteúdo útil (POSSE/feira) |

Nenhuma linha acima exige **telemetria central**, ranking de nós ou moeda in-app.

### Flywheel (tração × infra participante)

```
Utilidade unitária (post, Pix, feira, voto)
        │
        ▼
Fundador / criador compartilha link canônico fora do Vox
        │
        ▼
Visitante lê (cache vizinho │ relay comunitário │ gateway reserva + pill honesta)
        │
        ▼
Entrada Cantina (1 clique) → camada Ativo default → descobre comunidade
        │
        ▼
Seed ritual (tópico + 2 convites) → Apoiador commOnly → steward opcional
        │
        ▼
Comunidade rápida no bairro → criador repete share (interesse próprio)
        │
        └──────────► mais pares na malha ──► menos % leituras só via gateway
                              │
                              └── (telemetry local opt-in, sem scoreboard público)
```

O flywheel fecha quando **promoção externa** (WhatsApp) encontra **leitura rápida local** (participantes), não quando o mantenedor “liga um servidor global”.

### Anti-padrões (tração)

- **Growth de Fediverse genérico** — “entre na federação” antes de mostrar utilidade concreta (grupo, feira, votação).
- **Ranking público de nós / leaderboard de stewards** — mata Apoiador tímido e incentiva gaming ([ADR-001](./adr/001-contribution-attestation-export.md) só export opt-in).
- **Boost pago, moeda in-app, alcance leiloado** — reproduz Big Tech no client FOSS.
- **Obrigar steward ou relay para postar/vender** — barreira de entrada mortal.
- **Prometer 100% P2P no celular brasileiro** — CGNAT e franquia; Passivo legítimo.
- **Mantenedor único como NOC + mod global + TURN para todos** — burnout Mastodon; Art. 19 e carga em **stewards de espelho**, não no repo.
- **Phone-home disfarçado de “métricas abertas”** — contradiz P2P-first e LGPD-by-design.
- **Telegram/WhatsApp como backend oculto** — escala até dar, depois centraliza moderação e dados.

### Checklist mínimo — mantenedor (Pages + CI only)

Objetivo explícito: **publicar cliente estático e manter qualidade de merge**; **não** operar malha social.

| ✓ | Item | Notas |
|---|------|--------|
| ☐ | **GitHub Pages** (ou espelho documentado) servindo `client/` + `proposta-vox.html` | Workflow `deploy-pages.yml` no push `main` |
| ☐ | **CI verde** — `npm test` + testes relay Python antes de merge | Bloqueio de release, não hotline de usuário |
| ☐ | **Sem VPS obrigatória do projeto** | Gateways Arweave = terceiros; relay global **inexistente por design** |
| ☐ | **Sem central de moderação / DPO / CNPJ operacional** | Mod = comunidades; [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) |
| ☐ | **Processo FOSS** — RFCs, PR review, tag release quando necessário | Mantenedor modera **código**, não **timeline** |
| ☐ | **2º espelho shell** documentado e vivo (voluntário) | Reduz dependência de um domínio |
| ☐ | **Piloto V-P09** encaminhado a humano local (retrospectiva) | Valida flywheel empiricamente |
| ☐ | **Papel pessoal** — usar o app como cidadão nas próprias comunidades | Não substitui steward comunitário |

**Fora do escopo do mantenedor (por design):** TURN global, inbox relay 24/7, suporte WhatsApp oficial, impulsionamento, curadoria algorítmica nacional.

**Referências externas (síntese out/2026):** [FediForum — growth](https://fediforum.org/2025-10/session/5-e/) (one-to-one, install parties, grupos como cidadãos de primeira classe); [Hachyderm volunteering](https://community.hachyderm.io/docs/volunteering/) (community stewardship vs mod reativo); PWA mínima instalável ([minimal-pwa](https://github.com/chr15m/minimal-pwa)) alinhada ao shell &lt;100 KB — ops honesta: static cache, API live não fingida offline ([Ops Center PWA pattern](https://xnett.org/homelab/ops-center-pwa-mobile-wallboards)).

---

## 1. Tese em uma página

O Vox **não escala contratando servidores** nem mantendo um “time de ops” central. Escala quando:

1. **Cada uso gera valor unitário** (POSSE, Pix Zap, feira, deliberação) mesmo com sala quase vazia.
2. **Cada membro novo é potencial cache** (Pacto Vox, camadas 0→3) sem ranking público de nós.
3. **Cada comunidade elege quem cuida da praça** (`mod-action` transparente) e quem guarda o índice (steward voluntário).
4. **O mantenedor do repo** publica cliente estático (GitHub Pages), merge de PRs, RFCs — **não** opera relay global, moderação central nem suporte 24/7.

**Papel-alvo do mantenedor humano:** revisor de código, aprovador de releases, usuário-moderador nas próprias comunidades de interesse — **nunca** NOC único da malha.

---

## 2. Infraestrutura mínima do mantenedor (checklist)

| Item | Responsável | Custo alvo |
|------|-------------|------------|
| Shell PWA + CI testes (`npm test`, relay Python) | Repo `main` | GitHub Actions (free tier) |
| Gateway público Arweave (lista em `gateways.json`) | Terceiros + comunidade | R$ 0 para o projeto |
| **Segundo espelho shell** (fork Pages / Cloudflare) | Voluntário ou coletivo | R$ 0 |
| Relay/TURN **global do mantenedor** | **Não existe por design** | — |
| DPO / CNPJ / central de denúncias | **Não existe por design** | — |
| Piloto comunidade real + retrospectiva | Humano local (V-P09) | Tempo, não VPS |

**Definition of done (trimestre):** coletivo sobe relay + comunidade sem loop do mantenedor; visitante lê via gateway **ou** relay comunitário; pill “Leitura reserva” quando gateway responde ([V-P02](./backlog-participacao-rede.md)).

---

## 3. Crescimento orgânico e flywheel

### 3.1 Flywheel (POSSE + malha)

```
Fundador / criador publica no Vox (canônico assinado)
        │
        ▼
Compartilha link no WhatsApp, grupos, X, blog
        │
        ▼
Visitante lê (gateway ou cache vizinho); vê Pix / feira / debate
        │
        ▼
Entrada Cantina (1 clique); default Ativo no Pacto Vox
        │
        ▼
Mais cache local + opcional commOnly / steward no bairro
        │
        ▼
Comunidade fica rápida → fundador divulga de novo (egoísmo esclarecido)
```

O criador promove **a si**; o Vox promove **link permanente e soberania** — marketing zero pago.

### 3.2 Dez ideias de auto-escala (produto + protocolo)

| # | Ideia | Por que escala sozinha | Estado / gap |
|---|--------|------------------------|--------------|
| 1 | **Pacto Vox default-on** (nó leve) | Mais usuários online = mais BLOB público perto | Integrado |
| 2 | **Nudge `commOnly` na comunidade** (V-P04) | Dono da feira prioriza cache do bairro | Backlog P1 |
| 3 | **Checklist seed pós-comunidade** (V-P05) | Acaba cold start de índice vazio | Backlog P1 |
| 4 | **Kit steward 1-clique** (V-I08) | Relay de gaveta por coletivo, não por mantenedor | Parcial |
| 5 | **Gateway telemetry + “Leitura reserva”** (V-P02) | Honestidade gera confiança; não esconde fallback | Feito |
| 6 | **Blob soft priority** (V-I09) | Malha prefere quem já serviu a comunidade | Feito |
| 7 | **POSSE / Bridge / embed** | Funil externo permanente | P2 (Bridge spike) |
| 8 | **Painel “Sustentada por vizinhos”** (header comunidade) | Transparência → apoio voluntário | Proposta ([infra-participativa…](./infra-participativa-blindagem-crescimento.md)) |
| 9 | **Community fork** | Pressão republicana sobre mods sem central | P2 |
| 10 | **Atestação export opt-in** (ADR-001, V-P07) | Reconhecimento **privado** de quem ajuda a malha | P1 |

### 3.3 Anti-padrões (matar crescimento ou legal)

- Ranking público de nós, moeda in-app, boost pago de alcance.
- Obrigar steward para postar ou vender na feira.
- Prometer **100% P2P no celular** (CGNAT Brasil).
- Mantenedor único operando TURN/relay para “salvar” todas as instâncias (modelo Mastodon burnout).
- Moderação opaca sem `mod-action` assinado.
- Telemetria central phone-home disfarçada de “métricas abertas”.

---

## 4. Confiabilidade técnica: camadas P0 / P1 / P2

### 4.1 O que significa cada camada (ops comunitária)

| Camada | Foco | Exemplos Vox |
|--------|------|----------------|
| **P0 — Leitura honesta** | Usuário entende *de onde* veio o post; app não mente sobre P2P | `gateway-telemetry.js`, copy audit P0, gateways.json |
| **P1 — Vizinhança rápida** | Comunidade com ≥1 steward + apoiadores `commOnly` | relay `/vox/index`, mirror POST, wizard steward |
| **P2 — Escala federada** | Múltiplos espelhos, RFCs, lentes plugáveis, Bridge | registro público de espelhos, Vox RFCs |

### 4.2 SLOs honestos (não marketing)

Estes são **metas de desenho**, não garantias contratuais. Cliente estático; operadores são voluntários.

| Métrica | Alvo quando saudável | Degradado (aceitável temporário) |
|---------|----------------------|----------------------------------|
| Tempo até primeiro post visível (comunidade seedada) | &lt; 5 s (relay local ou cache) | &lt; 45 s via gateway reserva |
| % leituras recentes sem gateway (comunidade 50+, ≥2 stewards, ≥5 pares) | ≥ 70% (heurística interna, opt-in telemetry) | &lt; 30% → UI convida apoio, **sem** scoreboard |
| Disponibilidade shell GitHub Pages | Best-effort mantenedor | 2º espelho documentado |
| Relay steward `/health` | Respondendo em LAN/&lt;200 ms | Fallback gateway + pill reserva |
| DM inbox relay TTL | 72 h expurgo | Mensagem “tente de novo quando peer online” |
| Testes regressão release | `npm test` verde + relay unittest | Bloqueia merge `main` |

### 4.3 O que quebra em 100 / 1k / 10k usuários *ativos* (ordem de grandeza)

Cenário: usuários **distribuídos** em comunidades, não pico único global.

#### ~100 usuários (1–3 comunidades piloto)

| Risco | Sintoma | Mitigação |
|-------|---------|-----------|
| Cold start | Comunidade “fantasma”, tudo via gateway lento | V-P05 seed; fundador deixa aba Ativo; 1 steward |
| WebRTC/CGNAT | Pareamento falha no 4G | Passivo legítimo; relay HTTP + TURN **do coletivo** |
| Mod list vazia | `mod-action` não valida moderador | Fase 2: tag moderadores na TX `community` |
| Único espelho Pages | Queda do domínio = barulho, não morte | PWA offline; clones |

#### ~1 000 usuários (~10–30 comunidades)

| Risco | Sintoma | Mitigação |
|-------|---------|-----------|
| Gateway rate limit / latência | Pill “Leitura reserva” frequente | Mais stewards; blob affinity (V-I09) |
| Steward burnout | Relay cai, índice desatualizado | V-P08 buddy/sucessão; quotas disco |
| Spam cross-community | WANT flood fora do escopo | `commOnly` + filtros locais |
| Inbox relay saturado | DMs atrasam | TTL já limita; múltiplos relays anunciados na comunidade |
| Brigading em votação | Contas novas decidem enquete | `Eligibility-Cutoff` (GOVERNANCE) |

#### ~10 000 usuários (dezenas de comunidades, algumas grandes)

| Risco | Sintoma | Mitigação |
|-------|---------|-----------|
| Nenhum índice curado | GraphQL gateway caro/lento | Registro espelhos; pins manifest gossip |
| Moderação assíncrona | Fila de reports inexistente (Fase 2) | `mod-action` + fork; stewards honram hide no espelho |
| Pressão regulatória | Pedidos Art. 19 a **stewards**, não ao repo | COMPLIANCE-BR: supressão na camada espelhada |
| Divergência de clientes | Forks de UI com filtros diferentes | RFCs; identidade `App-Name: vox-brasil` |
| Telemetria agregada | Tentação de dashboard central | P2: só agregação **voluntária** por stewards |

### 4.4 Gaps de código e backlog (rastreio)

| ID | Título | Impacto confiabilidade | Prioridade |
|----|--------|------------------------|------------|
| V-I08 | Kit steward fechado (deploy 1-clique, runbook Win/Linux) | Alto — remove gargalo steward | P0 |
| V-P04 | Nudge `commOnly` em `#/c/:slug` | Médio — reciprocidade visível | P1 |
| V-P05 | Checklist seed pós-comunidade | Alto — cold start | P1 |
| V-P06 | Mirror validate v1 UI | Médio — índice confiável | P1 |
| V-P08 | Sucessão steward + relay buddy | Alto — anti burn-out | P1 |
| V-P07 | Export atestação ADR-001 | Baixo ops, alto motivação | P1 |
| V-P09 | Piloto real + retrospectiva | Validação empírica SLO | P0 execução humana |
| — | Lista moderadores on-chain (convencão Fase 2) | Moderação confiável | P1 protocolo |
| — | Fluxo report off-chain | Escala mod sem central | P2 |

---

## 5. Moderação voluntária: psicologia, mecanismos, escada

### 5.1 Por que alguém moderaria sem salário?

Síntese de literatura (Fediverse/Mastodon, Twitch mods, fóruns de saúde mental, SDT):

- **Proteção do espaço que importa** — “esta praça é nossa”; moderador já é membro ativo, não funcionário anônimo.
- **Valores compartilhados / bem público digital** — alinhamento com FOSS e autonomia comunitária.
- **Prestígio local, não global** — reconhecimento **dentro** da comunidade (evitar ranking público de mods).
- **Competência e autonomia** — regras claras, ferramentas que reduzem carga cognitiva (`hide`/`ban` assinado, não tribunal infinito).
- **Relatedness** — time pequeno, fusos horários, chat externo opcional (Matrix/Telegram **do coletivo**, não do mantenedor).
- **Justiça procedimental** — deliberação com `Eligibility-Cutoff` para mudar regras; mods não são reis.

**Riscos:** emotional labor, burnout pós-pico de migração, conflito com amigos pessoais, “labour pains” quando cresce rápido demais sem rotação.

**Implicação Vox:** moderação **client-side** + transações públicas reduzem responsabilidade editorial central do repo, mas **não** eliminam carga humana nos moderadores eleitos — precisam de desenho de produto compassivo.

### 5.2 Sete mecanismos para incitar moderação voluntária (sem exploração)

| # | Mecanismo | Implementação Vox |
|---|-----------|-------------------|
| 1 | **Eleição / proposta de moderador** | `governance-proposal` + voto; cutoff anti-brigading |
| 2 | **Ações auditáveis, não apagamento** | `mod-action` on-chain; hide ≠ delete |
| 3 | **Escopo limitado** | Mod só na `Community-Id`; sem poder global |
| 4 | **Rotação e co-moderação** | Encorajar ≥3 mods, cobertura de fuso; doc GOVERNANCE |
| 5 | **Ferramentas de baixo atrito** | UI comunidade: ocultar tópico → TX assinada (já parcial em `screens-community.js`) |
| 6 | **Reconhecimento privado / opt-in** | Badge local “Moderador eleito em …”; **sem** leaderboard |
| 7 | **Válvula de escape** | Community fork + espelho alternativo se política divergir |

### 5.3 Escada do moderador (mod ladder)

```
Membro → Apoiador (commOnly) → Facilitador (organiza feira/tópicos, sem poder ban)
    → Moderador eleito (emite mod-action hide/ban)
    → Curador de espelho (steward opcional: aplica mod-action no índice JSON, não ganha mod automático)
    → Ex-mod / sabbatical (governance-vote remove; unban/hide revertidos por TX)
```

**Guardrail:** steward **não** vira moderador só por hospedar disco ([GOVERNANCE.md](../GOVERNANCE.md) § Steward).

### 5.4 Guardrails legais e de produto (Brasil)

- Mods agem como **membros** que assinam TX públicas; repo open-source **não** é T&S central ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)).
- Conteúdo ilícito: steward com índice público responde Art. 19 **na camada espelhada**; orientar canal de contato no README do relay.
- DMs: moderadores **não** têm backdoor; inbox cifrado + TTL 72 h.
- Eleitoral: comunidades políticas assumem deveres próprios; Vox não é plataforma PJ centralizada.

### 5.5 Experimentos piloto P0 (moderação)

| Experimento | Hipótese | Métrica qualitativa (4 sem) |
|-------------|----------|-----------------------------|
| **E1 — Trio inicial** | Toda comunidade nova convida 2 co-facilitadores + 1 mod backup | Menos abandono fundador |
| **E2 — Carta de mod 1 página** | Template PT fixo nas regras da comunidade | Menos conflito “regra implícita” |
| **E3 — Sessão “mod-action ao vivo”** | Workshop 30 min gravado no Voxpedia | Tempo até primeira TX mod |
| **E4 — Rodízio mensal** | Mod “de plantão” rotativo (honorífico) | Burnout autorrelatado ↓ |

### 5.6 Copy UI (PT-BR) — snippets prontos

**Convite a co-moderar (comunidade):**

> Esta praça é moderada por membros **eleitos**, não pela equipe do app. Você conhece o tom da conversa aqui. Topa ser moderador por um ciclo de 90 dias? Suas ações ficam **públicas e assinadas** — transparência para todos.

**Antes de ocultar tópico:**

> Ocultar não apaga da rede: registra uma ação assinada (`mod-action`). Outros clientes podem escolher ver o original. Confirma?

**Após `hide`:**

> Tópico oculto nesta comunidade para quem usa este cliente. Motivo registrado na cadeia pública.

**Nudge steward (distinto de mod):**

> **Guardião de cache:** ajudar a comunidade carregar rápido **não** dá poder de banir. Moderação continua com quem a comunidade elegeu.

**Feira + moderação:**

> Anúncios vivem na aba Classificados. Spam comercial no debate principal pode ser ocultado pelos moderadores eleitos.

**Burnout / pausa:**

> Moderar cansa. Pausar é republicano: proponha na comunidade quem assume o plantão desta semana.

---

## 6. Papel do mantenedor vs participantes (matriz)

| Função | Mantenedor repo | Participante típico | Steward | Mod eleito |
|--------|-----------------|---------------------|---------|------------|
| Merge código / CI | ✓ | PRs FOSS | — | — |
| Opera relay global | ✗ | — | ✓ local | — |
| Modera conteúdo global | ✗ | — | — | ✗ (só comunidade) |
| Aprova RFC tag nova | ✓ (processo) | Proposta | — | — |
| Responde Art. 19 por todo Vox | ✗ | — | ✓ se espelho público | — |
| Usa o app como cidadão | ✓ | ✓ | ✓ | ✓ |

---

## 7. Roadmap integrado (90 dias sugeridos)

| Semanas | Entrega | Eixo |
|---------|---------|------|
| 1–2 | V-P04 + V-P05 + copy mod (acima) | Orgânico + mod |
| 3–4 | V-I08 runbook fechado + 2º espelho vivo | Confiabilidade P0 |
| 5–6 | V-P06 + painel “vizinhos online” (MVP UI) | Confiabilidade P1 |
| 7–8 | V-P09 piloto + retrospectiva | Validação |
| 9–12 | V-P08 buddy + E1–E4 mod piloto | Sustentação humana |

---

## 8. Referências internas e externas

**Internas:** [backlog-participacao-rede.md](./backlog-participacao-rede.md) · [steward-relay-kit.md](./steward-relay-kit.md) · [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) · [gateway-honest-fallback-brainstorm.md](./gateway-honest-fallback-brainstorm.md)

**Externas (moderação voluntária / Fediverse):**

- Seering et al. — *Trouble in Paradise?* Mastodon admins (ACM 2024) — motivações, times diversos, burnout.
- Internet Policy Review (2025) — *Labour pains: content moderation challenges in Mastodon growth*.
- Cybernauterne (2024) — *Social networks, not social media* — mods embedded na cultura local.
- JMIR Ment Health (2025) — moderadores voluntários, SDT (autonomia, competência, relatedness).

---

**Versão:** 1.0 · **Data:** 25 out 2026 · **Dono:** Community-doc (consolidado agente)

---

## B — Confiabilidade sem SPOF

> **Slice B (out/2026):** leitura técnica do repositório — relay, telemetria, espelho de índice, shell offline, `#/status`, steward docs e CI. Complementa §4 com **âncoras de código** e **gaps ainda abertos**.

### B.1 Tese: onde *não* há SPOF (e onde ainda há)

| Superfície | SPOF hoje? | Mecanismo no código / ops |
|------------|------------|---------------------------|
| **Canônico (Arweave)** | Não (permaweb + múltiplos gateways em `client/config/gateways.json`) | `graphql.js` tenta gateways; `recordGatewayAttempt` em `gateway-telemetry.js` |
| **Shell PWA** | **Parcial** — espelho **A** (GitHub Pages) documentado; **B** ainda playbook | `sw.js` `CACHE_NAME`; [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) |
| **Relay HTTP / índice LAN** | Não global — **por coletivo**; default `127.0.0.1:3920` | `relay/server.py`, `inbox.getRelayHttpUrl()` |
| **Signaling / TURN** | Por steward (`signaling.json`, wizard `#/settings/network/steward`) | Sem relay global do mantenedor (design) |
| **Descoberta GraphQL** | **Degradável** — gateway público vira gargalo sob carga | Pill “Leitura reserva” + fallback relay `/tx/:id` |
| **Inbox DM** | Por relay que o par usa; TTL 72 h | `relay/inbox.py` `DEFAULT_TTL_SECONDS` |
| **WebRTC / malha** | Sem broker central no repo; CGNAT limita celular | `peers.js` + `webrtc-peer.js` (fora do SW) |

**Conclusão operacional:** confiabilidade = **camadas sobrepostas** (cache local → relay vizinho → gateway → honestidade na UI), não uptime de um datacenter único.

### B.2 Mapa de componentes (estado do código)

```
Visitante / membro (PWA)
    │
    ├─ SW (sw.js) ── shell offline, gateways.json precached
    ├─ graphql.js ── gateways Arweave + gateway-telemetry
    ├─ peers.js ── gossip/WebRTC; checkDesktopRelay() → GET /health
    ├─ community-mirror.js ── POST /vox/mirror (aba posts #/c/:slug)
    └─ #/status (screens-status.js + render/status.js) ── diagnóstico local

Steward (voluntário)
    ├─ relay/server.py ── /health, /tx/:id, /vox/index/:id.json, /vox/mirror, /inbox/*
    ├─ relay/deploy + steward-relay-kit.md + steward-seed-15min.md
    └─ tools/steward-kit-windows/ (V-I08 parcial)

CI (main)
    └─ npm test:client + npm test:relay (Python 3.11/3.12)
```

**Observações da auditoria rápida:**

- `community-mirror.js` **não** está na lista `SHELL_ASSETS` do `sw.js` — offline-first do espelho depende do bundle `app.js`; gap menor de cache shell.
- `POST /vox/mirror` persiste JSON **sem** validação estrutural v1 ([`mirror-validate-v1.md`](./mirror-validate-v1.md) proposta; `mirror_validate.py` ainda ausente) → **V-P06**.
- Índice espelhado: slug em disco `index_{communityId}.json`; leitura `GET /vox/index/{communityId}.json`.
- Quota steward: `VOX_RELAY_MAX_CACHE_MB` → HTTP **507** se espelho estourar disco.

### B.3 Camadas P0 / P1 / P2 (confiabilidade técnica)

| Camada | Objetivo de confiabilidade | Já no repo | Falta para “fechado” |
|--------|---------------------------|------------|----------------------|
| **P0 — Leitura honesta** | Usuário sabe se leu via gateway, cache ou relay; app não finge malha plena | V-P02 feito: pills em `render/network.js`, `formatGatewayHealthPill`, export JSON em `gateway-telemetry.js`; `#/status` sem phone-home | Copy audit contínua; link `#/status` mais visível em comunidades degradadas |
| **P0 — Shell sobrevive queda do host A** | PWA abre offline; segundo URL público | SW v6.x precache amplo; [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) | **2º espelho vivo** + registro `mirror_id, git_sha, CACHE_NAME` |
| **P0 — Steward repetível** | Qualquer coletivo sobe relay sem o mantenedor | `/health` com `communityIndexes`, compose, wizard V-P01, Windows kit parcial | **V-I08** fechado: runbook Linux+Win 1-clique, automação deploy |
| **P1 — Vizinhança rápida** | Comunidade seedada evita cold start GraphQL | `tryMirrorCommunityToRelay` em `screens-community.js`; blob soft priority V-I09 | **V-P04** nudge `commOnly`; **V-P05** checklist seed; **V-P06** validate mirror |
| **P1 — Humanos sustentam nós** | Relay não morre com uma pessoa | Docs V-P08 (buddy/sucessão) | UI/processos de handoff; múltiplos relays anunciados na comunidade |
| **P2 — Escala federada** | Muitos espelhos, attestations, Bridge | RFC POSSE, spike Bridge | **V-P07** export ADR-001; registro público espelhos; gossip manifest pins maduro |

### B.4 SLOs honestos (malha voluntária)

Metas de **desenho + observação local** — não SLA comercial. Instrumentação principal: `localStorage` `vox-gateway-health`, `#/status`, `/health` do relay, retrospectiva **V-P09**.

| Métrica | Alvo (comunidade saudável) | Degradado aceitável | Onde medir hoje |
|---------|----------------------------|---------------------|-----------------|
| Primeiro conteúdo visível (com índice espelhado + cache) | &lt; 5 s | &lt; 45 s via gateway + pill reserva | Qualitativo piloto; telemetry gateway `state` |
| Estado gateway local | `all_ok` | `degraded` / `critical` → pill | `getGatewayHealthState()` |
| Relay configurado alcançável | `/health` &lt; 350 ms (timeout cliente) | `checkDesktopRelay` → Offline | `#/status`, network settings |
| Espelho índice fresh | `mirroredAt` &lt; 24 h (convencão) | Só GraphQL | Sem UI de staleness → gap **V-P06** |
| Inbox DM entregue | &lt; 72 h enquanto relay up | Expira; peer offline | TTL `inbox.py` |
| Release regressão | `npm test` + relay unittest verdes | Bloqueia merge | `.github/workflows/ci.yml` |

**Regra de honestidade:** se `critical`, UI deve preferir copy “Leitura reserva” sobre spinner infinito — já alinhado a V-P02; stewards usam `#/status` + export diagnóstico para debug **sem** centralizar dados.

### B.5 O que quebra em ~100 / ~1k / ~10k usuários ativos

Premissa: usuários espalhados em comunidades; picos locais, não DDoS global ao repo.

#### ~100 (1–3 comunidades piloto)

| Falha | Mecanismo | Sintoma | Mitigação no stack |
|-------|-----------|---------|-------------------|
| Cold start índice | GraphQL + zero stewards | Tudo lento; pill frequente | **V-P05** seed; steward 15 min; mirror POST |
| Relay só localhost | Default `127.0.0.1:3920` | Visitantes externos não usam cache LAN | Steward expõe HTTPS; URL no PWA |
| CGNAT 4G | WebRTC direto falha | Gossip ralo | Relay HTTP + TURN do coletivo |
| Único espelho Pages | Queda DNS/GitHub | Barulho; SW ainda abre cache | **2º espelho** + comunicar URL alternativa |
| Mirror não validado | POST aceita lixo | Índice corrupto / path weird | **V-P06** + quota 507 já existe |

#### ~1 000 (~10–30 comunidades)

| Falha | Mecanismo | Sintoma | Mitigação |
|-------|-----------|---------|-----------|
| Gateway rate limit | `graphql.js` multi-gateway esgotado | `degraded` persistente | Mais stewards; `/tx` cache HIT |
| Steward burnout | Um `index_*.json` | Comunidade “some” do relay | **V-P08** buddy; segundo mirror POST |
| `commOnly` baixo | Malha global WANT | Spam cross-community | **V-P04** |
| Inbox fila | Muitos POST `/inbox` | Atraso DM | TTL limita; múltiplos relays anunciados |
| Quota cache | `VOX_RELAY_MAX_CACHE_MB` | 507 em mirror | Monitor `/health` `cacheBytes` |

#### ~10 000 (dezenas de comunidades, algumas grandes)

| Falha | Mecanismo | Sintoma | Mitigação |
|-------|-----------|---------|-----------|
| GraphQL como índice global | Sem curadoria | Latência/custo alto | Registro espelhos; pins manifest gossip |
| Divergência índice espelhado | POST não assinado | Clientes veem listas diferentes | V-P06 + futura assinatura `cacheManifest` |
| Pressão legal | Espelho público | Art. 19 no **steward** | COMPLIANCE-BR; README relay |
| Telemetria central tentadora | Escala ops | Phone-home disfarçado | Manter `#/status` local-only |
| Shell drift entre espelhos | `CACHE_NAME` / SHA divergentes | Bugs fantasma | ops-shell-mirrors checklist |

### B.6 Gaps mapeados (backlog → confiabilidade)

| ID | Título | Evidência no repo | Impacto SPOF / escala |
|----|--------|-------------------|------------------------|
| **V-I08** | Kit steward fechado | Parcial: `steward-relay-kit.md`, compose, `/health`, Windows kit; pendente automação Linux/deploy | **Alto** — gargalo humano substitui SPOF de “mantenedor ops” |
| **V-P04** | Nudge `commOnly` em `#/c/:slug` | Backlog; depende V-I02 | **Médio** — malha local vs flood global |
| **V-P05** | Checklist seed pós-comunidade | Template infra; não wired como wizard único | **Alto** — cold start = dependência gateway |
| **V-P06** | Mirror validate v1 UI + relay | Spec `mirror-validate-v1.md`; relay aceita qualquer JSON | **Médio** — índice confiável, anti-abuso POST |
| **V-P07** | Export atestação ADR-001 | ADR escrito; UI opt-in pendente | **Baixo ops** — motivação stewards (P2 confiança) |
| **V-P08** | Sucessão steward + relay buddy | Community-doc | **Alto** — SPOF **humano** por comunidade |
| **V-P09** | Piloto + retrospectiva | `piloto-comunidade-retrospectiva-template.md` | **P0 validação** — calibrar SLOs reais |
| **—** | **2º espelho shell vivo** | `ops-shell-mirrors.md` playbook only | **Alto P0** — SPOF de distribuição do cliente |
| **—** | `community-mirror.js` no precache SW | Ausente em `SHELL_ASSETS` | **Baixo** — consistência offline |

### B.7 Rede de segurança (testes que sustentam confiabilidade)

| Área | Testes | O que garantem |
|------|--------|----------------|
| Gateway telemetry | `tests/gateway-telemetry.test.js` | Estados `all_ok` / `degraded` / `critical` |
| Community mirror | `tests/community-mirror.test.js` | Payload normalizado; POST best-effort; falha engolida |
| Status UI | `tests/status-render.test.js` | `#/status` renderiza gateway + relay offline |
| Relay HTTP | `relay/test_server.py` | Health, mirror → `communityIndexes`, CORS, quota |
| Inbox TTL | `relay/test_server.py` / inbox tests | Envelope 72 h, tamanho 32 KiB |
| CI | `test-client` + `test-relay` matrices | Regressão bloqueia release quebrada |

**Definition of done slice B (90 dias, eixo confiabilidade):** V-I08 + **2º espelho** + V-P05/V-P06 entregues; V-P09 mede pelo menos 2 métricas de B.4; nenhum novo phone-home.

*Slice B · 25 out 2026 · explorado: relay, gateway-telemetry, community-mirror, steward docs, ops-shell-mirrors, `#/status`, sw, tests.*

---

## C — Moderação voluntária

> **Fatia C (incitar):** como comunidades piloto **convidam e sustentam** moderadores sem salário, sem central T&S e sem gamificação tóxica — ancorado em [`mod-action`](../GOVERNANCE.md), deliberação Fase G, [`moderation.js`](../client/js/moderation.js) e onboarding Cantina → Pacto (moderação **depois** da entrada, não na Porta).

### C.1 Psicologia — por que moderar (e o que drena)

Síntese cruzando literatura recente (2024–2025) com desenho Vox:

| Motor (SDT / cívico) | Manifestação na praça | Desenho Vox |
|----------------------|----------------------|-------------|
| **Autonomia + competência** | “Eu sei o tom daqui”; ferramentas claras reduzem ansiedade | `hide`/`ban` assinados; UI confirma que hide ≠ apagar |
| **Relatedness / altruísmo digital** | Proteger amigos, feira, debate local | Mod = membro eleito, não “staff do app” |
| **Justiça procedimental** | Regras explícitas, voto para mudar normas | `governance-proposal` + `Eligibility-Cutoff` |
| **Prestígio local** | Reconhecimento **dentro** da comunidade | Badge opt-in “Moderador eleito em …”; **sem** ranking público |
| **Suporte entre pares** | Validar frustração, compartilhar playbooks | Canal Matrix/Telegram **do coletivo**; meta-sala de mods (externa) |

**Contraintuições (New Media & Society, 2024):** governança muito “democrática” no dia a dia pode **aumentar** percepção de justiça mas **reduzir** pertencimento institucional do mod — centralizar *procedimentos* (cartas, plantão, appeals) sem centralizar *poder* ajuda.

**Riscos documentados:** burnout (~1/5 mods Fediverse reporta trauma/burnout anual — IFTAS 2024); emotional labor; conflito com amigos; pico pós-migração WhatsApp → Vox sem rotação.

**Implicação “incitar”:** convite deve enfatizar **escopo limitado**, **prazo finito**, **transparência on-chain** e **pausa republicana** — nunca “herói solitário” nem scoreboard de ações.

### C.2 Sete mecanismos para incitar moderação (produto + ritual)

| # | Mecanismo | **Produto** (cliente / protocolo) | **Ritual** (comunidade piloto) |
|---|-----------|-----------------------------------|--------------------------------|
| 1 | **Convite pós-membria** | Nudge em `#/c/:slug` só após `membership` + N posts lidos; **não** no fluxo Cantina/Pacto | Fundador nomeia 2 co-facilitadores na 1ª semana (E1 piloto) |
| 2 | **Eleição com cutoff** | `governance-proposal` tipo “incluir moderador” + `governance-vote`; cutoff = criação da proposta | Sessão 30 min “quem cuida da praça?” antes do voto |
| 3 | **Ação de um clique, auditável** | Botão ocultar → TX `mod-action` (`screens-community.js`); toast + link “ver na cadeia” | Workshop “mod-action ao vivo” (E3) |
| 4 | **Carta de mod 1 página** | Campo `Rules` / pin nas regras da TX `community` + template fixo PT | Colar template na retrospectiva V-P09 § “Copy confusa” |
| 5 | **Plantão rotativo** | Perfil: badge “Plantão desta semana” (local, sem contagem pública) | Rodízio mensal honorífico (E4) |
| 6 | **Reconhecimento privado** | Export atestação opt-in (V-P07 / ADR-001) — **não** leaderboard de mods | Agradecimento explícito no tópico fixo da comunidade |
| 7 | **Válvula republicana** | `unhide`/`unban` via mod-action; fork de espelho; steward **não** ganha ban automático | Se política divergir: proposta “espelho alternativo” + documentar URL |

### C.3 Escada leitor → mod → steward

```
Leitor (Passivo/Ativo, Cantina concluída)
    │  membership + participação na feira/debate
    ▼
Apoiador (`commOnly` — acelera cache, zero poder de ban)
    ▼
Facilitador (organiza tópicos, seed, WhatsApp — sem `mod-action`)
    ▼
Moderador eleito (lista on-chain / tag moderadores; emite hide/ban/unhide/unban)
    ▼
Steward de espelho (relay/index JSON; **opcional**; aplica mod-action no índice servido)
    ▼
Ex-mod / sabático (governance-vote remove; ciclo encerrado publicamente)
```

**Separação crítica ([GOVERNANCE.md](../GOVERNANCE.md)):** contribuir banda ou disco **não** compra visibilidade nem poder moderador; steward ≠ mod automático.

**Onboarding Cantina:** entrada 1 clique + Pacto default-on prepara **cidadania** (cache, POSSE); o **convite a moderar** só faz sentido quando o membro já “morou” na praça — evita recrutar turista como polícia.

### C.4 Guardrails (appeals, mandatos, anti-scoreboard)

| Guardrail | Regra | Implementação / copy |
|-----------|--------|---------------------|
| **Appeals (recurso)** | Mod não é tribunal final da **norma** | Membro pede revisão via `governance-proposal` “reconsiderar ocultação” ou mod emite `unhide` com motivo na TX; votos só de quem já era membro antes da proposta |
| **Mandatos (term limits)** | Ciclo sugerido **90 dias**; renovação por proposta, não permanência implícita | UI convite cita prazo; fim de ciclo = nudge “renovar ou passar bastão” |
| **Sem scoreboard** | Proibido ranking público de mods, nós ou “ações de mod” | Alinhado a GOVERNANCE § infra e COMPLIANCE § stewards; telemetria agregada só opt-in steward |
| **Hide ≠ delete** | Transparência + autonomia de cliente | Outros clientes podem ignorar filtros; educar no confirm de ocultar |
| **DMs sem backdoor** | Mod não lê inbox cifrado | COMPLIANCE Fase 4; moderação só conteúdo público comunitário |
| **Ilícito grave** | `mod-action` não substitui autoridade | Orientar canal externo + steward Art. 19 na camada espelhada |
| **Anti-brigading** | Voto para regras/mods usa cutoff | `Eligibility-Cutoff = Proposal-Created-At` |

### C.5 Experimentos P0 (piloto V-P09)

Integrar na [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) — coluna “Fase C mod” sugerida:

| ID | Experimento | Hipótese | Sinal de sucesso (4–7 dias piloto) |
|----|-------------|----------|-------------------------------------|
| **E1** | Trio inicial (2 facilitadores + 1 mod reserva) | Fundador não queima sozinho | ≥2 pessoas aceitam papel antes do dia 7 |
| **E2** | Carta de mod 1 página nas regras | Menos “regra implícita do Zap” | Retrospectiva: zero conflito “não sabia que podia ocultar” |
| **E3** | Sessão “mod-action ao vivo” (30 min) | Reduz medo da TX pública | Tempo até 1ª `mod-action` legítima &lt; 48 h após incidente simulado |
| **E4** | Plantão semanal rotativo | Burnout ↓ | Mods reportam “pausa sem culpa” na retrospectiva |
| **E5** | Appeal simulado (proposta + unhide) | Procedimento &gt; personalismo | Comunidade completa 1 ciclo proposta → voto → desfecho documentado |

**Métricas honestas (qualitativas):** abandono do fundador-mod; frequência pill “Leitura reserva” **não** correlacionada a mod (infra ≠ mod); copy confusa listada na retrospectiva.

### C.6 Copy UI (PT-BR) — cinco snippets

**1 — Convite (pós-membria, `#/c/:slug`):**

> Esta praça é cuidada por **membros eleitos**, não pela equipe do app. Você já conhece o tom da conversa. Topa moderar por **90 dias**? Cada ocultação vira registro **público e assinado** — transparência para quem usa esta comunidade.

**2 — Confirmar ocultar (substituir confirm genérico):**

> Ocultar **não apaga** da rede: publica um `mod-action` assinado. Quem usa outro cliente pode ainda ver o original. Inclua um motivo curto na sua prática comunitária. Confirma?

**3 — Appeal / recurso (link em tópico oculto ou ajuda):**

> Discordou de uma ocultação? Peça **revisão comunitária**: abra uma proposta de governança ou fale com o mod de plantão. Mudança de regra exige voto de quem **já era membro** antes da proposta.

**4 — Fim de mandato:**

> Seu ciclo de moderação termina em **{data}**. Renovar é opcional: proponha na comunidade ou indique quem assume o próximo plantão. Pausar é republicano.

**5 — Distinção steward (painel comunidade / settings rede):**

> **Guardião de cache** ajuda a praça carregar rápido — isso **não** dá poder de banir. Moderação continua com quem a comunidade **elegeu** e assina `mod-action`.

### C.7 Referências externas (fatia C)

- Seering et al. — *Trouble in Paradise?* (Mastodon admins, ACM 2024).
- New Media & Society (2024) — tradeoffs participação / pertencimento em mods voluntários.
- IFTAS — *Fediverse Trust & Safety Needs Assessment 2024* (burnout, gaps de guia formal).
- SOUPS 2024 — *Custodian of online communities* (suporte mútuo entre mods).
- ACM GROUP 2025 — comunidades voluntárias de resposta a desinformação (motivação por pares).
- Mental Health & Digital Technologies (2024) — altruísmo digital e carga em mods de saúde.

**Versão fatia C:** 1.0 · **Data:** 25 out 2026
