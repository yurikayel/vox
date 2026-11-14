# ADR-032: Login perene — a conta nasce com saída, sem depender de empresa nem de servidor

**Status:** accepted (2026-11-13, pelo mantenedor; passo 1 — §3.1 e §3.5 — implementado no SW v7.113; passo 2 — frase, §3.3 e §5.1–5.2 — no SW v7.115/v7.116, cartão ainda sem QR) · **Revisado:** 2026-11-13 · **Relacionados:** [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [ADR-031](./031-passkey-abre-a-mesma-conta.md), [ADR-026](./026-chaves-em-repouso-trava-depois-do-backup.md), [ADR-022](./022-memoria-central-por-consentimento.md), [ADR-030](./030-trazer-do-bluesky-pesos.md), [ADR-002](./002-oauth-profile-enrich-client.md), [THREAT-MODEL T20](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md), [ROADMAP](../ROADMAP.md) (REV-14, PM-13, PM-101)

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

> Como funciona em detalhe (mensagens, Shamir, pedido de volta, ameaças e entrega em partes): [spec dos guardiões v0](../specs/guardioes-v0.md), em revisão.

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
