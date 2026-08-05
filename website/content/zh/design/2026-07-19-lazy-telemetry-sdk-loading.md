# 将 OpenTelemetry SDK 惰性加载移出 ACP 子进程启动路径

- **Issue**: #4748（优化 daemon 冷启动与 qwen serve 快路径延迟）
- **Status**: implemented
- **Date**: 2026-07-19
- **Depends on**: #7182（TUI 模块移除）、下文的 metafile 审计

## 问题

`channel.initialize`（2C4G 上约 1035ms P50）是 daemon 冷启动首个 Session 的主要成本，其中约 67% 是 ACP 子进程中的模块加载。对 #7182 之后的 bundle 做 metafile 审计（commit `de962a5ecf`，`DEV=true` 下的 esbuild metafile）显示，ACP 子进程的急切静态闭包为 **17.24 MiB / 2420 个模块**，其中 OpenTelemetry 集群是最大的单一连贯块：

| 组                                                                     | 字节数（tree-shake 后） |
| ---------------------------------------------------------------------- | ----------------------- |
| `@grpc/grpc-js`                                                        | 577 KiB                 |
| `@opentelemetry/otlp-transformer`                                      | 479 KiB                 |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 KiB                 |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | ~260 KiB                |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | ~132 KiB                |
| 其余 `@opentelemetry/*`（exporters、propagators、resources 等）        | ~250 KiB                |
| **遥测集群总计**                                                       | **2.16 MiB**            |

这些字节中的每一个都会在 ACP 子进程启动时被求值，尽管：

1. 遥测**默认禁用**——常见情形为 `initializeTelemetry()` 随后拒绝运行的代码支付了完整的模块税（`sdk.ts:202` 处的 `!config.getTelemetryEnabled()` 提前返回）。
2. 即使启用了，在第一个 span/log/metric 之前也没有任何东西需要 SDK，而那总是在 `initialize` 被 ACK 之后。

作为参照：#7182 移除了 1.16 MiB，并把 ACP 导入时间从 115ms 削减到 52ms（-63ms）。这个集群的体量接近它的 2 倍，因此同一量级的效果是合理的——但须通过该 issue 的测量门禁（见下文）。

## 为什么导入链是急切的

