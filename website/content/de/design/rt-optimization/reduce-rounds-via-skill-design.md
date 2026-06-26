# Agent Loop 减轮方案：从 Skill 设计入手

> 与 `rt-optimization-design.md` 同目录，互为补充：那份文档讨论**框架机制**层面减轮（D1 跳过末尾总结轮、D2 fast 路由、D4 prevalidate），这份文档主张**减轮的真正杠杆在 skill/tool 设计层**，并提出一条不依赖框架改造、不依赖 cache hit rate 数据的可实施路径。

---

## 0. 验收 Spec（开发前置 gate）

> 本节是开发的**前置 gate** — 列出哪些 spec 必须在动手前确认、哪些 spec 必须等数据驱动。把 spec 前置而非"做完再看指标"，是为了避免：(a) 写完才发现指标不可测、(b) 阈值随结果飘移导致结论失真、(c) 没设止损线让方案陷入"看起来在做、其实没收益"。
>
> **本 spec 框架的适用边界**：本框架假设方向正确性可以在 P1.5 基线测量后判断。这个假设对"减轮"场景成立，因为它有清晰的可测信号（轮数、followup\_rate、batch\_size）。**超出此假设的场景**（例如未来用同一框架做"质量优化"等难以量化的方向），spec 前置可能反而阻碍快速学习；遇到时回退到 §0.5 治理流程重新评估，不机械套用本框架。

**spec 分四层 — 时机不同**：

| 层级 | 类型                                    | 锁定时机                         |
| ---- | --------------------------------------- | -------------------------------- |
| §0.1 | 工程层 spec（数据管道、代码改动正确性） | **前置**、可立刻锁定             |
| §0.2 | 统计层 spec（项目"算成功"的指标）       | **前置**、阈值待 P1.5 基线后锁定 |
| §0.3 | 止损线（"如果发生就放弃"硬条件）        | **前置**、不可移动               |
| §0.4 | per-skill spec（具体改哪个、目标多少）  | **后置**、Layer 1 数据驱动       |

### 0.1 工程层 spec（必须前置 · 可立刻锁定）

数据管道与代码改动的正确性 spec — 不依赖任何业务判断或基线数据，开发前就该锁定：

- **qwen-logger 链路通畅**（§4.1.1b）：skill\_launch 事件能同时落到 OTLP 和 qwen-logger 两条管道
- **`prompt_id` 串联**：单个 user prompt 触发的 `skill_launch` + 后续 `tool_call` 能用同一个 `prompt_id` grep 出完整 trail
- **`batch_size` 非 undefined**（§4.3.2 方向 A）：单工具 batch 显式设 `batch_size = 1` / `batch_position = 0`
- **SQL 可跑通**（§4.1.2）：离线 SQL 在真实 telemetry backend 输出非空且能区分高/低 followup\_rate skill
- **基线方差 < P50 × 20%**（P1.5）：基线测量稳定（否则后续 A/B 对比不可信）—— 注：本条虽列在 §0.1 工程层，但**锁定依赖 P1.5 基线数据**，是 §0.1 中唯一的后置验证项；P1.5 未通过则 §0.2 阈值无法可信锁定
- **Skill 体积预算**（Layer 2 改造）：内联 followup 后，skill 描述 token 数不超过改造前的 2×，且绝对值 ≤ 500 tokens（取较小值）。超过则按 §4.2 拆分 skill 而非合并。本条与 §7 第 2 条、§4.2 已有约束对齐，前置到 spec 层
- **`npm run preflight` 全过**：每个 PR 的硬门槛

### 0.2 统计层 spec（必须前置 · 阈值待 P1.5 后锁定）

项目算"统计意义上成功"的指标 — **方向**前置定下，**阈值**等基线测出来后锁定（避免凭空填数字）：

| 指标                               | 方向     | 锁定时机  | 当前占位阈值（待校准） |
| ---------------------------------- | -------- | --------- | ---------------------- |
| top-3 skill 加权 `followup_rate`   | ↓        | P1.5 末   | ≥ 30%                  |
| 含 skill 的会话端到端 RT P50       | ↓        | P1.5 末   | ≥ 2s                   |
| `batch_size > 1` 的 tool_call 占比 | ↑        | P3 前     | ≥ 30%                  |
| 改造的 skill 触发场景 A/B 显著性   | p < 0.05 | P2 改完前 | n 待定                 |

> **关键约束**：占位阈值不是承诺。P1.5 基线如果显示"top-5 skill 加权 followup\_rate < 30%"（触发 §0.3 止损线 #1），项目终止；**不能为了让阈值"达到"而下调 spec**。
>
> **怎么测**：每个指标的测量方法、SQL 模板、A/B 设计见 §5.1-§5.2；统计显著性（p < 0.05）的样本量计算见 §5.1。

### 0.3 止损线（必须前置 · P-1 锁定后受限可调）

§5.3 已列。这些是"如果发生就放弃"的硬条件 — **任何情况下不能为了达成 §0.2 统计层 spec 而放宽止损线**。

- **结果指标**（3 条）：top-5 加权 `followup_rate < 30%` / 改完 2 个 skill RT P50 ↓ < 1s / Layer 3 后 `batch_size P50` 仍 = 1
- **过程指标**（3 条）：skill 命中率 ↓ ≥ 5pp / 内联 followup 失败率 ≥ 5% / 用户取消率 ↑ ≥ 2pp

详见 §5.3。

**可调性规则**（避免无数据支撑的纪律刚性）：

