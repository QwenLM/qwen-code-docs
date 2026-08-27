# Daemon Web UI Adapter

## 目标

Web 聊天和 Web 终端客户端应通过 daemon 的 HTTP/SSE API 消费 `qwen serve`，并渲染客户端侧 transcript。本地的 TUI、channel 和 IDE 集成暂时保留原有默认路径。

## 共享 UI 合约

使用 TypeScript SDK 的 daemon UI 导出作为公共边界：

```ts
import {
  DaemonClient,
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
} from '@qwen-code/sdk/daemon';
```

职责划分如下：

- `DaemonClient` 处理 daemon HTTP 路由。
- `DaemonSessionClient` 负责 session 创建/绑定和 SSE 重放。
- `normalizeDaemonEvent()` 将 daemon 线路事件转换为 UI 事件。
- `createDaemonTranscriptStore()` 将 UI 事件规约为 transcript 块。

React 客户端可以使用可选的 `@qwen-code/webui` 绑定：

```tsx
import {
  DaemonSessionProvider,
  useDaemonActions,
  useDaemonConnection,
  useDaemonPendingPermissions,
  useDaemonTranscriptBlocks,
} from '@qwen-code/webui';
```

最小 React 结构示例：

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

该 provider 会创建或绑定一个 daemon session，订阅 SSE，在 `DaemonSessionClient` 上保留最后一个事件 ID，并默认重新连接流。调用者可以通过设置 `autoReconnect={false}` 为测试或自定义连接管理禁用该行为。

## 浏览器部署形态

### 同源本地 POC

由 daemon 提供的页面可以直接调用 daemon，因为页面和 API 共享一个源。这是本地 Web 聊天和 Web 终端验证的首选早期 POC 形态。

### 远程 Web 聊天 / Web 终端

生产环境下的远程 Web 应用通常应通过 BFF（后端 for 前端）进行通信。BFF 拥有 daemon URL、token、工作空间路由和 session 元数据，然后将浏览器安全的应用事件转发给浏览器。这样可以避免 bearer token 存储在浏览器中，并允许部署决定用户可访问的 daemon/工作空间。

### 本地浏览器连接本地 Daemon

一个单独的本地开发服务器与 `qwen serve` 是跨域的；它必须通过同源代理 daemon 路由，或者由 daemon 提供服务。daemon 故意拒绝任意浏览器 `Origin` 请求。

## 渲染职责

共享的 transcript 模型是语义的，而非视觉的。UI 客户端自行决定如何渲染：

- 用户和助手的消息块
- 折叠的思考块
- 工具状态卡片
- shell 输出块
- 权限请求控件
- 状态/错误/调试块

Web 终端是一个浏览器原生的语义渲染器。它应具备终端风格的外观和体验，包括等宽布局、回滚、提示输入、快捷键和流式块，但它不是原始的 PTY 代理，也无需服务器端 Ink 渲染。

## 合并安全性

- 原生 `qwen` TUI 保持直接且不变。
- `--acp`、channel 和 IDE 路径默认保持不变。
- SDK UI 核心是附加的。
- WebUI React 绑定是可选的，仅在导入它的客户端中运行。
- 移除的 daemon TUI 原型代码不应视为产品迁移。

## 后续计划

- 添加一个由 daemon 提供的本地 `/web` POC 或等效的同源 Web 应用。
- 在 transcript 块之上构建一流的聊天和终端渲染器。
- 仅在现有 daemon 事件对稳定的浏览器 UI 行为过于底层时，添加更丰富的类型化事件。
- 如果非 SDK 消费者需要将 UI 核心作为独立依赖，考虑提供专门的 `@qwen-code/daemon-ui-core` 包。