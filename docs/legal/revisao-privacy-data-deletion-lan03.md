# Guia de revisão jurídica (diff-oriented) — `privacy.html` e `data-deletion.html` (LAN-03)

> **Status:** rascunho (pré-parecer REV-12; **pendente de parecer jurídico humano (`REV-12`) — não é aconselhamento jurídico**) · **Owner:** revisor + jurídico · **Revisado:** 2026-11-22  
> **Referências:** [ROADMAP.md](../ROADMAP.md) (`LAN-03`, `REV-12`) · [COMPLIANCE-BR.md](./COMPLIANCE-BR.md) · [privacy.html](../../client/privacy.html) · [data-deletion.html](../../client/data-deletion.html) · [pesquisa-complementar-2026-11.md](../research/pesquisa-complementar-2026-11.md)

> **Nota operacional (Service Worker / `CACHE_NAME`):** os arquivos [client/privacy.html](../../client/privacy.html) e [client/data-deletion.html](../../client/data-deletion.html) (ambos datados de `25 de outubro de 2026`) foram mantidos **intocados** neste estágio pré-parecer para não sujar o cache do Service Worker nem publicar texto jurídico ainda não validado no `REV-12` ([GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31)). Este documento audita o texto real vigente nesses dois arquivos e especifica os diffs necessários para a revisão jurídica e a implementação final do `LAN-03`.

---

## 1. Resumo das lacunas encontradas nos textos atuais (25/10/2026)

| Tema regulatório / técnico | O que diz hoje em `privacy.html` / `data-deletion.html` | Problema / risco jurídico | O que precisa mudar (`LAN-03` pós-`REV-12`) |
|---|---|---|---|
| **STF Temas 987/533 (itens 5–11 + embargos 17/06/2026)** | `privacy.html` §1 afirma apenas que "não existe backend Vox" e aponta contato por issue pública no GitHub. | Não distingue software aberto × instância PWA oficial (`LAN-31`); não endereça representante PJ (item 11), canal para não usuários / contestação (itens 8–9), relatório anual (item 8) nem ressalva CDC/marketplace da Feira (item 7). | Explicitar papéis (software AGPL vs. operador da instância oficial), incluir campos reservados `[REV-12 / REV-18]` para representante PJ/foro, canal para não usuários e contestação (`REV-20`), e ressalva da Feira/CDC. |
| **Decretos 12.975/2026 e 12.976/2026 (dever de cuidado e ANPD)** | Não há menção a dever de cuidado, prevenção sistêmica ou prazo de remoção de conteúdo grave. | Decretos dão à ANPD fiscalização sistêmica sobre plataformas e dever de cuidado contra crimes graves. | Descrever medidas estruturais (feed cronológico sem amplificação algorítmica, `hide-list` `LAN-13`, procedimento de conteúdo grave `LAN-04` com meta ≤ 2 h) e canais de denúncia (`LAN-12` + `REV-20`). |
| **ECA Digital (Lei 15.211/2025, Decreto 12.880/2026)** | `privacy.html` §7 (linhas 91–94) diz: *"O Vox não é direcionado a menores de 13 anos. Pais ou responsáveis podem solicitar orientação via issue no repositório."* | **Contradição direta e risco regulatório:** no piloto G1 (`ADR-020`), o app exige **18+ autodeclarado** (`client/js/age-gate.js`), e não 13+. Além disso, o ECA Digital (vigente desde 17/03/2026) alcança serviços de "provável acesso" e exige **vínculo obrigatório com responsável legal abaixo de 16 anos**. | Substituir §7 para declarar restrição **18+ no piloto G1** (sem coleta de data de nascimento/documento) e registrar o plano de adequação pré-G3 (`REV-23`: padrões seguros <18 e vínculo de responsável <16). |
| **Resolução TSE 23.755/2026** | Nenhuma menção a conteúdo eleitoral ou ausência de ranqueamento. | Vedação de ranquear, recomendar ou priorizar candidatos, campanhas ou partidos no período eleitoral e exigência de transparência. | Informar em `privacy.html` o feed estritamente cronológico e a desativação automática de sugestões em janela eleitoral (`REV-24`, `client/js/electoral-period.js`). |
| **Pix / DICT (Manual de Iniciação do Pix — BCB)** | Nenhuma menção em `privacy.html` nem em `data-deletion.html`. | Usuário pode achar que chave aleatória (EVP) preserva anonimato; na prática o app do pagador sempre exibe o **nome civil do DICT** (e CPF/CNPJ parcial). | Incluir aviso em `privacy.html` §2 e §4 sobre chave Pix local + regra do DICT, e atualizar `data-deletion.html` explicando que apagar no aparelho não apaga comprovantes/chaves já copiadas por terceiros. |
| **WebRTC P2P e TURN (`LAN-19`)** | `privacy.html` cita "gossip P2P" e "relays", sem mencionar exposição de endereço IP entre pares nem servidor TURN. | Pares conectados via WebRTC veem o **IP real** do usuário (indicando cidade/operadora); se usar TURN (`workers/turn`, após `INF-01`) ou sinalização, esses servidores também veem o IP. | Documentar exposição de IP no WebRTC em `privacy.html` §2 e §4, existência do toggle `"Esconder meu IP (só via servidor TURN)"` (`iceTransportPolicy: "relay"`), e que TURN/sinalização veem o IP na camada de transporte. |
| **Limites reais de exclusão (`arweaveUpload: false` vs. rede de seguidores vs. Arweave)** | `privacy.html` §2 (linha 53) e `data-deletion.html` §4 tratam o Arweave como destino normal de posts públicos, omitindo que hoje **`arweaveUpload` está `false`**. `data-deletion.html` §3 não alerta que cópias já replicadas a seguidores continuam nos aparelhos deles. | Desalinhamento factual com o app atual (`client/config/flags.json`: `arweaveUpload: false`) e expectativa imprecisa sobre o efeito de apagar a conta local. | Atualizar ambos os arquivos para refletir: (1) hoje todo conteúdo novo circula só na **rede de seguidores** (retração assinada + expiração natural, sem garantia contra cópia/print de terceiros); (2) Arweave só em registros legados ou recursos futuros explícitos, com impossibilidade técnica de remoção on-chain; (3) canal privado para pedidos LGPD que contenham PII (não só issue pública no GitHub). |

