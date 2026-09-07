# Qwen Code Java SDK

Qwen Code Java SDK предоставляет рекомендуемый транспорт демона для `qwen serve` и сохраняет экспериментальное устаревшее stdio API для совместимости. Оба API поставляются в одном артефакте `com.alibaba:qwencode-sdk`.

## Требования

- Java >= 11 для `0.1.0-alpha`
- Maven >= 3.9.2 при сборке или публикации этого SDK из исходников
- Совместимый `qwen serve` для API демона или qwen-code >= 0.5.0 для устаревшего stdio API

### Зависимости

- **Logging API**: org.slf4j:slf4j-api (выберите SLF4J-провайдер в вашем приложении)
- **Утилиты**: org.apache.commons:commons-lang3
- **Обработка JSON**: Fastjson2 для кодирования и Jackson Core для строгого декодирования
- **Тестирование**: JUnit 5 (org.junit.jupiter:junit-jupiter)

## Установка

Добавьте следующую зависимость в ваш Maven `pom.xml`:

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>qwencode-sdk</artifactId>
    <version>0.1.0-alpha</version>
</dependency>
```

Или при использовании Gradle добавьте в ваш `build.gradle`:

```gradle
implementation 'com.alibaba:qwencode-sdk:0.1.0-alpha'
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

### Реальный daemon E2E из исходников

Запустите интеграционные тесты Java real-daemon из корня репозитория после сборки рабочих пространств и корневого CLI-бандла:

```bash
npm run build
npm run bundle
npx tsx scripts/run-java-daemon-sdk-e2e.ts
```

Одного `npm run build` недостаточно для обновления `dist/cli.js`; E2E-харнес запускает этот бандл и завершается с явной ошибкой отсутствия, если он отсутствует.

## Рекомендуемый API демона

Запустите `qwen serve`, затем создайте независимую сессию с областью действия потока. `promptText` возвращает результат только после совпадающего `turn_complete`; неполные потоки завершаются с ошибкой `PromptOutcomeIndeterminateException`, а не возвращают частичный текст как успешный результат.

