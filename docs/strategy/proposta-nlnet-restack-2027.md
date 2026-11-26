# Proposta ao NLnet NGI Zero / Restack (PM-42 / LAN-36): rascunho de trabalho

> **Status:** rascunho (revisão humana final obrigatória antes de submeter) · **Owner:** mantenedor (quem submete) · **Revisado:** 2026-11-26 · **Prazo:** 03/01/2027, 12:00 CET
> Não substitui o [ROADMAP](../ROADMAP.md). Este documento reúne fatos verificados do repositório, riscos eliminatórios, um recorte técnico honesto e rascunhos em inglês dentro dos limites do formulário. **Atualização de 26/11:** entram o Subversus com o Fairplay ([ADR-040](../adr/040-fairplay-rolagem-verificavel-na-mesa.md)), a mesa pela rede (laboratório) e a linha de release `v7.174` ([release-metadata.json](../release-metadata.json)); o estado do `vox-node` passa a refletir o que já está em `main`. O que depende do mantenedor está na [§7 Pendências](#7-pendências-perguntas-ao-mantenedor). **Cold Readiness preservada:** nenhuma submissão externa é feita por agentes; a versão enviada deve ser revisada e reescrita pelo mantenedor.

---

## 1. Critérios eliminatórios e transparência (ler antes de preencher)

Fontes consultadas: [formulário de submissão](https://nlnet.nl/propose/), [chamada Restack](https://nlnet.nl/restack/), [política de IA generativa v1.1](https://nlnet.nl/foundation/policies/generativeAI/) e [perguntas frequentes do NLnet](https://nlnet.nl/officehour).

### 1.1 Dimensão europeia (critério eliminatório)

> **Pergunta pendente e eliminatória:** um proponente individual no Brasil, com este recorte de bens públicos digitais abertos, é elegível no Restack? Sem essa resposta (e sem decisão sobre co-proponente na UE), nada abaixo deve ser enviado. Perguntas explícitas ao mantenedor: [§7, P1 e P2](#7-pendências-perguntas-ao-mantenedor).

Os fundos NGI Zero / Restack são financiados pelo Horizon Europe. Propostas sem **dimensão europeia clara** são descartadas antes da avaliação técnica. Uma candidatura individual sediada no Brasil focada apenas em comunidades brasileiras corre risco alto de eliminação sumária.

Como estruturar a dimensão europeia de forma concreta e verdadeira:

1. **Bens públicos digitais abertos sob padrões abertos:** o que pedimos financiamento para entregar não é uma rede social regional fechada, mas componentes reutilizáveis sob licença livre (`AGPL-3.0-or-later`) baseados em padrões abertos (WebRTC, WebCrypto, PWA offline-first, Nostr NIP-01 e binário Rust auto-hospedável).
2. **Utilidade direta para grupos cívicos e cooperativas na UE:** associações de bairro, cooperativas habitacionais, coletivos culturais e grupos estudantis europeus enfrentam o mesmo problema — depender de plataformas comerciais ou pagar e manter servidores próprios — além de exigências práticas de minimização de dados alinhadas ao GDPR (dados ficam nos dispositivos dos membros, sem servidor central coletando perfis).
3. **Interoperabilidade e documentação em inglês:** as especificações de protocolo, a biblioteca JS de malha P2P e o nó Rust `vox-node` serão publicados em inglês, com interface internacionalizada pronta para idiomas europeus e guias de auto-hospedagem sem dependência de infraestrutura controlada pelo autor.
4. **Ações humanas recomendadas em paralelo:**
   - **Perguntar ao NLnet por e-mail antes de investir semanas no formulário** se um proponente individual no Brasil, com esse recorte de bens públicos digitais abertos, é elegível no Restack.
   - **Buscar co-proponente real na UE** (pessoa física ou organização europeia que assuma parte real da implementação, testes de interoperabilidade ou tradução/empacotamento). Nunca inventar parceria fictícia.

### 1.2 Declaração explícita de uso de IA (política NLnet)

A política do NLnet exige transparência total sobre o uso de IA generativa. Omitir esse uso pode causar rejeição ou cancelamento da bolsa.

- **Na escrita da proposta:** marque **"Yes"** no campo de uso de IA. Este rascunho foi estruturado e revisado com assistência de LLMs a partir de arquivos reais do repositório. Antes da submissão, o mantenedor deve reescrever cada campo com suas próprias palavras, verificar cada afirmação e incluir um resumo honesto de como a IA foi usada (organização de fatos, revisão de clareza em inglês e verificação de limites de caracteres).
- **Na base de código do Vox:** marque **"Yes"** também no campo relativo ao código. O repositório usa assistentes de IA de forma contínua — em 2026-11-26, `1.121` dos `2.404` commits de `origin/develop` registram o trailer `Co-Authored-By:` (além de sessões auxiliares sem trailer). Explique objetivamente como a integridade do código é garantida por controle humano e automação:
  - Revisão por PR contra `develop` e `main` protegidos;
  - CI bloqueante com lint JS/Python, auditoria de documentação e suíte automatizada JS + Python (contagem canônica em [release-metadata.json](../release-metadata.json));
  - Limites estritos de complexidade medidos por AST ([HARDENING.md](../HARDENING.md));
  - Modelo de ameaças ([THREAT-MODEL.md](../THREAT-MODEL.md)) e inventário de dependências ([DEPENDENCIAS.md](../DEPENDENCIAS.md)) mantidos no próprio repositório.

### 1.3 Limites de escopo (o que entra e o que fica fora)

- **Fora do escopo do Restack e desta proposta:**
  - Não é projeto de IA, token, cripto-ativo ou blockchain como fim em si. O upload para Arweave está desligado por padrão desde 13/11/2026 (`arweaveUpload: false`; ver [INFRA-CUSTOS.md](../INFRA-CUSTOS.md)); quando citado, aparece apenas como camada de leitura/arquivamento opcional e desligada por padrão.
  - **Sem criptografia nova ou pós-quântica:** a proposta usa apenas primitivas padronizadas do navegador (WebCrypto) e formatos já documentados no repositório.
  - **Sem prometer auditoria criptográfica externa (`LAN-18`), WebAssembly (WASM) no cliente ou piloto público aberto:** o cliente cidadão permanece em JavaScript vanilla sem etapa de build e sem WASM; governança de piloto público segue trilha própria sob Cold Readiness, fora dos compromissos desta bolsa.

---

## 2. Estado real do repositório vs. o que a bolsa financiaria

Para manter a proposta verificável por qualquer avaliador técnico do NLnet:

| Camada | O que já existe hoje no repositório | O que a bolsa financiaria |
|---|---|---|
| **Cliente PWA** | App estático em JavaScript vanilla sem build step (`client/`), offline-first com Service Worker + IndexedDB, malha WebRTC e sinalização dupla (WebSocket + Nostr efêmero `kind 25050`). | Extração da malha WebRTC/gossip/sinalização em biblioteca reutilizável, sinalização multi-relay com failover medido, chaves WebCrypto `extractable: false` com backup cifrado e i18n (inglês + base para outros idiomas europeus). |
| **Núcleo Rust (`rust/vox-core`)** | Crate já implementado e testado (`#![no_std]`, `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]`, zero dependências externas) com `genesis_data`, `genesis_guard`, `shamir_gf256`, `sig_format`, `vault_v2`, `dm_envelope_v1` e `community_manifest_v1`. | Reutilização direta de `vox-core` como dependência do novo daemon `vox-node`. |
| **Nó/Relay (`rust/vox-node`)** | O relay de produção ainda é Python (`relay/signaling.py` e `relay/server.py`, com gargalos de concorrência medidos no `LAN-09`). O binário Rust `rust/vox-node` já existe em `main` (ADR-039 Fase 4, `PR4.1a`–`PR4.4`): sinalização WebSocket, paridade HTTP do relay, modo memória, fachada loopback, `cdylib` C-ABI e fallback JNI Android ([blueprint](../specs/vox-node-rust-fase4.md)). Falta o empacotamento NDK/`.so` cross-compilado em CI e a validação em campo. | Fechar o `vox-node`: paridade caixa-preta completa contra a suíte de contrato Python, benchmark de 500 pares, empacotamento reproduzível por plataforma e validação em campo por cooperativas. |
| **Aplicação de referência (Subversus)** | Mesa de RPG local-first sobre a mesma malha: rolagem verificável em três fases com o Mestre como hub que não pode forjar ([ADR-040](../adr/040-fairplay-rolagem-verificavel-na-mesa.md), aceito em 25/11), mesa entre aparelhos pela rede atrás de flag de laboratório desligada por padrão ([mesa-rede-v0](../specs/mesa-rede-v0.md)) e linha de release `v7.174`. | Nada é financiado aqui: serve de caso de uso real para exercitar a biblioteca de malha (M1) e os vetores de teste de gossip, sem compromisso de entrega no escopo da bolsa. |
| **Infraestrutura e custos** | Custo atual de R$ 0/mês apoiado em free tiers com cotas rígidas e um nó único de sinalização no Render ([INFRA-CUSTOS.md](../INFRA-CUSTOS.md)). | Remoção da dependência de servidor único via Nostr multi-relay + binário `vox-node` leve para auto-hospedagem comunitária, sem prometer "grátis para sempre". |

---

## 3. Rascunho dos campos do formulário (inglês, dentro dos limites)

Os textos abaixo servem como base factual verificada e respeitam os limites de caracteres do formulário NLnet. **O mantenedor deve reescrevê-los com voz própria antes de enviar.**

**Fund:** NGI Zero / Restack Fund  
**Proposal title:** Vox Local-First Stack: reusable browser P2P mesh and lightweight Rust node for community spaces  
**Website / repositories:** https://github.com/yurikayel/vox  
**License:** AGPL-3.0-or-later

### Abstract (máx. 1.000 caracteres)

> Vox is an AGPL-3.0 local-first PWA (plain JavaScript, no build step) that lets small groups run a shared community space directly from members' devices. Devices sync peer-to-peer over WebRTC with gossip, while discovery uses end-to-end encrypted ephemeral signalling over public Nostr relays, requiring no central server. The repository already includes the working PWA, a Python reference relay/signalling server, and a zero-dependency `#![no_std]` Rust core (`vox-core`). This grant turns that base into open digital public goods for European civic groups, cooperatives, and developers: (1) a standalone WebRTC mesh/signalling library with open specs; (2) multi-relay Nostr signalling removing the last single server; (3) a lightweight self-hostable Rust node (`vox-node`) on `vox-core`; (4) non-extractable WebCrypto keys with encrypted user backups; and (5) reproducible releases with English/European i18n.

### Budget breakdown (máx. 4.000 caracteres)

O valor/hora (€50/h) e o total de EUR 30,000 aguardam a decisão do mantenedor em [§7, P3](#7-pendências-perguntas-ao-mantenedor).

> We request EUR 30,000 for 600 hours of engineering and documentation at EUR 50/hour, paid strictly upon verifiable milestone delivery. No hardware, travel, or commercial hosting costs are requested.
>
> - M1 — Standalone P2P mesh library (120 h, EUR 6,000): extract the browser WebRTC mesh, gossip deduplication, and signalling adapter from `client/` into a standalone plain-JS module with a documented API, automated tests, and a minimal working example for third-party local-first apps.
> - M2 — Multi-relay serverless signalling (100 h, EUR 5,000): harden ephemeral Nostr signalling (kind 25050) across multiple public relays with automatic failover, connection success metrics on mobile/NAT networks, and clear UI degradation states, eliminating the single hosted Render signalling server as a hard dependency.
> - M3 — Open protocol specifications (60 h, EUR 3,000): publish complete, implementation-independent specs for message envelopes, gossip sync/retraction, community manifests, and encrypted WebRTC signalling, and submit a draft NIP for the ephemeral signalling format.
> - M4 — Unified Rust node `vox-node` (160 h, EUR 8,000): complete and release the `vox-node` binary, whose core (WebSocket signalling, HTTP relay parity, memory mode, C-ABI/JNI facade) is already implemented on top of `rust/vox-core`. Remaining work: validate 1-to-1 compatibility with the existing Python black-box contract test suite, pass the 500-peer load benchmark (0 connection drops, p95 <= 100 ms, RSS <= 25 MB), and ship reproducible cross-compiled packages so cooperatives can self-host on modest hardware.
> - M5 — Browser key hardening and encrypted backup (80 h, EUR 4,000): migrate local browser identity custody to standard non-extractable WebCrypto keys (`extractable: false`) with an encrypted, user-held backup format and tested migration path, using only standard browser cryptography.
> - M6 — Reproducible supply chain, i18n, and European adoption docs (80 h, EUR 4,000): produce reproducible release artefacts with hash-pinned CI/dependencies, deliver full English UI and i18n scaffolding ready for European languages, and publish self-hosting and data-minimization guides tailored to European associations and cooperatives.

### Comparison with existing efforts (máx. 4.000 caracteres)

> Federated platforms such as Mastodon and Lemmy return control to communities, but still require someone to rent, administer, and moderate a permanent server where user data resides. Matrix provides encrypted rooms, yet depends on running and federating homeservers. Nostr removes the central server operator, but clients primarily read from and write to relays rather than forming direct browser-to-browser community meshes. Secure Scuttlebutt pioneered offline-first gossip, but relies on native runtimes rather than a zero-install browser PWA.
>
> Vox occupies a distinct niche: a zero-build, browser-only local-first stack for small groups (roughly 10 to 500 people) that want direct WebRTC sync without operating a server by default, plus an optional tiny Rust node (`vox-node`) when a cooperative chooses to add an always-on local memory or signalling helper. Instead of inventing a closed network, we build on open standards: WebRTC, standard WebCrypto, PWA offline storage (IndexedDB), Nostr NIP-01 ephemeral events for encrypted rendezvous, and a `#![no_std]` Rust core (`vox-core`) for shared data formats. Permanent archiving layers are optional and disabled by default so the core stack stays independent of any blockchain or paid storage provider. The goal of this grant is not only to improve Vox itself, but to extract the mesh library, protocol specs, and Rust node so other European local-first tools can reuse them directly.

### Technical challenges (máx. 4.000 caracteres)

> 1. Reliable WebRTC signalling without a central server: public Nostr relays can throttle, go offline, or introduce auth/PoW rules. We need deterministic multi-relay failover, measurable connection-success telemetry in controlled tests, and honest UI feedback when restrictive mobile CGNAT prevents direct peer connections without a TURN relay.
> 2. Replacing a blocking Python signalling server with an async Rust node without breaking existing clients: our 500-peer loopback benchmark against `relay/signaling.py` exposed TCP backlog drops and synchronous O(N^2) presence fan-out stalls (p95 ~7.9–9.4 s). `rust/vox-node` must eliminate these stalls using bounded per-peer channels and non-blocking dispatch while maintaining strict 1-to-1 HTTP/WebSocket contract and on-disk storage parity verified against our existing Python black-box test suite.
> 3. Browser key custody without lockouts: moving stored keys to non-extractable WebCrypto handles (`extractable: false`) must be paired with an encrypted, user-controlled backup and restore flow and a safe migration path for existing local profiles, without introducing custom cryptographic primitives.
> 4. Interoperable gossip semantics: deduplication, retraction, tombstone ordering, and manifest validation must be specified unambiguously and backed by cross-language test vectors between the JavaScript client and `rust/vox-core`.
> 5. Verifiable shared state without a trusted server: a tabletop session runs as a star with the host as hub, yet dice rolls must be verifiable by every player and must not be forgeable by the host. The accepted design (ADR-040) uses staged commitments, a log-based closing step and a host veto, built on the commit-reveal primitives already in the repository. The same pattern must hold when the session crosses devices over the mesh, with the host proving key possession on channel open.
> 6. Zero-build supply chain integrity: keeping the browser client free of heavy bundlers requires strict vendoring, hash pinning, reproducible release artefacts, and automated CI checks (`cargo deny`, `cargo audit`, AST complexity limits).

### Ecosystem and engagement (máx. 2.000 caracteres)

> Core dependencies are open standards and browser APIs (WebRTC, WebCrypto, IndexedDB, Service Workers), public Nostr relays (interchangeable pool, no single operator), and a minimal Rust crate tree (`vox-core` has zero external dependencies; `vox-node` uses pure-Rust TLS without OpenSSL C).
>
> Target users in Europe include neighbourhood associations, housing and worker cooperatives, student unions, and local civic initiatives that need private, low-maintenance digital spaces aligned with GDPR data-minimization principles (data stays on members' devices; no central tracking server).
>
> Engagement and reuse plan: publish all specs and the draft signalling NIP openly; release the JS mesh library and `vox-node` binaries with reproducible checksums under AGPL-3.0-or-later; ship English and Portuguese interfaces with clean i18n tables so European communities can contribute translations; and document clear self-hosting steps for modest Linux/VPS or local hardware.

### Background (máx. 2.000 caracteres — preencher pelo mantenedor)

Fatos objetivos do repositório que o mantenedor pode incluir ao redigir sua trajetória pessoal e a justificativa de dimensão europeia (§1.1):

- Projeto iniciado em 22/10/2026, sob licença `AGPL-3.0-or-later`, desenvolvido de forma aberta em `https://github.com/yurikayel/vox`.
- Engenharia orientada a evidência: CI bloqueante com lint, limites de complexidade por AST ([HARDENING.md](../HARDENING.md)), suíte automatizada JS + Python (ver [release-metadata.json](../release-metadata.json)), crate `rust/vox-core` com `#![forbid(unsafe_code)]` e zero dependências, modelo de ameaças ([THREAT-MODEL.md](../THREAT-MODEL.md)) e mapa operacional de custos ([INFRA-CUSTOS.md](../INFRA-CUSTOS.md)).
- **Espaço reservado ao mantenedor:** experiência técnica real, motivação pessoal e o co-proponente ou parceiro na UE, se houver ([§7, P4](#7-pendências-perguntas-ao-mantenedor)).

### Other funding sources (máx. 1.000 caracteres — declaração do mantenedor, [§7, P5](#7-pendências-perguntas-ao-mantenedor))

> None so far. Development has been self-funded with zero recurring hosting costs (relying on documented free tiers and local volunteer hardware). No overlapping grants have been awarded for these milestones.

### AI usage disclosure (texto pronto para adaptar no campo do formulário)

> Yes, generative AI tools were used both during codebase development and while structuring this proposal draft. In the repository, AI-assisted commits are tracked (including `Co-Authored-By` trailers where applicable) and every change passes human review, blocking CI, automated JS/Python/Rust tests, and strict AST complexity/security checks. For this application, LLMs were used to organize technical facts from repository documents and check English clarity against character limits; the final submitted text was reviewed, edited, and verified by the human applicant.

---

## 4. Tabela consolidada de marcos (rascunho)

| Marco | Entrega verificável | Horas | Referência interna |
|---|---|---|---|
| **M1** Biblioteca de malha P2P | Módulo JS vanilla independente (WebRTC + gossip + sinalização), API documentada, testes e exemplo mínimo | 120 h | `client/` (NET-01) |
| **M2** Sinalização multi-relay | Failover Nostr `kind 25050`, medição de conectividade e degradação honesta na UI (Render deixa de ser obrigatório) | 100 h | NET-01, REV-09 |
| **M3** Especificação aberta | Specs de envelopes, gossip, retração, manifestos e rascunho de NIP de sinalização | 60 h | `docs/specs/` |
| **M4** Binário `rust/vox-node` | Núcleo já em `main`; entrega da bolsa: paridade caixa-preta completa com a suíte Python, meta `LAN-09` (500 pares, p95 ≤ 100 ms, ≤ 25 MB RSS) e pacotes cross-compilados reproduzíveis | 160 h | ADR-039-F4 (`PR4.1a`–`PR4.4` em `main`; falta NDK/`.so` e campo), [vox-node-rust-fase4.md](../specs/vox-node-rust-fase4.md) |
| **M5** Chaves não exportáveis | WebCrypto `extractable: false`, backup cifrado sob controle do usuário e migração testada (sem cripto customizada) | 80 h | PM-12 |
| **M6** Cadeia de suprimentos e i18n UE | Releases reproduzíveis com hashes fixados, interface em inglês + base i18n europeia e guia de auto-hospedagem | 80 h | PM-01, PM-14, LAN-20 |
| **Total** | **6 marcos verificáveis** | **600 h** | **€30.000 (€50/h de referência)** |

---

## 5. Checklist de envio até 03/01/2027 (Cold Readiness — 100% humano)

> **Regra de segurança operacional:** nenhum agente pode enviar e-mails, solicitar tokens ou submeter formulários externos. Todos os passos abaixo são `ops-humano` e exigem revisão humana final obrigatória.

| # | Tipo | Passo obrigatório | Prazo alvo | Status |
|---|---|---|---|---|
| 1 | `ops-humano` | Enviar e-mail prévio ao NLnet confirmando elegibilidade (proponente no Brasil + recorte de bens públicos digitais europeus, §1.1) | 2026-12-05 | [ ] |
| 2 | `ops-humano` | Definir participação de co-proponente real na UE (ou ajustar estratégia conforme resposta do passo 1) | 2026-12-15 | [ ] |
| 3 | `ops-humano` | Solicitar token de submissão em `token-request@nlnet.nl` | 2026-12-20 | [ ] |
| 4 | `ops-humano` | Confirmar valor/hora, total em euros e declaração de outras fontes de financiamento (§3 e §4) | 2026-12-26 | [ ] |
| 5 | `ops-humano` | **Revisão humana final obrigatória:** reescrever os campos em inglês em voz própria, preencher `Background` e respeitar os limites de caracteres | 2026-12-30 | [ ] |
| 6 | `ops-humano` | Preencher declaração explícita de uso de IA (proposta + código) com resumo fiel (§1.2) | 2026-12-30 | [ ] |
| 7 | `ops-humano` | Submeter no portal NLnet até **02/01/2027** (margem de 24 h antes do corte de **03/01/2027, 12:00 CET**) e registrar o protocolo na linha `LAN-36` do [ROADMAP](../ROADMAP.md) | 2027-01-02 | [ ] |

---

## 6. Pós-submissão e trilhas relacionadas

- Registrar data de envio e número de protocolo na linha `LAN-36` do [ROADMAP](../ROADMAP.md) (somente após envio humano real).
- Caso aprovada, os marcos da §4 servem de base para o plano de trabalho e pagamentos por entrega verificada.
- **Governança e contingência:** acompanhar custos e métricas no [Relatório Trimestral "Estado da Praça" (PM-103)](./relatorio-trimestral-estado-praca-pm103.md); em caso de recusa ou inelegibilidade, acionar a [Matriz de Editais Brasileiros (PM-108)](./editais-brasileiros-pm108.md); para planejamento operacional de longo prazo, consultar [Preparo Eleitoral 2028 (PM-109)](../operations/preparo-eleitoral-2028-pm109.md).

---

## 7. Pendências (perguntas ao mantenedor)

Nada abaixo é decidido por agente. Cada item precisa de resposta antes do envio real (03/01/2027, 12:00 CET).

1. **P1 · Dimensão europeia (eliminatória):** enviar ao NLnet a pergunta de elegibilidade de proponente individual no Brasil? O texto e o prazo (05/12) estão no passo 1 da §5.
2. **P2 · Co-proponente na UE:** existe pessoa ou organização europeia que assuma parte real do trabalho (implementação, interoperabilidade ou tradução/empacotamento)? Se não houver, a proposta segue só com o recorte de bens públicos abertos, conforme a resposta de P1.
3. **P3 · Valor e distribuição das horas:** manter EUR 50/h, 600 h e EUR 30,000? Como o núcleo do `vox-node` já está em `main`, as 160 h de M4 podem ficar como estão (validação, benchmark e empacotamento) ou parte delas passar para M1 ou M3. Qual opção?
4. **P4 · Background pessoal:** o mantenedor redige a trajetória e a motivação no campo `Background`.
5. **P5 · Outras fontes de financiamento:** confirma a declaração "None so far" ou há apoio a declarar?
6. **P6 · Subversus na proposta:** manter como caso de uso de referência sem compromisso de entrega (como na §2) ou retirar do texto enviado?
