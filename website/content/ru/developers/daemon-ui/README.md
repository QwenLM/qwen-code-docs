# Daemon UI SDK — Руководство разработчика

Подпуть `@qwen-code/sdk/daemon` предоставляет общие UI-примитивы для daemon-клиентов. На данный момент целевым потребителем является веб-чат и веб-терминал; нативные локальные TUI, каналы и IDE-интеграции сохраняют свои текущие пути по умолчанию, пока контракт daemon UI стабилизируется. В этом руководстве описывается API, представленный в PR #4353 (объединённое продолжение общего UI-слоя транскриптов из PR #4328).

## Трёхуровневая модель

```
Daemon SSE wire (NDJSON конверты)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← здесь подключаются ваши рендеры
```

- **Нормализатор**: принимает сырые SSE-конверты daemon, возвращает типизированные UI-события
- **Редуктор**: накапливает события в конечный автомат транскрипта
- **Вспомогательные функции рендера**: проецируют блоки состояния в строки для рендеринга

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

`DaemonUiEvent` — это размеченное объединение всех UI-событий:

### События чат-потока

| Событие                       | Когда                                               |
| ----------------------------- | --------------------------------------------------- |
| `user.text.delta`             | Фрагмент сообщения пользователя пришёл от daemon    |
| `assistant.text.delta`        | Стриминг-фрагмент ассистента                        |
| `assistant.done`              | Завершение промпта (из resolve sendPrompt)          |
| `thought.text.delta`          | Фрагмент рассуждений агента                         |
| `tool.update`                 | Жизненный цикл вызова инструмента (запущен / завершён / отменён) |
| `shell.output`                | stdout/stderr фрагмент от shell-инструмента         |
| `permission.request`          | Инструменту требуется авторизация пользователя       |
| `permission.resolved`         | Решение по разрешению поступило                      |
| `model.changed`               | Модель сессии переключена                            |
| `status` / `debug` / `error` | Блоки статуса / отладки / ошибки                     |

### События метаданных сессии (PR-A)

| Событие                             | Когда                                            |
| ----------------------------------- | ------------------------------------------------ |
| `session.metadata.changed`          | Обновлён заголовок / отображаемое имя сессии      |
| `session.approval_mode.changed`     | Режим одобрения переключён (plan / default / yolo / auto-edit) |
| `session.available_commands`        | Список слэш-команд обновлён                      |

### События рабочего пространства (PR-A, Волна 3-4)

| Событие                                  | Когда                               |
| ---------------------------------------- | ----------------------------------- |
| `workspace.memory.changed`               | QWEN.md / memory файл изменён       |
| `workspace.agent.changed`                | Саб-агент создан / обновлён / удалён |
| `workspace.tool.toggled`                 | Встроенный инструмент включён / выключен |
| `workspace.initialized`                  | `qwen init` завершён                 |
| `workspace.mcp.budget_warning`           | Количество дочерних процессов MCP приближается к лимиту |
| `workspace.mcp.child_refused`            | MCP сервер отказан из-за достижения бюджета |
| `workspace.mcp.server_restarted`         | Ручная перезагрузка MCP выполнена успешно |
| `workspace.mcp.server_restart_refused`   | Ручная перезагрузка заблокирована    |

### События OAuth Device Flow (PR-A, Волна 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Каждое содержит `deviceFlowId` от daemon. События с ошибкой содержат закрытое перечисление `errorKind` (closed enum — см. `KNOWN_DEVICE_FLOW_ERROR_KINDS` из `@qwen-code/sdk/daemon` для канонического списка; на данный момент: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Контракт рендера (PR-D)

Три вспомогательные функции проецирования, одна функция для предпросмотра. Все различаются по `block.kind` или `preview.kind`:
```
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

### Рецепт: рендеринг в санитизированный HTML для SSR

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Two-stage pipeline: markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Или используйте встроенный консервативный HTML-рендерер (без парсинга markdown, только
HTML-экранирование):

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

| Тип                    | Отображение                                          |
| ---------------------- | ---------------------------------------------------- |
| `ask_user_question`    | Вопрос с множественным выбором и вариантами          |
| `command`              | Команда в стиле Bash + текущая директория            |
| `file_diff`            | Редактирование файла с oldText/newText или патч      |
| `file_read`            | Путь + опциональный диапазон строк                   |
| `web_fetch`            | URL + HTTP-метод                                     |
| `mcp_invocation`       | MCP-сервер + инструмент + сводка аргументов          |
| `code_block`           | Фрагмент кода с указанием языка                      |
| `search`               | Запрос + количество результатов + топ результатов    |
| `tabular`              | Колонки + строки (макс. 50, помечено усечение)      |
| `image_generation`     | Промпт + опциональный URL миниатюры                  |
| `subagent_delegation`  | Имя агента + задача                                  |
| `key_value`            | Обобщённые строки «ключ–значение»                   |
| `generic`              | Резервная сводка                                     |

У каждого есть проекция `daemonToolPreviewToMarkdown`. Пользовательские рендереры могут
диспетчеризовать по `preview.kind` для богатого отображения каждого типа (разница файлов с
подсветкой синтаксиса, значок MCP-сервера, миниатюра изображения и т.д.).

## Селекторы состояния (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // sorted by daemon-monotonic id

// PR-K — вложенность под-агентов
selectSubagentChildBlocks(state, parentToolCallId); // direct children only
isSubagentChildBlock(block); // type guard: was this tool invoked inside a sub-agent?
```

`currentToolCallId` автоматически поддерживается редьюсером:

- Устанавливается, когда инструмент переходит в статус выполнения (`running` / `in_progress` / `pending` / `confirming`)
- Сбрасывается, когда инструмент переходит в конечный статус (`completed` / `failed` / `cancelled` / и т.д.)
- Неизвестные статусы оставляют его без изменений (совместимость вперёд)

