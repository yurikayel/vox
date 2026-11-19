# RFC 0002 — Snapshot autenticado no relay cego

**Status:** accepted — opção A, modo `compat` · **relay implementado**; cliente pendente (ver §9, D2)  
**Data:** 2026-11-18 · **Aceito:** 2026-11-19 · **Relacionados:** [ADR-027](../adr/027-autorizacao-no-relay-dono-e-origem.md), [referência da API §6 (lacuna 12)](../specs/relay-api.md), `relay/blind_relay.py` (`store_snapshot`, `prune_covered_deltas`), `relay/test_blind_relay_adversarial.py`

## 1. Problema

`POST /relay/snapshot/<canal>` não pede prova nenhuma. Quem conhece o id do canal pode:

1. **Forjar cobertura:** mandar `coveredSerial` enorme. O relay grava e apaga todo envelope com `0 < serial <= coveredSerial` (`prune_covered_deltas`). Perda silenciosa e irreversível do canal.
2. **Travar a época:** mandar `epoch` enorme. A regra "época estritamente maior" (`_assert_snapshot_advances`) passa a recusar os snapshots legítimos seguintes.
3. **Substituir o snapshot** que o cold boot entrega a quem entra (o cliente aplica o conteúdo com `mergeSnapshot`).

O ADR-027 já resolveu o mesmo desenho para o cofre e para a caixa de DMs: o servidor não tem conta, então a prova sai de um segredo que só quem pode escrever tem, e o servidor guarda só um resumo dele. Este RFC aplica o padrão ao snapshot.

Contexto que pesa na escolha:

- O relay é só biblioteca padrão do Python (`relay/requirements.txt`): **sem verificação de assinatura ECDSA/Ed25519 pronta**. `hmac`, `hashlib` e `secrets` existem.
- O único emissor hoje é `EpochCompactor` em `client/js/labs/parado/webxdc-crdt.js` (laboratório parado). O impacto em clientes antigos é pequeno, mas o formato precisa nascer certo.
- O corpo já pode levar `author` e `sig` do cliente (`signer.sign`), que o relay ignora.

## 2. Decisão proposta (resumo)

| Ponto | Proposta |
|---|---|
| Mecanismo | **Prova de dono do canal** por cabeçalho, resumo SHA-256 guardado no relay (mesmo padrão do `ownerToken` do cofre). Alternativa com assinatura P-256 e desafio descrita em §4, para fase posterior. |
| Quem emite | Quem tem o `segredoSnapshot` do canal: os **autores** (quem hoje pode emitir pela regra `shouldEmitSnapshot`). |
| Primeiro dono | O primeiro snapshot com prova vira o dono (como o cofre sem dono). |
| `coveredSerial` | Monótono (já é) e com **teto de salto** acima do que o relay já viu. |
| `epoch` | Estritamente maior (já é) e com **teto de salto**. |
| Repetição | Mesmo snapshot reenviado devolve sucesso sem regravar; época igual com conteúdo diferente devolve `409`. |
| Migração | Dois modos: `compat` (sem prova entra, mas **nunca apaga** nem trava) e `enforce` (sem prova → `403`). |

## 3. Formato da prova (opção A, recomendada para a primeira fase)

**Segredo.** `segredoSnapshot` = 32 bytes aleatórios sorteados por quem cria o canal e entregues aos autores pelo mesmo caminho cifrado que entrega o acesso ao canal. Não é derivado de nada público e não sai do aparelho dos autores. *(De onde ele vem hoje no laboratório é pergunta aberta: o código atual não tem chave de canal. Ver D2.)*

**Prova.** Por canal **e por relay**, para que um relay hostil não use o que recebeu em outro:

```
prova = HEX( HMAC-SHA256( segredoSnapshot,
                          "vox-snapshot-proof-v1|" + host + "|" + channelId ) )   # 64 hex
```

- `host`: nome do relay em minúsculas, com porta se não for a padrão (o mesmo que o cliente usa na URL).
  - **Correção na implementação:** o relay não tem o segredo e por isso **não consegue recalcular** a prova nem conferir `host` ou `channelId` dentro dela; guarda só o SHA-256 do valor recebido. O vínculo a `host` e `channelId` está no cálculo do cliente: a prova feita para outro relay ou outro canal é outro valor e não confere com o dono guardado (`403`). Por isso `store_snapshot` **não recebe `host`** e o `server.py` não lê o `Host` para isso (um parâmetro sem efeito seria uma garantia falsa). Consequência: relay atrás de proxy que reescreve o `Host` **não** precisa de `VOX_RELAY_ALLOWED_HOSTS` por causa da prova; mudar de domínio muda a prova e exige o reinício do dono (§7).
