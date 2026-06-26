# Обнаружение изменений файла настроек (подзадача 1 задачи #3696)

## Контекст

В Qwen Code в настоящее время отсутствует механизм обнаружения изменений файла настроек. Пользователи должны перезапускать сессию после изменения `settings.json`, чтобы изменения вступили в силу. Это предложение реализует инфраструктурный уровень для системы горячей перезагрузки #3696 — автоматическое обнаружение и диспетчеризацию событий при изменениях файла настроек.

**Объем**: эта подзадача отвечает только за «обнаружение изменений файла → перезагрузка → оповещение слушателей». `Config` копирует многие поля настроек в момент конструирования (`approvalMode`, `mcpServers`, `telemetry` и т.д.), и эти снимки НЕ обновляются автоматически этой подзадачей. Только потребители, которые читают `LoadedSettings.merged` в реальном времени (например, хук `useSettings()`, `disabledSkillNamesProvider`), сразу увидят изменения. Другие подзадачи (переподключение MCP, команда `/reload`) отвечают за передачу обновлений во внутреннее состояние Config.

## Архитектурные решения

### Расположение модуля: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` и пути к файлам настроек находятся в `packages/cli`
- `reloadScopeFromDisk()` — это метод `LoadedSettings`
- Основной пакет получает только минимальный жизненный интерфейс `{ stopWatching(): void }`, без импорта типов CLI, таких как `SettingScope`
- Диспетчеризация событий изменений и логика обновления нижележащих слоев полностью реализованы на уровне CLI

### Стратегия отслеживания: наблюдение за родительским каталогом + строгая фильтрация по пути

Поток записи `writeWithBackupSync` выглядит так: `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`, из-за чего целевой файл ненадолго исчезает. Отслеживание самого файла привело бы к тому, что chokidar потеряет объект наблюдения. Поэтому мы наблюдаем за родительским каталогом (`depth: 0`) и фильтруем по **точному совпадению базового имени**, реагируя только на события файла `settings.json` и игнорируя `.tmp`, `.orig`, временные файлы редактора и т.п. Резервная копия `.orig` — это промежуточная страховка, которая **удаляется при успехе** (финальный шаг `unlink`), поэтому она никогда не остаётся в каталоге пользователя.

### Отложенная обработка каталога: никогда не создавать `.qwen/` при запуске

> **Побочный эффект на файловой системе при запуске (намеренно избегается).** Наблюдатель **ни в коем случае не должен** создавать `<project>/.qwen/` (или `~/.qwen/`) только для того, чтобы иметь возможность за ним наблюдать. В ранней версии вызывался `mkdirSync({ recursive: true })` для любого отсутствующего каталога настроек, что приводило к тому, что обычный (не «bare») запуск молча создавал `<project>/.qwen/` даже в проектах, где никогда не было настроек Qwen — засоряя рабочую область и git-статус. Создание каталога является исключительной обязанностью _сохранения_ настроек (`saveSettings()` выполняет свой `mkdirSync`, когда пользователь действительно записывает настройки).

Чтобы по-прежнему обнаруживать `settings.json`, добавленный позже в сессии, без создания каталога и без рекурсивного обхода дерева проекта, наблюдатель использует двухэтапную стратегию для каждой области, **ключом** к которой является наличие каталога:

- **`.qwen` существует при запуске** → наблюдаем его напрямую (`watchTargetDir`, описанная выше стратегия).
- **`.qwen` отсутствует** → **наблюдаем-загрузчик родителя** (`watchParentForDir`): `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })`, где предикат `ignored` `(p) => p !== parentDir && basename(p) !== '.qwen'` пропускает **только** запись `.qwen`. Это подавляет весь нерелевантный шум верхнего уровня и никогда не выполняет рекурсию. Как только `.qwen` появляется, наблюдатель **повышает** уровень: закрывает загрузочный наблюдатель и запускает целевой наблюдатель на `.qwen`, затем планирует обновление, чтобы подхватить `settings.json`, который уже может находиться внутри.

