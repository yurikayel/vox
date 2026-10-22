# Identidade Amigável & DNS Comunitário — Vox (Fase 5)

Este documento descreve o funcionamento do sistema de **handles amigáveis (`@handle`)**, as opções de **CNAME/DNS comunitário** e o posicionamento técnico e regulatório do projeto Vox.

---

## 1. Posicionamento Honesto

* **O Vox NÃO é dono do TLD `.vox.br`:** O sufixo `.br` é gerido pelo Registro.br (CGI.br/NIC.br) e obedece a regras de CNPJ/CPF com custos anuais de manutenção.
* **O namespace `@handle` é nativo do protocolo `vox-brasil`:** Qualquer usuário com uma carteira Arweave pode reivindicar um alias (ex: `@maria`) através de uma transação permanente assinada no permaweb.
* **URLs Oficiais no PWA:**
  * `https://<seu-host>/#/u/@maria`
  * `https://<seu-host>/#/h/maria`
  * Parâmetro de busca compatível: `https://<seu-host>/?h=maria`
* **ArNS (Arweave Name System):** Diferido para a **Fase 5.1**. O registro de nomes ArNS envolve custo em tokens e processo de leilão externo; não deve bloquear o uso gratuito do PWA.

---

## 2. Camada A — Alias no Protocolo (On-Chain)

### Convenção de Tags Arweave

| Tag | Valor | Descrição |
|-----|-------|-----------|
| `App-Name` | `vox-brasil` | Identificador canônico da rede |
| `Type` | `handle` | Tipo da transação de reivindicação |
| `Handle` | `[a-z0-9-]{3,24}` | Slug amigável normalizado |
| `Owner-Addr` | `<arweave_address>` | Endereço do proprietário (redundante com `owner`) |

### Regras de Resolução e Conflito

1. **Regra Temporal Padrão:** O cliente consulta transações com ordenação `HEIGHT_DESC` (bloco mais recente primeiro).
2. **Detecção de Conflito Social:**
   * Se múltiplas carteiras distintas reivindicarem o mesmo slug (ex: `@maria` reivindicado por `addr_A` e `addr_B`), o cliente **não toma partido**.
   * Ao acessar `#/h/maria`, a interface exibe um painel de **Ambiguidade de Handle**, listando todos os candidatos com links para que o usuário decida qual perfil deseja abrir.
   * Não existe tribunal central, taxa de mediação ou poder de confisco por mantenedores do projeto.
3. **Slugs Reservados:** Slugs essenciais de sistema são protegidos na validação client-side (`admin`, `vox`, `www`, `root`, `api`, `system`, `mod`, `suporte`, `ajuda`).

---

## 3. Camada B — CNAME e Wildcard DNS Comunitário (Opcional)

Operadores comunitários que queiram oferecer links no formato `maria.sua-comunidade.org` podem configurar seus próprios domínios:

### Opção 1: Cloudflare Pages com Wildcard

1. No Cloudflare Dashboard do seu domínio (ex: `comunidade.org`), crie uma regra DNS:
   - **Tipo:** `CNAME`
   - **Nome:** `*` (wildcard)
   - **Destino:** `<seu-projeto>.pages.dev`
2. No Cloudflare Pages, adicione o domínio customizado com wildcard `*.comunidade.org`.
3. O `index.html` do Vox detecta automaticamente o primeiro segmento do hostname:
   - Se o usuário acessar `https://maria.comunidade.org`, o script inicial lê `hostname.split('.')[0] == 'maria'` e redireciona internamente para `#/h/maria`.

### Opção 2: Redirecionador Estático Simples (`redirect.html`)

Disponibilizado em [`client/redirect.html`](../client/redirect.html):
- Recebe query parameters do tipo `?h=maria` ou subdomínios e redireciona instantaneamente para `index.html#/h/maria`.
- Não exige nenhuma linguagem backend ou banco de dados.

---

## 4. Camada C — ArNS (Fase 5.1 — Futuro)

O **ArNS (Arweave Name System)** utiliza contratos SmartWeave/Warp e tokens para associar nomes imutáveis a Transaction IDs do Arweave.

* Na **Fase 5.1**, o Vox poderá adicionar uma função de resolução `resolveArns(domain)` como terceiro degrau de fallback:
  1. Consulta a tag `Type: handle` no GraphQL da rede `vox-brasil`.
  2. Consulta mapeamento local em cache (`localStorage`).
  3. *(Fase 5.1)* Consulta ao registry descentralizado do ArNS.