- `channelId`: o id da rota, como o relay o valida (`[A-Za-z0-9_-]{1,128}`).

**Envio.** Cabeçalho `X-Vox-Snapshot-Proof: <prova>` (64 hex). O corpo continua sendo o snapshot de hoje, sem campo novo. Relay antigo ignora o cabeçalho: nada quebra (§7).

**Guarda.** O relay guarda `ownerHash` = SHA-256 da prova e `auth: true` no registro `latest_snapshot.json`. Nunca devolve isso no `GET` (o `GET` já devolve só `data`; a prova nunca entra em `data`).

**Regras** (iguais às do cofre em `vault_store.py`, sob o lock do relay para ler, autorizar e gravar numa decisão só):

| Situação | Resposta |
|---|---|
| Cabeçalho presente e mal formado (não são 64 hex) | `400` |
| Canal sem dono, prova válida | grava; a prova vira o dono; resposta traz `"auth": "owner"` |
| Canal com dono, prova igual (comparação em tempo constante, `hmac.compare_digest`) | segue para as regras de §5 |
| Canal com dono, prova diferente ou ausente | `403`, nada muda |
| Canal sem dono, sem prova | `compat`: ver §7 · `enforce`: `403` |

**Limite honesto da opção A.** A prova é um token ao portador, como o `ownerToken` do cofre: quem a captura (TLS quebrado, ou o próprio relay) pode usá-la **naquele canal e naquele relay** até ela ser trocada. Ela não prova que o conteúdo é verdadeiro e não dá não repúdio. Por isso o cliente continua assinando o snapshot (`author`, `sig`) e **deve conferir a assinatura contra os autores do canal antes de aplicar** (fora do relay; ver §6, ataque 5).

## 4. Opção B: assinatura P-256 com desafio (fase posterior, pendente de decisão)

Resolve repetição e não repúdio, ao custo de o relay verificar ECDSA. O cliente já usa P-256 (`client/js/identity/p256.js`, WebCrypto).

**Desafio.** `GET /relay/snapshot/<canal>/challenge` → `{ "nonce": "<32 hex>", "expiresAt": <epoch s> }`. Vale 60 s, uso único, guardado em memória (teto de 1024 desafios; acima disso o mais antigo sai).

**Mensagem assinada** (UTF-8, campos separados por `\n`, sem espaço sobrando):

```
vox-snapshot-v1
<channelId>
<host>
<epoch>
<coveredSerial>
<SHA-256 hex do corpo do snapshot em JSON canônico (chaves ordenadas, sem espaços)>
<nonce>
```

**Assinatura.** ECDSA P-256 com SHA-256, 64 bytes `r||s` em hex (formato do WebCrypto). Cabeçalhos: `X-Vox-Snapshot-Key` (ponto público não comprimido, 65 bytes em hex), `X-Vox-Snapshot-Nonce`, `X-Vox-Snapshot-Sig`.

**Dono.** O primeiro snapshot válido grava a chave pública (`ownerKey`); os seguintes precisam da mesma chave. Chave pública não é segredo, então guardá-la inteira não vaza nada.

**Custo.** Python puro não tem ECDSA. Dois caminhos: dependência opcional (`cryptography`, quebra a regra "só biblioteca padrão") ou verificador próprio de ~60 linhas (aritmética inteira, mesma matemática do `p256.js`; só verifica, dado público; lento, na casa de dezenas de ms, coberto pelo limite por IP). Qualquer um pede revisão de segurança própria. **Por isso a recomendação é entregar A agora e deixar B para depois.**

## 5. Limites de `coveredSerial` e `epoch`, e repetição

Constantes (sobrescrevíveis por variável de ambiente, valores iniciais pendentes, D4):

| Constante | Valor inicial | Variável |
|---|---|---|
| `MAX_COVERED_JUMP` | 1000 (20 vezes o `EPOCH_COMPACT_THRESHOLD = 50` do cliente) | `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP` |
| `MAX_EPOCH_JUMP` | 16 | `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP` |

Com `atual` = registro autenticado do canal (ou ausente) e `maxVisto` = maior `serial` entre os envelopes vivos do canal:

