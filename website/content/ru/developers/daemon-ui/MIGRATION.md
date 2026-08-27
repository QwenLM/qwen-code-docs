# Миграция на `@qwen-code/sdk/daemon` v2

PR #4328 внедрил слой UI демона v1. PR #4353 (этот PR) реализует версию v2 с
семью дополнительными функциональными коммитами. Это руководство в первую очередь
предназначено для авторов адаптеров веб-чата и веб-терминала. Разработчики нативных
TUI, каналов и IDE позже смогут переиспользовать те же примитивы, но эти пути
продукта по умолчанию не затрагиваются данным PR.

## TL;DR для существующих потребителей

**Критических изменений нет.** Каждый коммит в этом PR является дополняющим:

- Поля v1 продолжают работать (`createdAt` сохранён как псевдоним с пометкой `@deprecated`
  для `clientReceivedAt`)
- Нормализатор v1 по-прежнему отображает те же 13 типов событий тем же способом
- Редьюсер v1 по-прежнему формирует те же блоки для событий чата
- Новый API опционален — используется через дополнительные параметры и вспомогательные функции

PR безопасен для слияния без каких-либо изменений у потребителей. **Внедрение
новых возможностей происходит поэтапно.**

## Рекомендуемый порядок внедрения

Для каждого адаптера в порядке соотношения затрат и выгоды:

### 1. Упорядочивание: переключение ключа сортировки с `createdAt` на `eventId`

**До:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**После:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Почему**: `eventId` монотонно увеличивается демоном; сохраняется при
повторном подключении SSE после пересоединения. `createdAt` основан на
клиентских часах и смещается при повторном воспроизведении.

### 2. Отображение: замена `createdAt` на `serverTimestamp ?? clientReceivedAt`

**До:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**После:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Почему**: Несколько клиентов видят одинаковое «X минут назад» только когда
оба используют часы демона. Рендерер вместе с `formatBlockTimestamp`
обрабатывает часовой пояс и локаль.

**Примечание**: Демон должен проставлять `_meta.serverTimestamp` в конверты,
чтобы это работало. SDK уже готов к будущим изменениям; пока что используется
запасной вариант `clientReceivedAt`.

### 3. Прослушивание новых типов событий — выбор подмножества для отображения

16 новых типов событий (session-meta, workspace, auth) не создают блоки
транскрипта. Это наблюдения побочного канала. Каждый адаптер выбирает, что
показывать:

```ts
// В потребителе SSE
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Затем на стороне UI
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP-серверы приближаются к лимиту бюджета: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... и т.д., выбирайте то, что нужно вашему UI
  }
}
```

Или используйте селекторы для зеркалированных побочных каналов состояния:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // зеркалировано из approval_mode.changed
const currentTool = selectCurrentTool(state); // текущий выполняющийся инструмент
```

### 4. Рендеринг сообщений: используйте `daemonBlockToMarkdown` (или HTML / plainText)

**До** (каждый адаптер сам проектирует):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... и т.д.
  }
}
```

**После** (делегирование в SDK):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Для HTML SSR:

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

it('адаптер правильно проектирует корпус UI демона', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Этот тест прогонит ваш адаптер на 10 фича-сценариях и выявит любые расхождения
в проекции, прежде чем они достигнут пользователей.

### 6. Диспетчеризация иконок инструментов через `provenance`

**До** (сравнение строк по имени инструмента):

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

В SDK есть эвристический запасной вариант по именованию `mcp__<server>__<tool>` —
он работает уже сейчас, даже если демон явно не проставляет provenance.

### 7. Категоризация ошибок через `errorKind`

**До** (регулярные выражения по тексту):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**После** (закрытое перечисление из PR-A):

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

**Примечание**: Демон должен проставлять `data.errorKind` в `session_died` /
`stream_error`, чтобы это поле заполнилось. SDK уже читает его.

### 8. Обработка отмены — уже автоматическая

В v1 отменённые промпты оставляли блоки выполняющихся инструментов висеть
бесконечно. В v2 (PR-E) `propagateCancellationToInFlightTools` запускается
автоматически при `assistant.done.reason === 'cancelled'`. Дочерние
субагенты отменяются вместе с родителем.

**Изменения адаптера не требуются** — ваши спиннеры будут корректно
завершаться.

### 8a. Вложенность субагентов — опциональное вложенное отображение (PR-K)

Блоки инструментов, вызванные внутри делегирования субагенту, теперь содержат
`parentToolCallId`, `subagentType` и (когда родитель в состоянии)
`parentBlockId`. Адаптеры могут включить вложенное отображение:

**До** (плоский список, вызовы субагентов визуально неотличимы от
верхнеуровневых):

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

**Изменения адаптера не требуются, если вы предпочитаете плоское
отображение** — новые поля являются дополняющими и игнорируются кодом,
который их не читает.

### 9. Таксономия превью инструментов — выберите подмножество для отображения с собственными компонентами

PR-D + PR-F добавляют 13 видов превью:

- 4 файловидных: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 контентных: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 управляющих: `ask_user_question`, `command`
- 2 общих: `key_value`, `generic`

Каждый адаптер выполняет диспетчеризацию по `preview.kind`:

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
    // ... или резервный вариант:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Адаптеры без собственных компонентов для всех 13 видов могут резервно
использовать `daemonToolPreviewToMarkdown` из SDK для любого необработанного
вида.

## Чек-лист обратной совместимости

| Проблема                                                | Статус                                        |
| ------------------------------------------------------- | --------------------------------------------- |
| Существующие чтения `block.createdAt`                   | ✅ всё ещё работает (псевдоним для `clientReceivedAt`) |
| Существующая обработка событий в редьюсере              | ✅ без изменений для типов событий v1         |
| Сайты вызова `daemonTranscriptToUnifiedMessages(blocks)` | ✅ новый параметр опционален                  |
| Существующие потребители `selectTranscriptBlocks`       | ✅ без изменений                              |
| Новые типы событий в редьюсере v1                       | ✅ no-op, `lastEventId` всё равно увеличивается |

## Перекрёстные ссылки

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [README UI демона](./README.md) — полный справочник API
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — базовый PR с общим слоем транскрипта UI