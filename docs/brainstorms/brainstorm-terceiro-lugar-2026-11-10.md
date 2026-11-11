# Brainstorm — o Vox como "terceiro lugar"

> **Status:** brainstorm · **Owner:** mantenedor · **Revisado:** 2026-11-10 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md))
> **Consolidado em:** [síntese — a praça de colunas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md). Quando este texto divergir da síntese, vale a síntese.
> **Origem:** três rodadas de conversa do mantenedor com o Claude em 10/11/2026, depois da [estratégia de 90 dias](../strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md). Para quem o Vox serve e com que gestos está no doc irmão: [público e gestos conhecidos](./brainstorm-publico-e-gestos-conhecidos-2026-11-10.md).
> Tudo aqui é **candidato**: só vira caixa no ROADMAP quando o mantenedor aceitar. Nada foi enviado a ninguém.

## Resumo

| Ideia | Em uma frase |
|---|---|
| **Raiz comum** | Os cinco pontos fracos são o custo de o Vox querer ser *o lugar* onde a comunidade mora. |
| **Virada** | Ser uma ferramenta usada **a partir** do canal que o grupo já usa (WhatsApp, Signal, Telegram, SMS, papel). |
| **Terceiro lugar** | No ranking, ser o terceiro app da rotina do grupo; no sentido de Oldenburg, ser a praça. Os dois servem. |
| **Jogo certo** | Disputar registro e confiança, que acumulam; nunca atenção. |
| **Forma** | Ferramentas de uma pessoa só para quem organiza. O resultado é postado no grupo, e o membro não precisa de conta. |
| **Métrica** | Organizações que produziram um registro verificável no mês. |

## 1. Diagnóstico: uma raiz para os cinco pontos fracos

O Vox pede que a comunidade se mude antes de dar um motivo para isso. Cada ponto fraco da [estratégia](../strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md) é um custo de ser "o lugar":

- **Ser o lugar** exige todo mundo online junto para o post chegar: é o problema de densidade (ponto 2).
- **Morar nele** faz a identidade precisar durar para sempre, então perder a chave é um desastre (ponto 3).
- **Um lugar inteiro** é uma rede social inteira: ~2 MB de app em cache e telas que nenhum leigo testou (ponto 4).
- **Operar o lugar** é o que pode tornar o mantenedor um "provedor" no sentido jurídico (ponto 5).
- **Um lugar grande** é demais para uma pessoa só manter (ponto 1).

Enquanto isso, as comunidades continuam no WhatsApp, porque é lá que já estão. **A soberania vem de o grupo ter um registro assinado e conferível do que decidiu, não de sair do WhatsApp.**

## 2. Primeira virada: decisão por cima do canal do grupo

Fluxo pensado para a cunha do piloto (modo assembleia):

1. Quem facilita escreve a proposta no Vox (pergunta, opções, prazo). O Vox assina e gera um link em que a proposta vai inteira depois do `#`, parte que o navegador não manda ao servidor.
2. O link vai para o grupo. Quem toca vê a proposta e toca "Sim".
3. O Vox assina o voto e abre o WhatsApp com uma mensagem curta pronta (~200 caracteres).
4. Para apurar, quem facilita exporta a conversa e solta o arquivo no Vox, que confere as assinaturas e gera a ata assinada. Quem tiver o mesmo export reconta e chega ao mesmo resultado.

