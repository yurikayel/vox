# ADR-031: Passkey abre a mesma conta em outro aparelho (WebAuthn PRF), sem servidor de login

**Status:** proposed (2026-11-13; depende do spike do §5) · **Revisado:** 2026-11-13 · **Relacionados:** PM-90, PM-92, [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md), [ADR-027](./027-autorizacao-no-relay-dono-e-origem.md), [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-018](./018-selo-govbr-via-parceiro-publico.md), [THREAT-MODEL T20](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md)

## 1. Contexto

Quem entra pelo botão do Google num segundo aparelho espera cair na mesma conta. Não cai: desde o PM-90 e o [ADR-025](./025-cofre-v2-so-a-senha-abre.md), o login social só traz nome e foto, porque o identificador do Google não é segredo e não pode abrir um cofre. Os caminhos que levam a mesma conta para outro aparelho hoje são três:
- o QR ou link de sincronização, com a Senha Soberana (PM-92);
- o cofre na memória central, aberto com a Senha Soberana;
- o arquivo de backup (inclusive o que a pessoa manda para o próprio e-mail).

Os três pedem uma senha de 12 caracteres ou um arquivo. Para quem chega pela primeira vez, isso é atrito, e atrito nessa parte afasta gente da rede.

A passkey (WebAuthn) resolve o "mesma conta em outro aparelho" sem senha: o gerenciador do Google ou da Apple sincroniza a passkey, cifrada de ponta a ponta, entre os aparelhos da pessoa. Com a extensão **PRF**, a passkey devolve ao app um segredo de 32 bytes, estável e diferente para cada site, sem que esse segredo passe por servidor nenhum. Esse segredo pode abrir um cofre, coisa que o identificador do Google não pode.

## 2. Opções

1. **Ficar como está** (Senha, QR ou arquivo). Seguro e soberano, mas com atrito.
2. **Login de verdade com Google ou Meta**, com a conta presa ao ID do provedor. Recusado no PM-90: o ID não é segredo, e o Vox passaria a precisar de servidor de contas.
3. **Passkey só como autenticação num servidor do Vox.** Exige servidor de contas que guarde chaves públicas e emita sessões. O Vox não tem conta no servidor ([ADR-027](./027-autorizacao-no-relay-dono-e-origem.md)).
4. **Passkey com PRF abrindo um segundo envelope do mesmo cofre**, tudo no aparelho. O servidor de memória só guarda mais um envelope cifrado. **Escolhida.**

## 3. Decisão (proposta)

1. **A passkey é mais uma chave do mesmo cofre, não uma conta nova.** A identidade (chave P-256, `routeId`, nome, Pix) continua a mesma. O cofre passa a poder ter dois envelopes: o da Senha ([ADR-025](./025-cofre-v2-so-a-senha-abre.md), sem mudança) e o da passkey.
2. **Nada de WebAuthn no servidor.** O desafio é sorteado no próprio aparelho. Não há verificação de assinatura nem de atestação em servidor nenhum: só interessa o resultado do PRF, avaliado com um sal fixo do app (`vox-vault-prf-v1`).
3. **Do segredo do PRF saem três valores, por HKDF-SHA256 com rótulos diferentes:**
   - a chave AES-GCM-256 do envelope;
   - o endereço do envelope na memória central;
   - a prova do dono ([ADR-027](./027-autorizacao-no-relay-dono-e-origem.md)), com o servidor guardando só o hash.

   O segredo já tem 256 bits de entropia, então não precisa de PBKDF2 com 600 mil iterações. Abrir pela passkey é instantâneo, e quem opera o servidor não tem senha para adivinhar.
4. **Formato do envelope:** `v: 2`, `kdf: "webauthn-prf"`, `iv` e `ciphertext`, além do `credId` em claro, para o aparelho novo pedir a passkey certa. `relay/vault_store.py` e `ZeroCentralMemory.cs` passam a aceitar esse `kdf`, com as mesmas regras de dono do ADR-027.
5. **Achar o cofre num aparelho novo:** "Entrar com passkey" chama `navigator.credentials.get` sem lista de credenciais (passkey descobrível). O sistema mostra as passkeys do Vox; a pessoa escolhe com digital ou rosto. O PRF devolve o segredo, dele sai o endereço e o envelope é buscado no servidor de memória padrão, ou nos que a pessoa escolheu ([ADR-022](./022-memoria-central-por-consentimento.md)). É a mesma busca da recuperação pela Senha.
6. **Onde aparece:**
   - na entrada (primeira ação que escreve), um botão "Guardar com passkey" ao lado de "Nome e foto do Google";
   - em "Já tenho conta", um botão "Entrar com passkey" acima do QR.

   O texto diz o que é: "A mesma conta nos seus aparelhos com a mesma conta Google ou Apple."
