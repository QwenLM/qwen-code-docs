# Daemon UI SDK — Руководство разработчика

Подпуть `@qwen-code/sdk/daemon` предоставляет общие UI-примитивы для клиентов демона. В настоящее время целевыми средами являются веб-чат и веб-терминал; нативные локальные TUI, каналы и интеграции с IDE сохраняют свои существующие пути по умолчанию, пока контракт UI демона стабилизируется. Это руководство охватывает API, представленный в PR #4353 (унифицированное продолжение PR #4328, общего слоя транскриптов UI).

## Трёхслойная модель

```
Daemon SSE wire (NDJSON envelopes)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← сюда подключается ваш рендерер
```

- **Нормализатор**: принимает сырые SSE-конверты демона, возвращает типизированные UI-события
- **Редуктор**: аккумулирует события в конечный автомат транскрипта
- **Вспомогательные функции рендеринга**: преобразуют блоки состояния в строки для отображения

## Быстрый старт

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// Чтение состояния из любого подписчика
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Таксономия событий (28+ типов)

`DaemonUiEvent` — это discriminated union всех UI-ориентированных событий:

### События чат-потока

| Событие                       | Когда                                                  |
| ----------------------------- | ------------------------------------------------------ |
| `user.text.delta`             | Фрагмент сообщения пользователя от демона              |
| `assistant.text.delta`        | Потоковый фрагмент ассистента                          |
| `assistant.done`              | Завершение промпта (из resolve sendPrompt)             |
| `thought.text.delta`          | Фрагмент рассуждений агента                            |
| `tool.update`                 | Жизненный цикл вызова инструмента (выполняется / завершён / отменён) |
| `shell.output`                | Фрагмент stdout/stderr инструмента shell               |
| `permission.request`          | Инструмент требует авторизации пользователя            |
| `permission.resolved`         | Получено решение по разрешению                         |
| `model.changed`               | Переключена модель сессии                              |
| `status` / `debug` / `error`  | Блоки статуса / отладки / ошибки                       |

### События мета-сессии (PR-A)

| Событие                            | Когда                                             |
| ---------------------------------- | ------------------------------------------------- |
| `session.metadata.changed`         | Обновлён заголовок / отображаемое имя сессии      |
| `session.approval_mode.changed`    | Переключён режим одобрения (plan / default / yolo / auto-edit) |
| `session.available_commands`       | Обновлён список слэш-команд                       |

### События рабочего пространства (PR-A, Wave 3-4)

| Событие                                   | Когда                                  |
| ----------------------------------------- | -------------------------------------- |
| `workspace.memory.changed`                | Изменён QWEN.md / файл памяти          |
| `workspace.agent.changed`                 | Создан / обновлён / удалён под-агент   |
| `workspace.tool.toggled`                  | Встроенный инструмент включён / отключён |
| `workspace.initialized`                   | `qwen init` завершён                   |
| `workspace.mcp.budget_warning`            | Количество MCP-потомков приближается к лимиту |
| `workspace.mcp.child_refused`             | MCP-сервер отказал из-за бюджета       |
| `workspace.mcp.server_restarted`          | Ручной перезапуск MCP выполнен успешно |
| `workspace.mcp.server_restart_refused`    | Ручной перезапуск заблокирован         |

### События auth device-flow (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Каждое содержит `deviceFlowId` демона. События с ошибкой содержат закрытое перечисление `errorKind` (закрытое перечисление — см. `KNOWN_DEVICE_FLOW_ERROR_KINDS`, экспортируемое из `@qwen-code/sdk/daemon`, за каноническим списком; в настоящее время: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Контракт рендеринга (PR-D)

Три вспомогательные функции проекции, одна для превью. Все различаются по `block.kind` или `preview.kind`:

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Рецепт: рендеринг транскрипта в markdown

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Рецепт: рендеринг в очищенный HTML для SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Двухэтапный конвейер: markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Или используйте встроенный консервативный HTML-рендерер (без разбора markdown, только экранирование HTML):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Рецепт: копирование простого текста

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Таксономия превью инструментов (13 видов)

