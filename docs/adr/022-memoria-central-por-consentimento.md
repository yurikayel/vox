# ADR-022: Memória central — servidor escolhido pela pessoa, nunca fonte de verdade

**Status:** accepted (implementado no SW v7.61; o cofre que passa por ela segue aberto no PM-90) · **Revisado:** 2026-11-10 · **Relacionados:** PM-86, PM-91, PM-90, PM-94, [ADR-021](./021-integridade-na-entrada-forma-assinada.md), [ADR-014](./014-zero-knowledge-vault-recuperacao-soberana.md), [THREAT-MODEL T16, T20, T22](../THREAT-MODEL.md), [revisão DevSecOps](../audits/revisao-devsecops-2026-11-10.md)

## 1. Contexto

A memória central (`central-memory.js` + `relay/central_memory.py`, "Modo 3") guarda uma cópia de tudo o que o aparelho grava e a devolve quando a pessoa troca de aparelho ou fica offline. Ela roda no nó local (loopback) ou num servidor de steward, às vezes exposto por túnel.

A revisão de 10/11 achou dois problemas:
- **O servidor era tratado como confiável.** O que voltava dele era gravado sem conferir (PM-86).
- **O servidor podia ser trocado sem a pessoa saber.** Um link, um par na malha ou o próprio servidor mudavam o destino, e tudo o que o aparelho gravava, inclusive o cofre de recuperação, passava a ir para lá (PM-91).

## 2. Decisão

1. **A memória central é cópia, não fonte de verdade.** O que volta dela passa pelas mesmas regras de qualquer entrada (ADR-021). O servidor pode **reter** dados, mas não consegue **inventar** conteúdo.
2. **Quem escolhe o servidor é a pessoa.** Link (`?memory=`), aviso de par (`MEMORY_BEACON`) e endereço de túnel informado pelo servidor só criam uma **sugestão** (`memory-server-choice.js`).
   - **A pergunta.** O app pergunta ao abrir, mostrando o domínio, quem sugeriu e o que passa a ser enviado.
   - **Recusa.** Sugestão recusada não volta.
   - **Endereços antigos.** O que versões anteriores gravaram sem perguntar foi rebaixado a sugestão.
3. **Só `https`,** exceto o nó no próprio aparelho (`http://127.0.0.1`, `localhost`).
4. **O aparelho só anuncia aos pares o servidor que a pessoa escolheu.** Sugestão não vira anúncio.
5. **A pessoa precisa saber o que vai para o servidor.** O texto da pergunta diz que posts, remoções, cartões e o cofre são enviados e que quem controla o servidor vê tudo isso. Envio seletivo (escolher o que vai) fica para depois.

## 3. Consequências

- Um link malicioso ou um par malicioso não desvia mais os dados sem uma decisão consciente.
- Quem usava `?memory=` legítimo precisa aceitar uma vez depois da atualização.
- **O que segue aberto:**
  - o cofre de recuperação que passa pela memória (PM-90);
  - autenticação do dono no relay (PM-94);
  - cartões de diretório sem assinatura (`hydrateProfiles`);
  - o servidor ainda vê metadados: quem sincroniza, quando e de qual IP.
