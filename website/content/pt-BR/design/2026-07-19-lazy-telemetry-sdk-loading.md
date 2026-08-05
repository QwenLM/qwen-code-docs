# Carregamento lazy do SDK do OpenTelemetry fora do caminho de inicialização do filho ACP

- **Issue**: #4748 (Otimizar o cold start do daemon e a latência do fast-path do qwen serve)
- **Status**: implementado
- **Data**: 2026-07-19
- **Depende de**: #7182 (remoção de módulos da TUI), auditoria do metafile abaixo

## Problema

`channel.initialize` (~1035ms P50 em 2C4G) é o custo dominante da primeira
Session fria do daemon, e ~67% disso é carregamento de módulos no filho ACP.
Uma auditoria do metafile do bundle pós-#7182 (commit `de962a5ecf`, metafile do
esbuild com `DEV=true`) mostra que a closure estática eager do filho ACP é de
**17,24 MiB / 2420 módulos**, dos quais o cluster OpenTelemetry é o maior bloco
coerente individual:

| grupo                                                                  | bytes (pós-tree-shake) |
| ---------------------------------------------------------------------- | ---------------------- |
| `@grpc/grpc-js`                                                        | 577 KiB                |
| `@opentelemetry/otlp-transformer`                                      | 479 KiB                |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 KiB                |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | ~260 KiB               |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | ~132 KiB               |
| `@opentelemetry/*` restante (exporters, propagators, resources, …)     | ~250 KiB               |
| **total do cluster de telemetria**                                     | **2,16 MiB**           |

Cada byte disso é avaliado na inicialização do filho ACP, mesmo que:

1. A telemetria esteja **desabilitada por padrão** — o caso comum paga o
   imposto completo de módulos por código que `initializeTelemetry()` então se
   recusa a executar (early-return `!config.getTelemetryEnabled()` em
   `sdk.ts:202`).
2. Mesmo quando habilitada, nada precisa do SDK antes do primeiro
   span/log/métrica, o que é sempre depois que o `initialize` recebeu ACK.

Para calibração: o #7182 removeu 1,16 MiB e cortou o tempo de import do ACP de
115→52ms (-63ms). Este cluster tem quase 2× esse tamanho, então um efeito na
mesma ordem é plausível — sujeito ao gate de medição da issue (abaixo).

## Por que a cadeia de import é eager

