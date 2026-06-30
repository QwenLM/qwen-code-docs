# Channel 插件开发指南

Channel 插件用于将 Qwen Code 连接到消息平台。它被打包为[扩展](../users/extension/introduction)并在启动时加载。有关安装和配置插件的用户文档，请参阅[插件](../users/features/channels/plugins)。

## 工作原理

你的插件位于平台适配层。你需要处理特定于平台的事务（连接、接收消息、发送响应）。`ChannelBase` 负责处理其他所有事务（访问控制、会话路由、提示词排队、斜杠命令、崩溃恢复）。

```
你的插件  →  构建 Envelope  →  handleInbound()
ChannelBase  →  门控 → 命令 → 路由 → ChannelAgentBridge.prompt()
ChannelBase  →  使用 agent 的响应调用你的 sendMessage()
```

`ChannelAgentBridge` 是面向适配器的桥接契约。当前的独立 `qwen channel start` 路径提供了一个 `AcpBridge`，但插件代码应将构造函数参数类型化为 `ChannelAgentBridge`，以便同一个适配器以后可以在其他桥接实现后运行。

现有 TypeScript 插件的迁移说明：如果你的适配器构造函数或工厂显式将 `bridge` 类型化为 `AcpBridge`，请将该注解更改为 `ChannelAgentBridge`，并仅继续使用该契约暴露的方法。JavaScript 插件在运行时不受影响，且独立的 `qwen channel start` 仍会传递当前的 `AcpBridge` 实现。

## 插件对象

你的扩展入口点导出一个符合 `ChannelPlugin` 的 `plugin`：

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // 唯一 ID，用于 settings.json 的 "type" 字段
  displayName: 'My Platform', // 显示在 CLI 输出中
  requiredConfigFields: ['apiKey'], // 在启动时进行验证（在标准 ChannelConfig 之外）
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## Channel 适配器

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

大多数适配器应原样传递 `options`。如果适配器创建了自己的 `SessionRouter` 并将该路由器传递给 `super()`，请在 `ChannelBaseOptions` 中设置 `registerBridgeEvents: true`，以便 `ChannelBase` 仍能直接接收 `toolCall` 和 `sessionDied` 事件。对于由 channel gateway 提供的路由器，请保持未设置状态。

## Envelope

这是你从平台数据构建的标准化消息对象。布尔标志驱动门控逻辑，因此它们必须准确。

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Yes      | 使用 `this.name`                                                            |
| `senderId`       | string       | Yes      | 在多条消息中必须保持稳定（用于会话路由 + 访问控制） |
| `senderName`     | string       | Yes      | 显示名称                                                               |
| `chatId`         | string       | Yes      | 必须区分私聊和群聊                                           |
| `text`           | string       | Yes      | 去除机器人的 @提及                                                        |
| `threadId`       | string       | No       | 用于 `sessionScope: "thread"`                                               |
| `messageId`      | string       | No       | 平台消息 ID — 有助于响应关联                      |
| `isGroup`        | boolean      | Yes      | GroupGate 依赖此字段                                                   |
| `isMentioned`    | boolean      | Yes      | GroupGate 依赖此字段                                                   |
| `isReplyToBot`   | boolean      | Yes      | GroupGate 依赖此字段                                                   |
| `referencedText` | string       | No       | 引用的消息 — 作为上下文前置                                      |
| `imageBase64`    | string       | No       | Base64 编码的图片（旧版 — 推荐使用 `attachments`）                       |
| `imageMimeType`  | string       | No       | 例如 `image/jpeg`（旧版 — 推荐使用 `attachments`）                         |
| `attachments`    | Attachment[] | No       | 结构化媒体附件（见下文）                                   |

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

示例 — 在你的适配器中处理文件上传：

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

旧版的 `imageBase64`/`imageMimeType` 字段为了向后兼容仍然有效，但新代码推荐使用 `attachments`。

## 扩展清单

你的 `qwen-extension.json` 声明了 channel 类型。该键必须与插件对象中的 `channelType` 匹配：

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

## 可选扩展点

**自定义斜杠命令** — 在你的构造函数中注册：

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // 已处理，不要转发给 agent
});
```

**工作状态指示器** — 重写 `onPromptStart()` 和 `onPromptEnd()` 以显示特定于平台的输入指示器。这些钩子仅在提示词实际开始处理时触发 — 不会用于缓冲消息（收集模式）或被门控/阻止的消息：

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

**分块流式传输** — 在 channel 配置中设置 `blockStreaming: "on"`。基类会自动在段落边界处将响应拆分为多条消息。无需插件代码 — 它与 `onResponseChunk` 协同工作。

**媒体** — 使用图片/文件填充 `envelope.attachments`。请参阅上文的[附件](#attachments)。

## 参考实现

- **插件示例**（`packages/channels/plugin-example/`）— 基于 WebSocket 的最小化适配器，良好的起点
- **Telegram**（`packages/channels/telegram/`）— 功能齐全：支持图片、文件、格式化、输入指示器
- **钉钉**（`packages/channels/dingtalk/`）— 基于流式传输，支持富文本处理