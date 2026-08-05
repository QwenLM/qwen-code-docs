# 自适应的每轮次工具调用上限

日期：2026-07-17
状态：已实现
领域：`packages/core` 循环检测

## 问题

始终启用的每轮次工具调用上限（`model.maxToolCallsPerTurn`，默认 100）是一个粗暴的熔断器：无论模型是真的卡住还是在做有成效的工作，它都会在第 101 次工具调用时停止轮次。大型多包实现轮次合理地超过 100 次工具调用，因此该上限会扼杀有成效的工作——一次误报。

具体案例：会话 `80db472f-…`（qwen-code-x1，“Web Shell git status/diff chip”）。`继续Phase 2` 轮次恰好进行了 100 次工具调用，并在 `npm run build` 中途被硬停止，没有完成摘要。对该轮次及其同类轮次的分析：

| turn | 工具调用数 | 不同的 (tool,args) 键 | 单个键的最大重复次数 | 最大同名连续次数 |
| ---- | ---------- | ------------------------- | --------------------- | -------------------- |
| 7    | 96         | 96                        | 1                     | 7                    |
| 8    | 100        | 99                        | 2                     | 3                    |
| 9    | 95         | 95                        | 1                     | 7                    |

有成效的轮次高度多样化：没有任何单个 `(tool, args)` 调用重复超过两次。真正卡住的轮次会多次重复同一调用。

## 设计

行为取决于 `maxToolCallsPerTurn` 是否被**显式配置**（由 `Config.isMaxToolCallsPerTurnExplicit()` 跟踪）：

- **显式值 `N`** → **硬上限**（已发布的契约）：轮次在超过 `N` 的调用处停止，没有自适应延展。这保留了向后兼容性——设置了该值以约束无人值守成本的用户仍会精确得到该约束。（v0.19.10 把该上限作为硬上限发布；本 PR 更早的一次迭代把显式值乘以 3，那是破坏性变更——已回滚。）
- **默认（未设置，`S = 100`）** → **自适应**：使用重复信号区分有成效的长轮次和卡住的轮次，只硬停止后者（外加一个绝对兜底）。现代模型合理地每个任务进行数百次调用，因此默认值不得硬停止有成效的长轮次。

自适应（默认）上限的两个阈值：

- **软上限 `S`**（100）：当轮次超过 `S` 次工具调用时，只有在存在卡住重复信号时才停止；否则把轮次视为有成效的并让它继续。
- **硬上限 `S * ADAPTIVE_CAP_HARD_MULTIPLIER`**（乘数 10 → 1000）：绝对兜底。一旦超过，无论重复与否都停止，因此每次调用都变化参数的失控运行（重复信号无法捕获）仍然有界。乘数足够高，使数百次调用的有成效轮次不会被误报。

卡住重复信号：任何单个 `(tool, args)` 键在轮次中出现的最大次数达到 `GLOBAL_DUPLICATE_THRESHOLD`（6）。这复用了现有的全局重复语义，并有宽阔的安全裕度（观察到的有成效轮次 ≤ 2）。

同名连续次数有意不用作门控信号：并行工具批次（例如一条助手消息中对不同文件的多个 `read_file`）合理地产生 6–7 的同名连续次数，太接近行动停滞阈值 8。

### 始终启用的跟踪

该上限始终启用（不受 `skipLoopDetection` 门控），但现有的 `globalToolCallCounts` 映射只在门控启发式路径内维护。为了让始终启用的上限独立于门控路径，该上限维护自己的小型始终启用跟踪器：

- `capKeyCounts: Map<string, number>` — 本轮次每个 `(tool,args)` 的计数。
- `capMaxKeyRepeat: number` — 任何单个键计数的滚动最大值。

在 `checkAlwaysOnSafeties` 中为每个 `ToolCallRequest` 维护，在 `reset()` 和 `Retry` 时清除（与启发式路径在重试时清除 `globalToolCallCounts` 的方式一致）。

## 行为矩阵

显式值 `N`（硬上限）：

| 总调用数 | 结果      |
| ----------- | ----------- |
| `≤ N`       | 允许       |
| `> N`       | 停止（硬） |

默认（未设置），软上限 `S = 100`，硬上限 `H = 1000`：

| 总调用数     | 重复信号    | 结果             |
| --------------- | -------------------- | ------------------ |
| `≤ S`           | 任意                  | 允许              |
| `S < total ≤ H` | 最大键重复 `< 6` | 允许（有成效） |
| `S < total ≤ H` | 最大键重复 `≥ 6` | 停止（卡住）       |
| `> H`           | 任意                  | 停止（兜底）    |

当 `S ≤ 0` 时该上限被禁用（`getMaxToolCallsPerTurn()` 返回 `Infinity`）；行为不变（从不触发）。

## 变更的文件

- `packages/core/src/config/config.ts` — 跟踪 `maxToolCallsPerTurnExplicit` + `isMaxToolCallsPerTurnExplicit()` getter。
- `packages/core/src/services/loopDetectionService.ts` — 显式与默认上限逻辑 + 始终启用的跟踪器 + 规范化的工具调用键。
- `packages/core/src/services/loopDetectionService.test.ts` — 显式硬上限回归 + 自适应（默认）用例。
- `packages/core/src/core/client.test.ts` — Stop-hook 预算测试（显式硬上限）。
- `packages/core/src/config/config.test.ts` — 显式标志跟踪。
- `packages/cli/src/config/settingsSchema.ts` — `maxToolCallsPerTurn` 描述。
- `docs/users/configuration/settings.md` — 同上。

## 非目标 / 后续工作

- 原地恢复被停止的轮次（架构上不可行：当对话框出现时轮次已经返回）。
- 改变检测到循环的对话框 UI（单独的改进）。
- 为硬上限设置单独的配置旋钮（它从软上限派生；提高 `maxToolCallsPerTurn` 会同时放大两者）。
- 基于近期窗口或感知结果的卡住信号。当前信号是每轮次的单调最大值：同一 `(tool, args)` 在轮次中任何位置重复 6 次就标记为卡住，即使这些重复是合理的（例如在连续修复后重新运行同一 build/test）。这绝不是回归——该信号只在超过软上限后起作用，而旧上限在那里总是停止——但那一类有成效的轮次无法受益。“有成效轮次重复 ≤ 2”的证据来自一个会话的三个轮次；如果遥测显示这种误判卡住的模式，再用窗口化信号重新审视。
- 对两种停止原因的遥测区分。软上限卡住和硬兜底都发出 `TURN_TOOL_CALL_CAP`；`LoopDetectedEvent` 上的一个布尔值/属性可以说明在生产环境中是哪个触发的（对验证 10× 乘数有用）。无头模式消息已经做了两可的措辞以覆盖两者。
- ACP/daemon 路径（`packages/cli/src/acp-integration/session/Session.ts` 中的 `recordDaemonToolCalls`）有自己的粗暴每轮次上限，不使用 `LoopDetectionService`。无论重复与否，它始终把该值视为硬上限。让它与自适应默认值对齐是一个单独的后续工作（它按批次跟踪工具调用，需要自己的每 `(tool,args)` 重复跟踪）。产生所报告误报的交互式 TUI 路径在此已修复。
