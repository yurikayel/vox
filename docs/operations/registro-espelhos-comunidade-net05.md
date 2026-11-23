# Registro e validação de espelhos de comunidade (NET-05)

> **Status:** rascunho (spec operacional, schema de registro e protocolo de validação; sem automação de CI ainda) · **Owner:** steward ops / mantenedor · **Revisado:** 2026-11-22

Especificação operacional do registro e da validação contínua de **espelhos independentes operados por comunidades ou coletivos** (NET-05). Fundamenta-se em [`ops-shell-mirrors.md`](./ops-shell-mirrors.md), [`mirrors-registry.example.json`](./mirrors-registry.example.json), [`mirror-validate-v1.md`](../specs/mirror-validate-v1.md), [`relay/mirror_validate.py`](../../relay/mirror_validate.py), [`client/js/community-mirror.js`](../../client/js/community-mirror.js), [`GOVERNANCE.md`](../../GOVERNANCE.md) e [`COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md).

> **Separação de camadas (`ops-shell-mirrors.md`):** espelho **shell** distribui os arquivos estáticos do cliente PWA (`client/`); espelho de **índice/cache comunitário** (`POST /vox/mirror` e `GET /vox/index/<communityId>.json`) vive no relay do steward. Um host pode oferecer apenas o shell ou ambos, mas cada superfície tem validação própria.

---

## 1. Schema exato de entrada JSON (Registro de Espelhos de Comunidade)

O registro de espelhos comunitários estende o formato [`vox-shell-mirror-registry/v1`](./mirrors-registry.example.json) para incluir a identidade da comunidade/coletivo, verificações criptográficas de integridade (`index.html`, `sw.js`, CSP/headers) e ciclo de vida operacional (`active` | `degraded` | `suspended`).

```json
{
  "schema": "vox-community-mirror-registry/v1",
  "base_shell_registry": "vox-shell-mirror-registry/v1",
  "release_ref": "docs/release-metadata.json",
  "mirrors": [
    {
      "mirror_id": "comm-bairro-shell-01",
      "role": "community-shell",
      "community_id": "associacao-bairro-sul",
      "base_url": "https://vox.exemplo-comunitario.org/",
      "operator": {
        "name": "Coletivo Bairro Sul",
        "route_id": "vx_exemplo_operador",
        "contact": "https://vox.exemplo-comunitario.org/contato"
      },
      "read_only": true,
      "git_sha": "0123456789abcdef0123456789abcdef01234567",
      "cache_name": "<CACHE_NAME lido de client/sw.js e docs/release-metadata.json>",
      "checks": {
        "tls": true,
        "csp_parity": true,
        "headers_parity": true,
        "sw_sha256": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        "index_sha256": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
      },
      "relay_mirror": {
        "enabled": true,
        "endpoint_url": "https://relay.exemplo-comunitario.org",
        "validate_v1": true
      },
      "last_verified_at": "2026-11-22T12:00:00Z",
      "status": "active"
    }
  ]
}
```

### 1.1 Campos obrigatórios e restrições

| Campo | Tipo | Regra normativa |
|---|---|---|
| `mirror_id` | `string` | Slug único (`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`). Não colidir com `shell-a` ou `shell-b` |
| `role` | `string` | `"community-shell"` (ou `"A"` / `"B"` quando referenciar os espelhos canônicos de [`mirrors-registry.example.json`](./mirrors-registry.example.json)) |
| `community_id` | `string` | Regex `^[a-zA-Z0-9._-]{1,128}$` (idêntica a `COMMUNITY_ID_RE` em [`relay/mirror_validate.py`](../../relay/mirror_validate.py)), ou `"*"` para espelho multi-comunidade |
| `base_url` | `string` | URL `https://` pública com barra final; proibido `http://`, IP privado e credenciais embutidas (`user:pass@`) |
| `operator` | `object` | `name` (obrigatório), `route_id` (`vx_…`, opcional) e `contact` (canal público para notificações/Art. 19; sem dados civis como CPF, [`COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md)) |
| `read_only` | `boolean` | `true` obrigatório para espelhos estáticos do shell PWA |
| `git_sha` | `string` | SHA completo (40 hex minúsculos) do commit de release publicado; não aceitar árvore suja não reproduzível |
| `cache_name` | `string` | Deve bater byte a byte com `CACHE_NAME` de [`client/sw.js`](../../client/sw.js) (espelhado em [`docs/release-metadata.json`](../release-metadata.json)); **nunca** duplicar string fixa de versão em docs normativos |
| `checks.tls` | `boolean` | `true` apenas se handshake HTTPS válido (cadeia confiável, TLS ≥ 1.2, sem erro de CN/SAN) |
| `checks.csp_parity` | `boolean` | `true` apenas se a `<meta>` CSP de `index.html` e o cabeçalho HTTP `Content-Security-Policy` (quando presente) respeitarem estritamente a política canônica (§2.1) |
| `checks.headers_parity` | `boolean` | `true` quando cabeçalhos de segurança (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `/sw.js` `Cache-Control: no-cache`) estiverem íntegros |
| `checks.sw_sha256` | `string` | `"sha256:<64 hex minúsculos>"` do arquivo `{base_url}sw.js` igual ao artefato da release `git_sha` |
| `checks.index_sha256` | `string` | `"sha256:<64 hex minúsculos>"` de `{base_url}index.html` igual ao artefato da release `git_sha` |
| `relay_mirror` | `object` (opcional) | Se `enabled: true`, exige `endpoint_url` (`https://`) e `validate_v1: true` conforme [`mirror-validate-v1.md`](../specs/mirror-validate-v1.md) |
| `last_verified_at` | `string` | Timestamp ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`) da última execução bem-sucedida da rotina de validação |
| `status` | `string` | `"active"` \| `"degraded"` \| `"suspended"` (§3) |

---

## 2. Fluxo automatizado de validação (Shell + `mirror-validate-v1`)

A validação é executada na entrada do registro e periodicamente depois disso. **Qualquer sinal de adulteração de JavaScript ou afrouxamento de CSP reprova imediatamente o espelho.**

### 2.1 Paridade do shell estático (`index.html`, `sw.js`, JS e CSP)

Usando como referência o commit `git_sha` e as regras de [`client/index.html`](../../client/index.html), [`client/_headers`](../../client/_headers) e [`tests/csp.test.js`](../../tests/csp.test.js):

1. **TLS e disponibilidade:** `GET {base_url}` e `GET {base_url}sw.js` devem responder HTTP `200` sobre HTTPS válido (sem redirecionamento para domínio terceiro não listado e sem conteúdo misto).
2. **Paridade criptográfica de `index.html` e `sw.js`:**
   - Calcular `sha256` do corpo exato retornado por `{base_url}index.html` e `{base_url}sw.js` e comparar com os artefatos construídos a partir de `git_sha`.
   - Conferir que `CACHE_NAME` extraído de `{base_url}sw.js` é idêntico ao `cache_name` declarado no registro e ao da release alvo.
   - **Rejeição por adulteração:** qualquer diferença de byte em `index.html`, `sw.js` ou nos módulos em `js/` referenciados no shell (como injeção de `<script>` inline, alteração de boot scripts ou inclusão de telemetria externa) falha a verificação e marca o espelho como `suspended`.
3. **Paridade estrita de CSP e cabeçalhos de segurança:**
   - A política `<meta http-equiv="Content-Security-Policy">` em `index.html` (e o header HTTP `Content-Security-Policy`, quando o host envia cabeçalhos como em Cloudflare Pages / nginx) deve corresponder às diretivas canônicas de [`client/_headers`](../../client/_headers) e [`tests/csp.test.js`](../../tests/csp.test.js):
     - `script-src`: **proibido** `'unsafe-inline'`, `'unsafe-eval'`, wildcard `*` ou hosts além de `'self'`, `https://accounts.google.com` e `https://connect.facebook.net`;
     - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`;
     - `frame-src`: lista explícita sem `https:` aberto;
     - `frame-ancestors 'self'` (via cabeçalho HTTP), `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`;
     - `/sw.js` servido sem cache agressivo (`Cache-Control: no-cache`).
   - **Rejeição por CSP afrouxada:** qualquer espelho que relaxe `script-src`, `frame-src` ou `connect-src` (ou remova `object-src 'none'`) é **imediatamente suspenso** (`checks.csp_parity = false`, `status = "suspended"`).
4. **Exceção controlada para configuração declarada:** diferenças em `config/signaling.json` ou `config/gateways.json` só são aceitas quando declaradas pelo coletivo ([`ops-shell-mirrors.md`](./ops-shell-mirrors.md) § Integridade) e **nunca** justificam alterar `index.html`, `sw.js` ou scripts JS.

### 2.2 Validação do espelho de índice comunitário (`POST /vox/mirror`)

Quando o registro declara `relay_mirror.enabled: true`, o endpoint associado deve operar em conformidade com [`mirror-validate-v1.md`](../specs/mirror-validate-v1.md) e [`relay/mirror_validate.py`](../../relay/mirror_validate.py) (espelhado na pré-validação de [`client/js/community-mirror.js`](../../client/js/community-mirror.js)):

- **Limite de corpo:** ≤ `256 KiB` (`MAX_MIRROR_BODY_BYTES = 256 * 1024`; retorna HTTP `413` `mirror.body_too_large`).
- **Formato e `communityId`:** JSON UTF-8 objeto (`400` `mirror.invalid_json` / `mirror.not_object`) com `communityId` obrigatório casando `^[a-zA-Z0-9._-]{1,128}$` (`400` `mirror.community_id_invalid`).
- **Tópicos:** array `topics` com no máximo `500` itens (`MAX_TOPICS`; `400` `mirror.topics_invalid` / `mirror.topics_limit`).
- **Manifesto opcional `cacheManifest`:** regras v0 (`v === 0`, `pins` não vazio com 1–512 entradas, `txId` único de 43 chars base64url, `role` em `PIN_ROLES`, `sha256` opcional de 64 hex, `previousManifestTx` opcional de 43 chars; `400` `mirror.cache_manifest_invalid`).
- **Leitura pública (`GET /vox/index/<communityId>.json`):** responde JSON válido sem vazar dados privados de DMs ou chaves; erros estruturais retornam `400`/`413` e nunca expõem stacktrace (`500` apenas em falha de I/O).

---

## 3. Critérios de inclusão, verificação periódica e suspensão

### 3.1 Critérios de inclusão (Onboarding)

Um espelho de comunidade entra no registro com `status: "active"` somente quando todos os itens abaixo passam:

1. `base_url` responde HTTPS `200` com certificado TLS válido e cadeia confiável.
2. `index_sha256`, `sw_sha256` e `cache_name` batem exatamente com a release `git_sha` declarada.
3. `checks.csp_parity` e `checks.headers_parity` são `true` (conferidos contra [`client/_headers`](../../client/_headers) e [`tests/csp.test.js`](../../tests/csp.test.js)).
4. Identificador de `operator` e canal de `contact` declarados para notificações técnicas e eventuais pedidos legais.
5. Smoke funcional confirmado no host (`#/settings/network` carrega sem erro de console/CSP e o Service Worker registra no escopo raiz).

### 3.2 Verificação periódica (Health Check)

- **Frequência recomendada:** checagem automatizada diária (ou a cada nova release publicada) para todos os registros `active` e `degraded`.
- Cada execução atualiza `last_verified_at` quando todos os checks passam e avalia transições de estado conforme a matriz abaixo.

### 3.3 Transições de estado e remoção (`active` / `degraded` / `suspended`)

| Estado | Condição de entrada | Ação operacional |
|---|---|---|
| **`active`** | Todos os checks de §2 passam (`TLS`, `HTTP 200`, `index_sha256`, `sw_sha256`, `csp_parity`, `headers_parity`, `cache_name` atual) | Mantido como espelho recomendado da comunidade |
| **`degraded`** | Falha transitória de rede/5xx (≥ 2 checagens seguidas), latência/indisponibilidade temporária, certificado TLS expirando em < 7 dias, **ou** `cache_name` defasado em relação à release mais recente (shell antigo, porém **sem** adulteração de JS nem CSP afrouxada) | Exibe alerta operacional ao operador; mantém listagem com aviso de degradação por até 7 dias |
| **`suspended`** | **Imediato (tolerância zero):** `index_sha256` ou `sw_sha256` não bate com o `git_sha` declarado (suspeita de JS adulterado); CSP afrouxada ou ausente; TLS inválido/expirado; mais de 7 dias contínuos em `degraded`; ou pedido formal de saída do operador | Removido da rotação recomendada imediatamente. Só retorna a `active` após novo onboarding completo e verificação de causa raiz |

---

## 4. Independência jurídica e responsabilidade do operador

Em alinhamento estrito com [`docs/legal/COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md) e [`GOVERNANCE.md`](../../GOVERNANCE.md):

1. **Autonomia do repositório Vox:** o projeto open-source publica código estático do cliente e especificações técnicas. O projeto **não** hospeda, financia, opera nem garante a disponibilidade ou conformidade de espelhos mantidos por comunidades ou terceiros.
2. **Responsabilidade exclusiva do operador do espelho:** cada operador de espelho comunitário (pessoa física, coletivo ou pessoa jurídica) responde **isoladamente** pelo próprio domínio, certificado TLS, servidor/CDN, política de logs de acesso HTTP (LGPD, Lei nº 13.709/2018) e cumprimento de eventuais ordens judiciais ou notificações qualificadas (Marco Civil da Internet, Lei nº 12.965/2014, Art. 19) na camada sob seu controle (por exemplo, suprimindo conteúdo no próprio índice `GET /vox/index/<communityId>.json` ou desligando o host, sem prometer apagamento global na rede P2P/permaweb).
3. **Sem vínculo societário ou solidariedade:** constar em um registro comunitário ou JSON de referência tem caráter puramente técnico e informativo, não criando relação de preposto, mandato, franquia ou responsabilidade solidária entre operadores independentes ou com o repositório Vox.

---

## 5. Runbook rápido de verificação e `DoD`

### 5.1 Verificação manual rápida (PowerShell 5.1)

```powershell
$mirror = "https://vox.exemplo-comunitario.org/"
$idx = Invoke-WebRequest -Uri $mirror -UseBasicParsing
$sw  = Invoke-WebRequest -Uri ($mirror + "sw.js") -UseBasicParsing

# Hashes SHA-256 para comparar com os artefatos da release git_sha
$sha = [System.Security.Cryptography.SHA256]::Create()
$idxHash = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($idx.Content)) | ForEach-Object { $_.ToString("x2") }) -join ""
$swHash  = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sw.Content))  | ForEach-Object { $_.ToString("x2") }) -join ""
"index_sha256=sha256:$idxHash"
"sw_sha256=sha256:$swHash"

