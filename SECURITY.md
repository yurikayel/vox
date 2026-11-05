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

- **Identidade e Chaves Soberanas:** Chaves privadas (WebCrypto ECDSA P-256) geradas localmente no aparelho do usuário nunca transitam em texto plano na rede.
- **Armazenamento Seguro:** Segredos, backups e perfis cifrados usam PBKDF2/AES-GCM com sal único e derivação forte de chaves.
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
