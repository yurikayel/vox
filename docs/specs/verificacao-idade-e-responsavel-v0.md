# Proposta de Feature — Verificação de idade (13+) e vínculo com responsável

> **Status:** rascunho (v0.1), **não aprovado** · **Owner:** mantenedor · **Criado:** 2026-11-25 · **Escopo:** entrada, conta, cofre (identidade **congelada** desde 17/11 — exige destrancar) · **Alvo de índice:** `docs/README.md` (seção `1. Arquitetura e protocolo`) · **Relacionados:** `IDENTITY.md`, `THREAT-MODEL.md`, `legal/COMPLIANCE-BR.md`, `ADR-014` (cofre), `ADR-024`, `ADR-037` (cofre na malha)
> **Nota de governança (`ADR-017`):** este documento especifica arquitetura, contratos e critérios de aceite; não contém caixas `[ ]` de acompanhamento (que existem exclusivamente no `ROADMAP.md`).
> **Nota jurídica:** a leitura de ECA Digital e LGPD aqui é técnica, **não é parecer**. Nada sai do laboratório antes do parecer (§9).

---

## 1. Resumo

O Vox passa a exigir **idade mínima de 13 anos** e a verificar a **faixa etária de todas as contas** por um **atestado de faixa assinado**, guardado no cofre cifrado (opção C). Um **selo "verificado"** opcional (telefone ou documento) libera recursos de mais risco (opção E).

Contas de **13 a 15 anos** só nascem por **convite do responsável legal**, que é declarado e checado. A faixa do próprio adolescente também é verificada. O responsável tem **supervisão limitada e visível ao adolescente** (tempo, contatos, conteúdo), **sem acesso a mensagens cifradas**. O controle **acaba aos 16**. Aos 18 o vínculo **é apagado**. O responsável **pode ser trocado**.

## 2. Objetivos, não-objetivos e invariantes

### 2.1 Objetivos
1. Barrar quem tem menos de 13 anos sem guardar foto, documento, e-mail ou data de nascimento.
2. Atender à exigência do ECA Digital de que contas abaixo de 16 anos em rede social fiquem vinculadas a um responsável, com ferramentas de supervisão.
3. Aplicar padrões protetivos a todo menor de 18 anos, mesmo sem responsável vinculado (16–17).
4. Manter o modelo local-first: a verificação gera um dado pequeno e assinado; o Vox não opera banco de identidades.

### 2.2 Não-objetivos
- Não há leitura de DMs E2E pelo responsável, nem chave de escrow, nem "modo espião".
- Não há vínculo eterno. O controle termina aos 16 e o vínculo some aos 18.
- Não há verificação de parentesco por certidão dentro do Vox (ver §9, Q3).
- Não há piloto com pessoas reais enquanto valer o adiamento de 17/11.

### 2.3 Invariantes
| # | Invariante |
| :--- | :--- |
| I1 | O Vox guarda **só a faixa** (`13-15`, `16-17`, `18+`) e o **mês em que ela muda**. Não guarda data de nascimento, documento nem selfie. |
| I2 | O atestado é **assinado pelo emissor** e **amarrado à chave pública da conta**. Ele não serve para outra conta. |
| I3 | Toda regra de supervisão ativa aparece **na tela do adolescente**: o que o responsável vê e o que ele limita. |
| I4 | O responsável **nunca** recebe o conteúdo de DMs nem a chave do cofre do adolescente. |
| I5 | Aos 16 as regras de supervisão param de valer **automaticamente**, sem ação de ninguém. |
| I6 | Aos 18 o registro de vínculo é apagado dos dois cofres. O apagamento vindo de fora segue preferência, não garantia (ver memória de preservação). |
| I7 | Abaixo de 13, nada é criado. O que foi digitado é descartado no aparelho. |
| I8 | Só o cliente aplica as regras (local-first). O `THREAT-MODEL.md` registra que um cliente adulterado contorna a supervisão (§8). |

## 3. Modelo de dados

### 3.1 `AgeAttestation` (no cofre da conta)
```json
{
  "v": 1,
  "kind": "vox.age-attestation",
  "subject": "<chave pública da conta>",
  "band": "13-15 | 16-17 | 18+",
  "nextBandAt": "2028-03",
  "method": "provider-selfie | provider-document | guardian-cosign",
  "issuer": "<chave pública do emissor>",
  "issuedAt": "2026-11-25T00:00:00Z",
  "sig": "<assinatura do emissor>"
}
```
- `nextBandAt` tem precisão de mês e é omitido em `18+`. Ele substitui a data de nascimento (I1).
- O cliente recalcula a faixa vigente a partir de `band` e `nextBandAt`. Não há nova verificação ao mudar de faixa.
- O emissor é uma decisão aberta (§9, Q1).