---

## 2. Auditoria detalhada de `client/privacy.html` (orientada a diff)

Referência do arquivo atual: [client/privacy.html](../../client/privacy.html) (linhas 1–107, revisão de `25 de outubro de 2026`).

### 2.1 Cabeçalho e Introdução (linhas 28–38)
- **Texto atual:** informa instância `yurikayel.github.io/vox`, ausência de cadastro centralizado e armazenamento local (`IndexedDB` e `localStorage`).
- **Ajuste recomendado (diff):**
  - Atualizar data de revisão quando publicado pós-`REV-12`.
  - Incluir link direto para `terms.html` (quando publicado no `LAN-02`).
  - Explicar em uma frase a diferença entre o **software livre (AGPL)** e a **instância PWA oficial** (`yurikayel.github.io/vox`), deixando claro que espelhos/relays de terceiros têm operadores próprios.

### 2.2 Seção `1. Controlador / operador desta instância` (linhas 40–46)
- **Texto atual:** *"Esta cópia em GitHub Pages é hospedagem estática do cliente; não existe backend Vox que armazene contas ou senhas. Contato para privacidade desta instância: issues no GitHub (assunto 'Privacidade / LGPD')."*
- **Problemas (STF itens 9 e 11; LGPD Art. 41):**
  1. Reduz a instância oficial à "hospedagem estática" sem nomear quem opera a instância (no G1: operador pessoa física conforme [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md); no G2/G3: verificar exigência do item 11 do STF de **sede e representante pessoa jurídica no país** via `REV-12` / `REV-18`).
  2. Direcionar **todos** os pedidos de privacidade para uma **issue pública no GitHub** expõe publicamente os dados ou o relato de quem faz a solicitação, além de não distinguir o canal formal para não usuários (`REV-20`).