Для гарантий жизненного цикла, предполагаемых в `0.1.0-alpha`, используйте сборку qwen-code, выпущенную из той же ревизии исходников, что и SDK. Демон должен содержать идемпотентный ledger отсоединения на клиент из [#7386](https://github.com/QwenLM/qwen-code/pull/7386), гарантию терминала на эпоху из [#7400](https://github.com/QwenLM/qwen-code/pull/7400), а также отмену допуска и FIFO cancel-drain fence данного релиза. Одного коммита #7400 недостаточно: демон с тем же wire-протоколом может подтвердить отмену до диспетчеризации агента без остановки допущенного промпта, или позволить неподтверждённую отмену на уровне сессии достичь queued преемника. Встроенный дочерний ACP использует одно подтверждённое рукопожатие отмены с учётом допуска; пользовательский совместимый со стандартами дочерний ACP без этого расширения получает одно стандартное уведомление `session/cancel`. Согласование возможностей не может различить старые сборки демона с тем же wire-протоколом, поэтому SDK использует fail closed вместо сообщения о частичном выводе как об успешном результате.

Встроенное рукопожатие отмены намеренно ожидает завершения целевого вызова prompt перед тем, как демон диспетчеризует своего queued преемника. У него нет тайм-аута, который просто подтверждает отмену: это могло бы позволить поздней отмене на уровне сессии достичь следующего промпта. Если провайдер, инструмент или пользовательская интеграция бесконечно игнорирует свой `AbortSignal`, мутация отмены может оставаться с неопределённым результатом, и такую сессию нельзя переиспользовать. Считайте формальный терминал промпта, полученный в границе наблюдения вызывающего, авторитетным; в противном случае закройте или уничтожьте сессию после сбоя наблюдения. Восстановление застрявшего общего дочернего ACP без нарушения его братских сессий требует более сильной изоляции среды выполнения и выходит за рамки этого альфа-контракта.

```java
import com.alibaba.qwen.code.daemon.DaemonClient;
import com.alibaba.qwen.code.daemon.DaemonSessionClient;
import com.alibaba.qwen.code.daemon.PromptTextResult;
import java.net.URI;

try (DaemonClient daemon = DaemonClient.builder()
        .baseUri(URI.create("http://127.0.0.1:4170"))
        .build();
     DaemonSessionClient session = daemon.createSession()) {
    PromptTextResult result = session.promptText("Explain this repository");
    System.out.println(result.getText());
}
```

Вызывающие, которым необходимо выделить идентификатор сессии до создания, могут передать RFC UUID v1–v5. SDK проверяет `session_id_override` перед мутацией и сообщает о другом возвращённом ID как о `SessionCreationOutcomeUnknownException`:

```java
CreateSessionRequest request = CreateSessionRequest.builder()
        .sessionId("550E8400-E29B-41D4-A716-446655440000")
        .build();

try (DaemonSessionClient session = daemon.createSession(request)) {
    System.out.println(session.getSession().getSessionId());
}
```

Демон нормализует ID в нижний регистр и создаёт новую сессию потока. Это не является идемпотентным присоединением; после неоднозначного результата создания восстанавливайтесь по известному ID, а не повторяйте создание.

Если `qwen serve` требует аутентификации, добавьте
`.bearerToken(System.getenv("QWEN_SERVER_TOKEN"))` в билдер
`DaemonClient`. SDK отправляет bearer в REST и SSE-запросах и никогда не помещает его
в URL.

Используйте `startPrompt` с `PromptObserver`, когда вам нужны упорядоченные колбэки текста, размышлений, инструментов, использования, разрешений и необработанных событий. Его представления `acceptanceFuture()` и `completionFuture()` отдельно предоставляют допуск демона и надёжный терминал хода. `respondToPermission()` возвращает `false`, когда запрос уже был разрешён или больше не ожидает. Отмена будущих представлений не отменяет промпт демона; используйте `cancelActivePrompt()` для операции отмены на уровне сессии демона и всё равно ожидайте совпадающего терминала. Кооперативная отмена завершается с `turn_complete` и `stopReason=cancelled`; `promptText()` возвращает свой `PromptTextResult`, поэтому вызывающие, различающие отмену, должны проверить `result.getTerminal().getStopReason()`. Если агент или провайдер завершается с ошибкой при отмене, демон может вместо этого опубликовать `turn_error`, что заставляет `promptText()` выбросить `PromptTurnException`.

При гонке отмены, дедлайна, разборки или завершения агента latch демона exactly-once публикует первый формальный терминал и подавляет последующие кандидаты. Всегда ветвитесь по полученному терминалу; последняя управляющая мутация, отправленная клиентом, не определяет тип терминала или код ошибки.

Транспорт SSE отправляет `Accept-Encoding: identity` и `Last-Event-ID`, проверяет фрейминг и ID событий, дедуплицирует воспроизведение и переподключает только SSE GET. Промпты и другие мутационные запросы никогда не повторяются автоматически. Ответы HTTP 408 и 5xx на допуск промпта, создание сессии, разрешение, отмену, heartbeat, отсоединение или удаление сообщаются как неопределённый результат, потому что они не доказывают, что демон отклонил мутацию. Конечные тела ответов и наблюдение SSE имеют независимые дедлайны.

Выбор модели на момент создания намеренно не предоставляется API Java daemon SDK в этой альфа-версии. Демон сообщает об отклонённом `modelServiceId` только как SSE-событие, отправленное до ответа create, в то время как этот SDK открывает свой поток с более позднего watermark допуска промпта. Пока демон не вернёт окончательный результат create или SDK не получит отдельную подписку на события сессии с `Last-Event-ID: 0`, используйте настроенную по умолчанию модель демона.

`PromptRequest.Builder.deadline(Duration)` запрашивает дедлайн промпта, принудительно применяемый демоном, и принимается только когда демон объявляет `prompt_absolute_deadline`; в противном случае SDK завершается с ошибкой до отправки промпта. Значение должно быть от 1 до 2 147 483 647 миллисекунд, соответствуя диапазону таймеров Node демона. Это отдельно от `observationTimeout(Duration)`, который ограничивает только локальное наблюдение SSE и никогда не отправляет мутацию отмены.

Перед созданием сессии SDK требует, чтобы демон объявлял транспорт REST и `session_scope_override`; это предотвращает тихое игнорирование старым демоном запрошенной области `thread` и подключение клиента к общей сессии. Когда вызывающий указывает ID сессии, SDK дополнительно требует `session_id_override` перед отправкой мутации. Когда `client_heartbeat` объявлен, открытая сессия отправляет свежий heartbeat каждую минуту, чтобы демон не удалил иначе неактивного клиента. Установите `heartbeatInterval(Duration.ZERO)` в билдере `DaemonClient`, чтобы отключить это поведение, или выберите другой положительный интервал. Heartbeat никогда не повторяется; следующий запланированный heartbeat — это отдельный keepalive. Наблюдение промпта ограничено 32 одновременными промптами на клиента по умолчанию и может быть настроено через `maximumConcurrentPrompts`. Колбэки допуска и терминальных futures выполняются вне транспортных воркеров; колбэки, остающиеся заблокированными, потребляют ограниченную ёмкость публикации. Очистка потока SSE также ограничена, и закрытие, остающееся заблокированным, сохраняет свою резервацию очистки. Любое условие может привести к сбою последующего `startPrompt` с `DaemonClientCapacityException` вместо сброса тайм-аута или неограниченного роста потоков и queued работы.

Неопределённое завершение — это граница результата, а не граница повторного использования сессии. После `PromptAdmissionUnknownException` или `PromptOutcomeIndeterminateException` этот `DaemonSessionClient` навсегда отклоняет последующие промпты, даже если локальная очистка потока позже завершится успешно; закройте или уничтожьте сессию вместо этого. Тайм-аут наблюдения публикуется без бесконечного ожидания заблокированного закрытия потока, в то время как очистка продолжается асинхронно и сохраняет ограниченную ёмкость клиента до завершения.

## Устаревший stdio API

Существующий API `com.alibaba.qwen.code.cli` остаётся доступным:

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
            .setAllowedTools(Arrays.asList("read_file", "write_file", "glob"));

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

## Миграция на Java 11 и ограничения альфа-версии

`0.1.0-alpha` повышает минимальную версию Java для всего артефакта с 8 до 11. Приложения на Java 8 должны оставаться на `0.0.3-alpha`. Logback больше не является runtime-зависимостью; добавьте SLF4J-провайдер, который использует ваше приложение.

Эта альфа-версия намеренно использует fail closed, когда не может доказать терминал промпта. Она не гарантирует exactly-once выполнение при перезапусках демона, автоматическое восстановление эпох, снимок/ресинк, сохранённые курсоры или настоящее целевое отменение по prompt-ID. События `prompt_cancelled` и очереди являются информационными; только совпадающие `turn_complete` и `turn_error` являются терминальными.

Если создание сессии имеет неоднозначный результат транспорта, демон может сохранить сессию, чей ID так и не достиг вызывающего. SDK не повторяет создание и не может отсоединить эту неизвестную сессию; восстановление жизненного цикла на стороне демона — это граница восстановления.

## Архитектура

Артефакт содержит две изолированные реализации:

- **API демона**: `DaemonClient` и `DaemonSessionClient` используют мутации REST плюс возобновляемый SSE и владеют ограниченными ресурсами HTTP, промптов, обслуживания и таймеров.
- **Устаревший stdio API**: `QwenCodeCli`, `Session` и `ProcessTransport` управляют дочерним процессом CLI, используя существующие DTO и утилиты протокола CLI.

Реализация демона не переиспользует устаревший транспорт процесса, модель сессии, DTO или глобальный executor.

## Возможности устаревшего stdio API

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

- `onSystemMessage`: Обрабатывает системные сообщения от CLI (получает Session и SDKSystemMessage)
- `onResultMessage`: Обрабатывает результирующие сообщения от CLI (получает Session и SDKResultMessage)
- `onAssistantMessage`: Обрабатывает сообщения ассистента (ответы ИИ) (получает Session и SDKAssistantMessage)
- `onPartialAssistantMessage`: Обрабатывает частичные сообщения ассистента во время потоковой передачи (получает Session и SDKPartialAssistantMessage)
- `onUserMessage`: Обрабатывает сообщения пользователя (получает Session и SDKUserMessage)
- `onOtherMessage`: Обрабатывает другие типы сообщений (получает Session и строку сообщения)
- `onControlResponse`: Обрабатывает ответы управления (получает Session и CLIControlResponse)
- `onControlRequest`: Обрабатывает запросы управления (получает Session и CLIControlRequest, возвращает CLIControlResponse)
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlRequest<CLIControlPermissionRequest>, возвращает Behavior)

