# Padrões seguros por idade sem coleta de dados pessoais — REV-23

> **Status:** rascunho (spec técnica pré-implementação; **pendente de parecer jurídico humano (`REV-12`) — zero código antes do parecer**) · **Owner:** mantenedor / segurança · **Revisado:** 2026-11-22  
> **Relacionados:** [ROADMAP (REV-23, REV-12, LAN-19)](../ROADMAP.md), [ADR-020 (postura do piloto G1)](../adr/020-postura-de-operacao-do-piloto-g1.md), [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md), [briefing-parecer-g1.md](../legal/briefing-parecer-g1.md), [pesquisa-complementar-2026-11.md §B6](../research/pesquisa-complementar-2026-11.md), [criterios-go-beta-lan28.md](../strategy/criterios-go-beta-lan28.md), [`client/js/age-gate.js`](../../client/js/age-gate.js).

> [!IMPORTANT]
> **Bloqueio normativo (`REV-12`):** este documento especifica a arquitetura *privacy-by-design* para eventual abertura a menores de 18 anos nos portões **G2/G3**. Enquanto durar o piloto fechado **G1**, vigora exclusivamente a postura do [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md) (somente `18+` via [`client/js/age-gate.js`](../../client/js/age-gate.js)). **Nenhuma linha de código de `<18` ou `<16` deve ser implementada antes do parecer jurídico humano (`REV-12`).**

---

## 1. Contexto e princípio de não coleta

O **ECA Digital** (Lei nº 15.211/2025 e Decreto nº 12.880/2026, em vigor desde 17/03/2026, conforme [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md)) alcança serviços digitais de "provável acesso" por crianças e adolescentes, impondo padrões seguros por padrão e **vínculo obrigatório de contas de menores de 16 anos a um responsável legal**.

Ao mesmo tempo, a arquitetura do Vox proíbe coleta de CPF, RG, data de nascimento, selfie biométrica ou banco central de contas. Esta especificação define como aplicar proteções graduais no cliente usando **exclusivamente estado local autodeclarado** e **avaliação criptográfica local por chave**, com zero coleta de dados pessoais (LGPD art. 6º, III — minimização).

### 1.1 Invariante de armazenamento local e zero vazamento

1. A faixa etária declarada e eventuais comprovantes de vínculo residem **exclusivamente no `localStorage` do dispositivo** do usuário.
2. **Proibição de transmissão:** nenhum campo de faixa etária, data de confirmação ou voucher `guardian_age_link` é enviado em:
   - cartões de perfil (`PROFILE_CARD` / gossip);
   - posts, comentários, ofertas ou propostas assinadas;
   - envelopes de DM (`crypto-dm`);
   - quadros de registro/sinalização WebSocket ([`relay/signaling.py`](../../relay/signaling.py)) ou requisições HTTP ao relay ([`relay/server.py`](../../relay/server.py)).
3. **Compatibilidade retroativa com o G1:** hoje [`client/js/age-gate.js`](../../client/js/age-gate.js) grava `AGE_STORAGE_KEY` (`"vox-age-18-v1"`) com `{ adult: true, confirmedAt, v: 1 }`. A evolução pós-`REV-12` (ex.: `"vox-age-tier-v2"`) lê `"vox-age-18-v1"` como equivalente legado de `18+`, sem perder a confirmação local de adultos já participantes.

---

## 2. As três faixas etárias locais e seus padrões

```json
{
  "v": 2,
  "tier": "18+" | "16-17" | "<16",
  "confirmedAt": 1795305600000,
  "guardianLink": null
}
```

Se a chave em `localStorage` estiver ausente, corrompida ou fora do enum permitido (`"18+"`, `"16-17"`, `"<16"`), o cliente falha fechado (*fail-closed*) e bloqueia o avanço além do pacto de entrada até seleção válida.

### 2.1 Matriz comparativa das faixas

