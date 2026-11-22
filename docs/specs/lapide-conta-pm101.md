# Lápide de conta (`account_tombstone` v1) — PM-101

> **Status:** rascunho (spec PM-101 para revisão antes de implementação; alinhada ao ADR-034 e PM-13) · **Owner:** mantenedor / segurança · **Revisado:** 2026-11-22  
> **Relacionados:** [ROADMAP (PM-101, PM-13, PM-104)](../ROADMAP.md), [ADR-034 (raiz e subchaves)](../adr/034-raiz-e-subchaves-por-aparelho.md), [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md), [profile-card-gossip-v0.md](./profile-card-gossip-v0.md), [relay-api.md](./relay-api.md), [THREAT-MODEL.md](../THREAT-MODEL.md).

---

## 1. Problema e escopo

Hoje o Vox possui apenas lápide por publicação (`postOwnership.createPostTombstone`, `kind: "post-tombstone"`, propagada via `GOSSIP_DELETE` em [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md)) e retirada individual de cartão de perfil (`discoverable: false` ou `GOSSIP_DELETE` em `pc_${routeId}` em [profile-card-gossip-v0.md](./profile-card-gossip-v0.md)). Além disso, `wipeLocalDevice()` / `wipeLocalAccount()` (`client/js/identity/local-account.js`) apagam somente o armazenamento do próprio navegador.

Sem uma **lápide de conta** assinada:
1. Cartões de perfil, posts e ofertas continuam replicados na malha P2P e na memória central mesmo após o usuário encerrar a conta.
2. Quem perdeu o aparelho diário (ou teve a subchave comprometida) não tem como declarar o encerramento definitivo da identidade `vx_…` para que pares e relays parem de aceitá-la e repassá-la.

**Objetivo da spec (`PM-101`):** definir o formato wire `account_tombstone` v1, as regras criptográficas e temporais de verificação, o enforcement nas três camadas (aparelho, memória central, relay/inbox) e os limites criptográficos honestos alinhados ao `PM-104` (*Garantia da praça*).

---

## 2. Formato wire canônico (`account_tombstone` v1)

### 2.1 Objeto assinado

A lápide de conta usa o formato de assinatura **`sigv: 2`** (`client/js/sig-format.js` — `sortDeep` recursivo de todas as chaves em qualquer profundidade, excluindo `sig`, `pubKey` e o anexo opcional `recoveryKeySig` descrito abaixo):

```json
{
  "type": "account_tombstone",
  "version": 1,
  "id": "acct_tomb_vx_AbCdEf0123456789abcd",
  "author": "vx_AbCdEf0123456789abcd",
  "address": "vx_AbCdEf0123456789abcd",
  "closedAt": 1795305600000,
  "reasonCode": "user_requested",
  "supersededBy": "vx_ZzYyXx9876543210wvu",
  "sigv": 2,
  "pubKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "sig": "<base64url ECDSA P-256 SHA-256>",
  "recoveryKeySig": {
    "pubKey": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
    "deleg": { "t": "vox-delegacao-recuperacao", "v": 1, "root": "vx_...", "sub": {}, "seq": 1, "createdAt": 1795000000000, "sig": "..." },
    "sig": "<base64url ECDSA P-256 SHA-256>"
  }
}
```

### 2.2 Campos normativos

