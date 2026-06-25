# Qwen Code Java SDK

Qwen Code Java SDK — это минимальный экспериментальный SDK для программного доступа к функциональности Qwen Code. Он предоставляет Java-интерфейс для взаимодействия с Qwen Code CLI, позволяя разработчикам интегрировать возможности Qwen Code в свои Java-приложения.

## Требования

- Java >= 1.8
- Maven >= 3.6.0 (для сборки из исходного кода)
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

# Упаковка JAR
mvn package

# Установка в локальный репозиторий
mvn install
```

## Быстрый старт

Простейший способ использования SDK — через метод `QwenCodeCli.simpleQuery()`:

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

Для обработки потокового контента с пользовательскими потребителями контента:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Получен текстовый контент: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThinkingAssistantContent thinkingAssistantContent) {
                    logger.info("Получен мыслительный контент: {}", thinkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Получен запрос на использование инструмента: {} с аргументами: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Получен результат использования инструмента: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Получен другой контент: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Получена информация об использовании: Входные токены: {}, Выходные токены: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Пример потоковой обработки завершён.");
}
```

Другие примеры см. в src/test/java/com/alibaba/qwen/code/cli/example

## Архитектура

SDK имеет многоуровневую архитектуру:

- **Уровень API**: Предоставляет основные точки входа через класс `QwenCodeCli` с простыми статическими методами для базового использования
- **Уровень сессий**: Управляет сеансами связи с Qwen Code CLI через класс `Session`
- **Транспортный уровень**: Обрабатывает механизм связи между SDK и процессом CLI (в настоящее время использует транспорт на основе процессов через `ProcessTransport`)
- **Протокольный уровень**: Определяет структуры данных для обмена на основе протокола CLI
- **Утилиты**: Общие утилиты для параллельного выполнения, обработки тайм-аутов и управления ошибками

## Ключевые возможности

### Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:
- **`default`**: Инструменты для записи запрещены, если не одобрены через обратный вызов `canUseTool` или не находятся в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты для записи, предлагая ИИ сначала представить план.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (`edit`, `write_file`, `notebook_edit`), в то время как другие инструменты требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Потребители событий сессии и потребители содержимого ассистента

SDK предоставляет два ключевых интерфейса для обработки событий и содержимого из CLI:

#### Интерфейс SessionEventConsumers

Интерфейс `SessionEventConsumers` предоставляет обратные вызовы для различных типов сообщений во время сессии:

- `onSystemMessage`: Обрабатывает системные сообщения от CLI (получает Session и SDKSystemMessage)
- `onResultMessage`: Обрабатывает результирующие сообщения от CLI (получает Session и SDKResultMessage)
- `onAssistantMessage`: Обрабатывает сообщения ассистента (ответы ИИ) (получает Session и SDKAssistantMessage)
- `onPartialAssistantMessage`: Обрабатывает частичные сообщения ассистента во время потоковой передачи (получает Session и SDKPartialAssistantMessage)
- `onUserMessage`: Обрабатывает сообщения пользователя (получает Session и SDKUserMessage)
- `onOtherMessage`: Обрабатывает другие типы сообщений (получает Session и строковое сообщение)
- `onControlResponse`: Обрабатывает ответы управления (получает Session и CLIControlResponse)
- `onControlRequest`: Обрабатывает запросы управления (получает Session и CLIControlRequest, возвращает CLIControlResponse)
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlRequest<CLIControlPermissionRequest>, возвращает Behavior)

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы содержимого внутри сообщений ассистента:

- `onText`: Обрабатывает текстовое содержимое (получает Session и TextAssistantContent)
- `onThinking`: Обрабатывает содержимое размышлений (получает Session и ThinkingAssistantContent)
- `onToolUse`: Обрабатывает содержимое использования инструментов (получает Session и ToolUseAssistantContent)
- `onToolResult`: Обрабатывает содержимое результатов инструментов (получает Session и ToolResultAssistantContent)
- `onOtherContent`: Обрабатывает другие типы содержимого (получает Session и AssistantContent)
- `onUsage`: Обрабатывает информацию об использовании (получает Session и AssistantUsage)
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlPermissionRequest, возвращает Behavior)
- `onOtherControlRequest`: Обрабатывает другие запросы управления (получает Session и ControlRequestPayload, возвращает ControlResponsePayload)

#### Взаимосвязь между интерфейсами

**Важное замечание об иерархии событий:**

- `SessionEventConsumers` — **высокоуровневый** обработчик событий, который обрабатывает различные типы сообщений (системные, ассистента, пользователя и т.д.)
- `AssistantContentConsumers` — **низкоуровневый** обработчик содержимого, который обрабатывает различные типы содержимого внутри сообщений ассистента (текст, инструменты, размышления и т.д.)

