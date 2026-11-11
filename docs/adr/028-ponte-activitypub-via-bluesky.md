# ADR-028: Ponte com o Fediverso (ActivityPub) via Bluesky, sem servidor próprio

**Status:** accepted (2026-11-11, pelo mantenedor; UI de orientação ainda não implementada) · **Revisado:** 2026-11-11 · **Relacionados:** [POSITIONING](../product/POSITIONING.md), [INFRA-CUSTOS](../INFRA-CUSTOS.md), [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-027](./027-autorizacao-no-relay-dono-e-origem.md), [RFC 0001 — POSSE export](../rfc/0001-posse-export.md), [spec do aviso assinado](../specs/aviso-assinado-v0.md)

## 1. Contexto

Threads, WordPress e Flipboard passaram a falar ActivityPub, o protocolo do Mastodon. O Fediverso deixou de ser nicho, e quem está lá pode querer seguir uma pessoa ou uma comunidade do Vox. A pergunta é se o Vox deve ter uma ponte para lá, e a que custo.

**O que o Vox já faz:**
- O POSSE (`posse-dispatch.js`) devolve o link canônico do post para a pessoa compartilhar à mão.
- O Vox publica direto no Bluesky pelo navegador, com OAuth do AT Protocol, sem servidor (`bsky-oauth.js`, `linked-accounts.js`). A sessão fica só no aparelho.

**O que o ActivityPub exige** ([W3C, recomendação de 23/01/2018](https://www.w3.org/TR/activitypub/)):
- um **ator** com endereço HTTPS fixo, mais `inbox` e `outbox`;
- uma **inbox que aceita POST** de outros servidores: é por ela que chega o `Follow`;
- responder `Accept` e **entregar cada post por POST na inbox de cada seguidor**, com nova tentativa quando a rede falha;
- na prática, assinatura HTTP nas entregas, que a especificação deixa para quem implementa.

Um site estático, como o do Vox no GitHub Pages, **não recebe seguidores**: não tem como aceitar o POST nem responder. Federar de verdade exige um servidor sempre ligado, com chave do ator e fila de entrega.

**O que já existe de ponte** ([Bridgy Fed, documentação consultada em 11/11/2026](https://fed.brid.gy/docs)):
- Liga contas do Bluesky ao Fediverso. É **por opção da pessoa**: ela segue `@ap.brid.gy` no Bluesky, ou ativa pelo site. Bloquear essa conta desliga a ponte.
- No Fediverso, a conta aparece como `@handle@bsky.brid.gy`, por exemplo `@ana.bsky.social@bsky.brid.gy`.
- É gratuito e mantido por doações.
- **Limites:**
  - só posts públicos atravessam;
  - só os posts novos, sem histórico, e nada com mais de duas semanas;
  - respostas e curtidas só atravessam se o post original atravessou;
  - no máximo uma ação a cada 5 segundos por pessoa;
  - apagar remove as cópias, mas outros servidores podem guardar cópia por um tempo.

**Premissas do Vox que pesam aqui:**
- Custo zero, sem obrigar voluntário a manter servidor ([INFRA-CUSTOS](../INFRA-CUSTOS.md)). Hoje não existe relay completo público.
- O POSITIONING chama o Fediverso clássico de "pensão": alguém paga, modera e não pode falir.
- Avisos de núcleo podem trazer hora e lugar sensíveis. A spec do aviso já pede um ADR de privacidade antes de qualquer aviso "público e permanente".
- A praça é neutra: nada de envio automático ou em massa.

## 2. Opções

| Opção | Como | Custo e risco | Veredito |
|---|---|---|---|
| **A. Servidor ActivityPub próprio** | Ator por pessoa ou comunidade, inbox, outbox e fila de entrega em `relay/` | Servidor público sempre ligado, com chave de ator, assinatura HTTP e moderação do que chega pela inbox. Vira ponto único de falha e de custo, e traz dados de terceiros (LGPD). Contraria a premissa do custo zero | **Não agora** |
| **B. Ator estático no Pages** | WebFinger, ator e outbox como arquivos estáticos | Não aceita `Follow` nem entrega posts, então não federa (W3C). Daria a falsa impressão de que federa | **Recusada** |
| **C. Pela ponte do Bluesky** | A pessoa publica do Vox no Bluesky (já existe) e, se quiser, liga o Bridgy Fed na conta dela | Zero servidor nosso e zero código novo para federar. Depende de terceiro, e só vale para posts públicos de quem optou | **Recomendada** |
| **D. Ponte hospedada por steward** | O padrão do ADR-022/027 aplicado ao ActivityPub, num `server.py` de voluntário | Mesmo custo da A, só que repassado a voluntários. Só faz sentido se houver demanda medida | **Adiada** (gatilho na §4) |

## 3. Decisão

1. **O Vox não roda servidor ActivityPub**, nem próprio nem obrigatório para steward.
2. **O caminho para o Fediverso é a pessoa, pelo Bluesky.** O Vox já publica no Bluesky pelo navegador. Quem quiser chegar ao Fediverso liga o Bridgy Fed na **própria** conta do Bluesky. O Vox não liga nada em nome de ninguém.
3. **Aviso de núcleo não atravessa automaticamente.** Atravessa só o que a pessoa publica de propósito no Bluesky. Fica valendo a regra da spec do aviso: aviso "público e permanente" só com pergunta explícita no compositor e com o ADR de privacidade.
4. **O que entra no app** (lote pequeno, depois de aceito):
   - na tela de contas vinculadas, um texto curto: "Quer ser seguido no Mastodon e no Threads? Na sua conta do Bluesky, siga @ap.brid.gy. Você aparece como @seunome.bsky.social@bsky.brid.gy." Com link para a documentação do Bridgy Fed e os limites acima em uma linha;
   - nenhuma chamada automática ao Bridgy Fed e nenhum segredo novo.
5. **Comunidades** não ganham ator no Fediverso. Uma comunidade que quiser presença lá cria uma conta coletiva no Bluesky e liga a ponte, sabendo que a conta é de quem a opera.

## 4. Consequências e gatilho para rever

- **Ganho:** quem está no Mastodon ou no Threads pode seguir quem optou, sem custo nem servidor do Vox.
- **Perda:** não há "seguir a comunidade X do Vox" pelo Fediverso. Respostas vindas de lá aparecem no Bluesky, não no Vox. O Vox depende de um terceiro mantido por doações. Se o Bridgy Fed parar, a ponte some, mas nada se perde no Vox.
- **Honestidade na tela:** o texto diz que é ponte de terceiros, que só vale para posts públicos e que apagar no Fediverso não é imediato.
- **Rever (opção D) quando:**
  - pelo menos 3 comunidades do piloto pedirem presença federada que a conta coletiva no Bluesky não resolve; **ou**
  - o Bridgy Fed mudar de termos, passar a cobrar ou ficar fora do ar por mais de 30 dias.

  Rever exige um ADR novo com custo mensal estimado, quem opera e o plano de moderação da inbox.

## 5. Não decidido aqui

- A ponte no sentido contrário, trazer o Fediverso para o feed do Vox, como o `bsky-feed.js` faz com o Bluesky. Pede ADR próprio: ler APIs públicas de instâncias tem limites e questões de consentimento diferentes.
- O ADR de privacidade do aviso público e permanente (spec do aviso, "Dilemas registrados").