| 阶段                  | 可否调整                                 | 调整方向                                                                        |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| P-1 锁定时            | ✅ 任意调整（基于历史 telemetry 或共识） | 任意                                                                            |
| P-1 锁定后 → P1.5 末  | ❌ 不可调整                              | —                                                                               |
| P1.5 末（基线出来时） | ✅ 仅允许**放宽**一次                    | 放宽（如 30% → 25%）需附数据证据 + 2 人评审；**不允许收紧**（避免事后追加止损） |
| P1.5 之后             | ❌ 不可调整                              | —                                                                               |

> 阈值占位值（30% / 1s / 5pp 等）当前**无历史数据支撑**，是 P-1 评审前的工程师直觉。如果 P-1 评审时能拿到最近 4 周历史 telemetry，应基于历史数据校准止损线；拿不到则保留占位值，P1.5 末执行上面的"放宽一次"规则。

### 0.4 per-skill spec（必须后置 · 数据驱动）

具体改哪个 skill、目标 `followup_rate` 改到多少 — **Layer 1 数据出来前不锁定**。

不锁定的理由：先验设计 vs 后验数据可能差很多。强行前置会重蹈 `rt-optimization-design.md` §7 D2 路线的覆辙 —— 前置假设"fast 模型快 2-3s"被 cache 实装这一后验事实推翻，导致方案净收益接近 0 甚至为负。

**产出位置**：per-skill spec 在 P1.5 末由数据驱动产出，每个 Layer 2 PR 的 description 里独立声明（不进 design 文档，避免文档每改一个 skill 就改）。

**per-skill spec 结构模板**（与 §4.2 的 PR description 必含项对齐 — 这两个清单是同一份，§4.2 是过程视角、本节是 spec 视角）：

| 字段            | 内容                                                                                                   | 数据来源                               |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1. 当前数据     | invocation\_count、followup\_rate、top followup tools                                                    | Layer 1 telemetry                      |
| 2. 目标         | followup\_rate 从 X% 降到 Y%                                                                            | 基于 §0.2 改善方向，绝对值 PR 内自行定 |
| 3. 改造范围     | 内联哪些 followup（read/grep/shell read-only），明确**不**内联什么（write 操作 / 跨 skill / 深度推理） | §4.2 改造模式表                        |
| 4. 输出契约更新 | skill 描述里加的预声明（"Returns: ..."）                                                               | §3.2 改造示例                          |
| 5. A/B 计划     | 改造后 2 周观察 followup\_rate / RT P50 / 过程指标，对照 §5.1 验收线                                    | §5.1                                   |
| 6. 体积证明     | 改造前后 skill 描述 token 数（用 tiktoken 估算），不得超 §0.1"Skill 体积预算"                          | §0.1 第 6 条                           |

### 0.5 spec 治理

- **修改 §0.1 / §0.3 spec** 需 design 文档更新 + PR 评审；§0.3 仅遵循 §0.3"可调性规则"在 P1.5 末窗口内放宽
- **修改 §0.2 阈值（P1.5 锁定后）** 需附以下至少一项数据证据：
  - (a) P1.5 基线测量结果与已锁定阈值的偏差分析（含原始测量记录链接）
  - (b) 同类项目的公开 benchmark 数据（含来源链接）
  - (c) 内部 ≥ 2 人评审签字的偏差说明

  PR 评审时若上述证据均无，评审者**有义务** block PR — 不接受"凭工程师直觉调整"

- **§0.4 per-skill spec** 在数据驱动产出后写入 PR description（按 §0.4 6 项模板），不进 design 文档

---

## 1. 背景与定位

### 1.1 问题

`rt-optimization-design.md` §1.2 给出的基线：3 轮 agent loop，13.4s 端到端，其中 LLM 调用占 78%。每一轮 ~3-4s。

```
Round 1 (3.8s, 28%): LLM 决策调 skill
Round 2 (3.0s, 22%): LLM 决策调 shell
Round 3 (3.8s, 28%): LLM 总结
```

`rt-optimization-design.md` §6/§7 经过两轮 review 后，D2/D4 已被否决，D1/D3 也降级为"等浮油完成后再评估"。但**整份原文档都聚焦在末尾的 Round 3（总结轮）或单轮内的微优化（D4）上，完全没有正面讨论 Round 1 → Round 2 这个"中间轮"为什么会出现、能不能消掉**。

事实是：Round 2 之所以存在，**绝大多数情况是因为 Round 1 调用的 skill 没有返回完整答案**，模型才追加 shell 查询补全。如果 skill 设计成"一次拿到完整结果"，3 轮 → 2 轮，省掉的就是 Round 2 那 ~3s — 这是与 D1 完全不重叠的收益面。

### 1.2 与 rt-optimization-design 的关系

| 减轮方向             | 命中的轮次                      | 杠杆位置                     | 本文档定位                   |
| -------------------- | ------------------------------- | ---------------------------- | ---------------------------- |
| D1 `skipLlmRound`    | 末尾总结轮                      | 框架机制 + per-tool opt-in   | 兜底，**放在 Layer 2 之后**  |
| D2 fast 路由         | 单轮延迟                        | 框架机制                     | 已 defer，**不在本文档范围** |
| D3 Summarizing 状态  | 末尾总结轮（感知层）            | UI 状态机                    | 可选，与本方案正交           |
| D4 prevalidate       | 单轮延迟                        | 框架机制                     | 已 defer，**不在本文档范围** |
| **本方案 Layer 1-3** | **中间决策轮 + 并发未触发的轮** | **skill 设计 + prompt 工程** | **新增方向**                 |

### 1.3 核心论点

