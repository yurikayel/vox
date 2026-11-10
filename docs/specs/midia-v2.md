# Mídia v2: AVIF, Opus e H.264 com teto garantido por pedaço

> **Status:** spec aceita, não implementada · **Owner:** mantenedor · **Revisado:** 2026-11-10 (revisão retrô de 09/11: 540p q70, Opus 32 kbps, vídeo até 480p; carrossel em 10/11)
> Substitui os limites de `LOFI_LIMITS` em `client/js/media-lofi.js` quando implementada. Relacionados: [replicação por grau](./replicacao-por-grau-v0.md), [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md), [medição (PM-70)](../research/medicao-midia-v2-pm70-2026-11.md).

## Princípio

Uma versão boa só, em vez de N versões. A rede tem **estética retrô**: resolução modesta, arquivos pequenos, rápida de transmitir entre aparelhos. Qualidade fixa, nada é ampliado, **pedaços sempre abaixo de 100.000 bytes** e uma trava final que impede publicar qualquer coisa acima do teto. O original fica na galeria do aparelho; o Vox não guarda original.

**Teto por item ou pedaço: 99.999 bytes.** Fica abaixo de 100 KB em qualquer leitura (decimal ou 100 KiB) e deixa folga para o envelope ANS-104 dentro dos 105 KiB por item do Turbo, para quando algo precisar ir ao Arweave.

## Imagem

| Item | Decisão |
|---|---|
| Formato | AVIF; WebP nativo quando o aparelho não codifica AVIF |
| Resolução | Dentro da caixa de **960×540** (paisagem) ou **540×960** (retrato); quadrada vira 540×540. **Nunca amplia** imagem menor |
| Qualidade | **q70** fixo |
| Se passar do teto | Desce em degraus (66, 60, 55…) até caber. Na medição, nenhuma imagem precisou |
| Trava | Arquivo acima de 99.999 bytes não é publicado; erro honesto |
| Metadados | EXIF removido (inclusive GPS) pela recodificação no canvas; aplicar a rotação da foto **antes** |
| Redução | `createImageBitmap` com `resizeQuality: "high"` ou redução em etapas (o navegador não expõe Lanczos) |
| Miniatura | WebP nativo de 160 px **embutido no próprio post** (medido: mediana de 4 KiB, máximo de 8 KiB): o que o 3º grau guarda, placeholder do feed e fallback de quem não lê AVIF (iOS < 16) |

**Medido no desktop (29 imagens reais):** todas couberam em q70 sem degrau; mediana de **43 KiB** (de 9 a 89); PSNR maior que o do WebP 0,78 em 29 de 29; codificação com mediana de 0,46 s e máximo de 1,3 s numa thread.

**Codificação AVIF:** o Chrome lê AVIF mas **não gera** (Chrome 152: `canvas.toBlob("image/avif")` devolveu PNG). Precisa de um codificador WebAssembly (3,4 MB) carregado só ao publicar, fora do shell e vendorizado com hash (como o arweave, PM-11). Se o aparelho for lento demais ou o codificador falhar, sai WebP nativo (~0,78).

## Áudio

| Item | Decisão |
|---|---|
| Codec | Opus (já usado em `inline-composer.js`) |
| Qualidade | **32 kbps**, mono |
| Duração máxima | **60 s** |
| Pedaços | **Cortados por tamanho (≤ 99.999 bytes), não por tempo**, porque o Opus varia a taxa |
| Tamanho (medido) | **≈ 237 KiB por minuto**, 3 pedaços |

## Vídeo

| Item | Decisão |
|---|---|
| Codec | **H.264 pelo codificador de hardware** (WebCodecs ou MediaRecorder): rápido em quase todo celular e tocável em qualquer aparelho, inclusive iPhone. AV1/VP9 em software são lentos demais em celular barato |
| Resolução | No máximo **480p**: caixa de 854×480 / 480×854, sem ampliar |
| Quadros | **24 fps**; fontes de 30/60 fps perdem quadros, nunca se inventam quadros |
| Qualidade | Quantizador fixo **Q28** (candidato; equivalência visual com a imagem não medida) |
| Duração máxima | **10 s** |
| Tamanho (medido, 10 s) | **0,5 a 1,0 MiB** (400 a 820 kbps conforme o movimento), 6 a 11 pedaços |
| Pedaços | ≤ 99.999 bytes, com hash no manifesto (`buildMediaChunkManifest`) |
| Trava | Teto total de 1 Mbps × duração (≈ 1,2 MiB para 10 s); se passar, o quantizador sobe em degraus (32, 36…) |
| Capa | Um quadro passa pelo pipeline de imagem (AVIF q70) e gera a miniatura embutida |
| Metadados | A recodificação remove a localização que o celular grava no vídeo |
| Áudio do vídeo | Opus 32 kbps se o iPhone tocar Opus em MP4; senão AAC (a testar) |
| Fallback | Sem WebCodecs, o MediaRecorder recodifica tocando o vídeo (leva a duração do vídeo); sem nenhum dos dois, o vídeo é recusado com explicação |

