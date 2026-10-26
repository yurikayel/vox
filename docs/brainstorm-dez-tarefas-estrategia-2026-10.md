# Brainstorm — dez tarefas estratégia (out/2026)

> **Status:** Sprint análise/estratégia (sem código)  
> **Escopo deste arquivo:** T2 (posicionamento comparativo), T3 (playbook piloto V-P09), T4 (matriz risco regulatório), T5 (métricas honestas v2)  
> **Tom:** cívico, honesto sobre escala e limites técnicos no Brasil  
> **Relacionados:** [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) · [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) · [backlog-participacao-rede.md](./backlog-participacao-rede.md) (V-P09) · [COMPLIANCE-BR.md](../COMPLIANCE-BR.md)

Índice planejado do sprint (10 tarefas): T1–T10. **Entregues aqui:** T2, T3, T4, T5. T1 → [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md).

---

## T2 — Posicionamento comparativo (Vox vs alternativas, Brasil)

### Tese em uma frase

O Vox **não substitui** o WhatsApp nem compete com Mastodon/Nostr por “massa de usuários”. É camada **complementar** para grupos cívicos que precisam de **registro público assinado**, **deliberação com regras explícitas** e **infra cooperativa** — aceitando atrito maior e escala de **dezenas a centenas** por comunidade, não milhões.

### Para quem (nicho cívico no Brasil)

| Perfil | Dor no WhatsApp / Meta | O que o Vox oferece (realista) |
|--------|------------------------|--------------------------------|
| Coletivo, ONG, grêmio | Decisão some no scroll; admin único; export frágil | Posts assinados, proposta/voto com cutoff, `mod-action` auditável |
| MEI / feira de bairro | Catálogo no status some; spam no grupo | Feira cronológica + cache comunitário (`commOnly`) |
| Campanha / comunicação | Link quebrado; dependência de algoritmo | Link canônico POSSE (Bridge ainda parcial — honestidade P2) |
| Migrantes do Fediverse | Instância pequena, mod burnout, custo VPS | Sem “instância única”; steward por território digital, PWA estática |
| Curiosos Nostr | UX fragmentada, relays opacos | Menos cypherpunk; mais “praça” com regras locais em PT |

**Fora de escopo honesto (2026):** substituir Zap de família; rede nacional tipo Threads; P2P confiável no 4G brasileiro (CGNAT); T&S central estilo big tech.

### Tabela comparativa — forças e fraquezas

Legenda: **Vox** = cliente PWA + gossip + relay opcional + permaweb (gateways reserva). Escala = ordens de grandeza **no Brasil**, não market share global.

| Dimensão | Vox | Fediverse / Mastodon | Nostr | Grupos WhatsApp |
|----------|-----|----------------------|-------|-----------------|
| **Adoção / escala BR** | ⚠️ Experimental; dezenas–centenas se piloto funcionar | ⚠️ Nicho (~dezenas de instâncias BR; picos na migração X) | ⚠️ Micro-nicho técnico | ✅ ~100% do eleitorado online usa Zap |
| **Atrito de entrada** | ⚠️ PWA, chave local, Cantina/Pacto | ⚠️ Escolher instância, conta, fediverse é confuso | ❌ Chaves, relays, clientes | ✅ Já instalado |
| **Persistência / POSSE** | ✅ TX assinada + cache local; export ADR-001 opt-in | ✅ ActivityPub portable (com ressalvas) | ✅ Eventos assinados | ❌ Histórico preso ao aparelho/admin |
| **Moderação** | ✅ `mod-action` público; sem T&S central ([GOVERNANCE.md](../GOVERNANCE.md)) | ⚠️ Por instância; burnout documentado | ⚠️ Client-side mutes; relays não moderam conteúdo | ⚠️ Admin deus; ban opaco |
| **Custo infra** | ✅ Pages + gateways; steward voluntário (VPS opcional) | ⚠️ Dono da instância paga VPS | ⚠️ Relays + apps | ✅ Meta subsidia |
| **Privacidade DM** | ✅ E2E + relay cego TTL ([ARCHITECTURE.md](./ARCHITECTURE.md)) | ⚠️ Varia por instância | ✅ Cripto nativo | ⚠️ Meta E2E opcional; metadados |
| **Descoberta / viral** | ❌ Sem feed global; `#/people` opt-in | ⚠️ Fediverse explore + instância | ⚠️ Seguir chaves | ✅ Encaminhar no grupo |
| **Brasil específico** | ✅ COMPLIANCE-BR, copy PT, Pix no produto | ⚠️ Instâncias BR existem; UX EN | ❌ Pouco localizado | ✅ Cultura do áudio/figurinha |
| **Resiliência censura** | ⚠️ Gateways + espelhos; não magic bullet | ⚠️ Depende da instância | ✅ Relays múltiplos | ❌ Plataforma única |
| **Honestidade técnica** | ✅ Pill “Leitura reserva”; não promete P2P mobile total | ⚠️ “Descentralizado” mas server-heavy | ⚠️ UX vende liberdade, entrega complexidade | N/A (centralizado assumido) |