## Распространение отмены (PR-E)

Когда `assistant.done.reason === 'cancelled'`, редьюсер проходит по всем
выполняющимся блокам инструментов и принудительно устанавливает их статус в `'cancelled'`. Демон
не гарантирует финальное `tool_call_update` для каждого выполняющегося
инструмента при отмене родительского промпта — такое распространение предотвращает бесконечное
вращение спиннеров в UI.

Дочерние элементы под-агентов отменяются вместе с родителем, так как
отмена перебирает все выполняющиеся блоки инструментов в `toolBlockByCallId`,
а не только текущий указатель.

## Вложенные под-агенты (PR-K)

Когда главный агент делегирует задачу под-агенту (инструмент `Task` или
аналог), демон проставляет `parentToolCallId` и `subagentType` в
**дочерние** вызовы инструментов через `tool_call._meta`. Редьюсер читает оба
поля и:

- Копирует `parentToolCallId` + `subagentType` в
  `DaemonToolTranscriptBlock`
- Разрешает `parentBlockId` (идентификатор `id` родительского блока транскрипта), когда
  родительский блок уже есть в состоянии; в противном случае оставляет `undefined` и
  заполняет позже, когда родительский блок появляется

Обработка прихода в неправильном порядке (дочерний элемент раньше родителя) выполняется прозрачно. Дочерний
элемент, чей родитель был обрезан `maxBlocks`, сохраняет `parentToolCallId`
для запросов селектора, но `parentBlockId` обнуляется (повисший идентификатор
больше не разрешается через `blockIndexById`).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Render a parent tool block, then walk children:
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

// Or filter top-level vs. nested at render time:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```
`selectSubagentChildBlocks` возвращает только **прямые** дочерние элементы. Обходите рекурсивно, чтобы отобразить вложенные под-агенты (под-агент внутри под-агента). Демон не генерирует циклы, но рендеры, проходящие вверх через `parentBlockId`, всё равно должны их обнаруживать защитно (например, ограничение глубины или множество посещённых).

Самоссылки (`parentToolCallId === toolCallId`) отбрасываются нормализатором до того, как достигают редьюсера.

## Временна́я семантика (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // PRIMARY sort key — daemon-monotonic
  serverTimestamp?: number; // PREFERRED display — daemon-authoritative
  clientReceivedAt: number; // FALLBACK — local clock
  createdAt: number; // @deprecated alias for clientReceivedAt
}
```

**Всегда сортируйте по `eventId`** (используйте `selectTranscriptBlocksOrderedByEventId`) при отображении длинных сессий. Монотонный курсор демона сохраняется при повторном воспроизведении SSE после переподключения; клиентские часы — нет.

**Всегда форматируйте отображаемые временные метки из `serverTimestamp`** (с откатом на `clientReceivedAt`). Несколько клиентов, просматривающих одну и ту же сессию, видят одинаковое «5 минут назад» только при чтении с часов демона.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Соответствие адаптера (PR-G)

Проверьте, что ваш адаптер проецирует эталонный корпус SDK на семантически эквивалентный вывод:

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

Корпус фикстур (`DAEMON_UI_CONFORMANCE_FIXTURES`) охватывает чат, жизненный цикл инструментов, правки файлов, MCP, разрешения, предупреждения о превышении бюджета MCP, отмену, редактирование некорректных полезных нагрузок, OAuth, обновления команд и вложенность под-агентов. (Количество можно получить во время выполнения — прочитайте `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Формат-независимый** — ваш адаптер может рендерить в ANSI / HTML / Markdown / JSX; фреймворк проверяет только семантическое содержимое через `expectedContains` и `expectedAbsent`.

## Категоризация ошибок (PR-A)

`DaemonUiErrorEvent.errorKind` — это закрытое перечисление, распространяемое из таксономии типизированных ошибок демона (когда демон его помечает):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Рендеры должны ветвиться по `errorKind` для предоставления действенных вариантов поведения (affordances):

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Re-authenticate</button>;
    case 'missing_file':   return <button>Choose file</button>;
    case 'blocked_egress': return <span>Network blocked — check proxy</span>;
    default:               return null;
  }
}
```

## Диспетчеризация происхождения инструментов (PR-A)

`DaemonUiToolUpdateEvent.provenance` — закрытое перечисление (`builtin` / `mcp` / `subagent` / `unknown`). С `serverId?: string`, когда `mcp`. Используйте его для диспетчеризации иконок и значков-бейджей:

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

В SDK есть эвристика отката по именованию `mcp__<server>__<tool>` — даже когда демон явно не указывает происхождение, инструменты MCP можно обнаружить.

## Принципы прямой совместимости

Каждый слой в daemon UI SDK следует **принципу прямой совместимости**: неизвестные значения НЕ вызывают исключений; они деградируют корректно.

- Неизвестные типы событий демона → событие `debug` с сырым именем типа
- Неизвестный статус инструмента → `currentToolCallId` остаётся нетронутым (без сброса)
- Неизвестный тип ошибки → `errorKind` не определён (рендер откатывается к тексту)
- Отсутствует serverTimestamp → откат к `clientReceivedAt`
- Неизвестная форма предпросмотра → тип `generic` с `summary`

Это означает, что **SDK может поставляться раньше эмиссии демона**. Эвристика происхождения инструментов из PR-A, извлечение временных меток из трёх мест из PR-B и сохранение неизвестного статуса из PR-E — все это примеры «готово, когда демон отправляет; безопасно, когда нет».

## Перекрёстные ссылки

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — основной PR с общим уровнем транскриптов UI
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — этот PR (унифицированный follow-up для полноты)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — предложение режима демона
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — трекер реализации Mode B v0.16
