# Vox — Auto-escala orgânica, confiabilidade e moderação voluntária

> **Status:** Brainstorm estratégico consolidado (out/2026)  
> **Tom:** cívico, honesto, sem promessas de P2P total no celular  
> **Público:** mantenedor do repositório (papel reduzido a revisor/aprovador), stewards, moderadores comunitários, fundadores de comunidade  

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md), [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md), [GOVERNANCE.md](../GOVERNANCE.md) e [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

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
