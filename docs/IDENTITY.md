# Identidade e criptografia

> **Status:** canônico · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10

Uma história única em fases — evita misturar promessas do README com o que o PWA Fase 1 entrega.

> **Estado atual (nov/2026):** identidade local `vx_*` (ECDSA P-256) criada no aparelho no onboarding; recuperação por cofre cifrado (ver *Cofre e recuperação* abaixo). As fases abaixo são o histórico de como isso chegou aqui.

## Fase 1 (histórico): leitura anônima

- Nenhuma chave gerada no app.
- Endereços exibidos são `owner.address` das transações Arweave (identificador público on-chain).
- Stub reservado em `client/js/app.js` para autoria na Fase 2.

## Fase 2 (entregue): autoria de posts (Wallet Arweave JWK + WebCrypto)

**Canônico para assinar transações Vox (tópico, resposta, comunidade, mod-action):**

- **Autoria on-chain canônica:** Wallet Arweave (formato RSA/JWK nativo do ecossistema), gerenciada localmente em `localStorage` via `wallet.js` e assinada diretamente pelo cliente.
- O endereço Arweave público (`owner.address`) identifica o autor de tópicos, respostas e comunidades.
- **Chave Ed25519 auxiliar:** Fica reservada como tag opcional (`Author-Key`) para Fase 2.1 — o upload de transações não é bloqueado por incompatibilidade Ed25519 vs RSA da carteira.
- Payload: corpo da transação (JSON UTF-8) + tags `App-Name: vox-brasil`; assinatura prova autoria criptográfica permanente.

**Passkeys (WebAuthn)** — fase posterior ou opcional:

- Uso previsto: **login conveniente** e proteção da chave privada no dispositivo (Secure Enclave / TPM), não substituir Ed25519 on-chain sem mapeamento explícito.
- Modelo híbrido possível: Passkey desbloqueia keystore local que contém Ed25519 exportável apenas com gesto do usuário.

Ordem recomendada de entrega:

1. Ed25519 puro no browser (devs e early adopters).
2. UX Passkey para não expor seed.
3. Perfil com chave pública anunciada em tag `Author-Key` (proposta Fase 2).

## Fase 4 (entregue): DMs E2E efêmeras fora do permaweb

- **Princípio:** "Seus dados são seus" significa também o direito soberano de **não** ter conversas privadas eternizadas em um ledger imutável.
- **Proibição estrita on-chain:** **Não** existe `Type: dm` gravado no Arweave. Conversas privadas nunca são enviadas ao permaweb.
- **Chaves de DM:** Par assimétrico **ECDH P-256** gerado via WebCrypto (`crypto.subtle`) e mantido exclusivamente no navegador/aparelho do usuário (`crypto-dm.js`), desacoplado da carteira RSA/JWK Arweave de autoria pública.
- **Identidade pública de DM:** Apenas a chave pública `Dm-Pub` (formato JWK) pode ser anunciada no perfil através de uma transação `Type: profile-key` com a tag `Dm-Pub`. Trata-se unicamente da chave pública de cifra, sem qualquer conteúdo de mensagem.
- **Criptografia por envelope:** Para cada mensagem, o remetente gera um par de chaves ECDH efêmero e deriva uma chave AES-GCM-256 com autenticação de cabeçalho AAD (`v1|from|to`). O destinatário abre com sua chave privada local.
- **Transporte efêmero:**
  - *Online:* Entrega direta via WebRTC DataChannel dedicado (`vox-dm-v0`) ponto-a-ponta.
  - *Offline:* Envelope cifrado entregue ao inbox efêmero do relay comunitário (`/inbox/:toAddress`) com **TTL de 72 horas** e expiração automática, podendo ser apagado pelo destinatário imediatamente após a leitura.
  - *Armazenamento histórico:* Estritamente local em IndexedDB (`cache-node.js`, store `dm-threads`), sem sincronização com nuvens corporativas.

## Fase 5 (entregue): Handles amigáveis e resolução de nomes (@handle)

- **Identidade social ≠ Identidade legal:** O `@handle` é um alias mnemônico comunitário dentro do protocolo `vox-brasil`, registrado via transação `Type: handle` com a tag `Handle: <slug>`. Ele não confere propriedade marcaria no Registro.br nem substitui o nome civil do titular.
- **Resolução sem autoridade central:**
  - O cliente resolve o endereço Arweave mais recente associado ao slug.
  - Se múltiplas contas reivindicarem o mesmo slug, o PWA sinaliza **ambiguidade/conflito** e apresenta ambos os perfis, sem que nenhum mantenedor tenha poder de veto ou confisco.
- **ArNS (Fase 5.1):** A resolução de nomes ArNS (.ar) é documentada como evolução futura, evitando custos de leilão e dependências externas no cliente essencial.

## Cofre e recuperação (ADR-014)

- **Cofre multi-identidade** (`vox-accounts-vault-v1`): alternância entre contas locais no mesmo aparelho.
- **Export `.voxid`:** credenciais em envelope cifrado com senha (PBKDF2 + AES-GCM-256).
- **Recuperação por cofre (v2, PM-90):** o cliente cifra a identidade com a **Senha Soberana** (`#/backup`): PBKDF2-SHA256 com 600 mil iterações, sal aleatório por cofre e AES-GCM-256. A memória central (`/memory/vault/`) guarda só o envelope cifrado. **Login com Google ou Meta não abre o cofre:** só enriquece o perfil. Cofres v1 são revogados na abertura do app. Detalhes: [ADR-025](./adr/025-cofre-v2-so-a-senha-abre.md), que substitui o [ADR-014](./adr/014-zero-knowledge-vault-recuperacao-soberana.md).
  - **Limite:** quem opera o servidor de memória pode tentar adivinhar a senha, pagando 600 mil iterações por tentativa. Use uma frase de 4 ou mais palavras.
- **Sync entre aparelhos:** rota `#/sync?b=…` por link ou QR Code. O link leva só o cofre cifrado; a Senha Soberana (12+ caracteres) é digitada no outro aparelho (PM-92).
- **Servidor da memória central:** só muda por escolha da pessoa. Link, par ou servidor apenas sugerem, e o app pergunta mostrando o domínio (PM-91).
- **Wipe local:** `wipeLocalAccount()` em `client/js/local-account.js`.

## Boas práticas

- **Objetivo** (cumprido para identidade e DM depois do backup, ver PM-93): chaves privadas nunca saem do aparelho em claro, e relays opcionais só recebem texto cifrado (cofre, DMs). Fora do aparelho, isso vale desde o cofre v2 (PM-90). Dentro dele, desde o SW v7.63 as chaves ficam cifradas por uma chave do aparelho não exportável e só abrem na hora de assinar, abrir DM ou exportar backup. Desde o SW v7.64, depois do backup com a Senha Soberana, identidade e DM viram chaves não exportáveis e a única cópia exportável é a cifrada pela senha ([ADR-026](./adr/026-chaves-em-repouso-trava-depois-do-backup.md)).
- Backup: frase ou export cifrado — responsabilidade do usuário.
- Rotação: nova chave + transação de “sucessor” no perfil (Fase 2).

## Referências no repositório

- Tags e tipos: [README.md](../README.md), [ARCHITECTURE.md](../ARCHITECTURE.md)
- Posicionamento soberano vs infra global: [POSITIONING.md](./product/POSITIONING.md)