| Вид                   | Поверхность                                        |
| --------------------- | -------------------------------------------------- |
| `ask_user_question`   | Вопрос с множественным выбором и вариантами        |
| `command`             | Команда в стиле bash + cwd                         |
| `file_diff`           | Редактирование файла с oldText/newText или патч    |
| `file_read`           | Путь + опциональный диапазон строк                 |
| `web_fetch`           | URL + HTTP метод                                   |
| `mcp_invocation`      | MCP-сервер + инструмент + сводка аргументов        |
| `code_block`          | Фрагмент кода с указанием языка                    |
| `search`              | Запрос + количество результатов + лучшие результаты |
| `tabular`             | Столбцы + строки (макс. 50, усечение отмечается)   |
| `image_generation`    | Промпт + опциональный URL миниатюры                |
| `subagent_delegation` | Имя агента + задача                                |
| `key_value`           | Универсальные строки метка/значение                |
| `generic`             | Универсальная сводка                                |

Для каждого есть проекция `daemonToolPreviewToMarkdown`. Пользовательские рендереры могут разветвляться по `preview.kind` для богатого отображения каждого типа (diff файла с подсветкой синтаксиса, значок MCP-сервера, миниатюра изображения и т.д.).

## Селекторы состояния (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // отсортировано по монотонному ID демона

// PR-K — вложенность под-агентов
selectSubagentChildBlocks(state, parentToolCallId); // только прямые потомки
isSubagentChildBlock(block); // type guard: был ли этот инструмент вызван внутри под-агента?
```

`currentToolCallId` автоматически поддерживается редуктором:

- Устанавливается, когда инструмент переходит в состояние выполнения (`running` / `in_progress` / `pending` / `confirming`)
- Сбрасывается, когда инструмент переходит в конечное состояние (`completed` / `failed` / `cancelled` и т.д.)
- Неизвестные состояния оставляют его без изменений (совместимость вперёд)

## Распространение отмены (PR-E)

Когда `assistant.done.reason === 'cancelled'`, редуктор проходит по каждому выполняющемуся блоку инструмента и принудительно устанавливает его статус в `'cancelled'`. Демон не гарантирует отправку завершающего `tool_call_update` для каждого выполняющегося инструмента при отмене родительского промпта — это распространение предотвращает бесконечное вращение спиннеров в UI.

Потомки под-агентов отменяются вместе с родителем, поскольку отмена проходит по всем выполняющимся блокам инструмента в `toolBlockByCallId`, а не только по текущему указателю.

## Вложенность под-агентов (PR-K)

Когда основной агент делегирует задачу под-агенту (инструмент `Task` или эквивалентный), демон проставляет `parentToolCallId` и `subagentType` в **дочерних** вызовах инструментов через `tool_call._meta`. Редуктор читает оба поля и:

- Копирует `parentToolCallId` + `subagentType` в `DaemonToolTranscriptBlock`
- Разрешает `parentBlockId` (id родительского блока транскрипта), если родительский блок уже в состоянии; в противном случае оставляет `undefined` и заполняет его позже, когда родительский блок появится

Обработка поступления в неправильном порядке (потомок раньше родителя) выполняется прозрачно. Потомок, родитель которого был обрезан из-за `maxBlocks`, сохраняет `parentToolCallId` для запросов селекторов, но `parentBlockId` обнуляется (повисший id больше не разрешается через `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Рендеринг родительского блока инструмента, затем обход потомков:
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// Или фильтрация верхнего уровня против вложенных во время рендеринга:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` возвращает только **прямых** потомков. Обходите рекурсивно для рендеринга вложенных под-агентов (под-агент внутри под-агента). Демон не генерирует циклов, но рендереры, поднимающиеся по `parentBlockId`, всё равно должны обнаруживать их на всякий случай (например, ограничение глубины или множество посещённых элементов).

