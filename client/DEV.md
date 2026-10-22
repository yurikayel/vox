# Guia do Desenvolvedor — Vox Fase 2

Este documento descreve como testar o fluxo de leitura, autoria (upload de transações), compartilhamento e governança no PWA vanilla do Vox.

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

## 3. Teste do Fluxo Completo da Fase 2 (DoD)

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

## 4. Fallback Offline / Demonstração

Se os gateways Arweave estiverem temporariamente inacessíveis ou lentos para indexar no ambiente de testes, o Vox ativa automaticamente o **Modo Demonstração** (`mock.js`), permitindo navegar pela interface e testar formulários e telas sem travamentos.
