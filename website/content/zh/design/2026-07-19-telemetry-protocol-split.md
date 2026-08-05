# 遥测 exporter 协议拆分（惰性 SDK 第 2 阶段）

- Status: implemented
- Issue: QwenLM/qwen-code#7264（候选 1），#4748 的后续工作
- 前序文档：`2026-07-19-lazy-telemetry-sdk-loading.md`（门面 / 实现拆分）

## 问题

第 1 阶段把整个遥测 SDK 移到了动态 `import()` 之后，因此遥测关闭的进程什么都不加载。但遥测**开启**的进程仍然加载 `sdk-impl.ts` 的完整静态闭包，无论配置选择了哪一种协议，它都同时打包了两条 OTLP 协议链：

| 集群                                                                                                                 | 大小（metafile，de962a5ecf + 第 1 阶段） | 被谁需要                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| gRPC 链（`@grpc/grpc-js`、`protobufjs`、`@grpc/proto-loader`、`exporter-*-otlp-grpc`、`long`、`lodash.camelcase`） | 1121 KiB / 125 个模块                | 仅 `otlpProtocol: 'grpc'`           |
| HTTP 链（`exporter-*-otlp-http`）                                                                                    | 23 KiB / 17 个模块                   | 仅 `otlpProtocol: 'http'`           |
| 共享 OTLP 层（`otlp-transformer`、`otlp-exporter-base`）                                                             | 915 KiB / 41 个模块                  | 两种 OTLP 协议都需要，outfile **不需要** |

metafile 显示在 exporter 包之外有两个 OTLP 表面的静态导入方：

1. `sdk-impl.ts`（其 `CompressionAlgorithm` 导入）——通过把 exporter 构造移入协议模块来移除。
2. `@opentelemetry/sdk-node` 本身——它的 `utils.js`/`sdk.js` 急切地 `require()` 每一个 exporter 包（otlp proto/http/grpc × 3 种信号、zipkin、prometheus），以支持基于 `OTEL_*_EXPORTER` 环境变量的自动配置。qwen-code 从不到达那些代码路径：它总是显式传递 `spanProcessors` / `logRecordProcessors`（空数组仍然会短路环境变量回退）。通过构建时 stub 处理，见下文。

两者都裁掉之后，该拆分把整个 OTLP 表面从 outfile 路径移除，把 gRPC 链从 HTTP 路径移除，并把 HTTP 链从 gRPC 路径移除。

第 1 阶段的 2C4G 基准测试说明了为什么这很重要：遥测开启（outfile）时，sdk-impl 的动态加载在 2 核上与 session 建立竞争 CPU（`config_construction`/`bootstrap` +50 ms），吃掉了导入链 −50 ms 收益的大半。缩小实际加载的内容就能缩小这种竞争。

## 设计

两个新模块拥有 exporter 构造，由 `startTelemetrySdk` 仅在各自的配置分支上通过动态 `import()` 加载：

- `packages/core/src/telemetry/sdk-exporters-grpc.ts`
  - 导入三个 gRPC exporter + `CompressionAlgorithm` + `PeriodicExportingMetricReader`。
  - `createGrpcExporters(endpoint)` → `{ spanExporter, logExporter, metricReader }`，全部使用 gzip 压缩，与当前构造完全一致。
- `packages/core/src/telemetry/sdk-exporters-http.ts`
  - 导入三个 HTTP exporter + `PeriodicExportingMetricReader` + `LogToSpanProcessor`。
  - `createHttpExporters({ tracesUrl, logsUrl, metricsUrl, logToSpan })` → `{ spanExporter?, logExporter?, metricReader?, logToSpanProcessor? }`。logs→spans bridge 的决策（logs 端点缺失、traces 存在）随之移到这里，因为该 bridge 会构造一个 HTTP trace exporter。

`sdk-impl.ts` 的变化：

- 去掉全部六个 exporter 导入和 `CompressionAlgorithm`；exporter 变量按其已经依赖的 SDK 接口（`SpanExporter`、`LogRecordExporter`）定义类型。
- `startTelemetrySdk` 变为 `async`。分支顺序保持不变：
  - 没有 base endpoint 的 gRPC 仍然在**任何**协议模块加载**之前**返回 `undefined`。
  - HTTP URL 校验（`validateUrl`）留在 `sdk-impl.ts`；只有当至少一个信号 URL 通过校验时才导入 HTTP 模块。
  - outfile 分支不触碰任何协议模块。
- 门面 await `startTelemetrySdk`（它已经在单飞 async 闭包内运行，因此调用方看不到变化）。

`esbuild.config.js` 新增 `sdkNodeExporterStubPlugin`：当且仅当导入方是 `@opentelemetry/sdk-node` 时，exporter 包被解析为一个构造函数会抛出异常的 stub。我们的协议模块继续解析真实的包。sdk-node 只在其环境变量驱动的配置函数内触碰这些绑定，而 qwen-code 显式的处理器参数使这些路径对 traces 和 logs 不可达；唯一可达的路径（`OTEL_METRICS_EXPORTER=otlp` 等）现在会在 `NodeSDK.start()` 内部抛出异常——被门面现有的 try/catch 捕获——而不是静默导出到默认的 localhost 端点。基于环境变量的 exporter 选择从来不是 qwen-code 支持的配置面。

拆分之后每种配置加载的内容（每个打包入口 chunk 实测的静态闭包）：

| 配置      | 加载                                              | 跳过                 |
| --------- | ------------------------------------------------- | -------------------- |
| outfile   | 仅 sdk-impl 闭包（975 KiB）                       | 两条协议链           |
| OTLP http | + HTTP 链闭包（1.2 MiB，含共享层）                | gRPC 集群            |
| OTLP grpc | + gRPC 链闭包（1.9 MiB，含共享层）                | HTTP exporter        |

## 守卫

`scripts/check-serve-fast-path-bundle.js` 新增一项以 `sdk-impl` chunk 为根的检查：其静态导入闭包不得到达任何 `FORBIDDEN_OTLP_PROTOCOL_PACKAGES` 成员——即 gRPC 集群（`@grpc/grpc-js`、`@grpc/proto-loader`、`protobufjs`、`exporter-*-otlp-grpc`），外加 `@opentelemetry/otlp-transformer`（它位于两条协议链都拉入的共享序列化层，因此也能捕获对 HTTP 模块的静态重新导入）。这与第 1 阶段的黑名单锁定门面拆分的方式相同，锁定了协议拆分。

## 测试

- `sdk.test.ts` 保持其 `vi.mock` 设置不变：vitest 拦截同样适用于协议模块对这些 exporter 包的导入，因此现有的构造参数断言可以延续。
- 验收遵循 #4748 的纪律：在 2C4G 主机上进行 30 次配对串行冷启动，遥测开启（outfile），对照组 = 第 1 阶段构建，候选组 = 本变更，报告 channel.initialize 与 process→首个 session 的 P50/P95。

## 已拒绝的备选方案

- **按 exporter（按信号）拆分模块**：多三个模块却没有可测量的收益——一种协议的三个信号总是一起配置的。
- **把 URL 校验移入 HTTP 模块**：会把非法 URL 的 `diag` 警告推迟到模块加载之后，并把无有效 URL 路径从“完全不导入”变成“先导入再无操作”。
