# ADR-018: Selo gov.br opcional via parceiro público, desacoplado do login

**Status:** proposed · **Revisado:** 2026-11-08 · **Fase:** D (verificação de cidadania opcional — [COMPLIANCE-BR § Identidade e Política Anti-CPF](../legal/COMPLIANCE-BR.md#identidade-chave-pix-fase-a-e-política-anti-cpf-fase-57))

## 1. Contexto

Há interesse em "login com gov.br". Pesquisa no roteiro técnico oficial, em 2026-11-08:

- **Credencial de produção exige domínio oficial de governo.** O roteiro diz que "é imprescindível que o sistema a ser integrado esteja hospedado em um domínio oficial de governo" (gov.br, edu.br, leg.br, jus.br, mil.br…), conforme o art. 3º da Portaria SGD/MGI nº 7.076/2024 ([fonte](https://roteiro-tecnico.acesso.gov.br/solicitacaocredencialprocesso.html)). O Vox roda em `yurikayel.github.io` e `vox-9df.pages.dev`, então só conseguiria credencial de homologação.
- **O protocolo exige servidor.** É OpenID Connect com authorization code + PKCE (S256), e a troca no `/token` usa `client_secret` em Basic auth ([fonte](https://roteiro-tecnico.acesso.gov.br/iniciarintegracao.html)). O segredo não pode ficar no PWA, e hoje não existe relay público do Vox ([INFRA-CUSTOS](../INFRA-CUSTOS.md)).
- **WebView não é aceito.** O fluxo precisa de navegador nativo, e o `vox.apk` é WebView.
- **O identificador é o CPF.** `sub` e `preferred_username` trazem o CPF. O `id_token` traz `reliability_info` com o nível (bronze, prata, ouro) e os selos (ex.: `tse_facial`, `cin_facial`).
- **A COMPLIANCE-BR veda CPF como login** (Política Estrita Anti-CPF-Login) e já prevê que uma eventual verificação gov.br seja "estritamente opcional, desacoplada do login e mantida na Fase D".

Por outro lado, o nível de confiabilidade resolve um limite admitido no [README](../../README.md#-compromissos-fundamentais): uma chave criptográfica não prova que existe uma pessoa única por trás. Com o nível prata ou ouro, votações formais poderiam valer 1 pessoa = 1 voto.

## 2. Decisão (proposta)

1. **O gov.br nunca será login do Vox.** A identidade continua sendo a chave local `vx_*`, e nada no Vox exige gov.br para ler, postar, conversar ou participar.
2. **Selo opcional "conta gov.br verificada"** emitido por um **verificador hospedado por parceiro público com domínio oficial**: projeto de extensão de universidade (`*.edu.br`), Câmara Municipal (`*.leg.br`) ou órgão interessado. O parceiro solicita a credencial em nome próprio.
3. **Fluxo do atestado**, sem o CPF chegar ao Vox:
   1. No Vox, a pessoa pede o selo. O cliente gera um desafio que contém a chave pública `vx_*` e um nonce.
   2. O navegador nativo abre o verificador do parceiro, que faz o login gov.br (OIDC + PKCE + `client_secret` no servidor dele).
   3. O verificador lê `reliability_info` e calcula `pseudonimo = HMAC(segredo_do_parceiro, CPF)`. O CPF é descartado em seguida e não é guardado nem registrado em log.
   4. O verificador devolve um **atestado assinado** (Ed25519 do parceiro): `{ vxKey, nivel: "prata"|"ouro", pseudonimo, emitidoEm, expiraEm, emissor }`.
   5. O cliente publica o atestado (tag `Type: govbr-attestation`) ou guarda só localmente, conforme a pessoa escolher.
4. **Unicidade:** comunidades que exigirem selo para votar contam no máximo **um voto por `pseudonimo`**. O pseudônimo é estável dentro do mesmo emissor e não pode ser revertido para CPF sem o segredo do parceiro.
5. **Exigência só por governança:** cada comunidade decide, por proposta votada, se pautas formais exigem selo (e qual nível). O padrão é **não exigir**. O aval comunitário da feature F8 continua sendo o caminho sem governo.
6. **Vários emissores:** o cliente aceita atestados de uma lista de emissores publicada e versionada. Nenhum parceiro vira ponto único.

## 3. Alternativas consideradas

- **Login Único direto no Vox:** inviável em produção (domínio oficial) e contrário à Política Anti-CPF-Login.
- **Assinatura gov.br de um documento com a chave `vx_*`, checada por validadores da comunidade** (validar.iti.gov.br): não exige parceiro, mas o validador vê o nome da pessoa, não dá unicidade automática, e o uso fora da relação com o poder público (Lei 14.063/2020) é zona cinzenta. Fica como opção manual de transição, não como mecanismo do protocolo.
- **Só aval comunitário (F8):** continua sendo o padrão. É insuficiente sozinho para 1 pessoa = 1 voto em escala.

## 4. Consequências

- **Positivas:** prova de pessoa única opcional para votos formais, sem o Vox tocar em CPF e sem atrelar o login ao Estado.
- **Negativas e riscos:**
  - **Dependência de parceiro:** convênio, manutenção do verificador e rotação de chave.
  - **O parceiro vê quem pede selo.** Ele vira operador de dados pessoais (LGPD: base legal, aviso de privacidade, retenção zero do CPF). O atestado precisa expirar para limitar o vínculo.
  - **Risco político:** o selo pode ser percebido como "vigilância". A UI precisa ser honesta: "o parceiro X confirma que você tem conta gov.br nível prata; o Vox não recebe seu CPF".
  - **Exclusão:** quem não tem conta prata ou ouro não vota onde a comunidade exigir selo. Mitigação: a exigência é opcional e decidida por governança, e a F8 continua como alternativa.

## 5. Critérios para virar `accepted`

Rastreados no [ROADMAP](../ROADMAP.md) como **REV-08** ([ADR-017](./017-consolidacao-roadmap-unico.md): caixas só lá).

- Parceiro público identificado e disposto a solicitar a credencial (ROADMAP **REV-08**).
- Confirmar com o parceiro e com o Serviço de Integração se um verificador que emite atestado para terceiros é uso permitido do Login Único.
- Parecer jurídico sobre LGPD (papéis controlador/operador, pseudônimo HMAC como dado pessoal) e acréscimo à [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md).
- Spec do formato do atestado e da lista de emissores (RFC em `docs/rfc/`).
- Teste em homologação (`sso.staging.acesso.gov.br`) com um verificador de exemplo.
