# Perfil institucional — Vox Brasil (primeiro contato)

**RouteId fixo:** `vx_voxbrasil_welcome` (sistema; não assinatura P2P de usuário).

## Papel

- **Conta oficial / voz da plataforma** (não pessoa, não perfil estereótipo UF).
- Primeiro contato de todo visitante após onboarding.
- Tom **institucional e amigável**; links para `#/voxpedia`, `#/settings/network`, `#/people`.
- Botões: **Seguir** (watch), **Mensagem** (DM welcome).

## DM boas-vindas

Mensagem local única (sem E2E do sistema), seed `welcome-dm-vox-brasil-v2` em [`vox-welcome-profile.js`](../../client/js/vox-welcome-profile.js):

> Olá! 👋 Sou a conta oficial do Vox Brasil — sua voz de boas-vindas na plataforma. Use **Pessoas** para achar gente ou compartilhe `#/connect/seu_vx_`. Glossário leigo: **Voxpedia** (#/voxpedia). Rede: Configurações → Sua rede.

## UI

- Card pós-pacto (1x por aparelho, flag `vox-welcome-card-seen`).
- Inbox: conversa welcome pinada no topo quando existir.

## Assets

- Avatar oficial: `client/icons/profile-vox-official-512.png` — logo branco em tile opaco, squircle (qualquer tema).
- Gerado por `tools/generate_brand_icons.py` a partir de `docs/vox_logo_branco.jpg`.