### Onde o Vox **ganha** (sem hype)

1. **Território digital com regras** — comunidade + feira + governança no mesmo cliente, pensado para **deliberação** e não só microblog.
2. **Malha participativa escalonada** — Passivo → Ativo → Apoiador (`commOnly`) → Steward ([espacos-digitais-infra.md](./espacos-digitais-infra.md)); contribuir banda **não** compra alcance.
3. **Híbrido Zap + link canônico** — ritual realista: WhatsApp para coordenação diária; Vox para o que precisa **prova e arquivo** (ata, voto, oferta da feira).
4. **Mantenedor do repo enxuto** — meta trimestre: coletivo sobe relay **sem loop** do mantenedor ([rede-sustentada-participantes.md](./rede-sustentada-participantes.md)).

### Onde o Vox **perde** (dizer em voz alta)

1. **Massa e hábito** — nenhuma feature do Vox vence o custo zero de “já está no grupo”.
2. **Cold start** — sala vazia até seed + conteúdo útil (POSSE/feira/voto); protocolo não resolve sozinho.
3. **Steward / CGNAT** — celular brasileiro **não** substitui VPS para espelho confiável; copy deve repetir isso.
4. **Maturidade** — piloto V-P09 **não executado**; SLOs são desenho + observação local, não SLA comercial.
5. **Bridge / POSSE** — crosspost automático ainda stub; comparar com ActivityPub “boost” ou Nostr cross-posting só com ressalva “roadmap”.

### Posicionamento sugerido (copy externa)

| Audiência | Mensagem | Evitar |
|-----------|----------|--------|
| Fundador de coletivo | “Arquivo e votação que o Zap não guarda; vocês escolhem quem modera, com registro.” | “Rede que vai derrubar o WhatsApp” |
| Steward técnico | “15 min de relay espelha a comunidade; gateway é reserva visível.” | “100% descentralizado no celular” |
| Militante / campanha | “Link oficial do comunicado + feira do bairro; grupo continua no Zap para urgência.” | “Alcance orgânico garantido” |
| Dev fediverso | “Sem instância única; permaweb + gossip; mods on-chain locais.” | “ActivityPub-compatible” (não é, hoje) |

### Implicações estratégicas (T2 → backlog)

- **Parceria, não competição:** oficinas estilo FediForum/CHATONS (“sair do Meta”) terminam em **comunidade Vox + grupo Zap de coordenação**, não migração total.
- **Métrica de sucesso 2026:** 1–3 comunidades piloto sustentadas (steward + ≥5 Apoiadores), não DAU nacional.
- **Anti-padrão:** pitch técnico de protocolo para leigo; ranking de nós; prometer escala Mastodon com equipe de projeto atual.

---

## T3 — Playbook operacional piloto V-P09 (10–30 pessoas, semanas 0–4)

### Objetivo do piloto

Validar empiricamente o flywheel **uso → espaço digital → contribuição → leitura mais rápida** ([brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md)), calibrar copy honesta e gerar insumos para V-P04 / V-P05 / V-I08 via retrospectiva.

**Duração:** 4 semanas operacionais + **retrospectiva** 7–14 dias após go-live (preencher template).

**Template oficial (obrigatório ao fechar):** [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md)

