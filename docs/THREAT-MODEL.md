# Modelo de ameaças — Vox

> **Status:** rascunho para revisão (LAN-15) · **Owner:** revisor · **Revisado:** 2026-11-10 (T20–T23 da [revisão DevSecOps](./audits/revisao-devsecops-2026-11-10.md))
> **Falta para fechar o LAN-15:** revisão por uma pessoa de segurança de fora do time (registrar nome/data aqui).
> Relacionados: [SECURITY.md](../SECURITY.md) · [COMPLIANCE-BR](legal/COMPLIANCE-BR.md) · [backlog §4-E](./strategy/backlog-lancamento-publico-2026-11.md#e-segurança-e-privacidade) · [ADR-014 cofre](./adr/014-zero-knowledge-vault-recuperacao-soberana.md)

## 1. O que protegemos (ativos)

| Ativo | Onde vive | Se vazar ou for adulterado |
|---|---|---|
| **Chave de identidade** (`vx_*`, P-256) e carteira Arweave (JWK) | `localStorage`/IndexedDB do aparelho; cofre cifrado opcional | Alguém publica, vota e assina em nome da pessoa, para sempre |
| **Conteúdo das DMs** | aparelho; relay de inbox só guarda o envelope cifrado (TTL 72 h) | Exposição de conversa íntima |
| **Grafo social** (quem segue, conversa, entra em quais comunidades) | aparelho; parte é pública na permaweb (membership) | Perseguição, mapeamento de militância |
| **Endereço IP** | visível a pares WebRTC, relays de sinalização, gateways e TURN | Localização aproximada, ligação pseudônimo ↔ pessoa |
| **Nome civil via Pix** | banco do pagador (DICT) | Quebra do pseudônimo de quem recebe (REV-13) |
| **Integridade de votos e propostas** | assinaturas + Arweave | Fraude em decisão coletiva |
| **Disponibilidade da rede** | sinalização (Render + Nostr), gateways, malha | Rede fora do ar no momento crítico |

## 2. Quem ataca (adversários)

| Adversário | Capacidade | Objetivo provável |
|---|---|---|
| **Stalker / ex-parceiro** | conhece a pessoa, pode ter acesso físico ao aparelho | localizar, ler DMs, se passar pela pessoa |
| **Fazenda de contas / bots** | muitas chaves, muitos IPs, automação | inflar votos, enquetes e assédio coordenado |
| **Troll / assediador** | uma pessoa, várias contas | assédio, doxxing, conteúdo ilegal para derrubar a comunidade |
| **Golpista** | engenharia social | phishing de chave/cofre, Pix para chave falsa |
| **Operador malicioso de relay, gateway ou TURN** | vê metadados e IPs que passam por ele | perfilamento, censura seletiva, mentir sobre conteúdo |
| **Atacante de cadeia de suprimentos** | comprometer CDN, dependência ou conta de deploy | injetar JS que rouba chaves de todos |
| **Estado / ator com ordem judicial** | ordem a provedores, pressão sobre mantenedores | identificar autores, remover conteúdo |

## 3. Ameaças × mitigações (o que existe hoje)

| # | Ameaça | Mitigação existente | Lacuna / item |
|---|---|---|---|
| T1 | XSS rouba a chave do `localStorage` | `escapeHtml` nos templates; **CSP sem script inline** e sem `unsafe-eval` (LAN-16); iframes de cartucho sem `allow-same-origin` | CSP ainda permite os SDKs Google/Meta; chave não fica em armazenamento não-extraível (WebCrypto `extractable:false`) → **revisão LAN-18** |
| T2 | CDN/dependência comprometida | sem build, poucas dependências; inventário em [DEPENDENCIAS.md](./DEPENDENCIAS.md) com teste que quebra o CI e rotina mensal que confere hash de CDN (LAN-20) | O `arweave` é vendorizado em `client/vendor/` com hash conferido em teste (PM-11); nenhum código de CDN roda no caminho de upload. SDKs do Google e da Meta não têm versão fixa (só carregam com login configurado e no toque) |
| T3 | Conta de deploy (GitHub/Cloudflare) comprometida | — | **bus factor 1** e sem 2FA documentado → LAN-30 |
| T4 | Leitura de DM por relay | DM cifrada ponta a ponta (ECDH P-256 + AES-GCM); relay cego com TTL | sem forward secrecy; metadados (quem fala com quem, quando) visíveis ao relay → registrar como risco aceito ou planejar |
| T5 | IP exposto a pares e relays | sinalização Nostr leva **só peerId aleatório em claro**; SDP/ICE e endereço vão cifrados (REV-09) | opção **"Esconder meu IP"** (só TURN, LAN-19) já existe, mas sem TURN configurado não conecta → REV-10; padrão ligado para menores → REV-23 |
| T6 | Fazenda de contas vota | assinatura por chave; selo por aval planejado (F8) | sem anti-Sybil no ar → enquete cívica pública com peso só depois da F8 |
| T7 | Assédio / conteúdo ilegal | quarentena local, bloquear/silenciar, moderação de comunidade, **denúncia no app (LAN-12)** | sem plantão nem lista de ocultação global (LAN-04, LAN-13) |
| T8 | Perfil falso | handles com aviso de conflito; **perfis de demonstração só em modo explícito (LAN-10)** | verificação opcional (ADR-018) fora do lançamento |
| T9 | Pix para chave errada ou que expõe o nome | BR Code offline; **avisos de nome civil e "confira no banco" (REV-13)** | — |
| T10 | Spam e inundação da malha | limites de banda do nó leve (200 MB/dia, o dobro do disco), TTL, **20 posts por chave a cada 10 min no gossip**; comunidade pode pedir **quarentena de chave nova** (menos de 24 h neste aparelho), com saída por **PoW leve de 14 bits** (LAN-14) | a idade da chave é medida em cada aparelho, sem relógio confiável; aparelho recém-instalado passa 24 h aprendendo e trata como conhecido quem viu nesse período; a quarentena só se escolhe na criação da comunidade; PoW de 14 bits encarece, mas não impede, uma fazenda de contas |
| T11 | Indisponibilidade da sinalização ou da leitura | Render + **Nostr em paralelo (REV-09)** + kill-switch (LAN-08); leitura em 4 gateways com tempo limite (LAN-27), 3 como testemunhas GraphQL (PM-50); relays Nostr que caem reconectam e trocam de relay (PM-17) | teste de carga (LAN-09); 2º nó sem sleep (REV-01) |
| T12 | Perda de chave = perda de identidade | backup por QR/cofre, Senha Soberana | iOS apaga storage (REV-14); fluxo não testado com leigos (LAN-25) |
| T13 | Dado pessoal gravado para sempre no Arweave | **aviso de permanência + opção "só na malha" (LAN-11)** | eliminação impossível na cadeia → lista de ocultação (LAN-13) e parecer (REV-12) |
| T14 | Ordem judicial para identificar autor | não há cadastro central nem logs do projeto | stewards de relay podem ter logs de IP → política de logs (parecer REV-12) |
| T15 | Outra chave troca foto, título ou dono de uma comunidade | `community_update` só vale do dono ou de moderador listado e só muda foto, título, descrição, categoria e modo de publicação (canal, PM-81); o gossip não grava nem repassa update de outra chave; o dono vem só do post `c_<communityId>` (PM-09) | o post `c_<communityId>` é o primeiro que o aparelho vê: quem publicar antes, num aparelho que ainda não conhece a comunidade pela malha (inclusive uma que ele só conhece pelo Arweave), fica dono ali. Comunidade só no Arweave (dono = carteira) não aceita update pela malha até existir vínculo carteira↔chave |
| T16 | Memória central maliciosa ou invadida injeta itens | o relay só guarda o que os aparelhos mandam; desde o PM-86 (`central-memory-hydrate.js`), o aparelho só grava post ou remoção com assinatura válida do autor, de autor não bloqueado, com a regra do PM-09 para `community_update`, sem trocar post de outro autor; blob só entra se o conteúdo bate com o hash | o servidor ainda pode **reter** itens (não entregar) ou reenviar itens antigos e válidos; cartões de perfil do diretório vêm sem assinatura (`hydrateProfiles`), então nome e foto exibidos podem ser trocados por quem controla o servidor |
| T17 | Quem repassa um post altera campos aninhados | assinatura ECDSA do post inteiro; **PM-85 (SW v7.66, `sig-format.js`):** forma `sigv: 2` cobre todas as chaves em qualquer profundidade, e o `sigv` vai dentro do que é assinado (tirá-lo não vira v1 válido); versão desconhecida não verifica; o hash da mídia segue em `mediaHash`, no primeiro nível (PM-87) | **mitigado (PM-85):** convivência até 24/11/2026: o aparelho confere v1 e v2 já, mas só assina v2 a partir dessa data, para quem ainda não atualizou não descartar os posts novos. Post v1 continua com os campos aninhados fora da assinatura; por isso marca de foto em post alheio sem `sigv: 2` aparece como "não verificada" |
| T18 | Inundação por eco na malha | limite de 20 posts por chave a cada 10 min no gossip; desde o PM-84, cartão de perfil só é repassado se for versão nova (`editedAt` + `sig`, guardada na sessão e no diretório) | cartões **novos e válidos** de muitas chaves ainda passam sem limite por chave (o limite de 20/10 min vale só para posts); a marca da sessão guarda até 2.000 cartões |
| T19 | Padrinho abusa do afilhado, ou o grafo de convites expõe militantes | vínculo exige a assinatura das duas pessoas (PM-82); arquivamento é reversível pela moderação | quem convidou quem fica visível na malha e na memória central; o PM-83 (moderador natural) ainda não existe; ver a crítica em [moderador-natural-v0](./specs/moderador-natural-v0.md) |
| T20 | Terceiro toma a conta pela recuperação ou pela sincronização | **cofre v2 (PM-90, SW v7.62, [ADR-025](./adr/025-cofre-v2-so-a-senha-abre.md)):** só a Senha Soberana abre (PBKDF2 600 mil, sal aleatório); login social não é chave; cofres v1 revogados na abertura e recusados por servidores atualizados. PM-91 (servidor só por escolha) e PM-92 (link sem senha, mínimo de 12) no SW v7.61. O export `.voxid` usa sal aleatório | quem opera o servidor pode tentar adivinhar senha fraca (600 mil iterações por tentativa); cofre v1 de quem nunca mais abrir o app fica no servidor antigo, sem ser servido por servidor atualizado. Cofre remoto e login social seguem fora do G1 (PM-76) até o primeiro teste com o v2 |
| T21 | Chave privada lida do aparelho (XSS, extensão, aparelho destravado) | CSP sem script inline (T1); **PM-93 ([ADR-026](./adr/026-chaves-em-repouso-trava-depois-do-backup.md)):** desde o SW v7.63, chaves de identidade, DM e carteira cifradas por uma chave do aparelho não exportável; desde o SW v7.64, depois do backup com a Senha Soberana, identidade e DM viram chaves não exportáveis e a única cópia exportável é a cifrada pela senha | **mitigado (PM-93):** antes do primeiro backup a chave ainda abre pela chave do aparelho; a carteira fica só cifrada pelo aparelho; código na página ainda usa (não lê) as chaves enquanto ela está aberta |
| T22 | Relay ou nó local exposto recebe escrita e remoção de qualquer origem | relay cego com TTL; nó local escuta só em loopback por padrão; **PM-94 (SW v7.65, [ADR-027](./adr/027-autorizacao-no-relay-dono-e-origem.md)):** cofre só regrava com a prova do dono (derivada da Senha Soberana; o servidor guarda só o hash); envelope de DM só sai com a chave de apagar que vai cifrada para o destinatário; `Host` de loopback (ou túnel liberado), escrita só das origens do app, `POST` só `application/json`, limite de escritas por IP no relay Python; o mesmo no nó Windows, menos o limite | **mitigado (PM-94):** cofre gravado antes do v7.65 fica sem dono até a próxima gravação com a senha; envelope de cliente antigo segue apagável até expirar; memória central e relay cego seguem sem dono (conteúdo conferido por assinatura no aparelho) |
| T23 | Regressão de segurança entra pelo pipeline | ruleset no `main` com 5 checks e branch atualizada antes do merge (`strict`), secret scanning com push protection, proveniência dos binários; **PM-95:** CodeQL em todo PR e toda semana (actions, JS, Python, C#), Dependabot para npm, Docker e actions, toda action fixada por SHA de commit (o teste de inventário quebra com tag), token do CI só com leitura, auditoria de segredos que pega JWK privada (`scripts/secrets-audit.mjs`), CODEOWNERS | **mitigado (PM-95):** nenhuma aprovação humana exigida (só há um mantenedor; CODEOWNERS vira obrigatório quando houver segunda pessoa revisora); CodeQL roda mas não é check obrigatório; Dependabot não abre PR de correção de segurança sozinho (só alerta) |

## 4. Riscos aceitos (por enquanto)

- **Conteúdo público é público e permanente** quando a pessoa escolhe gravar no Arweave (avisado em LAN-11).
- **Metadados de DM** ficam visíveis ao relay de inbox (sem mix-net).
- **Pares WebRTC veem o IP** por padrão. "Esconder meu IP" é opcional e só funciona quando houver TURN (REV-10).
- **Sem anti-Sybil** no lançamento fechado (G1): o piloto é de gente que se conhece.

## 5. Como revisar este documento

1. Uma pessoa de segurança de fora do time lê, marca o que discorda e assina abaixo.
2. Cada lacuna nova vira linha no [ROADMAP](./ROADMAP.md).
3. Revisar a cada portão (G1, G2, G3) e depois de qualquer incidente.

| Revisor(a) | Data | Observações |
|---|---|---|
| | | |
