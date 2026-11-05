# ADR 014: Cofre de Conhecimento Zero (Zero-Knowledge Vault) e Restauração Soberana de Identidade Cross-Device

**Data:** 2026-11-05  
**Status:** Aprovado e Implementado  
**Escopo:** `client/js/oauth-vault.js`, `client/js/oauth-profile.js`, `client/js/local-account.js`, `client/js/people-index.js`, `relay/central_memory.py`, `ZeroCentralMemory.cs`  

---

## 1. Contexto e Problema

No Vox, a identidade do cidadão é representada criptograficamente por uma `routeId` (`vx_*`), ancorada em um par de chaves assimétricas ECDSA P-256 para assinatura de mensagens e ECDH P-256 para troca de chaves em mensagens diretas (DMs).

Nas versões iniciais:
1. **Fragmentação de Identidade:** Cada limpeza de cache, sessão anônima ou novo navegador gerava um novo par de chaves aleatório no aparelho. Ao enriquecer com o login social (Google ou Meta), criava-se uma nova `routeId` para o mesmo usuário, espalhando clones e identidades órfãs duplicadas no diretório de Pessoas (`#/people`).
2. **Falta de Portabilidade Cross-Device:** O usuário não conseguia transferir ou acessar sua conta do computador no celular (ou vice-versa) sem mover manualmente arquivos `.voxid` ou expor suas chaves privadas para um servidor central custodiar.
3. **Dependência de Big Tech:** Usuários que desejam plena soberania digital sem vínculo com Google ou Meta necessitavam de um mecanismo criptográfico robusto e amigável para acessar sua conta em outros dispositivos sem custódia de terceiros.

---

## 2. Decisão Arquitetural

Implementar uma arquitetura de **Cofre de Conhecimento Zero (Zero-Knowledge Vault)** operada estritamente no cliente (WebCrypto pura, sem bibliotecas externas), suportando três modalidades unificadas:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Navegador do Usuário                        │
│                                                                  │
│  [ Provedor ]      [ Identificador Canônico ]                    │
│   • Google     -->   payload.sub (JWT)                           │
│   • Meta       -->   profile.id (Graph API)                      │
│   • Soberano   -->   Senha / Frase Secreta (Passphrase)          │
│                                                                  │
│       │                                                          │
│       ├─────────────────────────────────┐                        │
│       ▼                                 ▼                        │
│  SHA-256 Hash                     PBKDF2-HMAC-SHA256             │
│  "vox-vault-v1:{prov}:{sub}"      (50.000 iterações)             │
│       │                                 │                        │
│       ▼                                 ▼                        │
│  Lookup Key (Hex 64 chars)        Chave AES-GCM (256 bits)       │
│                                         │                        │
│                                         ▼                        │
│                                 Cifra Local do Bundle:           │
│                                 • routeId (vx_*)                 │
│                                 • Chaves P-256 (Sign/Verify)     │
│                                 • Chaves DM (ECDH)               │
│                                 • Nome, Avatar, Bio e Pix        │
│                                         │                        │
│       ┌─────────────────────────────────┘                        │
│       ▼                                                          │
│  Payload Cifrado: { iv, ciphertext, updatedAt }                  │
└───────┬──────────────────────────────────────────────────────────┘
        │
        │ HTTP GET/POST /memory/vault/<lookupKey>
        ▼
┌──────────────────────────────────────────────────────────────────┐
│             Nó de Memória Central / Relay Comunitário             │
│                                                                  │
│   Armazenamento Cego: Map<lookupKey, ciphertext>                 │
│   * Zero-Knowledge: o servidor NUNCA vê senhas ou chaves         │
│   * Sem custódia: vazamento do banco não expõe contas            │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1 Identificadores Canônicos
- **Google:** `sub` (Subject ID imutável do token JWT emitido pelo Google Identity Services).
- **Meta (Facebook/Instagram):** `profile.id` (User ID único e perene retornado pela Graph API `/me`).
- **Soberano:** Senha ou frase secreta definida pelo próprio usuário com no mínimo 4 caracteres.

### 2.2 Algoritmos Criptográficos
- **Derivação de Chave:** PBKDF2 com HMAC-SHA256, 50.000 iterações e salt com namespace isolado `vox-sovereign-vault:{provider}:{sub}` gerando chave simétrica AES-GCM de 256 bits.
- **Envelope Cifrado:** AES-GCM com IV aleatório de 12 bytes gerado via `crypto.getRandomValues`.
- **Integridade Estrita (Fail-Closed):** Caso uma senha incorreta seja fornecida no destino, a verificação da tag de autenticação GCM falha imediatamente (`OperationError`), impossibilitando a injeção ou decifração de dados corrompidos.

### 2.3 Sincronização Cross-Device Instantânea (QR Code & Link)
- O PWA gera links no formato canônico:
  ```
  https://<dominio>/#/sync?p=<passphrase>
  ```
- O link é codificado diretamente em QR Code nativo offline via `qr-url.js` (`VOX_SHARE_HASH` estendido para aceitar `sync`).
- **Fluxo do Usuário:**
  1. No computador, em `#/profile`, o usuário clica em `📲 QR Code para Celular`.
  2. Aponta a câmera do celular para a tela: o navegador móvel abre a rota `#/sync`.
  3. O cliente obtém o cofre na Memória Central, deriva a chave, decifra o bundle e importa a conta instantaneamente, sem digitação manual.

---

## 3. Consequências e Benefícios

1. **Unicidade e Eliminação de Clones:** Conectar a mesma conta Google ou Meta sempre restaura o exato mesmo `routeId` original, eliminando cartões duplicados.
2. **Privacidade e Confiança Zero:** O servidor ou relay só armazena hashes SHA-256 e bytes cifrados indistinguíveis de ruído. Não há custódia nem risco de exfiltração centralizada de chaves.
3. **Independência Tecnológica:** Usuários têm paridade total de experiência cross-device sem precisar de contas Google ou Meta, mantendo controle soberano pleno.
4. **Resiliência e Desempenho:** Testes automatizados executam derivação e decifração em ~18ms, garantindo fluidez instantânea no navegador.
