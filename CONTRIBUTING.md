# Contribuindo com o Vox

Guia curto para começar em ~5 minutos. Licença, DCO e lista de contribuidores ficam em [CONTRIBUTORS.md](./CONTRIBUTORS.md).

## 1. Rodar localmente

Requisitos: **Node 22+** (só para testes e lint) e **Python 3.11+** (servidor estático, relay e testes do relay). O cliente não tem build.

```bash
git clone https://github.com/yurikayel/vox.git
cd vox
npm install          # só devDependencies (eslint)
npm test             # node:test (cliente) + unittest (relay)
cd client && python -m http.server 8080   # abra http://127.0.0.1:8080/
```

Opcional: `npm start` sobe a sinalização WebRTC (`relay/signaling.py`, :3921) e `python relay/server.py` o relay completo (:3920). Referência: [docs/specs/relay-api.md](./docs/specs/relay-api.md).

## 2. Onde as coisas estão

| Quero… | Comece por |
|---|---|
| Entender o que existe e o que é stub | [docs/FEATURES.md](./docs/FEATURES.md) |
| Saber o que fazer agora | [docs/ROADMAP.md](./docs/ROADMAP.md) |
| Ver a arquitetura | [ARCHITECTURE.md](./ARCHITECTURE.md) (protocolo e dados) · [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (camadas do cliente) |
| Detalhes de um módulo/sprint | [client/DEV.md](./client/DEV.md) |
| Infra, deploy e custos | [docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md) |
| Escrever/rodar testes | [docs/TESTES.md](./docs/TESTES.md) |
| Todo o resto | [docs/README.md](./docs/README.md) (índice único) |

Mapa de pastas: seção "Estrutura do repositório" do [README](./README.md). Regra: código de produto em `client/`, `relay/`, `android/`, `vox-populi/`; instaladores em `packaging/`; scripts de manutenção em `scripts/`; documentação em `docs/<categoria>/`.

## 3. Fluxo de mudança

1. `git switch main && git pull` → `git switch -c feat/<assunto>` (ou `fix/`, `docs/`, `chore/`).
2. Commits pequenos no estilo `tipo(escopo): resumo` (ex.: `feat(compose): …`), em português.
3. Antes do PR:
   - `npm test` verde;
   - `npm run lint` e `npm run audit:complexity` sem violações novas — limites em [docs/HARDENING.md](./docs/HARDENING.md);
   - mudou o shell do PWA (arquivo novo, CSS, JS em precache)? **bump de `CACHE_NAME`** em `client/sw.js`;
   - mudou comportamento visível? linha em [CHANGELOG.md](./CHANGELOG.md) → *Não lançado*, e atualize o doc afetado.
4. PR para **`main`** usando o template. `main` é deployável: o push dispara GitHub Pages.
5. Release line (só mantenedor, ao fechar um lote): `npm run release-line` atualiza [docs/release-metadata.json](./docs/release-metadata.json) e a tabela do README. Nenhum outro doc repete esses números.

## 4. Regras do projeto

- **Honestidade de copy:** não descreva como pronto o que é proposta ou stub ([docs/audits/honest-copy-audit-2026-10-23.md](./docs/audits/honest-copy-audit-2026-10-23.md)).
- **Sem custódia de dinheiro, sem alcance pago, sem telemetria de terceiros** ([POSITIONING.md](./docs/product/POSITIONING.md), [COMPLIANCE-BR.md](./docs/legal/COMPLIANCE-BR.md)).
- **Sem dependências de runtime novas** no cliente sem ADR ([docs/adr/README.md](./docs/adr/README.md)).
- **Agentes de IA:** um agente por arquivo e handoff explícito — [docs/process/metodo-agentes-mutex-e-revisor.md](./docs/process/metodo-agentes-mutex-e-revisor.md). Documentação: [docs/CONTRIBUTING-DOCS.md](./docs/CONTRIBUTING-DOCS.md).
- **Decisão de arquitetura ou protocolo:** abra um ADR em `docs/adr/` (ou RFC em `docs/rfc/` para mudança de protocolo de rede).

## 5. Segurança

Vulnerabilidades: **não** abra issue pública — siga [SECURITY.md](./SECURITY.md).
