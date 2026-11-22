# Rotação e revogação de chaves sobre o ADR-034 (`key_rotation` / `subkey_revocation` v1) — PM-13

> **Status:** rascunho (spec PM-13 sobre o ADR-034; **pré-requisito obrigatório de revisão externa de cripto `LAN-18` antes de qualquer código novo de criptografia**) · **Owner:** mantenedor / segurança · **Revisado:** 2026-11-22
> **Relacionados:** [ROADMAP (PM-13, PM-101, REV-14, LAN-18)](../ROADMAP.md), [ADR-034 (raiz e subchaves por aparelho)](../adr/034-raiz-e-subchaves-por-aparelho.md), [lápide de conta (PM-101)](./lapide-conta-pm101.md), [ADR-037 (cofre na malha)](../adr/037-cofre-na-malha.md), [guardiões (v0)](./guardioes-v0.md), [integridade na entrada (ADR-021)](../adr/021-integridade-na-entrada-forma-assinada.md), [THREAT-MODEL (T24–T27)](../THREAT-MODEL.md).

---

> **PORTÃO OBRIGATÓRIO (`LAN-18`):** Nenhum código novo de criptografia, delegação, rotação ou revogação de subchaves no cliente ou no relay pode ser implementado ou habilitado antes da **revisão externa de cripto (`LAN-18`)** sobre o modelo do [ADR-034](../adr/034-raiz-e-subchaves-por-aparelho.md) e desta especificação, acompanhada dos vetores de teste determinísticos da futura RFC de delegação/subchaves.

---

## 1. Problema e escopo

No modelo atual de identidade congelada ([`signed-verify.js`](../../client/js/signed-verify.js)), a conta **é** uma única chave ECDSA P-256 (`routeId = vx_…`). O [ADR-034](../adr/034-raiz-e-subchaves-por-aparelho.md) define a evolução sem quebra de `vx_…`:

