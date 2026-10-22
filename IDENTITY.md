# Identidade e criptografia

Uma história única em fases — evita misturar promessas do README com o que o PWA Fase 1 entrega.

## Fase 1 (atual): leitura anônima

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

## Boas práticas

- Chaves privadas **nunca** enviadas a servidor Vox (não há servidor).
- Backup: frase ou export cifrado — responsabilidade do usuário.
- Rotação: nova chave + transação de “sucessor” no perfil (Fase 2).

## Referências no repositório

- Tags e tipos: [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md)
- Posicionamento soberano vs infra global: [POSITIONING.md](./POSITIONING.md)
