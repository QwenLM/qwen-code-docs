# Миграция на `@qwen-code/sdk/daemon` v2

PR #4328 поставил UI-слой демона v1. PR #4353 (текущий) поставляет v2 с
семью наращиваемыми коммитами. Это руководство в первую очередь предназначено для авторов адаптеров веб-чата и веб-терминала. Разработчики нативных локальных TUI, каналов и IDE смогут позже переиспользовать те же примитивы, но эти стандартные продуктовые пути данной миграции не затрагиваются.

## TL;DR для текущих потребителей

**Обратно несовместимых изменений нет.** Каждый коммит в этом PR — наращиваемый:

- Поля v1 всё ещё работают (`createdAt` сохранено как `@deprecated` алиас для `clientReceivedAt`)
- Нормализатор v1 по-прежнему отображает те же 13 типов событий тем же способом
- Редюсер v1 по-прежнему создаёт те же блоки для событий чата
- Новое API опционально и активируется через дополнительные параметры и хелперы

PR безопасен для слияния без каких-либо изменений у потребителей. **Внедрение новых функций — инкрементальное.**

## Рекомендуемый порядок внедрения

Для каждого адаптера, в порядке соотношения трудозатрат/ценности:

### 1. Упорядочивание: переключить ключ сортировки с `createdAt` на `eventId`

**До:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**После:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Почему**: `eventId` монотонен относительно демона; переживает повторное подключение SSE. `createdAt` привязан к клиентским часам и смещается при повторе.

### 2. Отображение: переключить `createdAt` на `serverTimestamp ?? clientReceivedAt`

**До:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**После:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Почему**: Несколько клиентов видят одинаковое «X минут назад» только когда оба читают часы демона. Renderer плюс `formatBlockTimestamp` обрабатывает часовой пояс и локаль.

**Примечание**: Демону нужно проставлять `_meta.serverTimestamp` в конвертах, чтобы этот механизм заработал. SDK уже готов к прямой совместимости; использует `clientReceivedAt` как запасной вариант до тех пор.

### 3. Прослушивание новых типов событий — выбираем подмножество для отображения

16 новых типов событий (сессионные метаданные, рабочее пространство, аутентификация) не создают блоков транскрипта. Это побочные каналы наблюдений. Каждый адаптер сам решает, какие из них показывать:

```ts
// В вашем потребителе SSE
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Затем в вашем UI
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP-серверы приближаются к лимиту: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... и т.д., подключайте то, что нужно вашему UI
  }
}
```

Или используйте селекторы для зеркалирования состояний побочных каналов:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // зеркалируется из approval_mode.changed
const currentTool = selectCurrentTool(state); // текущий выполняющийся инструмент
```

### 4. Контракт рендеринга: используйте `daemonBlockToMarkdown` (или HTML / plainText)

**До** (каждый адаптер сам реализует проекцию):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `Вы: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... и т. д.
  }
}
```

**После** (делегируем SDK):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Для SSR с HTML:

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

Для простого текста:

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. Тест на соответствие

Добавьте в тестовый набор вашего адаптера:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('адаптер корректно проецирует корпус UI демона', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Этот тест прогонит ваш адаптер по 10 сценариям-фикстурам и выявит любые расхождения проекции до того, как они дойдут до пользователей.

### 6. Выбор иконки инструмента через `provenance`

**До** (сравнение строк с toolName):

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**После** (типизированный provenance из PR-A):

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```
SDK имеет эвристику именования `mcp__<server>__<tool>` — работает уже сейчас,
даже когда демон явно не проставляет происхождение (provenance).

### 7. Категоризация ошибок через `errorKind`

**До** (регулярное выражение по тексту):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**После** (замкнутое перечисление из PR-A):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**Примечание**: демон должен проставлять `data.errorKind` в session_died / stream_error, чтобы это поле заполнялось. SDK уже читает его.

### 8. Обработка отмены — уже автоматическая

В версии 1 отменённые промпты оставляли выполняющиеся блоки инструментов крутиться бесконечно.
В версии 2 (PR-E) `propagateCancellationToInFlightTools` выполняется автоматически
при `assistant.done.reason === 'cancelled'`. Дочерние под-агенты отменяются вместе с родительским.

**Изменения адаптера не требуются** — ваши спиннеры будут разрешаться корректно.

### 8a. Вложенность под-агентов — опциональное вложенное отображение (PR-K)

Блоки инструментов, вызванные внутри делегирования под-агенту, теперь содержат
`parentToolCallId`, `subagentType` и (когда родитель находится в состоянии) `parentBlockId`. Адаптеры могут выбрать вложенное отображение:

**До** (плоский список, вызовы под-агентов визуально неотличимы от верхнего уровня):

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**После** (рекурсивное вложенное отображение):

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**Изменения адаптера не требуются, если вы предпочитаете плоское представление** — новые поля являются аддитивными и игнорируются кодом, который их не читает.

### 9. Таксономия предпросмотра инструментов — выбор подмножества для отображения кастомными компонентами

PR-D + PR-F приносят 13 видов предпросмотра:

- 4 файловых: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 контентных: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 управляющих: `ask_user_question`, `command`
- 2 общих: `key_value`, `generic`

Каждый адаптер диспетчеризует по `preview.kind`:

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... или запасной вариант:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Адаптеры без кастомных компонентов для всех 13 видов могут использовать запасной вариант SDK — `daemonToolPreviewToMarkdown` для любого необработанного вида.

## Чеклист обратной совместимости

| Аспект                                                | Статус                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| Чтения существующего `block.createdAt`                | ✅ всё ещё работает (алиас для `clientReceivedAt`) |
| Обработка событий существующего редьюсера             | ✅ без изменений для типов событий v1         |
| Места вызова `daemonTranscriptToUnifiedMessages(blocks)` | ✅ новый параметр options является опциональным |
| Потребители существующего `selectTranscriptBlocks`    | ✅ без изменений                              |
| Новые типы событий в редьюсере v1                     | ✅ no-op, `lastEventId` по-прежнему увеличивается |

## Перекрёстные ссылки

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — полная ссылка на API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — базовый PR с общим слоем транскрипта интерфейса