**Checklists técnicos:** [steward-seed-15min.md](./steward-seed-15min.md) (Caminho A/B) · [steward-relay-kit.md](./steward-relay-kit.md)

### Pré-requisitos (antes da semana 0)

| Item | Responsável | Critério |
|------|-------------|----------|
| Comunidade criada (`#/compose/community`) | Fundador | Slug, regras mínimas, 1 post pin “por que estamos aqui” |
| Grupo WhatsApp (ou Telegram) **paralelo** | Fundador | 10–30 pessoas convidadas **por relação** (3 convites cada, máx.) |
| Facilitador nomeado | Fundador | Pessoa com 2–4 h/semana nas 4 semanas |
| Caminho A ou B decidido | Fundador + steward reserva | A = só gateway; B = relay em semana 2 |
| Consentimento LGPD / gravata cívica | Fundador | Sem dados sensíveis obrigatórios; DMs E2E opcionais |

### Roles (RACI simplificado)

| Papel | Qtd | Poder | Obrigação | Não é |
|-------|-----|-------|-----------|-------|
| **Fundador** | 1 | Cria comunidade; nomeia facilitadores; pin inicial | Convites, seed, ponte Zap ↔ link `#/c/:slug` | Mod 24/7 sozinho |
| **Facilitador** | 1–2 | Agenda rituais; lembretes no Zap; 1º tópico/semana | Manter conversa viva; reportar travamentos | Dono de VPS obrigatório |
| **Moderador** | 1 (+ 1 reserva) | `mod-action` após eleição/cutoff ou nomeação semana 1 | Carta de mod 1 página; plantão rotativo (E4) | Steward automático |
| **Steward** | 0→1 | Relay/espelho; `#/settings/network` | Caminho B semana 2; health do relay | T&S global; lê DM |
| **Apoiador (`commOnly`)** | meta ≥5 até semana 4 | Cache preferencial da comunidade | Aceitar nudge V-P04 quando existir | Ranking público |
| **Membro** | restante | Postar, feira, votar se elegível | Default Ativo (Pacto); opt-out OK | Dever de evangelizar |

**Trio mínimo (experimento E1):** fundador + 2 facilitadores **ou** fundador + 1 facilitador + 1 mod reserva aceitos **antes do dia 7**.

Escada completa mod/steward: seção C.3 em [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md).

### Calendário semanas 0–4

#### Semana 0 — Preparação (3–5 dias antes do go-live)

| Dia | Ritual / entrega | Canal |
|-----|------------------|-------|
| D-5 | Fundador publica post pin + regras; compartilha link PWA no Zap | Vox + Zap |
| D-4 | Lista fechada 10–30 nomes; cada um convida ≤3 confiáveis | Zap |
| D-3 | Oficina 30 min “Cantina + primeiro post” (screenshare ou presencial) | Meet + Vox |
| D-2 | Fundador confirma facilitador(es) e mod reserva por mensagem **privada** | Zap |
| D-1 | Teste Caminho A: visitante anônimo abre `#/c/:slug`; latência anotada | Vox |
| D0 | **Go-live:** todos postam 1 apresentação; fundador abre tópico feira ou deliberação piloto | Vox |

**Fase A (48h pós go-live):** só gateway + gossip — registrar no template retrospectiva.

#### Semana 1 — Seed e hábito

| Ritual | Frequência | Dono |
|--------|------------|------|
| **Stand-up async** (1 pergunta: “o que você leu/postou no Vox?”) | 2× | Facilitador no Zap |
| **Tópico da semana** (debate ou feira) | 1 | Fundador |
| **Nomeação trio E1** | até dia 7 | Fundador |
| **Carta de mod** colada nas regras (E2) | até dia 7 | Mod |
| Leitura pill “Leitura reserva” — anotar sim/não | contínuo | Facilitador |

Meta qualitativa: ≥50% dos convidados com **≥1 post**; ≥30% abriram `#/settings/network` (estimativa por auto-reporte no stand-up).

#### Semana 2 — Infra comunitária (Caminho B)

