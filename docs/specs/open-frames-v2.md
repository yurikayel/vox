# Open Frames 2.0 — SDK mínimo (Vox)

## Objetivo

Permitir mini-apps embarcados (enquetes, contadores) com **iframe sandbox** e contrato **postMessage** — complemento ao Open Frames declarativo em `client/js/frames.js` (sem script remoto no feed).

## Mensagens (whitelist)

| type | Direção | payload |
|------|---------|---------|
| `of:ready` | frame → host | `{ frameId }` |
| `of:resize` | frame → host | `{ height: number }` |
| `of:action` | frame → host | `{ action, value? }` |

Origens permitidas: lista explícita no host (`allowedOrigins`).

## Host

`client/js/open-frames-host.js` — `attachOpenFrameHost(container, iframe, { allowedOrigins, onAction })`.

Iframe recomendado:

```html
<iframe sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
```

## Demo

Frame estático em `client/embed/frame-demo.html` (contador local) — carregar apenas em páginas de teste / Voxpedia até curadoria P1.1.

## Segurança

- Sem `allow-same-origin` + `allow-scripts` juntos em produção.
- Não carregar URLs arbitrárias de usuários sem moderação.
