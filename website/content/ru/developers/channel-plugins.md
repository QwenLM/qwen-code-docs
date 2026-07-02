# Руководство разработчика плагинов каналов

Плагин канала подключает Qwen Code к платформе обмена сообщениями. Он упаковывается как [расширение](../users/extension/introduction) и загружается при запуске. Пользовательскую документацию по установке и настройке плагинов см. в разделе [Плагины](../users/features/channels/plugins).

## Как это работает

Ваш плагин находится на уровне Platform Adapter (адаптера платформы). Вы обрабатываете специфичные для платформы задачи (подключение, получение сообщений, отправка ответов). `ChannelBase` берет на себя всё остальное (контроль доступа, маршрутизация сессий, постановка промптов в очередь, слэш-команды, восстановление после сбоев).

```
Ваш плагин  →  создает Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  вызывает ваш sendMessage() с ответом агента
```

`ChannelAgentBridge` — это контракт моста, обращенный к адаптеру. Текущий автономный путь `qwen channel start` предоставляет `AcpBridge`, но в коде плагина параметры конструктора следует типизировать как `ChannelAgentBridge`, чтобы тот же адаптер мог работать с другими реализациями моста в будущем.

Примечание по миграции для существующих плагинов на TypeScript: если в конструкторе или фабрике вашего адаптера `bridge` явно типизирован как `AcpBridge`, измените эту аннотацию на `ChannelAgentBridge` и используйте только методы, предоставляемые этим контрактом. Плагины на JavaScript не затрагиваются во время выполнения, а автономный `qwen channel start` по-прежнему передает текущую реализацию `AcpBridge`.

## Режимы выполнения

Один и тот же адаптер плагина может работать в любой из сред выполнения канала:

- `qwen channel start [name]` — это автономный сервис на базе ACP. Он по-прежнему использует `AcpBridge` и остается стабильной командой для запуска каналов вне демона.
- `qwen serve --channel <name>` и повторяемые флаги `--channel` запускают экспериментальный воркер канала, управляемый демоном. `--channel all` запускает все настроенные каналы. Воркер принадлежит `qwen serve`, подключается к этому демону через SDK и передает адаптерам фасад `ChannelAgentBridge`, работающий на базе `DaemonChannelBridge`.

Каналы, управляемые демоном, наследуют жизненный цикл демона и отчеты о состоянии. Они намеренно вынесены в отдельный процесс, чтобы сбои адаптера или SDK платформы не приводили к падению демона. Демон по-прежнему привязан к одному рабочему пространству, поэтому каждая выбранная конфигурация канала должна использовать `cwd`, который разрешается в рабочее пространство демона.

## Объект плагина

Точка входа вашего расширения экспортирует `plugin`, соответствующий `ChannelPlugin`:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Уникальный ID, используется в поле "type" в settings.json
  displayName: 'My Platform', // Отображается в выводе CLI
  requiredConfigFields: ['apiKey'], // Проверяется при запуске (помимо стандартного ChannelConfig)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## Адаптер канала