| Campo | Obrigatório | Regra |
|---|---|---|
| `type` | sim | Constante `"account_tombstone"`. |
| `version` | sim | Inteiro `1`. Versões desconhecidas são recusadas. |
| `id` | sim | Canônico determinístico `"acct_tomb_" + address`, evitando colisão com IDs de posts ou `pc_${routeId}`. |
| `author` | sim | Rota `vx_…` da conta encerrada; exigido por `verifyPayload` (`client/js/signed-verify.js`). |
| `address` | sim | Espelho exato de `author` (`address === author`); facilita leitura explícita em índices e relays. |
| `closedAt` | sim | Timestamp UTC em milissegundos (inteiro finito `> 0`) do encerramento. Deve ser posterior ao marco de gênese (`genesis_guard` / `genesis.js`). |
| `reasonCode` | sim | Enum fechado: `"user_requested"` \| `"device_lost"` \| `"key_compromised"` \| `"superseded"`. |
| `supersededBy` | condicional | String `vx_…` válida e `!== address`. Obrigatório quando `reasonCode === "superseded"`; proibido nos demais códigos. |
| `sigv` | sim | Constante `2` (entra no JSON canônico assinado, `sig-format.js`). |
| `pubKey` | condicional | JWK pública ECDSA P-256 da chave raiz/conta cuja derivação `computeRouteId(pubKey)` é igual a `author`. Obrigatória quando `sig` for assinado pela chave da conta/raiz. |
| `sig` | condicional | Assinatura ECDSA P-256 / SHA-256 em `base64url` sobre `canonicalString` (objeto sem `sig`, `pubKey` e `recoveryKeySig`). |
| `recoveryKeySig` | condicional | Bloco de contingência alinhado ao `PM-13` / [ADR-034](../adr/034-raiz-e-subchaves-por-aparelho.md) para quando a chave diária foi perdida e o usuário assina com o cartão QR impresso de recuperação (`REV-14`). |

**Relação entre `sig` (raiz/conta) e `recoveryKeySig` (`PM-13` / `ADR-034`):**
- **Caminho padrão (chave da conta disponível ou chave raiz do ADR-034 §3.1):** a própria chave cujo `computeRouteId(pubKey) === author` assina `sig` sobre `canonicalString(payload)`. Nesse caso `recoveryKeySig` é omitido.
- **Caminho de recuperação por cartão QR separado (`PM-13`):** se o cartão QR carregar uma chave de recuperação distinta da raiz, `recoveryKeySig` deve conter **(a)** a `deleg` assinada pela raiz/conta original autorizando aquela chave pública de recuperação (`computeRouteId(delegRootPubKey) === author`) e **(b)** a assinatura `recoveryKeySig.sig` dessa chave de recuperação sobre o mesmo `canonicalString` da lápide (sem `sig`, `pubKey`, `recoveryKeySig`). Nunca se aceita uma chave em `recoveryKeySig` sem prova criptográfica encadeada até `author`.
- **Nota de convivência pré-ADR-034:** no modelo atual ([ADR-034 §3.1](../adr/034-raiz-e-subchaves-por-aparelho.md)), a semente de 12 palavras (ou 24 palavras em contas legadas) já deriva a própria chave raiz (`vox-assinatura-p256`). Assim, ao restaurar a frase/cartão QR em um navegador limpo, o usuário possui a chave raiz e assina `sig` diretamente.

### 2.3 Transporte na malha (`vox-local-v0`)

| Mensagem | Canal | Payload |
|---|---|---|
| `GOSSIP_ACCOUNT_TOMBSTONE` | `BroadcastChannel` (`vox-peer-v0`), WebRTC DataChannel, `/memory/ingest`, `/memory/sync` | `{ type: "GOSSIP_ACCOUNT_TOMBSTONE", tombstone: <account_tombstone>, fromPeer? }` |
| `SYNC_INV` / `SYNC_WANT` | Handshake de inventário (`peer-sync.js`) | Nova lista opcional `acctDels: [[hash(address), closedAt]]` (compatível com clientes legados que ignoram campos desconhecidos). |

---

## 3. Regras de verificação na recepção

Todo receptor (cliente PWA e memória central) aplica a sequência abaixo em ordem estrita; qualquer falha descarta a mensagem silenciosamente (sem lançar exceção e sem retransmitir):