1. **Época:** `atual.epoch < epoch <= atual.epoch + MAX_EPOCH_JUMP`. Sem registro: `1 <= epoch <= MAX_EPOCH_JUMP`.
2. **Cobertura monótona:** `coveredSerial >= atual.coveredSerial` (como hoje).
3. **Teto de salto:** `coveredSerial <= max(atual.coveredSerial, maxVisto) + MAX_COVERED_JUMP`. O snapshot não pode cobrir muito além do que o relay sabe que existe; isso limita o estrago de uma chave de autor vazada ou de um cliente com defeito.
4. **Poda:** só roda para snapshot autenticado e só apaga `0 < serial <= coveredSerial` (como hoje). Envelope sem serial fica até o TTL.
5. **Idempotência:** o resumo do snapshot é o SHA-256 do corpo em JSON canônico.
   - mesma época, mesma cobertura e mesmo resumo → `200` com `"idempotent": true`, **sem regravar e sem podar de novo** (resolve o reenvio depois de resposta perdida, que hoje dá `400`);
   - mesma época com resumo diferente (dois autores compactando juntos) ou época menor → `409` com `{ "error", "currentEpoch", "currentCoveredSerial" }`, para o cliente rebuscar e mesclar (o CRDT mescla).
   - `409` seria uma subclasse de `ValueError` (`SnapshotConflict`): código que hoje trata `ValueError` continua funcionando; o `server.py` mapeia para `409`.

**Limitação conhecida:** num relay novo e vazio (canal migrado), `maxVisto = 0` e o primeiro snapshot só pode cobrir até `MAX_COVERED_JUMP`. Os clientes devem reenviar os envelopes recentes antes do snapshot, ou o steward sobe o teto por variável.

## 6. Ataques considerados

| # | Ataque | Efeito hoje | Efeito com este RFC |
|---|---|---|---|
| 1 | **Forja:** snapshot sem prova, `coveredSerial = 10^9` | apaga o canal | `enforce`: `403`. `compat`: grava como `auth: false`, **sem poda** |
| 2 | **Salto de época:** `epoch = 2^62`, sem prova | trava os snapshots legítimos | `enforce`: `403`. `compat`: registro `auth: false` nunca vale contra snapshot autenticado (§7) |
| 3 | **Salto com prova** (segredo vazado, cliente com defeito): `coveredSerial`/`epoch` enormes | idem | `400` pelo teto de §5; dano máximo por snapshot limitado a `MAX_COVERED_JUMP` envelopes |
| 4 | **Replay** do mesmo pedido capturado | regrava | idempotente (§5.5), sem efeito |
| 4b | **Replay** de snapshot antigo válido | época menor → `400` | `409`, sem efeito |
| 4c | **Replay noutro canal ou noutro relay** | não há prova | a prova inclui `channelId` e `host`: `403` |
| 5 | **Dono falso ao reivindicar canal novo** (quem prova primeiro vira dono; conhece o id, não o segredo dos autores) | não existe dono | **aceito como limite**: o falso dono trava a compactação naquele relay e pode servir um snapshot falso. Defesas: cliente confere `sig` do snapshot contra os autores antes de `mergeSnapshot` (obrigatório na implementação do cliente); o steward limpa o registro à mão; envelopes e TTL de 7 dias continuam valendo, então não há perda de dado. Ver D6 |
| 6 | **Corrida** de duas gravações num canal sem dono | as duas gravam | uma vira dono, a outra `403` (leitura, autorização e gravação sob `_RELAY_LOCK`) |
| 7 | **Medição de tempo** da comparação | n/a | `hmac.compare_digest` |
| 8 | **Relay hostil** reaproveita a prova que recebeu | n/a | prova presa a `host` e `channelId`; só vale nele mesmo |
| 9 | **Vazamento da prova pelo `GET`** | n/a | o `GET` devolve só `data`; teste garante que `ownerHash` nunca sai |

Fora do alcance (declarado, no espírito do [ADR-024](../adr/024-divulgacao-responsavel-e-honestidade-de-seguranca.md)): a prova **não** protege a veracidade do conteúdo; relay malicioso pode apagar o que está no próprio disco; envelope de canal continua sem dono (só `sender` e `sig` do cliente).

## 7. Migração

**Modos**, por `VOX_RELAY_SNAPSHOT_AUTH` no relay: `compat` e `enforce`. O padrão do primeiro release é `compat`; a passagem a `enforce` é decisão de data (D3).

