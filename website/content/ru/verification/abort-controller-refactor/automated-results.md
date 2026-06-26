# Результаты автоматической верификации

Записано 20.05.2026 во время рефакторинга AbortController.

## 1. Воспроизведение накопления обработчиков

Прямая симуляция паттерна накопления обработчиков, наблюдаемого в длительных сессиях (1500+ обработчиков прерывания на одном AbortSignal). Скрипт находится в `listener-accumulation-repro.mjs`.

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simulating 2000 rounds for each pattern.

OLD pattern listener count on long-lived parent: 2000
NEW pattern listener count on long-lived parent: 0
PASS: OLD pattern accumulated >1500 listeners (reproduces the bug).
PASS: NEW pattern kept listener count at 0 — the helper prevents accumulation.
```

Это самостоятельное доказательство: СТАРЫЙ паттерн (сырой `addEventListener` без `{once:true}` или обратной очистки) накапливает 2000 обработчиков за 2000 раундов — что значительно превышает порог в 1500, замеченный пользователем. НОВЫЙ паттерн (`createChildAbortController` из `packages/core/src/utils/abortController.ts`) держит количество обработчиков родительского сигнала на уровне 0 на протяжении 2000 раундов, потому что каждый обратный обработчик очистки дочернего элемента удаляет обработчик родительского сигнала, когда дочерний элемент прерывается.

## 2. Объем миграции (намеренный)

В помощник мигрирована только цепочка родитель→потомок agent-runtime, которая действительно накапливает обработчики на долгоживущем родительском сигнале:

- `packages/core/src/agents/runtime/agent-interactive.ts` (мастер + раунд на сообщение)
- `packages/core/src/agents/runtime/agent-core.ts` (раунд на итерацию + waitForExternalInputs + try/finally в processFunctionCalls)
- `packages/core/src/agents/runtime/agent-headless.ts` (внешний → выполнение)
- `packages/core/src/hooks/promptHookRunner.ts` (имел реальную утечку при очистке: ручной addEventListener без `{once:true}` и никогда не удалялся)

Плюс три исправления только с `{once:true}` (без переключения помощника, просто защитная корректность):

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

Независимые короткоживущие контроллеры (на команду оболочки в `tools/shell.ts`, на монитор в `tools/monitor.ts`, на сессию арены в `agents/arena/ArenaManager.ts`, на вызов в `core/client.ts`, на запрос в `utils/fetch.ts`, на мечту / заголовок / судью / возобновление и т.д.) остаются на сыром `new AbortController()` — они собираются сборщиком мусора после использования и не накапливаются на долгоживущем родителе.

Смотрите `migration-completeness.txt` для фактического grep + обоснования.

## 3. Затронутые тестовые наборы

Все 71 затронутый тестовый файл / 2085 тестов проходят (3 пропущены — 1 это GC тест, требующий `--expose-gc`, 2 предсуществующих пропуска в наборе headless).

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

Покрытие:

- `packages/core/src/utils/abortController.test.ts` — 26 тестов: максимальное количество фабрики (по умолчанию + пользовательское), распространение на потомков, обратная очистка, быстрый путь, undefined родитель, проброс custom-maxListeners, семантика `combineAbortSignals` (включая очистка отменяет тайм-аут, тайм-аут очищает обработчики ввода, граничное значение `timeoutMs <= 0`, защитная проверка на середине итерации), безопасность GC (по возможности).
- `packages/cli/src/utils/warningHandler.test.ts` — 13 тестов: идемпотентность, подавление AbortSignal (включая форму `[AbortSignal{...}]`), обычный EventTarget НЕ подавляется, проброс режима отладки, разветвление на предыдущие обработчики, сквозная интеграция stderr порожденного дочернего процесса.
- `packages/core/src/hooks/httpHookRunner.test.ts` — покрывает потребителя `combineAbortSignals`, который был мигрирован (устаревший shim `createCombinedAbortSignal` и его тестовый файл были удалены после миграции единственного вызывающего).
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` — 102 теста, покрывающих мигрированные файлы с высоким воздействием.
- `packages/core/src/core/openaiContentGenerator/**` — 280+ тестов, включая конвейер, который потерял заплатку `raiseAbortListenerCap`.
- `packages/core/src/followup/**` — 100+ тестов, включая мигрированный контроллер предположений.
- `packages/core/src/tools/agent/**`, `packages/core/src/tools/shell.test.ts`, `packages/core/src/services/**`, `packages/core/src/hooks/**`, `packages/core/src/confirmation-bus/**` — все мигрированные файлы инструментов, хуков и сервисов.

## 4. Проверка типов в строгом режиме TypeScript

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(нет вывода, exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(нет вывода, exit 0)
```

## 5. Форматирование Prettier

```sh
$ node_modules/.bin/prettier --check packages/core/src/agents/runtime/agent-core.ts \
    packages/core/src/agents/runtime/agent-headless.ts \
    packages/cli/src/utils/warningHandler.ts \
    packages/cli/src/utils/warningHandler.test.ts \
    packages/core/src/utils/abortController.ts \
    packages/core/src/utils/abortController.test.ts
Checking formatting...
All matched files use Prettier code style!
```

## 6. Сборка + smoke-тест бинарного файла

```sh
$ npm run build:packages
(успешно для всех 5 пакетов рабочей области)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

Не было предупреждений при запуске с `--trace-warnings`.

## 7. Независимая проверка Codex

Два полных прохода через агент `codex:codex-rescue` (каждый раз независимый контекст). Первый проход выявил 3 проблемы — все устранены в последующих коммитах:

1. **Исключение между созданием контроллера и явным прерыванием приводит к утечке обработчика** в теле на итерацию `agent-core.ts` и в настройке до блока try в `agent-headless.ts`. Исправлено оборачиванием каждого в `try { ... } finally { abortController.abort(); }`.
2. **Слишком широкий regex подавления предупреждений `EventTarget`**. Сужено для соответствия только `AbortSignal` (любой формы, которую создает Node ≥20).
3. **`process.removeAllListeners('warning')` удаляет сторонние обработчики**. Удалено — полагаемся на семантику Node: "нет обработчиков → срабатывает принтер по умолчанию", поэтому добавление нашего обработчика неявно отключает путь печати по умолчанию, сохраняя при этом сторонние обработчики телеметрии нетронутыми.

Второй проход подтвердил, что все исправления корректны, дальнейших блокирующих проблем нет.

## Что остается для интерактивной верификации

Сценарии в `README.md` под номерами 00–09 требуют реальной интерактивной сессии с API модели (длительные разговоры со смешанными инструментами, Ctrl-C в середине потока, отмена подагента, снимки кучи). Они документированы для выполнения человеком, и журналы сессий должны быть прикреплены к телу PR при выполнении.