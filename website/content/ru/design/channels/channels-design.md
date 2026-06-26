# Дизайн каналов

> Внешние интеграции с мессенджерами для Qwen Code — взаимодействуйте с агентом из Telegram, WeChat и других.
>
> Документация пользователя: [Обзор каналов](../../users/features/channels/overview.md).

## Обзор

**Канал** соединяет внешнюю платформу обмена сообщениями с агентом Qwen Code. Настраивается в `settings.json`, управляется через подкоманды `qwen channel`, многопользовательский (каждый пользователь получает изолированную ACP-сессию).

## Архитектура

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    qwen-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        qwen-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** — подключается к внешнему API, преобразует сообщения в/из Envelope. **ACP Bridge** — запускает `qwen-code --acp`, управляет сессиями, генерирует события `textChunk`/`toolCall`/`disconnected`. **Session Router** — сопоставляет отправителей с ACP-сессиями через пространственные ключи (`<channel>:<sender>`). **Sender Gate** / **Group Gate** — контроль доступа (белый список / привязка / открытый) и шлюз упоминаний. **Channel Base** — абстрактная база с шаблонным методом: плагины переопределяют `connect`, `sendMessage`, `disconnect`. **Channel Registry** — `Map<string, ChannelPlugin>` с обнаружением коллизий.

### Envelope

Нормализованный формат сообщения, в который преобразуют все платформы:

- **Идентификация**: `senderId`, `senderName`, `chatId`, `channelName`
- **Содержимое**: `text`, опционально `imageBase64`/`imageMimeType`, опционально `referencedText`
- **Контекст**: `isGroup`, `isMentioned`, `isReplyToBot`, опционально `threadId`

Обязанности плагина: `senderId` должен быть стабильным/уникальным; `chatId` должен различать личные сообщения и группы; булевы флаги должны быть точными для логики шлюзов; @упоминания удаляются из `text`.

### Поток сообщений

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

Слэш-команды (`/clear`, `/help`, `/status`) обрабатываются в ChannelBase до того, как достигнут агента.

### Сессии

Один процесс `qwen-code --acp` с несколькими ACP-сессиями. Область действия на канал: **`user`** (по умолчанию), **`thread`** или **`single`**. Ключи маршрутизации с пространством имён `<channelName>:<key>`.

### Обработка ошибок

- **Сбои подключения** — логируются; сервис продолжает работу, если подключён хотя бы один канал
- **Краш моста** — экспоненциальная задержка (макс. 3 попытки), `setBridge()` на всех каналах, восстановление сессий
- **Сериализация сессий** — цепочки промисов для каждой сессии предотвращают конфликты одновременных запросов

## Система плагинов

Архитектура расширяема — новые адаптеры (включая сторонние) могут быть добавлены без изменения ядра. Встроенные каналы используют тот же интерфейс плагинов (dogfooding).

### Контракт плагина

`ChannelPlugin` объявляет `channelType`, `displayName`, `requiredConfigFields` и фабрику `createChannel()`. Плагины реализуют три метода:

| Метод | Ответственность |
| - | - |
| `connect()` | Подключиться к платформе и зарегистрировать обработчики сообщений |
| `sendMessage(chatId, text)` | Отформатировать и доставить ответ агента |
| `disconnect()` | Очистить ресурсы при завершении работы |

При входящих сообщениях плагины создают `Envelope` и вызывают `this.handleInbound(envelope)` — базовый класс обрабатывает остальное: контроль доступа, групповые шлюзы, привязку, маршрутизацию сессий, сериализацию запросов, слэш-команды, внедрение инструкций, контекст ответов и восстановление после сбоев.

### Точки расширения

- Собственные слэш-команды через `registerCommand()`
- Индикаторы активности путём оборачивания `handleInbound()` с отображением набора/реакции
- Хуки для вызова инструментов через `onToolCall()`
- Обработка медиа путём присоединения к Envelope до `handleInbound()`

### Обнаружение и загрузка

Внешние плагины — это **расширения**, управляемые `ExtensionManager`, объявленные в `qwen-extension.json`:

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

Последовательность загрузки при `qwen channel start`: загрузить настройки → зарегистрировать встроенные → просканировать расширения → динамический импорт + проверка → зарегистрировать (отклонить коллизии) → проверить конфиг → `createChannel()` → `connect()`.

Плагины работают в том же процессе (без песочницы), та же модель доверия, что и у npm-зависимостей.

## Конфигурация

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // env var reference
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "qwen3.5-plus",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

Аутентификация специфична для плагина: статический токен (Telegram), учётные данные приложения (DingTalk), вход по QR-коду (WeChat), прокси-токен (TMCP).

## Команды CLI

```bash
# Channels
qwen channel start [name]                     # start all or one channel
qwen channel stop                             # stop running service
qwen channel status                           # show channels, sessions, uptime
qwen channel pairing list <ch>                # pending pairing requests
qwen channel pairing approve <ch> <code>      # approve a request

# Extensions
qwen extensions install <path-or-package>     # install
qwen extensions link <local-path>             # symlink for dev
qwen extensions list                          # show installed
qwen extensions remove <name>                 # uninstall
```

## Структура пакета

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP process lifecycle, session management
│       ├── SessionRouter.ts # sender ↔ session mapping, persistence
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # group chat policy + mention gating
│       ├── PairingStore.ts  # pairing code generation + approval
│       ├── ChannelBase.ts   # abstract base: routing, slash commands
│       └── types.ts         # Envelope, ChannelConfig, etc.
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Планы на будущее

### Безопасность и групповые чаты

- **Ограничения инструментов для каждой группы** — списки запрета/разрешения `tools`/`toolsBySender` для каждой группы
- **История контекста группы** — кольцевой буфер недавно пропущенных сообщений, добавляемый перед @упоминанием
- **Регулярные выражения для упоминаний** — запасные `mentionPatterns` для ненадёжных метаданных @упоминаний
- **Инструкции для каждой группы** — поле `instructions` в `GroupConfig` для персон группы
- **Команда `/activation`** — переключение `requireMention` во время выполнения, сохраняется на диск

### Инструменты эксплуатации

- **`qwen channel doctor`** — проверка конфигурации, переменные окружения, токены ботов, сетевая проверка
- **`qwen channel status --probe`** — реальная проверка подключения для каждого канала

### Расширение платформ

- **Discord** — Bot API + Gateway, серверы/каналы/ЛС/ветки
- **Slack** — Bolt SDK, Socket Mode, рабочие пространства/каналы/ЛС/ветки

### Мультиагентность

- **Маршрутизация между несколькими агентами** — несколько агентов с привязками к каналу/группе/пользователю
- **Группы вещания** — несколько агентов отвечают на одно и то же сообщение

### Экосистема плагинов

- **Шаблон плагина сообщества** — инструмент создания `create-qwen-channel`
- **Реестр/обнаружение плагинов** — `qwen extensions search`, совместимость версий