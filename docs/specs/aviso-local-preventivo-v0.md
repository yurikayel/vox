# Aviso local preventivo e ocultação em 1 toque — brainstorm (v0)

> **Status:** brainstorm (não substitui o [ROADMAP](../ROADMAP.md); sem código nem pesos de ML neste v0) · **Owner:** mantenedor / produto · **Revisado:** 2026-11-24
> **Relacionados:** [ROADMAP (PM-104, PM-69, PM-01, LAN-16, LAN-23)](../ROADMAP.md) · [Garantia da Praça (PM-104)](../product/garantia-da-praca-pm104.md) · [ADR-023 (moderação em camadas)](../adr/023-moderacao-em-camadas-e-moderador-natural.md) · [THREAT-MODEL.md](../THREAT-MODEL.md) · [`client/js/moderation.js`](../../client/js/moderation.js) · [`client/js/report-review.js`](../../client/js/report-review.js) · [`client/js/app/report-dm.js`](../../client/js/app/report-dm.js)

> [!NOTE]
> **Não substitui o [ROADMAP](../ROADMAP.md).** Este documento registra o desenho conceitual da candidata **F11** (alinhada à [Garantia da Praça — PM-104](../product/garantia-da-praca-pm104.md)). Só vira caixa `[ ]` no ROADMAP após ganhar DoD, responsável e revisão de impacto no orçamento de shell (`PM-01`).

---

## 1. Problema e motivação

A [Garantia da Praça (`PM-104`)](../product/garantia-da-praca-pm104.md) estabelece duas premissas simultâneas para o Vox:

1. **Ninguém controla sua chave nem censura na infraestrutura:** o protocolo não tem servidor central moderador de texto, e publicações assinadas circulam pela malha local-first.
2. **Cada pessoa controla o que vê no próprio aparelho** e pode acionar a moderação da comunidade por canais transparentes e assinados (`PM-69`).

No uso cotidiano de comunidades cívicas, dois atritos recorrentes aparecem antes mesmo de um conflito escalar para denúncia formal:

- **Publicação impulsiva ou exposição acidental:** quem escreve pode incluir sem perceber dados sensíveis próprios ou de terceiros (telefone, endereço, e-mail, chave Pix pessoal com exposição de nome civil via DICT) ou redigir em tom agressivo que depois se arrepende de ter assinado e propagado pela malha.
- **Atrito alto para se proteger na leitura:** diante de um conteúdo incômodo ou abusivo no feed, a pessoa precisa de um gesto imediato (1 toque) para tirar o conteúdo da tela no próprio aparelho, com opção clara — e nunca obrigatória — de escalar para denúncia assinada à moderação (`PM-69`).

Esta especificação v0 propõe um mecanismo **100% local, consultivo e determinístico** dividido em duas frentes complementares, sem modelos de aprendizado de máquina e sem tráfego de rede.

---

## 2. Frente 1 — Aviso pré-publicação estritamente local e consultivo

### 2.1 Fluxo no compositor (antes de assinar/enviar)

Antes de o cliente assinar o envelope (`sigv: 2`, `ECDSA P-256`) e disparar a publicação na malha ou memória central, um verificador local síncrono inspeciona o rascunho **somente na memória do navegador**:

1. **Gatilho:** executado localmente ao acionar "Publicar" (ou em pausa curta de digitação, opcional e desativável nas preferências locais).
2. **Heurísticas locais leves (v0, JavaScript puro):**
   - **Exposição potencial de dados pessoais (PII):** padrões locais simples para telefone, e-mail, CPF formatado ou indicação de chave Pix pessoal (reforçando o aviso DICT já existente em `REV-13`).
   - **Sinais de atrito conversacional:** heurísticas determinísticas e transparentes (ex.: proporção elevada de caixa alta contínua, lista local enxuta e configurável de termos de ataque pessoal direto).
3. **Apresentação consultiva:** quando uma heurística dispara, o compositor exibe um cartão discreto explicando *por que* o aviso apareceu (regra legível em português claro) com duas ações equivalentes:
   - **"Revisar texto"** (volta o foco ao editor, sem alterar o texto);
   - **"Publicar assim mesmo"** (prossegue imediatamente para assinatura e envio).

### 2.2 Invariantes do aviso pré-publicação

- **Nunca bloqueia publicação:** não existe bloqueio rígido, espera forçada (*cooldown* punitivo) nem veto à assinatura criptográfica. A decisão final é sempre da autora ou do autor.
- **Nunca reescreve texto automaticamente:** o cliente não altera, mascara ou censura o rascunho sem ação explícita da pessoa.
- **Opt-out local:** a pessoa pode desativar os avisos consultivos em `#/settings` (preferência gravada apenas no armazenamento local do aparelho).
- **Zero registro externo:** o fato de um aviso ter disparado, sido aceito ou ignorado **nunca** entra no objeto assinado, nos metadados do post, no gossip ou em qualquer log remoto.

---

## 3. Frente 2 — Ocultação / borrão em 1 toque (`moderation.js` + `PM-69`)

Na leitura de posts, respostas e comentários, o cartão oferece uma ação rápida de proteção imediata integrada às camadas já existentes no cliente:

### 3.1 Camada pessoal no aparelho (`client/js/moderation.js`)

