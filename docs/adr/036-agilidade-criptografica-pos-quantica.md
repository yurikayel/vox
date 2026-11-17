# ADR-036: Agilidade criptográfica e transição pós-quântica — todo formato diz o seu algoritmo; DM híbrida primeiro

**Status:** proposed (2026-11-17; espera o aceite do mantenedor; nada implementado; cada passo de código pede RFC e a revisão externa de cripto, LAN-18) · **Revisado:** 2026-11-17 · **Relacionados:** [ADR-025](./025-cofre-v2-so-a-senha-abre.md) (cofre v2), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md) (chaves em repouso), [ADR-032](./032-login-perene-a-conta-nasce-com-saida.md) (semente e frase), [ADR-034](./034-raiz-e-subchaves-por-aparelho.md) (raiz e subchaves), [THREAT-MODEL](../THREAT-MODEL.md), [DEPENDENCIAS](../DEPENDENCIAS.md), [ROADMAP](../ROADMAP.md) (LAN-18)

## 1. Contexto

Um computador quântico grande o bastante para rodar o algoritmo de Shor quebra toda a criptografia de chave pública que o Vox usa hoje: ECDSA e ECDH em curva elíptica, Ed25519, Schnorr e RSA. Não quebra a criptografia simétrica nem os hashes: o algoritmo de Grover só reduz pela metade a segurança efetiva, e AES-256 e SHA-256 continuam fortes.

Ninguém sabe quando essa máquina vai existir. As estimativas públicas falam, em geral, da década de 2030; os órgãos de padronização já publicaram os substitutos (NIST FIPS 203, ML-KEM; FIPS 204, ML-DSA; FIPS 205, SLH-DSA, em 2024) e pedem a migração ao longo desta década. O que torna o assunto atual não é a data, é o ataque **"guarda agora, abre depois"**: quem copiar hoje um texto cifrado por troca de chaves em curva elíptica pode abri-lo no dia em que a máquina existir. Assinatura não tem esse problema: só dá para forjar depois.

### 1.1 Inventário (develop `77a6fa7`, 17/11/2026)

Levantado por busca de texto (`git grep`) nos nomes de algoritmo do WebCrypto e das bibliotecas próprias em `client/js`; serve de mapa, não de medição.

| Uso | Algoritmo | Módulos | Formato diz o algoritmo? | Com computador quântico |
|---|---|---|---|---|
| Assinatura da conta (`vx_…`) | ECDSA P-256 + SHA-256 | `local-account.js`, `signed-verify.js`, `account-backup.js`, `key-lock.js`, `recovery-phrase.js` | em parte: `sigv` diz a forma canônica; a curva só aparece no JWK (`crv`) e no `computeRouteId` (`P-256:x:y`) | **quebra** (forjar posts e delegações) |
| DM | ECDH P-256 efêmero + AES-GCM-256 | `crypto-dm.js` (envelope `v: 1`, `ephPub`) | em parte: `v: 1` e o `crv` do JWK | **quebra**, e **já** (guarda agora, abre depois) |
| Semente → chaves | HKDF-SHA256 | `recovery-phrase.js` | rótulos fixos no código | aguenta |
| Cofre | PBKDF2-SHA256 (600 mil) + AES-GCM-256 | `vault/vault-crypto.js`, `account-backup-wrap.js` | sim (`v: 2`, `kdf`, `iter`) | aguenta (o limite continua sendo a força da senha) |
| Chaves em repouso | AES-GCM-256 não exportável | `keystore.js` | — (só local) | aguenta |
| Carteira e itens do Arweave | RSA-PSS 4096 | `wallet.js`, `ans104.js` | definido pelo Arweave | quebra; depende do Arweave |
| Ponte Nostr | Schnorr secp256k1 (BIP-340, código próprio) | `nostr-event.js`, `nostr-transport.js` | definido pelo Nostr | quebra; depende do Nostr |
| Ponte Bluesky (DPoP) | ECDSA P-256 | `bsky-oauth.js` | definido pelo atproto | quebra; depende do Bluesky |
| Laboratório | Ed25519, X25519, ECDSA | `vox-identity.js`, `identity-link.js` (não plugados, PM-04), `labs/collective-mofn.js` | — | fora do app |

### 1.2 O que o Vox já tem a favor

- **Semente:** desde o ADR-032 as chaves nascem de uma semente por HKDF com rótulos. Chaves pós-quânticas também podem nascer dela (ML-KEM e ML-DSA têm geração determinística a partir de bytes), então a **frase de 12 palavras que a pessoa já guardou** restaura também as chaves novas, sem novo backup.
- **Versão nos formatos:** o cofre já declara `kdf` e `iter`; a assinatura já tem `sigv`; a DM tem `v`. Falta tornar isso regra e cobrir o algoritmo, não só a versão.
- **Subchaves (ADR-034):** a forma assinada nova ainda não existe (RFC 0002). É a hora mais barata de pôr o algoritmo dentro dela.
- **Cópias de quem segue:** o histórico já vive em várias cópias. Isso serve de prova de que um objeto existia antes de uma data, o que importa no §3.3.

## 2. Opções

1. **Esperar o computador quântico.** Recusada: as DMs de hoje ficam expostas, e trocar algoritmo sem campo de algoritmo nos formatos vira migração de todo o histórico às pressas.
2. **Trocar tudo para pós-quântico já.** Recusada: o WebCrypto dos navegadores ainda não oferece ML-KEM nem ML-DSA de forma geral, os algoritmos são novos (o híbrido protege contra um defeito neles), e assinaturas de 2,4 a 3,3 KB por post custam espaço sem ganho enquanto a máquina não existe.
3. **Agilidade agora, DM híbrida primeiro, assinatura por pré-compromisso.** **Escolhida.**