| Capacidade / Restrição | **`18+`** (Adulto) | **`16–17`** (Adolescente — G2/G3 pós-`REV-12`) | **`<16`** (Menor de 16 — G3 pós-`REV-12`, ECA Digital) |
|---|---|---|---|
| **Permitido no piloto G1 ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md))?** | **Sim (única faixa)** | Não (bloqueado no G1) | Não (bloqueado no G1 e G2; avaliado para G3) |
| **Vínculo criptográfico com responsável** | Não aplicável | Não exigido | **Obrigatório** (`guardian_age_link` válido via QR local) |
| **DMs de desconhecidos / não mútuos** | Permitidas (conforme configuração local) | **Desabilitadas** (somente contatos mútuos/aprovados) | **Desabilitadas** (somente contatos mútuos/aprovados) |
| **Pix Zaps e cadastro de chave Pix** | Permitidos (com aviso DICT) | **Desabilitados** (risco de exposição de nome civil via DICT) | **Desabilitados** |
| **Feira geolocalizada / ofertas** | Permitida onde habilitada | **Desabilitada** (sem criação nem exposição de localização) | **Desabilitada** |
| **Privacidade de IP WebRTC (`LAN-19`)** | Opt-in do usuário | **`iceTransportPolicy: "relay"` forçado** quando TURN `REV-10` disponível | **`iceTransportPolicy: "relay"` forçado** quando TURN `REV-10` disponível |
| **Transmissão da faixa pela rede** | Nunca | Nunca | Nunca |

---

## 3. Especificação técnica das salvaguardas para `<18` (`16–17` e `<16`)

### 3.1 DMs restritas a contatos mútuos (`dm-wire.js` / `dm-messenger.js`)

1. **Entrada (`client/js/app/dm-wire.js`):** antes de persistir mensagem comum ou disparar notificação na UI, verificar se o remetente (`peerAddress`) integra a lista local de contatos mútuos/aprovados do aparelho. Envelopes de remetentes desconhecidos são descartados localmente sem enviar recibo de leitura (`read-receipt`) nem vazar sinalização de erro ao remetente.
2. **Saída (`client/js/dm-messenger.js`):** o seletor de nova conversa exibe exclusivamente contatos mútuos/aprovados e impede iniciar conversa por `@handle` ou `routeId` arbitrário fora dessa lista.

### 3.2 Bloqueio de Pix Zaps e chave Pix (`pix-key.js` / `brcode.js`)

1. **Justificativa regulatória (DICT / BCB):** conforme [`client/js/pix-key.js`](../../client/js/pix-key.js) (`PIX_RECEIVER_NAME_NOTICE_PT`) e [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md), qualquer transferência Pix exibe obrigatoriamente no aplicativo bancário do pagador o **nome civil completo e parte do CPF** registrados no DICT, inclusive em chaves aleatórias (EVP). Permitir Pix Zaps por menores de 18 anos exporia sua identidade civil a desconhecidos na rede.
2. **Bloqueio na UI e na camada lógica:**
   - Perfil e onboarding ocultam/desabilitam o campo de cadastro de chave Pix;
   - Botões de Zap / geração de BR Code ([`client/js/brcode.js`](../../client/js/brcode.js)) permanecem inativos e a função geradora recusa operação quando a faixa local é `"16-17"` ou `"<16"`.

### 3.3 Desabilitação de Feira geolocalizada (`listing.js`)

1. Para `"16-17"` e `"<16"`, o compositor de ofertas ([`client/js/listing.js`](../../client/js/listing.js)) e as rotas `#/compose/listing` permanecem bloqueados, impedindo publicação de `locationLabel`, retirada presencial ou negociação comercial (também sujeita ao CDC na interpretação do STF, item 7).
2. A aba Feira (`?tab=listings`) oculta ofertas com `locationLabel` ou filtros de proximidade geográfica para contas declaradas abaixo de 18 anos.

### 3.4 Privacidade de IP forçada via TURN (`LAN-19` + `REV-10`)