减轮的真正杠杆在 skill/tool 设计层，不在 agent 框架。三个理由：

1. **§1.2 基线本身就暴露问题在 skill** — Round 1 → Round 2 的跳跃是 skill 返回不全才发生的，框架做对了，skill 做错了
2. **框架级减轮最终也要 per-tool opt-in** — D1 的 `skipLlmRound` 必须每个工具显式标记，绕一圈回到 skill 工程，还多一套不变量修复 + 决策门控成本
3. **ROI 局部可测、灰度容易** — 改一个 skill 就少一轮 × 该 skill 触发次数，不依赖 cache hit rate 数据，不依赖跨系统改动

> **实施前必须先走 §0 验收 Spec 前置评审（P-1 阶段，0.5d）** — §0.1 工程层 spec 和 §0.3 止损线在动手前必须锁定；§0.2 统计层阈值的方向也要前置确认（具体数值等 P1.5 基线后再锁）。跳过 §0 进入 P0 实施 = 默认走"做完才看指标"的反模式，文档不背书这种做法。

---

## 2. 设计原则

1. **不改 agent 框架** — 不动 `useGeminiStream` / `coreToolScheduler` / `geminiChat` 核心路径
2. **数据驱动选优先级** — 先建 telemetry，让数据告诉你改哪个 skill，不靠拍脑袋
3. **per-skill 可测可灰度** — 每个 skill 改造独立 A/B，失败局部回退
4. **复利优先** — 收益 = 单次减轮收益 × 触发频率，高频 skill 优先
5. **不绑定 D1** — 本方案的成功不依赖 D1 是否落地

---

## 3. 三层方案

### 3.1 Layer 1：减轮 Telemetry（找金矿）

**目标**：让数据告诉你哪些 skill 最值得改 — 即"用了这个 skill 之后，模型有多大概率追加一次工具调用"。

**核心字段**（per-turn、per-skill-invocation）：

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // 关联同一 user prompt 内的所有 events
  turn_index: number; // 该 skill 在 loop 里是第几轮
  followup_tool_names: string[]; // 同一 prompt_id 下，skill 之后还调了哪些工具
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // skill 之后下一轮就出文字（不再调工具）
  user_followup_within_30s: boolean; // 用户在结果显示后 30s 内追加新 prompt（质量回归信号）
}
```

**关键指标**：

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- 按 `(skill_name, top followup tool)` 聚合 — 看哪些 skill 之后最常追加哪个工具

**金矿判定**：

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
该 skill 是减轮金矿，优先 Layer 2 改造
```

阈值建议：top-3 按上式排序的 skill，先改前 2 个。

### 3.2 Layer 2：Skill 输出完整化

**目标**：让被识别为金矿的 skill 一次返回完整答案，消除 Round 1 → Round 2 的跳跃。

**改造模式（按 followup 类型分类）**：

| Followup 模式               | 典型场景                   | 改造方向                           |
| --------------------------- | -------------------------- | ---------------------------------- |
| skill → `read_file`         | skill 给路径，模型再读     | skill 内部直接读，返回内容         |
| skill → `grep/glob`         | skill 给目录，模型再搜     | skill 内部搜好，返回匹配           |
| skill → `shell` (read-only) | skill 给命令，模型再执行   | skill 内部跑命令，返回输出         |
| skill → `shell` (write)     | skill 给方案，模型再执行写 | **保留**（写操作要确认，不应合并） |
| skill → another skill       | 链式调用                   | **不合并**（保持组合性）           |

**改造检查清单（per-skill PR 模板）**：

1. 在 skill 描述里**预声明输出契约**：明确写 "Returns: full file content / matched lines / command output"，让模型知道不必追加查询
2. 在 skill 内部**完成所有 read-only followup**：把 telemetry 显示 >50% 追加率的 read/search 操作内联进 skill
3. **不内联 write 操作**：写操作需要用户确认，必须单独成轮
4. **不内联深度推理 followup**：如果 followup 是"基于此再分析"，那是模型的事，不是 skill 的事
5. **附 A/B telemetry**：改造后 2 周对比 `followup_rate` 是否下降到 <20%

**典型改造示例（示意）**：

改造前：

```
skill "list-workspaces" returns: ["ws_a", "ws_b"]
→ Round 2: model calls shell to get details for each workspace
```

改造后：

```
skill "list-workspaces" returns:
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description updated: "Returns workspaces with owner, last_active, status"
→ Round 2 disappears for ~80% of queries
```

### 3.3 Layer 3：Prompt 教育模型并发

**目标**：对于独立工具（多文件读、多目录搜），让模型在同一轮里并发发起 tool\_calls，把 N 轮压成 1 轮。

**前提**：基础设施已就绪 — `tools/tools.ts:818` 的 `CONCURRENCY_SAFE_KINDS` + `coreToolScheduler` 的 `partitionToolCalls` 已经能并发执行同 batch 内的 read/search/fetch 工具。**差的只是模型主动发起并发 tool_calls 的意愿**，qwen-coder 默认偏串行。

**改动位置**：`packages/core/src/core/prompts.ts`（已审计过，加在 `# Final Reminder` 段 L396 附近不会破坏 cache 命中以外的事 — 仅一次性预热成本）。

**指导文本（示意，需 A/B 调优）**：

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**生效衡量**：新增 telemetry 字段 `batch_size`（同 turn 内 tool_calls 数量）— 改 prompt 前后对比分布。

#### 3.3.1 扩展 `CONCURRENCY_SAFE_KINDS`（Layer 3 子项）

