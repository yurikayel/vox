# Conformidade — Visão Geral Brasil

Documento informativo de alto nível. **Não é parecer jurídico.** Produtores de conteúdo e operadores de espelhos devem consultar advogados locais.

## LGPD (Lei 13.709/2018)

**Como o Vox Fase 1 funciona:**

- Cliente estático: sem cadastro, sem cookies obrigatórios, sem backend Vox coletando dados.
- Consultas GraphQL vão a **terceiros** (gateways Arweave/Turbo); IPs e logs ficam sob política desses operadores.
- Conteúdo publicado on-chain é **público e persistente** — titular que publica dados pessoais de terceiros pode incorrer em responsabilidade civil/regulatória.

**Orientações práticas:**

- Minimize dados pessoais em tags e corpo de transações.
- Direitos do titular (acesso, eliminação): na permaweb, **eliminação técnica plena** pode ser impossível; mitigação = não publicar + filtros client-side + não replicar em espelhos.
- Encarregado/DPO: inexistente no projeto open-source sem operador comercial central — quem rodar espelho comercial assume papéis conforme seu modelo de negócio.

## Marco Civil da Internet (Lei 12.965/2014) e Art. 19

O regime de responsabilidade civil de intermediários no Brasil estabelece distinções fundamentais:

* **Código aberto sem operador central (Fases 1 e 2):** O repositório Vox disponibiliza código de cliente estático sem custodiar bancos de dados ou operar servidores centrais de aplicação.
* **Operadores de espelhos e front-ends curados:** Entidades ou indivíduos que hospedarem e disponibilizarem publicamente instâncias ou espelhos com filtros próprios, domínios comerciais ou seleção de conteúdo podem vir a ser enquadrados juridicamente como **provedores de aplicação de internet**.
* **Responsabilidade por conteúdo de terceiros (Art. 19 / Jurisprudência STF):** Caso um operador de espelho receba ordem judicial específica (ou notificação qualificada conforme modulações do STF) para indisponibilizar conteúdo ilícito, a conformidade deve ser realizada na camada de renderização do front-end (suprimindo a exibição das transações em seus índices locais).
* Para detalhes sobre os procedimentos comunitários de resposta a abusos e remoção em listas de espelhos, consulte [GOVERNANCE.md](./GOVERNANCE.md) (§ Abuso e moderação).

## Conteúdo Político e TSE

A **[Resolução TSE 23.610/2019](http://www.tse.jus.br/)** (e normas correlatas) impõe deveres a **plataformas digitais** no contexto eleitoral brasileiro (transparência, procedimentos, etc.).

- O Vox **não** é, na Fase 1, uma plataforma operada por pessoa jurídica brasileira com moderação centralizada.
- Usuários que divulgarem conteúdo eleitoral pagável ou propaganda política devem cumprir **legislação eleitoral** por conta própria.
- Espelhos, apps derivados ou integrações comerciais podem ser enquadrados como “plataforma” — avaliar caso a caso.

## Moderação vs Lei

Transações de `mod-action` e filtros locais ajudam na auto-organização de comunidades; **não substituem** denúncias a autoridades competentes ou o cumprimento de ordens judiciais específicas aplicáveis a intermediários que você opera.