Расширьте `ChannelBase` и реализуйте три метода:

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
    // Подключитесь к вашей платформе, зарегистрируйте обработчики сообщений
    // При получении сообщения:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Стабильный, уникальный ID пользователя платформы
      senderName: '...', // Отображаемое имя
      chatId: '...', // ID чата/беседы (различается для личных сообщений и групп)
      text: '...', // Текст сообщения (удалите @упоминания)
      isGroup: false, // Точное значение — используется GroupGate
      isMentioned: false, // Точное значение — используется GroupGate
      isReplyToBot: false, // Точное значение — используется GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Форматирование markdown → формат платформы, разбивка на части при необходимости, доставка
  }

  disconnect(): void {
    // Очистка подключений
  }
}
```

Большинство адаптеров должны передавать `options` без изменений. Если адаптер создает собственный `SessionRouter` и передает этот маршрутизатор в `super()`, установите `registerBridgeEvents: true` в `ChannelBaseOptions`, чтобы `ChannelBase` по-прежнему напрямую получал события `toolCall` и `sessionDied`. Оставьте это значение не установленным для маршрутизаторов, предоставляемых шлюзом канала.

Если ваш адаптер предоставляет поведение shell-команды, перед её включением проверьте, что `bridge.shellCommand` существует. Воркеры, управляемые демоном, опускают этот опциональный метод, если только демон не анонсирует возможность `session_shell_command`.

## Объект Envelope

Нормализованный объект сообщения, который вы создаете из данных платформы. Булевы флаги управляют логикой шлюзов (gate), поэтому они должны быть точными.

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Да       | Используйте `this.name`                                                    |
| `senderId`       | string       | Да       | Должен быть стабильным для всех сообщений (используется для маршрутизации сессий + контроля доступа) |
| `senderName`     | string       | Да       | Отображаемое имя                                                           |
| `chatId`         | string       | Да       | Должен различать личные сообщения и группы                                 |
| `text`           | string       | Да       | Удалите @упоминания бота                                                   |
| `threadId`       | string       | Нет      | Для `sessionScope: "thread"`                                               |
| `messageId`      | string       | Нет      | ID сообщения платформы — полезно для корреляции ответов                    |
| `isGroup`        | boolean      | Да       | GroupGate полагается на это                                                |
| `isMentioned`    | boolean      | Да       | GroupGate полагается на это                                                |
| `isReplyToBot`   | boolean      | Да       | GroupGate полагается на это                                                |
| `referencedText` | string       | Нет      | Цитируемое сообщение — добавляется в начало как контекст                   |
| `imageBase64`    | string       | Нет      | Изображение в кодировке Base64 (устарело — используйте `attachments`)      |
| `imageMimeType`  | string       | Нет      | например, `image/jpeg` (устарело — используйте `attachments`)              |
| `attachments`    | Attachment[] | Нет      | Структурированные медиа-вложения (см. ниже)                                |

### Вложения

Используйте массив `attachments` для изображений, файлов, аудио и видео. `handleInbound()` обрабатывает их автоматически: изображения с `data` в формате base64 отправляются в модель как визуальный ввод, а для файлов с `filePath` их путь добавляется в промпт, чтобы агент мог их прочитать.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // данные в кодировке base64 (изображения, небольшие файлы)
  filePath?: string; // абсолютный путь к локальному файлу (большие файлы сохраняются на диск)
  mimeType: string; // например, 'application/pdf', 'image/jpeg'
  fileName?: string; // оригинальное имя файла с платформы
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

Устаревшие поля `imageBase64`/`imageMimeType` по-прежнему работают для обратной совместимости, но для нового кода предпочтительнее использовать `attachments`.

## Манифест расширения

Ваш `qwen-extension.json` объявляет тип канала. Ключ должен совпадать с `channelType` в объекте вашего плагина:

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

## Опциональные точки расширения

**Пользовательские слэш-команды** — регистрируются в конструкторе:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Ответ');
  return true; // обработано, не передавать агенту
});
```

**Индикаторы работы** — переопределите `onPromptStart()` и `onPromptEnd()`, чтобы отображать специфичные для платформы индикаторы набора текста. Эти хуки срабатывают только тогда, когда промпт действительно начинает обрабатываться — не для буферизованных сообщений (режим collect) или заблокированных/отфильтрованных сообщений:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // API вашей платформы
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Хуки вызова инструментов** — переопределите `onToolCall()`, чтобы отображать активность агента (например, "Выполняется shell-команда...").

**Хуки стриминга** — переопределите `onResponseChunk(chatId, chunk, sessionId)` для прогрессивного отображения по частям (например, редактирование сообщения на месте). Переопределите `onResponseComplete(chatId, fullText, sessionId)` для настройки финальной доставки.

**Блокировка стриминга** — установите `blockStreaming: "on"` в конфигурации канала. Базовый класс автоматически разбивает ответы на несколько сообщений по границам абзацев. Код плагина не требуется — это работает вместе с `onResponseChunk`.

**Медиа** — заполните `envelope.attachments` изображениями/файлами. См. раздел [Вложения](#attachments) выше.

## Эталонные реализации

- **Пример плагина** (`packages/channels/plugin-example/`) — минимальный адаптер на базе WebSocket, хорошая отправная точка
- **Telegram** (`packages/channels/telegram/`) — полнофункциональный: изображения, файлы, форматирование, индикаторы набора текста
- **DingTalk** (`packages/channels/dingtalk/`) — стриминговый с поддержкой форматированного текста