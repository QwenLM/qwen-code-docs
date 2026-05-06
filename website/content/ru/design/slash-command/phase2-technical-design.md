# Технический дизайн-документ Phase 2: Расширение возможностей

## 1. Цели и ограничения дизайна

### 1.1 Цели

- Расширить `supportedModes` для 13 встроенных команд, включив `non_interactive` и/или `acp`
- Гарантировать, что каждая расширенная команда возвращает текстовый контент, пригодный для потребления IDE, в путях ACP/non-interactive
- Настроить вызов моделей для prompt-команд (`SkillTool` потребляет `getModelInvocableCommands()`)
- Реализовать базовое обнаружение mid-input slash-команд

### 1.2 Жесткие ограничения

- **Нулевая регрессия в interactive пути**: Существующее поведение всех расширенных команд в interactive режиме остается строго неизменным. Новые ветки по режиму добавляются только внутри `action`, код interactive пути не затрагивается.
- **Стратегия реализации: ветвление по режиму, а не двойная регистрация**: Для всех 13 команд используется добавление проверки `executionMode` внутри `action`. Режим двойной регистрации, описанный в §10.2 дизайн-документа Phase 1, не применяется (он необходим только при кардинальных различиях логики interactive и non-interactive, что не соответствует сложности команд на данном этапе).
- **Формат сообщений ACP**: Текстовый контент, возвращаемый в пути ACP, не содержит ANSI-стилей и должен быть в формате Markdown или plain text, ориентированным на потребление плагинами IDE.
- **Пропуск побочных эффектов, связанных с окружением**: Операции, зависящие от графического окружения, такие как открытие браузера (`open()`) или работа с буфером обмена (`copyToClipboard()`), должны быть пропущены в путях non-interactive/ACP.

---

## 2. Базовое состояние после завершения Phase 1

Ключевые архитектурные моменты после Phase 1 (Phase 2 расширяет их напрямую):

