# Sustentação Perene da Vox a Custo $0: Celulares, Permaweb e Matriz de Redundância

> **Diretiva Estratégica:** A Vox deve ser auto-sustentada, imparável e perpétua, operando sem exigir nenhum servidor alugado, cartão de crédito, domínio pessoal ou intervenção do mantenedor.

---

## 1. Arquitetura Permaweb Arweave $0 Inviolável

Para desvincular a aplicação de qualquer infraestrutura pessoal do desenvolvedor:

```mermaid
flowchart LR
    subgraph CLIENTE["Navegador / Celular"]
        A["PWA / Micro-APK"] -->|1. Assina ANS-104 no cliente| B["Item Binário (< 100 KiB)"]
    end

    subgraph ARWEAVE["Rede Arweave / Turbo Free Tier"]
        B -->|2. POST direto sem intermediário| C["Turbo Bundler (0 AR)"]
        C -->|3. Mineração permanente| D["Permaweb / L1 Blockchain"]
    end

    subgraph FEDERACAO["Federação Multi-Gateway GraphQL"]
        E["arweave.net"]
        F["turbo-gateway.com"]
        G["ar-io.dev"]
        H["g8way.io"]
    end

    D --> E & F & G & H
    E & F & G & H -->|4. Consulta em Quorum (Round-Robin)| A
```

### A. Upload Descentralizado Direto (Client-to-Permaweb)
- O cliente JavaScript no navegador já monta e assina itens ANS-104 nativamente (`ans104.js`).
- Posts, fotos comprimidas (WebP Lo-Fi $\le 50\text{ KiB}$) e cartões de identidade são enviados diretamente do celular do usuário para os endpoints do Turbo Bundler (`https://upload.ardrive.io` / `https://turbo-gateway.com/tx`).
- **Custo:** ~~R$ 0,00 para sempre~~ — **desatualizado (2026-11-07):** o grátis do Turbo tem cota (~10 MiB por carteira/IP, segundo `upload.ardrive.io/info`). Ver [INFRA-CUSTOS.md](../INFRA-CUSTOS.md).

### B. Leitura Multi-Gateway com Consenso e Quorum
- Não depender de um único gateway Arweave. O cliente consulta uma lista circular de gateways públicos:
  1. `https://arweave.net/graphql`
  2. `https://turbo-gateway.com/graphql`
  3. `https://ar-io.dev/graphql`
  4. `https://g8way.io/graphql`
  5. `https://permaweb.mobi/graphql`
- Se um gateway rate-limitar ou cair, o cliente alterna em tempo real sem travar a navegação.

---

## 2. A Máquina de Captação de Celulares (The Mobile Swarm)

84% da população brasileira acessa a internet prioritariamente via smartphones. Transformar esses aparelhos em servidores da malha é a chave para a escala.

### A. As Três Camadas de Engajamento Móvel

```
+---------------------------------------------------------------+
| Nível 3: Micro-APK Seeder (16 KiB em Java Puro)               |
|          -> Roda 24/7 como Foreground Service                 |
|          -> Imune ao Doze Mode do Android                     |
|          -> Celulares antigos e TV Boxes como Faróis Fixos    |
+---------------------------------------------------------------+
                               ^
                               | (Upgrade voluntário 1-clique)
+---------------------------------------------------------------+
| Nível 2: PWA em Forja Noturna (Overnight Relay)              |
|          -> Ativa quando: Carregador Plugado + Wi-Fi          |
|          -> Roda Web Workers para gossip, validação e cache   |
|          -> Zero dreno de bateria no dia a dia                |
+---------------------------------------------------------------+
                               ^
                               | (Uso comum no navegador)
+---------------------------------------------------------------+
| Nível 1: PWA Leitor Efêmero (Cidadão na Praça)               |
|          -> Abre a aba, consome feed, faz upload Turbo        |
|          -> Mantém WebRTC aberto enquanto a aba estiver visível|
+---------------------------------------------------------------+
```

