# Página de Apresentação & Kit de Imprensa — Vox (LAN-35)

> **Status:** rascunho (LAN-35 — blueprint e texto canônico para o portão G3, auditado contra DOC-04) · **Owner:** mantenedor / comunicação · **Revisado:** 2026-11-22  
> **Referências canônicas:** [POSITIONING.md](./POSITIONING.md) · [garantia-da-praca-pm104.md](./garantia-da-praca-pm104.md) · [FEATURES.md](../FEATURES.md) · [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) · [honest-copy-audit-2026-10-23.md](../audits/honest-copy-audit-2026-10-23.md)

Este documento reúne o texto canônico de apresentação pública e o kit de imprensa do **Vox** para o portão **G3**, auditado contra as regras de honestidade **DOC-04** (sem promessas de nuvem mágica, anonimato total ou gratuidade eterna).

---

## 1. Elevator pitch

### Em 1 frase

> **O Vox é um aplicativo web cívico *local-first* e de código aberto onde você guarda sua própria identidade no aparelho, conversa em comunidades temáticas sem algoritmo de engajamento e replica publicações diretamente entre seguidores — sem dono único de plataforma.**

### Em 1 parágrafo

Construído como Progressive Web App (PWA) estático — sem servidores centrais de login, sem anúncios pagos e sem leilão de alcance —, o Vox gera a chave criptográfica no dispositivo de quem usa e organiza a praça digital em comunidades cronológicas, enquetes, propostas votáveis e feiras locais com Pix direto (taxa zero e sem intermediação). Em vez de prometer "nuvem infinita" ou "anonimato total", o projeto adota transparência radical: o conteúdo circula hoje pela rede de seguidores e nós comunitários opcionais, com limites técnicos e de privacidade explícitos e código auditável sob licença livre **GNU AGPLv3**.

---

## 2. O que o Vox É e o que o Vox NÃO É

| O que o Vox **É** | O que o Vox **NÃO É** |
|---|---|
| **Aplicativo *local-first* sem custódia de conta:** a chave de identidade (ECDSA P-256) nasce no navegador ou aplicativo da pessoa, com saída por cofre v2, frase de 12 palavras, `.voxid` e cofre na malha ([IDENTITY.md](../IDENTITY.md)). | **Não é servidor central nem "nuvem mágica":** sem senha ou backup salvos pela pessoa, ninguém consegue recuperar uma conta perdida. |
| **Rede comunitária cronológica:** feeds Social e Cívico por ordem de tempo, com comunidades estilo fórum, modo Canal (`PM-81`), votações com corte anti-brigading e modo eleitoral automático (`REV-24`). | **Não tem algoritmo de engajamento nem alcance pago:** não vende impulsionamento, não cria bolhas algorítmicas opacas e não usa anúncios direcionados. |
| **Comunicação direta e economia solidária sem taxas:** DMs cifradas ponta a ponta (ECDH P-256 + AES-GCM-256) e Pix Zaps gerados 100% offline no navegador via BR Code EMV. | **Não é banco nem gateway de pagamento:** não custodia dinheiro, não faz *escrow* e não cobra comissão sobre Feira ou Pix Zaps. |
| **Malha P2P + protocolo aberto GNU AGPLv3:** circulação entre seguidores via WebRTC, leitura de reserva em gateways e relays comunitários opcionais em Python (`Vox Populi` e `Vox Memoria`, [ADR-011](../adr/011-taxonomia-tripartite-produtos-vox.md)). | **Não é "anonimato total" nem "impossível censurar":** pares WebRTC veem IPs sem servidor TURN ativo (`LAN-19`), e a instância PWA oficial prevê lista assinada de ocultação (`LAN-13`) para conteúdo grave ou ordem judicial. |
| **Código aberto transparente sobre seu estágio:** funcionalidades publicadas com status real em [FEATURES.md](../FEATURES.md), distribuição POSSE para outras redes e exportação offline (`own-posts` e HTML standalone `EXP-04`). | **Não grava em blockchain hoje e ainda não está aberto ao público:** `arweaveUpload` vem desligado (`false`) por padrão, e o projeto segue em preparação pré-piloto (Prontidão Fria). |

