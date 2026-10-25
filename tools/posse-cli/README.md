# POSSE CLI (headless)

Dispara webhooks com o JSON exportado pelo cockpit POSSE do PWA (`type: vox-posse-export`).

```bash
# stdin
cat export.json | node tools/posse-cli/posse-cli.mjs --webhook https://discord.com/api/webhooks/...

# arquivo
node tools/posse-cli/posse-cli.mjs --file export.json --dry-run --webhook https://example.com/hook
```

Mastodon: use intent no navegador ou API da instância — ver `client/DEV.md` §36.