1. **Borrão / ocultação imediata (1 toque):**
   - Ao acionar o controle rápido no cartão, o item é imediatamente coberto/ocultado na visualização local (com botão "Mostrar novamente" / desfazer) e pode ser movido para a quarentena local via `quarantinePost(postId)` (desfazível via `unquarantinePost(postId)`).
   - Enquanto estiver em quarentena local, `filterFeedPosts` remove o item da lista padrão e `canEchoPost(postId)` impede que o aparelho repasse esse item na malha P2P, preservando a semântica já implementada em [`client/js/moderation.js`](../../client/js/moderation.js).
2. **Ações pessoais complementares no mesmo painel:**
   - **Silenciar autor (`muteUser`):** oculta localmente publicações futuras daquela conta sem notificar o autor.
   - **Bloquear autor (`blockUser`):** oculta localmente e descarta itens recebidos via gossip (`shouldDropGossip`).
   - **Portabilidade:** as escolhas pessoais continuam exportáveis e importáveis entre aparelhos da própria pessoa via `exportModerationBundle()` / `importModerationBundle()`.

### 3.2 Ponte opcional para denúncia assinada (`PM-69`)

Após a ocultação local imediata (que já protege a tela da pessoa sem latência), o painel exibe — como **segundo passo explícito e opcional** — a opção **"Denunciar para a moderação da comunidade"**:

- Reaproveita integralmente o fluxo do `PM-69` ([`client/js/report-review.js`](../../client/js/report-review.js) e [`client/js/app/report-dm.js`](../../client/js/app/report-dm.js)): denúncia assinada enviada por DM cifrada ponta a ponta à moderação da comunidade, com arquivamento temporário (`review-hide`) sujeito a revisão em 48 h e limites anti-abuso já ativos (3 pendentes por pessoa; perda de efeito automático após 3 rejeições consecutivas).
- A UI deixa explícita a diferença de escopo definida na [Garantia da Praça (`PM-104`)](../product/garantia-da-praca-pm104.md):
  - **Ocultar / borrar aqui:** vale **somente no seu aparelho** (reversível a qualquer momento, ninguém é notificado).
  - **Denunciar à comunidade (`PM-69`):** envia DM cifrada assinada aos moderadores daquela comunidade para revisão humana.

---

## 4. Garantias arquiteturais e limites rígidos

Estas garantias são requisitos inegociáveis para qualquer evolução futura desta spec:

| Garantia | Regra concreta |
|---|---|
| **Zero chamadas remotas** | Toda análise pré-publicação e toda ocultação/borrão local rodam 100% offline no dispositivo. Nenhuma requisição HTTP, WebSocket, Nostr ou telemetria é disparada durante a digitação, aviso consultivo ou ocultação pessoal. |
| **Nunca bloqueia chave nem censura em servidor/relay** | Relays ([`relay/server.py`](../../relay/server.py), [`relay/signaling.py`](../../relay/signaling.py)) e nós da malha nunca inspecionam texto de posts nem filtram conteúdo por heurística. A chave privada da conta nunca é suspensa, revogada ou impedida de assinar por qualquer regra local. |
| **Proibição de `'wasm-unsafe-eval'` sem ADR próprio** | A política de segurança de conteúdo (`CSP`, `LAN-16`) **não** pode adicionar `'wasm-unsafe-eval'` para executar classificadores ou motores de análise. Qualquer uso futuro de WebAssembly no cliente depende de ADR dedicado, revisão externa de segurança (`LAN-18`) e decisão explícita do mantenedor. |
| **Sem ML ou pesos neste v0; futuro condicionado ao `PM-01`** | Este v0 **não** inclui modelos de aprendizado de máquina, redes neurais, embeddings nem arquivos de pesos. Qualquer proposta futura de modelo local só pode ser avaliada se: (a) couber integralmente no orçamento de precache e boot Slow 3G do `PM-01` / `LAN-23` (`scripts/shell-budget-check.mjs`), (b) for baixada estritamente sob demanda (opt-in explícito, fora do shell inicial), (c) rodar 100% offline sem vazar texto, e (d) for aprovada em ADR próprio. |
| **Transparência e auditabilidade** | As heurísticas locais do v0 devem ser código-fonte aberto, legível e coberto por testes unitários determinísticos em `tests/`, sem listas opacas nem critérios secretos. |

---

## 5. Fora de escopo neste v0

- Modelos de aprendizado de máquina, classificadores estatísticos ou download de arquivos de pesos.
- Qualquer filtro automático no relay, na sinalização WebSocket/Nostr ou na memória central.
- Bloqueio compulsório de publicação ou alteração silenciosa do texto do usuário.
- Alteração de CSP (`_headers` ou meta tag em `client/index.html`) para liberar `'wasm-unsafe-eval'`.
- Mudanças no protocolo de denúncia `PM-69` ou na lista assinada da instância oficial (`LAN-13`).

---

## 6. Critérios para virar item de ROADMAP (próximos passos)

Antes de promover a candidata **F11** para uma caixa `[ ]` no [ROADMAP](../ROADMAP.md):

1. Validar com o mantenedor o conjunto mínimo de heurísticas consultivas do v0 (priorizando alertas de PII/DICT com baixíssimo falso positivo).
2. Confirmar o custo em bytes da implementação v0 frente ao orçamento do `PM-01` (`scripts/shell-budget-check.mjs`) — meta: impacto residual (< 4 KiB gzip, sem dependência externa).
3. Alinhar o texto de explicação in-app com a revisão final pós-`REV-12` da [Garantia da Praça (`PM-104`)](../product/garantia-da-praca-pm104.md).
4. Definir testes unitários (heurísticas determinísticas, garantia de não bloqueio, integração com `quarantinePost`/`canEchoPost` e ponte opcional `PM-69`) e responsável pela entrega.