#### Интерфейс AssistantContentConsumers

Интерфейс `AssistantContentConsumers` обрабатывает различные типы контента внутри сообщений ассистента:

- `onText`: Обрабатывает текстовый контент (получает Session и TextAssistantContent)
- `onThinking`: Обрабатывает контент размышлений (получает Session и ThinkingAssistantContent)
- `onToolUse`: Обрабатывает контент использования инструментов (получает Session и ToolUseAssistantContent)
- `onToolResult`: Обрабатывает контент результатов работы инструментов (получает Session и ToolResultAssistantContent)
- `onOtherContent`: Обрабатывает другие типы контента (получает Session и AssistantContent)
- `onUsage`: Обрабатывает информацию об использовании (получает Session и AssistantUsage)
- `onPermissionRequest`: Обрабатывает запросы разрешений (получает Session и CLIControlPermissionRequest, возвращает Behavior)
- `onOtherControlRequest`: Обрабатывает другие управляющие запросы (получает Session и ControlRequestPayload, возвращает ControlResponsePayload)

#### Взаимосвязь между интерфейсами

**Важное замечание об иерархии событий:**

- `SessionEventConsumers` — это **высокоуровневый** обработчик событий, работающий с различными типами сообщений (системные, ассистента, пользователя и т.д.)
- `AssistantContentConsumers` — это **низкоуровневый** обработчик контента, работающий с различными типами контента внутри сообщений ассистента (текст, инструменты, размышления и т.д.)

