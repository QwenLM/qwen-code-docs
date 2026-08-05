# Propagação do cache de compilação do ACP

## Contexto

O wrapper de produção `cli-entry.js` já habilita o cache de compilação de
módulos do Node para o fast path `serve` no próprio processo. O daemon depois
gera um filho ACP através de `createSpawnChannelFactory()`, mas
`module.enableCompileCache()` afeta apenas o processo atual e não popula
`NODE_COMPILE_CACHE`. O filho ACP, portanto, inicia sem o cache, a menos que o
operador tenha definido essa variável de ambiente antes de iniciar o Qwen
Code.

Este é o candidato de cache de compilação ortogonal registrado no #7264. Ele
não reduz o grafo de módulos ansioso; ele reutiliza o cache de código V8 para
o grafo que permanece após o trabalho de carregamento preguiçoso.

## Objetivos

- Permitir que descendentes ACP de produção reutilizem o diretório de cache de
  compilação já habilitado pelo wrapper de entrada do daemon.
- Preservar um `NODE_COMPILE_CACHE` fornecido pelo operador.
- Preservar `NODE_DISABLE_COMPILE_CACHE=1`.
- Manter falhas de cache como uma falha silenciosa de otimização em vez de uma
  falha de aplicação.
- Evitar mudar a bridge ACP, a configuração ou o ciclo de vida da sessão.

## Não objetivos

- Não introduzir uma localização de cache, política de eviction ou comando de
  limpeza específicos do Qwen.
- Não forçar suporte de cache de compilação em versões do Node onde a API
  JavaScript não está disponível.
- Não descarregar o cache a partir do daemon ou do ciclo de vida do ACP.
- Não mudar globalmente ambientes de teste ou de cobertura.

## Topologia de inicialização

O caminho de produção do daemon é:

1. `cli-entry.js serve`
2. `module.enableCompileCache()` no processo do daemon
3. import in-process do CLI empacotado
4. `createSpawnChannelFactory()` copia `process.env`
5. um novo processo Node lê `NODE_COMPILE_CACHE` durante a inicialização
6. o filho executa a entrada de CLI selecionada com `--acp` (`cli.js` por
   padrão, ou `QWEN_CLI_ENTRY` quando explicitamente configurado)

Hoje o passo 2 beneficia apenas o daemon. O ambiente copiado no passo 4 não
tem diretório de cache de compilação, então o filho nos passos 5 e 6 não opta
por participar.

## Mudança proposta

Capturar o resultado da chamada existente de `module.enableCompileCache()`.
Quando ele reporta um cache recém-habilitado, expõe um diretório e o operador
não forneceu `NODE_COMPILE_CACHE`, publicar esse diretório em `process.env`. A
construção existente de processo filho já copia o ambiente, então nenhuma
mudança na camada ACP é necessária.

Não sobrescrever um valor de ambiente existente. Quando o Node habilitou o
cache a partir de uma variável de ambiente pré-existente, ele reporta um estado
já habilitado e o diretório base original deve permanecer intacto.
Substituí-lo com `getCompileCacheDir()` ou o resultado já habilitado pode
criar um diretório de versão aninhado nos descendentes.

Não sintetizar um diretório quando a habilitação falha, está desabilitada ou a
API não está disponível. Esses casos mantêm o comportamento atual.

## Alternativas consideradas

### Definir a variável de ambiente em `spawnChannel`

Rejeitado. A propriedade do cache de compilação é um comportamento de entrada
global do processo, enquanto `spawnChannel` é infraestrutura ACP compartilhada
usada por hosts embutidos. Mover a política para lá amplia a superfície
arquitetural e duplica o comportamento de bootstrap do Node.

### Definir um cache com versão do Qwen sob `QWEN_HOME`

Rejeitado. O Node já separa versões incompatíveis do Node e chaveia entradas
por conteúdo de módulo. O Node recomenda o padrão de diretório temporário para
evitar acúmulo de cache obsoleto. Um cache persistente específico do Qwen
exigiria nova política de limpeza, permissões e ciclo de vida sem evidência de
que melhore o caminho medido.

