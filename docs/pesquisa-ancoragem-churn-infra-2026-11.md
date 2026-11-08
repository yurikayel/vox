# Pesquisa: ancoragem, churn P2P e "usuário como infraestrutura" (nov/2026)

> **Status:** pesquisa · **Owner:** mantenedor / revisor · **Coleta:** 2026-11-08
> **Não substitui o [ROADMAP.md](./ROADMAP.md)** nem é parecer jurídico. Continua a [pesquisa-complementar-2026-11.md](./pesquisa-complementar-2026-11.md).
> **Níveis de evidência:** **P** = fonte primária lida, ou medição feita por nós hoje (endpoint, `curl`) · **S** = secundária (escritório de advocacia, imprensa, blog de fornecedor) · **I** = inferência ou modelo nosso · **—** = não encontrado.

## Premissas desta rodada (leia antes)

O pedido cita **R1–R9**, mas esses IDs **não existem no repositório**. Busquei em `docs/`, ADRs, specs e no histórico. Os significados abaixo foram deduzidos dos parênteses do próprio pedido:

| ID | Leitura adotada | Base no repo |
|---|---|---|
| R1 | Sincronização atual WANT/HAVE da malha | `peers.js`, `cache-node.js` |
| R2 | [ROADMAP.md](./ROADMAP.md) | — |
| R4 | IPv6/CGNAT das operadoras | [complementar A2](./pesquisa-complementar-2026-11.md#a-cota-do-turbo-e-ipv6) |
| R6 | [cache-manifest-v0](./cache-manifest-v0.md) | spec |
| R7 | [ADR-009](./adr/009-multi-gateway-graphql-corroboration.md), corroboração multi-gateway | ADR |
| R8 | Camadas Passivo / Ativo / Apoiador / Steward e Pacto Vox (nó leve ativo por padrão, 50 MB/dia) | [COMPLIANCE-BR](../COMPLIANCE-BR.md), [brainstorm auto-escala](./brainstorm-auto-escala-organica-2026-10.md) |
| R9 | Portões G1 / G2 / G3 | [backlog de lançamento](./backlog-lancamento-publico-2026-11.md) |
| R3, R5 | **Não identificados.** Não foram auditados. | — |

Se o documento-fonte de R1–R9 existir fora do repo, a auditoria da §7 precisa ser conferida contra ele.

---

## A. Ancoragem criptográfica e LGPD

### A.1 Especificações primárias

| Esquema | Formato | Tamanho da prova de inclusão | Verificar em JS puro no navegador? | Nível |
|---|---|---|---|---|
| **OpenTimestamps** | Arquivo `.ots`: árvore de operações (`sha256`, `append`, `prepend`) que leva do digest até uma atestação Bitcoin (altura do bloco). | Variável: ~100 níveis de operação em provas reais (`bitcoin.pdf.ots` tem 101). A versão compacta "miniOTS" tem ~280 B em base58. Não achei uma distribuição de tamanhos típica. | **Parcial.** O caminho de hashes se verifica com WebCrypto. A atestação exige o **cabeçalho do bloco Bitcoin**, o que significa confiar numa API como esplora/blockstream, ou embarcar cabeçalhos SPV. | P (limites do parser, via otskit) · S (tamanho) |
| **Nostr NIP-03** | `kind:1040`, tags `e` (alvo) e `k` (kind), `content` = `.ots` em base64 com **uma** atestação Bitcoin e nenhuma pendente. | O tamanho do `.ots` mais ~33% do base64. | Igual ao OTS. | **P**. O NIP está marcado hoje como **`unrecommended`: "vulnerable to one specific attack, needs update"**. O ataque não está descrito no texto. |
| **Certificate Transparency** (RFC 6962 → **RFC 9162**, Experimental, obsoleta a 6962) | Folha `HASH(0x00‖d)`, nó `HASH(0x01‖L‖R)`. A árvore não precisa ser cheia. STH v2 = `log_id` + `{timestamp, tree_size, root_hash, ext}` + assinatura. | **⌈log₂ n⌉ × HASH_SIZE**. Com SHA-256: 1 mil folhas → 320 B; 1 milhão → 640 B. A consistência usa ≤ ⌈log₂ n⌉+1 nós. | **Sim.** Só SHA-256 e verificação de assinatura, ambos no WebCrypto. | P |
| **Merkle Mountain Range** | Série de árvores binárias perfeitas em pós-ordem. A raiz é o "bagging" dos picos. Os IETF drafts `draft-bryce-cose-merkle-mountain-range-proofs` e `...-receipts-mmr-profile-03` (set/2026) trazem recibos COSE/CBOR. | Caminho até o pico (≤ log₂ n) mais os outros picos (≤ log₂ n): no pior caso ~2·log₂ n × 32 B ≈ **1,3 KB para 1 milhão**. Append-only **sem reescrever** as provas antigas. | **Sim**, só hashes. Há pacote npm, mas a regra do Vox é não adicionar dependência sem ADR. | P (draft, não RFC) · S (limite) |
| **ANS-104** (Standard) | Bundle = contagem (32 B) + N×(tamanho 32 B, id 32 B) + DataItems. DataItem = tipo de assinatura (2 B) + assinatura + owner + target/anchor opcionais + tags Avro + dados. **Aninhamento**: um bundle pode ser o `data` de um DataItem. | **Não existe prova de inclusão compacta.** O id é derivado da assinatura. Para provar a inclusão é preciso o DataItem inteiro (verificar a assinatura) e o header do bundle pai. Com assinatura Arweave (RSA-4096), o overhead fixo é ~1 KB (512 + 512); com Ed25519, ~100 B. | **Sim** para a assinatura do DataItem: o Vox já faz isso em `ans104.js`. Provar que o bundle foi minerado (chunk/`data_root`) **não** é viável sem confiar no gateway. | P |

**Conclusão A.1 (I).** Para o Vox, o formato que melhor equilibra prova pequena, verificação em JS puro e append-only é **MMR, ou árvore no estilo RFC 9162, de raízes diárias**: a raiz vai para o Arweave e as provas circulam na malha. OTS/NIP-03 acrescenta a âncora Bitcoin, mas depende de um explorador de terceiros e o NIP está marcado `unrecommended`. Não deve ser caminho principal.

### A.2 Governança de ancoragem (evitar âncoras concorrentes ou falsas)

| Mecanismo | Como funciona em quem já usa | Encaixe no Vox | Nível |
|---|---|---|---|
| **Assinatura M-de-N** sobre a raiz | Uma STH é assinada por um log só. Em multi-log, o cliente exige SCTs de ≥ 2 logs independentes (política do Chrome). | Já existe o desenho de perfil coletivo M-de-N ([ADR-005](./adr/005-collective-profile-m-of-n.md)). A raiz diária vale com M de N stewards. | P (RFC 9162) · I |
| **Regra de âncora canônica** | Cadeia `Previous-Manifest` (como no cache-manifest-v0). Entre duas âncoras para o mesmo dia, vale a que tem mais assinaturas válidas e, no empate, a de menor `txId`. | Determinística e verificável offline. | I |
| **Log append-only com prova de consistência** | Na RFC 9162, a consistência prova que a versão nova estende a antiga. | Detecta fork: duas raízes para o mesmo `tree_size` assinadas pelo mesmo conjunto são **equivocação**, uma prova publicável de má-fé. | P · I |
| **Disputa** | Em CT, monitores e "gossip" de STHs entre clientes detectam split-view. | A malha já faz gossip. Basta propagar `(dia, raiz, assinaturas)` e alertar quando houver divergência. | P (conceito) · I |

### A.3 LGPD × hashes e raízes Merkle

| Pergunta | Resposta | Fonte | Nível |
|---|---|---|---|
| A diretriz EDPB 02/2025 (blockchain) é final? | **Sim.** A versão 2.0 foi adotada em **07/07/2026**, com mudanças pequenas em relação ao rascunho de abr/2025. Recomenda dados pessoais **fora da cadeia** e "only hashes or proofs" dentro dela, além de governança de papéis e DPIA. Na versão final, validadores puramente técnicos podem **não** ser controladores. | [Slaughter and May, 21/07/2026](https://thelens.slaughterandmay.com/post/102ndb2/edpb-finalises-guidelines-on-gdpr-and-blockchain) · [Dudkowiak](https://www.dudkowiak.com/blog/blockchain-and-the-gdpr-the-edpbs-final-guidelines-for-the-fintech-and-crypto-sectors/) | S (o PDF da EDPB não foi lido) |
| Hash de dado pessoal é dado pessoal? | **Em regra, sim: é pseudonimização, não anonimização.** Isso vale para o WP29 (Parecer 05/2014), para as Diretrizes EDPB 01/2025 (pseudonimização) e para a minuta do Guia de Anonimização da ANPD (2024), que lista "função hash" entre as técnicas de pseudonimização. **Nuance do TJUE C-413/23 P (EDPS × SRB, 04/09/2025):** para um **destinatário** sem meios razoáveis de reidentificar, o dado pseudonimizado pode não ser pessoal. Para o **emissor**, continua sendo. | [ANPD — Nota Técnica 6 (consulta)](https://www.gov.br/anpd/pt-br/acesso-a-informacao/participacao-social/outras-acoes/ts-01-2024-nota-tenica-6-de-abertura.pdf/@@display-file/file) · [Jones Day sobre SRB](https://www.jonesday.com/de/insights/2025/09/cjeu-clarifies-scope-of-personal-data-in-edps-v-srb-decision) | P (ANPD, minuta) · S (TJUE) |
| E uma **raiz Merkle** de muitos posts? | Inferência: uma raiz sem as folhas é um compromisso. Quem não tem a folha nem o *salt* não consegue reidentificar. É o caso mais forte de "não pessoal para terceiros" pós-SRB. Ela volta a ser vinculável **se** a folha (post e autor) circular. Com **folha salgada** (`H(salt‖post)`) e o *salt* guardado fora da cadeia, apagar o *salt* e a folha corta o vínculo. | — | I ⚖️ |
| Art. 18 da LGPD (eliminação) | A ANPD **não** se manifestou sobre blockchain (já registrado na rodada anterior). Desenho defensável: **só raízes na cadeia**, folhas e *salts* na malha (efêmeros) e eliminação = apagar a folha e o *salt*. Isso é compatível com o REV-11 ("efêmero por padrão"). **Posts publicados inteiros no Arweave continuam sendo o risco principal**, e a raiz não resolve isso. | — | I ⚖️ |

### A.4 Cota grátis do Turbo × raiz diária (modelo)

**Medido hoje** em `upload.ardrive.io/info` (P): `freeUploadLimitBytes: 107520` (105 KiB) e `freeTier: {lifetimeBytes: 10485760, ipBytes: 10485760, maxItemBytes: 107520}`.

Seja *s* o tamanho de um DataItem de âncora. Com assinatura Arweave, o overhead é ~1.024 B; tags e corpo (raiz de 32 B, data, contagem, raiz anterior, assinaturas M-de-N) somam ~0,5 KB. Logo *s* ≈ **1,5 KiB**. Com Ed25519, *s* ≈ 0,6 KiB.

- Âncoras que cabem na cota vitalícia de uma carteira: **10 MiB ÷ 1,5 KiB ≈ 6.990**.
- **Uma âncora por comunidade por dia, numa carteira só:** dura 6.990 ÷ *N* dias. *N* = 1 → ~19 anos; *N* = 10 → ~1,9 ano; ***N* = 100 → ~70 dias**.
- **Uma âncora agregada por dia** (MMR das raízes de todas as comunidades, *N* folhas): o tamanho fica quase independente de *N*, ~19 anos para qualquer *N*. **Esta é a recomendação.**
- **Unificar com o cache-manifest-v0 (R6) levando `pins` no corpo:** com 512 pins de ~110 B, o manifesto tem ~56 KB, cabe nos 105 KiB, mas a cota acaba em ~190 dias com *N* = 1. **Unificar só pela raiz**: o manifesto diário publica apenas o `Pins-Root` (que já existe na spec como tag opcional) mais a raiz do dia; a lista de `pins` circula na malha com prova de inclusão.
- **Pagando, em vez de usar a cota:** preço medido hoje em `payment.ardrive.io/v1/rates` (P) é **US$ 68,85/GiB ≈ R$ 378,94/GiB**, ou ~R$ 0,37/MB, já com a taxa do Turbo. 365 âncoras de 1,5 KiB = 548 KiB/ano ≈ **US$ 0,04 por ano**. O custo é desprezível; **o gargalo é o meio de pagamento** (ver E.2), não o preço.

---

## B. Churn, WebRTC móvel e piso de infraestrutura

### B.1 Disponibilidade sob churn (literatura)

| Achado | Fonte | Nível |
|---|---|---|
| IPFS: **87,6% das sessões < 8 h** e só 2,5% > 24 h. A mediana varia de ~24 min (Hong Kong) a cerca do dobro (Alemanha). | [Trautwein et al., "Design and Evaluation of IPFS" (SIGCOMM'22)](https://arxiv.org/pdf/2208.05877) | P |
| Medianas de sessão em P2P clássico vão de 1 min a 1 h, conforme o estudo. A medição passiva subestima as sessões, e é preciso medir pelo menos uma semana. | [Stutzbach & Rejaie, "Understanding Churn" (TR-2005-003)](https://www.cs.uoregon.edu/Reports/TR-2005-003.pdf) | P |
| Churn de **pares WebRTC em navegador** (P2P CDN): **sem estudo aberto encontrado.** | — | — |

**Modelo (I).** Se cada réplica fica online com probabilidade independente *p*, a disponibilidade com *r* réplicas é 1 − (1 − *p*)^*r*. Num celular com o PWA aberto ~1 h/dia, *p* ≈ 0,04. Para 99% de disponibilidade são precisas *r* ≈ ln(0,01) / ln(0,96) ≈ **113 réplicas**. Num nó na tomada (*p* ≈ 0,95), **2 réplicas dão 99,75%**. A malha de celulares serve como **acelerador** (cache quente enquanto as pessoas estão online), não como **persistência**.

### B.2 Piso real de "sempre ligado" em protocolos comparáveis

| Protocolo | O que é sempre ligado | Nível |
|---|---|---|
| IPFS | *Pinning services* e nós próprios. Sem pin, o dado some quando os pares saem (B.1). | P (paper) |
| Nostr | **Relays**. O modelo *outbox* (NIP-65, `kind:10002`) manda o cliente ler o autor nos relays de **escrita** dele, com 2–4 por categoria. | P (NIP-65) |
| Secure Scuttlebutt | *Pubs* e *rooms*. A spec Rooms 2.0 não foi lida nesta rodada. | — |
| Briar | *Briar Mailbox*, um celular velho na tomada. O projeto entrou em manutenção em jul/2026 (rodada anterior, V7). | P (anterior) |
| Holochain | Nós de bootstrap e proxy. Não lido nesta rodada. | — |
| Hypercore/Pear | ***Blind peers***: servidores sempre ligados que replicam Hypercores **sem a chave** para ler (`blind-peering` v2.10.x, `blind-peer` v3.16.x). | P ([docs.pears.com](https://docs.pears.com/p2p/how-to/blind-peering/keep-data-available-with-blind-peering.md)) |
| Earthstar | ***Replica servers*** (deploy no Fly.io), que só sincronizam *shares* conhecidas de antemão. A v11 roda sobre Willow (beta). | P ([replica-server](https://github.com/earthstar-project/replica-server)) |
| Willow | Protocolo multi-writer, com transporte WebSocket ou em memória (willow-js). Não define nó sempre ligado: herda do app. | P |

**Padrão comum (I):** **todo** protocolo P2P em produção tem um piso de nós sempre ligados por grupo ou por usuário. O caso mais próximo do Vox é o **blind peer** (o servidor guarda sem poder ler) mais o **outbox** (cada autor declara onde publica).

### B.3 WebRTC em navegadores móveis

| Pergunta | Resposta | Nível |
|---|---|---|
| Máximo de `RTCPeerConnection` por página | **Não há número documentado** pelo Chromium nem pelo WebKit. `RTCSctpTransport.maxChannels` informa em tempo de execução o limite de DataChannels por conexão; o teto teórico é 65.534. | P (MDN) · — (PCs) |
| Bateria | Sem medição pública 2024–2026 encontrada. | — |
| iOS em segundo plano | WebRTC e Web Audio **são suspensos** ao bloquear a tela ou sair do Safari ([fórum da Apple, thread 774239](https://developer.apple.com/forums/thread/774239)). Há relatos de que um DataChannel sem trilha de áudio cai em segundo plano ([thread 799259](https://developer.apple.com/forums/thread/799259)). | S (fórum de desenvolvedores, sem resposta da Apple) |
| Android Chromium em segundo plano | A aba é congelada pelo *freezing* e pelo *intensive throttling*. O Periodic Background Sync só existe no Chromium, com PWA instalado (rodada anterior, V8). | P (anterior) |
| Taxa de falha de STUN/ICE | O número mais citado é que **~20–25% das sessões precisam de TURN** (telemetria UMA do Chrome, **via blogs de fornecedores**). CGNAT móvel costuma ser NAT simétrico. **Não há número separado para móvel nem para o Brasil.** | S |
| Cruzamento com IPv6 (R4) | 82–91% de IPv6 nas três grandes operadoras móveis (APNIC, rodada anterior). Par IPv6 ↔ IPv6 não passa por NAT, mas o **firewall do roteador ou do celular** ainda pode bloquear tráfego de entrada sem solicitação. Inferência: IPv6 **reduz** a necessidade de TURN entre dois celulares nas grandes operadoras, mas não a elimina, e não ajuda quando o outro lado está em IPv4/CGNAT regional. | I |

**Recomendação:** medir em produção. Registrar via `getStats()` o tipo do par de candidatos selecionado (`host` / `srflx` / `relay`) e a família IP, por ASN. Isso fecha a lacuna sem depender de blog.

### B.4 Piso mínimo de infraestrutura × portões (R9) — modelo

Premissas (I): conteúdo ativo de ~1 MB por membro por mês (texto, miniaturas e áudio comprimido); nó sempre ligado com *p* ≈ 0,95; meta de 99% de disponibilidade do conteúdo da comunidade e de 99,9% da sinalização.

| Comunidade | Stewards sempre ligados (disponibilidade) | Armazenamento por steward | Saída de banda (ordem de grandeza) | Sinalização / TURN | Portão |
|---|---|---|---|---|---|
| **30** | **2** (em casas ou redes diferentes) | ~30 MB/mês | < 5 GB/mês | 1 nó de sinalização + fallback. TURN opcional | **G1** (piloto de 10–30) |
| **300** | **2–3** | ~300 MB/mês | ~10–50 GB/mês | 2 nós independentes (REV-01). TURN com orçamento (B9) | **G2** (~300) |
| **3.000** | **3–5**, mais pelo menos 1 em datacenter | ~3 GB/mês | ~100–500 GB/mês | Sinalização sem sleep (Durable Object) + TURN pago acima de 1.000 GB/mês | **G3** (público) |

**Confronto com os portões:**
- **G1:** viável hoje **se** 2 stewards existirem de fato (celular velho na tomada ou Raspberry Pi).
- **G2:** exige o REV-01 (2º nó de sinalização) resolvido.
- **G3:** **não** fecha só com voluntários na tomada. Precisa de pelo menos um nó em datacenter, o que contradiz um "custo zero central" literal.

---

## C. Reconciliação, armazenamento local, indexadores e CRDTs

### C.1 Custo de sincronização (R1)

Sejam *n* = itens no conjunto, *d* = diferença e IDs de 32 B.

| Método | Banda | Rodadas | Complexidade de implementação | Nível |
|---|---|---|---|---|
| **WANT/HAVE ingênuo** (lista de IDs) | ~32·*n* B por sincronização (10 mil itens = 320 KB), **independe de *d*** | 1–2 | Trivial (é o atual) | I |
| **Negentropy / RBSR** (NIP-77) | ~O(*d*·log *n*). Fingerprints de 16 B por faixa; sem diferença, ~1 faixa | log_B(*n*)/2: 1 milhão de itens com B = 16 → **3 rodadas** | Média. A spec V1 é curta (anexo do NIP-77), com varints e ordenação por (timestamp, id) | P ([NIP-77](https://github.com/nostr-protocol/nips/blob/master/77.md), [logperiodic.com/rbsr](https://logperiodic.com/rbsr.html)) |
| **Bloom filter** | ~1,2 B por item com 1% de falso positivo (~12 KB para 10 mil). **Falsos positivos escondem itens que faltam** | 1 | Baixa | P (crítica em rbsr) · I (número) |
| **IBLT** | O(*d*), mas exige estimar *d* antes. Se a tabela lota, **falha inteira** e recomeça | 1 (+ recomeço) | Alta | P (crítica em rbsr) |
| **Rateless IBLT** | O(*d*) sem estimar | 1 fluxo | Alta, pouca implementação madura | S |

**Recomendação (I):** RBSR/Negentropy por comunidade, ordenado por `(issuedAt, id)`. Ele casa com o NIP-77, que permite sincronizar com relays Nostr usando o mesmo código, e trocaria o WANT/HAVE quando os conjuntos passarem de ~1.000 itens. Abaixo disso, a lista de IDs é mais simples e custa pouco.

### C.2 IndexedDB × SQLite WASM com OPFS

| Ponto | Resposta | Nível |
|---|---|---|
| Cotas | Chromium: até **60% do disco** por origem e 80% no total. Safari (macOS 14+ e iOS 17+): **~60%** para o app de navegador, e o app da Tela de Início usa a mesma cota. Firefox: 10% / 10 GiB em melhor esforço, 50% se persistente. | P ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) |
| Evicção | LRU por origem e **tudo ou nada** (IndexedDB, Cache e OPFS juntos). Origens persistentes são puladas. **Safari: apaga o storage criado por script após 7 dias de uso sem interação** quando a prevenção de rastreamento está ativa. | P |
| `persist()` | Chromium e Safari **decidem sozinhos**, pelo histórico de interação, sem prompt. O Firefox pergunta. | P |
| Desempenho em celular de entrada | **Nenhum benchmark controlado encontrado.** Relatos isolados mostram SQLite/OPFS mais rápido em consultas paginadas. O Safari < 17 tem um bug que quebra o VFS `opfs` (a saída é o `opfs-sahpool`). O SQLite WASM pesa ~1 MB. | S |

**Recomendação (I):** manter o IndexedDB, que não exige dependência e cuja evicção é a mesma do OPFS. Medir antes de migrar, no aparelho-alvo. Chamar `persist()` depois de uma interação significativa (o REV-14 já prevê).

### C.3 Gateways GraphQL do Arweave (R7) — medido hoje (P)

| Gateway | Status | Página máxima (`first`) | Limite de taxa | Observação |
|---|---|---|---|---|
| `arweave.net/graphql` | 200 | **100** (pedi 1000, vieram 100) | 40 requisições seguidas sem 429. A doc antiga fala em 600 a cada 5 min por IP | O cursor é do formato AR.IO (`member=…ans104@1.0`) |
| `turbo-gateway.com/graphql` | 200 | **1000** | Não testado em rajada. O download tem 5 GB grátis por visitante (rodada anterior) | Indexa os itens `vox-brasil` |
| `arweave-search.goldsky.com/graphql` | **307 → `arweave.net/graphql`** | — | — | **O Goldsky virou alias do arweave.net**: não é uma testemunha independente |
| `ar-io.dev/graphql` | 200 | — | — | **0 resultados para `App-Name: vox-brasil`**: não indexa os itens do Vox. Uma consulta ampla devolveu "upstream error" |
| `permagate.io/graphql` | 200 | — | — | 0 resultados para `vox-brasil` |

**Consequências para o ADR-009 e o cache-manifest:**
1. Na prática só existem **2 testemunhas independentes** (turbo e arweave.net). O ADR deve dizer isso e **não** contar o Goldsky como terceira.
2. A paginação tem de respeitar `first ≤ 100` no arweave.net. Um cursor de um gateway **não serve** no outro, porque os formatos são diferentes.
3. Gateways AR.IO genéricos **não** indexam tudo. Corroborar "por ausência" num gateway que não indexa o `App-Name` gera falsa omissão. O ADR deve sondar a cobertura (consultar uma TX conhecida) antes de usar um gateway como testemunha.

### C.4 CRDTs × eventos assinados imutáveis

| Biblioteca | Bundle (crdt-benchmarks, B4) | Modelo bizantino |
|---|---|---|
| Yjs 13.6 | **84 KB, 25 KB gzip** | Não é BFT: um par malicioso pode injetar operações que divergem ou inflam o histórico |
| Loro 0.15 (WASM) | 1,43 MB, 533 KB gzip | Idem |
| Automerge 2.1 (WASM) | 1,70 MB, 591 KB gzip | Idem. Há trabalho acadêmico de Kleppmann sobre CRDT tolerante a falhas bizantinas, ainda fora das bibliotecas |

Fonte: [dmonad/crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks) e [loro.dev/docs/performance](https://loro.dev/docs/performance) (P). A memória do WASM **não é medida** de forma confiável, segundo os próprios autores.

**Recomendação (I):** para **votos e estado de governança, manter eventos assinados imutáveis**, com contagem determinística por `tallyCivicVotes` (último voto por autor). É auditável, não tem dependência e é tolerante a par malicioso, porque cada evento é verificado e um voto inválido é descartado. CRDT só faz sentido em **edição colaborativa** de texto (rascunho de proposta). Mesmo aí, o Yjs é o único com bundle compatível com a meta de peso do PWA, e ele exige ADR.

---

## D. UX de contribuição, custo de dados e base legal

### D.1 Aceitação de compartilhar banda e armazenamento

| Caso | Achado | Nível |
|---|---|---|
| Tor Snowflake | Voluntários **por opt-in explícito** (extensão, página ou, desde **ago/2026**, o app Android "Snowflake Volunteer"). Uso diário estimado em ~35 mil pessoas; ~146 mil IPs ativos por dia segundo a imprensa. | P ([blog do Tor](https://blog.torproject.org/snowflake-volunteer-standalone-app-to-help-people-bypass-censorship/)) · S (números) |
| Peer5 / Streamroot / Brave / Storj / Filecoin / Helium | **Não pesquisado a fundo nesta rodada.** Ver "Não encontrado". | — |

### D.2 Custo de 50 MB/dia (~1,5 GB/mês) no pré-pago

Preços de jun/2026 (S: [MelhorPlano](https://melhorplano.net/planos-de-celular/plano-pre-pago/melhores-planos-pre-pagos), **não** conferidos nos sites das operadoras nem na Anatel):

| Plano | Preço | Custo de 1,5 GB | % da franquia |
|---|---|---|---|
| Vivo Pré 4 GB | R$ 17 | ~R$ 6,40 | **37%** |
| Claro Prezão 5 GB / 15 dias | R$ 15 | ~R$ 4,50 | 30% (da franquia quinzenal) |
| TIM Pré Xip 6 GB | R$ 20 | ~R$ 5,00 | 25% |
| Claro / Vivo / TIM, ~15 GB / mês | R$ 30 | ~R$ 3,00 | 10% |
| Custo médio por GB no pré | R$ 2,12 (Claro) a R$ 3,03 (Vivo) | R$ 3,20 a R$ 4,50 | — |

**Conclusão (I):** 50 MB/dia em dados móveis custa ao usuário de entrada **entre um quarto e mais de um terço da franquia**. O teto do Pacto (R8) no 4G **não é aceitável como padrão**. Padrão: **servir só no Wi-Fi**, e no móvel **teto de 0 a 5 MB por dia**, só se a pessoa ativar.

### D.3 Base legal do "nó leve ativo por padrão" (R8)

| Ponto | Resposta | Nível |
|---|---|---|
| Legítimo interesse (art. 7º, IX) | O guia da ANPD (fev/2024) pede um teste de três fases (finalidade, necessidade, balanceamento) e **legítima expectativa** do titular. No caso Meta/IA (2024), a ANPD entendeu que um uso **não esperado** dos dados não se sustenta. | S ([Mattos Filho](https://www.mattosfilho.com.br/unico/anpd-legitimo-interesse-lgpd/)) · P (glossário da ANPD) |
| Aplicação ao Vox | Servir blobs **públicos** com o app aberto e no Wi-Fi é defensável por legítimo interesse **se** for informado no onboarding e houver opt-out. **Gastar a franquia móvel** do usuário dificilmente passa no teste de expectativa. Ali o caminho é **consentimento (opt-in)**. O IP do nó, visível aos pares, é dado pessoal tratado. | I ⚖️ |
| Padrões de interface | Medidor "você ajudou com X MB hoje", padrão por tipo de rede (Wi-Fi sim, móvel não), pausa com um toque e texto sobre efemeridade ("isso some da malha em N dias; no Arweave, fica para sempre"). | I |

---

## E. Preço do Arweave, pagamento sem extensão e financiamento

### E.1 Preço

**Medido hoje (P):** `arweave.net/price/1073741824` = 14,41 AR por GiB. Com o AR a US$ 3,11 (CoinGecko), isso dá ~**US$ 44,8/GiB na rede**. Pelo **Turbo**: **US$ 68,85/GiB** (R$ 378,94), com taxa fixa de 6.439.594 winc por DataItem. A taxa embutida do Turbo, portanto, fica em ~50% sobre o preço da rede, com o câmbio de hoje.

**Histórico (S):** a página de preços do ArDrive (2023) citava faixas de US$ 3–8/GB e depois de US$ 30–45/GB. Não achei série oficial. O preço é **atrelado a USD por byte** com ajuste dinâmico, então ele varia menos que o token.

### E.2 Credit Sharing e x402 num PWA sem extensão

- **x402 (P, [docs.ar.io](https://docs.ar.io/build/upload/x402-uploading-to-turbo/)):** usa `token: "base-usdc"` e `X402Funding({ maxMUSDCAmount })` como teto. Os exemplos autenticam com **chave privada EVM**. **Nada documenta passkey ou carteira embarcada.**
  - Inferência: dá para rodar num PWA puro **com uma chave EVM gerada no aparelho** (como a chave Vox), mas **alguém precisa colocar USDC na Base nela**, o que exige uma corretora ou on-ramp com KYC e é inviável para o público-alvo.
  - Passkey (P-256) não assina transações EVM (secp256k1) sem uma carteira de *smart account* (ERC-4337), que seria dependência nova.
- **Credit Sharing (P, rodada anterior):** é o caminho que **não exige que o usuário tenha cripto**. O steward ou a associação compra créditos (cartão ou cripto) e delega a membros, com limite, prazo e revogação.
- **Recomendação (I):** a âncora diária (A.4) e os posts cívicos de consenso são pagos por **Credit Sharing do steward**. O x402 fica para stewards que já usam USDC. Pagar o Arweave de dentro do PWA, direto pelo usuário, **não** deve entrar no roadmap.

### E.3 Financiamento coletivo de infraestrutura

| Modelo | Achado | Nível |
|---|---|---|
| Relay Nostr pago | `nostr.wine`: leitura grátis, escrita com taxa única de 18.888 sats, e o filtro pago custa 5–10 mil sats/mês. Operadores relatam que **a maioria dos relays não cobre os custos**. | S |
| Federações (Mastodon) e cooperativas de pinning | Não pesquisado nesta rodada. | — |
| Já registrado | GitHub Sponsors com Brasil e 0% de taxa; NLnet Restack com prazo em 03/01/2027 (rodada anterior). | P (anterior) |

---

## F. Responsabilidade de quem opera nó ⚖️

| Jurisdição | Precedente | Nível |
|---|---|---|
| Áustria, 2014 (caso Weber) | Operador de **exit node Tor** condenado em 1ª instância como partícipe na distribuição de material de abuso infantil, com pena suspensa. Comentaristas atribuem a condenação a **declarações do próprio réu** incentivando esse uso, e a tese de *mere conduit* ficou sem decisão. | S ([Husovec](https://husovec.eu/2014/07/austrian-court-sentenced-tor-exit-node-html/)) |
| Alemanha, OLG Düsseldorf (20 U 17/16) | Exit node pode responder civilmente (*Störerhaftung*). O tribunal entendeu ser **razoável exigir o bloqueio de torrent** no nó. | S ([Ferner Alsdorf](https://www.ferner-alsdorf.de/haftung-tor-exit-node/)) |
| EUA | Um operador de exit node escapou de uma ação de pirataria (Dallas Buyers Club), mas o fundamento não foi lido. *Cobbler Nevada* (9º Circuito, 2018: o titular do IP sozinho não basta) **não foi confirmado nesta rodada**. | S / — |
| Brasil | **Não encontrei precedente** sobre quem semeia torrent, opera relay Tor ou roda nó distribuído. | — |

**Diferença de risco por camada (I ⚖️), com a tese do STF (rodada anterior), os Decretos 12.975 e 12.976/2026 e o ECA Digital:**

| Camada (R8) | O que faz | Exposição provável | Onde o parecer (REV-12) é indispensável |
|---|---|---|---|
| **Passivo** | Só lê | Igual a qualquer leitor | — |
| **Ativo** | Serve blobs **públicos** em cache, com o app aberto | Análogo a *mere conduit* / cache. **Não** curadoria. O IP aparece aos pares | Se servir cache conta como "interferir no fluxo" para a cláusula residual dos embargos |
| **Apoiador** | Serve com mais banda (`commOnly`) | Igual ao Ativo, com volume maior | Igual |
| **Steward** | Sempre ligado, pina conteúdo (cache-manifest), assina raízes, modera a lista de ocultação | **O mais exposto:** escolhe o que pinar, então há curadoria e, num caso extremo, ciência do ilícito. O análogo europeu é o OLG Düsseldorf (dever de bloquear) | **Sim:** dever de atender notificação extrajudicial, ECA Digital, e se o steward é "provedor de aplicação" |

**Mitigação técnica (I):** o steward pina **só** o que está no manifesto assinado da comunidade e respeita a lista de ocultação (B5 da rodada anterior). O nó Ativo **nunca** serve conteúdo que está na lista de ocultação. Isso aproxima o desenho do precedente alemão: há um bloqueio razoável disponível e ele é usado.

---

## 7. Auditoria das premissas R1–R9

| ID | Premissa (como lida) | Veredito | Correção |
|---|---|---|---|
| R1 | WANT/HAVE basta | **Vale até ~1.000 itens por comunidade** | Acima disso, RBSR (C.1). Novo item: **V-R1** |
| R4 | CGNAT impede P2P no celular | **Parcialmente desatualizada** | 82–91% de IPv6 nas grandes operadoras. Medir com `getStats` antes de concluir (B.3) |
| R6 | cache-manifest pode carregar a raiz diária | **Vale só pela raiz** | `pins` no corpo esgota a cota em ~190 dias. Publicar `Pins-Root` + raiz agregada (A.4) |
| R7 | Multi-gateway dá corroboração | **Superestimada** | Só 2 testemunhas reais. O Goldsky é alias do arweave.net. Gateways AR.IO genéricos não indexam o Vox (C.3) |
| R8 | Nó leve ativo por padrão, 50 MB/dia | **Incorreta para o 4G** | Padrão só no Wi-Fi. Móvel por opt-in com teto baixo. A base legal muda com a rede (D.2, D.3) |
| R8 | Usuário celular como infraestrutura | **Incorreta como persistência** | Serve como acelerador. A persistência exige ≥ 2 nós sempre ligados por comunidade (B.1, B.4) |
| R9 | G1 a G3 sem infra paga | **G1 e G2 viáveis, G3 não** | G3 precisa de pelo menos 1 nó em datacenter, de sinalização sem sleep e de TURN com orçamento (B.4) |
| — | NIP-03 / OTS como âncora | **Rebaixar** | NIP-03 está `unrecommended` (A.1) |
| — | Hash na cadeia resolve a LGPD | **Só para raízes salgadas** | Posts inteiros no Arweave continuam sendo dado pessoal imutável (A.3) |

### Recomendações (para virar linhas no ROADMAP)

| Proposta | O quê | Depende de |
|---|---|---|
| **V-A1** | Raiz diária **agregada** (MMR) de todas as comunidades, com folhas salgadas, assinada M-de-N por stewards e paga por Credit Sharing | ADR novo · REV-11 |
| **V-A2** | `Pins-Root` obrigatório no cache-manifest. Lista de `pins` na malha com prova de inclusão | R6 |
| **V-R1** | RBSR (estilo NIP-77) quando a comunidade passar de ~1.000 itens | ADR (código próprio, sem lib) |
| **V-R7** | ADR-009: catálogo realista (2 testemunhas), sonda de cobertura, `first ≤ 100` e cursor por gateway | ADR-009 |
| **V-N1** | Telemetria local de ICE (`host` / `srflx` / `relay` × família IP × ASN), exportável e sem servidor | REV-10 |
| **V-P1** | Pacto Vox: **só Wi-Fi por padrão**. Móvel por opt-in, teto de 5 MB/dia, medidor visível | R8 · parecer (base legal) |
| **V-S1** | Meta de G1: **2 stewards na tomada** por comunidade antes de abrir. G3 exige um nó em datacenter no orçamento | R9 |

### Contra-argumentos ao "usuário como infraestrutura"

1. **Disponibilidade:** com *p* ≈ 0,04, são precisas ~113 réplicas para 99%. Nenhuma comunidade de 30 pessoas chega lá (B.1).
2. **Custo regressivo:** quem tem o plano mais barato paga proporcionalmente mais pela "contribuição" (D.2).
3. **Plataforma hostil:** o iOS suspende o WebRTC em segundo plano, e o Briar caiu justamente por depender do celular como nó (B.3).
4. **Exposição jurídica sem contrapartida:** o IP de quem serve aparece aos pares, e o steward pode virar alvo de notificação (F).
5. **Precedente de mercado:** todos os protocolos comparáveis têm piso sempre ligado (B.2). O argumento a favor do Vox é **reduzir o piso**, não eliminá-lo.

## Não encontrado (não preencher com suposição)

- O ataque concreto que faz o NIP-03 ser `unrecommended`.
- Tamanho típico de um `.ots` com atestação Bitcoin.
- Limite de `RTCPeerConnection` por página no Chromium e no WebKit. Medições de bateria com WebRTC no celular.
- Taxa de sucesso de STUN em redes móveis brasileiras.
- Estudo de churn de pares WebRTC em navegador.
- Benchmark controlado de IndexedDB × SQLite/OPFS em Android de entrada.
- Texto integral da EDPB 02/2025 v2.0 (só li comentários de escritórios) e do Acórdão C-413/23 P.
- Posição da ANPD sobre raiz Merkle e blockchain.
- Preços oficiais das operadoras e relatório da Anatel 2026.
- Peer5/Streamroot, Brave, Storj, Filecoin e Helium (aceitação do usuário); SSB Rooms 2.0; Holochain.
- Precedente brasileiro sobre operador de nó P2P. *Cobbler Nevada*.
- Passkey ou carteira embarcada no x402 do Turbo.
- Federações e cooperativas de pinning como modelo de financiamento.
