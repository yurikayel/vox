# Runbook: TURN em produção e segundo nó de sinalização

> **Status:** canônico (runbook para o dono executar) · **Escrito:** 2026-11-18 · **Muda código ou config?** Não. Este documento só descreve passos. Os arquivos citados ficam como estão.
> Referências: [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) · [workers/turn/README.md](../../workers/turn/README.md) · [relay/deploy/README.md](../../relay/deploy/README.md) · [runbook-incidentes.md](./runbook-incidentes.md)
> Regra deste texto: nenhuma senha, token, ID de conta ou URL real. Tudo entre `<...>` é placeholder que o dono preenche.

## 1. Estado atual (medido no repositório em 2026-11-18, `develop` em `315e334`)

| Item | Valor medido | Onde |
|---|---|---|
| TURN estático | `"turn": []` (vazio) | `client/config/signaling.json` |
| TURN por credencial temporária | `"turnCredentialsUrl": ""` (desligado) | `client/config/signaling.json` |
| STUN | 5 servidores (Google ×3, Cloudflare, Twilio) | idem |
| Nós de sinalização | `wss://vox-sentinel.onrender.com` e `ws://127.0.0.1:3921` (local, só serve a quem roda o nó na própria máquina) | idem |
| Nó público | **1 só**, Render free (Oregon), blueprint `relay/render.yaml`, health `/health` | `relay/render.yaml` |
| Keepalive | `sentinel-keepalive.yml`, cron `*/14 * * * *`, URLs vêm dos secrets `SENTINEL_NODE_1..3` | `.github/workflows/` |
| Worker de TURN | **Pronto, nunca publicado** (`vox-turn`: `src/index.js`, `src/policy.js`, `wrangler.toml`) | `workers/turn/` |
| coturn | `relay/deploy/turnserver.conf` com `user=vox:troque-esta-senha-comunitaria` (placeholder) | `relay/deploy/` |
| Custos | R$ 0/mês; TURN e relay completo público listados como pontos únicos de falha 1, 3 e 4 | [INFRA-CUSTOS.md §4](../INFRA-CUSTOS.md) |

Consequência: quem está atrás de NAT simétrico ou CGNAT móvel (4G/5G) pode não conectar, e o modo "só TURN" (esconder IP) não tem servidor por onde passar. Se o Render cair, sobram Nostr (kind 25050), malha local e BroadcastChannel.

## 2. Caminho A — Worker Cloudflare de credencial TURN (recomendado)

Custo zero até o teto do Worker, nenhuma VPS, nenhum segredo no PWA. O app só pede credencial depois de falha da conexão direta (ou no modo "só TURN").

### 2.1 Pré-requisitos
- Conta Cloudflare do mantenedor (a mesma do espelho `vox-9df.pages.dev`, se for o caso).
- Node 20+ na máquina do dono. Não precisa de `node_modules` do repo; `npx wrangler` baixa a CLI.

### 2.2 Passos
1. **Criar a chave TURN:** painel Cloudflare → Realtime → TURN → *Create key*. Guarde o **Key ID** e o **API token** (o token aparece uma vez).
2. **Criar o token de análise:** My Profile → API Tokens → token com permissão **Account Analytics: Read**, restrito a esta conta. É ele que deixa o Worker ler o uso do mês.
3. **Anotar o Account ID** (painel, barra lateral da conta). Não é segredo, mas fica fora do repositório.
4. **Publicar** (a partir de `workers/turn/`):
   ```bash
   npx wrangler login
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_KEY_API_TOKEN
   npx wrangler secret put CF_ACCOUNT_ID
   npx wrangler secret put CF_ANALYTICS_TOKEN
   npx wrangler deploy
   ```
   Os quatro nomes de secret são exatamente os lidos por `src/index.js`. Cada `put` pede o valor no terminal; não o cole em chat, issue ou commit.
5. **Anotar a URL** que o `deploy` imprime (`https://vox-turn.<subdominio-da-conta>.workers.dev`).
6. **Se o app for servido de outro domínio** além de GitHub Pages e `vox-9df.pages.dev`: editar `ALLOWED_ORIGINS` em `workers/turn/wrangler.toml` (origens exatas, separadas por vírgula) e repetir `npx wrangler deploy`.

