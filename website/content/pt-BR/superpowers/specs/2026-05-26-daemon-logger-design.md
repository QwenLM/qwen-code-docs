# `qwen serve` Logger de Arquivo do Daemon — Design

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branch**: `feat/support_daemon_logger`
- **Status**: design aprovado, aguardando plano de implementação
- **Data**: 2026-05-26

## 1. Problema

`qwen serve` emite diagnósticos de nível do daemon (ciclo de vida, erros de rota, stderr do filho ACP) para `process.stderr`. Isso funciona bem sob systemd/Docker, mas é frágil para uso via SDK / Desktop / daemon local: quando um cliente recebe `POST /session/:id/prompt` retornando HTTP 500, o contexto da rota + sessão + stack se perde a menos que o operador tenha redirecionado manualmente o stderr.

`createDebugLogger` (em `packages/core/src/utils/debugLogger.ts`) tem escopo de sessão: exige um `DebugLogSession` ativo e escreve em `${runtimeBaseDir}/debug/<sessionId>.txt`. O daemon do serve inicia **antes** de qualquer sessão existir, então chamadas em nível de daemon seriam silenciosamente ignoradas. Também não pode ser reutilizado sem alterar a semântica de `debug/latest` por sessão.

Este design adiciona um sink de arquivo específico do daemon, adicional ao comportamento existente do stderr, para que os diagnósticos do daemon sobrevivam sem redirecionamento de shell.

## 2. Escopo

### Dentro do escopo

- Um novo logger inicializado uma vez por processo `runQwenServe`.
- Arquivo em `${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/<daemon-id>.log`, modo append.
- Tee de:
  - Mensagens de ciclo de vida / desligamento / sinal de `runQwenServe.ts`
  - `sendBridgeError` (`server.ts`) erros de rota
  - `bridge.ts` `writeServeDebugLine` (quando `QWEN_SERVE_DEBUG` está definido)
  - `spawnChannel.ts` encaminhamento de stderr do filho ACP
- Opt-out via `QWEN_DAEMON_LOG_FILE=0|false|off|no`.
- Symlink `latest` no diretório do daemon para `tail -f`.
- Documentação na CLI do serve.

### Fora do escopo (não objetivos do issue)

- Substituir OpenTelemetry ou adicionar tracing do daemon.
- Exportação estruturada de logs de erro empresarial (issue #2014).
- Rotação ou exclusão de logs de sessão existentes.
- Rotação / limite de tamanho para o log do daemon (adiado para um PR subsequente). Um aviso no stderr na inicialização é emitido se o arquivo existente estiver excepcionalmente grande; nenhuma ação automática.

## 3. Arquitetura

### 3.1 Fronteiras dos módulos

| Camada                                                   | Novo / Alterado | Responsabilidade                                                                                                                                |
| -------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                 | **novo**        | Sink: init, formatar, anexar ao arquivo, tee para stderr, flush, symlink latest                                                                 |
| `packages/cli/src/serve/runQwenServe.ts`                 | alterado        | Inicializar logger na inicialização; substituir `writeStderrLine` do ciclo de vida por `daemonLog.*`; `await flush()` no desligamento; passar `onDiagnosticLine` para a bridge |
| `packages/cli/src/serve/server.ts`                       | alterado        | `sendBridgeError(...)` roteia através de `daemonLog.error(...)`                                                                                 |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)    | alterado        | Adicionar `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` opcional                                                 |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | alterado        | Se `onDiagnosticLine` injetado, fazer tee da mesma linha                                                                                       |
| `packages/acp-bridge/src/spawnChannel.ts`               | alterado        | Encaminhador de stderr do filho faz tee de cada linha prefixada em `onDiagnosticLine`                                                           |

**Intenção do design**: `daemonLogger.ts` é um único arquivo, local ao CLI, sem singleton global. `acp-bridge` permanece ignorante do CLI — ele vê apenas um callback. Grafo de dependências inalterado.

### 3.2 Sem singleton global

Logger é criado em `runQwenServe`, passado por closure para os módulos internos do serve que precisam dele (ou por callback para `acp-bridge`). Justificativa:

- Espelha como `BridgeOptions` já injeta dependências.
- Evita vazamentos de estado entre testes que `debugLogger` já sofreu (`resetDebugLoggingState()` existe por esse motivo).