1. Em [`client/js/webrtc-signaling-config.js`](../../client/js/webrtc-signaling-config.js), `createRtcConfig(config, { turnOnly })` hoje lê `isTurnOnly()`.
2. Na implementação pós-`REV-12`, o efetivo `turnOnly` passa a ser `isTurnOnly() || isMinorTierActive()`:
   - **Quando houver TURN público (`REV-10`) ou TURN customizado disponível em `config`:** `createRtcConfig` força `iceTransportPolicy: "relay"`, impedindo troca direta de candidatos ICE `host`/`srflx` e evitando exposição do IP residencial/móvel a pares desconhecidos.
   - **Quando não houver servidor TURN configurado (`turn: []`, estado atual antes do `REV-10`):** a interface exibe aviso explícito de que o modo "só TURN" não tem servidor de revezamento ativo e mantém WebRTC P2P restrito ou desativado conforme diretriz final do `REV-12` (não simular proteção inexistente).

---

## 4. Vínculo criptográfico de responsável para `<16` (ECA Digital)

Para cumprir a exigência de vínculo com responsável legal do ECA Digital **sem coletar CPF, RG, e-mail ou certidão de nascimento**, o desenho propõe um comprovante assinado localmente entre duas contas Vox no mesmo ambiente físico ou por canal direto: **`guardian_age_link`**.

### 4.1 Objeto assinado `guardian_age_link` (v1, `sigv: 2`)

Reutiliza a serialização canônica recursiva `sigv: 2` de [`client/js/sig-format.js`](../../client/js/sig-format.js), verificada por [`client/js/signed-verify.js`](../../client/js/signed-verify.js) e transportável por QR offline ([`client/js/qr-url.js`](../../client/js/qr-url.js)):

```json
{
  "type": "guardian_age_link",
  "version": 1,
  "sigv": 2,
  "minorRouteId": "vx_Menor0123456789abcdef",
  "guardianRouteId": "vx_Adulto9876543210fedcba",
  "issuedAt": 1795305600000,
  "expiresAt": 1826841600000,
  "nonce": "<16 bytes base64url aleatórios>",
  "pubKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "sig": "<assinatura ECDSA P-256 SHA-256 da chave do responsável>"
}
```

### 4.2 Fluxo de emissão e verificação local (sem servidor)

1. **Pedido no aparelho do menor (`<16`):** após selecionar a faixa `"<16"`, o app gera um `nonce` de 16 bytes e exibe um QR de solicitação contendo `{ minorRouteId, nonce, createdAt }` (sem dados civis). Enquanto não houver vínculo válido, a conta permanece bloqueada para uso da malha.
2. **Aval no aparelho do responsável (`18+`):** a conta adulta (que já confirmou `18+` no próprio aparelho) lê o QR do menor, confirma explicitamente na tela que assume a supervisão daquela conta local, assina o objeto `guardian_age_link` com sua chave privada P-256 e exibe o QR de resposta (ou envia via link/WebRTC local). O aparelho do responsável registra localmente a lista de contas supervisionadas em seu próprio `localStorage` (painel de supervisão local, sem servidor).
3. **Verificação e guarda no aparelho do menor:** o aparelho do menor valida:
   - `type === "guardian_age_link"` e `version === 1` e `sigv === 2`;
   - `minorRouteId` coincide exatamente com o `routeId` local do menor;
   - `guardianRouteId !== minorRouteId` (impede auto-aval);
   - `guardianRouteId` corresponde à `pubKey` embutida e a assinatura ECDSA P-256 (`sig`) é válida sobre o JSON canônico `sigv: 2`;
   - `nonce` corresponde ao desafio ativo e `now < expiresAt` (validade máxima sugerida de 365 dias, renovável).
4. **Armazenamento:** aprovado o voucher, ele é salvo **exclusivamente** dentro do registro local de faixa etária em `localStorage` do aparelho do menor, desbloqueando o modo `<16` supervisionado.
5. **Revogação:** o responsável pode revogar o vínculo no painel local (gerando estado local ou aviso de encerramento quando emparelhado), e o menor pode desvincular/limpar o armazenamento local — caso em que a conta retorna ao estado travado até novo aval ou nova declaração pós-`REV-12`.

---

## 5. Limitações honestas (por que o `REV-12` é obrigatório)