### 2.3 Teste com curl (placeholders)
```bash
# 1) Origem permitida: deve devolver 200 com { iceServers, ttl, expiresAt }
curl -sS -i -H "Origin: https://yurikayel.github.io" \
  "https://vox-turn.<subdominio-da-conta>.workers.dev/ice-servers"
```
```bash
# 2) Origem de fora: deve ser recusada (não pode devolver credencial)
curl -sS -i -H "Origin: https://exemplo-invalido.example" \
  "https://vox-turn.<subdominio-da-conta>.workers.dev/ice-servers"
```
```bash
# 3) Sem Origin: deve ser recusado
curl -sS -i "https://vox-turn.<subdominio-da-conta>.workers.dev/ice-servers"
```
Esperado no teste 1: `urls` com `turn:`/`turns:` e **nenhuma na porta 53** (o Worker as remove); `username` e `credential` presentes; `ttl` = 14400 (4 h). Se vier `503`, leia o corpo: uso do mês desconhecido (token de análise errado ou sem permissão) ou teto atingido. `429` = mais de 30 pedidos por hora do mesmo IP.

### 2.4 Ligar no app (depois do teste passar)
Isto é uma **mudança de configuração do app, feita em PR separado** (fora deste runbook):
- Em `client/config/signaling.json`, preencher `"turnCredentialsUrl"` com a URL do Worker (precisa ser `https`; confira em `client/js/turn-credentials.js` se o caminho `/ice-servers` deve ou não constar, antes de editar).
- `"turn"` pode continuar `[]`: as credenciais vêm do Worker. Só preencha `turn` se também for usar o caminho B.
- Fazer o bump do Service Worker (o README do Worker pede) e passar `npm run validate`.
- Conferir se o CSP (`connect-src`) aceita o host `workers.dev`; há outras sessões mexendo em CSP, então verifique o estado na `develop` antes.

