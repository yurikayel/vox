# ADR-037: Cofre na malha — e-mail e senha abrem a conta em qualquer aparelho, sem servidor

**Status:** accepted (2026-11-17, pelo mantenedor, junto com o fim do congelamento da identidade; v0 implementada no mesmo PR) · **Revisado:** 2026-11-17 · **Relacionados:** [ADR-032 §6](./032-login-perene-a-conta-nasce-com-saida.md#6-emenda-1-2026-11-14-entrada-com-nome-e-mail-e-senha-o-kit-de-volta-vai-para-o-e-mail-da-própria-pessoa) (cofre por e-mail e senha), [ADR-022](./022-memoria-central-por-consentimento.md) (memória central), [spec dos guardiões](../specs/guardioes-v0.md) §7 e §12.2, [ADR-034](./034-raiz-e-subchaves-por-aparelho.md), [ADR-036](./036-agilidade-criptografica-pos-quantica.md), [THREAT-MODEL](../THREAT-MODEL.md) (T26, T27)

## 1. Contexto

Desde a emenda 1 do ADR-032, a conta nasce com um cofre cifrado por `e-mail + ":" + senha` (PBKDF2-SHA256, 600 mil iterações). O endereço do cofre sai das mesmas credenciais. Mas o cofre só mora em dois lugares:

1. neste aparelho (`localStorage`);
2. nos servidores de memória escolhidos, que por padrão são só `127.0.0.1` (`client/js/central-memory.js`).

Num aparelho limpo, "Já tenho conta" com e-mail e senha não acha nada pela rede. A pessoa precisa achar o e-mail antigo e tocar no link. Ou seja: o caminho que todo mundo espera ("e-mail e senha") é justamente o que não funciona sem servidor, e o Vox não quer servidor de contas.

A rede já guarda coisas dos outros em caixa preta: as cópias de posts de quem segue e os pedaços dos guardiões. O cofre cifrado de uma conta com semente cabe em ~550 caracteres.

## 2. Opções

1. **Servidor de memória padrão operado pelo projeto.** Recusada: é o servidor central que o Vox não quer, e vira alvo.
2. **Só o link do e-mail.** É o que existe; falha para quem não acha o e-mail ou trocou de provedor.
3. **O cofre cifrado fica com os laços mútuos e os guardiões; o aparelho novo pede pela caixa postal cega, e a dona pode vetar.** **Escolhida.**

## 3. Decisão

### 3.1 Quem guarda
- Ao gravar o cofre (conta nova, troca de e-mail ou senha), o aparelho manda o **cofre já cifrado** para até **7 guardas**: primeiro os guardiões, depois os laços mútuos (spec dos guardiões §12.2). Sempre que o app abre, completa a lista com laços novos.
- A mensagem `vox-cofre-guarda` (v0) é assinada pela dona e vai dentro de envelope de DM, pelo caminho da DM: `{ owner, address, record, updatedAt }`.
- Quem guarda confere a assinatura e só aceita de **laço mútuo**. Guarda **um cofre por dona** (o mais novo vence, então troca de senha substitui sozinha) e no máximo **50 donas**, cada cofre até 4 KB.
- O cofre fica em **caixa preta**: não há tela para ver, exportar nem abrir. O app mostra só "Você guarda o cofre de N pessoas".
- `vox-cofre-solta` (assinada pela dona) faz quem guarda apagar o cofre dela.

### 3.2 Como o aparelho novo pede
1. A pessoa digita e-mail e senha. O aparelho calcula o endereço do cofre (como hoje) e, dele, a **chave da caixa do cofre**: `HKDF-SHA256(endereço, salt "vox-cofre-malha-v0", info "vox-cofre-caixa-p256")`, reduzida a um escalar P-256 como no ADR-032 §5.2. Só quem sabe o endereço chega a essa chave: a dona e quem guarda.
2. O aparelho gera uma chave temporária (como no pedido aos guardiões) e deposita o pedido `{ k, t, n }` **selado para a chave da caixa** na caixa postal cega do relay, no endereço `vxcof_` + 20 caracteres de `SHA-256("vox-cofre-caixa-v0|" + endereço)`.
3. Quem guarda, ao abrir o app (e a cada 10 minutos com ele aberto), olha as caixas dos cofres que guarda, abre os pedidos e confere a idade (até 72 h).
4. A resposta vai **selada para a chave temporária**, na caixa `vxcofr_` + 20 caracteres do hash dela. O aparelho novo abre e decifra o cofre com a senha, como se tivesse vindo de um servidor.

O relay vê só endereços de caixa que são hashes e envelopes selados; não sabe de quem é a conta nem que é um cofre. Quem pode pedir já precisava saber o endereço, ou seja, o e-mail e a senha.

### 3.3 Espera e veto
- Ao ver um pedido novo, quem guarda manda à dona a mensagem assinada `vox-cofre-aviso` `{ requestId, firstSeen }`. Os aparelhos da dona mostram: "Alguém está abrindo sua conta em outro aparelho. Foi você?", com **Fui eu** e **Não fui eu**.
- A resposta `vox-cofre-decisao` `{ requestId, decision }` é **assinada pela conta**. Quem guarda confere que o autor é a dona.
  - **Fui eu:** entrega na hora.
  - **Não fui eu:** descarta o pedido, não entrega mais nada a ele e o app sugere trocar a senha (o que muda o endereço e substitui o cofre).
  - **Sem resposta:** entrega **24 h** depois do primeiro aviso. É o caso de quem perdeu todos os aparelhos.
- Quem roubou só a senha e o e-mail não consegue aprovar: a decisão precisa da chave da conta, que ele não tem.
- O caminho instantâneo continua sendo o link do próprio e-mail ou a frase.

### 3.4 Tela única de volta
"Já tenho conta" passa a ter um caminho principal, **e-mail e senha**, que procura em ordem: neste aparelho, nos servidores de memória escolhidos e na malha. Se a busca for para a malha, a tela diz "Pedimos seu cofre à sua rede. Chega em até 24 h, ou na hora se você aprovar em outro aparelho seu" e continua olhando sozinha. Frase, guardiões, QR, link e arquivo ficam em "Outras formas de voltar".

### 3.5 O que fica para depois
- **Recibo de quem guarda** (`vox-cofre-recibo`) e contar a malha como saída soberana com 2 recibos. No v0 a malha é atalho: a faixa do ADR-032 §3.5 não muda.
- **Espera e veto no pedido aos guardiões.** Lá a conferência é por voz; o aviso à dona entra na próxima versão da spec.
- **KDF resistente a GPU** (Argon2id) para o cofre: ADR-036 e revisão externa (LAN-18).

## 4. Consequências

- **E-mail e senha funcionam num aparelho limpo** enquanto um guarda abrir o app e houver um relay no ar. Sem servidor de contas e sem custo de infra.
- **Nova exposição (T27):** quem guarda tem o cofre cifrado e conhece a dona; pode tentar senhas à vontade, offline. É a mesma exposição do kit no e-mail (T26), limitada a laços mútuos. Por isso o mínimo de 12 caracteres não cai e o Argon2id fica na fila do ADR-036.
- **Disponibilidade depende da rede:** com nenhum guarda online, o pedido espera até alguém abrir o app (o pedido vale 72 h, e o aparelho novo pode pedir de novo).
- **Sem cripto nova:** HKDF, P-256 e o envelope de DM que já existem. A derivação da chave da caixa é formato novo e entra na revisão LAN-18.
- **Código:** `client/js/vault/mesh-vault.js` (formatos, caixa, guarda, decisão; camada base), `client/js/app/mesh-vault-flow.js` (transporte), ganchos em `app/dm-wire.js`, na gravação do cofre e na tela de entrada.