## 3. Decisão

### 3.1 Regra: todo formato diz o seu algoritmo (em vigor a partir do aceite)

- Formato **novo** de dado cifrado ou assinado declara o algoritmo por nome (`alg`, `kem`, `kdf`), **dentro** do que é assinado ou do AAD, para que não dê para trocar o rótulo sem invalidar.
- O leitor recusa algoritmo desconhecido. Nada de "tentar um e depois o outro" sem rótulo.
- Formatos atuais continuam lidos como estão: DM `v: 1` = ECDH P-256; assinatura sem campo = ECDSA P-256. Isso fica escrito como o significado implícito deles.
- Conferência: a revisão de PR e o THREAT-MODEL; um teste por formato que confirme que trocar o rótulo quebra a assinatura ou a abertura.

### 3.2 DM v2 híbrida (primeiro passo de código, com RFC própria)

- **Troca de chaves híbrida:** ECDH P-256 efêmero (como hoje) **e** ML-KEM-768. A chave AES sai de HKDF-SHA256 sobre os dois segredos, com os dois textos cifrados e as duas chaves públicas no `info`. Quebrar só um dos dois não abre a mensagem.
- **Chave pública ML-KEM no perfil:** 1.184 bytes, publicada assinada junto da chave de DM de hoje. A privada nasce da semente (rótulo próprio no HKDF); conta antiga sem semente gera uma aleatória e a leva no cofre.
- **Sem rebaixamento:** se o destinatário anunciou chave ML-KEM, o envio é v2, sem volta para v1. Envio v1 só para quem ainda não tem a chave, e a tela diz isso.
- **Custo:** +1.088 bytes por mensagem (texto cifrado do ML-KEM). Não passa pelo QR.
- **O que não se conserta:** DMs v1 já copiadas por alguém continuam expostas no futuro. O ADR não promete o contrário.

### 3.3 Assinatura: pré-compromisso agora, troca no "dia Q"

- **Agora (junto da RFC 0002 do ADR-034):** a raiz assina, com a chave P-256 de hoje, um **compromisso**: o hash SHA-256 de uma chave pública ML-DSA-65 derivada da semente. Esse registro circula nas cópias de quem segue como qualquer objeto assinado. Custa 32 bytes; a chave ML-DSA em si fica guardada, sem uso.
- **Delegação de subchave (ADR-034):** a forma nova leva `alg`, e pode levar assinatura híbrida (P-256 + ML-DSA) quando isso for decidido na RFC.
- **"Dia Q"** (data decidida em ADR próprio, quando houver sinal concreto): a partir dele, assinatura só P-256 deixa de valer para objeto novo. Uma chave ML-DSA só vale para um `vx_…` se o compromisso dela já existia **antes** do dia Q, provado pelas cópias ou por um registro com data. Assim o `vx_…` não muda e quem quebrar a P-256 depois não consegue inventar um compromisso antigo.
- **Histórico:** objetos que já estavam nas cópias antes do dia Q continuam valendo; objeto "antigo" que aparecer só depois do dia Q, assinado só com P-256, deixa de ser prova.

### 3.4 O que fica como está

- **Cofre, chaves em repouso, semente:** simétricos (AES-256, SHA-256, PBKDF2, HKDF). Nada muda.
- **Arweave, Nostr, Bluesky:** a assinatura é do protocolo deles. O Vox acompanha a migração de cada um; não inventa extensão própria.

### 3.5 Biblioteca

- Nada de implementação própria de ML-KEM ou ML-DSA.
- Primeira escolha: o WebCrypto do navegador, quando oferecer os algoritmos. Até lá, uma biblioteca JS pura, copiada para o repositório (o cliente não tem build), com versão e hash fixos, listada em [DEPENDENCIAS](../DEPENDENCIAS.md) e revisada na LAN-18 antes de ir para o app.
- A escolha concreta (e o estado do WebCrypto na data) fica na RFC da DM v2, com fonte e data.

### 3.6 Ordem

1. Este ADR: inventário e regra do §3.1 (só documento).
2. RFC da DM v2 + escolha da biblioteca → código, testes e revisão LAN-18.
3. Pré-compromisso ML-DSA dentro da RFC 0002 (ADR-034).
4. ADR do "dia Q", quando houver sinal concreto.

## 4. Consequências

- **Positivas:**
  - as DMs novas deixam de ser alvo de "guarda agora, abre depois";
  - trocar algoritmo depois vira mudança de rótulo e de leitor, não migração às pressas;
  - a frase de 12 palavras continua sendo a única coisa que a pessoa precisa guardar;
  - o `vx_…` sobrevive à transição.
- **Custos:**
  - +1,2 KB no perfil (chave ML-KEM) e +1,1 KB por DM;
  - uma dependência criptográfica nova, de algoritmo recente, em JS;
  - a assinatura ML-DSA-65 tem 3.309 bytes: depois do dia Q, cada post fica maior (cabe com folga no limite de 100 KiB, mas não cabe num QR).
- **Riscos:**
  - implementação em JS sem tempo constante garantido (canal lateral): o híbrido limita o dano, e a LAN-18 revisa;
  - conta antiga sem semente depende do cofre para guardar a chave nova;
  - o compromisso só protege quem o publicou antes do dia Q. Quem não abrir o app até lá precisa de outro caminho (frase, guardiões), a desenhar no ADR do dia Q.
