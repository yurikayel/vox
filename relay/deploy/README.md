# 🌐 Deploy Self-Host: Signaling WSS + TURN Comunitário (Fase 3.3)

Quando o PWA do Vox roda sob **HTTPS** (ex: GitHub Pages ou Cloudflare Pages), os navegadores modernos exigem que a sinalização WebSocket utilize **WSS (`wss://`)** com TLS válido. Além disso, conexões diretas entre dois celulares em redes móveis **4G/5G com NAT simétrico** podem exigir um servidor **TURN** para intermediar os pacotes UDP do WebRTC.

Este diretório fornece uma pilha pronta em Docker (`docker-compose.yml`) para que qualquer comunidade, coletivo ou voluntário suba seu próprio ponto de sinalização e TURN em 5 minutos, **sem depender de servidores centrais do projeto**.

---

## 📦 O que compõe a pilha

1. **`vox-signaling` (`signaling.py`):** Servidor WebSocket Python stdlib (zero dependências pip) que faz o pareamento SDP/ICE entre dispositivos sem armazenar dados.
2. **`vox-relay` (`server.py`):** Relay HTTP — cache de transações, espelhos `POST /vox/mirror`, `GET /health`. Volume Docker `vox_relay_cache`.
3. **`vox-caddy` (Caddy 2):** Reverse proxy TLS (Let's Encrypt). WebSocket → signaling; **demais rotas** → relay (`/health`, `/tx/*`, `/vox/*`, `/inbox/*`).
4. **`vox-coturn` (Coturn):** Servidor STUN/TURN leve e blindado contra SSRF/abuso (`turnserver.conf`), restrito à faixa de portas `49152-49200/udp` e com limite de taxa (`max-bps=512000`).

---

## 🚀 Passo a Passo na VPS

### 1. Apontar DNS
Crie um registro DNS `A` (e opcionalmente `AAAA`) apontando seu subdomínio (ex: `signal.sua-comunidade.org`) para o IP público da sua VPS.

### 2. Ajustar Configurações
1. Edite [`Caddyfile`](./Caddyfile) e troque `signal.sua-comunidade.org` pelo seu domínio real.
2. Edite [`turnserver.conf`](./turnserver.conf):
   - Altere `user=vox:troque-esta-senha-comunitaria` para uma credencial forte.
   - Se a VPS estiver atrás de NAT (como AWS EC2 ou Oracle Cloud), descomente `external-ip=SEU_IP_PUBLICO`.

### 3. Liberar Portas no Firewall (UFW / Security Group)
- `80/tcp` e `443/tcp` (Certificado TLS e WebSocket `wss://`)
- `3478/udp` e `3478/tcp` (Coturn STUN/TURN)
- `49152:49200/udp` (Faixa de mídia/relay TURN)

### 4. Quota de cache (opcional)

```bash
cp .env.example .env
# Edite VOX_RELAY_MAX_CACHE_MB (padrão 512)
```

O serviço `vox-relay` lê `VOX_RELAY_MAX_CACHE_MB`; quando o disco de cache atinge o teto, novos espelhos retornam HTTP 413. Monitore com `GET /health` (`cacheBytes`, `maxCacheBytes`, `communityIndexes`). Ver [`docs/steward-relay-kit.md`](../../docs/steward-relay-kit.md).

### 5. Subir os Containers
```bash
cd vox/relay/deploy
docker compose up -d --build
curl -sS "https://signal.sua-comunidade.org/health"
```

---

## 📱 Como Configurar no PWA do Vox

Qualquer membro da sua comunidade pode usar o servidor abrindo `#/settings/network` no Vox:

1. **Servidor de Sinalização WebRTC:** `wss://signal.sua-comunidade.org`
2. **URL HTTP do relay:** `https://signal.sua-comunidade.org` *(mesmo host — Caddy encaminha para `vox-relay`)*
3. **URL do Servidor TURN:** `turn:signal.sua-comunidade.org:3478`
4. **Usuário TURN:** `vox`
5. **Credencial TURN:** *(a senha definida no `turnserver.conf`)*
6. Clique em **Salvar Preferências** — ou use o assistente `#/settings/network/steward`.

> **Nota para forks/espelhos:** Se você hospeda seu próprio front-end estático, pode pré-preencher esses valores diretamente em [`client/config/signaling.json`](../../client/config/signaling.json) para que seus usuários já entrem conectados por padrão.
