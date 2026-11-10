# Política de Segurança (SECURITY.md)

A segurança, privacidade e soberania criptográfica dos usuários do Vox são compromissos inegociáveis. O Vox adota uma postura **fail-closed**, em que a privacidade e integridade têm prioridade sobre a conveniência de rede.

---

## 1. Versões Suportadas

| Linha | Versão | Status de Suporte |
|:---|:---|:---|
| Vox Web / PWA | v0.5.x+ | Suporte Ativo a Correções de Segurança |
| VoxPopuli / Relay | v0.5.x+ | Suporte Ativo a Correções de Segurança |
| Versões Anteriores | < v0.5.0 | Descontinuadas (Recomendada Atualização Imediata) |

---

## 2. Diretrizes Criptográficas e Vetores Protegidos

- **Identidade e Chaves Soberanas:** Chaves privadas (WebCrypto ECDSA P-256) são geradas localmente no aparelho do usuário. Desde o SW v7.63 ficam **cifradas por uma chave do aparelho não exportável**. Desde o SW v7.64, depois do backup com a Senha Soberana, a identidade e a DM viram **chaves não exportáveis** e só saem do aparelho pela cópia cifrada com a senha (PM-93, [ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md)). Desde o SW v7.65, o relay e o nó Windows só regravam um cofre com a prova do dono e só apagam uma mensagem da caixa com a chave do destinatário, e conferem `Host`, `Origin` e `Content-Type` (PM-94, [ADR-027](./docs/adr/027-autorizacao-no-relay-dono-e-origem.md)).
- **Armazenamento Seguro:** o export `.voxid` e o cofre de recuperação v2 ([ADR-025](./docs/adr/025-cofre-v2-so-a-senha-abre.md), PM-90) usam PBKDF2-SHA256 com sal aleatório e AES-GCM-256. O cofre abre só com a Senha Soberana; login social não é chave.
- **Sem Telemetria ou Rastreamento:** O Vox não utiliza SDKs de Analytics, trackers de terceiros ou identificadores persistentes centralizados.
- **Criptografia de Ponto a Ponto (P2P / DMs):** Mensagens diretas entre nós utilizam envelopes cifrados assinados digitalmente.
- **Isolamento de Cartuchos:** Cartuchos Webxdc são executados em iframes com `sandbox` estrito sem `allow-same-origin`, com CSP restritivo e prevenção de vazamento de tráfego.

---

## 3. Relatando Vulnerabilidades

Se você descobriu uma falha de segurança, vulnerabilidade criptográfica ou vetor de exploração no Vox:

1. **Não divulgue publicamente** via issues abertas até que uma correção tenha sido desenvolvida e testada.
2. **Envie um relatório confidencial** diretamente ao mantenedor via:
   - **GitHub Security Advisories:** [https://github.com/yurikayel/vox/security/advisories](https://github.com/yurikayel/vox/security/advisories)
   - **E-mail:** Canal seguro informado no perfil do mantenedor no GitHub ([@yurikayel](https://github.com/yurikayel)).
3. **Informações Desejáveis:**
   - Descrição técnica detalhada da vulnerabilidade.
   - Prova de conceito (PoC) ou passos reproduzíveis.
   - Avaliação do impacto potencial (ex: vazamento de chaves, desanonimização, negação de serviço em nó local).

---

## 4. Prazo de Resposta e Correção Responsável

- **Confirmação inicial:** Em até 48 horas após o recebimento do relato.
- **Avaliação e Triagem:** Em até 5 dias úteis.
- **Lançamento de Hotfix:** Correções de severidade crítica ou alta serão priorizadas com tag de emergência no repositório público e changelog explícito.
- **Reconhecimento Ético:** Pesquisadores que reportarem falhas de forma responsável serão creditados publicamente nas notas de release e no `CONTRIBUTORS.md` (a menos que prefiram anonimato).
