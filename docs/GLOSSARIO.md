# Glossário da interface (pt-BR)

> **Status:** canônico (linguagem leiga para contribuidores e revisão de copy) · **Owner:** mantenedor doc · **Revisado:** 2026-11-19

Este glossário traduz para português claro os nomes que aparecem no app, nas mensagens de ajuda e na documentação. Ele **não** substitui a **Voxpedia** (`#/voxpedia` no app), que é a ajuda dentro do PWA; aqui a fonte é o repositório, para quem escreve textos, revisa PRs ou responde dúvidas sem abrir o cliente.

Para identidade e criptografia em profundidade: [IDENTITY.md](./IDENTITY.md). Para o estado real de cada tela: [FEATURES.md](./FEATURES.md).

---

## Identidade, conta e cofre

| Termo na UI | O que significa, em poucas palavras |
| --- | --- |
| **Conta** | Sua identidade no Vox. Nasce neste aparelho; não há “servidor de login” da rede. Quem entra está **abrindo chaves que já existem** (cofre, frase, guardiões, arquivo, QR ou malha), não criando usuário em nuvem. |
| **Criar conta** | Primeiro uso: você escolhe nome e, se quiser, e-mail e senha. Pode começar só com o nome; e-mail e senha preparam cofre e formas de voltar depois. |
| **Já tenho conta** | Caminho principal de volta em aparelho novo: **e-mail + senha** abrem o cofre v2. Kits, frase, guardiões, QR e arquivos ficam em **Outras formas de voltar**. |
| **Identificador `vx_…`** | Seu “endereço” público no app (assinaturas, DMs, links `#/connect/…`). Outras pessoas usam isso para te achar; não é o mesmo que e-mail. |
| **Cofre** | Arquivo **cifrado** com as chaves da sua conta. A senha (Senha Soberana) destrava; sem ela, o arquivo é inútil. Versão atual: **cofre v2** (PBKDF2 + AES-GCM). |
| **Senha Soberana** | A senha que **abre o cofre** e protege backups. Não vai no e-mail, no relay nem para Google/Meta. Use frase longa (4+ palavras). |
| **Cofre na malha** | Cópias do cofre v2 guardadas por até sete **laços mútuos** (guardiões primeiro), como caixa preta. Num aparelho sem cópia, o app **pede o cofre à malha**; quem guarda pode confirmar ou esperar 24 h (ADR-037). |
| **Foi você?** / **Fui eu** / **Não fui eu** | Pergunta à dona da conta quando alguém na malha pede o cofre de volta. Confirma liberação; “não fui eu” bloqueia aquele pedido. |
| **Saída da conta** | Prova de que você consegue voltar **sem** depender só deste aparelho: cofre aceito na memória/ malha, arquivo `.voxid`, backup mandado ao seu e-mail, frase memorizada ou guardiões. Até existir saída, pode aparecer faixa de **conta provisória**. |
| **Kit de volta** | E-mail ou arquivo com link (`#/sync?b=…`, `VOX1:…`) para você mesmo: leva o cofre cifrado, **nunca a senha**. |
| **Frase de recuperação** | Lista de palavras (ex.: 12) que você anota offline; outra forma de voltar à mesma conta. |
| **Guardiões** (recuperação) | Pessoas de confiança que guardam **pedaços** ou cópias para te ajudar a voltar. Não confundir com **modo guardião** de rede (ver abaixo). |
| **Contas vinculadas** | Login Google/Meta **só enriquece perfil**; **não abre cofre** e não vira chave do Vox. |
| **Carteira Arweave** | Carteira opcional para leitura/recursos no Arweave; a conta do dia a dia é local (`vx_…`). Pela diretriz atual, publicação nova não vai ao Arweave por padrão. |
| **Apagar conta local** | Apaga **tudo neste aparelho**: chaves, cofre, cópias na malha, pedidos pendentes e caches locais. Não apaga o que outras pessoas já copiaram. |
| **Alternar conta** | Várias contas no mesmo aparelho (cofre multi-identidade); cada uma com suas chaves e dados locais. |

---

## Rede, malha e pares

