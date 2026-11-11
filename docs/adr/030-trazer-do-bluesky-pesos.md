# ADR-030: Trazer do Bluesky (PESOS): arquivo assinado da própria voz, sem servidor

**Status:** accepted (2026-11-11, pelo mantenedor; não implementado) · **Revisado:** 2026-11-11 · **Relacionados:** [ADR-028](./028-ponte-activitypub-via-bluesky.md), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md), [ADR-021](./021-integridade-na-entrada-forma-assinada.md), [ADR-019](./019-esquecer-por-padrao-e-memoria-civica.md), [ADR-029](./029-midia-em-duas-camadas-360p-720p.md), [THREAT-MODEL T10](../THREAT-MODEL.md)

## 1. Contexto

O Vox faz **POSSE** (publicar aqui, replicar fora): `posse-dispatch.js` e a replicação de `linked-accounts.js` levam o post do Vox para o Bluesky e outras redes. O brainstorm de 11/11/2026 propôs o inverso, que a IndieWeb chama de **PESOS** (publicar fora, espelhar no próprio espaço). A pessoa continua postando onde o público dela está, e o Vox traz as publicações dela, assinadas, para o perfil e, se ela quiser, para uma comunidade. Isso ataca a "cidade vazia": quem chega não precisa mudar de hábito, e o perfil já começa com conteúdo.

