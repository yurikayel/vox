# ADR-032: Login perene — a conta nasce com saída, sem depender de empresa nem de servidor

**Status:** accepted (2026-11-13, pelo mantenedor; passo 1 — §3.1 e §3.5 — no SW v7.113; passo 2 — frase, §3.3 e §5.1–5.2 — no SW v7.115/v7.116; passo 3 — guardiões spec, 3a Shamir, 3b escolha/entrega e T24/T25 — no SW v7.116/v7.117; **emenda 1 (§6), entrada com e-mail/senha, semente no cofre, kit `mailto:` e T26 — implementada no SW v7.120**) · **Revisado:** 2026-11-15 · **Relacionados:** [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [ADR-031](./031-passkey-abre-a-mesma-conta.md), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md), [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-030](./030-trazer-do-bluesky-pesos.md), [ADR-002](./002-oauth-profile-enrich-client.md), [THREAT-MODEL T20/T26](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md), [ROADMAP](../ROADMAP.md) (REV-14, PM-13, PM-101)

## 1. Contexto

No Vox, **a conta é uma chave guardada no navegador**:
- o `routeId` (`vx_…`) sai da chave pública (`computeRouteId`);
- a chave privada assina todos os posts;
- não existe servidor de contas ([ADR-027](./027-autorizacao-no-relay-dono-e-origem.md)).

"Entrar" sempre significa **pôr a mesma chave de volta neste aparelho**. Perdida a chave, a identidade se perde junto: hoje não há como trocar de chave e continuar sendo a mesma conta (PM-13 está no T2/2027).

O botão "Entrar com Google" (e Meta) promete o que não entrega. Desde o [ADR-025](./025-cofre-v2-so-a-senha-abre.md), ele traz só nome e foto e reencontra uma conta que **já está neste aparelho** (`bindLocalAccountToLogin` em `client/js/oauth-vault.js`). Quem limpa "Cookies e outros dados do site" no Chrome e entra de novo com Google ganha **uma conta nova**, e a antiga fica inacessível para sempre. O `navigator.storage.persist` (REV-14 parte 1) impede o navegador de apagar por falta de espaço, mas não impede a pessoa de limpar.

Ou seja, o login social facilita a entrada justamente para quem mais vai perder a conta, e ainda passa uma falsa sensação de segurança. As saídas que existem hoje são todas opcionais e escondidas:
- a Senha Soberana (cofre na memória central, ou link e QR de sincronização);
- o arquivo `.voxid`;
- o backup no e-mail.

Nada impede uma conta de passar a vida inteira sem nenhuma saída.

**Requisitos (pedido do mantenedor, 13/11):** o login precisa ser
- **perene:** volta daqui a 10 anos, em qualquer aparelho;
- **confiável:** não some se a pessoa limpar o navegador ou perder o celular;
- **soberano:** não depende de empresa (Google, Apple, Meta), de servidor do Vox nem de e-mail guardado ([decisão de 12/11](../DECISOES.md): e-mail é só cofre).

## 2. Opções consideradas

1. **Manter o login social como porta de entrada.** Recusada: é a causa do problema descrito no §1.
2. **Login por e-mail ou link mágico.** Recusada pela decisão de 12/11: lista de e-mails de uma rede política é alvo, e o Vox viraria controlador de dados.
3. **Passkey como base** ([ADR-031](./031-passkey-abre-a-mesma-conta.md)). Insuficiente sozinha: depende da conta Google ou Apple, vale para um domínio só e não atravessa ecossistemas. Fica como **atalho**.
4. **gov.br como âncora de recuperação.** Recusada: cria dependência do Estado e liga identidade civil à conta política. O selo opcional do [ADR-018](./018-selo-govbr-via-parceiro-publico.md) não muda.
5. **Várias saídas independentes para a mesma chave, e a conta não fica sem nenhuma.** **Escolhida.**

## 3. Decisão

### 3.1 Google e Meta saem da porta de entrada
- **Na entrada não há mais botão de Google nem de Meta.** Quem quiser nome e foto de lá usa **Perfil → "Importar nome e foto"**, com o texto "não guarda sua conta" ([ADR-002](./002-oauth-profile-enrich-client.md) continua valendo para isso).
- O vínculo com Bluesky (POSSE e "Trazer do Bluesky", [ADR-030](./030-trazer-do-bluesky-pesos.md)) não é login e não muda.
- O último uso dos cofres v1 de login social ([ADR-025 §2.5](./025-cofre-v2-so-a-senha-abre.md)) continua até o fim da migração e depois sai do código.

