# Stitch — referências VTT + capturas Mesa

> **Status:** pesquisa (handoff design, interno) · **Revisado:** 2026-11-20  
> Produto: [mesa-referenciais-vtt-v0.md](../specs/mesa-referenciais-vtt-v0.md) · [mesa-ui-brainstorm-v0.md](../specs/mesa-ui-brainstorm-v0.md)

Pacotes e capturas disponíveis em `docs/design/stitch-captures/` para anexar no Stitch ao redesenhar o sanctum `#/dungeon/*`:

| Conjunto | Caminho / Padrão |
| :--- | :--- |
| **Vox (estado atual)** | `stitch-captures/dungeon-ui-2026-11-20__*.png` (24 PNG) |
| **Referências VTT (flat)** | `stitch-captures/vtt-references-full-2026-11-20__*.png` + `vtt-references-v3-2026-11-20__*.png` (143 PNG) |
| **Dossiê Owlbear (Stitch)** | `stitch-captures/owlbear-stitch-dossier/assets/` (139 figuras) + [OWLBEAR-STITCH-DOSSIER.md](./stitch-captures/OWLBEAR-STITCH-DOSSIER.md) |
| **Total em disco** | **306 PNG** + 2 guias `.md` (ZIPs de coleta removidos do repo para manter leveza) |

## Regenerar

```bash
# Vox (servidor local em client/:8080)
python e2e/capture_dungeon_stitch.py

# VTT v3 — tiles legíveis (recomendado p/ Stitch)
python e2e/vtt_refs/run_v3.py --fresh

# VTT v2 — captura pontual (viewport em docs desde 20/11)
python e2e/capture_vtt_references.py

# Manifest v1 legado
python e2e/capture_vtt_references.py --manifest docs/design/stitch-captures/vtt-reference-manifest.yaml

# Smoke / um frame
python e2e/capture_vtt_references.py --only roll20-yt-tabletop --output-dir vtt-references-full-2026-11-20
```

- **Docs em `stitch-captures/`:** [STITCH-MESA-GUIA.md](./stitch-captures/STITCH-MESA-GUIA.md) (brief + prompts) · [OWLBEAR-STITCH-DOSSIER.md](./stitch-captures/OWLBEAR-STITCH-DOSSIER.md) (guias Owlbear + figuras).  
- **PNGs em `stitch-captures/`:** 306 imagens (24 Vox atual + 143 refs VTT flat + 139 figuras do dossiê Owlbear).

### v3 + Google

| Item | Nota |
| :--- | :--- |
| **Stitch (uso)** | Prompts **§9** em [STITCH-MESA-GUIA.md](./stitch-captures/STITCH-MESA-GUIA.md) (ordem jornada 0–12) + `dungeon-ui-2026-11-20__*.png` + refs flat |
| **Guia designer** | [STITCH-MESA-GUIA.md](./stitch-captures/STITCH-MESA-GUIA.md) |
| **Owlbear (Stitch)** | [OWLBEAR-STITCH-DOSSIER.md](./stitch-captures/OWLBEAR-STITCH-DOSSIER.md) + `owlbear-stitch-dossier/assets/` — `python e2e/owlbear_stitch_dossier.py` |
| **Google Images** | **Descontinuado** (reCAPTCHA) |

### Estratégia quatro plataformas

| Plataforma | Core 12 | Docs oficiais (bonus ≥13) |
| :--- | :--- | :--- |
| Roll20 | YouTube Crash Course | Help Center 13–28 (mapa, battle maps, tokens, fichas) |
| Owlbear | YouTube playlist | `docs.owlbear.rodeo/docs/*` condensado no dossiê |
| Foundry | YouTube Basics | `foundryvtt.com/article/*` 13–18 |
| Mini Kraken | — (só docs) | ERPG guide 01–12 (core = webpages) |

## Matriz feature × plataforma (v2)

Taxonomia alinhada a [mesa-ui-brainstorm-v0.md](../specs/mesa-ui-brainstorm-v0.md): 12 `feature_id` × 4 plataformas. Ver `MATRIX.md` dentro do ZIP full.

| Zona Mesa | Roll20 | Owlbear | Foundry | Mini Kraken |
| :---: | :--- | :--- | :--- | :--- |
| Z5 hub | yt Crash Course #1 | getting started | world setup | dashboard / campaigns |
| Z2 mapa | tabletop layout + center | sync / outliner | scene + tokens | scenes + tokens docs |
| Z3 crônica | chat + dice | dice | chat + dice | chat-journal doc |
| Z4 GM | lighting + initiative | fog + trackers | walls + combat + lights | tools + GM screen |
| Z1 dock | — | — | — | VTT dock + mobile doc |

**Bonus (não entram na meta 12/core):** `roll20/13–41-help-*` (29 Help) · `owlbear/13–18-docs-*` · `foundry/13–18-docs-*`.

**Lacunas conscientes:** Owlbear sem `character_sheet` in-app; Roll20/Foundry sem shot dedicado `mobile_or_dock` (Kraken cobre dock/mobile nos docs).

## Uso no Stitch

1. Abra [STITCH-MESA-GUIA.md](./stitch-captures/STITCH-MESA-GUIA.md) **§9** e cole os prompts **0 → 12** na ordem (jornada `#/dungeon` até sair).
2. Anexe por passo os PNG listados em **Anexar** + [OWLBEAR-STITCH-DOSSIER.md](./stitch-captures/OWLBEAR-STITCH-DOSSIER.md) quando citado.
3. Copiar **padrão de interação**, não logotype/cores das marcas; tokens Vox: [sovereign-agora.md](./sovereign-agora.md).

## Dependências opcionais da coleta VTT

- `playwright` + Chromium (páginas + YouTube primário).
- `yt-dlp` + `imageio-ffmpeg` (fallback frame quando stream de vídeo disponível).
- `pyyaml` (manifest).

## Nota legal

Screenshots e frames pertencem aos respectivos titulares (Roll20, Owlbear Rodeo, Foundry Gaming, Mini Kraken). Uso interno para mood board; não incluir no bundle PWA.