**O que já existe:**
- O leitor público do Bluesky (`bsky-feed.js`): `getAuthorFeed` na API pública, sem login; `normalizeBskyPost` marca o post como externo, com link para o original.
- O login no Bluesky pelo navegador (`bsky-oauth.js`), com a sessão só no aparelho. Ele prova que a conta (o DID) é da pessoa.
- O [ADR-028 §5](./028-ponte-activitypub-via-bluesky.md#5-não-decidido-aqui) deixou a ponte no sentido contrário para um ADR próprio.

**Fatos conferidos em 11/11/2026** (chamadas reais, com cabeçalho `Origin` de outro site):
- A API pública (`public.api.bsky.app`) responde a `getAuthorFeed` e `getPosts` com `Access-Control-Allow-Origin: *`. O navegador lê sem servidor.
- `getAuthorFeed` aceita até 100 posts por página; `getPosts`, até 25 endereços por chamada.
- Repost vem marcado com `reason` do tipo `app.bsky.feed.defs#reasonRepost`; resposta traz `record.reply`.
- **Imagens:** o CDN (`cdn.bsky.app`) **não** libera a leitura pelo navegador (sem cabeçalho CORS). Dá para mostrar a imagem, não para copiar os bytes. O PDS da pessoa (`com.atproto.sync.getBlob`) libera (`*`) e devolve o arquivo original.
- **Prova do original:** `com.atproto.sync.getRecord` no PDS devolve o registro com a prova assinada do repositório (CAR), também com CORS liberado.
- **Mastodon:** o Bridgy Fed é por opção da pessoa, e a conta do Fediverso aparece no Bluesky como `usuario.instancia.ap.brid.gy` ([documentação](https://fed.brid.gy/docs)). Essa conta fica no servidor do Bridgy Fed: a pessoa **não** faz login nela, então o Vox não tem como provar que ela é dona.

**Premissas que pesam:**
- **Praça neutra:** nada de envio automático ou em massa ([ADR-028 §1](./028-ponte-activitypub-via-bluesky.md#1-contexto)).
- **Ritmo da malha:** no máximo 20 posts por chave a cada 10 minutos no gossip (`rate-limit.js`, THREAT-MODEL T10).
- **Chaves ([ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md)):** depois do backup, a chave fica não exportável no IndexedDB do aparelho. O app assina sem pedir senha, mas **só no aparelho e com o app aberto**. A chave não vai para outra máquina.
- **Assinatura v2 ([ADR-021](./021-integridade-na-entrada-forma-assinada.md)):** a partir de 24/11/2026 o aparelho assina todos os campos, em qualquer profundidade.
- **Arweave é cartório, não depósito** ([ADR-019](./019-esquecer-por-padrao-e-memoria-civica.md), [ADR-029 §2.5](./029-midia-em-duas-camadas-360p-720p.md)): lá ficam no máximo o texto e o hash da mídia. A mídia não vai para lá.
- **Preservação vem de quem segue** (decisão do mantenedor, 11/11/2026): os seguidores guardam cópias dos posts, e isso é a replicação e o backup orgânico ([replicação por grau](../specs/replicacao-por-grau-v0.md)). O "preservado para sempre" do brainstorm não significa Arweave.
- **Apagar:** o autor apaga com a retração assinada (`createPostTombstone`, `broadcastGossipDelete`).

## 2. Opções

| Opção | Como | Custo e risco | Veredito |
|---|---|---|---|
| **A. No navegador, com fila e confirmação** | Ao abrir o app, o Vox lê o feed público da conta vinculada e mostra os posts novos para a pessoa escolher | Zero servidor. Só roda com o app aberto | **Recomendada** |
| **B. Nó sempre ligado assinando** | O nó (Vox Populi) lê e assina 24 horas por dia | Exige a chave privada fora do aparelho, contra o ADR-026 e o A-11 ("o nó serve, o cliente decide") | **Recusada.** Um nó que só busca e deixa na fila fica em aberto (§5) |
| **C. Extensão que captura o texto no X ou no Threads** | Lê a página de terceiros na hora de postar | Quebra a cada mudança de layout, passa por revisão de loja, pode capturar rascunho. Na prática, é raspagem | **Recusada** |
| **D. Webhook** (n8n, um `pesos-cli`) | Automação externa empurra posts para o Vox | Não há endereço público do Vox para receber (não existe relay completo público, [INFRA-CUSTOS](../INFRA-CUSTOS.md)). E seria envio automático | **Recusada** |
| **E. X, Threads e Instagram como fonte** | API de cada rede | X: leitura paga. Meta: aprovação do app e servidor para guardar tokens | **Fora** |

## 3. Decisão

1. **Fonte: só o Bluesky**, pela API pública, e só a conta que a pessoa vinculou **por login** (`bsky-oauth.js`). O login prova que o DID é dela; não há código de verificação para postar.
2. **Só os próprios posts de raiz.** Ficam de fora respostas (`record.reply`) e reposts (`reason`). Citação de post de outra pessoa vira link, sem trazer o conteúdo citado. Post de outra pessoa nunca entra.
3. **Fila com confirmação, nunca automático.**
   - Ao abrir o app, o Vox lê os posts recentes da conta (até 100) e separa os que ainda não vieram.
   - Aparece "N posts novos no Bluesky. Trazer?". A pessoa marca quais trazer e o destino de cada um.
   - **Destino padrão: o perfil dela**, como arquivo. Dali o post aparece na Ágora (a Home) de quem segue, como qualquer post.
   - **Comunidade só por escolha no item.** A tag `#vox` no post original apenas sugere; nada vai para uma comunidade sem a pessoa escolher qual.
   - Não há "trazer sempre" nesta versão.
4. **Ritmo:** o que a pessoa confirma entra no aparelho na hora e vai para a malha aos poucos, dentro do limite de 20 posts a cada 10 minutos. A primeira importação oferece os 100 mais recentes; o histórico mais antigo vem depois, em novos lotes, também confirmados.
5. **Forma do post trazido:** um post normal do Vox, assinado pela chave da pessoa, com o campo `origin` **dentro do que é assinado**:

   ```json
   "origin": { "net": "bsky", "uri": "at://…", "cid": "…", "url": "https://bsky.app/profile/…/post/…", "createdAt": "…" }
   ```

   - Só entra depois que o aparelho passar a assinar v2 (24/11/2026), para o `origin` ficar coberto pela assinatura.
   - O `ts` é a hora em que a pessoa assinou no Vox. A tela mostra "Postado no Bluesky em …".
   - O mesmo `origin.uri` nunca entra duas vezes.
   - O card leva o selo "Do Bluesky ↗", com link para o original.
6. **Sem eco com o POSSE.** Um post que o Vox publicou no Bluesky (`dispatchAutoReplication`) não pode voltar como importado.
   - O Vox passa a guardar o endereço que o Bluesky devolve ao publicar (hoje não guarda), e a fila ignora esses posts.
   - A fila também ignora post cujo texto ou cartão de link aponte para um post do Vox.
7. **Mídia:**
   - imagens vêm do PDS da pessoa (`getBlob`), passam pelo pipeline da mídia v2 e contam no teto do aparelho;
   - vídeo fica como link para o original nesta versão;
   - se o PDS falhar, o post vem com texto e link.
8. **Apagar na origem: preferência da pessoa, nas configurações.**
   - Ao abrir o app, o Vox confere os posts trazidos recentemente (`getPosts`, até 100 por abertura) e nota os que sumiram do Bluesky.
   - O que acontece depois é a preferência dela, em Configurações, na conta vinculada do Bluesky: "Quando eu apagar um post no Bluesky":
     - **Perguntar a cada vez** (padrão): "Você apagou este post no Bluesky. Apagar no Vox também?";
     - **Apagar no Vox também**;
     - **Manter no Vox**.
   - Apagar no Vox usa a retração assinada, o mesmo caminho de apagar qualquer post, e chega às cópias de quem segue. O Vox nunca apaga contra a preferência escolhida.
9. **Preservação pelas cópias de quem segue.**
   - O post trazido replica como qualquer post: quem segue a pessoa guarda cópia (a Full, pelo ADR-029) e a serve a outros seguidores. Essa é a preservação e o backup.
   - **Caixa preta, como direção:** a cópia guardada para os outros não tem tela para abrir, editar ou exportar; quem guarda só a vê pelo feed. No navegador não dá para esconder de verdade os dados de quem tem o aparelho, então a caixa preta é ausência de manuseio, não segredo.
   - Arweave, se houver cartório, recebe só o texto e o hash da mídia (ADR-029). A mídia não vai.
10. **No app** (lote pequeno, depois de aceito, atrás de flag de laboratório):
    - tela "Trazer do Bluesky" nas contas vinculadas;
    - texto honesto: o que vem, o que não vem, e o que acontece quando a pessoa apaga lá (conforme a preferência do item 8);
    - a preferência de apagar na origem (item 8) na conta vinculada do Bluesky;
    - nenhum servidor novo e nenhum segredo novo.

## 4. Consequências e gatilho para rever

- **Ganho:** a pessoa entra no Vox sem mudar de hábito. O perfil já nasce com conteúdo, e ela passa a ter um arquivo assinado do que publica, guardado pelas cópias de quem a segue.
- **Limites:**
  - só roda com o app aberto;
  - só o Bluesky;
  - vídeo só como link;
  - depende da API pública do Bluesky. Se ela mudar, a fila para, mas nada do que já veio se perde.
- **Ruído:** contido pela fila e pelo destino padrão no perfil.
- **Confiança:** a assinatura do Vox prova que **esta chave** afirma ter publicado o post. O vínculo entre a chave e a conta do Bluesky vem do login feito no aparelho, e **outras pessoas ainda não conseguem conferir esse vínculo** (ver §5).
- **Rever quando:**
  - a API pública do Bluesky deixar de liberar CORS ou passar a exigir login; **ou**
  - no piloto, a fila for ignorada por mais da metade de quem vinculou a conta. Nesse caso, avaliar um "trazer sempre" só para o perfil.

## 5. Em aberto

- **Prova pública do vínculo:** gravar no repositório da pessoa no Bluesky um registro com a chave pública do Vox, para terceiros conferirem nos dois sentidos. Falta conferir se o escopo do login permite gravar uma coleção própria, e definir o formato.
- **Conferência automática do original:** checar o `cid` contra o PDS (`getRecord` com prova) ao receber um post trazido.
- **Fediverso direto** (API ou RSS do Mastodon) e contas da ponte do Bridgy Fed: sem login, não há prova de dono. Fica para um ADR próprio, como o ADR-028 §5 já pede.
- **Nó Vox Populi buscando e deixando na fila**, sem assinar.
- **Caixa preta na spec da replicação por grau:** separar, no armazenamento, as cópias guardadas para os outros do que a pessoa salvou ou fixou, e tirar delas qualquer tela de manuseio.