Детали надёжности:

- **Защита TOCTOU**: после активации загрузочного наблюдателя (который использует `ignoreInitial`) повторно проверяется `existsSync(dir)`; если `.qwen` был создан в промежутке, повышение происходит немедленно.
- **Понижение при удалении**: если сам `.qwen` удалён (`unlinkDir`), целевой наблюдатель понижается обратно до загрузочного наблюдателя родителя, чтобы последующее повторное создание по-прежнему было зафиксировано.
- **Защита поколения**: `close()` в chokidar является асинхронным, поэтому устаревший callback `'all'` от демонтируемого наблюдателя мог бы иначе повторно инициировать повышение и накапливать наблюдателей. Монотонный токен поколения для каждой области (увеличивается при каждом повышении/понижении, а также при `stopWatching`) делает устаревшие callback-и неактивными, гарантируя не более одного активного наблюдателя для каждой области.

### Обнаружение изменений: семантическая разница как основной механизм дедупликации

Каждый раз, когда срабатывает наблюдатель, он сначала создаёт снимок **текущего состояния в памяти до перезагрузки** (`JSON.stringify(file.settings)`), затем вызывает `reloadScopeFromDisk()` для перезагрузки, и наконец сравнивает снимки до и после. Слушатели оповещаются только тогда, когда семантическое содержимое действительно изменилось.

Ключевой момент: сравнение производится между состоянием в памяти **до и после перезагрузки**, а не с сохранённым историческим снимком. Это связано с тем, что `setValue()` синхронно обновляет `file.settings` в памяти перед записью на диск, поэтому, когда наблюдатель инициирует перезагрузку, состояние в памяти уже содержит записанное значение — перезагрузка даёт то же содержимое → нет разницы → нет оповещения.
Это естественным образом подавляет:

- Дублирующиеся события от самозаписи (`setValue()` уже обновила память, перезагрузка даёт идентичное содержимое → нет diff → нет уведомления)
- Изменения только форматирования/комментариев (разрешённые настройки не включают комментарии)
- Сохранения редактора без изменения содержимого
- Дублирующиеся события chokidar

Известное ограничение: `JSON.stringify` чувствителен к порядку ключей. Если пользователь вручную переставит ключи в settings.json без изменения значений, это вызовет одно безвредное дополнительное уведомление. Это приемлемо; нет необходимости добавлять зависимость для глубокого сравнения.

## Реализация

### 1. Новый класс `SettingsWatcher`

**Файл**: `packages/cli/src/config/settingsWatcher.ts`

```typescript
export interface SettingsChangeEvent {
  scope: SettingScope;
  path: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export type SettingsChangeListener = (
  events: SettingsChangeEvent[],
) => void | Promise<void>;

export class SettingsWatcher {
  private readonly settings: LoadedSettings;
  private readonly watchers: Map<SettingScope, FSWatcher> = new Map();
  // 'bootstrap' = watching parent for `.qwen`; 'target' = watching `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Monotonic token per scope; bumped on promote/demote to void stale callbacks
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // serialization guard
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**Основные методы**:

#### `startWatching()`