### 3.2 Saídas soberanas e atalhos
| Tipo | Caminho | Depende de | Situação |
|---|---|---|---|
| **Saída soberana** | **Frase de recuperação / cartão no papel** (§3.3) | só do papel | novo (REV-14 parte 2) |
| **Saída soberana** | **Guardiões** (§3.4) | de pessoas que a dona escolheu | novo |
| **Saída soberana** | **Senha Soberana**: cofre na memória central, `.voxid` ou backup no e-mail | da senha e de um servidor ou arquivo | já existe |
| Atalho | Passkey com PRF ([ADR-031](./031-passkey-abre-a-mesma-conta.md)) | da conta Google ou Apple e do domínio | aceito, não implementado |
| Atalho | Segundo aparelho pareado por QR (PM-92) | de ainda ter o primeiro aparelho | já existe |

Um atalho deixa o caso comum rápido, mas **não conta como saída**: ele quebra justamente nos casos de perda (conta Google tomada, troca de ecossistema, os dois aparelhos perdidos juntos).

### 3.3 Frase de recuperação e cartão no papel
1. **Contas novas nascem de uma semente** de 128 bits sorteada no aparelho. Por HKDF-SHA256, com rótulos diferentes, saem dela:
   - a chave de assinatura P-256 (de onde sai o `routeId`);
   - a chave de DM.

   A semente vira **12 palavras** da lista BIP-39 em português, com dígito verificador.
2. **Contas que já existem** não têm semente. A frase delas codifica a própria chave privada P-256 (256 bits, **24 palavras**). As chaves de DM dessas contas não voltam pela frase: as DMs antigas só voltam pelo backup com a Senha. A tela diz isso.
3. **Cartão imprimível:** as palavras mais um QR com a mesma informação, num layout de uma página. É gerado no aparelho, sem rede, e impresso pelo diálogo do sistema.
4. **Para a frase contar como saída**, a pessoa digita de volta 3 palavras sorteadas.
5. **Recuperar:** "Já tenho conta" → "Tenho a frase / o cartão" → digitar as palavras ou ler o QR → a mesma chave, o mesmo `routeId`. Não toca em servidor.
6. A frase **é** a conta. O texto diz isso sem rodeio: "Quem tiver estas palavras entra como você. Guarde longe do celular e não fotografe."

### 3.4 Guardiões (recuperação pela comunidade)

> Como funciona em detalhe (mensagens, Shamir, pedido de volta, ameaças e entrega em partes): [spec dos guardiões v0](../specs/guardioes-v0.md), aceita em 2026-11-14.

1. A dona escolhe de **3 a 7 contatos** e um mínimo **M** (padrão 3 de 5; mínimo 2 de 3).
2. A semente (ou a chave, em contas antigas) é dividida por **Shamir em GF(256)**. Cada pedaço vai **cifrado para a chave de DM do guardião** (`cryptoDm.seal`), assinado pela dona, e é entregue pela malha.
3. O guardião guarda o pedaço na **caixa preta**, como as cópias de posts de quem segue: não há tela para ver, exportar nem usar o pedaço. O app só mostra "Você guarda a volta de Ana".
4. **Pedir de volta:**
   - o aparelho novo gera uma chave temporária e mostra um código curto mais um QR;
   - a pessoa pede a M guardiões **por fora** (pessoalmente, ligação ou outra conversa);
   - cada guardião abre o app, lê o QR ou digita o código, confirma "falei com Ana" e recifra o pedaço para a chave temporária;
   - com M pedaços, a chave volta no aparelho novo.
5. **Trocar guardiões** gera pedaços novos e revoga os antigos (mensagem assinada). Pedaços antigos de uma divisão diferente não se combinam com os novos.
6. Os guardiões só contam como saída quando **M deles confirmaram** que guardaram o pedaço.