### 3.2 `GuardianLink` (no cofre dos dois lados; não é publicado)
```json
{
  "v": 1,
  "kind": "vox.guardian-link",
  "minor": "<chave pública do adolescente>",
  "guardian": "<chave pública do responsável>",
  "declaredRelation": "mae | pai | tutor | guarda-judicial | outro-responsavel-legal",
  "createdAt": "...",
  "controlEndsAt": "<mês dos 16>",
  "linkEndsAt": "<mês dos 18>",
  "policy": { "...ver §3.3" },
  "sigMinor": "...",
  "sigGuardian": "..."
}
```
- O vínculo **não vai para o permaweb nem para o cartão de perfil**. Expor quem é menor e quem é o responsável seria um risco (perseguição).
- Toda mudança de `policy` gera uma versão nova assinada pelo responsável. O cliente do adolescente mostra a diferença (I3).

### 3.3 `SupervisionPolicy` (fechada; só estes campos)
| Campo | Efeito no cliente do adolescente | Padrão |
| :--- | :--- | :--- |
| `dailyMinutes` | Aviso e depois bloqueio suave após N minutos por dia | sem limite |
| `quietHours` | Janela sem notificações e sem uso | 22h–7h |
| `contactsApproval` | Seguir ou receber DM de **desconhecidos** exige aprovação do responsável | ligado |
| `contentLevel` | Filtro de conteúdo sensível: `restrito` ou `padrao-menor` | `padrao-menor` |
| `seeContactList` | O responsável vê **quem** são os contatos, nunca as mensagens | ligado |

Não existem campos para ler DMs, localização, histórico de navegação ou câmera (I4).

### 3.4 `GuardianInvite` (convite de uso único)
`{ guardian, nonce, expiresAt (24h), declaredRelation, sigGuardian }`, enviado por QR ou link local. O convite é consumido na criação da conta do adolescente.

### 3.5 Emissores (substitui a antiga Q1)

O formato do atestado é **único e aberto**, e o Vox aceita uma **lista plural de emissores**, o que evita depender de um só fornecedor.

- O atestado traz pelo menos `band`, `issuer`, `exp` e `nonce`, mais os campos de §3.1.
- Trocar ou somar emissores **não muda o formato**.
- O Vox **nunca** recebe CPF, foto ou biometria. Recebe só a faixa assinada.

| Opção | Emissor | Situação no plano |
| :--- | :--- | :--- |
| **H** | Provedores externos auditados, vários aceitos, que devolvem só um token cego de faixa | **Recomendado** para G2/G3 |
| **I** | Sinal de idade da loja ou do sistema operacional (cadeia de dois níveis do Guia da ANPD), quando houver APK em loja; credenciais verificáveis | **Recomendado** quando houver app em loja |
| **D** | Co-assinatura do responsável verificado | **Obrigatório** para `13-15` |
| **G** | Carteira com prova de conhecimento zero ou ISO 18013-5 (provar idade mínima sem revelar a data) | Evolução futura, mesmo formato |
| **A** | QR da CIN ou da CNH digital verificado no aparelho | Trilha futura **condicionada**: sem especificação aberta oficial garantida para verificação offline por terceiros, e o Guia da ANPD pede checar a consistência entre o documento e quem o usa |
| **C** | Estimativa facial no navegador | **Fora** do caminho recomendado: biometria (LGPD art. 11), exigência de acurácia auditável e de não-discriminação, e peso de modelo/WASM (`PM-01`, `LAN-18`) |
| **E, F** | Aval de adultos, cartórios comunitários | Fora; só complemento |

**Camadas:**
- **G1** (piloto fechado): continua no `ADR-020`, só para maiores de 18, sem código novo de identidade.
- **G2/G3** (depois do `REV-12`): usar H, I e D.
- **Evolução:** G e A entram sem trocar o formato do atestado.