- **Ajuste recomendado (diff):**
  - Identificar explicitamente o operador da instância oficial (`[Operador pessoa física no G1 / Razão social e CNPJ após REV-18]`, conforme decisão do `REV-12`).
  - Mencionar os componentes de rede mantidos ou configurados pela instância (ex.: servidor de sinalização WebRTC sem armazenamento de conteúdo; futuro TURN quando ativado em `INF-01`).
  - Separar canais: (a) formulário público / issue no GitHub para dúvidas gerais, solicitações sem dados pessoais e notificações de moderação (`REV-20`); e (b) canal privado/e-mail dedicado `[definir no REV-12 / REV-20]` para pedidos de titulares (LGPD) ou notificações que envolvam dados pessoais ou imagem íntima não consentida.

### 2.3 Seção `2. Dados tratados` (linhas 48–57)
- **Texto atual:** lista identidade local, login social opcional (Google/Meta), busca na malha (opt-in), **"Conteúdo público (Arweave): publicações assinadas por você são públicas e persistentes on-chain"**, mensagens diretas e Cache/Pacto Vox.
- **Problemas:**
  1. **Arweave desatualizado:** hoje `arweaveUpload: false` está ativo por padrão (`client/config/flags.json`, `client/js/feature-flags.js`). Publicações novas não vão para o Arweave; circulam na **rede de seguidores**.
  2. **Omissão de IP em WebRTC P2P (`LAN-19`):** não informa que conexões WebRTC diretas expõem o endereço IP do usuário aos outros aparelhos conectados (podendo revelar cidade e operadora).
  3. **Omissão de Pix / Chave Pix:** não informa que a chave Pix declarada no perfil ou em anúncios fica salva localmente / circula nos cards publicados, nem alerta sobre a exposição do nome civil via DICT.
  4. **Omissão de sinalização / TURN:** não esclarece que servidores de sinalização (`signaling.py` ou relays Nostr) e eventuais servidores TURN recebem o IP na camada de rede.
  5. **Login social no piloto G1 (`ADR-020`):** se o piloto G1 rodar com login social e cofre desligados, indicar claramente quais recursos estão ativos vs. desativados por flag.
- **Ajuste recomendado (diff):**
  - Reescrever o item de publicações para separar: **(a) Rede de seguidores (padrão atual, `arweaveUpload: false`)** vs. **(b) Arweave (leitura de registros antigos e eventuais recursos específicos futuros com aviso prévio)**.
  - Adicionar item **"Conexões P2P (WebRTC), sinalização e TURN"**: explicar exposição de IP a pares diretos; explicar a opção `"Esconder meu IP (só via servidor TURN)"` (`iceTransportPolicy: "relay"` em `#/settings/network`); alertar que, quando um servidor TURN estiver ativo (`INF-01`), o servidor TURN e o servidor de sinalização veem seu IP na camada de transporte, embora não leiam DMs cifradas.
  - Adicionar item **"Chave Pix opcional (perfil e Feira)"**: chave salva localmente e incluída apenas se você publicar em perfil/anúncio; alertar que, na liquidação bancária, o app do pagador exibe o **nome civil completo registrado no DICT** (e parte do CPF/CNPJ) mesmo para chave aleatória (EVP).
  - Adicionar item **"Confirmação de idade (18+ no piloto)"**: registro booleano local (`vox-age-18-v1`) sem coleta de data de nascimento ou documento.

