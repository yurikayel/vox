# ADR-021: Integridade na entrada — forma assinada guardada, tudo que entra é conferido

**Status:** accepted (implementado) · **Revisado:** 2026-11-10 · **Relacionados:** PR yurikayel/vox#49, PM-80, PM-84, PM-86, PM-87, PM-88, PM-85 (aberto), [THREAT-MODEL T16–T18](../THREAT-MODEL.md), [ADR-022](./022-memoria-central-por-consentimento.md)

## 1. Contexto

O Vox não tem servidor que diga o que é verdadeiro. Um post é válido porque o autor o assinou (ECDSA P-256, `local-account.js`), e cada aparelho confere sozinho.

Até novembro de 2026 essa regra tinha três furos:
- **A forma guardada não batia com a assinatura (#49).** O aparelho gravava o post misturado com cerca de 35 campos padrão. Quem recebia o post de volta pela sincronização ou pela memória central descartava, e só o que circulava ao vivo chegava a outro aparelho.
- **Nem todo caminho de entrada conferia (PM-86).** O que voltava da memória central era gravado sem `verifyPayload`, sem a regra do PM-09 e sem checar o autor.
- **A mídia era colada no post (PM-87, PM-88).** O post assinado com a imagem era enviado sem ela, ou guardado com ela por cima, e deixava de verificar.

Hoje sete caminhos trazem dados para o aparelho:
- gossip;
- gossip de atualização;
- sincronização por inventário;
- envio completo a cliente antigo;
- memória central;
- cartão de diretório;
- beacon.

## 2. Decisão

1. **O banco guarda a forma assinada, exatamente como chegou**, com a marca `_wire` (`post-wire.js`). Padrões, hashtags e `isLocalP2p` entram **só na leitura** (`normalizeLocalPost`). O que o aparelho repassa vem de `toWireForm` / `getWirePosts()`.
2. **Campo que só o aparelho escreve fica fora da assinatura e nunca é repassado:** `_wire` marca a forma, `_media` guarda a mídia de exibição. Item que **chega** com um desses campos é recusado.
3. **Todo item que entra é conferido**, venha de onde vier. O aparelho aceita o item se:
   - a assinatura é válida e o autor é a chave que assinou;
   - o autor não está bloqueado;
   - as regras de domínio passam: PM-09 para `community_update`, PM-81 para canal;
   - o item não troca um post existente de outro autor e não é mais velho que a versão guardada.
4. **Mídia viaja ao lado do post, presa por um hash assinado no topo (`mediaHash`)**, e o blob só entra se o conteúdo bate com o hash. O objeto `mediaRef` não serve de âncora por causa do PM-85.
5. **Só segue adiante o que é novo para o aparelho** (PM-84): o repasse depende de o item ter sido aplicado agora, o que corta o eco.
6. **Objeto aninhado não é coberto pela assinatura atual** (PM-85). Até existir a `sigv: 2`, um dado que precise de proteção vai como **texto** (como o `accept` do vínculo, PM-82) ou como **campo de topo** (como o `mediaHash`).

## 3. Consequências

- A sincronização entre aparelhos passou a funcionar de verdade, e a memória central deixou de ser uma porta para conteúdo forjado.
- Registro antigo (sem `_wire`) recupera a forma assinada por melhor esforço (`stripLegacyFields`); o que não verificar, quem recebe descarta.
- **Dívida aceita:** cada caminho de entrada ainda implementa a sua parte das regras. A meta é uma função única, `acceptIncoming(item, origem)`, com testes de tabela ([brainstorm de pontos fracos](../brainstorms/brainstorm-5-pontos-fracos-2026-11-10.md), ponto 2).
- **Formato de assinatura (PM-85):** mudar exige versão (`sigv`) e período de convivência. Não se resolve com mais um contorno.
