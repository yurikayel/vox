# Pacote de revisão externa do Modelo de Ameaças (LAN-15)

> **Status:** rascunho · **Owner:** revisor / segurança · **Revisado:** 2026-11-22
> **Relacionados:** [THREAT-MODEL.md](../THREAT-MODEL.md) · [SECURITY.md](../../SECURITY.md) · [DEPENDENCIAS.md](../DEPENDENCIAS.md) · [ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md) · [ADR-037](../adr/037-cofre-na-malha.md) · [ADR-039](../adr/039-rust-por-fases.md) · [backlog §4-E](../strategy/backlog-lancamento-publico-2026-11.md)

## 1. Objetivo e escopo da revisão externa

Este documento organiza o briefing técnico para a revisão independente exigida pelo portão **G2 (`LAN-15`)** — utilizável por revisores voluntários de segurança, clínicas de direitos digitais ou programas como OTF Red Team Lab — e serve de pré-briefing para a revisão criptográfica externa (**`LAN-18`**).

> **Postura ADR-024 (divulgação responsável):** este pacote não inclui payloads de exploração nem passos ofensivos; lista apenas ativos, invariantes defensivos, arquivos de referência e premissas a contestar. Vulnerabilidades encontradas devem seguir o canal privado em [SECURITY.md](../../SECURITY.md).

## 2. Mapa do sistema em revisão (`develop`, nov/2026)

| Camada | Diretório / Artefato principal | Premissa central a validar |
| :--- | :--- | :--- |
| **Cliente PWA estático** | `client/index.html`, `client/sw.js`, `client/js/` | Sem backend obrigatório; chaves P-256 não exportáveis no WebCrypto após trava (`ADR-026`); `arweaveUpload: false` por padrão hoje (`REV-07`). |
| **Relay e sinalização Python** | `relay/server.py`, `relay/signaling.py`, `relay/request_guard.py`, `relay/blind_relay.py`, `relay/vault_store.py` | Biblioteca padrão Python; validação de `Origin`/`Host`, `application/json`, limite por IP, teto de conexões e dreno de corpo rejeitado (`T30`–`T32`). |
| **Núcleo de referência Rust** | `rust/vox-core/` (`ADR-039`, Fases 0–1) | `#![no_std]`, `#![forbid(unsafe_code)]`, 0 dependências externas; ainda fora do PWA (sem `.wasm` nem alteração de CSP). |
| **Moderação e governança** | `scripts/hide-list-tool.mjs`, `scripts/transparency-report.mjs`, [procedimento-conteudo-grave-lan04.md](../operations/procedimento-conteudo-grave-lan04.md) | `hide-list` assinada em Ed25519 (fail-closed com pin SPKI DER) para a instância PWA oficial; transparência zero-PII. |
| **Cadeia de suprimentos** | `docs/DEPENDENCIAS.md`, `tests/dependencias-inventory.test.js`, `tests/deps-inventory-sri.test.js` | Actions fixadas por SHA (`PM-95`), inventário de origens CSP e conferência de vendorizados/SRI (`LAN-20`). |

## 3. Superfícies evoluídas e pontos prioritários de ataque defensivo

Além da tabela `T1`–`T34` em [THREAT-MODEL.md](../THREAT-MODEL.md), o revisor externo deve contestar especificamente:

1. **Ameaças abertas já confirmadas (`T32`–`T34`):**
   - `T32`: `Allow-Origin: *` residual em `relay/signaling.py` (saúde) e `ZeroCentralMemory.cs`.
   - `T33`: ausência de cabeçalhos `frame-ancestors` / `X-Frame-Options` / `nosniff` no GitHub Pages (vs. Cloudflare Pages com `client/_headers`).
   - `T34`: sondagem de `legacyLookupKey` SHA-256 sem sal do cofre v1 em servidores de memória.
2. **Cofre na malha (`ADR-037`):** teto contra flood de pedidos (`MAX_NOTICES_PER_HOLDER` / `MAX_REQUESTS_PER_OWNER`), comportamento em `remote=0` e corrida entre abas (`tests/mesh-vault*.test.js`).
3. **Virada `sigv: 2` (`SIGV2_FROM` em 24/11/2026):** convivência entre `v1` legado e `v2` recursivo (`client/js/sig-format.js`, `rust/vox-core/src/sig_format.rs`) e recusa de versões desconhecidas.
4. **Exposição de IP em WebRTC/TURN (`LAN-19`):** eficácia do aviso e do modo `iceTransportPolicy: relay`, e limites enquanto não houver TURN dedicado em produção (`REV-10`).
5. **Lista de ocultação assinada (`LAN-13`):** proteção contra substituição de chave pública, replay de versão antiga (`listVersion`) e vazamento de PII em `reasonCode`.
6. **Fronteira futura de WebAssembly (`ADR-039` §1.3 e §3.3):** confirmar que nenhuma chave privada P-256 migra para memória WASM e revisar o impacto de `'wasm-unsafe-eval'` antes das Fases 2–3.

## 4. Checklist de revisão (10 perguntas para o auditor externo)

- [ ] **Q1 (Chaves em repouso):** há algum caminho em `client/js/identity/` ou `client/js/vault/` que reexporte chave privada P-256 após o lock do `ADR-026`?
- [ ] **Q2 (Assinaturas):** existe ambiguidade de canonicalização entre `v1`, `v2` ou objetos com `__proto__`/chaves numéricas?
- [ ] **Q3 (DMs e metadados):** o relay de inbox ou a sinalização Nostr/WebSocket expõem mais metadados que o declarado em `THREAT-MODEL.md`?
- [ ] **Q4 (XSS e CSP):** existem pontos de injeção HTML (`innerHTML`, URLs `javascript:`, SVG inline) remanescentes em renderizadores ou exportadores?
- [ ] **Q5 (Clickjacking `T33`):** o risco no GitHub Pages exige mitigação antes do beta G2 ou redirecionamento para o espelho Cloudflare Pages?
- [ ] **Q6 (Cofre v1 `T34`):** qual prazo e fluxo seguro para desligar a sondagem automática de `legacyLookupKey`?
- [ ] **Q7 (DoS em sinalização):** frente ao benchmark de 500 pares (`LAN-09`), os limites de taxa e conexões de `relay/signaling.py` protegem o serviço contra exaustão de memória/sockets?
- [ ] **Q8 (Cadeia de suprimentos):** o inventário em `DEPENDENCIAS.md` e os testes de CI cobrem todas as origens externas e ferramentas de build?
- [ ] **Q9 (Moderação/hide-list):** a verificação Ed25519 e o processo de contenção `LAN-04` evitam censura silenciosa ou alteração não auditável?
- [ ] **Q10 (Riscos aceitos):** algum risco classificado hoje como "aceito" em `THREAT-MODEL.md` é inaceitável para o perfil de ameaça do beta G2?

## 5. Registro de revisões externas

> **Estado atual:** `0 revisões externas concluídas — pendente antes de G2 (LAN-15)`.

| Data | Revisor / Entidade | Escopo (SHA) | Achados (Crítico / Alto / Médio / Baixo) | Status de remediação | Evidência (PR / relatório) |
| :--- | :--- | :--- | :---: | :--- | :--- |
| *Pendente* | *A definir* | — | — | Aguardando revisão externa | — |
