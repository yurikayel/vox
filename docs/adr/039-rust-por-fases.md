# ADR-039: Rust por fases — mais Rust com o tempo, a chave privada no navegador continua no WebCrypto

**Status:** accepted (2026-11-22; Fases 0 e 1 entregues em `rust/vox-core`) · **Revisado:** 2026-11-22 · **Relacionados:** [ADR-010](./010-vox-contribution-engine-execute-e-ajude.md) (Iroh no laboratório), [ADR-012](./012-soberania-digital-cintura-fina-cartuchos-webxdc.md) (sandbox), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md) (chaves não exportáveis), [ADR-027](./027-autorizacao-no-relay-dono-e-origem.md) (autorização no relay), [ADR-034](./034-raiz-e-subchaves-por-aparelho.md) (subchaves por aparelho), [ADR-035](./035-camadas-e-contextos.md) (camadas), [ADR-036](./036-agilidade-criptografica-pos-quantica.md) (pós-quântico), [ADR-037](./037-cofre-na-malha.md) (cofre na malha), [THREAT-MODEL](../THREAT-MODEL.md) (T1, T21, T22, T23, T26, T27), [DEPENDENCIAS](../DEPENDENCIAS.md), [ROADMAP](../ROADMAP.md) (LAN-18, PM-70, PM-71)

## 1. Contexto

O Vox hoje não tem nenhum arquivo Rust. O cliente é um PWA em JavaScript sem etapa de build; o relay e a sinalização (`relay/server.py`, `relay/signaling.py`) usam só a biblioteca padrão do Python, com o WebSocket (RFC 6455) escrito à mão; o nó do Windows é empacotado com PyInstaller, o cliente desktop do Windows é C# com WebView2, o do Linux é um lançador C de 56 linhas com Python, e o Android é um wrapper Java.

O mantenedor decidiu (17/11/2026) que quer os ganhos de segurança do Rust e que a tendência de longo prazo é usar mais Rust. Este ADR diz **onde** esses ganhos existem de verdade, **em que ordem** entrar e **o que nunca fazer**.

### 1.1 O ganho clássico já existe

O argumento mais conhecido do Rust é a segurança de memória (sem estouro de buffer, sem uso depois de liberar). JavaScript e Python já são seguros de memória, e o único código nativo do repositório, o lançador C, não tem chamada perigosa. Trocar de linguagem não elimina nenhuma classe de falha que exista hoje. Os ganhos estão em outros lugares (§1.2).

### 1.2 Onde Rust ganha em segurança

1. **Isolamento de dependência de cripto.** Um módulo WebAssembly só alcança o que a página entrega a ele: não vê DOM, rede nem armazenamento. Uma biblioteca de cripto comprometida dentro dele não tem para onde mandar dados. Uma dependência JavaScript tem a página inteira (T23).
2. **Cripto em tempo constante, auditada ou verificada.** O Schnorr BIP-340 de `client/js/nostr-event.js` usa `BigInt`, que não roda em tempo constante; o Shamir de `client/js/shamir-gf256.js` usa tabelas cujo acesso pode depender do segredo. Rust tem primitivas pensadas para tempo constante (`subtle`, `crypto-bigint`) e implementações verificadas formalmente (`libcrux`, com ML-KEM). Isso pesa a favor na revisão externa (LAN-18).
3. **Segredo apagado da memória.** JavaScript não consegue apagar uma string nem garantir quando o coletor libera um buffer. Rust zera a memória (`zeroize`).
4. **Formato inválido não compila.** Tipo fechado (`enum`) com `match` exaustivo e `serde` com `deny_unknown_fields` transformam em erro de compilação regras que hoje dependem de cuidado: o leitor recusar algoritmo desconhecido (ADR-036), o manifesto recusar token fora da lista (ADR-038), objeto vindo da rede não poder trazer `__proto__`.
5. **Relay mais firme contra derrubada.** Bug no WebSocket feito à mão em Python não dá execução remota, mas pode derrubar o processo ou esgotar threads. Os parsers de `hyper` e `tungstenite` passaram por muito fuzzing de terceiros, e o modelo assíncrono do `tokio` permite pôr limite em memória e conexões. As regras de autorização (ADR-027) não melhoram com a troca.
6. **Atualização assinada no nó desktop.** O atualizador do Tauri confere assinatura antes de instalar, e o Tauri 2 só deixa a interface chamar o lado nativo pelo que está listado. PyInstaller não traz nada disso.
7. **Chave presa ao hardware nas cascas nativas.** Fora do navegador, Rust alcança o chaveiro de hardware: Secure Enclave (Apple), StrongBox ou TEE (Android), TPM (Windows). Esses chaveiros trabalham com **P-256**, a curva que o Vox já usa, e a chave não sai do chip nem para o próprio app.