| Relay | Cliente | O que acontece |
|---|---|---|
| antigo | novo | cabeçalho ignorado; funciona como hoje. A resposta não traz `"auth"`, e o cliente pode avisar que aquele relay não protege o canal |
| novo `compat` | antigo (sem prova) | grava com `auth: false`; **não poda**; nunca bloqueia nem se sobrepõe a snapshot autenticado |
| novo `compat` | novo (prova) | fluxo completo de §3 e §5 |
| novo `enforce` | antigo | `403`; o cold boot cai só nos envelopes (TTL de 7 dias); sem perda |
| novo `enforce` | novo | fluxo completo |

Regras de registro:

- `latest_snapshot.json` legado (sem `ownerHash` e sem `auth`) conta como `auth: false`.
- Snapshot autenticado **ignora** `epoch` e `coveredSerial` de um registro `auth: false` (esse registro nunca teve autoridade; só os tetos de §5 contra `maxVisto` valem). É isso que desfaz um travamento de época forjado antes da atualização.
- A poda só roda a partir de snapshot autenticado.
- **Reinício do dono** (segredo perdido, relay mudou de domínio, falso dono): o steward apaga `latest_snapshot.json` do canal e o próximo snapshot com prova reivindica. Documentar no [kit do steward](../operations/steward-relay-kit.md) na implementação. Troca de prova sem o steward fica fora desta fase.
- Sem migração de dados em disco: o registro só ganha campos.

Ordem de entrega: (1) este RFC e a spec ✅; (2) relay (`snapshot_auth.py`, `blind_relay.py`, `server.py`) em `compat` ✅; (3) cliente com `segredoSnapshot`, prova e conferência de `sig`; (4) `enforce`; (5) opção B, se decidida.

## 8. Testes que fecham os `skip`

Em `relay/test_blind_relay_adversarial.py` (os `skip` viram testes de verdade) e em `relay/test_blind_relay_snapshot_auth.py` (novo). Estado alvo: `store_snapshot` recebe a prova e o `host`; o `server.py` lê o cabeçalho e o `Host`.

**Os dois `skip` de `TestSnapshotSemAutenticacao`**

1. `test_snapshot_forjado_com_coveredserial_enorme_nao_apaga_o_canal` (canal com serial 1..10):
   - sem prova, `coveredSerial = 10**9`, modo `enforce` → `403`, os 10 envelopes continuam;
   - o mesmo, em `compat` → grava `auth: false`, os 10 envelopes continuam (sem poda);
   - com prova válida e `coveredSerial = 10**9` → `400` (teto de salto), os 10 continuam;
   - com prova válida e `coveredSerial = 5` → poda só 1..5.
2. `test_epoca_enorme_nao_trava_snapshots_futuros`:
   - sem prova, `epoch = 2**62` → `403` (`enforce`); em `compat`, grava `auth: false`;
   - snapshot legítimo com prova e `epoch = 2` é aceito logo depois, nos dois modos;
   - com prova e `epoch = 2**62` → `400`; o canal aceita o legítimo seguinte.

**Novos** (um por regra de §3, §5, §6 e §7):
prova mal formada → `400`; prova de outro canal → `403`; prova de outro `host` → `403`; segundo dono → `403`; duas gravações simultâneas sem dono (threads) → uma `saved`, uma `403`; reenvio idêntico → `idempotent` e arquivo intacto (mtime igual, sem poda nova); mesma época com corpo diferente → `409` com `currentEpoch`; época menor → `409`; `GET` nunca devolve `ownerHash`; registro legado sem dono + snapshot autenticado de época menor → aceito; `compat` com cliente antigo nunca apaga envelope; variável de teto sobrescreve o padrão.

**Cliente** (`tests/`): `EpochCompactor` envia `X-Vox-Snapshot-Proof` igual ao HMAC de §3 com vetores fixos; não envia o cabeçalho sem segredo; recusa aplicar snapshot cuja `sig` não confere com os autores; trata `409` rebuscando o snapshot.

**Terceiro `skip` do arquivo** (`test_resposta_cortada_sinaliza_que_ha_mais`): não é de autenticação, **este RFC não o fecha**. Proposta curta, também pendente de decisão (D7): o `GET /relay/envelope/<canal>` mantém o corpo como lista e passa a mandar `X-Vox-Has-More: 1` e `X-Vox-Next-Serial: <maior serial devolvido>` quando cortou em 100. O teste povoa 120 envelopes e confere os dois cabeçalhos na primeira página e a ausência deles na segunda. Mexe em `server.py`.

## 9. Decisões do dono (2026-11-19)

Tomadas e implementadas no relay (`relay/snapshot_auth.py`, `relay/blind_relay.py`, `relay/server.py`). O cliente fica para outro PR.

