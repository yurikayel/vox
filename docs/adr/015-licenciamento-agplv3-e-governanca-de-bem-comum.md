# ADR 015: Licenciamento AGPL-3.0-or-later e Governança de Bem Comum

- **Status:** accepted
- **Data:** 2026-11-05
- **Decisores:** Yuri Kayel e mantenedores do ecossistema Vox
- **Contexto de Governança:** GOV-01, GOV-02 (Dossiê Master N=25 §3.6)

---

## 1. Contexto e Problema

O **Vox** foi concebido como infraestrutura cívica e de comunicação popular para emancipar a classe trabalhadora da tutela e vigilância de conglomerados monopolistas (Big Techs). 

Durante a fase inicial de prototipagem, o repositório carecia de uma declaração formal de licença de código aberto e de instrumentos públicos de governança (custódia, autoria, reporte de segurança). Com a maturidade do sistema (mais de 780 testes automatizados, suporte aos 4 principais sistemas operacionais, cartuchos soberanos Webxdc, Zero-Knowledge Vault e Cockpit POSSE), tornou-se imperativo blindar juridicamente o ecossistema contra:
1. **Apropriação Privada Parasitária:** Apropriação do código por empresas privadas que poderiam fechar o software ou convertê-lo em monopólio proprietário.
2. **Brecha do SaaS / Nuvem (*SaaS Loophole*):** Risco decorrente de licenças permissivas (MIT/BSD/Apache) ou da GPLv2/v3 clássica, que permitem que plataformas multinacionais rodem o código em servidores remotos oferecendo serviços pela rede sem qualquer obrigação de disponibilizar as melhorias e o código-fonte aos usuários.
3. **Indefinição de Direitos Autorais e Segurança:** Ausência de uma declaração canônica de autoria (`AUTHORS.md`), política de reporte responsável de vulnerabilidades (`SECURITY.md`) e regras de contribuição recíproca (`CONTRIBUTORS.md`).

---

## 2. Decisão

Adotamos a **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)** como a única licença canônica para o cliente Vox, nós de apoio Vox Populi e ferramentas associadas.

Complementarmente, estabelecemos a estrutura documental canônica de governança aberta:
1. **`LICENSE`:** Texto integral oficial da GNU AGPLv3.
2. **`package.json`:** Metadado de licença definido estritamente como `"license": "AGPL-3.0-or-later"`.
3. **`AUTHORS.md`:** Reconhecimento da autoria moral de Yuri Kayel como fundador e de todos os colaboradores do projeto.
4. **`CONTRIBUTORS.md`:** Estabelecimento do Developer Certificate of Origin (DCO), copyleft recíproco e diretrizes de submissão de código sob as métricas de hardening do projeto.
5. **`SECURITY.md`:** Política de segurança *fail-closed*, com SLA de resposta a relatórios de vulnerabilidade e canais confidenciais de divulgação responsável.
6. **`docs/legal/licenca-e-contribuicoes.md`:** Documento de aprofundamento teórico sobre a proteção do bem comum digital e fundamentação anticapitalista da Seção 13 da AGPLv3.

---

## 3. Consequências e Efeitos

### Efeitos Positivos
- **Proteção da Seção 13 da AGPLv3:** Qualquer entidade corporativa, provedor de internet ou governo que modificar o Vox e oferecê-lo via rede de computadores (nuvem, SaaS, API ou nó remoto) é **legalmente obrigado** a compartilhar o código-fonte integral sob a mesma licença AGPLv3 a todos os cidadãos que interajam com ele.
- **Inalienabilidade do Bem Comum:** O código passa a ser patrimônio coletivo público garantido por instrumentos de direito autoral internacional, impedindo cerceamento ou "abraçar, estender e extinguir".
- **Clareza de Contribuição:** Desenvolvedores sabem exatamente sob quais condições suas colaborações serão protegidas e integradas, sem risco de expropriação futura por entidades comerciais.
- **Soberania e Auditabilidade:** Políticas de segurança formais incentivam hackers éticos e pesquisadores a auditar o código com garantia de proteção e canal de contato direto.

### Trade-offs Conhecidos
- **Incompatibilidade com Softwares Fechados:** Grandes corporações avessas a copyleft forte não poderão embutir o Vox em produtos proprietários de código fechado. Essa restrição é um objetivo deliberado de design, não uma limitação.
- **Custódia em Transição:** A licença garante a liberdade do software, mas a distribuição da governança administrativa do repositório (chaves de deploy, domínio e organização) segue como próximo passo prático do projeto (GOV-03).
