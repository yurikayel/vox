# Guia de Contribuição e Registro de Contribuidores (CONTRIBUTORS.md)

O Vox é um bem comum digital sob licença **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**. Contribuições são bem-vindas de qualquer pessoa comprometida com a transparência, rigor técnico e emancipação dos cidadãos.

---

## 1. Princípios de Contribuição

1. **Copyleft Recíproco (AGPLv3):** Todas as contribuições submetidas a este repositório são irrevogavelmente licenciadas sob a GNU AGPL-3.0-or-later (conforme detalhado em [`docs/licenca-e-contribuicoes.md`](./docs/licenca-e-contribuicoes.md)).
2. **Developer Certificate of Origin (DCO):** Ao enviar um commit ou Pull Request com a flag `-s` ou `Signed-off-by: Nome <email>`, você atesta que tem direito autoral sobre o código e consente com sua inclusão pública sob a AGPLv3.
3. **Hardening e Limites de Complexidade:**
   - Funções com no máximo 30 linhas de código lógico (LLOC $\le 30$).
   - Aninhamento máximo de 4 níveis de profundidade (`nesting $\le 4$`).
   - Complexidade cognitiva máxima de 15 por método.
   - Zero dependências de telemetria invasiva ou serviços comerciais proprietários.
4. **Sem Promessas Falsas (Honest Copy):** Funcionalidades devem descrever capacidades reais testadas e mensuráveis; promessas futuras ou propostas não devem ser vendidas como prontas na interface.

---

## 2. Como Contribuir

1. **Bugs e Relatos:** Abra uma *Issue* no GitHub detalhando o comportamento observado, passos para reprodução e ambiente (navegador, OS).
2. **Desenvolvimento Local:**
   ```bash
   git clone https://github.com/yurikayel/vox.git
   cd vox
   npm install
   npm test
   npm run lint
   ```
3. **Submissão:** Submeta Pull Requests apontando para a branch `develop`. Garanta que todos os testes passem (`npm test` e `npm run lint`) antes de solicitar revisão.

---

## 3. Rol de Contribuidores

Agradecemos a todos que dedicam tempo, reflexão crítica e código à soberania digital popular:

- **Yuri Kayel** ([@yurikayel](https://github.com/yurikayel)) — Autor, arquiteto e mantenedor original.
- **Comunidade de Testadores e Pesquisadores Cívicos** — Relatórios de usabilidade, auditorias de segurança, validação de nós locais e debates conceituais.

*(Para adicionar seu nome após um PR aceito, adicione uma linha a esta seção mantendo ordem alfabética ou cronológica).*