| Ritual | Dono | Notas |
|--------|------|-------|
| Deploy relay + espelho ([steward-seed-15min.md](./steward-seed-15min.md) Caminho B) | Steward | Se ninguém técnico: **continuar Caminho A** e documentar bloqueio |
| **Fase B** no template: steward ativo | Steward | |
| Convite explícito: 3 pessoas viram Apoiador `commOnly` | Facilitador | |
| Sessão **mod-action ao vivo** 30 min (E3) | Mod + fundador | Incidente simulado ou case real |

Meta: ≥3 Apoiadores; percepção de latência vs Zap anotada na retrospectiva.

#### Semana 3 — Governança leve

| Ritual | Dono |
|--------|------|
| Proposta piloto (ex.: pin feira, segundo mod, orçamento simbólico) | Fundador |
| Voto com **cutoff** = data da proposta | Facilitador |
| Plantão mod rotativo inicia (E4) | Mod |
| Compartilhar 1 link POSSE/canônico fora do Vox (WhatsApp status, blog) | Quem tiver conteúdo |

Meta: 1 ciclo proposta → voto → desfecho documentado (E5 opcional).

#### Semana 4 — Consolidação e decisão

| Ritual | Dono |
|--------|------|
| **Fase C:** ≥5 membros `commOnly` (template V-P09) | Comunidade |
| Retro interna 45 min (antes do formulário) | Facilitador |
| Preencher [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) | Facilitador |
| Decisão **continuar / pausar / abortar** (critérios abaixo) | Fundador + grupo |

### Rituais recorrentes (todas as semanas)

1. **Link canônico no Zap** — toda ata/decisão importante: 1 linha no grupo + URL `#/c/:slug/...`.
2. **Segunda-feira:** facilitador posta agenda da semana no Vox (pin ou tópico).
3. **Sexta-feira:** “vitória pequena” — um post celebrando feira/voto/leitura rápida (sem gamificação pública).
4. **Opt-out republicano** — quem pausa rede em `#/settings/network` **não** é shameado.

### Métricas qualitativas (sem phone-home central)

Coletar na retrospectiva e stand-ups; **não** publicar ranking.

| Sinal | Como medir | Interpretação |
|-------|------------|---------------|
| **Utilidade percebida** | Enquete 1–5: “Valeu mais que só Zap esta semana?” | ≥60% ≥3 → continuar |
| **Confiança no arquivo** | “Você confia que acha de novo daqui 30 dias?” sim/não | Maioria sim → POSSE/feira validados |
| **Copy honesta** | Seção “Copy confusa” do template | Entrada para V-P03 / i18n |
| **Leitura reserva** | Pill frequente? sim/não | Gateway-heavy → priorizar steward/espelho |
| **Burnout mod/fundador** | “Precisei apagar incêndio sozinho?” | ≥2 sim → abortar ou reestruturar roles |
| **Reciprocidade malha** | Estimativa Apoiadores + stewards | `<5 commOnly` semana 4 → flywheel fraco |
| **Latência vs Zap** | Subjetivo na retrospectiva | Esperado: Zap ganha urgência; Vox ganha arquivo |

Métricas locais sugeridas no template: membros Ativo, Apoiadores, stewards, gateway pill.

Experimentos mod E1–E5: [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) § C.5 — marcar coluna “Fase C mod” ao preencher retrospectiva.

### Critérios **continuar** (após semana 4)

Atender **≥4 de 6**:

1. ≥8 de 10–30 convidados ainda acessam o PWA **pelo menos 1×/semana** (auto-reporte).
2. ≥5 posts **não-fundador** por semana (média semanas 3–4).
3. ≥3 Apoiadores `commOnly` **ou** 1 steward com espelho verificado.
4. Retrospectiva lista ≥2 itens “o que funcionou” concretos (feira, voto, mod-action, etc.).
5. Nenhum incidente grave sem resposta mod **>72h**.
6. Fundador **e** mod reserva concordam: “dá para mais 4 semanas sem herói solitário”.

**Próximo passo:** segundo ciclo 4 semanas; issues V-P04/V-P05/V-I08 derivadas do template; atualizar [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) v1.1.

### Critérios **pausar** (hibernar 30–90 dias)

- Continuar falhou em 2–3 critérios, mas grupo quer manter link e arquivo read-only.
- Steward desistiu; Caminho A ainda serve leitura via gateway.
- Ação: reduzir rituais a 1 post/mês; manter Zap como canal principal; **não** apagar comunidade.