1. **Limite de tamanho:** payload JSON UTF-8 `<= MAX_GOSSIP_ITEM_BYTES` (512 KiB em `peers-gossip-profile.js` / `central_memory.py`; na prática < 2 KiB).
2. **Schema e enum:**
   - `type === "account_tombstone"` e `version === 1`.
   - `id === "acct_tomb_" + author` e `address === author` e formato válido de `vx_…` (`SAFE_ID_REGEX`).
   - `reasonCode` pertence ao enum fechado (`user_requested`, `device_lost`, `key_compromised`, `superseded`).
   - Se `reasonCode === "superseded"`, `supersededBy` é obrigatório, válido e `!== author`; caso contrário, `supersededBy` não pode estar presente.
3. **Verificação temporal e gênese:**
   - `closedAt` é inteiro finito `> 0`, posterior ao corte de gênese (`!isBeforeGenesisMs(closedAt)` / `!genesis_guard`).
   - Tolerância máxima para relógio adiantado: rejeitar `closedAt > now + MAX_CLOCK_SKEW_MS` (ex.: 15 minutos) para impedir bloqueio futuro espúrio por relógio errado.
4. **Verificação criptográfica (`sigv: 2`):**
   - `sigv === 2` obrigatório (`isKnownSigv` e recusa explícita de v1 para lápides de conta novas).
   - **Ou** `verifyPayload` padrão confirma `computeRouteId(pubKey) === author` e `sig` válida sobre `canonicalString` (sem `sig`, `pubKey`, `recoveryKeySig`);
   - **Ou** `recoveryKeySig` é válido com cadeia de delegação assinada por chave que deriva `author`, e assinatura válida sobre o mesmo `canonicalString`.
5. **Anti-replay e irreversibilidade:**
   - Lápide de conta é **terminal e irreversível**: uma vez aplicada para `address`, nenhuma mensagem pode "reabrir" a conta.
   - Se já existe lápide registrada para `address`:
     - se `incoming.closedAt <= existing.closedAt` (ou `sig` idêntica): **no-op** (dedupe, não retransmite).
     - se `incoming.closedAt > existing.closedAt`: só atualiza metadados se o novo `reasonCode` mantiver encerramento (não reverte). Preferência recomendada v1: manter o registro já validado e ignorar duplicatas posteriores, evitando churn na malha.
6. **Precedência sobre `PROFILE_CARD`, posts e lápides de post:**
   - `account_tombstone` tem **precedência absoluta** sobre qualquer `PROFILE_CARD` (`pc_${address}`) e sobre qualquer post/oferta/voto/manifesto assinado por `address`, independentemente de o `ts`/`editedAt` do item ser anterior ou posterior a `closedAt`.
   - Razão de segurança: se um ladrão ainda tiver a chave do aparelho roubado, ele poderia assinar novos posts com `ts > closedAt`; a lápide emitida pela raiz/cartão bloqueia qualquer item futuro daquela conta. (Exceção futura somente se `ADR-034` for estendido com rotação sem encerramento, fora de `PM-101`).

---

## 4. Propagação e enforcement nas 3 camadas

### 4.1 Camada (a): Aparelho local (IndexedDB, feed, diretório e gossip)

1. **Persistência da lápide (`cache-node.js`):**
   - Novo registro no store (ou store dedicado `account-tombstones`, chave `address`), preservado no aparelho como barreira anti-ressurreição contra gossip atrasado de pares que ainda não receberam a lápide.
2. **Purga local imediata do conteúdo do autor:**
   - Remove todos os posts/tópicos/ofertas/respostas de `author === address` em `local-posts` (`cache-node.js`) e limpa citações nominais na UI conforme regras de privacidade.
   - Remove o cartão do diretório (`profileDirectory.removeProfileCard(address)` em `client/js/profile-directory.js`).
   - Emite evento de UI (`onAccountTombstone(tombstone)`) para remover imediatamente os cards do feed e das rotas abertas sem precisar recarregar a página.
