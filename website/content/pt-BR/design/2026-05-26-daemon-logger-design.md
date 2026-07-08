# Logger de arquivo do daemon `qwen serve` — Design

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branch**: `feat/support_daemon_logger`
- **Status**: design aprovado, aguardando plano de implementação
- **Data**: 2026-05-26

## 1. Problema

O `qwen serve` emite diagnósticos no nível do daemon (ciclo de vida, erros de rota, stderr de filhos ACP) para `process.stderr`. Isso funciona sob systemd/Docker, mas é frágil para uso via SDK / Desktop / daemon local: quando um cliente vê `POST /session/:id/prompt` retornar HTTP 500, o contexto de rota + sessão + stack se perde, a menos que o operador tenha redirecionado o stderr manualmente.

O `createDebugLogger` (em `packages/core/src/utils/debugLogger.ts`) tem escopo de sessão: requer uma `DebugLogSession` ativa e escreve em `${runtimeBaseDir}/debug/<sessionId>.txt`. O daemon do serve inicia **antes** de qualquer sessão existir, então chamadas no nível do daemon resultariam em no-op silencioso. Ele também não pode ser reutilizado sem alterar a semântica de `debug/latest` por sessão.

Este design adiciona um sink de arquivo específico para o daemon, aditivo ao comportamento existente de stderr, para que os diagnósticos do daemon sobrevivam sem redirecionamento de shell.

## 2. Escopo

### No escopo

- Um novo logger inicializado uma vez por processo `runQwenServe`.
- Arquivo em `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`, modo append.
- Tee de:
  - mensagens de ciclo de vida / shutdown / sinal do `runQwenServe.ts`
  - erros de rota do `sendBridgeError` (`server.ts`)
  - `writeServeDebugLine` do `bridge.ts` (quando `QWEN_SERVE_DEBUG` está definido)
  - encaminhamento de stderr de filhos ACP do `spawnChannel.ts`
- Opt-out via `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Symlink `latest` no diretório do daemon para `tail -f`.
- Documentação nos docs da CLI do serve.

### Fora do escopo (non-goals da issue)

- Substituir o OpenTelemetry ou adicionar tracing de daemon.
- Exportação estruturada de logs de erro enterprise (issue #2014).
- Rotação ou exclusão de logs de debug de sessão existentes.
- Rotação de log / limite de tamanho para o próprio log do daemon (adiado para um PR de acompanhamento). Um aviso de stderr no boot é emitido se o arquivo existente for incomumente grande; nenhuma ação automática.

## 3. Arquitetura

### 3.1 Limites dos módulos

| Camada                                                    | Novo / Alterado | Responsabilidade                                                                                                                              |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                  | **novo**        | Sink: init, formatação, append em arquivo, tee para stderr, flush, symlink latest                                                             |
| `packages/cli/src/serve/runQwenServe.ts`                  | alterado        | Inicializa logger no boot; substitui `writeStderrLine` de ciclo de vida por `daemonLog.*`; `await flush()` no shutdown; passa `onDiagnosticLine` para a bridge |
| `packages/cli/src/serve/server.ts`                        | alterado        | `sendBridgeError(...)` roteia através de `daemonLog.error(...)`                                                                               |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)      | alterado        | Adiciona `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` opcional                                            |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`   | alterado        | Se `onDiagnosticLine` for injetado, faz tee da mesma linha                                                                                    |
| `packages/acp-bridge/src/spawnChannel.ts`                 | alterado        | Encaminhador de stderr de filhos faz tee de cada linha com prefixo em `onDiagnosticLine`                                                      |

**Intenção do design**: `daemonLogger.ts` é single-file, local da cli, sem singleton global. O `acp-bridge` permanece ignorante sobre a cli — ele vê apenas um callback. O grafo de dependências permanece inalterado.

### 3.2 Sem singleton global

O logger é criado no `runQwenServe`, passado por closure para os módulos internos do serve que precisam dele (ou por callback para o `acp-bridge`). Justificativa:

- Espelha como o `BridgeOptions` já injeta dependências.
- Evita os vazamentos de estado entre testes que o `debugLogger` enfrentou historicamente (`resetDebugLoggingState()` existe por esse motivo).