- Поле `commandType` удалено из интерфейса `SlashCommand`, все команды используют явный `supportedModes`
- `getEffectiveSupportedModes()` использует двухуровневый вывод: явный `supportedModes` → fallback на `CommandKind`
- `CommandService.getCommandsForMode(mode)` заменяет старый белый список `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- `btw`, `bug`, `compress`, `context`, `init`, `summary` уже расширены до всех режимов в Phase 1 и **не входят в список данного этапа**
- Все методы в `createNonInteractiveUI()` являются no-op: `addItem`, `clear`, `setDebugMessage`, `setPendingItem`, `reloadCommands` молча игнорируют вызовы

---

## 3. Обзор области изменений

На данном этапе затрагивается 13 команд, разделенных на четыре категории по сложности реализации:

| Категория       | Команды                                         | Ключевые изменения                                                                             |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Категория A**   | `export`                                     | Изменяется только `supportedModes`, все пути `action` уже возвращают допустимые типы                                 |
| **Только interactive** | `plan`, `statusline`                         | Решение по дизайну: семантика этих команд тесно связана с интерактивным интерфейсом, оставляем `supportedModes: ['interactive']` |
| **Категория A+**  | `language`                                   | Изменение `supportedModes` + небольшая обработка ветки non-interactive                                  |
| **Только interactive** | `copy`, `restore`                            | Решение по дизайну: работа с буфером обмена и восстановление снапшотов по сути являются интерактивными операциями, оставляем `supportedModes: ['interactive']`   |
| **Категория A'**  | `model`, `approval-mode`                     | Пути с аргументами уже возвращают `message`, пути без аргументов требуют новой ветки non-interactive (сейчас вызывают dialog)   |
| **Категория B**   | `about`, `stats`, `insight`, `docs`, `clear` | Все пути `action` не возвращают значений или вызывают `addItem`/`clear`, требуется полная новая ветка non-interactive   |

---

## 4. Категория A: Изменение только `supportedModes`

Все пути `action` этих команд уже возвращают `message` или `submit_prompt`, полностью независимы от UI, и `handleCommandResult` может обработать их напрямую.

### 4.1 `/export` (и подкоманды)

**Текущее состояние**: `supportedModes: ['interactive']`, все подкоманды `action` возвращают `MessageActionReturn`.

**Изменение**: Изменить `supportedModes` для родительской команды и всех четырех подкоманд (`md`, `html`, `json`, `jsonl`) на `['interactive', 'non_interactive', 'acp']`.

**Содержимое сообщения ACP**: Текущий возвращаемый контент уже содержит полный путь к файлу (например, `Session exported to markdown: qwen-export-2024-01-01T12-00-00.md`), что удобно для IDE, изменения текста не требуются.

> **Примечание**: У родительской команды `/export` нет собственного `action`, только подкоманды. После изменения `supportedModes` на все режимы, `parseSlashCommand` сможет маршрутизировать подкоманды. Если пользователь введет только `/export` без подкоманды, `commandToExecute.action` будет `undefined`, `handleSlashCommand` вернет `no_command`, и вызывающая сторона отобразит подсказку с доступными подкомандами. Это ожидаемое поведение.

### 4.2 `/plan`

**Текущее состояние**: `supportedModes: ['interactive']`, все пути `action` возвращают `MessageActionReturn` или `SubmitPromptActionReturn`.

**Решение по дизайну**: `/plan` — это команда для руководства пользователя в процессе многошагового интерактивного планирования, ее семантика тесно связана с интерактивным интерфейсом. После обсуждения решено оставить `supportedModes: ['interactive']`, не расширяя до режимов non-interactive/acp.

### 4.3 `/statusline`

**Текущее состояние**: `supportedModes: ['interactive']`, `action` всегда возвращает `SubmitPromptActionReturn` (передает prompt вызова subagent модели).

**Решение по дизайну**: `/statusline` — это команда для запуска subagent с целью суммирования текущего состояния, ее семантика тесно связана с интерактивным интерфейсом. После обсуждения решено оставить `supportedModes: ['interactive']`, не расширяя до режимов non-interactive/acp.

---

## 5. Категория A+: Небольшая обработка ветки non-interactive

### 5.1 `/language`

**Текущее состояние**: Все пути `action` возвращают `MessageActionReturn` (чтение/установка настроек языка).

**Побочные эффекты для обработки**: `setUiLanguage()` вызывает `context.ui.reloadCommands()`, что в non-interactive UI уже является no-op, дополнительной обработки не требуется.

**Изменение**:

- Изменить `supportedModes` для родительской команды и подкоманд (`ui`, `output`, а также динамически генерируемых подкоманд `SUPPORTED_LANGUAGES`) на `['interactive', 'non_interactive', 'acp']`.
- В `action` не требуется добавлять ветвление по режиму, текущий возвращаемый текст уже подходит для машинного потребления.

**Семантика ACP**: Выполнение `/language ui zh-CN` в non-interactive (одиночный вызов) изменит персистентные настройки (запись в файл settings), что повлияет на последующие сессии, а i18n применится немедленно в текущей сессии. Это соответствует ожиданиям пользователя.

### 5.2 `/copy`

**Текущее состояние**: `action` вызывает `copyToClipboard()`, что в среде ACP/headless может вызвать исключение или молча завершиться ошибкой (буфер обмена недоступен).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Добавить ветвление по режиму внутри `action`:

```typescript
// 获取 last AI message（现有逻辑，可复用）
if (context.executionMode !== 'interactive') {
  // 非交互/ACP：跳过剪贴板，返回内容本身
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
// interactive 路径：原有剪贴板逻辑不变
await copyToClipboard(lastAiOutput);
return {
  type: 'message',
  messageType: 'info',
  content: 'Last output copied to the clipboard',
};
```

**Семантика ACP**: IDE получает исходный текст последнего вывода модели и может самостоятельно решить, записать ли его в буфер обмена или показать пользователю.

### 5.3 `/restore`

**Текущее состояние**: `supportedModes: ['interactive']`.

**Решение по дизайну**: Восстановление снапшота подразумевает повторное выполнение вызовов инструментов, что семантически тесно связано с интерактивным интерфейсом. После обсуждения решено оставить `supportedModes: ['interactive']`, не расширяя до режимов non-interactive/acp.

**Семантика ACP**: Восстановление git-состояния checkpoint и настройка истории gemini client выполняются как побочные эффекты; после получения подтверждающего сообщения IDE может уведомить пользователя "Состояние восстановлено", а повторное выполнение инструментов остается на решение IDE.

---

## 6. Категория A': Обработка non-interactive для путей без аргументов (dialog)

### 6.1 `/model`

**Текущее состояние**:

| Ввод                             | Текущее поведение                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `/model` (без аргументов)               | → `{ type: 'dialog', dialog: 'model' }` (в non-interactive становится unsupported)      |
| `/model <model-id>`              | Не реализовано (только ветка `--fast`)                                                     |
| `/model --fast` (без имени модели) | → `{ type: 'dialog', dialog: 'fast-model' }` (в non-interactive становится unsupported) |
| `/model --fast <model-id>`       | → `MessageActionReturn` ✅                                                       |

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Вставить ветку non-interactive перед каждым путем dialog внутри `action`:

```typescript
// 无参数路径（原返回 dialog: 'model'）
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

// --fast 无参数路径（原返回 dialog: 'fast-model'）
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

**Семантика ACP**: IDE отображает текущее имя модели для справки; переключение модели осуществляется через вызов с аргументами (`/model <model-id>`).

> **Примечание**: `/model <model-id>` (без `--fast`) в настоящее время не реализует логику установки модели для текущей сессии, это есть только у `--fast <model-id>`. Если Phase 2 должен поддерживать переключение основной модели в ACP, потребуется синхронно реализовать логику set для `/model <model-id>`. В данном дизайне этот путь зарезервирован, но помечен как опциональный для Phase 2, приоритет отдается read-only пути "просмотр текущей модели".

### 6.2 `/approval-mode`

**Текущее состояние**:

| Ввод                       | Текущее поведение                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/approval-mode` (без аргументов) | → `{ type: 'dialog', dialog: 'approval-mode' }` (в non-interactive становится unsupported) |
| `/approval-mode <mode>`    | → `MessageActionReturn` ✅                                                          |
| `/approval-mode <invalid>` | → `MessageActionReturn` (error) ✅                                                  |

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Вставить ветку non-interactive в путь без аргументов (`!args.trim()`):

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

## 7. Категория B: Требуется полная ветка non-interactive

`action` этих пяти команд в interactive режиме рендерит React-компоненты через `context.ui.addItem()` или вызывает `context.ui.clear()`, возвращая `void`. В non-interactive эти вызовы являются no-op, из-за чего `handleSlashCommand` обрабатывает отсутствие возвращаемого значения как `"Command executed successfully."`, не выводя фактического контента.

**Принцип реализации**: Проверять `executionMode` в **начале** `action`. В non-interactive режиме **возвращать заранее** `message` с фактическим контентом. Код interactive пути не затрагивается вообще.

### 7.1 `/about` (altName: `status`)

**Источник данных**: `getExtendedSystemInfo(context)` возвращает `ExtendedSystemInfo`, содержащий: `cliVersion`, `osPlatform`, `osArch`, `osRelease`, `nodeVersion`, `modelVersion`, `selectedAuthType`, `ideClient`, `sessionId`, `memoryUsage`, `baseUrl`, `apiKeyEnvKey`, `gitCommit`, `fastModel`. Все поля доступны в non-interactive (context.services.config и settings уже инжектированы).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. После вызова `getExtendedSystemInfo`, перед interactive путем, вставить ветвление по режиму:

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

  // interactive 路径：原有 addItem 逻辑不变
  const aboutItem: Omit<HistoryItemAbout, 'id'> = { type: MessageType.ABOUT, systemInfo };
  context.ui.addItem(aboutItem, Date.now());
},
```

### 7.2 `/stats` (и подкоманды `model`, `tools`)

**Источник данных**: `context.session.stats` (`SessionStatsState`) содержит `sessionStartTime`, `metrics` (`SessionMetrics`: `models`, `tools`, `files`), `promptCount`. В non-interactive `sessionStartTime` соответствует моменту текущего вызова, `metrics` берутся из `uiTelemetryService.getMetrics()` (накопленные значения для текущего вызова, обычно ноль), `promptCount` равен 1.

**Изменение**:

1. Изменить `supportedModes` для родительской команды `stats` и подкоманд `model`, `tools` на `['interactive', 'non_interactive', 'acp']`.
2. В `action` родительской команды и каждой подкоманды вставить ветвление по режиму для раннего возврата текстовой статистики:

```typescript
// /stats 主命令
action: (context) => {
  if (context.executionMode !== 'interactive') {
    const now = new Date();
    const { sessionStartTime, promptCount, metrics } = context.session.stats;
    if (!sessionStartTime) {
      return { type: 'message', messageType: 'error', content: 'Session start time unavailable.' };
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    // 汇总所有 model 的 token 数
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

  // interactive 路径：原有 addItem 逻辑不变
  const statsItem: HistoryItemStats = { type: MessageType.STATS, duration: formatDuration(wallDuration) };
  context.ui.addItem(statsItem, Date.now());
},
```

Подкоманды `model` и `tools` также получают свои ветки по режиму, возвращая текстовую статистику по соответствующим измерениям (по моделям — расход токенов по имени модели; по инструментам — количество вызовов каждого tool).

**Примечание**: В одиночном non-interactive вызове метрики обычно равны нулю (новая сессия), но структура сохраняется, что не влияет на формат. В ACP-сессиях могут быть накопленные значения, имеющие практический смысл.

### 7.3 `/insight`

**Текущее состояние**: `action` возвращает `void`, отображает прогресс и результат через `addItem`, в конце вызывает `open(outputPath)` для открытия браузера. Основная логика — генерация HTML-файла через `insightGenerator.generateStaticInsight()`.

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Трехстороннее ветвление по `executionMode`:
   - `non_interactive`: синхронная генерация, игнорирование колбэков прогресса, браузер не открывается, прямой возврат `message` (путь к файлу)
   - `acp`: асинхронный запуск генерации, отправка прогресса (`encodeInsightProgressMessage`) и завершения (`encodeInsightReadyMessage`) в IDE через `stream_messages`
   - `interactive`: исходная логика `addItem` + `setPendingItem` + `open()` без изменений

```typescript
// non_interactive 路径
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

// acp 路径：stream_messages
if (context.executionMode === 'acp') {
  // ... 构造 streamMessages async generator，yield encodeInsightProgressMessage / encodeInsightReadyMessage ...
  return { type: 'stream_messages', messages: streamMessages() };
}

// interactive 路径：原有实现不变
```

**Обоснование дизайна**: Режим `non_interactive` (CLI pipeline) не поддерживает `stream_messages`, поэтому может возвращать только одно `message`; режим ACP (плагин IDE) способен потреблять `stream_messages` и отображать прогресс в реальном времени, поэтому для него сохраняется streaming-путь.

**Формат сообщений ACP**: `encodeInsightProgressMessage(stage, progress, detail?)` генерирует сообщение о прогрессе, парсируемое IDE; `encodeInsightReadyMessage(outputPath)` уведомляет IDE о готовности файла, после чего IDE решает, как отобразить ссылку.

### 7.4 `/docs`

**Текущее состояние**: `action` возвращает `void`, отображает сообщение через `addItem` и вызывает `open(docsUrl)` для открытия браузера. Есть ветка по переменной окружения `SANDBOX` (в песочнице только `addItem`, браузер не открывается).

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Изменить тип возвращаемого значения `action` на `Promise<void | MessageActionReturn>`.
3. Вставить ветку non-interactive в начало `action`:

```typescript
action: async (context) => {
  const langPath = getCurrentLanguage()?.startsWith('zh') ? 'zh' : 'en';
  const docsUrl = `https://qwenlm.github.io/qwen-code-docs/${langPath}`;

  if (context.executionMode !== 'interactive') {
    // 非交互/ACP：直接返回 URL，不打开浏览器，不调用 addItem
    return {
      type: 'message',
      messageType: 'info',
      content: `Qwen Code documentation: ${docsUrl}`,
    };
  }

  // interactive 路径：原有 SANDBOX 判断 + addItem + open() 不变
  if (process.env['SANDBOX'] && ...) {
    context.ui.addItem(...);
  } else {
    context.ui.addItem(...);
    await open(docsUrl);
  }
},
```

### 7.5 `/clear` (altNames: `reset`, `new`)

**Текущее состояние**: `action` выполняет следующие операции и возвращает `void`:

1. `config.getHookSystem()?.fireSessionEndEvent()` — вызов hook (побочный эффект)
2. `config.startNewSession()` — запуск нового session ID (побочный эффект)
3. `uiTelemetryService.reset()` — сброс счетчиков telemetry (побочный эффект)
4. `skillTool.clearLoadedSkills()` — очистка кэша skill (побочный эффект)
5. `context.ui.clear()` — очистка терминального UI (**UI побочный эффект, в non-interactive является no-op**)
6. `geminiClient.resetChat()` — сброс истории чата (побочный эффект)
7. `config.getHookSystem()?.fireSessionStartEvent()` — вызов hook (побочный эффект)

**Анализ семантики non-interactive/ACP**:

- `ui.clear()` в non-interactive уже является no-op, обработка не требуется
- `geminiClient.resetChat()`: в ACP-сессии это осмысленный побочный эффект (очистка истории чата), его следует сохранить; в одиночном non-interactive вызове каждый вызов — это новая сессия, семантика `resetChat` избыточна, но безвредна
- `config.startNewSession()`: осмысленно в ACP (запуск нового session ID); в одиночном non-interactive вызове также избыточно, но безвредно
- `fireSessionEndEvent` / `fireSessionStartEvent`: осмысленно в ACP (вызов hook)

**Решение**: В пути non-interactive/ACP сохраняются все осмысленные побочные эффекты (resetChat, startNewSession, hook events), пропускается только `ui.clear()` (уже no-op) и возвращается message с маркером границы контекста.

**Изменение**:

1. Изменить `supportedModes` на `['interactive', 'non_interactive', 'acp']`.
2. Изменить тип возвращаемого значения `action` на `Promise<void | MessageActionReturn>`.
3. Внутри `action`, после (или вместо) вызова `context.ui.clear()`, добавить ветвление по режиму:

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

    // ui.clear() 在非交互下已是 no-op，但依然调用（不需要条件分支）
    context.ui.clear();

    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.resetChat();
    }

    config.getHookSystem()?.fireSessionStartEvent(...).catch(...);
  } else {
    context.ui.clear();
  }

  // 根据模式决定返回值
  if (context.executionMode !== 'interactive') {
    return {
      type: 'message',
      messageType: 'info',
      content: 'Context cleared. Previous messages are no longer in context.',
    };
  }
  // interactive 路径：void（不返回，React UI 由 ui.clear() 驱动更新）
},
```

