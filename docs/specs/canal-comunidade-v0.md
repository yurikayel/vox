# Canal: comunidade em que só a moderação publica (v0)

> **Status:** implementada no PM-81 · **Owner:** mantenedor · **Revisado:** 2026-11-10
> Relacionados: [moderação e `community_update` (PM-09)](../ROADMAP.md), `client/js/community-channel.js`, `client/js/app/community-channel-flow.js`, `client/js/render/channel-bar.js`.

## Problema

Associação de bairro, gabinete, coletivo e sindicato querem um mural de avisos: poucas pessoas publicam, muitas leem e comentam. Hoje a única saída é uma comunidade comum, em que qualquer membro abre posts e o aviso se perde no meio. Criar um "canal" como objeto novo dobraria rotas, telas e regras de moderação.

## Decisão

Canal é um **modo da comunidade**, não um objeto novo:

- `postingMode: "mods"` → **canal**: só o dono e a moderação publicam posts; todo mundo pode comentar.
- `postingMode: "open"` (ou ausente) → comunidade comum.

O modo chega num `community_update` assinado (campos `postingMode` e `postingModeSince`), que só dono ou moderador consegue emitir (`canUpdateCommunity`, PM-09). Update de outra pessoa é ignorado na hora de montar os metadados.

## Onde a regra vale

Não existe servidor que recuse um post. A regra vale **na leitura, em cada aparelho**:

| Quem vê | Post de dono/moderação | Post de quem não modera |
|---|---|---|
| Qualquer pessoa | aparece | some da lista; o link direto mostra "Publicação fora do canal" |
| O próprio autor | aparece | aparece com o selo "📣 Fora do canal" |
| Moderação | aparece | aparece com o selo (para decidir o que fazer) |

O aviso ao publicar ("Esta comunidade é um canal…", na tela de compor e na caixa rápida da home) e os botões de novo post escondidos são só conveniência. O aviso só busca a comunidade quando há no aparelho um `community_update` com `postingMode`; sem isso, a comunidade não é canal e nada sai para os gateways. Um cliente modificado pode publicar mesmo assim, mas ninguém mais vê o post.

**Sem exceção para posts antigos.** A data do post (`ts`) é escrita por quem publica e pode ser recuada. Por isso não há regra do tipo "o que veio antes de virar canal continua visível". Enquanto a comunidade for canal, posts de quem não modera ficam escondidos. Voltar para "aberta" mostra tudo de novo, porque nada é apagado.

## Telas

- **Faixa na página da comunidade:**
  - membros veem "📣 Canal: só a moderação publica posts; todo mundo pode comentar.";
  - quem modera vê também o botão **Abrir para todos publicarem**;
  - numa comunidade aberta, quem modera vê **📣 Transformar em canal**.
- A troca pede confirmação, explicando o que acontece com os posts escondidos.
- A moderação é checada pelas duas identidades do aparelho: a ativa (carteira, se houver) e a conta local que assina.

## Fora desta versão

- Confirmação de leitura ("li") para avisos de canal.
- Lista separada de "canais que sigo" na home. Hoje, o canal aparece como comunidade.
- Filtro do canal no feed da home: o feed geral ainda não aplica a moderação da comunidade (vale também para arquivamento e banimento) e fica para um passo comum aos dois.