3. **Bloqueio de entrada e saída no gossip (`peers.js` / `peer-sync.js`):**
   - `handleGossipMessage`, `handleGossipUpdate`, `handleProfileCardHello`, `applyDirectoryProfileCard` e `hydrateTombstones`: checar `isAccountTombstoned(author)` **antes** de persistir ou retransmitir. Se verdadeiro, descartar silenciosamente.
   - `SYNC_INV`: excluir posts e cartões de `address` do inventário oferecido aos pares e anunciar `acctDels` para que pares conectados recebam a lápide e também purguem suas cópias.
   - No próprio aparelho do emissor: transmitir `GOSSIP_ACCOUNT_TOMBSTONE` aos pares conectados e à memória central (quando configurada) **antes** de rodar `wipeLocalAccount()` / `wipeLocalDevice()` (`local-account.js`), garantindo que a rede receba a lápide antes que a chave suma do armazenamento local.

### 4.2 Camada (b): Memória central (`relay/central_memory.py`)

1. **Novo estado persistido (`_empty_state`, `state.json`, `events.jsonl`):**
   - Adicionar dicionário `"accountTombstones": {}` (indexado por `address`) em `_empty_state()` e `_normalize_loaded_state()`.
2. **Ingestão (`_apply_event_to_state`, `ingest_event`, `sync_bundle`):**
   - Tratar `etype == "GOSSIP_ACCOUNT_TOMBSTONE"` (extraindo `payload["tombstone"]` ou `payload["item"]`) e itens `"accountTombstones"` em `sync_bundle`.
   - Validar schema, limites (`_capped`, `MAX_ITEM_BYTES`) e assinatura criptográfica ECDSA P-256 (`sigv: 2`) antes de aceitar. *(Nota de implementação: o `central_memory.py` hoje confia em stdlib Python 3; verificar ECDSA P-256 em Python puro sem dependências externas ou via verificação determinística precisa de vetor de teste dedicado no PR de código).*
   - Ao aplicar lápide válida para `address`:
     - Gravar `state["accountTombstones"][address] = normalized_tomb`.
     - Remover `state["profiles"].pop(address, None)`.
     - Remover todas as entradas em `state["posts"]` cujo `author` ou `owner` seja `address`.
     - Incrementar `state["revision"]`.
3. **Rejeição de novos uploads e ressincronização:**
   - `_apply_post`, `_apply_tombstone` e `_apply_profile` verificam logo no início se `author` / `route_id` está em `state["accountTombstones"]`; se estiver, retornam `False` (item ignorado/rejeitado sem gravar nem incrementar revisão).
4. **Exportação (`export_state`, `sync_bundle`):**
   - Incluir `"accountTombstones": _filter_since(state["accountTombstones"], since)` no retorno de estado, para que clientes que sincronizam por HTTP recebam a lápide e purguem suas cópias locais mesmo sem conexão P2P direta com o autor.

### 4.3 Camada (c): Relay cego e Inbox (`relay/inbox.py`, `relay/vault_store.py`, `relay/blind_relay.py`)

O relay do Vox tem arquitetura *zero-knowledge* com responsabilidades distintas por módulo — o enforcement respeita exatamente o que cada módulo enxerga:

| Módulo | O que enxerga | Ação diante de `account_tombstone` |
|---|---|---|
| **`relay/inbox.py`** (`/inbox/<addr>`) | Diretório da caixa por `<addr>` (`_addr_dir(to_address)`), TTL de 72 h, envelopes v1 (`from`, `to` em claro) ou futuros envelopes cegos v2 (`PM-79`). | Novo endpoint/ação autenticada pela lápide assinada (`POST /inbox/<addr>/tombstone` ou verificação na ingestão): **(1)** purga imediatamente os arquivos `.json` em `.inbox/<addr>/` (a lápide assinada pelo dono autoriza a remoção mesmo dos itens com `delHash`) e **(2)** marca `<addr>` como encerrado para recusar novos `POST /inbox/<addr>` (HTTP `410 Gone`). *Limite:* em envelopes cegos v2 do `PM-79` em que `to` não vai em claro, o relay não conhece o destinatário; eles expiram no TTL padrão. |
| **`relay/vault_store.py`** (`/memory/vault/<lookup_key>`) | O cofre é indexado por `lookup_key` derivado de `PBKDF2-SHA256(email + ":" + senha)` e protegido por `ownerHash` (SHA-256 de `ownerToken`, derivado da Senha Soberana), **não** pelo `vx_…` ([ADR-025](../adr/025-cofre-v2-so-a-senha-abre.md)). | **Invariante importante:** o `account_tombstone` (assinado por `vx_…`) **não** revela nem autoriza apagar `/memory/vault/<lookup_key>` no servidor, porque o servidor não sabe qual `lookup_key` pertence a qual `vx_…` (por privacidade). Quando o usuário encerra a conta no aparelho e tem a Senha Soberana, o próprio cliente envia `{ revoked: true }` com `ownerToken` ao `/memory/vault/<lookup_key>` antes de limpar o aparelho — mecanismo que já existe em `vault_store.py`. |
| **`relay/blind_relay.py`** (`/relay/envelope/<canal>`) | Apenas `canal` opaco, `timestamp`, `serial` e bytes cifrados (`env_<ts>_<sha256>`). Não há `author` em claro. | O relay cego **não** inspeciona conteúdo nem identifica autor para filtrar por lápide. Os envelopes expiram em **7 dias** (`DEFAULT_TTL_SECONDS`) e os clientes que decifram o conteúdo descartam qualquer item cujo autor tenha `account_tombstone`. |

---

## 5. Limites criptográficos honestos (Cold Readiness e `PM-104`)

Em alinhamento direto com o **PM-104 (*Garantia da praça*)** e com [replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md):

1. **Perda dupla (sem chave do aparelho e sem saída/cartão):** se a pessoa perdeu a chave privada do aparelho **e** não tem a frase de recuperação (`REV-14`), os guardiões ([guardioes-v0.md](./guardioes-v0.md)), o cofre ([ADR-025](../adr/025-cofre-v2-so-a-senha-abre.md)) nem o cartão QR de recuperação (`PM-13`), **ninguém — nem os mantenedores, nem stewards de relay, nem o projeto Vox — consegue emitir uma lápide válida**. Esse limite é deliberado e inegociável: se um servidor ou mantenedor pudesse encerrar uma conta sem assinatura criptográfica do dono, qualquer operador poderia censurar ou apagar contas alheias.
2. **Cópias offline e clientes modificados:** aparelhos que estejam offline no momento do encerramento só escondem o perfil e os posts quando voltarem a sincronizar com a malha ou com a memória central. Além disso, cópias previamente baixadas em disco por terceiros, capturas de tela ou clientes modificados que ignorem `GOSSIP_ACCOUNT_TOMBSTONE` **não podem ser apagados à força** pela rede.
3. **Ação irreversível:** encerrar uma conta queima o `vx_…` permanentemente nos pares e na memória central que honram o protocolo. Não existe operação criptográfica para "des-encerrar" uma conta após a emissão e propagação da lápide.

---

## 6. UX de confirmação irreversível

Antes de assinar e propagar `account_tombstone` no cliente:

1. **Tela de aviso explícito (sem confirmação em um clique):**
   - Explicar em linguagem direta que:
     - o `vx_…` nunca mais poderá ser reativado;
     - aparelhos conectados e a memória central apagarão perfil e posts quando sincronizarem;
     - cópias já guardadas em aparelhos offline ou fora do app oficial podem continuar existindo;
     - esta ação exige a chave ativa no aparelho **ou** a frase / cartão QR (`PM-13`).
2. **Segunda barreira ativa:** exigir digitação explícita de confirmação (ex.: frase curta de confirmação ou os últimos caracteres do `vx_…` / Senha Soberana quando a chave estiver travada pelo [ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md)).
3. **Ordem de execução no aparelho:**
   1. Se houver cofre conhecido e Senha Soberana informada, enviar revogação do cofre (`{ revoked: true }`) ao `/memory/vault/<lookup_key>`.
   2. Assinar `account_tombstone` (`sigv: 2`) e registrar localmente.
   3. Enviar para memória central configurada (`/memory/ingest`), caixa postal (`/inbox/<addr>/tombstone`) e broadcast P2P (`GOSSIP_ACCOUNT_TOMBSTONE`), aguardando confirmação de envio ou timeout curto (ex.: 2 s) com aviso honesto se estiver offline (o usuário pode optar por baixar o arquivo `.json` da lápide assinada para publicar depois ou continuar apenas com wipe local).
   4. Executar `wipeLocalDevice()` / `wipeLocalAccount()` limpando chaves e dados locais.

