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
