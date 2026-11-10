# ADR-024: Divulgação responsável num repositório público e honestidade sobre segurança

**Status:** accepted · **Revisado:** 2026-11-10 · **Tipo:** institucional / processo · **Relacionados:** [SECURITY.md](../../SECURITY.md), [revisão DevSecOps](../audits/revisao-devsecops-2026-11-10.md), [CONTRIBUTORS §1.4 (Honest Copy)](../../CONTRIBUTORS.md), [ADR-014](./014-zero-knowledge-vault-recuperacao-soberana.md)

## 1. Contexto

O repositório `yurikayel/vox` é público, e o ROADMAP, o THREAT-MODEL e o CHANGELOG descrevem defeitos com detalhe. Isso é bom para auditoria, mas em 10/11/2026 a revisão DevSecOps achou falhas críticas de custódia de identidade. Publicar o passo a passo antes da correção entregaria a receita a quem quer tomar contas de militantes.

A mesma revisão achou documentos que prometiam mais do que o código fazia: "conhecimento zero", "sal único", "chaves nunca em claro".

## 2. Decisão

1. **Falha crítica ou alta ainda não corrigida entra nos documentos públicos só com a área afetada, a severidade e o plano.** Nunca com o caminho de exploração. O relatório completo fica fora do repositório público, com o mantenedor, e o caso é aberto num **GitHub Security Advisory privado**.
2. **Depois de corrigida e publicada** (Service Worker novo no ar), a falha pode ser descrita no CHANGELOG e no ROADMAP com o detalhe necessário para quem audita.
3. **Afirmação de segurança precisa de prova.** Documento que diz que algo é cifrado, assinado, anônimo ou "de conhecimento zero" cita o código e o teste que provam isso. Se não há prova, o texto diz "objetivo" ou "em revisão".
4. **Aviso ao usuário vem antes da correção.** Se uma função não protege como prometido, o README e a tela avisam, sem detalhar o ataque, até a correção entrar. Exemplo: "não use o cofre como guarda segura da conta até o PM-90".
5. **Commits e PRs de correção** descrevem o comportamento novo, não o ataque.

## 3. Consequências

- O THREAT-MODEL fica menos detalhado durante a janela de correção. Em troca, o público-alvo não fica exposto.
- **Regra ligada à "Sem Promessas Falsas" (CONTRIBUTORS §1.4):** quem revisa um PR de documentação confere se cada afirmação de segurança tem a sua prova.
- Exige do mantenedor manter o relatório privado e o advisory atualizados. Isso entra no runbook de incidentes.
