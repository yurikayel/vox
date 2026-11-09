# Mídia v2: AVIF, Opus e H.264 com teto garantido por pedaço

> **Status:** spec aceita, não implementada · **Owner:** mantenedor · **Revisado:** 2026-11-09
> Substitui os limites de `LOFI_LIMITS` em `client/js/media-lofi.js` quando implementada. Relacionados: [replicação por grau](./replicacao-por-grau-v0.md), [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md).

## Princípio

Uma versão boa só, em vez de N versões. Qualidade fixa, um piso que não se ultrapassa para baixo, **pedaços sempre abaixo de 100.000 bytes** e uma trava final que impede publicar qualquer coisa acima do teto. O original fica na galeria do aparelho; o Vox não guarda original.

**Teto por item ou pedaço: 99.999 bytes.** Fica abaixo de 100 KB em qualquer leitura (decimal ou 100 KiB) e deixa folga para o envelope ANS-104 dentro dos 105 KiB por item do Turbo, para quando algo precisar ir ao Arweave.

## Imagem

| Item | Decisão |
|---|---|
| Formato | AVIF; WebP nativo quando o aparelho não codifica AVIF |
| Resolução | Dentro da caixa de 1280×720 (paisagem) ou 720×1280 (retrato); quadrada vira 720×720. **Nunca amplia** imagem menor |
| Qualidade | **q66** fixo |
| Se passar do teto | Desce em degraus (60, 55, 50…) até caber. Em 720p, a qualidade mínima sempre cabe, então o piso de resolução nunca é violado |
| Trava | Arquivo acima de 99.999 bytes não é publicado; erro honesto |
| Metadados | EXIF removido (inclusive GPS) pela recodificação no canvas; aplicar a rotação da foto **antes** |
| Redução | `createImageBitmap` com `resizeQuality: "high"` ou redução em etapas (o navegador não expõe Lanczos) |
| Miniatura | WebP nativo de 2 a 4 KiB **embutido no próprio post**: o que o 3º grau guarda, placeholder do feed e fallback de quem não lê AVIF (iOS < 16) |

**Codificação AVIF:** o Chrome lê AVIF mas **não gera** (teste em 09/11/2026, Chrome 152: `canvas.toBlob("image/avif")` devolveu PNG). Precisa de um codificador WebAssembly carregado só ao publicar, fora do shell e vendorizado com hash (como o arweave, PM-11). Se o aparelho for lento demais ou o codificador falhar, sai WebP nativo (~0,78).

**Estimativa (não medida):** em q66, a maioria das fotos fica entre 50 e 80 KB; 100 KB a 720p dão ≈ 0,87 bit por pixel, orçamento generoso para AVIF.

## Áudio

| Item | Decisão |
|---|---|
| Codec | Opus (já usado em `inline-composer.js`) |
| Qualidade | **48 kbps** |
| Duração máxima | **60 s** (mantida) |
| Pedaços | **Cortados por tamanho (≤ 99.999 bytes), não por tempo.** O corte atual a cada 15 s dá ≈ 90 KB em média, mas o Opus varia a taxa e um trecho pode passar de 100 KB |
| Tamanho | ≈ 360 KB por minuto, ≈ 4 pedaços |

## Vídeo

| Item | Decisão |
|---|---|
| Codec | **H.264 pelo codificador de hardware** (WebCodecs ou MediaRecorder): rápido em quase todo celular e tocável em qualquer aparelho, inclusive iPhone. AV1/VP9 em software são lentos demais em celular barato |
| Resolução | Caixa 1280×720 / 720×1280, sem ampliar |
| Quadros | **24 fps**; fontes de 30/60 fps perdem quadros, nunca se inventam quadros |
| "q66" | Quantizador fixo calibrado no protótipo para equivaler ao AVIF q66. Estimativa: 1,2 a 2 Mbps |
| Duração máxima | **10 s** (mantida): ≈ 1,5 a 2,5 MB, 15 a 25 pedaços |
| Pedaços | ≤ 99.999 bytes, com hash no manifesto (`buildMediaChunkManifest`) |
| Trava | Teto total proporcional à duração (ex.: 2 Mbps × duração); se passar, o quantizador sobe em degraus |
| Capa | Um quadro passa pelo pipeline de imagem (AVIF q66) e gera a miniatura embutida |
| Metadados | A recodificação remove a localização que o celular grava no vídeo |
| Áudio do vídeo | Opus 48 kbps se o iPhone tocar Opus em MP4; senão AAC (a testar) |
| Fallback | Sem WebCodecs, o MediaRecorder recodifica tocando o vídeo (leva a duração do vídeo); sem nenhum dos dois, o vídeo é recusado com explicação |

## Próximo passo: protótipo de medição

Com ~20 fotos reais (pessoas, rua, interior, prints) e vídeos curtos, num celular barato:

1. tamanho do AVIF q66 de cada foto e quantas precisaram do degrau;
2. tempo de codificação AVIF (WebAssembly) e H.264 (WebCodecs);
3. calibrar o quantizador do vídeo para equivaler ao q66 da imagem;
4. conferir se o iPhone toca Opus dentro de MP4.
