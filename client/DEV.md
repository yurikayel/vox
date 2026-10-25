# Guia do Desenvolvedor — Vox Fases 2 e 3

Este documento descreve como testar o fluxo de leitura, autoria (upload de transações), compartilhamento, governança e a rede de nós participativos (Fase 3) no PWA vanilla do Vox.

**Malha P2P / handoff Antigravity:** ver [`docs/antigravity-operating.md`](../docs/antigravity-operating.md). **Cache offline:** valor canônico em `CACHE_NAME` dentro de [`sw.js`](./sw.js) (não duplicar string fixa nos parágrafos abaixo — consulte o arquivo).

**Release line:** após cada merge em `main`, confira SHA (`git rev-parse --short HEAD`), rode `npm test` (**201** testes: **187** JS + **14** Python) e anote o `CACHE_NAME` vigente. Usuários em Pages precisam de **hard refresh** para pegar shell novo.

---

## 0. Fluxo Git (branches)

| Regra | Detalhe |
|-------|---------|
| **`main` deployável** | Pages e CD disparam em push em `main`; mantenha-a estável. |
| **Trabalho novo** | `git pull origin main` → `git checkout -b feat/...` (ou `fix/...`). |
| **Entrega** | Push da branch → PR ou merge; **não** commitar features direto em `main` (agentes incluídos). |

