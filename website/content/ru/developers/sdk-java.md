# Qwen Code Java SDK

Qwen Code Java SDK — это минимальный экспериментальный SDK для программного доступа к функциональности Qwen Code. Он предоставляет Java-интерфейс для взаимодействия с Qwen Code CLI, позволяя разработчикам интегрировать возможности Qwen Code в свои Java-приложения.

## Требования

- Java >= 1.8
- Maven >= 3.6.0 (для сборки из исходников)
- qwen-code >= 0.5.0

### Зависимости

- **Логирование**: ch.qos.logback:logback-classic
- **Утилиты**: org.apache.commons:commons-lang3
- **Обработка JSON**: com.alibaba.fastjson2:fastjson2
- **Тестирование**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Установка

Добавьте следующую зависимость в ваш Maven `pom.xml`:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Или при использовании Gradle добавьте в ваш `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Сборка и запуск

### Команды сборки

```bash
# Компиляция проекта
mvn compile

# Запуск тестов
mvn test

# Сборка JAR
mvn package

# Установка в локальный репозиторий
mvn install
```

## Быстрый старт

Самый простой способ использовать SDK — это метод `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Для более продвинутого использования с настраиваемыми параметрами транспорта:

```java
public static void runTransportOptionsExample() {
    TransportOptions options = new TransportOptions()
            .setModel("qwen3-coder-flash")
            .setPermissionMode(PermissionMode.AUTO_EDIT)
            .setCwd("./")
            .setEnv(new HashMap<String, String>() {{put("CUSTOM_VAR", "value");}})
            .setIncludePartialMessages(true)
            .setTurnTimeout(new Timeout(120L, TimeUnit.SECONDS))
            .setMessageTimeout(new Timeout(90L, TimeUnit.SECONDS))
            .setAllowedTools(Arrays.asList("read_file", "write_file", "list_directory"));

    List<String> result = QwenCodeCli.simpleQuery("who are you, what are your capabilities?", options);
    result.forEach(logger::info);
}
```

