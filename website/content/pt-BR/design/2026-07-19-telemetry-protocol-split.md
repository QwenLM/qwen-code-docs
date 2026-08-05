# Divisão de protocolo dos exporters de telemetria (fase 2 do SDK lazy)

- Status: implementado
- Issue: QwenLM/qwen-code#7264 (candidato 1), acompanhamento do #4748
- Predecessor: `2026-07-19-lazy-telemetry-sdk-loading.md` (divisão fachada / impl)

## Problema

A fase 1 moveu todo o SDK de telemetria para trás de um `import()` dinâmico, de
modo que processos com telemetria desligada não carregam nada. Mas processos
com telemetria **ligada** ainda carregam a closure estática completa do
`sdk-impl.ts`, que empacota ambas as cadeias de protocolo OTLP independentemente
de qual a configuração seleciona:

| Cluster                                                                                                              | Tamanho (metafile, de962a5ecf + fase 1) | Necessário para                       |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| cadeia gRPC (`@grpc/grpc-js`, `protobufjs`, `@grpc/proto-loader`, `exporter-*-otlp-grpc`, `long`, `lodash.camelcase`) | 1121 KiB / 125 módulos                  | apenas `otlpProtocol: 'grpc'`         |
| cadeia HTTP (`exporter-*-otlp-http`)                                                                                  | 23 KiB / 17 módulos                     | apenas `otlpProtocol: 'http'`         |
| camada OTLP compartilhada (`otlp-transformer`, `otlp-exporter-base`)                                                  | 915 KiB / 41 módulos                    | ambos os protocolos OTLP, **não** outfile |

O metafile mostra dois importadores estáticos da superfície OTLP fora dos
próprios pacotes de exporter:

1. `sdk-impl.ts` (seu import de `CompressionAlgorithm`) — removido movendo a
   construção de exporters para dentro dos módulos de protocolo.
2. O próprio `@opentelemetry/sdk-node` — seus `utils.js`/`sdk.js` fazem
   `require()` eager de todo pacote de exporter (otlp proto/http/grpc × 3
   sinais, zipkin, prometheus) para suportar autoconfiguração baseada em
   ambiente `OTEL_*_EXPORTER`. O qwen-code nunca alcança esses caminhos de
   código: ele sempre passa `spanProcessors` / `logRecordProcessors` explícitos
   (um array vazio ainda assim faz short-circuit do fallback de ambiente).
   Tratado com um stub em tempo de bundle, ver abaixo.

Com ambos cortados, a divisão remove toda a superfície OTLP do caminho outfile,
a cadeia gRPC do caminho HTTP e a cadeia HTTP do caminho gRPC.

O benchmark 2C4G da fase 1 mostrou por que isso importa: com telemetria ligada
(outfile), o carregamento dinâmico do sdk-impl compete por CPU com a preparação
da sessão em 2 núcleos (`config_construction`/`bootstrap` +50 ms), consumindo a
maior parte da vitória de −50 ms da cadeia de import. Reduzir o que realmente
carrega reduz essa contenção.

## Design

Dois novos módulos são donos da construção de exporters, carregados via
`import()` dinâmico a partir de `startTelemetrySdk` apenas no seu respectivo
ramo de configuração:

- `packages/core/src/telemetry/sdk-exporters-grpc.ts`
  - Importa os três exporters gRPC + `CompressionAlgorithm` +
    `PeriodicExportingMetricReader`.
  - `createGrpcExporters(endpoint)` → `{ spanExporter, logExporter, metricReader }`,
    todos com compressão gzip, correspondendo exatamente à construção atual.
- `packages/core/src/telemetry/sdk-exporters-http.ts`
  - Importa os três exporters HTTP + `PeriodicExportingMetricReader` +
    `LogToSpanProcessor`.
  - `createHttpExporters({ tracesUrl, logsUrl, metricsUrl, logToSpan })` →
    `{ spanExporter?, logExporter?, metricReader?, logToSpanProcessor? }`.
    A decisão da bridge logs→spans (endpoint de logs ausente, traces presente)
    se move para cá junto com ela, já que a bridge constrói um exporter de
    trace HTTP.

