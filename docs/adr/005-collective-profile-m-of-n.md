# ADR-005: Perfil coletivo M-de-N (tese T02)

> **Status:** proposed (spec + lab) · **Owner:** tese T02 · **Revisado:** 2026-10  
> **Não** motor de produção. T02 permanece `tese` no mapa da praça cívica.

## Contexto

Militância pede **contas de organização** (sindicato, diretório, conselho) com mais de uma pessoa no controle. Hoje o PWA é **uma chave ECDSA P-256 por aparelho**: `ensureLocalAccount` em [`local-account.js`](../../client/js/local-account.js) gera um par, persiste JWK em `localStorage` e deriva `routeId` `vx_…` (SHA-256 de `P-256:x:y`). Não há cofre compartilhado, nem threshold, nem perfil “da entidade” distinto da pessoa no telefone.

Este ADR fixa a tese e um spike reproduzível. **Não** substitui T01 (backup `.voxid`), **não** migra a curva, **não** marca T02 como `já existe`.

## Decisão

### Identidade continua `vx_…` P-256

- Curva: **ECDSA P-256** via WebCrypto (`ECDSA` + `SHA-256`).
- `routeId`: prefixo `vx_` como hoje. **Não** Ed25519 neste ciclo (o motor de produção permanece P-256).
- Cada membro do coletivo continua sendo **uma** identidade local no próprio aparelho. O coletivo **não** ganha um segundo `routeId` mágico no `#/perfil`.

### M-de-N = multi-assinatura independente (não secret sharing)

M membros, de um conjunto declarado de N, assinam **o mesmo manifesto canónico** (nome, finalidade, lista de JWKs públicas, limiar M). A verificação no cliente conta assinaturas **válidas e distintas** e exige `validCount >= M`.

Isto **não** é:

- threshold ECDSA (uma única chave coletiva fatiada);
- Shamir / shares de um `d` secreto;
- um `routeId` coletivo derivado de um único par compartilhado.

**Lacuna explícita:** um sprint não entrega threshold criptográfico P-256. O spike prova o fluxo humano e a verificação M-de-N com **assinaturas independentes**. Um motor futuro de chave coletiva compartilhada exigiria ADR próprio.

### O que o PWA **não** faz hoje

| Hoje | Tese / lab |
|------|------------|
| 1 chave P-256 neste aparelho | N chaves de membros; M assinam |
| `#/perfil` = essa chave | `#/perfil` **não** muda neste lote |
| Sem limiar | Manifesto local com `threshold: M` |
| Sem servidor de identidade Vox | Continua sem servidor a guardar shares |

### Fluxo humano (lab)

1. N membros exportam a **JWK pública** (não a privada) do aparelho de cada um.
2. Alguém monta o manifesto local: nome do coletivo, texto, lista de membros, M.
3. M membros assinam o corpo canónico **no próprio aparelho** (ou, no spike, com chaves efémeras de laboratório).
4. Qualquer cliente verifica as M assinaturas contra as JWKs da lista.
5. **Nenhum servidor Vox armazena shares, privadas, nem o manifesto.** Distribuição = ficheiro JSON / QR / gossip futuro — fora deste lote.

Lab: `?labs=mofn` ou `#/labs/mofn`. Funções puras em [`client/js/labs/collective-mofn.js`](../../client/js/labs/collective-mofn.js). **Não** entra no `#/perfil` de produção. **Não** persiste cofre em IndexedDB (estado só na sessão da página).

### Camada Voxpedia (mutex)

**Perfil coletivo é tese/lab; sua conta continua 1 chave neste aparelho.**

DOC-T16 é dono de [`voxpedia.js`](../../client/js/render/voxpedia.js) neste ciclo — **este lote não edita esse ficheiro**. A frase vive aqui e na UI do lab.

## Riscos

- **Perder M chaves:** se M membros perdem o aparelho/backup, o coletivo **não** consegue assinar atualizações. Mitigação humana: M menor que N, backups T01 por membro — não um cofre Vox.
- **Falsificar “o sindicato”:** M chaves válidas da lista **são** o sindicato, criptograficamente. Um manifesto com membros inventados parece coletivo sem prova fora de banda (ata, cartório, reconhecimento mútuo). O lab **não** emite selo oficial.
- **Maioria hostil:** M cúmplices assinam o que quiserem em nome do conjunto.
- **Confundir lab com conta:** chaves efémeras do lab **não** são a conta `vx_…` do `#/perfil`. Copy obrigatória no lab.

## Fora de escopo

- **T07** kit pericial / cadeia de custódia.
- **POSSE automático Meta/X** (T13 já é opt-in humano; sem post silencioso).
- **T17** quórum territorial (bairro → federação).
- **T19** mesa bipartidária (pós V-P09).
- **T20** prestação de mandato / verba (pós V-P09).
- Ed25519; `share.js`; motor em `local-account.js`; dossiê N=25 §3.6; nova tabela `N=`.

## Consequências

- Spec canónica deste ADR + linha no [índice](../README.md).
- Spike atrás de flag; testes `tests/collective-mofn.test.js` (M passa, M−1 falha, payload adulterado falha).
- T02 **não** passa a `já existe`. Produção continua 1 chave / aparelho.

*T02 perfil coletivo M-de-N — spec + spike lab (27/10).*
