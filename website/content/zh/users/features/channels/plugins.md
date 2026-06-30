# 自定义 Channel 插件

你可以通过打包为[扩展](../../extension/introduction)的自定义平台适配器来扩展 channel 系统。这使你可以将 Qwen Code 连接到任何消息平台、webhook 或自定义传输层。

## 工作原理

Channel 插件在启动时从活跃的扩展中加载。当运行 `qwen channel start` 时，它会：

1. 扫描所有已启用的扩展，查找其 `qwen-extension.json` 中的 `channels` 条目
2. 动态导入每个 channel 的入口点
3. 注册 channel 类型，以便在 `settings.json` 中引用
4. 使用插件的工厂函数创建 channel 实例

你的自定义 channel 可以免费获得完整的共享管道：发送者门控、群组策略、会话路由、斜杠命令、崩溃恢复以及 agent 桥接。独立的 `qwen channel start` 目前提供 `AcpBridge`；插件适配器代码应依赖于面向适配器的 `ChannelAgentBridge` 契约。现有的带有显式 `AcpBridge` 桥接参数的 TypeScript 插件应将该注解迁移为 `ChannelAgentBridge`；JavaScript 插件在运行时不受影响。

## 安装自定义 Channel

安装提供 channel 插件的扩展：

```bash
# 从本地路径安装（用于开发或私有插件）
qwen extensions install /path/to/my-channel-extension

# 或者链接它以便开发（更改会立即生效）
qwen extensions link /path/to/my-channel-extension
```

## 配置自定义 Channel

使用扩展提供的自定义类型，将 channel 条目添加到 `~/.qwen/settings.json` 中：

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

`type` 必须与已安装扩展注册的 channel 类型匹配。请查阅扩展文档以了解需要哪些特定于插件的字段（例如 `apiKey`、`webhookUrl`）。

所有标准 channel 选项均适用于自定义 channel：

| 选项             | 描述                                           |
| ---------------- | ---------------------------------------------- |
| `senderPolicy`   | `allowlist`、`pairing` 或 `open`               |
| `allowedUsers`   | 发送者 ID 的静态白名单                         |
| `sessionScope`   | `user`、`thread` 或 `single`                   |
| `cwd`            | agent 的工作目录                               |
| `instructions`   | 追加到每个会话的第一条消息之前                 |
| `model`          | 该 channel 的模型覆盖配置                      |
| `groupPolicy`    | `disabled`、`allowlist` 或 `open`              |
| `groups`         | 每个群组的设置                                 |

有关每个选项的详细信息，请参阅[概述](./overview)。

## 启动 Channel

```bash
# 启动所有 channel，包括自定义的
qwen channel start

# 仅启动你的自定义 channel
qwen channel start my-bot
```

## 开箱即用的功能

自定义 channel 自动支持内置 channel 的所有功能：

- **发送者策略** — `allowlist`、`pairing` 和 `open` 访问控制
- **群组策略** — 每个群组的设置，支持可选的 @提及 门控
- **会话路由** — 按用户、按线程或单一共享会话
- **私信配对** — 针对未知用户的完整配对码流程
- **斜杠命令** — `/help`、`/clear`、`/status` 开箱即用
- **自定义指令** — 追加到每个会话的第一条消息之前
- **崩溃恢复** — 自动重启并保留会话
- **单会话序列化** — 消息排队以防止竞态条件

## 构建你自己的 Channel 插件

想为新平台构建 channel 插件？请参阅 [Channel 插件开发者指南](../../../developers/channel-plugins.md)，了解 `ChannelPlugin` 接口、`Envelope` 格式和扩展点。