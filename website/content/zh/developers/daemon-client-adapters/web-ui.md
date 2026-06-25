# Daemon Web UI 适配器

## 目标

Web 聊天客户端和 Web 终端客户端应通过 daemon HTTP/SSE API 使用 `qwen serve`，并在客户端渲染对话记录。原生本地 TUI、channel 及 IDE 集成暂时保留其现有默认路径。

## 共享 UI 契约

使用 TypeScript SDK daemon UI 导出作为公共边界：

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

各模块职责划分：

- `DaemonClient` 负责处理 daemon HTTP 路由。
- `DaemonSessionClient` 负责会话创建/附加及 SSE 重放。
- `normalizeDaemonEvent()` 将 daemon 线路事件转换为 UI 事件。
- `createDaemonTranscriptStore()` 将 UI 事件归并为对话记录块。

React 客户端可使用可选的 `@qwen-code/webui` 绑定：

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

最简 React 结构：

```tsx
function App() {
  return (
    <DaemonSessionProvider baseUrl="http://127.0.0.1:4170">
      <Transcript />
      <PromptBox />
    </DaemonSessionProvider>
  );
}

function Transcript() {
  const blocks = useDaemonTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

Provider 会创建或附加一个 daemon 会话，订阅 SSE，将最新事件 id 保存在 `DaemonSessionClient` 上，并默认自动重连流。测试或自定义连接管理时，可通过 `autoReconnect={false}` 禁用该行为。

## 浏览器部署形态

### 同源本地 POC

由 daemon 提供服务的页面可以直接调用 daemon，因为页面与 API 共享同一源。这是本地 Web 聊天和 Web 终端验证的首选早期 POC 形态。

### 远程 Web 聊天 / Web 终端

生产环境的远程 Web 应用通常应通过 backend-for-frontend（BFF）进行通信。BFF 管理 daemon URL、token、工作区路由和会话元数据，然后将对浏览器安全的应用事件转发给浏览器。这样可以避免 bearer token 暴露在浏览器存储中，并由部署方决定用户可以访问哪个 daemon/工作区。

### 本地浏览器对接本地 Daemon

独立的本地开发服务器与 `qwen serve` 跨源；它必须将 daemon 路由代理到同一源，或由 daemon 直接提供服务。daemon 会故意拒绝任意浏览器 `Origin` 的请求。

## 渲染职责

共享的对话记录模型是语义化的，而非视觉化的。UI 客户端自行决定如何渲染：

- 用户和 assistant 消息块
- 折叠的思考块
- 工具状态卡片
- shell 输出块
- 权限请求控件
- 状态/错误/调试块

Web 终端是一个基于浏览器原生的语义渲染器。它的外观和体验应类似终端，具备等宽布局、滚动回放、提示输入、快捷键和流式块，但它不是原始 PTY 代理，也不需要服务端 Ink 渲染。

## 合并安全性

- 原生 `qwen` TUI 保持直接调用，不受影响。
- `--acp`、channel 及 IDE 路径默认不受影响。
- SDK UI 核心为纯增量扩展。
- WebUI React 绑定为可选项，仅在导入它的客户端中运行。
- 已移除的 daemon TUI spike 代码不应视为产品迁移。

## 后续工作

- 添加一个由 daemon 提供服务的本地 `/web` POC 或等效的同源 Web 应用。
- 在对话记录块之上构建一流的聊天和终端渲染器。
- 仅在现有 daemon 事件对稳定的浏览器 UI 行为过于底层时，才添加更丰富的类型化事件。
- 如果非 SDK 消费者需要将 UI 核心作为独立依赖项，考虑提供专用的 `@qwen-code/daemon-ui-core` 包。