| Termo na UI | O que significa, em poucas palavras |
| --- | --- |
| **Malha** | Rede **entre aparelhos**: troca posts, mídia e sinais por WebRTC e inventário, sem depender de um único datacenter. É a forma principal de circular conteúdo hoje (rede de seguidores). |
| **Par** | Outro aparelho conectado na malha no momento. “Sem par” costuma significar que ninguém próximo está online para sincronizar. |
| **Pacto Vox** | Acordo no onboarding: por padrão você ajuda um pouco a malha (repassar cache). Dá para pausar em **Sua rede**. |
| **Sua rede** | Ajustes em `#/settings/network`: pausar malha, ser apoiador, relay, steward, exportar moderação, modo demonstração, etc. |
| **Nó leve** | Seu aparelho repassa trechos que já tem em cache, com limites de disco e banda. |
| **Apoiador da rede** | Nó um pouco mais generoso (mais disco/banda, em geral no Wi-Fi). |
| **Modo guardião** (rede) | Aparelho como nó de cache fixo maior (em desenvolvimento/plugável); **não** é o mesmo que “guardiões” da recuperação de conta. |
| **Steward** | Pessoa ou grupo que implanta o **Vox Memoria** em modo VPS/coletivo (relay + sinalização + TLS via **Kit steward**, que é pacote de ops e não um 4º app) — infraestrutura substituível, não dono da sua conta. |
| **Relay** | Servidor que **não lê conteúdo em claro**: repassa envelopes cifrados (DM offline, cofre remoto, OAuth em deploy). |
| **Memória central** | Serviço do **Vox Memoria** (`central_memory.py` / binário local) que guarda histórico e blobs entre reinícios; mantenedor ou comunidade escolhe quanto ceder de CPU, disco e banda. |
| **Signaling** | Serviço auxiliar para o WebRTC “se achar” atrás de roteador (NAT); não vê o conteúdo das conversas. |
| **Gateway** | Ponto de leitura GraphQL (Arweave/índice); o cliente consulta quando precisa buscar registros públicos. |
| **Rede ativa** | Indicador na barra: quantos pares WebRTC conectados ou quanto você serviu — atalho para ajustes. |
| **Modo demonstração** | Conteúdo **fictício** com faixa no topo, para conhecer o app **sem** rede; o Vox não inventa feed quando a rede falha de verdade. |
| **Sync por link / QR** | Leva só o cofre cifrado; a senha você digita no outro aparelho (`#/sync?b=…`). |

---

## Mensagens, posts e mídia

| Termo na UI | O que significa, em poucas palavras |
| --- | --- |
| **Mensagens** (DM) | Conversa privada entre dois `vx_…`. Texto cifrado para o destinatário; histórico fica neste aparelho; entrega online via malha/WebRTC ou offline via relay (TTL limitado). |
| **Mochila** | Repasse **cego** de DMs entre aparelhos da mesma pessoa (em evolução): a mochila carrega envelopes sem ler o texto. |
| **Para você** / **Seguindo** | Feeds no Início: autores que você segue vs mistura com descoberta recente — sem leilão de anúncios nem ranking opaco. |
| **Postar** / **tópico** | Publicação em comunidade ou feed; assinada pela sua conta local. |
| **POSSE** | Estratégia “publicar aqui e compartilhar o link” no WhatsApp ou outras redes; o Vox guarda o original, **não** posta sozinho no Instagram/Facebook. |
| **Handle `@nome`** | Apelido legível; resolução depende do que você e contatos já viram — não é DNS centralizado de rede fechada. |
| **Permanência / Arweave** | Aviso quando algo poderia ir ao permaweb; hoje a gravação nova no Arweave costuma estar **pausada** — circulação pela malha. |

---

## Comunidades e moderação

| Termo na UI | O que significa, em poucas palavras |
| --- | --- |
| **Comunidade** | Espaço temático com posts, classificados e governança; regras daquela comunidade, não da internet inteira. |
| **Governança** | Propostas e votos (sim/não/abstenção) sobre **regras locais** da comunidade. |
| **Moderador** | Quem assina ações de moderação; seu cliente pode ocultar conteúdo — não “apaga do mundo” o que já propagou. |
| **Convite com vínculo** | Link `#/connect/…` com token: quem entra e quem convidou assinam o vínculo (padrinho); base do moderador natural em lab. |
| **Padrinho** | Quem convidou com aceite assinado; em moderação natural, pode arquivar posts do afilhado dentro de regras rígidas. |

---

## Comunidade e praça (candidatos IXV)

Termos de produto inspirados na observação Énóis, com nome Vox. Códigos **IXV-01…14** e ondas: [brainstorm Énóis](./brainstorms/brainstorm-enois-observacao-2026-11.md). Onde diz *candidato*, ainda **não** está na UI.

