# Medição da mídia v2 (PM-70)

> **Status:** medição · **Owner:** mantenedor · **Revisado:** 2026-11-09
> Spec medida: [mídia v2](../specs/midia-v2.md). Ferramenta: [`tools/media-bench/`](../../tools/media-bench/) (só desenvolvimento, não publicada). Não substitui o [ROADMAP](../ROADMAP.md).

## Rodada 2: parâmetros retrô (vigentes)

Depois da rodada 1, a spec foi revista para uma estética retrô: imagem **AVIF q70 em 960×540/540×960**, áudio **Opus 32 kbps**, vídeo **até 480p a 24 fps**. Mesmas 29 imagens e mesmos vídeos, mesmo ambiente (abaixo).

| Imagem AVIF 540p q70 | Todas (29) | Fotos (15) | Cards (8) | Prints (6) |
|---|---|---|---|---|
| Tamanho, mediana (mín.–máx.) | **43 KiB** (9–89) | 43 KiB (22–89) | 27 KiB (9–46) | 61 KiB (33–75) |
| WebP 0,78, mediana | 43 KiB | 43 KiB | 33 KiB | 57 KiB |
| PSNR AVIF / WebP, mediana | **42,7 / 39,2 dB** | 41,1 / 38,6 dB | 45,6 / 41,6 dB | 43,6 / 40,2 dB |
| Tempo (velocidade 6), mediana / máximo | **0,46 s / 1,3 s** | 0,42 s / 0,76 s | 1,1 s / 1,3 s | 0,54 s / 0,75 s |
| Velocidade 8, tempo mediano | 0,15 s | 0,17 s | 0,13 s | 0,22 s |
| Precisaram de degrau | **0** | 0 | 0 | 0 |
| Miniatura 160 px, mediana / máximo | 4,1 / 8,0 KiB | 4,3 / 8,0 KiB | 4,2 / 5,1 KiB | 3,3 / 4,7 KiB |

- **Todas as 29 couberam em q70 sem degrau**, com folga: o maior arquivo teve 89 KiB.
- **O AVIF teve PSNR maior que o WebP 0,78 em 29 de 29**, com tamanho mediano igual (43 KiB). Mesmo tamanho, imagem melhor.
- **A codificação ficou ~2 vezes mais rápida** que em 720p (0,46 s contra 0,8 s de mediana).

| Vídeo 480p a 24 fps, 10 s | Caixa | Q28 | Q32 |
|---|---|---|---|
| 1080p reduzido | 854×480 | **821 kbps · 1,0 MiB** (11 pedaços) | 529 kbps · 0,63 MiB |
| WhatsApp 480×848 | 480×848 | **402 kbps · 0,49 MiB** (6 pedaços) | 249 kbps · 0,30 MiB |

**Opus 32 kbps:** 60 s = **237 KiB** (3 pedaços); maior pacote de 120 bytes. O Chrome desktop aceita Opus a 32 kbps e H.264 480p com quantizador e por hardware.

## Rodada 1: AVIF 720p q66, Opus 48 kbps, vídeo 720p (histórico)

### Ambiente e limites desta rodada

| Item | Valor |
|---|---|
| Navegador | Chrome 152, Windows, desktop com 24 núcleos e 16 GB |
| Codificador AVIF | `@jsquash/avif` 2.1.1 (libavif do Squoosh em WebAssembly), **uma thread** (sem COOP/COEP, `crossOriginIsolated=false`, igual ao que o GitHub Pages permite), velocidade 6 (padrão) |
| Imagens | 29 imagens reais do workspace, sem duplicatas: 15 fotos, 8 cards e flyers com texto, 6 prints de rede social |
| Vídeos | 3 arquivos, mas 2 são o mesmo clipe (480×848); efetivamente 1 vídeo 480p e 1 vídeo 1080p (reduzido para 720p) |
| Qualidade | PSNR da luminância contra a imagem 720p sem compressão. Métrica objetiva simples: não substitui olhar as imagens |

**Não medido (NOT RUN):** tempo em celular barato (o objetivo principal do PM-70 continua em aberto), Safari/iPhone (AVIF, Opus em MP4), avaliação visual humana.

### Imagem: AVIF q66 com teto de 99.999 bytes

| | Todas (29) | Fotos (15) | Cards (8) | Prints (6) |
|---|---|---|---|---|
| AVIF final, mediana | **56 KiB** | 58 KiB | 38 KiB | 84 KiB |
| WebP 0,78, mediana | 60 KiB | 64 KiB | 48 KiB | 82 KiB |
| PSNR AVIF, mediana | **42,2 dB** | 40,7 dB | 45,2 dB | 43,3 dB |
| PSNR WebP 0,78, mediana | 39,8 dB | 39,0 dB | 42,5 dB | 40,6 dB |
| Tempo q66 (velocidade 6), mediana / máximo | **0,8 s / 2,7 s** | 0,8 s / 1,2 s | 2,0 s / 2,7 s | 0,8 s / 1,6 s |
| Precisaram de degrau | **4 (14%)** | 3 | 0 | 1 |

