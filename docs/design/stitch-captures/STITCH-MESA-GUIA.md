# Stitch — Mesa Vox (guia designer)

> **Status:** pesquisa (brief de design) · **Revisado:** 2026-11-25 · **Uso:** anexar no Stitch ao redesenhar `#/dungeon/*`  
> **Relacionados:** [mesa-ui-brainstorm-v0.md](../../specs/mesa-ui-brainstorm-v0.md) · [sovereign-agora.md](../sovereign-agora.md)

Somente capturas da **UI própria do Vox**. Referências de produtos VTT de terceiros e scrapers foram removidos do repositório (higiene IP / PTL).

---

## 1. Pacote em disco

| Pacote | Conteúdo |
| :--- | :--- |
| **`dungeon-ui-2026-11-20__*.png`** | Estado atual Vox `#/dungeon/*` (**24** capturas desktop + mobile) |
| **Prompts (§3)** | Blocos coláveis para redesenho no Stitch |

**Regenerar (só Vox):**

```bash
python -m http.server 8080 --directory client
python e2e/capture_dungeon_stitch.py
```

---

## 2. Objetivo

Para cada zona de produto da Mesa, usar as capturas `dungeon-ui-*` como base visual. Tokens e tipografia: [sovereign-agora.md](../sovereign-agora.md). Não anexar assets de terceiros.

| Zona | Foco |
| :--- | :--- |
| Z1 | Shell / dock / mobile |
| Z2 | Mapa (GM e jogador) |
| Z3 | Crônica / dados / journal |
| Z4 | Ferramentas táticas / névoa / iniciativa |
| Z5 | Hub campanha / salas |
| Grimório | Ficha |

---

## 3. Prompts Stitch (ordem da jornada)

Anexar sempre o PNG `dungeon-ui-2026-11-20__*` correspondente ao passo.

### Acampamento

**Anexar:** `dungeon-ui-2026-11-20__01-acampamento-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__01-acampamento-mobile-390x844-dark.png`

Brief: hub de campanha Vox — lista de salas, entrar na mesa, identidade local. Hierarquia clara, sem chrome de marketplace.

### Grimório / ficha

**Anexar:** `dungeon-ui-2026-11-20__02-grimorio-ficha-lyra-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__02-grimorio-ficha-lyra-mobile-390x844-dark.png`

Brief: ficha em abas (Jogar / Habilidades / Itens / Sobre), atributos e recursos legíveis.

### Mesa GM

**Anexar:** `dungeon-ui-2026-11-20__03-mesa-gm-vila-nova-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__03-mesa-gm-vila-nova-mobile-390x844-dark.png`

Brief: mapa herói, controles de mestre, névoa e tokens sem poluir a área central.

### Mesa jogador

**Anexar:** `dungeon-ui-2026-11-20__04-mesa-jogador-vila-nova-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__04-mesa-jogador-vila-nova-mobile-390x844-dark.png`

Brief: projeção enxuta — o que o jogador não deve ver (ferramentas GM) some.

### Escudo do mestre

**Anexar:** `dungeon-ui-2026-11-20__05-escudo-mestre-vila-nova-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__05-escudo-mestre-vila-nova-mobile-390x844-dark.png`

Brief: painel de suporte ao mestre (status do grupo, atalhos) sem competir com o mapa.

### Mesa floresta

**Anexar:** `dungeon-ui-2026-11-20__06-mesa-floresta-de-vidro-desktop-1440x900-dark.png` · `dungeon-ui-2026-11-20__06-mesa-floresta-de-vidro-mobile-390x844-dark.png`

Brief: segunda cena — mesma estrutura de chrome; validar contraste light/dark nos pares `*-light.png` se redesenhar tema claro.

---

## 4. Checklist rápido

- [ ] Só anexou `dungeon-ui-2026-11-20__*.png` (nenhum asset externo)
- [ ] Desktop + mobile quando existir o par
- [ ] Regenerou com `e2e/capture_dungeon_stitch.py` após mudança de UI
- [ ] `python e2e/verify_stitch_guide_refs.py` → OK