## 4. ID do Daemon & Caminho do Arquivo

- Caminho: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - Resolve para `${QWEN_RUNTIME_DIR ou ~/.qwen}/debug/daemon/<daemon-id>.log`.
  - Reutiliza `Storage.getGlobalDebugDir()` para que a substituição do diretório runtime (env var, contextual) seja aplicada automaticamente.
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` desambigua múltiplos daemons no mesmo workspace.
  - `workspaceHash` tem comprimento fixo, seguro para nomes de arquivo e estável para o mesmo caminho de workspace.
- Symlink `latest`: `~/.qwen/debug/daemon/latest` → arquivo de log do processo atual. Atualizado na inicialização usando o helper `updateSymlink` existente (`packages/core/src/utils/symlink.ts`). Falha no symlink é registrada e ignorada — não degrada as escritas principais. Distinto de `${runtimeBaseDir}/debug/latest` (escopo de sessão) conforme não objetivo.
- Modo de arquivo: `'a'` (append com `O_APPEND | O_CREAT`). Arquivos existentes sobrevivem a reinicializações para análise forense.

## 5. API Pública

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
   * Tanto `err` quanto `ctx` são opcionais e independentes.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * Tee somente arquivo para linhas cujo chamador já está escrevendo no stderr
   * (encaminhador de stderr do filho ACP, `writeServeDebugLine`). A linha é
   * anexada ao log do daemon sob o prefixo padrão `<timestamp> [<LEVEL>] [DAEMON] `;
   * NÃO é ecoada para o stderr (o que duplicaria a saída do operador).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Caminho absoluto para o arquivo de log do daemon. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Drena anexos pendentes. Chamado a partir do handler de desligamento do runQwenServe. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // padrão process.pid
  now?: () => Date; // padrão () => new Date()
  stderr?: (line: string) => void; // padrão writeStderrLine
  baseDir?: string; // padrão Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` sincronamente:

1. Calcula `daemonId` + caminho do log.
2. `mkdirSync(parentDir, { recursive: true })` — falha → retorna logger no-op, escreve um aviso no stderr. Inicialização continua.
3. `appendFileSync(path, '<primeira linha>\n', { flag: 'a' })` — escreve `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` sincronamente. Isso também serve como sonda de gravabilidade; em EACCES/ENOSPC, modo falha = logger no-op + um aviso no stderr.
4. Atualiza symlink `latest` (melhor esforço, erros engolidos).
5. Retorna logger; chamadas subsequentes de `info/warn/error/raw` enfileiram `fs.promises.appendFile` assíncrono.

Se `process.env['QWEN_DAEMON_LOG_FILE']` for um de `0|false|off|no`, `initDaemonLogger` interrompe precocemente para um logger no-op antes de qualquer chamada ao sistema de arquivos.

## 6. Formato da Linha de Log

Espelha `debugLogger.buildLogLine` para paridade visual:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- Timestamp: ISO 8601, UTC.
- Nível: `INFO` | `WARN` | `ERROR`. (Sem DEBUG inicialmente — `QWEN_SERVE_DEBUG` entra como `INFO` via `raw()`.)
- Tag: literal `DAEMON`.
- Contexto de trace: `trace.getActiveSpan()` quando disponível; mesma lógica que `debugLogger.getActiveSpanTraceContext`. Helper extraído para um módulo compartilhado (`packages/core/src/utils/traceContext.ts`?) ou duplicado localmente — deixar para o plano.
- Campos de contexto: renderizados como `key=value`, ordem fixa (`route`, `sessionId`, `clientId`, `childPid`, `channelId`), depois chaves extras ordenadas lexicograficamente. Valores contendo espaços em branco ou `=` são citados com `JSON.stringify`.
- Stack de erro: anexado como linhas de continuação indentadas após a mensagem.
- `raw(line, level)` escreve a linha como está após o prefixo padrão `<timestamp> [<LEVEL>] [DAEMON] `, sem processamento extra.

**Semântica do tee (importante):**