**Семантика ACP**: Получив маркер границы контекста, IDE может отобразить его как разделитель сессий (например, подсказка "Начата новая сессия") и очистить локальный кэш истории чата.

---

## 8. Изменения в `handleCommandResult`

**Вывод: изменения не требуются.**

После изменений всех команд в Phase 2, типы возвращаемых значений в путях non-interactive/ACP будут `message` или `submit_prompt`, которые уже корректно обрабатываются в switch `handleCommandResult`.

---

## 9. Изменения в `createNonInteractiveUI()`

**Вывод: изменения не требуются.**

Текущей реализации no-op достаточно. No-op методы `addItem`, `clear`, `setPendingItem` и др. не будут вызываться в non-interactive пути команд категории B (из-за раннего return); interactive путь не затрагивается.

---

## 10. Phase 2.2: Настройка вызова моделей для prompt-команд

В Phase 1 уже реализован `CommandService.getModelInvocableCommands()`, `BundledSkillLoader`, `FileCommandLoader` (пользовательские/проектные команды) и `McpPromptLoader` уже устанавливают `modelInvocable: true`.

Задача Phase 2.2 — перевести `SkillTool` с потребления только `SkillManager.listSkills()` на одновременное потребление `CommandService.getModelInvocableCommands()`, унифицировав точку входа для вызываемых моделью команд.

