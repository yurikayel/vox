# Brainstorm — nichos fiéis como colunas de um "WeChat democrático"

> **Status:** brainstorm · **Owner:** mantenedor · **Revisado:** 2026-11-10 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md))
> **Consolidado em:** [síntese — a praça de colunas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md). Quando este texto divergir da síntese, vale a síntese. A síntese troca a analogia "WeChat" pela **ágora** (praça comum cercada de colunas).
> **Origem:** conversa do mantenedor com o Claude em 10/11/2026. Pedido: "nichos que serão fiéis à plataforma, cada um como uma coluna que ajuda a erguer um WeChat brasileiro, democrático, Vox Populi, que integra com serviços do governo sem ser do governo". Pesquisa web feita no mesmo dia (PNAE, PDDE, Portal da Transparência). Estado do código conferido no mesmo dia.
> **Vem de:** [dez estratégias de captação](./brainstorm-captacao-por-perfil-2026-11-10.md) e [refino: da praça-cartório à rede de ação](./brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md).

O WeChat não venceu por ser uma rede social. Venceu porque cada serviço virou um motivo para abrir o app todo dia. O Vox vence do mesmo jeito se cada nicho trouxer **um compromisso que volta, com prazo**, e que o Vox resolve melhor que o caderno, o grupo de WhatsApp e a planilha. A pessoa fica porque tem obrigação a cumprir, não porque quer postar.

## 1. O filtro: quando um nicho fica

1. **O prazo volta sempre:** reunião mensal, prestação de contas anual, chamada pública.
2. **Tem papel em jogo:** ata, recibo, lista de presença. Hoje isso mora no caderno ou na cabeça do presidente.
3. **Tem um organizador cansado**, geralmente 50+, que traz o grupo inteiro junto.
4. **Envolve dinheiro ou serviço público**, mas o Vox não precisa ser governo nem banco para ajudar.
5. **O histórico ganha valor com o tempo** e pode sair exportado. A pessoa fica porque o Vox serve, não porque prende.

## 2. As colunas

| # | Coluna | O compromisso que volta | Mini-serviço que ela traz | Ligação com o poder público (sem ser governo) |
|---|---|---|---|---|
| 1 | Associações de bairro e condomínios | Assembleia, ata, prestação de contas | Ata assinada + livro-caixa | A Lei 14.309/2022 permite assembleia eletrônica (Código Civil, arts. 48-A e 1.354-A) quando o estatuto ou a convenção não proíbe |
| 2 | Agricultura familiar (associações e cooperativas) | Chamada pública do PNAE e do PAA, entregas, divisão entre produtores | Caderno de entregas + ata do projeto de venda | Desde 1/1/2026, pelo menos **45%** do dinheiro federal da merenda compra da agricultura familiar (Lei 15.226/2025) |
| 3 | Escola pública: APM, caixa escolar, conselho escolar (**só adultos**) | PDDE: ata de eleição, ata do plano de gastos, ata de aprovação, notas em ordem, parecer do conselho fiscal | Pasta de prestação de contas montada ao longo do ano | A escola entrega o pacote à secretaria, que lança no SiGPC. O Vox só monta |
| 4 | Conselhos de participação (saúde, educação, CAE, assistência) | Reunião mensal, mandato | Consulta à base antes da reunião, retorno assinado depois | O CAE fiscaliza o PNAE, então se encaixa nas colunas 2 e 3. Pedidos pela LAI vão pelo Fala.BR, e quem envia é a pessoa |
| 5 | Movimentos, sindicatos e núcleos, de qualquer lado pró-democrático | Missões, formação, núcleo | Missão com prova de que foi feita, organizada por núcleo | e-Cidadania e consultas públicas: o Vox prepara, a pessoa envia |
| 6 | Comunicação popular: rádios comunitárias, canais, educadores | Programação e pauta da semana | Pauta legislativa + áudio com ata | Dados abertos da Câmara e do Senado ([sinergia com o Tramitado](./brainstorm-sinergia-tramitado-vox-2026-11.md)) |
| 7 | Guardiões contra golpe (50+ e famílias) | O golpe chega toda semana | Círculo de confiança: recuperação de conta por k-de-n pessoas + alerta da comunidade | Só links para Celular Seguro e Registrato, nunca integração |
| 8 | Universidades, software livre, coalizões de soberania | Extensão, pesquisa, auditoria | Nós de apoio (`supporter-mode`) + verificador | É o parceiro com domínio oficial previsto no [ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md): ele pede a credencial gov.br, o Vox nunca pede |
| 9 | Feira e economia solidária (**só depois do parecer jurídico**) | Venda semanal | Vitrine + Pix Copia e Cola sem custódia | Usa a especificação pública do Pix (BR Code) |

