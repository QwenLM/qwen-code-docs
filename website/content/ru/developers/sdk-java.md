# Qwen Code Java SDK

Qwen Code Java SDK — это минимальный экспериментальный SDK для программного доступа к функциональности Qwen Code. Он предоставляет Java-интерфейс для взаимодействия с CLI Qwen Code, позволяя разработчикам интегрировать возможности Qwen Code в свои Java-приложения.

## Требования

- Java >= 1.8
- Maven >= 3.6.0 (для сборки из исходных кодов)
- qwen-code >= 0.5.0

### Зависимости

- **Ведение журналов**: ch.qos.logback:logback-classic
- **Утилиты**: org.apache.commons:commons-lang3
- **Обработка JSON**: com.alibaba.fastjson2:fastjson2
- **Тестирование**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Установка

Добавьте следующую зависимость в файл `pom.xml` вашего проекта Maven:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>{$version}</version>
</dependency>
```

Или, если вы используете Gradle, добавьте в файл `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:{$version}'
```

## Сборка и запуск

### Команды сборки

```bash

# Сборка проекта
mvn compile

# Запуск тестов
mvn test

# Упаковка в JAR-файл
mvn package

# Установка в локальный репозиторий
mvn install

## Быстрый старт

Самый простой способ использовать SDK — через метод `QwenCodeCli.simpleQuery()`:

```java
public static void runSimpleExample() {
    List<String> result = QwenCodeCli.simpleQuery("hello world");
    result.forEach(logger::info);
}
```

