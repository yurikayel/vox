# Política de Licenciamento e Proteção do Bem Comum Digital (GOV-02)

## 1. Decisão Canônica de Licença: GNU Affero General Public License v3.0 (AGPL-3.0-or-later)

> Registro formal da decisão: [ADR-015](./adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md). DCO e como contribuir: [CONTRIBUTORS.md](../CONTRIBUTORS.md). Este arquivo detalha a política.

O **Vox** é um projeto cívico, popular e local-first cujo propósito é a **emancipação comunicativa da classe trabalhadora** e a construção de infraestrutura digital fora do jugo do grande capital financeiro monopolista.

Em consonância com as metas de governança estabelecidas no inventário do projeto (GOV-02), o repositório é formalmente licenciado sob os termos da:

> **GNU Affero General Public License Version 3 (AGPL-3.0-or-later)**  
> Texto integral: [`LICENSE`](../LICENSE)

---

## 2. A Fundamentação Anticapitalista da AGPLv3

### 2.1. O Problema das Licenças Permissivas (MIT / BSD / Apache)
Licenças permissivas como MIT e BSD foram desenhadas nos centros universitários e corporativos do Vale do Silício. Elas permitem que qualquer corporação transnacional (Google, Meta, Amazon, Microsoft):
1. Copie o trabalho coletivo e voluntário dos desenvolvedores.
2. Adicione recursos fechados proprietários.
3. Suba o software em sua nuvem privada (AWS, Azure, GCP).
4. Venda o acesso como serviço (SaaS), monetizando dados e explorando trabalhadores sem ser obrigada a devolver **uma única linha de código** à comunidade.

### 2.2. Por que a GPLv3 Tradicional não Bastava (A Brecha da Nuvem / SaaS Loophole)
A GPL clássica (v2 e v3) exige que qualquer redistribuição de binários seja acompanhada do código-fonte. Contudo, na era do capitalismo de plataforma, as Big Techs não distribuem binários: elas rodam o código em seus datacenters e entregam apenas a interface web ou API. A GPLv3 não considerava a execução em servidor como "distribuição", criando a brecha pela qual corporações se apropriaram de projetos livres para construir impérios monopolistas.

### 2.3. O Escudo da GNU AGPLv3 (Seção 13)
A **AGPLv3** foi concebida especificamente para fechar essa brecha. A **Seção 13** estipula expressamente:

> *"Se você modificar o Programa, sua versão modificada deve oferecer proeminentemente a todos os usuários que interajam com ela remotamente através de uma rede de computadores (...) a oportunidade de receber o Código-Fonte Correspondente da sua versão (...) sem cobrança de taxa."*

**Efeito Prático para o Vox:**
- Nenhuma corporação pode hospedar uma instância modificada do Vox ou do Vox Populi em servidores privados fechados.
- Se uma empresa ou governo subir um nó ou fork na nuvem, ela é **legalmente obrigada por lei internacional** a disponibilizar todo o código-fonte modificado a qualquer usuário que acesse a rede.
- As forças produtivas digitais do Vox permanecem **bem comum inalienável da humanidade**.

---

## 3. Direitos dos Contribuidores e Termos de Contribuição

1. **Autoria e Crédito:** Todos os contribuidores mantêm a autoria moral de seus códigos e são creditados nos registros do repositório.
2. **Copyleft Recíproco:** Ao submeter um Pull Request ao Vox, o autor concorda que suas contribuições serão integradas sob os termos da licença GNU AGPL-3.0-or-later.
3. **Sem Cláusulas Proprietárias:** Nenhuma contribuição que exija dependências proprietárias ou imponha restrições que impeçam o cumprimento da AGPLv3 será aceita na árvore principal.
