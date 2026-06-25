# 自定义 Channel 插件

你可以通过打包为[扩展](../../extension/introduction)的自定义平台适配器来扩展 channel 系统。这让你能够将 Qwen Code 连接到任意消息平台、webhook 或自定义传输层。

## 工作原理

Channel 插件在启动时从已激活的扩展中加载。当 `qwen channel start` 运行时，它会：

1. 扫描所有已启用扩展的 `qwen-extension.json` 中的 `channels` 条目
2. 动态导入每个 channel 的入口点
3. 注册 channel 类型，使其可在 `settings.json` 中被引用
4. 使用插件的工厂函数创建 channel 实例

你的自定义 channel 可以免费获得完整的共享管道：发送方门控、群组策略、会话路由、slash 命令、崩溃恢复，以及连接到 agent 的 ACP 桥接。

## 安装自定义 Channel

安装提供 channel 插件的扩展：

```bash
# 从本地路径安装（用于开发或私有插件）
qwen extensions install /path/to/my-channel-extension

# 或以开发模式链接（修改立即生效）
qwen extensions link /path/to/my-channel-extension
```

## 配置自定义 Channel

在 `~/.qwen/settings.json` 中添加 channel 条目，使用扩展提供的自定义类型：

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

`type` 必须与已安装扩展注册的 channel 类型相匹配。请查阅扩展文档，了解需要哪些插件特定字段（例如 `apiKey`、`webhookUrl`）。

所有标准 channel 选项均适用于自定义 channel：

| Option         | Description                                    |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`、`pairing` 或 `open`              |
| `allowedUsers` | 发送方 ID 的静态允许列表                       |
| `sessionScope` | `user`、`thread` 或 `single`                  |
| `cwd`          | agent 的工作目录                               |
| `instructions` | 附加到每个会话第一条消息之前                   |
| `model`        | 该 channel 的模型覆盖设置                      |
| `groupPolicy`  | `disabled`、`allowlist` 或 `open`             |
| `groups`       | 每个群组的配置项                               |

各选项的详细说明请参阅[概览](./overview)。

## 启动 Channel

```bash
# 启动所有 channel，包括自定义 channel
qwen channel start

# 仅启动你的自定义 channel
qwen channel start my-bot
```

## 免费获得的功能

自定义 channel 自动支持内置 channel 的所有功能：

- **发送方策略** — `allowlist`、`pairing` 和 `open` 访问控制
- **群组策略** — 每个群组的配置，支持可选的 @mention 门控
- **会话路由** — 按用户、按线程或单一共享会话
- **私信配对** — 为未知用户提供完整的配对码流程
- **Slash 命令** — `/help`、`/clear`、`/status` 开箱即用
- **自定义指令** — 附加到每个会话的第一条消息之前
- **崩溃恢复** — 自动重启并保留会话
- **会话级序列化** — 消息排队处理，防止竞态条件

## 构建自己的 Channel 插件

想为新平台构建 channel 插件？请参阅 [Channel 插件开发者指南](../../../developers/channel-plugins.md)，了解 `ChannelPlugin` 接口、`Envelope` 格式和扩展点。