`sdk.ts` 在顶层静态导入所有内容（`sdk.ts:13-32`）：六个 OTLP exporter（gRPC + HTTP × traces/logs/metrics）、`NodeSDK`、批处理器、`PeriodicExportingMetricReader`，以及两个 instrumentation。`sdk.ts` 本身经由 `telemetry/index.ts` 从核心 barrel 被静态到达，且不能做成完全惰性，因为两个热路径模块静态依赖它廉价的状态 getter：

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()`（门控每条日志）
- `telemetry/session-tracing.ts:31` → 同上（门控每个 span helper）

因此拆分必须把**廉价状态门面**与**重型 SDK 组装**分离，而不仅仅是把六个 exporter 导入包进 `await import()`——`NodeSDK` / instrumentation / sdk-metrics 的导入（约 0.7 MiB）同样可以移除，并且位于同一个文件中。

## 设计

### `packages/core/src/telemetry/` 内部的文件拆分

**`sdk.ts`（保留；成为门面——无重型导入）。** 名称和语义不变地保留其他模块静态到达的所有内容：

- 模块状态：`sdk`、`telemetryInitialized`、`telemetryShutdownPromise`、`activeMetricReader`（通过 `import type` 定义类型，因此无运行时加载）
- `isTelemetrySdkInitialized()`、`refreshSessionContext()`、`shutdownTelemetry()`、`forceFlushMetrics()`
- `resolveHttpOtlpUrl()`（已导出，纯函数；无重型依赖）
- `diag.setLogger(...)` 副作用（只需要 `@opentelemetry/api`，它已经无处不在且廉价——56 KiB，同样被 `loggers.ts`/`metrics.ts` 使用）

它唯一的 `@opentelemetry/*` 运行时导入是 `@opentelemetry/api`。

**`sdk-impl.ts`（新增；重型的一半）。** 原样接收：六个 OTLP exporter 导入、`NodeSDK`、`BatchSpanProcessor`、`BatchLogRecordProcessor`、`PeriodicExportingMetricReader`、两个 instrumentation、`CompressionAlgorithm`、`resourceFromAttributes`、`SessionIdSpanProcessor`、`parseOtlpEndpoint`、`validateUrl`、`normalizeOtlpPrefix` + 前缀匹配、propagator 闸门，以及今天 `initializeTelemetry()` 从资源构建开始的函数体。它导出一个函数：

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

在现有的“没有 base endpoint 的 gRPC”跳过路径上返回 `undefined`。`file-exporters.ts` 和 `log-to-span-processor.ts` 也移到 `sdk-impl.ts` 之后（它们今天只被 `sdk.ts` 导入，并会拉入 `sdk-logs`/`sdk-metrics`/`sdk-trace-base`）。

### `initializeTelemetry` 变为 async

在门面中：

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
    // setShellTracePropagation + initializeMetrics — same order as today,
    // same try/catch that only logs.
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

关键属性：

- **禁用路径保持同步且零成本**——`getTelemetryEnabled()` 检查在动态导入之前运行，因此默认配置的用户完全不会加载这 2.16 MiB 的集群。这才是 ACP 子进程真正的收益。
- 单飞守卫（`telemetryInitPromise`）使该函数在并发调用方下保持幂等，与今天的 `telemetryInitialized` 复查一致。
- `shutdownTelemetry()` 无需修改：它操作门面的 `sdk` 变量，并且在 `!telemetryInitialized` 时已经是无操作。

### 调用点处理（全部三个生产调用方）

1. **`packages/core/src/config/config.ts:2192`**（Config 构造函数——同步上下文；这是 ACP 子进程走的路径，因为 ACP 模式下 `deferTelemetryInitialization` 为 false，见 `packages/cli/src/config/config.ts:2075`）。Fire-and-forget 并带记录的 catch：

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   风险分析：晚启动的唯一后果是间隙中发出的 span/log 会被 `isTelemetrySdkInitialized()` 门控丢弃——这_已经_是整个构造函数前窗口以及交互式 TUI 路径的行为（在后者中遥测初始化被推迟到一个后台任务，`startup-prefetch.ts:259`）。没有新的失败模式。

   行为变更（有意，已记录）：在非延迟路径上——ACP 子进程和无头模式 `-p` 运行（`deferTelemetryInitialization` 为 false）——遥测之前在同步的 `initializeTelemetry` 调用返回时已经完整注册；现在它异步落定，因此现有的丢弃窗口扩大了动态导入的成本（约 50–150ms）。我们故意在这里不 `await`：await 会把 2.16 MiB 的导入放回 ACP 子进程的关键路径，抵消收益。需要遥测保证就绪后才继续的调用方（daemon 运行时，调用方 3）会显式 `await`。

2. **`packages/cli/src/startup/startup-prefetch.ts:261`**（延迟任务运行器）。把任务闭包改为返回该 promise（`() => initializeTelemetry(config)`），使 `runDeferredTask` 现有的错误处理能够观察到 rejection。语义在其他方面不变。

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`**（daemon 运行时）。**必须 `await`。** 紧接着的下一行调用 `initializeDaemonMetrics()`，而 OTel 的 `metrics.getMeter()` 如果在 SDK 注册全局 MeterProvider 之前被调用，会永久缓存一个 noop meter——daemon 指标会静默失效。外围函数已经是 async，因此 `await core.initializeTelemetry(...)` 只是一个词的改动。这只在遥测启用时把模块加载成本加到 _daemon 运行时_的加载中（延迟的，不在快路径上）——可以接受，且严格优于在每个 ACP 子进程中支付它。

   同样的顺序风险在原则上也存在于 `initializeMetrics()`（`metrics.ts:409`），但它在 init promise _内部_、`sdk.start()` 之后被调用，因此顺序在构造上得到保持。

### Bundle 守卫扩展

扩展 `scripts/check-serve-fast-path-bundle.js` 的 ACP 边界检查（`findAcpImportBoundaryOffenders`），加入遥测黑名单，使拆分不会静默回归：

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

（`@opentelemetry/api`、`semantic-conventions`、`core`、`resources`、`api-logs` 不列入黑名单——它们可以从 `loggers.ts`、`metrics.ts` 和类型级导出合法到达。）

## 本变更不改变的内容

- 遥测启用时无行为变更——相同的 exporter、相同的处理器、相同的 instrumentation hook、相同的 shutdown/flush 语义。
- 不移除公共 API：`initializeTelemetry` 的返回类型从 `void → Promise<void>` 变化，这对现有的 fire-and-forget 调用方是源码兼容的（无论如何所有调用点都在同一个 commit 中更新；这是 core 包的变更，按 AGENTS.md 由维护者完成）。
- `telemetry/index.ts` 的 barrel 导出保持相同名称。

## 验收（issue #4748 测量门禁）

字节数不能换算成毫秒；变更在合并前必须通过该 issue 既定的纪律：

1. **2C4G，30 次串行冷启动**，遥测禁用（默认配置）：将 `channel.initialize` P50/P95 和 process→首个 Session 的 P50 与 `de962a5ecf` 基线比较。只有当 P50 的改善超出运行间噪声时才发布。
2. **遥测启用的功能验证**：OTLP gRPC 和 HTTP 目标在变更后各自接收到 traces/logs/metrics（现有的 `sdk.test.ts` 矩阵，外加一次针对本地 collector 的手工端到端）；`--telemetry-outfile` 文件 exporter 仍然写入。
3. **Daemon 指标**：遥测启用时，daemon Status 指标环和 `initializeDaemonMetrics()` 的 gauge 仍然报告（守护调用点 3 的 await）。
4. **Bundle 守卫**：`node scripts/check-serve-fast-path-bundle.js` 在扩展黑名单下为绿色；重新运行闭包审计（`.qwen/scripts/acp-closure-audit.mjs`）并记录新的 ACP 闭包总量（预期 ≈ 17.24 − 约 2.0 MiB，减去 `@opentelemetry/api` 及其同伴保持急切的部分）。
5. **单元测试**：`sdk.test.ts` await `initializeTelemetry`（15 个调用点）；断言 exporter 构造的测试移到 `sdk-impl.ts` 或对其 mock。

## 已考虑的备选方案

- **只惰性导入六个 exporter 类，保持 `initializeTelemetry` 同步。** 已拒绝：毫无理由地让约 0.7 MiB（`NodeSDK`、instrumentation、`sdk-metrics`、批处理器）保持急切，而且仍然会在某处强制引入 async 边界——启用路径无条件构造 exporter，因此该函数无论如何都会变 async。
- **让整个 `telemetry/sdk.ts` 模块动态化。** 已拒绝：`loggers.ts` 和 `session-tracing.ts` 用 `isTelemetrySdkInitialized()` 门控每个遥测调用；让该门控变 async 会污染数十个热同步调用点。
- **在 ACP 子进程中完全跳过遥测。** 已在该 issue 中拒绝（一刀切的跳过会改变启用遥测用户的可观察行为）。