1. **Autodeclaração sem KYC não impede falsificação deliberada:** qualquer pessoa pode marcar `"18+"` ou limpar o `localStorage` do navegador para reiniciar a escolha. Sem documentos, biometria ou atestação externa, o cliente não distingue um adulto de um adolescente que declare idade falsa.
2. **Vínculo criptográfico não prova parentesco civil:** a assinatura `guardian_age_link` prova que uma **segunda chave P-256** (cujo aparelho declarou `18+`) endossou a conta `<16` via QR, mas não prova vínculo legal de filiação/tutela sem verificação civil externa.
3. **Volatilidade de navegador:** limpar dados do site ou trocar de navegador remove o `localStorage`, exigindo nova declaração e, no caso `<16`, novo aval por QR do responsável.
4. **Lacuna jurídica aberta (`REV-12`):** o Decreto nº 12.880/2026 e a fiscalização da **ANPD** exigem mecanismos confiáveis de aferição etária proporcionais ao risco. Cabe exclusivamente ao **parecer jurídico humano (`REV-12`)** responder se:
   - a combinação *autodeclaração + padrões seguros + `guardian_age_link` local* atende ao ECA Digital para um software livre comunitário sem cadastro central; ou
   - será obrigatório integrar credencial verificável opcional (como selo `gov.br` maior de 18 via parceiro público no modelo do [ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md), sem expor CPF ao Vox) ou manter o bloqueio estrito de menores na instância oficial.

---

## 6. Matriz exata de testes no cliente (`DoD` pós-`REV-12`)

Quando — e somente quando — o `REV-12` autorizar a implementação de `<18` / `<16`, o PR de código deverá entregar todos os testes abaixo em `tests/` (determinísticos, sem rede externa, `≤ 45` linhas lógicas por caso de teste conforme [HARDENING.md](../HARDENING.md)):

| ID | Módulo / Alvo | Cenário de teste obrigatório | Critério de aceite |
|---|---|---|---|
| **T-AGE-01** | `age-gate.js` | Estado inicial vazio, JSON inválido, faixa desconhecida (`"12"`), migração de `vox-age-18-v1` | Fail-closed (`false`/bloqueado) em qualquer valor inválido; migra `adult: true` legado para `"18+"` |
| **T-AGE-02** | `age-gate.js` + `onboarding.js` | Postura G1 ativa (`ADR-020`) vs flag pós-`REV-12` | No modo G1, seleções `"16-17"` e `"<16"` permanecem indisponíveis; apenas `"18+"` libera o pacto |
| **T-AGE-03** | `profile-card-gossip` + `dm-wire.js` + `webrtc-signaling-ws.js` | Serialização de cartão de perfil, post, DM e frame `register` com conta `"16-17"` ou `"<16"` | Nenhuma payload de rede contém `tier`, `confirmedAt` ou `guardianLink` |
| **T-AGE-04** | `dm-wire.js` + `dm-messenger.js` | Chegada de DM de `routeId` desconhecido vs contato mútuo para `"16-17"` / `"<16"` | Desconhecido é descartado sem persistir nem emitir recibo de leitura; mútuo entrega normalmente |
| **T-AGE-05** | `pix-key.js` + `brcode.js` + `render/profile.js` | Tentativa de salvar chave Pix ou gerar BR Code em `"16-17"` / `"<16"` | UI oculta/desabilita e função geradora recusa execução |
| **T-AGE-06** | `listing.js` + `compose-listing.js` | Tentativa de criar ou exibir oferta geolocalizada da Feira em `"16-17"` / `"<16"` | Criação recusada e aba Feira com localização ocultada |
| **T-AGE-07** | `webrtc-signaling-config.js` | `createRtcConfig` para `"16-17"` / `"<16"` com TURN presente vs `turn: []` | Com TURN: `iceTransportPolicy === "relay"` mesmo sem toggle manual; sem TURN: flag/aviso de ausência de relay |
| **T-AGE-08** | `guardian_age_link` verifier | Voucher `sigv: 2` válido vs assinatura adulterada, `minorRouteId` divergente, `guardianRouteId === minorRouteId`, `nonce` errado e `expiresAt` expirado | Apenas voucher íntegro, não expirado, de outra chave e com `nonce` ativo desbloqueia `<16` |
| **T-AGE-09** | Fluxo de revogação `<16` | Revogação pelo responsável ou limpeza local do voucher | Conta `<16` volta imediatamente ao estado bloqueado aguardando novo aval QR |
