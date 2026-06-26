# 频道插件开发者指南

频道插件将 Qwen Code 连接到消息平台。它以[扩展](../users/extension/introduction)形式打包，并在启动时加载。关于安装和配置插件的面向用户的文档，请参阅[插件](../users/features/channels/plugins)。

## 整体架构

你的插件位于平台适配器层。你负责处理平台相关的事务（连接、接收消息、发送响应）。`ChannelBase` 处理其他所有事情（访问控制、会话路由、提示队列、斜杠命令、崩溃恢复）。

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## 插件对象

你的扩展入口点导出一个符合 `ChannelPlugin` 的 `plugin`：

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

## 频道适配器

继承 `ChannelBase` 并实现三个方法：

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

## Envelope

你根据平台数据构建的标准化消息对象。布尔标志驱动门控逻辑，因此必须准确。

| 字段               | 类型         | 必需 | 说明                                                                      |
| ----------------- | ------------ | ---- | ------------------------------------------------------------------------- |
| `channelName`     | string       | 是   | 使用 `this.name`                                                          |
| `senderId`        | string       | 是   | 必须在多个消息间保持稳定（用于会话路由和访问控制）                        |
| `senderName`      | string       | 是   | 显示名称                                                                  |
| `chatId`          | string       | 是   | 必须区分私聊和群组                                                        |
| `text`            | string       | 是   | 移除机器人的 @提及                                                        |
| `threadId`        | string       | 否   | 用于 `sessionScope: "thread"`                                             |
| `messageId`       | string       | 否   | 平台消息 ID — 用于响应关联                                                |
| `isGroup`         | boolean      | 是   | GroupGate 依赖此字段                                                      |
| `isMentioned`     | boolean      | 是   | GroupGate 依赖此字段                                                      |
| `isReplyToBot`    | boolean      | 是   | GroupGate 依赖此字段                                                      |
| `referencedText`  | string       | 否   | 引用的消息 — 作为上下文前置                                               |
| `imageBase64`     | string       | 否   | Base64 编码的图像（旧版 — 推荐使用 `attachments`）                        |
| `imageMimeType`   | string       | 否   | 例如 `image/jpeg`（旧版 — 推荐使用 `attachments`）                        |
| `attachments`     | Attachment[] | 否   | 结构化的媒体附件（见下方）                                                |

### 附件

使用 `attachments` 数组处理图像、文件、音频和视频。`handleInbound()` 会自动解析它们：带有 base64 `data` 的图像作为视觉输入发送给模型，带有 `filePath` 的文件将其路径附加到提示中，以便代理读取。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
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

旧的 `imageBase64`/`imageMimeType` 字段仍可用于向后兼容，但新代码推荐使用 `attachments`。

## 扩展清单

你的 `qwen-extension.json` 声明了频道类型。该键必须与插件对象中的 `channelType` 匹配：

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

**自定义斜杠命令** — 在构造函数中注册：

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**输入指示器** — 重写 `onPromptStart()` 和 `onPromptEnd()` 以显示平台特定的输入指示器。这些钩子仅在提示实际开始处理时触发 — 不会为缓冲消息（收集模式）或被门控/阻止的消息触发：

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**工具调用钩子** — 重写 `onToolCall()` 以显示代理活动（例如“运行 shell 命令...”）。

**流式钩子** — 重写 `onResponseChunk(chatId, chunk, sessionId)` 以实现每个块的渐进显示（例如原地编辑消息）。重写 `onResponseComplete(chatId, fullText, sessionId)` 以自定义最终交付。

**阻止流式** — 在频道配置中设置 `blockStreaming: "on"`。基类会自动在段落边界将响应拆分为多条消息。无需插件代码 — 它与 `onResponseChunk` 配合工作。

**媒体** — 用图像/文件填充 `envelope.attachments`。请参阅上面的[附件](#attachments)。

## 参考实现

- **插件示例** (`packages/channels/plugin-example/`) — 基于 WebSocket 的最小适配器，很好的起点
- **Telegram** (`packages/channels/telegram/`) — 功能完整：图像、文件、格式化、输入指示器
- **DingTalk** (`packages/channels/dingtalk/`) — 基于流，处理富文本