**Изменяемый файл**: `packages/core/src/tools/SkillTool.ts` (или соответствующий путь)

**Конкретные изменения**:

1. При инициализации `SkillTool` получает `CommandService` (или результат `getModelInvocableCommands()`) как dependency injection
2. При построении описания tool объединяются результаты `listSkills()` и `getModelInvocableCommands()`
3. Гарантируется, что встроенные команды (`modelInvocable: false`) не попадают в описание tool

> **Примечание**: Конкретная реализация `SkillTool` зависит от внутренней архитектуры `packages/core`. В данном документе описаны только изменения интерфейсов, детали реализации должны определяться с учетом текущей структуры пакета core.

---

## 11. Phase 2.3: Обнаружение mid-input slash-команд (базовая версия)

Обнаружение slash-токена рядом с курсором в компоненте `InputPrompt` (не только в начале строки) для вызова меню автодополнения.

**Правила обнаружения**:

- Если перед курсором есть токен, начинающийся с `/` и не содержащий пробелов, активируется автодополнение команд
- Кандидаты берутся из списка видимых команд `getCommandsForMode('interactive')`
- Меню автодополнения отображает имя команды + description (без `argumentHint` и т.д., будет добавлено в Phase 3)

> Эта функция относится к изменениям на уровне UI и является независимой подзадачей Phase 2.3, не влияющей на реализацию других частей Phase 2.1/2.2.