Для более сложного использования с пользовательскими параметрами транспорта:

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
                    logger.info("Получен текстовый контент: {}", textAssistantContent.getText());
                }

                @Override
                public void onThinking(Session session, ThingkingAssistantContent thingkingAssistantContent) {
                    logger.info("Получен контент «мышления»: {}", thingkingAssistantContent.getThinking());
                }

                @Override
                public void onToolUse(Session session, ToolUseAssistantContent toolUseContent) {
                    logger.info("Получен контент вызова инструмента: {} с аргументами: {}",
                            toolUseContent, toolUseContent.getInput());
                }

                @Override
                public void onToolResult(Session session, ToolResultAssistantContent toolResultContent) {
                    logger.info("Получен результат инструмента: {}", toolResultContent.getContent());
                }

                @Override
                public void onOtherContent(Session session, AssistantContent<?> other) {
                    logger.info("Получен другой контент: {}", other);
                }

                @Override
                public void onUsage(Session session, AssistantUsage assistantUsage) {
                    logger.info("Получена информация об использовании: входные токены: {}, выходные токены: {}",
                            assistantUsage.getUsage().getInputTokens(), assistantUsage.getUsage().getOutputTokens());
                }
            }.setDefaultPermissionOperation(Operation.allow));
    logger.info("Пример потоковой обработки завершён.");
}
```

Другие примеры см. в `src/test/java/com/alibaba/qwen/code/cli/example`

## Архитектура

SDK следует многоуровневой архитектуре:

- **Уровень API**: предоставляет основные точки входа через класс `QwenCodeCli` с простыми статическими методами для базового использования  
- **Уровень сессий**: управляет сессиями взаимодействия с CLI Qwen Code через класс `Session`  
- **Транспортный уровень**: отвечает за механизм связи между SDK и процессом CLI (в настоящее время используется транспорт через процесс — `ProcessTransport`)  
- **Уровень протокола**: определяет структуры данных для взаимодействия на основе протокола CLI  
- **Утилиты**: общие вспомогательные средства для параллельного выполнения, обработки таймаутов и управления ошибками  

## Ключевые возможности

### Режимы разрешений

SDK поддерживает различные режимы разрешений для управления выполнением инструментов:

- **`default`**: Инструменты записи запрещены по умолчанию, за исключением тех, что одобрены через обратный вызов `canUseTool` или указаны в списке `allowedTools`. Инструменты только для чтения выполняются без подтверждения.
- **`plan`**: Блокирует все инструменты записи и заставляет ИИ сначала представить план действий.
- **`auto-edit`**: Автоматически одобряет инструменты редактирования (например, `edit`, `write_file`), тогда как для остальных инструментов требуется подтверждение.
- **`yolo`**: Все инструменты выполняются автоматически без какого-либо подтверждения.

### Обработчики событий сессии и обработчики контента ассистента

SDK предоставляет два ключевых интерфейса для обработки событий и контента из CLI:

#### Интерфейс SessionEventConsumers

Интерфейс `SessionEventConsumers` предоставляет коллбэки для обработки различных типов сообщений во время сессии:

- `onSystemMessage`: обрабатывает системные сообщения из CLI (принимает объекты `Session` и `SDKSystemMessage`);
- `onResultMessage`: обрабатывает сообщения с результатами из CLI (принимает объекты `Session` и `SDKResultMessage`);
- `onAssistantMessage`: обрабатывает сообщения ассистента (ответы ИИ) (принимает объекты `Session` и `SDKAssistantMessage`);
- `onPartialAssistantMessage`: обрабатывает частичные сообщения ассистента при потоковой передаче (принимает объекты `Session` и `SDKPartialAssistantMessage`);
- `onUserMessage`: обрабатывает сообщения пользователя (принимает объекты `Session` и `SDKUserMessage`);
- `onOtherMessage`: обрабатывает другие типы сообщений (принимает объекты `Session` и строковое сообщение);
- `onControlResponse`: обрабатывает ответы на управляющие запросы (принимает объекты `Session` и `CLIControlResponse`);
- `onControlRequest`: обрабатывает управляющие запросы (принимает объекты `Session` и `CLIControlRequest`, возвращает `CLIControlResponse`);
- `onPermissionRequest`: обрабатывает запросы разрешений (принимает объекты `Session` и `CLIControlRequest<CLIControlPermissionRequest>`, возвращает `Behavior`).

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы содержимого в сообщениях ассистента:

- `onText`: обрабатывает текстовое содержимое (принимает объекты Session и TextAssistantContent);
- `onThinking`: обрабатывает содержимое, связанное с рассуждениями (принимает объекты Session и ThingkingAssistantContent);
- `onToolUse`: обрабатывает содержимое, связанное с использованием инструментов (принимает объекты Session и ToolUseAssistantContent);
- `onToolResult`: обрабатывает результаты выполнения инструментов (принимает объекты Session и ToolResultAssistantContent);
- `onOtherContent`: обрабатывает другие типы содержимого (принимает объекты Session и AssistantContent);
- `onUsage`: обрабатывает информацию об использовании (принимает объекты Session и AssistantUsage);
- `onPermissionRequest`: обрабатывает запросы разрешений (принимает объекты Session и CLIControlPermissionRequest, возвращает значение типа Behavior);
- `onOtherControlRequest`: обрабатывает другие запросы управления (принимает объекты Session и ControlRequestPayload, возвращает значение типа ControlResponsePayload).

#### Взаимосвязь интерфейсов

**Важное замечание об иерархии событий:**

- `SessionEventConsumers` — это **высокоуровневый** обработчик событий, отвечающий за обработку различных типов сообщений (системных, ассистента, пользователя и т. д.).
- `AssistantContentConsumers` — это **низкоуровневый** обработчик содержимого, отвечающий за обработку различных типов содержимого внутри сообщений ассистента (текст, инструменты, рассуждения и т. д.).

**Взаимосвязь процессоров:**

- `SessionEventConsumers` → `AssistantContentConsumers` (`SessionEventConsumers` использует `AssistantContentConsumers` для обработки содержимого внутри сообщений ассистента)

**Взаимосвязи порождения событий:**

- `onAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`, `onUsage`
- `onPartialAssistantMessage` → `onText`, `onThinking`, `onToolUse`, `onToolResult`, `onOtherContent`
- `onControlRequest` → `onPermissionRequest`, `onOtherControlRequest`

**Взаимосвязи таймаутов событий:**

Для каждого метода обработчика событий существует соответствующий метод таймаута, позволяющий настраивать поведение таймаута для этого конкретного события:

- `onSystemMessage` ↔ `onSystemMessageTimeout`
- `onResultMessage` ↔ `onResultMessageTimeout`
- `onAssistantMessage` ↔ `onAssistantMessageTimeout`
- `onPartialAssistantMessage` ↔ `onPartialAssistantMessageTimeout`
- `onUserMessage` ↔ `onUserMessageTimeout`
- `onOtherMessage` ↔ `onOtherMessageTimeout`
- `onControlResponse` ↔ `onControlResponseTimeout`
- `onControlRequest` ↔ `onControlRequestTimeout`

Для методов таймаута `AssistantContentConsumers`:

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

Для корректной работы должны соблюдаться следующие соотношения таймаутов:

- Значение, возвращаемое `onAssistantMessageTimeout`, должно быть больше значений, возвращаемых `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`.
- Значение, возвращаемое `onControlRequestTimeout`, должно быть больше значений, возвращаемых `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`.

### Параметры транспорта

Класс `TransportOptions` позволяет настроить способ взаимодействия SDK с CLI Qwen Code:

- `pathToQwenExecutable`: путь к исполняемому файлу CLI Qwen Code  
- `cwd`: рабочая директория для процесса CLI  
- `model`: ИИ-модель, используемая в сеансе  
- `permissionMode`: режим разрешений, управляющий выполнением инструментов  
- `env`: переменные окружения, передаваемые процессу CLI  
- `maxSessionTurns`: ограничивает количество реплик в рамках одного сеанса  
- `coreTools`: список базовых инструментов, доступных ИИ  
- `excludeTools`: список инструментов, недоступных для ИИ  
- `allowedTools`: список инструментов, предварительно одобренных для использования без дополнительного подтверждения  
- `authType`: тип аутентификации, используемый в сеансе  
- `includePartialMessages`: включает получение частичных сообщений при потоковой передаче ответов  
- `turnTimeout`: таймаут для завершения одной реплики диалога  
- `messageTimeout`: таймаут для отдельного сообщения внутри реплики  
- `resumeSessionId`: идентификатор предыдущего сеанса, который необходимо возобновить  
- `otherOptions`: дополнительные параметры командной строки, передаваемые CLI

### Функции управления сессиями

- **Создание сессии**: используйте `QwenCodeCli.newSession()`, чтобы создать новую сессию с пользовательскими параметрами  
- **Управление сессией**: класс `Session` предоставляет методы для отправки запросов, обработки ответов и управления состоянием сессии  
- **Завершение сессии**: всегда закрывайте сессии с помощью `session.close()`, чтобы корректно завершить процесс CLI  
- **Возобновление сессии**: используйте `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию  
- **Прерывание сессии**: используйте `session.interrupt()`, чтобы прервать выполняемый в данный момент запрос  
- **Динамическая смена модели**: используйте `session.setModel()`, чтобы изменить модель в ходе сессии  
- **Динамическая смена режима разрешений**: используйте `session.setPermissionMode()`, чтобы изменить режим разрешений в ходе сессии