# Conferir CSP e cabeçalhos de segurança
$idx.Headers["Content-Security-Policy"]
$idx.Headers["X-Content-Type-Options"]
$idx.Headers["Referrer-Policy"]
```

### 5.2 Definition of Done (`CONTRIBUTING-DOCS.md` §3)

- **DoD `doc`:**
  - [x] Schema JSON completo (`vox-community-mirror-registry/v1`) compatível com [`mirrors-registry.example.json`](./mirrors-registry.example.json).
  - [x] Fluxo de validação de shell (`index.html`, `sw.js`, CSP de [`client/_headers`](../../client/_headers) e [`tests/csp.test.js`](../../tests/csp.test.js)) + validação de dados [`mirror-validate-v1.md`](../specs/mirror-validate-v1.md) / [`relay/mirror_validate.py`](../../relay/mirror_validate.py).
  - [x] Critérios de inclusão, `active`/`degraded`/`suspended`, nota de independência jurídica alinhada a [`COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md) e link cruzado em [`ops-shell-mirrors.md`](./ops-shell-mirrors.md).
- **DoD `code` / `ops-humano` (futuro):**
  - [ ] Script/workflow de validação periódica implementado e testado contra espelho de referência sem adulteração e contra fixture negativa (JS adulterado / CSP afrouxada → `suspended`).