### Critérios **abortar** (encerrar piloto documentado)

Atender **≥2**:

1. `<5` pessoas ativas na semana 4 **e** convites esgotados.
2. Fundador ou mod único reporta burnout **e** ninguém aceita substituir (E1 falhou).
3. Conflito interpessoal **não** resolvido por mod-action/governança em 14 dias.
4. Copy/UX gerou desconfiança (“achava que era blockchain scam” / “prometeu P2P no celular”) — falha de expectativa.
5. Dependência 100% gateway **e** recusa coletiva a qualquer Caminho B (OK **se** abortar por “não é prioridade infra”, não por vergonha).

**Abortar bem:** preencher retrospectiva mesmo assim; publicar 1 post pin “piloto encerrado — arquivo permanece”; lições no backlog Community-doc.

### Riscos e mitigações (piloto)

| Risco | Mitigação |
|-------|-----------|
| Sala vazia | Seed semana 0: feira ou voto real; conteúdo útil dia 1 |
| “Mais um app” | Zap continua; Vox só para arquivo/decisão |
| Steward herói | Caminho A legítimo; buddy V-P08 quando existir |
| Mod polícia | Convite pós-membria; mandato 90 dias; E4 plantão |
| Ilícito / brigading | GOVERNANCE + cutoff; canal externo para crime |

### Definition of done — T3 (documentação)

- [x] Playbook semanas 0–4 com roles e rituais
- [x] Métricas qualitativas + continuar/pausar/abortar
- [x] Cross-link [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) e steward seed
- [ ] **Execução humana** V-P09 (fora deste doc)

---

---

## T4 — Matriz de risco regulatório operacional (espelho · steward · autor · mod)

**Objetivo:** dar a voluntários e coletivos um mapa de **onde a lei brasileira pode bater na prática**, sem centralizar T&S no repositório Vox. Leitura alinhada a [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) — **documento informativo, não parecer jurídico**; espelhos comerciais, PJ e casos eleitorais exigem advogado local.

### Papéis na matriz

| Papel | Quem é | Superfície típica |
|-------|--------|-------------------|
| **Espelho** | Fork Pages/Cloudflare, front-end estático com SHA do `main`, possivelmente com filtros locais | Domínio público, HTML servido, listagens curadas |
| **Steward** | Operador de relay/espelho com índice `GET /vox/index/*.json`, mirror comunitário, logs do **seu** servidor | Possível **provedor de aplicação** se índice público curado ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § Marco Civil / Infra voluntária) |
| **Autor** | Quem assina TX on-chain (tópico, reply, perfil, Pix declarativo) | Conteúdo público imutável; responsabilidade civil por ilícito **como autor** |
| **Mod** | Membro com chave reconhecida; emite `mod-action` assinado ([GOVERNANCE.md](../GOVERNANCE.md)) | Decisão comunitária registrada; **não** apaga permaweb |

O **repositório open-source** (sem backend Vox, sem operador central Fase 1–2) **não** ocupa coluna de “operador único”; risco residual do projeto = manutenção de código e comunicação honesta — não custódia de dados nem moderação global.

### Eixos regulatórios (visão operacional)

