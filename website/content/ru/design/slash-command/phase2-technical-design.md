# Фаза 2 — Технический проект: Расширение возможностей

## 1. Цели проектирования и ограничения

### 1.1 Цели

- Расширить `supportedModes` для 13 встроенных команд, чтобы включить `non_interactive` и/или `acp`
- Обеспечить, чтобы каждая расширенная команда в режимах ACP/non-interactive возвращала текстовое содержимое, пригодное для потребления IDE
- Реализовать канал вызова модели для prompt command (`SkillTool` использует `getModelInvocableCommands()`)
- Реализовать базовое обнаружение slash command в середине ввода

### 1.2 Жёсткие ограничения

- **Нулевая деградация интерактивного пути**: существующее интерактивное поведение всех расширяемых команд строго сохраняется — изменения вносятся только внутри `action` путём добавления ветвления по режиму, интерактивный путь не затрагивается
- **Стратегия реализации: ветвление по режиму, а не двойная регистрация**: все 13 команд используют проверку `executionMode` внутри `action`, без применения шаблона двойной регистрации, описанного в §10.2 документа по фазе 1 (двойная регистрация оправдана только при кардинально различающейся логике интерактивного и неинтерактивного режимов, что не соответствует сложности текущих команд)
- **Формат сообщений ACP**: текстовое содержимое, возвращаемое по ACP-пути, не должно содержать ANSI-стилей и должно быть в Markdown или plain text, ориентировано на потребление плагином IDE
- **Пропуск побочных эффектов, зависящих от окружения**: операции, зависящие от графического окружения, такие как открытие браузера (`open()`), работа с буфером обмена (`copyToClipboard()`), должны быть пропущены в режимах non-interactive/ACP

---

## 2. Базовое состояние после завершения Фазы 1

Ключевые моменты архитектуры после Фазы 1 (на них напрямую строится Фаза 2):

- Поле `commandType` удалено из интерфейса `SlashCommand`; все команды теперь используют явный `supportedModes`
- `getEffectiveSupportedModes()` — двухуровневый вывод: явный `supportedModes` → резервный `CommandKind`
- `CommandService.getCommandsForMode(mode)` заменил белый список `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` уже расширены на все режимы в Фазе 1 и **не входят в список текущей фазы**
- Все методы `createNonInteractiveUI()` являются no-op: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` — все вызовы молча игнорируются

---

## 3. Общий объём изменений

В данной фазе задействовано 13 команд, разделённых по сложности реализации на четыре категории:

| Категория       | Команды                                          | Основные изменения                                                                                             |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Категория А** | `export`                                         | Только изменение `supportedModes`; все пути в action уже возвращают корректные типы                            |
| **Только инт.** | `plan`, `statusline`                             | Дизайн-решение: эти команды семантически тесно связаны с интерактивным интерфейсом; оставляем `supportedModes: ['interactive']` |
| **Категория А+** | `language`                                       | Изменение `supportedModes` + небольшая обработка non-interactive ветки                                         |
| **Только инт.** | `copy`, `restore`                                | Дизайн-решение: буфер обмена и восстановление снимков — по сути интерактивные операции; оставляем `supportedModes: ['interactive']` |
| **Категория А'** | `model`, `approval-mode`                         | Пути с параметрами уже возвращают `message`; пути без параметров требуют новой non-interactive ветки (сейчас вызывают dialog) |
| **Категория B** | `about`, `stats`, `insight`, `docs`, `clear`     | Все пути в action не возвращают значение или вызывают `addItem`/`clear`; требуется полная новая non-interactive ветка |

---

## 4. Категория A: Только изменение `supportedModes`

Во всех путях `action` этих команд уже возвращается `message` или `submit_prompt`, полностью без UI-зависимостей; `handleCommandResult` может обработать их напрямую.

### 4.1 `/export` (и подкоманды)

**Текущее состояние**: `supportedModes: ['interactive']`; все подкоманды возвращают `MessageActionReturn`.

**Изменение**: Изменить `supportedModes` родительской команды и всех четырёх подкоманд (`md`, `html`, `json`, `jsonl`) на `['interactive', 'non_interactive', 'acp']`.

**Содержимое ACP-сообщения**: существующее возвращаемое содержимое action уже содержит полный путь к файлу (например, `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), что удобно для использования в IDE; изменять текст не требуется.