- Перебирает области User и Workspace
- Ветвится в зависимости от существования **директории**: напрямую следит за `.qwen`, если он существует, в противном случае включает bootstrap-наблюдение за родительской (см. [Lazy Directory Handling](#lazy-directory-handling-never-create-qwen-at-startup))
- **Никогда** не создаёт директорию — нет `mkdirSync`
- `ignoreInitial: true`, `depth: 0` везде
- Не вызывается в bare-режиме

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Never create the directory; settings persistence (saveSettings) owns that.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` — это наблюдатель за родительской директорией с строгим фильтром по базовому имени, описанный выше (он также понижает уровень обратно до bootstrap-наблюдателя, если сам `.qwen` удалён). `watchParentForDir` включает bootstrap-наблюдатель только за `.qwen` и повышает уровень, как только `.qwen` появляется:

```typescript
private watchParentForDir(scope: SettingScope, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  const parentDir = path.dirname(dir);
  const dirBasename = path.basename(dir); // ".qwen"
  const gen = this.bumpGeneration(scope);

  const watcher = watchFs(parentDir, {
    ignoreInitial: true,
    depth: 0,
    ignored: (filePath: string) =>
      filePath !== parentDir && path.basename(filePath) !== dirBasename,
  })
    .on('all', (_event: string, changedPath: string) => {
      if (this.watchGeneration.get(scope) !== gen) return; // stale callback
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings bootstrap watcher error for ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU guard: `.qwen` may have appeared between the existence check and here.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // guard double-promote
  await this.replaceWatcher(scope); // bumps generation + awaits async close()
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // pick up a settings.json already inside .qwen
}
```

#### `stopWatching()` — Идемпотентное завершение

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Watcher close error:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — 300 мс дебаунс + накопление областей

```typescript
private scheduleRefresh(scope: SettingScope): void {
  this.pendingScopeChanges.add(scope);
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  this.refreshTimer = setTimeout(() => {
    this.refreshTimer = null;
    void this.drainPendingChanges();
  }, SettingsWatcher.DEBOUNCE_MS);
}
```
#### `drainPendingChanges()` — Последовательная обработка для предотвращения повторного входа

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // previous round still running; it will drain on exit
  this.processing = true;
  try {
    while (this.pendingScopeChanges.size > 0) {
      const scopes = new Set(this.pendingScopeChanges);
      this.pendingScopeChanges.clear();
      await this.handleChange(scopes);
    }
  } finally {
    this.processing = false;
  }
}
```

#### `handleChange(scopes)` — Перезагрузка + семантическое сравнение + уведомление

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Снимок текущего состояния в памяти до перезагрузки (включает мутации setValue())
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk имеет внутренний try/catch; при ошибке парсинга сохраняет старое состояние
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Семантическое сравнение: уведомлять только при реальном изменении содержимого
    // Подавление собственной записи: setValue() уже обновил память → перезагрузка совпадает → без уведомления
    if (afterSettings === beforeSettings) continue;

    events.push({
      scope,
      path: file.path,
      changeType: !existedBefore && existsNow ? 'created'
                : existedBefore && !existsNow ? 'deleted'
                : 'modified',
    });
  }

  if (events.length > 0) {
    await this.notifyListeners(events);
  }
}
```

#### `notifyListeners(events)` — `Promise.allSettled()` + таймаут 30 с

Используется тот же шаблон уведомления слушателей, что и в SkillManager (`packages/core/src/skills/skill-manager.ts:188-236`): каждый слушатель обёрнут в гонку с таймаутом 30 с, выполняется параллельно через `Promise.allSettled`, ошибки не всплывают.

#### `addChangeListener(listener)` — Возвращает функцию отписки

### 2. Изменения в `LoadedSettings`

**Файл**: `packages/cli/src/config/settings.ts`

**Изменения не требуются**. Механизм семантического сравнения полностью содержится в watcher. `setValue()` синхронно обновляет память → `saveSettings()` записывает на диск → watcher срабатывает → `reloadScopeFromDisk()` перезагружает → сравнение diff обнаруживает идентичное содержимое → без уведомления. Цепочка замыкается естественно.

### 3. Интеграция с Config (минимальный интерфейс)

**Файл**: `packages/core/src/config/config.ts`

Добавить в `ConfigParameters`:

```typescript
/** Дескриптор жизненного цикла внешнего watcher файлов. Останавливается при завершении работы. */
settingsWatcher?: { stopWatching(): void };
```

В `Config.shutdown()` остановить watcher **до** проверки `initialized`:

```typescript
async shutdown(): Promise<void> {
  try {
    // Остановка внешнего watcher независимо от состояния инициализации
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... остальная логика очистки ...
  }
}
```

**В Config не добавляются settingsChangeListeners**. Рассылка событий об изменениях полностью обрабатывается на уровне CLI, где слушатели напрямую вызывают методы обновления ядра (например, `skillManager.refreshCache()`, `toolRegistry.restartMcpServers()`). Это сохраняет ядро неосведомлённым о семантике изменений настроек.

### 4. Подключение при запуске

**Файл**: `packages/cli/src/gemini.tsx`

После `loadSettings()` и `loadCliConfig()`:

```typescript
// Создание watcher (пропускаем в bare-режиме)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Передаём дескриптор жизненного цикла watcher при загрузке CLI config
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Регистрируем слушатель изменений (будущие подзадачи добавят сюда логику обновления)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Настройки изменены:', events.map(e => `${e.scope}:${e.changeType}`));
  // Подзадачи 2–6 добавят:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - флаг needsRefresh
});
```

**Изменение сигнатуры `loadCliConfig`** (`packages/cli/src/config/config.ts`): Добавить необязательный параметр для передачи `settingsWatcher` в `ConfigParameters`.

## Обработка граничных случаев

| Сценарий                                        | Обработка                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Каталог `.qwen` не существует                   | **Никогда не создаётся.** Bootstrap-наблюдение за родительским каталогом (`depth: 0`, фильтр только `.qwen`), продвижение после появления `.qwen` |
| `.qwen` создан после запуска                    | Bootstrap-watcher ловит `addDir`, переводится в целевой watcher + планирует обновление                        |
| `.qwen` удалён после продвижения                | Целевой watcher ловит `unlinkDir` → возврат к родительскому bootstrap-watcher                                 |
| Файл удалён                                     | `reloadScopeFromDisk` обнаруживает `!existsSync`, сбрасывает в `{}`, diff вызывает событие `deleted`           |
| Файл создан после запуска (каталог существует)  | Watcher каталога ловит событие `add`, `reloadScopeFromDisk` читает новый файл                                  |
| Устаревший callback при продвижении/понижении   | Токен поколения для области делает in-flight callback закрываемого watcher холостым (без накопления watcher'ов) |
| Атомарные записи редактора                      | Наблюдение за каталогом + строгая фильтрация по базовому имени (исключая `.tmp`/`.orig`) + debounce 300 мс     |
| События от `.tmp`/`.orig` файлов                | Фильтр базового имени точное совпадение с `settings.json`, все остальные имена игнорируются                    |
| Собственная запись (`setValue` → `saveSettings`) | Семантическое сравнение: перезагруженное содержимое совпадает со снимком в памяти → без уведомления             |
| Собственная запись параллельно с внешним редактированием | Внешнее редактирование меняет содержимое → diff обнаруживает изменение → корректно уведомляет                  |
| Изменение только форматирования/комментариев    | `reloadScopeFromDisk` разрешает настройки без комментариев → diff совпадает → без уведомления                  |
| Дублирующиеся события chokidar                  | Debounce-слияние + семантическое сравнение обеспечивают двойную защиту                                         |
| Перенаправление `QWEN_HOME`                     | `getUserSettingsPath()` уже вычисляет путь; watcher использует вычисленный путь                                |
| Bare-режим                                      | `startWatching()` никогда не вызывается, нулевые накладные расходы                                             |
| Ошибка создания watcher                         | Исключение перехватывается, выводится предупреждение, для этой области нет обнаружения в реальном времени, но функциональность не нарушена |
| Ошибка парсинга в `reloadScopeFromDisk`         | Внутренний try/catch (`settings.ts:501`) сохраняет старое состояние → сравнение до/после совпадает → без уведомления |
| Изменение порядка ключей (без изменения значений) | `JSON.stringify` чувствителен к порядку ключей; может вызвать одно безвредное дополнительное уведомление       |
| Ошибка инициализации Config                     | `shutdown()` останавливает watcher до проверки `initialized`, предотвращая утечки                              |
| Повторный вход (listener ещё выполняется)       | Флаг `processing` + цикл `drainPendingChanges` сериализуют обработку                                           |
| Невалидный JSON                                 | Внутренний try/catch в `reloadScopeFromDisk` сохраняет старое состояние                                        |
## Анализ производительности

- Не более 1 наблюдателя на область (≤ 2 всего), каждый с `depth: 0` — минимальные накладные расходы на файловые дескрипторы; наблюдатели переключаются через promote/demote, стек никогда не используется
- `depth: 0` означает **отсутствие рекурсивного обхода** дерева проекта, даже для родительского bootstrap-наблюдателя в большом монорепозитории. Затраты ограничены прямыми потомками родительского каталога: не связанный с делом шум на верхнем уровне пробуждает chokidar для одного `readdir` + проход фильтра `ignored` (`O(количество записей верхнего уровня)`) до того, как событие будет подавлено — рекурсивного сканирования не происходит
- Задержка 300 мс гарантирует, что быстрые сохранения в редакторе не вызовут множественные перезагрузки
- `reloadScopeFromDisk` использует синхронный `readFileSync`, < 1 мс на вызов
- `JSON.stringify` сравнение имеет сложность O(n), но объекты настроек обычно меньше 10 КБ; дополнительного хранения снимков не требуется
- Уведомление слушателей выполняется параллельно через `Promise.allSettled`
- Нет опроса — чисто событийно-ориентированный подход

## Файлы для создания/изменения

**Новые файлы**:

- `packages/cli/src/config/settingsWatcher.ts` — класс наблюдателя
- `packages/cli/src/config/settingsWatcher.test.ts` — модульные тесты

**Изменяемые файлы**:

- `packages/core/src/config/config.ts` — добавить поле `settingsWatcher` в `ConfigParameters`, вызвать `stopWatching()` перед проверкой `initialized` в `Config.shutdown()`
- `packages/cli/src/config/config.ts` (`loadCliConfig`) — добавить опциональный параметр для передачи `settingsWatcher`
- `packages/cli/src/gemini.tsx` — создание наблюдателя + подключение

**Не требуют изменений**: `packages/cli/src/config/settings.ts` (семантический diff самодостаточен и не требует взаимодействия с `LoadedSettings`)

## План тестирования

### Модульные тесты (`settingsWatcher.test.ts`)

Мокаем chokidar (используя шаблон моков из `skill-manager.test.ts`):

1. **Жизненный цикл**: `startWatching` создаёт наблюдателей, `stopWatching` закрывает наблюдателей, обе операции идемпотентны
2. **Фильтрация путей**: только события с базовым именем `settings.json` запускают обновление; файлы `.tmp`/`.orig`/другие игнорируются
3. **Дребезг**: несколько быстрых событий объединяются в одну перезагрузку (`vi.useFakeTimers()`)
4. **Семантический diff**: неизменённое содержимое → слушатель не вызывается; изменённое содержимое → слушатель вызывается с правильными событиями
5. **Подавление записи от себя**: события наблюдателя, вызванные `setValue()`, естественным образом фильтруются через идентичность diff
6. **Сериализация**: новые события во время `handleChange` накапливаются, обрабатываются после завершения текущей обработки
7. **Изоляция ошибок**: ошибки chokidar не приводят к падению; исключения в одном слушателе не влияют на других; сбои `reloadScopeFromDisk` перехватываются
8. **Тайм-аут слушателя**: защита тайм-аутом 30 секунд
9. **Ленивое отслеживание каталогов**: когда `.qwen` отсутствует, `mkdirSync` никогда не вызывается; bootstrap-наблюдатель устанавливается на родительский каталог, а его предикат `ignored` разрешает только запись `.qwen`
10. **Продвижение / TOCTOU**: появление `.qwen` (через `addDir` или повторную проверку после установки) закрывает bootstrap-наблюдатель и открывает целевой наблюдатель на `.qwen` + планирует обновление
11. **Понижение / повторное создание**: удаление `.qwen` (`unlinkDir`) повторно инициализирует bootstrap на родительском каталоге; последующее повторное создание снова продвигает
12. **Защита от поколений**: устаревший обратный вызов от уже закрытого bootstrap-наблюдателя не создаёт второй целевой наблюдатель

### Регрессионная проверка

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### Ручная проверка

Отредактируйте `~/.qwen/settings.json` во время работающего сеанса и наблюдайте вывод отладочного лога для событий изменения.

---

## Последующая подзадача: подавление событий для настроек, требующих перезапуска, и чувствительных настроек

> **Статус: механизм подавления реализован; два изменения схемы ожидают
> исследования.** Подзадача 1 выше генерировала одно `SettingsChangeEvent` на
> область для _любого_ семантического изменения. Эта последующая задача
> добавляет фильтр, чтобы изменения, ограниченные настройками, которые не могут
> вступить в силу без перезапуска — или которые являются чувствительными
> (учётные данные) — **не** уведомляли слушателей.
>
> - **Готово:** механизм подавления на основе `requiresRestart` в
>   `SettingsWatcher.handleChange()` и модульные тесты (см. Механизм ниже).
> - **Ожидается:** два исправления схемы `requiresRestart`
>   (`modelProviders` → `true`, `permissions.*` → оставить горячую перезагрузку),
>   каждое с учётом проверки пути чтения во время выполнения.

### Мотивация

Некоторые настройки читаются ровно один раз во время запуска процесса (`Config.initialize()`,
построение генератора контента/клиента, порождение дочерних процессов, флаги
Node runtime). Примеры, которые пользователь явно назвал: **токены API, `env` и провайдеры
моделей**. Генерация события горячей перезагрузки для них вводит в заблуждение —
слушатель "обновится", но новое значение на самом деле не применится, пока
пользователь не перезапустит `qwen-code`. Чувствительные значения (учётные данные) также
не должны повторно передаваться через работающий сеанс.

### Решение: повторное использование флага `requiresRestart` из схемы (единственный источник истины)

`settingsSchema.ts` уже объявляет `requiresRestart: boolean` на **каждом**
ключе, а `packages/cli/src/utils/settingsUtils.ts` уже предоставляет функции поиска:
- `requiresRestart(key: string): boolean` — флаг для ключа в dot-нотации
- `getFlattenedSchema()` — полная сплющенная карта `ключ → определение`
- `getRestartRequiredSettings()` — все ключи с `requiresRestart: true`

Мы **повторно используем этот флаг как сигнал подавления** вместо ведения отдельного вручную составленного списка запрета (который неизбежно расходился бы со схемой). `requiresRestart: true` уже означает именно «вступит в силу только после перезапуска», это как раз то условие, при котором событие должно подавляться.

### Механизм (реализован в `SettingsWatcher.handleChange()`)

Старый шлюз делал сравнивание всего файла через `JSON.stringify` и не мог сказать, _какие_ ключи изменились. Он заменён на сравнение на уровне листьев + классификацию по ключам:

1. **`collectChangedKeys(before, after)`** — делает снимок состояния в памяти до перезагрузки (`structuredClone`), затем проходит по `before` и `after` и собирает dot-путь каждого листа, значение которого отличается. Обычные объекты рекурсивно обходятся; массивы и примитивы сравниваются целиком (согласуется с ключами-массивами в схеме, например `permissions.allow`). Добавленные/удалённые ключи считаются изменёнными листьями, так что создание/удаление файла обрабатывается без отдельной проверки существования.
2. **`isRestartRequiredKey(path)`** — для каждого изменённого пути находит в схеме **самый длинный ключ схемы, являющийся префиксом (или равным)** этого пути. Для свободно-формируемых объектных настроек (`env`, `modelProviders`) ключи схемы — это листья, так что `env.FOO` приводит к определению `env`. Неизвестные ключи по умолчанию считаются **не требующими перезапуска**, так что изменение, которое мы не можем классифицировать, никогда не подавляется молча.
3. Область (scope) уведомляет **только если хотя бы один из изменившихся ключей является hot-reloadable** (`!isRestartRequiredKey`). Если каждый изменившийся ключ требует перезапуска, область не порождает события.

Форма `SettingsChangeEvent` не изменилась (по-прежнему `{ scope, path, changeType }`); перенос оставшихся изменившихся ключей в событие оставлено как возможное будущее улучшение. Подавление после собственной записи (пустое сравнение → нет события), дебаунсинг, сериализация и поведение тайм-аута слушателя — всё без изменений.

### Две корректировки схемы для исследования и применения

Эти два значения `requiresRestart` должны быть исправлены, чтобы подход с повторным использованием флага работал, как задумано. **Каждое требует проверки реального пути чтения во время выполнения перед переключением флага.**

1. **`modelProviders`: `false` → `true`** (`settingsSchema.ts:294`)
   - Сейчас помечено как `requiresRestart: false`, так что при повторном использовании флага оно _не_ подавлялось бы — противоречит требованию, что изменения провайдеров не должны hot-reload.
   - Конфигурация провайдера (включая per-provider `apiKey` / `baseUrl`) считывается при сборке клиента модели / генератора контента во время запуска.
   - **Пункт исследования:** убедиться, что нет перечитывания `modelProviders` во время выполнения (поищите по конструированию генератора контента / клиента). Ожидаемый результат: `false` — это скрытая ошибка; переключить на `true`.

2. **`permissions.*`: оставить hot-reloadable** (`settingsSchema.ts:1560`, всё поддерево сейчас `requiresRestart: true`)
   - Правила разрешений (`deny > ask > allow`) вычисляются при каждом вызове инструмента и должны быть теми настройками, которые пользователи хотят применять немедленно.
   - Всё поддерево `permissions` помечено как `showInDialog: false`, так что его флаг `requiresRestart` сейчас **не имеет значения в UI** — сильный намёк, что `true` было значением по умолчанию, а не осознанным решением «требует перезапуска», так что радиус взрыва при переключении мал.
   - **Пункт исследования:** убедиться, что во время выполнения разрешения перечитываются «на лету» (например, через `config.getXxx()` в момент оценки), а не из снимка при запуске. Если подтверждено, установить поддереву `permissions` значение `requiresRestart: false`, чтобы оно **не** подавлялось механизмом повторного использования.

> Примечание: поскольку `requiresRestart` также отображается в UI настроек / подсказках о перезапуске, переключение этих флагов меняет и это поведение. Это допустимо и, вероятно, более корректно, но должно быть упомянуто в описании PR.

### Acceptance

- Изменение, затрагивающее только ключи, требующие перезапуска/чувствительные (`security.auth.*`, `env`, `modelProviders`, `mcpServers`, `proxy`, …), не порождает **никакого** `SettingsChangeEvent`.
- Изменение hot-reloadable ключа (`ui.*`, `model.name`, `permissions.*` после переключения, …) всё ещё порождает событие.
- Смешанное изменение (один ключ с перезапуском + один hot-reloadable) всё ещё порождает событие (hot-reloadable часть законно требует обновления).
- Изменение неизвестного (не из схемы) ключа всё ещё порождает событие, а не подавляется молча.

Статус тестов:

- **Готово** — блок `restart-required suppression` в `settingsWatcher.test.ts` покрывает полностью подавленные (`env`, `security.auth.apiKey`), полностью разрешённые (`ui.theme`), смешанные и случаи с неизвестными ключами.
- **Ожидает (после переключения схемы)** — утверждения в `settingsSchema.test.ts`, фиксирующие два исправленных значения `requiresRestart`, и тест watcher, проверяющий, что `permissions.*` больше не подавляется после переключения.