prompt 教育模型并发只是供给侧（模型愿意一次发多个 tool_calls），但 `tools/tools.ts:818` 的 `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` 决定**实际能并发执行的工具范围**：`partitionToolCalls`（`coreToolScheduler.ts:775`）会把"连续的安全工具"打包成 concurrent batch，其余各自串行。

如果模型按指导一次发了 3 个 tool_calls 但其中 1 个属于 `Kind.Execute` 且不在安全集合，整个 batch 就会被拆开串行执行 — Layer 3 prompt 改动的收益会被运行时调度抵消。

**扩展候选**（按风险递增）：

- `Kind.Think`（含 save_memory / todo_write）—— **不要加**，有隐式写入
- 只读 shell（`isShellCommandReadOnly()` 返回 true 的 Execute）—— `partitionToolCalls` 已有特判（`coreToolScheduler.ts` `partitionToolCalls` 注释里提到 "Execute (shell) is safe only when isShellCommandReadOnly() returns true"），现状已覆盖，无需改 `CONCURRENCY_SAFE_KINDS`
- MCP 工具按 `Kind` 分类 —— 各 MCP server 行为差异大，需要在工具注册时显式 opt-in 才安全

**结论**：当前集合已经合理，**Layer 3 不依赖扩展 `CONCURRENCY_SAFE_KINDS`**。本节存在的意义是：在收完 `batch_size` telemetry 数据后，**如果发现"并发 batch P50 < 期望值"，先检查是不是被 `partitionToolCalls` 切断而非模型不并发**。这是 Layer 3 A/B 失败时的一个诊断路径，不是必做项。

> 信用：codex review 提出"扩展 `CONCURRENCY_SAFE_KINDS` 是被忽略的杠杆"。核对后判断为：现状已有 `isShellCommandReadOnly` 特判覆盖最大头，扩展集合本身收益小、风险大；保留作为诊断路径。

---

## 4. 详细实施

### 4.1 Layer 1：Telemetry 扩展（1-2d）

#### 4.1.1 补 `prompt_id` 到 `SkillLaunchEvent`

**位置**：`packages/core/src/telemetry/types.ts:896`

