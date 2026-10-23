# Wizard operador Steward (brainstorm)

**Rota alvo:** `#/settings/network/steward` · **MVP 5 passos**

1. Pledge camada 3 + link compliance  
2. Escolher `communityId`  
3. Checklist deploy → [`relay/deploy/README.md`](../relay/deploy/README.md)  
4. Colar WSS/TURN/relay HTTP + **Verificar Relay HTTP**  
5. `mirrorCommunityToRelay` + copiar `#/c/<slug>`

**Persistência:** mesmas keys que `#/settings/network` (`vox-custom-signaling-url`, `vox-relay-http-url`, `vox-custom-turn-config`, `vox-peer-settings`) + draft `vox-steward-wizard-draft`.

**Implementação:** `steward-wizard.js`, `renderStewardWizard`, tests — branch `feat/steward-wizard-ui` (Cursor).

*Tom Cantina + detalhes: spike wizard operador (23/10).*