`sdk.ts` importa estaticamente tudo no nível superior (`sdk.ts:13-32`): seis
exporters OTLP (gRPC + HTTP × traces/logs/metrics), `NodeSDK`, processadores em
lote, `PeriodicExportingMetricReader` e ambas as instrumentations. O próprio
`sdk.ts` é alcançado estaticamente a partir do barrel do core via
`telemetry/index.ts`, e não pode ser tornado totalmente lazy porque dois módulos
de caminho quente dependem estaticamente do seu getter de estado barato:

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()` (faz o gate de todo
  log)
- `telemetry/session-tracing.ts:31` → o mesmo (faz o gate de todo helper de
  span)

Então a divisão deve separar a **fachada de estado barata** da **montagem
pesada do SDK**, não apenas envolver seis imports de exporters em
`await import()` — os imports de `NodeSDK` / instrumentation / sdk-metrics
(~0,7 MiB) são igualmente removíveis e vivem no mesmo arquivo.

## Design

### Divisão de arquivos dentro de `packages/core/src/telemetry/`

**`sdk.ts` (permanece; torna-se a fachada — sem imports pesados).** Mantém, sem
alteração de nome e semântica, tudo que outros módulos alcançam estaticamente:

- estado do módulo: `sdk`, `telemetryInitialized`, `telemetryShutdownPromise`,
  `activeMetricReader` (tipado via `import type` para que não haja carregamento
  em runtime)
- `isTelemetrySdkInitialized()`, `refreshSessionContext()`,
  `shutdownTelemetry()`, `forceFlushMetrics()`
- `resolveHttpOtlpUrl()` (exportado, puro; sem dependências pesadas)
- o efeito colateral `diag.setLogger(...)` (precisa apenas de
  `@opentelemetry/api`, que já é ubíquo e barato — 56 KiB, também usado por
  `loggers.ts`/`metrics.ts`)

Seu único import em runtime de `@opentelemetry/*` é `@opentelemetry/api`.

**`sdk-impl.ts` (novo; a metade pesada).** Recebe integralmente: os imports dos
seis exporters OTLP, `NodeSDK`, `BatchSpanProcessor`, `BatchLogRecordProcessor`,
`PeriodicExportingMetricReader`, ambas as instrumentations,
`CompressionAlgorithm`, `resourceFromAttributes`, `SessionIdSpanProcessor`,
`parseOtlpEndpoint`, `validateUrl`, `normalizeOtlpPrefix` + correspondência de
prefixo, o gate de propagator e o corpo do `initializeTelemetry()` atual a
partir da construção do resource. Ele exporta uma função:

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

retornando `undefined` no caminho de pulo existente de "gRPC sem endpoint base".
`file-exporters.ts` e `log-to-span-processor.ts` também se movem para trás de
`sdk-impl.ts` (eles são importados apenas pelo `sdk.ts` hoje, e puxam
`sdk-logs`/`sdk-metrics`/`sdk-trace-base`).

### `initializeTelemetry` torna-se async

Na fachada:

```ts
let telemetryInitPromise: Promise<void> | undefined;

export function initializeTelemetry(
  config: TelemetryRuntimeConfig,
): Promise<void> {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return Promise.resolve();
  }
  telemetryInitPromise ??= (async () => {
    const { startTelemetrySdk } = await import('./sdk-impl.js');
    const started = startTelemetrySdk(config);
    if (!started) return;
    sdk = started.sdk;
    // sdk.start() + telemetryInitialized = true + setSessionContext +
    // setShellTracePropagation + initializeMetrics — mesma ordem de hoje,
    // mesmo try/catch que apenas registra log.
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

Propriedades-chave:

- **O caminho desabilitado permanece síncrono e gratuito** — a verificação
  `getTelemetryEnabled()` roda antes do import dinâmico, então usuários com
  configuração padrão nunca carregam o cluster de 2,16 MiB. Esta é a vitória
  real para o filho ACP.
- O guarda single-flight (`telemetryInitPromise`) mantém a função idempotente
  sob chamadores concorrentes, correspondendo à reverificação atual de
  `telemetryInitialized`.
- `shutdownTelemetry()` não precisa de mudanças: opera sobre a variável `sdk`
  da fachada e já é um no-op quando `!telemetryInitialized`.

### Tratamento dos pontos de chamada (todos os três chamadores de produção)

1. **`packages/core/src/config/config.ts:2192`** (construtor do Config —
   contexto síncrono; este é o caminho que o filho ACP percorre, já que
   `deferTelemetryInitialization` é false no modo ACP, ver
   `packages/cli/src/config/config.ts:2075`). Fire-and-forget com catch
   registrado em log:

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   Análise de risco: a única consequência de um início tardio é que
   spans/logs emitidos na lacuna são descartados pelos gates de
   `isTelemetrySdkInitialized()` — o que _já_ é o comportamento para toda a
   janela pré-construtor e para o caminho da TUI interativa, onde a
   inicialização da telemetria é adiada para uma tarefa em segundo plano
   (`startup-prefetch.ts:259`). Nenhum novo modo de falha.

   Mudança de comportamento (intencional, documentada): nos caminhos não
   adiados — o filho ACP e execuções headless `-p`, onde
   `deferTelemetryInitialization` é false — a telemetria estava anteriormente
   totalmente registrada no momento em que a chamada síncrona de
   `initializeTelemetry` retornava; agora ela se liquida assincronamente, então
   a janela de descarte existente se amplia pelo custo do import dinâmico
   (~50–150ms). _Não_ fazemos `await` aqui de propósito: aguardar colocaria o
   import de 2,16 MiB de volta no caminho crítico do filho ACP e desfaria a
   vitória. Chamadores que precisam da telemetria garantidamente pronta antes
   de prosseguir (o runtime do daemon, chamador 3) fazem `await` explicitamente.

2. **`packages/cli/src/startup/startup-prefetch.ts:261`** (executor de tarefas
   adiadas). Alterar o closure da tarefa para retornar a promise
   (`() => initializeTelemetry(config)`) para que o tratamento de erro
   existente de `runDeferredTask` observe rejeições. Semântica inalterada fora
   isso.

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`** (runtime do daemon).
   **Deve fazer `await`.** A linha seguinte chama
   `initializeDaemonMetrics()`, e o `metrics.getMeter()` do OTel armazena em
   cache um meter noop permanentemente se chamado antes que o SDK registre o
   MeterProvider global — as métricas do daemon morreriam silenciosamente. A
   função envolvente já é async, então `await core.initializeTelemetry(...)` é
   uma mudança de uma palavra. Isso adiciona o custo de carregamento de módulos
   ao carregamento do _runtime do daemon_ (adiado, fora do fast path) apenas
   quando a telemetria está habilitada — aceitável, e estritamente melhor do
   que pagá-lo em cada filho ACP.

   O mesmo risco de ordenação existe em princípio para `initializeMetrics()`
   (`metrics.ts:409`), mas ele é chamado _dentro_ da promise de inicialização
   após `sdk.start()`, então a ordenação é preservada por construção.

### Extensão do guarda de bundle

Estender a verificação de limite do ACP em
`scripts/check-serve-fast-path-bundle.js`
(`findAcpImportBoundaryOffenders`) com uma blacklist de telemetria para que a
divisão não possa regredir silenciosamente:

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

(`@opentelemetry/api`, `semantic-conventions`, `core`, `resources`, `api-logs`
ficam fora da blacklist — eles são legitimamente alcançáveis a partir de
`loggers.ts`, `metrics.ts` e exports em nível de tipo.)

## O que isto NÃO muda

- Nenhuma mudança de comportamento quando a telemetria está habilitada — mesmos
  exporters, mesmos processadores, mesmos hooks de instrumentation, mesma
  semântica de shutdown/flush.
- Nenhuma remoção de API pública: o tipo de retorno de `initializeTelemetry`
  muda de `void → Promise<void>`, o que é compatível em nível de fonte para
  chamadores fire-and-forget existentes (todos os pontos de chamada são
  atualizados no mesmo commit de qualquer forma; esta é uma mudança do pacote
  core, feita pelo maintainer conforme o AGENTS.md).
- Os exports do barrel `telemetry/index.ts` mantêm os mesmos nomes.

## Aceitação (gate de medição da issue #4748)

Contagens de bytes não se convertem em milissegundos; a mudança deve passar a
disciplina permanente da issue antes de ser mesclada:

1. **2C4G, 30 cold starts seriais**, telemetria desabilitada (configuração
   padrão): comparar o P50/P95 de `channel.initialize` e o P50 de
   processo→primeira Session contra a baseline `de962a5ecf`. Lançar apenas se o
   P50 melhorar além do ruído entre execuções.
2. **Passe funcional com telemetria habilitada**: alvos OTLP gRPC e HTTP
   recebem, cada um, traces/logs/métricas após a mudança (matriz existente de
   `sdk.test.ts`, mais um teste manual ponta a ponta contra um coletor local);
   os file exporters de `--telemetry-outfile` ainda escrevem.
3. **Métricas do daemon**: com telemetria habilitada, o anel de métricas de
   Status do daemon e os gauges de `initializeDaemonMetrics()` ainda reportam
   (protege o await no ponto de chamada 3).
4. **Guarda de bundle**: `node scripts/check-serve-fast-path-bundle.js` verde
   com a blacklist estendida; reexecutar a auditoria de closure
   (`.qwen/scripts/acp-closure-audit.mjs`) e registrar o novo total da closure
   do ACP (esperado ≈ 17,24 − ~2,0 MiB, menos o que `@opentelemetry/api` e
   companhia mantêm eager).
5. **Testes unitários**: `sdk.test.ts` aguarda `initializeTelemetry` (15 pontos
   de chamada); testes que afirmam a construção de exporters se movem para
   `sdk-impl.ts` ou o mockam.

## Alternativas consideradas

- **Importar lazy apenas as seis classes de exporter, manter
  `initializeTelemetry` síncrono.** Rejeitado: deixa ~0,7 MiB (`NodeSDK`,
  instrumentations, `sdk-metrics`, processadores em lote) eager sem motivo, e
  ainda força o limite assíncrono em algum lugar — o caminho habilitado
  constrói exporters incondicionalmente, então a função vira async de qualquer
  maneira.
- **Tornar todo o módulo `telemetry/sdk.ts` dinâmico.** Rejeitado:
  `loggers.ts` e `session-tracing.ts` fazem o gate de toda chamada de
  telemetria com `isTelemetrySdkInitialized()`; tornar esse gate assíncrono
  contaminaria dezenas de pontos de chamada síncronos quentes.
- **Pular a telemetria inteiramente no filho ACP.** Já rejeitado na issue
  (pulos generalizados mudam o comportamento observável para usuários que
  habilitam a telemetria).
