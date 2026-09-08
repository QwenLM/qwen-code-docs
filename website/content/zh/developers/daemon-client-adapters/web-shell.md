# Web Shell 守护进程适配器

## 目标

Web 聊天和 Web 终端客户端应通过守护进程 HTTP/SSE API 使用 `qwen serve`，并在客户端渲染对话记录。本地原生 TUI、channel 和 IDE 集成暂时保留现有的默认路径。

## 共享 UI 契约

使用 TypeScript SDK 的守护进程 UI 导出作为通用边界：

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from ' @qwen-code/sdk/daemon';
```

职责划分如下：

- `DaemonClient` 负责处理守护进程 HTTP 路由。
- `DaemonSessionClient` 负责会话创建/附加以及 SSE 重放。
- `normalizeDaemonEvent()` 将守护进程线路事件转换为 UI 事件。
- `createDaemonTranscriptStore()` 将 UI 事件归约为对话记录块。

React 客户端可以使用 Web Shell 导出的绑定：

```tsx
import {
  DaemonSessionProvider,
  useActions,
  useConnection,
  usePendingPermissions,
  useTranscriptBlocks,
} from ' @qwen-code/web-shell/daemon-react-sdk';
```

最小 React 结构：

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
  const blocks = useTranscriptBlocks();
  return blocks.map((block) => <RenderBlock key={block.id} block={block} />);
}
```

该 Provider 会创建或附加一个守护进程会话，订阅 SSE，在 `DaemonSessionClient` 上保留最后一个事件 ID，并默认重新连接流。调用方可以通过 `autoReconnect={false}` 禁用此行为，用于测试或自定义连接管理。

## 浏览器部署形态

### 同源本地 POC

守护进程提供的页面可以直接调用守护进程，因为页面和 API 共享同一个源。这是本地 Web 聊天和 Web 终端验证的首选早期 POC 形态。

### 远程 Web 聊天 / Web 终端

生产环境的远程 Web 应用通常应通过 BFF（Backend-for-Frontend）通信。BFF 负责守护进程 URL、令牌、工作区路由和会话元数据，然后将浏览器安全的应用事件转发给浏览器。这样可以避免将 bearer 令牌存储在浏览器中，并让部署方决定用户有权访问哪个守护进程/工作区。

### 本地浏览器对接本地守护进程

独立的本地开发服务器与 `qwen serve` 跨源；它必须通过同源代理守护进程路由，或者由守护进程提供服务。守护进程会刻意拒绝任意浏览器 `Origin` 请求。

## 渲染职责

共享的对话记录模型是语义化的，而非视觉化的。UI 客户端自行决定如何渲染：

- 用户和助手消息块
- 可折叠的思考块
- 工具状态卡片
- Shell 输出块
- 权限请求控件
- 状态/错误/调试块

Web 终端是一个浏览器原生语义渲染器。它应具有类似终端的外观和体验——等宽布局、回滚、提示输入、快捷键和流式块——但它不是原始 PTY 代理，也不需要服务端 Ink 渲染。

## 合并安全性

- 原生 `qwen` TUI 保持直接且不变。
- `--acp`、channel 和 IDE 路径默认保持不变。
- SDK UI 核心是增量添加。
- Web Shell React 绑定是可选的，仅在导入它的客户端中运行。
- 已移除的守护进程 TUI 试验代码不应被视为产品迁移。

## 后续事项

- 保持守护进程提供的 Web Shell 与嵌入式 IDE 宿主行为一致。
- 继续基于对话记录块构建一等公民级别的聊天和终端渲染器。
- 仅在现有守护进程事件对稳定的浏览器 UI 行为而言过于底层时，才添加更丰富的类型化事件。
- 如果非 SDK 消费者需要将 UI 核心作为独立依赖，可考虑提供专用的 ` @qwen-code/daemon-ui-core` 包。