---

## 12. Обзор изменений файлов

### 12.1 Изменения в файлах команд (Phase 2.1)

| Файл                     | Тип изменения | Конкретное содержание                                                                                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `exportCommand.ts`       | Категория A     | Родительская команда + 4 подкоманды: `supportedModes` → все режимы                                                                                    |
| `planCommand.ts`         | Только interactive   | Решение по дизайну: оставить `supportedModes: ['interactive']`, без изменений                                                                             |
| `statuslineCommand.ts`   | Только interactive   | Решение по дизайну: оставить `supportedModes: ['interactive']`, без изменений                                                                             |
| `languageCommand.ts`     | Категория A+    | Родительская команда + подкоманды `ui`/`output` + динамические языковые подкоманды: `supportedModes` → все режимы                                                   |
| `copyCommand.ts`         | Только interactive   | Решение по дизайну: оставить `supportedModes: ['interactive']`, без изменений                                                                             |
| `restoreCommand.ts`      | Только interactive   | Решение по дизайну: оставить `supportedModes: ['interactive']`, без изменений                                                                             |
| `modelCommand.ts`        | Категория A'    | `supportedModes` → все режимы + добавлена non-interactive ветка для путей без аргументов/без fast model                                                               |
| `approvalModeCommand.ts` | Категория A'    | `supportedModes` → все режимы + добавлена non-interactive ветка для пути без аргументов                                                                              |
| `aboutCommand.ts`        | Категория B     | `supportedModes` → все режимы + non-interactive путь возвращает `message` (сводка версии/модели/окружения)                                                        |
| `statsCommand.ts`        | Категория B     | `supportedModes` → все режимы + non-interactive путь возвращает `message` (текст stats); подкоманды обрабатываются аналогично                                                |
| `insightCommand.ts`      | Категория B     | `supportedModes` → все режимы + `non_interactive` путь синхронно генерирует и возвращает `message` (путь к файлу); `acp` путь возвращает `stream_messages` с отправкой прогресса |
| `docsCommand.ts`         | Категория B     | `supportedModes` → все режимы + non-interactive путь возвращает `message` (URL документации), браузер не открывается                                                    |
| `clearCommand.ts`        | Категория B     | `supportedModes` → все режимы + в конце `action` возвращается `message` или `void` в зависимости от режима                                                           |

