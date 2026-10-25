# 🇧🇷 Vox — Arquitetura de Crescimento Autônomo, Infraestrutura Participativa e Blindagem Regulatória

> **Documento Estratégico & Arquitetural**  
> **Status:** Canônico  
> **Data:** 25 de Outubro de 2026  
> **Escopo:** Sustentação desatendida via participantes, flywheel simbiótico e **redução de superfície regulatória** por descentralização radical (visão de produto — **não é parecer jurídico**; ver [COMPLIANCE-BR.md](../COMPLIANCE-BR.md)).

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md), [backlog-participacao-rede.md](./backlog-participacao-rede.md), [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md) e [GOVERNANCE.md](../GOVERNANCE.md).

---

## 🏛️ 1. O Paradoxo das Redes Alternativas e a Solução do Vox

Redes descentralizadas tradicionais costumam falhar por dois extremos:
1. **O Modelo Mastodon (Sobrecarga de Servidor):** Instâncias dependem de um administrador voluntário que paga servidores caros do próprio bolso. Quando a rede cresce, a conta de VPS explode, o admin entra em burnout e o servidor cai ou passa a pedir doações desesperadas.
2. **O Modelo P2P Puro Móvel (Fragilidade de CGNAT):** Depender 100% de celulares atuando como servidores esbarra nas restrições de CGNAT de operadoras brasileiras (Claro, Vivo, TIM), na queima rápida de bateria e na morte do tráfego quando a tela do celular apaga.

O **Vox** resolve essa equação com o modelo de **Infraestrutura Participativa Cooperativa em 4 Camadas** apoiado no Permaweb imutável:

```
┌────────────────────────────────────────────────────────────────────────┐
│               A PIRÂMIDE DE SUSTENTAÇÃO PARTICIPATIVA                  │
├────────────────────────────────────────────────────────────────────────┤
│  Camada 3: Stewards Comunitários (Relays de Gaveta / PC / TV Box)      │
│  ~1-2 voluntários por comunidade mantêm índice e cache local rápido.   │
├────────────────────────────────────────────────────────────────────────┤
│  Camada 2: Apoiadores Locais (commOnly — Escopo da sua Comunidade)     │
│  Membros ativos doam 25 MB de cache para acelerar seu próprio bairro.  │
├────────────────────────────────────────────────────────────────────────┤
│  Camada 1: Nós Leves Ativos (Pacto Vox Default-On no PWA)              │
│  Todo visitante com app aberto serve dados públicos aos pares próximos.│
├────────────────────────────────────────────────────────────────────────┤
│  Camada 0: Leitura / Passivo (Opt-out soberano a qualquer momento)     │
│  Usuários com planos 3G fracos apenas consomem sem custos de upload.   │
└────────────────────────────────────────────────────────────────────────┘
```

**Custo central de servidores para os mantenedores do projeto Vox: R$ 0,00.**

---

## ⚡ 2. Como a Rede Cresce Sozinha com Infraestrutura dos Participantes

Para que a rede escale organicamente sem exigir investimento ou manutenção centralizada, o sistema opera sob quatro mecânicas simbióticas:

### 1. O Nó Leve Default-On (Pacto Vox)
* Cada usuário que abre o Vox no navegador ou no PWA do celular torna-se, imediatamente e de forma invisível, um **nó de cache cooperativo** para os dados públicos da sua sessão.
* As postagens e fotos recentes que ele lê ficam guardadas no IndexedDB local do aparelho.
* Quando outro membro na mesma região geográfica ou na mesma comunidade solicita aquele conteúdo, a malha entrega via WebRTC/gossip ponto a ponto ou do cache mais próximo, **sem sobrecarregar nenhum servidor central**.
* Tetos estritos de proteção protegem o usuário leigo: teto diário de banda de 50 MB, teto de disco de 25 MB e desligamento automático em conexões móveis não-Wi-Fi.

### 2. Ritual de Auto-Semeadura ("Se Você Cria a Comunidade, Você Fornece o Ninho")
* Nas redes corporativas, criar um grupo é instantâneo, mas a Big Tech cobra a conta vendendo seus dados e cobrando para você alcançar seus membros.
* No Vox, quem cria uma comunidade é convidado a um checklist simples de 3 minutos:
  - Deixar a aba do PWA aberta no computador de trabalho ou casa.
  - Ou convidar 2 moderadores para ativar a opção `commOnly` (focar o cache na sua comunidade).
  - O conteúdo da comunidade nasce veloz e localmente replicado porque quem tem interesse na existência daquele espaço é quem banca os primeiros megabytes de memória.