### 2.4 Seção `3. Finalidades e bases legais (LGPD — visão geral)` (linhas 59–64)
- **Texto atual:** cita execução do cliente (Art. 7º, V), consentimento (Art. 7º, I) e minimização.
- **Ajuste recomendado (diff):**
  - Validar no `REV-12` a base legal adequada para: (a) operação de cache/replicação do Pacto Vox (execução de funcionalidade solicitada vs. legítimo interesse vs. consentimento/opt-out); (b) moderação de segurança e cumprimento de obrigação legal / ordem judicial (Art. 7º, II — ex.: ocultação na `hide-list` `LAN-13` e preservação mínima de evidência em casos graves `LAN-04`); (c) tratamento de pedidos de não usuários (`REV-20`).
  - Acrescentar menção expressa à **ausência de ranqueamento algorítmico / perfilamento eleitoral** (feed cronológico e modo eleitoral automático `REV-24`, Res. TSE 23.755/2026).

### 2.5 Seção `4. Compartilhamento com terceiros` (linhas 66–70)
- **Texto atual:** cita apenas Google/Meta (quando usado login social) e Gateways Arweave/relays.
- **Ajuste recomendado (diff):**
  - Incluir **Pares conectados via WebRTC** (enxergam seu IP em conexão direta e recebem mensagens/blocos públicos que você replica).
  - Incluir **Servidores STUN/TURN e Sinalização** (STUN padrão configurado em `webrtc-signaling-config.js`, `signaling.py` no Render, relays Nostr quando habilitados, e futuro Cloudflare Realtime TURN após `INF-01`) — cada operador vê metadados de conexão/IP conforme sua própria política.
  - Incluir **Autoridades competentes / canais oficiais de proteção** estritamente nos casos de conteúdo grave (`LAN-04`, ex.: abuso infantil) ou cumprimento de ordem judicial válida.

### 2.6 Seção `5. Retenção` (linhas 72–78)
- **Texto atual:** cita dados locais, cartões de malha (~30 dias), inbox relay (72 h) e *"Permaweb: conteúdo publicado pode ser permanente"*.
- **Ajuste recomendado (diff):**
  - Atualizar item da permaweb para refletir que **hoje (`arweaveUpload: false`) publicações novas ficam apenas nos caches dos dispositivos da rede de seguidores** (sujeitas a limite de espaço local, expiração por idade/grau de proximidade e retração assinada), e que a permanência no Arweave se aplica a registros históricos ou a futuros usos expressamente autorizados.
  - Acrescentar retenção de **logs técnicos transitórios** de servidores de sinalização/TURN (se aplicável, conforme resposta do `REV-12` sobre Art. 15 do Marco Civil para operador pessoa física/PJ) e **registros de moderação / `hide-list`** (`LAN-13` / `REV-20`, mantendo dados agregados sem PII no relatório anual).

### 2.7 Seção `6. Seus direitos` (linhas 80–89)
- **Texto atual:** remete a `#/perfil`, cartão na malha, pausa de rede, limpeza de cache e cita `"Conteúdo já on-chain pode não ser eliminável de forma plena"`.
- **Ajuste recomendado (diff):**
  - Esclarecer honestamente os dois limites técnicos de eliminação:
    1. **Na rede de seguidores:** você pode apagar do seu aparelho e emitir retração assinada, mas **não é tecnicamente possível forçar o apagamento em aparelhos de terceiros que já tenham copiado, exportado ou printado o conteúdo** enquanto estiverem offline ou fora do seu controle.
    2. **No Arweave (se houver registro legado ou uso futuro):** impossibilidade de exclusão técnica on-chain; mitigação ocorre exclusivamente via **ocultação na camada de exibição** da instância oficial (`hide-list`, `LAN-13`) e encaminhamento compatível com bloqueio voluntário em gateways AR.IO.
  - Informar direito de **contestar ocultação** e canal para **não usuários** pedirem remoção/ocultação na instância oficial (`REV-20`).

