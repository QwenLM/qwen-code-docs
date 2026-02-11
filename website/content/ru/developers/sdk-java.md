# Qwen Code Java SDK

Qwen Code Java SDK — это минимальный экспериментальный SDK для программного доступа к функциональности Qwen Code. Он предоставляет Java-интерфейс для взаимодействия с CLI Qwen Code, позволяя разработчикам интегрировать возможности Qwen Code в свои Java-приложения.

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

Или если вы используете Gradle, добавьте в ваш `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Сборка и запуск

### Команды сборки

```bash

```bash
# Компиляция проекта
mvn compile

# Запуск тестов
mvn test

# Упаковка в JAR
mvn package

# Установка в локальный репозиторий
mvn install
```

## Быстрый старт

Самый простой способ использовать SDK — это через метод `QwenCodeCli.simpleQuery()`:

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

Для обработки потокового содержимого с настраиваемыми потребителями содержимого:

```java
public static void runStreamingExample() {
    QwenCodeCli.simpleQuery("who are you, what are your capabilities?",
            new TransportOptions().setMessageTimeout(new Timeout(10L, TimeUnit.SECONDS)), new AssistantContentSimpleConsumers() {

                @Override
                public void onText(Session session, TextAssistantContent textAssistantContent) {
                    logger.info("Получено текстовое содержимое: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Получено содержимое размышлений: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Получено использование инструмента: {} с аргументами: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Получен результат инструмента: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Получено другое содержимое: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Получена информация об использовании: Входные токены: {}, Выходные токены: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Пример потоковой передачи завершен.");
}
```

другие примеры см. в src/test/java/com/alibaba/qwen/code/cli/example

## Архитектура

SDK следует многоуровневой архитектуре:

- **Слой API**: Обеспечивает основные точки входа через класс `QwenCodeCli` с простыми статическими методами для базового использования
- **Слой сессий**: Управляет сессиями связи с Qwen Code CLI через класс `Session`
- **Транспортный слой**: Обрабатывает механизм связи между SDK и процессом CLI (в настоящее время используется транспортировка через процесс с помощью `ProcessTransport`)
- **Протокольный слой**: Определяет структуры данных для связи на основе протокола CLI
- **Утилиты**: Общие утилиты для параллельного выполнения, обработки тайм-аутов и управления ошибками

## Ключевые особенности

### Режимы разрешений

SDK поддерживает различные режимы разрешений для контроля выполнения инструментов:

