# Worker de TURN (REV-10)

Entrega ao app credenciais temporárias do **Cloudflare Realtime TURN**, para quem está atrás de CGNAT (4G) conseguir conectar quando a conexão direta falha. O segredo do TURN fica só no Worker; o PWA recebe um par usuário/senha que vence em 4 h.

## O que ele faz

- `GET /ice-servers` → `{ iceServers, ttl, expiresAt }`, só para as origens do app: GitHub Pages, o espelho `vox-9df.pages.dev`, `localhost` e as listadas em `ALLOWED_ORIGINS`.
- **Teto do mês:** antes de liberar, consulta o uso do TURN no mês na API de análise do Cloudflare (`callsTurnUsageAdaptiveGroups`, bytes enviados às pessoas, que são os cobrados). A consulta é refeita no máximo uma vez por hora. No teto (`BUDGET_GB`, padrão 800 GB, abaixo dos 1.000 GB grátis divididos com o SFU), responde `503` até virar o mês.
- **Uso desconhecido** (API de análise fora do ar ou sem token): também `503`. O teto vale mais que a conveniência. Sem TURN, o app continua tentando conexão direta, como hoje.
- **Por IP:** até 30 credenciais por hora (`429` acima disso). O objeto guarda só um hash truncado do IP, e a contagem zera a cada hora.
- Estado num Durable Object (`TurnBudget`, SQLite, disponível no plano grátis de Workers).

## Limites honestos

- A checagem de origem barra navegador em outro site, mas **não** barra script que forje o cabeçalho `Origin`. O que limita o estrago é o teto do mês e o limite por IP: no pior caso, o TURN para até virar o mês, sem cobrança.
- O uso lido tem atraso de alguns minutos e é consultado de hora em hora. Credenciais já entregues continuam valendo até vencer (4 h). Por isso o teto fica em 800 GB, com folga até os 1.000 GB.
- O app só pede credencial **depois de uma falha de conexão direta** (ou no modo "só TURN", que esconde o IP). Mesmo com TURN na lista, o ICE prefere o caminho direto, então só o tráfego que precisa passa pelo relay.

## Deploy (manual, pelo mantenedor)

1. No painel do Cloudflare: **Realtime → TURN → Create key**. Anote o **Key ID** e o **API token**.
2. Crie um token de API com a permissão **Account Analytics: Read**, só desta conta.
3. Nesta pasta:
   ```bash
   npx wrangler login
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_KEY_API_TOKEN
   npx wrangler secret put CF_ACCOUNT_ID
   npx wrangler secret put CF_ANALYTICS_TOKEN
   npx wrangler deploy
   ```
4. Teste: `curl -H "Origin: https://yurikayel.github.io" https://vox-turn.<sua-conta>.workers.dev/ice-servers`.
5. Ligue no app: em `client/config/signaling.json`, ponha a URL em `"turnCredentialsUrl"` e faça o bump do SW. Com o campo vazio, o app se comporta como antes.

## Testes

`tests/turn-worker.test.js` (regras, orçamento e respostas, com `fetch` falso) e `tests/turn-credentials.test.js` (lado do app). A chamada real às APIs do Cloudflare não roda no CI. Ela é conferida no passo 4 acima.
