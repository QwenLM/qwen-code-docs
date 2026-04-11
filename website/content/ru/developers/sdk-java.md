# Qwen Code Java SDK

Qwen Code Java SDK — это минимальный экспериментальный SDK для программного доступа к функциям Qwen Code. Он предоставляет Java-интерфейс для взаимодействия с Qwen Code CLI, позволяя разработчикам интегрировать возможности Qwen Code в свои Java-приложения.

## Требования

- Java >= 1.8
- Maven >= 3.6.0 (для сборки из исходного кода)
- qwen-code >= 0.5.0

### Зависимости

- **Logging**: ch.qos.logback:logback-classic
- **Utilities**: org.apache.commons:commons-lang3
- **JSON Processing**: com.alibaba.fastjson2:fastjson2
- **Testing**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Установка

Добавьте следующую зависимость в ваш Maven `pom.xml`:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Или, если вы используете Gradle, добавьте в `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Сборка и запуск

### Команды сборки

```bash
# Compile the project
mvn compile

# Run tests
mvn test

# Package the JAR
mvn package

# Install to local repository
mvn install
```

## Быстрый старт

Самый простой способ использовать SDK — метод `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Для более продвинутого использования с пользовательскими параметрами транспорта:

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

Для обработки потокового контента с пользовательскими обработчиками контента:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Text content received: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Thinking content received: {}", thingkingAssistantContent.getThinking());
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

Другие примеры см. в `src/test/java/com/alibaba/qwen/code/cli/example`

## Архитектура

SDK использует многоуровневую архитектуру:

- **API-слой**: предоставляет основные точки входа через класс `QwenCodeCli` с простыми статическими методами для базового использования
- **Слой сессий**: управляет сеансами связи с Qwen Code CLI через класс `Session`
- **Транспортный слой**: отвечает за механизм связи между SDK и процессом CLI (в настоящее время используется транспорт через процесс с помощью `ProcessTransport`)
- **Протокольный слой**: определяет структуры данных для обмена информацией на основе протокола CLI
- **Utils**: общие утилиты для параллельного выполнения, обработки таймаутов и управления ошибками

## Ключевые возможности

### Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: инструменты записи запрещены, если не одобрены через callback `canUseTool` или не указаны в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: блокирует все инструменты записи, предписывая ИИ сначала предоставить план.
- **`auto-edit`**: автоматически одобряет инструменты редактирования (edit, write_file), тогда как для остальных требуется подтверждение.
- **`yolo`**: все инструменты выполняются автоматически без подтверждения.

### Обработчики событий сессии и обработчики контента ассистента

SDK предоставляет два ключевых интерфейса для обработки событий и контента от CLI:

#### Интерфейс SessionEventConsumers

Интерфейс `SessionEventConsumers` предоставляет callback'и для различных типов сообщений во время сессии:

- `onSystemMessage`: обрабатывает системные сообщения от CLI (получает Session и SDKSystemMessage)
- `onResultMessage`: обрабатывает сообщения с результатами от CLI (получает Session и SDKResultMessage)
- `onAssistantMessage`: обрабатывает сообщения ассистента (ответы ИИ) (получает Session и SDKAssistantMessage)
- `onPartialAssistantMessage`: обрабатывает частичные сообщения ассистента при потоковой передаче (получает Session и SDKPartialAssistantMessage)
- `onUserMessage`: обрабатывает сообщения пользователя (получает Session и SDKUserMessage)
- `onOtherMessage`: обрабатывает другие типы сообщений (получает Session и строковое сообщение)
- `onControlResponse`: обрабатывает ответы на управляющие запросы (получает Session и CLIControlResponse)
- `onControlRequest`: обрабатывает управляющие запросы (получает Session и CLIControlRequest, возвращает CLIControlResponse)
- `onPermissionRequest`: обрабатывает запросы на разрешение (получает Session и CLIControlRequest<CLIControlPermissionRequest>, возвращает Behavior)

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы контента внутри сообщений ассистента:

- `onText`: обрабатывает текстовый контент (получает Session и TextAssistantContent)
- `onThinking`: обрабатывает контент размышлений (получает Session и ThingkingAssistantContent)
- `onToolUse`: обрабатывает контент использования инструментов (получает Session и ToolUseAssistantContent)
- `onToolResult`: обрабатывает контент результатов инструментов (получает Session и ToolResultAssistantContent)
- `onOtherContent`: обрабатывает другие типы контента (получает Session и AssistantContent)
- `onUsage`: обрабатывает информацию об использовании (получает Session и AssistantUsage)
- `onPermissionRequest`: обрабатывает запросы на разрешение (получает Session и CLIControlPermissionRequest, возвращает Behavior)
- `onOtherControlRequest`: обрабатывает другие управляющие запросы (получает Session и ControlRequestPayload, возвращает ControlResponsePayload)

#### Взаимосвязь интерфейсов

**Важное примечание об иерархии событий:**

- `SessionEventConsumers` — это обработчик событий **высокого уровня**, который обрабатывает различные типы сообщений (системные, ассистента, пользователя и т.д.)
- `AssistantContentConsumers` — это обработчик контента **низкого уровня**, который обрабатывает различные типы контента внутри сообщений ассистента (текст, инструменты, размышления и т.д.)

**Взаимосвязь обработчиков:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers использует AssistantContentConsumers для обработки контента внутри сообщений ассистента)