### 2.8 Seção `7. Crianças e adolescentes` (linhas 91–94) — **CORREÇÃO CRÍTICA**
- **Texto atual:** *"O Vox não é direcionado a menores de 13 anos. Pais ou responsáveis podem solicitar orientação via issue no repositório."*
- **Por que precisa mudar com prioridade no `LAN-03`:**
  - Hoje o aplicativo **bloqueia menores de 18 anos no onboarding** do piloto G1 (`client/js/age-gate.js`: *"Tenho 18 anos ou mais. Nesta fase de teste, o Vox é só para adultos."* — `ADR-020`). Dizer "menores de 13 anos" está em desacordo direto com o código atual e com a postura do `ADR-020`.
  - Sob o **ECA Digital (Lei 15.211/2025, Decreto 12.880/2026)**, redes cívicas abertas tendem a ser enquadradas como de **"provável acesso"** de adolescentes, exigindo **vínculo com responsável legal para menores de 16 anos** e padrões seguros por idade (`REV-23`) caso menores sejam admitidos no futuro.
- **Ajuste recomendado (diff):**
  - **Texto para G1/G2 (enquanto 18+ vigorar):** *"Na fase atual de piloto/beta fechado, o Vox é destinado exclusivamente a maiores de 18 anos (mediante confirmação autodeclarada no aparelho, sem coleta de documentos ou data de nascimento). O projeto não coleta nem trata intencionalmente dados de crianças ou adolescentes. Pais ou responsáveis que identifiquem uso indevido por menor de idade podem solicitar orientação e ocultação de conteúdo na instância oficial pelo canal [e-mail privado / formulário `REV-20`]."*
  - **Placeholder pré-G3 (`REV-23`):** caso fases públicas futuras habilitem acesso a adolescentes (13–17 anos), atualizar §7 com a arquitetura aprovada no `REV-12` (vínculo por aval criptográfico de responsável para <16 anos, DMs de desconhecidos desligadas, Pix Zap/Feira desabilitados e modo "só TURN" ativo por padrão).

---

## 3. Auditoria detalhada de `client/data-deletion.html` (orientada a diff)

Referência do arquivo atual: [client/data-deletion.html](../../client/data-deletion.html) (linhas 1–105, revisão de `25 de outubro de 2026`).

> **Atenção:** a seção `7. Meta — URL de instruções de exclusão` atende ao requisito de *User Data Deletion URL* do Facebook Login/Meta. Essa função de compliance externo deve ser preservada mesmo que o login social permaneça desligado no piloto G1.

### 3.1 Nota inicial e Seções 1–2 (linhas 36–60)
- **Texto atual:** explica que não há banco central de usuários; detalha remoção de nome/foto importados (Google/Meta) em `#/perfil` e desligamento do cartão `"Aparecer na busca da malha"`.
- **Ajuste recomendado (diff):**
  - Conferir se os rótulos da UI citados continuam exatos antes de publicar (`#/perfil` → *Remover nome/foto importados*; `#/perfil` ou `#/settings/network` → *Aparecer na busca da malha*).
  - Na Seção 2 (cartão na malha), acrescentar que o envio da atualização `discoverable: false` depende de haver pares conectados; aparelhos que estiverem offline continuam mantendo o cartão em cache até reconectarem ou expirar o TTL (~30 dias).

### 3.2 Seção `3. Apagar tudo neste aparelho` (linhas 62–71)
- **Texto atual:** orienta `#/settings/network → Limpar cache local` ou limpar dados do site no navegador para `yurikayel.github.io`, e diz que remove identidade local, DMs, moderação, rascunhos e cache P2P neste dispositivo.
- **Problemas:**
  1. Se a instância estiver em espelho alternativo ou futuro domínio próprio (`LAN-06`), citar apenas `yurikayel.github.io` ficará incompleto (usar "o domínio da instância que você acessa, como `yurikayel.github.io`").
  2. Não explicita o destino de **cópias já replicadas na rede de seguidores**, **chave Pix informada**, **backups exportados** e **eventuais metadados transitórios de IP** em peers/relays.
- **Ajuste recomendado (diff):**
  - Acrescentar aviso claro de escopo: apagar os dados do navegador remove também sua **chave Pix salva localmente** e sua confirmação de idade (`vox-age-18-v1`), **mas não apaga**:
    - publicações que seus seguidores já replicaram nos dispositivos deles (até expiração natural, limpeza do cache deles ou retração enviada antes de apagar sua chave);
    - capturas de tela, arquivos baixados ou backups exportados manualmente por você ou terceiros;
    - nomes civis e dados bancários já exibidos em comprovantes Pix no banco de quem fez ou recebeu transferências.

