# Projeto de Referência para Diagnóstico de Memória

## Contexto

A issue #3000 acompanha diagnósticos de memória e desempenho para sessões longas do Qwen Code. O primeiro PR deve estabelecer uma superfície de diagnóstico pequena e de baixo risco antes de adicionar alterações mais pesadas de perfilamento ou retenção.

O design é referência-primeiro:

- O Claude Code mantém os diagnósticos de memória separados da geração de snapshots do heap. Seus diagnósticos incluem memória do processo, estatísticas do heap V8, espaços do heap, uso de recursos, handles/requests ativos, descritores de arquivo, `smaps_rollup` do Linux e dicas de vazamento.
- O Codex foca fortemente em retenção limitada e carregamento lazy para estado de processo de longa duração. Essas ideias devem guiar PRs posteriores que abordem a retenção de conversas, saídas de comandos e histórico.

## Escopo do Primeiro PR

Adicionar um caminho de diagnóstico `/doctor memory` que captura um único instantâneo pontual:

- `process.memoryUsage()`
- Estatísticas do heap V8 e espaços do heap
- `process.resourceUsage()`
- Contagens de handles/requests ativos
- Contagem de descritores de arquivo abertos quando `/proc/self/fd` estiver disponível
- `smaps_rollup` do Linux quando disponível
- Dicas básicas de risco para pressão no heap, contextos destacados, handles excessivos, requests excessivos, alta contagem de descritores de arquivo e pressão de memória nativa

Este comando deve ser leve o suficiente para ser executado em sessões normais e seguro em plataformas onde as sondas específicas do Linux não estão disponíveis.

## Não-Objetivos

Este PR intencionalmente não:

- grava snapshots do heap
- executa polling contínuo
- altera a retenção de prompt/histórico
- altera a retenção de saída de ferramentas
- modifica o comportamento de carregamento de módulos

Esses são PRs de acompanhamento após a existência da linha de base de diagnóstico.

## PRs de Acompanhamento

1. Adicionar suporte explícito a snapshot/exportação para investigação local mais aprofundada.
2. Adicionar retenção limitada para saídas grandes de comandos/ferramentas, usando a retenção de saída limitada do Codex como referência principal.
3. Auditar caminhos de carregamento lazy e inicialização de módulos após medições identificarem pontos críticos.
4. Adicionar cenários de benchmark repetíveis de memória/desempenho para sessões de longa duração.