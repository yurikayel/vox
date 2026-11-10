# Primeiras tarefas para quem quer contribuir (PM-41)

> **Status:** rascunho para o mantenedor revisar e publicar como issues · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-10
> **Não substitui** o [ROADMAP.md](../ROADMAP.md). Nenhuma issue foi criada no GitHub: cada bloco abaixo está pronto para colar numa issue com o rótulo `boa primeira tarefa`.

## Guia de uma página: sua primeira contribuição

1. **Escolha uma tarefa** abaixo (ou uma issue com o rótulo `boa primeira tarefa`) e comente "vou fazer". Uma pessoa por tarefa, para ninguém refazer o trabalho de outra.
2. **Prepare o ambiente** em 5 minutos: [CONTRIBUTING.md §1](../../CONTRIBUTING.md#1-rodar-localmente). Não há build: o cliente é JavaScript puro em `client/`.
3. **Crie a branch** a partir do `main`: `feat/…`, `fix/…`, `docs/…` ou `chore/…`.
4. **Antes de abrir o PR**, rode `npm run validate` (lint, lint do relay, complexidade e testes). Os limites de tamanho e complexidade estão em [HARDENING.md](../HARDENING.md): função com até 30 linhas lógicas, complexidade até 15. Não divida função em `parte1`/`parte2` só para caber.
5. **Mexeu em arquivo do app** (`client/js`, CSS, HTML)? Suba o `CACHE_NAME` em `client/sw.js` e anote em [CHANGELOG.md](../../CHANGELOG.md) → *Não lançado*.
6. **Abra o PR para o `main`** com o modelo. Diga o que testou e cole a saída (`PASS` com comando e contagem; o que não rodou, diga que não rodou: [qualidade e evidência](./qualidade-e-evidencia.md)).
7. **Revisão:** o mantenedor responde em até uma semana. Achou falha de segurança? Não abra issue: siga o [SECURITY.md](../../SECURITY.md).

## As 10 tarefas

Tamanho: **P** = uma tarde, sem decisão de arquitetura. Nenhuma mexe em cripto, chave ou assinatura.

### 1. Cobertura de testes no resumo do CI (PM-06)
- **Por quê:** hoje não se sabe o que a suíte cobre.
- **O que fazer:** no job `test-client` de `.github/workflows/ci.yml`, rodar os testes com `--experimental-test-coverage` e mandar a tabela para o `$GITHUB_STEP_SUMMARY`. Sem meta mínima no começo.
- **Pronto quando:** o resumo de uma execução do CI mostra a cobertura por arquivo, e o CI continua verde.

### 2. Ouvir um post em voz alta (PM-27)
- **Por quê:** inclui quem lê com dificuldade.
- **O que fazer:** botão "Ouvir" na barra de ações do post (`client/js/render/ig-toolbar.js`) que lê título e texto com `speechSynthesis` em `pt-BR`; tocar de novo para. Esconder o botão quando o navegador não tiver `speechSynthesis`.
- **Pronto quando:** teste em `tests/` cobre "com e sem `speechSynthesis`", e o botão tem rótulo acessível.

### 3. Abrir o projeto num clique (PM-64)
- **Por quê:** reduz o "funciona na minha máquina".
- **O que fazer:** `.devcontainer/devcontainer.json` com Node 22 (o `.nvmrc`) e Python 3.12, rodando `npm ci` ao criar.
- **Pronto quando:** num Codespace novo, `npm test` passa sem passo manual. Uma linha em CONTRIBUTING.md explica.

### 4. Fixar a versão do Python (PM-62, parte que falta)
- **Por quê:** o Node já está fixado (`.nvmrc` e `engines`); o Python, não.
- **O que fazer:** `.python-version` com `3.12` e uma linha em CONTRIBUTING.md §1.
- **Pronto quando:** o arquivo existe, o CI continua usando a matriz 3.11 / 3.12 / 3.15, e o README do relay cita a versão.

### 5. Espelhos que se conferem sozinhos (PM-19)
- **Por quê:** a tabela de espelhos já ficou 23 versões atrás.
- **O que fazer:** workflow agendado que baixa o `sw.js` de `yurikayel.github.io/vox` e de `vox-9df.pages.dev`, compara o `CACHE_NAME` com o do `main` e falha com mensagem clara se divergir. Actions fixadas por SHA ([DEPENDENCIAS §5](../DEPENDENCIAS.md)).
- **Pronto quando:** rodar à mão com os espelhos iguais passa; com um `CACHE_NAME` diferente simulado, falha.

### 6. Smoke da tela de status (PM-05, primeira fatia)
- **Por quê:** telas inteiras não têm teste que pegue exceção ao montar.
- **O que fazer:** em `tests/`, montar a rota `#/status` (`client/js/app/screens-status.js`) no DOM de teste de `tests/setup.js` e falhar se lançar exceção ou se a tela vier vazia.
- **Pronto quando:** o teste passa e quebra se `renderStatusPage` lançar erro. Depois, a mesma receita serve para outras rotas.

### 7. Quanto o app repassou no mês (PM-26, primeira fatia)
- **Por quê:** franquia de dados é o custo real de quem mais precisa.
- **O que fazer:** o app já soma por dia o que repassa (`bytesServedToday` em `client/js/peers.js`). Guardar também o total do mês corrente e mostrar em `#/settings/network`.
- **Pronto quando:** o total vira o mês sozinho, aparece na tela de rede, e há teste da virada de mês.

### 8. Acessibilidade de uma tela (LAN-22, primeira fatia)
- **Por quê:** as 10 rotas principais precisam de WCAG 2.2 AA básico.
- **O que fazer:** na tela de rede (`client/js/render/network.js`), conferir rótulo em todo botão e campo, ordem do foco pelo teclado e contraste. Corrigir o que faltar.
- **Pronto quando:** o PR lista o que foi conferido e o que mudou, e a tela é usável só pelo teclado.

### 9. Contêineres fixados por versão (PM-14, parte que falta)
- **Por quê:** `coturn/coturn:latest` e `caddy:2-alpine` em `relay/deploy/docker-compose.yml` mudam sem aviso.
- **O que fazer:** fixar cada imagem numa versão exata (e, se possível, pelo digest `@sha256:`), e atualizar a tabela §4 de [DEPENDENCIAS.md](../DEPENDENCIAS.md).
- **Pronto quando:** `tests/dependencias-inventory.test.js` passa e nenhuma imagem usa `latest`.

### 10. Código de conduta (PM-63)
- **Por quê:** é a peça que falta dos arquivos de comunidade do GitHub antes de chamar gente de fora.
- **O que fazer:** `CODE_OF_CONDUCT.md` com o Contributor Covenant 2.1 em português e um link no README e no CONTRIBUTING.md.
- **Pronto quando:** o GitHub reconhece o arquivo na aba *Community*. **O contato de conduta é decisão do mantenedor:** o PR deixa o campo marcado para ele preencher.
