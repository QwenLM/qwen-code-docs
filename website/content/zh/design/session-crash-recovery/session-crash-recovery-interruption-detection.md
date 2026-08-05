# 会话崩溃恢复与统一恢复服务设计

## 1. 设计目标

Recovery Service 是会话恢复的统一决策层。它读取恢复出的会话历史，对
当前恢复状态分类，构建继续执行所需的协议修复和续接负载，并向 TUI、
daemon、SDK 和无头入口暴露相同的结果。

现有能力包括：

- 仅追加的 JSONL 会话存储。
- 会话加载与 API 历史重建。
- 孤立 `tool_use` / `tool_result` 修复。
- 三态中断检测。
- 无头、nonInteractive 控制和 ACP 的 continue 入口。

当前的主要问题并不是恢复能力完全缺失。问题在于：

- 恢复决策分散在多个入口。
- TUI / daemon / SDK 看到的恢复状态不一致。
- 修复在低层隐式发生，对用户或客户端不可见。
- 任何未来的恢复状态都需要反复接入多个入口。

统一 Recovery Service 的目标是：

- 统一分类：每个入口使用相同的恢复计划。
- 统一修复：每个入口复用相同的工具对修复和中断分类。
- 统一可见性：TUI / daemon / SDK 都能判断一次恢复是干净的、被中断的
  还是降级的。
- 统一调试数据：修复、合成结果和丢弃以结构化输出暴露，用于展示和日志。
- 统一测试：相同的崩溃夹具可以覆盖核心计划和每个入口适配器。

## 2. 核心设计：Recovery Service

新增一个核心服务：

```text
packages/core/src/core/session-recovery.ts
```

它不渲染 UI，也不执行工具。它唯一的职责是从会话转录和当前聊天历史生成
确定性的 `SessionRecoveryPlan`。

建议的类型：

```ts
export type SessionRecoveryKind =
  | 'clean'
  | 'interrupted_prompt'
  | 'interrupted_turn'
  | 'degraded_history';

export type RecoveryRepair =
  | { type: 'synthesized_tool_result'; callId: string; name: string }
  | { type: 'dropped_duplicate_tool_result'; callId: string; name: string }
  | { type: 'history_gap'; childUuid: string; missingParentUuid: string };

export interface SessionRecoveryPlan {
  planId: string;
  sessionId: string;
  kind: SessionRecoveryKind;
  originalApiHistory: Content[];
  apiHistory: Content[];
  repairs: RecoveryRepair[];
  canContinue: boolean;
  canAutoContinue: boolean;
  requiresUserConfirmation: boolean;
  visibleNotice?: string;
  continuation?: {
    mode: 'retry_user_parts' | 'tool_result_parts';
    parts: Part[];
    displayText: string;
  };
}
```

建议的入口：

```ts
export function buildSessionRecoveryPlan(input: {
  sessionId: string;
  conversation: ConversationRecord;
  historyGaps?: HistoryGap[];
  options?: {
    allowAutoContinue?: boolean;
  };
}): SessionRecoveryPlan;
```

核心流程：

1. 从 `ConversationRecord` 构建 `originalApiHistory`。
2. 如果存在不可忽略的 `historyGaps`，将会话分类为 `degraded_history`。
3. 对 `originalApiHistory` 运行 `detectTurnInterruption`。这必须发生在
   修复之前。否则悬空的 `model[functionCall]` 会先被合成的
   `functionResponse` 闭合，使状态无法被分类为 `interrupted_turn`。
4. 将 `originalApiHistory` 克隆为 provider 安全的历史，在克隆上运行现有
   的 `repairOrphanedToolUseTurns`，并把结果存入 `plan.apiHistory`。
5. 依据分类构建续接负载：
   - `interrupted_prompt`：以 Retry 语义重放尾部用户部分。
   - `interrupted_turn`：用合成的错误 `functionResponse` 部分闭合悬空的
     工具调用。
6. 为 UI / daemon / SDK 展示和调试生成 `visibleNotice` 和 `repairs`。

命名兼容性：

- 继续使用现有的公共协议字符串 `interrupted_turn`；不要添加
  `interrupted_tool_turn`。nonInteractive 控制、ACP 和现有测试已经依赖
  `interrupted_turn`，Recovery Service 不应增加迁移成本。

## 3. Recovery Service 的角色与价值

### 3.1 健壮性

统一的服务把当前隐式且分散的恢复行为变成一个显式的状态机。

现状：

- 恢复初始化会修复孤立的 `tool_use` 条目，但入口并不总是知道该修复发生
  过。