**Связи производных событий:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Связи таймаутов событий:**

Каждый метод обработчика событий имеет соответствующий метод таймаута, позволяющий настроить поведение таймаута для конкретного события:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Для методов таймаутов AssistantContentConsumers:

- `onText` ↔ `onTextTimeout`
- `onThinking` ↔ `onThinkingTimeout`
- `onToolUse` ↔ `onToolUseTimeout`
- `onToolResult` ↔ `onToolResultTimeout`
- `onOtherContent` ↔ `onOtherContentTimeout`
- `onPermissionRequest` ↔ `onPermissionRequestTimeout`
- `onOtherControlRequest` ↔ `onOtherControlRequestTimeout`

**Значения таймаутов по умолчанию:**

- Таймаут по умолчанию для `SessionEventSimpleConsumers`: 180 секунд (`Timeout.TIMEOUT_180_SECONDS`)
- Таймаут по умолчанию для `AssistantContentSimpleConsumers`: 60 секунд (`Timeout.TIMEOUT_60_SECONDS`)

**Требования к иерархии таймаутов:**

Для корректной работы необходимо соблюдать следующие соотношения таймаутов:

- Возвращаемое значение `onAssistantMessageTimeout` должно быть больше, чем возвращаемые значения `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`
- Возвращаемое значение `onControlRequestTimeout` должно быть больше, чем возвращаемые значения `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`

### Параметры транспорта

Класс `TransportOptions` позволяет настроить способ связи SDK с Qwen Code CLI:

- `pathToQwenExecutable`: путь к исполняемому файлу Qwen Code CLI
- `cwd`: рабочая директория для процесса CLI
- `model`: ИИ-модель, используемая для сессии
- `permissionMode`: режим разрешений, управляющий выполнением инструментов
- `env`: переменные окружения, передаваемые процессу CLI
- `maxSessionTurns`: ограничивает количество ходов диалога в сессии
- `coreTools`: список основных инструментов, доступных ИИ
- `excludeTools`: список инструментов, исключаемых из доступа ИИ
- `allowedTools`: список инструментов, предварительно одобренных для использования без дополнительного подтверждения
- `authType`: тип аутентификации для сессии
- `includePartialMessages`: включает получение частичных сообщений при потоковых ответах
- `turnTimeout`: таймаут для полного хода диалога
- `messageTimeout`: таймаут для отдельных сообщений в рамках хода
- `resumeSessionId`: ID предыдущей сессии для возобновления
- `otherOptions`: дополнительные параметры командной строки, передаваемые CLI

### Функции управления сессией

- **Создание сессии**: используйте `QwenCodeCli.newSession()` для создания новой сессии с пользовательскими параметрами
- **Управление сессией**: класс `Session` предоставляет методы для отправки промптов, обработки ответов и управления состоянием сессии
- **Очистка сессии**: всегда закрывайте сессии с помощью `session.close()` для корректного завершения процесса CLI
- **Возобновление сессии**: используйте `setResumeSessionId()` в `TransportOptions` для возобновления предыдущей сессии
- **Прерывание сессии**: используйте `session.interrupt()` для прерывания текущего выполняющегося промпта
- **Динамическое переключение модели**: используйте `session.setModel()` для смены модели во время сессии
- **Динамическое переключение режима разрешений**: используйте `session.setPermissionMode()` для смены режима разрешений во время сессии

### Настройка пула потоков

SDK использует пул потоков для управления параллельными операциями со следующей конфигурацией по умолчанию:

- **Core Pool Size**: 30 потоков
- **Maximum Pool Size**: 100 потоков
- **Keep-Alive Time**: 60 секунд
- **Queue Capacity**: 300 задач (используется LinkedBlockingQueue)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: false
- **Rejected Execution Handler**: CallerRunsPolicy

## Обработка ошибок

SDK предоставляет специфичные типы исключений для различных сценариев ошибок:

- `SessionControlException`: выбрасывается при возникновении проблем с управлением сессией (создание, инициализация и т.д.)
- `SessionSendPromptException`: выбрасывается при возникновении проблем с отправкой промпта или получением ответа
- `SessionClosedException`: выбрасывается при попытке использования закрытой сессии

## Часто задаваемые вопросы / Устранение неполадок

### В: Нужно ли устанавливать Qwen CLI отдельно?

О: да, требуется Qwen CLI версии 0.5.5 или выше.

### В: Какие версии Java поддерживаются?

О: SDK требует Java 1.8 или выше.

### В: Как обрабатывать долго выполняющиеся запросы?

О: SDK включает утилиты для работы с таймаутами. Вы можете настроить таймауты с помощью класса `Timeout` в `TransportOptions`.

### В: Почему некоторые инструменты не выполняются?

О: Вероятно, это связано с режимами разрешений. Проверьте настройки режима разрешений и рассмотрите использование `allowedTools` для предварительного одобрения определенных инструментов.

### В: Как возобновить предыдущую сессию?

О: Используйте метод `setResumeSessionId()` в `TransportOptions` для возобновления предыдущей сессии.

### В: Могу ли я настроить окружение для процесса CLI?

О: да, используйте метод `setEnv()` в `TransportOptions` для передачи переменных окружения процессу CLI.

## Лицензия

Apache-2.0 — подробности см. в [LICENSE](./LICENSE).