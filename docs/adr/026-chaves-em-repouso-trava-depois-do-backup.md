# ADR-026: Chaves privadas em repouso — chave do aparelho e trava depois do backup

**Status:** accepted · implementado (etapa 1 no SW v7.63, etapa 2 no SW v7.64) · **Revisado:** 2026-11-10 · **Relacionados:** PM-93, PM-96, [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [THREAT-MODEL T1 e T21](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md)

## 1. Contexto

No Vox a pessoa *é* a sua chave. Até o SW v7.62, as chaves privadas de identidade (ECDSA P-256), de DM (ECDH P-256) e da carteira Arweave (RSA) ficavam em texto claro no `localStorage`. Podia levá-las:
- quem copia o armazenamento ou os arquivos do navegador;
- uma extensão;
- um XSS.

Uma chave levada permite falar em nome da pessoa, assinado, para sempre.

O mantenedor escolheu, em 10/11/2026, entre três caminhos:
- **só a chave do aparelho:** pequeno, mas não protege contra XSS;
- **senha a cada abertura:** a proteção mais forte, mas com atrito para todo mundo;
- **trava depois do backup:** o escolhido.

## 2. Decisão

1. **Etapa 1 — chave do aparelho (SW v7.63).**
   - **A chave:** AES-GCM-256 **não exportável**, guardada no IndexedDB (`client/js/keystore.js`).
   - **O que ela cifra no `localStorage`:** as chaves privadas da conta ativa, de cada conta do cofre multi-conta, da DM e da carteira.
   - **Quando abre:** só na hora de assinar, abrir uma DM, publicar ou exportar um backup.
   - **Migração:** na abertura do app, `key-at-rest.js` cifra o que estiver em claro. Se o armazenamento mudar no meio, o item fica para a próxima abertura, e nada é apagado.
   - **Armazenamento:** o app pede ao navegador para não apagar os dados sob pressão (`navigator.storage.persist`).
2. **Etapa 2 — trava depois do backup (SW v7.64, `client/js/key-lock.js`).**
   - **O que conta como backup:** o cofre salvo com a Senha Soberana, ou um `.voxid` cifrado com ela. A senha precisa ter 12+ caracteres, o mesmo mínimo do cofre. Restaurar por um desses dois caminhos também trava.
   - **Depois dele:** assinatura e DM passam a usar `CryptoKey` **não exportável** no IndexedDB. A chave só é gravada depois de assinar e conferir um teste com a chave pública.
   - **A cópia cifrada pelo aparelho some.** No `localStorage` fica só uma referência (`{ locked, kid }`). A única cópia exportável é a cifrada pela senha (`vox-locked-keys-v1`, mesmo formato do cofre v2: PBKDF2 600 mil).
   - **Ordem segura:** primeiro a chave no IndexedDB, depois a cópia por senha, e só então a troca no `localStorage`. Uma falha no meio deixa a conta como estava, cifrada pelo aparelho.
   - **Backup novo:** pede a mesma senha. Sem ela, ou com outra, o app recusa (`KeyLockedError`).
   - **Por conta:** cada conta do cofre multi-conta trava quando ela mesma tem backup. Limpar o aparelho apaga as cópias por senha e as chaves travadas.
3. **Nunca trocar identidade por falha de leitura.** Se uma chave cifrada ou travada não abre (IndexedDB indisponível, falha passageira do Safari, IndexedDB apagado), o app mostra erro e não gera chave nova por cima (`KeystoreUnavailableError`). A conta volta pelo cofre ou pelo `.voxid` com a senha.
4. **Navegador sem IndexedDB:** nada é cifrado nem travado, e o comportamento é igual ao de antes (modo degradado). Ainda não há aviso disso na tela.

## 3. Consequências

- **O que a etapa 1 protege:** cópia do armazenamento, dos arquivos do navegador ou de um backup do perfil leva só texto cifrado.
- **O que a etapa 2 acrescenta:** depois do backup, nem o código da própria página consegue ler a chave de identidade ou de DM. Ele só consegue usá-la enquanto a página está aberta, e a CSP sem script inline (T1) é a barreira para isso.
- **Risco novo:** apagar só o IndexedDB e manter o `localStorage` torna as chaves ilegíveis. Navegadores apagam os dois juntos ("limpar dados do site", despejo por espaço, ITP do Safari), mas uma limpeza seletiva pelas ferramentas de desenvolvedor faz isso. Por isso o backup com a Senha Soberana continua sendo a garantia, e o app pede armazenamento persistente.
- **Limites:**
  - **Trocar a Senha Soberana de uma conta travada** ainda não tem tela. O backup novo só aceita a senha com que a conta foi travada.
  - **A carteira Arweave** continua cifrada pelo aparelho, com a senha própria da carteira como opção (já existente). O envio para o Arweave usa o JWK em vários pontos.
  - **A sessão do Bluesky** (`bsky-oauth.js`, chave DPoP e tokens) ainda fica em claro. Vai para o PM-96.