- **`default`**: Инструменты записи запрещены, если они не одобрены через обратный вызов `canUseTool` или в `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи, указывая ИИ сначала представить план.
- **`auto-edit`**: Автоматически одобрять инструменты редактирования (edit, write_file), в то время как другие инструменты требуют подтверждения.
- **`yolo`**: Все инструменты выполняются автоматически без подтверждения.

### Потребители событий сессии и потребители контента ассистента

SDK предоставляет два ключевых интерфейса для обработки событий и контента из CLI:

#### Интерфейс SessionEventConsumers

Интерфейс `SessionEventConsumers` предоставляет обратные вызовы для различных типов сообщений во время сессии:

- `onSystemMessage`: Обрабатывает системные сообщения из CLI (принимает Session и SDKSystemMessage)
- `onResultMessage`: Обрабатывает результирующие сообщения из CLI (принимает Session и SDKResultMessage)
- `onAssistantMessage`: Обрабатывает сообщения помощника (ответы ИИ) (принимает Session и SDKAssistantMessage)
- `onPartialAssistantMessage`: Обрабатывает частичные сообщения помощника во время потоковой передачи (принимает Session и SDKPartialAssistantMessage)
- `onUserMessage`: Обрабатывает пользовательские сообщения (принимает Session и SDKUserMessage)
- `onOtherMessage`: Обрабатывает другие типы сообщений (принимает Session и строковое сообщение)
- `onControlResponse`: Обрабатывает ответы на управляющие команды (принимает Session и CLIControlResponse)
- `onControlRequest`: Обрабатывает запросы на управляющие команды (принимает Session и CLIControlRequest, возвращает CLIControlResponse)
- `onPermissionRequest`: Обрабатывает запросы разрешений (принимает Session и CLIControlRequest<CLIControlPermissionRequest>, возвращает Behavior)

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы содержимого в сообщениях ассистента:

- `onText`: Обрабатывает текстовое содержимое (получает Session и TextAssistantContent)
- `onThinking`: Обрабатывает содержимое размышлений (получает Session и ThingkingAssistantContent)
- `onToolUse`: Обрабатывает использование инструментов (получает Session и ToolUseAssistantContent)
- `onToolResult`: Обрабатывает результаты работы инструментов (получает Session и ToolResultAssistantContent)
- `onOtherContent`: Обрабатывает другие типы содержимого (получает Session и AssistantContent)
- `onUsage`: Обрабатывает информацию об использовании (получает Session и AssistantUsage)
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlPermissionRequest, возвращает Behavior)
- `onOtherControlRequest`: Обрабатывает другие запросы управления (получает Session и ControlRequestPayload, возвращает ControlResponsePayload)

#### Связь между интерфейсами

**Важное замечание о иерархии событий:**

- `SessionEventConsumers` — это **высокоуровневый** обработчик событий, который обрабатывает различные типы сообщений (системные, от ассистента, пользователя и т.д.)
- `AssistantContentConsumers` — это **низкоуровневый** обработчик содержимого, который обрабатывает различные типы содержимого внутри сообщений ассистента (текст, инструменты, размышления и т.д.)

**Связь обработчиков:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers использует AssistantContentConsumers для обработки содержимого внутри сообщений ассистента)

**Связи наследования событий:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Связи тайм-аутов событий:**

Каждый метод обработчика событий имеет соответствующий ему метод тайм-аута, позволяющий настраивать поведение тайм-аута для конкретного события:

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

**Значения тайм-аута по умолчанию:**

- Тайм-аут по умолчанию для `SessionEventSimpleConsumers`: 180 секунд (Timeout.TIMEOUT_180_SECONDS)
- Тайм-аут по умолчанию для `AssistantContentSimpleConsumers`: 60 секунд (Timeout.TIMEOUT_60_SECONDS)

**Требования к иерархии тайм-аутов:**

Для правильной работы должны соблюдаться следующие соотношения тайм-аутов:

- Возвращаемое значение `onAssistantMessageTimeout` должно быть больше, чем возвращаемые значения `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`
- Возвращаемое значение `onControlRequestTimeout` должно быть больше, чем возвращаемые значения `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`

### Параметры транспорта

Класс `TransportOptions` позволяет настроить способ взаимодействия SDK с Qwen Code CLI:

- `pathToQwenExecutable`: Путь к исполняемому файлу Qwen Code CLI
- `cwd`: Рабочая директория для процесса CLI
- `model`: Модель ИИ, используемая в сессии
- `permissionMode`: Режим разрешений, управляющий выполнением инструментов
- `env`: Переменные окружения, передаваемые процессу CLI
- `maxSessionTurns`: Ограничивает количество ходов разговора в сессии
- `coreTools`: Список основных инструментов, доступных ИИ
- `excludeTools`: Список инструментов, недоступных для ИИ
- `allowedTools`: Список инструментов, одобренных для использования без дополнительного подтверждения
- `authType`: Тип аутентификации, используемый в сессии
- `includePartialMessages`: Включает получение частичных сообщений во время потоковой передачи ответов
- `turnTimeout`: Таймаут для полного хода разговора
- `messageTimeout`: Таймаут для отдельных сообщений в рамках хода
- `resumeSessionId`: Идентификатор предыдущей сессии для возобновления
- `otherOptions`: Дополнительные параметры командной строки для передачи в CLI

### Функции управления сессией

- **Создание сессии**: Используйте `QwenCodeCli.newSession()`, чтобы создать новую сессию с настраиваемыми параметрами
- **Управление сессией**: Класс `Session` предоставляет методы для отправки запросов, обработки ответов и управления состоянием сессии
- **Очистка сессии**: Всегда закрывайте сессии с помощью `session.close()`, чтобы корректно завершить процесс CLI
- **Возобновление сессии**: Используйте `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию
- **Прерывание сессии**: Используйте `session.interrupt()`, чтобы прервать текущий выполняющийся запрос
- **Динамическое переключение моделей**: Используйте `session.setModel()`, чтобы изменить модель во время сессии
- **Динамическое переключение режима разрешений**: Используйте `session.setPermissionMode()`, чтобы изменить режим разрешений во время сессии

### Конфигурация пула потоков

SDK использует пул потоков для управления параллельными операциями со следующей конфигурацией по умолчанию:

- **Размер основного пула**: 30 потоков
- **Максимальный размер пула**: 100 потоков
- **Время ожидания**: 60 секунд
- **Емкость очереди**: 300 задач (используется LinkedBlockingQueue)
- **Именование потоков**: "qwen_code_cli-pool-{номер}"
- **Потоки-демоны**: false
- **Обработчик отклоненных задач**: CallerRunsPolicy

## Обработка ошибок

SDK предоставляет специальные типы исключений для различных сценариев ошибок:

- `SessionControlException`: Выбрасывается при возникновении проблемы с управлением сессией (создание, инициализация и т.д.)
- `SessionSendPromptException`: Выбрасывается при возникновении проблемы с отправкой запроса или получением ответа
- `SessionClosedException`: Выбрасывается при попытке использовать закрытую сессию

## Часто задаваемые вопросы / Устранение неполадок

### В: Нужно ли устанавливать Qwen CLI отдельно?

О: да, требуется Qwen CLI версии 0.5.5 или выше.

### Вопрос: Какие версии Java поддерживаются?

Ответ: SDK требует Java 1.8 или выше.

### Вопрос: Как обрабатывать длительные запросы?

Ответ: SDK включает в себя утилиты тайм-аута. Вы можете настроить тайм-ауты с помощью класса `Timeout` в `TransportOptions`.

### Вопрос: Почему некоторые инструменты не выполняются?

Ответ: Скорее всего, это связано с режимами разрешений. Проверьте настройки режима разрешений и подумайте о использовании `allowedTools`, чтобы предварительно одобрить определенные инструменты.

### Вопрос: Как возобновить предыдущую сессию?

Ответ: Используйте метод `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию.

### Вопрос: Могу ли я настроить окружение для процесса CLI?

Ответ: Да, используйте метод `setEnv()` в `TransportOptions`, чтобы передать переменные окружения в процесс CLI.

## Лицензия

Apache-2.0 — подробности см. в файле [LICENSE](./LICENSE).