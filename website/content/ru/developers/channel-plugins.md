# Руководство разработчика канального плагина

Канальный плагин подключает Qwen Code к платформе обмена сообщениями. Он упаковывается как [расширение](../users/extension/introduction) и загружается при запуске. Документацию для пользователей по установке и настройке плагинов см. в разделе [Плагины](../users/features/channels/plugins).

## Как это работает вместе

Ваш плагин находится на уровне Platform Adapter. Вы обрабатываете специфические для платформы задачи (подключение, получение сообщений, отправку ответов). `ChannelBase` обрабатывает всё остальное (контроль доступа, маршрутизацию сессий, постановку запросов в очередь, слэш-команды, восстановление после сбоев).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## Объект плагина

Точка входа вашего расширения экспортирует `plugin`, соответствующий интерфейсу `ChannelPlugin`:

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

## Адаптер канала

Расширьте `ChannelBase` и реализуйте три метода:

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

## Объект Envelope

Нормализованный объект сообщения, который вы создаёте из данных платформы. Логические флаги управляют логикой шлюзов, поэтому они должны быть точными.

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Да       | Используйте `this.name`                                                            |
| `senderId`       | string       | Да       | Должен быть стабильным между сообщениями (используется для маршрутизации сессий и контроля доступа) |
| `senderName`     | string       | Да       | Отображаемое имя                                                               |
| `chatId`         | string       | Да       | Должен различать личные сообщения и группы                                           |
| `text`           | string       | Да       | Удаляйте упоминания бота (@)                                                        |
| `threadId`       | string       | Нет       | Для `sessionScope: "thread"`                                               |
| `messageId`      | string       | Нет       | Идентификатор сообщения платформы — полезен для корреляции ответов                      |
| `isGroup`        | boolean      | Да       | GroupGate полагается на это                                                   |
| `isMentioned`    | boolean      | Да       | GroupGate полагается на это                                                   |
| `isReplyToBot`   | boolean      | Да       | GroupGate полагается на это                                                   |
| `referencedText` | string       | Нет       | Цитируемое сообщение — добавляется как контекст                                      |
| `imageBase64`    | string       | Нет       | Изображение в формате Base64 (устарело — используйте `attachments`)                       |
| `imageMimeType`  | string       | Нет       | например, `image/jpeg` (устарело — используйте `attachments`)                         |
| `attachments`    | Attachment[] | Нет       | Структурированные вложения медиа (см. ниже)                                   |

### Attachments

Используйте массив `attachments` для изображений, файлов, аудио и видео. `handleInbound()` обрабатывает их автоматически: изображения с данными в формате base64 (`data`) отправляются модели как визуальный ввод, файлы с `filePath` добавляют свой путь к запросу, чтобы агент мог их прочитать.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

Пример — обработка загрузки файла в вашем адаптере:

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

Устаревшие поля `imageBase64`/`imageMimeType` всё ещё работают для обратной совместимости, но для нового кода рекомендуется использовать `attachments`.

## Манифест расширения

Ваш файл `qwen-extension.json` объявляет тип канала. Ключ должен совпадать с `channelType` в объекте плагина:

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

## Дополнительные точки расширения

**Пользовательские слэш-команды** — зарегистрируйте в конструкторе:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Индикаторы работы** — переопределите `onPromptStart()` и `onPromptEnd()`, чтобы отображать индикаторы набора текста, специфичные для платформы. Эти хуки срабатывают только когда запрос действительно начинает обрабатываться — не для буферизованных сообщений (режим сбора) или заблокированных сообщений:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Хуки вызова инструментов** — переопределите `onToolCall()`, чтобы отображать активность агента (например, 'Выполнение команды оболочки...').

**Хуки потоковой передачи** — переопределите `onResponseChunk(chatId, chunk, sessionId)`, для пошагового отображения каждого фрагмента (например, редактирование сообщения на месте). Переопределите `onResponseComplete(chatId, fullText, sessionId)`, чтобы настроить окончательную доставку.

**Блочная потоковая передача** — установите `blockStreaming: "on"` в конфигурации канала. Базовый класс автоматически разбивает ответы на несколько сообщений по границам абзацев. Не требуется никакого кода плагина — это работает вместе с `onResponseChunk`.

**Медиа** — заполните `envelope.attachments` изображениями/файлами. См. [Attachments](#attachments) выше.

## Примеры реализаций

- **Plugin example** (`packages/channels/plugin-example/`) — минимальный адаптер на основе WebSocket, хорошая отправная точка
- **Telegram** (`packages/channels/telegram/`) — полнофункциональный: изображения, файлы, форматирование, индикаторы набора
- **DingTalk** (`packages/channels/dingtalk/`) — потоковый с обработкой форматированного текста