**Fontes conferidas em 2026-11-25:**
- **ANPD:** em março de 2026 saíram as [Orientações preliminares sobre mecanismos confiáveis de aferição de idade](https://www.gov.br/anpd/pt-br/assuntos/eca-digital/mecanismos-confiaveis-de-afericao-de-idade-orientacoes-preliminares.pdf). Em maio de 2026 o Guia Orientativo "Mecanismos de Aferição de Idade" foi a [tomada de subsídios](https://www.gov.br/anpd/pt-br/assuntos/noticias/copy_of_anpd-tomada-de-subsidios-afericao-idade), com contribuições até 9 de julho. Pela própria ANPD, a conclusão está prevista para dezembro de 2026, e o texto final ainda não saiu.
- **Guia de fornecedores:** o guia "Fornecedores de produtos ou serviços de TI: escopo e obrigações gerais do ECA Digital" saiu em 28/10/2026 ([resumo](https://www.mattosfilho.com.br/?p=123338)).
- **Sinal da loja:** a [Play Age Signals API](https://developer.android.com/google/play/age-signals/use-age-signals-api) devolve sinais no Brasil **desde 17/03/2026**, não a partir de janeiro de 2027. As faixas padrão são `0-12`, `13-15`, `16-17` e `18+`. ⚠️ **No Brasil o `userStatus` só pode ser `DECLARED` ou `UNKNOWN`**, ou seja, o sinal é **autodeclarado**. Sozinho, provavelmente não basta para o ECA Digital, que não aceita autodeclaração. Por isso I serve de **complemento**, não de emissor suficiente (Q7).
- **Vio / SERPRO:** a decodificação oficial passa pelo app Vio ou pela [API Vio Decoder](https://www.loja.serpro.gov.br/vioapidecodifica?lang=en), contratada do SERPRO. Não há especificação pública de verificação offline por terceiros, o que confirma a opção A como trilha condicionada.
- **Não conferidos:** os números de processo SEI citados pela revisão externa.

**Limite honesto:** só H, I, D e G geram uma prova que outro par consegue verificar. Uma verificação feita só no aparelho vira autoatestado e cai no resíduo I8.

## 4. Fluxos

### F1 — Entrada de qualquer pessoa
1. A pessoa cria a conta (fluxo atual, congelado) e depois faz a verificação de faixa.
2. Se a faixa for `18+`, a conta segue normalmente. Se for `16-17`, a conta recebe os padrões protetivos (§5). Se for `13-15`, a conta só é criada com um `GuardianInvite` válido (F2). Abaixo de 13, a entrada é recusada e os dados são descartados (I7).
3. Enquanto a verificação não termina, a conta fica em **modo leitura**: sem publicar, sem DMs.

### F2 — Adolescente de 13 a 15 anos por convite
1. Um responsável `18+` com selo **verificado** (E) gera o convite e declara a relação legal. A declaração é assinada e fica registrada no vínculo.
2. No aparelho do adolescente, o convite é aberto e a conta é criada.
3. A faixa do adolescente é verificada pelo mesmo método de F1. Uma faixa diferente de `13-15` invalida o convite.
4. As duas chaves assinam o `GuardianLink` com a política padrão.
5. O adolescente vê a tela "O que seu responsável vê e controla" antes do primeiro uso.

### F3 — Painel do responsável
- O painel edita a política (§3.3), aprova contatos pendentes e mostra o tempo de uso diário.
- Toda alteração chega ao adolescente como aviso. O adolescente **não pode** desligar a regra, mas sempre consegue vê-la.

### F4 — Fim do controle aos 16
- Quando chega o mês de `controlEndsAt`, o cliente do adolescente ignora a política e mostra o aviso "Você agora controla sua conta".
- Os padrões de `16-17` continuam valendo e o adolescente pode afrouxá-los sozinho, menos os travados por lei (§5).
- O responsável perde o painel. O vínculo continua só como registro até os 18.

### F5 — Fim do vínculo aos 18
- No mês de `linkEndsAt`, os dois clientes apagam o `GuardianLink`. A faixa passa a `18+`.

### F6 — Troca de responsável
- **Troca amigável:** o novo responsável (verificado, `18+`) gera um convite de troca. O adolescente e o responsável atual assinam. Um novo vínculo substitui o antigo.
- **Contestação** (responsável falso ou ausente): o adolescente ou o novo responsável abrem um pedido. O fluxo para resolver a contestação ainda não existe (§9, Q4).

## 5. Padrões protetivos para menores de 18

Estes padrões valem para todo menor de 18, com ou sem responsável:
- Perfil fora da busca da malha (`PROFILE_CARD` desligado).
- DMs de desconhecidos desligadas.
- Sem localização.
- Sem Pix e sem zaps (§9, Q5).
- Sem publicidade.
- Sem feed por perfilamento comportamental.
- Conteúdo marcado como sensível fica oculto.

O que a lei trava fica travado até os 18. O resto o adolescente de 16–17 pode mudar.

## 6. Selo "verificado" (E)

- É opcional para adultos. O método é telefone (SMS) ou documento, por um provedor, e **o Vox guarda só o booleano e o método** (I1).
- Libera:
  - ser responsável de outra conta (obrigatório);
  - a criação de conta coletiva M-de-N;
  - os recursos de maior alcance que o parecer indicar.
- O selo vale por conta e não é transferível entre contas.

## 7. Mapeamento ECA Digital / LGPD (leitura técnica)

| Exigência (resumo) | Como o plano atende | Lacuna |
| :--- | :--- | :--- |
| ECA Digital: verificação de idade confiável; autodeclaração não basta | Atestado por emissor externo (F1) | Escolha do emissor e nível de confiança (Q1) |
| ECA Digital: contas abaixo de 16 em rede social vinculadas a um responsável | F2 obrigatório para `13-15` | Checagem da relação legal (Q3) |
| ECA Digital: ferramentas de supervisão parental | §3.3 e F3 | Suficiência do conjunto fechado (Q2) |
| ECA Digital: padrões protetivos e vedação de perfilamento para publicidade | §5 | — |
| LGPD art. 14: melhor interesse; consentimento parental abaixo de 12 | Abaixo de 13 é recusado; o vínculo serve o adolescente e é visível a ele | — |
| LGPD arts. 6 e 15: minimização e término do tratamento | Só a faixa e o mês (I1); vínculo apagado aos 18 (I6) | Cópias em malha (§8) |
| LGPD art. 18: direitos do titular | O adolescente vê o vínculo e a política (I3) | Canal formal de pedidos |

## 8. Ameaças e limites honestos

| Ameaça | Mitigação | Resíduo |
| :--- | :--- | :--- |
| Menor usa o atestado de um adulto | Atestado amarrado à chave (I2); prova de vida no provedor | Adulto que verifica no lugar do menor |
| Responsável falso | Selo verificado e relação declarada e assinada | Sem checagem de parentesco (Q3) |
| Responsável abusivo | Política fechada, sem DMs e visível; fim aos 16; troca e contestação | Contestação sem árbitro ainda (Q4) |
| Cliente adulterado ignora a política | Nenhuma no protocolo; registrar em `THREAT-MODEL.md` | Inerente ao local-first |
| Vínculo exposto revela menor e responsável | Vínculo fora do permaweb e do cartão (§3.2) | Vazamento do aparelho |
| Cópias do vínculo após os 18 | Apagamento nos dois cofres | Backup antigo do usuário |

## 9. Pré-requisitos e perguntas abertas

**Bloqueios:**
- **Parecer jurídico** sobre §7 e Q1–Q5, a anexar ao briefing em `legal/`.
- **Decisão de destrancar a identidade.** Entrada, conta e cofre estão congelados desde 17/11.
- **Uso humano adiado.** Até nova decisão, a validação é só por máquina e pelo mantenedor.

**Perguntas:**
- **Q1. Emissor do atestado.** Decidido em §3.5: formato único, vários emissores (H, I e D). Falta ao parecer confirmar que o token cego de faixa de um emissor externo, somado à co-assinatura do responsável para `13-15`, satisfaz o ECA Digital.
- **Q7. Sinal declarado da loja.** Como o sinal da Play no Brasil é `DECLARED`, ele conta como aferição, ou só como triagem antes de H ou D?
- **Q6. Classe de risco.** Em que faixa de proporcionalidade do Guia da ANPD (maio/2026) se enquadra uma rede comunitária cronológica, sem apostas, sem conteúdo adulto, sem loot boxes e com padrões protetivos por idade (`REV-23`)?
- **Q2. Suficiência da supervisão.** O conjunto fechado de §3.3 basta para o ECA Digital?
- **Q3. Checagem da relação legal.** Basta a declaração assinada com selo, ou é preciso documento?
- **Q4. Árbitro de contestação.** Quem decide um caso de responsável falso numa rede sem servidor central?
- **Q5. Pix e zaps para 16–17.** Ficam vedados até os 18?

## 10. Fases (depois do parecer e do destrancamento)

| Fase | Entrega | Aceite (máquina) |
| :--- | :--- | :--- |
| V0 | ADR-041 com §2.3, o emissor (Q1) e o mapeamento §7 aprovado | ADR aceito pelo mantenedor |
| V1 | Validação e assinatura do `AgeAttestation`; cálculo da faixa vigente; modo leitura | Testes de assinatura, de troca de chave e de virada de faixa |
| V2 | Padrões protetivos §5 por faixa | Teste: cada padrão ligado em `13-15` e `16-17`, desligado em `18+` |
| V3 | `GuardianInvite` e `GuardianLink`; F2 | Teste: convite expirado, reusado ou de faixa errada falha |
| V4 | Política §3.3, painel F3 e tela de transparência | Teste: nenhum campo dá acesso a DM; mudança de política aparece ao adolescente |
| V5 | F4, F5 e F6 (troca amigável) | Teste com relógio simulado: 16 e 18 |
| V6 | Selo E e integração com o provedor | Teste: selo exigido para ser responsável |

V1–V5 não dependem do provedor. Elas podem usar um emissor de teste no laboratório (`vox.lab.age`), sempre desligado fora do laboratório.
