# 自定义 Channel 插件

你可以通过打包为 [扩展](../../extension/introduction) 的自定义平台适配器来扩展 Channel 系统。这让你能够将 Qwen Code 连接到任何消息平台、Webhook 或自定义传输协议。

## 工作原理

Channel 插件会在启动时从已启用的扩展中加载。当运行 `qwen channel start` 时，它会：

1. 扫描所有已启用的扩展，查找其 `qwen-extension.json` 中的 `channels` 配置项
2. 动态导入每个 Channel 的入口文件
3. 注册 Channel 类型，以便在 `settings.json` 中引用
4. 使用插件的工厂函数创建 Channel 实例

你的自定义 Channel 将自动获得完整的共享流水线支持：发送者权限校验、群组策略、会话路由、斜杠命令、崩溃恢复，以及连接到 Agent 的 ACP 桥接。

## 安装自定义 Channel

安装提供 Channel 插件的扩展：

```bash
# 从本地路径安装（适用于开发或私有插件）
qwen extensions install /path/to/my-channel-extension

# 或链接到本地进行开发（更改会立即生效）
qwen extensions link /path/to/my-channel-extension
```

## 配置自定义 Channel

使用扩展提供的自定义类型，在 `~/.qwen/settings.json` 中添加 Channel 配置项：

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

`type` 必须与已安装扩展注册的 Channel 类型匹配。请查阅扩展文档，了解需要哪些插件专属字段（例如 `apiKey`、`webhookUrl`）。

所有标准 Channel 选项均适用于自定义 Channel：

| 选项 | 描述 |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`、`pairing` 或 `open` |
| `allowedUsers` | 发送者 ID 的静态白名单 |
| `sessionScope` | `user`、`thread` 或 `single` |
| `cwd` | Agent 的工作目录 |
| `instructions` | 添加到每个会话首条消息之前 |
| `model` | 覆盖该 Channel 使用的模型 |
| `groupPolicy` | `disabled`、`allowlist` 或 `open` |
| `groups` | 按群组配置 |

有关每个选项的详细信息，请参阅 [概述](./overview)。

## 启动 Channel

```bash
# 启动所有 Channel（包括自定义 Channel）
qwen channel start

# 仅启动你的自定义 Channel
qwen channel start my-bot
```

## 自动支持的功能

自定义 Channel 自动支持所有内置 Channel 具备的功能：

- **发送者策略** — `allowlist`、`pairing` 和 `open` 访问控制
- **群组策略** — 按群组配置，支持可选的 @mention 拦截
- **会话路由** — 按用户、按线程或单一共享会话
- **私聊配对** — 为未知用户提供完整的配对码流程
- **斜杠命令** — `/help`、`/clear`、`/status` 开箱即用
- **自定义指令** — 自动添加到每个会话的首条消息前
- **崩溃恢复** — 自动重启并保留会话状态
- **会话级串行化** — 消息排队处理，避免竞态条件

## 构建你自己的 Channel 插件

想要为新平台构建 Channel 插件？请参阅 [Channel 插件开发者指南](/developers/channel-plugins)，了解 `ChannelPlugin` 接口、`Envelope` 格式以及扩展点。