1. A chave derivada da semente de 12 palavras (`vox-assinatura-p256`) ou da chave legada de 24 palavras passa a ser a **chave raiz** da conta (`author === computeRouteId(rootPubKey)`).
2. Cada aparelho diário passa a operar com uma **subchave ECDSA P-256 delegada** (`vox-delegacao`), e a raiz pode sair do armazenamento ativo do dia a dia ([ADR-034 §3.4](../adr/034-raiz-e-subchaves-por-aparelho.md#34-a-raiz-sai-do-dia-a-dia)).
3. Quando um celular é perdido, roubado ou substituído, o dono precisa revogar aquela subchave (`subkey_revocation`) ou rotacioná-la para um novo aparelho/subchave (`key_rotation`) **preservando o `vx_…`, os seguidores e o histórico anterior ao incidente**.

**Escopo do `PM-13`:** definir os formatos assinados `subkey_revocation` v1 e `key_rotation` v1 (`sigv: 2`), as regras determinísticas de verificação e resolução de conflitos, a precedência frente à lápide de conta (`PM-101`), a interação com o cofre na malha (`ADR-037`) e a análise explícita de ameaças. **Fora do escopo do `PM-13`:** recuperação social *k-de-n* que troca a própria raiz (futura spec pós-`LAN-18`) e envelopes cegos de DM (`PM-79`).

---

## 2. Hierarquia de chaves e derivação de identificadores

| Papel | Chave | Identificador | Quem assina |
|---|---|---|---|
| **Raiz (`root`)** | ECDSA P-256 da semente (12 palavras) ou chave legada (24 palavras) | `author` / `routeId`: `"vx_" + base64url(SHA-256("P-256:" + x + ":" + y)).slice(0, 20)` | Delegações de aparelho (`vox-delegacao`), delegação de cartão QR (`vox-delegacao-recuperacao`), `subkey_revocation`, `key_rotation` e `account_tombstone` (`PM-101`) |
| **Chave de recuperação (`REV-14`)** | A própria raiz restaurada (frase/cofre/guardiões) **ou** par P-256 dedicado impresso no cartão QR com delegação assinada pela raiz | `recKeyId` (`"rk_" + …`) com cadeia `vox-delegacao-recuperacao` | `subkey_revocation`, `key_rotation` e `account_tombstone` (`recoveryKeySig`) quando o aparelho diário foi perdido |
| **Subchave de aparelho (`sub`)** | Par ECDSA P-256 gerado localmente no aparelho | `keyId`: `"sk_" + base64url(SHA-256("P-256:" + x + ":" + y)).slice(0, 20)` | Posts, votos, avisos, cartões de perfil e ações cotidianas (levando `deleg` anexo) |

**Regra de imutabilidade:** revogar ou rotacionar uma subchave **nunca** altera o `vx_…` (`author`). A troca definitiva de `vx_…` pertence exclusivamente à lápide `account_tombstone` com `reasonCode: "superseded"` e `supersededBy` ([lapide-conta-pm101.md](./lapide-conta-pm101.md)).

---

## 3. Formato wire canônico (`sigv: 2` obrigatório)

Ambos os statements usam obrigatoriamente **`sigv: 2`** (`client/js/sig-format.js` — `sortDeep` recursivo de todas as chaves, excluindo `sig`, `pubKey` e o anexo opcional `recoveryKeySig`, em alinhamento exato com [lapide-conta-pm101.md §2.1](./lapide-conta-pm101.md#21-objeto-assinado)). Objetos sem `sigv: 2` são rejeitados na entrada.

### 3.1 `subkey_revocation` v1 (revogação pura de subchave)

Usado quando o aparelho foi perdido ou comprometido e o usuário deseja invalidar `oldKeyId` imediatamente (mesmo antes de provisionar um novo aparelho).

```json
{
  "type": "subkey_revocation",
  "version": 1,
  "id": "sub_rev_vx_AbCdEf0123456789abcd_4",
  "author": "vx_AbCdEf0123456789abcd",
  "seq": 4,
  "oldKeyId": "sk_9zYxWv8765432109fedc",
  "newPubKey": null,
  "revokedAt": 1795400000000,
  "effectiveAfter": 1795400000000,
  "reasonCode": "device_lost",
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
    "deleg": {
      "t": "vox-delegacao-recuperacao",
      "v": 1,
      "root": "vx_AbCdEf0123456789abcd",
      "sub": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
      "seq": 1,
      "createdAt": 1795000000000,
      "sig": "..."
    },
    "sig": "<base64url ECDSA P-256 SHA-256>"
  }
}
```

### 3.2 `key_rotation` v1 (rotação atômica: revoga `oldKeyId` e ativa `newPubKey`)

Usado quando o usuário substitui o aparelho ou faz rotação programada de subchave (e opcionalmente atualiza a chave de DM conforme [ADR-034 §3.2](../adr/034-raiz-e-subchaves-por-aparelho.md#32-cada-aparelho-tem-a-sua-subchave)).

```json
{
  "type": "key_rotation",
  "version": 1,
  "id": "key_rot_vx_AbCdEf0123456789abcd_5",
  "author": "vx_AbCdEf0123456789abcd",
  "seq": 5,
  "oldKeyId": "sk_9zYxWv8765432109fedc",
  "newPubKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "newDeviceLabel": "Celular novo",
  "revokedAt": 1795400000000,
  "effectiveAfter": 1795400000000,
  "dmPubKey": null,
  "reasonCode": "routine_rotation",
  "sigv": 2,
  "pubKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "sig": "<base64url ECDSA P-256 SHA-256>"
}
```

### 3.3 Campos normativos

| Campo | Obrigatório | Regra |
|---|---|---|
| `type` | sim | `"subkey_revocation"` ou `"key_rotation"` |
| `version` | sim | Inteiro `1`. Versões desconhecidas são recusadas |
| `id` | sim | Determinístico: `"sub_rev_" + author + "_" + seq` ou `"key_rot_" + author + "_" + seq` |
| `author` | sim | Rota `vx_…` da conta raiz (`SAFE_ID_REGEX`) |
| `seq` | sim | Inteiro finito `>= 1`, estritamente crescente por `author` |
| `oldKeyId` | sim | Identificador `sk_…` da subchave revogada/substituída |
| `newPubKey` | condicional | `null` em `subkey_revocation`; JWK pública ECDSA P-256 válida e com `computeKeyId(newPubKey) !== oldKeyId` em `key_rotation` |
| `newDeviceLabel` | não | Só em `key_rotation`: string curta de até 24 caracteres |
| `dmPubKey` | não | Só em `key_rotation`: `null` ou nova JWK pública de DM autorizada pela raiz |
| `revokedAt` | sim | Timestamp UTC em ms (`> 0`, pós-gênese) a partir do qual `oldKeyId` é considerada revogada |
| `effectiveAfter` | sim | Timestamp UTC em ms (`>= revokedAt` em `routine_rotation`, limitado a janela curta de propagação ex. `<= revokedAt + 15 min`; **obrigatoriamente `=== revokedAt`** em `device_lost` e `key_compromised`) |
| `reasonCode` | sim | Em `subkey_revocation`: `"device_lost"` \| `"key_compromised"` \| `"device_retired"`. Em `key_rotation`: `"routine_rotation"` \| `"device_lost"` \| `"key_compromised"` \| `"device_replaced"` |
| `sigv` | sim | Constante `2` (incluída no JSON canônico assinado) |
| `pubKey` | condicional | JWK pública da raiz (`computeRouteId(pubKey) === author`). Obrigatória quando assinado direto pela raiz |
| `sig` | condicional | Assinatura ECDSA P-256 SHA-256 em `base64url` sobre `canonicalString` (sem `sig`, `pubKey`, `recoveryKeySig`) |
| `recoveryKeySig` | condicional | Anexo de contingência do cartão QR (`REV-14`), com `pubKey` de recuperação, `deleg` (`t: "vox-delegacao-recuperacao"`) assinada pela raiz (`author`) e `sig` da chave de recuperação sobre o mesmo `canonicalString` |

---

## 4. Regras de verificação e resolução de conflitos

Todo receptor (cliente PWA, `central_memory.py` e relay aplicável) executa os passos abaixo em ordem estrita; qualquer falha descarta a mensagem sem persistir nem retransmitir:

1. **Tamanho e schema:** payload UTF-8 `<= MAX_GOSSIP_ITEM_BYTES` (na prática `< 3 KiB`); `type`, `version === 1`, `sigv === 2` estrito, `id` canônico coerente com `author` e `seq`, `reasonCode` dentro do enum do tipo e `newPubKey` coerente (`null` vs JWK P-256 distinta de `oldKeyId`).
2. **Checagem de lápide pré-existente (`PM-101`):** se já existir `account_tombstone` válido para `author`, **descartar imediatamente** (ver §5).
3. **Verificação temporal:** `revokedAt` e `effectiveAfter` devem ser finitos, posteriores ao corte de gênese e não superiores a `now + MAX_CLOCK_SKEW_MS` (15 min). Para `device_lost` e `key_compromised`, exigir `effectiveAfter === revokedAt`.
4. **Verificação criptográfica da raiz / cartão QR:**
   - **Caminho raiz:** `computeRouteId(pubKey) === author` e `sig` ECDSA P-256 SHA-256 válida sobre `canonicalString` (`sigv: 2`); **ou**
   - **Caminho cartão QR (`REV-14`):** `recoveryKeySig.deleg` válida (assinada por chave raiz cujo `computeRouteId === author` e `deleg.sub` igual a `recoveryKeySig.pubKey`), além de `recoveryKeySig.sig` válida sobre o mesmo `canonicalString`.
   - Em **nenhuma hipótese** uma subchave `sk_…` comum pode assinar `subkey_revocation` ou `key_rotation` sem assinatura da raiz ou da cadeia de recuperação.
5. **Sequência monotônica e resolução de conflito (`seq`):**
   - Cada receptor mantém por `author` o maior `seq` aceito (`maxSeq`) e a tabela `revokedSubkeys[oldKeyId] = { revokedAt, effectiveAfter, seq, reasonCode, stmtHash }`.
   - Se chegar statement válido com `seq < maxSeq` para uma `oldKeyId` ainda não registrada como revogada (ex.: entrega fora de ordem na malha): aplica a revogação de `oldKeyId` se não houver conflito posterior, mantendo `maxSeq` inalterado.
   - Se chegar statement válido com `seq === existing.seq` e conteúdo distinto (bifurcação/conflito de mesma sequência):
     1. revogação de emergência (`key_compromised` / `device_lost`) vence `routine_rotation`;
     2. em empate de classe, vence o menor `revokedAt` (corte mais conservador);
     3. persistindo empate, vence o menor `SHA-256` do JSON canônico;
     4. a UI exibe alerta explícito: *"Conflito na raiz detectado — possível exposição da frase ou do cartão QR."*
6. **Precedência sobre itens assinados por `oldKeyId` e preservação do histórico:**
   - **Após o corte:** qualquer item (post, voto, aviso, cartão de perfil, ação de cofre) assinado por `oldKeyId` com `ts > revokedAt` **ou** recebido pela primeira vez pelo par com relógio local `receivedAt > effectiveAfter + MAX_CLOCK_SKEW_MS` é **rejeitado/ocultado** e não é retransmitido na malha.
   - **Histórico anterior a `revokedAt`:** itens assinados por `oldKeyId` com `ts <= revokedAt` **e** que já possuíam registro prévio no aparelho (`receivedAt <= effectiveAfter`, conforme [ADR-034 §3.3](../adr/034-raiz-e-subchaves-por-aparelho.md#33-registro-de-chaves-e-revogação)) **são preservados** no histórico com a indicação visual discreta *"Assinado por aparelho revogado"*, salvo se forem explicitamente apagados por lápide de post (`post-tombstone`) ou por lápide de conta (`account_tombstone`).
   - **Itens assinados direto pela raiz (`author`):** continuam válidos independentemente de subchaves revogadas, exceto quando houver `account_tombstone`.
7. **Ativação de `newPubKey` (`key_rotation`):** a nova subchave passa a ser aceita para itens com `ts >= effectiveAfter` acompanhados da respectiva `vox-delegacao` válida (ou do `key_rotation` encadeado). Uma subchave já revogada em `revokedSubkeys` **nunca** pode ser reativada por um `seq` posterior com a mesma chave pública (`oldKeyId` é permanentemente queimado).

---

## 5. Interação com `PM-101` (`account_tombstone`) e `ADR-037` (cofre na malha)

### 5.1 Precedência absoluta de `PM-101`

Conforme [lapide-conta-pm101.md §3.6](./lapide-conta-pm101.md):

- A lápide de conta (`account_tombstone`) é **terminal e irreversível** e **supera qualquer `key_rotation` ou `subkey_revocation`**, anterior ou posterior.
- Ao receber um `account_tombstone` válido para `address`:
  1. todas as subchaves ativas ou rotacionadas de `address` são invalidadas junto com o perfil e posts;
  2. qualquer `key_rotation` ou `subkey_revocation` que chegue depois para `author === address` é ignorado;
  3. se a pessoa quer continuar no Vox sob nova chave raiz após comprometimento total, o único fluxo válido é emitir `account_tombstone` com `reasonCode: "superseded"` e `supersededBy: "vx_novo"`.

### 5.2 Cofre na malha (`ADR-037`)

No [ADR-037](../adr/037-cofre-na-malha.md), até 7 laços mútuos/guardiões armazenam o cofre cifrado por `e-mail + ":" + senha` (`PBKDF2-SHA256`), e decisões de acesso passam por `vox-cofre-aviso` e `vox-cofre-decisao` assinados pela dona:

1. **Revogar subchave não apaga o cofre na malha:** como `relay/vault_store.py` e os guardas indexam pelo endereço derivado da senha (`lookup_key`), `subkey_revocation` / `key_rotation` invalida o `oldKeyId` na malha social, mas **não** substitui automaticamente o segredo do cofre se o invasor também conhecia e-mail e senha.
2. **Bloqueio de decisões do aparelho revogado:** ao receber `subkey_revocation` ou `key_rotation` válido de `author`, os guardas do `ADR-037` devem recusar mensagens `vox-cofre-guarda`, `vox-cofre-solta` e `vox-cofre-decisao` (`"Fui eu"` / `"Não fui eu"`) assinadas por `oldKeyId` com `ts > revokedAt` ou `receivedAt > effectiveAfter`.
3. **Higiene recomendada pós-roubo:** quando `reasonCode` for `"device_lost"` ou `"key_compromised"`, a UX orienta imediatamente a pessoa a também alterar a Senha Soberana / senha do cofre (gerando novo `lookup_key` e enviando novo `vox-cofre-guarda` assinado pela raiz ou pela `newPubKey`, mais `vox-cofre-solta` do registro antigo).

---

## 6. Análise de ameaças explícita

| Cenário | Superfície / Ataque | Mitigação no protocolo (`PM-13`) | Limite honesto residual |
|---|---|---|---|
| **Cartão QR `REV-14` ou frase raiz roubado** (`T24`) | Atacante usa a chave raiz ou `recoveryKeySig` para emitir `key_rotation` maliciosa, revogar o celular legítimo ou publicar `account_tombstone`. | Detecção de conflito de `seq` na UI quando duas declarações disputam o mesmo `seq`; exigência de `sigv: 2`; guarda física offline sem cópia na rede. | **Se a raiz/cartão QR for comprometida**, o protocolo não recupera o mesmo `vx_…` (`ADR-034 §3.5`). O dono legítimo, se agir antes ou emitir `account_tombstone` (`superseded`), sinaliza o encerramento para novo `vx_…`. |
| **Celular diário roubado destravado (subchave exposta)** | Ladrão assina spam, votos ou tenta aprovar `vox-cofre-decisao` usando `oldKeyId`. | Dono restaura a raiz (frase, guardiões `v0`, `ADR-037` ou cartão `REV-14`) e publica `subkey_revocation` / `key_rotation` com `effectiveAfter === revokedAt`. Pares, memória central e guardas rejeitam `oldKeyId`. | **Janela offline (`ADR-034 §4`):** aparelhos que ainda não sincronizaram a revogação continuam aceitando a subchave até receberem o aviso pela malha ou memória central. |
| **Replay e antedata de subchave revogada** | Ladrão assina novos posts com `oldKeyId` definindo `ts` no passado (`ts < revokedAt`) para furar o corte e passar como histórico legítimo. | Pares usam o timestamp local de chegada (`receivedAt`) para itens recebidos após `effectiveAfter + MAX_CLOCK_SKEW_MS` (`ADR-034 §3.3`), além de `seq` monotônico e proibição de reativar `oldKeyId`. | Itens publicados antes da revogação em uma partição totalmente isolada podem parecer suspeitos ao sincronizar depois do corte; é o custo explícito contra antedata. |
| **Downgrade para `sigv: 1` ou `recoveryKeySig` sem vínculo** | Atacante remove `sigv: 2` ou anexa chave arbitrária em `recoveryKeySig` sem `vox-delegacao-recuperacao` da raiz. | Rejeição categórica de `sigv !== 2` e exigência de cadeia completa assinada por chave com `computeRouteId === author`. | Zero tolerância: falha em qualquer passo descarta o pacote silenciosamente. |

---

## 7. Pré-requisito `LAN-18`, plano de testes e DoD

### 7.1 Gate obrigatório antes de código

1. **Revisão externa de cripto (`LAN-18`):** auditoria independente da derivação de chaves, formato de `vox-delegacao`, `vox-delegacao-recuperacao`, `subkey_revocation` v1, `key_rotation` v1, interação com `account_tombstone` (`PM-101`) e proteção anti-antedata por `receivedAt`.
2. **Vetores de teste congelados:** antes de habilitar assinatura v3/subchaves em `client/js/signed-verify.js` e `relay/central_memory.py`, cliente e servidor devem passar nos mesmos vetores determinísticos JSON.

### 7.2 Casos de teste planejados (futuro PR pós-`LAN-18`)

| ID | Cenário | Resultado esperado |
|---|---|---|
| **T1** | `subkey_revocation` v1 (`sigv: 2`) assinado pela raiz | Aceito; `oldKeyId` entra em `revokedSubkeys`; `vx_…` preservado |
| **T2** | `key_rotation` v1 (`sigv: 2`) com `recoveryKeySig` válida (`REV-14`) | Aceito após conferir cadeia `vox-delegacao-recuperacao` até `author`; `newPubKey` ativada após `effectiveAfter` |
| **T3** | `subkey_revocation` ou `key_rotation` assinado por subchave comum (ou `sigv: 1`, ou `recoveryKeySig` sem delegação raiz) | Rejeitado silenciosamente; não persiste nem retransmite |
| **T4** | Post com `oldKeyId` após `revokedAt` (ou com `ts < revokedAt` antedatado mas `receivedAt > effectiveAfter + MAX_CLOCK_SKEW_MS`) | Rejeitado/ocultado; não retransmite |
| **T5** | Post histórico com `oldKeyId` gravado com `receivedAt <= revokedAt` antes da revogação | Preservado no histórico com marca de aparelho revogado |
| **T6** | Tentativa de reativar `oldKeyId` em `key_rotation` com `seq` maior | Rejeitada (`oldKeyId` queimado permanentemente) |
| **T7** | Conflito de `seq` duplicado na raiz (`routine_rotation` vs `key_compromised`) | `key_compromised` vence deterministicamente; alerta de conflito na raiz emitido |
| **T8** | `PM-101` (`account_tombstone`) já presente quando chega `key_rotation` | `key_rotation` ignorado; conta permanece terminalmente encerrada |
| **T9** | Guarda `ADR-037` recebe `vox-cofre-decisao` assinado por `oldKeyId` revogado | Guarda rejeita decisão; cofre não é liberado ao aparelho revogado |

### 7.3 Definition of Done (`DoD`)

- **DoD desta fase (`doc`):** spec `PM-13` revisada com formatos `sigv: 2`, resolução de conflitos, interação `PM-101`/`ADR-037`, análise de ameaças e gate `LAN-18` explícito; link cruzado no [ADR-034](../adr/034-raiz-e-subchaves-por-aparelho.md); `npm run audit:docs` verde (`0` achados novos).
- **DoD de código (T2/2027, somente pós-`LAN-18`):** verificação alinhada entre `client/js/signed-verify.js`, `relay/central_memory.py` e guardas `ADR-037`, testes `T1`–`T9` verdes, limites de [HARDENING](../HARDENING.md) e `npm run validate` verdes.