### 1.3 Onde Rust perde em segurança

1. **Chave privada na memória do WebAssembly.** Hoje um XSS consegue **usar** a chave não exportável do WebCrypto enquanto a página está aberta, mas não consegue **levar** a chave (T21, ADR-026). A memória de um módulo WebAssembly é um `ArrayBuffer` que qualquer script da página lê: com a chave ali, um XSS copia a conta para sempre.
2. **CSP mais aberta.** Compilar WebAssembly pede `'wasm-unsafe-eval'` no `script-src`. Libera só a compilação de WebAssembly, não `eval` de JavaScript, mas é uma porta a mais (T1).
3. **Mais dependências.** O relay em Python com zero dependências é uma força. `tokio` e `hyper` trazem perto de cem crates indiretas.
4. **Binário em vez de código legível.** Hoje o que se audita é o que roda. Um `.wasm` é binário: sem build reproduzível e hash publicado, quem confere perde a visão.

## 2. Opções

1. **Não usar Rust.** Recusada: deixa de fora Argon2id e ML-KEM em boa velocidade, cripto verificada, atualização assinada e chave no hardware.
2. **Reescrever o cliente em Rust** (Leptos, Yew ou parecido). Recusada: custo enorme, nenhum ganho de segurança sobre JavaScript, e perde o "o código que se lê é o que roda".
3. **Rust por fases, onde ganha, com salvaguardas fixas.** **Escolhida.**

## 3. Decisão

### 3.1 Regras que valem em todas as fases

1. **No navegador, a chave privada P-256 de identidade e de DM fica no WebCrypto não exportável.** Nunca na memória do WebAssembly. Código Rust em volta dela (forma canônica do que é assinado, parser do envelope, validação) pode.
2. **WebAssembly só para o que o WebCrypto não tem** (hoje: Argon2id e ML-KEM). Quando o navegador oferecer o algoritmo nativo, o caminho nativo passa a ser o preferido.
3. **Cada módulo WebAssembly roda sem acesso a DOM, rede ou armazenamento**: só recebe bytes e devolve bytes. Carrega só quando usado, fora do precache.
4. **Build reproduzível.** Versão do compilador fixada em `rust-toolchain.toml`, `Cargo.lock` no repositório, ferramentas de empacotamento com versão fixa, e o hash de cada `.wasm` publicado e conferido pelo Service Worker.
5. **Cadeia de suprimentos.** Toda crate entra no [DEPENDENCIAS.md](../DEPENDENCIAS.md); o CI roda `cargo-deny` (licença, crate proibida, origem) e `cargo-audit` (alertas conhecidos).
6. **Mesmas métricas do resto.** Os limites do perfil canônico (função, aninhamento, complexidade ciclomática e cognitiva, parâmetros, arquivo) valem para Rust, medidos pela AST com `rust-code-analysis`, em catraca como no JavaScript. `clippy` sem aviso.
7. **Mesma regra de documentação.** `#![deny(missing_docs)]` em todo crate; o `audit:docs` passa a conferir que o crate tem README com banner.
8. **Cripto nova passa pelo LAN-18** antes de entrar no app, como qualquer cripto nova.
9. **A interface do cliente continua em JavaScript.**

### 3.2 Fases

Cada fase prepara a próxima. As fases 0 e 1 não mudam nada para quem usa o app e podem começar já, sem conflito com o adiamento do uso por pessoas.

| Fase | O que entra | Ganho (§1.2) | Depende de |
|---|---|---|---|
| **0 · Fundação** | Workspace `rust/` com `rust-toolchain.toml`; CI com `clippy`, `cargo-deny`, `cargo-audit`, catraca do `rust-code-analysis` e `missing_docs`; build reproduzível de um `.wasm` de exemplo com hash conferido | prepara 1, 2, 4 | — |
| **1 · `vox-core`** | Cofre v2, envelope de DM v1 e manifesto v1 (ADR-038) como tipos Rust; vetores de teste compartilhados com o JavaScript (as duas implementações têm de dar o mesmo resultado); fuzzing com `cargo-fuzz`. **Não entra no app**: é a implementação de referência para a RFC 0002 e para o LAN-18 | 4 | fase 0 |
| **2 · Argon2id do cofre** | Primeiro WebAssembly no app. Derivação do cofre (ADR-037) com Argon2id em vez de só PBKDF2, num formato novo do cofre que declara o algoritmo (ADR-036). A CSP com `'wasm-unsafe-eval'` é decidida **uma vez**, junto do codificador AVIF do PM-71 | 1, 2 (T26, T27) | fase 0, LAN-18, medição em celular barato (como o PM-70) |
| **3 · Sai a cripto própria** | Schnorr e Shamir em crates com primitivas de tempo constante; ML-KEM-768 pelo `libcrux` na DM v2 (§3.3) | 1, 2, 3 | fase 2, RFC da DM v2, LAN-18 |
| **4 · Relay em Rust** | Relay e sinalização num binário só (`axum`, `tokio`, `tungstenite`). Os testes Python do relay passam a rodar contra o binário e servem de contrato; os dois rodam lado a lado antes da troca | 5 | fase 0; medir antes (memória e conexões no Render) |
| **5 · Nó nativo** | Tauri para o Nó Zero e o Steward Kit, com atualização assinada (tarefa 9 do pacote para anfitriões); Android pelo Tauri 2 ou por biblioteca Rust no serviço; subchaves do ADR-034 no chaveiro de hardware (§3.4); núcleo de malha com Iroh/QUIC só no laboratório (ADR-010) | 6, 7 | fase 0, RFC 0002 para as subchaves, volta do uso por pessoas |

