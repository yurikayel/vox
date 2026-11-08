# Caminho até a rede pública — brainstorm + backlog (nov/2026)

> **Status:** brainstorm + backlog · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-08
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Aqui ficam o *porquê*, os portões e a ordem. As linhas com caixa `[ ]` estão no ROADMAP, seção [Rumo à rede pública](../ROADMAP.md#rumo-à-rede-pública-lan).
> Insumos: [FEATURES.md](../FEATURES.md) · [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) · [pesquisa-complementar-2026-11.md](../research/pesquisa-complementar-2026-11.md) · [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md) · [piloto go/no-go](../pilot/piloto-comunidade-go-no-go.md)

## 1. Onde estamos (2026-11-08)

**O produto está à frente da rede.** O cliente já tem feed Social/Cívico, comunidades, governança, Feira, Pix Zaps, DMs E2E, cofre e POSSE ([FEATURES](../FEATURES.md)). O que impede abrir ao público é:

| Frente | Situação | Gravidade para abrir |
|---|---|---|
| Jurídico | Sem parecer. A tese do STF exige autorregulação, canal para não usuários, relatório anual e **representante PJ no país** (itens 8–11). Os Decretos 12.975/12.976/2026 põem a ANPD na fiscalização. O ECA Digital exige vínculo com responsável abaixo de 16. **Não há Termos de Uso.** `privacy.html` e COMPLIANCE-BR são anteriores a tudo isso | **bloqueia** |
| Conteúdo grave | **Não há procedimento** para abuso sexual infantil, terrorismo ou imagem íntima não consentida (o Decreto 12.976 fala em **2 h**). **Não há botão de denúncia** no app | **bloqueia** |
| Honestidade | O `mock.js` mostra 27 perfis fictícios por UF e propostas de demonstração quando a rede falha, **misturados com conteúdo real**. Numa rede pública isso vira "perfil falso", que foi justamente o caso do Tema 987 | **bloqueia** |
| Infra | 1 nó de sinalização (Render), sem TURN, sem espelho B, sem drill de DR. **Sem domínio próprio** (`yurikayel.github.io/vox`, `vox-9df.pages.dev`) | **bloqueia** |
| Pessoas | Uma pessoa detém todas as contas: GitHub, Render, Cloudflare. Nenhum steward além do mantenedor. Piloto não começou (`blocked-human`) | **bloqueia** |
| Segurança | Sem modelo de ameaças. Sem revisão externa de DM e cofre. **Sem CSP.** Pares WebRTC veem o IP um do outro | alto |
| Escala | Cota do Turbo de ~10 MiB por carteira/sub-rede; `turbo-gateway` com 5 GB por visitante; banda do Render desconhecida; nenhum teste de carga | alto |
| Acesso | Sem auditoria de acessibilidade nem de desempenho em Android de entrada. A chave no iOS pode ser apagada pelo Safari | médio |

## 2. Brainstorm — o que significa "rede pública viável"?

Abrir ao público não é publicar um link: é **aceitar gente que não conhecemos, inclusive quem quer quebrar a rede**. A pergunta certa é **o que precisa ser verdade no dia em que um estranho entra**. A definição abaixo tem 10 critérios verificáveis:

1. **Sobrevive sem o mantenedor por 30 dias.** Duas pessoas com acesso a cada conta crítica, dois caminhos de sinalização independentes, espelho B e drill de DR feito.
2. **Tem um responsável jurídico claro.** Parecer escrito, e uma decisão sobre PJ e representante tomada e executada (ou dispensada com justificativa do parecer).
3. **Responde a conteúdo grave em horas.** Denúncia no app, plantão nomeado, ocultação no PWA oficial em ≤2 h e encaminhamento às autoridades.
4. **Não mente.** Nada de demonstração misturado com o real, avisos de permanência antes de publicar, avisos honestos de Pix e de IP.
5. **Protege quem é vulnerável.** Proteções por idade (ECA Digital), DM fechada a desconhecidos por padrão para menores, e um modo de privacidade de IP.
6. **Aguenta tráfego e abuso.** Teste de carga documentado, limite de taxa, anti-spam, disjuntor de banda e kill-switch por configuração.
7. **Tem a cripto revisada por fora.** Modelo de ameaças e revisão externa de DM, cofre e assinatura.
8. **Funciona para leigo em celular barato.** Onboarding testado com 5 leigos, acessibilidade AA básica e orçamento de desempenho.
9. **Tem dinheiro e gente para 12 meses.** Custo projetado para 1k e 10k usuários, fonte de cobertura e ≥2 stewards.
10. **Foi provado num grupo real.** Piloto de 4 semanas aprovado e beta por convite com métricas honestas.

### 2.1 Ideias do brainstorm (o que entrou no backlog e por quê)

- **Abrir em ondas, não de uma vez.** Piloto fechado → beta por convite → público. Cada onda tem um portão (§3) e um **critério de pausa**: se acontecer X, fecha convites. Isso reduz o risco jurídico enquanto o parecer não chega.
- **Kill-switch sem servidor.** `client/config/*.json` servido pelo Pages já é configuração remota: dá para desligar upload, Feira ou Pix Zaps num incidente sem novo deploy de código.
- **Status público grátis.** Uma página no Pages alimentada por workflow que testa os nós e os relays Nostr (aproveita o REV-19), sem servidor novo.
- **Demonstração como modo, nunca como fallback.** Um `#/demo` explícito com faixa "demonstração", e a rede real mostrando "sem conexão" em vez de inventar conteúdo.
- **Aviso de permanência no primeiro post permanente.** É o maior risco de LGPD vindo do próprio usuário: ele precisa entender antes de publicar.
- **Plantão de conteúdo grave em rodízio.** Começa com 2 pessoas e um roteiro de 1 página. Sem isso, o dever de cuidado sistêmico falha no primeiro caso.
- **Domínio próprio com dois titulares.** O link público vira patrimônio. Hoje ele depende do usuário GitHub do mantenedor.
- **Pedir ajuda de segurança grátis.** Programas de auditoria para software de liberdade na internet (o OTF tem um Red Team Lab) e voluntários de segurança. A revisão de cripto é o item mais caro de fazer sozinho.
- **Editais com prazo real.** NLnet Restack em 03/01/2027: dá para submeter durante a Fase 0 com este backlog como plano de trabalho.
- **Cortar escopo antes de abrir.** Webxdc, Bridge MV3, selo gov.br (ADR-018), Lightning e Notas por ponte **ficam fora do lançamento** (§6).

## 3. Fases e portões

| Fase | Quem entra | Duração indicativa | Portão de entrada |
|---|---|---|---|
| **F0 Fundamentos** | só o time | nov/2026 → jan/2027 | — |
| **F1 Piloto fechado** | 1 círculo real, 10–30 pessoas ([go/no-go](../pilot/piloto-comunidade-go-no-go.md)) | 4 semanas | **G1** |
| **F2 Beta por convite** | 5–10 comunidades, até ~300 pessoas, convite por QR/link | 8–12 semanas | **G2** |
| **F3 Público** | qualquer pessoa com o link; anúncio | contínuo | **G3** |

As datas dependem de gente (parecer, piloto, stewards), não de código. **O caminho crítico é o REV-12 (parecer)**, então ele começa já.

### G1 — pode começar o piloto fechado

O grupo é pequeno e conhecido, e o risco é baixo. Exige o mínimo de honestidade e segurança:

- REV-13 (aviso Pix) · LAN-10 (demo isolada) · LAN-11 (aviso de permanência) · LAN-17 (divulgação de vulnerabilidades funcionando)
- REV-19 + REV-01 **ou** REV-09: pelo menos **um segundo caminho** de sinalização
- NET-01 (espelho B) ou waiver documentado · PIL-01 · carta E2 · freeze (já existe)
- LAN-01 iniciado (parecer contratado, mesmo que não entregue) · LAN-30 parcial (2ª pessoa com acesso ao GitHub e ao Render)

### G2 — pode abrir beta por convite

Entram estranhos de comunidades parceiras. O jurídico e a resposta a abuso passam a ser obrigatórios:

- **Piloto aprovado:** PIL-02, PIL-03, PIL-04, PIL-05 · LAN-28 (métricas de go)
- **Jurídico:** REV-12 entregue · LAN-02 (Termos) · LAN-03 (privacidade e COMPLIANCE atualizados) · REV-20 (autorregulação) · LAN-04 (conteúdo grave + plantão) · REV-23 (idade)
- **Moderação:** LAN-12 (denúncia no app) · LAN-13 (ocultação do PWA oficial)
- **Infra:** REV-09 (Nostr) · REV-10 (TURN) · NET-02 (drill) · REV-21 (banda) · LAN-07 (status) · LAN-08 (kill-switch)
- **Segurança:** LAN-15 (modelo de ameaças) · LAN-16 (CSP e headers) · REV-14 (chave no iOS)
- **Produto:** REV-11 (efêmero por padrão + medidor de cota) · LAN-21 (estados de erro honestos) · LAN-24 (incidentes)

### G3 — pode abrir ao público

Qualquer pessoa, inclusive atacantes. Exige escala, revisão externa e sustento:

- **Beta aprovado:** LAN-29 (relatório do beta com métricas de pausa nunca disparadas, ou resolvidas)
- **Institucional:** REV-18 (PJ executada ou dispensada pelo parecer) · LAN-30 completo (bus factor ≥2 em tudo) · LAN-31 (governança do PWA oficial) · LAN-32 (orçamento de 12 meses coberto) · LAN-06 (domínio) · LAN-05 (busca de marca)
- **Segurança:** LAN-18 (revisão externa de cripto) · LAN-19 (privacidade de IP) · LAN-20 (supply chain)
- **Escala e abuso:** LAN-09 (teste de carga) · LAN-14 (anti-spam e limite de taxa) · LAN-27 (leitura resiliente)
- **Acesso:** LAN-22 (acessibilidade) · LAN-23 (desempenho) · LAN-25 (onboarding com leigos)
- **Operação:** LAN-26 (suporte) · LAN-33 (release v1.0) · LAN-34 (plano de lançamento em ondas) · DOC-04 (copy honesta) · REV-02 (11 módulos decididos) · REV-04 **ou** LAN-21 (DM offline honesta)
- **Comunicação:** LAN-35 (página de apresentação e kit de imprensa)

## 4. Backlog por épico

Esforço: **P** ≤1 dia · **M** ≤1 semana · **G** >1 semana. "Resp." é o papel, porque nomes reais só entram no ROADMAP quando houver pessoa. Os IDs existentes (REV, NET, PIL…) não são repetidos aqui: estão no ROADMAP e aparecem nos portões.

### A. Jurídico e institucional

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-01 | **Contratar o parecer do REV-12.** Sondar clínicas jurídicas universitárias e organizações de direitos digitais (pro bono ou com edital) e enviar o pacote de perguntas da [pesquisa complementar §1-B](../research/pesquisa-complementar-2026-11.md) | ops-humano | Profissional ou entidade nomeado, escopo e prazo acordados, citados no ROADMAP | — | M | mantenedor | G1 |
| LAN-02 | **Termos de Uso** (`client/terms.html`) com aceite no onboarding junto do Pacto Vox: o que é permanente, regras, denúncia, idade, sem custódia, foro | doc+code | Página no ar, link no onboarding e no rodapé, texto revisado pelo parecer | REV-12 | M | mantenedor + jurídico | G2 |
| LAN-03 | **Atualizar `privacy.html`, `data-deletion.html` e COMPLIANCE-BR** com STF itens 5–11, Decretos 12.975/12.976, ECA Digital, Res. TSE 23.755, Pix/DICT, IP na malha. Tirar a afirmação "não é plataforma na Fase 1" até o parecer decidir | doc | Textos atualizados e com fonte; banner de data | REV-12 | M | revisor | G2 |
| LAN-04 | **Procedimento de conteúdo grave:** roteiro de 1 página (abuso infantil, terrorismo, tráfico, violência contra a mulher, íntimo não consentido em ≤2 h). Ocultar no PWA oficial, preservar evidência mínima, encaminhar às autoridades e ao canal de denúncia oficial (SaferNet e outros), plantão em rodízio | doc+ops-humano | Roteiro publicado, 2 pessoas no plantão, simulado datado | LAN-12, LAN-13 | M | mantenedor + moderação | G2 |
| LAN-05 | **Busca de anterioridade da marca "Vox"** no INPI (e risco de confusão) antes do anúncio | ops-humano | Resultado da busca citado; decisão de nome mantida ou trocada | — | P | mantenedor | G3 |

Já no ROADMAP: REV-12 (parecer), REV-18 (associação/PJ), REV-20 (autorregulação), REV-23 (idade), REV-24 (modo eleitoral; não bloqueia o lançamento, mas tem de estar pronto antes de ago/2028).

### B. Infra sem ponto único

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-06 | **Domínio próprio** (`.org.br` ou similar) com **dois titulares** ou titular PJ, renovação automática, DNS documentado; Pages e CF Pages atrás dele | ops-humano | Domínio resolvendo, titulares e data de expiração em INFRA-CUSTOS | REV-18 (titular) | P | mantenedor | G3 |
| LAN-07 | **Página de status pública** gerada por workflow (nós de sinalização, relays Nostr, gateways), publicada no Pages | code | `status.html` no ar, atualizado a cada execução, histórico de 30 dias | REV-19 | M | infra | G2 |
| LAN-08 | **Kill-switch por configuração:** `client/config/flags.json` desliga upload, Feira, Pix Zaps e convites; o cliente obedece em ≤1 recarga | code | Teste em `tests/`; procedimento no runbook de incidente | — | M | dev | G2 |
| LAN-27 | **Leitura resiliente:** rotacionar ≥4 gateways (arweave.net, turbo-gateway e gateways AR.IO da rede), tratar o 402 do `turbo-gateway` (5 GB por visitante) como "trocar de gateway", nunca como erro do usuário | code | Testes de `graphql`/`multi-gateway` cobrindo o 402 e a rotação | — | M | dev | G3 |
| LAN-09 | **Teste de carga** da sinalização (Render, DO, Nostr) com ≥500 pares simulados e da malha com 50 pares reais em dispositivo; números de capacidade em INFRA-CUSTOS | code+doc | Script em `tools/`, relatório com limites e gargalos | REV-09, REV-01 | G | infra | G3 |

Já no ROADMAP: REV-19 → REV-09 (Nostr), REV-01 (2º nó), REV-10 (TURN com orçamento), REV-21 (banda do Render), NET-01 (espelho B), NET-02 (drill de DR), NET-04 (steward que não seja o mantenedor), REV-04 (relay completo público).

### C. Produto honesto

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-10 | **Demonstração isolada:** `mock.js` só em `#/demo` (faixa fixa "demonstração"); falha de rede mostra "sem conexão", e não perfis ou propostas fictícios; os 27 perfis por UF saem do caminho real | code | Teste garante que nenhuma rota real importa `mock.js` sem flag de demo; FEATURES atualizado | — | M | dev | G1 |
| LAN-11 | **Aviso de permanência** antes do 1º post que vai para o Arweave (o que é permanente, quem vê, que não dá para apagar), com "não mostrar de novo" | code | Teste de UI; texto alinhado aos Termos | REV-11 | P | dev + UX | G1 |
| LAN-21 | **Estados de erro honestos:** sinalização caída, cota do Turbo esgotada (B12), gateway pedindo pagamento (402), DM sem relay ("entrega quando os dois estiverem online") | code | Cada estado com texto e teste; nada "carrega para sempre" | REV-11 | M | dev | G2 |

Já no ROADMAP: DOC-04 (copy honesta), REV-02 (plugar ou arquivar os 11 módulos), REV-05 (Voxpedia), REV-11 (efêmero por padrão), REV-13 (aviso Pix).

### D. Moderação e confiança

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-12 | **Denunciar no app** (post, perfil, comunidade ⋯ → motivo): vai assinado para os moderadores da comunidade; categorias graves também vão para o canal do projeto (LAN-04) | code | Fluxo em etapas, teste, aparece na fila de moderação | — | M | dev | G2 |
| LAN-13 | **Lista de ocultação assinada do PWA oficial** (global, com motivo e data) que o cliente respeita, exportável no formato dos gateways AR.IO (B5) | code | Lista versionada, verificação de assinatura, teste; procedimento no LAN-04 | REV-12 | M | dev | G2 |
| LAN-14 | **Anti-spam e limite de taxa:** teto de posts e gossip por chave e por janela, PoW leve opcional para chave nova, quarentena de chave nova em comunidades que pedirem | code | Testes; parâmetros documentados; sem ranking pago | — | M | dev | G3 |

Já no ROADMAP: PIL-05 (ciclo E1–E5), F8 (selo por aval, **obrigatório antes de enquete cívica pública com peso**), REV-20.

### E. Segurança e privacidade

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-15 | **Modelo de ameaças** (`docs/THREAT-MODEL.md`): atacantes (stalker, fazenda de contas, Estado, troll), ativos (chave, DM, IP, grafo social, cofre), mitigações e riscos aceitos | doc | Revisado por 1 pessoa de segurança fora do time | — | M | revisor | G2 |
| LAN-16 | **CSP e headers:** `_headers` no CF Pages e `<meta http-equiv>` no GitHub Pages (CSP, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`); inventário de origens externas | code | Sem violação no console nas rotas principais; teste que lê a CSP | — | M | dev | G2 |
| LAN-17 | **Divulgação de vulnerabilidades funcionando:** GitHub Private Vulnerability Reporting ligado, contato do SECURITY.md testado, prazo de resposta escrito | ops-humano | Relato de teste recebido e respondido | — | P | mantenedor | G1 |
| LAN-18 | **Revisão externa de cripto** (DM ECDH/AES-GCM, cofre ZK, assinatura de posts e votos), via programa de auditoria para software livre ou voluntário qualificado | ops-humano | Relatório recebido; achados críticos corrigidos | LAN-15 | G | mantenedor | G3 |
| LAN-19 | **Privacidade de IP:** aviso claro de que pares WebRTC veem o IP; modo "só TURN" (REV-10) ligável no perfil; padrão ligado para menores (REV-23) | code | Teste; texto em privacidade e Voxpedia | REV-10 | M | dev | G3 |
| LAN-20 | **Cadeia de suprimentos:** inventário de dependências vendorizadas e de CDN com versão e hash (SRI), `npm audit` no CI das ferramentas, rotina mensal | code | Lista em `docs/`, job no CI | LAN-16 | P | dev | G3 |

Já no ROADMAP: REV-14 (chave no iOS), REV-13.

### F. Acesso e experiência

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-22 | **Acessibilidade WCAG 2.2 AA básica:** leitor de tela (TalkBack, VoiceOver) nas 10 rotas principais, contraste, foco por teclado, alvo de toque ≥24 px | code | Relatório de auditoria + correções; checagem automática no CI | — | G | UX + dev | G3 |
| LAN-23 | **Desempenho em Android de entrada** (2 GB RAM, 3G): orçamento de tempo até a primeira tela e de bytes do shell; medição registrada por release | code | Números no CHANGELOG da v1.0; regressão quebra o CI | — | M | dev | G3 |
| LAN-25 | **Onboarding com 5 leigos** (de fora da bolha técnica): criar identidade, fazer backup, postar, entrar numa comunidade, recuperar a conta em outro aparelho | ops-humano | Notas das sessões; top 5 problemas corrigidos | LAN-11, REV-14 | M | UX | G3 |

### G. Piloto e evidência

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-28 | **Critério de go para o beta,** escrito antes do piloto: retenção na semana 4, ≥1 steward que não seja o mantenedor, 0 incidente grave sem resposta em 24 h, taxa de conexão P2P, cota do Turbo por pessoa | doc | Critérios no go/no-go; medição via CODE-02 (métricas locais, sem telemetria central) | CODE-02 | P | revisor | G2 |
| LAN-29 | **Relatório do beta:** métricas do LAN-28 em 5–10 comunidades, incidentes, custo real, decisão de go público | doc | Relatório datado no repo | G2 | M | revisor | G3 |

Já no ROADMAP: PIL-01 a PIL-05, CODE-02.

### H. Sustento e governança

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-30 | **Bus factor ≥2:** 2ª pessoa com acesso de admin a GitHub (organização, não usuário pessoal), Render, Cloudflare, domínio e secrets; cofre de credenciais compartilhado; procedimento de saída | ops-humano | Lista de contas × titulares em INFRA-CUSTOS (sem segredos) | — | M | mantenedor | G1 (parcial), G3 (completo) |
| LAN-31 | **Governança do PWA oficial:** quem decide a lista de ocultação global, os Termos e os releases; mandato, rodízio e recurso. Atualizar o GOVERNANCE.md | doc | Texto aprovado pelos stewards; ligado ao REV-18 | REV-18 | M | mantenedor + stewards | G3 |
| LAN-32 | **Orçamento de 12 meses:** custo projetado para 1k e 10k usuários (TURN acima de 1.000 GB, crédito Turbo, domínio, PJ) e fonte de cobertura (Sponsors, edital, associação) | doc | Planilha/tabela em INFRA-CUSTOS; cobertura ≥12 meses confirmada | LAN-09, REV-22 | M | mantenedor | G3 |
| LAN-36 | **Proposta ao NLnet Restack** até **03/01/2027**, usando este backlog como plano de trabalho (marcos = portões) | ops-humano | Proposta submetida; número citado | — | M | mantenedor | — (financia F1–F2) |

Já no ROADMAP: REV-22 (Sponsors), REV-18, NET-04, REV-04.

### I. Operação e lançamento

| ID | Item | Tipo | DoD | Depende | Esf. | Resp. | Portão |
|---|---|---|---|---|---|---|---|
| LAN-24 | **Runbook de incidentes:** nó caiu, vazamento de chave, conteúdo grave (→ LAN-04), ordem judicial, banda estourada, ataque de spam; quem é chamado e qual flag desligar (LAN-08) | doc | Runbook publicado; 1 simulado datado | LAN-08 | M | infra | G2 |
| LAN-26 | **Suporte:** formulários de issue (bug, dúvida, denúncia de não usuário) + canal Zap/Telegram, triagem semanal, resposta-padrão | ops-humano | Formulários no ar; 2 pessoas na triagem | — | P | comunidade | G3 |
| LAN-33 | **Release v1.0:** versionamento semântico a partir do público, checklist de release (freeze, testes, bump do SW, CHANGELOG, rollback em [ops-pages-rollback](../operations/ops-pages-rollback.md)) | doc+code | Tag `v1.0.0` com notas; rollback ensaiado | G3 menos ele | P | dev | G3 |
| LAN-34 | **Plano de lançamento em ondas** com critérios de pausa (fechar convites, desligar upload) e quem decide | doc | Plano no repo antes do anúncio | LAN-08, LAN-24 | P | mantenedor | G3 |
| LAN-35 | **Página de apresentação e kit de imprensa:** o que é e o que **não** é (sem custódia, permanente, P2P), FAQ, capturas, contato | doc+code | Página no ar; revisada contra o DOC-04 | DOC-04 | M | comunicação | G3 |

## 5. Ordem de execução (caminho crítico primeiro)

**Semana 1–2 (F0), em paralelo:**

- **Humano:** LAN-01 (parecer), LAN-30 parcial, LAN-17, REV-22 (Sponsors), REV-21 (anotar a banda), PIL-01 (achar o círculo).
- **Código:** LAN-10 (demo isolada), REV-13 (aviso Pix), REV-19 (teste de fumaça Nostr), LAN-08 (kill-switch).

**Semana 3–8 (F0):**

- **Código:** REV-09 (Nostr) ou REV-01 (2º nó); LAN-11 e REV-11 (permanência e efêmero); LAN-12 (denunciar); LAN-16 (CSP); REV-14 (iOS).
- **Doc:** LAN-15 (modelo de ameaças); LAN-28 (critério de go); LAN-36 (NLnet até 03/01/2027).
- **Humano:** NET-01 (espelho B).
- → **G1, piloto.**

**Durante o piloto (F1):** REV-12 chega → LAN-02, LAN-03, REV-20, LAN-04, LAN-13, REV-23. Em seguida REV-10, NET-02, LAN-07, LAN-21, LAN-24. → **G2, beta.**

**Durante o beta (F2):**

- **Humano:** REV-18 (PJ), LAN-18 (revisão de cripto), LAN-25 (leigos), LAN-30 completo, LAN-31, LAN-32, LAN-05, LAN-06.
- **Código:** LAN-09 (carga), LAN-14 (anti-spam), LAN-19, LAN-20, LAN-22, LAN-23, REV-02.
- **Doc:** DOC-04.
- → LAN-29 → **G3, público**, com LAN-33/34/35.

**Lotes paralelos sem conflito de arquivo** ([mutex](../process/metodo-agentes-mutex-e-revisor.md)): LAN-10 (`mock.js` + rotas) · LAN-08 (`config/` + leitor de flags) · LAN-12/13 (`moderation.js` + nova tela) · LAN-16 (`_headers` + `index.html`) · REV-19 (workflow novo) não se tocam.

## 6. Fora do lançamento (cortar escopo de propósito)

Webxdc e cartuchos · Vox Bridge MV3 · selo gov.br ([ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md)) · Notas da Comunidade por ponte (F7) · Lightning · mídia >105 KiB no Arweave (F5 fica na malha) · nó dedicado Vox Populi como requisito · app nas lojas. Nada disso é necessário para os 10 critérios da §2. Todos voltam depois do G3.

## 7. Riscos que matam o lançamento

| Risco | Sinal | Resposta |
|---|---|---|
| Parecer conclui que o Vox é provedor e precisa de PJ e representante | REV-12 | REV-18 vira bloqueador do G2, não do G3; beta só com a associação aberta |
| Conteúdo grave aparece no piloto ou no beta sem plantão | LAN-04 sem gente | Não abrir o G2 sem 2 pessoas no plantão |
| Mantenedor some | LAN-30 | Não passar do G1 com bus factor 1 |
| Relays Nostr passam a exigir auth/PoW | REV-19 em queda | Manter Render + DO como caminho; pool configurável |
| Cota do Turbo esgota em provedores regionais | medidor do REV-11 | Efêmero por padrão; Credit Sharing do coletivo; x402 opcional |
| Ninguém de fora quer ser steward | NET-04 | O beta não começa sem 1 steward externo (LAN-28) |
| Spam ou fazenda de contas no público | LAN-14, F8 | Quarentena de chave nova; votos com peso só com aval |