## 4. Daemon ID e caminho do arquivo

- Caminho: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Resolve para `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Reutiliza `Storage.getGlobalDebugDir()` para que o override do runtime-dir (env var, contextual) seja aplicado automaticamente.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` desambigua múltiplos daemons no mesmo workspace.
  - `workspaceHash` tem comprimento fixo, é seguro para nomes de arquivo e é estável para o mesmo caminho de workspace.
- Symlink `latest`: `~/.qwen/debug/daemon/latest` → arquivo de log do processo atual. Atualizado no init usando o helper existente `updateSymlink` (`packages/core/src/utils/symlink.ts`). Falha no symlink é logada e ignorada — não degrada as escritas primárias. Distinto de `${runtimeBaseDir}/debug/latest` (com escopo de sessão) conforme non-goal.
- Modo do arquivo: `'a'` (append em `O_APPEND | O_CREAT`). Arquivos existentes sobrevivem a reinícios para fins forenses.

## 5. API pública

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` é anexado como linhas de continuação indentadas após a mensagem.
   * Ambos `err` e `ctx` são opcionais e independentes.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Tee apenas para arquivo de linhas cujo chamador já está escrevendo no stderr
   * (encaminhador de stderr de filhos ACP, `writeServeDebugLine`). A linha é
   * anexada ao log do daemon sob o prefixo padrão `<timestamp> [<LEVEL>] [DAEMON] `
   * ; ela NÃO é ecoada no stderr (o que duplicaria a saída do operador).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Caminho absoluto para o arquivo de log do daemon. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Drena appends pendentes. Chamado a partir do handler de shutdown do runQwenServe. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

O `initDaemonLogger` de forma síncrona:

1. Calcula `daemonId` + caminho do log.
2. `mkdirSync(parentDir, { recursive: true })` — falha → retorna logger no-op, escreve um aviso no stderr. O boot continua.
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — escreve `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` de forma síncrona. Isso funciona também como uma sonda de capacidade de escrita; em caso de EACCES/ENOSPC, modo de falha = logger no-op + um aviso no stderr.
4. Atualiza o symlink `latest` (melhor esforço, erros são suprimidos).
5. Retorna o logger; chamadas subsequentes de `info/warn/error/raw` enfileiram `fs.promises.appendFile` assíncrono.

Se `process.env['QWEN_DAEMON_LOG_FILE']` for um dos valores `0|false|off|no`, o `initDaemonLogger` faz um short-circuit para um logger no-op antes de qualquer chamada ao sistema de arquivos.

## 6. Formato da linha de log

Espelha `debugLogger.buildLogLine` para paridade visual:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Timestamp: ISO 8601, UTC.
- Nível: `INFO` | `WARN` | `ERROR`. (Sem DEBUG inicialmente — `QWEN_SERVE_DEBUG` flui como `INFO` via `raw()`.)
- Tag: literal `DAEMON`.
- Contexto de trace: `trace.getActiveSpan()` quando disponível; mesma lógica de `debugLogger.getActiveSpanTraceContext`. Helper extraído para um módulo compartilhado (`packages/core/src/utils/traceContext.ts`?) ou duplicado localmente — deixar para o plano.
- Campos de contexto: renderizados como `key=value`, ordem fixa (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), depois quaisquer chaves extras ordenadas lexicograficamente. Valores contendo espaços em branco ou `=` são encapsulados com aspas via `JSON.stringify`.
- Stack de erro: anexado como linhas de continuação indentadas após a mensagem.
- `raw(line, level)` escreve a linha como está após o prefixo padrão `<timestamp> [<LEVEL>] [DAEMON] `, sem processamento extra.

**Semântica de tee (importante):**

- `info` / `warn` / `error` escrevem **tanto** no arquivo de log do daemon **quanto** no stderr (via o writer de `stderr` injetado). Chamadores que substituem um `writeStderrLine(...)` anterior usam estes diretamente; nenhuma chamada separada de stderr é necessária.
- `raw` escreve **apenas no arquivo**. Usado pelo encaminhador de stderr de filhos ACP e `writeServeDebugLine`, onde o chamador já está escrevendo no stderr através de seu caminho existente. Duplicar inundaria a saída do operador.

## 7. Fluxo de Boot / Shutdown

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // banner de boot é apenas stderr para evitar que a linha referencie a si mesma

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injetado para sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- O banner de boot é apenas stderr (a linha do caminho sobre si mesmo seria circular se logada).
- O `initDaemonLogger` é síncrono para que qualquer falha seja visível imediatamente no boot, não enterrada após o primeiro erro.
- O `flush()` de shutdown é o último passo aguardado antes do `process.exit`. O SIGKILL é não-flushable por definição — aceitamos isso.

## 8. Tabela de cobertura

| Fonte                                                         | Hoje                                         | Depois                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `runQwenServe.ts` ciclo de vida / sinais / avisos de config   | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)` (stderr ainda acontece — `daemonLog` faz tee)                        |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                       | inalterado — scripts do operador fazem parse do stdout                                             |
| `server.ts:sendBridgeError`                                   | `writeStderrLine(...)` com route/sessionId   | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr ainda emitido pelo tee do daemonLog)|
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | tee para `onDiagnosticLine(line, 'info')`                                                          |
| `spawnChannel.ts` stderr de filhos                            | `process.stderr.write(prefix + line + '\n')` | também `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| chamadores de `writeStdoutLine`                               | inalterado                                   | inalterado                                                                                         |
| erros de uso da CLI / argparse (validação inicial do `runQwenServe`) | `writeStderrLine(...)`                  | inalterado (o logger pode não existir ainda)                                                       |
Toda escrita existente no stderr é preservada. O log do daemon é **aditivo**, nunca substitutivo.

## 9. Caminho de Escrita e Flush

- Fila interna: uma única cadeia de `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Cada chamada de `info/warn/error/raw` enfileira um append (arquivo) e, para `info/warn/error`, também chama sincronamente o writer de `stderr` injetado.
- A ordem de escrita no stderr é preservada (síncrona, antes de enfileirar o append). Os appends no arquivo são eventualmente consistentes na ordem de enfileiramento.
- Falhas de escrita definem uma flag interna `degraded` e emitem um aviso único no stderr. Chamadas subsequentes ainda tentam a escrita, mas o contador não é mantido.
- `flush()` retorna a promise atual da cauda.
- Sem camada de buffer: cada chamada = um `appendFile`. O volume é baixo (erros de rota + ciclo de vida); micro-batching é otimização prematura.

