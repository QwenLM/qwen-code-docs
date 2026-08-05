# undici 惰性加载（惰性启动第 3 阶段）

- Status: implemented
- Issue: QwenLM/qwen-code#7264（候选 4），#4748 的后续工作
- 前序文档：`2026-07-19-lazy-telemetry-sdk-loading.md`、`2026-07-19-telemetry-protocol-split.md`

## 问题

在遥测各阶段之后，undici 是 ACP 急切启动闭包中剩余的最大单一第三方贡献者：跨两个打包副本共 2057 KiB（cli 解析它自己的 `undici`，core 解析另一份）。闭包中任何位置的静态 `import { … } from 'undici'` 都会把一整份副本拉进冷启动的解析/编译，即使 undici 只有在请求真正发出时才需要——代理 dispatcher、预连接、IDE 客户端 fetch 选项、GitHub 安装、自更新。

metafile 显示了八个值导入点（仅类型导入是零成本的）：

| 包   | 位置                           | 使用                                       |
| ---- | ------------------------------ | ------------------------------------------ |
| core | `utils/runtimeFetchOptions.ts` | `Agent`、`ProxyAgent`、`EnvHttpProxyAgent` |
| core | `config/config.ts`             | `EnvHttpProxyAgent`、`setGlobalDispatcher` |
| core | `ide/ide-client.ts`            | `Agent`（IDE HTTP keep-alive）             |
| cli  | `utils/apiPreconnect.ts`       | `fetch`                                    |
| cli  | `commands/channel/proxy.ts`    | `EnvHttpProxyAgent`、`setGlobalDispatcher` |
| cli  | `utils/gitUtils.ts`            | `ProxyAgent`                               |
| cli  | `services/setup-github.ts`     | `ProxyAgent`                               |
| cli  | `utils/standalone-update.ts`   | `fetch`                                    |

## 设计

全部八个位置都改为动态 `import('undici')`，并经由两个包本地的单飞 helper 汇聚：

- `packages/core/src/utils/runtimeFetchOptions.ts` —— `loadUndici()`，外加现有的 `preloadRuntimeFetchModule()` 现在委托给它。同步消费方（`getOrCreateSharedDispatcher`、`buildFetchOptionsWithDispatcher`）保留其大声失败的 `requireUndici()`；可以 await 的异步入口（`createContentGenerator`、`Config.initialize`、IDE 客户端连接）在任何同步构造运行之前预加载。
- `packages/cli/src/utils/load-undici.ts` —— 相同的 helper，有意重复（见“为什么是两个 helper”）。

调用点说明：

- `Config`：全局代理 dispatcher 异步安装；该 promise 被存储并在 `initialize()` 顶部 await，因此 dispatcher 在任何网络活动之前就位，与之前同步的顺序保证一致。
- `createContentGenerator` 在 provider 构造函数同步构建基于 undici 的 fetch 选项之前 await `preloadRuntimeFetchModule()`。

## esbuild CJS interop（难点所在）

esbuild 把 CJS 的 undici 包编译成一个**仅有 default** 的动态 chunk：`export default require_undici()`，没有具名导出。因此 `const { Agent } = await import('undici')` 在 Node 和 vitest（它们会为 CJS 合成具名导出）中有效，但在 bundle 中解构出 `undefined`。本地测试运行无法捕获这一点——只有打包后的冒烟运行可以。

因此 `loadUndici()` 做规范化：如果 `Object.keys(mod)` 恰好是 `['default']`，则解包 `mod.default`；否则原样返回命名空间。这个单键检查（而不是 `mod.default ?? mod` 或 `'default' in mod`）是刻意的：

- vitest mock 代理在访问未定义的 `default` 导出时会**抛出异常**，因此探测 `mod.default` 会破坏每一个 `vi.mock('undici')` 测试；
- 以 `{ ...actual }` 构建的 mock 可能在具名导出旁边携带一个 `default` 键，不能被解包。

## 为什么是两个 helper（而不是从 core 导出一个）

cli 和 core 解析**不同的** undici 副本。如果 cli 代码调用 core 承载的 `loadUndici()`，`import('undici')` 会在 core 的包作用域内解析，从而逃逸 cli 测试中的 `vi.mock('undici')`——mock 会静默停止拦截（观察到：`setup-github.test.ts` 中 `ProxyAgent` mock 从未被调用）。每个包保留一个 helper，使每个包的测试都能 mock 自己的 undici。

## 守卫

`scripts/check-serve-fast-path-bundle.js` 把 undici 加入 `FORBIDDEN_ACP_PACKAGES`：ACP 急切闭包中任何位置的静态重新导入都会让 CI 失败。变更之后，急切闭包从 15.42 MiB / 132 个 chunk 降至 13.39 MiB / 130 个 chunk，undici 字节数 2057 KiB → 0；bundle 恰好保留两个动态 undici 入口 chunk（每个包副本一个），都位于规范化 helper 之后。

## 验收（2C4G，#4748 纪律）

30 次配对串行冷启动，对照组 = 第 2 阶段构建，候选组 = 本变更：process→首个 session 配对 P50 −89.5 ms（1336.8 → 1255.2），候选组在 30/30 对中更快；预热路径不变（P50 80.7 → 78.0）；首个 session 之后的 RSS −8.1 MB。功能门禁（并发、遥测禁用、旧版单会话）全部通过。完整数据见 `.qwen/e2e-tests/phase3-lazy-undici-bench-results.md`。

## 已拒绝的备选方案

- **从 core 导出单一共享 helper**：破坏 cli 测试的 mock，并把 cli 的 undici 副本耦合到 core 的副本（HEAD 上两个副本已经是不同版本：7.27.2 对 7.28.0）。
- **在启动时发起急切的顶层预加载**：只有在没有任何东西 await 它时才能把解析成本移出关键路径，但关键在于大多数冷启动在首个 session 之前从不需要 undici；预加载会重新引入第 2 阶段测量到的 2 核 CPU 竞争。
- **用全局 `fetch` 替换 undici 的使用**：Node 的全局 fetch 就是 undici，但代码需要全局表面不暴露的 `Agent`/`ProxyAgent`/`EnvHttpProxyAgent` dispatcher 选项。
