# 自动验证结果

捕获于 2026-05-20，在 AbortController 重构期间。

## 1. 监听器累积复现器

直接模拟在长时间会话中观察到的监听器累积模式（单个 AbortSignal 上有 1500+ abort 监听器）。脚本位于 `listener-accumulation-repro.mjs`。

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simulating 2000 rounds for each pattern.

OLD pattern listener count on long-lived parent: 2000
NEW pattern listener count on long-lived parent: 0
PASS: OLD pattern accumulated >1500 listeners (reproduces the bug).
PASS: NEW pattern kept listener count at 0 — the helper prevents accumulation.
```

这是一个独立的验证：旧模式（原始的 `addEventListener`，未使用 `{once:true}` 或反向清理）在 2000 轮中累积了 2000 个监听器——远超用户观察到的 1500 阈值。新模式（来自 `packages/core/src/utils/abortController.ts` 的 `createChildAbortController`）在 2000 轮中始终将父监听器计数保持在 0，因为每个子控制器的反向清理监听器会在子控制器中止时移除父监听器。

## 2. 迁移范围（有意为之）

只有实际在长期存在的父信号上累积监听器的 agent-runtime 父→子链被迁移到辅助函数：

- `packages/core/src/agents/runtime/agent-interactive.ts`（master + 每条消息轮次）
- `packages/core/src/agents/runtime/agent-core.ts`（每次迭代轮次 + waitForExternalInputs + processFunctionCalls 的 try/finally）
- `packages/core/src/agents/runtime/agent-headless.ts`（external → execution）
- `packages/core/src/hooks/promptHookRunner.ts`（存在实际的清理泄漏：手动使用 addEventListener 但未设置 `{once:true}` 且从未移除）

另外三个仅涉及 `{once:true}` 的修复（无需切换辅助函数，仅是防御性正确性）：

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

独立的短期控制器（`tools/shell.ts` 中每条 shell 命令、`tools/monitor.ts` 中每次监控、`agents/arena/ArenaManager.ts` 中每次 arena 会话、`core/client.ts` 中每次回访、`utils/fetch.ts` 中每次 fetch、每次 dream / title / judge / resume 等）仍使用原始的 `new AbortController()`——它们在使用结束后会被垃圾回收，不会在长期存在的父对象上累积。

参见 `migration-completeness.txt` 了解实际的 grep 和原理。

## 3. 受影响的测试套件

所有 71 个受影响的测试文件 / 2085 个测试通过（3 个跳过——1 个是需要 `--expose-gc` 的 GC 测试，2 个是无头套件中预先存在的跳过）。

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

覆盖率：

- `packages/core/src/utils/abortController.test.ts` — 26 个测试：工厂容量（默认 + 自定义）、子传播、逆向清理、快速路径、未定义父级、custom-maxListeners 透传、`combineAbortSignals` 语义（包括 cleanup-cancels-timeout、timeout-cleans-input-listeners、`timeoutMs <= 0` 边界、中间迭代防御性检查）、GC 安全性（尽力而为）。
- `packages/cli/src/utils/warningHandler.test.ts` — 13 个测试：幂等性、AbortSignal 抑制（包括 `[AbortSignal{...}]` 形式）、通用 EventTarget 不被抑制、调试模式透传、广播到先前的监听器、生成的子进程端到端 stderr 集成。
- `packages/core/src/hooks/httpHookRunner.test.ts` — 覆盖迁移后的 `combineAbortSignals` 消费者（已删除已弃用的 `createCombinedAbortSignal` 垫片及其测试文件，因为唯一调用方已迁移）。
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` — 102 个测试，覆盖了高影响力的已迁移文件。
- `packages/core/src/core/openaiContentGenerator/**` — 280+ 个测试，包括移除 `raiseAbortListenerCap` 补丁的管道。
- `packages/core/src/followup/**` — 100+ 个测试，包括已迁移的推测控制器。
- `packages/core/src/tools/agent/**`、`packages/core/src/tools/shell.test.ts`、`packages/core/src/services/**`、`packages/core/src/hooks/**`、`packages/core/src/confirmation-bus/**` — 所有已迁移的工具/钩子/服务文件。

## 4. TypeScript 严格模式类型检查

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(no output, exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(no output, exit 0)
```

## 5. Prettier 格式化

```sh
$ node_modules/.bin/prettier --check packages/core/src/agents/runtime/agent-core.ts \
    packages/core/src/agents/runtime/agent-headless.ts \
    packages/cli/src/utils/warningHandler.ts \
    packages/cli/src/utils/warningHandler.test.ts \
    packages/core/src/utils/abortController.ts \
    packages/core/src/utils/abortController.test.ts
Checking formatting...
All matched files use Prettier code style!
```

## 6. 构建 + 二进制冒烟测试

```sh
$ npm run build:packages
(succeeds for all 5 workspace packages)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

使用 `--trace-warnings` 启动时没有发出任何警告。

## 7. Codex 独立审查

通过 `codex:codex-rescue` 代理进行了两轮完整的审查（每次独立上下文）。第一轮发现了 3 个问题——均在后续提交中解决：

1. **在创建控制器和显式中止之间抛出异常会导致监听器泄漏**，出现在 `agent-core.ts` 的每次迭代体中以及 `agent-headless.ts` 的 try 块之前的设置中。通过将每个包装在 `try { ... } finally { abortController.abort(); }` 中修复。
2. **警告抑制器的正则表达式 `EventTarget` 范围过宽**。收紧为仅匹配 `AbortSignal`（Node ≥20 产生的任何形状）。
3. **`process.removeAllListeners('warning')` 会移除第三方监听器**。已删除——依赖 Node 的“没有监听器→默认打印器触发”语义，这样添加我们的处理程序会隐式禁用默认打印路径，同时保留第三方遥测监听器。

第二轮确认所有修复正确，没有进一步阻塞。

## 交互式验证的剩余部分

`README.md` 中编号 00–09 的场景需要针对模型 API 进行真实的交互式会话（长时间混合工具对话、Ctrl-C 中途中断、子代理取消、堆快照）。这些是为人工执行而记录的，转录内容应在运行时附加到 PR 正文。