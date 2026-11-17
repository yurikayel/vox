# Open Frames 2.0 — SDK mínimo (Vox)

> **Status:** parcial (Open Frames declarativo no ar; host em iframe só em laboratório, conforme o FEATURES) · **Owner:** mantenedor · **Revisado:** 2026-11-17

## Objetivo

Permitir mini-apps embarcados (enquetes, contadores) com **iframe sandbox** e contrato **postMessage** — complemento ao Open Frames declarativo em `client/js/frames.js` (sem script remoto no feed).

## Mensagens (whitelist)

| type | Direção | payload |
|------|---------|---------|
| `of:ready` | frame → host | `{ frameId }` |
| `of:resize` | frame → host | `{ height: number }` |
| `of:action` | frame → host | `{ action, value? }` |

Origens permitidas: lista explícita no host (`allowedOrigins`). Além da origem, o host só aceita mensagens da janela do próprio iframe (`event.source === iframe.contentWindow`).

**Origem opaca:** o iframe recomendado (abaixo) não tem `allow-same-origin`, então roda em origem opaca e o navegador entrega as mensagens dele com `origin === "null"`, a mesma de qualquer outra página sandboxed. Para iframe assim, o host aceita `"null"` sozinho (`OPAQUE_ORIGIN`), sempre amarrado à janela do iframe; sem essa amarra, qualquer sandbox poderia falar com o host.

## Host

`client/js/open-frames-host.js` — `attachOpenFrameHost(container, iframe, { allowedOrigins, onAction, win })` (devolve a função que desliga o host); `handleFrameMessage(event, { allowedOrigins, source })`; `isOpaqueSandbox(iframe)`.

Iframe recomendado:

```html
<iframe sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
```

## Demo

Frame estático em `client/embed/frame-demo.html` (contador local; o lab `#/labs/frames` mostra a última ação recebida) — carregar apenas em páginas de teste / Voxpedia até curadoria P1.1.

## Segurança

- Sem `allow-same-origin` + `allow-scripts` juntos em produção.
- Não carregar URLs arbitrárias de usuários sem moderação.