- `info` / `warn` / `error` escrevem **tanto** no arquivo de log do daemon **quanto** no stderr (através do escritor `stderr` injetado). Chamadores que substituem um `writeStderrLine(...)` anterior usam estes diretamente; nenhuma chamada separada ao stderr é necessária.
- `raw` escreve **apenas no arquivo**. Usado pelo encaminhador de stderr do filho ACP e `writeServeDebugLine`, onde o chamador já está escrevendo no stderr através de seu caminho existente. Duplicação inundaria a saída do operador.

## 7. Fluxo de Inicialização / Desligamento

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // banner de inicialização é apenas stderr para evitar que a linha referencie a si mesma

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

- Banner de inicialização é apenas stderr (a linha sobre seu próprio caminho seria circular se registrada).
- `initDaemonLogger` é síncrono para que qualquer falha seja visível imediatamente na inicialização, não enterrada após o primeiro erro.
- `flush()` do desligamento é a última etapa aguardada antes de `process.exit`. SIGKILL é não lavável por definição — aceitamos isso.

## 8. Tabela de Cobertura

| Fonte                                                         | Hoje                                          | Após                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` ciclo de vida / sinais / avisos de config   | `writeStderrLine(...)`                        | `daemonLog.info \| warn(...)` (stderr ainda acontece — `daemonLog` faz tee)                      |
| `runQwenServe.ts` "listening on URL" (stdout)                 | `writeStdoutLine(...)`                        | inalterado — scripts do operador fazem parse do stdout                                          |
| `server.ts:sendBridgeError`                                   | `writeStderrLine(...)` com route/sessionId    | `daemonLog.error(msg, err, { route, sessionId, ... })` (stderr ainda emitido pelo tee do daemonLog) |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | tee para `onDiagnosticLine(line, 'info')`                                                         |
| `spawnChannel.ts` stderr do filho                             | `process.stderr.write(prefix + line + '\n')` | também `onDiagnosticLine(prefix + line, 'warn')`                                                   |
| Chamadores de `writeStdoutLine`                               | inalterado                                    | inalterado                                                                                        |
| Erros de uso / argparse do CLI (validação inicial de `runQwenServe`) | `writeStderrLine(...)`                        | inalterado (logger pode não existir ainda)                                                        |

Toda escrita existente no stderr é preservada. O log do daemon é **aditivo**, nunca substitutivo.

## 9. Caminho de Escrita e Flush

- Fila interna: uma única cadeia `Promise<void>` (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`).
- Cada chamada de `info/warn/error/raw` enfileira um append (arquivo) e, para `info/warn/error`, também chama sincronamente o escritor `stderr` injetado.
- A ordem de escrita no stderr é preservada (síncrona, antes de enfileirar o append). Appends de arquivo são eventualmente consistentes na ordem de enfileiramento.
- Falhas de escrita definem um flag interno `degraded` e emitem um aviso único no stderr. Chamadas subsequentes ainda tentam a escrita, mas o contador não é mantido.
- `flush()` retorna a promise atual da cauda.
- Sem camada de buffer: cada chamada = um `appendFile`. Volume é baixo (erros de rota + ciclo de vida); micro-batching é otimização prematura.

## 10. Configuração