Для обработки потокового контента с пользовательскими потребителями контента:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThinkingAssistantContent thinkingAssistantContent) {
                    logger.info("Thinking content received: {}", thinkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Tool use content received: {} with arguments: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Tool result content received: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Other content received: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Usage information received: Input tokens: {}, Output tokens: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Streaming example completed.");
}
```

Другие примеры см. в src/test/java/com/alibaba/qwen/code/cli/example

## Архитектура

SDK следует многоуровневой архитектуре:

- **API Layer** (Уровень API): Предоставляет основные точки входа через класс `QwenCodeCli` с простыми статическими методами для базового использования.
- **Session Layer** (Уровень сессий): Управляет сеансами связи с Qwen Code CLI через класс `Session`.
- **Transport Layer** (Транспортный уровень): Обрабатывает механизм взаимодействия между SDK и процессом CLI (в настоящее время использует process transport через `ProcessTransport`).
- **Protocol Layer** (Протокольный уровень): Определяет структуры данных для взаимодействия на основе протокола CLI.
- **Utils** (Утилиты): Общие утилиты для параллельного выполнения, обработки тайм-аутов и управления ошибками.

## Ключевые возможности

### Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи отклоняются, если они не одобрены через колбэк `canUseTool` или не перечислены в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, предлагая ИИ сначала представить план.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (`edit`, `write_file`, `notebook_edit`), в то время как другие инструменты требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Потребители событий сессии и потребители контента ассистента

SDK предоставляет два ключевых интерфейса для обработки событий и контента от CLI:

#### Интерфейс SessionEventConsumers

Интерфейс `SessionEventConsumers` предоставляет колбэки для различных типов сообщений во время сессии:

- `onSystemMessage`: Обрабатывает системные сообщения от CLI (получает Session и SDKSystemMessage).
- `onResultMessage`: Обрабатывает результирующие сообщения от CLI (получает Session и SDKResultMessage).
- `onAssistantMessage`: Обрабатывает сообщения ассистента (ответы ИИ) (получает Session и SDKAssistantMessage).
- `onPartialAssistantMessage`: Обрабатывает частичные сообщения ассистента во время потоковой передачи (получает Session и SDKPartialAssistantMessage).
- `onUserMessage`: Обрабатывает сообщения пользователя (получает Session и SDKUserMessage).
- `onOtherMessage`: Обрабатывает другие типы сообщений (получает Session и строку сообщения).
- `onControlResponse`: Обрабатывает ответы управления (получает Session и CLIControlResponse).
- `onControlRequest`: Обрабатывает запросы управления (получает Session и CLIControlRequest, возвращает CLIControlResponse).
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlRequest<CLIControlPermissionRequest>, возвращает Behavior).

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы контента внутри сообщений ассистента:

- `onText`: Обрабатывает текстовый контент (получает Session и TextAssistantContent).
- `onThinking`: Обрабатывает контент размышлений (получает Session и ThinkingAssistantContent).
- `onToolUse`: Обрабатывает контент использования инструментов (получает Session и ToolUseAssistantContent).
- `onToolResult`: Обрабатывает контент результатов работы инструментов (получает Session и ToolResultAssistantContent).
- `onOtherContent`: Обрабатывает другие типы контента (получает Session и AssistantContent).
- `onUsage`: Обрабатывает информацию об использовании (получает Session и AssistantUsage).
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlPermissionRequest, возвращает Behavior).
- `onOtherControlRequest`: Обрабатывает другие управляющие запросы (получает Session и ControlRequestPayload, возвращает ControlResponsePayload).

#### Взаимосвязь между интерфейсами

**Важное замечание об иерархии событий:**

- `SessionEventConsumers` — это **высокоуровневый** обработчик событий, работающий с различными типами сообщений (системные, ассистента, пользователя и т.д.).
- `AssistantContentConsumers` — это **низкоуровневый** обработчик контента, работающий с различными типами контента внутри сообщений ассистента (текст, инструменты, размышления и т.д.).

**Связь обработчиков:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers использует AssistantContentConsumers для обработки контента внутри сообщений ассистента).

**Связи порождения событий:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Связи тайм-аутов событий:**

У каждого метода обработчика события есть соответствующий метод тайм-аута, позволяющий настроить поведение тайм-аута для этого конкретного события:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Для методов тайм-аута AssistantContentConsumers:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Значения тайм-аутов по умолчанию:**

- `SessionEventSimpleConsumers` тайм-аут по умолчанию: 180 секунд (Timeout.TIMEOUT_180_SECONDS)
- `AssistantContentSimpleConsumers` тайм-аут по умолчанию: 60 секунд (Timeout.TIMEOUT_60_SECONDS)

**Требования к иерархии тайм-аутов:**

Для корректной работы следует соблюдать следующие соотношения тайм-аутов:

- Возвращаемое значение `onAssistantMessageTimeout` должно быть больше, чем возвращаемые значения `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`.
- Возвращаемое значение `onControlRequestTimeout` должно быть больше, чем возвращаемые значения `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`.

### Параметры транспорта

Класс `TransportOptions` позволяет настраивать способ взаимодействия SDK с Qwen Code CLI:

- `pathToQwenExecutable`: Путь к исполняемому файлу Qwen Code CLI.
- `cwd`: Рабочая директория для процесса CLI.
- `model`: Модель ИИ, используемая для сессии.
- `permissionMode`: Режим разрешений, контролирующий выполнение инструментов.
- `env`: Переменные окружения, передаваемые процессу CLI.
- `maxSessionTurns`: Ограничивает количество оборотов диалога в сессии.
- `coreTools`: Список основных инструментов, которые должны быть доступны ИИ.
- `excludeTools`: Список инструментов, которые следует исключить из доступных для ИИ.
- `allowedTools`: Список инструментов, которые предварительно одобрены для использования без дополнительного подтверждения.
- `authType`: Тип аутентификации, используемый для сессии.
- `includePartialMessages`: Включает получение частичных сообщений во время потоковых ответов.
- `turnTimeout`: Тайм-аут для полного оборота диалога.
- `messageTimeout`: Тайм-аут для отдельных сообщений в рамках оборота.
- `resumeSessionId`: Идентификатор предыдущей сессии для возобновления.
- `otherOptions`: Дополнительные параметры командной строки, передаваемые CLI.

### Возможности управления сессией

- **Создание сессии**: Используйте `QwenCodeCli.newSession()` для создания новой сессии с настраиваемыми параметрами.
- **Управление сессией**: Класс `Session` предоставляет методы для отправки запросов, обработки ответов и управления состоянием сессии.
- **Очистка сессии**: Всегда закрывайте сессии с помощью `session.close()`, чтобы корректно завершить процесс CLI.
- **Возобновление сессии**: Используйте `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию.
- **Прерывание сессии**: Используйте `session.interrupt()`, чтобы прервать текущий выполняемый запрос.
- **Динамическое переключение модели**: Используйте `session.setModel()`, чтобы изменить модель во время сессии.
- **Динамическое переключение режима разрешений**: Используйте `session.setPermissionMode()`, чтобы изменить режим разрешений во время сессии.

### Конфигурация пула потоков

SDK использует пул потоков для управления параллельными операциями со следующей конфигурацией по умолчанию:

- **Core Pool Size**: 30 потоков
- **Maximum Pool Size**: 100 потоков
- **Keep-Alive Time**: 60 секунд
- **Queue Capacity**: 300 задач (LinkedBlockingQueue)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## Обработка ошибок

SDK предоставляет определенные типы исключений для различных сценариев ошибок:

- `SessionControlException`: Выбрасывается при проблемах с управлением сессией (создание, инициализация и т.д.).
- `SessionSendPromptException`: Выбрасывается при проблемах с отправкой запроса или получением ответа.
- `SessionClosedException`: Выбрасывается при попытке использования закрытой сессии.

## Часто задаваемые вопросы / Устранение неполадок

### В: Нужно ли устанавливать Qwen CLI отдельно?

О: Да, требуется Qwen CLI версии 0.5.5 или выше.

### В: Какие версии Java поддерживаются?

О: SDK требует Java версии 1.8 или выше.

### В: Как обрабатывать длительные запросы?

О: SDK включает утилиты тайм-аутов. Вы можете настроить тайм-ауты с помощью класса `Timeout` в `TransportOptions`.

### В: Почему некоторые инструменты не выполняются?

О: Вероятная причина — режим разрешений. Проверьте настройки режима разрешений и рассмотрите возможность использования `allowedTools` для предварительного одобрения определенных инструментов.

### В: Как возобновить предыдущую сессию?

О: Используйте метод `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию.

### В: Можно ли настроить окружение для процесса CLI?

О: Да, используйте метод `setEnv()` в `TransportOptions`, чтобы передать переменные окружения процессу CLI.

## Лицензия

Apache-2.0 — подробности см. в [LICENSE](../../LICENSE).