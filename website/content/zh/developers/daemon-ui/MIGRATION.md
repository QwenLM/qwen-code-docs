# 迁移到 `@qwen-code/sdk/daemon` v2

PR #4328 发布了 v1 daemon UI 层。PR #4353（本 PR）发布了 v2，新增了七个功能提交。本指南首先介绍 web chat 和 web terminal 适配器作者需要了解的变更。原生本地 TUI、channel 和 IDE 维护者可以在之后复用相同的基础组件，但这些默认产品路径不在本 PR 的迁移范围内。

## 现有使用者 TL;DR

**无破坏性变更。** 本 PR 的每个提交都是增量式的：

- v1 字段仍然有效（`createdAt` 保留为 `clientReceivedAt` 的 `@deprecated` 别名）
- v1 normalizer 仍以相同方式映射相同的 13 种事件类型
- v1 reducer 仍为 chat 事件生成相同的 blocks
- 新 API 通过额外的参数和 helper 按需启用

本 PR 无需任何消费方变更即可安全合并。**新特性的采用是增量式的。**

## 推荐采用顺序

针对每个适配器，按投入/产出比排序：

### 1. 排序：将排序键从 `createdAt` 切换为 `eventId`

**之前：**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**之后：**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**原因**：`eventId` 是 daemon 单调递增的；在 SSE 重连后重放时仍然有效。`createdAt` 是客户端时钟，在重放时会发生偏移。

### 2. 显示：将 `createdAt` 切换为 `serverTimestamp ?? clientReceivedAt`

**之前：**

```tsx
<TimeLabel ms={block.createdAt} />
```

**之后：**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**原因**：多个客户端只有在都读取 daemon 时钟时，才能看到一致的"X 分钟前"。Renderer 加 `formatBlockTimestamp` 处理时区和 locale。

**注意**：Daemon 需要在 envelope 上标记 `_meta.serverTimestamp` 才能生效。SDK 已做前向兼容，在此之前会回退到 `clientReceivedAt`。

### 3. 监听新事件类型 — 选择子集进行渲染

16 种新事件类型（session-meta、workspace、auth）不会推送 transcript blocks，它们是旁路观测数据。每个适配器自行选择需要展示的部分：

```ts
// 在你的 SSE 消费者中
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// 然后在 UI 侧
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP servers approaching budget: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... 等，按 UI 需要选择性接入
  }
}
```

或使用 selector 获取状态镜像的旁路数据：

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // 从 approval_mode.changed 镜像而来
const currentTool = selectCurrentTool(state); // 当前正在执行的 tool
```

### 4. 渲染契约：使用 `daemonBlockToMarkdown`（或 HTML / plainText）

**之前**（每个适配器自己做投影）：

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... 等
  }
}
```

**之后**（委托给 SDK）：

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

HTML SSR 场景：

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

纯文本场景：

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. 一致性测试

在适配器的测试套件中添加：

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('adapter projects daemon UI corpus correctly', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

这将针对 10 个 fixture 场景运行你的适配器，在投影偏差影响用户之前将其暴露出来。

### 6. 通过 `provenance` 分发 tool 图标

**之前**（对 toolName 做字符串匹配）：

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**之后**（使用 PR-A 提供的类型化 provenance）：

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```

SDK 内置 `mcp__<server>__<tool>` 命名启发式回退 — 即使 daemon 未显式标记 provenance，当前也能正常工作。

### 7. 通过 `errorKind` 进行错误分类

**之前**（对文本做正则匹配）：

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**之后**（使用 PR-A 提供的封闭枚举）：

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**注意**：Daemon 需要在 session_died / stream_error 上标记 `data.errorKind` 才能填充该字段。SDK 已做好读取准备。

### 8. 取消处理 — 已自动化

在 v1 中，被取消的 prompt 会导致正在执行的 tool blocks 永久旋转。在 v2（PR-E）中，当 `assistant.done.reason === 'cancelled'` 时，`propagateCancellationToInFlightTools` 会自动执行。子 agent 的子节点会与父节点一起被取消。

**无需适配器变更** — 你的加载动画将正确解析。

### 8a. 子 agent 嵌套 — 选择启用嵌套渲染（PR-K）

在子 agent 委托内部调用的 tool blocks 现在携带 `parentToolCallId`、`subagentType`，以及（当父节点处于状态中时）`parentBlockId`。适配器可选择启用嵌套渲染：

**之前**（扁平列表，子 agent 调用与顶层调用在视觉上无法区分）：

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**之后**（递归嵌套渲染）：

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**如果你倾向于保持扁平视图，无需任何适配器变更** — 新字段是增量式的，不读取它们的代码会直接忽略。

### 9. Tool 预览分类 — 选择子集并使用自定义组件渲染

PR-D + PR-F 带来 13 种预览类型：

- 4 种文件型：`file_diff`、`file_read`、`web_fetch`、`mcp_invocation`
- 5 种内容型：`code_block`、`search`、`tabular`、`image_generation`、`subagent_delegation`
- 2 种控制型：`ask_user_question`、`command`
- 2 种通用型：`key_value`、`generic`

每个适配器根据 `preview.kind` 进行分发：

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... 或回退到：
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

未针对全部 13 种类型实现自定义组件的适配器，可对任何未处理的类型回退到 SDK 的 `daemonToolPreviewToMarkdown`。

## 向后兼容性检查清单

| 关注点                                                 | 状态                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| 现有的 `block.createdAt` 读取                          | ✅ 仍然有效（`clientReceivedAt` 的别名）      |
| 现有 reducer 的事件处理                                | ✅ v1 事件类型保持不变                        |
| `daemonTranscriptToUnifiedMessages(blocks)` 调用点     | ✅ 新的 options 参数是可选的                  |
| 现有的 `selectTranscriptBlocks` 使用者                 | ✅ 保持不变                                   |
| v1 reducer 中的新事件类型                              | ✅ 无操作，`lastEventId` 仍然递增             |

## 交叉引用

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — 完整 API 参考
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 包含共享 UI transcript 层的基础 PR
