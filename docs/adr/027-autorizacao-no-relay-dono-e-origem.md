# ADR-027: Autorização no relay — prova do dono, chave de apagar e política de origem

**Status:** accepted · implementado (SW v7.65) · **Revisado:** 2026-11-10 · **Relacionados:** PM-94, [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md), [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [THREAT-MODEL T22](../THREAT-MODEL.md), [referência da API](../specs/relay-api.md)

## 1. Contexto

O relay completo (`relay/server.py`) nasceu como "relay cego": guarda envelopes cifrados com prazo, sem saber de quem são. Isso basta para conteúdo que já chega assinado ou cifrado. Não basta para duas operações que mudam o estado de outra pessoa:
- **gravar o cofre de recuperação** (`/memory/vault/<chave>`);
- **apagar um envelope da caixa de DMs** (`DELETE /inbox/<endereço>/<id>`).

Além disso, o relay e o nó Windows (`ZeroCentralMemory`) escutam em loopback e respondem com CORS aberto, e podem ficar expostos por túnel. A revisão DevSecOps de 10/11/2026 pediu escrita e remoção autorizadas pelo dono, conferência de `Origin` e `Host`, `application/json` obrigatório e limite por IP.

O Vox não tem conta no servidor. Então a prova de dono precisa sair de algo que **só a pessoa tem**, sem cadastro e sem o servidor guardar segredo reutilizável.

## 2. Decisão

1. **Cofre: prova do dono derivada da Senha Soberana.**
   - O aparelho deriva `ownerToken` = PBKDF2-SHA256(senha, sal `vox-vault-v2:dono`, 600 mil iterações), 32 bytes em hex (`vault-crypto.deriveVaultOwnerToken`). O sal é diferente do endereço, então o endereço público não revela a prova.
   - A gravação manda `{ lookupKey, record, ownerToken }`. O servidor guarda só `ownerHash` = SHA-256 da prova, dentro do próprio registro, e nunca o devolve no `GET`.
   - **Regras** (`relay/vault_store.py` e `VaultOwnerGuard.cs`, iguais):
     - cofre com dono: só grava (ou revoga) com a mesma prova, comparada em tempo constante → senão `403`;
     - cofre v2 novo sem prova → `403`; prova mal formada → `400`;
     - registro antigo sem dono aceita a primeira gravação com prova, que vira o dono; a marca de revogado sem prova só entra em registro sem dono.
2. **Caixa de DMs: chave de apagar dentro da mensagem.**
   - Quem envia sorteia 16 bytes, cifra com a mesma chave AES da mensagem (IV próprio, AAD `vox-dm-delete-v1|<id>`) e põe no envelope `del: { iv, ct, hash }`, com `hash` = SHA-256 da chave (`crypto-dm.seal`).
   - O relay guarda `delHash`. O `DELETE` de um envelope com `delHash` precisa do cabeçalho `X-Vox-Delete-Token` com a chave; só o destinatário consegue abri-la (`crypto-dm.openDeleteToken`). Envelope antigo, sem `del`, continua apagável até o prazo de 72 h.
3. **Política de pedido** (`relay/request_guard.py`; `NodeRequestGuard` no nó Windows), antes de qualquer rota:
   - **Host:** com o servidor escutando em loopback, o `Host` precisa ser de loopback, o túnel do próprio nó, ou um nome em `VOX_RELAY_ALLOWED_HOSTS` → senão `421`.
   - **Origin:** `POST` e `DELETE` de navegador só das origens do app (GitHub Pages, Cloudflare Pages, qualquer localhost) ou de `VOX_RELAY_ALLOWED_ORIGINS` → senão `403`. Pedido sem `Origin` (linha de comando, nó de steward) passa.
   - **Content-Type:** `POST` só com `application/json` → senão `415`.
   - **Limite por IP** (só no relay Python): `VOX_RELAY_WRITE_LIMIT_PER_MIN` escritas por minuto (padrão 120) → senão `429`. O nó Windows escuta só em loopback e não aplica limite por IP.

## 3. Consequências

- **O que muda para quem usa:** nada visível. O cofre e a DM continuam iguais; a prova e a chave de apagar viajam sozinhas.
- **Para quem opera nó por túnel:** o endereço do túnel precisa estar em `VOX_RELAY_ALLOWED_HOSTS` no relay Python ([kit do steward](../operations/steward-relay-kit.md)). O nó Windows libera o próprio túnel sozinho.
- **Espelho do app em outro domínio:** precisa entrar em `VOX_RELAY_ALLOWED_ORIGINS` para gravar.
- **Limites:**
  - cofre v2 gravado antes do SW v7.65 fica sem dono até a próxima gravação com a senha;
  - envelope de DM sem `del` (cliente antigo) segue sem chave de apagar até expirar;
  - leitura (`GET`) continua aberta: o conteúdo já é cifrado, e o endereço do cofre custa tanto quanto a senha;
  - as outras escritas (memória central, relay cego, espelho) seguem sem dono: o conteúdo é conferido por assinatura no aparelho (PM-86), e elas passam pela política de pedido e pelo limite por IP.
- **Divulgação responsável ([ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md)):** este ADR descreve o comportamento novo; os detalhes do achado ficam no relatório privado.