## 3. O teto comum: por que vira um WeChat e não nove apps

- **Uma só identidade:** a chave `vx_*`, que pode ser recuperada pelo círculo de confiança.
- **Um só formato de registro assinado:** ata, voto, recibo e missão saem no mesmo formato. É o "Pix do registro".
- **Mini-apps num ambiente isolado** (`webxdc-host.js`), no papel dos mini-programas do WeChat.
- **Modelos de grupo** (`kit-genesis.js`), para cada nicho começar pronto.

**Regra de ouro:** um nicho só vira coluna se o mini-serviço dele servir a pelo menos dois outros nichos.

- A ata das associações de bairro serve à cooperativa, à escola, ao conselho, ao movimento e à rádio.
- O livro-caixa da escola serve ao bairro, à cooperativa e à feira.
- A missão dos movimentos serve ao conselho (consulta à base), aos guardiões (alerta) e ao bairro (mutirão).
- O círculo de confiança serve a todos.

No interior, a mesma senhora está na associação, na cooperativa, no conselho escolar e na igreja. Quando um único app cuida dos compromissos de todos os grupos dela, aí está o efeito WeChat.

## 4. Integrar com o governo sem ser do governo: 6 regras

1. **Só interfaces públicas, que qualquer pessoa pode usar:** a especificação do Pix (o `brcode.js` já gera Copia e Cola sem internet), dados abertos (Câmara, Senado, FNDE) e o validar.iti.gov.br.
2. **O Vox prepara, a pessoa protocola.** Fala.BR, e-Cidadania e SiGPC ficam como links para fora. Nunca um robô logado em nome de alguém.
3. **Nenhuma credencial gov.br e nenhum CPF no Vox** ([COMPLIANCE-BR, política anti-CPF](../legal/COMPLIANCE-BR.md#identidade-chave-pix-fase-a-e-política-anti-cpf-fase-57)). Um caso concreto: segundo uma fonte secundária, a API do Portal da Transparência pede uma chave ligada a uma conta gov.br prata ou ouro. Por isso o Vox não usa essa API. Prefere arquivos abertos que não pedem login (falta conferir quais existem) ou deixa a consulta com um parceiro público.
4. **Quando precisar de credencial oficial, quem pede é um parceiro com domínio oficial**, como universidade ou câmara municipal ([ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md), ainda em proposta).
5. **Nada de dinheiro, hospedagem ou "parceria oficial" de governo de nenhuma esfera.** Nenhum dado chega ao governo sem que a própria comunidade o tenha publicado.
6. **Formatos abertos e exportáveis.** Se o Vox sumir, a ata e o caixa continuam valendo.

Em uma frase: **o Vox é o caderno do povo que o governo aceita, não o app do governo que o povo aguenta.** Ponte, não porta dos fundos.

## 5. Por onde começar (candidato)

Erguer as **colunas 1 e 2 juntas, com a 3 logo atrás**:
- as três usam os mesmos dois mini-serviços, ata e caixa;
- são organizadas por gente 50+;
- têm base legal ou dinheiro que volta todo ano: Lei 14.309, PNAE com 45%, PDDE.

Isso continua o que já está decidido para o piloto, o modo assembleia para grupos de WhatsApp ([estratégia de 90 dias](../strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md)). As colunas 5, 6 e 7 trazem a parte viva (missão, pauta, proteção) e respondem ao receio de o Vox virar só cartório ([refino, §2](./brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md#2-cartório-e-palco-são-pouco)).

## 6. O que já existe no código (conferido em 10/11/2026)

- **Funcionando:**
  - `brcode.js` (Pix sem internet);
  - `civic-post.js` (enquetes e apuração);
  - `perma-notary.js`.
- **Escritos e não ligados ao app:**
  - `kit-genesis.js` (modelos bairro, sindicato e coletivo) não é usado por nenhum outro módulo;
  - `webxdc-host.js` também não, e não existe nenhum mini-app pronto: o `urna-pades-govbr` é só um nome na lista.
- **Só no papel:**
  - o selo gov.br do ADR-018 ainda está em proposta;
  - a leitura de dados da Câmara e do Senado só aparece em brainstorm.

O primeiro código seria ligar o `kit-genesis.js` como "Modelos de grupo" e criar os modelos de cooperativa e de escola.

## 7. Riscos

- **A ata assinada no Vox vale para o estatuto?** É a pergunta 6 do [briefing jurídico](../legal/briefing-parecer-g1.md). Não dá para prometer isso antes do parecer.
- **Captura partidária na coluna 5:** cada núcleo é de quem o cria, não existe canal central nem envio em massa, e a direita pró-democrática também cabe.
- **Escola:** só adultos, por causa da regra 18+ ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)). Grêmio estudantil fica fora.
- **Zona rural com sinal ruim:** o modo offline e o pareamento por QR (`airgap-webrtc.js`, ainda não ligado) passam a ser requisito, não luxo.
- **Dependência do parceiro com domínio oficial:** o ADR-018 já prevê vários emissores, para nenhum virar ponto único.
- **Datas e normas novas:** um escritório cita uma Resolução FNDE 17/2026 sobre o PNAE, e há prazos de prestação do PDDE que se contradizem entre as fontes. Confirmar no texto oficial antes de usar em material.

## Referências (consultadas em 10/11/2026)

- [Lei 15.226/2025 (Legisweb)](https://www.legisweb.com.br/legislacao/?id=484211)
- [FNDE determina 45% para a agricultura familiar (Brasil 61)](https://brasil61.com/n/fnde-determina-aplicacao-minima-de-45-dos-recursos-da-merenda-na-agricultura-familiar-bras2616291)
- [Material da Resolução CD/FNDE 04/2026](https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pnae/media-pnae/MaterialIlustrativodaResoluoCD.FNDE04.2026atualizaes.pdf)
- [Resolução CD/FNDE 17/2026 (fonte secundária)](https://www.pauseperin.adv.br/noticia/fnde-altera-regras-para-compra-de-alimentos-da-agricultura-familiar-no)
- [Resolução PDDE 15/2021 (FNDE)](https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/programas/pdde/media-pdde/sobre/RESOLUON15DE16DESETEMBRODE2021.NOVARESOLUOPDDE.PDF.pdf)
- [Síntese do novo PDDE (MPRJ)](https://www.mprj.mp.br/documents/20184/174661/Sintese_Novo_PDDE.pdf)
- [Guia BB Gestão Ágil (SME-SP)](https://educacao.sme.prefeitura.sp.gov.br/wp-content/uploads/2025/01/GuiaBBGestogil.pdf)
- [Catálogo de APIs do gov.br: Controle e Transparência](https://www.gov.br/conecta/catalogo/sistemas/controle-e-transparencia)
- [Orientação sobre a chave da API do Portal da Transparência (fonte secundária)](https://vocepergunta.com/library/artigo/read/41687-como-acessar-o-portal-da-transparencia)