### Конфигурация пула потоков

SDK использует пул потоков для управления параллельными операциями со следующей конфигурацией по умолчанию:

- **Размер основного пула**: 30 потоков  
- **Максимальный размер пула**: 100 потоков  
- **Время жизни неактивных потоков (keep-alive)**: 60 секунд  
- **Ёмкость очереди**: 300 задач (используется `LinkedBlockingQueue`)  
- **Именование потоков**: `qwen_code_cli-pool-{номер}`  
- **Демон-потоки**: `false`  
- **Обработчик отклонённых задач**: `CallerRunsPolicy`

## Обработка ошибок

SDK предоставляет специализированные типы исключений для различных сценариев ошибок:

- `SessionControlException`: выбрасывается при возникновении проблем с управлением сессией (создание, инициализация и т. д.)  
- `SessionSendPromptException`: выбрасывается при возникновении проблем с отправкой запроса или получением ответа  
- `SessionClosedException`: выбрасывается при попытке использовать закрытую сессию  

## Часто задаваемые вопросы / Устранение неполадок

### В: Нужно ли устанавливать Qwen CLI отдельно?

О: Да, требуется Qwen CLI версии 0.5.5 или выше.

### Вопрос: Какие версии Java поддерживаются?

Ответ: Для SDK требуется Java 1.8 или выше.

### Вопрос: Как обрабатывать долгие запросы?

Ответ: В SDK встроены утилиты для работы с таймаутами. Вы можете настроить таймауты с помощью класса `Timeout` в `TransportOptions`.

### Вопрос: Почему некоторые инструменты не выполняются?

Ответ: Скорее всего, это связано с режимами разрешений. Проверьте настройки режима разрешений и рассмотрите возможность использования параметра `allowedTools` для предварительного одобрения определённых инструментов.

### Вопрос: Как возобновить предыдущую сессию?

Ответ: Используйте метод `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию.

### Вопрос: Можно ли настроить окружение для процесса CLI?

Ответ: Да, используйте метод `setEnv()` в `TransportOptions`, чтобы передать переменные окружения в процесс CLI.

## Лицензия

Apache-2.0 — подробности см. в файле [LICENSE](./LICENSE).