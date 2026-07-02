# Channel 插件开发者指南

Channel 插件用于将 Qwen Code 连接到消息平台。它被打包为一个 [extension](../users/extension/introduction) 并在启动时加载。有关安装和配置插件的用户文档，请参阅 [Plugins](../users/features/channels/plugins)。

## 工作原理

你的插件位于 Platform Adapter 层。你需要处理特定于平台的事务（连接、接收消息、发送响应）。`ChannelBase` 负责处理其他所有事务（访问控制、会话路由、提示词排队、斜杠命令、崩溃恢复）。

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge` 是面向 adapter 的桥接契约。当前的独立 `qwen channel start` 路径提供了一个 `AcpBridge`，但插件代码应将构造函数参数类型化为 `ChannelAgentBridge`，以便同一个 adapter 以后可以在其他桥接实现后运行。

现有 TypeScript 插件的迁移说明：如果你的 adapter 构造函数或工厂显式将 `bridge` 类型化为 `AcpBridge`，请将该注解更改为 `ChannelAgentBridge`，并仅继续使用该契约暴露的方法。JavaScript 插件在运行时不受影响，且独立的 `qwen channel start` 仍会传递当前的 `AcpBridge` 实现。

## 运行时模式

同一个插件 adapter 可以由以下任一 Channel 运行时托管：

- `qwen channel start [name]` 是独立的 ACP 支持的服务。它仍然使用 `AcpBridge`，并且是在守护进程外运行 Channel 的稳定命令。
- `qwen serve --channel <name>` 和可重复的 `--channel` 标志会启动一个实验性的由守护进程管理的 Channel worker。`--channel all` 会启动所有已配置的 Channel。该 worker 由 `qwen serve` 拥有，通过 SDK 连接到该守护进程，并向 adapter 传递一个由 `DaemonChannelBridge` 支持的 `ChannelAgentBridge` 门面。

由守护进程管理的 Channel 继承守护进程的生命周期和状态报告。它们被刻意设计为进程外运行，这样 adapter 或平台 SDK 的故障就不会导致守护进程崩溃。守护进程仍然绑定到一个工作区，因此每个选定的 Channel 配置都必须使用一个能解析到守护进程工作区的 `cwd`。

## 插件对象

你的 extension 入口点导出一个符合 `ChannelPlugin` 的 `plugin`：

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Unique ID, used in settings.json "type" field
  displayName: 'My Platform', // Shown in CLI output
  requiredConfigFields: ['apiKey'], // Validated at startup (beyond standard ChannelConfig)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## Channel Adapter

继承 `ChannelBase` 并实现以下三个方法：

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type {
  ChannelBaseOptions,
  ChannelAgentBridge,
  ChannelConfig,
  Envelope,
} from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  constructor(
    name: string,
    config: ChannelConfig,
    bridge: ChannelAgentBridge,
    options?: ChannelBaseOptions,
  ) {
    super(name, config, bridge, options);
  }

  async connect(): Promise<void> {
    // 连接到你的平台，注册消息处理器
    // 当收到消息时：
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // 稳定、唯一的平台用户 ID
      senderName: '...', // 显示名称
      chatId: '...', // 聊天/会话 ID（区分私聊和群聊）
      text: '...', // 消息文本（去除 @提及）
      isGroup: false, // 必须准确 — 由 GroupGate 使用
      isMentioned: false, // 必须准确 — 由 GroupGate 使用
      isReplyToBot: false, // 必须准确 — 由 GroupGate 使用
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // 将 markdown 格式化为平台格式，必要时分块，然后发送
  }

  disconnect(): void {
    // 清理连接
  }
}
```

大多数 adapter 应原样传递 `options`。如果 adapter 创建了自己的 `SessionRouter` 并将该 router 传递给 `super()`，请在 `ChannelBaseOptions` 中设置 `registerBridgeEvents: true`，以便 `ChannelBase` 仍然能直接接收 `toolCall` 和 `sessionDied` 事件。对于由 Channel gateway 提供的 router，请保持未设置状态。

如果你的 adapter 暴露了 shell 命令行为，请在启用前检查 `bridge.shellCommand` 是否存在。除非守护进程通告了 `session_shell_command` 能力，否则由守护进程管理的 worker 会省略该可选方法。

