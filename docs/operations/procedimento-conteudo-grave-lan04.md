# Procedimento de resposta a conteúdo grave (LAN-04)

> **Status:** rascunho · **Owner:** mantenedor / moderação · **Revisado:** 2026-11-22  
> **Nota de prontidão:** só passa a `canônico` após o parecer jurídico **`REV-12`**, nomeação da 2ª pessoa no plantão ([`LAN-30`](../process/segunda-pessoa-acesso-gradual.md)) e **1 simulado datado** antes do portão **G2**.

Playbook operacional de 1 página para contenção de conteúdo ilícito grave no Vox, alinhado a [`COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md) e ao [`runbook-incidentes.md`](./runbook-incidentes.md).

---

## 1. Categorias cobertas e SLA

| Categoria | Referência | Meta de contenção (SLA) |
|---|---|---|
| Abuso e exploração sexual infantil (CSAM) | ECA / ECA Digital / Decreto 12.976/2026 | **≤ 2 h** (ação imediata) |
| Divulgação não consentida de imagem íntima | Decreto 12.976/2026 | **≤ 2 h** |
| Terrorismo e incitação a violência extrema | Decreto 12.976/2026 / legislação penal | **≤ 2 h** |
| Tráfico de pessoas | Legislação penal / dever de cuidado | **≤ 2 h** |
| Violência contra a mulher | Legislação penal / dever de cuidado | **≤ 2 h** |

**Gatilho de pausa de onda ([`plano-lancamento-ondas.md`](../strategy/plano-lancamento-ondas.md)):** qualquer ocorrência grave **sem resposta dentro do prazo de ≤ 2 h** autoriza qualquer pessoa do plantão a fechar convites imediatamente e ativar `communityCreate: false`.

---

## 2. Fluxo de contenção em 5 passos

1. **Triagem e confirmação de severidade (0–15 min):**
   - Receber o alerta via denúncia assinada no app (`LAN-12`) ou canal externo de não usuário/autoridade.
   - Confirmar se o caso se enquadra em uma das categorias da §1 e registrar a hora exata de início (`t0`) na issue privada ou canal interno de plantão (**nunca** colar mídia ou descrição gráfica ilegal no registro).
2. **Entrada na `hide-list` oficial do PWA (`LAN-13`):**
   - Inserir `postId` / `txId`, motivo codificado e timestamp na lista de ocultação assinada do PWA oficial (`LAN-13`, especificada no [backlog público](../strategy/backlog-lancamento-publico-2026-11.md)).
   - Enquanto `LAN-13` não estiver implantada no cliente e enquanto o parecer `REV-12` não concluir a redação final, executar a supressão na camada controlada (índice/espelho oficial) e orientar os moderadores locais (`mod-action`) sem expor a identidade de quem denunciou.
   - *Limite técnico honesto:* ocultar no PWA oficial ou em espelhos **não** apaga dados já replicados localmente em aparelhos P2P nem registros legados on-chain ([`COMPLIANCE-BR.md`](../legal/COMPLIANCE-BR.md)).
3. **Checagem do Kill-switch (`LAN-08`):**
   - Inspecionar [`client/config/flags.json`](../../client/config/flags.json).
   - Confirmar que `arweaveUpload` está `false` (se estiver `true` durante incidente com risco de persistência, alterar imediatamente para `false` via commit em `main`).
   - Se houver abuso coordenado em novas comunidades, definir `communityCreate: false` e, quando cabível, publicar `notice` curto (≤ 280 caracteres).
4. **Preservação mínima de evidência (SEM redistribuição):**
   - **PROIBIDO baixar, salvar cópia local, tirar captura de mídia ilícita, encaminhar ou anexar imagens/vídeos em issues, e-mails ou chats** (especialmente CSAM e intimidade não consentida).
   - Registrar **exclusivamente** metadados mínimos não-redistribuíveis: `postId` / `txId` (ou hash SHA-256), `routeId` (`vx_...`) e chave pública do autor aparente, timestamps (UTC/BRT) de detecção (`t0`) e de contenção, origem da denúncia e ações aplicadas.
5. **Escalonamento externo:**
   - Encaminhar o registro mínimo às autoridades competentes conforme a categoria, observando que a redação jurídica padrão de encaminhamento aguarda o parecer **`REV-12`** ([`ROADMAP.md`](../ROADMAP.md)):
     - **SaferNet Brasil:** canal oficial de denúncia para CSAM, violência contra a mulher, íntimo não consentido e crimes contra direitos humanos na internet.
     - **Polícia Federal / Delegacia Especializada de Crimes Cibernéticos** (ou Polícia Civil estadual competente): terrorismo, tráfico de pessoas, CSAM e demais ilícitos penais.
     - **Conselho Tutelar:** sempre que houver criança ou adolescente identificado em situação de risco imediato.

---

## 3. Matriz de plantão (2 pessoas — zero ponto único de falha)

Regra do [`LAN-30`](../process/segunda-pessoa-acesso-gradual.md): **G2 não abre sem 2 pessoas no plantão**. Nomes reais e contatos privados ficam exclusivamente no canal restrito/cofre de plantão — **nunca** em texto aberto no Git.

| Papel | Responsabilidade | Acessos mínimos exigidos (com 2FA) | Escalonamento de backup |
|---|---|---|---|
| **Plantonista Primário (Titular)** | Triagem inicial (`t0`), atualização da `hide-list` (`LAN-13`), ajuste de `flags.json` e registro mínimo | GitHub Write (`main` hotfix), canal privado de denúncias, assinatura da `hide-list` | Se não confirmar leitura em **30 min**, o alerta escala automaticamente para o Secundário |
| **Plantonista Secundário (Backup)** | Cobertura em ausência/férias do Primário, revisão dupla de contenção e apoio no escalonamento externo | Mesmos acessos e credenciais do Primário no cofre compartilhado (`LAN-30`) | Assume contenção integral em **≤ 30 min** e notifica o mantenedor/jurídico (`REV-12`) |

---

## 4. Registro de simulados (Tabletop Drill Log)

> **Estado atual:** `0 simulados realizados — pendente antes de G2`.

| Data | Cenário simulado | Participantes (Primário + Backup) | Tempo até conter (meta ≤ 2 h) | Ajustes no playbook |
|---|---|---|---|---|
| — | *(pendente)* | — | — | — |