- 无头 / ACP 可以继续，但 TUI 不知道该告诉用户什么。
- 父链间隙已经有部分可见处理：`SessionService.loadSession` 返回
  `historyGaps`，TUI / ACP 可以显示间隙通知。但是，仍然没有统一的恢复
  元数据或一致的安全模式策略。

引入 Recovery Service 之后：

- 每次恢复首先产生一个显式状态：`clean`、`interrupted_prompt`、
  `interrupted_turn` 或 `degraded_history`。
- 任何入口都可以基于同一个计划决定是继续、通知还是降级。
- 历史间隙不会被静默当作干净历史。
- 如果以后新增恢复状态，只需扩展计划构建；每个入口都不需要重新实现逻辑。

健壮性收益在于，恢复从“每个地方按需修一点”变为“每次恢复有一个统一的
分类结果”。

### 3.2 安全性

恢复中最大的安全风险是自动重复有副作用的动作，例如 shell 命令、文件写入
或外部 API 调用。

Recovery Service 的安全原则：

- 默认不自动重放未知工具。
- 默认把悬空的工具调用转换为失败的 `functionResponse` 部分，让模型决定
  是否重试。
- `interrupted_turn` 默认 `requiresUserConfirmation = true`，除非调用方
  显式选择加入。
- `degraded_history` 绝不自动继续。
- 所有合成修复都包含在 `repairs` 中，用于日志和调试。

这优先保证了：

- Provider 不会收到无效历史。
- 用户不会因为恢复逻辑而重复危险动作。
- TUI / SDK 可以清楚展示哪些工具结果是作为恢复失败合成的。

安全价值在于，恢复不会盲目继续执行。它先修复协议形态，再以保守策略继续。

### 3.3 完整性

本设计不会立即解决每一个崩溃场景。它聚焦于当前能力可以可靠分类的状态。

立即覆盖：

- 干净恢复。
- 尾部用户 prompt：`interrupted_prompt`。
- 尾部工具结果提交：同样分类为 `interrupted_prompt` 并以 Retry 重放。
- 悬空工具调用：`interrupted_turn`，附带合成的错误工具结果。
- 非相邻工具结果：现有修复将其提升到合法位置。除非修复 API 之后扩展为
  返回提升详情，本计划的第一版不单独记录它们。
- 重复工具结果：丢弃重复项。
- 父链间隙：`degraded_history`。

尚未覆盖：

- 中途断开但留下看似普通模型文本尾部的模型文本流。
- 优雅中止与未知崩溃之间的细粒度区分。

这里的完整性不来自一次性增加大量代码。它来自把当前能力整合到统一计划中，
使今天可以分类的状态得到一致处理。

### 3.4 工程架构

Recovery Service 应位于 core，而不是 CLI、TUI、daemon 或任何单一入口。

原因：

- `SessionService`、`buildApiHistoryFromConversation`、`GeminiChat` 修复
  和 `detectTurnInterruption` 都在 core 或 core 相邻层。
- TUI / 无头 / ACP / daemon / SDK 是适配器。
- 恢复分类是领域逻辑，不是 UI 渲染逻辑。

建议的分层：

```text
SessionService
  Read JSONL, rebuild ConversationRecord, return historyGaps

SessionRecoveryService
  Build RecoveryPlan from ConversationRecord + historyGaps

GeminiClient / GeminiChat
  Consume plan.apiHistory to initialize chat
  Execute plan.continuation when needed

TUI / headless / ACP / daemon / SDK
  Display plan.visibleNotice
  Trigger continuation from user or API requests
```

该分层的收益：

- Core 拥有事实和决策。
- UI 拥有展示。
- daemon / SDK 拥有协议输出。
- 测试可以直接演练核心计划，无需启动完整 TUI。

### 3.5 可见性与可调试性

Recovery Service 产生的计划应可转换为两类输出：

1. 用户可见通知：

```text
The previous session stopped after tool execution. Marked 2 unfinished tool
calls as failed so the history can be sent safely. You can continue the task;
the model will decide whether to retry based on the failure results.
```

2. 调试日志或可选的系统记录：

```ts
type RecoveryDebugPayload = {
  planId: string;
  kind: SessionRecoveryKind;
  repairs: RecoveryRepair[];
  timestamp: string;
};
```

这些信息不进入 API 历史。它只用于诊断、导出和调试。将其持久化为系统记录
可以推迟，不是本设计的硬性要求。

价值：