| Eixo | Gatilho operacional | Quem sente primeiro | Mitigação por arquitetura (produto) | Risco residual |
|------|---------------------|---------------------|-------------------------------------|----------------|
| **Marco Civil — Art. 19** | Ordem judicial ou notificação qualificada (STF) para indisponibilizar conteúdo de terceiros | **Steward / espelho** com índice ou UI que **seleciona** o que exibir | Cliente estático sem DB central; supressão na **camada espelhada** (remover TX do JSON, não servir BLOB cacheado); copy “espelho ≠ apagar on-chain” ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § Marco Civil) | TX permanece em gateways Arweave; outro client/URL ainda pode exibir |
| **Marco Civil — neutralidade / sinalização** | Servidor de sinalização WebRTC tratado como canal de aplicação | Mantenedor de **signaling** (se hospedar) | `signaling.py` transitório, sem payload de comunidade ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)) | Quem opera signaling fora do escopo “só handshake” aumenta superfície |
| **LGPD — titularidade e minimização** | Publicar CPF, telefone, dados de terceiros em tags/corpo; OAuth além do necessário | **Autor**; operador de espelho com **logs** identificáveis | Sem cadastro central; Pacto Vox só replica **público**; DMs proibidas on-chain; relay inbox cego + TTL 72h; Pix mascarado; anti-CPF-login ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § LGPD, DMs, Pix) | Permaweb impede eliminação técnica plena — mitigar = não publicar |
| **LGPD — encarregado / bases legais** | Steward comercial, tratamento além de cache público, analytics no servidor | **Steward / espelho** PJ ou PF com modelo de negócio | Repo **não** nomeia DPO central; onboarding Pacto Vox + opt-out `#/settings/network`; PROFILE_CARD gossip opt-in com TTL 30d ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)) | Cada operador avalia seu papel de controlador |
| **Pix / SPI (BCB)** | Usuário interpreta Vox como intermediário; golpe com chave falsa; BR Code como “pagamento in-app” | **Autor** (chave declarativa); **espelho** que promete validação | Não-PSP: geração client-side, liquidação no app bancário; disclaimers; sem custódia/taxa ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § Pix Fase A e 6.0) | Fraude entre pessoas — denúncia às autoridades, não “mod central” |
| **TSE / conteúdo eleitoral** | Propaganda paga, plataforma operada por PJ com moderação centralizada | **Autor**; fork comercial / espelho “plataforma” | Vox Fase 1 não é plataforma PJ centralizada ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § TSE) | Integrações comerciais podem mudar enquadramento |

### Matriz cruzada (severidade × papel)

Escala: **B** baixo · **M** médio · **A** alto (exposição **operacional** típica, não sentença jurídica).

| Cenário | Espelho | Steward | Autor | Mod |
|---------|---------|---------|-------|-----|
| Conteúdo ilícito de terceiro visível no **seu** front/índice | M→A | A | B | M |
| Ordem Art. 19 não atendida na camada que você controla | A | A | — | — |
| Dado pessoal de terceiro publicado on-chain | B | B | A | M (se não agir na comunidade) |
| Relay serve cache público sem curadoria (Ativo/Apoiador) | — | M | B | — |
| Índice curado + domínio comercial + filtros editoriais | A | A | B | M |
| Pix Zap / BR Code — usuário vítima de golpe | B (copy) | B | M (chave declarada) | B |
| `mod-action` contestado (liberdade de expressão vs regra local) | B | M | M | M |
| DMs: operador de relay lê payload | — | A (se violar desenho) | B | — |

**Mod:** risco **governança + reputação**, não substituto de ordem judicial. Ações são TX públicas; steward **escolhe** espelhar filtros ([GOVERNANCE.md](../GOVERNANCE.md) § Steward e índice espelho).

### Mitigações arquiteturais (checklist por papel)

**Todos os papéis**

- Ler [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) antes de operar espelho/steward ou publicar Pix.
- Não prometer “blindagem total” ou anonimato legal ([infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) § 4).

**Espelho**

- Publicar SHA/commit servido; política de filtros (`mod-action`, listas locais).
- Canal de contato para pedidos judiciais; responder na UI/índice, não prometer remoção chain-wide.

**Steward**

- Separar **inbox relay** (transitório, cifrado) de **espelho de conteúdo público**.
- Documentar quotas, TTL, URL; transparência ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § orientações stewards).
- Sem ranking público de “bom nó” imposto pelo projeto.

**Autor**

- Minimizar PII em tags; tratar permaweb como **publicação permanente**.
- Pix: conferir titular no app bancário; não usar CPF como login.

**Mod**

- Assinar `mod-action`; regras da comunidade visíveis; escalonar ilícito grave a autoridades — mod **não** é tribunal ([GOVERNANCE.md](../GOVERNANCE.md) § Abuso).

### Fluxo operacional (ordem judicial → camada certa)

```
Pedido formal → operador do espelho/steward que SERVIU a listagem
        │
        ▼
Suprimir TX/alvo no índice JSON + cache BLOB local + HTML filtrado
        │
        ▼
Registrar resposta (e-mail/ticket) — sem acesso on-chain do projeto Vox
        │
        └── Autor/mod: fora do fluxo Art. 19 salvo conteúdo próprio ou ordem específica
```