当前 `SkillLaunchEvent` 仅含 `skill_name` + `success`，**无 `prompt_id`** — 无法跟同一 turn 内的其他 `ToolCallEvent` 关联。

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // 新增
  turn_index?: number;                  // 新增

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // 新增
    turn_index?: number,                // 新增
  ) { ... }
}
```

**调用方更新**：`packages/core/src/tools/skill.ts` 的 4 个 `logSkillLaunch` 调用点（L386, L399, L426, L482），传入 `this.params` 拿不到 `prompt_id` — `BaseToolInvocation` 仅持有 `params`，没有 `request.prompt_id` 字段。**实际实现**用鸭子类型方式注入：`SkillToolInvocation` 暴露 `setPromptId(id)` setter + 私有 `promptId` 字段，`CoreToolScheduler.buildInvocation`（`coreToolScheduler.ts:1253`）在 build 后 duck-type 调 `setPromptId(request.prompt_id)`，对齐既有 `setCallId` hook 的 pattern；invocation 在 `execute()` 内的 4 个 `logSkillLaunch` 都传 `this.promptId`。**早期版本的本节描述（"BaseToolInvocation 已有 request.prompt_id"）是错的**，已在 PR #4565 review 后更正。

#### 4.1.1b qwen-logger 链路修复（前置）

补 `prompt_id` 之前要先解决一个 **既存的链路断点**：`packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` 定义了 `logSkillLaunchEvent(event)` 方法，但**全仓库无任何调用方** —— `loggers.ts:958` 的 `logSkillLaunch` 直接走 `logs.getLogger(SERVICE_NAME).emit()` 这条 OTLP 路径，绕过了 qwen-logger。

后果：

- OTLP 路径上的 skill_launch 事件能到 OTLP collector（已工作），但 qwen-logger 那条专用上报链路目前是死的
- 如果 telemetry backend 是从 qwen-logger 消费（而非 OTLP），skill_launch 事件**完全不上报**
- §4.1.2 离线 SQL 派生 `SkillFollowupRecord` 依赖 skill_launch 事件落库 —— **必须先验证现在 skill_launch 在 backend 是否可见**

修复方向二选一：

- **A**（推荐）在 `loggers.ts:958` 的 `logSkillLaunch` 里加一行 `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)`，对齐 `logToolCall` 的 `loggers.ts:230` 写法
- **B** 确认 backend 只从 OTLP 消费，把 qwen-logger 里的 `logSkillLaunchEvent` 标 `@deprecated` 或删除

**为什么只补 QwenLogger 一条路径，不对齐 `logToolCall` 的 4 条全路径**：

`logToolCall`（`loggers.ts:220-247`）实际有 4 条出口：

1. `uiTelemetryService.addEvent(...)` — UI 展示
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — 聊天历史
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — qwen-logger 后端遥测
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch 是**纯后端遥测事件**，不需要在 UI 上展示（用户已经看到 SkillTool 的 returnDisplay）、也不需要进 ChatRecording 的 turn 历史（skill 内部的工具调用已经各自被 recordUiTelemetryEvent 记录）。因此只补第 3 条（QwenLogger），保留第 4 条（OTLP），跳过 1/2 是有意的，不是遗漏。

**字段透传细节**：`loggers.ts:961-966` 用 `{ ...event }` spread 自动透传新字段（`prompt_id` 加进 `SkillLaunchEvent` 后这条路自动生效），但 `qwen-logger.ts:908` 的 `logSkillLaunchEvent` 内部如果显式解构 `event.skill_name` / `event.success`，新字段不会自动纳入，需手动同步。

工作量：A 路径约 0.5d（含 backend 端确认）；B 路径约 0.2d（删代码 + 文档说明）。

#### 4.1.2 派生 `SkillFollowupRecord`（离线聚合）

不需要新事件类型 — `ToolCallEvent` 和 `SkillLaunchEvent` 都已带 `prompt_id`，离线 SQL 即可派生：

```sql
-- 伪 SQL，按实际 telemetry backend 调整
WITH skill_events AS (
  SELECT prompt_id, skill_name, timestamp FROM events
  WHERE event_name = 'skill_launch' AND success = true
),
tool_events AS (
  SELECT prompt_id, function_name, timestamp FROM events
  WHERE event_name = 'tool_call'
),
followups AS (
  SELECT s.skill_name, s.prompt_id,
         COUNT(t.function_name) AS followup_count,
         ARRAY_AGG(t.function_name) AS followup_tool_names
  FROM skill_events s
  LEFT JOIN tool_events t
    ON s.prompt_id = t.prompt_id AND t.timestamp > s.timestamp
  GROUP BY s.skill_name, s.prompt_id
)
SELECT skill_name,
       COUNT(*) AS invocations,
       AVG(followup_count) AS avg_followup,
       SUM(CASE WHEN followup_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS followup_rate
FROM followups
GROUP BY skill_name
ORDER BY invocations * followup_rate DESC;
```

#### 4.1.3 跑 telemetry 1 周收数据

- 不变更 user-facing 行为
- 不需要任何配置开关 — telemetry 已有 opt-in 框架（`telemetry.target` 设置项）
- 1 周后产出 skill ranking 报告

### 4.2 Layer 2：Skill 改造（per-skill 0.5-1d）

按 Layer 1 数据从 top-down 改造。每个 skill 一个独立 PR，PR description 必须包含：

1. **数据**：当前 invocation_count、followup_rate、top followup tools
2. **改造范围**：内联了哪些 followup（明确不内联什么）
3. **输出契约更新**：skill 描述里加了什么预声明
4. **A/B 计划**：改造后 2 周再观察 followup_rate

**注意事项**：

- Skill 内联 read 操作不要重复 read_file 的所有边界情况处理（编码、二进制检测等）— 调用 `read_file` 工具本身，不要重写
- Skill 内联 grep/glob 同理
- Skill 内联 shell 命令需走 `executeToolCall` 标准路径（保留 telemetry）
- **不要让 skill 体积爆炸**：内联 followup 后 skill 描述 > 500 tokens 时，拆分 skill 而不是合并

### 4.3 Layer 3：Prompt 教育（0.5d 改动 + 实测调优）

#### 4.3.1 加并发指导

**位置**：`packages/core/src/core/prompts.ts` `# Final Reminder` 段（L396）

加上节 3.3 的指导文本。具体措辞需 A/B —— 先用最朴素版本，根据并发率提升程度再细化。

#### 4.3.2 加 `batch_size` telemetry

**位置**：`packages/core/src/telemetry/types.ts` 的 `ToolCallEvent` 或新增轻量级 `ToolBatchEvent`

```typescript
// 选项 A：在 ToolCallEvent 上加字段（侵入小）
export class ToolCallEvent {
  ...
  batch_size?: number;        // 同一 batch 内 tool_call 数量
  batch_position?: number;    // 在 batch 内的位置 (0-indexed)
}

// 选项 B：新增 ToolBatchEvent（语义更清晰，需走完整新事件类型流程）
```

**推荐选项 A** — 改动小、查询时聚合方便。

**状态传递路径**（关键 — 这一步成本被早期版本低估）：

`coreToolScheduler.ts:2456` 的 `partitionToolCalls(callsToExecute)` 返回 `batches`，**但 batch 信息在调度路径上立刻丢失**：

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // 知道 batch.calls.length
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // 知道 batch.calls.length
           └─ executeSingleToolCall(call, ...)   // ❌ 已不知道 batch
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ 无 batch context
```

`ToolCallEvent` 的构造器（`types.ts:189`）只接收单个 `CompletedToolCall`，无 batch 字段。

修复方向：

- **方向 A**（推荐）：在 `ScheduledToolCall` 上加 `batchSize?: number` + `batchPosition?: number`。两条分支分别填充：
  - 并发分支（`coreToolScheduler.ts:2459-2460`，`batch.calls.length > 1`）：`runConcurrently(batch.calls, ...)` 进入循环前给每个 `call` 写 `batchSize = batch.calls.length`、`batchPosition = i`
  - 串行分支（`L2462-2464` 的 `for (const call of batch.calls)`）：单工具 batch 显式设 `batchSize = 1`、`batchPosition = 0`（**不要默认 undefined**，否则下游 telemetry 聚合时会把并发未生效的轮次误判为缺失数据）

  `new ToolCallEvent(call)` 在构造器里从 `call` 读这两个字段

- **方向 B**：改 `ToolCallEvent` 构造器签名 `new ToolCallEvent(call, batchInfo?)`，所有调用方同步改（4 个 logToolCall 调用点 + 测试）。改动面比 A 大

工作量：方向 A 约 0.5d 含单测；方向 B 约 1d（调用方多）。

**同步衡量"模型并发意愿"** — Layer 3 改 prompts.ts 前后，对比 `batch_size > 1 的 tool_call 占比` 分布。这是 Layer 3 是否生效的关键指标，没这个数据 Layer 3 A/B 无法收尾。

#### 4.3.3 cache 影响评估

`prompts.ts` 改动会让 DashScope ephemeral cache 一次性失效（首次请求 cache miss，之后恢复）。这是已知一次性成本，参见 `rt-optimization-design.md` §7.8 的 prompt 稳态审计。

---

## 5. 验收与度量

> **本节是 §0 验收 Spec 的"方法论"配套** — §0 声明"算成功的指标 + 阈值前置/后置时机"，§5 说明"怎么测、SQL 怎么写、A/B 怎么设计"。本节阈值是 §0.2 的当前占位，最终值在 P1.5 基线测量后锁定。

### 5.1 per-skill A/B 指标（改造后 2 周）

| 指标                                      | 验收线                   | 备注                       |
| ----------------------------------------- | ------------------------ | -------------------------- |
| 该 skill 的 `followup_rate`               | < 20%（改造前若为 70%+） | 主指标                     |
| 该 skill 触发场景的端到端 RT P50          | 下降 ≥ 2s                | 来自少一轮 LLM 调用        |
| 该 skill 的 `user_followup_within_30s` 率 | 不上升                   | 用户没追问 = 答案完整      |
| 该 skill 的 `success` 率                  | 不下降                   | 内联 followup 没引入新失败 |
### 5.2 Gesamt-RT-Indikatoren

| Metrik                                    | Baseline                              | Ziel nach Layer 2 Änderungen der Top-3-Skills |
| ----------------------------------------- | ------------------------------------- | --------------------------------------------- |
| End-to-End RT P50 (inkl. Skill-Konversationen) | 13,4 s (einzelne Stichprobe) / Baseline für ≥3 Szenarien-Klassen fehlt | Reduktion um 2–3 s                            |
| Tool batch P50 size (Layer 3)             | Noch zu messen                        | ≥ 1,3 (>30 % der Aufrufe mit Concurrent Batch) |
| Gewichtete Skill-Followup-Rate (Gesamt)   | Noch zu messen                        | Reduktion ≥ 30 %                              |

### 5.3 Abbruchkriterien – Wann dieses Vorhaben aufgegeben wird

**Ergebnisindikator-Stopplinien**:

- Nach Layer-1-Daten: **gewichtete Followup-Rate der Top-5-Skills < 30 %** → Wenig Raum für Rundenreduktion, Layer 2 lohnt sich nicht.
- Nach Änderung von 2 Skills in Layer 2: **End-to-End RT P50-Reduktion < 1 s** → Falscher Optimierungsansatz (möglicherweise ist Followup ein Schreibvorgang, den man nicht zusammenführen sollte), anhalten und analysieren.
- Zwei Wochen nach Layer-3-Prompt-Änderung: **batch_size P50 immer noch = 1** → Modell akzeptiert keine Parallelisierungsanweisungen; Layer 3 aufgeben, nur Layer 1+2 behalten.

**Prozessindikator-Stopplinien (vorbeugend, um zu vermeiden, dass die Maßnahme „scheinbar aktiv ist, aber keinen Nutzen bringt")**:

- **Skill-Trefferquote (beabsichtigter Skill vs. ausgewählter Skill) sinkt um ≥ 5 Prozentpunkte** → Skill-Beschreibung wurde so verschlechtert, dass das Modell den falschen Skill wählt. Typisches Szenario: Vor der Änderung traf die Benutzerfrage X immer auf skill_a zu; nach der Änderung wird sie gelegentlich zu skill_b geroutet, ohne einen Fehler zu verursachen (das Modell verwendet den falschen Skill, liefert aber notdürftig eine Antwort). Die Ergebnisindikatoren sehen normal aus, aber die Followup-Rate steigt stattdessen. **Messmethode**: In der Telemetrie `skill_invocation_pattern` hinzufügen – nach den ersten N Schlüsselwörtern des Benutzer-Prompts clustern und prüfen, welcher Skill in jedem Cluster hauptsächlich ausgelöst wird; vorher/nachher-Vergleich der Verschiebung des Top-1.
- **Fehlerrate bei inline-Followups des Skills ≥ 5 %** → Die Skill-Änderung hat ein zuvor nicht vorhandenes Fehlermuster eingeführt (z. B. inline `read_file` verursacht Speicherüberlauf bei großen Dateien). Messung: `SkillLaunchEvent.success` vorher/nachher vergleichen.
- **Benutzerabbrecherquote (Strg+C) pro Skill steigt um ≥ 2 Prozentpunkte** → Skill-Ausgabe wird langsamer oder länger, sodass Benutzer die Geduld verlieren. Messung: Anteil `ToolCallEvent.status === 'cancelled'`.

---

## 6. Anbindung an D1/D3

### 6.1 Beziehung zu D1

Nachdem Layer 2 die Top-Skills geändert hat, sind die **verbleibenden followup-lastigen Skills die eigentlichen Anwendungsfälle für D1 `skipLlmRound`** – diese Skills liefern bereits vollständige Ausgaben (keine Runde 2 nötig) und sind tatsächlich Endzustandsabfragen (Runde 3 Zusammenfassung wäre ebenfalls Verschwendung).

Ausführungsreihenfolge:

1. Layer-1-Telemetrie in Betrieb → 1 Woche Daten
2. Layer 2 ändert Top-2-3 Skills → A/B 2 Wochen
3. Layer-3-Prompt-Parallelisierung → 1 Woche Test
4. **Dann** D1 bewerten: Wie viele der verbleibenden häufigen Skills haben die Form „vollständige Ausgabe + Endzustandsabfrage" → ob sich 2–3 Tage Framework-Änderung lohnen.

### 6.2 Beziehung zu D3

D3 (`StreamingState.Summarizing`) ist eine Wahrnehmungsoptimierung und vollständig orthogonal zu diesem Vorschlag. Layer 1–3 reduzieren die **tatsächliche Anzahl der Runden**, D3 reduziert die **vom Benutzer wahrgenommene Wartezeit**. Wenn Layer 2 die RT bereits auf ein akzeptables Niveau gesenkt hat, sinkt der Wert von D3; andernfalls kann D3 zusätzlich eingesetzt werden.

---

## 7. Einschränkungen und bekannte Risiken

1. **Abdeckung durch Änderungsumfang begrenzt** – Wenn 10 Skills geändert werden, werden nur die Szenarien dieser 10 Skills abgedeckt. Aber der Nutzen ist bestimmbar, messbar und verzinst sich.
2. **Inline-Followups des Skills können einzelne Skills schwerer machen** – Beschreibungsumfang wächst, Laden wird langsamer, Wiederverwendbarkeit sinkt. Layer-2-Checkliste Punkt 5 schützt davor.
3. **Layer 3 Modell ignoriert möglicherweise Parallelisierungsanweisungen** – qwen-coder-Trainingsdaten tendieren zu serieller Ausführung; A/B-Daten könnten zeigen, dass Prompt-Änderungen wirkungslos sind – bekanntes Fehlermuster.
4. **Datenschutzgrenzen der Telemetrie** – `SkillFollowupRecord` sollte keine Tool-Parameter aufzeichnen (standardmäßig aus `ToolCallEvent.function_args` bezogen, aber es muss geprüft werden, ob `skill_name` die Benutzerabsicht preisgibt).
5. **Nicht anwendbar auf Sub-Agent / Cron / Benachrichtigungen** – Diese Pfade durchlaufen das Skill-System nicht; dieser Vorschlag deckt sie nicht ab.
6. **Dünne Basisdaten** – Nutzt die einzelne Stichprobe aus `rt-optimization-design.md` §1.2; vor Layer-2-Implementierung müssen Baselines für ≥3 Szenarien-Klassen ergänzt werden.
7. **Erweiterung des `logSkillLaunch`-Feldes zerstört bestehende Telemetrie-Consumer** – 4 Aufrufstellen und nachgelagerte Logger müssen synchron angepasst werden.
8. **`qwen-logger.ts:908` `logSkillLaunchEvent` ist derzeit toter Code** – Keine Aufrufer im Repository; §4.1.1b listet bereits vorherige Reparatur auf.

### 7.1 Abgrenzung zu bestehenden Framework-Mechanismen (nicht im Umfang dieses Vorschlags)

Das Repository enthält mehrere Framework-Mechanismen, die indirekt mit der Rundenreduktion zusammenhängen. **Dieser Vorschlag erfindet sie nicht neu und ersetzt sie nicht**:

| Bestehender Mechanismus                                 | Ort                                  | Beziehung zu diesem Vorschlag                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (parallele Ausführung) | `coreToolScheduler.ts:775, 2473`     | Layer 3 nutzt direkt; dieser Vorschlag ändert es nicht.                                                                                                    |
| `CONCURRENCY_SAFE_KINDS` (legt fest, welche Tools parallel ausgeführt werden können) | `tools/tools.ts:818`                 | §3.3.1 hat den aktuellen Stand als angemessen begründet, keine Erweiterung.                                                                                |
| `FileReadCache` (vermeidet wiederholtes Lesen derselben Datei) | `services/fileReadCache.ts`          | Beeinflusst indirekt Runden, in denen das Modell dieselbe Datei erneut liest; bereits wirksam. Dieser Vorschlag ist nicht darauf angewiesen und verstärkt es nicht. |
| `chatCompressionService` (Verlaufskomprimierung)       | `services/chatCompressionService.ts` | Orthogonal zu Runden (beeinflusst Kosten pro Runde, nicht die Anzahl); identisch mit dem `wouldTriggerCompression`-Gate von `rt-optimization-design.md` §3.2 Fast-Route. |

Diese Auflistung dient dazu, zu vermeiden, dass der Eindruck entsteht, „dieser Vorschlag hätte bestehende Mechanismen ignoriert".

---

## 8. Implementierungszeitplan

> **Voraussetzung: Dieser Zeitplan beginnt mit P-1 und kann nicht übersprungen werden.** P-1 ist die vorherige Überprüfung der Akzeptanz-Spezifikation aus §0, ein Aufwand von 0,5 Tagen, aber **obligatorisch** – wenn nicht bestanden, wird P0 nicht gestartet. Diese Einschränkung soll das Anti-Pattern „erst Code schreiben, dann Spec nachreichen" verhindern: Eine nachträgliche Spec bedeutet, dass die Entscheidung „Erfolg" auf die Zeit nach dem Ergebnis verschoben wird, was zu Verzerrungen führen kann, wenn die Spec nachjustiert wird, um die Indikatoren besser aussehen zu lassen (siehe das Scheitern des D2-Pfads in `rt-optimization-design.md` §7).

| Phase     | Inhalt                                                                   | Aufwand                | Ergebnis                        | Spec-Verriegelungsaktion                          |
| --------- | ------------------------------------------------------------------------ | ---------------------- | ------------------------------- | ------------------------------------------------- |
| **P-1**   | Vorherige Spec-Überprüfung                                               | 0,5 d                  | §0.1 / §0.3 verriegelt          | **§0.1 Engineering-Spec + §0.3 Stopplinien verriegeln** |
| **P0**    | qwen-logger-Pfad-Reparatur (§4.1.1b vorher)                              | 0,5 d                  | Sichtbarkeit von skill_launch-Ereignissen bestätigt | §0.1 Punkt 1 validieren                           |
| **P1**    | Layer 1 Telemetrie: `prompt_id`-Feld ergänzen + Offline-SQL              | 1–2 d                  | Skill-Ranking-Bericht           | §0.1 Punkte 2/3/4 validieren                      |
| **P1.5**  | 1 Woche Datensammlung + Basismessung (≥3 Szenarien-Klassen × ≥10)        | 1 Woche                | Entscheidung, welche 2–3 Skills geändert werden | **§0.2 Schwellwerte verriegeln + §0.1 Punkt 5 validieren** |
| **P2**    | Layer 2 Änderung Top-1-Skill (PR + A/B)                                  | 0,5–1 d Änderung + 2 Wochen Beobachtung | Followup-Rate ↓, RT P50 ↓ validieren | **Im PR §0.4 per-Skill-Spec deklarieren**         |
| **P3**    | Layer 3 Prompt-Parallelisierung + `batch_size`-Telemetrie (inkl. §4.3.2 Zustandsübergabe) | 1–1,5 d Änderung + 1 Woche Test | batch_size-Verteilung            | §0.2 Punkt 3 validieren                           |
| **P4**    | Layer 2 weiter: Top-2 / Top-3 Skill ändern (parallel zu P3)             | 0,5–1 d × N            | Kumulierte RT P50-Reduktion      | In jedem PR §0.4 deklarieren                      |
| **P5**    | Bewertung, ob D1 noch sinnvoll ist                                       | Entscheidungsmeeting   | Roadmap-Aktualisierung           | –                                                 |

**Wichtige Entscheidungspunkte (gemäß §0.3 Stopplinien)**:

- **Ende P-1**: Bei §0.1 / §0.3 wird kein Konsens erzielt → P0 nicht starten.
- **Ende P1.5**: §0.3 Ergebnisindikator #1 trifft ein (gewichtete Followup-Rate der Top-5 < 30 %) → Richtung abbrechen; andernfalls §0.2 Schwellwerte verriegeln.
- **Ende P2**: §0.3 Ergebnisindikator #2 trifft ein (RT P50 nach Top-1-Änderung ↓ < 1 s) oder einer der Prozessindikatoren → anhalten und analysieren.
- **Ende P3**: §0.3 Ergebnisindikator #3 trifft ein (batch_size P50 immer noch = 1) → Layer 3 aufgeben.
- **P5**: ROI von D1 basierend auf der Form der verbleibenden Skills entscheiden.

---

## 9. Wichtige Code-Positionen

| Datei                                                        | Wichtige Symbole                                                  | Position                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------ |
| `packages/core/src/telemetry/types.ts`                       | `ToolCallEvent` (mit `prompt_id` / `duration_ms`)                 | L170                                 |
| `packages/core/src/telemetry/types.ts`                       | `SkillLaunchEvent` (muss `prompt_id` ergänzen)                    | L896                                 |
| `packages/core/src/telemetry/loggers.ts`                     | `logToolCall`                                                     | L220                                 |
| `packages/core/src/telemetry/loggers.ts`                     | `logSkillLaunch` (via OTLP; fehlende qwen-logger-Weiterleitung)   | L958                                 |
| `packages/core/src/telemetry/loggers.ts`                     | `logToolCall` (doppelter Pfad: OTLP + qwen-logger, als Reparaturvorlage) | L220, L230                           |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`     | `logSkillLaunchEvent` (**derzeit toter Code**, §4.1.1b vorheriges Reparaturziel) | L908                                 |
| `packages/core/src/core/coreToolScheduler.ts`                | `partitionToolCalls`                                              | L775                                 |
| `packages/core/src/core/coreToolScheduler.ts`                | `runConcurrently` / Batch-Scheduling                              | L2456, L2473                         |
| `packages/core/src/core/coreToolScheduler.ts`                | `logToolCall`-Aufrufstelle (Endpunkt für batch_size-Zustandsübergabe) | L3163                                |
| `packages/core/src/services/fileReadCache.ts`                | `FileReadCache` (bereits vorhanden, beeinflusst wiederholte Lese-Runden) | L135                                 |
| `packages/core/src/tools/skill.ts`                           | `SkillTool` + 4 `logSkillLaunch`-Aufrufstellen                    | L386, L399, L426, L482               |
| `packages/core/src/skills/skill-manager.ts`                  | `SkillManager` (Skill-Registrierung/Laden)                        | Gesamte Datei                        |
| `packages/core/src/skills/skill-load.ts`                     | Skill-Beschreibungsladen (Einstiegspunkt für Output-Contract-Änderungen) | Gesamte Datei                        |
| `packages/core/src/tools/tools.ts`                           | `Kind` + `CONCURRENCY_SAFE_KINDS`                                 | L793, L818                           |
| `packages/core/src/core/coreToolScheduler.ts`                | `partitionToolCalls` + `runConcurrently` (vorhandene Parallelisierungsinfrastruktur) | Siehe rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                          | `# Final Reminder`-Abschnitt (Stelle für Layer 3, um Parallelisierungsanweisungen hinzuzufügen) | L396                                 |
| `.qwen/skills/`                                              | Verzeichnis für Skill-Definitionen (Layer-2-Änderungsobjekte)     | Verzeichnis                          |