## Envelope

这是你从平台数据构建的标准化消息对象。布尔标志驱动 gate 逻辑，因此它们必须准确。

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Yes      | 使用 `this.name`                                                           |
| `senderId`       | string       | Yes      | 在多条消息中必须保持稳定（用于会话路由 + 访问控制）                        |
| `senderName`     | string       | Yes      | 显示名称                                                                   |
| `chatId`         | string       | Yes      | 必须区分私聊和群聊                                                         |
| `text`           | string       | Yes      | 去除 bot 的 @提及                                                          |
| `threadId`       | string       | No       | 用于 `sessionScope: "thread"`                                              |
| `messageId`      | string       | No       | 平台消息 ID — 有助于响应关联                                               |
| `isGroup`        | boolean      | Yes      | GroupGate 依赖此项                                                         |
| `isMentioned`    | boolean      | Yes      | GroupGate 依赖此项                                                         |
| `isReplyToBot`   | boolean      | Yes      | GroupGate 依赖此项                                                         |
| `referencedText` | string       | No       | 引用的消息 — 作为上下文前置                                                |
| `imageBase64`    | string       | No       | Base64 编码的图片（遗留 — 推荐使用 `attachments`）                         |
| `imageMimeType`  | string       | No       | 例如 `image/jpeg`（遗留 — 推荐使用 `attachments`）                         |
| `attachments`    | Attachment[] | No       | 结构化媒体附件（见下文）                                                   |

### 附件

使用 `attachments` 数组处理图片、文件、音频和视频。`handleInbound()` 会自动解析它们：带有 base64 `data` 的图片会作为视觉输入发送给模型，带有 `filePath` 的文件会将其路径追加到提示词中，以便 agent 读取它们。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64 编码的数据（图片、小文件）
  filePath?: string; // 本地文件的绝对路径（大文件保存到磁盘）
  mimeType: string; // 例如 'application/pdf', 'image/jpeg'
  fileName?: string; // 来自平台的原始文件名
}
```

示例 — 在你的 adapter 中处理文件上传：

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const buf = await downloadFromPlatform(fileId);
const dir = join(tmpdir(), 'channel-files');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const filePath = join(dir, fileName);
writeFileSync(filePath, buf);

envelope.attachments = [
  {
    type: 'file',
    filePath,
    mimeType: 'application/pdf',
    fileName,
  },
];
```

遗留的 `imageBase64`/`imageMimeType` 字段为了向后兼容仍然有效，但新代码推荐使用 `attachments`。

## 扩展清单

你的 `qwen-extension.json` 声明了 Channel 类型。该 key 必须与你的 plugin 对象中的 `channelType` 匹配：

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

## 可选的扩展点

**自定义斜杠命令** — 在你的构造函数中注册：

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // 已处理，不要转发给 agent
});
```

**工作状态指示器** — 重写 `onPromptStart()` 和 `onPromptEnd()` 以显示特定于平台的输入指示器。这些钩子仅在提示词实际开始处理时触发 — 不会用于缓冲消息（collect 模式）或被 gate/阻止的消息：

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // 你的平台 API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**工具调用钩子** — 重写 `onToolCall()` 以显示 agent 活动（例如，“正在运行 shell 命令...”）。

**流式传输钩子** — 重写 `onResponseChunk(chatId, chunk, sessionId)` 以实现逐块渐进式显示（例如，就地编辑消息）。重写 `onResponseComplete(chatId, fullText, sessionId)` 以自定义最终交付。

**块级流式传输** — 在 Channel 配置中设置 `blockStreaming: "on"`。基类会自动在段落边界处将响应拆分为多条消息。无需插件代码 — 它与 `onResponseChunk` 协同工作。

**媒体** — 使用图片/文件填充 `envelope.attachments`。请参阅上文的 [附件](#附件)。

## 参考实现

- **Plugin example** (`packages/channels/plugin-example/`) — 最小的基于 WebSocket 的 adapter，良好的起点
- **Telegram** (`packages/channels/telegram/`) — 功能齐全：图片、文件、格式化、输入指示器
- **DingTalk** (`packages/channels/dingtalk/`) — 基于流并支持富文本处理