### Anti-padrões regulatórios

- Centralizar moderação ou DPO no repo FOSS “para proteger” voluntários — concentra Art. 19 no mantenedor.
- Phone-home de métricas “para compliance” — contradiz LGPD-by-design.
- Validar ou “verificar” chave Pix no client — cheiro de IP/PSP ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)).
- Leaderboard de stewards — pressão laboral + percepção de serviço profissional monitorado.

### Entregáveis sugeridos (pós-T4)

| Item | Dono | Notas |
|------|------|-------|
| Template README steward (URL, filtros, contato judicial) | Docs + relay kit | Link COMPLIANCE-BR |
| Wizard espelho: checkbox “entendo Art. 19 na minha camada” | Client opcional | Não bloquear uso FOSS |
| Runbook mod: quando publicar `mod-action` vs orientar denúncia | GOVERNANCE anexo | Transações exemplos |

---

## T5 — Spec estratégica: métricas honestas v2 («Sustentada por vizinhos»)

**Objetivo:** evoluir o painel comunitário de **estimativas locais úteis** (v1 em `computeCommunityNeighborStats` / `renderCommunityNeighborPanel`) para um modelo **v2** explícito sobre privacidade, degradação de UX e limites de publicação — alinhado a [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) (sem KPI público global) e [ADR-001](./adr/001-contribution-attestation-export.md) (export opt-in, sem leaderboard).

**Princípio:** transparência **cívica da praça**, não analytics de plataforma.

### v1 (baseline implementada)

- **Onde:** header da comunidade — título «Sustentada por vizinhos».
- **Sinais:** `~N aparelhos online`; `~X% leituras recentes via cache local ou relay comunitário`; alerta se `degraded` (poucos apoiadores ou gateway `critical`).
- **Fontes:** presença gossip (`recentPeople`), heurística `gatewayState` ([gateway-telemetry.js](../client/js/gateway-telemetry.js)), demo mock.
- **Copy fixa:** «Sem ranking público de nós — só agregados desta praça.»

### v2 — o que medir **localmente** (por aparelho, janela rolante)

Tudo permanece em **localStorage / IndexedDB / memória de sessão** — zero backend Vox.

| Métrica interna | Definição operacional | Uso permitido |
|-----------------|----------------------|---------------|
| `read_origin` | Por fetch de post/BLOB na sessão: `mesh` \| `relay` \| `gateway` \| `cache_idb` | Agregar **só** `% mesh+relay+cache` na comunidade atual |
| `peer_presence_count` | Contagem de `routeId`/cartão visível na malha **filtrada por `Community-Id`** (não IP) | Arredondar a ~N; cap superior soft (ex.: “9+”) |
| `gateway_health` | Estado derivado de tentativas locais (`all_ok` / `degraded` / `critical`) | Modula `%` e pill «Leitura reserva» |
| `pacto_layer` | Passivo / Ativo / Apoiador (`commOnly`) — estado **deste** client | CTAs contextuais; nunca expor de terceiros |
| `seed_progress` | Checklist V-P05 concluído (local) | Ocultar painel “degradado” agressivo em comunidade recém-criada (grace 24–48h) |
| `steward_reach` | Boolean: última leitura resolveu via URL de relay **conhecida** da comunidade (manifest opt-in) | Footnote “relay comunitário detectado” — sem nome do host |

**Janela temporal:** preferir **últimas 24h ou últimas 50 leituras** na comunidade, o que vier primeiro — descartar amostras &lt; 5 leituras (mostrar “dados insuficientes” em vez de percentual falso).

**Precisão honesta:** sempre sufixo **(estimativa local)**; demo comunidade mantém `(estimativa demo)`.

### v2 — o que **nunca publicar** (nem na UI, nem gossip, nem export default)

