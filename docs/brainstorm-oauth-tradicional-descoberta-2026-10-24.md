# Brainstorm — login tradicional (Google/Meta) e perfis encontráveis

**Data:** 2026-10-24 · **Revisão:** Composer 2.5 · **Contexto:** V-DIS em `main` (`1dd1d25`) — OAuth client-only pós-Cantina, `#/people`, `#/connect`, contatos locais, `vx_*` canônico.

## Estado hoje (resumo)

| Peça | O que faz | Limite para “rede que se encontra” |
|------|-----------|-------------------------------------|
| `renderOAuthEnrich` | Modal “Como quer aparecer?” — botões estilo GIS/Meta + divisor “ou” + pular | Confiança visual ↑; ainda **enriquecimento**, não SSO Vox |
| OAuth client-only | Nome/foto → `localStorage`; sem token | Perfil **neste aparelho** fica legível; outros só veem se publicar/postar ou receber link |
| `#/people` | Índice local (welcome, contatos, autores de posts, demo) | Não lista “toda a rede”; sem servidor de busca |
| `#/connect/:id` | Deep link + adicionar contato + DM | **Principal vetor viral** (WhatsApp) — precisa ser óbvio no UX |
| `profile-directory` | Mock + welcome + self + `vox-profile-cards-v1` local | Outros `vx_*` sem post/handle/card ficam “sem cara” |
| Handle `@` permaweb | Opcional, on-chain | Único caminho hoje para “nome humano” compartilhável fora do aparelho |
| P2P `announceIdentity` | Presença na mesma sessão | Não é diretório |

**Princípio a manter (ADR-002):** OAuth **enriquece** perfil local; **não** substitui `vx_*` nem cria grafo centralizado.

---

## 1. Janela com cara de login tradicional

### 1.1 Wireframe (hierarquia)

```
┌─────────────────────────────────────┐
│  Como quer aparecer?                │
│  Importe nome e foto (opcional)…    │
│                                     │
│  [ G  Continuar com Google      ]   │  ← fundo branco, borda cinza
│  [ f  Continuar com Meta        ]   │  ← #1877F2
│           — ou —                    │
│  [ Pular — continuar só com vx_ ]   │
│  LGPD · COMPLIANCE-BR.md            │
└─────────────────────────────────────┘
```

### 1.2 Padrões que o usuário já reconhece

- Botão **“Continuar com Google”** (GIS) — logo colorido à esquerda, fundo branco ou outline, altura **44px**, cantos **pill** (`border-radius: 999px`).
- Botão **“Continuar com Meta”** — azul `#1877F2`, ícone “f” branco à esquerda (Facebook Login brand).
- Hierarquia: título → benefício em 1 linha → botões sociais → divisor **“ou”** → **Pular** (identidade só `vx_*`).
- Rodapé legal: LGPD + referência `COMPLIANCE-BR.md` (sem link quebrado no PWA).

### 1.3 Plano de classes CSS (`client/css/style.css`)

| Classe | Uso |
|--------|-----|
| `.oauth-enrich-dialog` | `modal-dialog-solid`, max-width 420px |
| `.oauth-enrich-title` / `.oauth-enrich-lead` | Tipografia do modal |
| `.oauth-enrich-actions` | Coluna de botões sociais (`gap: 0.55rem`) |
| `.oauth-btn` | Base flex, min-height 44px, pill |
| `.oauth-btn__icon` / `.oauth-btn__label` | Logo + texto |
| `.oauth-btn--google` | `#fff` + borda `#747775` (mesmo no dark) |
| `.oauth-btn--meta` | `#1877f2` + texto branco |
| `.oauth-btn--skip` | Outline neutro (`var(--border)`) |
| `.oauth-enrich-divider` | Linha + “ou” |
| `.oauth-enrich-legal` | Meta LGPD 0.75rem |

**Não** reutilizar `.btn-primary` nos botões Google/Meta — confunde com ação primária do app (`--accent` brasileiro).

### 1.4 SVG e assets

| Opção | Caminho | Quando usar |
|-------|---------|-------------|
| **Recomendado (atual)** | SVG **inline** em `render.js` — `OAUTH_SVG_GOOGLE`, `OAUTH_SVG_META` | Zero bump de SW; GIS exige “G” multicolor oficial |
| Alternativa | `client/icons/google-g.svg`, `client/icons/meta-f.svg` | Se marketing quiser trocar arte sem tocar JS → adicionar entradas em `client/sw.js` `PRECACHE` |

**Google:** viewBox 48×48, paths `#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`.  
**Meta:** path “f” 24×24, `fill="currentColor"` no botão azul.