## 10. Configuração

| Variável de ambiente                              | Comportamento                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`          | `initDaemonLogger` retorna no-op; tee é no-op; stderr inalterado             |
| `QWEN_DAEMON_LOG_FILE=<qualquer outra coisa>` ou não definido | Habilitado (padrão)                                                          |
| `QWEN_RUNTIME_DIR=<caminho>`                      | Realoca a raiz `~/.qwen`, o log do daemon se move com ela (semântica existente) |
| `QWEN_SERVE_DEBUG=1`                              | Existente — `writeServeDebugLine` é ativado; as linhas agora também fazem tee para o log do daemon |

`QWEN_DAEMON_LOG_FILE` é intencionalmente separado de `QWEN_DEBUG_LOG_FILE` para que a desativação dos logs de debug por sessão não derrube o log do daemon do operador (e vice-versa).

## 11. Tratamento de Erros

- Falha no mkdir/open do `initDaemonLogger` → logger no-op + um aviso no stderr. A inicialização do daemon prossegue. O operador não vê nada no arquivo, mas ainda recebe o stderr.
- Falhas por append → altera a flag degraded, emite um aviso no stderr, continua tentando. A issue não menciona nenhum sinal de UI para o modo degradado, então nenhuma superfície pública é necessária.
- Rejeição do `flush()` → capturada no handler de shutdown, logada via `writeStderrLine`. Não bloqueia a saída.
- Falha no symlink `latest` → suprimida; escritas principais não afetadas.

## 12. Testes

### `daemonLogger.test.ts` (novo)

- `baseDir` em sandbox, `now`, `pid`, `stderr` mockados.
- Derivação de path e daemon-id, incluindo o `workspaceHash` de 8 caracteres para entrada conhecida.
- Symlink `latest` criado e atualizado em invocações subsequentes do `initDaemonLogger` no mesmo diretório.
- Formatação de nível (INFO/WARN/ERROR), ordem dos campos de contexto, continuação do stack de erro.
- Injeção de contexto de trace quando existe um span ativo.
- `raw(line, level)` escreve a linha prefixada literalmente.
- `flush()` resolve apenas depois que todas as escritas enfileiradas atingem o arquivo.
- `QWEN_DAEMON_LOG_FILE=0` → nenhum arquivo criado.
- Falha no `mkdir` → logger no-op, um aviso no stderr, chamadas subsequentes não lançam exceção.
- Falha no `appendFile` → flag degraded alterada, um aviso no stderr.

### `runQwenServe.test.ts` (estender)

- A inicialização escreve a linha `daemon started ...` no log.
- O handler de shutdown aguarda `daemonLog.flush()` antes de sair.
- O banner de inicialização no stderr contém o caminho do log do daemon.

### `server.test.ts` (estender)

- Uma rota que lança exceção direciona o erro através de `daemonLog.error(...)` com a `route` e `sessionId` corretas.

### Testes de acp-bridge (estender)

- Callback `onDiagnosticLine` invocado a partir de `writeServeDebugLine` quando `QWEN_SERVE_DEBUG=1` e a partir do forwarder de stderr do filho de `spawnChannel`. Os testes injetam um fake de captura; sem sistema de arquivos.

## 13. Documentação

- `docs/cli/serve.md` (ou onde quer que o serve seja documentado) ganha uma seção "Daemon log file" cobrindo: caminho, formato do daemon-id, symlink `latest`, opt-out do `QWEN_DAEMON_LOG_FILE`, distinção do `debug/<sessionId>.txt` por sessão.
- README em `packages/cli/src/serve/`, se existir.
- Não há arquivo no estilo CHANGELOG neste repositório; as notas de lançamento são tratadas separadamente.

## 14. Rollback

- Mudança puramente aditiva. Rollback = reverter o commit:
  - Deletar `daemonLogger.ts` + seu teste.
  - Reverter alterações de ciclo de vida / sendBridgeError / bridge / spawnChannel em `runQwenServe.ts`.
  - Remover `onDiagnosticLine` de `BridgeOptions`.
- Nenhum estado em disco para limpar; os arquivos de log do daemon existentes ficam órfãos, mas são inofensivos.

## 15. Critérios de Aceitação (da issue)

| Critério                                                            | Como é atendido                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `qwen serve` cria / faz append no log do daemon sem redirecionamento de shell | `initDaemonLogger` abre o arquivo na inicialização                                                |
| HTTP 500 de `POST /session/:id/prompt` correlacionável no log do daemon | `sendBridgeError` escreve `route=` + `sessionId=`                                                 |
| Linhas de stderr do filho ACP também no log do daemon               | `spawnChannel` faz tee através de `onDiagnosticLine`                                              |
| O log funciona antes da primeira sessão e após o fechamento de todas as sessões | Não é escopo de sessão; vive durante o tempo de vida do daemon                                    |
| Comportamento existente do stderr intacto                           | Todas as escritas são aditivas; nenhuma chamada de `writeStderrLine` é removida sem que um equivalente seja mantido |
| Caminho do log + opt-out documentados                               | Seção de documentação em §13                                                                      |

## 16. Questões em Aberto

Nenhuma bloqueante. Possíveis follow-ups:

- O symlink `latest` deve ir para `~/.qwen/debug/daemon/latest` ou `~/.qwen/debug/daemon-latest`? A especificação escolhe o primeiro para manter o diretório organizado.
- Devemos oferecer saída em JSON-line como uma flag futura (ex.: `QWEN_DAEMON_LOG_FORMAT=json`)? Fora do escopo deste PR; a exportação estruturada é o que a #2014 contempla.