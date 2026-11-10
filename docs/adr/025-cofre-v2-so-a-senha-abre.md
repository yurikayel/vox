# ADR-025: Cofre de recuperação v2 — só a Senha Soberana abre

**Status:** accepted (implementado no SW v7.62) · **Revisado:** 2026-11-10 · **Substitui:** [ADR-014](./014-zero-knowledge-vault-recuperacao-soberana.md) · **Relacionados:** PM-90, PM-92, PM-93, [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md), [THREAT-MODEL T20](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md)

## 1. Contexto

O ADR-014 criou o cofre de recuperação: a identidade (`routeId`, chave P-256, nome, enriquecimento, Pix) vai cifrada para a memória central e volta em outro aparelho. A revisão de 10/11/2026 mostrou que o formato v1 não protegia o cofre como o ADR prometia. O detalhe fica sob divulgação responsável até a correção estar no ar (ADR-024).

## 2. Decisão

1. **A chave do cofre sai só da Senha Soberana:**
   - PBKDF2-SHA256 com **600 mil iterações** e um **sal aleatório de 16 bytes por cofre**, guardado no envelope;
   - AES-GCM-256;
   - o envelope traz `v: 2`, `kdf`, `iter`, `salt`, `iv` e `ciphertext` (`client/js/vault-crypto.js`).
2. **Login com Google ou Meta nunca é chave.** Ele só enriquece o perfil e reencontra uma conta que já está **neste** aparelho. Para recuperar a conta em outro aparelho é preciso a Senha Soberana, o link ou QR de sincronização com a senha (PM-92), ou o arquivo de backup.
3. **O endereço do cofre no servidor também sai da senha, com o mesmo custo** (PBKDF2, 600 mil iterações, sal fixo do app). Achar o cofre pela senha custa tanto quanto abri-lo. Assim a recuperação continua sendo "digite a sua senha", sem um código extra para guardar.
4. **Senha mínima de 12 caracteres** (PM-92). A interface sugere uma frase de 4 ou mais palavras.
5. **Migração dos cofres v1** (`client/js/vault-legacy.js`):
   - **Na abertura do app:** o aparelho revoga os cofres v1 que conhece, os guardados nele e o do login social vinculado. A cópia local sai, e o servidor de memória escolhido recebe, no mesmo endereço, uma marca `revoked` no lugar do conteúdo. A pessoa é avisada uma vez para criar a Senha Soberana de novo. Se ela trocar de servidor depois, a revogação chega também ao servidor novo.
   - **Cofre v1 de senha** (busca pela senha ou link antigo): abre uma última vez, é cifrado de novo em v2 e o v1 é revogado.
   - **Cofre v1 de login social:** abre uma última vez, só onde o servidor ainda o serve, e é revogado. Isso evita deixar sem conta quem perdeu o aparelho.
6. **Servidores de memória atualizados** (`relay/vault_store.py` e o nó Windows `ZeroCentralMemory.cs`):
   - aceitam e servem **só** cofre v2 ou a marca de revogado, com iterações entre 100 mil e 5 milhões;
   - registros v1 ficam no disco, mas não são mais servidos nem aceitos.
7. **Link e QR de sincronização:** passam a levar `2:iter:sal:iv:cifra` (só o cofre, PM-92). O link v1 ainda é lido. Iterações fora da faixa são recusadas, o que impede um link de travar o aparelho.

## 3. Consequências

- **Recuperação:** o login social sozinho não restaura mais a conta. Isso muda o texto do onboarding e da ajuda, que já tratavam Google e Meta como "só nome e foto".
- **Custo:** abrir ou salvar o cofre faz duas derivações de 600 mil iterações, de 1 a 2 s num celular médio. Os botões já mostram estado de espera.
- **Limite honesto:** quem opera um servidor de memória pode tentar adivinhar a senha de um cofre, pagando 600 mil iterações por tentativa. A proteção depende da senha. Por isso o mínimo de 12 caracteres e a recomendação de frase. Não é "conhecimento zero" contra senha fraca.
- **Cofre v1 esquecido:** um cofre v1 cujo dono nunca mais abrir o app continua no servidor que o recebeu. Servidores atualizados não o entregam. Stewards podem apagar os arquivos de `vaults/` sem `"v": 2`.
- **Revogação por melhor esforço:** a marca vai uma vez por conjunto de servidores escolhidos. Se o servidor estiver fora do ar nesse momento, a cópia v1 fica lá. Ela só deixa de ser servida quando o servidor for atualizado. Nova tentativa automática fica para depois.
- **Falta (PM-93):** as chaves continuam em claro no armazenamento do navegador. O cofre protege a cópia fora do aparelho, não a cópia dentro dele.