### 3.3 DM híbrida: a chave ML-KEM pode ficar no WebAssembly

O WebCrypto não tem ML-KEM. Na DM v2 híbrida (ADR-036), abrir uma mensagem pede quebrar **as duas** partes: o ML-KEM e o ECDH P-256. Como a parte ECDH continua não exportável no WebCrypto, roubar só a chave ML-KEM por XSS não abre nenhuma mensagem. Por isso a chave ML-KEM pode morar no WebAssembly, com três cuidados:

- guardada cifrada por uma chave AES-GCM não exportável do aparelho (como as outras chaves em repouso, ADR-026);
- decifrada para dentro do módulo só no momento de abrir uma mensagem;
- apagada (`zeroize`) logo depois.

A RFC da DM v2 confirma isso, e o THREAT-MODEL ganha uma linha própria antes do código.

### 3.4 Cascas nativas: subchave no hardware

Nas cascas Tauri e Android, a subchave por aparelho do ADR-034 nasce no chaveiro de hardware quando ele existe, e nunca sai dele. A raiz continua na frase de recuperação. Sem chaveiro de hardware, a casca usa o chaveiro do sistema (Windows DPAPI, Keychain, Secret Service) e diz isso na tela de Soberania. Isso é **melhor** que o WebCrypto do navegador, cuja proteção é imposta pelo navegador e não pelo hardware.

### 3.5 O que fica de fora

Reescrever a interface em Rust; mover a chave P-256 do navegador para WebAssembly; trocar mídia (o codificador AVIF já é WebAssembly feito em C, e o problema dele é tamanho e CSP, não a linguagem); trocar a verificação de assinaturas, que o WebCrypto já faz nativamente.

## 4. Consequências

**Ganha:**
- Argon2id e ML-KEM em velocidade de celular barato, com cripto verificada ou auditada no lugar de código próprio.
- Formatos assinados com uma implementação de referência e fuzzing, o que ajuda a RFC 0002 e a revisão externa.
- Atualização assinada e chave no hardware quando o nó nativo voltar.

**Perde ou custa:**
- Uma segunda linguagem para manter, com toolchain, CI mais lento e cadeia de crates.
- CSP com `'wasm-unsafe-eval'` a partir da fase 2.
- Binários no app, que só continuam conferíveis com build reproduzível e hash publicado.
- O relay perde o "zero dependências" se a fase 4 acontecer.

**Riscos:** cada fase que toca o app ou a rede ganha linha no [THREAT-MODEL](../THREAT-MODEL.md) antes do código (fase 2: WebAssembly e CSP; fase 3: chave ML-KEM; fase 4: dependências do relay; fase 5: atualizador e chaveiro).

## 5. Próximos passos

1. Revisão e aceite deste ADR pelo mantenedor (**concluído em 2026-11-22**, com entrega inicial da Fase 0 — workspace `rust/`, `Cargo.lock` e job `test-rust` no CI com `rust-version = "1.80"` sem `rust-toolchain.toml` para usar o toolchain pré-instalado — e Fase 1 — crate `#![no_std]` zero-dependências `rust/vox-core` para `genesis_data`, `genesis_guard`, `shamir_gf256` em tempo constante e `sig_format`, com paridade verificada por `tests/rust-genesis-parity.test.js`).
2. Completar os demais formatos e ferramentas das Fases 0–1 (cofre v2, envelope de DM v1, manifesto v1, `cargo-deny`, `cargo-audit`, `rust-code-analysis`, `cargo-fuzz` e build `.wasm` reproduzível com hash).
3. Medição do Argon2id em WebAssembly num celular barato (tempo com 64 MiB e 3 passadas, tamanho do `.wasm`), no formato da medição do PM-70, antes da fase 2.
4. Confirmar, antes de citar no código, como cada navegador guarda a chave não exportável em disco e se o WebCrypto já ganhou ML-KEM, ML-DSA ou Argon2 nativos (há proposta no WICG).