**Связь обработчиков:**

- `SessionEventConsumers` → `AssistantContentConsumers` (SessionEventConsumers использует AssistantContentConsumers для обработки контента внутри сообщений ассистента)

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

- Возвращаемое значение `onAssistantMessageTimeout` должно быть больше, чем возвращаемые значения `onTextTimeout`, `onThinkingTimeout`, `onToolUseTimeout`, `onToolResultTimeout` и `onOtherContentTimeout`
- Возвращаемое значение `onControlRequestTimeout` должно быть больше, чем возвращаемые значения `onPermissionRequestTimeout` и `onOtherControlRequestTimeout`

### Параметры транспорта

Класс `TransportOptions` позволяет настраивать способ взаимодействия SDK с Qwen Code CLI:

- `pathToQwenExecutable`: Путь к исполняемому файлу Qwen Code CLI
- `cwd`: Рабочая директория для процесса CLI
- `model`: Модель ИИ, используемая для сессии
- `permissionMode`: Режим разрешений, контролирующий выполнение инструментов
- `env`: Переменные окружения, передаваемые процессу CLI
- `maxSessionTurns`: Ограничивает количество оборотов диалога в сессии
- `coreTools`: Список основных инструментов, которые должны быть доступны ИИ
- `excludeTools`: Список инструментов, которые следует исключить из доступных для ИИ
- `allowedTools`: Список инструментов, которые предварительно одобрены для использования без дополнительного подтверждения
- `authType`: Тип аутентификации, используемый для сессии
- `includePartialMessages`: Включает получение частичных сообщений во время потоковых ответов
- `turnTimeout`: Тайм-аут для полного оборота диалога
- `messageTimeout`: Тайм-аут для отдельных сообщений в рамках оборота
- `resumeSessionId`: Идентификатор предыдущей сессии для возобновления
- `otherOptions`: Дополнительные параметры командной строки, передаваемые CLI