### 12.2 Изменения в других файлах

| Файл                                                | Содержание изменений                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/tools/SkillTool.ts`              | Phase 2.2: интеграция `getModelInvocableCommands()` (детальный дизайн будет определен отдельно) |
| `packages/cli/src/ui/InputPrompt.tsx` (или эквивалентный компонент) | Phase 2.3: логика обнаружения mid-input slash                               |

### 12.3 Файлы без изменений

- `packages/cli/src/nonInteractiveCliCommands.ts` (`handleCommandResult`, `handleSlashCommand` не требуют изменений)
- `packages/cli/src/ui/noninteractive/nonInteractiveUi.ts` (stub UI не требует изменений)
- `packages/cli/src/services/commandUtils.ts` (`filterCommandsForMode`, `getEffectiveSupportedModes` не требуют изменений)
- `packages/cli/src/services/CommandService.ts` (`getCommandsForMode`, `getModelInvocableCommands` уже реализованы в Phase 1)

---

## 13. Стратегия тестирования

### 13.1 Юнит-тесты команд

Для каждой измененной команды добавить или обновить тестовые файлы (`*.test.ts`) в той же директории, покрывая следующие кейсы:

**Команды категорий A/A+** (`export`, `language`):

- `supportedModes` корректно включает `non_interactive` и `acp`
- При `executionMode: 'non_interactive'` `action` возвращает `MessageActionReturn` или `SubmitPromptActionReturn`, не вызывает `ui.addItem` или `ui.clear`
- Поведение в interactive пути полностью идентично версии до рефакторинга (snapshot-тесты)

**Только interactive команды** (`plan`, `statusline`, `copy`, `restore`):

- `supportedModes` равен `['interactive']`, это решение по дизайну
- Проверка корректного возврата `unsupported` при выполнении в non-interactive

**Команды категории A'** (`model`, `approval-mode`):

- Без аргументов + `executionMode: 'non_interactive'` → возвращает `message` с текущим состоянием, не возвращает `dialog`
- С аргументами + `executionMode: 'non_interactive'` → исходная логика `message` работает корректно
- Interactive путь: без аргументов → `dialog`, с аргументами → `message` (без изменений)

**Команды категории B** (`about`, `stats`, `insight`, `docs`, `clear`):

- При `executionMode: 'non_interactive'` `action` возвращает `MessageActionReturn`, не вызывает никаких методов `ui.*`
- Возвращаемая строка `content` содержит ожидаемые ключевые поля (версия, имя модели, URL и т.д.)
- Interactive путь: вызывается `ui.addItem`, `action` возвращает `void` (без изменений)

**Специальный кейс для `clear`**:

- При `executionMode: 'non_interactive'` `geminiClient.resetChat()` все еще вызывается (побочный эффект сохранен)
- Возвращается `message` с маркером границы контекста, содержимое: `'Context cleared. Previous messages are no longer in context.'`

### 13.2 Интеграционные тесты (`handleSlashCommand`)

В `nonInteractiveCli.test.ts` или новом интеграционном файле:

- `handleSlashCommand('/about', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит версию }`
- `handleSlashCommand('/stats', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит 'Session duration' }`
- `handleSlashCommand('/docs', ...)` в non-interactive режиме возвращает `{ type: 'message', content: содержит 'qwenlm.github.io' }`
- `handleSlashCommand('/clear', ...)` в non-interactive режиме возвращает `{ type: 'message', content: 'Context cleared.' }`
- `handleSlashCommand('/plan', ...)` в non-interactive режиме возвращает `unsupported` (только interactive команда)
- Поведение существующих non-interactive команд (`btw`, `bug` и др.) не регрессирует

### 13.3 Тесты `commandUtils`

В `commandUtils.test.ts` добавить (или продолжить покрытие существующими тестами):

- Расширенные команды (`export`, `language` и др.) успешно проходят фильтрацию `filterCommandsForMode(commands, 'non_interactive')` и `filterCommandsForMode(commands, 'acp')`
- Только interactive команды (`plan`, `statusline`, `copy`, `restore`) корректно отфильтровываются в `filterCommandsForMode(commands, 'non_interactive')`

---

## 14. Анализ влияния на поведение

| Сценарий                                         | Поведение до Phase 2                                            | Поведение после Phase 2                     | Характер               |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------------ |
| Выполнение `/export md` в non-interactive          | ❌ unsupported (отфильтровано)                                  | ✅ Возвращает message с путем к файлу            | Расширение возможностей           |
| Выполнение `/plan <task>` в non-interactive        | ❌ unsupported                                            | ❌ unsupported (решение: только interactive) | Без изменений               |
| Выполнение `/statusline` в non-interactive         | ❌ unsupported                                            | ❌ unsupported (решение: только interactive) | Без изменений               |
| Выполнение `/language ui zh-CN` в non-interactive  | ❌ unsupported                                            | ✅ Устанавливает язык, возвращает подтверждающий message      | Расширение возможностей           |
| Выполнение `/copy` в non-interactive               | ❌ unsupported                                            | ❌ unsupported (решение: только interactive) | Без изменений               |
| Выполнение `/restore` (без аргументов) в non-interactive  | ❌ unsupported                                            | ❌ unsupported (решение: только interactive) | Без изменений               |
| Выполнение `/restore <id>` в non-interactive       | ❌ unsupported                                            | ❌ unsupported (решение: только interactive) | Без изменений               |
| Выполнение `/model` в non-interactive              | ❌ unsupported (dialog)                                  | ✅ Возвращает имя текущей модели                | Расширение возможностей           |
| Выполнение `/model <id>` в non-interactive         | ❌ unsupported                                            | 🔄 Опционально для Phase 2: реализовать логику переключения      | Расширение возможностей (опционально)   |
| Выполнение `/approval-mode` в non-interactive      | ❌ unsupported (dialog)                                  | ✅ Возвращает текущий режим утверждения                | Расширение возможностей           |
| Выполнение `/approval-mode yolo` в non-interactive | ❌ unsupported                                            | ✅ Устанавливает режим, возвращает подтверждение              | Расширение возможностей           |
| Выполнение `/about` в non-interactive              | ❌ Возвращает "Command executed successfully." (addItem no-op) | ✅ Возвращает сводку версии/модели/окружения          | Исправление бага + расширение возможностей |
| Выполнение `/stats` в non-interactive              | ❌ Возвращает "Command executed successfully."                  | ✅ Возвращает текстовую статистику сессии           | Исправление бага + расширение возможностей |
| Выполнение `/insight` в non-interactive            | ❌ Возвращает "Command executed successfully." (генерирует, но без вывода)  | ✅ Генерирует и возвращает путь к файлу              | Исправление бага + расширение возможностей |
| Выполнение `/docs` в non-interactive               | ❌ Возвращает "Command executed successfully."                  | ✅ Возвращает URL документации                    | Исправление бага + расширение возможностей |
| Выполнение `/clear` в non-interactive              | ❌ Возвращает "Command executed successfully."                  | ✅ Возвращает message с маркером границы контекста          | Исправление бага + расширение возможностей |
| Выполнение любой из вышеуказанных команд в interactive               | ✅ Исходное поведение                                               | ✅ Исходное поведение (нулевая регрессия)              | Без изменений               |

---

## 15. Порядок реализации

Рекомендуется следующий порядок, каждая группа может быть закоммичена и ревьюирована независимо:

**Batch 1** (~30 мин): Категория A — только изменение `supportedModes`

Изменить `exportCommand.ts` (и подкоманды), убедиться, что тесты проходят.

**Batch 2** (~45 мин): Категория A+ — небольшое ветвление

Изменить `languageCommand.ts`, добавить non-interactive ветки для путей с побочными эффектами, обновить соответствующие тесты. (`copyCommand.ts` и `restoreCommand.ts` по решению остаются только interactive.)

**Batch 3** (~45 мин): Категория A' — пути dialog

Изменить `modelCommand.ts`, `approvalModeCommand.ts`, добавить non-interactive ветки для путей без аргументов, обновить соответствующие тесты.

**Batch 4** (~1.5 ч): Категория B — полное ветвление

Изменить `aboutCommand.ts`, `statsCommand.ts` (включая подкоманды), `docsCommand.ts`.

**Batch 5** (~1 ч): Категория B (особые) — `insightCommand.ts`, `clearCommand.ts`

Эти команды имеют много побочных эффектов, выносятся в отдельный коммит, обновляются соответствующие и интеграционные тесты.

**Batch 6** (~2 ч): Phase 2.2 — настройка вызова моделей для prompt-команд

Изменить `SkillTool`, интегрировать `getModelInvocableCommands()`, обновить тесты SkillTool.

**Batch 7** (~2 ч): Phase 2.3 — обнаружение mid-input slash

Изменить компонент `InputPrompt`, добавить логику активации автодополнения и UI-тесты.

**Batch 8** (~30 мин): Полное тестирование + проверка типов

Запустить `npm run typecheck`, `cd packages/cli && npx vitest run`, исправить оставшиеся проблемы.

---

## 16. Чек-лист приемки

**Расширение команд Phase 2.1**

- [ ] Категория A: `/export` (и подкоманды), `/plan`, `/statusline` корректно выполняются в режимах non-interactive и acp, возвращая осмысленный вывод
- [ ] Категория A+: `/language` (и подкоманды) корректно выполняется в non-interactive, сохраняя настройки персистентно
- [ ] Категория A+: `/copy` в non-interactive/acp возвращает текст последнего вывода AI (без работы с буфером обмена)
- [ ] Категория A+: `/restore` без аргументов в non-interactive возвращает список checkpoint; с аргументами восстанавливает состояние и возвращает подтверждающий message (не возвращает `type: 'tool'`)
- [ ] Категория A': `/model` без аргументов в non-interactive/acp возвращает имя текущей модели (не вызывает dialog); `/model --fast <id>` корректно устанавливает
- [ ] Категория A': `/approval-mode` без аргументов в non-interactive/acp возвращает текущий режим (не вызывает dialog); с аргументами корректно устанавливает
- [ ] Категория B: `/about` в non-interactive/acp возвращает plain text сводку с версией и именем модели
- [ ] Категория B: `/stats` (включая подкоманды) в non-interactive/acp возвращает plain text статистику
- [ ] Категория B: `/insight` в non-interactive/acp генерирует insight-файл и возвращает путь к нему (браузер не открывается)
- [ ] Категория B: `/docs` в non-interactive/acp возвращает URL документации (браузер не открывается)
- [ ] Категория B: `/clear` в non-interactive/acp возвращает message с маркером границы контекста, `geminiClient.resetChat()` выполняется корректно
- [ ] Все 13 команд в interactive режиме ведут себя полностью идентично версии до рефакторинга (нулевая регрессия)
- [ ] Компиляция TypeScript без ошибок (`npm run typecheck`)
- [ ] `npm run lint` без новых ошибок
- [ ] Все существующие тесты проходят (`cd packages/cli && npx vitest run`)

**Вызов моделей Phase 2.2**

- [ ] Модель может вызывать bundled skill, file command (пользовательские/проектные), MCP prompt через `SkillTool` в диалоге
- [ ] Модель не может вызывать built-in commands
- [ ] Описание tool в `SkillTool` содержит имена и описания всех команд с `modelInvocable: true`

**mid-input slash Phase 2.3**

- [ ] Ввод `/` в основном тексте поля ввода активирует меню автодополнения команд (не только в начале строки)
- [ ] Меню автодополнения отображает имя команды + description
- [ ] После выбора автодополнения текст корректно вставляется в поле ввода