### 3. "Relay de Gaveta" (Steward Kit 1-Clique)
* Qualquer coletivo, sindicato, igreja, grêmio ou grupo de amigos pode rodar um relay comunitário em um notebook velho na tomada, mini-PC ou TV Box Android reaproveitada.
* O software opera como um executável autônomo (ex: Python/PyWebView), configurável com apenas uma barra deslizante: *"Ceder 1 GB de disco para minha comunidade"*.
* Esse relay mantém o índice da comunidade (`GET /vox/index/<id>.json`) sempre pronto e serve os membros do bairro com latência de rede local (< 20 ms), tornando o grupo imune a quedas de links internacionais.

### 4. Reciprocidade Direta ("Egoísmo Esclarecido")
* Não dependemos de caridade abstrata. O comerciante da feira comunitária mantém o nó ativo para que as fotos dos seus produtos carreguem instantaneamente para os clientes vizinhos.
* O comunicador que posta matérias diárias mantém o cache ligado para que seus leitores no WhatsApp abram seu artigo sem delay. A infraestrutura é consequência direta do interesse do próprio participante.

---

## 🔄 3. O Ponto Forte: Transparência Radical e o Flywheel de Auto-Impulsionamento

A força motriz do Vox reside em expor abertamente como a rede funciona, transformando a transparência em um motor de orgulho cívico e crescimento:

### 1. O Flywheel de Auto-Promoção Mútua (POSSE Soberano)
```
Criador publica matéria/oferta no Vox
              │
              ▼
Compartilha link canônico no WhatsApp, X, Telegram e Instagram
              │
              ▼
Leitores externos clicam para ler o artigo original sem paywall
              │
              ▼
Leitor descobre a plataforma aberta, entra com 1 clique (Cantina Gate)
              │
              ▼
Passa a ser mais um nó de cache e membro ativo da comunidade
```
* O criador divulga o Vox para promover a si mesmo;
* O Vox promove o criador oferecendo link permanente e Pix Zaps nativos;
* A rede cresce a cada clique externo sem gastar 1 centavo em marketing ou anúncios pagos.

### 2. Painel honesto da comunidade (estatísticas locais — **sem** ranking público de nós)
* Alinhado a [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) e [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md): **não** há leaderboard global de stewards, scoreboard de contribuição ou competição entre nós ([ADR-001](./adr/001-contribution-attestation-export.md) = export opt-in privado).
* Cada comunidade pode exibir no header um **painel contextual só daquela praça** (telemetria local opt-in, agregados aproximados):
  > *"Sustentada por vizinhos: ~14 aparelhos online agora. ~96% das leituras recentes vieram de cache local ou relay comunitário (estimativa)."*
* Se a comunidade perde apoio e passa a depender de gateways de reserva, o app sinaliza de forma honesta (sem culpar indivíduos):
  > *"⚠️ Velocidade reduzida: poucos apoiadores online nesta comunidade. [Ajude a manter esta praça viva com 1 clique]"*.
* Objetivo: posse coletiva e convite a `commOnly`/steward — **não** gamificação ou exposição pública de quem “contribui mais”.

### 3. "A Rua" sem Caixa-Preta (Curadoria Pública e Aberta)
* Na praça pública do Vox ("A Rua"), não há algoritmos de recomendação secretos otimizados para reter usuários através de indignação e ódio.
* A visibilidade de um tópico é puramente matemática e baseada em parâmetros transparentes:
  - Número de membros participantes;
  - Recência temporal;
  - Profundidade de respostas e diversidade de debatedores.
* As regras de pontuação são auditáveis no código aberto (`render.js` e `topics.js`). Qualquer membro pode inspecionar exatamente o porquê de um post estar no topo.

---

## 🛡️ 4. Redução de superfície regulatória por arquitetura (leitura de risco, não “drible”)

