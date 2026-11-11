# Mídia v2: AVIF, Opus e H.264 em duas camadas (360p e 720p)

> **Status:** spec aceita, não implementada · **Owner:** mantenedor · **Revisado:** 2026-11-10 (revisão retrô de 09/11: 540p q70, Opus 32 kbps, vídeo até 480p; carrossel em 10/11)
> **Revista pelo [ADR-029](../adr/029-midia-em-duas-camadas-360p-720p.md) (11/11/2026):** duas camadas (Half 360p e Full 720p), sem teto de 100 KB por item, vídeo a 30 fps. As medições abaixo são da versão única antiga (540p e 480p a 24 fps) e servem só de referência.
> Substitui os limites de `LOFI_LIMITS` em `client/js/media-lofi.js` quando implementada. Relacionados: [replicação por grau](./replicacao-por-grau-v0.md), [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md), [medição (PM-70)](../research/medicao-midia-v2-pm70-2026-11.md).

## Princípio

**Duas camadas, geradas no aparelho de quem publica** ([ADR-029](../adr/029-midia-em-duas-camadas-360p-720p.md)):
- a **Half (360p)** circula na malha pública e chega a quem está longe;
- a **Full (720p)** vai para quem **segue** o autor, que a guarda e a serve a outros seguidores.

A rede continua com **estética retrô**: resolução e qualidade fixas por camada, e nada é ampliado. O original fica na galeria do aparelho; o Vox não guarda o original.

**Sem teto de bytes por item.** O tamanho é controlado pela camada. Os **pedaços** (até ~100 KB, com hash no manifesto) continuam só como unidade de transporte entre aparelhos, para retomar e conferir; não limitam a mídia. A mídia não vai ao Arweave por padrão: lá ficam o texto e o hash ([ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md)).

## Imagem

| Item | Decisão |
|---|---|
| Formato | AVIF; WebP nativo quando o aparelho não codifica AVIF |
| Resolução | **Half:** caixa de **640×360** (paisagem) ou 360×640 (retrato). **Full:** caixa de **1280×720** ou 720×1280. Imagem quadrada vira 360×360 e 720×720. **Nunca amplia** imagem menor; a Full só existe se a imagem for maior que a Half |
| Qualidade | **Half: q60. Full: q80** ([ADR-029](../adr/029-midia-em-duas-camadas-360p-720p.md)). Referência antiga: q70 |
| Metadados | EXIF removido (inclusive GPS) pela recodificação no canvas; aplicar a rotação da foto **antes** |
| Redução | `createImageBitmap` com `resizeQuality: "high"` ou redução em etapas (o navegador não expõe Lanczos) |
| Miniatura | WebP nativo de 160 px **embutido no próprio post** (medido: mediana de 4 KiB, máximo de 8 KiB): o que o 3º grau guarda, placeholder do feed e fallback de quem não lê AVIF (iOS < 16) |

**Medido no desktop (29 imagens reais):** todas couberam em q70 sem degrau; mediana de **43 KiB** (de 9 a 89); PSNR maior que o do WebP 0,78 em 29 de 29; codificação com mediana de 0,46 s e máximo de 1,3 s numa thread.

**Codificação AVIF:** o Chrome lê AVIF mas **não gera** (Chrome 152: `canvas.toBlob("image/avif")` devolveu PNG). Precisa de um codificador WebAssembly (3,4 MB) carregado só ao publicar, fora do shell e vendorizado com hash (como o arweave, PM-11). Se o aparelho for lento demais ou o codificador falhar, sai WebP nativo (~0,78).

## Áudio

| Item | Decisão |
|---|---|
| Codec | Opus (já usado em `inline-composer.js`) |
| Qualidade | **Half: 48 kbps. Full: 96 kbps** |
| Duração máxima | **60 s** |
| Pedaços | Cortados por tamanho (~100 KB, unidade de transporte), não por tempo, porque o Opus varia a taxa |
| Tamanho (medido) | **≈ 237 KiB por minuto**, 3 pedaços |

## Vídeo

| Item | Decisão |
|---|---|
| Codec | **H.264 pelo codificador de hardware** (WebCodecs ou MediaRecorder): rápido em quase todo celular e tocável em qualquer aparelho, inclusive iPhone. AV1/VP9 em software são lentos demais em celular barato |
| Resolução | **Half:** **360p** (caixa de 640×360 ou 360×640). **Full:** **720p** (caixa de 1280×720 ou 720×1280). Sem ampliar |
| Quadros | **30 fps** em todo vídeo do Vox (decisão do mantenedor, 11/11/2026). Fonte de 60 fps perde um quadro a cada dois, uma divisão exata, sem engasgo. Fonte abaixo de 30 fps (24 ou 25) fica na taxa original: nunca se inventam quadros |
| Qualidade | Quantizador fixo **Q28** (candidato; equivalência visual com a imagem não medida) |
| Duração máxima | **10 s** |
| Tamanho | **A medir nas camadas novas.** Referência antiga (480p, 24 fps, 10 s): de 0,5 a 1,0 MiB (de 400 a 820 kbps, conforme o movimento) |
| Pedaços | ~100 KB para o transporte, com hash no manifesto (`buildMediaChunkManifest`) |
| Taxa | Quantizador fixo por camada. As taxas da Full ficam para depois da medição; referência proposta: ~0,4 Mbps na Half e ~1,5 Mbps na Full |
| Capa | Um quadro passa pelo pipeline de imagem (na camada do vídeo) e gera a miniatura embutida |
| Metadados | A recodificação remove a localização que o celular grava no vídeo |
| Áudio do vídeo | Opus 32 kbps se o iPhone tocar Opus em MP4; senão AAC (a testar) |
| Fallback | Sem WebCodecs, o MediaRecorder recodifica tocando o vídeo (leva a duração do vídeo); sem nenhum dos dois, o vídeo é recusado com explicação |