- **q66 coube em 25 de 29 imagens (86%).** As 4 que passaram ficaram entre 101 e 113 KiB em q66 e couberam em **q60** (89 a 95 KiB). Nenhuma precisou de mais que um degrau.
- **O AVIF teve PSNR maior que o WebP 0,78 em 29 de 29**, e foi menor **e** melhor em 21. A diferença mediana, 2,4 dB, é grande. Justifica o AVIF.
- **Cards com texto** são os que mais ganham em tamanho (−20% a −45%) e os mais lentos para codificar (até 2,7 s).
- **Velocidade 8 (q66):** 2,7 vezes mais rápida (mediana de 0,3 s contra 0,8 s) e ≈10% maior; 5 de 29 passariam do teto e precisariam de degrau.
- **Miniatura** (160 px, WebP 0,6): até **8,2 KiB**, não os 2 a 4 KiB que a spec estimava.

### Áudio: Opus 48 kbps

- **60 s = 355 KiB** (sinal sintético de tom + ruído), como a spec previa. Maior pacote: 188 bytes; cortar em pedaços de ≤ 99.999 bytes é trivial (≈ 4 pedaços).
- O Chrome desktop grava `audio/webm;codecs=opus` e `video/mp4;codecs=avc1,opus` e diz que toca Opus em MP4 ("probably"). **Falta conferir no iPhone.**

### Vídeo: H.264 por WebCodecs, quantizador fixo, 24 fps, 10 s

| Vídeo | Caixa | Q24 | Q28 | Q32 | Q36 |
|---|---|---|---|---|---|
| 1080p (reduzido) | 1280×720 | 2.014 kbps · 2,4 MiB | **1.302 kbps · 1,55 MiB** | 860 kbps · 1,0 MiB | 576 kbps · 0,7 MiB |
| 480×848 (WhatsApp) | 480×848 | 657 kbps · 0,8 MiB | 402 kbps · 0,5 MiB | 249 kbps · 0,3 MiB | 158 kbps · 0,2 MiB |

- A estimativa da spec (1,2 a 2 Mbps em 720p) se confirma entre **Q24 e Q28**. Proposta: **Q28 como o "q66" do vídeo**, porque fica em ≈1,3 Mbps e 1,55 MiB para 10 s (17 pedaços). **A equivalência visual com o AVIF q66 não foi medida**; precisa de olho humano.
- O Chrome desktop aceita H.264 com quantizador (`bitrateMode: "quantizer"`) e com aceleração por hardware.
- **O tempo de vídeo desta rodada não vale como velocidade**: a captura foi por busca quadro a quadro (o painel do navegador estava oculto), e as buscas num vídeo 1080p dominaram o tempo.

## Achados que mudam a implementação (PM-71), valem para as duas rodadas

1. **O codificador AVIF tem 3,4 MB** (`avif_enc.wasm`). Ele só seria baixado na primeira foto publicada (fora do shell e do precache), mas no 4G isso pesa. Alternativa a considerar: WebP 0,78 na primeira foto enquanto o AVIF baixa em segundo plano.
2. **A CSP precisa de `'wasm-unsafe-eval'`** no `script-src` para compilar WebAssembly. Ele libera só a compilação de wasm, não `eval` de JS, mas é uma mudança de segurança que precisa de decisão e de nota no modelo de ameaças. O `tests/csp.test.js` vai precisar aceitá-lo explicitamente.
3. **O `encode.js` do jSquash não carrega no Chrome 152**: ele importa `wasm-feature-detect` 1.10.0, que usa `import.source(...)` e dá SyntaxError. O vendor deve trazer só o caminho de thread única (`codec/enc/avif_enc.js` + `.wasm`, `utils.js`, `meta.js`), sem o detector. A bancada já faz assim.
4. **Velocidade 6 ou 8** depende do tempo num celular barato, ainda não medido. Se lá a velocidade 6 passar de ~5 s, usar 8 (o degrau resolve os que passarem do teto).
5. **Miniatura:** 160 px a WebP 0,6 chega a 8 KiB (mediana de 4). A spec passou a aceitar isso; se precisar de menos, testar 120 px ou qualidade 0,4.

## Como repetir num celular

A página abre em qualquer navegador servido por HTTP. Para medir num Android na mesma rede Wi-Fi, sirva a raiz do workspace e abra `http://<ip-do-pc>:5176/vox/tools/media-bench/index.html`:
- as fotos funcionam assim (escolha arquivos do próprio celular);
- **WebCodecs (vídeo e áudio) exige contexto seguro (HTTPS)** e não funciona por IP local. Para medir vídeo no celular, publique a página atrás de HTTPS ou use o Chrome remoto pelo USB.
