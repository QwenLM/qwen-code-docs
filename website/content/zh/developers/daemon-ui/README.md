# Daemon UI SDK — 开发者指南

`@qwen-code/sdk/daemon` 子路径为 daemon 客户端提供共享的 UI 原语。当前适配目标为 Web 聊天和 Web 终端；在 daemon UI 契约稳定之前，原生本地 TUI、频道和 IDE 集成保持其现有默认路径。本指南涵盖 PR #4353 引入的 API 表面（作为 PR #4328 共享 UI 转录层的统一后续）。

## 三层模型

```
Daemon SSE 线路 (NDJSON 信封)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← 在此接入你的渲染器
```

- **规范化器 (Normalizer)**：接收原始 daemon SSE 信封，返回类型化的 UI 事件
- **归约器 (Reducer)**：将事件累积为转录状态机
- **渲染辅助函数**：将状态块投影为可渲染的字符串

## 快速开始

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

// 从任意订阅者读取状态
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## 事件分类 (28+ 种类型)

`DaemonUiEvent` 是所有面向 UI 的事件的有区别联合体：

### 聊天流事件

| 事件                           | 触发时机                                |
| ------------------------------ | --------------------------------------- |
| `user.text.delta`              | 用户消息分片从 daemon 到达              |
| `assistant.text.delta`         | 助手流式分片                            |
| `assistant.done`               | 提示完成（来自 sendPrompt 的 resolve）  |
| `thought.text.delta`           | 智能体推理分片                          |
| `tool.update`                  | 工具调用生命周期（运行中 / 已完成 / 已取消） |
| `shell.output`                 | Shell 工具 stdout/stderr 分片           |
| `permission.request`           | 工具需要用户授权                        |
| `permission.resolved`          | 权限决策已到达                          |
| `model.changed`                | 会话模型已切换                          |
| `status` / `debug` / `error`   | 状态 / 调试 / 错误块                    |

### 会话元事件 (PR-A)

| 事件                                 | 触发时机                              |
| ------------------------------------ | ------------------------------------- |
| `session.metadata.changed`           | 会话标题 / 显示名称已更新             |
| `session.approval_mode.changed`      | 模式已切换（plan / default / yolo / auto-edit） |
| `session.available_commands`         | 斜杠命令列表已刷新                    |

### 工作区事件 (PR-A, Wave 3-4)

| 事件                                   | 触发时机                                  |
| -------------------------------------- | ----------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / memory 文件已修改              |
| `workspace.agent.changed`              | 子智能体已创建 / 更新 / 删除             |
| `workspace.tool.toggled`               | 内置工具已启用 / 禁用                    |
| `workspace.initialized`                | `qwen init` 已完成                       |
| `workspace.mcp.budget_warning`         | MCP 子进程数量接近上限                   |
| `workspace.mcp.child_refused`          | MCP 服务器因预算限制拒绝                 |
| `workspace.mcp.server_restarted`       | 手动 MCP 重启成功                        |
| `workspace.mcp.server_restart_refused` | 手动重启被阻止                           |

### 认证设备流事件 (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

每个事件携带 daemon 的 `deviceFlowId`。失败事件携带一个封闭枚举的 `errorKind`（封闭枚举 — 参见 `@qwen-code/sdk/daemon` 导出的 `KNOWN_DEVICE_FLOW_ERROR_KINDS` 以获取规范列表，当前包括：`expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`）。

## 渲染契约 (PR-D)

三个投影辅助函数，一个预览辅助函数。所有函数都根据 `block.kind` 或 `preview.kind` 进行区分：

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### 小技巧：将转录渲染为 markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### 小技巧：渲染为经过净化的 HTML 用于 SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // 两阶段流水线：markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

或者使用内置的保守 HTML 渲染器（不进行 markdown 解析，仅进行 HTML 转义）：

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### 小技巧：复制粘贴纯文本

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## 工具预览分类 (13 种)

| 种类                   | 表面                                                |
| ---------------------- | --------------------------------------------------- |
| `ask_user_question`    | 多选问题及选项                                      |
| `command`              | Bash 风格命令 + cwd                                |
| `file_diff`            | 文件编辑（包含 oldText/newText 或 patch）            |
| `file_read`            | 路径 + 可选行范围                                   |
| `web_fetch`            | URL + HTTP 方法                                     |
| `mcp_invocation`       | MCP 服务器 + 工具 + 参数摘要                        |
| `code_block`           | 带语言标签的代码片段                                |
| `search`               | 查询 + 结果数量 + 前几项结果                        |
| `tabular`              | 列 + 行（上限 50，超过时会标记截断）                |
| `image_generation`     | 提示 + 可选缩略图 URL                              |
| `subagent_delegation`  | 智能体名称 + 任务                                   |
| `key_value`            | 通用标签 / 值行                                     |
| `generic`              | 回退摘要                                            |

每个都有 `daemonToolPreviewToMarkdown` 投影。自定义渲染器可以根据 `preview.kind` 进行分派以实现丰富的按类型显示（带语法高亮的文件差异、MCP 服务器徽章、图片缩略图等）。

## 状态选择器 (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // 按 daemon 单调递增 ID 排序

