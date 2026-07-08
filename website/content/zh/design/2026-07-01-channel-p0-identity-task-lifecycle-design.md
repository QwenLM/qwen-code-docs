# Channel P0 身份与任务生命周期设计

## 目标

实现 channel 常驻多智能体的首个 P0 基础设施：channel 作用域身份和 memory 边界元数据，以及在 `@qwen-code/channel-base` 中共享的任务生命周期 hook。

本次设计有意不添加 Slack adapter、daemon 事件流、adapter UI 更改、主动调度、跨 channel 上下文或真正的 core-memory 路径隔离。

## 背景

`qwen channel` 已经支持消息 adapter、共享 session、发送者归因、分发模式、流式 chunk、tool-call 回调、取消，以及飞书卡片等平台特定的进度展示。缺失的 P0 产品层是一个稳定的方式来表达“此 channel 拥有其专属的常驻 agent 身份”以及“此 prompt 轮次具有 adapter 可观察的生命周期”。

Issue #6103 跟踪了这个聚焦的切片。它建立在 #5887 中更广泛的 qwen tag 路线图之上，但保持此 PR 足够小，以便独立 review 和 ship。

## 范围

范围内：

- 向 `ChannelConfig` 添加可选的 channel 身份元数据。
- 向 `ChannelConfig` 添加可选的 memory-scope 元数据。
- 当省略新配置时，推导安全的默认值。
- 将简洁的 channel 边界说明注入到每个 agent session 的第一个 prompt 中，与现有的 channel instructions 一起。
- 在 `ChannelBase` 上添加受保护的 `onTaskLifecycle(event)` hook。
- 从共享的 channel 流程中为 prompt 开始、text chunk、tool call、取消、完成和错误发出生命周期事件。
- 在 `packages/channels/base` 中添加聚焦的包本地测试。

范围外：

- Core memory 存储更改或文件路径命名空间隔离。
- Daemon/SSE 事件发布。
- 飞书、钉钉、Telegram、微信或 QQ 的 UI 更改。
- 新的 platform adapter。
- Token 预算、tool ACL 或跨 channel 上下文共享。

## 设计

### Channel 身份

添加一个小型可选配置对象：

```ts
export interface ChannelIdentityConfig {
  id?: string;
  displayName?: string;
  description?: string;
}
```

`ChannelConfig` 增加 `identity?: ChannelIdentityConfig`。

在运行时，`ChannelBase` 推导：

- `id`：`config.identity.id` 或 `channel:<name>`
- `displayName`：`config.identity.displayName` 或 `<name>`
- `description`：`config.identity.description`（如果存在）

运行时身份仅为元数据。它不会更改 session 路由、访问控制或 platform adapter 行为。

### Memory Scope 元数据

添加：

```ts
export type ChannelMemoryScopeMode = 'metadata-only';

export interface ChannelMemoryScopeConfig {
  namespace?: string;
  mode?: ChannelMemoryScopeMode;
}
```

`ChannelConfig` 增加 `memoryScope?: ChannelMemoryScopeConfig`。

在运行时，`ChannelBase` 推导：

- `namespace`：`config.memoryScope.namespace` 或 `channel:<name>`
- `mode`：在此 PR 中始终为 `'metadata-only'`

这故意不是一个真正的 core-memory 命名空间。它是一个显式的、可检查的边界标记和 prompt 指令，以便后续工作可以将相同的命名空间接入 core memory 路径，而无需更改 channel 配置结构。

### Prompt 边界注入

`ChannelBase` 已经在每个 session 中前置 `config.instructions` 一次；该行为保持不变。仅当 channel 配置了 `identity` 或 `memoryScope` 时，才会将下面生成的边界说明添加到同一次首条消息注入中（仅配置 instructions 的 channel 保持现有的 prompt 结构）。它被追加在自定义 instructions 之后，以便边界具有近期优先权：

```text
Channel 身份：
- id: channel:ops
- 显示名称：Ops Bot
- 描述：帮助 ops 组协调仓库维护。

Memory scope：
- namespace: qwen-tag:ops
- mode: metadata-only
- 来自其他 channel 的数据不得共享。
```

确切的措辞应足够简洁和稳定以用于测试，但要避免过度承诺隔离性。如果不存在 description，则省略该行。

