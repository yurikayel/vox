# Replicação por grau de amizade (v0)

> **Status:** aceita (não implementada) · **Owner:** mantenedor · **Revisado:** 2026-11-09
> Relacionados: [mídia v2](./midia-v2.md), [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md), REV-15 (guardião na tomada), `client/js/supporter-mode.js`, `client/js/moderation.js`.

## Ideia

Cada pessoa guarda a própria mídia no aparelho ("traga seu próprio armazenamento"). Os contatos replicam, e quanto mais próximo o vínculo, mais o aparelho guarda. Quanto mais interligada a rede, mais cópias e mais caminhos: a rede fica mais forte e mais pronta para o offline à medida que cresce.

## Quem guarda o quê

| Grau | Guarda | Prioridade de permanência |
|---|---|---|
| **Seus posts** | Mídia v2 **Full (720p)** e Half: é o **original publicado e o backup local** | **Dentro do teto**, mas nunca sai sozinho para abrir espaço; se o teto encher só com os seus, o app avisa e pede para escolher |
| **Amigos próximos** (a pessoa marca; teto proposto de ~15, a decidir) | Mídia v2 **Full (720p)**, inclusive vídeo, que servem a quem pedir | A mais alta |
| **Amigos** | Mídia v2 **Full (720p)**, inclusive vídeo, que servem a quem pedir | Alta |
| **Seguidores** (que não são amigos) | Mídia v2 **Full (720p)** dos perfis que seguem, que servem a outros seguidores; nas configurações, podem preferir a Half | Média-alta |
| **Amigos de amigos** (que não seguem) | Texto + mídia **Half (360p)**: carrossel de fotos inteiro; áudio: imagens + 1ª parte; vídeo só a capa. A Full só ao seguir | Média |
| **Amigos de amigos de amigos** | Texto + miniatura (já embutida no post) | Baixa |
| Mais longe | Nada; só busca quando alguém abre | — |

## Espaço

> Com as duas camadas do [ADR-029](../adr/029-midia-em-duas-camadas-360p-720p.md), a Full pesa mais que a versão única medida abaixo: a conta de espaço precisa ser refeita depois da medição. Até lá, valem os tetos atuais.


- **Teto por modo** (decisão do mantenedor, 11/11/2026), contando os próprios posts (o original publicado e o backup local). A banda é **proporcional ao disco**: até o dobro dele por dia. A pessoa pode baixar o teto diário, nunca passar do dobro. No 4G vale o teto próprio (padrão 5 MB/dia).

  | Modo | Disco | Dados repassados por dia |
  |---|---|---|
  | **Nó leve** (padrão) | **100 MB, fixo** | até 200 MB |
  | **Apoiador** (opt-in, só no Wi-Fi) | **de 512 MB a 1 GB**; começa em 1 GB | até 1 a 2 GB |
  | **Guardião** (só no Wi-Fi e carregando) | **2 GB, fixo** | até 4 GB (o módulo ainda não está plugado no app) |

  Planejado: com menos de 2 GB livres (`navigator.storage.estimate`), o apoiador fica no mínimo (512 MB).
- **Subcota de vídeo (proposta, a decidir no piloto):** no máximo 40% do teto (40 MB no nó leve, até 410 MB no apoiador), para os vídeos não expulsarem as fotos. Pode baixar para 25% se vídeo for raro no piloto.
- **Quando enche, sai primeiro** o grau mais distante e o mais antigo; o que a pessoa guardou ou fixou não sai.
- Pedir ao navegador que não apague os dados (`navigator.storage.persist`, `storage-persistence.js`).
- Os tetos ficam em `supporter-mode.js` (`LIGHT_LIMITS`, `SUPPORTER_LIMITS`, `GUARDIAN_LIMITS`, `BANDWIDTH_PER_DISK`).

Com a mídia v2 retrô medida (imagem com mediana de 43 KiB; vídeo de 10 s entre 0,5 e 1,0 MiB; áudio de 60 s ≈ 237 KiB): no apoiador com 1 GB, os ≈ 614 MB fora da subcota de vídeo guardam ≈ 14 mil imagens, e os ≈ 410 MB da subcota, ≈ 400 a 800 vídeos; no nó leve, ≈ 1.400 imagens e 40 a 80 vídeos (conta com a versão única antiga; refazer com as camadas do ADR-029). Texto e miniaturas praticamente não pesam.

## Grau por salto (sem expor o grafo social)

O grau viaja com o post, não com a lista de amigos:

- quem tem o post informa o grau em que o guarda;
- quem recebe usa o próprio grau se for amigo direto do autor; senão, o grau de quem enviou + 1;
- a **lista de amigos e de amigos próximos nunca sai do aparelho**: o aparelho **pede** os posts dos amigos; ninguém anuncia quem são os amigos;
- mentir o grau só muda a qualidade guardada; não há ganho em trapacear.

## Regras que mandam mais que o grau

1. **Visibilidade:** post "só amigos" nunca passa do grau 1; post de comunidade fechada só circula entre membros; só o post público segue a escada inteira.
2. **Moderação:** post arquivado por denúncia para de circular em todos os graus e as cópias somem dos aparelhos (`canEchoPost`, quarentena).
3. **Apagar aqui apaga para todo mundo.** O que o autor guarda é o original e o backup: quando ele apaga um post no aparelho, o app manda a retração assinada (gossip de retração) e todos os aparelhos que guardam cópia, em qualquer camada, apagam. Quem está offline apaga ao reconectar. A garantia vale para o Vox sem alterações: um app modificado pode ignorar a retração, e a interface diz isso. Antes de apagar, a tela avisa que **não há volta**, porque o backup local também some.

## Banda

- Mídia completa: só no Wi-Fi e, de preferência, na tomada (trabalho voluntário "deixar ligado").
- Imagem AVIF e miniatura podem vir pelo 4G, dentro do teto de 5 MB que já existe.
- Com o limite diário do modo leve (50 MB), os 500 MB levam ≈ 10 dias para encher, de propósito.

## Formar amizade (a decidir)

Proposta: amizade = seguir mútuo **com confirmação** (QR presencial ou convite aceito dos dois lados), para que uma conta falsa não entre no grau 1.

## Offline, com honestidade

O que já está no aparelho funciona sem internet. Conteúdo novo chega quando dois aparelhos conseguem se falar; o navegador não faz malha por Bluetooth nem descobre vizinhos na rede local sozinho. A exceção é o pareamento por QR presencial (`airgap-webrtc.js`, escrito e não plugado). Pontes entre grupos valem mais do que quantidade de amigos.

## Métrica do piloto

**Porcentagem de posts acessíveis com o autor offline** 1 h, 6 h e 24 h depois de publicados. Se sobe conforme a rede se adensa, o modelo funciona. É também a métrica do marco M2 da proposta ao NLnet.