### B. Armazenamento Distribuído em Micro-Shards (Erasure Coding)
- Nenhum celular precisa guardar 10 GB.
- Cada celular cede uma cota modesta no `IndexedDB` (ex: 50 MB).
- Imagens e mídias são fatiadas em **micro-pedaços de 16 KiB** com redundância Reed-Solomon (esquema $10 + 4$).
- Quando 100 celulares de uma comunidade estão online, a vizinhança dispõe de **5 GB de armazenamento descentralizado de alta velocidade**, imune à saída de metade dos nós.

### C. Periodic Background Sync (PWA Nativo)
- O Service Worker do PWA (`sw.js`) registra a API `periodicSync`:
  ```javascript
  navigator.serviceWorker.ready.then((reg) => {
    reg.periodicSync?.register("vox-mesh-keepalive", { minInterval: 24 * 60 * 60 * 1000 });
  });
  ```
- O sistema operacional acorda periodicamente o app em segundo plano no Wi-Fi para renovar índices locais e retransmitir fragmentos para nós vizinhos.

---

## 3. Matriz Global de Nós Base e Redundância Infinita ($0)

Para assegurar que sempre existam pontos de encontro (rendezvous) abertos para WebRTC:

```
VETOR 1: BitTorrent Mainline DHT (BEP 44 / BEP 46)
-> 10+ milhões de nós ativos no mundo há 15 anos.
-> Armazena registros arbitrários de 1000 bytes assinados por chave Ed25519.
-> Permite que a Vox guarde o endereço dos relays ativos diretamente no DHT global!

VETOR 2: Federação de Relays Nostr Públicos (NIP-65)
-> Kind 25000 para handshake efêmero WebRTC (SDP Offer/Answer).
-> Descoberta dinâmica: consultar wss://purplepag.es e puxar lista viva de 50+ relays abertos.

VETOR 3: Trackers WebTorrent Abertos
-> openwebtorrent, btorrent.xyz, webtorrent.dev, files.fm, torrent.eu.org.

VETOR 4: Serverless Edge Gratuito com Rotação (Cloudflare Workers + Deno Deploy)
-> Deno Deploy: 100k req/dia gratuitas (Instâncias A e B).
-> Cloudflare Workers: 100k req/dia gratuitas (WebSocket signaling stateless).

VETOR 5: GitHub Actions Cron Keep-Alive
-> Executa a cada 6 horas um runner Ubuntu gratuito de 30 segundos.
-> Testa os relays, mede a saúde da rede e faz commit de telemetria pública.
```

---

## 4. O Movimento "Adote um Vox Populi" (Hardware Comunitário)

- Milhões de famílias brasileiras têm um celular com tela trincada em uma gaveta ou um TV Box na sala de TV.
- Um celular velho conectado ao carregador no Wi-Fi de uma associação de moradores ou sindicato consome menos de 2 Watts (menos de R$ 1,50/mês).
- Rodando o **Micro-APK Vox Populi de 16 KiB**, esse aparelho se torna o **Vox Populi Cívico do Bairro**, garantindo sinalização e cache permanente para todas as pessoas do quarteirão.

---

## 5. Plano de Implementação em 5 Frentes Imediatas

1. **Frente 1 (Multi-Gateway GQL):** Implementar no cliente fallback automático com quorum entre os 5 gateways GraphQL da Arweave.
2. **Frente 2 (Descoberta Dinâmica de Relays Nostr):** Puxar relays abertos via NIP-65 para não depender de uma lista fixa estática.
3. **Frente 3 (Micro-Sharding 16 KiB):** Criar particionador Reed-Solomon leve no navegador para cache comunitário fracionado.
4. **Frente 4 (Banner Vox Populi no PWA):** Adicionar botão amigável nas configurações: *"Tem um celular velho em casa? Transforme-o em Vox Populi Comunitário com 1 clique"*, baixando o Micro-APK.
5. **Frente 5 (BEP 44 DHT Rendezvous):** Registrar ponte de handshake no DHT público do BitTorrent.