Ver também [README — Como Contribuir](../README.md#-como-contribuir).

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

O Vox inclui suíte completa de testes unitários locais (**201** testes: **187** client JS + **14** relay/signaling Python), sem dependências pesadas externas:

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
   - Executa matriz de testes no Node.js (22 e 24) e Python (3.11 e 3.12).
   - Valida checagem estática de sintaxe e executa os **201** testes unitários.
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
2. Na aba **Cache Storage**, certifique-se de que o cache vigente (`CACHE_NAME` em `sw.js`) contém os arquivos estáticos pré-cacheados (`index.html`, `style.css`, módulos `.js`, incl. `inline-composer.js` e `composer-media.js`).
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

## 10. UI & Copy — Guia de superfícies sociais

O PWA adota uma experiência leve e intuitiva com padrões de mercado para leitura e engajamento:
- **Chrome mínimo:** Barra superior fina (~52px) com logo e chip de status da rede; sem gradientes pesados.
- **Navegação rápida:** TabBar inferior no mobile e Sidebar esquerda no desktop (≥768px).
- **Para você (Feed):** Timeline cronológica com divisores sutis (1px), avatares redondos, título do post e ações rápidas (💬 Responder, ↗ Compartilhar). Sem termos herdados do Varanda (ex: "A Rua", "Cadeiras").
- **Descoberta de Comunidades:** Grade visual estilo IG com cartões compactos, faixa de cor derivada da comunidade e entrada direta via "Abrir →".
- **DMs (Mensagens):** Inbox estilo chat mobile e conversa full-height com caixa de envio fixa.
- **Modo Claro / Escuro / Automático:** Toggle no rodapé da sidebar (`vox-color-mode`); automático = `prefers-color-scheme` + paleta celeste por relógio (`data-sky-period`); claro/escuro forçam pergaminho/carbono.
- **Tab Bar com Ícones SVG:** Ícones minimalistas inline em SVG (22x22, `currentColor`), substituindo emojis e elevando o acabamento visual.

### 10.1 Tabela de Tom & Microcopy (Sem Slop Técnico)

Para manter a clareza e acolhimento para o usuário leigo, jargões técnicos são restritos a `<details class="advanced-settings">`:

| Superfície Anterior (Técnica / Varanda) | Superfície Atual (Amigável & Humana) | Destino do Detalhe Técnico |
|-----------------------------------------|--------------------------------------|----------------------------|
| "A Rua — Timeline Recente"              | **"Para você"**                      | Naming moderno padrão X/IG |
| "Pacto Vox: Rede Distribuída" (Modal)   | **"Bem-vindo ao Vox"**               | Modal de Boas-Vindas       |
| "Tópicos do Fórum" / "Fórum de..."      | **"Posts"**                          | Feed da Comunidade         |
| "c/{id}" (slug técnico no pill)         | **Nome da Comunidade** / "Comunidade"| Pill amigável              |
| "Permanente" (com tooltip permaweb)     | **"Guardado"**                       | Badge de status            |
| "Na rede (P2P cooperativo)"             | **"Na rede"**                        | Badge de status            |
| "WebRTC: 3 pares remotos" (Header)      | **"3 aparelhos conectados"**         | Avançado → Conexões        |
| "Relay Online (127.0.0.1:3920)"         | **"🟢 Conectado" / "⚪ Offline"**    | Avançado → Servidor Local  |
| "WebRTC Online" / "Relay Inbox TTL"     | **"Conectado"** / **"Entrega offline"** | Status do Chat Privado  |
| "Sinalização WebRTC (ws://...)"         | **"Servidor de conexão (opcional)"** | Avançado → Input custom    |
| Empty states com parágrafos explicativos| **1 frase objetiva + 1 botão de ação**| Direto ao ponto           |

> [!NOTE]
> Termos do Varanda e análises de engenharia permanecem exclusivamente em `LESSONS.md` e `README.md` como registro histórico. A interface e a cópia voltadas para o usuário são 100% limpas de jargões técnicos.

Regra de ouro: frases curtas (≤ ~8 palavras na interface principal), contraste WCAG testado e zero dependências externas de ícones ou frameworks.

### 10.2 Tokens de Design & Estética Futurista (Glass / Deep Space)

A interface utiliza uma estética translúcida (*glass / deep space*) com profundidade e acabamento refinado:
- **Mesh de Fundo Sutil (`--mesh-bg`):** Gradiente radial fixo em `.app-layout::before`, conferindo ambiência luminosa sem interferir na leitura.
- **Painéis Translúcidos (`--glass-bg`, `--glass-blur`):** Header, barra inferior de abas, cards e modais aplicam `backdrop-filter: blur(12px)` (ou 24px em diálogos) e transparência calculada.
- **Fios Luminosos (`--glass-border`):** Bordas de 1px com translucidez calibrada para modo claro e escuro, definindo limites precisos sem peso visual.
- **Micro-interações & Acessibilidade:**
  - Chip de rede com anel de pulso sutil no ponto verde quando conectado.
  - Botões primários com degradê linear (`--accent-gradient`) e glow em foco (`--accent-glow`).
  - Fallback via `@supports not (backdrop-filter: blur(1px))` mantendo legibilidade total em navegadores antigos.
  - Suporte completo a `@media (prefers-reduced-motion: reduce)` suprimindo animações e transições.

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

---

## 12. Tour de Demonstração (10 Personas Educativas & Diversidade Plural)

Na **Sprint v5.8**, o Vox expande o tour para **10 perfis educativos** na comunidade `demo-aprenda-vox`, orientados a resolver dores reais de plataformas corporativas centralizadas (Meta, X, TikTok, WhatsApp) sem promessas enganosas (*false advertising*).

### 12.1 Elenco Representativo (Regra 6 Mulheres / 4 Homens)
O elenco é desenhado para refletir a diversidade brasileira autêntica, evitando estereótipos e dando voz própria a cada persona:
- **6 Mulheres / 4 Homens**
- **1 mulher branca** (`Helena`) e **1 homem branco** (`Lucas`); demais personas com **etnias distintas** (negras, indígenas, asiáticas brasileiras, pardas/nordestinas, árabes-brasileiras e sul-asiáticas brasileiras).

| # | Autor (`routeId`) | Nome | G | Etnia/Perfil | Dor Externa | Resolução no Vox | Status |
|---|---|---|---|---|---|---|---|
| 1 | `vx_demo_helena` | **Helena** | M | Branca | Instagram só mostra oficina se pagar | Comunidade e feed "Para você", sem impulsionar | `now` |
| 2 | `vx_demo_juliana` | **Juliana** | M | Negra | Comentário some na Meta sem motivo | Moderação pública: regra e quem aplicou à vista | `now` |
| 3 | `vx_demo_yara` | **Yara** | M | Indígena | Relatos sugados para treinar IA | Dados no celular; banda e pausa sob o usuário | `now` |
| 4 | `vx_demo_mei` | **Mei** | M | Asiática BR | Vídeo que toca sozinho (Reels/TikTok) | Leitura em paz: zero autoplay, zero som sozinho | `now` |
| 5 | `vx_demo_fernanda` | **Fernanda** | M | Parda / NE | Feed de anúncio e seguidor comprado | Sem anúncio no meio da conversa; contas de aparelho real | `now` |
| 6 | `vx_demo_salma` | **Salma** | M | Árabe-BR | Filtro automático derruba canal | Identidade gerada no aparelho, sem botão remoto | `now` |
| 7 | `vx_demo_lucas` | **Lucas** | H | Branco | No X, briga ganha alcance | Discordar em comunidade, sem cassino de ódio | `now` |
| 8 | `vx_demo_andre` | **André** | H | Negro | Quando o Zap cai, o coletivo para | Mensagem de celular pra celular + Pix no perfil | `now` |
| 9 | `vx_demo_kaue` | **Kaue** | H | Indígena | Cultura do interior só aparece como meme | Comunidade própria; registros nos celulares do grupo | `now` |
| 10 | `vx_demo_raj` | **Raj** | H | Sul-Asiático | Conversa gravada em servidor estrangeiro | Mensagem no navegador e nos aparelhos; arquivo permanente opcional | `now` |

### 12.2 Mecanismo de Semeação (`demo-seed.js`)
- **Idempotência:** A chave `vox-demo-seeded-v6` em `localStorage` sinaliza a carga inicial (copy falado + fotos de pessoas). Se os 10 itens estiverem presentes, a checagem é instantânea.
- **Isolamento de Dados:** Os posts são gravados via `cacheNode.saveLocalPost` com `isLocalP2p: true` e metadados `externalPain` e `voxResolution: "now"`, sem poluir o broadcast de outros aparelhos.
- **Restauração Rápida:** O botão **"🔄 Restaurar tour demo"** em `#/settings/network` (seção Avançado) permite recarregar o conteúdo educativo a qualquer momento para fins de testes e QA.

### 12.3 Experiência visual no feed (fotos, curtidas e salvos)

O PWA traz engajamento visual com layouts distintos por tipo de publicação:
- **Avatares com Foto:** Perfis possuem imagens reais em `client/images/avatars/`, com fallback automático para iniciais em caso de falha de carregamento.
- **Posts com Imagens:** Cards no feed e tópicos completos exibem fotografias de alta resolução (`client/images/posts/`), com cantos arredondados, enquadramento responsivo (`max-height: 440px`) e elevação sutil em hover.
- **Ações Interativas:**
  - **❤️ Curtir:** Alternância imediata com animação de pulso cardíaco (`@keyframes heartPop`), atualização de contagem e persistência em `localStorage` (`social.js`).
  - **💬 Comentar:** O botão expande um dropdown `.post-comments` **no próprio card** (`aria-expanded` / `aria-controls`); a thread `#/t/:id` permanece só como atalho "Abrir thread".
  - **↗ Compartilhar:** Disparo do `navigator.share` nativo ou cópia direta do link com toast de confirmação.
  - **🔖 Salvar:** Marcação de posts favoritos com feedback em toast.
- **Cache Offline Completo:** Fotos do tour e da porta da cantina entram no shell do Service Worker (cache vigente `vox-pwa-v6.1-cantina-baked-balloons`). Copy dos 10 posts em 1ª pessoa falada; fotos de pessoas em contexto (não stock genérico).

---

## 13. UI Pro 2026, Post Híbrido, Métricas Honestas e Pix Fase A

Na versão 5.7, o Vox implementa o layout Pro 2026 com cartões híbridos full-bleed, métricas honestas e suporte a chave Pix opcional declarativa no perfil (Fase A):

### 13.1 Layout & Post Híbrido Pro
- **Design Tokens v2:** Adicionados `--feed-max: 640px` e escala de espaçamento semântico (`--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`).
- **Composer Strip:** Barra compacta no topo do feed ("O que está acontecendo na sua rede?") com acionamento direto do formulário de postagem.
- **Post Toolbar Unificada:** Botões de ação (`.post-toolbar` / `.insta-actions`) padronizados para curtir, comentar, compartilhar e salvar.
- **Timestamps Relativos (`formatTimeAgo`):** Exibição concisa do tempo de publicação ("agora", "15m", "2h", "1d"), com fallback gracioso para strings legadas.

### 13.2 Perfil Pro & Métricas Honestas
- **Capa com Overlap:** Banner estilizado `.profile-cover` com gradiente glass e avatar posicionado em sobreposição.
- **Métricas Honestas:** Substituição de falsas contagens de seguidores/seguindo (vanity metrics) por estatísticas reais e honestas: posts publicados, conexões ativas na malha P2P (`peersConnected`), comunidades e o selo explícito de "Perfil do tour de exemplo".

### 13.3 Chave Pix no Perfil (Fase A) & Validador DICT
- **Módulo `pix-key.js`:** Suporta os quatro tipos oficiais do Diretório de Identificadores de Contas Transacionais (DICT) do Banco Central:
  1. `cpf`: validação algorítmica de 11 dígitos com cálculo dos dígitos verificadores (módulo 11) e rejeição de sequências repetidas.
  2. `email`: formato RFC 5322 simplificado.
  3. `phone`: formato E.164 com ou sem prefixo `+55` (10 ou 11 dígitos DDD + número).
  4. `random`: identificador UUID v4 de 32 hexadecimais com hífens.
- **Máscara de Privacidade:** Funções de exibição segura ocultam partes sensíveis de CPFs (`***.456.789-**`) e telefones (`+55 (11) *****-8901`).
- **Conta Local & Sem CPF-Login:** A chave Pix reside em `vox-pix-key-v1` no `localStorage`. Ela é puramente opcional e declarativa. O `routeId` (`vx_...`) permanece como a única identidade criptográfica do usuário.
- **Rota `#/pix/:key`:** Permite consultar perfis locais ou de exemplo associados à chave informada, acompanhada de aviso de conformidade explícito sobre pagamentos.

---

## 14. Onboarding Cultural: Porta da Cantina → Pacto Vox (Sprint v5.8)

Para blindar o Vox contra fazendas de automação sem recorrer a captchas corporativos invasivos ou login estatal com CPF, o fluxo de primeiro acesso utiliza um duplo portão consentido:

1. **Porta da Cantina (`vox-cantina-v1`):**
   - Paródia cultural e acolhedora inspirada na clássica cena de cantina espacial: o bartender de túnica bege aponta para a frente, e o gag se resolve nos dois balões (Wuher: droids/bots esperam do lado de fora).
   - Arte autoral em JPG (`cantina-gate.jpg`, `object-fit: cover` / `object-position: 76% 16%`). Os dois balões do gag já vêm pintados na arte (*"Seus bots tem que esperar lá fora!"* e *"Aqui não servimos esse tipo."*) — sem overlay HTML/CSS.
   - Overlay sem H2 "Porta da Cantina", sem quote duplicada e sem subtítulo itálico. O diálogo usa `aria-label="Porta da Cantina"`; o `alt` da imagem descreve os dois balões pintados.
   - Acionamento em primeiro acesso armazenado em `localStorage` (`vox-cantina-v1`).
   - Botão de ação único: `Entrar — sou humano`, com esclarecimento expansível sobre a minimização de dados do Vox.
   - Cache do Service Worker: `vox-pwa-v6.1-cantina-baked-balloons` (`./js/hashtags.js` permanece no shell).
2. **Pacto Vox (`vox-pact-accepted`):**
   - Apresentado imediatamente após a passagem pela Porta da Cantina.
   - Apresenta os três pilares cooperativos: *Seus dados são seus*, *Rede cooperativa* e *Controle total*.
   - Apenas após esse duplo consentimento a navegação é liberada para o feed e comunidades. Em acessos subsequentes, o usuário entra diretamente no app sem qualquer interrupção.

---

## 15. Feira Comunitária, Classificados (Fase M1) & Governança FOSS (Fase G0)

A Sprint Feira M1 atende quem utiliza redes sociais para sustento e venda direta (artesanato, marmitas, brechó e serviços populares), preservando a pureza da praça pública de debates e a soberania comunitária:

### 15.1 Governança e Opt-in Estrito (Default-Off)
- **Modo Comercial Desligado por Padrão:** Toda comunidade nasce com classificados desativados.
- **Ativação Soberana:** A aba de ofertas exige aprovação deliberativa da comunidade (`commercialEnabled: true` ou tag `Commercial-Posts: enabled`).
- **Democracia de Base (G0):** Documentado em `GOVERNANCE.md` com a regra canônica anti-brigading `Eligibility-Cutoff = Proposal-Created-At` e voto estritamente igualitário ($1\times$).
- **Empty State Educativo:** Ao visitar a aba Classificados em comunidades sem feira (como `demo-aprenda-vox`), a interface exibe aviso orientando sobre o modelo de governança e como propor a abertura da feira local.

### 15.2 Interface da Comunidade: Tabs Posts | Classificados
- **Abas Segmentadas (`.community-tabs`):** Permitem alternar com um toque entre o feed de conversas e os classificados locais daquela comunidade (`#/c/:id` vs `#/c/:id?tab=listings`).
- **Card de Oferta (`.listing-card`):**
  - Tipografia de alto impacto para preço (`.listing-price`, destaque esmeralda).
  - Badge de localização de bairro (`.listing-location-badge`) e status de disponibilidade (`Disponível`, `Reservado`, `Vendido`).
  - Fotografia nítida do produto ou serviço.
  - Botão direto para contato no chat privado: `💬 Conversar no DM`.
  - Botão de pagamento direto: `⚡ Copiar Pix` (alimentado pela chave Pix informada na oferta ou no perfil do vendedor).
  - Compartilhamento 1-clique com link direto para a comunidade e aba.

### 15.3 Publicação de Ofertas (`#/compose/listing`)
- **Composer Dedicado:** Rota `#/compose/listing?c=:id` com campos para título, preço sugerido, bairro/cidade, chave Pix de recebimento, URL da foto e descrição.
- **Validação Local (`listing.js`):** Validação de campos e normalização de preço para formato monetário (`R$ ...`).
- **Disclaimer Obrigatório:** Exibição clara e constante do aviso: *"O Vox não intermedia pagamento nem cobra taxas. Combine no DM e use Pix direto."*

### 15.4 Isolamento Rígido de Feeds
- **Zero Mercantilização do Feed Principal:** Ofertas (`type: listing`) são armazenadas no IndexedDB `local-posts` mas são filtradas estritamente fora da timeline "Para você". Conversas e vendas não competem por atenção no mesmo feed.
- **Comunidade Demo `demo-feira-local`:** Semeada via `demo-seed.js` (`vox-demo-seeded-v6`) com a "Feira do Bairro" e 4 ofertas de personas do tour (Helena, Fernanda, André e Mei).

---

## 16. UI Social v3 (post multimodal), feed segmentado & GitHub UX (Sprint v5.10)

A versão 5.10 consolida o feed multimodal e traz elementos de interação social alinhados ao padrão GitHub para código e ao padrão de cartão para mídia:

### 16.1 Post Híbrido Arejado
- **Hierarquia Visual Estrita:** Autor $\to$ Mídia (fotografia em proporção 4:5 / full-bleed) $\to$ Título $\to$ Texto do post $\to$ Metadados $\to$ Toolbar unificada.
- **Prioridade da Imagem:** Quando o post possui fotografia, ela ganha destaque logo abaixo do cabeçalho de autoria, garantindo a vivacidade e o impacto visual de redes de mídia sem soterrar imagens abaixo de textos longos.
- **Fallback Microblogging Limpo:** Quando não há fotografia, o card adota a densidade tipográfica limpa e elegante do X/Bluesky.

### 16.2 Feed Segmentado: *Para você | Seguindo*
- **Navegação Segmentada (`.feed-segmented-nav`):** Abas no topo do feed principal permitindo alternar instantaneamente entre a timeline comunitária global (*Para você*, rota `#/`) e as publicações exclusivas dos perfis acompanhados (*Seguindo*, rota `#/?feed=following`).
- **Empty State Construtivo:** Se o usuário ainda não acompanha nenhum autor, a aba *Seguindo* exibe orientações claras sobre como dar "Watch" nos perfis do tour educativo ou de amigos, com atalhos de exploração direta.

### 16.3 GitHub UX Social
- **👁️ Watch / Acompanhar:** Armazenado localmente em `localStorage` (`vox-watched-profiles` via `social.js`). Permite seguir autores diretamente no card do perfil ou no feed, alimentando a aba *Seguindo*.
- **⭐ Star (Estrelados):** Convive harmoniosamente com o ❤️ Curtir tradicional:
  - O ❤️ Curtir representa reação rápida e afeto no post.
  - A ⭐ Estrela expressa salvamento e afinidade com projetos ou debates relevantes.
  - Aba **Estrelados** no perfil do usuário (`#/u/:addr?tab=starred`), permitindo consultar todos os posts favoritados com estrela.
- **📖 README.md no Perfil:**
  - Card estilizado `.profile-readme` no perfil, permitindo apresentações detalhadas com suporte nativo a Markdown seguro (títulos, listas, negrito, itálico e código inline, sem bibliotecas externas).
  - Todas as 10 personas do tour educativo possuem agora seus respectivos `README.md` semeados no catálogo.
  - O usuário local pode editar e salvar seu próprio README diretamente no app.
- **📌 Posts Fixados (Pinned Posts):**
  - Autores podem fixar sua publicação mais relevante no topo do perfil, sinalizada pelo badge `.pinned-pill` ("📌 Fixado").
- **Vinculação de @handle do GitHub:**
  - Campo opcional no perfil do usuário local para informar seu nome de usuário no GitHub, exibindo badge com link direto e selo "Informado" no cabeçalho do perfil.

### 16.4 Exportação em Markdown (`formatPostMarkdown`)
- Botão dedicado de cópia em Markdown na toolbar do post (`.btn-copy-md`), gerando automaticamente citação estruturada com autor, `@handle`, título, corpo e deep-link do Vox, pronta para compartilhamento em issues, repositórios ou discussões externas.

### 16.5 Cache e PWA
- Cache do Service Worker atualizado para `vox-pwa-v5.10-ui-social`.
- Suite automatizada expandida para **101 testes 100% verdes** (87 Node.js + 14 Python).

---

## 17. Governança Comunitária FOSS & Rede como Repo Público (Sprint v5.11 G1)

A sprint v5.11 implementa a governança aberta do Vox inspirada na democracia direta e no fluxo de Pull Requests do desenvolvimento de software livre:

### 17.1 Modelo de Proposta e Diff Unificado (`governance-proposal`)
- **Propostas como PRs:** Cada deliberação possui título, motivação em Markdown e um bloco opcional de diff unificado (`diffText`), no formato padrão `git diff` (`+` para adições, `-` para remoções, `@@` para hunks).
- **Tokenizador Vanilla (`parseUnifiedDiff` em `governance.js`):** Processamento leve no cliente para colorização visual (verde para inclusões, vermelho para exclusões, azul para cabeçalhos de contexto) sem dependências npm externas.

### 17.2 Marco de Corte Anti-Brigading (`Eligibility-Cutoff`)
- **Regra Canônica:** O marco de corte temporal da proposta é exatamente o instante de sua criação (`Eligibility-Cutoff = Proposal-Created-At`).
- **Bloqueio de Brigading:** Apenas membros cuja transação ou registro local de membresia (`Type: membership`) tenha ocorrido comprovadamente **antes** da criação da proposta têm seus votos computados no resultado oficial.
- **Transparência Radical:** Membros que aderiram após a abertura podem registrar seu voto normalmente na interface; o voto é armazenado e exibido na tabela de transparência pública com o status *"Não computado (adesão posterior ao marco de corte)"*, garantindo auditabilidade total sem comprometer a integridade democrática.

### 17.3 Voto Criptográfico ECDSA P-256 e Apuração Estrita (`1 membro = 1 voto`)
- **Voto Assinado no Cliente:** Cada voto (`Type: governance-vote`, opções `yes`, `no`, `abstain`) é assinado com o par de chaves ECDSA local do usuário (`localAccount.signPayload`) e propagado via gossip P2P.
- **Igualdade Estrita ($1\times$):** Badges visuais (GitHub verificado, Pix informado, gov.br) conferem confiança de autoria, mas **nunca multiplicam o poder de voto**. 1 membro é rigorosamente igual a 1 voto.
- **Deduplicação de Votos:** Caso um membro altere sua escolha durante o período de votação, apenas o voto mais recente é considerado na apuração (`computeTally`).

### 17.4 Interface da Comunidade: Aba Governança e Detalhe de Proposta
- **Abas Segmentadas:** A comunidade agora possui 3 abas principais: `Posts | Classificados | Governança (N)`.
- **Card de Proposta (`.proposal-card`):** Exibe título, autor, status (`🟢 Em votação`, `🟣 Aprovada (Merged)`, `🔴 Rejeitada`, `⚪ Expirada`), badge de diff unificado e link para a tela de deliberação.
- **Visualizador de Apuração e Barra de Progresso (`.tally-bar`):** Visualização em tempo real das proporções de votos Sim, Não e Abstenção, total de votos computados e votos pós-corte descartados.
- **Formulário de Nova Proposta (`#/compose/proposal?c=:id`):** Interface intuitiva com orientações FOSS para redigir propostas e colar patches de alteração de regras.

### 17.5 Ativação Automática de Recursos via Propostas Merged
- Propostas aprovadas (`merged`) contendo patches como `commercialEnabled: true` ativam automaticamente a Feira Comunitária daquela comunidade no cliente, completando o ciclo entre governança e utilidade prática.

### 17.6 Cache e PWA
- Cache do Service Worker atualizado para `vox-pwa-v5.11-governance`, incluindo `./js/governance.js` nos ativos do app shell.
- Semeador demo idempotente atualizado para a chave `vox-demo-seeded-v6` (copy falado + fotos de pessoas; propostas e votos simulados).
- Suite automatizada com **109 testes 100% verdes** (95 Node.js + 14 Python).

---

## 18. Pix Zaps Nativos & BR Code EMV Offline (Sprint v6.0)

A sprint v6.0 introduz o suporte completo a microapoios comunitários diretos via Pix ("Pix Zaps"), implementados de forma 100% descentralizada e offline no cliente:

### 18.1 Arquitetura BR Code EMV Vanilla (`brcode.js`)
- **Padrão Oficial do Banco Central:** Montagem de strings Pix Copia e Cola em estrita conformidade com o manual de BR Code do BCB e o padrão EMV® QRCPS.
- **Codificação TLV Estrita (`formatTlv`):** Cada campo é codificado como `[ID 2 dígitos][Tamanho 2 dígitos][Valor]`.
  - Tag `00`: Payload Format Indicator (`"01"`).
  - Tag `01`: Point of Initiation Method (`"11"`, QR Code estático reutilizável).
  - Tag `26`: Merchant Account Information (GUI `"br.gov.bcb.pix"` + Tag `01` chave Pix + Tag `02` descrição opcional).
  - Tag `52`: Merchant Category Code (`"0000"`).
  - Tag `53`: Moeda (`"986"`, Real brasileiro).
  - Tag `54`: Transaction Amount numérico formatado com 2 casas decimais (opcional para valor livre ou com valor predefinido).
  - Tag `58`: Country Code (`"BR"`).
  - Tag `59`: Merchant Name (higienizado sem acentos, max 25 caracteres em maiúsculas).
  - Tag `60`: Merchant City (higienizado sem acentos, max 15 caracteres em maiúsculas, padrão `"BRASIL"`).
  - Tag `62`: Additional Data Field Template (Tag `05` referência/txid, padrão `"***"`).
  - Tag `63`: Checksum CRC16-CCITT de 4 dígitos hexadecimais em maiúsculas.
- **CRC16-CCITT Determinístico (`calculateCrc16`):**
  - Polinômio padrão `0x1021`, inicializador `0xFFFF`, processado byte a byte via operações bitwise em JavaScript vanilla sem bibliotecas externas.
- **Higienização de Texto ASCII (`sanitizeAscii`):**
  - Remoção determinística de acentos e diacríticos Unicode (via `normalize("NFD")`) e caracteres de controle, garantindo compatibilidade universal com leitores bancários.

### 18.2 Botão ⚡ Apoiar no Feed e Tópicos
- **Apoio Rápido no Post:** Cada post no feed e na visualização detalhada do tópico inclui o botão `.btn-zap-post` (`⚡ Apoiar`).
- **Estado Dinâmico:** Caso o autor tenha declarado uma chave Pix válida em seu perfil ou na publicação, o botão fica ativo e com destaque. Caso contrário, permanece desabilitado com tooltip indicativo.

### 18.3 Modal Interativo de Pix Zap (`renderZapModal`)
- **Valores Predefinidos:** Botões de seleção rápida para **R$ 2**, **R$ 5**, **R$ 10** ou **Outro**.
- **Valor Personalizado:** Ao selecionar "Outro", um campo numérico dinâmico aceita formatos em reais (`R$ 15,00`, `15,00`, `15.00` ou inteiros `15`), recalculando o BR Code instantaneamente.
- **Área de Copia e Cola:** Textarea em fonte monoespaçada exibindo a string completa do BR Code, com botão de cópia de alta visibilidade e confirmação visual ("✓ Copiado!").
- **Banner Regulatório Transparente:** Aviso de rodapé informando com clareza: *"🛡️ O Vox não é PSP: Código gerado 100% offline no seu navegador. O Vox não custodia valores nem cobra taxas. A liquidação é feita diretamente no seu banco pelo Banco Central."*

### 18.4 Integração com a Feira Comunitária
- Ao clicar em `⚡ Copiar Pix` nos itens da Feira Comunitária, caso o anúncio possua preço numérico associado, o modal de Pix Zap é aberto com aquele valor pré-selecionado e com a descrição preenchida com o título da oferta.

### 18.5 Cache e PWA
- Cache do Service Worker atualizado para `vox-pwa-v6.0-pix-zaps`, incluindo `./js/brcode.js` nos ativos do app shell.
- Suite automatizada com **117 testes 100% verdes** (103 Node.js + 14 Python).

---

## 19. Hashtags Gossip & Descoberta Local Willow (Sprint v6.1)

A sprint v6.1 implementa a descoberta descentralizada de conteúdos através de hashtags, alinhada à metáfora de caminhos hierárquicos do protocolo Willow (`/tags/:slug/...`):

### 19.1 Módulo Vanilla `hashtags.js`
- **Extração Segura (`extractHashtags`):**
  - Identificação de tags por regex com limites de caracteres (`[a-zA-Z0-9_\u00C0-\u00FF]`).
  - Descarte automático de números puros (`#123`, `#2026`) para evitar colisões com valores ou identificadores.
  - Teto de no máximo 8 tags por post para coibir tag-stuffing e spam.
- **Normalização em Slug ASCII (`slugifyTag`):**
  - Converte caracteres com diacríticos e acentos para ASCII minúsculo via `normalize("NFD")` (ex: `#educação` $\to$ `educacao`, `Saúde_Pública` $\to$ `saude_publica`), gerando URLs limpas e canônicas.
- **Linkificação Pós-Escape (`linkifyHashtags`):**
  - Executada **estritamente após** o tratamento contra XSS (`escapeHtml`), convertendo `#tag` para `<a href="#/tag/:slug" class="hashtag-link">#tag</a>`.
  - Lookbehind negativo para `&` impede qualquer colisão com entidades HTML comuns (ex: `&#39;` ou `&#x27;`).
  - Preserva a acentuação e a caixa alta/baixa visual no texto renderizado, apontando o link para a rota do slug.

### 19.2 Índice Local no Aparelho (`cache-node.js`)
- **Sem Servidor de Tendências:** Ao contrário de redes centralizadas com termômetros de volume ("Trending Topics"), o índice de tags reside estritamente no armazenamento local do navegador do usuário (`IndexedDB`).
- **Gossip Passivo:** Ao gravar ou sincronizar um post via `cacheNode.saveLocalPost`, as tags são extraídas e indexadas.
- **Busca por Tag (`getPostsByTag`):**
  - Consulta unificada mesclando posts locais gravados no aparelho e posts demonstrativos do tour.
  - Ordenação estritamente cronológica decrescente (`(b.ts - a.ts)`): mais recentes primeiro.
  - Zero pontuação algorítmica, zero manipulação de engajamento.

### 19.3 Feed da Tag (`renderTagFeed`) e Rota `#/tag/:slug`
- **Cabeçalho Limpo:** Exibe `#slug`, link de retorno `← Início` e metadado honesto de volume local (`📦 N posts neste aparelho`).
- **Empty State Construtivo:** Quando uma tag pesquisada ainda não existe no aparelho, orienta o usuário com transparência sobre o funcionamento do gossip local e oferece atalho para postar com a tag.

### 19.4 Cache e PWA
- `./js/hashtags.js` nos ativos do app shell (descoberta local Willow).

---

## 20. Open Frames FOSS & Mini-Apps no Feed (Sprint v6.2)

A sprint v6.2 implementa a cooptagem da especificação **Open Frames** (`of:*` + `of:accepts:vox`), viabilizando mini-aplicativos interativos diretamente no feed, sem nenhuma dependência de pacotes npm, sem iframes e com segurança contra execução arbitrária de código remoto.

### 20.1 Arquitetura Segura & Allowlist Estrita (`frames.js`)
- **Declaração Declarativa:** O post embute um objeto `frame` contendo as tags padrão da especificação Open Frames:
  - `of:accepts:vox`: declaração explícita de conformidade com o protocolo Vox (ex: `"vox"`).
  - `kind`: validação rigorosa via allowlist só no cliente:
    1. `poll`: enquete descentralizada com contagem em tempo real e regra canônica `1 membro = 1 voto`.
    2. `petition`: abaixo-assinado comunitário com assinaturas únicas e barra de progresso da meta.
    3. `clt`: simulador trabalhista leigo e offline (férias + 1/3, 13º integral, rescisão sem justa causa) baseado no salário mínimo oficial vigente (R$ 1.518,00).
  - `of:image`: ilustração/gráfico do card (`1.91:1` ou `1:1`).
  - `of:button:1..4`: de 1 a 4 botões de ação ou links (`action: "post" | "link"`).
- **Zero Iframes & Zero Remote Code Execution:** Ao contrário de mini-programas centralizados que executam scripts remotos opacos ou embutem frames web pesados, no Vox toda a renderização e lógica são executadas por componentes nativos vanilla já inspecionados no shell da aplicação.

### 20.2 Ações Criptográficas Locais (`type: frame-action`)
- **Assinatura ECDSA P-256 no Aparelho:** O clique do usuário em um botão de ação não aciona OAuth ou sessão em servidor externo. Ele gera uma transação canônica assinada pela chave privada local do aparelho (`vx_...`).
- **Gossip P2P & Persistência Local:** A ação é salva no `IndexedDB` local (`cacheNode.saveLocalPost`) e propagada aos pares conectados na malha WebRTC (`peers.broadcastGossip`).
- **Cache Rápido em LocalStorage:** Ações locais recentes são mantidas em `vox-frame-actions` para renderização imediata sem flicker visual na timeline.
- **Feedback Interativo em Tempo Real:** Atualização dinâmica no DOM (`#frame-content-:postId`) com barras de porcentagem para enquetes, confirmação de assinatura para abaixo-assinados e resultados de cálculo instantâneos.

### 20.3 Cache e PWA
- Ativo `./js/frames.js` no app shell.

---

## 21. Feed híbrido X + IG + GitHub (Sprint v6.3)

Feed com fundo cinza extremo (`#fafafa` / `#000`), coluna `--feed-max: 500px`, posts **sem caixa** (só hairline entre itens) e layouts por tipo (`getPostFeedLayout`):

### 21.1 Layouts (`renderPostItem`)
- **Texto (X):** header → caption → frame (se houver) → toolbar → comentários. Sem `.post-media-container` vazio.
- **Foto (IG):** header → mídia 4:5 full-bleed → frame → toolbar → caption.
- **GitHub (`.post-github-gist`):** bloco mono estilo README/diff fixado (ex.: tour Raj).

Toolbar tripartida mantém Zap, estrela, copiar MD e bookmark.

### 21.2 Composer inline (estilo X)
- `renderInlineComposer`: repouso = uma linha; foco expande textarea, contador `0 / 2000`, **Postar** desabilitado até haver texto, **Esc** recolhe, anexo de imagem (`FileReader` → `post.image`), comunidade opcional (`attachInlineComposerHandlers` em `inline-composer.js`).
- `#/compose/topic` permanece como deep-link / formulário completo.

### 21.3 Stories strip
- `renderStoriesStrip`: anéis com avatares do tour → `#/u/:id` (visual, sem TTL).

### 21.4 Editar / apagar posts locais
- **Escopo:** Somente posts gravados no aparelho via `cacheNode.saveLocalPost`, com `sig` ECDSA e `author` igual ao `routeId` ativo (`vx_…`). Posts do tour/demo (`mock.js`) não têm assinatura local — menu oculto; tentativa programática exibe toast *"Só é possível editar/apagar posts seus."*
- **UI:** Botões **Editar** / **Apagar** no header do card (`renderPostOwnerMenu`) e na página `#/t/:id`. Edição abre modal (`renderPostEditModal`, campo único + contador); exclusão usa `confirm()` nativo. Microcopy pt-BR em `i18n-pt-br.js` (tooltip + linha sutil no menu, compositor inline e modal) — retratação gossip (`GOSSIP_UPDATE` / `GOSSIP_DELETE`) propaga na malha quando há pares online; local imediato neste aparelho.
- **Exibição sem duplicata:** Compositor inline grava `title` = primeira linha e `body` = texto integral; `formatPostDisplay` + `renderPostTextHtml` mostram **uma** linha quando são iguais (modo caption), e título + resto em posts multilinha.
- **Persistência:** `deleteLocalPost(id)` remove do IndexedDB; edição reutiliza `saveLocalPost` (mesmo `id`, `ts` original, `editedAt` novo) após `localAccount.signPayload`.
- **Gossip Retratação (v1):** Eventos `GOSSIP_UPDATE` e `GOSSIP_DELETE` propagam na malha `vox-local-v0`. Edições exigem assinatura válida do autor original e `editedAt` estritamente maior que a versão local (LWW). Exclusões gravam tombstone assinado (`post-tombstone`) no IndexedDB (`saveTombstone`), ocultando o post do feed e blindando contra ressurreição por creates atrasados.

### 21.5 Cache e PWA
- Cache vigente (único): `CACHE_NAME` em `client/sw.js` (gossip v1 + UI prep + leitura multi-gateway).
- Suíte automatizada: ver `npm test` (Node + 14 Python relay).

---

## 22. Triagem: plano «Meta feed v6.3» (HOLD) vs feed híbrido entregue

**Data:** 2026-10-23 · **Branch de registro:** `docs/hold-meta-feed-triage` · **Decisão:** **plano Meta feed encerrado** — substituído pelo sprint **Feed híbrido X + IG + GitHub** já integrado em `main` (`a63ca69`, espaçamento `27efe1e`, pós-v6.4 `4d8a2eb`).

### 22.1 Origem do plano em HOLD

Em 23/10 o sprint «Feed estilo Meta» ficou em **HOLD estrito** (sem código) com escopo registrado no log do lobby pai (`politica/lobby.md`) e rascunho `vox_sprint_v63_meta_feed.plan.md` (não versionado no repo Vox). Antes do HOLD, o usuário autorizou execução do **feed híbrido**, que absorveu a maior parte do visual Meta no timeline.

### 22.2 Comparativo item a item

| # | Plano Meta feed (HOLD) | Entregue em híbrido v6.3 (`main`) | Veredito |
|---|------------------------|-----------------------------------|----------|
| 1 | Pilha vertical **única** estilo IG: header → mídia 4:5 → toolbar → caption → comentários | **Híbrido por tipo** (`getPostFeedLayout` em `render.js`): texto **X** (caption antes da toolbar); foto **IG** (mídia → toolbar → caption); extra **GitHub** (gist) | **Substituído por desenho** — texto sem foto mantém leitura estilo X de propósito |
| 2 | Posts **sem caixa** / glass no feed | `.post` transparente, sem borda de card; separação por respiro (`margin-bottom: 24px`) | **Atendido** |
| 3 | Fundo cinza extremo `#fafafa` / `#121212` | `--bg: #fafafa` (claro) · escuro `--bg: #000` com `--surface: #121212` | **Atendido** (canvas escuro usa preto puro no fundo, não `#121212` no `--bg`) |
| 4 | Eliminar **mesh** no feed | `--mesh-bg: none` | **Atendido** |
| 5 | Eliminar **glass** no feed | Timeline plana; **chrome** (top bar, bottom nav, modais) ainda usa `--glass-bg` + blur | **Parcial** — fora do escopo do card; ver `feat/v6.3-ui-polish` |
| 6 | Faixa de **stories** (avatares do tour) | `renderStoriesStrip` → `#/u/:id`, visual sem TTL | **Atendido** |
| 7 | Comentários no card | `renderPostComments` inline no post | **Atendido** (pré-existente; reforçado no híbrido) |
| 8 | — (não estava no plano Meta) | Composer **inline** estilo X, Open Frames no meio do card, editar/apagar local (v6.4) | **Extras** além do plano HOLD |

### 22.3 Deltas residuais (backlog opcional, não bloqueiam o plano Meta)

1. **Ordem visual em posts só-texto** — alinhar header/toolbar ao padrão “mídia primeiro” se quiser paridade com feed foto; hoje é escolha de produto (híbrido).
2. **Canvas unificado** (banner sync flat, comentários sem caixa, abas underline, perfil) — implementação em **`feat/v6.3-ui-polish`**, não em `main`; item separado no groom Vox, não reabertura do plano Meta.
3. **Glass no shell** — reduzir blur no header/nav se desejado; independente do layout do post.
4. **Stories com TTL / estado “visto”** — nunca exigido no HOLD; permanece decorativo.

### 22.4 Conclusão

Não há trabalho pendente obrigatório do plano «Meta feed v6.3» em HOLD. O que restava de intenção visual Meta crítica para o **timeline** já está no híbrido; melhorias de **polish global** ficam na branch UI polish. **Não reexecutar** o sprint Meta como segundo passo — atualizar groom/backlog apenas se algum delta residual acima for priorizado explicitamente.

---

## 23. Vox Roadmap Core: Autonomia, Moderação, Deliberação e Mídia P2P

**Data:** 2026-10-23 · **Branch:** `feat/vox-roadmap-core` · **Suíte:** 222+ testes (208+ JS + 14 Python relay).

Implementação dos quatro pilares essenciais do roadmap da rede Vox:

### 23.1 Autonomia de Identidade (Backup e Restauração Criptográfica)
- **Módulo:** `client/js/local-account.js` e `client/js/crypto-dm.js`.
- **Exportação:** `exportAccountBundle()` serializa identidade local (`routeId`, `name`, `bio`, `handle`), par de chaves ECDSA P-256 de assinatura e par de chaves ECDH P-256 de DMs privadas com timestamp e versão `vox-account-bundle-v1`.
- **Importação e Verificação Estrita:** `importAccountBundle(bundle)` re-computa o `routeId` a partir da chave pública JWK, assina e verifica um *challenge nonce* efêmero com a chave privada importada antes de persistir no `localStorage`. Rejeita pacotes adulterados, chaves truncadas ou identificadores forjados.
- **Suíte de testes:** `tests/account-backup.test.js`.

### 23.2 Moderação Local e Filtro Anti-Spam de Mesh
- **Módulo:** `client/js/moderation.js` e integração em `client/js/peers.js`.
- **Prevenção no Gateway de Rede:** Função `shouldDropGossip(author)` filtra pacotes no momento da recepção em `peers.js` (`handleGossipMessage`, `handleGossipUpdateMessage`, `handleGossipDeleteMessage`). Pacotes originados por autores bloqueados são descartados antes de processamento criptográfico, gravação no IndexedDB ou retransmissão gossip (bloqueio na borda do nó).
- **Filtragem de Feed:** `filterFeedPosts(posts)` oculta posts e respostas de autores bloqueados ou silenciados.
- **Portabilidade:** `exportModerationBundle()` e `importModerationBundle()` permitem backup e sincronização de listas de moderação entre nós.
- **Suíte de testes:** `tests/moderation-local.test.js`.

### 23.3 Deliberação Coletiva (Pol.is-lite / Consenso Determinístico)
- **Módulo:** `client/js/polis.js`.
- **Métricas e Apuração:** Normalização de votos (`concordo: +1`, `discordo: -1`, `passo/neutro: 0`), apuração por afirmação com cálculo de porcentagens e variância de opinião.
- **Detecção de Pontes de Consenso:** Algoritmo determinístico de particionamento de votantes em clusters de divergência e identificação de afirmações ponte (*consensus bridges* — afirmações com alta aprovação em ambos os polos) vs afirmações divisivas (*divisive statements*).
- **Sem Dependências Externas:** Implementado em JavaScript puro para execução instantânea no navegador e em nós do relay.
- **Suíte de testes:** `tests/polis.test.js`.

### 23.4 Blobs de Mídia P2P Content-Addressed (SHA-256)
- **Módulo:** `client/js/media-blob.js`.
- **Desacoplamento do Mesh:** Remove imagens pesadas em base64 do JSON transitado via gossip (`detachMedia`), substituindo-as por referências content-addressed `mediaRef` com hash SHA-256, tipo MIME e tamanho em bytes.
- **Verificação de Integridade e Re-anexo:** `verifyMediaBlob` calcula o hash SHA-256 do payload e rejeita blobs corrompidos ou adulterados. `attachMedia` re-acopla a mídia sob demanda ao post correspondente.
- **Armazenamento LRU:** `BlobStorage` com controle de capacidade máxima e descarte automático de entradas antigas.
- **Suíte de testes:** `tests/media-blob.test.js`.
### 23.5 Integração de UI & UX dos Pilares
- **Backup de Identidade no Perfil:** Botões de exportação (`btn-export-account`) e restauração (`file-import-account`) integrados ao card de Identidade Local em `renderProfileActions`, com validação criptográfica estrita no navegador.
- **Ações de Moderação no Perfil & Configurações:** Botões de bloqueio e silenciamento no perfil de terceiros (`btn-toggle-block`, `btn-toggle-mute`). Painel "Moderação Local & Filtros" em `renderNetworkSettings` listando autores bloqueados/silenciados com opções de desbloqueio pontual e exportação/importação de regras.
- **Visualizador Pol.is-lite:** `renderPolisReportHtml` renderiza painel com resumo de participantes, afirmações, barras de votação tripartidas (concordo/neutro/discordo) e selos destacados para *Pontes de Consenso* (`consensus-bridge`) e *Pontos Divisivos* (`divisive-point`).
- **Desacoplamento de Mídia no Compositor:** `inline-composer.js` utiliza `mediaBlob.detachMedia` para isolar a mídia base64 antes do broadcast de fofoca, transmitindo apenas referências content-addressed e armazenando o payload no `defaultBlobStorage`.
- **Suíte de testes:** `tests/roadmap-ui.test.js` (5 testes cobrindo renderização e fluxos de UI).

---

## 24. Afinidade Comportamental Local de Pares para Blobs (V-I09)

**Data:** 2026-10-24 · **Branch:** `feat/blob-soft-priority-v0` · **Suíte:** 207 testes (193 JS + 14 Python relay).

- **Spec / ADR:** `docs/antigravity-blob-soft-priority-v0.md`.
- **Módulo:** `client/js/peers-blob-affinity.js` integrado em `client/js/peers.js` e `client/js/webrtc-peer.js`.
- **Wire:** Reutiliza mensagens `WANT` e `BLOB` existentes com campo `fromPeer`.
- **Privacidade & Compliance:** Sem ranking público, sem scoreboard e sem telemetria externa. O mapa de afinidade é estritamente local e efêmero no aparelho (`affinityMap`), com teto de 16 pares, TTL de 15 minutos e decaimento exponencial de pontuação (meia-vida de 5 minutos).
- **Algoritmo (Flag off por padrão):** 
  - Ao receber `BLOB` que cumpre um `WANT` pendente local, chama `bumpAffinity(fromPeer)` se a flag estiver ativa (`isBlobPeerSoftPriorityEnabled()`).
  - Em `requestTxFromPeers`, antes do flood broadcast WebRTC/BroadcastChannel, consulta pares RTC abertos (`listOpenRtcPeerIds`), ordena por afinidade (`rankAffinity`) e tenta unicast rápido com timeout de 450ms por par.
  - Se nenhum par com afinidade responder ou a flag estiver desativada, o fluxo degrada transparentemente para o comportamento padrão.
- **Suíte de testes:** `tests/peers-blob-soft-priority.test.js` (cenários T1 a T5 da spec + teste de capacidade máxima e descarte).

---

## 25. Descoberta social, Vox Brasil welcome e OAuth client-only (V-DIS)

**Data:** 2026-10-24 · **SW:** `vox-pwa-v6.25-roadmap-core`

- **Docs:** `docs/adr/002-oauth-profile-enrich-client.md`, `docs/vox-brasil-welcome-profile.md`, `COMPLIANCE-BR.md` (login social opcional).
- **Módulos:** `vox-welcome-profile.js`, `profile-directory.js`, `contacts.js`, `people-index.js`, `oauth-profile.js`.
- **Rotas:** `#/people` (busca local), `#/connect/:routeId` (deep link compartilhável), card *Primeiro contato* no feed, DM institucional `vx_voxbrasil_welcome`.
- **Onboarding:** Cantina → *Como quer aparecer?* (Google / Meta / Pular) → Pacto → seed DM welcome + watch automático.
- **OAuth operador:** copiar `client/config/oauth.example.json` → `client/config/oauth.json` (gitignored) com `googleClientId` e `facebookAppId`; nunca commitar secrets.
- **Testes:** `contacts.test.js`, `vox-welcome-profile.test.js`, `people-index.test.js`, `oauth-profile.test.js`.

### 25.1 OAuth Google / Meta (operador)

Enriquecimento **client-only** (GIS + Meta JS SDK): importa nome/foto para `localStorage`; **não** há backend Vox nem tokens persistidos (ADR-002, `COMPLIANCE-BR.md`).

#### Arquivos locais (nunca commitar)

| Arquivo | Uso |
|---------|-----|
| `client/config/oauth.json` | **Canônico em runtime** — o PWA faz `fetch("./config/oauth.json")`. Gitignored. |
| `client/config/oauth.example.json` | Modelo versionado (placeholders `YOUR_*`). |
| `client/config/oauth.local.json` | Opcional: só para o operador copiar valores para `oauth.json` (gitignored). |
| `vox/.env.local` | Opcional: se existir, use `VOX_GOOGLE_CLIENT_ID` e `VOX_FACEBOOK_APP_ID` **manualmente** — o PWA estático **não** lê `.env`; transcreva para `oauth.json`. |

**Setup rápido:**

```bash
cd client/config
cp oauth.example.json oauth.json   # ou mantenha oauth.json já criado com strings vazias
# Edite oauth.json com os IDs reais (ou cole de oauth.local.json / .env.local)
```

Estrutura:

```json
{
  "googleClientId": "<id>.apps.googleusercontent.com",
  "facebookAppId": "<numeric app id>",
  "enabledProviders": ["google", "facebook"]
}
```

Com IDs vazios ou `YOUR_*`, os botões Google/Meta ficam desabilitados no modal *Como quer aparecer?*; **Pular** continua disponível.

#### URL base do app (origens OAuth)

- **Produção (GitHub Pages):** PWA em **`https://yurikayel.github.io/vox/`** (subpasta `/vox/` do user site; `index.html` **não** define `<base href>` — paths relativos `./config/`, `./sw.js` resolvem contra `/vox/`).
- **Origem OAuth (Google/Meta):** só **scheme + host + porta** — **não** inclua `/vox/` na lista de *JavaScript origins* do Google; o path não faz parte da origem.
- **Dev local:** servir a pasta `client/` na porta **8080** (`python -m http.server 8080`).

#### Google Cloud — checklist

1. [Google Cloud Console](https://console.cloud.google.com/) → projeto → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID** → tipo **Web application**.
3. **Authorized JavaScript origins** (cole exatamente):

   | Ambiente | Origem |
   |----------|--------|
   | GitHub Pages | `https://yurikayel.github.io` |
   | Local | `http://localhost:8080` |
   | Local | `http://127.0.0.1:8080` |

4. **Authorized redirect URIs:** para o fluxo atual (**Google Identity Services** `google.accounts.id` + callback JWT no browser, sem redirect server-side) **não é obrigatório** adicionar redirect URI — deixe vazio ou ignore o campo se a console permitir. Se a console exigir ao menos uma URI, use a URL da página onde o modal roda, por exemplo `https://yurikayel.github.io/vox/` e `http://127.0.0.1:8080/` (GIS normalmente não redireciona para elas).
5. Copie o **Client ID** para `oauth.json` → `googleClientId`.
6. **OAuth consent screen:** app em *Testing* ou *Production* conforme audiência; escopos mínimos (perfil básico via ID token).

#### Meta (Facebook) — checklist

1. [Meta for Developers](https://developers.facebook.com/) → **My Apps** → **Create App** (tipo *Consumer* ou conforme política atual).
2. Adicionar produto **Facebook Login** → settings **Facebook Login** → **Settings**.
3. **Valid OAuth Redirect URIs** (SDK JS redireciona de volta à página atual):

   | Ambiente | URI |
   |----------|-----|
   | GitHub Pages | `https://yurikayel.github.io/vox/` |
   | Local | `http://localhost:8080/` |
   | Local | `http://127.0.0.1:8080/` |

4. **Allowed Domains for the JavaScript SDK** (App settings → Basic): inclua `yurikayel.github.io`, `localhost`, `127.0.0.1`.
5. **Site URL** (Basic): `https://yurikayel.github.io/vox/`
6. App em **Live** ou testers adicionados enquanto em **Development**.
7. Copie **App ID** numérico para `oauth.json` → `facebookAppId`.
8. Login solicita escopo `public_profile` apenas (`oauth-profile.js`).

#### GitHub Pages (CI — sem commitar `oauth.json`)

O workflow [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) gera `_site/config/oauth.json` no deploy a partir de **Actions secrets** (Client IDs Web são públicos no browser após deploy; secrets evitam commit acidental).

| Secret (Actions) | Valor |
|------------------|--------|
| `VOX_GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (Web) do Google Cloud |
| `VOX_FACEBOOK_APP_ID` | App ID numérico Meta |

**Operador:**

1. Repositório GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** (crie os dois nomes acima).
2. Redeploy: push em `main` que altere `client/**`, `docs/**`, `tools/write-oauth-deploy-config.mjs` ou o workflow — ou **Actions** → *Deploy PWA — GitHub Pages* → **Run workflow**.
3. Verificar artefato publicado: abrir `https://yurikayel.github.io/vox/config/oauth.json` — deve conter IDs não vazios e `enabledProviders` coerente.
4. Aba anônima em `https://yurikayel.github.io/vox/` → Cantina → modal *Como quer aparecer?* — botões Google/Meta habilitados, sem caixa vermelha de operador (se secrets preenchidos).
5. **Hard refresh** após deploy (SW `vox-pwa-v6.26-mesh-discovery` ou posterior).

Script: [`tools/write-oauth-deploy-config.mjs`](../tools/write-oauth-deploy-config.mjs) — se ambos secrets vazios, o job emite `::warning::` e o modal mantém o aviso atual.

**Troubleshooting:** botões habilitados mas login falha → revisar **Authorized JavaScript origins** (Google: `https://yurikayel.github.io`) e **Valid OAuth Redirect URIs** / **Allowed Domains** (Meta: `https://yurikayel.github.io/vox/`) nas tabelas acima.

#### Verificação pós-config

1. **Local:** `cd client && python -m http.server 8080` → aba anônima → modal OAuth → botões habilitados (com `client/config/oauth.json` preenchido localmente).
2. **Pages:** passos da subseção GitHub Pages (CI) acima.
3. `npm test` na raiz `vox/` antes de merge.

---

## 26. Descoberta na malha P1+P2 (V-MESH)

**Data:** 2026-10-24 · **SW:** `vox-pwa-v6.26-mesh-discovery`

- **Docs:** `docs/adr/003-profile-card-gossip.md`, `docs/profile-card-gossip-v0.md`, `COMPLIANCE-BR.md` (§ busca na malha).
- **P1:** `#/people` indexa contatos, autores de `topic`/`reply`/`membership` vistos no aparelho (`mesh-author`), tour demo só se contatos+malha vazios (ou seção Tour).
- **P2:** toggle *Aparecer na busca da malha* em `#/perfil` e `#/settings/network` → `profile-card.js` + gossip (`peers.js`) → `profile-directory` (sem poluir feed).
- **Módulos:** `profile-card.js`, `mesh-profile.js`, extensões em `people-index.js`, `peers.js`, `render.js`, `app.js`.
- **Métrica local:** `vox-metric-people-search-ok` (busca com ≥1 resultado).

### Playbook — dois usuários (A e B)

1. **A:** aba normal — Cantina → OAuth (ou Pular) → Pacto → modal *Seu link #/connect* (opcional).
2. **B:** aba anônima/incógnito — mesmo fluxo até Pacto.
3. Em **ambos:** `#/settings/network` ou `#/perfil` → ligar **Aparecer na busca da malha** (salvar rede se alterou só em network).
4. Garantir malha ativa: mesma origem (`http://localhost:8080`), WebRTC/BroadcastChannel — abrir feed em A e B na mesma aba ou duas janelas do mesmo host.
5. **A** republica cartão (toggle off/on ou mudar nome) se B não achar.
6. Em **B:** `#/people` → buscar nome de A ou prefixo `vx_` de A — deve aparecer em **Na malha** sem colar link.
7. **A** desliga toggle → após gossip, B busca de novo — cartão some (autor de post antigo ainda pode aparecer como `mesh-author` se houve post compartilhado).
8. `npm test` na raiz `vox/` antes de merge.

---

## 27. Ícones — aba vs PWA instalado

| Uso | Arquivo | Nota |
|-----|---------|------|
| **Aba do navegador** | `icons/icon.svg` (+ `favicon-16.png` / `favicon-32.png` / `favicon.png`) | Megafone vetorial estilo emoji — **verde** (`emoji-vox-brasil.svg`) ativo por padrão. |
| **PWA / “Adicionar à tela”** | `icon-192.png`, `icon-512.png` | Marca squircle MD3 (G/O/X) — não trocar pelo emoji. |
| **Meta Dashboard** | `icon-1024.png` (PNG) | Upload oficial; JPG `icon-1024-meta.jpg` é rascunho local, fora do git. |

**Trocar para megafone vermelho (estadista):** copiar `emoji-vox-vermelho.svg` → `icon.svg` e `emoji-vox-vermelho-32.png` → `favicon.png` + `favicon-32.png`; regerar ou copiar `favicon-16.png`; bump `CACHE_NAME` em `sw.js`; hard refresh (Ctrl+F5).

Variantes versionadas: `emoji-vox-brasil*` e `emoji-vox-vermelho*` (SVG + PNG 32 e master).

---

## 28. Meta App Dashboard — campos obrigatórios

Quando a console mostra *Não qualificado para envio* (ícone, privacidade, exclusão de dados, categoria):

| Campo | Ação |
|-------|------|
| **Ícone 1024×1024** | Upload de `client/icons/icon-1024.png` (PNG 1024×1024) |
| **Política de Privacidade** | `https://yurikayel.github.io/vox/privacy.html` |
| **Exclusão de dados** | `https://yurikayel.github.io/vox/data-deletion.html` |
| **Categoria** | Ex.: *Utilitários* → *Redes sociais* |

Arquivos: `client/privacy.html`, `client/data-deletion.html`. Deploy: push em `main` que altere `client/**`. Detalhes jurídicos: `COMPLIANCE-BR.md`.

---

## 29. Code hardening

Ver [`docs/HARDENING.md`](../docs/HARDENING.md), [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md). Comandos: `npm run audit:complexity`, `npm run lint`, `npm test`.

---

## 30. Tipografia — cívico / futurista / social

Três direções consideradas (Google Fonts, PT-BR em 14–16px na sidebar):

| Direção | Stack | Por quê |
|---------|--------|---------|
| **Praça digital** | Source Sans 3 + Literata (títulos) | Clareza institucional tipo serviço público; serif só em destaques editoriais. |
| **Malha técnica** | IBM Plex Sans + Space Grotesk | Tom “infra aberta”; geométrico no wordmark, frio demais para corpo social. |
| **Rede viva** | Noto Sans + Outfit | Corpo acolhedor e neutro; display levemente futurista sem sci-fi. |

**Escolhida — híbrido Praça + Rede viva:** `--font-sans: "Source Sans 3"` (UI, feed, forms, nav) e `--font-display: "Outfit"` só em `.brand-word` / `.brand-link`. Source Sans 3 mantém legibilidade cívica e acentuação PT; Outfit dá personalidade geométrica ao “Vox” sem competir com o celeste sky-theme. Fallback: `ui-sans-serif, system-ui`. Pesos: `--font-weight-nav: 600`; nav ativo 700. Letter-spacing: `0.03em` no wordmark, `0.012em` em `.tab-item` / `.sidebar-feed-tab`. Carregamento: `index.html` (preconnect + CSS2); bump `CACHE_NAME` quando o shell muda.

---

## 31. Feed — barra de ações e Seguir (hero de mídia)

**Data:** 2026-10-25 · **SW:** ver `CACHE_NAME` em `client/sw.js`

| Ação | Onde fica | Decisão |
|------|-----------|---------|
| ❤️ Curtir + contagem | Barra primária (esquerda) | **Mantém** — reação social imediata, métrica honesta local. |
| 💬 Comentar + contagem | Barra primária | **Mantém** — debate cívico; painel `.post-comments-surface` **abaixo** da foto, sem overlay na imagem. |
| ↗ Compartilhar | Barra primária | **Mantém** — viralização cooperativa (link nativo / clipboard). |
| ⚡ Apoiar (Pix) | Barra primária, só ícone | **Mantém** — apoio financeiro direto (Fase A); rótulo só no `aria-label` para não poluir. |
| ⭐ Estrela | Menu **⋯** (overflow) | **Recolhe** — afinitude tipo GitHub; power user, não compete com curtida no mobile. |
| 📋 Copiar Markdown | Menu **⋯** | **Recolhe** — jornalismo/dev; thread `#/t/:id` mantém ações completas. |
| 🔖 Salvar | Barra secundária (direita) | **Mantém** — ícone único de salvamento. |
| **Seguir** | **Header sobre a mídia** (`.btn-overlay-follow`, texto branco sem pill) | **Fora da barra** — `social.toggleWatch`; oculto em post próprio e conta **Vox Brasil** (`vx_voxbrasil_welcome`). Perfil segue com 👁️ Watch. |

Layout: `.toolbar-primary` (engajamento + Pix) · `.toolbar-secondary` (⋯ toolbar + bookmark). Tema celeste nos hovers (`var(--accent-soft)`). Comentários nunca usam `.post-overlay` / scrim — só o card foto tem overlay de legenda.

### 31.1 Header sobre mídia (foto)

**Addendum 2026-10-25:** posts `layout=photo` usam `.post-media-header` **dentro** de `.post-media-hero` (z-index 3), faixa compacta sobre a imagem:

- **Esquerda:** avatar → perfil · **nome** branco bold · selo verificado só **Vox Brasil** · `·` · tempo (`formatTimeAgo`) · linha 2 opcional `Demo · UF` (perfis estereótipo).
- **Direita:** **Seguir** / **Seguindo** (texto, sem pill) · **⋯** abre `#post-more-sheet` (`post-more-menu.js`, handlers em `screens-home.js` + delegação global idempotente).
- **Scrim:** `.post-media-scrim-top` (fade ~40% no topo, z1) separado de `.post-media-scrim-bottom` (legenda, z2). Legenda/título/hashtags só em `.post-overlay` inferior — **sem** autor duplicado no rodapé.
- **Sheet PT-BR:** Denunciar · Não tenho interesse · Sobre esta conta · Ir para a publicação · Compartilhar… · Copiar link · Incorporar (toast *em breve* onde stub).

---

## 32. Profile IA (grade de publicações)

**Data:** 2026-10-25 · **SW:** `vox-pwa-v6.65-neutral-ux-language`

`#/u/:routeId` e `#/perfil` usam shell `.profile-grid-layout` (max-width ~935px): avatar grande à esquerda, métricas **publicações · seguidores · seguindo**, `@handle` em negrito, nome e bio, pills **Seguir / Mensagem / Editar perfil** (contextual). Conta **Vox Brasil** mantém avatar squircle + selo ✓; demos UF exibem aviso estereótipo em `<details>` abaixo do header. Abas: grade ▦ (posts em `.profile-grid` 3 colunas, `aspect-ratio: 1`, link `#/t/:id`) e **Sobre** (README, identidade local, estrelados/comunidades legados). Handle inexistente usa o mesmo shell via `renderProfileGridNotFound`. Lógica de dados inalterada (`profile-directory`, mock por `routeId`).

---

## 33. Linguagem de UI e marcas

Padrões de interface (header sobre mídia, grade de publicações, menu ⋯) seguem convenções de mercado para PWAs sociais.
Marcas de terceiros **não** são referência de implementação nem aparecem em classes CSS, comentários de código ou specs internas.
Documentação descreve comportamento e hierarquia visual em termos neutros (PT-BR).
OAuth e compartilhamento nativo citam provedores apenas onde exigido por integração técnica ou política da plataforma.

---

## 34. Identidade carbono / pergaminho (brainstorm → ship)

**Data:** 2026-10-25 · **SW:** `vox-pwa-v6.71-photo-no-card`

**Problema:** canvas celeste/roxo e cards foto full-bleed liam como clone genérico de feed de foto; marca na sidebar trocava tile escuro/claro.

**Tokens:** `--bg-parchment` `#f4f0e8` (claro) · `--bg-carbon` `#18181a` (escuro) · superfícies empilhadas neutras; `data-sky-period` só afina **chrome/accent** (`--brand-chrome`, `--theme-chrome`), **não** `--bg` / `--surface-*`.

**Marca shell:** um único `icons/icon-512.png` (squircle tile claro) — sem `attachBrandMarkTheme` / `icon-white-512`.

**Entregue (UX):**

- **Foto bleed:** posts com mídia usam `.post-photo-bleed` — hero flush no `--bg` (sem card externo); overlay/caption/ações na imagem; comentários borderless abaixo.
- **Newsletter:** `.post-layout-text` tipografia mais larga (~1.02rem corpo) e coluna até ~540px.
- **Sidebar cívica:** barra verde `inset` + superfícies pergaminho/carbono.
- **Stories:** anel plano verde/outline (sem gradiente arco-íris); conta **Vox Brasil** ✓ com `.story-ring--official`.
- **Grade perfil:** gutters 8px, tiles arredondados com borda/sombra leve.

**Não mexido:** overlay hero, react/reply em comentários, DM welcome, Voxpedia, Open Frames.

---

## 35. Comunidades — calor Orkut (referência BR, não clone)

**Data:** 2026-10-25 · **SW:** `vox-pwa-v6.72-orkut-communities` · **Inspiração:** redes sociais comunitárias brasileiras de meados dos anos 2000 (layout acolhedor, fórum por tópicos, recados visíveis) — **sem** logos, nomes ou assets de terceiros; classes `community-vox-*` apenas.

**Layout histórico (pesquisa):** página principal da comunidade, fórum de tópicos (`CommTopics`) e thread de mensagens; menu lateral com **Participar** / entrar na comunidade; dono + até **10 moderadores**; scraps/recados como mensagens rápidas no perfil; redesign posterior com cantos arredondados e tons **azul/ciano** (e temas laranja no perfil); experimental 2009: faixa/header customizável e cor de fundo por comunidade.

**Adotado no Vox (UX):**

- Faixa superior (`community-vox-band`): nome, contagem de membros, subtítulo **Tipo: aberta · Demo**, pill **Entrar** / **Membro** (azul→verde amigável sobre carbono/pergaminho).
- Cartão **Recado da comunidade** (scrapbook-style) no demo **Brasil Estereótipo**.
- Detalhe em **duas colunas** no desktop (tópicos + sidebar **Membros online** / estatísticas mock); mobile empilha com sidebar acima.
- Lista de comunidades: faixa colorida, meta de membros, botão **Entrar →** arredondado.

**Fontes (consulta online):**

- https://wiki.archiveteam.org/index.php/Orkut — estrutura Community / CommTopics / CommMsgs; arquivo público pós-2014.
- https://www.estadao.com.br/tecmundo/big-techs/239-como-usar-o-orkut/ — Participar, scraps vs depoimentos, enquetes no fórum.
- https://www.uol.com.br/tilt/noticias/redacao/2022/04/28/scraps-comunidades-depoimentos-do-que-voce-tem-saudades-no-orkut.htm — nostalgia comunidades/tópicos/moderadores BR.
- https://blogoscoped.com/archive/2007-08-24-n48.html — redesign visual (arredondamento, azul/ciano).
- http://www.blakut.com/2009/03/spoiler-sneak-peek-into-future-of-orkut.html — header/cor customizável (referência de identidade por comunidade).
- http://tribler.org/VirtualCommunitiesReport — moderadores, scrapbook, categorias.

**Addendum (aba Posts ≠ feed):** na coluna **Tópicos e posts**, `renderCommunityTopicRow()` substitui `renderPostItem` — linhas compactas (título → `#/t/:id`, @autor, contagem de respostas, última atividade, excerpt curto; thumb 48px opcional). Sidebar **Membros online** vira grade 3×3 de avatares demo UF; abas sticky; Classificados/Governança dentro de `community-vox-panel`. SW `vox-pwa-v6.73-community-topic-list`.

---

## 36. Incubação P0 — POSSE, Markdown e webhooks

**Escopo:** cockpit **Ecoe para…** após publicar (compose + inline); link canônico `#/t/:id`; intents WhatsApp / X / Bluesky; Web Share; copiar bloco; export JSON CLI.

**Código:** `client/js/posse-dispatch.js` · testes `tests/posse-dispatch.test.js` · preferência “não mostrar de novo” (`vox-posse-sheet-skip`).

**Webhooks (Tier B):** `#/settings/network` → textarea **Ecoe POSSE — Webhooks** (`vox-posse-webhooks`); POST JSON ao usar **Exportar JSON** no sheet.

**Markdown:** blocos fenced ` ```lang ` em corpo de post → `render/markdown-body.js` (feed, overlay, `#/t/:id`); sem HTML bruto; hashtags fora de fences.

**Pix:** botão ⚡ no overlay de foto; **Apoiar** no perfil quando há chave; tópico já tinha zap na toolbar.

**CLI headless:** `tools/posse-cli/posse-cli.mjs` — `--file export.json` ou stdin, `--webhook URL` (repetível), `--dry-run`. Testes: `tests/posse-cli.test.js`.

**Mastodon (intent manual):** abra `https://<sua-instancia>/share?text=` + URL-encode do bloco POSSE (título + link canônico). API `/api/v1/statuses` exige token — use CLI/webhook para automação.

**Labs:** `#/labs/frames` · `#/status` telemetria local.

**Fora de P0:** extensão Vox Bridge (P2 stub em `vox-bridge/`); Diffs/PR estilo GitHub (P1+ parcial via ` ```diff `).

