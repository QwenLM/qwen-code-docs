# Channels 设计

> Qwen Code 的外部消息集成 —— 支持通过 Telegram、微信等平台与 Agent 交互。
>
> 用户文档：[Channels 概览](../../users/features/channels/overview.md)。

## 概述

**Channel（通道）** 将外部消息平台与 Qwen Code Agent 连接起来。在 `settings.json` 中配置，通过 `qwen channel` 子命令管理，支持多用户（每个用户拥有独立的 ACP 会话）。

## 架构

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    qwen-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        qwen-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** —— 连接外部 API，负责消息与 Envelope 之间的格式转换。**ACP Bridge** —— 启动 `qwen-code --acp` 进程，管理会话，并发出 `textChunk`/`toolCall`/`disconnected` 事件。**Session Router** —— 通过命名空间键（`<channel>:<sender>`）将发送者映射到 ACP 会话。**Sender Gate** / **Group Gate** —— 访问控制（白名单 / 配对 / 开放）与 @提及 拦截。**Channel Base** —— 采用模板方法模式的抽象基类：插件需重写 `connect`、`sendMessage`、`disconnect`。**Channel Registry** —— 带有冲突检测的 `Map<string, ChannelPlugin>`。

### Envelope

所有平台统一转换的标准消息格式：

- **Identity**：`senderId`、`senderName`、`chatId`、`channelName`
- **Content**：`text`，可选 `imageBase64`/`imageMimeType`，可选 `referencedText`
- **Context**：`isGroup`、`isMentioned`、`isReplyToBot`，可选 `threadId`

插件职责：`senderId` 必须稳定且唯一；`chatId` 需区分私聊与群聊；布尔标志必须准确以支持 Gate 逻辑；`text` 中需剥离 @提及 内容。

### 消息流转

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

斜杠命令（`/clear`、`/help`、`/status`）会在到达 Agent 之前由 ChannelBase 处理。

### 会话管理

单个 `qwen-code --acp` 进程承载多个 ACP 会话。每个 Channel 的作用域：**`user`**（默认）、**`thread`** 或 **`single`**。路由键采用 `<channelName>:<key>` 命名空间格式。

### 错误处理

- **连接失败** —— 记录日志；只要至少有一个 Channel 成功连接，服务将继续运行
- **Bridge 崩溃** —— 指数退避（最多重试 3 次），在所有 Channel 上调用 `setBridge()`，恢复会话
- **会话序列化** —— 基于每个会话的 Promise 链，防止并发 Prompt 冲突

## 插件系统

该架构具备高扩展性 —— 无需修改核心代码即可接入新适配器（含第三方）。内置 Channel 同样复用此插件接口（内部自研自用）。

### 插件契约

一个 `ChannelPlugin` 需声明 `channelType`、`displayName`、`requiredConfigFields` 以及 `createChannel()` 工厂方法。插件需实现以下三个方法：

| 方法                        | 职责                                              |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | 连接平台并注册消息处理器                          |
| `sendMessage(chatId, text)` | 格式化并发送 Agent 响应                           |
| `disconnect()`              | 关闭时执行清理工作                                |

处理入站消息时，插件需构建 `Envelope` 并调用 `this.handleInbound(envelope)` —— 基类将处理剩余逻辑：访问控制、群聊拦截、配对、会话路由、Prompt 序列化、斜杠命令、指令注入、回复上下文以及崩溃恢复。

### 扩展点

- 通过 `registerCommand()` 注册自定义斜杠命令
- 通过包装 `handleInbound()` 实现输入中/反应状态指示器
- 通过 `onToolCall()` 实现工具调用钩子
- 在调用 `handleInbound()` 前将媒体数据附加到 Envelope 以处理媒体文件

### 发现与加载

外部插件作为 **extensions** 由 `ExtensionManager` 管理，并在 `qwen-extension.json` 中声明：

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

执行 `qwen channel start` 时的加载顺序：加载配置 → 注册内置插件 → 扫描扩展 → 动态导入并校验 → 注册（拒绝冲突） → 校验配置 → 调用 `createChannel()` → 调用 `connect()`。

插件在进程内运行（无沙箱隔离），信任模型与 npm 依赖相同。

## 配置

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // env var reference
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "qwen3.5-plus",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

认证方式因插件而异：静态 Token（Telegram）、应用凭证（钉钉）、扫码登录（微信）、代理 Token（TMCP）。

## CLI 命令

```bash
# Channels
qwen channel start [name]                     # start all or one channel
qwen channel stop                             # stop running service
qwen channel status                           # show channels, sessions, uptime
qwen channel pairing list <ch>                # pending pairing requests
qwen channel pairing approve <ch> <code>      # approve a request

# Extensions
qwen extensions install <path-or-package>     # install
qwen extensions link <local-path>             # symlink for dev
qwen extensions list                          # show installed
qwen extensions remove <name>                 # uninstall
```

## 包结构

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP process lifecycle, session management
│       ├── SessionRouter.ts # sender ↔ session mapping, persistence
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # group chat policy + mention gating
│       ├── PairingStore.ts  # pairing code generation + approval
│       ├── ChannelBase.ts   # abstract base: routing, slash commands
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## 未来规划

### 安全与群聊

- **按群限制工具** —— 基于 `tools`/`toolsBySender` 为每个群配置拒绝/允许列表
- **群聊上下文历史** —— 使用环形缓冲区缓存近期跳过的消息，在 @提及 时前置注入
- **正则提及模式** —— 当 @提及 元数据不可靠时，使用 `mentionPatterns` 作为降级方案
- **按群指令** —— 在 `GroupConfig` 中配置 `instructions` 字段，实现按群定制人设
- **`/activation` 命令** —— 运行时切换 `requireMention` 状态，并持久化到磁盘

### 运维工具

- **`qwen channel doctor`** —— 配置校验、环境变量检查、Bot Token 验证、网络连通性检测
- **`qwen channel status --probe`** —— 对每个 Channel 执行真实连通性探测

### 平台扩展

- **Discord** —— Bot API + Gateway，支持服务器/频道/私聊/话题
- **Slack** —— Bolt SDK、Socket Mode，支持工作区/频道/私聊/话题

### 多 Agent

- **多 Agent 路由** —— 支持多个 Agent，并按 Channel/群/用户进行绑定
- **群聊广播** —— 多个 Agent 可同时响应同一条消息

### 插件生态

- **社区插件模板** —— 提供 `create-qwen-channel` 脚手架工具
- **插件注册与发现** —— 支持 `qwen extensions search` 及版本兼容性检查