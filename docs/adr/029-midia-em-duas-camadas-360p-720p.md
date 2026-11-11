# ADR-029: Mídia em duas camadas (360p e 720p), sem teto de 100 KB por item

**Status:** accepted (2026-11-11, pelo mantenedor; revisto no mesmo dia: a Full é de quem **segue** o autor; não implementado, com medição pendente) · **Revisado:** 2026-11-11 · **Relacionados:** [mídia v2](../specs/midia-v2.md), [replicação por grau](../specs/replicacao-por-grau-v0.md), [ADR-019](./019-esquecer-por-padrao-e-memoria-civica.md), [ADR-004](./004-gateway-honest-fallback.md), [medição PM-70](../research/medicao-midia-v2-pm70-2026-11.md)

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
   | Imagem | Caixa de 640×360 / 360×640, AVIF **q60** (WebP se o aparelho não gera AVIF) | Caixa de 1280×720 / 720×1280, AVIF **q80** |
   | Vídeo | 360p, 30 fps, H.264 por hardware, qualidade equivalente a q60 (quantizador a medir) | 720p, 30 fps, H.264 por hardware, qualidade equivalente a q80 (quantizador a medir) |
   | Áudio | Opus **48 kbps** | Opus **96 kbps** |
   | Nunca amplia | A mídia menor que a caixa fica no tamanho original, e a Full só existe se for maior que a Half |
   | Miniatura | A de 160 px embutida no post continua igual |

   O 360p tem exatamente 1/4 dos pixels do 720p, então a Half sai da Full por uma redução simples.
3. **30 fps em todo vídeo.** Fonte de 60 fps perde um quadro a cada dois. Fonte abaixo de 30 fps fica como está: nunca se inventam quadros.
4. **Quem recebe o quê: a Full é de quem segue o autor** (revisão do mantenedor, 11/11/2026):
   - **seguidores** recebem a **Full** (720p, q80, 96 kbps) sem fazer nada: é só seguir. Não há botão nem espera. O aparelho do seguidor guarda a Full e **a serve a outros seguidores** do mesmo autor, então quanto mais gente segue, mais caminhos existem para o 720p, mesmo com o autor offline;
   - **quem vê o post sem seguir** recebe só a **Half** (360p, q60, 48 kbps). Ninguém entrega a Full para quem não segue. A partir do momento em que a pessoa segue, os próximos pedidos já vêm em 720p;
   - **mais longe na escada** (quem não segue nem recebeu o post de perto): texto e miniatura, como hoje;
   - **nas configurações**, o seguidor pode escolher receber a Half dos perfis que segue (economia de dados: 360p, 48 kbps, q60).

   As regras de visibilidade, moderação e recolhimento da replicação por grau continuam valendo: post "só amigos" nunca passa do grau 1, em nenhuma camada.
5. **Arweave como cartório.** Mídia não vai ao Arweave por padrão: lá ficam o texto e o **hash** da mídia, que provam "em tal data, X publicou uma mídia com hash Y". Isso segue o ADR-019. Gravar a própria mídia continua sendo uma escolha explícita e paga da pessoa.

6. **Como quem serve sabe que quem pede é seguidor.** Hoje o "Seguir" fica só no aparelho (`social.js`, `localStorage`), e ninguém mais sabe dele. Para ficar automático:
   - ao seguir, o aparelho assina um **comprovante de seguir** (`follow`: quem segue, quem é seguido, data), com a mesma chave das publicações;
   - o comprovante **não vai para o gossip**: só segue junto com o pedido da Full, para o aparelho que vai servir;
   - quem serve (o autor ou outro seguidor) confere a assinatura e entrega a Full; sem comprovante válido, entrega a Half;
   - deixar de seguir: o aparelho para de pedir a Full e apaga as Full que guardava daquele autor (fora o que a pessoa salvou).

## 3. Consequências

- **Mais qualidade para quem segue**, sem pesar para quem só passa: a malha pública só carrega 360p. Seguir vira o gesto que "abre" a alta qualidade.
- **Não é privacidade.** Qualquer pessoa pode seguir, e um cliente alterado pode repassar a Full por fora. A Full para seguidores é **incentivo e economia de banda**, não controle de acesso. Para restringir quem vê, vale a visibilidade do post ("só amigos", comunidade fechada), e a tela de publicar precisa dizer isso.
- **Grafo social:** o comprovante revela, para quem serve, que você segue aquele autor. Ele não vai para o gossip, mas quem serve fica sabendo. É o mesmo nível de exposição de seguir em qualquer rede, só que espalhado entre o autor e os seguidores que servem.
- **Espaço:** a Full ocupa mais que a versão única de hoje. A tabela de espaço da replicação por grau (teto de 500 MB, subcota de vídeo) precisa de nova conta depois da medição. Até lá, vale o teto atual.
- **Publicar custa duas codificações.** Num celular barato isso precisa ser medido (roteiro do PM-70). Se ficar lento, a Full pode ser gerada depois, com o aparelho no carregador.
- **Hash no cartório:** quem guardou a mídia consegue provar que ela foi publicada, mesmo depois de recolhida. A tela de publicar deve dizer isso.
- **Medições vencidas:** os números do PM-70 (540p, 480p a 24 fps) servem de referência, mas não descrevem as camadas novas.

## 4. Em aberto

- **Repassar a chave:** resolvido pela revisão de 11/11/2026. O acesso à Full é seguir; não há chave para repassar.
- **Quantizador do vídeo** equivalente a q60 e q80: medir.
- **Seguidores em comunidade fechada:** seguir alguém não dá acesso a post de comunidade fechada; a Full desses posts segue as regras de membro.
- **Expiração da Half de desconhecidos** no aparelho (proposta: 24 h ou dentro da cota), alinhada ao "esquecer por padrão".