### 3.5 A conta nasce provisória até ter uma saída
1. **Ler continua livre**, sem conta (entrada preguiçosa, PR #118).
2. Na primeira escrita, a conta nasce e mostra uma **faixa fixa**: "Esta conta só existe neste navegador. Se você limpar os dados, ela some." O botão é "Criar minha saída", e a frase (§3.3) é o caminho sugerido primeiro.
3. A faixa some quando existe **uma saída soberana**. Atalhos não tiram a faixa.
4. **Não bloqueia publicar.** A faixa volta depois de 7 dias e a cada 10 posts, até haver saída. Bloquear afastaria gente; esconder a faixa repetiria o problema.
5. **Medida honesta, sem telemetria:** o próprio aparelho sabe se tem saída e mostra isso em Perfil → Segurança. No piloto, "% de contas com saída" é perguntado na retrospectiva (PIL-03).

### 3.6 Fora desta decisão (próximo ADR)
**Raiz mais subchaves** (PM-13), para a identidade sobreviver à troca de chave:
- a raiz fica guardada fora do dia a dia, no papel ou com os guardiões;
- cada aparelho recebe uma subchave delegada;
- perder o celular passa a ser revogar uma subchave, não perder a conta.

Isso muda a forma assinada e o `routeId`, então pede um ADR e uma RFC próprios. **A semente do §3.3 já é a raiz desse desenho:** contas criadas depois deste ADR migram sem pedir nada à pessoa.

## 4. Consequências

- **Perene e soberano de verdade:** com a frase ou com os guardiões, quem limpa o Chrome ou perde o celular volta para a **mesma** conta sem empresa, sem servidor e sem e-mail.
- **Menos facilidade na entrada, mais honestidade:** some o "Entrar com Google" de um toque. A entrada continua rápida para ler e publicar; o que muda é que a conta fala que é provisória.
- **Nova superfície de ataque, dita com honestidade:**
  - a frase no papel pode ser roubada ou fotografada;
  - M guardiões em conluio podem tomar a conta. O texto recomenda guardiões que não se conhecem entre si;
  - um guardião enganado por alguém se passando pela dona entrega o pedaço. Por isso a confirmação é "por fora" e o pedido mostra há quanto tempo a chave temporária existe;
  - entra no THREAT-MODEL como T24 (frase) e T25 (guardiões).
- **Contas antigas:** recebem 24 palavras em vez de 12 e ficam sem recuperar DMs pela frase. Migram para semente quando houver raiz mais subchaves.
- **Passkey (ADR-031) continua aceita**, mas como atalho: ela não tira a faixa. O §6 do ADR-031 ("Guardar com passkey" ao lado de "Nome e foto do Google") passa a ser só "Guardar com passkey", depois de existir uma saída.
- **Piloto:** a regra "sem login social no G1" do PM-76 passa a valer de vez. Guardiões encaixam no piloto presencial ("a associação te devolve a conta").
- **Custo de infra:** zero. Pedaços e confirmações andam pela malha; a frase não toca em rede.
- **Código previsto:**
  - módulos novos `client/js/recovery-phrase.js` (semente, palavras, cartão), `client/js/guardians.js` (Shamir, entrega, pedido) e `client/js/account-exit.js` (estado da saída e faixa);
  - mudança em `local-account.js` (conta nascida da semente) e na entrada (sem Google e Meta);
  - testes de ida e volta da frase, de Shamir com M-1 pedaços (não abre) e com M (abre), e de revogação de guardiões.

## 5. Em aberto

1. **Lista de palavras — decidido (2026-11-13, passo 2):** a lista oficial **BIP-39 em português** (licença MIT, `client/js/data/bip39-pt.js`, SHA-256 do arquivo conferido nos testes). Por quê: 2048 palavras só em letras ASCII (sem acento para errar), no máximo 8 letras, e as **4 primeiras letras nunca se repetem** — dá para digitar só o começo de cada palavra. Codificação padrão da BIP-39 (bits + verificador SHA-256): 16 bytes viram 12 palavras, 32 bytes viram 24. Uma lista própria fica para depois, se o piloto mostrar dificuldade para ditar.
2. **Derivação P-256 — decidido (2026-11-13, passo 2):** `HKDF-SHA256(semente, salt "vox-semente-v1", info "vox-assinatura-p256" | "vox-dm-p256")` com 384 bits de saída, reduzidos como no **FIPS 186-5 A.2.1** (`d = (c mod (n−1)) + 1`): sempre em [1, n−1], sem repetição e sem viés mensurável. O ponto público é calculado em JS (`client/js/p256.js`), porque o WebCrypto só importa a chave privada junto com `x`/`y`; a chave importada é exportada de novo para ficar na forma canônica. Só a codificação em palavras segue a BIP-39; a derivação é do Vox (não é carteira BIP-32). Vetores fixos em `tests/recovery-phrase.test.js`.
   - **Onde a semente fica:** cifrada pela chave do aparelho (`client/js/identity-seed.js`). Quando a conta trava (ADR-026), a semente entra na cópia cifrada pela Senha Soberana e no aparelho fica só a marca de travada — continua valendo que a única cópia exportável é a da senha. Restaurar por cofre ou `.voxid` não traz a semente; essa conta usa a frase de 24 palavras, que dá o mesmo `routeId`.
3. **Ordem de entrega:** proposta abaixo.
   1. §3.1 e §3.5: tirar Google e Meta da entrada e criar a faixa de conta provisória. É pequeno.
   2. §3.3: frase e cartão (REV-14 parte 2 reorientado).
   3. §3.4: guardiões, com spec antes do código.
   4. ADR-031: passkey como atalho, depois do domínio definitivo.
   5. §3.6: raiz mais subchaves (PM-13).
4. **Lápide de conta (PM-101):** passa a poder ser assinada também por quem recuperou pela frase ou pelos guardiões.

## 6. Emenda 1 (2026-11-14): entrada com nome, e-mail e senha; o kit de volta vai para o e-mail da própria pessoa

> **Situação:** aceita pelo mantenedor em 2026-11-14; **implementada no SW v7.120.** (`vault-crypto.js`, `oauth-vault.js`, `email-kit.js`, `render/oauth-modals.js`, `app/onboarding.js`, `render/profile.js`, [THREAT-MODEL T26](../THREAT-MODEL.md)).
> Muda o §3.5 (a conta deixa de nascer provisória no caminho comum) e a tela "Já tenho conta". O resto do ADR continua valendo.

### 6.1 Por quê
- O §3.5 deixa a saída para depois: a conta nasce sem nenhuma e uma faixa pede para criar. Quem ignora a faixa perde a conta ao limpar o navegador.
- "Já tenho conta" pede frase, arquivos `.txt` ou uma "Senha Soberana" solta. Quase todo mundo espera **e-mail e senha**.
- Login por e-mail guardado em servidor continua recusado (§2, opção 2). Esta emenda **não cria lista de e-mails**: o e-mail nunca sai do aparelho em claro.

### 6.2 Entrada em uma etapa (mínima fricção)
1. A tela de entrada pede **nome ou apelido, e-mail e senha**, num `<form>` comum:
   - e-mail: `type="email"`, `autocomplete="username"`;
   - senha: `type="password"`, `autocomplete="new-password"` (na volta, `current-password`), com botão de mostrar em vez de campo de confirmação.
2. Ao clicar em **Criar conta**, sem etapa bloqueante intermediária, o aparelho gera a semente (§3.3), entra na conta, grava o cofre (§6.3) e dispara imediatamente o `mailto:` com o kit de volta (§6.4).
3. A tela diz, ao lado do campo: "Seu e-mail não sai deste aparelho. Ele serve para você achar sua conta de volta."
4. **Sem parada extra antes do `mailto:`:** como o `mailto:` apenas abre o rascunho no aplicativo de e-mail da pessoa (não envia nada pela rede sozinho), a conferência acontece no próprio rascunho e no cartão de confirmação do §6.5, que mostra `Para: <e-mail>` com opção de **Corrigir e-mail** e reabrir o rascunho.
5. **Quem não quer informar e-mail** continua podendo entrar só com o nome: a conta nasce provisória e vale o §3.5, com a faixa.
6. Ler continua livre, sem conta.

### 6.3 Cofre endereçado por e-mail e senha (com semente preservada)
1. O endereço do cofre, a prova de dono (PM-94) e a chave que o cifra passam a sair de `e-mail normalizado + ":" + senha`, com o mesmo PBKDF2-SHA256 de 600 mil iterações (`client/js/vault-crypto.js`). Hoje saem só da senha.
2. **Normalização do e-mail:** tirar espaços das pontas e pôr em minúsculas (`trim().toLowerCase()`). Nada de regra por provedor (pontos do Gmail, `+etiqueta`): regra assim muda com o tempo e faria o mesmo e-mail dar endereços diferentes entre versões.
3. **Semente dentro do cofre:** hoje `exportLocalAccountBundle` (`client/js/local-account.js`) exporta apenas os JWKs de assinatura e não leva a semente nem a chave de DM (`client/js/identity-seed.js`). Quando a conta tiver semente (§3.3), o pacote cifrado passa a incluir a semente (16 bytes em base64url); ao restaurar, `importLocalAccountBundle` reconstrói da semente tanto a chave de assinatura P-256 quanto a **chave de DM** (`identityFromSeed`) e mantém a frase de 12 palavras.
4. **A senha continua com o mínimo de 12 caracteres** (`VAULT_PASSPHRASE_MIN`). Quem opera o servidor de memória guarda o cofre cifrado; conhecendo o e-mail do alvo, o que protege a chave é só a senha.
5. O servidor vê um identificador de 64 caracteres hexadecimais. Não recebe o e-mail, nem um hash só do e-mail: sem a senha não dá para perguntar "esta pessoa tem conta?".
6. **Cofres que já existem** (endereçados só pela senha) continuam abrindo: "Já tenho conta" tenta o endereço novo (`e-mail + ":" + senha`) e depois o antigo (só `senha`). Na primeira gravação com e-mail, o cofre vai para o endereço novo e o antigo recebe a marca de revogado.
7. **Trocar e-mail ou senha** grava o cofre no endereço novo e revoga o anterior.
8. **Na volta ("Já tenho conta"):**
   - **Pelo link do próprio e-mail (`#/sync?b=…`):** abre `client/js/app/screens-sync.js` já com o cofre carregado do fragmento `#` (sem depender de servidor) e pede só a senha.
   - **Digitando e-mail e senha direto no app:** o aparelho calcula o endereço e busca o cofre no armazenamento local e nos servidores de memória configurados (`client/js/central-memory.js`). Se nenhum servidor responder ou tiver o cofre, a mesma tela — mantendo a senha já preenchida — pede para tocar no link do e-mail auto-enviado ou colar ali mesmo o link/código `VOX1:…` (ou o texto inteiro do e-mail). Frase, QR do outro aparelho, guardiões e arquivo `.txt`/`.voxid` continuam ao lado.

### 6.4 Kit de volta no e-mail da própria pessoa
Ao criar a conta, o app abre `mailto:` para o e-mail informado, **da pessoa para ela mesma**. O Vox não envia nada.

O corpo leva:
1. **Link de volta (1 clique):** `#/sync?b=<cofre cifrado>`. O que vem depois do `#` não vai para servidor nenhum. Abriu o link, digitou a senha, entrou.
2. **Código cifrado (`VOX1:…`) / colagem direta:** para contas com semente (cofre curto), o código `VOX1:…` vai destacado logo abaixo; em qualquer conta, colar o próprio link `#/sync?b=…`, o código `VOX1:…` ou o corpo inteiro do e-mail em "Já tenho conta" extrai o cofre automaticamente, mesmo que o domínio do site mude no futuro.
3. Data, nome e `vx_…`, para a pessoa achar o e-mail depois.

**A senha nunca vai no e-mail.**

**A frase de recuperação é opcional e vem desmarcada.** Uma caixa "Incluir a frase de 12 palavras neste e-mail" fica ao lado do botão, com o aviso: "Com a frase no e-mail, quem ler sua caixa de entrada entra como você, mesmo sem a senha. Só marque se você confia mais no seu e-mail do que na sua memória."
- Desmarcada (padrão): o e-mail sozinho não abre a conta; precisa da senha. Vale o §3.3.6.
- Marcada: o e-mail passa a ser a conta, e a segurança dela é a do provedor de e-mail. É escolha da pessoa, registrada em Perfil → Segurança ("frase enviada por e-mail em <data>").
- Para quem esquece a senha e não marcou a caixa, os caminhos são os do §3.2: frase no papel e guardiões.

### 6.5 Quando o `mailto:` não abre (ou o e-mail foi digitado errado)
Depois de "Criar conta", sem bloquear a navegação, um cartão "Confirme o envio do seu e-mail de segurança" mostra `Para: <e-mail>` (com ação **Corrigir e-mail**) e oferece:
- **Abrir app de e-mail** (dispara o `mailto:` de novo);
- **Copiar e-mail pronto** (assunto e corpo, para colar no webmail no computador);
- **Baixar cópia (.txt)**.

A conta conta como **com saída** (§3.5.3) quando a pessoa confirma que enviou ou guardou. Sem confirmar, vale a faixa do §3.5.

### 6.6 O que é saída e o que é atalho
| Caminho | Tipo | Por quê |
|---|---|---|
| Kit no e-mail (link `#/sync?b=…` ou código `VOX1:…`) mais a senha | **Saída soberana** | é a "Senha Soberana com backup no e-mail" do §3.2, agora criada junto com a conta e com a semente preservada |
| Cofre no servidor de memória, por e-mail e senha | **Saída soberana**, enquanto houver servidor | depende de haver servidor de memória configurado e no ar (REV-04) |
| E-mail e senha salvos no gerenciador do navegador | Atalho | mora na conta Google ou Apple; acelera o dia a dia |
| Frase dentro do e-mail (caixa marcada) | **Saída, com a segurança rebaixada** | funciona sem senha, mas quem lê o e-mail entra |

### 6.7 Riscos e limites verificados no código
- **Quem lê a caixa de e-mail pode tentar senhas à vontade** sobre o link ou o código, sem limite de tentativas. O backup por e-mail que já existe tem a mesma exposição. Por isso o mínimo de 12 caracteres não cai.
- **E-mail digitado errado** abre o rascunho para outro endereço no app de e-mail da pessoa. Sem a caixa da frase, mesmo que ela envie por engano, o destinatário recebe algo que não abre sem a senha; com a caixa marcada, recebe a conta. É o motivo de a caixa vir desmarcada e de o cartão do §6.5 permitir corrigir o endereço na hora.
- **Servidor de memória padrão (`client/js/central-memory.js`):** verificado no código que `DEFAULT_MEMORY_URLS` aponta apenas para `http://127.0.0.1:3921` e `http://127.0.0.1:3920` até que a pessoa escolha um servidor remoto (`client/js/memory-server-choice.js`, [ADR-022](./022-memoria-central-por-consentimento.md)). Sem servidor remoto configurado, digitar só e-mail e senha em aparelho limpo não acha o cofre pela rede — por isso o fluxo de volta (§6.3.8) já aceita na mesma tela o clique no link do e-mail ou a colagem do texto recebido.
- **Tamanho do `mailto:` (`client/js/vault-crypto.js` e `client/js/local-account.js`):**
  - **Conta com semente (§3.3):** cifrando `{ seed, displayName, pix }` no cofre v2, o payload codificado em base64url fica em ~350–550 caracteres; o URI `mailto:` completo (assunto + texto + link `#/sync?b=…` + código `VOX1:…`) fica abaixo de **1.200 caracteres**, dentro do piso de 2.000 caracteres dos clientes de e-mail e do Windows.
  - **Conta antiga sem semente:** o bundle com os JWKs P-256 completos gera ~1.650–1.850 caracteres em `encodeVaultBundleForUrl`. Para não duplicar esse bloco no `mailto:` e estourar 2.000 caracteres, em contas sem semente o `mailto:` leva apenas uma cópia do bloco (no link `#/sync?b=…`, que também funciona se colado em "Já tenho conta"), enquanto **Copiar e-mail pronto** e **Baixar cópia (.txt)** não têm limite de URL.
- **Pedir e-mail na primeira tela tem custo de percepção** numa rede política, mesmo sem guardar. O texto do §6.2.3 e o caminho sem e-mail (§6.2.5) existem por isso.
- **A decisão de 12/11 ("e-mail é cofre, não identidade") continua valendo na letra:** nenhum servidor conhece o e-mail. O que muda é que a pessoa passa a usá-lo localmente para endereçar o cofre e mandar o kit para si mesma.
- Entra no [THREAT-MODEL](../THREAT-MODEL.md) como ameaça nova (kit no e-mail e frase opcional) no PR que implementar.

### 6.8 Ordem de entrega
1. `client/js/local-account.js`, `client/js/vault-crypto.js` e `client/js/oauth-vault.js`: incluir a semente no bundle exportado (restaurando chave de assinatura + DM + semente em `importLocalAccountBundle`); derivar endereço, prova de dono e chave por `e-mail normalizado + ":" + senha`, com fallback de leitura e migração/revogação do endereço antigo (só senha). Testes: mesma senha com e-mails diferentes dá endereços diferentes; conta com semente restaura a mesma chave de DM e frase de 12 palavras; cofre antigo ainda abre; trocar e-mail ou senha revoga o endereço anterior.
2. Kit de volta: montar o assunto/corpo do `mailto:` (respeitando o teto de 2.000 caracteres), o cartão do §6.5 (abrir app, copiar, baixar `.txt` e corrigir e-mail) e a caixa opcional da frase (com registro local em Perfil → Segurança). Teste: o corpo nunca contém a senha; a frase só aparece com a caixa marcada.
3. Tela de entrada e "Já tenho conta" (`client/js/render/oauth-modals.js` e `client/js/app/onboarding.js`) com o formulário `Nome + E-mail + Senha`, caminho sem e-mail (§6.2.5) e colagem direta do link/código/texto do e-mail quando não houver servidor de memória com o cofre.
4. Linha no [THREAT-MODEL](../THREAT-MODEL.md), [FEATURES](../FEATURES.md) e Voxpedia.