**Связь между процессорами:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers использует AssistantContentConsumers для обработки содержимого внутри сообщений ассистента)

**Связи производных событий:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Связи тайм-аутов событий:**

Каждый метод обработчика событий имеет соответствующий метод тайм-аута, который позволяет настроить поведение тайм-аута для этого конкретного события:

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

Для корректной работы должны соблюдаться следующие соотношения тайм-аутов:

- Возвращаемое значение `onAssistantMessageTimeout` должно быть больше, чем возвращаемые значения `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`
- Возвращаемое значение `onControlRequestTimeout` должно быть больше, чем возвращаемые значения `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`
### Параметры транспорта

Класс `TransportOptions` позволяет настроить взаимодействие SDK с Qwen Code CLI:

- `pathToQwenExecutable` — путь к исполняемому файлу Qwen Code CLI
- `cwd` — рабочая директория для процесса CLI
- `model` — используемая AI-модель для сеанса
- `permissionMode` — режим разрешений, управляющий выполнением инструментов
- `env` — переменные окружения, передаваемые процессу CLI
- `maxSessionTurns` — ограничивает количество итераций диалога в сеансе
- `coreTools` — список основных инструментов, которые должны быть доступны AI
- `excludeTools` — список инструментов, исключаемых из доступных AI
- `allowedTools` — список инструментов, предварительно одобренных для использования без дополнительного подтверждения
- `authType` — тип аутентификации для сеанса
- `includePartialMessages` — позволяет получать частичные сообщения во время потоковых ответов
- `turnTimeout` — таймаут на полный цикл диалога
- `messageTimeout` — таймаут на отдельные сообщения в рамках цикла
- `resumeSessionId` — идентификатор предыдущего сеанса для возобновления
- `otherOptions` — дополнительные параметры командной строки, передаваемые CLI

### Управление сеансами

- **Создание сеанса**: используйте `QwenCodeCli.newSession()` для создания нового сеанса с пользовательскими параметрами
- **Управление сеансом**: класс `Session` предоставляет методы для отправки промптов, обработки ответов и управления состоянием сеанса
- **Очистка сеанса**: всегда закрывайте сеансы с помощью `session.close()`, чтобы корректно завершить процесс CLI
- **Возобновление сеанса**: используйте `setResumeSessionId()` в `TransportOptions` для возобновления предыдущего сеанса
- **Прерывание сеанса**: используйте `session.interrupt()` для прерывания текущего промпта
- **Динамическое переключение модели**: используйте `session.setModel()` для смены модели во время сеанса
- **Динамическое переключение режима разрешений**: используйте `session.setPermissionMode()` для смены режима разрешений во время сеанса

### Конфигурация пула потоков

SDK использует пул потоков для управления конкурентными операциями со следующей конфигурацией по умолчанию:

- **Размер ядра**: 30 потоков
- **Максимальный размер**: 100 потоков
- **Время удержания**: 60 секунд
- **Вместимость очереди**: 300 задач (LinkedBlockingQueue)
- **Именование потоков**: `qwen_code_cli-pool-{число}`
- **Фоновые потоки**: false
- **Обработчик отклонения**: CallerRunsPolicy

## Обработка ошибок

SDK предоставляет типы исключений для различных сценариев ошибок:

- `SessionControlException` — возникает при проблемах с управлением сеансом (создание, инициализация и т.д.)
- `SessionSendPromptException` — возникает при проблемах с отправкой промпта или получением ответа
- `SessionClosedException` — возникает при попытке использовать закрытый сеанс

## FAQ / Устранение неполадок

### Q: Нужно ли устанавливать Qwen CLI отдельно?

A: Да, требуется Qwen CLI версии 0.5.5 или выше.

### Q: Какие версии Java поддерживаются?

A: SDK требует Java 1.8 или выше.

### Q: Как обрабатывать длительные запросы?

A: SDK включает утилиты таймаутов. Вы можете настроить таймауты с помощью класса `Timeout` в `TransportOptions`.

### Q: Почему некоторые инструменты не выполняются?

A: Это, вероятно, связано с режимами разрешений. Проверьте настройки режима разрешений и рассмотрите возможность использования `allowedTools` для предварительного одобрения определённых инструментов.

### Q: Как возобновить предыдущий сеанс?

A: Используйте метод `setResumeSessionId()` в `TransportOptions` для возобновления предыдущего сеанса.

### Q: Можно ли настроить окружение для процесса CLI?

A: Да, используйте метод `setEnv()` в `TransportOptions` для передачи переменных окружения процессу CLI.

## Лицензия

Apache-2.0 — см. [LICENSE](../../LICENSE) для подробностей.
