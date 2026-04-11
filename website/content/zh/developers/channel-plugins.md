# Channel Plugin 开发者指南

Channel Plugin 用于将 Qwen Code 连接到消息平台。它被打包为 [extension](../users/extension/introduction) 并在启动时加载。有关安装和配置插件的用户文档，请参阅 [Plugins](../users/features/channels/plugins)。

## 组件协作关系

你的插件位于 Platform Adapter 层。你需要处理平台特定的逻辑（连接、接收消息、发送响应）。`ChannelBase` 负责处理其余所有事务（访问控制、会话路由、提示词排队、斜杠命令、崩溃恢复）。

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## Plugin 对象

你的扩展入口文件需导出一个符合 `ChannelPlugin` 接口的 `plugin` 对象：

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
import type { Envelope } from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  async connect(): Promise<void> {
    // Connect to your platform, register message handlers
    // When a message arrives:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Stable, unique platform user ID
      senderName: '...', // Display name
      chatId: '...', // Chat/conversation ID (distinct for DMs vs groups)
      text: '...', // Message text (strip @mentions)
      isGroup: false, // Accurate — used by GroupGate
      isMentioned: false, // Accurate — used by GroupGate
      isReplyToBot: false, // Accurate — used by GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Format markdown → platform format, chunk if needed, deliver
  }

  disconnect(): void {
    // Clean up connections
  }
}
```

## Envelope 对象

这是你根据平台数据构建的标准化消息对象。其中的布尔值标志用于驱动 Gate 逻辑，因此必须准确无误。

| 字段             | 类型         | 是否必填 | 说明                                                                         |
| ---------------- | ------------ | -------- | ---------------------------------------------------------------------------- |
| `channelName`    | string       | 是       | 使用 `this.name`                                                             |
| `senderId`       | string       | 是       | 在多条消息间必须保持稳定（用于会话路由和访问控制）                           |
| `senderName`     | string       | 是       | 显示名称                                                                     |
| `chatId`         | string       | 是       | 必须能区分私聊和群聊                                                         |
| `text`           | string       | 是       | 需移除对机器人的 @提及                                                       |
| `threadId`       | string       | 否       | 用于 `sessionScope: "thread"`                                                |
| `messageId`      | string       | 否       | 平台消息 ID —— 适用于响应关联                                                |
| `isGroup`        | boolean      | 是       | `GroupGate` 依赖此字段                                                       |
| `isMentioned`    | boolean      | 是       | `GroupGate` 依赖此字段                                                       |
| `isReplyToBot`   | boolean      | 是       | `GroupGate` 依赖此字段                                                       |
| `referencedText` | string       | 否       | 引用的消息 —— 将作为上下文前置                                               |
| `imageBase64`    | string       | 否       | Base64 编码的图片（旧版字段 —— 推荐使用 `attachments`）                      |
| `imageMimeType`  | string       | 否       | 例如 `image/jpeg`（旧版字段 —— 推荐使用 `attachments`）                      |
| `attachments`    | Attachment[] | 否       | 结构化媒体附件（见下文）                                                     |

### Attachments

使用 `attachments` 数组传递图片、文件、音频和视频。`handleInbound()` 会自动解析它们：包含 base64 `data` 的图片会作为视觉输入发送给模型；包含 `filePath` 的文件会将其路径追加到提示词中，以便 Agent 读取。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

示例 —— 在 Adapter 中处理文件上传：

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

旧版的 `imageBase64`/`imageMimeType` 字段仍为保持向后兼容而保留，但新代码推荐使用 `attachments`。

## Extension Manifest

你的 `qwen-extension.json` 文件用于声明 Channel 类型。其中的键必须与 Plugin 对象中的 `channelType` 保持一致：

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

**自定义斜杠命令** —— 在构造函数中注册：

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**运行状态指示器** —— 重写 `onPromptStart()` 和 `onPromptEnd()` 以显示平台特定的输入指示器。这些钩子仅在提示词真正开始处理时触发 —— 缓冲消息（collect 模式）或被拦截/阻止的消息不会触发：

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**工具调用钩子** —— 重写 `onToolCall()` 以显示 Agent 活动状态（例如 "Running shell command..."）。

**流式处理钩子** —— 重写 `onResponseChunk(chatId, chunk, sessionId)` 实现逐块渐进式显示（例如原地编辑消息）。重写 `onResponseComplete(chatId, fullText, sessionId)` 可自定义最终交付逻辑。

**块级流式传输** —— 在 Channel 配置中设置 `blockStreaming: "on"`。基类会自动在段落边界处将响应拆分为多条消息。无需编写插件代码 —— 它与 `onResponseChunk` 协同工作。

**媒体文件** —— 在 `envelope.attachments` 中填充图片/文件。参见上方的 [Attachments](#attachments)。

## 参考实现

- **Plugin 示例** (`packages/channels/plugin-example/`) —— 基于 WebSocket 的最小化 Adapter，适合作为入门起点
- **Telegram** (`packages/channels/telegram/`) —— 功能完整：支持图片、文件、格式化和输入指示器
- **钉钉 (DingTalk)** (`packages/channels/dingtalk/`) —— 基于流式传输，支持富文本处理