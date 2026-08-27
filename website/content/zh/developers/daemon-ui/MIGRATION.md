# 迁移到 `@qwen-code/sdk/daemon` v2

PR #4328 交付了 v1 守护进程 UI 层。PR #4353（本 PR）交付了 v2，包含七个新增功能提交。本指南首先介绍 Web 聊天和 Web 终端适配器作者的变更。原生本地 TUI、频道和 IDE 维护者稍后可以复用相同的原语，但本 PR **未**迁移这些默认产品路径。

## 现有消费者的 TL;DR

**无破坏性变更。** 本 PR 中的每个提交都是新增的：

- v1 字段仍然有效（`createdAt` 保留为 `clientReceivedAt` 的 `@deprecated` 别名）
- v1 的 normalizer 仍然以相同方式映射相同的 13 种事件类型
- v1 的 reducer 仍然为聊天事件生成相同的 block
- 新 API 通过额外参数和辅助函数可选使用

本 PR 可以安全合入，无需任何消费者变更。**新功能的采用是渐进式的。**

## 推荐的采用顺序

对于每个适配器，按投入产出比排序：

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

**原因**：`eventId` 在守护进程中单调递增；在 SSE 重新连接重放后仍然有效。`createdAt` 是客户端时钟，重放时会偏移。

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

**原因**：多个客户端只有在都读取守护进程时钟时，才能看到一致的“X 分钟前”。渲染器加上 `formatBlockTimestamp` 处理时区和区域设置。

**注意**：守护进程需要在信封上标记 `_meta.serverTimestamp` 才能使此功能生效。SDK 已做好向前兼容；在此之前会回退到 `clientReceivedAt`。

### 3. 监听新事件类型——选择子集进行渲染

16 种新事件类型（session-meta、workspace、auth）不会推送转录块。它们是侧通道观察结果。每个适配器选择要展示的事件：

```ts
// 在 SSE 消费者中
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// 然后在 UI 端
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP 服务器即将达到预算：${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... 依此类推，按需选择 UI 需要的事件
  }
}
```

或者使用选择器访问状态镜像的侧通道：

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // 镜像自 approval_mode.changed
const currentTool = selectCurrentTool(state); // 当前正在进行的工具
```

### 4. 渲染约定：使用 `daemonBlockToMarkdown`（或 HTML / plainText）

**之前**（每个适配器自己做投影）：

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `你：${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... 依此类推
  }
}
```

**之后**（委托给 SDK）：

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

对于 HTML SSR：

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

对于纯文本：

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. 符合性测试

添加到适配器的测试套件中：

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('适配器正确投影守护进程 UI 语料库', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

这将针对 10 个测试场景运行你的适配器，并在问题影响用户之前发现投影漂移。

### 6. 通过 `provenance` 分发工具图标

**之前**（对 toolName 做字符串匹配）：

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**之后**（来自 PR-A 的类型化 provenance）：

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

SDK 提供了一个 `mcp__<server>__<tool>` 命名启发式回退——即使守护进程没有显式标记 provenance，现在也能工作。

### 7. 通过 `errorKind` 进行错误分类

**之前**（对文本做正则匹配）：

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**之后**（来自 PR-A 的封闭枚举）：

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

**注意**：守护进程需要在 session_died / stream_error 上标记 `data.errorKind` 才能填充此字段。SDK 已经读取了该字段。

### 8. 取消处理——已是自动行为

在 v1 中，取消的提示会让正在进行的工具块永远旋转。在 v2（PR-E）中，当 `assistant.done.reason === 'cancelled'` 时，`propagateCancellationToInFlightTools` 会自动运行。子代理与其父代理一起被取消。

**无需适配器变更**——你的旋转器将正确解析。

### 8a. 子代理嵌套——选择是否参与嵌套渲染（PR-K）

在子代理委派中调用的工具块现在携带 `parentToolCallId`、`subagentType`，并且（当父代理处于状态时）携带 `parentBlockId`。适配器可以选择嵌套渲染：

**之前**（扁平列表，子代理调用在外观上与顶层不可区分）：

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

**如果偏好扁平视图，则无需适配器变更**——新字段是新增的，不会被不读取它们的代码影响。

### 9. 工具预览分类——选择要渲染的子集并使用自定义组件

PR-D + PR-F 带来了 13 种预览种类：

- 4 种文件形状：`file_diff`、`file_read`、`web_fetch`、`mcp_invocation`
- 5 种内容形状：`code_block`、`search`、`tabular`、`image_generation`、`subagent_delegation`
- 2 种控制：`ask_user_question`、`command`
- 2 种通用：`key_value`、`generic`

每个适配器对 `preview.kind` 进行分发：

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
    // ... 或者回退到：
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

没有为所有 13 种种类提供自定义组件的适配器，可以回退到 SDK 的 `daemonToolPreviewToMarkdown` 来处理任何未处理的种类。

## 向后兼容清单

| 关注点                                                         | 状态                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| 现有 `block.createdAt` 读取                                    | ✅ 仍然有效（作为 `clientReceivedAt` 的别名）   |
| 现有 reducer 事件处理                                          | ✅ 对 v1 事件类型不变                           |
| `daemonTranscriptToUnifiedMessages(blocks)` 调用点             | ✅ 新 options 参数是可选的                      |
| 现有 `selectTranscriptBlocks` 消费者                           | ✅ 未变                                         |
| v1 reducer 中的新事件类型                                      | ✅ 无操作，`lastEventId` 仍然递增               |

## 交叉引用

- [PR #4353 摘要](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI 自述文档](./README.md)——完整 API 参考
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328)——基础 PR，包含共享的 UI 转录层