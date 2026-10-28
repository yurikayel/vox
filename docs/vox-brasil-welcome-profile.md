# Perfil institucional — Vox (primeiro contato)

**RouteId fixo:** `vx_voxbrasil_welcome` (sistema; não assinatura P2P de usuário).

## Papel

- **Conta oficial / voz da plataforma** (não pessoa, não perfil estereótipo UF).
- Primeiro contato de todo visitante após onboarding.
- Tom **institucional e amigável**; links para `#/voxpedia`, `#/settings/network`, `#/people`.
- **Watch** automático + **DM** de boas-vindas (sem card grande no feed).

## DM boas-vindas

Mensagem local única (sem E2E do sistema), seed `welcome-dm-vox-brasil-v3` em [`vox-welcome-profile.js`](../client/js/vox-welcome-profile.js). Copy idiocracy-friendly PT com emoji; menciona Pessoas e Voxpedia.

## UI

- Feed: faixa fina opcional (`vox-welcome-dm-intro-seen`) ou toast na primeira seed — link para `#/dm/vx_voxbrasil_welcome`.
- Thread welcome: bloco compacto com links (Pessoas · Voxpedia · perfil).
- Inbox: conversa welcome pinada no topo quando existir.

## Assets

- Avatar oficial: `client/icons/profile-vox-official-512.png` — logo branco em tile opaco, squircle (qualquer tema).
- Gerado por `tools/generate_brand_icons.py` a partir de `docs/vox_logo_branco.jpg`.