### Возможности управления сессией

- **Создание сессии**: Используйте `QwenCodeCli.newSession()` для создания новой сессии с настраиваемыми параметрами
- **Управление сессией**: Класс `Session` предоставляет методы для отправки запросов, обработки ответов и управления состоянием сессии
- **Очистка сессии**: Всегда закрывайте сессии с помощью `session.close()`, чтобы корректно завершить процесс CLI
- **Возобновление сессии**: Используйте `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию
- **Прерывание сессии**: Используйте `session.interrupt()`, чтобы прервать текущий выполняемый запрос
- **Динамическое переключение модели**: Используйте `session.setModel()`, чтобы изменить модель во время сессии
- **Динамическое переключение режима разрешений**: Используйте `session.setPermissionMode()`, чтобы изменить режим разрешений во время сессии

### Конфигурация пула потоков

SDK использует пул потоков для управления параллельными операциями со следующей конфигурацией по умолчанию:

- **Core Pool Size**: 30 потоков
- **Maximum Pool Size**: 100 потоков
- **Keep-Alive Time**: 60 секунд
- **Queue Capacity**: 300 задач (LinkedBlockingQueue)
- **Thread Naming**: "qwen_code_cli-pool-{number}"
- **Daemon Threads**: true
- **Rejected Execution Handler**: CallerRunsPolicy

Задачи, всё ещё выполняющиеся или стоящие в очереди в пуле по умолчанию, отбрасываются при выходе из JVM. Вызывающие, которым требуется завершение, должны явно дождаться этих задач.

## Обработка ошибок

SDK предоставляет определённые типы исключений для различных сценариев ошибок:

- `SessionControlException`: Выбрасывается при проблемах с управлением сессией, включая попытку использования закрытой или недоступной сессии. Конструирование сессии и `start()` могут выбрасывать его напрямую; `QwenCodeCli.newSession()` оборачивает низкоуровневые сбои создания и инициализации в `RuntimeException`.
- `SessionSendPromptException`: Выбрасывается при проблемах с отправкой промпта или получением ответа

## Часто задаваемые вопросы / Устранение неполадок

### В: Нужно ли устанавливать Qwen CLI отдельно?

О: Да. API демона требует совместимый `qwen serve`; устаревший stdio
API требует qwen-code 0.5.0 или выше.

### В: Какие версии Java поддерживаются?

О: `0.1.0-alpha` требует Java 11 или выше. Пользователи Java 8 должны оставаться на `0.0.3-alpha`.

### В: Как обрабатывать длительные запросы?

О: SDK включает утилиты тайм-аутов. Вы можете настроить тайм-ауты с помощью класса `Timeout` в `TransportOptions`.

### В: Почему некоторые инструменты не выполняются?

О: Вероятная причина — режим разрешений. Проверьте настройки режима разрешений и рассмотрите возможность использования `allowedTools` для предварительного одобрения определённых инструментов.

### В: Как возобновить предыдущую сессию?

О: Используйте метод `setResumeSessionId()` в `TransportOptions`, чтобы возобновить предыдущую сессию.

### В: Можно ли настроить окружение для процесса CLI?

О: Да, используйте метод `setEnv()` в `TransportOptions`, чтобы передать переменные окружения процессу CLI.

## Лицензия

Apache-2.0 — подробности см. в [LICENSE](../../LICENSE).