Mudanças em `sdk-impl.ts`:

- Remove todos os seis imports de exporter e `CompressionAlgorithm`; as
  variáveis de exporter são tipadas contra as interfaces do SDK (`SpanExporter`,
  `LogRecordExporter`) das quais ele já depende.
- `startTelemetrySdk` torna-se `async`. A ordem dos ramos é preservada:
  - gRPC sem endpoint base ainda retorna `undefined` **antes** que qualquer
    módulo de protocolo seja carregado.
  - A validação de URL HTTP (`validateUrl`) permanece em `sdk-impl.ts`; o
    módulo HTTP só é importado quando pelo menos uma URL de sinal sobrevive à
    validação.
  - O ramo outfile não toca nenhum módulo de protocolo.
- A fachada aguarda `startTelemetrySdk` (ela já roda dentro do closure async
  single-flight, então nenhuma mudança visível ao chamador).

`esbuild.config.js` ganha `sdkNodeExporterStubPlugin`: quando — e somente
quando — o importador é `@opentelemetry/sdk-node`, os pacotes de exporter se
resolvem para um stub cujos construtores lançam erro. Nossos módulos de
protocolo continuam resolvendo os pacotes reais. O sdk-node só toca esses
bindings dentro das suas funções de configuração guiadas por ambiente, que os
argumentos explícitos de processadores do qwen-code tornam inalcançáveis para
traces e logs; o único caminho alcançável (`OTEL_METRICS_EXPORTER=otlp` etc.)
agora lança erro dentro de `NodeSDK.start()` — capturado pelo try/catch
existente da fachada — em vez de exportar silenciosamente para um endpoint
localhost padrão. A seleção de exporter baseada em ambiente nunca foi uma
superfície de configuração suportada do qwen-code.

O que cada configuração carrega após a divisão (closure estática medida de cada
chunk de entrada empacotado):

| Configuração | Carrega                                            | Pula                 |
| ------------ | -------------------------------------------------- | -------------------- |
| outfile      | apenas a closure do sdk-impl (975 KiB)             | ambas as cadeias de protocolo |
| OTLP http    | + closure da cadeia HTTP (1,2 MiB incl. camada compartilhada) | cluster gRPC  |
| OTLP grpc    | + closure da cadeia gRPC (1,9 MiB incl. camada compartilhada) | exporters HTTP |

## Guarda

`scripts/check-serve-fast-path-bundle.js` ganha uma verificação enraizada no
chunk `sdk-impl`: sua closure de import estático não deve alcançar nenhum membro
de `FORBIDDEN_OTLP_PROTOCOL_PACKAGES` — o cluster gRPC (`@grpc/grpc-js`,
`@grpc/proto-loader`, `protobufjs`, `exporter-*-otlp-grpc`) mais
`@opentelemetry/otlp-transformer`, que fica na camada de serialização
compartilhada que ambas as cadeias de protocolo puxam e, portanto, também
captura um re-import estático do módulo HTTP. Isso trava a divisão de protocolo
da mesma forma que a blacklist da fase 1 trava a divisão da fachada.

## Testes

- `sdk.test.ts` mantém seu setup de `vi.mock` inalterado: a interceptação do
  vitest se aplica aos imports dos mesmos pacotes de exporter pelos módulos de
  protocolo, então as asserções existentes de argumentos de construtor
  continuam válidas.
- A aceitação segue a disciplina do #4748: 30 cold starts seriais pareados no
  host 2C4G, telemetria ligada (outfile), controle = build da fase 1, candidato
  = esta mudança, reportando channel.initialize e processo→primeira sessão
  P50/P95.

## Alternativas rejeitadas

- **Módulos por exporter (por sinal)**: três módulos a mais sem ganho mensurável
  — os três sinais de um protocolo são sempre configurados juntos.
- **Mover a validação de URL para dentro do módulo HTTP**: adiaria os avisos
  `diag` para URLs inválidas para trás de um carregamento de módulo e mudaria o
  caminho sem URL válida de "nenhum import" para "import e depois no-op".