> **Примечание**: Родительская команда `/export` сама не имеет `action`, только подкоманды. После изменения `supportedModes` родителя на все режимы `parseSlashCommand` сможет сопоставлять маршруты подкоманд, но если пользователь введёт только `/export` без подкоманды, `commandToExecute.action` будет undefined, `handleSlashCommand` вернёт `no_command`, и вызывающая сторона покажет подсказку с доступными подкомандами. Это ожидаемое поведение.

### 4.2 `/plan`

**Текущее состояние**: `supportedModes: ['interactive']`; все пути action возвращают `MessageActionReturn` или `SubmitPromptActionReturn`.

**Дизайн-решение**: `/plan` — команда для направления пользователя к многошаговому интерактивному планированию; семантически тесно связана с интерактивным интерфейсом. После обсуждения принято решение оставить `supportedModes: ['interactive']`, не расширять на non-interactive/acp.

### 4.3 `/statusline`

**Текущее состояние**: `supportedModes: ['interactive']`; action всегда возвращает `SubmitPromptActionReturn` (отправляет модели prompt для вызова subagent).

**Дизайн-решение**: `/statusline` — команда для запуска subagent для обобщения текущего состояния; семантически тесно связана с интерактивным интерфейсом. После обсуждения принято решение оставить `supportedModes: ['interactive']`, не расширять на non-interactive/acp.

---

## 5. Категория A+: Небольшая обработка non-interactive ветки

### 5.1 `/language`

**Текущее состояние**: Все пути action возвращают `MessageActionReturn` (чтение/установка языковых настроек).

**Побочные эффекты, требующие обработки**: `setUiLanguage()` вызывает `context.ui.reloadCommands()`, который в неинтерактивном UI уже является no-op; дополнительной обработки не требуется.

**Изменение**:

- Изменить `supportedModes` родительской команды и подкоманд (`ui`, `output`, а также динамически генерируемых подкоманд из `SUPPORTED_LANGUAGES`) на `['interactive', 'non_interactive', 'acp']`.
- В action не требуется добавлять ветвление по режиму; существующий возвращаемый текст уже пригоден для машинного потребления.

**Семантика ACP**: В non-interactive (однократный вызов) выполнение `/language ui zh-CN` изменит постоянные настройки (запись в файл settings); изменения вступят в силу для последующих сессий, а также i18n в текущей сессии применится немедленно. Это соответствует ожиданиям пользователя.

### 5.2 `/copy`

**Текущее состояние**: Action вызывает `copyToClipboard()`, что в среде ACP/headless может выбросить исключение или молча завершиться неудачей (буфер обмена недоступен).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Добавить новую ветвь по режиму внутри action:

```typescript
// Получение последнего AI-сообщения (существующая логика, можно переиспользовать)
if (context.executionMode !== 'interactive') {
  // Неинтерактивный/ACP: пропустить буфер обмена, вернуть само содержимое
  if (!lastAiOutput) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No output in history.',
    };
  }
  return {
    type: 'message',
    messageType: 'info',
    content: lastAiOutput,
  };
}
// Интерактивный путь: исходная логика с буфером обмена без изменений
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**Семантика ACP**: IDE получает исходный текст последнего вывода модели; может самостоятельно решить, копировать ли его в буфер обмена или показать пользователю.

### 5.3 `/restore`

**Текущее состояние**: `supportedModes: ['interactive']`.

**Дизайн-решение**: Восстановление снимка в дальнейшем приводит к повторному выполнению вызовов инструментов; семантически тесно связано с интерактивным интерфейсом. После обсуждения принято решение оставить `supportedModes: ['interactive']`, не расширять на non-interactive/acp.

**Семантика ACP**: Восстановление git-состояния checkpoint и установка истории gemini client выполняются как побочные эффекты; IDE после получения подтверждающего сообщения может уведомить пользователя «Состояние восстановлено». Повторное выполнение инструментов IDE решает, запускать ли самостоятельно.

---

## 6. Категория A': Обработка неинтерактивного пути для диалогов без параметров

### 6.1 `/model`

**Текущее состояние**:

| Ввод                              | Текущее поведение                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `/model` (без параметров)         | → `{ type: 'dialog', dialog: 'model' }` (в non-interactive становится unsupported)            |
| `/model <model-id>`               | Не реализовано (есть только ветка `--fast`)                                                   |
| `/model --fast` (без имени модели)| → `{ type: 'dialog', dialog: 'fast-model' }` (в non-interactive становится unsupported)       |
| `/model --fast <model-id>`        | → `MessageActionReturn` ✅                                                                     |

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Вставить ветвь non-interactive перед каждым путём, возвращающим dialog:

```typescript
// Путь без параметров (изначально возвращает dialog: 'model')
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentModel = config.getModel() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current model: ${currentModel}\nUse "/model <model-id>" to switch models.`,
    };
  }
  return { type: 'dialog', dialog: 'model' };
}

// Путь --fast без параметров (изначально возвращает dialog: 'fast-model')
if (args.startsWith('--fast') && !modelName) {
  if (context.executionMode !== 'interactive') {
    const fastModel = context.services.settings?.merged?.fastModel ?? 'not set';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current fast model: ${fastModel}\nUse "/model --fast <model-id>" to set fast model.`,
    };
  }
  return { type: 'dialog', dialog: 'fast-model' };
}
```

**Семантика ACP**: IDE отображает имя текущей модели для справки пользователя; переключение модели осуществляется вызовом с параметром (`/model <model-id>`).

> **Примечание**: В `/model <model-id>` (без `--fast`) в настоящее время не реализована логика установки модели текущей сессии — она есть только для `--fast <model-id>`. Если Фаза 2 должна поддерживать переключение основной модели в ACP, необходимо одновременно реализовать логику set для `/model <model-id>`. Данный проект оставляет этот путь зарезервированным, но помечает его как опцию Фазы 2; приоритет — обеспечить read-only путь «просмотр текущей модели».

### 6.2 `/approval-mode`

**Текущее состояние**:

| Ввод                            | Текущее поведение                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `/approval-mode` (без параметров)| → `{ type: 'dialog', dialog: 'approval-mode' }` (в non-interactive становится unsupported)    |
| `/approval-mode <mode>`         | → `MessageActionReturn` ✅                                                                     |
| `/approval-mode <invalid>`      | → `MessageActionReturn` (ошибка) ✅                                                           |

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Вставить ветвь non-interactive для пути без параметров (`!args.trim()`):

```typescript
if (!args.trim()) {
  if (context.executionMode !== 'interactive') {
    const currentMode = config?.getApprovalMode() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current approval mode: ${currentMode}\nAvailable modes: ${APPROVAL_MODES.join(', ')}\nUse "/approval-mode <mode>" to change.`,
    };
  }
  return { type: 'dialog', dialog: 'approval-mode' };
}
```

---

## 7. Категория B: Требуется полная non-interactive ветка

У этих пяти команд в интерактивном режиме action визуализирует React-компоненты через `context.ui.addItem()` или вызывает `context.ui.clear()`; возвращаемое значение — `void`. В non-interactive эти вызовы являются no-op, поэтому `handleSlashCommand` обработает отсутствие возвращаемого значения как `"Command executed successfully."`, без фактического вывода содержимого.

**Принцип реализации**: Проверить `executionMode` в **начале** action; при неинтерактивном режиме **досрочно вернуть** `message` с фактическим содержимым; интерактивный путь не трогать.

### 7.1 `/about` (altName: `status`)

**Источник данных**: `getExtendedSystemInfo(context)` возвращает `ExtendedSystemInfo`, содержащий: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Все поля доступны в non-interactive (context.services.config и settings уже внедрены).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. После вызова `getExtendedSystemInfo`, перед интерактивным путём, вставить ветвь по режиму:

```typescript
action: async (context) => {
  const systemInfo = await getExtendedSystemInfo(context);

  if (context.executionMode !== 'interactive') {
    const lines = [
      `Qwen Code v${systemInfo.cliVersion}`,
      `Model: ${systemInfo.modelVersion}`,
      `Fast Model: ${systemInfo.fastModel ?? 'not set'}`,
      `Auth: ${systemInfo.selectedAuthType}`,
      `Platform: ${systemInfo.osPlatform} ${systemInfo.osArch} (${systemInfo.osRelease})`,
      `Node.js: ${systemInfo.nodeVersion}`,
      `Session: ${systemInfo.sessionId}`,
      ...(systemInfo.gitCommit ? [`Git commit: ${systemInfo.gitCommit}`] : []),
      ...(systemInfo.ideClient ? [`IDE: ${systemInfo.ideClient}`] : []),
    ];
    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  }

  // Интерактивный путь: исходная логика addItem без изменений
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (и подкоманды `model`, `tools`)

**Источник данных**: `context.session.stats` (`SessionStatsState`) содержит `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. В non-interactive `sessionStartTime` — это момент текущего вызова; `metrics` берутся из `uiTelemetryService.getMetrics()` (значения, накопленные за текущий вызов, обычно нулевые); `promptCount` равен 1.

**Изменение**:

1. Изменить `supportedModes` родительской команды `stats` и подкоманд `model`, `tools` на `['interactive', 'non_interactive', 'acp']`.
2. Вставить ветвь по режиму в action родительской команды и каждой подкоманды с досрочным возвратом статистики в текстовом формате:

```typescript
// Основная команда /stats
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // Суммировать токены по всем моделям
    let totalPromptTokens = 0, totalCandidateTokens = 0, totalRequests = 0;
    for (const modelMetrics of Object.values(metrics.models)) {
      totalPromptTokens += modelMetrics.tokens.prompt;
      totalCandidateTokens += modelMetrics.tokens.candidates;
      totalRequests += modelMetrics.api.totalRequests;
    }

    const lines = [
      `Session duration: ${formatDuration(wallDuration)}`,
      `Prompts: ${promptCount}`,
      `API requests: ${totalRequests}`,
      `Tokens — prompt: ${totalPromptTokens}, output: ${totalCandidateTokens}`,
      `Tool calls: ${metrics.tools.totalCalls} (${metrics.tools.totalSuccess} ok, ${metrics.tools.totalFail} fail)`,
      `Files: +${metrics.files.totalLinesAdded} / -${metrics.files.totalLinesRemoved} lines`,
    ];
    return { type: 'message', messageType: 'info', content: lines.join('\n') };
  }

  // Интерактивный путь: исходная логика addItem без изменений
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Подкоманды `model` и `tools` также вставляют свои ветви по режиму, возвращая текстовую статистику по соответствующему измерению (model: по имени модели с указанием использованных токенов; tools: количество вызовов каждого инструмента).

**Пояснение**: При однократном вызове в non-interactive метрики обычно нулевые (новая сессия), но структура полна, что не влияет на формат. В ACP-сессии могут быть накопленные значения, имеющие смысл.

### 7.3 `/insight`

**Текущее состояние**: Action возвращает `void`, отображая прогресс и результат через `addItem`, затем вызывает `open(outputPath)` для открытия браузера. Основная логика — `insightGenerator.generateStaticInsight()` для генерации HTML-файла.

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Разветвление по `executionMode` на три пути:
   - `non_interactive`: синхронная генерация, без колбэков прогресса, без открытия браузера, напрямую возвращает `message` (путь к файлу)
   - `acp`: асинхронный запуск генерации, передача прогресса через `stream_messages` (`encodeInsightProgressMessage`) и завершение (`encodeInsightReadyMessage`) в IDE
   - `interactive`: исходная логика `addItem` + `setPendingItem` + `open()` без изменений

```typescript
// non_interactive путь
if (context.executionMode === 'non_interactive') {
  const outputPath = await insightGenerator.generateStaticInsight(
    projectsDir,
    () => {}, // no-op progress
  );
  return {
    type: 'message',
    messageType: 'info',
    content: t('Insight report generated at: {{path}}', { path: outputPath }),
  };
}

// acp путь: stream_messages
if (context.executionMode === 'acp') {
  // ... построить async generator streamMessages, yield encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive путь: исходная реализация без изменений
```

**Обоснование**: Режим `non_interactive` (конвейер CLI) не поддерживает `stream_messages`, может вернуть только одно `message`; режим ACP (плагин IDE) может потреблять `stream_messages` и отображать прогресс в реальном времени, поэтому для него сохраняется streaming-путь.

**Формат ACP-сообщения**: `encodeInsightProgressMessage(stage, progress, detail?)` создаёт сообщение с прогресс-баром, которое может быть интерпретировано IDE; `encodeInsightReadyMessage(outputPath)` уведомляет IDE, что файл готов, IDE решает, как отобразить ссылку.

### 7.4 `/docs`

**Текущее состояние**: Action возвращает `void`, отображая сообщение через `addItem` и открывая браузер через `open(docsUrl)`. Существует ветвь по переменной окружения `SANDBOX` (в песочнице только addItem, без открытия браузера).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Изменить возвращаемый тип action на `Promise<void | MessageActionReturn>`.
3. Вставить ветвь non-interactive в начале action:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // Неинтерактивный/ACP: напрямую вернуть URL, не открывать браузер, не вызывать addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // interactive путь: исходная проверка SANDBOX + addItem + open() без изменений
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Текущее состояние**: Action выполняет следующие операции и возвращает `void`:

1. `config.getHookSystem()?.fireSessionEndEvent()` — запуск хука (побочный эффект)
2. `config.startNewSession()` — запуск новой сессии (побочный эффект)
3. `uiTelemetryService.reset()` — сброс счётчиков телеметрии (побочный эффект)
4. `skillTool.clearLoadedSkills()` — очистка кэша скиллов (побочный эффект)
5. `context.ui.clear()` — очистка UI терминала (**побочный эффект UI; в non-interactive — no-op**)
6. `geminiClient.resetChat()` — сброс истории чата (побочный эффект)
7. `config.getHookSystem()?.fireSessionStartEvent()` — запуск хука (побочный эффект)

**Анализ семантики в non-interactive/ACP**:

- `ui.clear()` в non-interactive уже является no-op, дополнительной обработки не требуется
- `geminiClient.resetChat()`: в ACP-сессии — осмысленный побочный эффект (очистка истории чата); должен быть сохранён. При однократном вызове в non-interactive каждый вызов — это новая сессия, `resetChat` семантически избыточен, но безвреден.
- `config.startNewSession()`: в ACP имеет смысл (начало нового ID сессии); в non-interactive также избыточен, но безвреден.
- `fireSessionEndEvent` / `fireSessionStartEvent`: в ACP имеют смысл (запуск хуков).

**Решение**: Для non-interactive/ACP пути сохранить все осмысленные побочные эффекты (resetChat, startNewSession, hook events), пропустить только `ui.clear()` (уже no-op) и вернуть сообщение-метку границы контекста.

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Изменить возвращаемый тип action на `Promise<void | MessageActionReturn>`.
3. Внутри action, после (или вместо) вызова `context.ui.clear()`, разветвление по режиму:

```typescript
action: async (context, _args) => {
  const { config } = context.services;

  if (config) {
    config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Clear).catch(...);

    const newSessionId = config.startNewSession();
    uiTelemetryService.reset();

    const skillTool = config.getToolRegistry()?.getAllTools().find(...);
    if (skillTool instanceof SkillTool) skillTool.clearLoadedSkills();

    if (newSessionId && context.session.startNewSession) {
      context.session.startNewSession(newSessionId);
    }

    // ui.clear() в неинтерактивном режиме уже no-op, но мы всё равно вызываем (условие не нужно)
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // Определить возвращаемое значение в зависимости от режима
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // interactive путь: void (ничего не возвращаем, React UI обновляется через ui.clear())
},
```

**Семантика ACP**: IDE, получив метку границы контекста, может отобразить её как разделитель сессии (например, подсказку «Новый сеанс») и очистить локальный кэш истории чата.

---

## 8. Изменения в `handleCommandResult`

**Вывод**: Изменения не требуются.

После изменений в Фазе 2 для всех команд в non-interactive/ACP пути возвращаемые типы будут `message` или `submit_prompt`, которые уже корректно обрабатываются в switch операторе `handleCommandResult`.

---

## 9. Изменения в `createNonInteractiveUI()`

**Вывод**: Изменения не требуются.

Текущей no-op реализации достаточно. `addItem`, `clear`, `setPendingItem` и т.д. (no-op) не будут вызываться в non-interactive путях команд категории B (из-за досрочного return); на интерактивные пути это не влияет.

---

## 10. Фаза 2.2: Реализация вызова модели для prompt command

В Фазе 1 уже реализован `CommandService.getModelInvocableCommands()`; `BundledSkillLoader`, `FileCommandLoader` (пользовательские/проектные команды), `McpPromptLoader` уже устанавливают `modelInvocable: true`.

Задача Фазы 2.2 — перевести `SkillTool` с использования только `SkillManager.listSkills()` на одновременное использование `CommandService.getModelInvocableCommands()`, унифицировав точку входа для вызываемых моделью команд.

**Файл изменений**: `packages/core/src/tools/SkillTool.ts` (или соответствующий путь)

**Конкретные изменения**:

1. `SkillTool` при инициализации получает `CommandService` (или результат его `getModelInvocableCommands()`) через dependency injection
2. При построении tool description объединяет результаты `listSkills()` и `getModelInvocableCommands()`
3. Гарантирует, что built-in команды (`modelInvocable: false`) не попадают в tool description

> **Примечание**: Конкретная реализация `SkillTool` зависит от внутренней архитектуры `packages/core`; в данном документе описываются только изменения интерфейса; детали реализации следует определять с учётом существующей структуры core-пакета.

---

## 11. Фаза 2.3: Обнаружение slash command в середине ввода (базовая версия)

В компоненте `InputPrompt` обнаружить токен slash рядом с курсором (не обязательно в начале строки) и вызвать меню автодополнения.

**Правило обнаружения**:

- Если перед курсором есть токен, начинающийся с `/` и не содержащий пробелов, запускать автодополнение команды
- Кандидаты для дополнения берутся из списка видимых команд `getCommandsForMode('interactive')`
- Меню дополнения отображает имя команды + описание (без argumentHint и т.д.; это будет добавлено в Фазе 3)

> Данная функциональность относится к изменениям UI-уровня и является независимой подзадачей Фазы 2.3, не влияющей на реализацию Фаз 2.1/2.2.

---

## 12. Общий перечень файловых изменений

### 12.1 Изменения в файлах команд (Фаза 2.1)

| Файл                     | Тип изменения | Подробности                                                                                                                            |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `exportCommand.ts`       | Категория A   | Родительская команда + 4 подкоманды: `supportedModes` → все режимы                                                                     |
| `planCommand.ts`         | Только инт.   | Дизайн-решение: оставлено `supportedModes: ['interactive']`, без изменений                                                             |
| `statuslineCommand.ts`   | Только инт.   | Дизайн-решение: оставлено `supportedModes: ['interactive']`, без изменений                                                             |
| `languageCommand.ts`     | Категория A+  | Родительская команда + подкоманды `ui`/`output` + динамические подкоманды языка: `supportedModes` → все режимы                         |
| `copyCommand.ts`         | Только инт.   | Дизайн-решение: оставлено `supportedModes: ['interactive']`, без изменений                                                             |
| `restoreCommand.ts`      | Только инт.   | Дизайн-решение: оставлено `supportedModes: ['interactive']`, без изменений                                                             |
| `modelCommand.ts`        | Категория A'  | `supportedModes` → все режимы + добавлена неинтерактивная ветвь для пути без параметров / без fast model                               |
| `approvalModeCommand.ts` | Категория A'  | `supportedModes` → все режимы + добавлена неинтерактивная ветвь для пути без параметров                                                |
| `aboutCommand.ts`        | Категория B   | `supportedModes` → все режимы + неинтерактивный путь возвращает `message` (версия/модель/сводка окружения)                             |
| `statsCommand.ts`        | Категория B   | `supportedModes` → все режимы + неинтерактивный путь возвращает `message` (текст статистики); подкоманды обработаны синхронно         |
| `insightCommand.ts`      | Категория B   | `supportedModes` → все режимы + `non_interactive` путь — синхронная генерация, возвращает `message` (путь к файлу); `acp` путь — возвращает `stream_messages` с прогрессом |
| `docsCommand.ts`         | Категория B   | `supportedModes` → все режимы + неинтерактивный путь возвращает `message` (URL документации), без открытия браузера                      |
| `clearCommand.ts`        | Категория B   | `supportedModes` → все режимы + в конце action в зависимости от режима возвращает `message` или `void`                                  |
### 12.2 Изменения в других файлах

| Файл                                                | Описание изменений                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Phase 2.2: интеграция `getModelInvocableCommands()` (детали будут уточнены) |
| `packages/cli/src/ui/InputPrompt.tsx` (или эквивалент) | Phase 2.3: логика обнаружения слэша в середине ввода                     |

### 12.3 Неизменяемые файлы

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` не требуют изменений)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (заглушка UI не требует изменений)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` не требуют изменений)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` уже реализованы в Phase 1)

---

## 13. Стратегия тестирования

### 13.1 Модульные тесты команд

Для каждой изменённой команды создайте или обновите файлы тестов (`*.test.ts`) в той же директории, покрывающие следующие кейсы:

**Команды класса A/A+** (`export`, `language`):

- `supportedModes` корректно содержит `non_interactive` и `acp`
- В режиме `executionMode: 'non_interactive'` action возвращает `MessageActionReturn` или `SubmitPromptActionReturn`, не вызывая `ui.addItem` или `ui.clear`
- Поведение в интерактивном режиме полностью соответствует состоянию до рефакторинга (snapshot-тестирование)

**Команды только для интерактивного режима** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` равно `['interactive']` — это архитектурное решение
- Проверить, что при выполнении в non-interactive режиме корректно возвращается `unsupported`

**Команды класса A'** (`model`, `approval-mode`):

- Без аргументов + `executionMode: 'non_interactive'` → возвращает сообщение о текущем состоянии (`message`), не возвращает `dialog`
- С аргументами + `executionMode: 'non_interactive'` → существующая логика `message` выполняется корректно
- Интерактивный режим: без аргументов → `dialog`, с аргументами → `message` (без изменений)

**Команды класса B** (`about`, `stats`, `insight`, `docs`, `clear`):

- В режиме `executionMode: 'non_interactive'` action возвращает `MessageActionReturn`, не вызывая никаких методов `ui.*`
- Возвращаемая строка `content` содержит ожидаемые ключевые поля (номер версии, имя модели, URL и т.д.)
- Интерактивный режим: вызывается `ui.addItem`, action возвращает `void` (без изменений)

**Особый случай `clear`**:

- В режиме `executionMode: 'non_interactive'` всё ещё вызывается `geminiClient.resetChat()` (побочный эффект сохраняется)
- Возвращается граничное сообщение (`message`) с содержимым `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Интеграционные тесты (`handleSlashCommand`)

В файле `nonInteractiveCli.test.ts` или новом файле интеграционных тестов:

- `handleSlashCommand('/about', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит номер версии }`
- `handleSlashCommand('/stats', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит 'Session duration' }`
- `handleSlashCommand('/docs', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` в non-interactive режиме возвращает `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` в non-interactive режиме возвращает `unsupported` (команда только для интерактивного режима)
- Существующие команды non-interactive (`btw`, `bug` и т.д.) не деградируют

### 13.3 Тесты `commandUtils`

В файле `commandUtils.test.ts` добавляются (или существующие тесты продолжают покрывать):

- Все расширенные команды (`export`, `language` и т.д.) проходят фильтрацию `filterCommandsForMode(commands, 'non_interactive')` и `filterCommandsForMode(commands, 'acp')`
- Команды только для интерактивного режима (`plan`, `statusline`, `copy`, `restore`) корректно отфильтровываются при вызове `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Анализ влияния на поведение

| Сценарий                                    | Поведение до Phase 2                                         | Поведение после Phase 2              | Характер                 |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ------------------------ |
| non-interactive: `/export md`                | ❌ unsupported (отфильтрована)                                | ✅ возвращает message с путём файла  | Расширение возможностей  |
| non-interactive: `/plan <task>`              | ❌ unsupported                                               | ❌ unsupported (решение: только интерактив) | Без изменений           |
| non-interactive: `/statusline`               | ❌ unsupported                                               | ❌ unsupported (решение: только интерактив) | Без изменений           |
| non-interactive: `/language ui zh-CN`        | ❌ unsupported                                               | ✅ устанавливает язык, возвращает подтверждение | Расширение возможностей |
| non-interactive: `/copy`                     | ❌ unsupported                                               | ❌ unsupported (решение: только интерактив) | Без изменений           |
| non-interactive: `/restore` (без аргументов)  | ❌ unsupported                                               | ❌ unsupported (решение: только интерактив) | Без изменений           |
| non-interactive: `/restore <id>`             | ❌ unsupported                                               | ❌ unsupported (решение: только интерактив) | Без изменений           |
| non-interactive: `/model`                    | ❌ unsupported (dialog)                                      | ✅ возвращает имя текущей модели      | Расширение возможностей  |
| non-interactive: `/model <id>`               | ❌ unsupported                                               | 🔄 Phase 2 опционально: реализовать логику переключения | Расширение возможностей (опционально) |
| non-interactive: `/approval-mode`            | ❌ unsupported (dialog)                                      | ✅ возвращает текущий режим одобрения | Расширение возможностей  |
| non-interactive: `/approval-mode yolo`       | ❌ unsupported                                               | ✅ устанавливает режим, возвращает подтверждение | Расширение возможностей |
| non-interactive: `/about`                    | ❌ возвращает "Command executed successfully." (addItem no-op) | ✅ возвращает сводку: версия/модель/окружение | Исправление бага + расширение |
| non-interactive: `/stats`                    | ❌ возвращает "Command executed successfully."               | ✅ возвращает статистику сессии       | Исправление бага + расширение |
| non-interactive: `/insight`                  | ❌ возвращает "Command executed successfully." (создаётся, но нет вывода) | ✅ создаёт и возвращает путь к файлу | Исправление бага + расширение |
| non-interactive: `/docs`                     | ❌ возвращает "Command executed successfully."               | ✅ возвращает URL документации        | Исправление бага + расширение |
| non-interactive: `/clear`                    | ❌ возвращает "Command executed successfully."               | ✅ возвращает граничное сообщение контекста | Исправление бага + расширение |
| Интерактивный режим: любая из команд         | ✅ существующее поведение                                    | ✅ существующее поведение (нулевая деградация) | Без изменений           |

---

## 15. Порядок реализации

Рекомендуется реализовывать в указанном порядке; каждая группа может быть закоммичена и проверена независимо:

**Пакет 1** (~30 мин): Класс A — только изменение `supportedModes`

Изменить `exportCommand.ts` (и его подкоманды), убедиться, что тесты проходят.

**Пакет 2** (~45 мин): Класс A+ — небольшое количество ветвлений

Изменить `languageCommand.ts`, добавить ветвь для неинтерактивного режима в путях с побочными эффектами, обновить соответствующие тесты. (`copyCommand.ts` и `restoreCommand.ts` после обсуждения остаются только для интерактивного режима.)

**Пакет 3** (~45 мин): Класс A' — пути dialog

Изменить `modelCommand.ts`, `approvalModeCommand.ts`, добавить ветвь для неинтерактивного режима в путях без аргументов, обновить соответствующие тесты.

**Пакет 4** (~1.5 ч): Класс B — полные ветви

Изменить `aboutCommand.ts`, `statsCommand.ts` (включая подкоманды), `docsCommand.ts`.

**Пакет 5** (~1 ч): Особые команды класса B — `insightCommand.ts`, `clearCommand.ts`

У этих команд много побочных эффектов, выделить в отдельный коммит, обновить соответствующие тесты и интеграционные тесты.

**Пакет 6** (~2 ч): Phase 2.2 — интеграция вызова модели с prompt command

Изменить `SkillTool`, подключить `getModelInvocableCommands()`, обновить тесты SkillTool.

**Пакет 7** (~2 ч): Phase 2.3 — обнаружение слэша в середине ввода

Изменить компонент `InputPrompt`, добавить логику триггера автодополнения и UI-тесты.

**Пакет 8** (~30 мин): Полное тестирование + проверка типов

Запустить `npm run typecheck`, `cd packages/cli && npx vitest run`, исправить оставшиеся проблемы.

---

## 16. Чек-лист приёмки

**Phase 2.1 — Расширение команд**

- [ ] Класс A: `/export` (и подкоманды), `/plan`, `/statusline` корректно выполняются в режимах non-interactive и acp и возвращают осмысленный вывод
- [ ] Класс A+: `/language` (и подкоманды) корректно выполняются в non-interactive режиме, сохраняют настройки
- [ ] Класс A+: `/copy` в non-interactive/acp режиме возвращает последний выведенный AI текст (не взаимодействует с буфером обмена)
- [ ] Класс A+: `/restore` без аргументов в non-interactive режиме возвращает список контрольных точек; с аргументом восстанавливает состояние и возвращает подтверждающее сообщение (не возвращает `type: 'tool'`)
- [ ] Класс A': `/model` без аргументов в non-interactive/acp режиме возвращает имя текущей модели (не открывает dialog); `/model --fast <id>` корректно устанавливает
- [ ] Класс A': `/approval-mode` без аргументов в non-interactive/acp режиме возвращает текущий режим (не открывает dialog); с аргументом корректно устанавливает
- [ ] Класс B: `/about` в non-interactive/acp режиме возвращает текстовую сводку, содержащую номер версии и имя модели
- [ ] Класс B: `/stats` (включая подкоманды) в non-interactive/acp режиме возвращает текстовую статистику
- [ ] Класс B: `/insight` в non-interactive/acp режиме создаёт файл insight и возвращает путь к файлу (не открывает браузер)
- [ ] Класс B: `/docs` в non-interactive/acp режиме возвращает URL документации (не открывает браузер)
- [ ] Класс B: `/clear` в non-interactive/acp режиме возвращает граничное сообщение контекста, `geminiClient.resetChat()` выполняется корректно
- [ ] Все 13 команд в интерактивном режиме ведут себя полностью так же, как до рефакторинга (нулевая деградация)
- [ ] Компиляция TypeScript без ошибок (`npm run typecheck`)
- [ ] `npm run lint` без новых ошибок
- [ ] Все существующие тесты проходят (`cd packages/cli && npx vitest run`)

**Phase 2.2 — Вызов модели**

- [ ] Модель может вызывать через `SkillTool` bundled skill, file command (пользовательские/проектные), MCP prompt
- [ ] Модель не может вызывать built-in commands
- [ ] Описание инструмента `SkillTool` содержит имена и описания всех команд с флагом `modelInvocable: true`

**Phase 2.3 — Слэш в середине ввода**

- [ ] При вводе `/` в середине текста в поле ввода появляется меню автодополнения команд (не только в начале строки)
- [ ] В меню автодополнения отображаются имя команды и описание
- [ ] После выбора команды она корректно вставляется в поле ввода