- **D1 — Mecanismo: opção A.** Prova HMAC-SHA256 em `X-Vox-Snapshot-Proof`; o relay guarda só `ownerHash`; só biblioteca padrão. A opção B (§4) segue como fase posterior, sem data.
- **D2 — Quem emite: só autores.** O lado do cliente e a **origem do `segredoSnapshot` ficam fora do PR do relay e são pergunta aberta**: o laboratório atual não tem chave de canal, então falta definir quem sorteia o segredo e por qual caminho cifrado ele chega aos autores. Até lá nenhum cliente envia a prova e todo snapshot cai em `compat` como `auth: false`, **sem poda** (ver "Pendente do cliente" abaixo).
- **D3 — Calendário.** `compat` é o padrão agora (`VOX_RELAY_SNAPSHOT_AUTH=compat|enforce`; valor ausente ou desconhecido vale `compat`); `enforce` num release seguinte, depois que o cliente emitir a prova.
- **D4 — Tetos.** `MAX_COVERED_JUMP = 1000` e `MAX_EPOCH_JUMP = 16`, sobrescrevíveis por `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP` e `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP` (inteiro positivo; vazio, inválido ou `0` volta ao padrão). A limitação do relay novo e vazio (§5) continua valendo e é documentada.
- **D5 — Vínculo ao host e ao canal.** A prova leva `host` e `channelId` (cálculo do cliente, §3). A correção do §3 explica por que o relay não confere isso por conta própria.
- **D6 — Primeiro a provar vira dono.** Limite aceito. **Como o steward limpa o registro:** apagar `latest_snapshot.json` do diretório do canal (`<VOX_RELAY_BLIND_DIR>/<canal>/latest_snapshot.json`); o próximo snapshot com prova reivindica o canal. Os envelopes e o TTL de 7 dias não são tocados. Procedimento no [kit do steward](../operations/steward-relay-kit.md) e no [`relay/README.md`](../../relay/README.md).
- **D7 — Contrato de resposta.** `409` com `{ "error", "currentEpoch", "currentCoveredSerial" }` para conflito e `200` com `"idempotent": true` para reenvio idêntico (sem regravar nem podar). A resposta do `POST` nunca traz `ownerHash`. O **aviso de corte no `GET` de envelopes (o terceiro `skip`) fica fora** deste trabalho.

### Como ficou no relay

- Sem dono e sem prova: `compat` grava `auth: false` e **nunca poda**; `enforce` devolve `403`.
- Canal com dono: só a mesma prova (`hmac.compare_digest`); sem prova ou prova diferente, `403` nos dois modos. Um snapshot sem prova nunca se sobrepõe a um autenticado.
- Registro legado (sem `auth`) ou `auth: false` não tem dono: não vale contra snapshot autenticado (`epoch` e `coveredSerial` dele são ignorados; só os tetos contra o maior `serial` visto valem).
- Corpo e prova mal formados: `400`. `SnapshotConflict` é subclasse de `ValueError`; `SnapshotForbidden` não é (vira `403`).
- Ler, autorizar e gravar são uma decisão só sob `_RELAY_LOCK`; a poda só roda para snapshot autenticado.
- `Access-Control-Allow-Headers` passou a listar `X-Vox-Snapshot-Proof` (sem isso o preflight do navegador barraria o cabeçalho).

### Pendente do cliente (fora do PR do relay)

1. **D2:** quem sorteia o `segredoSnapshot` e como ele chega aos autores (pergunta aberta ao dono).
2. `EpochCompactor` calcular e enviar `X-Vox-Snapshot-Proof` (§3), com vetores fixos de teste.
3. Conferir a `sig` do snapshot contra os autores do canal antes de `mergeSnapshot` (§6, ataque 5; obrigatório).
4. Tratar `409` rebuscando o snapshot e `403` como "este relay tem outro dono" (e `200` com `idempotent` como sucesso).
5. Depois disso, subir um relay para `enforce` e só então promover o padrão.

Enquanto o item 2 não existe, **a poda por snapshot está desligada na prática**: nenhum snapshot chega autenticado, então os envelopes saem só pelo TTL de 7 dias.

## 10. Consequências

- **Quem usa:** nada visível; a prova e a conferência viajam sozinhas.
- **Quem opera relay:** uma variável nova (`VOX_RELAY_SNAPSHOT_AUTH`) e o procedimento de reinício do dono.
- **Custo:** um cabeçalho de 64 caracteres e um HMAC por snapshot (um a cada 50 atualizações do canal).
- **Não muda:** TTL de 7 dias, teto de 512 KB, poda por `serial`, envelope de canal.
