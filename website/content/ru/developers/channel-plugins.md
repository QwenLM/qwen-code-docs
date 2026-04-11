# Руководство разработчика плагинов каналов

Плагин канала подключает Qwen Code к платформе обмена сообщениями. Он упаковывается как [расширение](../users/extension/introduction) и загружается при запуске. Документацию для пользователей по установке и настройке плагинов см. в разделе [Плагины](../users/features/channels/plugins).

## Как это устроено

Ваш плагин находится на уровне Platform Adapter. Вы отвечаете за специфичные для платформы задачи (подключение, получение сообщений, отправка ответов). `ChannelBase` берет на себя всё остальное (управление доступом, маршрутизацию сессий, очередь промптов, слэш-команды, восстановление после сбоев).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## Объект плагина

Точка входа вашего расширения экспортирует объект `plugin`, соответствующий интерфейсу `ChannelPlugin`:

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

Нормализованный объект сообщения, который вы формируете на основе данных платформы. Логические флаги управляют логикой шлюзов, поэтому они должны быть точными.

| Поле            | Тип         | Обязательно | Примечания                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Да      | Используйте `this.name`                                                            |
| `senderId`       | string       | Да      | Должен оставаться неизменным между сообщениями (используется для маршрутизации сессий и управления доступом) |
| `senderName`     | string       | Да      | Отображаемое имя                                                               |
| `chatId`         | string       | Да      | Должен различать личные сообщения и группы                                           |
| `text`           | string       | Да      | Удалите @упоминания бота                                                        |
| `threadId`       | string       | Нет       | Для `sessionScope: "thread"`                                               |
| `messageId`      | string       | Нет       | ID сообщения платформы — полезно для сопоставления ответов                      |
| `isGroup`        | boolean      | Да      | От этого зависит работа GroupGate                                                   |
| `isMentioned`    | boolean      | Да      | От этого зависит работа GroupGate                                                   |
| `isReplyToBot`   | boolean      | Да      | От этого зависит работа GroupGate                                                   |
| `referencedText` | string       | Нет       | Цитируемое сообщение — добавляется в начало как контекст                                      |
| `imageBase64`    | string       | Нет       | Изображение в формате Base64 (устаревшее — предпочтительно `attachments`)                       |
| `imageMimeType`  | string       | Нет       | Например, `image/jpeg` (устаревшее — предпочтительно `attachments`)                         |
| `attachments`    | Attachment[] | Нет       | Структурированные медиа-вложения (см. ниже)                                   |

### Attachments

Используйте массив `attachments` для изображений, файлов, аудио и видео. `handleInbound()` обрабатывает их автоматически: изображения с `data` в формате base64 отправляются модели как визуальный ввод, а для файлов с `filePath` их путь добавляется к промпту, чтобы агент мог их прочитать.

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

Устаревшие поля `imageBase64`/`imageMimeType` по-прежнему работают для обратной совместимости, но для нового кода рекомендуется использовать `attachments`.

## Манифест расширения

В файле `qwen-extension.json` объявляется тип канала. Ключ должен совпадать со значением `channelType` в объекте вашего плагина:

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

**Пользовательские слэш-команды** — регистрируются в конструкторе:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Индикаторы работы** — переопределите `onPromptStart()` и `onPromptEnd()`, чтобы отображать специфичные для платформы индикаторы набора текста. Эти хуки срабатывают только когда промпт действительно начинает обрабатываться — не для буферизованных сообщений (режим collect) или сообщений, отфильтрованных/заблокированных шлюзами:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Хуки вызова инструментов** — переопределите `onToolCall()`, чтобы отображать активность агента (например, "Running shell command...").

**Хуки потоковой передачи** — переопределите `onResponseChunk(chatId, chunk, sessionId)` для пошагового отображения по частям (например, редактирование сообщения на месте). Переопределите `onResponseComplete(chatId, fullText, sessionId)`, чтобы настроить финальную доставку.

**Потоковая передача блоками** — установите `blockStreaming: "on"` в конфигурации канала. Базовый класс автоматически разбивает ответы на несколько сообщений по границам абзацев. Дополнительный код в плагине не требуется — это работает совместно с `onResponseChunk`.

**Медиа** — заполняйте `envelope.attachments` изображениями/файлами. См. раздел [Attachments](#attachments) выше.

## Референсные реализации

- **Пример плагина** (`packages/channels/plugin-example/`) — минимальный адаптер на базе WebSocket, хорошая отправная точка
- **Telegram** (`packages/channels/telegram/`) — полнофункциональный: поддержка изображений, файлов, форматирования, индикаторов набора текста
- **DingTalk** (`packages/channels/dingtalk/`) — потоковая реализация с обработкой форматированного текста