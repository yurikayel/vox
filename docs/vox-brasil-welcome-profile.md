# Perfil institucional — Vox Brasil (primeiro contato)

**RouteId fixo:** `vx_voxbrasil_welcome` (sistema; não assinatura P2P de usuário).

## Papel

- Primeiro contato de todo visitante após onboarding.
- Tom **institucional** (não Wuher); links para `#/settings/network`, `#/people`, proposta.
- Botões: **Seguir** (watch), **Mensagem** (DM welcome).

## DM boas-vindas

Mensagem local única (sem E2E do sistema), seed em [`vox-welcome-profile.js`](../../client/js/vox-welcome-profile.js):

> Olá! Sou o contato inicial do Vox Brasil. Use Pessoas para achar gente, ou compartilhe seu link `#/connect/seu_vx_`. Dúvidas de rede: Configurações → Sua rede.

## UI

- Card pós-pacto (1x por aparelho, flag `vox-welcome-card-seen`).
- Inbox: conversa welcome pinada no topo quando existir.

## Assets

- Avatar padrão: `client/icons/icon.svg` até arte dedicada.