## Carrossel (até 4 itens do mesmo tipo)

Um post pode ter **até 4 fotos, ou até 4 áudios, ou até 4 clipes de vídeo**. Não se misturam tipos no mesmo carrossel. Cada item segue as regras acima, com o próprio teto, e é cortado em pedaços de até 99.999 bytes.

| Tipo | Máximo | Tamanho do post (medido por item) |
|---|---|---|
| Fotos | 4 × imagem 540p q70 | ≈ 170 KiB na mediana; teto de 4 × 99.999 bytes (≈ 390 KiB) |
| Áudios | 4 × 60 s = **4 min**, cada áudio com **uma imagem opcional** que ilustra | ≈ 950 KiB de áudio + até 4 imagens (≈ 170 KiB) |
| Vídeo | 4 × 10 s = **40 s** | ≈ 2 a 4 MiB (Q28); teto de 4 × a trava de cada clipe (≈ 4,8 MiB) |

**Playback contínuo (áudio e vídeo):** o carrossel toca como uma peça só, sem pausa entre as partes.

- **Áudio:** as partes viram **um fluxo Opus contínuo cortado em fronteiras de pacote**, e não 4 arquivos independentes. Como cada áudio pode ter sido gravado em outro momento (ou escolhido da galeria), na hora de publicar o app decodifica as partes e as **recodifica em sequência num único codificador**; cada parte do carrossel é o trecho desse fluxo entre duas fronteiras. Assim não há o atraso inicial do codificador (*pre-skip*) entre as partes, que geraria um clique ou um silêncio. A reprodução decodifica e agenda as partes uma atrás da outra na Web Audio API (`AudioBufferSourceNode.start(t)`), com precisão de amostra. A imagem de cada parte aparece enquanto ela toca.
- **Vídeo:** os clipes são codificados com a **mesma configuração** (resolução, 24 fps, Q28), e **cada parte começa num quadro-chave**, então qualquer parte toca sozinha. Para tocar sem emenda, as partes são anexadas a um único `SourceBuffer` (Media Source Extensions; `ManagedMediaSource` no iPhone com iOS 17.1 ou mais). Isso exige empacotar em MP4 fragmentado, um muxer a escolher no PM-71. Sem MSE, o fallback são dois `<video>` alternados, com a próxima parte já carregada: fica quase sem emenda.
- **Pausar, avançar e arrastar** valem para o conjunto: a barra de progresso mostra os 40 s (ou 4 min), com marcas nas divisões.

**Replicação por grau (proposta):**
- **amigos próximos e amigos:** o carrossel inteiro;
- **amigos de amigos:** fotos inteiras; no áudio, as imagens e a **primeira parte**, para dar uma prévia; no vídeo, só a capa;
- **3º grau:** texto e miniatura.

## Decisões que faltam para implementar (PM-71)

1. **`'wasm-unsafe-eval'` na CSP do app**: libera só a compilação de WebAssembly (não `eval` de JS), mas é mudança de segurança e precisa de nota no modelo de ameaças.
2. **Download de 3,4 MB do codificador AVIF** na primeira foto publicada. Alternativa: primeira foto em WebP enquanto o AVIF baixa em segundo plano.
3. **Velocidade do codificador AVIF** (6 ou 8), depois de medir num celular barato. A velocidade 8 foi ~3 vezes mais rápida no desktop.
4. **Vendor sem o `wasm-feature-detect`**: a versão 1.10.0 quebra no Chrome 152 (`import.source`); trazer só o codificador de thread única.

## O que falta medir

Tempo de codificação num celular barato e comportamento no Safari/iPhone (AVIF, Opus em MP4). Roteiro em [medição (PM-70)](../research/medicao-midia-v2-pm70-2026-11.md#como-repetir-num-celular).
