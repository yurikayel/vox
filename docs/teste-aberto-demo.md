# Teste aberto — praça demo padrão

> **Status:** canônico para testadores · **Comunidade id:** `demo-aprenda-vox`  
> **Roteiro in-app:** `#/ajuda/teste` · **Bugs:** [issue template tester](../.github/ISSUE_TEMPLATE/bug-tester.yml)

## Praça padrão

Use esta rota como **plaza estável** do teste aberto:

```text
#/c/demo-aprenda-vox
```

- **Título no app:** Brasil Estereótipo (Demo Vox) — tour com 27 perfis fictícios (um por UF).
- **Conteúdo:** semeado no **IndexedDB local** (`demo-seed.js`) + fallback **mock** quando gateways Arweave não devolvem tópicos. **Não há posts on-chain** garantidos para esta comunidade; o tour é honestamente **offline-first / demo**.
- **Feira demo (opcional):** `#/c/demo-feira-local?tab=listings` — classificados mock.

## O que *não* é praça de teste aberto

| Id | Uso |
|---|---|
| `demo-aprenda-vox-mirror` | Demo de **espelho comunitário** (steward/relay). Pode ficar vazia sem relay; testadores devem preferir `demo-aprenda-vox`. |
| Comunidades que você criar | Ritual **seed pós-criação** (checklist V-P05) aplica-se só a comunidades reais suas — não ao tour demo. |

## Checklist seed (V-P05) e 404

- O módulo `community-seed-checklist.js` entra no **shell offline** do Service Worker (`client/sw.js`); não depende de URL externa.
- Testadores **não** devem ver o ritual de seed dentro de `demo-aprenda-vox` — é comunidade mock, não piloto humano.
- Se algo falhar ao carregar JS do app, faça hard refresh (`Ctrl+Shift+R`) e confira `CACHE_NAME` em `#/status`.

## Reportar bug

Abra um issue com o formulário **[tester] Bug report** (labels `tester` + `bug`), informando `CACHE_NAME`, URL, hash da rota, expectativa vs. resultado e aparelho/navegador.
