# ADR-029: Mídia em duas camadas (360p e 720p), sem teto de 100 KB por item

**Status:** accepted (2026-11-11, pelo mantenedor; não implementado, com medição das camadas pendente) · **Revisado:** 2026-11-11 · **Relacionados:** [mídia v2](../specs/midia-v2.md), [replicação por grau](../specs/replicacao-por-grau-v0.md), [ADR-019](./019-esquecer-por-padrao-e-memoria-civica.md), [ADR-004](./004-gateway-honest-fallback.md), [medição PM-70](../research/medicao-midia-v2-pm70-2026-11.md)

## 1. Contexto

A [mídia v2](../specs/midia-v2.md) foi desenhada com **uma versão só** de cada mídia (imagem em 540p, vídeo em até 480p) e um **teto de 99.999 bytes por item ou pedaço**. O teto existia para que qualquer item coubesse no subsídio do Turbo (até 100 KiB), caso precisasse ir ao Arweave.

Esse teto deixou de valer como premissa:
- O [ADR-019](./019-esquecer-por-padrao-e-memoria-civica.md) já decidiu que o Arweave **não** serve para segurar a mídia de todo mundo. A cota grátis do Turbo é de 10 MiB para a vida toda, por carteira. A mídia vive nos aparelhos, pela [replicação por grau](../specs/replicacao-por-grau-v0.md).
- Para essa replicação, um teto de 100 KB por item só limita a qualidade. O tamanho continua controlado pela resolução fixa de cada camada.

A replicação por grau já faz **os amigos guardarem e servirem a mídia inteira** do autor, enquanto graus distantes guardam menos. O que faltava era ter duas qualidades para servir a cada grau.

## 2. Decisão

1. **Sem teto de 100 KB por item.** O tamanho é controlado pela camada (resolução, quadros e qualidade fixos), não por um teto de bytes. Os **pedaços continuam como unidade de transporte** entre aparelhos (com hash no manifesto, para retomar e conferir), sem valer como limite da mídia.
2. **Duas camadas, geradas no aparelho de quem publica:**

   | | **Half (360p)** | **Full (720p)** |
   |---|---|---|
   | Imagem | Caixa de 640×360 / 360×640, AVIF q70 (WebP se o aparelho não gera AVIF) | Caixa de 1280×720 / 720×1280, AVIF q70 |
   | Vídeo | 360p, 30 fps, H.264 por hardware | 720p, 30 fps, H.264 por hardware |
   | Áudio | Opus 32 kbps, mono (como hoje) | Opus 96 kbps (proposto, a medir) |
   | Nunca amplia | A mídia menor que a caixa fica no tamanho original, e a Full só existe se for maior que a Half |
   | Miniatura | A de 160 px embutida no post continua igual |

   O 360p tem exatamente 1/4 dos pixels do 720p, então a Half sai da Full por uma redução simples.
3. **30 fps em todo vídeo.** Fonte de 60 fps perde um quadro a cada dois. Fonte abaixo de 30 fps fica como está: nunca se inventam quadros.
4. **Quem recebe o quê** (a escada da replicação por grau, agora com camadas):
   - **o autor, os amigos próximos e os amigos:** guardam a **Full** e a servem a quem pedir, dentro da visibilidade do post. É assim que **os amigos replicam o acesso à qualidade Full**: quanto mais amigos guardam, mais caminhos existem para baixar o 720p, mesmo com o autor offline;
   - **amigos de amigos e o feed público:** recebem a **Half** pelo gossip;
   - **mais longe:** texto e miniatura, como hoje.

   Quem tem só a Half pode tocar em **"Ver em alta"**, que pede a Full a quem a tenha (autor ou amigos), sem guardar. As regras de visibilidade, moderação e recolhimento da replicação por grau continuam valendo: post "só amigos" nunca passa do grau 1, em nenhuma camada.
5. **Arweave como cartório.** Mídia não vai ao Arweave por padrão: lá ficam o texto e o **hash** da mídia, que provam "em tal data, X publicou uma mídia com hash Y". Isso segue o ADR-019. Gravar a própria mídia continua sendo uma escolha explícita e paga da pessoa.

## 3. Consequências

- **Mais qualidade entre amigos**, sem pesar para quem está longe: a malha pública só carrega 360p.
- **Espaço:** a Full ocupa mais que a versão única de hoje. A tabela de espaço da replicação por grau (teto de 500 MB, subcota de vídeo) precisa de nova conta depois da medição. Até lá, vale o teto atual.
- **Publicar custa duas codificações.** Num celular barato isso precisa ser medido (roteiro do PM-70). Se ficar lento, a Full pode ser gerada depois, com o aparelho no carregador.
- **Hash no cartório:** quem guardou a mídia consegue provar que ela foi publicada, mesmo depois de recolhida. A tela de publicar deve dizer isso.
- **Medições vencidas:** os números do PM-70 (540p, 480p a 24 fps) servem de referência, mas não descrevem as camadas novas.

## 4. Em aberto

- **Repassar a chave:** um amigo pode **dar** acesso ao Full a quem não é amigo do autor, por exemplo embrulhando de novo uma chave de mídia para os amigos dele, até um grau que o autor escolhe? Este ADR **não** adota isso: aqui os amigos replicam o **arquivo**, e o acesso segue a visibilidade do post. Se for o caso, um ADR próprio trata da cifra por mídia e do limite de graus. Esse limite só vale para clientes honestos, porque quem tem o arquivo aberto pode repassar por fora.
- **Bitrates da Full** (vídeo e áudio): medir antes de fixar.
- **Expiração da Half de desconhecidos** no aparelho (proposta: 24 h ou dentro da cota), alinhada ao "esquecer por padrão".