**Acessibilidade:** `aria-labelledby="oauth-enrich-title"` no dialog; `aria-label` explícito em cada botão social; ícones com `aria-hidden="true"`; ordem de tab: Google → Meta → Pular; `:focus-visible` com outline `var(--accent)`.

### 1.5 Microcopy (não negociável)

| Evitar | Usar |
|--------|------|
| “Criar conta Vox” | “Importar nome e foto” |
| “Login” (sozinho) | “Continuar com Google/Meta” + subtítulo `vx_*` |
| “Entrar na rede” | “Seu ID continua sendo vx_* neste aparelho” |

### 1.6 Implementação — arquivos tocados (H1)

- [x] `client/js/render.js` — `renderOAuthEnrich`, constantes SVG
- [x] `client/css/style.css` — bloco OAuth enrich
- [x] `tests/render.test.js` — assert classes/aria
- [ ] `client/DEV.md` — screenshot do modal (opcional, 1 PNG)
- [ ] `app.js` — pós-sucesso OAuth: modal “Seu link #/connect” (H1 item 2)

**Esforço restante H1 UI:** ~0,25 sprint (connect modal + DEV screenshot). **Risco:** baixo.

### 1.7 Compliance de marca

- Respeitar [Google Sign-In branding](https://developers.google.com/identity/branding-guidelines) e Meta Login — padding mínimo ao redor do logo, botão não distorcido.
- Texto: **“Continuar com Google”** / **“Continuar com Meta”** (alinhado ao doc GIS).

---

## 2. Perfis reais, usáveis e encontráveis (sem virar Instagram)

Objetivo: **pessoa A acha pessoa B em ≤3 toques** depois de ter um ponto de entrada (link, comunidade, ou busca local).

### 2.1 Jornadas (3 toques)

| Entrada | Toque 1 | Toque 2 | Toque 3 |
|---------|---------|---------|---------|
| Link WhatsApp `#/connect/vx_…` | Abrir link | “Adicionar contato” | DM ou perfil |
| Handle `@maria` | Tab **Pessoas** | Buscar `@maria` | Conectar / DM |
| Autor na comunidade | Strip/card autor | “Conectar” | DM |
| Colar link no empty state | `#/people` → colar URL | Resolver `parseConnectTarget` | Adicionar |

**Gargalo atual:** nível 0–1 do perfil — OAuth não propaga nome/foto para outros aparelhos até haver post, card ou handle.

### 2.2 Escada de “realidade” do perfil

| Nível | O que o outro vê | Como chegar lá | Módulo |
|-------|------------------|----------------|--------|
| 0 | Só `vx_abc…` | Conta nova, pulou OAuth, zero posts | — |
| 1 | Nome + foto (local) | OAuth ou display name | `local-account`, `oauth-profile` |
| 1b | Card local salvo | `setProfileCard` manual / futuro import | `profile-directory` (`vox-profile-cards-v1`) |
| 2 | Nome/foto **para quem recebeu card assinado** | Gossip `PROFILE_CARD` opt-in | *H2 — novo* |
| 3 | `@handle` resolvível | Claim on-chain | `handles.js` |
| 4 | Aparece em `#/people` de estranhos | Posts públicos, demo, ou índice federado | `people-index`, `cache-node` |

**Insight:** OAuth sozinho não torna o perfil “encontrável na rede”; só deixa **você** reconhecível quando alguém **já** abriu seu link ou viu seu post. Falta **propagação opcional** do cartão de perfil (nível 2).

### 2.3 Alavancas (por esforço / privacidade)

| Ideia | Encontrabilidade | Privacidade / ADR | Esforço | Onde codar |
|-------|------------------|-------------------|---------|------------|
| **A. Onboarding: “Compartilhe seu #/connect”** (QR + WhatsApp) | Alta viral | Só quem recebe link; OK | P | `share.shareConnect`, pós-OAuth em `app.js` |
| **B. Card de perfil assinado → gossip `PROFILE_CARD`** | Média | Opt-in; sem e-mail | M | novo tipo gossip + merge em `profile-directory` |
| **C. Busca `@handle` + prefixo `vx_` em `#/people`** | Média | Handle já público on-chain | P | `people-index.searchPeople` + resolver `handles.js` |
| **D. “Quem está online” na comunidade (P2P)** | Baixa-média | Só peers conectados | M | `peers.js` / UI comunidade |
| **E. Relay: índice opt-in `POST /vox/profile-index`** | Alta se relay popular | Operador + LGPD | L | `relay/server.py` |
| **F. Mutual contacts / amigos em comum local** | Baixa | 100% local | P | `contacts.js` |
| **G. Apelido único local pós-OAuth** | Baixa | Colisão só na busca local | P | `local-account` |
| **H. Perfil mínimo pós-OAuth (nome OU foto)** | UX | Não aumenta discovery sozinho | P | `oauth-profile` + validação modal |

**Evitar:** importar grafo de amigos Google/FB, ranking global, feed algorítmico.

### 2.4 `#/people` — melhorias concretas (H1)

- Empty state: input “Cole link #/connect ou vx_…” → `peopleIndex.parseConnectTarget` → navegar `#/connect/:id`.
- Seção **Contatos** no topo (já indexados em `buildPeopleIndex`).
- Placeholder busca: `Nome, @handle ou vx_…` (já em `renderPeopleSearch`).
- Telemetria local opcional: contador `vox-metrics-people-search-ok` no `localStorage` (sem rede).

---

## 3. Três horizontes

### H1 — MVP polish (1 sprint, client-only)

- [x] Botões Google/Meta com ícones + divisor + skip dedicado.
- [ ] Preview pós-import: avatar + “Você aparecerá como …” no modal antes de fechar.
- [ ] Pós-pacto/OAuth: modal **“Seu link para a rede”** — `#/connect/vx_…`, QR (`brcode` se existir), `shareConnect`.
- [ ] `#/people`: empty state “Cole um link de amigo”; destacar contatos recentes.
- [ ] Comunidade: strip de pessoas → **Adicionar contato** em 1 toque.
- Copy global: UI diz **“Importar nome e foto”**; tab **“Pessoas”** = “Encontrar pessoas”.

### H2 — Malha comunitária (2–4 sprints)

- **Profile card gossip assinado:** `{ routeId, displayName, avatarUrl, bio, sig, exp }`; consumidor merge em `profile-directory` com TTL/revogação.
- `#/people` indexa cards recebidos via gateway/relay + autores de posts.
- Busca: `@slug` → resolver via `handles.js` → incluir no índice.

### H3 — Longo prazo (sem clone Facebook)

- Relay comunitário com índice opt-in + export/portabilidade.
- Attestation (ADR-001) estendida a stewards que indexam perfis públicos voluntários.
- Zero grafo social central obrigatório.

---

## 4. Top 5 recomendações (ordenadas)

1. **UI tradicional Google/Meta** — confiança na primeira tela; **implementado** em `renderOAuthEnrich` + CSS.
2. **Momento “Compartilhe seu connect”** logo após OAuth/pacto — discovery real hoje é **link**, não busca global.
3. **Profile card assinado na malha (opt-in)** — perfis “com cara” para desconhecidos, sem backend Vox central.
4. **Busca `#/people` por `@handle` + prefixo `vx_`** — fricção menor quando passam handle.
5. **Nudges na comunidade** (strip → contato + DM em 2 toques) — encontro contextual.

---

## 5. Métricas de sucesso (produto)

| Métrica | Meta | Como medir (sem nuvem) |
|---------|------|-------------------------|
| Completa OAuth ou display name | > 60% novos | Flag `localAccount.getProfileEnrichment()` ou display name após 24h (survey piloto) |
| Compartilha/copia `#/connect` na 1ª sessão | > 40% | Evento local `vox-metric-connect-shared` ao chamar `shareConnect` |
| Abrir app → DM com contato não-demo | mediana < 2 min | Teste moderado com roteiro fixo |
| Busca bem-sucedida em `#/people` | ≥ 1/sessão ativa (piloto) | Incremento em busca com `results.length > 0` |
| Confiança modal OAuth (quali) | “Parece login conhecido” | 5 entrevistas rápidas pós-H1 |

---

## 6. Referências no repo

| Tema | Caminho |
|------|---------|
| ADR OAuth client-only | `docs/adr/002-oauth-profile-enrich-client.md` |
| Welcome / perfil BR | `docs/vox-brasil-welcome-profile.md` |
| Modal UI | `client/js/render.js` (`renderOAuthEnrich`, `renderPeopleSearch`) |
| OAuth GIS/FB | `client/js/oauth-profile.js`, `client/config/oauth.example.json` |
| Discovery | `client/js/people-index.js`, `contacts.js`, `profile-directory.js` |
| Viral link | `client/js/share.js` (`shareConnect`) |
| Wire handlers | `client/js/app.js` (~`btn-oauth-*`) |
| Testes | `tests/render.test.js`, `oauth-profile.test.js`, `people-index.test.js` |

---

## 7. Checklist dev (próximo PR sugerido)

1. Revisar screenshot modal no `DEV.md` (PWA claro/escuro).
2. Implementar modal pós-OAuth com `shareConnect` + copy QR.
3. Empty state `#/people` com paste de link (`parseConnectTarget`).
4. Spike H2: schema `PROFILE_CARD` em doc gossip (`docs/listing-signed-gossip-v1.md` como modelo de assinatura).