Para que a rede seja **mais fácil de manter por voluntários** e **menos dependente de um operador central único**, a arquitetura do Vox busca **eliminar pontos de estrangulamento desnecessários**. Isso **não** garante imunidade absoluta: espelhos públicos, stewards e autores de conteúdo ainda podem ter obrigações (Marco Civil Art. 19, LGPD, etc.) — detalhes em [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AS 5 LINHAS DE BLINDAGEM REGULATÓRIA                 │
├─────────────────────────┬──────────────────────────────────────────────┤
│ 1. MARCO CIVIL (Art. 19)│ Zero Provedor Central: código estático puro. │
│                         │ Sem servidor central para receber ordem.     │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 2. LGPD (Minimização)   │ Zero Coleta: sem cadastro civil, sem cookies,│
│                         │ sem banco de dados. "O que não existe não vaza".│
├─────────────────────────┼──────────────────────────────────────────────┤
│ 3. REGULAÇÃO BANCÁRIA   │ Zero Custódia: Pix Zaps são gerados no client│
│                         │ via BR Code EMV. Vox não toca em dinheiro.   │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 4. MODERAÇÃO E CENSURA  │ Moderação Client-Side (`mod-action` local).  │
│                         │ A rede é o fio; o cliente escolhe a tela.    │
├─────────────────────────┼──────────────────────────────────────────────┤
│ 5. IMUNIDADE DE DOMÍNIO │ PWA Standalone Offline + Multigateways.      │
│                         │ Derrubar uma URL não apaga a rede.           │
└─────────────────────────┴──────────────────────────────────────────────┘
```

### 1. Inexistência Jurídica de "Provedor de Aplicação" (Marco Civil da Internet)
* **A Armadilha Comum:** Projetos que registram CNPJ ou mantêm uma API central em nuvem corporativa tornam-se "provedores de aplicação". Juízes intimam os fundadores sob pena de multa diária e prisão.
* **A Blindagem do Vox:** 
  - O Vox **não é uma empresa, não possui CNPJ e não opera servidores centrais de aplicação**.
  - O Vox é um software livre (código estático HTML/JS), análogo ao protocolo BitTorrent, ao cliente de e-mail Thunderbird ou ao protocolo Bitcoin.
  - Você não pode processar os autores do código do BitTorrent pelo conteúdo que trafega na rede P2P mundial. O repositório apenas publica o cliente que fala com a infraestrutura pública global da permaweb (Arweave/AR.IO).

### 2. LGPD e minimização por inexistência de custódia central (Privacy by Design)
* **A Armadilha Comum:** Coletar e-mail, telefone, CPF, IP ou cookies exige nomear Encarregado de Dados (DPO), manter relatórios de impacto à privacidade (RIPD) e responder a incidentes na ANPD.
* **A Blindagem do Vox:**
  - **Zero Cadastro:** O login não pede e-mail, senha, telefone nem CPF. A identidade é um par criptográfico Ed25519 gerado em milissegundos na memória do dispositivo.
  - **Zero Telemetria:** O cliente não envia dados comportamentais para nenhum backend nosso (não há Google Analytics, Mixpanel ou trackers).
  - **DMs Fora da Chain com TTL de 72h:** Mensagens privadas nunca vão para a permaweb; trafegam cifradas ponta a ponta (ECDH P-256 + AES-GCM) por inboxes efêmeras que expiram e se autodestroem em 72 horas.
  - **Princípio:** *"A melhor forma de cumprir a LGPD é não possuir dado pessoal algum sob custódia."*

### 3. Imunidade às Regulações do Banco Central (Pix Zaps Offline)
* **A Armadilha Comum:** Redes que tentam criar moedas próprias, tokens, carteiras custodiadas ou intermediar transações financeiras caem na mira do Banco Central e do COAF como Instituições de Pagamento (IP), sofrendo exigências de capital mínimo e KYC pesado.
* **A Blindagem do Vox:**
  - O Vox **não processa pagamentos, não faz split, não cobra taxas e não custodia 1 centavo**.
  - O recurso de Pix Zap gera a especificação aberta BR Code EMV diretamente no navegador do usuário via JavaScript puro + CRC16 offline.
  - Quando o usuário apoia um criador, ele copia a chave ou abre o app do seu próprio banco (Nubank, Itaú, Banco do Brasil, etc.) e liquida a transação diretamente de banco para banco. O Vox é tão somente uma "impressora de QR Code", juridicamente imune a regulações de intermediação de crédito ou pagamento.

### 4. Moderação sem Risco Legal: "A Rede é Neutra, o Cliente Decide o Filtro"
* **A Armadilha Comum:** Plataformas centralizadas que moderam conteúdo tornam-se editorialmente responsáveis pelo que deixam passar; se não moderam, são bloqueadas por inação contra ilícitos.
* **A Blindagem do Vox:**
  - Na camada de rede/permaweb, as transações são registros assinados e matemáticos.
  - A moderação ocorre inteiramente no **cliente** através de transações de governança ([`mod-action`](../GOVERNANCE.md)): moderadores eleitos emitem assinaturas para ocultar tópicos abusivos (`hide` ou `ban`).
  - Se um operador de espelho público (Steward) receber uma notificação ou ordem judicial específica (Marco Civil Art. 19), ele apenas oculta a exibição daquele identificador no seu front-end local. A malha continua viva e o operador cumpre a lei estritamente dentro da camada técnica que controla.

### 5. Imunidade Contra Apagões e Bloqueios Judiciais de Domínio
* **A Armadilha Comum:** Uma decisão judicial bloqueia o DNS do domínio oficial (ex: `vox.org.br`) e a rede inteira desaparece da noite para o dia.
* **A Blindagem do Vox:**
  - O cliente é um **PWA com Service Worker e cache offline**. Uma vez acessado, ele roda localmente no aparelho mesmo se o domínio cair.
  - O código pode ser clonado e servido por milhares de espelhos no GitHub Pages, Vercel, Cloudflare Pages, IPFS ou simplesmente salvo no pendrive como um arquivo `index.html` que abre no navegador.
  - A camada de leitura consulta gateways distribuídos globais e relays locais independentes. Não existe um "endereço IP central do Vox" para ser desligado na tomada.

---

## 🚀 5. A Lista de Ouro: O Que Falta Implementar para a Rede Rodar Sozinha

Com base nessa estratégia simbiótica e blindada, as funcionalidades essenciais prioritárias para o desenvolvimento são:

| Item | Feature | O Que Faz | Impacto no Crescimento Autônomo |
|---|---|---|---|
| **1** | **Painel "Sustentada por Vizinhos" no Header da Comunidade** | Exibe estimativas locais (latência, % cache comunitário, apoiadores online) **sem** ranking entre nós. | Transparência honesta → convite a apoio (`V-P04`/`commOnly`), não scoreboard. |
| **2** | **Wizard de Auto-Semeadura pós-Criação de Comunidade (`V-P05`)** | Guia o fundador em 3 passos simples para garantir os 2 primeiros nós de cache para a comunidade recém-nascida. | Acaba com comunidades "fantasma" ou lentas no nascimento. |
| **3** | **Steward Desktop Executável 1-Clique (Windows / Mac / Linux)** | App standalone em que o usuário clica e define: "Quero ceder 1 GB de cache para meu bairro/coletivo". | Multiplica o número de relays independentes sem exigir terminal Linux. |
| **4** | **Extensão "Vox Bridge" para Crossposting Automático** | Extensão web que utiliza as sessões ativas do usuário para despachar o post canônico do Vox para X, Threads e Instagram. | Converte criadores de conteúdo em máquinas de trazer novos visitantes para o Vox. |
| **5** | **Widget Embed "Comente com Vox" / "Apoie com Pix"** | Código de 3 linhas em JavaScript para sites de notícias e blogs independentes usarem o Vox como sistema de comentários. | Funil permanente de tráfego vindo de sites externos de notícias e blogs populares. |
| **6** | **Community Forking Suave (`Type: community-fork`)** | Permite que membros de uma comunidade com moderação tirânica dupliquem o histórico e iniciem um ramo republicano alternativo. | Garante alta qualidade e honestidade na moderação sem intervenção central. |
| **7** | **Exportador de Backup Soberano em 1 Clique (HTML Standalone)** | Baixa toda a conta, posts, fotos e contatos do usuário em um único arquivo `.html` navegável offline. | O argumento definitivo de segurança: "Seus dados são tão seus que você pode levá-los para um bunker". |
| **8** | **Módulo de Lentes Algorítmicas Conectáveis (Pluggable Feeds)** | Scripts abertos em JS que ordenam o feed público de acordo com critérios transparentes (ciência, debate profundo, cronológico). | Elimina a sensação de manipulação algorítmica e convida cientistas de dados a colaborar. |

---

## 📌 Conclusão Arquitetural

O Vox não tenta vencer as Big Techs jogando o jogo delas (comprando servidores caros, intermediando pagamentos ou criando comitês de censura). 

O Vox vence ao **mudar as regras do jogo**:
1. Torna a **infraestrutura um bem comum invisível e distribuído**, mantido pelo benefício direto de quem posta;
2. Transforma a **transparência e a verdade na malha** em seu maior ativo de marketing e confiança;
3. Adota **descentralização radical** para reduzir dependência de um provedor único e custo central de manutenção — com conformidade tratada como desenho + responsabilidade distribuída ([COMPLIANCE-BR.md](../COMPLIANCE-BR.md)), não como promessa de “blindagem total”.