### 3.3 Seção `4. Conteúdo publicado no Arweave (permaweb)` (linhas 73–77)
- **Texto atual:** dá a entender que publicações vão para o Arweave por padrão e cita "retratação/gossip quando disponível" + pedido a espelhos.
- **Ajuste recomendado (diff):**
  - Corrigir para o comportamento vigente (`arweaveUpload: false`):
    1. **Publicações na rede de seguidores (padrão atual):** não são gravadas no Arweave. Quando você apaga/retrai um post antes de destruir sua chave, os pares conectados recebem o sinal de retração; ainda assim, cópias em aparelhos offline ou modificados podem persistir localmente.
    2. **Conteúdo no Arweave (registros legados ou recursos específicos futuros):** transações já gravadas on-chain são tecnicamente permanentes e não podem ser apagadas pelo projeto Vox; a mitigação disponível é solicitar a ocultação na lista oficial do PWA (`hide-list`, `LAN-13`) e junto a operadores de espelhos e gateways AR.IO.

### 3.4 Seção `5. Mensagens cifradas no relay (inbox)` e conexões P2P (linhas 79–83)
- **Texto atual:** cobre apenas envelopes cifrados no relay HTTP (TTL 72 h ou coleta).
- **Ajuste recomendado (diff):**
  - Acrescentar nota sobre **sinalização e conexões WebRTC (`LAN-19`)**: conexões P2P diretas ou via sinalização/TURN não criam "histórico de conta" no projeto, mas endereços IP transitórios ficam visíveis aos pares ou sujeitos aos logs de infraestrutura do operador de rede/TURN/Nostr pelo prazo técnico de cada provedor.

### 3.5 Seção `6. Pedido formal (LGPD / titular de dados)` (linhas 85–91)
- **Texto atual:** pede para abrir issue pública no GitHub informando `vx_*` e o que deseja apagar.
- **Problema:** uma **issue pública no GitHub** é indexada e visível por qualquer pessoa na internet! Se um titular (ou não usuário, `REV-20`) enviar nome civil, CPF, relato de abuso íntimo ou link que o identifique numa issue pública, o pedido de exclusão agrava a exposição dos dados.
- **Ajuste recomendado (diff):**
  - Manter o formulário de issue apenas para solicitações **sem dados pessoais sensíveis** (ou pedido genérico de remoção de TX pública da `hide-list` sem identificar pessoa física), e oferecer **canal reservado / e-mail privado** (`[definir no REV-12 / REV-20]`) para pedidos de LGPD ou denúncias graves que contenham dados pessoais.

---

## 4. Checklist objetivo antes de editar `client/privacy.html` e `client/data-deletion.html` (`LAN-03`)

1. [ ] Parecer humano **`REV-12`** entregue respondendo às perguntas de enquadramento (provedor, representante PJ/item 11, Feira/CDC item 7, prazos de remoção `LAN-04`, base legal do Pacto Vox).
2. [ ] Canais de contato definidos: formulário público para não usuários (`REV-20`) **e** canal reservado/e-mail para pedidos com dados pessoais / conteúdo grave (`LAN-04`).
3. [ ] Decisão sobre escopo de Pix/Feira/Login social no G1/G2 confirmada pelo mantenedor (para não prometer nem omitir recursos ativos/desligados).
4. [ ] Aplicar os diffs aprovados em `client/privacy.html`, `client/data-deletion.html` e publicar `client/terms.html` (`LAN-02`) em conjunto com o **bump canônico de `CACHE_NAME` em `client/sw.js`** (espelhado em `docs/release-metadata.json`).
5. [ ] Atualizar `docs/legal/COMPLIANCE-BR.md` e remover banners de rascunho quando os textos forem aprovados para `main` ([GOVERNANCE.md](../../GOVERNANCE.md#governança-da-instância-pwa-oficial-lan-31)).
