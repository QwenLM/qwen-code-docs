# Daemon UI SDK — 开发者指南

`@qwen-code/sdk/daemon` 子路径提供了供 daemon 客户端使用的共享 UI 基础组件。当前适配目标为 web chat 和 web terminal；原生本地 TUI、channel 和 IDE 集成在 daemon UI 协议稳定之前保持各自的默认路径。本指南介绍 PR #4353（PR #4328 共享 UI transcript 层的统一跟进版本）引入的 API 接口。

## 三层模型

```
Daemon SSE wire（NDJSON envelopes）
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← 渲染器在此接入
```

- **Normalizer**：接收原始 daemon SSE envelopes，返回类型化的 UI 事件
- **Reducer**：将事件累积到 transcript 状态机中
- **Render helpers**：将状态 blocks 投影为可渲染的字符串

## 快速上手

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// 在任意订阅者中读取状态
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## 事件分类（28+ 种类型）

`DaemonUiEvent` 是所有面向 UI 事件的可辨别联合类型：

### Chat 流事件

| 事件                         | 触发时机                                              |
| ---------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | 来自 daemon 的用户消息分块到达                        |
| `assistant.text.delta`       | 助手流式分块                                          |
| `assistant.done`             | Prompt 完成（来自 sendPrompt resolve）                |
| `thought.text.delta`         | Agent 推理分块                                        |
| `tool.update`                | 工具调用生命周期（running / completed / cancelled）   |
| `shell.output`               | Shell 工具 stdout/stderr 分块                         |
| `permission.request`         | 工具需要用户授权                                      |
| `permission.resolved`        | 权限决策已到达                                        |
| `model.changed`              | 会话模型已切换                                        |
| `status` / `debug` / `error` | Status / debug / error blocks                         |

### Session 元数据事件（PR-A）

| 事件                            | 触发时机                                             |
| ------------------------------- | ---------------------------------------------------- |
| `session.metadata.changed`      | 会话标题 / 显示名称已更新                            |
| `session.approval_mode.changed` | 模式切换（plan / default / yolo / auto-edit）        |
| `session.available_commands`    | Slash 命令列表已刷新                                 |

### Workspace 事件（PR-A，Wave 3-4）

| 事件                                   | 触发时机                              |
| -------------------------------------- | ------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / memory 文件已修改          |
| `workspace.agent.changed`              | Sub-agent 已创建 / 更新 / 删除       |
| `workspace.tool.toggled`               | 内置工具已启用 / 禁用                 |
| `workspace.initialized`                | `qwen init` 已完成                   |
| `workspace.mcp.budget_warning`         | MCP 子进程数量接近上限                |
| `workspace.mcp.child_refused`          | MCP 服务器因预算原因拒绝              |
| `workspace.mcp.server_restarted`       | 手动重启 MCP 成功                     |
| `workspace.mcp.server_restart_refused` | 手动重启被阻止                        |

### Auth device-flow 事件（PR-A，Wave 4 OAuth）

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

每个事件携带 daemon 的 `deviceFlowId`。Failed 事件携带一个封闭枚举 `errorKind`（封闭枚举 — 规范列表请参见从 `@qwen-code/sdk/daemon` 导出的 `KNOWN_DEVICE_FLOW_ERROR_KINDS`，当前包含：`expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`）。

## 渲染协议（PR-D）

三个投影辅助函数，一个预览辅助函数。均通过 `block.kind` 或 `preview.kind` 进行判别：

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Cookbook：将 transcript 渲染为 markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Cookbook：渲染为经过净化的 HTML 用于 SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // 两阶段管道：markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

或使用内置的保守型 HTML 渲染器（无 markdown 解析，仅 HTML 转义）：

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Cookbook：复制为纯文本

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## 工具预览分类（13 种）

| Kind                  | 说明                                              |
| --------------------- | ------------------------------------------------- |
| `ask_user_question`   | 带选项的多选问题                                  |
| `command`             | Bash 风格命令 + cwd                               |
| `file_diff`           | 文件编辑，包含 oldText/newText 或 patch           |
| `file_read`           | 路径 + 可选行范围                                 |
| `web_fetch`           | URL + HTTP 方法                                   |
| `mcp_invocation`      | MCP 服务器 + 工具 + 参数摘要                      |
| `code_block`          | 带语言标签的代码片段                              |
| `search`              | 查询 + 结果数量 + 顶部结果                        |
| `tabular`             | 列 + 行（上限 50 条，截断时有标记）               |
| `image_generation`    | Prompt + 可选缩略图 URL                           |
| `subagent_delegation` | Agent 名称 + 任务                                 |
| `key_value`           | 通用标签/值行                                     |
| `generic`             | 兜底摘要                                          |

每种类型都有对应的 `daemonToolPreviewToMarkdown` 投影。自定义渲染器可通过 `preview.kind` 进行分派，实现丰富的类型专属展示（带语法高亮的文件 diff、MCP 服务器徽标、图片缩略图等）。

## 状态选择器（PR-E）

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // 按 daemon 单调 id 排序