### 2.5 Custo e limites
- **Realtime TURN:** a documentação do projeto (INFRA-CUSTOS e `workers/turn/README.md`) registra **1.000 GB/mês grátis, divididos com o SFU, e US$ 0,05/GB depois**. **NÃO VERIFICADO nesta sessão** (sem acesso à fonte oficial). Antes de decidir, confirme em [developers.cloudflare.com/realtime/turn/faq](https://developers.cloudflare.com/realtime/turn/faq/) e [developers.cloudflare.com/realtime/sfu/pricing](https://developers.cloudflare.com/realtime/sfu/pricing/), e anote a data da conferência: `____`.
- **Workers Free e Durable Objects (SQLite):** limites de requisições/dia e de operações. **NÃO VERIFICADO**; confirme em [developers.cloudflare.com/workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/) e [developers.cloudflare.com/durable-objects/platform/pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- **Teto do projeto:** `BUDGET_GB = 800` em `wrangler.toml`. Ao atingir, o Worker responde 503 até virar o mês (UTC) e o app volta a tentar só conexão direta.
- **Cartão:** confira no painel se a conta tem cartão cadastrado; o comportamento sem cartão ao passar da franquia deve ser lido na documentação (NÃO VERIFICADO). Com cartão, o excedente é cobrado.

### 2.6 Riscos
1. `Origin` é forjável fora do navegador. O estrago fica limitado pelo teto do mês e por 30 credenciais/h por IP, mas um abusador pode esgotar os 800 GB e **desligar o TURN para todos até o mês virar**.
2. O uso lido tem atraso de minutos e é consultado de hora em hora; credenciais já emitidas valem 4 h. Pode passar um pouco do teto (por isso 800 e não 1.000).
3. Token de análise errado = TURN desligado de forma silenciosa (fail-closed). Refaça o teste 1 do curl depois de qualquer rotação de token.
4. O TURN vê metadados de rede (IPs dos dois lados), não o conteúdo (DTLS-SRTP/E2E do WebRTC). Atualize a nota de privacidade do app antes de ligar, se ela hoje diz que nenhum terceiro além do STUN vê o IP. Decisão do dono (§6).
5. Dependência de uma conta única da Cloudflare (ver INFRA-CUSTOS §4 item 5).

## 3. Caminho B — coturn comunitário (VPS)

Para quem prefere não depender da Cloudflare, ou como segunda via. Custa **VPS + banda de relay**; só vale com orçamento ou voluntário (ver INFRA-CUSTOS §5).

> **Atenção:** `relay/deploy/turnserver.conf` está sendo endurecido por outra sessão. **Não o edite a partir deste runbook.** Leia a versão que estiver na `develop` no dia da execução e siga o `relay/deploy/README.md` dela.

1. VPS com IP público fixo e um domínio (`signal.<sua-comunidade>.example`) com registro `A` apontando para ela.
2. No `turnserver.conf` da sua cópia local: troque o `user=` e a senha por uma credencial **gerada pelo dono** (por exemplo com `openssl rand -base64 32`, guardada em gerenciador de senhas; nunca no repositório). Se a VPS estiver atrás de NAT (Oracle, AWS), ative `external-ip=<IP-PUBLICO-DA-VPS>`. Ajuste `realm`.
3. Firewall: `80/tcp`, `443/tcp`, `3478/udp+tcp`, `49152-49200/udp`.
4. Subir: `cd relay/deploy && docker compose up -d --build`; depois `curl -sS https://signal.<sua-comunidade>.example/health`.
5. Testar o TURN de fora da rede da VPS (página Trickle ICE da WebRTC samples ou CLI do coturn): URI `turn:signal.<sua-comunidade>.example:3478`, usuário `<usuario>`, credencial `<senha-do-dono>`; deve aparecer candidato `relay`.
6. Ligar no app: **individual** (Configurações → Rede: URL TURN, usuário, credencial; fica só no navegador de cada pessoa) ou **para todos** (campo `turn` em `signaling.json`, PR separado).
7. **Risco central:** em `signaling.json` o par usuário/senha fica **público** e qualquer um pode usar sua banda (a conf limita com `max-bps` e `total-quota`, mas não elimina). Para uso público prefira o caminho A; senão, restrinja a comunidades conhecidas e use o preenchimento individual.

## 4. Segundo nó de sinalização

### 4.1 Onde hospedar (opções já avaliadas em `docs/`)
| Opção | Situação segundo o repo | Observação |
|---|---|---|
| **VPS própria** (`relay/deploy/`: Caddy + signaling + relay + coturn) | Única com relay completo e TURN | Custo de VPS; é o que o INFRA-CUSTOS aponta. Pode ser o mesmo servidor do caminho B |
| **Koyeb** (`relay/koyeb.yaml`) | Escala a zero após 1 h (complementar F3) | Precisa de keepalive; o pior candidato dos que existem |
| **Railway / Zeabur** (`relay/deploy/railway.json`, `zbpack.json`) | Descritores existem, leem o arquivo na raiz | Plano e limites **NÃO VERIFICADOS** |
| **Hugging Face Space** | Morto para Docker Spaces novos | Descartado (pesquisa V6) |
| **Deno Deploy** | Org suspensa por cobrança | Descartado |
| **Cloudflare Durable Object** (REV-01) | Proposto: nó sem sleep | Exige código novo; fora do escopo |
| **Render, segundo workspace** | Free: 750 h/mês **por workspace** | Contornar com outra conta pode violar termos: decisão do dono |

Escolha um host em **outro provedor e outra região** que o Render/Oregon; senão não há ganho de resiliência.

### 4.2 Subir e validar
```bash
# saúde HTTP do novo nó
curl -sS -i "https://<no2>.example/health"
```
```bash
# WebSocket (npm i -g wscat): deve conectar e ficar aberto
wscat -c "wss://<no2>.example"
# dentro do wscat, registre-se como o cliente faz:
# > {"type":"register","peerId":"teste-<aleatorio>","address":"teste","dmPub":""}
```
Um nó com `/health` ok mas WSS quebrado (TLS, proxy sem upgrade) conta como "não abre" para o cliente.

### 4.3 Como o cliente faz failover (`client/js/webrtc-peer.js`)
- Lê `signalingUrls` na ordem, com um índice em rodízio. Se um nó **não chega a abrir**, passa ao próximo e só "desiste" quando completa a volta sem nenhum abrir.
- **Limites reais:** (a) se o nó abriu e depois caiu, o cliente reconecta **no mesmo endereço** (não rotaciona); (b) um nó que abre mas não funciona não dispara failover; (c) o endereço guardado pela pessoa (`vox-custom-signaling-url`) **vence** a lista; (d) cada nó mantém seu próprio registro de pares e não há federação: pessoas em nós diferentes **não se veem** pela sinalização WebSocket (o caminho Nostr ainda as junta). Na prática o segundo nó é reserva, não balanceamento.
- Para ligar: acrescentar `"wss://<no2>.example"` em `signalingUrls` de `signaling.json` **antes** de `ws://127.0.0.1:3921` (PR separado, com bump de SW).

### 4.4 Variáveis do servidor novo
- **`VOX_RELAY_TRUST_PROXY_HOPS`:** por padrão vale o IP do socket (0). Atrás de Caddy (VPS própria) use `1`; com CDN na frente de um proxy seu, o número de proxies que você controla (`2`). Alto demais permite forjar `X-Forwarded-For` e furar o limite por IP; baixo demais faz todos parecerem um IP só e o limite barra gente legítima. Confira o valor atual do nó Render no painel antes de copiar: o nó 2 tem outra topologia.
- **`VOX_RELAY_ALLOWED_ORIGINS`:** vale para o **relay completo** (`server.py`, atrás do Caddy na VPS), não para o `signaling.py`, que só responde saúde. O padrão já aceita `yurikayel.github.io`, `vox-9df.pages.dev` e localhost. Só preencha se servir o app de outro domínio (origens exatas, separadas por vírgula, sem barra final).
- `VOX_SIGNAL_MAX_CONNECTIONS` (padrão 64): ajuste ao tamanho da máquina.
- No `Caddyfile`, troque o domínio de exemplo pelo real.

### 4.5 Keepalive
Se o host dormir (Koyeb, Render), ponha a URL no secret `SENTINEL_NODE_2` (o workflow só referencia o **nome**; o valor é do dono). VPS própria não precisa.

## 5. Checklists

**Verificação**
- [ ] `curl` do Worker: 200 com origem do app; recusa com origem estranha e sem `Origin`.
- [ ] Nenhuma URL `:53` na resposta; `ttl` de 4 h.
- [ ] Depois do PR de configuração: celular em 4G contra um desktop em outra rede; `chrome://webrtc-internals` mostra par de candidatos `relay`.
- [ ] Painel Cloudflare: uso do TURN no mês cresce e fica abaixo de 800 GB.
- [ ] Segundo nó: `/health` e `wscat` ok; com o nó 1 fora do ar (ou com uma URL inválida na frente), o app abre no nó 2.
- [ ] `npm run validate` no PR que mudar `signaling.json`.

**Reversão**
- Desligar o TURN no app: esvaziar `turnCredentialsUrl` em `signaling.json` (PR, bump de SW). O app volta ao comportamento atual.
- Desligar o Worker na hora: `npx wrangler delete` em `workers/turn/` (o app falha a busca da credencial e segue sem TURN).
- Revogar: apagar a chave TURN e o token de análise no painel Cloudflare; trocar a senha do coturn e reiniciar o contêiner.
- Segundo nó: remover a URL de `signalingUrls` (PR) e desligar o serviço; o rodízio volta ao nó 1.

## 6. Decisões que são só do dono
1. Ligar o TURN para todos (e a nota de privacidade correspondente): Cloudflare, coturn, ou os dois.
2. Aceitar conta com cartão na Cloudflare e o risco de excedente, ou manter só o teto de 800 GB.
3. Quem paga e opera uma VPS (caminho B e §4.1), e em qual provedor e região.
4. Se vale usar um segundo workspace/conta em PaaS gratuito (termos de uso).
5. Criar e guardar chaves, tokens e a senha do coturn (nada disso entra no repositório nem em chat).
6. Mudar o `signaling.json` público (`turnCredentialsUrl`, `turn`, `signalingUrls`) e quando.
7. Origens extras permitidas (`ALLOWED_ORIGINS`, `VOX_RELAY_ALLOWED_ORIGINS`) se o app for hospedado em novo domínio.
