# Modelo de ameaças — Vox

> **Status:** rascunho para revisão (LAN-15) · **Owner:** revisor · **Revisado:** 2026-11-08
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
| **Atacante de cadeia de suprimentos** | comprometer CDN (esm.sh), dependência ou conta de deploy | injetar JS que rouba chaves de todos |
| **Estado / ator com ordem judicial** | ordem a provedores, pressão sobre mantenedores | identificar autores, remover conteúdo |

## 3. Ameaças × mitigações (o que existe hoje)

| # | Ameaça | Mitigação existente | Lacuna / item |
|---|---|---|---|
| T1 | XSS rouba a chave do `localStorage` | `escapeHtml` nos templates; **CSP sem script inline** e sem `unsafe-eval` (LAN-16); iframes de cartucho sem `allow-same-origin` | CSP ainda permite `https://esm.sh` e SDKs Google/Meta; chave não fica em armazenamento não-extraível (WebCrypto `extractable:false`) → **revisão LAN-18** |
| T2 | CDN/dependência comprometida | sem build, poucas dependências | `esm.sh/arweave` carregado em tempo de execução **sem SRI** → LAN-20 (vendorizar ou fixar hash) |
| T3 | Conta de deploy (GitHub/Cloudflare) comprometida | — | **bus factor 1** e sem 2FA documentado → LAN-30 |
| T4 | Leitura de DM por relay | DM cifrada ponta a ponta (ECDH P-256 + AES-GCM); relay cego com TTL | sem forward secrecy; metadados (quem fala com quem, quando) visíveis ao relay → registrar como risco aceito ou planejar |
| T5 | IP exposto a pares e relays | sinalização Nostr leva **só peerId aleatório em claro**; SDP/ICE e endereço vão cifrados (REV-09) | opção **"Esconder meu IP"** (só TURN, LAN-19) já existe, mas sem TURN configurado não conecta → REV-10; padrão ligado para menores → REV-23 |
| T6 | Fazenda de contas vota | assinatura por chave; selo por aval planejado (F8) | sem anti-Sybil no ar → enquete cívica pública com peso só depois da F8 |
| T7 | Assédio / conteúdo ilegal | quarentena local, bloquear/silenciar, moderação de comunidade, **denúncia no app (LAN-12)** | sem plantão nem lista de ocultação global (LAN-04, LAN-13) |
| T8 | Perfil falso | handles com aviso de conflito; **perfis de demonstração só em modo explícito (LAN-10)** | verificação opcional (ADR-018) fora do lançamento |
| T9 | Pix para chave errada ou que expõe o nome | BR Code offline; **avisos de nome civil e "confira no banco" (REV-13)** | — |
| T10 | Spam e inundação da malha | limites de banda do nó leve (50 MB/dia), TTL, **20 posts por chave a cada 10 min no gossip (LAN-14)** | chave nova é grátis: falta PoW leve e quarentena de chave nova (LAN-14) |
| T11 | Indisponibilidade da sinalização ou da leitura | Render + **Nostr em paralelo (REV-09)** + kill-switch (LAN-08); leitura em 4 gateways com tempo limite (LAN-27) | teste de carga (LAN-09); 2º nó sem sleep (REV-01) |
| T12 | Perda de chave = perda de identidade | backup por QR/cofre, Senha Soberana | iOS apaga storage (REV-14); fluxo não testado com leigos (LAN-25) |
| T13 | Dado pessoal gravado para sempre no Arweave | **aviso de permanência + opção "só na malha" (LAN-11)** | eliminação impossível na cadeia → lista de ocultação (LAN-13) e parecer (REV-12) |
| T14 | Ordem judicial para identificar autor | não há cadastro central nem logs do projeto | stewards de relay podem ter logs de IP → política de logs (parecer REV-12) |

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
