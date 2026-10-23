# Guia do Desenvolvedor — Vox Fases 2 e 3

Este documento descreve como testar o fluxo de leitura, autoria (upload de transações), compartilhamento, governança e a rede de nós participativos (Fase 3) no PWA vanilla do Vox.

---

## 1. Ambiente Local

O Vox é um PWA sem etapa de compilação (*no-build*), utilizando módulos JavaScript nativos (ES Modules).

Para rodar localmente:
```bash
cd client
python -m http.server 8080
```
Abra no navegador: `http://127.0.0.1:8080/`

### 1.1 Executar Testes Unitários Locais (Tudo)

O Vox inclui suíte completa de testes unitários locais (45 testes: 33 client JS + 12 relay/signaling Python), sem dependências pesadas externas:

```bash
# Na raiz do repositório vox/
npm test
# ou no Windows:
.\test.bat
```

Para rodar apenas os testes do cliente PWA:
```bash
npm run test:client
# ou diretamente:
node --test tests/*.test.js
```

Para rodar apenas os testes do servidor relay/signaling:
```bash
npm run test:relay
# ou diretamente:
python -m unittest discover -s relay -p "test_*.py"
```

### 1.2 Integração Contínua & Deploy (GitHub Actions)

As pipelines em `.github/workflows/` rodam automaticamente no GitHub:
1. **`ci.yml`:**
   - Disparado em todo `push` ou `pull_request` na branch `main`.
   - Executa matriz de testes no Node.js (20, 22 e 24) e Python (3.11 e 3.12).
   - Valida checagem estática de sintaxe e executa os 45 testes unitários.
   - Auditoria de segurança: verifica que nenhuma chave privada foi commitada acidentalmente.
2. **`deploy-pages.yml`:**
   - Publica o site composto (`client/**` + `docs/proposta-vox.html`) no GitHub Pages a cada alteração em `client/**` ou `docs/**`.
   - Origem configurada via GitHub Actions (`build_type: workflow`).
   - URLs ativas em produção:
     - **PWA Vox:** `https://yurikayel.github.io/vox/`
     - **Proposta & Arquitetura:** `https://yurikayel.github.io/vox/proposta-vox.html`

---

## 2. Carteira de Testes (Arweave JWK)

Para publicar comunidades, tópicos, respostas ou ações de moderação na rede real, é necessário uma carteira Arweave.

