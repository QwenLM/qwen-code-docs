# Channels 设计

> Qwen Code 的外部消息集成 —— 通过 Telegram、微信等平台与 agent 交互。
>
> 用户文档：[Channels 概述](../../users/features/channels/overview.md)。

## 概述

**channel** 将外部消息平台连接到 Qwen Code agent。在 `settings.json` 中配置，通过 `qwen channel` 子命令管理，支持多用户（每个用户拥有独立的 ACP 会话）。

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

**Platform Adapter** — 连接外部 API，在消息与 Envelope 之间进行转换。**ACP Bridge** — 启动 `qwen-code --acp`，管理会话，发出 `textChunk`/`toolCall`/`disconnected` 事件。**Session Router** — 通过带命名空间的键（`<channel>:<sender>`）将发送者映射到 ACP 会话。**Sender Gate** / **Group Gate** — 访问控制（allowlist / pairing / open）和提及门控。**Channel Base** — 使用模板方法模式的抽象基类：插件重写 `connect`、`sendMessage`、`disconnect`。**Channel Registry** — `Map<string, ChannelPlugin>`，支持冲突检测。

### Envelope

所有平台统一转换的标准化消息格式：

- **Identity**：`senderId`、`senderName`、`chatId`、`channelName`
- **Content**：`text`、可选的 `imageBase64`/`imageMimeType`、可选的 `referencedText`
- **Context**：`isGroup`、`isMentioned`、`isReplyToBot`、可选的 `threadId`

插件职责：`senderId` 必须稳定且唯一；`chatId` 必须区分私聊和群聊；布尔标志必须准确以供门控逻辑使用；`text` 中需去除 @提及。

### 消息流

```
入站：用户消息 → Adapter → GroupGate → SenderGate → 斜杠命令 → SessionRouter → AcpBridge → Agent
出站：Agent 响应 → AcpBridge → SessionRouter → Adapter → 用户
```

斜杠命令（`/clear`、`/help`、`/status`）在 ChannelBase 中处理，不送达 agent。

### 会话

单个 `qwen-code --acp` 进程可承载多个 ACP 会话。每个 channel 的作用域：**`user`**（默认）、**`thread`** 或 **`single`**。路由键使用命名空间 `<channelName>:<key>`。

### 错误处理

- **连接失败** — 记录日志；只要至少有一个 channel 连接成功，服务即继续运行
- **Bridge 崩溃** — 指数退避（最多重试 3 次），在所有 channel 上执行 `setBridge()`，恢复会话
- **会话序列化** — 每个会话使用 promise 链，防止并发提示冲突

## 插件系统

架构可扩展 —— 新的适配器（包括第三方）可以在不修改核心代码的情况下添加。内置 channel 也使用相同的插件接口（自举）。

### 插件契约

`ChannelPlugin` 声明 `channelType`、`displayName`、`requiredConfigFields` 以及 `createChannel()` 工厂方法。插件实现三个方法：

| 方法                          | 职责                                          |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | 连接平台并注册消息处理器                          |
| `sendMessage(chatId, text)` | 格式化并发送 agent 响应                           |
| `disconnect()`              | 关闭时清理资源                                    |

在入站消息上，插件构建一个 `Envelope` 并调用 `this.handleInbound(envelope)` —— 基类处理其余部分：访问控制、群组门控、配对、会话路由、提示序列化、斜杠命令、指令注入、回复上下文以及崩溃恢复。

### 扩展点

- 通过 `registerCommand()` 注册自定义斜杠命令
- 通过包装 `handleInbound()` 添加输入状态/反应显示
- 通过 `onToolCall()` 实现工具调用钩子
- 在调用 `handleInbound()` 前将媒体信息附加到 Envelope

### 发现与加载

外部插件是 **extensions**，由 `ExtensionManager` 管理，在 `qwen-extension.json` 中声明：

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

`qwen channel start` 时的加载顺序：加载设置 → 注册内置插件 → 扫描扩展 → 动态导入 + 验证 → 注册（拒绝冲突）→ 验证配置 → `createChannel()` → `connect()`。

插件在进程内运行（无沙箱），信任模型与 npm 依赖相同。

## 配置

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // 环境变量引用
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

认证方式因插件而异：静态 token（Telegram）、应用凭证（钉钉）、二维码登录（微信）、代理 token（TMCP）。

## CLI 命令

```bash
# Channels
qwen channel start [name]                     # 启动所有或指定 channel
qwen channel stop                             # 停止正在运行的服务
qwen channel status                           # 显示 channel、会话、运行时间
qwen channel pairing list <ch>                # 待处理的配对请求
qwen channel pairing approve <ch> <code>      # 批准一个配对请求

# Extensions
qwen extensions install <path-or-package>     # 安装
qwen extensions link <local-path>             # 开发时使用符号链接
qwen extensions list                          # 显示已安装的扩展
qwen extensions remove <name>                 # 卸载
```

## 包结构

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP 进程生命周期、会话管理
│       ├── SessionRouter.ts # 发送者↔会话映射、持久化
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # 群聊策略 + 提及门控
│       ├── PairingStore.ts  # 配对码生成与审批
│       ├── ChannelBase.ts   # 抽象基类：路由、斜杠命令
│       └── types.ts         # Envelope、ChannelConfig 等
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## 未来工作

### 安全与群聊

- **按群组限制工具** — 每个群组的 `tools`/`toolsBySender` 拒绝/允许列表
- **群组上下文历史** — 环形缓冲区，存储最近被跳过的消息，在 @提及前附加
- **正则提及模式** — 当 @提及元数据不可靠时使用 `mentionPatterns` 回退
- **按群组指令** — `GroupConfig` 中的 `instructions` 字段，支持按群组配置角色
- **`/activation` 命令** — 运行时切换 `requireMention`，持久化到磁盘

### 运维工具

- **`qwen channel doctor`** — 配置验证、环境变量、Bot token、网络检查
- **`qwen channel status --probe`** — 每个 channel 的实时连通性检查

### 平台扩展

- **Discord** — Bot API + Gateway，支持服务器/频道/私信/线程
- **Slack** — Bolt SDK，Socket Mode，支持工作区/频道/私信/线程

### 多 Agent

- **多 Agent 路由** — 多个 agent，按 channel/群组/用户绑定
- **广播群组** — 多个 agent 响应同一条消息

### 插件生态

- **社区插件模板** — `create-qwen-channel` 脚手架工具
- **插件注册/发现** — `qwen extensions search`，版本兼容性