**Correção da segunda rodada (custo de dados).** Em muitos planos o WhatsApp não desconta da franquia, mas **abrir um link de dentro dele desconta** ([Tecnoblog](https://tecnoblog.net/noticias/na-verdade-a-vivo-retirou-os-beneficios-ilimitados-de-todos-os-planos-pre-e-pos-tambem/), [Teletime, 2025](https://teletime.com.br/11/08/2025/na-america-latina-67-dos-planos-de-celular-tem-zero-rating-para-apps/), [Mobile Time](https://www.mobiletime.com.br/noticias/10/06/2022/precisamos-falar-sobre-zero-rating/)). O gesto mais barato para o membro mais pobre é responder no próprio WhatsApp. Daí a versão de menor atrito:

- o grupo vota na **enquete nativa** do WhatsApp ou respondendo em texto;
- **só quem organiza usa o Vox**;
- a assinatura de cada membro fica para votação disputada.

Isso também encolhe o problema da chave: em vez de todo membro, só uma pessoa motivada por grupo guarda chave.

**Reaproveita:** `signPayload`/`verifyPayload` com `sig-format.js`; `parsePollOptions` e `tallyCivicVotes` (`civic-post.js`); `castCivicVote`; o link `wa.me` de `posse-dispatch.js`; `qr-url*.js`; `perma-notary.js`; `story-card.js`. Novos: a página pequena e a leitura do export.

**Não confirmado:** se o export de conversa traz o resultado da enquete. Não achamos documentação ([hashnode](https://hashnode.com/posts/how-to-export-a-whatsapp-poll-from-a-group-chat/64a68cb3ddb281a1434030e8), [whatsapp-chat-parser](https://unpkg.com/whatsapp-chat-parser@4.0.2/README.md)). Exportar um grupo de teste com enquete responde em uma hora. Plano B: quem organiza digita a contagem da tela da enquete.

## 3. Ler o teatro: dois jogos

| | Jogo da atenção | Jogo do registro e da confiança |
|---|---|---|
| Quem joga | Meta, TikTok, X, Kwai | Wikipédia, OpenStreetMap, Linux, Signal |
| Como se ganha | Capital, engajamento, anúncio | Acúmulo e confiança |
| O Vox pode ganhar? | Nunca | Sim |

Os líderes não entram no segundo jogo porque entrar machucaria o próprio negócio: permanência contraria o modelo de apagar e moderar; "sem número de telefone" contraria identidade e anúncio; funcionar offline contraria o servidor; livro-caixa aberto do grupo não vende nada. É a definição de um bom flanco: terreno que o líder não ocupa sem se ferir.

**A posição de hoje é guerrilha.** Em *Marketing Warfare* (Ries e Trout, 1986), defesa é do líder, ataque do segundo, flanco do terceiro e guerrilha de todo o resto. As regras da guerrilha servem: escolher um segmento pequeno o bastante para defender; nunca agir como líder (para o Vox, nada de feed para todo mundo); estar pronto para se mover rápido.

**Terceiro lugar no teatro grande se conquista sendo primeiro num teatro pequeno.** E "terceiro lugar" tem um segundo sentido que é a missão: para Ray Oldenburg (*The Great Good Place*, 1989), é o espaço que não é casa nem trabalho, a praça, o boteco, a quadra, o salão da associação. É a [tese da praça](../strategy/tese-praca-civica-militancia-pro-democratica-2026-10.md).

## 4. Registro primeiro, rede depois

Várias redes começaram como ferramenta de registro e a parte social veio depois ("venha pela ferramenta, fique pela rede", Chris Dixon, 2015):

| Produto | Começou como | Virou |
|---|---|---|
| GitHub | Hospedagem de código | A rede social de quem programa |
| Strava | Diário de corridas | Rede de atletas |
| Letterboxd | Diário de filmes | Rede de cinéfilos |
| LinkedIn | Currículo online | Rede profissional |
| Doodle | Link de enquete | Nunca rede, mas presente em todo grupo |

**O registro do Vox é o que a comunidade decidiu e o que fez com o dinheiro.** Hoje ninguém guarda isso bem: some na rolagem do WhatsApp, quem chega depois não vê, e os comprovantes da tesouraria são fotos perdidas na conversa. O app social de 2 MB não se perde: vira o último andar, e o que muda é a porta de entrada.

## 5. Escada de esforço do membro

Cada degrau vale sozinho, e cada coisa produzida leva a porta do degrau seguinte ("Feito com o Vox, grátis — faça o seu").

| Degrau | O membro faz | Quem tem chave |
|---|---|---|
| 0 | Abre uma página; sem conta, sem instalar | Ninguém |
| 1 | Nada novo; quem organiza usa uma ferramenta sozinho | Quem organiza |
| 2 | Toca uma vez para assinar | Cada membro, uma vez |
| 3 | Usa o Vox completo | Todos |

## 6. Ideias candidatas, da menor fricção para a maior

1. **Ata de assembleia em sessão permanente (degrau 1).** O grupo vota na enquete do WhatsApp; quem organiza leva o resultado ao Vox (digitado ou pelo export) e recebe uma ata assinada e um cartão para postar de volta. A [Lei 14.309/2022](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14309.htm) permite reunião e votação eletrônica em associações (art. 48-A do Código Civil) e em condomínios (art. 1.354-A), e assembleia de condomínio em sessão permanente até atingir o quórum (art. 1.353). É o que os grupos já fazem informalmente, menos o registro. O kit de sindicato (`kit-genesis.js`) já tem os canais `assembleia-permanente` e `ata-automerge`. Se uma ata assinada pelo Vox vale para o estatuto de cada associação é pergunta para o parecer ([Lei 14.063/2020](https://planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) define os níveis de assinatura eletrônica).
2. **Mural da comunidade (degrau 0 para membros).** Uma página pública: quem somos, próxima reunião, decisões tomadas, chave Pix. Um "link na bio" do coletivo, com histórico conferível. Sem nome de quem votou.
3. **Livro-caixa conferível (degrau 1 para a tesouraria, 0 para o resto).** Entradas e saídas assinadas, com comprovante, mostradas em totais, sem nome de doador. Dúvida sobre o dinheiro do grupo é causa comum de briga. Reaproveita `pix-key.js`, `perma-notary.js` e o canal `prestacao-de-contas` do kit.
4. **Selo contra golpe (degrau 0 para membros).** Quem cuida da tesouraria assina cobranças e avisos; o membro toca "conferir" e vê verde se a mensagem veio da chave publicada no mural e usa a mesma chave Pix. É o primeiro uso de assinatura que um leigo **sente**. Tem de dizer claramente: o verde confirma quem mandou, não que a pessoa é honesta.
5. **Geradores grátis de ata, convocação e estatuto.** Quem organiza já procura modelos na busca. Uma página em HTML simples, indexável (fora do app de rotas com `#`), pega a pessoa no momento da necessidade. Reaproveita os modelos do `kit-genesis.js`.
6. **"A lista".** A lista de copiar e colar ("Pelada sábado: 1. João 2. …") já é um formato de texto brasileiro para dizer quem vai. Lição: as mensagens do Vox devem se parecer com ela.
7. **Modo emergência (degrau 3, só em crise).** Nas enchentes do Rio Grande do Sul em 2024 a conexão caiu, e o WhatsApp junto. App em cache, roteador do celular sem internet e pareamento por QR (`airgap-webrtc.js`, escrito e não plugado) poderiam manter a lista de um abrigo. É a única coisa que os líderes não fazem. Precisa de teste de campo antes de qualquer promessa.

## 7. Distribuição com orçamento de guerrilha

- **Efeito Doodle.** Cada ata, mural ou cartão postado num grupo mostra o Vox a 20–200 pessoas de graça; algumas organizam outros grupos.
- **Quem forma quem organiza multiplica:** incubadoras universitárias de cooperativas populares (ITCPs; cooperativa tem assembleia obrigatória pela Lei 5.764/1971), cursos de formação de lideranças, extensão universitária (a Resolução CNE/CES 7/2018 exige ao menos 10% da carga horária em extensão; **a confirmar**) e, no campo, a assistência técnica rural (Emater/ATER). A extensão pode trazer de uma vez a clínica jurídica (parecer), um professor (segunda pessoa), estudantes (contribuidores) e comunidades.
- **Parecer como bem público.** Publicar as perguntas do [briefing](../legal/briefing-parecer-g1.md) como "o que nenhum projeto P2P brasileiro sabe responder ainda". Outros projetos precisam das mesmas respostas, e a clínica ganha um trabalho publicável.
- **Ondas de êxodo.** Redes alternativas crescem em ondas (Signal depois da mudança de política do WhatsApp em 2021; Bluesky depois da suspensão do X no Brasil em 2024). Os gatilhos prováveis são conhecidos: anúncios no WhatsApp (anunciados pela Meta em junho de 2025), quedas, mudanças de política. Ter pronta uma página "plano B do grupo". Página estática aguenta a onda; servidor de sinalização gratuito, não. **Nunca** apresentar o Vox como jeito de contornar bloqueio judicial.
- **Grupos de baixo risco primeiro para depurar:** pelada, bloco, clube de leitura. Mesma mecânica (lista, voto, dinheiro), sem exposição política.

## 8. Efeito nos cinco pontos fracos

| Ponto fraco | Efeito |
|---|---|
| **5. Jurídico** | As ferramentas são páginas estáticas e quem publica é quem organiza; o Vox não hospeda conteúdo de membro. A pergunta 1 do briefing fica mais fácil. |
| **1. Uma pessoa só** | Cada ferramenta é uma página pequena e separada: dá para um contribuidor cuidar de ponta a ponta sem mexer no núcleo. |
| **2. Rede** | Degraus 0 a 2 não precisam de conexão P2P; o WhatsApp entrega e notifica. Testes ponta a ponta viram fixtures de texto. |
| **3. Chave** | Só quem organiza tem chave. Para essa pessoa: **recuperação pela comunidade** (k de n membros assinam a troca, 72 h de espera e veto da chave antiga, sobre o vínculo do PM-82) e, opcional, **passkey com PRF** para desbloquear num celular novo (precisa de spike nos aparelhos do piloto; troca um pouco de soberania por conveniência). |
| **4. Produto pesado** | Degraus 0 a 2 nunca carregam o app de 2 MB. |
| **Exposição** | Nenhum metadado novo além do canal que o grupo já usa; nenhum grafo de convites da malha toda. |

## 9. Métrica e quando subir de degrau

- **Métrica principal:** organizações distintas que produziram um registro verificável no mês (ata, livro-caixa ou mural). Não usuários ativos por dia: registro acumula, atenção não.
- **10 organizações** fazendo isso sem a gente pedir: abrir o degrau 2.
- **3 grupos** perguntando "dá para conversar aqui dentro?": abrir o degrau 3 para eles.
- **Critério de abandono:** se menos da metade dos membros conclui um voto pelo link, o atrito mata a ideia; voltar à enquete nativa.

## 10. Da guerrilha ao topo

1. **Guerrilha:** ser dono de "o registro das pequenas organizações populares", em português.
2. **Flanco:** publicar o formato da ata assinada como especificação aberta, para outras ferramentas lerem e escreverem. RSS e Markdown mostram como pequenos viram padrão.
3. **Rede:** quando a história de uma comunidade já vive no Vox, chamar os membros para dentro é natural. É o caminho do GitHub.

**Topo não é o maior feed. É ser o registro padrão da organização popular**, coisa que a Meta nunca vai construir.

## 11. Riscos

- **Dependência da Meta:** apoiar-se no WhatsApp a aumenta. Manter os formatos usáveis em qualquer canal e recomendar Signal para grupos sensíveis.
- **Meta AI dentro do WhatsApp** pode lançar resumo de grupo ou "ata" própria. O Vox tem de ganhar no que a Meta não oferece: assinado, permanente, do grupo, conferível por terceiros, portátil.
- **Enquete nativa** depende da palavra de quem organiza mais o export; disputa precisa do degrau 2.
- **Voto aberto** na primeira versão; voto secreto fica para depois.
- **Selo contra golpe:** confiança mal colocada num verde expõe o projeto.
- **Ata publicada é permanente** (LGPD): por padrão ancorar o hash e deixar o texto fora da cadeia.
- **iOS** não recebe texto compartilhado num app web; por isso só quem organiza lida com o export.
- **Busca orgânica** dos geradores leva meses.
- **Congelar recursos dói**, mas é a segunda regra da guerrilha.

## 12. Próximos passos baratos (candidatos)

1. Exportar um grupo de teste com enquete e olhar o `.txt`. Decide o desenho da ideia 1.
2. Acrescentar ao [briefing](../legal/briefing-parecer-g1.md) a Lei 14.309/2022 e a pergunta "uma ata assinada pelo Vox atende ao estatuto de uma associação?".
3. Acrescentar ao [roteiro da conversa](../pilot/piloto-g1-roteiro-conversa.md): "como vocês guardam hoje o registro e o dinheiro?".
4. Fazer uma ata à mão com a primeira candidata, antes de escrever código.

| Semana | Movimento |
|---|---|
| 1 | Decisão conduzida à mão com um grupo; briefing com a pergunta nova; contato com um programa de extensão ou ITCP |
| 2–3 | Spike: página pequena, link → assinar → `wa.me` → apurar pelo export, com testes sobre um export de exemplo |
| 4 | Uma decisão real com a ferramenta: medir quantos votaram pelo link, tempo de apuração e disputas |

**Efeito no plano de 90 dias:** medir a rede (ponto 2) e emagrecer o app (ponto 4) deixam de bloquear o G1; o ponto 3 vira recuperação pela comunidade; a parceria universitária acelera o parecer (ponto 5) e a segunda pessoa (ponto 1).

## Referências

- [Lei 14.309/2022](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14309.htm) (Planalto) e comentários em [Dizer o Direito](https://www.dizerodireito.com.br/2022/03/lei-143092022-permite-realizacao-de.html) e [netcpa](https://netcpa.com.br/noticias/entidades-sem-fins-lucrativos-e-condominios-permitida-a-realizacao-de-reunioes-e-deliberacoes-virtuais/12090). Correção registrada: o art. 48-A veio desta lei, não da Lei 14.382/2022, como dito numa rodada anterior da conversa.
- Zero rating no Brasil: [Teletime (2025)](https://teletime.com.br/11/08/2025/na-america-latina-67-dos-planos-de-celular-tem-zero-rating-para-apps/), [Tecnoblog](https://tecnoblog.net/noticias/na-verdade-a-vivo-retirou-os-beneficios-ilimitados-de-todos-os-planos-pre-e-pos-tambem/), [Mobile Time (2022)](https://www.mobiletime.com.br/noticias/10/06/2022/precisamos-falar-sobre-zero-rating/).
- Livros e ensaios citados de memória, sem link: Ries e Trout, *Marketing Warfare* (1986); Oldenburg, *The Great Good Place* (1989); Chris Dixon, "Come for the tool, stay for the network" (2015).
