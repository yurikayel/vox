# Briefing para parecer jurídico — piloto fechado (G1)

> **Status:** rascunho para o mantenedor revisar e enviar · **Owner:** mantenedor · **Revisado:** 2026-11-13
> **Não é parecer jurídico** e não substitui o [ROADMAP.md](../ROADMAP.md) (REV-12, LAN-01). Nada aqui foi enviado a ninguém.
> **Escopo:** só o mínimo para o piloto fechado, com a postura do [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md). O parecer do beta (G2) vem depois e cobre o resto do REV-12 (§4).

## 1. O pedido em uma frase

Pedimos respostas curtas (**sim / não / depende, e por quê**, em até um parágrafo cada) a cinco perguntas fechadas sobre um piloto de 4 semanas, com uma comunidade de 10 a 30 adultos, de um aplicativo livre e sem fins lucrativos.

## 2. O que é o Vox (meia página)

- **Aplicativo web livre (AGPL), sem empresa e sem fins lucrativos.** Uma pessoa física mantém o código e opera a versão oficial em `yurikayel.github.io/vox`.
- **Sem servidor de conteúdo central.** Os posts circulam direto entre os aparelhos (WebRTC). Cada aparelho guarda uma cópia. Um servidor só apresenta um aparelho ao outro (sinalização) e não guarda conteúdo.
- **Feed em ordem cronológica.** Não há algoritmo de recomendação nem impulsionamento pago.
- **Por enquanto nada deve ser salvo no Arweave.** Todo conteúdo e mídia circula e se preserva apenas na **rede de seguidores** (cada aparelho replica o conteúdo de quem segue e apaga junto na retração do autor). O Arweave fica reservado para recursos específicos futuros (ex.: cartório cívico / memória consensual após o piloto). *(Nota técnica: a flag `arweaveUpload` em `flags.json` precisa ser desligada antes do início do piloto.)*
- **Identidade:** chave criptográfica gerada no aparelho. Não pedimos nome, CPF, e-mail nem telefone.
- **Moderação em camadas:** cada pessoa esconde o que quiser; moderadores da comunidade arquivam por ação assinada; uma denúncia de membro arquiva o post até a revisão ([ADR-020 §2.1](../adr/020-postura-de-operacao-do-piloto-g1.md)).
- **No piloto (G1):** só maiores de 18 anos (autodeclarado no aparelho); voluntários só em trabalho de baixo risco; o mantenedor é o operador. Propomos também rodar o piloto **sem Feira e sem Pix** até o parecer do beta (a confirmar pelo mantenedor).

## 3. As cinco perguntas do G1

1. **Provedor de aplicação.** Depois do STF (Temas 987 e 533, 2025), o mantenedor, pessoa física que publica o código e opera a versão oficial e um servidor de sinalização sem conteúdo, é "provedor de aplicação"? A exceção para quem atua "sem interferência no fluxo" alcança um feed só cronológico, sem recomendação?
2. **Termos e notificação.** Que conteúdo mínimo os Termos de Uso e a política de notificação e remoção precisam ter para o piloto? A regra "uma denúncia arquiva até a revisão", com revisão em até 48 h, atende? Há prazo obrigatório para conteúdo íntimo não consentido (hoje planejamos até 2 h, LAN-04)?
3. **Guarda de registros.** O art. 15 do Marco Civil obriga provedor **pessoa jurídica** a guardar registros de acesso por 6 meses. Um operador pessoa física, sem servidor que veja quem acessa, tem alguma obrigação de guarda? O que fazer se receber ordem judicial pedindo dados que não tem?
4. **Permanência futura e LGPD.** No piloto atual **nada é gravado no Arweave** (tudo circula na rede de seguidores com retração assinada); porém, para recursos específicos futuros no Arweave (cartório/consenso), como tratar o pedido de eliminação (LGPD art. 18)? Basta o aviso expresso antes de gravar somado ao filtro que esconde o registro em todos os aparelhos?
5. **Conteúdo político.** Que cuidado o piloto precisa ter com conteúdo político e com o próximo período eleitoral (2028), sendo uma comunidade fechada e sem impulsionamento?

## 4. O que fica para o parecer do beta (G2)

Já listado no REV-12, fora do G1 pelo ADR-020:
- sede e representante pessoa jurídica no país (tese do STF, item 11) e a associação (REV-18);
- autorregulação: regras públicas, canal para não usuários e relatório anual (itens 8 a 10, REV-20);
- Feira e Código de Defesa do Consumidor (item 7);
- ECA Digital e menores de idade (REV-23).

## 5. O que mandamos junto

- [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md): postura do piloto (operador, voluntários, 18+).
- [COMPLIANCE-BR.md](./COMPLIANCE-BR.md): visão geral de LGPD e Marco Civil escrita pelo projeto (não é parecer).
- [THREAT-MODEL.md](../THREAT-MODEL.md): riscos técnicos e o que está mitigado.
- [Política de privacidade atual](../../client/privacy.html).

## 6. Formato e prazo que pedimos

- Respostas por escrito, em até **30 dias**, com a ressalva de que são orientação para um piloto e não opinião definitiva.
- Podemos conversar 30 minutos para tirar dúvidas sobre a arquitetura.
- O projeto não tem verba prevista. Se houver custo, pedimos o valor antes de começar.

## 7. A quem enviar (três portas, em paralelo)

Lista de categorias, não de pessoas. Antes de enviar, o mantenedor confere o contato na fonte oficial de cada organização. Pela regra do [mapa de parceiras](../strategy/mapa-parceiras-e-concorrentes-2026-11.md), ninguém é chamado de parceiro em público sem combinar antes.

| Porta | Quem | Como achar o contato | Situação |
|---|---|---|---|
| Clínicas jurídicas | Clínicas de direito digital e de direitos humanos de faculdades de direito (públicas e privadas) | Página da clínica no site da faculdade | a pesquisar |
| Organizações de direitos digitais | Data Privacy Brasil; entidades da Coalizão Direitos na Rede | Formulário ou e-mail institucional no site oficial | a pesquisar |
| Rede de contribuidores | Advogado ou advogada voluntária que já use ou contribua com software livre | Chamada no canal do projeto, depois do PM-41 | a pesquisar |

**Mudar de plano se** ninguém responder em 30 dias: contratar o parecer pontualmente. É o item de maior alavancagem do G1.

## 8. Mensagem sugerida (não enviada)

> Olá, [nome ou equipe]. Sou [nome], mantenedor do Vox, um aplicativo livre e sem fins lucrativos para comunidades conversarem e decidirem juntas, sem servidor central de conteúdo.
>
> Vamos fazer um piloto fechado de 4 semanas com uma comunidade de 10 a 30 adultos. Antes disso, precisamos de orientação sobre cinco perguntas fechadas (provedor de aplicação, termos e notificação, guarda de registros, permanência e LGPD, conteúdo político). O briefing de duas páginas está em [link].
>
> Vocês poderiam responder por escrito, ou indicar quem possa? Não temos verba prevista; se houver custo, gostaríamos de saber antes. Obrigado pela atenção.