Самоссылки (`parentToolCallId === toolCallId`) отбрасываются нормализатором до того, как достигают редуктора.

## Семантика времени (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // ПЕРВИЧНЫЙ ключ сортировки — монотонный по демону
  serverTimestamp?: number; // ПРЕДПОЧТИТЕЛЬНЫЙ для отображения — авторитетный со стороны демона
  clientReceivedAt: number; // ЗАПАСНОЙ — локальные часы
  createdAt: number; // @deprecated псевдоним для clientReceivedAt
}
```

**Всегда сортируйте по `eventId`** (используйте `selectTranscriptBlocksOrderedByEventId`) при отображении длинных сессий. Монотонный курсор демона сохраняется при повторном воспроизведении SSE после переподключения; клиентские часы — нет.

**Всегда форматируйте отображаемые метки времени из `serverTimestamp`** (с запасным `clientReceivedAt`). Несколько клиентов, просматривающих одну и ту же сессию, будут видеть одинаковое «5 минут назад» только в том случае, если все читают время с часов демона.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Соответствие адаптера (PR-G)

Проверьте, что ваш адаптер проецирует эталонный корпус SDK в семантически эквивалентный вывод:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('my adapter conforms to daemon UI corpus', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

Корпус фикстур (`DAEMON_UI_CONFORMANCE_FIXTURES`) охватывает чат, жизненный цикл инструментов, редактирование файлов, MCP, разрешения, предупреждения о бюджете MCP, отмену, редактирование некорректных полезных нагрузок, OAuth, обновления команд и вложенность под-агентов. (Количество можно получить во время выполнения — прочитайте `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Независимо от формата** — ваш адаптер может рендерить в ANSI / HTML / markdown / JSX; фреймворк проверяет только семантическое содержимое через `expectedContains` и `expectedAbsent`.

## Категоризация ошибок (PR-A)

`DaemonUiErrorEvent.errorKind` — это закрытое перечисление, передаваемое из таксономии типизированных ошибок демона (когда демон его проставляет):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Рендереры должны разветвляться по `errorKind` для предоставления действенных возможностей:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Повторная аутентификация</button>;
    case 'missing_file':   return <button>Выбрать файл</button>;
    case 'blocked_egress': return <span>Сеть заблокирована — проверьте прокси</span>;
    default:               return null;
  }
}
```

## Диспетчеризация происхождения инструмента (PR-A)

`DaemonUiToolUpdateEvent.provenance` — это закрытое перечисление (`builtin` / `mcp` / `subagent` / `unknown`). С `serverId?: string` когда `mcp`. Используйте его для диспетчеризации иконок и значков:

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

В SDK есть эвристический запасной вариант именования `mcp__<server>__<tool>` — даже когда демон явно не указывает происхождение, инструменты MCP можно обнаружить.

## Принципы прямой совместимости

Каждый слой в SDK UI демона следует **принципу прямой совместимости**: неизвестные значения НЕ вызывают исключений; они деградируют корректно.

- Неизвестные типы событий демона → событие `debug` с сырым именем типа
- Неизвестный статус инструмента → `currentToolCallId` остаётся без изменений (не очищается)
- Неизвестный вид ошибки → `errorKind` undefined (рендерер переходит к тексту)
- Отсутствующий serverTimestamp → используется `clientReceivedAt`
- Неопознанная форма превью → вид `generic` со сводкой `summary`

Это означает, что **SDK может быть выпущен раньше, чем демон начнёт генерировать новые события**. Эвристика происхождения инструмента PR-A, извлечение меток времени из трёх источников PR-B и сохранение неизвестных статусов PR-E — все это примеры принципа «готово, когда демон отправляет; безопасно, когда нет».

## Перекрёстные ссылки

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — базовый PR с общим слоем транскриптов UI
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — этот PR (унифицированное последующее дополнение)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — предложение режима демона
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — трекер реализации Mode B v0.16