### 2.1 Como Obter / Gerar
1. **Pela interface do Vox:** Acesse a rota `#/wallet` e clique em **"Gerar Nova Carteira"**. A chave privada (JWK) será salva localmente no seu navegador (`localStorage: vox-wallet-jwk`).
2. **Importando JWK existente:** Caso já tenha uma carteira Arweave (gerada via ArConnect, ArScribe ou CLI), cole o JSON no campo da tela `#/wallet` e clique em **"Salvar Carteira"**.
3. **Faucets de Teste:**
   * Obtenha frações de AR para testes em faucets comunitários (ex: [faucet.arweave.net](https://faucet.arweave.net)) ou envie alguns micro-centavos de AR para o endereço exibido na tela `#/wallet`.

> [!CAUTION]
> **NUNCA faça commit de arquivos JWK ou chaves privadas reais no repositório Git!**  
> O arquivo `.gitignore` já bloqueia `*.jwk`, `*.jwk.json` e `client/config/wallet.local.json`. Mantenha suas chaves salvas apenas no seu navegador ou em local seguro offline.

---

## 3. Teste do Fluxo de Autoria e Crossposting (Fase 2 DoD)

Para validar o *Definition of Done* da Fase 2:
1. Abra `http://127.0.0.1:8080/#/wallet` e gere ou importe uma carteira.
2. Abra `http://127.0.0.1:8080/#/compose/community` e crie uma nova comunidade (ex: "Tecnologia Livre Brasil").
3. Após o envio, entre na comunidade e clique em **"+ Novo Tópico"** (`#/compose/topic?c=slug`).
4. Escreva um título e o corpo do tópico. Envie a transação.
5. Na visualização do tópico, clique no botão **"Compartilhar"**:
   * Em dispositivos com suporte a Web Share (Android/iOS/Chrome), o menu nativo abrirá permitindo envio direto ao **WhatsApp**.
   * Em desktops sem suporte, o link será copiado automaticamente para a área de transferência com notificação visual.
6. Teste de Membresia: Clique em **"Entrar na comunidade"** e depois visite o perfil `#/u/<seu-endereco>` para ver a comunidade listada.
7. Teste de Moderação: Sendo criador da comunidade, teste o botão **"Ocultar"** em um tópico para verificar o filtro de supressão *client-side*.

---

## 4. Teste de Nós Participativos e Espelhos (Fase 3 DoD)

### 4.1 Teste Peer-to-Peer entre duas instâncias do PWA
1. Abra duas abas ou janelas distintas do navegador em `http://127.0.0.1:8080/#/settings/network`.
2. Em ambas as abas, marque a caixa **"Ativar nó participativo de leitura"** e clique em **"Salvar Preferências"**.
3. Na **Aba 1**, navegue até um tópico qualquer e abra a discussão (o corpo será baixado e salvo no IndexedDB local).
4. Na **Aba 2**, navegue até o mesmo tópico. O cliente emitirá um pedido `WANT` no canal `vox-peer-v0`; a Aba 1 responderá com um `BLOB` do seu cache local antes que a consulta chegue aos gateways públicos!
5. Retorne a `#/settings/network`:
   * Na **Aba 1**, veja o contador **"Itens Servidos"** e **"Banda Doada"** incrementados.
   * Na **Aba 2**, veja o contador **"Itens de Pares"** incrementado.

### 4.2 Teste com o Vox Relay Desktop (Localhost)
1. Em um terminal separado, inicie o relay Python:
   ```bash
   cd vox/relay
   python server.py
   ```
2. Verifique no navegador ou curl que `http://127.0.0.1:3920/health` responde com status 200 e JSON.
3. No PWA do Vox, abra `#/settings/network` e clique no botão **"Verificar Relay Desktop"**:
   * O badge exibirá: `🟢 Relay Online (127.0.0.1:3920)`.
4. Ao abrir tópicos ainda não cacheados no PWA, o relay fará o proxy para `arweave.net`, armazenará a cópia na pasta local `vox/relay/.cache/` e servirá ao PWA com latência reduzida.

### 4.3 Teste de Resiliência Offline
1. Simule a desconexão de rede (ou desligue o Wi-Fi).
2. Tópicos e comunidades previamente visitados continuam abrindo instantaneamente a partir do cache IndexedDB (`cache-node.js`) e do Vox Relay local, comprovando a tolerância a apagões de conectividade.

---

## 5. Teste da Rede Distribuída por Padrão — Fase 3.1 DoD

### 5.1 Modal Onboarding do Pacto Vox
1. No console do DevTools, execute:
   ```javascript
   localStorage.removeItem("vox-pact-accepted");
   location.reload();
   ```
2. O modal **Pacto Vox: Rede Distribuída** é renderizado cobrindo a tela, informando a relação soberania ↔ cooperação técnica.
3. Teste o botão **"Concordar e Entrar"**:
   * O modal fecha, define `vox-pact-accepted = "true"` no `localStorage` e exibe um toast de confirmação.
4. Repita limpando a chave e teste o botão **"Ajustar Limites de Rede Primeiro"**:
   * O modal fecha e a navegação redireciona imediatamente para `#/settings/network`.

### 5.2 Validação Default-on e Opt-Out ("Pausar Contribuição")
1. Sem configuração prévia, abra `#/settings/network`:
   * O badge exibe: `🟢 Nó Leve Ativo (Padrão)`.
   * A caixa de diálogo exibe a barra de uso diário `0.0 / 50 MB`.
2. Para testar o opt-out:
   * Marque a opção **"Pausar contribuição (desativar nó leve e usar apenas modo leitura)"** e clique em **"Salvar Preferências"**.
   * O badge muda para: `⏸️ Contribuição Pausada`. O canal `vox-peer-v0` deixa de responder a pacotes `WANT` de outros pares.

### 5.3 Service Worker e Background Relay
1. Abra as Ferramentas do Desenvolvedor (F12) -> aba **Application** -> **Service Workers**:
   * O arquivo `sw.js` deve estar com status **Activated and running** com escopo `./`.
2. Na aba **Cache Storage**, certifique-se de que o cache `vox-pwa-v3.2` contém os arquivos estáticos pré-cacheados (`index.html`, `style.css`, módulos `.js`).
3. Em `#/settings/network`, ative a opção **"Atuar em segundo plano via Service Worker"** e clique em **"Ativar Notificações de Status"**:
   * Ao autorizar permissão no navegador, o Service Worker sincroniza a configuração via mensagem `VOX_SETTINGS_UPDATED`.

---

## 6. Teste de Pares entre Dispositivos via WebRTC — Fase 3.2 DoD

### 6.1 Iniciar Servidor de Sinalização Local
Em um terminal, inicie o servidor WebSocket padrão:
```bash
cd vox/relay
python signaling.py --port 3921
```

### 6.2 Teste entre Duas Máquinas ou Dispositivos na LAN
1. Inicie o servidor do PWA:
   ```bash
   cd vox/client
   python -m http.server 8080 --bind 0.0.0.0
   ```
2. Abra o PWA no **Dispositivo A** (`http://192.168.x.x:8080`) e no **Dispositivo B** (outro celular ou navegador).
3. Na tela `#/settings/network` de ambos, caso não estejam em localhost, insira a URL do signaling do seu IP local (ex: `ws://192.168.x.x:3921`) e clique em **"Salvar Preferências"**.
4. Observe o badge no topo: `🌐 WebRTC: 1 par remoto` em ambos os nós!
5. No **Dispositivo A**, abra um tópico comunitário. O conteúdo é baixado e persistido no IndexedDB.
6. No **Dispositivo B**, abra o mesmo tópico:
   * A requisição `WANT` é enviada pelo canal WebRTC `vox-peer-v0`.
   * O Dispositivo A responde com o pacote `BLOB` contendo os dados do tópico diretamente via P2P.
   * No Dispositivo A, veja o contador **"Itens Servidos (1 RTC)"** ser incrementado.
7. **Teste de Degradação Graciosa:** Interrompa o `signaling.py` (Ctrl+C). Abra um tópico novo no Dispositivo B: o cliente tenta o canal WebRTC, expira em 2000 ms e realiza o fallback imediato para os gateways públicos (`arweave.net`), mantendo a navegação 100% funcional.
8. **Teste de Teto Diário:** Ao ultrapassar os 50 MB ou ativar "Pausar contribuição", o nó recusa automaticamente responder a solicitações `WANT` recebidas via WebRTC, preservando os recursos do usuário.

---

## 7. Fallback de Demonstração

Se os gateways Arweave estiverem temporariamente inacessíveis e não houver cache ou peers para o item solicitado, o Vox ativa automaticamente o **Modo Demonstração** (`mock.js`), permitindo navegar pela interface e testar formulários e telas sem travamentos.


---

## 8. Teste de DMs E2E Efêmeras — Fase 4 DoD

### 8.1 Cenário 1: Entrega Online Instantânea via WebRTC

1. Inicie o servidor de sinalização e o PWA:
   ```bash
   python relay/signaling.py --port 3921
   cd client && python -m http.server 8080
   ```
2. Abra duas janelas do navegador (ex: janela normal e janela anônima):
   - **Janela A (Alice):** Gere uma nova carteira em `#/wallet`. Copie seu endereço (`addr_alice`).
   - **Janela B (Bob):** Gere outra carteira em `#/wallet`. Copie seu endereço (`addr_bob`).
3. Ambas as abas se registram no `signaling.py` anunciando seus endereços e chaves públicas `Dm-Pub` (ECDH P-256).
4. Na Janela A (Alice), abra `#/dm` e digite o endereço de Bob (`addr_bob`).
   - O cabeçalho exibe `🟢 WebRTC Online` e `🔒 Criptografia E2E Pronta`.
5. Alice digita `"Olá Bob! Conversa direta P2P."` e clica em **Enviar 🔒**:
   - A mensagem é cifrada no navegador com chave efêmera de sessão + chave de Bob.
   - É despachada diretamente pelo canal WebRTC `"vox-dm-v0"`.
   - Na Janela B (Bob), a mensagem aparece instantaneamente com selo `✓✓ RTC`.
   - O relay **nunca** viu o texto e o Arweave **nunca** recebeu transações.

### 8.2 Cenário 2: Entrega Offline com Caixa Postal TTL (Relay Inbox)

1. Inicie o servidor de relay HTTP com inbox na porta 3920:
   ```bash
   python relay/server.py --port 3920
   ```
2. Feche a Janela B (Bob está offline).
3. Na Janela A (Alice), envie outra mensagem: `"Mensagem quando você voltar!"`.
   - Como Bob está desconectado do WebRTC, o cliente faz fallback automático para o Relay Inbox.
   - Envia `POST http://127.0.0.1:3920/inbox/addr_bob` com o envelope cifrado.
   - O status da mensagem na tela de Alice marca `✓ Relay`.
4. Verifique em disco: o arquivo `.inbox/addr_bob/<dm_id>.json` foi gravado com `expiresAt` de 72 horas. O conteúdo é apenas ciphertext ininteligível (`ct`).
5. Abra novamente a Janela B (Bob) com a carteira de Bob ativa e acesse `#/dm`:
   - O app faz `GET /inbox/addr_bob`, puxa o envelope e o decifra localmente via WebCrypto.
   - O texto `"Mensagem quando você voltar!"` é exibido na tela e gravado no IndexedDB de Bob.
   - O cliente de Bob emite `DELETE /inbox/addr_bob/<dm_id>` limpando o relay.


---

## 9. Teste de Handles Amigáveis & Resolução (@handle) — Fase 5 DoD

### 9.1 Reivindicar @handle

1. Com uma carteira ativa no navegador (`#/wallet`), acesse o seu perfil (`#/u/<seu-endereco>`).
2. No card "Identidade & Chaves", localize o formulário **"Reivindicar ou atualizar @handle on-chain"**.
3. Digite um slug desejado (ex: `maria`) e clique em **Salvar @handle**:
   - O cliente valida o formato `[a-z0-9-]{3,24}` e rejeita slugs reservados (`admin`, `vox`, etc.).
   - Dispara uma transação `Type: handle` com as tags `Handle: maria` e `Owner-Addr: <seu-endereco>`.
   - O mapeamento é persistido no cache local em `localStorage`.

### 9.2 Resolução via Rotas e Links Curtos

1. No navegador, digite diretamente:
   - `http://127.0.0.1:8080/#/h/maria` ou
   - `http://127.0.0.1:8080/#/u/@maria`
2. O PWA consulta o GraphQL (ou o cache local) e redireciona automaticamente para o perfil correspondente.
3. Teste com parâmetro de URL:
   - Acesse `http://127.0.0.1:8080/?h=maria`. O script inicial converte a query para `#/h/maria` e resolve o perfil.

### 9.3 Cenário de Ambiguidade / Conflito Social

1. Se duas contas diferentes publicarem o mesmo slug:
2. Ao navegar para `#/h/maria`, o Vox detecta múltiplos reivindicantes (`isConflict: true`).
3. O cliente renderiza a tela de **Ambiguidade de Handle**, apresentando os endereços de todos os reivindicantes com links diretos, permitindo ao usuário decidir sem intervenção de nenhum moderador central.

---

## 10. UI & Copy — Guia de Estilo Híbrido X / Instagram

O PWA adota uma experiência leve e intuitiva inspirada no melhor do X e do Instagram:
- **Chrome mínimo:** Barra superior fina (~52px) com logo e chip de status da rede; sem gradientes pesados.
- **Navegação rápida:** TabBar inferior no mobile e Sidebar esquerda no desktop (≥768px).
- **A Rua (Feed):** Timeline cronológica com divisores sutis (1px), avatares redondos, título do post e ações rápidas (💬 Responder, ↗ Compartilhar).
- **Descoberta de Comunidades:** Grade visual estilo IG com cartões compactos e entrada direta.
- **DMs (Mensagens):** Inbox estilo chat mobile e conversa full-height com caixa de envio fixa.
- **Modo Claro / Escuro:** Automático via `prefers-color-scheme`, respeitando o tema do sistema operacional sem flash de cor.

### 10.1 Tabela de Tom & Microcopy (Sem Slop Técnico)

Para manter a clareza e acolhimento para o usuário leigo, jargões técnicos são restritos a `<details class="advanced-settings">`:

| Superfície Anterior (Técnica) | Superfície Atual (Amigável) | Destino do Detalhe Técnico |
|-------------------------------|-----------------------------|----------------------------|
| "Mensagens Diretas Efêmeras (E2E) ECDH P-256..." | **"Mensagens"** · *Privadas. Só neste aparelho.* | Documentação / DEV.md |
| "Rede Distribuída (Pacto Vox)" | **"Sua rede"** · *Você ajuda a levar o Vox adiante.* | Seção Informativa |
| "Pausar contribuição (desativar nó leve...)" | **"Pausar ajuda à rede"** | Toggle em Preferências |
| "Relay Desktop Desconectado (127.0.0.1:3920)" | **"PC offline"** | Avançado → Testar Relay |
| "Servidor de Sinalização WebRTC (ws://...)" | **"Sinalização WebRTC"** | Avançado → Input custom |
| Empty states com parágrafos explicativos | **1 frase objetiva + 1 botão de ação** | Direto ao ponto |

Regra de ouro: frases curtas (≤ ~8 palavras na interface principal), contraste WCAG testado e zero dependências externas de ícones ou frameworks.

---

## 11. Arquitetura P2P-First & Conta Local (vox-local-v0)

O Vox opera primariamente como uma rede ponto a ponto cooperativa, sustentada pelos aparelhos dos usuários sob o **Pacto Vox**, sem custos financeiros ou necessidade de carteira de criptomoeda no onboarding:

### 11.1 Conta Local & Route ID (`vx_...`)
- Ao abrir o app pela primeira vez, `local-account.js` gera instantaneamente um par de chaves criptográficas ECDSA P-256 armazenado em `localStorage`.
- O identificador público do usuário é derivado como `routeId` (`vx_` + 20 caracteres base64url do SHA-256 da chave pública).
- As mensagens privadas (DMs) utilizam par ECDH P-256 correspondente, roteadas diretamente pelo `routeId` via WebRTC ou Relay Inbox com TTL de 72h.
- O usuário pode configurar seu Nome de Exibição localmente na tela `#/perfil` sem necessidade de transações pagas.

### 11.2 Gossip de Publicações & IndexedDB
- Posts, tópicos, comunidades e respostas criados sem carteira são assinados digitalmente com a chave local e propagados via protocolo `GOSSIP` (`vox-local-v0`) através de `BroadcastChannel` e canais WebRTC DataChannel ativos.
- O store `local-posts` no IndexedDB persiste as publicações recebidas dos pares com deduplicação e validação canônica de assinatura.
- **A Rua (Feed):** Mescla em tempo real as publicações da rede P2P local com os tópicos do permaweb (Arweave GraphQL), identificando a origem com badges visuais claras:
  - `🌐 Na rede`: post distribuído via malha participativa P2P.
  - `💾 Permanente`: post ancorado no permaweb.

### 11.3 Permaweb Opcional
- A funcionalidade de carteira Arweave (`wallet.js`) permanece totalmente suportada, mas é posicionada como recurso avançado para usuários que desejam ancoragem permanente e imutável on-chain.
- O acesso à carteira e anúncios on-chain fica acessível na seção expansível `<details class="advanced-settings">` no Perfil.


