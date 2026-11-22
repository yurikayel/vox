# Decisão pós-piloto: Vox Bridge MV3 (EXP-05)

> **Status:** rascunho · **Owner:** mantenedor / produto · **Revisado:** 2026-11-22
> **Relacionados:** [vox-bridge-spike.md](./vox-bridge-spike.md) · [POSSE CLI](../../tools/posse-cli/README.md) · [template de retrospectiva](../pilot/piloto-comunidade-retrospectiva-template.md)

## 1. Contexto

O spike [vox-bridge-spike.md](./vox-bridge-spike.md) avaliou uma extensão WebExtension **Manifest V3** (`vox-bridge/`) para republicação (POSSE) em redes fechadas sem intent estável (Instagram, Threads). Conforme a política de corte de escopo pré-lançamento, a extensão permanece fora do piloto G1 e do lançamento G3 até decisão formal pós-piloto (`EXP-05`).

## 2. Comparação de alternativas para circulação POSSE

| Alternativa | Fricção para o cidadão | Risco de ToS / banimento | Custo de manutenção & loja | Disponibilidade mobile |
| :--- | :--- | :--- | :--- | :--- |
| **Extensão MV3 (`vox-bridge/`)** | Alta (instalar extensão + aprovar `host_permissions` amplas) | **Alto** (automação DOM em Instagram/Threads viola ToS e pode suspender contas) | **Alto** (revisão Chrome Web Store/AMO, quebra a cada mudança de DOM, superfície XSS extra) | Quase nula (Chrome Android não suporta extensões; Safari exige app pago) |
| **Web Share / Copiar link + caminho de volta (`PM-105`)** | Baixa (1 toque nativo no celular) | **Zero** (compartilhamento humano explícito) | **Baixo** (usa APIs web padrão) | **100%** (Android, iOS e desktop) |
| **POSSE CLI (`tools/posse-cli/`)** | Técnica (para coletivos/comunicação via terminal) | **Baixo** (usa APIs/protocolos abertos onde existem) | **Baixo** (script local fora do PWA) | Não aplicável (desktop/servidor) |

## 3. Critérios quantitativos Go / Arquivar (após `PIL-03`)

**Recomendação padrão (default):** **arquivar `vox-bridge/`** e concentrar esforço em Web Share nativo + caminho de volta sem conta (`PM-105`) + `tools/posse-cli/`.

A reativação do MV3 só passa para **Go** se **todos** os critérios abaixo forem verdadeiros na retrospectiva do piloto (`PIL-03`):

1. **Demanda medida:** ≥ 30% dos participantes ativos do piloto falharem ou abandonarem o fluxo POSSE manual (Web Share / copiar link) em redes sem intent.
2. **Parecer de risco:** avaliação explícita de que o fluxo assistido não expõe contas de voluntários a banimento automático por automação DOM.
3. **Dono dedicado:** existência de mantenedor específico para revisar quebras de DOM e submissões à Chrome Web Store / Firefox AMO sem drenar o núcleo do PWA.
4. **Isolamento mantido:** extensão continua sem receber chaves privadas, seed ou credenciais do cofre Vox.

## 4. Registro da decisão

| Campo | Valor |
| :--- | :--- |
| **Estado atual** | Pendente de encerramento do piloto (`PIL-03`) |
| **Decisão provisória** | **Manter congelada / candidata a arquivamento** |
| **Data da decisão final** | *Preencher após `PIL-03`* |
| **Responsável** | *Mantenedor + facilitador do piloto* |
