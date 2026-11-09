# Proposta ao NLnet Restack (PM-42 / LAN-36): rascunho de trabalho

> **Status:** rascunho · **Owner:** mantenedor (quem submete) · **Revisado:** 2026-11-09 · **Prazo:** 03/01/2027, 12:00 CET
> Não substitui o [ROADMAP](../ROADMAP.md). Este documento junta os fatos, os riscos e um rascunho em inglês campo a campo. **A versão submetida precisa ser reescrita pelo mantenedor, com as próprias palavras** (ver §1.2).

## 1. Antes de escrever: três riscos que decidem a proposta

Fontes: [formulário](https://nlnet.nl/propose/) e [página do Restack](https://nlnet.nl/restack/) (consultados em 09/11/2026), [política de IA generativa v1.1](https://nlnet.nl/foundation/policies/generativeAI/) e [perguntas e respostas do NLnet](https://nlnet.nl/officehour).

### 1.1 Dimensão europeia: critério eliminatório (o maior risco)

O dinheiro do Restack vem do Horizon Europe. Todo projeto precisa de uma **dimensão europeia** e quem não tem é eliminado sem revisão. O formulário pede que candidatos de fora da UE e dos países associados expliquem isso no campo de experiência. O próprio NLnet sugere que a pessoa de fora participe de uma **equipe sediada na UE**. Um projeto feito por uma pessoa física no Brasil, para comunidades brasileiras, não passa assim.

O que dá para fazer, do mais forte para o mais fraco:

1. **Parceria com alguém na UE** (pessoa ou organização) que execute parte relevante do trabalho e seja co-proponente. É o caminho que o NLnet recomenda. Precisa de um nome real; não invente.
2. **Recortar a proposta nos componentes genéricos**, e não na rede cívica brasileira: a camada local-first de malha P2P, a sinalização cifrada sobre Nostr, o cliente ANS-104 no navegador, as chaves não exportáveis e a interface com i18n. Isso tudo serve a qualquer comunidade europeia e cabe no escopo do Restack ("local-first infrastructure", "services and their client-side counterparts", "software supply chain").
3. **Mandar um e-mail ao NLnet antes** perguntando se um proponente individual no Brasil, com o recorte do item 2, é elegível. É barato e evita gastar semanas numa proposta eliminatória.

**Recomendação:** fazer o item 3 já, com o recorte do item 2, e procurar o item 1 em paralelo.

### 1.2 Política de IA generativa

- Usar IA na proposta é permitido, mas **precisa ser declarado**, com os prompts e as saídas (ou um resumo). Não declarar pode levar à rejeição ou ao cancelamento da bolsa.
- O formulário também pede que as respostas sejam "in your own words" e que a proposta seja feita por humanos.
- **Este rascunho foi escrito com IA (Claude).** Use-o como roteiro e fonte de fatos, reescreva cada resposta e marque "Yes" no campo de IA, com um resumo do uso.
- **O código do Vox também foi escrito em grande parte com assistentes de IA** (69 dos 800 commits têm o trailer `Co-Authored-By: Claude`, e outras sessões usaram outras ferramentas sem trailer). Responda "Yes" no campo sobre a base de código e explique o controle de qualidade: CI bloqueante, limites de complexidade, revisão e testes ([HARDENING](../HARDENING.md), [qualidade-e-evidencia](../process/qualidade-e-evidencia.md)).

### 1.3 Escopo do Restack

- **Não entram:** projetos de IA e blockchain como fim em si.
- **O Arweave aparece como ferramenta, não como produto.** O texto deve tratá-lo como "camada de armazenamento permanente opcional" e destacar o que é padrão aberto: WebRTC, Nostr NIP-01 e ANS-104 documentado.
- Nada de token, de cripto-ativo nem de especulação.

## 2. Checklist de submissão (tudo humano)

| # | Passo | Status |
|---|---|---|
| 1 | E-mail ao NLnet sobre a elegibilidade (§1.1, item 3) | [ ] |
| 2 | Decidir sobre o parceiro europeu (§1.1, item 1) | [ ] |
| 3 | Pedir o token de submissão a `token-request@nlnet.nl` (o formulário exige) | [ ] |
| 4 | Fechar valor/hora e horas (§4) e conferir "outras fontes de financiamento" | [ ] |
| 5 | Reescrever as respostas em inglês, com as próprias palavras, dentro dos limites de caracteres | [ ] |
| 6 | Declarar o uso de IA (§1.2) | [ ] |
| 7 | Submeter até **02/01/2027** (um dia de folga) e anotar o número da proposta no ROADMAP (LAN-36) | [ ] |

## 3. Rascunho dos campos (inglês, com limites)

Os limites são os do formulário. O texto abaixo cabe neles (conferido por contagem de caracteres em 09/11/2026), mas a versão final é a reescrita do mantenedor.

**Fund:** Restack Fund

**Proposal title:** Vox Mesh: a local-first, serverless-by-default peer-to-peer stack for community social spaces in the browser

**Website / repositories:** https://github.com/yurikayel/vox

### Abstract (máx. 1.000)

> Vox is an AGPL web app (PWA, plain JavaScript, no build step) that lets small communities run their own social space from their members' devices. Identity is a local key pair; posts are signed and synced peer-to-peer over WebRTC with gossip; peer discovery uses end-to-end encrypted signalling over public Nostr relays, so no project-run server is required. This project turns the working prototype into reusable, documented components: (1) a standalone mesh-and-signalling library with a written protocol spec; (2) multi-relay signalling with failover and measured reliability, removing the last single server; (3) non-exportable keys and encrypted backup; (4) a reproducible, hash-pinned supply chain; (5) internationalisation so communities in Europe can use it. Expected results: libraries and specs any local-first app can reuse, and a hardened reference app.

### Budget breakdown (máx. 4.000)

Tarefas e horas na §4. O valor/hora depende do mantenedor.

> We request EUR 30,000 for 600 hours of development at EUR 50/hour, paid per milestone. No hardware or travel; infrastructure stays on free tiers and community devices. M1 Mesh library (140 h): extract WebRTC mesh, gossip and signalling into a standalone documented module with tests and a minimal example. M2 Serverless signalling (100 h): multi-relay Nostr signalling with failover; publish connection success metrics; remove the need for any project-run server. M3 Specification (60 h): write the message, gossip, retraction and signalling formats as a spec and submit a draft NIP. M4 Non-exportable keys (80 h): non-extractable WebCrypto keys, encrypted user-held backup, tested migration. M5 Audit readiness (40 h): BIP-340/secp256k1 test vectors and documentation for an external security review. M6 Supply chain (40 h): reproducible release artefacts, all CI actions pinned by hash. M7 Lighter shell and i18n (100 h): lazy-load rare screens (target -20% initial download) and an English UI. M8 Pilot and report (40 h): run with a real community and publish an honest report.

### Comparison with existing efforts (máx. 4.000)

> Fediverse servers (Mastodon, Lemmy) give communities control, but someone must run and pay for a server, and moderation and data sit with that operator. Nostr removes the server operator, but clients mostly talk to relays rather than to each other, and there is little support for small, closed community spaces. Secure Scuttlebutt pioneered offline-first gossip, but needs a native client and has lost momentum. Matrix offers rooms but relies on homeservers. Vox takes a different point in the design space: everything runs in the browser, devices of members sync directly over WebRTC, public Nostr relays are used only as an encrypted rendezvous for signalling (custom ephemeral event kind with ECDH and AES-GCM), and permanent public archiving is optional. We reuse open standards rather than inventing a network: WebRTC, Nostr event signing (BIP-340, implemented in plain JS), and the documented ANS-104 data item format. We considered building on an existing client, but none targets "no server at all, browser only" for small communities; the components we extract are meant to be adopted by others, and we will propose the signalling event format as a Nostr NIP.

### Technical challenges (máx. 4.000)

> 1. Reliable connectivity without a server: WebRTC needs signalling and often TURN. We must make discovery work through several public Nostr relays with retry and failover, measure success rates on real mobile networks, and degrade honestly (clear UI state) when peers cannot connect. 2. Key security in the browser: today the signing key can be exported from storage. We will move to non-extractable WebCrypto keys with an encrypted, user-held backup, and handle migration without locking existing users out. 3. Our own secp256k1/BIP-340 code needs to be made review-ready (test vectors, constant-time concerns documented) for an external audit. 4. Supply chain without a build step: third-party code is vendored and hash-pinned, checked by tests and a monthly job; we will extend this to reproducible release artefacts. 5. Shell size and offline behaviour on low-end Android phones: we keep a tested byte budget and will lazy-load rarely used screens. 6. Gossip consistency: deduplication, retraction and conflict rules must be specified and tested so other implementations can interoperate.

### Ecosystem and engagement (máx. 2.000)

> Dependencies: browser WebRTC and WebCrypto, public Nostr relays (no specific operator required), optional Arweave storage via a public bundler, and a small optional Python relay that any community member can self-host. Users: small self-organised groups (neighbourhood associations, cooperatives, student and civic groups) that cannot pay for or maintain a server. Engagement: the protocol and signalling format will be published as a spec and proposed as a Nostr NIP; libraries will be packaged for reuse; we will run a pilot with a real community and publish honest results; documentation and UI will be available in English and Portuguese, open to further translations.

### Background (máx. 2.000): **o mantenedor escreve**

Fatos do projeto que podem entrar: começou em 22/10/2026; 800 commits; CI com 5 checks obrigatórios; cerca de 950 testes automatizados (JS e Python); limites de complexidade bloqueantes; modelo de ameaças e inventário de dependências públicos. **A experiência pessoal e a dimensão europeia (§1.1) são do mantenedor.** Não preencha com suposições.

### Other funding sources (máx. 1.000): **conferir**

Rascunho, se for verdade: "None. The project has been developed without funding; infrastructure runs on free tiers. We plan to open GitHub Sponsors."

## 4. Orçamento e marcos (rascunho)

O valor/hora é **decisão do mantenedor**. O exemplo usa €50/h só como base de cálculo; o NLnet pede tarefas, horas e valor explícitos. Primeira bolsa: de €5.000 a €50.000.

| Marco | Entrega verificável | Horas | Itens do ROADMAP |
|---|---|---|---|
| M1 Biblioteca de malha | Módulo de malha + gossip + sinalização separado do app, com API documentada, testes e exemplo mínimo | 140 | parte de NET-01 |
| M2 Sinalização sem servidor único | Vários relays Nostr com failover, métricas de sucesso de conexão publicadas, Render deixa de ser obrigatório | 100 | NET-01, PM-19 |
| M3 Especificação | Formatos de mensagem, gossip, retração e sinalização escritos como spec; rascunho de NIP enviado | 60 | DOC |
| M4 Chaves não exportáveis | WebCrypto `extractable:false`, backup cifrado e migração testada | 80 | PM-12 |
| M5 Pronto para auditoria | Vetores de teste BIP-340/secp256k1, notas de tempo constante, pedido de auditoria externa | 40 | LAN-18 |
| M6 Cadeia de suprimentos | Artefatos de release reproduzíveis e Actions fixadas por SHA | 40 | PM-14, LAN-20 |
| M7 Shell leve e i18n | Telas raras sob demanda (meta de -20% do shell) e interface em inglês além do português | 100 | PM-01 |
| M8 Piloto e relatório | Piloto com uma comunidade real e relatório honesto de uso e falhas | 40 | PIL-01…05 |
| **Total** | | **600 h** | **€30.000 a €50/h** |

## 5. Depois de submeter

- Anotar a data e o número da proposta na linha LAN-36 do ROADMAP.
- O NLnet responde em semanas. Se aprovar, os marcos acima viram o plano de trabalho e os pagamentos saem por marco entregue.
