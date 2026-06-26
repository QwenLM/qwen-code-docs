# 自定义频道插件

你可以通过打包为[扩展](../../extension/introduction)的自定义平台适配器来扩展频道系统。这让你可以将 Qwen Code 连接到任何消息平台、webhook 或自定义传输。

## 工作原理

频道插件在启动时从启用的扩展中加载。当 `qwen channel start` 运行时，它会：

1. 扫描所有已启用扩展的 `qwen-extension.json` 中的 `channels` 条目
2. 动态导入每个频道的入口点
3. 注册频道类型，使其可以在 `settings.json` 中被引用
4. 使用插件的工厂函数创建频道实例

你的自定义频道可以免费获得完整的共享管道：发送者门控、群组策略、会话路由、斜杠命令、崩溃恢复以及到智能体的 ACP 桥接。

## 安装自定义频道

安装提供频道插件的扩展：

```bash
# 从本地路径（用于开发或私有插件）
qwen extensions install /path/to/my-channel-extension

# 或链接它以进行开发（更改会立即生效）
qwen extensions link /path/to/my-channel-extension
```

## 配置自定义频道

使用扩展提供的自定义类型，在 `~/.qwen/settings.json` 中添加一个频道条目：

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

`type` 必须与已安装扩展注册的频道类型匹配。请查看扩展的文档，了解需要哪些插件特定字段（例如 `apiKey`、`webhookUrl`）。

所有标准频道选项都适用于自定义频道：

| 选项              | 描述                                      |
| ---------------- | ----------------------------------------- |
| `senderPolicy`   | `allowlist`、`pairing` 或 `open`           |
| `allowedUsers`   | 发送者 ID 的静态允许列表                    |
| `sessionScope`   | `user`、`thread` 或 `single`              |
| `cwd`            | 智能体的工作目录                            |
| `instructions`   | 附加到每个会话的第一条消息之前               |
| `model`          | 频道的模型覆盖                              |
| `groupPolicy`    | `disabled`、`allowlist` 或 `open`          |
| `groups`         | 按群组的设置                                |

有关每个选项的详细信息，请参阅[概述](./overview)。

## 启动频道

```bash
# 启动所有频道，包括自定义频道
qwen channel start

# 仅启动你的自定义频道
qwen channel start my-bot
```

## 免费获得的功能

自定义频道自动支持内置频道所具备的所有功能：

- **发送者策略** — `allowlist`、`pairing` 和 `open` 访问控制
- **群组策略** — 按群组设置，可选的 @提及门控
- **会话路由** — 每用户、每线程或单个共享会话
- **DM 配对** — 对未知用户的完整配对码流程
- **斜杠命令** — `/help`、`/clear`、`/status` 开箱即用
- **自定义指令** — 附加到每个会话的第一条消息之前
- **崩溃恢复** — 自动重启并保留会话
- **每会话序列化** — 消息排队以防止竞态条件

## 构建你自己的频道插件

想为新平台构建频道插件？请参阅[频道插件开发者指南](../../../developers/channel-plugins.md)，了解 `ChannelPlugin` 接口、`Envelope` 格式和扩展点。