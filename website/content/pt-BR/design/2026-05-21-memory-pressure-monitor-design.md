# Monitor de Pressão de Memória

## Problema

Sessões de longa duração do Qwen Code podem acumular memória por meio de resultados de ferramentas grandes, leituras de arquivos repetidas, histórico de chat e alocações nativas/externas. Antes desta alteração, o pacote principal (core) tinha diagnósticos e limpeza de redefinição de sessão, mas nenhuma resposta em tempo de execução quando a pressão de memória aumentava durante a execução normal de ferramentas.

A lacuna específica de cache de maior valor é o `FileReadCache`: ele já tem um tamanho FIFO limitado, mas não possuía um caminho de evicção baseado em tempo. Isso significa que uma sessão pode reter metadados inativos de leitura de arquivo até que o limite rígido de entradas seja atingido, mesmo quando o processo está sob pressão de memória.

## Objetivos

- Adicionar uma verificação de pressão de memória de baixa sobrecarga após a execução da ferramenta.
- Preferir limpeza cirúrgica antes da limpeza destrutiva.
- Respeitar os limites de memória do contêiner quando os arquivos de limite de memória do cgroup v2 ou cgroup v1 estiverem disponíveis.
- Reagir à pressão do heap do V8 antes do OOM do heap do JavaScript em hosts com muita memória.
- Manter as instâncias de `Config` de subagentes/escopo isoladas da limpeza da sessão pai.
- Tornar o comportamento configurável por meio de variáveis de ambiente sem adicionar uma nova superfície de configurações voltada para o usuário.

## Não Objetivos

- Não adicionar um loop de polling em segundo plano.
- Não tornar o GC explícito o padrão; ele só é executado quando habilitado e o Node foi iniciado com `--expose-gc`.
- Não alterar a semântica de imposição de leitura prévia. A evicção do cache pode remover metadados antigos, mas não deve enfraquecer as verificações de arquivos obsoletos para entradas retidas.

## Design

`Config.initialize()` cria um `MemoryPressureMonitor` por `Config` inicializado. `getMemoryPressureMonitor()` espelha o padrão de isolamento `Object.create` existente de `getFileReadCache()`: quando uma config filha é criada por meio de delegação de protótipo, o getter instala sob demanda um monitor próprio vinculado a essa config filha.

`CoreToolScheduler.executeSingleToolCall()` chama `scheduleCheck()` em seu bloco `finally` após encerrar o span da ferramenta. `scheduleCheck()` consolida múltiplas chamadas no mesmo turno do event-loop com `queueMicrotask`, para que lotes de ferramentas concorrentes do tipo leitura não executem uma verificação de memória por resultado de ferramenta.

O monitor usa o mais forte de dois sinais de pressão:

- RSS dividido por um limite de memória de processo efetivo. Prefira o cgroup v2 `/sys/fs/cgroup/memory.max` quando for um valor positivo finito; faça fallback para o cgroup v1 `/sys/fs/cgroup/memory/memory.limit_in_bytes` e, em seguida, para `os.totalmem()` caso contrário. Os valores sentinelas enormes de "ilimitado" do cgroup v1 são ignorados.
- `heapUsed` do V8 dividido por `getHeapStatistics().heap_size_limit`.

Usar ambos os sinais é importante porque os contêineres geralmente falham por limite de RSS/cgroup, enquanto máquinas locais com muita memória podem atingir o OOM do heap do V8 muito antes de o RSS ser uma grande fração da memória total do sistema.

Os limites padrão são intencionalmente conservadores o suficiente para reagir antes que o OOM killer do SO ou do contêiner aja:

- `softPressureRatio = 0.50`
- `hardPressureRatio = 0.65`
- `criticalRatio = 0.80`
- `cleanupCooldownMs = 5000`
- `enableExplicitGC = false`

Substituições via variáveis de ambiente:

- `QWEN_MEMORY_PRESSURE_SOFT`
- `QWEN_MEMORY_PRESSURE_HARD`
- `QWEN_MEMORY_PRESSURE_CRITICAL`
- `QWEN_MEMORY_ENABLE_GC=1`

Razões inválidas fazem fallback para os padrões. Razões válidas devem ser ordenadas como `soft < hard < critical`, com um limite inferior soft de `0.3` e um limite superior critical de `0.98`. As variáveis de ambiente de razão são analisadas estritamente com `Number()`, então valores como `0.8extra` são rejeitados em vez de parcialmente aceitos. Uma configuração inválida de variável de ambiente de pressão de memória grava um aviso visível no stderr e no log de depuração antes de fazer fallback para os padrões.

## Política de Limpeza

Os níveis de pressão mapeiam para limpezas cada vez mais fortes:

- `soft`: remove entradas obsoletas do `FileReadCache` não acessadas nos últimos 60 minutos.
- `hard`: remove entradas do cache não acessadas nos últimos 30 minutos.
- `critical`: limpa o cache de leitura de arquivo e, opcionalmente, aciona `global.gc()`.

O monitor intencionalmente não força a compactação do chat. A compactação pode chamar o backend do modelo e reescrever o estado ativo do chat, portanto, deve ser acionada apenas a partir de um local de chamada que possa coordenar com segurança o loop de conversação.

A limpeza é fire-and-forget a partir do agendador, mas o monitor protege as etapas de limpeza com `cleanupInProgress` e um timestamp de cooldown. Uma limpeza de pressão maior pode ignorar o cooldown e entrar na fila atrás de uma limpeza de pressão menor em andamento, para que uma verificação `critical` não seja perdida enquanto uma limpeza `soft` está terminando. Após uma limpeza bem-sucedida, ele registra um delta de RSS em `setImmediate()`, mas o movimento do RSS é apenas diagnóstico: o V8 e a libc podem reter páginas liberadas mesmo quando os objetos JavaScript se tornaram coletáveis. Falhas consecutivas contam exceções de etapas de limpeza, não RSS inalterado, e o contador é redefinido em uma nova sessão. Se três tentativas de limpeza bem-sucedidas consecutivas liberarem menos de 1% de RSS, o monitor emite `memory-cleanup-ineffective` como um sinal de diagnóstico sem tratar a própria etapa de limpeza como falha.

## Cobertura de Testes

A implementação é coberta por:

- testes de validação de thresholds;
- testes de parsing de configuração de ambiente, fallback, aviso visível e GC explícito;
- testes de classificação de pressão usando `process.memoryUsage()` com mock;
- comportamento do `memory.max` do cgroup v2 e do `memory.limit_in_bytes` do cgroup v1;
- comportamento do limite de heap do V8;
- coalescing do `scheduleCheck()`;
- integração do agendador que invoca `scheduleCheck()` após a execução da ferramenta;
- ações de limpeza soft e critical;
- contabilidade de falhas de limpeza para etapas de limpeza que lançam exceções;
- isolamento de exceções do listener de limpeza e diagnósticos de limpeza ineficaz;
- isolamento do monitor de `Config` filho através de `Object.create`;
- comportamento de `FileReadCache.evictNotAccessedSince()`.

## Riscos e Tradeoffs

- O RSS pode permanecer estável após a limpeza porque o V8 ou a libc podem reter a memória liberada. Os deltas de RSS são registrados, mas o RSS inalterado não conta como uma falha de limpeza.
- A evicção do cache de leitura de arquivo baseada em tempo pode reduzir os hits de fast-path para arquivos antigos, mas preserva as entradas recentemente ativas e só é executada sob pressão de memória.