### Exportar `getCompileCacheDir()` incondicionalmente

Rejeitado. Quando o cache foi habilitado a partir de uma variável de ambiente
existente, o diretório reportado já é específico da versão do Node.
Reutilizá-lo como base do próximo processo cria outro diretório de versão
aninhado e impede o compartilhamento pretendido.

## Comportamento de falha e compatibilidade

- Node sem `enableCompileCache()`: nenhuma mutação de ambiente e nenhuma
  mudança de comportamento.
- `NODE_DISABLE_COMPILE_CACHE=1`: o Node reporta desabilitado; nenhum diretório
  é propagado.
- `NODE_COMPILE_CACHE` fornecido pelo operador: preservado literalmente e
  herdado normalmente.
- Diretório de cache não gravável ou inválido de outra forma: o Node reporta
  falha sem lançar exceção; o Qwen Code continua sem cache.
- Upgrade do Node ou do Qwen: o Node isola versões de runtime incompatíveis e
  mudanças de conteúdo de fonte produzem entradas de cache diferentes.
- Cobertura: o fast path de produção é o único ponto de mutação. Runners de
  teste unitário não optam globalmente por caching de compilação.
- Encerramento: o Node grava o cache de código acumulado durante a saída
  normal do processo. Encerramento forçado pode perder entradas recém-geradas,
  mas não pode afetar a corretude.

## Verificação

A viabilidade é verificada por gate antes da implementação usando um bundle de
release idêntico para ambas as variantes. Ambas as variantes do daemon recebem
o mesmo cache quente do processo pai. O controle remove o ambiente de cache
antes de importar o bundle, então os descendentes ACP permanecem sem cache; o
candidato publica o mesmo diretório base antes do import, então os
descendentes ACP o herdam.

O gate no host de referência 2-vCPU cobre:

- 30 inícios frios pareados e alternados do daemon
- 30 inícios pré-aquecidos pareados e alternados
- `channel.initialize`, processo-até-primeira-sessão, prontidão do listener e
  RSS de pico
- uma segunda sessão quente
- primeiras sessões concorrentes
- telemetria habilitada e desabilitada
- comportamento legado de sessão única
- primeiro uso com cache vazio, reutilização com cache quente, footprint do
  cache e processos residuais

A implementação prossegue apenas se a comparação de cache quente específica do
filho mostrar um benefício repetível de inicialização ou de
processo-até-sessão sem regressão funcional.

## Resultados de validação

O gate foi executado em um host Linux x64 com 2 vCPUs e 4 GB, com Node.js
22.23.1. O controle e o candidato usaram o mesmo bundle de `77af061e` e
diferiram apenas em se o filho ACP herdava o diretório de cache de compilação
do pai.

Em 30 execuções pareadas com cache quente, o candidato venceu todas as
comparações de `channel.initialize`. Sua melhoria mediana pareada foi de
176,6 ms, com intervalo de confiança de 95% por bootstrap de 167,7–186,2 ms. A
melhoria mediana pareada de processo-até-primeira-sessão foi de 199,0 ms, com
intervalo de confiança de 95% de 177,6–226,5 ms. O RSS mediano de pico da
árvore de processos do candidato foi 8,6 MB maior.

Uma confirmação adicional de 10 pares usou a entrada de produção não
modificada de `origin/main` como controle e a entrada de produção com patch
como candidato. Ela reproduziu uma melhoria mediana de 181,6 ms em
`channel.initialize` e uma melhoria mediana de 189,4 ms de
processo-até-primeira-sessão.

Em 20 pares independentes com cache vazio, a primeira execução de
processo-até-sessão foi 117,2 ms mais lenta na mediana, com intervalo de
confiança de 95% de 69,3–130,9 ms. A segunda inicialização ACP, portanto,
recupera o custo único de geração sob a carga de trabalho medida. O cache
estável continha 362 arquivos e usava 9,4 MB.

Todas as execuções medidas foram concluídas com sucesso sem processos
residuais. O candidato também passou na criação concorrente de primeira
sessão, inicialização com telemetria desabilitada e comportamento legado de
sessão única.