| Proibido | Motivo |
|----------|--------|
| Ranking global ou por comunidade de nós, IPs, `routeId`, endereços Arweave “top contribuidor” | LGPD + anti gamificação ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § infra; [GOVERNANCE.md](../GOVERNANCE.md)) |
| Mapa geográfico fino ou fusos inferidos de IP | Dado pessoal / vigilância |
| Histórico exportável de “quem serviu o quê” para terceiros | Perfilamento; risco trabalhista informal |
| Telemetria centralizada (phone-home) agregada cross-user | Contradiz P2P-first e Pacto Vox |
| Percentuais com precisão falsa (ex.: 96,3%) | Induz confiança estatística inexistente |
| Correlacionar Pix / zap count com contribuição de infra | Pay-to-win regulatório e social |
| Expor `gateway_health` de **outros** usuários | Só o estado **local** alimenta o painel público da praça |

**Export opt-in (ADR-001):** atestação assinada de **métricas do próprio aparelho** — rate limit, disclaimer, **sem** upload automático para servidor Vox.

### UX degradado (estados do painel)

| Estado | Condição (v2) | UI | Tom |
|--------|---------------|-----|-----|
| **Saudável** | ≥3 presenças comunitárias **e** `gateway_health !== critical` **e** amostra ≥5 leituras | Números ~arredondados; CTA suave «Ajustar participação» | Orgulho cívico, não competição |
| **Degradado leve** | `gateway degraded` **ou** 1–2 presenças | `%` leituras locais mais baixo; pill global «Leitura reserva ocasional» | Explicar fallback **sem culpar pessoa** |
| **Degradado forte** | `fewSupporters` **ou** `gateway critical` | Alerta existente: «Velocidade reduzida: poucos apoiadores online…» + botão `commOnly` | Convite a Apoiador/steward, não shame |
| **Frio / seed** | Comunidade nova, checklist incompleto | Painel compacto ou link «Como acelerar esta praça» → seed V-P05 | Evitar alarme antes do ritual 3 min |
| **Insuficiente** | &lt;5 leituras na janela | «Ainda coletando estimativa local…» — ocultar `%` | Honestidade epistêmica |

**Regra de ouro:** degradação fala de **condição da praça**, nunca «fulano não ajuda».

### Privacidade e LGPD (desenho v2)

1. **Minimização:** agregados por `Community-Id` na UI; contadores não reversíveis a indivíduo (&lt;3 → bucket “poucos”).
2. **Consentimento:** Pacto Vox já cobre servir payload público; painel **não** exige opt-in extra — lê apenas estado já derivado da participação.
3. **Retenção local:** rotacionar contadores (TTL 7d) em `localStorage`; permitir «Apagar estatísticas locais» em `#/settings/network`.
4. **Gossip:** **proibido** propagar métricas v2 entre pares (evita grafo social de contribuição); presença permanece conforme spec PROFILE_CARD.
5. **Stewards:** telemetria agregada **voluntária** off-band (planilha do coletivo) — fora do client; ver P2 em [rede-sustentada-participantes.md](./rede-sustentada-participantes.md).

### Evolução de copy (v2)

- Manter rodapé: «Sem ranking público de nós — só agregados desta praça.»
- Adicionar tooltip curto: «Percentual estimado neste aparelho; outros visitantes podem ver números parecidos.»
- Link para [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) § Pacto Vox quando CTA mencionar banda/disco.

### Critérios de aceite (implementação futura)

- [ ] `%` só aparece com amostra mínima; arredondamento em passos de 5 ou 10.
- [ ] Nenhuma API nova no relay para métricas de usuário.
- [ ] Testes: estados saudável / degradado / insuficiente / demo ([render.test.js](../tests/render.test.js) estendido).
- [ ] Documentar schema `read_origin` em `client/DEV.md` — sem PII.
- [ ] Revisão privacidade: export ADR-001 não inclui lista de peers servidos.

### Roadmap v2 → v2.1 (opcional)

| v2.1 | Descrição | Guardrail |
|------|-----------|-----------|
| Relay manifest comunitário | Comunidade publica URL de steward **sem** uptime score público | Só link + última sync manual |
| Diagnóstico gateway export | JSON local tipo `vox-gateway-diagnostic` | Usuário inicia download |
| Comparativo **privado** | «Sua leitura: 80% local esta semana» em `#/settings/network` | Nunca na página pública da comunidade |

---

**Versão:** 1.1 (T2 + T3 + T4 + T5) · **Data:** 2026-10-25 · **Dono:** Community-doc / sprint estratégia
