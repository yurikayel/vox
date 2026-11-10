# Replicação por grau de amizade (v0)

> **Status:** spec aceita, não implementada · **Owner:** mantenedor · **Revisado:** 2026-11-09
> Relacionados: [mídia v2](./midia-v2.md), [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md), REV-15 (guardião na tomada), `client/js/supporter-mode.js`, `client/js/moderation.js`.

## Ideia

Cada pessoa guarda a própria mídia no aparelho ("traga seu próprio armazenamento"). Os contatos replicam, e quanto mais próximo o vínculo, mais o aparelho guarda. Quanto mais interligada a rede, mais cópias e mais caminhos: a rede fica mais forte e mais pronta para o offline à medida que cresce.

## Quem guarda o quê

| Grau | Guarda | Prioridade de permanência |
|---|---|---|
| **Seus posts** | Mídia v2 completa | **Fora do teto**; nunca sai para abrir espaço |
| **Amigos próximos** (a pessoa marca; teto proposto de ~15, a decidir) | Mídia v2 completa, inclusive vídeo | A mais alta |
| **Amigos** | Mídia v2 completa, inclusive vídeo | Alta |
| **Amigos de amigos** | Texto + imagem AVIF; vídeo só a capa | Média |
| **Amigos de amigos de amigos** | Texto + miniatura (já embutida no post) | Baixa |
| Mais longe | Nada; só busca quando alguém abre | — |

## Espaço

- **Teto padrão: 500 MB por aparelho**, além dos próprios posts. Se houver menos de 2 GB livres (`navigator.storage.estimate`), cai para 200 MB. A pessoa pode escolher 100 MB, 500 MB ou 1 GB.
- **Subcota de vídeo (proposta, a decidir no piloto):** no máximo 40% do teto (200 MB), para os vídeos não expulsarem as fotos. Pode baixar para 25% se vídeo for raro no piloto.
- **Quando enche, sai primeiro** o grau mais distante e o mais antigo; o que a pessoa guardou ou fixou não sai.
- Pedir ao navegador que não apague os dados (`navigator.storage.persist`, `storage-persistence.js`).
- O teto substitui o limite de armazenamento do `supporter-mode.js` (25 MB leve / 250 MB apoiador); as cotas diárias de transferência continuam.

Com a mídia v2 retrô medida (imagem com mediana de 43 KiB; vídeo de 10 s entre 0,5 e 1,0 MiB; áudio de 60 s ≈ 237 KiB): os 300 MB fora da subcota de vídeo guardam ≈ 7 mil imagens, e os 200 MB da subcota, ≈ 200 a 400 vídeos. Texto e miniaturas praticamente não pesam.

## Grau por salto (sem expor o grafo social)

O grau viaja com o post, não com a lista de amigos:

- quem tem o post informa o grau em que o guarda;
- quem recebe usa o próprio grau se for amigo direto do autor; senão, o grau de quem enviou + 1;
- a **lista de amigos e de amigos próximos nunca sai do aparelho**: o aparelho **pede** os posts dos amigos; ninguém anuncia quem são os amigos;
- mentir o grau só muda a qualidade guardada; não há ganho em trapacear.

## Regras que mandam mais que o grau

1. **Visibilidade:** post "só amigos" nunca passa do grau 1; post de comunidade fechada só circula entre membros; só o post público segue a escada inteira.
2. **Moderação:** post arquivado por denúncia para de circular em todos os graus e as cópias somem dos aparelhos (`canEchoPost`, quarentena).
3. **Recolhimento pelo autor:** pedido a todos (gossip de retração), mas não garantido; a interface diz isso.

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