| Termo na UI (candidato) | O que significa, em poucas palavras |
| --- | --- |
| **Início** *(ágora nos docs)* | Feed principal — rota `#/`. Copy para quem organiza usa **Início** ([síntese praça](./brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md): “Ágora” não na tela). Na nav do app hoje aparece **Ágora** (`shell.js`, [ADR-016](./adr/016-design-system-sovereign-agora-e-democracia-direta.md)). Não confundir com `#/explorar`. |
| **Explorar** (IXV-01) | Hub **lazy** (`#/explorar`, pós-PM-01) para descobrir módulos opcionais (Feira, Mesa, Salas Precisas); não substitui o feed / **Início** (`#/`). |
| **Posts temporários** (IXV-02) | Publicação com prazo visível (ex.: 24 h, 7 dias); política de esquecimento ([ADR-019](./adr/019-esquecer-por-padrao-e-memoria-civica.md)). |
| **Assuntos** (IXV-04) | Filtros em pills numa comunidade (`#/c/:id`): avisos, pautas, Feira, dúvidas — em vez de um único mural sem foco. |
| **Recorrente** (IXV-05) | Encontros que voltam no tempo (ritualRule); nome de UI para rituais ligados a aviso assinado e [modo assembleia](./specs/modo-assembleia-v0.md). |
| **Salvos** (IXV-06) | Marcadores locais evoluindo para rota `#/salvos` e pastas no aparelho. |
| **Mensagens protegidas** (IXV-07) | DM com linguagem simples sobre criptografia e senha no aparelho. |
| **Para responsáveis** (IXV-07) | Página de orientação 18+ e uso seguro (`#/responsavel` ou Voxpedia), espelho do Énóis `/responsavel`. |
| **Nota de contexto** (IXV-08) | Acrescento **assinado** preso a um tópico pai (correção, ata, fonte) — não é apagar nem moderar o post original. |
| **Coluna** (IXV-09) | Texto longo da comunidade ou do perfil (`kind: "coluna"`) fora do feed / **Início** — estatuto, guia, diário. |
| **Molduras cívicas** (IXV-10) | Decoração de perfil via **Voxels**, só opções de uma lista CSS fechada. |
| **Mural fixado** (IXV-12) | Conjunto de posts fixados pela moderação ou curadoria da comunidade. |
| **Sugestão na pauta** (IXV-12) | Proposta leve de mudar regra local, votada na **Governança**, sem virar post no feed. |
| **Salas Precisas** (IXV-13) | Módulo de **finalidade única** plugado pela **comunidade** (contexto fechado, permissões mínimas); ex.: **Mesa** (RPG) em `#/dungeon`. |
| **Livro de transparência** (IXV-14) | Relatório público de moderação e provas de interface (REV-20, `docs/proof/` em PRs). |

---

## Nomes de produto e referência técnica curta

| Termo | O que significa, em poucas palavras |
| --- | --- |
| **Vox** | Cliente único (PWA, `Vox.exe` ou `vox.apk`): todo mundo usa o mesmo app para ler, postar e conversar. |
| **Vox Populi** | Nó de apoio leve em segundo plano + dashboard simplificado (ligar/pausar, só Wi-Fi, cota leve). Substitui o **Vox Memoria** se ambos forem abertos no mesmo aparelho. |
| **Vox Memoria** | Nó de memória dedicado + dashboard de mantenedor para ceder X CPU, disco e banda à memória perene da rede. Substitui o **Vox Populi** se ambos forem abertos no mesmo aparelho (nó local único, [ADR-011](./adr/011-taxonomia-tripartite-produtos-vox.md)). |
| **Conexão local** (*Usando seu nó*) | Enlace automático do cliente **Vox** com o **Vox Populi** ou **Vox Memoria** rodando na mesma máquina (`127.0.0.1`). Substitui o termo antigo "Local Boost". |
| **Voxpedia** | Ajuda **dentro do app** (`#/voxpedia`), em camadas leigas; aponta para o GitHub quem for desenvolver. |
| **PWA** | Site que pode ser “instalado” e guardar dados no aparelho como app. |
| **WebRTC** | Tecnologia de conexão direta entre navegadores (usada na malha e em DMs online). |

---

## Referências cruzadas

- Login e invariantes de teste: [plano-testes-login.md](./process/plano-testes-login.md)
- Cofre v2 e malha: [ADR-025](./adr/025-cofre-v2-so-a-senha-abre.md), [ADR-037](./adr/037-cofre-na-malha.md)
- Índice geral: [README.md](./README.md)