此说明在每个 agent session 中注入一次，与现有 instructions 类似（瞬态 channel-memory 读取失败会在下一轮重试整个上下文块，因此连续的轮次可能会重复它）。当 bridge 报告 session 死亡时，现有的 `instructedSessions` 清理机制继续允许为下一个 session 重新注入。

为了兼容性，没有 `instructions`、`identity` 或 `memoryScope` 配置的 channel 保持现有的原始 prompt 结构。运行时身份和 memory 元数据仍会为生命周期事件和 status 命令进行推导。

### Status 可见性

使用身份和 memory 元数据扩展 `/who` 和 `/status`：

- `/who` 应包含身份显示名称和 memory namespace。
- `/status` 应包含身份 id 和 memory mode。

保持输出简短。不要暴露绝对路径或隐藏配置。

### 任务生命周期 Hook

添加一个可辨识联合类型：

```ts
export type ChannelTaskLifecycleEvent =
  | {
      type: 'started';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'text_chunk';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      chunk: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'tool_call';
      channelName: string;
      chatId: string;
      sessionId: string;
      toolCall: ToolCallEvent;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'cancelled';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      reason: 'cancel_command' | 'clear' | 'steer' | 'timeout';
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'completed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    }
  | {
      type: 'failed';
      channelName: string;
      chatId: string;
      sessionId: string;
      messageId?: string;
      error: string;
      identity: ChannelRuntimeIdentity;
      memoryScope: ChannelRuntimeMemoryScope;
    };
```

`ChannelBase` 添加：

```ts
protected onTaskLifecycle(_event: ChannelTaskLifecycleEvent): void {}
```

默认行为是 no-op。Adapter 可以稍后选择加入，而无需更改 prompt 执行路径。

### 生命周期事件触发点

从共享的 `ChannelBase` 流程中发出：

- `started`：在 `activePrompts.set()` 之后立即触发，并在 `onPromptStart()` 之前。
- `text_chunk`：当 prompt 的 `textChunk` 监听器接受一个未取消的 chunk 时。
- `tool_call`：在现有的 bridge tool-call 监听器中，解析 session 目标之后。
- `cancelled`：当 `/cancel` 成功时，当 `/clear` 取消或驱逐一个活跃的 prompt 时，以及当 `steer` 将活跃轮次标记为已取消时。
- `completed`：在 `bridge.prompt()` resolve 之后，以及在 `onResponseComplete()` 之前或之后，只要该轮次未被取消。
- `failed`：当 `bridge.prompt()` 或响应传递抛出异常时。

生命周期 hook 失败应被捕获并记录到 stderr。Platform adapter 的生命周期 UI 不得中断 prompt 执行或清理。

## 错误处理

- 在此 PR 中，无效的 identity 或 memory 字段不是致命的；配置解析应保留现有的宽松结构，并仅在已存在显式解析的地方接受字符串字段。
- 生命周期 hook 异常在输出 stderr 诊断信息后会被静默处理。
- Memory scope mode 被限制为 `'metadata-only'`；省略或未知的配置应解析为 `'metadata-only'`，而不是启用不存在的行为。

## 测试

`packages/channels/base/src/ChannelBase.test.ts` 中的聚焦测试应涵盖：

- 默认的 identity 和 memory 元数据从 channel 名称推导。
- 自定义的 identity 和 memory namespace 包含在第一个 prompt 中。
- 边界元数据在每个 session 中注入一次，并在 `sessionDied` 后重新注入。
- `/who` 和 `/status` 包含新元数据，且不泄露 cwd。
- `onTaskLifecycle` 接收到 `started`、`text_chunk`、`tool_call`、`completed`。
- `onTaskLifecycle` 接收到 `/cancel`、`/clear` 和 `steer` 的 `cancelled`。
- 当 `bridge.prompt()` reject 时，`onTaskLifecycle` 接收到 `failed`。
- 抛出异常的生命周期 hook 不会 reject `handleInbound()`。

使用包本地命令：

```bash
cd packages/channels/base
npx vitest run src/ChannelBase.test.ts
```

PR 前的最终验证：

```bash
npm run build
npm run typecheck
```

## 待定决策

此 PR 无待定决策。真正的 core-memory 命名空间强制执行、daemon 发布、adapter UI、tool/data ACL、预算和主动跟进明确为未来工作。