---

## 3. Ficha técnica verificável

| Item | Estado verificável no repositório | Fonte |
|---|---|---|
| **Cliente principal (`Vox`)** | PWA estática em JavaScript vanilla (ES Modules, sem etapa de build), com cache offline em IndexedDB e Service Worker; empacotamentos opcionais desktop/mobile compilados no GitHub Actions com `SHA256SUMS` e atestação de proveniência. | [README.md](../../README.md) · [FEATURES.md](../FEATURES.md) |
| **Back-end opcional (`relay/` e nós)** | Sinalização WebRTC pública (hoje 1 nó no Render Free + sinalização efêmera paralela via relays Nostr); `relay/` em Python (biblioteca padrão) para `Vox Populi` (apoio leve) e `Vox Memoria` (memória perene / Kit steward em VPS). | [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) · [ADR-011](../adr/011-taxonomia-tripartite-produtos-vox.md) |
| **Proposta Rust (`vox-core`)** | **Apenas documentada** (sem código Rust implementado no repositório hoje): arquitetura incremental proposta para primitivas criptográficas futuras mantendo chaves WebCrypto no navegador. | [ADR-039](../adr/039-rust-por-fases.md) |
| **Identidade e criptografia** | Chaves ECDSA P-256 locais (`sigv: 2` padrão a partir de 24/11/2026); DMs E2E via ECDH P-256 + AES-GCM-256 (inbox transitória com TTL de 72 h em relay); backup portátil `own-posts` (`.json`) e HTML offline (`EXP-04`). | [IDENTITY.md](../IDENTITY.md) · [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md) |
| **Licença** | GNU Affero General Public License v3.0 (`AGPL-3.0`). | [LICENSE](../../LICENSE) |
| **Custo operacional atual** | **R$ 0,00/mês hoje**, operando exclusivamente em free tiers com cotas rígidas e sem cartão cadastrado (GitHub Pages, Cloudflare Pages, Render Free 750 h/mês, relays Nostr públicos). **Sem garantia de "grátis para sempre":** projeção orçamentária de 12 meses para 1k e 10k usuários em [INFRA-CUSTOS.md §6](../INFRA-CUSTOS.md#6-projeção-orçamentária-de-12-meses--1000-e-10000-usuários-ativos-lan-32). | [INFRA-CUSTOS.md](../INFRA-CUSTOS.md) |
| **Maturidade (Prontidão Fria)** | Pré-piloto (`F0`). Piloto fechado (`G1`), beta por convite (`G2`) e lançamento público (`G3`) dependem de parecer jurídico (`REV-12`), plantão de conteúdo grave (`LAN-04`), `bus factor ≥ 2` (`LAN-30`) e revisão cripto (`LAN-18`). | [ROADMAP.md](../ROADMAP.md) · [criterios-go-beta-lan28.md](../strategy/criterios-go-beta-lan28.md) |

---

## 4. FAQ honesto (10 perguntas frequentes)

1. **Como funciona a privacidade no Vox? O aplicativo garante anonimato total?**  
   **Não.** Chaves e histórico nascem no aparelho e mensagens diretas (DMs) têm criptografia ponta a ponta (ECDH P-256 + AES-GCM-256). Porém, conexões diretas entre navegadores via WebRTC expõem seu endereço IP aos pares com quem você troca dados hoje: a opção "Esconder meu IP" (`LAN-19`) existe nas configurações, mas depende da publicação de um servidor TURN (`REV-10`, ainda pendente). Leituras eventuais em gateways públicos também ficam sujeitas às políticas de log desses terceiros.

2. **Se não existe um dono único, como o Vox lida com conteúdo ilegal ou grave?**  
   O projeto não adota "vale-tudo". Usuários podem denunciar publicações dentro do app por DM cifrada assinada ao moderador da comunidade (com arquivamento automático por até 48 h para revisão no `PM-69`). Moderadores emitem ações públicas (`mod-action`). Já na **instância PWA oficial**, a governança prevê plantão humano de moderação em rodízio (`LAN-04`, meta ≤ 2 h para abuso infantil, terrorismo ou imagem íntima não consentida) e lista global assinada de ocultação (`LAN-13`, planejada para o portão G2), sempre na camada de exibição oficial e com canal público de recurso em [GOVERNANCE.md](../../GOVERNANCE.md).

3. **O Vox usa blockchain ou salva tudo no Arweave?**  
   **Hoje, não.** Por diretriz vigente desde 13/11/2026, o upload permanente está **desligado por padrão** (`arweaveUpload: false`). Nada publicado no fluxo normal vai para blockchain. Toda circulação e preservação ocorrem pela **rede de seguidores** (malha WebRTC + cache local + nós opcionais `Vox Populi` / `Vox Memoria`). O Arweave permanece apenas para leitura pública de registros existentes e reservado para eventuais usos consensuais futuros.

4. **Como funcionam os Pix Zaps? O aplicativo cobra taxa ou guarda dinheiro?**  
   O Pix Zap gera o código **BR Code EMV (Pix Copia e Cola)** localmente no navegador em milissegundos, sem passar por servidor intermediário. O Vox não é instituição de pagamento, não retém comissão e não intermedia valores. **Aviso transparente (`REV-13`):** como em qualquer transferência Pix no Brasil, a consulta ao DICT exibe o nome civil ou razão social vinculado à chave do destinatário para quem faz o apoio.

5. **Em período eleitoral, existe algoritmo recomendando candidatos ou partidos?**  
   **Não.** O feed do Vox é cronológico e não vende alcance. Além disso, o **modo eleitoral (`REV-24`)**, implementado em [`client/js/electoral-period.js`](../../client/js/electoral-period.js), desliga automaticamente as "Sugestões cívicas" entre **16 de agosto e 31 de outubro de anos pares** (ou quando ativado manualmente via `flags.json`), em conformidade com o desenho voltado à Res. TSE 23.755/2026.

6. **Como qualquer comunidade, movimento ou coletivo pode rodar seu próprio nó ou espelho?**  
   Como o cliente é estático (sem build) e o código está sob licença **GNU AGPLv3**, qualquer coletivo pode hospedar a pasta `client/` em seu próprio servidor ou serviço de páginas estáticas, ajustar `client/config/` e subir um relay `Vox Memoria` em Python com o guia de [`relay/deploy/README.md`](../../relay/deploy/README.md) e [steward-relay-kit.md](../operations/steward-relay-kit.md). Nenhum espelho fica preso à instância oficial.

7. **O que acontece se eu perder meu celular ou limpar os dados do navegador?**  
   Se você não tiver preparado uma saída antes, a perda da conta é **definitiva**, porque não existe servidor central com botão "redefinir senha". Por isso o onboarding orienta desde o início a salvar a **frase de recuperação** (12 palavras), o **cofre v2** (`.voxid` ou kit por e-mail), o **cofre na malha** entre laços mútuos (`ADR-037`), backups dos próprios posts (`own-posts` e HTML offline `EXP-04`) ou **guardiões Shamir** (em implementação parcial).

8. **O Vox vai ser "grátis para sempre"? Como a rede se paga quando crescer?**  
   Não prometemos "grátis para sempre". Hoje o projeto custa **R$ 0,00/mês** porque roda dentro de free tiers com cotas limitadas e evita infraestrutura paga antes de ultrapassar o gatilho de 50 usuários ativos. Para escalar para 1.000 ou 10.000 ativos com TURN, sinalização dedicada e estrutura jurídica, [INFRA-CUSTOS.md §6](../INFRA-CUSTOS.md#6-projeção-orçamentária-de-12-meses--1000-e-10000-usuários-ativos-lan-32) prevê financiamento transparente e opt-in (editais, patrocínio público e associação sem fins lucrativos), sem anúncios nem venda de dados.

9. **Preciso de conta no Google, Meta, X ou Bluesky para entrar?**  
   **Não.** O cadastro não exige conta em nenhuma plataforma corporativa nem número de telefone. A leitura de feeds públicos do Bluesky funciona direto no app e existe fluxo assistido para republicar fora (`EXPLODE!` / POSSE). Já integrações OAuth de X, TikTok, Threads, Instagram e GitHub para importar perfil ou publicar dependem de um relay com `/oauth/exchange`, que hoje não possui instância pública operada pelo projeto.

10. **O Vox já está aberto para o público geral hoje?**  
    **Ainda não.** O projeto segue a disciplina de Prontidão Fria: o piloto humano fechado (`G1`) ainda não começou e o lançamento público (`G3`) aguarda parecer jurídico (`REV-12`), plantão de conteúdo grave (`LAN-04`), `bus factor ≥ 2` (`LAN-30`), revisão externa de criptografia (`LAN-18`) e cobertura orçamentária mínima de 12 meses (`LAN-32`).

---

## 5. Checklist de conformidade DOC-04 (copy pública)

Antes de publicar a página de apresentação no cliente ou em material externo para o `G3`, o texto final deve passar por esta conferência (baseada em [honest-copy-audit-2026-10-23.md](../audits/honest-copy-audit-2026-10-23.md)):

| Alegação vedada | Formulação honesta obrigatória |
|---|---|
| Operação exclusivamente P2P sem infraestrutura auxiliar no celular/4G | Malha P2P entre seguidores com sinalização WebRTC/Nostr e leitura de reserva em gateways |
| Gratuidade eterna garantida | Custo zero para quem usa hoje (infraestrutura atual em free tiers com cota; projeções pagas em `INFRA-CUSTOS.md`) |
| Imunidade regulatória ou impossibilidade de ocultação | Sem ponto único de apagamento no protocolo; instância oficial pode ocultar na própria camada via `hide-list` assinada |
| Anonimato total na rede | DMs cifradas ponta a ponta; conexões WebRTC diretas expõem IP aos pares sem servidor TURN |
| Gravação automática ou permanente no Arweave hoje | Preservação pela rede de seguidores e nós opcionais; `arweaveUpload: false` por padrão hoje |
| Ordenação absoluta ou pontuação competitiva entre nós | Feed cronológico sem leilão de alcance e sem escore público de reputação de nós |

---

## 6. Assets visuais recomendados

### Arquivos de marca e apresentação já existentes no repositório

- Ícone vetorial principal: [`client/icons/icon.svg`](../../client/icons/icon.svg)
- Ícone raster oficial (512×512): [`client/icons/icon-512.png`](../../client/icons/icon-512.png)
- Marca compacta: [`client/icons/logo-mark.png`](../../client/icons/logo-mark.png)
- Avatar institucional de perfil: [`client/icons/profile-vox-official-512.png`](../../client/icons/profile-vox-official-512.png)
- Apresentação HTML estática existente: [`docs/product/proposta-vox.html`](./proposta-vox.html)

### Capturas de tela a gerar antes de G3 (placeholders explícitos)

- `[captura antes de G3: tela inicial com feed Social/Cívico cronológico e modo demonstração desligado]`
- `[captura antes de G3: fluxo local-first de criação de conta e confirmação da frase de 12 palavras]`
- `[captura antes de G3: comunidade temática com modo Canal e votação de proposta]`
- `[captura antes de G3: modal de Pix Zap offline exibindo o aviso de nome civil no DICT]`

---

## 7. Contatos institucionais e canais oficiais

- **Código-fonte, auditoria e documentação técnica:** repositório público no GitHub (referência canônica em [README.md](../../README.md)).
- **Divulgação de vulnerabilidades:** [SECURITY.md](../../SECURITY.md).
- **Privacidade e remoção local de dados:** [`client/privacy.html`](../../client/privacy.html) e [`client/data-deletion.html`](../../client/data-deletion.html).
- **Assessoria de imprensa / contato institucional:** `[definir antes de G3]`
- **Canal oficial para notificações jurídicas, autoridades e não usuários (`REV-20` / `REV-18`):** `[definir antes de G3]`
- **Entidade jurídica / representação no Brasil (`REV-18` / `REV-12`):** `[definir antes de G3]`
