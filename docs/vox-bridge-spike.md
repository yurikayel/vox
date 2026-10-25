# Vox Bridge — spike técnico (P2, não ship P0/P1)

## Objetivo

Extensão WebExtension **MV3** em repositório separado `vox-bridge/` para autopost em redes que não expõem intents estáveis (Instagram, Threads). **Fora do PWA** até governança e ToS revisados.

## Contrato preliminar (PWA ↔ extensão)

```json
{
  "v": 1,
  "type": "vox-bridge-posse",
  "topicId": "top_…",
  "canonicalUrl": "https://…/#/t/…",
  "title": "",
  "body": "",
  "destinations": ["threads", "instagram"]
}
```

- PWA envia via `chrome.runtime.sendMessage` (externally_connectable) ou clipboard handoff.
- Extensão **nunca** recebe chaves privadas ou seed de wallet.

## Manifest stub (futuro)

```json
{
  "manifest_version": 3,
  "name": "Vox Bridge",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://www.instagram.com/*", "https://www.threads.net/*"]
}
```

## Riscos

- Violação de ToS / automação DOM → conta banida.
- Superfície XSS se a extensão injeta em páginas de terceiros.

## Próximo passo P2

Repo vazio + README + manifest; integração PWA só após flag `#/settings/network` “Bridge experimental”.

**Stub in-repo:** [`vox-bridge/`](../vox-bridge/) (MV3 background only) · schema test `tests/vox-bridge-schema.test.js`.