- 用户知道恢复期间发生了什么。
- SDK 客户端可以展示准确状态。
- Bug 报告可以包含 `planId` 和 `repairs`。
- 同一个被中断的尾部不太可能被多次自动继续。

## 4. 入口集成

### 4.1 TUI

在 `/resume` 或以 `--resume` 启动之后：

1. `SessionService.loadSession(sessionId)`。
2. `buildSessionRecoveryPlan(...)`。
3. `config.startNewSession(sessionId, sessionData, recoveryPlan)`，或保留
   该计划的等效机制。
4. 加载 UI 历史。
5. 如果 `plan.kind !== 'clean'`，插入一个 INFO 项。
6. 提供 `/continue` 或“继续被中断的轮次”动作。

TUI 默认不自动继续 `interrupted_turn` / `degraded_history`。

### 4.2 无头 / nonInteractive 控制

`continueInterrupted` 或 `continue_last_turn` 不再直接调用分散的检测器。
而是：

1. 从当前聊天历史或恢复出的会话构建计划。
2. 如果 `plan.canContinue = false`，返回无操作。
3. 如果允许继续，执行 `plan.continuation`。

### 4.3 ACP / daemon

在 `loadSession` / `resumeSession` 响应中添加恢复元数据：

```ts
{
  recovered: boolean;
  recoveryKind: SessionRecoveryKind;
  canContinue: boolean;
  requiresUserConfirmation: boolean;
  repairs: {
    type: string;
    count: number;
  }
  [];
}
```

`continueLastTurn` 也应基于该计划接受 / 拒绝，然后在执行前立即重新校验。

### 4.4 SDK

SDK 集成需要区分两类：

- daemon 支撑的 SDK：从 daemon `loadSession` / `resumeSession` 响应消费
  恢复元数据，显示恢复横幅，并允许用户或宿主应用触发继续。
- 进程支撑的 SDK：通过 `ProcessTransport` 启动 CLI 并使用 `--resume` /
  `--continue` 标志。它需要通过 stream-json 系统消息或 SDK 协议字段暴露
  等效的恢复元数据。

两类 SDK 都不应直接理解低层 JSONL 或工具对修复。它们只应消费入口层暴露的
结构化恢复结果，并应在降级状态下阻止自动继续。

## 5. 单元测试设计

Recovery Service 必须有独立的单元测试，不依赖 TUI 或真实 provider。

核心夹具：

1. 干净历史：
   - 模型文本尾部。
   - 完整工具调用 + 工具结果 + 最终模型。

2. `interrupted_prompt`：
   - 最后一条是用户文本。
   - 最后一条是一组用户 functionResponse 部分。
   - 多条尾部用户条目。

3. `interrupted_turn`：
   - 没有 functionResponse 的模型 functionCall。
   - 多个 functionCall 只有部分完成。
   - 没有 id 的 functionCall 被跳过。

4. 修复：
   - 非相邻 functionResponse 被提升，provider 安全历史合法。
   - 重复 functionResponse 被丢弃。
   - 合成工具结果形态与现有修复保持一致。

5. `degraded_history`：
   - `historyGaps` 非空。
   - 确认 `canAutoContinue = false`。
   - 确认 `visibleNotice` 包含间隙信息。

6. 压缩检查点：
   - 最新压缩之后的尾部被正确检测。
   - 系统记录不进入 API 历史。

入口适配器测试：

- TUI `/resume` 在收到非干净计划后插入 INFO 项。
- 无头 `continueInterrupted` 使用计划续接且不重复用户消息。
- ACP `continueLastTurn` 对相同夹具返回相同的恢复类别。
- daemon `loadSession` 响应包含恢复元数据。

关键测试目标是：相同的历史夹具应在 core / TUI / ACP / daemon 中产生相同
的恢复类别。

## 6. 结论

统一的 Recovery Service 是当前阶段价值最高的变更，因为它主要是整合现有
能力，而不是立即引入许多新机制。

它的直接价值：

- 使恢复状态在 TUI / daemon / SDK / 无头之间保持一致。
- 把现有的孤立 `tool_use` 修复从隐式的防 400 步骤变为显式的恢复计划。
- 把被中断轮次的继续从局部的无头 / ACP 能力变为可复用的核心能力。
- 为未来的恢复状态提供稳定的扩展点。

它本身并不解决每一个崩溃问题，尤其是文本流中途崩溃。本文档有意把这些扩展
排除在本轮范围之外，以避免过度设计。当前目标是统一已经存在且可以可靠分类
的恢复能力。