// PR-K — sub-agent 嵌套
selectSubagentChildBlocks(state, parentToolCallId); // 仅返回直接子节点
isSubagentChildBlock(block); // 类型守卫：此工具是否在 sub-agent 内部调用？
```

`currentToolCallId` 由 reducer 自动维护：

- 工具进入执行中状态时设置（`running` / `in_progress` / `pending` / `confirming`）
- 工具进入终态时清除（`completed` / `failed` / `cancelled` 等）
- 未知状态保持不变（前向兼容）

## 取消传播（PR-E）

当 `assistant.done.reason === 'cancelled'` 时，reducer 遍历所有执行中的工具 block，强制将其状态设置为 `'cancelled'`。当父 prompt 被取消时，daemon 不保证为每个执行中的工具发送终态 `tool_call_update` — 此传播机制可防止 UI 的加载动画永久转圈。

Sub-agent 子节点会随其父节点一同被取消，因为取消操作会遍历 `toolBlockByCallId` 中所有执行中的工具 block，而非仅当前指针。

## Sub-agent 嵌套（PR-K）

当主 agent 委托给 sub-agent（`Task` 工具或等效工具）时，daemon 通过 `tool_call._meta` 在**子**工具调用上标记 `parentToolCallId` 和 `subagentType`。reducer 读取两者并：

- 将 `parentToolCallId` + `subagentType` 镜像到 `DaemonToolTranscriptBlock`
- 当父 block 已在状态中时，解析 `parentBlockId`（父节点的 transcript block `id`）；否则保留为 `undefined`，等待父 block 后续出现时回填

乱序到达（子节点先于父节点）的情况会被透明处理。若某子节点的父 block 被 `maxBlocks` 裁剪，该子节点仍保留 `parentToolCallId` 用于选择器查询，但 `parentBlockId` 会被置为 null（悬空 id 已无法通过 `blockIndexById` 解析）。

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// 渲染父工具 block，然后遍历子节点：
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// 或在渲染时过滤顶层与嵌套节点：
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` 仅返回**直接**子节点。如需渲染嵌套 sub-agent（sub-agent 内部的 sub-agent），请递归遍历。Daemon 不会产生循环，但通过 `parentBlockId` 向上遍历的渲染器仍应做好防御性检测（例如设置深度上限或已访问集合）。

自引用（`parentToolCallId === toolCallId`）会在进入 reducer 之前由 normalizer 丢弃。

## 时间语义（PR-B）

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // 主要排序键 — daemon 单调递增
  serverTimestamp?: number; // 首选显示时间 — daemon 权威时间
  clientReceivedAt: number; // 备用 — 本地时钟
  createdAt: number; // @deprecated clientReceivedAt 的别名
}
```

展示长会话时，**始终按 `eventId` 排序**（使用 `selectTranscriptBlocksOrderedByEventId`）。Daemon 单调游标在 SSE 断线重连后的重放中得以保留；客户端时钟则不然。

**始终从 `serverTimestamp` 格式化显示时间戳**（回退到 `clientReceivedAt`）。只有当多个客户端都读取 daemon 时钟时，查看同一会话的多个客户端才会看到相同的"5 分钟前"。

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## 适配器合规性（PR-G）

验证你的适配器是否将 SDK 的参考语料库投影为语义等价的输出：

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('my adapter conforms to daemon UI corpus', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

Fixture 语料库（`DAEMON_UI_CONFORMANCE_FIXTURES`）涵盖 chat、工具生命周期、文件编辑、MCP、权限、MCP 预算警告、取消、畸形 payload 脱敏、OAuth、命令更新和 sub-agent 嵌套。（数量可在运行时推导 — 读取 `DAEMON_UI_CONFORMANCE_FIXTURES.length`。）

**格式无关** — 你的适配器可渲染为 ANSI / HTML / markdown / JSX；框架仅通过 `expectedContains` 和 `expectedAbsent` 检查语义内容。

## 错误分类（PR-A）

`DaemonUiErrorEvent.errorKind` 是一个封闭枚举，从 daemon 的类型化错误分类中传播而来（当 daemon 标记时）：

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

渲染器应根据 `errorKind` 分支，提供可操作的交互：

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>重新认证</button>;
    case 'missing_file':   return <button>选择文件</button>;
    case 'blocked_egress': return <span>网络被阻断 — 请检查代理设置</span>;
    default:               return null;
  }
}
```

## 工具来源分派（PR-A）

`DaemonUiToolUpdateEvent.provenance` 是一个封闭枚举（`builtin` / `mcp` / `subagent` / `unknown`）。当来源为 `mcp` 时，附带 `serverId?: string`。用于图标分派和徽标展示：

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

SDK 内置了 `mcp__<server>__<tool>` 命名启发式回退 — 即便 daemon 未明确标记来源，MCP 工具仍可被识别。

## 前向兼容原则

daemon UI SDK 的每一层都遵循**前向兼容原则**：未知值不抛出异常，而是优雅降级。

- 未知 daemon 事件类型 → 携带原始类型名的 `debug` 事件
- 未知工具状态 → `currentToolCallId` 保持不变（不清除）
- 未知 error kind → `errorKind` 为 undefined（渲染器回退到文本）
- 缺少 serverTimestamp → 回退到 `clientReceivedAt`
- 无法识别的 preview 形态 → 带 `summary` 的 `generic` 类型

这意味着 **SDK 可以先于 daemon 发送就绪**。PR-A 的工具来源启发式、PR-B 的三位置时间戳提取，以及 PR-E 的未知状态保留，都是"daemon 发送时即生效；不发送时也安全"的体现。

## 交叉引用

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 包含共享 UI transcript 层的基础 PR
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — 本 PR（统一完整性跟进版本）
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — daemon 模式提案
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16 实现追踪