---

## 7. Plano de testes e Definition of Done (`DoD`)

### 7.1 Casos de teste planejados (futuro PR de implementação)

| ID | Camada | Cenário | Resultado esperado |
|---|---|---|---|
| **T1** | Cripto / Cliente | `account_tombstone` `sigv: 2` assinado pela raiz/conta | `verifyAccountTombstone` retorna `true`; `address === author === computeRouteId(pubKey)`. |
| **T2** | Cripto / Cliente | Lápide assinada por outra chave (`computeRouteId !== author`) ou assinatura adulterada | Rejeitada; não persiste nem retransmite. |
| **T3** | Cripto / Cliente | Lápide com `recoveryKeySig` (`PM-13`) com delegação válida pela raiz vs. delegação falsa | Válida aceita; falsa rejeitada. |
| **T4** | Cliente (`cache-node` + `peers`) | Receber `GOSSIP_ACCOUNT_TOMBSTONE` com posts e `PROFILE_CARD` pré-existentes no IndexedDB | Posts do autor removidos; `profileDirectory` limpo; `onAccountTombstone` disparado; lápide retransmitida uma vez. |
| **T5** | Cliente (precedência) | Receber `GOSSIP`, `GOSSIP_UPDATE` ou `PROFILE_CARD` de autor já tombstoned (inclusive com `ts > closedAt`) | Descartado na entrada; não salva e não retransmite; `SYNC_INV` não oferece itens do autor. |
| **T6** | Cliente (validação) | `reasonCode: "superseded"` sem `supersededBy`, ou `supersededBy === author`, ou `closedAt` pré-gênese | Rejeitado. |
| **T7** | Memória central (`central_memory.py`) | Ingest/sync de `account_tombstone` válido | `profiles[addr]` e posts de `author == addr` removidos; `accountTombstones[addr]` gravado; revisão incrementada; `export_state` inclui `accountTombstones`. |
| **T8** | Memória central (`central_memory.py`) | Tentativa posterior de `_apply_post` / `_apply_profile` para `addr` tombstoned | Retorna `False` (rejeitado); estado intacto. |
| **T9** | Inbox (`inbox.py`) | Purga por lápide válida + `POST /inbox/<addr>` após lápide | Envelopes em `.inbox/<addr>/` removidos mesmo com `delHash`; novo `POST` retorna `410 Gone`. |
| **T10** | Anti-replay / idempotência | Reenvio idêntico da mesma lápide | `unchanged` / no-op sem churn no mesh nem erro. |

### 7.2 Definition of Done (`DoD`)

- **DoD desta fase (`doc`):** spec revisada, banner de status conforme `CONTRIBUTING-DOCS.md`, links verificados por `npm run audit:docs` (`0 achados`).
- **DoD da futura implementação (`code`, T2/2027, após `PM-13` / `ADR-034`):**
  1. Verificação `sigv: 2` e cadeia `recoveryKeySig` implementadas em `client/js/signed-verify.js` e espelhadas no servidor (`relay/central_memory.py` + `relay/inbox.py`).
  2. Testes `T1`–`T10` verdes em `npm test` e suíte Python do relay, mantendo métricas de hardening (`LLOC <= 30`, `Nesting <= 4`, `CC <= 15`).
  3. Fluxo de UX irreversível com aviso honesto sobre perda dupla e cópias offline alinhado ao texto do `PM-104`.
  4. `npm run validate` verde e bump canônico do Service Worker no PR de implementação.