7. **A Senha continua sendo a chave universal.** Ela segue obrigatória para o link e o QR (PM-92) e é o único caminho entre ecossistemas diferentes e depois de perder a conta Google ou Apple. A passkey é o atalho; o lembrete de backup continua pedindo a Senha.
8. **Remover a passkey** (Perfil → Segurança) revoga o envelope dela no servidor, com a prova do dono, e apaga o `credId` local. A passkey em si se apaga no gerenciador do sistema, e a interface explica isso.
9. **Atrás de flag** (`vox.lab.passkey`) até o spike do §5 passar nos aparelhos do piloto.

## 4. Consequências

- **Menos atrito:** quem usa só aparelhos do mesmo ecossistema (Android com conta Google, ou iPhone e Mac com iCloud) entra no aparelho novo com um toque, sem senha e sem QR.
- **Troca de soberania, dita com honestidade:** com a passkey, a segurança do cofre passa a depender da conta Google ou Apple da pessoa e do bloqueio de tela dos aparelhos dela. Quem tomar essa conta e conseguir sincronizar a passkey num aparelho seu abre o cofre. É uma escolha opcional, explicada na hora; a Senha sozinha continua disponível para quem não quer essa dependência.
- **Não é login no Google:** o Google ou a Apple guardam a passkey cifrada, mas não veem o segredo do PRF nem o cofre. O Vox não recebe nada do provedor. Isso é diferente do que o PM-90 recusou.
- **Não prova pessoa única:** uma pessoa cria quantas passkeys quiser ([pesquisa complementar, D2](../research/pesquisa-complementar-2026-11.md)). Isso não serve contra contas falsas; o selo gov.br do [ADR-018](./018-selo-govbr-via-parceiro-publico.md) continua sendo o caminho opcional para "pessoa verificada".
- **Presa ao domínio (RP ID):** a passkey vale para um domínio só.
  - Criada em `yurikayel.github.io`, não abre no espelho `vox-9df.pages.dev`, nem no app Android se ele usar outra origem.
  - Uma troca futura de domínio deixa as passkeys antigas sem uso; a conta continua recuperável pela Senha.
  - Por isso, **o domínio definitivo deve ser escolhido antes de liberar a flag para todos**.
- **Entre ecossistemas:** passkey do iCloud não aparece num Android, e vice-versa. O login entre aparelhos do navegador (QR do sistema, via Bluetooth) pode usar a passkey do celular num computador, mas o suporte ao PRF nesse caminho precisa ser medido. Quando não der, valem o QR do Vox e a Senha.
- **Custo:** zero de infra nova. O servidor de memória guarda mais um envelope pequeno por pessoa.
- **Código:**
  - módulo novo `client/js/vault-passkey.js`, com criação, avaliação do PRF e derivação;
  - envelope novo em `vault-crypto.js`;
  - botões em `oauth-modals.js`;
  - aceitação do `kdf` novo nos dois servidores de memória;
  - testes de derivação com vetores fixos e testes do servidor recusando envelope sem prova.

## 5. Em aberto (spike antes de aceitar)

- **Suporte real ao PRF**, medido nos aparelhos do piloto:
  - Chrome Android com o Gerenciador de Senhas do Google;
  - Safari no iOS e no macOS com o iCloud;
  - Windows Hello;
  - Samsung Internet;
  - Firefox.

  Saída: uma tabela de "funciona / não funciona" com versão e data. Se o PRF não existir na maioria dos aparelhos do piloto, o ADR volta para revisão.
- **Detecção:** como saber, antes de oferecer o botão, que o PRF vai funcionar (`getClientCapabilities`, ou tentar e cair no fluxo atual).
- **Domínio definitivo** e uso de *Related Origin Requests* (`/.well-known/webauthn`) para o espelho, onde houver suporte.
- **Ordem na entrada:** passkey antes ou depois do nome e foto. Medir no piloto qual reduz desistência.