| Env var                                         | Comportamento                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`         | `initDaemonLogger` retorna no-op; tee é no-op; stderr inalterado               |
| `QWEN_DAEMON_LOG_FILE=<qualquer outra coisa>` ou não definido | Habilitado (padrão)                                              |
| `QWEN_RUNTIME_DIR=<caminho>`                     | Reloca raiz `~/.qwen`, log do daemon se move junto (semântica existente)       |
| `QWEN_SERVE_DEBUG=1`                            | Existente — `writeServeDebugLine` ativa; linhas agora também fazem tee no log do daemon |

`QWEN_DAEMON_LOG_FILE` é intencionalmente separado de `QWEN_DEBUG_LOG_FILE` para que desabilitar logs de debug por sessão não desative o log do daemon do operador (e vice-versa).

## 11. Tratamento de Erros

- Falha em mkdir/open do `initDaemonLogger` → logger no-op + um aviso no stderr. Inicialização do daemon prossegue. Operador não vê nada no arquivo, mas ainda recebe stderr.
- Falhas por append → alterna flag degradado, emite um aviso no stderr, continua tentando. Issue não menciona sinal de UI para modo degradado, portanto nenhuma superfície pública necessária.
- Rejeição de `flush()` → capturada no handler de desligamento, registrada via `writeStderrLine`. Não bloqueia a saída.
- Falha do symlink `latest` → engolida; escritas principais não afetadas.

## 12. Testes

### `daemonLogger.test.ts` (novo)

- `baseDir` isolado (sandbox), `now`, `pid`, `stderr` mockados.
- Derivação de caminho e daemon-id incluindo o `workspaceHash` de 8 caracteres para entrada conhecida.
- Symlink `latest` criado e atualizado em invocações subsequentes de `initDaemonLogger` no mesmo diretório.
- Formatação de nível (INFO/WARN/ERROR), ordem dos campos de contexto, continuação do stack de erro.
- Injeção de contexto de trace quando existe um span ativo.
- `raw(line, level)` escreve a linha prefixada literalmente.
- `flush()` resolve apenas depois que todas as escritas enfileiradas atingem o arquivo.
- `QWEN_DAEMON_LOG_FILE=0` → nenhum arquivo criado.
- Falha em `mkdir` → logger no-op, um aviso no stderr, chamadas subsequentes não lançam exceção.
- Falha em `appendFile` → flag degradado alternado, um aviso no stderr.

### `runQwenServe.test.ts` (extensão)

- Inicialização escreve linha `daemon started ...` no log.
- Handler de desligamento aguarda `daemonLog.flush()` antes de sair.
- Banner de inicialização no stderr contém o caminho do log do daemon.

### `server.test.ts` (extensão)

- Uma rota que lança erro roteia o erro através de `daemonLog.error(...)` com os valores corretos de `route` e `sessionId`.

### Testes do acp-bridge (extensão)

- Callback `onDiagnosticLine` invocado a partir de `writeServeDebugLine` quando `QWEN_SERVE_DEBUG=1` e a partir do encaminhador de stderr do filho `spawnChannel`. Testes injetam um fake de captura; sem sistema de arquivos.

## 13. Documentação

- `docs/cli/serve.md` (ou onde o serve é documentado) ganha uma seção "Arquivo de log do daemon" cobrindo: caminho, formato do daemon-id, symlink `latest`, opt-out via `QWEN_DAEMON_LOG_FILE`, distinção de `debug/<sessionId>.txt` por sessão.
- README sob `packages/cli/src/serve/` se existir.
- Nenhum arquivo estilo CHANGELOG neste repositório; notas de versão são tratadas separadamente.

## 14. Rollback

- Mudança puramente aditiva. Rollback = reverter o commit:
  - Excluir `daemonLogger.ts` + seu teste.
  - Reverter alterações de ciclo de vida / sendBridgeError / bridge / spawnChannel em `runQwenServe.ts`.
  - Remover `onDiagnosticLine` de `BridgeOptions`.
- Nenhum estado em disco para limpar; arquivos de log do daemon existentes tornam-se órfãos, mas inofensivos.

## 15. Critérios de Aceitação (do issue)

| Critério                                                          | Como é atendido                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `qwen serve` cria / anexa log do daemon sem redirecionamento de shell | `initDaemonLogger` abre o arquivo na inicialização                                                |
| HTTP 500 de `POST /session/:id/prompt` correlacionável no log do daemon | `sendBridgeError` escreve `route=` + `sessionId=`                                                |
| Linhas de stderr do filho ACP também no log do daemon             | `spawnChannel` faz tee através de `onDiagnosticLine`                                             |
| Logging funciona antes da primeira sessão e depois que todas as sessões são fechadas | Não tem escopo de sessão; vive pela vida do daemon                                               |
| Comportamento existente do stderr intacto                         | Todas as escritas são aditivas; nenhuma chamada `writeStderrLine` é removida sem um equivalente deixado no lugar |
| Caminho do log + opt-out documentados                             | Seção de docs em §13                                                                              |

## 16. Perguntas em Aberto

Nenhuma bloqueante. Possíveis continuidades:

- O symlink `latest` deve ficar em `~/.qwen/debug/daemon/latest` ou `~/.qwen/debug/daemon-latest`? A especificação escolhe o primeiro para organização do diretório.
- Devemos oferecer saída em linhas JSON como uma flag futura (ex.: `QWEN_DAEMON_LOG_FORMAT=json`)? Fora do escopo deste PR; exportação estruturada é o que #2014 cobre.