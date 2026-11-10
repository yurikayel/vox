# ADR-026: Chaves privadas em repouso — chave do aparelho e trava depois do backup

**Status:** accepted · etapa 1 implementada (SW v7.63); etapa 2 a implementar · **Revisado:** 2026-11-10 · **Relacionados:** PM-93, [ADR-025](./025-cofre-v2-so-a-senha-abre.md), [THREAT-MODEL T1 e T21](../THREAT-MODEL.md), [IDENTITY](../IDENTITY.md)

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

1. **Etapa 1 — chave do aparelho (implementada).**
   - **A chave:** AES-GCM-256 **não exportável**, guardada no IndexedDB (`client/js/keystore.js`).
   - **O que ela cifra no `localStorage`:** as chaves privadas da conta ativa, de cada conta do cofre multi-conta, da DM e da carteira.
   - **Quando abre:** só na hora de assinar, abrir uma DM, publicar ou exportar um backup.
   - **Migração:** na abertura do app, `key-at-rest.js` cifra o que estiver em claro. Se o armazenamento mudar no meio, o item fica para a próxima abertura, e nada é apagado.
   - **Armazenamento:** o app pede ao navegador para não apagar os dados sob pressão (`navigator.storage.persist`).
2. **Etapa 2 — trava depois do backup (a implementar).**
   - **Assinatura:** passa a usar `CryptoKey` não exportável no IndexedDB.
   - **Depois do primeiro backup com a Senha Soberana:** a cópia exportável cifrada pelo aparelho é apagada. A única cópia exportável passa a ser a cifrada pela senha (cofre v2 ou `.voxid`).
   - **Backup novo ou troca de senha:** pede a senha.
3. **Nunca trocar identidade por falha de leitura.** Se uma chave cifrada não abre (IndexedDB indisponível, falha passageira do Safari), o app mostra erro e não gera chave nova por cima (`KeystoreUnavailableError`).
4. **Navegador sem IndexedDB:** nada é cifrado e o comportamento é igual ao de antes (modo degradado). A etapa 2 deve mostrar esse estado na tela de rede.

## 3. Consequências

- **O que a etapa 1 protege:** cópia do armazenamento, dos arquivos do navegador ou de um backup do perfil leva só texto cifrado.
- **O que ainda não protege:** código que roda dentro da página ainda pode usar as chaves, como o próprio app usa. A CSP sem script inline (T1) é a barreira, e a etapa 2 é que impede levar a chave embora.
- **Risco novo:** apagar só o IndexedDB e manter o `localStorage` torna as chaves ilegíveis. Navegadores apagam os dois juntos ("limpar dados do site", despejo por espaço, ITP do Safari), mas uma limpeza seletiva pelas ferramentas de desenvolvedor faz isso. Por isso o backup com a Senha Soberana continua sendo a garantia, e o app pede armazenamento persistente.
- **Fora do escopo:** a sessão do Bluesky (`bsky-oauth.js`, chave DPoP e tokens) ainda fica em claro. Vai para o PM-96.
