# Identidade e criptografia

Uma história única em fases — evita misturar promessas do README com o que o PWA Fase 1 entrega.

## Fase 1 (atual): leitura anônima

- Nenhuma chave gerada no app.
- Endereços exibidos são `owner.address` das transações Arweave (identificador público on-chain).
- Stub reservado em `client/js/app.js` para autoria na Fase 2.

## Fase 2: autoria de posts (Ed25519 + WebCrypto)

**Canônico para assinar transações Vox (tópico, resposta, comunidade, mod-action):**

- Algoritmo: **Ed25519** via `crypto.subtle` (import/export JWK onde o browser permitir).
- O endereço Arweave exibido deriva da chave pública conforme convenção da stack de upload (Turbo/Arweave wallet — detalhe de integração na implementação Fase 2).
- Payload: corpo da transação + tags `App-Name: vox-brasil`; assinatura prova autoria.

**Passkeys (WebAuthn)** — fase posterior ou opcional:

- Uso previsto: **login conveniente** e proteção da chave privada no dispositivo (Secure Enclave / TPM), não substituir Ed25519 on-chain sem mapeamento explícito.
- Modelo híbrido possível: Passkey desbloqueia keystore local que contém Ed25519 exportável apenas com gesto do usuário.

Ordem recomendada de entrega:

1. Ed25519 puro no browser (devs e early adopters).
2. UX Passkey para não expor seed.
3. Perfil com chave pública anunciada em tag `Author-Key` (proposta Fase 2).

## Fase 3: DMs (deferida)

Conforme [ARCHITECTURE.md](./ARCHITECTURE.md): ECDH (X25519/P-256) + AES-GCM para conteúdo; tag `Type: dm`. **Não implementado** no client Fase 1; README principal linka aqui para não overclaim.

## Boas práticas

- Chaves privadas **nunca** enviadas a servidor Vox (não há servidor).
- Backup: frase ou export cifrado — responsabilidade do usuário.
- Rotação: nova chave + transação de “sucessor” no perfil (Fase 2).

## Referências no repositório

- Tags e tipos: [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md)
- Posicionamento soberano vs infra global: [POSITIONING.md](./POSITIONING.md)