// PR-K — 子智能体嵌套
selectSubagentChildBlocks(state, parentToolCallId); // 仅直接子对象
isSubagentChildBlock(block); // 类型守卫：此工具是否在子智能体内被调用？
```

`currentToolCallId` 由归约器自动维护：

- 当工具进入飞行中状态时设置（`running` / `in_progress` / `pending` / `confirming`）
- 当工具进入终端状态时清空（`completed` / `failed` / `cancelled` 等）
- 未知状态保持不动（向前兼容）

## 取消传播 (PR-E)

当 `assistant.done.reason === 'cancelled'` 时，归约器会遍历每个飞行中的工具块，并强制将其状态设置为 `'cancelled'`。当父提示被取消时，daemon 并不保证每个飞行中的工具都有一个终端的 `tool_call_update` — 这种传播可以防止 UI 旋转器永远旋转。

子智能体与父智能体一起被取消，因为取消会迭代 `toolBlockByCallId` 中的每个飞行中工具块，而不仅仅是当前指针。

## 子智能体嵌套 (PR-K)

当主智能体委托给子智能体（`Task` 工具或等效工具）时，daemon 会通过 `tool_call._meta` 在**子**工具调用上标记 `parentToolCallId` 和 `subagentType`。归约器读取两者并：

- 将 `parentToolCallId` + `subagentType` 镜像到 `DaemonToolTranscriptBlock` 上
- 当父块已在状态中时解析 `parentBlockId`（父块的转录块 `id`）；否则保持 `undefined`，并在父块稍后出现时回填

乱序到达（子块先于父块）会被透明处理。父块被 `maxBlocks` 修剪的子块会保留 `parentToolCallId` 以供选择器查询，但 `parentBlockId` 将被置空（悬空的 id 将无法通过 `blockIndexById` 解析）。

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// 渲染父工具块，然后遍历子块：
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

// 或者在渲染时过滤顶层 vs 嵌套：
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` 仅返回**直接**子对象。递归遍历可渲染嵌套的子智能体（子智能体内部的子智能体）。Daemon 不会发出循环，但通过 `parentBlockId` 向上遍历的渲染器仍应防御性地检测循环（例如，深度上限或已访问集合）。

自引用（`parentToolCallId === toolCallId`）在到达归约器之前会被规范化器丢弃。

## 时间语义 (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // 主排序键 — daemon 单调递增
  serverTimestamp?: number; // 首选显示时间戳 — daemon 权威
  clientReceivedAt: number; // 回退 — 本地时钟
  createdAt: number; // @deprecated 别名，指向 clientReceivedAt
}
```

**始终按 `eventId` 排序**（使用 `selectTranscriptBlocksOrderedByEventId`）显示长会话。Daemon 单调递增游标在重新连接后的 SSE 重播中得以保留；客户端时钟则不能。

**始终从 `serverTimestamp` 格式化显示时间戳**（回退到 `clientReceivedAt`）。查看同一会话的多个客户端只有在都使用 daemon 时钟时才能看到相同的“5分钟前”。

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## 适配器合规性 (PR-G)

验证你的适配器将 SDK 的参考语料库投影为语义等价的输出：

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

固定语料库 (`DAEMON_UI_CONFORMANCE_FIXTURES`) 涵盖聊天、工具生命周期、文件编辑、MCP、权限、MCP 预算警告、取消、格式错误负载的清理、OAuth、命令更新以及子智能体嵌套。（数量可在运行时获取 — 读取 `DAEMON_UI_CONFORMANCE_FIXTURES.length`。）

**格式无关** — 你的适配器可以渲染为 ANSI / HTML / markdown / JSX；框架仅通过 `expectedContains` 和 `expectedAbsent` 检查语义内容。

## 错误分类 (PR-A)

`DaemonUiErrorEvent.errorKind` 是一个从 daemon 类型化错误分类传播而来的封闭枚举（当 daemon 标记时）：

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

渲染器应根据 `errorKind` 分支以提供可操作的选项：

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>重新认证</button>;
    case 'missing_file':   return <button>选择文件</button>;
    case 'blocked_egress': return <span>网络被阻止 — 检查代理</span>;
    default:               return null;
  }
}
```

## 工具来源分派 (PR-A)

`DaemonUiToolUpdateEvent.provenance` 是一个封闭枚举（`builtin` / `mcp` / `subagent` / `unknown`）。当来源为 `mcp` 时还包含 `serverId?: string`。用于图标分派和徽章显示：

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

SDK 包含一个 `mcp__<server>__<tool>` 命名启发式回退 — 即使 daemon 未明确标记来源，MCP 工具仍可被检测。

## 向前兼容原则

Daemon UI SDK 的每一层都遵循**向前兼容原则**：未知值不会抛错，而是优雅降级。

- 未知的 daemon 事件类型 → 生成立即类型名称的 `debug` 事件
- 未知的工具状态 → `currentToolCallId` 保持不变（不清除）
- 未知的错误类型 → `errorKind` 为 undefined（渲染器回退到文本）
- 缺失 serverTimestamp → 回退到 `clientReceivedAt`
- 无法识别的预览形状 → 以 `summary` 为核心的 `generic` 类型

这意味着 **SDK 可以提前于 daemon 的发送能力发布**。PR-A 的工具来源启发式、PR-B 的三位置时间戳提取以及 PR-E 的未知状态保留都是“daemon 发送时即可用；daemon 未发送时也安全”的范例。

## 交叉参考

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 基础 PR，包含共享 UI 转录层
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — 本 PR（统一完整性后续）
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — daemon 模式提案
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16 实施跟踪器