## Carrossel (até 4 itens do mesmo tipo)

Um post pode ter **até 4 fotos, ou até 4 áudios, ou até 4 clipes de vídeo**. Não se misturam tipos no mesmo carrossel. Cada item segue as regras acima, nas duas camadas, e é cortado em pedaços para o transporte.

| Tipo | Máximo | Tamanho do post |
|---|---|---|
| Fotos | 4 imagens | A medir por camada (referência antiga, 540p: ≈ 170 KiB na mediana) |
| Áudios | 4 × 60 s = **4 min**, cada áudio com **uma imagem opcional** que ilustra | Half (48 kbps): ≈ 1,4 MiB de áudio; Full (96 kbps): ≈ 2,8 MiB; mais as imagens |
| Vídeo | 4 × 10 s = **40 s** | A medir por camada (referência antiga, 480p a 24 fps: de 2 a 4 MiB) |

**Playback contínuo (áudio e vídeo):** o carrossel toca como uma peça só, sem pausa entre as partes.

- **Áudio:** as partes viram **um fluxo Opus contínuo cortado em fronteiras de pacote**, e não 4 arquivos independentes. Como cada áudio pode ter sido gravado em outro momento (ou escolhido da galeria), na hora de publicar o app decodifica as partes e as **recodifica em sequência num único codificador**; cada parte do carrossel é o trecho desse fluxo entre duas fronteiras. Assim não há o atraso inicial do codificador (*pre-skip*) entre as partes, que geraria um clique ou um silêncio. A reprodução decodifica e agenda as partes uma atrás da outra na Web Audio API (`AudioBufferSourceNode.start(t)`), com precisão de amostra. A imagem de cada parte aparece enquanto ela toca.
- **Vídeo:** os clipes são codificados com a **mesma configuração** (camada, 30 fps, quantizador da camada), e **cada parte começa num quadro-chave**, então qualquer parte toca sozinha. Para tocar sem emenda, as partes são anexadas a um único `SourceBuffer` (Media Source Extensions; `ManagedMediaSource` no iPhone com iOS 17.1 ou mais). Isso exige empacotar em MP4 fragmentado, um muxer a escolher no PM-71. Sem MSE, o fallback são dois `<video>` alternados, com a próxima parte já carregada: fica quase sem emenda.
- **Pausar, avançar e arrastar** valem para o conjunto: a barra de progresso mostra os 40 s (ou 4 min), com marcas nas divisões.

**Quem recebe cada camada** ([ADR-029 §2.4](../adr/029-midia-em-duas-camadas-360p-720p.md)):
- **quem segue o autor** recebe a **Full**, sem fazer nada, guarda e serve a outros seguidores. Nas configurações, dá para escolher a Half (economia de dados);
- **quem vê o post sem seguir** recebe só a **Half**. A Full nunca é entregue a quem não segue; ao seguir, os próximos pedidos já vêm em 720p;
- **mais longe:** texto e miniatura.

O comprovante assinado de seguir vai junto com o pedido da Full, nunca pelo gossip (ADR-029 §2.6). **Isso não é privacidade:** qualquer um pode seguir. Para restringir quem vê, vale a visibilidade do post.

## Decisões que faltam para implementar (PM-71)

1. **`'wasm-unsafe-eval'` na CSP do app**: libera só a compilação de WebAssembly (não `eval` de JS), mas é mudança de segurança e precisa de nota no modelo de ameaças.
2. **Download de 3,4 MB do codificador AVIF** na primeira foto publicada. Alternativa: primeira foto em WebP enquanto o AVIF baixa em segundo plano.
3. **Velocidade do codificador AVIF** (6 ou 8), depois de medir num celular barato. A velocidade 8 foi ~3 vezes mais rápida no desktop.
4. **Vendor sem o `wasm-feature-detect`**: a versão 1.10.0 quebra no Chrome 152 (`import.source`); trazer só o codificador de thread única.

## O que falta medir

Tempo de codificação num celular barato e comportamento no Safari/iPhone (AVIF, Opus em MP4). Tamanho e tempo das **duas camadas** (360p e 720p, vídeo a 30 fps); a medição do PM-70 foi da versão única, a 24 fps. Roteiro em [medição (PM-70)](../research/medicao-midia-v2-pm70-2026-11.md#como-repetir-num-celular).
