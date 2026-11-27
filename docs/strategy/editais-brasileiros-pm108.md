# Matriz de Editais Brasileiros e Financiamento Cívico (PM-108)

> **Status:** rascunho · **Owner:** mantenedor · **Revisado:** 2026-11-22
> Não substitui o [ROADMAP](../ROADMAP.md). Plano B de sustentabilidade complementar ao **LAN-36** (proposta de financiamento, mantida fora do repositório), após o encerramento do NGI Zero Commons Fund em 01/06/2026 ([pesquisa-complementar §1-H](../research/pesquisa-complementar-2026-11.md#h-financiamento)). Alimenta o orçamento de 12 meses (**LAN-32**).

> **Regra estrita de honestidade (zero invenção):** nenhuma data-limite de ciclo futuro (2027/2028) nem teto de valor não verificado em edital aberto é presumido aqui. Todos os campos dependentes do calendário vigente trazem o marcador **`[confirmar no edital vigente]`** para conferência na fonte oficial antes de iniciar a escrita.

---

## 1. Contexto e gargalo jurídico de elegibilidade (`REV-18`)

Conforme o diagnóstico do projeto ([backlog §4](./backlog-lancamento-publico-2026-11.md)), o Vox opera hoje sem pessoa jurídica constituída (`REV-18` aberto) e com custos operacionais atuais de **R$ 0/mês** em free tiers ([INFRA-CUSTOS.md](../INFRA-CUSTOS.md)). Na prática, a elegibilidade a editais no Brasil divide-se em dois regimes:

1. **Sem CNPJ próprio (Pessoa Física ou parceria com ICT / Universidade):** depende de o edital aceitar proponente individual, coletivo informal com representante PF ou submissão ancorada em docente/pesquisador vinculado a Instituição Científica, Tecnológica e de Inovação (ICT) ou projeto de extensão universitária (**PM-107**).
2. **Com CNPJ ativo / Associação sem fins lucrativos (`REV-18`):** exige estatuto, diretoria, CNPJ regular, certidões negativas e conta bancária jurídica — o que também destrava representante legal no país (item 11 do STF) e chave Pix sem expor CPF no DICT (**REV-13**).

Qualquer fonte avaliada precisa respeitar os limites de [POSITIONING.md](../product/POSITIONING.md): software livre (AGPL), sem custódia de dados de usuários, sem venda de dados e sem dependência exclusiva de ente público para existir ([ADR-018](../adr/018-selo-govbr-via-parceiro-publico.md)).

---

## 2. Trilha A — Extensão Universitária, Pesquisa Pública e ICTs (Brasil)

Caminho prioritário enquanto o Vox não tem CNPJ, porque a universidade pública ou fundação de apoio atua como entidade proponente/executora e financia bolsas, pesquisa aplicada ou revisão técnica (ex.: revisão de criptografia **LAN-18**, testes em dispositivos móveis **PM-70** / **PM-73**, nós de sinalização **PM-107**).

| Programa / Órgão | Escopo aderente ao Vox | Elegibilidade: Sem CNPJ vs. Exige CNPJ | Esforço e compliance | Janela / Valor |
|---|---|---|---|---|
| **PROEX / MEC e editais internos de extensão universitária** | Turmas de extensão (**PM-107**), oficinas locais com comunidades piloto (**PIL-01**), acessibilidade (**LAN-22**) e testes em celulares de entrada (**LAN-23**) | **Sem CNPJ do Vox:** proponente é docente efetivo de IES pública (ou privada comunitária/filantrópica conforme edital interno). O Vox entra como projeto/parceiro comunitário ou código aberto adotado | **Baixo–médio** para o mantenedor (burocracia fica com o docente e a pró-reitoria); exige plano de aula/entregas semestrais | `[confirmar no edital vigente]` (calendário semestral de cada IES; bolsas de extensão e custeio pequeno) |
| **FAPs Estaduais** (ex.: **FAPESP**, **FAPERJ**, **FAPEMIG** e congêneres) | Pesquisa aplicada em redes P2P, privacidade, resiliência local-first, medição de conectividade ou tecnologia social | **Depende da linha:** linhas acadêmicas/extensão exigem pesquisador vinculado a ICT do respectivo estado (sem CNPJ do Vox); linhas de inovação empresarial (ex.: PIPE/subvenção) **exigem CNPJ** de empresa/startup constituída | **Alto:** projeto detalhado, prestação de contas formal no sistema da FAP e relatórios técnicos periódicos | `[confirmar no edital vigente]` (chamadas temáticas anuais ou fluxo contínuo conforme a FAP e a modalidade) |
| **CNPq / FINEP — Tecnologia Social, Software Público e Extensão Tecnológica** | Infraestrutura cívica aberta, inclusão digital, tecnologia social para associações comunitárias e agricultura familiar | **Em regra exige vínculo ICT ou CNPJ:** chamadas acadêmicas vão via pesquisador/ICT; chamadas de subvenção ou convênio direto com entidade da sociedade civil **exigem CNPJ** (usualmente ≥ 1–3 anos de constituição, conforme chamada) | **Alto:** exige plano de trabalho, orçamento rubricado, certidões e prestação de contas SICONV/Transferegov ou equivalente | `[confirmar no edital vigente]` (janelas por chamada pública específica) |

---

## 3. Trilha B — Fundos Cívicos Brasileiros, Direitos Digitais, Jornalismo & Democracia

| Programa / Fundo | Escopo aderente ao Vox | Elegibilidade: Sem CNPJ vs. Exige CNPJ | Esforço e compliance | Janela / Valor |
|---|---|---|---|---|
| **NIC.br / CGI.br** (projetos, chamadas de pesquisa e infraestrutura Web/Internet) | Padrões abertos Web, resiliência de rede sem servidor único, medição de sinalização (**PM-18**), segurança WebCrypto (**PM-12**) e acessibilidade | **Verificar modalidade:** bolsas/chamadas de pesquisa acadêmica aceitam pesquisador PF/ICT; contratos, patrocínios e convênios de projeto normalmente **exigem CNPJ** (entidade sem fins lucrativos ou ICT) | **Médio–alto:** alinhamento técnico rigoroso com governança da Internet e padrões abertos; relatórios de entrega | `[confirmar no edital vigente]` (verificar editais abertos no portal NIC.br/CGI.br) |
| **Fundo Brasil de Direitos Humanos** | Proteção digital de ativistas/comunidades, liberdade de expressão sem vigilância, organização comunitária | **Híbrido conforme edital:** editais de base frequentemente aceitam coletivos informais/grupos sem CNPJ (mediante regras de representação ou parceiro fiscal definidas em cada chamada), enquanto outras linhas exigem **CNPJ sem fins lucrativos (`REV-18`)** | **Médio:** formulário voltado a impacto social e direitos humanos, orçamento simples e relatório narrativo/financeiro | `[confirmar no edital vigente]` (chamadas temáticas anuais/periódicas) |
| **Instituto Betty e Jacob Lafer** (e fundações brasileiras de democracia/esfera pública análogas) | Fortalecimento democrático, combate à desinformação sem censura central, transparência municipal/cívica | **Em regra exige CNPJ (`REV-18`):** foco em organizações da sociedade civil constituídas (associações/institutos) com governança e histórico mínimo (ou patrocinador fiscal aceito no ciclo) | **Médio–alto:** exige tese de impacto institucional, plano anual e prestação de contas de OSC | `[confirmar no edital vigente]` (processos seletivos periódicos ou cartas-consulta) |
| **OTF — Internet Freedom Fund** *(complemento internacional acessível do Brasil)* | Comunicação resiliente P2P/Nostr/WebRTC, criptografia no navegador, auditoria externa (**LAN-18**) e uso em campo com comunidades | **Aceita Sem CNPJ (PF / equipe):** aberto a indivíduos, coletivos e organizações fora dos EUA, sujeito à revisão técnica e conformidade legal | **Alto:** nota conceitual + proposta completa em inglês, revisão por pares da área de liberdade na Internet | Fluxo contínuo com janelas periódicas de revisão; faixa histórica de terceiros citada em [pesquisa §1-H](../research/pesquisa-complementar-2026-11.md#h-financiamento) — `[confirmar no edital vigente]` |
| **Luminate / Open Society Foundations** *(complementos internacionais de tech cívica & democracia)* | Infraestrutura cívica aberta, integridade informacional, soberania digital e pesquisa jurídica/regulatória | **Em regra exige CNPJ (`REV-18`)** ou *fiscal sponsor* formalmente aceito (e muitos programas operam por convite ou chamadas fechadas, não por balcão aberto contínuo) | **Alto:** diligência institucional pesada, governança (`LAN-31`), auditoria financeira e impacto mensurável | `[confirmar no edital vigente]` (verificar se há chamada aberta para América Latina / Brasil) |
| **GitHub Sponsors (`REV-22`)** *(não é edital — fluxo contínuo)* | Manutenção contínua do repositório, custeio de domínio e reservas operacionais | **Sem CNPJ (PF):** Brasil é região aceita, com **0% de taxa** para patrocínio em conta pessoal ([pesquisa §1-H](../research/pesquisa-complementar-2026-11.md#h-financiamento)) | **Baixo:** configurar `FUNDING.yml` + transparência no relatório trimestral ([PM-103](./relatorio-trimestral-estado-praca-pm103.md)) | Contínuo; sem teto fixo |

> **Nota sobre *fiscal sponsorship* (Open Collective / OSC parceira):** conforme registrado em [pesquisa-complementar §3](../research/pesquisa-complementar-2026-11.md#3-não-encontrado-não-preencher-com-suposição), a aceitação de hosts internacionais do Open Collective para recebedores no Brasil e as regras tributárias de repasse ainda **não foram verificadas** — confirmar antes de prometer recebimento por essa via.

---

## 4. Tabela de Decisão: Antes vs. Depois do `REV-18` (Associação / PJ)

A escolha de onde investir horas de escrita segue o estado institucional do projeto e o retorno esperado sobre o tempo do mantenedor (regra de corte do [brainstorm 2027](../brainstorms/brainstorm-roadmap-2027.md)):

| Momento institucional | Prioridade | Onde aplicar primeiro | Condição de entrada (não aplicar no escuro) |
|---|---|---|---|
| **Agora → T1/2027 (Sem CNPJ / PF)** | **1ª** | **NLnet Restack (`LAN-36`, até 03/01/2027)** + **GitHub Sponsors (`REV-22`)** | Confirmar por e-mail a elegibilidade de proponente brasileiro ou fechar co-proponente na UE (proposta de financiamento, mantida fora do repositório) |
| **T1–T2/2027 (Sem CNPJ, via parceria ICT)** | **2ª** | **Extensão Universitária (PROEX / `PM-107`)** + **FAP estadual via docente** | Professor parceiro nomeado e interessado em adotar o Vox como caso real de extensão/pesquisa (destrava também revisão técnica para `LAN-18` e testes em celulares) |
| **T2/2027+ (Sem CNPJ, com piloto G1 medido)** | **3ª** | **OTF Internet Freedom Fund** + **Fundo Brasil** *(só se o edital vigente aceitar coletivo sem CNPJ)* | Ter **relatório real do piloto (`PIL-03`)** + dados de campo de `PM-18` publicados no [PM-103](./relatorio-trimestral-estado-praca-pm103.md) |
| **Pós-`REV-18` (Associação/PJ com CNPJ ativo e governança `LAN-31`)** | **4ª** | **NIC.br/CGI.br (projetos PJ)**, **FINEP/CNPq (sociedade civil)**, **Instituto Lafer / fundações de democracia BR**, **Luminate/OSF** | CNPJ regularizado, conta bancária da associação, bus factor ≥ 2 (`LAN-30`) e contabilidade estimada cabendo na verba do edital |

### Critérios explícitos de "não se candidatar" (proteção contra desperdício)

Recusar ou adiar qualquer edital que:
1. Exija contrapartida financeira em dinheiro que o coletivo não tenha;
2. Exija exclusividade proprietária, custódia central de dados ou remoção de licença livre (violação de [POSITIONING.md](../product/POSITIONING.md));
3. Tenha prazo inferior a **14 dias** sem documento-base e orçamento já prontos;
4. Exija CNPJ constituído há mais de 1 ano antes de o `REV-18` existir (salvo parceria formal com associação madrinha que já cumpra o requisito e compartilhe a governança).

---

## 5. Pacote de evidências reutilizável (conexão com `PM-103` e `LAN-32`)

Para evitar reescrever justificativas do zero em cada edital, toda submissão deve reutilizar diretamente artefatos já mantidos no repositório:
1. **Orçamento e custos reais:** tabela de componentes de [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) + série histórica em R$ do [Relatório Trimestral Estado da Praça (PM-103)](./relatorio-trimestral-estado-praca-pm103.md);
2. **Métricas técnicas e maturidade:** contagens atualizadas em [release-metadata.json](../release-metadata.json), resultados de campo de `PM-18` e cobertura de testes sem servidor central;
3. **Impacto comunitário:** retrospectiva assinada do piloto (`PIL-03`) e registros agregados zero-PII de moderação (`REV-20`).
