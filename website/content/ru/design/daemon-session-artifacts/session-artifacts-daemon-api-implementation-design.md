# Реализуемый дизайн API Qwen-Code Daemon Session Artifacts

> Входные данные: первый черновик session artifacts daemon API и черновик artifact design v1.
>
> Базовая версия исходного кода: текущий код qwen-code.  
> Цель: на основе существующих возможностей Daemon / ACP / SSE / SDK / hooks / extension спроектировать реализуемый, проверяемый и четко ограниченный API session artifacts.

## 1. Итоги проектирования

Рекомендуется определить artifact как:

> **Структурированная ссылка на артефакт, явно зарегистрированная в сессии и доступная пользователю для повторного использования, перехода по ссылке, предпросмотра, скачивания или совместного использования. Обычные изменения исходного кода не являются artifact; они относятся к file change / diff / patch history.**

Это определение охватывает как файлы, так и URL, не являющиеся файлами. Ключевой момент не в том, является ли это физическим файлом, а в том, объявлено ли это системой явно как «артефакт». Панель Artifacts должна отображать session outputs, а не всё, с чем взаимодействовал агент.

Полный набор возможностей для V1 должен включать:

- capability: `session_artifacts`
- API снапшотов artifacts: `GET /session/:id/artifacts`
- событие изменения artifact: `artifact_changed`
- метаданные результата инструмента: `ToolResult.artifacts?: ToolArtifact[]`
- структурированные метаданные артефактов `ArtifactTool`
- индекс в памяти bridge: `SessionArtifactStore`
- методы SDK: `DaemonClient.listSessionArtifacts()`, `DaemonSessionClient.artifacts()`
- легковесный инструмент, вызываемый моделью/skill/agent: `record_artifact`
- выходные artifacts хуков: `hookSpecificOutput.artifacts`
- API ручного внедрения для client: `POST /session/:id/artifacts`
- API явного удаления для client: `DELETE /session/:id/artifacts/:artifactId`
- метод SDK: `DaemonSessionClient.addArtifact()`
- метод SDK: `DaemonSessionClient.removeArtifact()`
- модель ссылок на managed / published storage

Чтобы сохранить контролируемость V1, не рекомендуется реализовывать в V1:

- сканирование workspace
- автоматическое добавление обычных `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` в artifacts
- автоматическое извлечение обычных текстовых URL
- автоматическое извлечение путей/URL из stdout shell
- возврат содержимого artifact
- исторические версии artifact
- восстановление персистентных artifacts
- базы данных / OSS / динамические iframe-песочницы

## 2. Считается ли Link артефактом

### 2.1 Вывод

**Да, но это должен быть «декларативный link artifact».**

Например, артефактами должны считаться:

- URL с деталями таблицы внутренней платформы данных, сформированный skill на основе ID ресурса.
- Страницы с деталями задач, мониторинга, трейсинга и lineage, сформированные агентом на основе ID ресурса.
- URL dashboard / notebook / report, возвращаемые инструментами MCP.
- HTML URL, опубликованные с помощью ArtifactTool.
- URL, явно добавленные пользователем или client в область артефактов сессии.

По умолчанию артефактами не должны считаться:

- Любые markdown-ссылки в обычных ответах ассистента.
- URL веб-страниц, прочитанные с помощью web_fetch.
- Случайно появившиеся в выводе grep/shell URL.
- Ссылки на материалы, документацию и справочные ссылки.

Основные критерии:

| Тип | Попадает в artifacts | Причина |
| --- | ---: | --- |
| Обычное редактирование исходного кода | Нет | Относится к file change / diff, а не к повторно используемым артефактам |
| Явно зарегистрированные сгенерированные файлы workspace | Да | Повторно используемые выходные данные, такие как report / HTML / PDF / image |
| HTML URL, опубликованные ArtifactTool | Да | Явно опубликовано инструментом |
| Бизнес-URL с деталями, сформированные skill по правилам | Да, но требуется явная регистрация | Пользователю нужна постоянно доступная для перехода ссылка справа |
| Обычные справочные ссылки в ответах ассистента | Нет | Много шума, высока вероятность ложных срабатываний |
| URL, появившиеся в stdout shell | Нет | Ненадежная семантика |
| URL, по которым выполнялись запросы web_fetch | Нет | Это входные данные/источник, а не артефакт |

### 2.2 Продуктовая семантика Link Artifact

Link artifact — это не «содержимое веб-страницы», а «точка входа в ресурс». В правой панели артефактов он должен отображаться как кликабельный элемент:

- Заголовок: `Детали ресурса профиля пользователя`
- Подзаголовок: `internal data platform / prod`
- Тип: `link`
- Хост URL: `platform.example.com`
- Источник: `ToolResult.artifacts` / `ArtifactTool` / `record_artifact` / hook / client

При клике client открывает URL; Daemon не читает, не проверяет и не пререндерит этот URL.

## 3. Текущая базовая версия кода

### 3.1 Daemon REST и capability

Связанный исходный код:

- `packages/cli/src/serve/server.ts`
- `packages/cli/src/serve/capabilities.ts`
- `docs/developers/qwen-serve-protocol.md`

Текущее состояние:

- `/capabilities` возвращает `features`; Client должен отображать UI на основе feature gate.
- Интерфейсы состояния только для чтения на уровне сессии выполнены в стиле REST:
  - `GET /session/:id/status`
  - `GET /session/:id/context`
  - `GET /session/:id/tasks`
  - `GET /session/:id/events`
- capability регистрируются в `SERVE_CAPABILITY_REGISTRY`.

Проектирование:

- Новая feature: `session_artifacts`
- Новый route: `GET /session/:id/artifacts`
- Новый mutation route для ручного внедрения: `POST /session/:id/artifacts`

### 3.2 Session EventBus

Связанный исходный код:

- `packages/acp-bridge/src/eventBus.ts`
- `packages/acp-bridge/src/bridge.ts`
- `packages/acp-bridge/src/bridgeClient.ts`
- `packages/sdk-typescript/src/daemon/events.ts`

Текущее состояние:

- Каждая live session имеет собственный `EventBus`.
- EventBus поддерживает id, bounded replay ring, `Last-Event-ID` и backpressure.
- SDK поддерживает known event list.

Проектирование:

- Обновления artifacts в реальном времени используют существующий `/session/:id/events`.
- Новый тип события: `artifact_changed`
- При первом входе Client использует снапшот, затем — инкрементальные события; после разрыва соединения снова запрашивает снапшот.

### 3.3 Tool Result и ArtifactTool

Связанный исходный код:

- `packages/core/src/tools/tools.ts`
- `packages/core/src/tools/tool-names.ts`
- `packages/core/src/tools/artifact/artifact-tool.ts`
- `packages/cli/src/acp-integration/session/Session.ts`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`

Текущее состояние:

- `ToolResult` в настоящее время содержит `llmContent`, `returnDisplay`, `resultFilePaths?`, `error?`.
- `ArtifactTool` уже может публиковать HTML и возвращать URL, но не имеет структурированных метаданных artifact.
- `_meta` в `ToolCallEmitter.emitResult()` уже имеет слот для расширения.

Проектирование:

- Добавить `ToolResult.artifacts?: ToolArtifact[]`.
- При успешном выполнении `ArtifactTool` заполняет `artifacts`.
- `ToolCallEmitter.emitResult()` помещает artifacts в `_meta.artifacts`.
- BridgeClient потребляет `_meta.artifacts` и записывает их в session artifact store.

### 3.4 Текущее состояние Hooks / Extensions / Plugins

Связанный исходный код:

- `packages/core/src/hooks/types.ts`
- `packages/core/src/core/toolHookTriggers.ts`
- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/sessionHooksManager.ts`
- `packages/core/src/hooks/registerSkillHooks.ts`
- `packages/core/src/extension/extensionManager.ts`
- `docs/developers/channel-plugins.md`

Текущие возможности:

- События hook включают `PreToolUse`, `PostToolUse`, `PostToolBatch`, `SessionStart`, `Stop`, `SubagentStart`, `SubagentStop` и т.д.
- Типы hook включают command, HTTP, function, prompt.
- stdout command hook поддерживает `HookOutput` в формате JSON.
- response HTTP hook поддерживает `HookOutput` в формате JSON.
- session hooks можно регистрировать во время выполнения через `SessionHooksManager`.
- frontmatter skill может регистрировать session-scoped command/HTTP hooks.
- extension может предоставлять commands, skills, hooks, MCP servers, channels.
- channel plugin в основном адаптирует мессенджеры и может отслеживать вызовы инструментов / чанки ответов, но не является каналом для внедрения артефактов daemon.

Текущие пробелы:

- Выходные данные hook содержат только общие поля, такие как `additionalContext`, decision, stopReason и т.д.
- В настоящее время отсутствует стандартный `hookSpecificOutput.artifacts`.
- В настоящее время daemon имеет только state-интерфейсы `GET /workspace/hooks` и `GET /session/:id/hooks`, без route для «активного внедрения артефактов через hook».

Вывод:

- hooks/extensions являются отличным кастомным входом для артефактов, но требуется расширение схемы вывода hook.
- channel plugin не рекомендуется использовать в качестве основного канала для внедрения артефактов; он подходит для отображения на внешних чат-платформах, но не для поддержания индекса артефактов сессии daemon.

## 4. Проектирование API

### 4.1 Capability

Добавлено:

```json
"session_artifacts"
```

Client отображает панель artifacts и вызывает соответствующий API, только если видит эту feature.

### 4.2 List Artifacts

```http
GET /session/:id/artifacts
```

Ответ:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "artifacts": [
    {
      "id": "a1b2c3d4e5f6",
      "kind": "link",
      "storage": "external_url",
      "title": "Детали ресурса профиля пользователя",
      "description": "Страница с деталями ресурса внутренней платформы данных",
      "url": "https://platform.example.com/resources/user-profile",
      "mimeType": "text/html",
      "status": "available",
      "source": "tool",
      "toolCallId": "call_abc",
      "toolName": "artifact",
      "createdAt": "2026-06-26T10:00:00.000Z",
      "updatedAt": "2026-06-26T10:00:00.000Z",
      "metadata": {
        "resourceType": "data_platform_resource",
        "env": "prod"
      }
    }
  ]
}
```

### 4.3 Событие Artifact Changed

Через существующий:

```http
GET /session/:id/events
```

Новое событие:

```json
{
  "v": 1,
  "type": "artifact_changed",
  "data": {
    "sessionId": "session-123",
    "change": {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "Детали ресурса профиля пользователя",
        "description": "Страница с деталями ресурса внутренней платформы данных",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "status": "available",
        "source": "tool",
        "toolCallId": "call_abc",
        "toolName": "artifact",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "data_platform_resource",
          "env": "prod"
        }
      }
    }
  }
}
```

`change.action`:

- `created`
- `updated`
- `removed`

V1 в основном генерирует `created` / `updated`; сценарии eviction или явного удаления генерируют `removed`.

`artifact_changed.data.change.artifact` при `created` / `updated` / `removed` содержит полный `DaemonSessionArtifact`, форма которого совпадает с отдельным элементом в `GET /session/:id/artifacts`; событие `removed` содержит последний полный artifact перед удалением. `removed` обязательно должно содержать `reason`; в V1 значениями являются `eviction` или `explicit`. Это позволяет UI реального времени напрямую применять событие без необходимости выполнять GET после каждого события. Если Client теряет соединение, теряет события или получает неизвестный тип события, он использует `GET /session/:id/artifacts` для snapshot sync.

### 4.4 Ручное добавление Client

В качестве точки входа для явной регистрации client в V1:

```http
POST /session/:id/artifacts
```

Назначение:

- Ручное добавление пользовательских link artifact через WebUI/IDE/внешний client.
- Вставка ресурсов в правую панель артефактов слоем расширений или интеграций без вызова инструментов модели.

Запрос:

```json
{
  "kind": "link",
  "storage": "external_url",
  "title": "Детали задачи",
  "description": "Страница с деталями задачи планировщика task_123",
  "url": "https://ops.example.com/tasks/task_123",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "scheduler_task"
  }
}
```

Ответ:

```json
{
  "v": 1,
  "sessionId": "session-123",
  "changes": [
    {
      "action": "created",
      "artifactId": "a1b2c3d4e5f6",
      "artifact": {
        "id": "a1b2c3d4e5f6",
        "kind": "link",
        "storage": "external_url",
        "title": "Детали задачи",
        "description": "Страница с деталями задачи планировщика task_123",
        "url": "https://ops.example.com/tasks/task_123",
        "mimeType": "text/html",
        "status": "available",
        "source": "client",
        "createdAt": "2026-06-26T10:00:00.000Z",
        "updatedAt": "2026-06-26T10:00:00.000Z",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    }
  ]
}
```

Каждый элемент в `changes` должен синхронно публиковаться как одно SSE-событие `artifact_changed`. Таким образом, даже если один POST вызывает upsert и eviction, client получит полные инкрементальные данные для created/updated и removed. Если в рамках одной мутации несколько входных данных сводятся к одному identity, в `changes` может быть создана только одна итоговая change. Порядок публикации событий является протокольным ограничением: сначала публикуются `created` / `updated` в порядке из `changes[]`, затем публикуются `removed`, чтобы локальное зеркало client не переходило кратковременно в состояние, которого никогда не существовало на сервере.

Ошибка ответа:

```json
{
  "v": 1,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "url должен использовать http или https",
    "field": "url"
  }
}
```

Коды состояния:

- `400 VALIDATION_FAILED`: ошибка валидации полей, например, несколько primary locator, неподдерживаемая схема URL или превышен лимит metadata.
- `401 UNAUTHORIZED` / `403 FORBIDDEN`: ошибка проверки mutation gate или bearer token.
- `404 SESSION_NOT_FOUND`: сессия не существует.

### 4.5 Удаление Client

В качестве точки входа для явного удаления в V1:

```http
DELETE /session/:id/artifacts/:artifactId
```

Семантика:

- Удаляет данный artifact только из текущего live session artifact store.
- Не удаляет файлы workspace, managed файлы или удаленные URL.
- При успешном выполнении возвращает `DaemonSessionArtifactMutationResult`, содержащий одну change с `action: 'removed'` и `reason: 'explicit'`.
- Если artifact уже не существует, DELETE все равно обрабатывается как идемпотентный успех, возвращая `200` и пустой `changes: []`, без публикации SSE-события.
- Синхронно публикует соответствующее SSE-событие `artifact_changed`.

Формат ошибки ответа использует envelope из раздела 4.4; если сессия не существует, возвращается `404 SESSION_NOT_FOUND`.

Безопасность:

- Это mutation route, следует использовать существующий mutation gate.
- Удаленный client может вызывать его, только если у daemon есть bearer token.
- Не читает URL.
- Не открывает URL автоматически.

### 4.6 Критерии выпуска V1 и совместимость

После слияния V1 должен быть выпущен для пробного использования как полноценная возможность управления артефактами сессии, а не как сырой интерфейс. Минимальный замкнутый цикл полной возможности включает:

- Client обнаруживает функцию через capability `session_artifacts`.
- Daemon предоставляет снапшот `GET /session/:id/artifacts`.
- Daemon публикует инкрементальные `artifact_changed` через существующий events stream.
- Четыре типа точек входа: `ArtifactTool` / `ToolResult.artifacts`, `record_artifact`, hook artifacts и client POST, попадают в один и тот же store.
- client DELETE может явно удалить ошибочно зарегистрированный artifact из live store.
- store централизованно выполняет валидацию, нормализацию, дедупликацию identity и eviction soft reservation.
- SDK может выполнять list/add/remove и распознавать событие `artifact_changed`.

Рекомендуется сначала выпустить для пробного использования в формате experimental/capability-gated. Здесь experimental означает, что реализация и UI могут быть доработаны, но не означает, что протокол можно произвольно нарушать: поля и семантика событий, уже предоставленные client, должны развиваться в соответствии со следующими правилами совместимости.

Не breaking последующие расширения:

- Добавление опциональных полей в response artifact.
- Добавление новых литералов `kind` / `status` / `source` / `storage`, но типизированный SDK должен объявлять эти поля как open union, а client должен допускать неизвестные значения: неизвестный `kind` обрабатывается как `other`, неизвестный `status` отображается как неизвестный статус и не блокирует отображение списка, неизвестный `source` обрабатывается как негруппированный источник, неизвестный `storage` отображается консервативно только по доступным `url` / `workspacePath`.
- Добавление новых route, например, `GET /session/:id/artifacts/:artifactId`, preview route, pin route.
- Добавление новых типов событий, но семантика существующего `artifact_changed` не меняется.
- Добавление новых capability, например, `session_artifacts_preview`, `session_artifacts_persistence`.
- Изменение внутренних значений по умолчанию для soft reservation, при условии, что общий лимит и семантика события eviction не нарушают работу существующих client.

Breaking изменения, требующие нового capability или новой версии:

- Изменение правил identity, приводящее к изменению artifact id для одного и того же URL/path.
- Преобразование существующих опциональных полей в обязательные.
- Удаление или переименование существующих полей.
- Изменение семантики `created` / `updated` / `removed` в `artifact_changed.data.change.action`.
- Изменение формы envelope в `GET /session/:id/artifacts`.
- Автоматическое добавление обычных текстовых ссылок ассистента или обычного редактирования файлов в список artifact по умолчанию.
## 5. Модель данных

### 5.1 Типы Public SDK

```ts
type OpenStringUnion<T extends string> = T | (string & {});

export type DaemonSessionArtifactKind = OpenStringUnion<
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other'
>;

export type DaemonSessionArtifactStatus = OpenStringUnion<
  'available' | 'missing'
>;

export type DaemonSessionArtifactSource = OpenStringUnion<
  'tool' | 'hook' | 'client'
>;

export type DaemonSessionArtifactStorage = OpenStringUnion<
  'workspace' | 'managed' | 'external_url' | 'published'
>;

export interface DaemonSessionArtifact {
  id: string;
  kind: DaemonSessionArtifactKind;
  storage: DaemonSessionArtifactStorage;
  title: string;
  description?: string;
  status: DaemonSessionArtifactStatus;
  source: DaemonSessionArtifactSource;
  createdAt: string;
  updatedAt: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DaemonSessionArtifactsEnvelope {
  v: 1;
  sessionId: string;
  artifacts: DaemonSessionArtifact[];
}

export interface DaemonArtifactChangedData {
  sessionId: string;
  change: DaemonSessionArtifactChange;
}

export interface DaemonSessionArtifactChange {
  action: 'created' | 'updated' | 'removed';
  artifactId: string;
  artifact?: DaemonSessionArtifact;
  reason?: 'eviction' | 'explicit';
}

export interface DaemonSessionArtifactMutationResult {
  v: 1;
  sessionId: string;
  changes: DaemonSessionArtifactChange[];
}
```

### 5.2 Типы Core ToolArtifact

```ts
export type ToolArtifactKind =
  | 'file'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'pdf'
  | 'notebook'
  | 'other';

export type ToolArtifactStorage =
  | 'workspace'
  | 'managed'
  | 'external_url'
  | 'published';

export interface ToolArtifact {
  kind?: ToolArtifactKind;
  storage?: ToolArtifactStorage;
  title: string;
  description?: string;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Множество известных литералов для `ToolArtifactKind` / `ToolArtifactStorage` должно иметь единственный источник реализации, чтобы избежать ручного расхождения в core, acp-bridge и SDK. Рекомендуемый подход:

- В core определить const-кортежи `TOOL_ARTIFACT_KINDS` / `TOOL_ARTIFACT_STORAGES` и экспортировать `ToolArtifactKind` / `ToolArtifactStorage`.
- acp-bridge переиспользует типы из core как известное множество для валидации входных данных и объявляет публичные типы daemon как проекцию протокола тех же значений.
- SDK не пишет второй набор известных union вручную; он реэкспортирует известные литералы через типы протокола, экспортированные из acp-bridge, или через сгенерированные на этапе сборки `.d.ts`, а затем оборачивает их в open union для типов, ориентированных на ответы, чтобы допускать новые значения, возвращаемые daemon в будущем.
- В тесты добавить проверку round-trip для kind/storage, чтобы гарантировать согласованный проход известных литералов через вход core, хранилище bridge и выход SDK; также добавить тест на fallback для неизвестных значений в SDK, чтобы проверить отказоустойчивость open union в рантайме.

И расширить:

```ts
export interface ToolResult {
  llmContent: unknown;
  returnDisplay: unknown;
  resultFilePaths?: string[];
  artifacts?: ToolArtifact[];
  error?: unknown;
}
```

### 5.3 Правила дополнения Public Artifact из входных данных

`ToolArtifact` — это входная форма, возвращаемая инструментами, `SessionArtifactInput` — это унифицированная внутренняя входная форма для всех точек входа перед попаданием в store, а `DaemonSessionArtifact` — это форма, возвращаемая наружу. Все точки входа должны сначала преобразовываться в `SessionArtifactInput`, а затем `SessionArtifactStore` дополняет общие поля.

```ts
export interface SessionArtifactInput extends ToolArtifact {
  source: 'tool' | 'hook' | 'client';
  toolCallId?: string;
  toolName?: string;
  hookName?: string;
  extensionId?: string;
  clientId?: string;
  trustedPublisher?: true;
  receivedSeq?: number;
}
```

`trustedPublisher` — это внутренний входной флаг bridge/store, а не поле публичной схемы или поле, которое может быть установлено client/hook. В V1 развертывания daemon/ACP подпроцесс `qwen --acp` запускается daemon и работает от имени того же пользователя; поэтому текущая реализация рассматривает завершенное обновление сессии `ArtifactTool` (`tool_call_update`, `status: 'completed'`, `_meta.toolName: 'artifact'`) как единственный сигнал trusted publisher. Этот сигнал не считывается из самого payload artifact и не открывается для client POST, уведомлений hook, `record_artifact` или других результатов инструментов.

Если в будущем будет добавлена поддержка удаленных sandbox, множественных участников ACP или агентов из недоверенных доменов, следует добавить невозможный для подделки идентификатор издателя на уровне транспорта / in-process, а затем заменить этот сигнал доверия V1; до этого момента не следует рассматривать `trustedPublisher` / `source` / `storage` внутри payload как основание для авторизации.

Правила преобразования источника:

- `ArtifactTool` / издатель daemon: BridgeClient дополняет `source: 'tool'`, `toolCallId`, `toolName` только для завершенного обновления сессии `ArtifactTool` и устанавливает `trustedPublisher: true` через внутреннюю опцию.
- Другие `ToolResult.artifacts`: копирует поля `ToolArtifact`, дополняет `source: 'tool'`, `toolCallId`, `toolName`, но не устанавливает `trustedPublisher`.
- `record_artifact`: поступает как tool source, аналогично дополняется `source: 'tool'`, `toolCallId`, `toolName: 'record_artifact'`, но `storage: 'published'` не допускается, и `trustedPublisher` установить нельзя.
- hook: копирует выходные artifacts hook, дополняет `source: 'hook'`, `hookName`, `extensionId`; если hook может получить контекст вызвавшего инструмента, можно также дополнить `toolCallId` / `toolName`. Bridge должен выводить `source: 'hook'` из контекста транспорта, а не доверять полю `source` в payload.
- client POST: копирует body, дополняет `source: 'client'`, `clientId`, `storage: 'published'` не допускается, и `trustedPublisher` установить нельзя.
- `receivedSeq`: присваивается bridge/store при получении входных данных как монотонно возрастающее значение для детерминированного упорядочивания в рамках одной партии; внешние входные данные не могут указывать это поле.
- BridgeClient не должен делать выводы о `trustedPublisher` на основе `source`, `storage`, `managedId`, `url`, `trustedPublisher` или других полей `_meta.artifacts[*]` внутри payload artifact. Единственное исключение в V1 — упомянутый выше сигнал завершенного обновления сессии `ArtifactTool`.

Правила дополнения:

- `id`: генерируется с помощью identity hash из раздела 7.
- `source`: определяется контекстом точки входа: `tool` для tool result / ArtifactTool, `hook` для hook, `client` для client POST.
- `toolCallId` / `toolName`: дополняются из контекста вызова инструмента; для точек входа hook/client не заполняются, если контекста нет.
- `hookName` / `extensionId` / `clientId`: дополняются при наличии контекста, используются для аудита и группировки в UI.
- `createdAt`: записывается при первом upsert.
- `updatedAt`: обновляется при каждом upsert.
- `status`: при upsert workspace artifact выполняется best-effort stat; если файл существует и проверка containment пройдена, то `available`, если не существует или обнаружен выход за пределы symlink, то `missing`; для managed / URL artifact в V1 локальный stat не выполняется, всегда `available`.
- Значения по умолчанию для `storage`:
  - `workspace`, если есть `workspacePath`.
  - Если есть `storage: 'published'`, оно должно исходить от `trustedPublisher`, иначе валидация не пройдена.
  - `managed`, если есть `managedId` и нет `url`.
  - `external_url`, если есть `url`.
  - Результаты публикации `ArtifactTool` явно используют `published`.
- Значения по умолчанию для `kind`:
  - `html`, если `storage: 'published'` и нет явного `kind`.
  - `link`, если есть `url` и нет `workspacePath`.
  - Если есть `workspacePath`, определяется по расширению: `.html` -> `html`, расширения изображений -> `image`, видео -> `video`, аудио -> `audio`, `.pdf` -> `pdf`, `.ipynb` -> `notebook`, иначе `file`.
  - Если определить невозможно, то `other`.

### 5.4 Ограничения полей

- `workspacePath` отображается наружу только для файлов внутри workspace и должен быть путем относительно workspace.
- `managedId` — это ссылка на артефакт, управляемый daemon/qwen-home, и не может быть абсолютным путем на локальной машине.
- `url` принимает только явно зарегистрированные URL или URL, опубликованные через ArtifactTool.
- `workspacePath`, `managedId`, `url` — должен и может существовать только один основной локатор (primary locator); V1 отклоняет обычные входные данные с несколькими основными локаторами одновременно, чтобы избежать генерации нескольких identity для одного логического ресурса по разным полям.
- Единственное исключение — доверенный `storage: 'published'`: `url` является основным локатором, `managedId` может возвращаться вместе с ним как опциональная управляемая ссылка для будущих загрузок/предпросмотров; в этом случае identity вычисляется только по `url`, `managedId` не участвует в identity. Это исключение принимает только внутренние входные данные с `trustedPublisher: true`.
- Обычные инструменты не должны возвращать `~/.qwen`, `/tmp` или другие абсолютные пути локальной машины в качестве `workspacePath`.
- `title` обязателен, длина после trim от 1 до 200 символов, управляющие символы ASCII не допускаются; это plain text, он не несет семантики HTML или markdown.
- `description` — это вспомогательный plain text для UI, он не попадает в контекст модели.
- `description` после trim максимум 1000 символов, управляющие символы ASCII не допускаются, не несет семантики HTML или markdown.
- `metadata` должен быть небольшим объектом, допускаются только примитивные значения.
- В `metadata` не помещаются секреты, токены, cookie, приватные ключи для подписей.
- `sizeBytes` вычисляется по принципу best-effort.
- `DaemonSessionArtifactsEnvelope` не возвращает абсолютный `workspaceCwd` хост-машины; client полагается только на относительные пути, такие как `workspacePath`, и поле `storage` для отображения.

## 6. Источники сбора Artifact

### 6.1 Точки вывода файлов

V1 не выводит artifact автоматически из обычных инструментов редактирования файлов.

Не выводятся автоматически:

- `ToolNames.WRITE_FILE`
- `ToolNames.EDIT`
- `ToolNames.NOTEBOOK_EDIT`
- `read_file`
- `grep_search`
- `glob`
- `list_directory`
- `web_fetch`
- `run_shell_command`

Причины:

- Обычное редактирование исходного кода, изменение конфигураций, исправление тестов относятся к истории file change / diff / patch.
- Автоматическое помещение каждого изменения исходного кода на панель artifacts создаст много шума.
- Правая панель результатов должна быть зарезервирована для переиспользуемых, предварительно просматриваемых, загружаемых или доступных для совместного использования выходных данных сессии.

Условия, при которых файлы могут попасть в artifact store:

- Результат инструмента явно возвращает `ToolResult.artifacts`.
- Выходные данные, опубликованные через `ArtifactTool`.
- Явная регистрация через `record_artifact` / hook / client POST в V1.
- Если в будущем потребуется удобное автоматическое создание, разрешается только генерация выходных файлов, и результат инструмента или структурированные metadata должны быть помечены как artifact; не следует делать выводы по умолчанию из обычного `WRITE_FILE` / `EDIT`.

Примеры генерируемых выходных данных:

- report: `.html`, `.pdf`, `.md`
- media: `.png`, `.jpg`, `.mp4`, `.mp3`
- office/data: `.xlsx`, `.docx`, `.pptx`, `.csv`
- notebook: сгенерированный как результат работы `.ipynb`

Даже для notebook нужно различать «редактирование существующего исходного файла notebook» и «генерацию notebook artifact для просмотра/загрузки пользователем».

### 6.2 ArtifactTool

После успешной публикации `ArtifactTool` возвращает:

```ts
artifacts: [
  {
    kind: 'html',
    storage: 'published',
    title,
    url,
    managedId,
    mimeType: 'text/html',
  },
];
```

Сохраняются существующие `llmContent`, `returnDisplay`, `resultFilePaths` для обеспечения совместимости.

Текущий локальный издатель `ArtifactTool` может записывать содержимое в управляемый каталог в qwen home и возвращать `file://` или удаленный URL. Daemon artifact API не должен раскрывать абсолютные пути локальной машины qwen home как `workspacePath`; следует использовать:

- `storage: 'published'`
- `url`: опубликованный доступный URL, также являющийся основным локатором для опубликованных artifact
- `managedId`: опциональная внутренняя управляемая ссылка, не участвующая в identity
- BridgeClient устанавливает `trustedPublisher: true` через внутреннюю опцию для завершенного обновления сессии `ArtifactTool`. Bridge не должен выводить этот флаг из параметров модели, payload hook, body client POST или обычных полей `_meta.artifacts[*]`.

Если в будущем потребуется, чтобы daemon client загружал или просматривал управляемое содержимое, следует добавить специальный managed artifact route, а не помещать абсолютные пути локальной машины в публичные artifact.

### 6.3 Инструмент record_artifact

В качестве точки входа для явной регистрации модели/skill в V1 добавляется легкий встроенный инструмент:

```ts
ToolNames.RECORD_ARTIFACT = 'record_artifact';
```

Назначение:

- Явная регистрация моделью артефактов, не являющихся файлами.
- skill / agent.md может требовать от модели вызова этого инструмента после формирования бизнес-URL.
- Каждый вызов регистрирует только один artifact; пакетная регистрация выполняется путем многократного вызова инструмента моделью, чтобы избежать двусмысленности обратной связи при частичном успехе/ошибке в одном вызове инструмента.
- Не выполняет сетевых запросов.
- Не записывает файлы в workspace.
- Записывает только индекс session artifact.

Параметры:

```ts
interface RecordArtifactParams {
  title: string;
  description?: string;
  kind?: ToolArtifactKind;
  storage?: Exclude<ToolArtifactStorage, 'published'>;
  workspacePath?: string;
  managedId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
```

Пример:

```json
{
  "title": "Детали ресурса профиля пользователя",
  "description": "Страница деталей ресурса производственной среды внутренней платформы данных",
  "kind": "link",
  "storage": "external_url",
  "url": "https://platform.example.com/resources/user-profile?env=prod",
  "mimeType": "text/html",
  "metadata": {
    "resourceType": "data_platform_resource",
    "env": "prod"
  }
}
```

Возвращает:

```ts
return {
  llmContent: {
    recorded: true,
    title: params.title,
    location: params.workspacePath ?? params.managedId ?? params.url,
    note: 'The daemon will expose the assigned artifact id through artifact_changed and list APIs.',
  },
  returnDisplay: 'Записанный artifact: Детали ресурса профиля пользователя',
  artifacts: [params],
};
```

`record_artifact` выполняет валидацию на уровне параметров перед возвратом; при ошибке возвращает ошибку инструмента, `ToolResult.artifacts` не создается. Поскольку один вызов создает только один artifact, в V1 не нужно определять пакетный частичный успех. Назначаемый сервером `id` генерируется daemon store и предоставляется client через `artifact_changed` / `GET /session/:id/artifacts`.

`record_artifact` не принимает `storage: 'published'`, а также не принимает исключение для опубликованных `url + managedId`. Модель/skill может регистрировать только workspace, managed или external URL artifact; артефакты публикации должны исходить от ArtifactTool / издателя daemon.

Рекомендации по разрешениям:

- Не рекомендуется регистрировать по умолчанию для всех сессий; должно быть feature-gated или явно включаться skill/extension.
- Если включено, можно по умолчанию ставить `allow`, так как это изменяет только метаданные UI сессии.
- URL не открываются автоматически.
- Client отображает хост, чтобы пользователь мог распознать цель перед нажатием.
- Если в будущем будет разрешен `file://`, он должен разрешать только файлы внутри workspace; в V1 не рекомендуется, чтобы `record_artifact` принимал URL `file://`.
- Как и для hook/client POST, должна проходить единая валидация artifact.

### 6.4 Выходные artifacts hook

В качестве расширения точки входа для явной регистрации hook/extension в V1. Текущие hooks уже поддерживают command/HTTP/function/prompt, и command/HTTP hook могут возвращать JSON `HookOutput`. Рекомендуется расширить `hookSpecificOutput`:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "Детали задачи планировщика",
        "url": "https://ops.example.com/task/task_123",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "scheduler_task"
        }
      }
    ]
  }
}
```

Подходящие сценарии:

- PostToolUse hook наблюдает за выводом какого-либо MCP/инструмента и формирует бизнес-URL согласно правилам организации.
- extension предоставляет hooks, которые внедряют URL внутренних корпоративных ресурсов в правую панель результатов.
- В frontmatter skill регистрируется PostToolUse hook для автоматической регистрации artifacts на время действия skill.
- После сбоя инструмента PostToolUse hook регистрирует трассировку ошибки, дашборд неудачных запусков или ссылки для устранения неполадок.
- PostToolBatch artifacts подключаются только если во время конкретного запуска существует реальная точка вызова PostToolBatch и результаты могут быть отправлены в daemon bridge; основная сессия daemon ACP в V1 не предполагает существования этого канала.

Необходимые изменения в коде:

- `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `mergeWithOrLogic()` в `packages/core/src/hooks/hookAggregator.ts` должен добавить логику конкатенации для `artifacts`, а не использовать существующее правило last-writer-wins для `hookSpecificOutput`.
- Добавить `artifacts?: ToolArtifact[]` в `PostToolUseHookResult` / `PostToolBatchHookResult` в `packages/core/src/core/toolHookTriggers.ts`.
- `firePostToolUseHook()` возвращает `artifacts?: ToolArtifact[]`.
- `firePostToolBatchHook()` возвращает `artifacts?: ToolArtifact[]`.
- `packages/core/src/core/coreToolScheduler.ts` должен быть включен в план реализации, так как это точка вызова `firePostToolBatchHook()`, а также имеет независимый путь `firePostToolUseHook()`.
- Извлечь общий `collectHookArtifacts()` или эквивалентный helper, чтобы `coreToolScheduler.ts` и ACP `Session.ts` могли переиспользовать одну и ту же предварительную логику extraction / validation для двух путей PostToolUse, избегая расхождения поведения.
- `Session.runTool()` собирает artifacts из результата инструмента и artifacts из hook, но они используют разные механизмы передачи: artifacts из результата инструмента поступают только из успешно завершенного результата инструмента; artifacts из hook не зависят от успеха инструмента и могут попасть в store даже при сбое.
- В ACP `Session.runTool()` artifacts, содержащиеся в успешном результате инструмента, по-прежнему прикрепляются к `tool_call_update._meta.artifacts`; artifacts, возвращаемые хуками PostToolUse / PostToolUseFailure, отправляются отдельно через `client.extNotification('qwen/notify/session/artifact-event', payload)`. Это уведомление должно синхронно ожидаться (await) после завершения сбора artifacts hook; сбой при отправке только записывается в warning и не изменяет исходный результат сбоя/успеха инструмента; эти artifacts hook не попадают в daemon store, в V1 повторные попытки не выполняются.
- artifacts hook проходят ту же валидацию, что и `record_artifact` / client POST: схема URL, containment пути workspace, размер/тип metadata.
- Для batch-level artifacts, когда нет единого вызова инструмента, `qwen/notify/session/artifact-event` можно использовать только если во время запуска уже есть возможность отправить ACP `extNotification` в bridge.
`qwen/notify/session/artifact-event` payload:

```json
{
  "artifacts": [
    {
      "kind": "link",
      "storage": "external_url",
      "title": "批处理任务详情",
      "url": "https://ops.example.com/task/batch_123",
      "mimeType": "text/html"
    }
  ],
  "source": "hook",
  "hookEventName": "PostToolBatch",
  "hookName": "task-artifacts",
  "extensionId": "example-extension"
}
```

Транспортные соглашения:

- `qwen/notify/session/artifact-event` — это ACP `extNotification`, а не SSE-событие и не клиентский HTTP-маршрут.
- wire format переиспользует существующие соглашения для уведомлений `qwen/notify/session/*`; например, уже имеющийся в bridge паттерн demux для session notifications.
- Отправителем может быть только runtime или extension bridge, который уже находится внутри канала ACP session и способен отправлять `extNotification`. ACP `Session.ts` может отправлять это уведомление; `coreToolScheduler.ts` сам по себе не может напрямую отправлять это уведомление в основную сессию daemon.
- `BridgeClient` выполняет demux по имени уведомления в существующей ветке обработки `extNotification`: при получении `qwen/notify/session/artifact-event` он читает payload, преобразует его в `SessionArtifactInput[]` и передает в единый ingest pipeline.
- Bridge должен выводить `source: 'hook'` из notification transport context, а `source` в payload служит только для обратной совместимости; если source в payload не совпадает с transport context, bridge перезаписывает его на `hook` и логирует debug/warning. Notification payload не может устанавливать `trustedPublisher`; если передается `storage: 'published'`, это обрабатывается как ошибка валидации для обычного untrusted input.

Примечание: `qwen/notify/session/artifact-event` — это лишь транспортный envelope для explicit artifacts, он не должен создавать второй pipeline для store/validation/dedupe. BridgeClient должен преобразовывать `_meta.artifacts`, hook artifacts и `artifact-event.artifacts` в один и тот же `SessionArtifactInput[]`, вызывать один и тот же `ingestArtifacts()` / `SessionArtifactStore.upsertMany()` и переиспользовать единую логику validation, normalization, enrichment, eviction и публикации `artifact_changed`. В основной сессии ACP сейчас нет callsite для PostToolBatch, поэтому batch hook из `coreToolScheduler.ts` нельзя считать источником по умолчанию для панели daemon artifacts; если в будущем потребуется поддержка batch artifacts для основной сессии daemon, сначала необходимо добавить реальные точки вызова и тесты. Не-ACP runtime без artifact notification sink не может заявлять о поддержке daemon hook artifacts.

### 6.5 Прямая вставка от Client / Extension

Для сценариев, где не требуется вызов инструмента моделью, предоставляется:

```http
POST /session/:id/artifacts
```

Подходит для:

- Добавления URL текущего открытого превью в область артефактов из плагина IDE.
- Ручного добавления ссылки на ресурс пользователем WebUI.
- Регистрации ресурсов платформы из channel plugin или внешней интеграции в процессе выполнения задачи.

Отличия от вывода hook:

- Вывод hook подходит для внутренней цепочки выполнения агента.
- POST-маршрут подходит для daemon client / UI / внешних интеграций.
- POST body должен проходить единую валидацию артефактов, произвольные локальные абсолютные пути или неподдерживаемые URL-схемы не допускаются.

## 7. Store и дедупликация

identity артефакта:

- файлы workspace: `sessionId + ':workspace:' + normalizedWorkspacePath`
- managed файлы: `sessionId + ':managed:' + normalizedManagedId`
- external / published URL: `sessionId + ':url:' + identityUrl`

identity описывает только расположение ресурса и не включает `source`. Регистрации от tool, hook и client для одного и того же URL или пути объединяются в один артефакт, чтобы избежать дублирования одного ресурса на правой панели. V1 не поддерживает `provenance[]`, уровни доверия или классы retention; первая успешная регистрация определяет поля отображения и поля аудита источника для данного артефакта, а последующие регистрации с тем же identity лишь означают, что «один и тот же ресурс был замечен снова».

Входные данные должны содержать ровно одно поле-локатор:

- `workspacePath`
- `managedId`
- `url`

Если входные данные содержат несколько primary locator, V1 сразу отклоняет их, вместо того чтобы угадывать identity по приоритету. Это позволяет избежать ситуации, когда артефакт сначала дедуплицируется по `workspacePath`, а затем по `url`, что приводит к дублированию.

`storage: 'published'` — единственное исключение: он должен содержать `url` в качестве primary locator и может дополнительно содержать `managedId` как managed reference. Published identity по-прежнему вычисляется по `url`; `managedId` используется только для будущих загрузок/превью и не участвует в дедупликации. Это исключение принимает только входные данные с внутренним `trustedPublisher: true`; если hook, client POST, `record_artifact` или обычный инструмент возвращает `storage: 'published'`, это обрабатывается как ошибка валидации.

Внешний id:

- Первые 12 символов sha256 от identity.

### 7.1 Нормализация

`normalizedWorkspacePath`:

- Входные данные должны быть workspace-relative path; если на вход подан абсолютный путь, сначала предпринимается попытка преобразовать его в workspace-relative path, при неудаче — отклонение.
- Используется `path.resolve(workspaceCwd, input)` для получения абсолютного пути.
- Проверяется, что resolved path находится внутри workspace: `path.relative(workspaceCwd, resolved)` не должен начинаться с `..` и не должен быть абсолютным путем.
- Если цель существует, с помощью `fs.realpath` проверяется, что конечная цель symlink все еще находится внутри workspace; если symlink указывает за пределы workspace, запрос отклоняется.
- Если цель не существует, registration может сохранить этот артефакт, но его начальный `status` должен быть `missing`; нельзя пропускать проверку containment symlink из-за сбоя `realpath`. При последующем обновлении GET TTL необходимо повторно выполнить ту же проверку containment + realpath.
- Если при обновлении обнаруживается, что путь стал symlink, указывающим за пределы workspace, артефакт сохраняется, но его `status` меняется на `missing`, а best-effort `sizeBytes` очищается; V1 никогда не сообщает этот путь как `available`.
- В выводе единообразно используется POSIX slash, начальный `./` удаляется.
- Сворачивание регистра не выполняется; даже если файловая система macOS по умолчанию нечувствительна к регистру, identity различаются как строки, чтобы избежать несогласованности поведения между платформами.

`normalizedManagedId`:

- Сначала во входных данных выполняется trim ASCII whitespace.
- После trim строка не должна быть пустой, длина не более 200 символов.
- ASCII control characters отклоняются.
- Отклоняются `/`, `\`, `..`, не допускается выражение иерархии путей или семантики локального абсолютного пути.
- Сворачивание регистра не выполняется, identity различаются как строки.
- Публичный `managedId` возвращает нормализованное значение.

`identityUrl` и `url`:

- Используется парсинг через WHATWG `new URL(input)`, нестрогие проверки вроде `startsWith('http')` запрещены.
- За исключением trusted published URL из `ArtifactTool`, для обычных link-артефактов разрешены только `http:` / `https:`.
- Поле `url` сохраняет очищенный кликабельный URL для открытия клиентом; не нужно переписывать identity в кликабельный URL.
- Для вычисления identity дополнительно используется внутренний `identityUrl`, который не возвращается как публичное поле.
- scheme и host в нижнем регистре.
- Нормализация портов по умолчанию: `https:443` / `http:80` не сохраняются.
- Fragment сохраняется; в hash-routed SPA fragment может быть частью identity ресурса.
- Исходный порядок query-параметров сохраняется; некоторые платформы чувствительны к порядку query, V1 не выполняет сортировку query.
- `username` / `password` отклоняются или очищаются, URL userinfo не сохраняется в artifact store.

Поведение при дедупликации:

- Первая регистрация: `created`
- Повторная регистрация с тем же identity: `updated`
- `createdAt` остается неизменным.
- `updatedAt` обновляется, но не участвует в сортировке для eviction.
- В рамках одного `upsertMany()` входные данные сначала объединяются по identity; владелец для одного identity определяется по входу с наименьшим `receivedSeq`, если `receivedSeq` отсутствует, используется порядок входного массива. BridgeClient не должен бесконтрольно объединять артефакты из разных transport events; если объединение необходимо, сначала нужно назначить `receivedSeq` и отсортировать. Каждый итоговый identity генерирует только одну change в `changes[]`. Если этого identity не существовало до текущей батч-обработки, то это `created`, иначе — `updated`.
- Для полей отображения `title`, `description`, `source`, `toolCallId`, `toolName`, `hookName`, `extensionId`, `clientId` действует принцип first-writer-wins, они не перезаписываются последующими входами с тем же identity.
- Поля самого ресурса допускают безопасное обновление: при апгрейде identity с тем же URL с `external_url` до `published` можно обновить `storage`, добавить `managedId`, обновить `kind` / `mimeType` / `sizeBytes`, а также позволить publisher перезаписать `title` / `description`, чтобы заголовки-заглушки для ссылок навсегда не перекрывали реальные публикации. Этот апгрейд принимает только входы с `storage: 'published'` и внутренним `trustedPublisher: true`.
- Дополнение `managedId` с пустого значения до published managed reference допускается; существующий `managedId` не перезаписывается последующими обычными входами.
- `status` и `sizeBytes` — это best-effort производные поля daemon, они могут обновляться при workspace stat или published artifact enrichment.
- `metadata` сохраняет небольшие объекты, прошедшие валидацию при первой регистрации; последующие входы с тем же identity только с `source: 'tool'` или `source: 'client'` могут выполнять контролируемое обогащение: добавлять только несуществующие ключи, не перезаписывать существующие, после объединения повторно проверять ограничение primitive-only и общий размер 4 КБ. Обогащение metadata hook для существующего артефакта по умолчанию игнорируется. Если после объединения лимит превышен, отбрасывается только текущее обогащение metadata с записью warning, а другие безопасные обновления артефакта могут продолжаться.
- client POST с тем же identity не перезаписывает поля отображения и не изменяет `retentionSource`; он только устанавливает внутренний `clientRetained` в `true`, чтобы выразить намерение пользователя на ручное сохранение.
- Реализация должна обрабатывать данные синхронно в рамках одного `SessionArtifactStore.upsertMany()`, чтобы избежать гонок при асинхронном чтении-изменении-записи.

Внутренние поля store:

- `retentionSource`: `source` первой успешной регистрации, присваивается при создании и в дальнейшем не изменяется из-за client POST или повторного upsert.
- `clientRetained`: булево значение, изначально `source === 'client'`; устанавливается в `true` при любом client POST, прошедшем через mutation gate и попавшем на тот же identity. `clientRetained` не изменяет поля отображения и не мигрирует bucket `retentionSource`.
- `insertSeq`: монотонно возрастающий порядковый номер внутри store, присваивается один раз при создании артефакта и никогда не обновляется.
- `receivedSeq`: порядок приема входных данных, используется только для детерминированного coalescing в рамках одной батч-обработки, не возвращается как публичное поле.

Квоты и политики хранения:

- Максимум 200 артефактов на сессию.
- V1 использует soft source reservation, резервирование распределяется по внутреннему `retentionSource`:
  - `tool`: 100
  - `client`: 50
  - `hook`: 50
- reservation — это минимальная гарантированная квота, а не жесткий лимит; неиспользованная квота может быть позаимствована другими источниками до достижения глобального лимита в 200.
- При создании нового артефакта, из-за которого общее количество превышает 200, кандидаты на eviction выбираются в следующем порядке. Новые артефакты, созданные в текущей батч-обработке `upsertMany()`, по умолчанию не попадают в пул кандидатов; eviction сначала выбирает кандидатов только среди артефактов, существовавших до начала этой батч-обработки. Таким образом, новый missing-артефакт, зарегистрированный в этой батч-обработке, может вытеснить из переполненного store старый, но все еще live-артефакт; это выбор V1 для обеспечения видимости текущих явных артефактов.
  1. В первую очередь удаляются артефакты со `status: 'missing'` и `clientRetained === false`.
  2. Затем удаляются артефакты с `clientRetained === false` из источников, количество `retentionSource` которых превышает reservation.
  3. Далее удаляются самые старые артефакты с `clientRetained === false`.
  4. Если все артефакты имеют `clientRetained === true`, удаляется самый старый client-retained артефакт.
- Перед использованием приоритета cached `missing` для eviction, необходимо выполнить best-effort status refresh / containment check для workspace-артефактов, которые собираются стать кандидатами; если после обновления статус стал `available`, его нельзя продолжать удалять в приоритете как missing. При сбое обновления сохраняется исходное cached состояние.
- `clientRetained` — это предпочтение при удалении в последнюю очередь, а не бесконечный pin, он не нарушает глобальный лимит в 200 или soft reservation. Когда все артефакты являются client-retained, удаление все равно происходит по самому старому client-retained артефакту.
- Если после удаления старых артефактов новые артефакты, созданные в этой батч-обработке, все равно превышают оставшуюся емкость, store должен перед генерацией `changes[]` сохранить первые N новых identity согласно `receivedSeq` / порядку ввода, отбросить превышающие лимит входы из этой батч-обработки и записать warning/diagnostics. Отброшенные новые входы не попадают в store и не генерируют change `created` или `removed`, поэтому в рамках одной мутации для одного identity не возникнет ситуации, когда после `created` сразу идет `removed`.
- Сортировка «самый старый» использует `(createdAt, insertSeq)`, где `insertSeq` — это монотонно возрастающий порядковый номер внутри store, используемый как стабильный tiebreaker для входов в одну миллисекунду или в одной батч-обработке.
- Повторная регистрация с тем же identity обновляет `updatedAt`, но eviction не смотрит на `updatedAt`; поэтому другие источники не могут зафиксировать старый артефакт в наборе сохраняемых с помощью частых повторных регистраций.
- Возвращается в порядке возрастания `createdAt`.
- При удалении для каждого удаленного артефакта должно отправляться `artifact_changed` / `removed`. V1 не предоставляет других событий удаления.
- Значения reservation, `retentionSource`, `clientRetained` и `insertSeq` — это детали реализации V1, а не поля wire protocol; в дальнейшем можно корректировать значения по умолчанию или добавлять более детальные per-producer квоты без изменения формы API.

### 7.2 Ограничения жизненного цикла V1

Store в V1 представляет собой индекс в памяти для live bridge session:

- После перезапуска bridge/session артефакты не восстанавливаются.
- После переподключения клиента при разрыве SSE следует повторно выполнить `GET /session/:id/artifacts` для snapshot sync.
- V1 не требует дополнительного события `artifacts_reset`; если в будущем будет поддерживаться режим работы, при котором сессия продолжает существовать, но artifact store очищается, тогда нужно будет добавить `artifacts_reset` или эквивалентное событие snapshot-invalidated.
- Историческое восстановление, межпроцессное сохранение и replay загрузки сессии относятся к последующим этапам.

## 8. Внутренняя цепочка реализации

Следующие Phase — это порядок инженерной реализации единой полной функциональности V1, они не подразумевают разделения на несколько версий для внешних пользователей. PR с реализацией можно разбивать на мелкие части по Phase, но объединенной базой дизайна является полная функциональность session artifacts.

### 8.1 Phase A: core types и ArtifactTool

Изменения:

- `packages/core/src/tools/tools.ts`
  - Добавление `ToolArtifactKind`, `ToolArtifactStorage`, `ToolArtifact`.
  - Расширение `ToolResult.artifacts?`.
- `packages/core/src/tools/artifact/artifact-tool.ts`
  - Заполнение `artifacts` после успешного publish.
  - Использование `storage: 'published'`, локальные пути qwen home не раскрываются как `workspacePath`.

В Phase A сначала подключаются `ToolResult.artifacts` и `ArtifactTool`; `record_artifact` подключается в Phase D, но все равно относится к той же полной функциональности V1.

### 8.2 Phase B: cli ACP session metadata

Изменения:

- `packages/cli/src/acp-integration/session/types.ts`
  - `ToolCallResultParams.artifacts?`
- `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`
  - `_meta.artifacts = params.artifacts`
- `packages/cli/src/acp-integration/session/Session.ts`
  - Сбор `toolResult.artifacts` после успешного выполнения инструмента.
  - Артефакты PostToolUse hook собираются независимо от успеха/неуспеха инструмента и используются для диагностики сбоев, таких как error trace / dashboard.
  - Артефакты hook на пути выполнения с ошибкой не могут зависеть от метаданных успешного result; при необходимости напрямую вызывается bridge artifact ingest.
  - Артефакты не выводятся автоматически из обычных `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT`.
  - Передача в `emitResult()`.

### 8.3 Phase C-1: acp-bridge store и events

Добавления:

- `packages/acp-bridge/src/sessionArtifacts.ts`
  - Типы
  - normalize
  - validation
  - id/hash
  - `SessionArtifactStore`

В Bridge session entry добавляется:

```ts
artifacts: SessionArtifactStore;
```

В Bridge interface добавляется:

```ts
getSessionArtifacts(sessionId: string): SessionArtifactsEnvelope;
addSessionArtifacts(
  sessionId: string,
  artifacts: SessionArtifactInput[],
): DaemonSessionArtifactMutationResult;
removeSessionArtifact(
  sessionId: string,
  artifactId: string,
): DaemonSessionArtifactMutationResult;
```

BridgeClient:

- Извлечение артефактов из `session_update/tool_call_update._meta.artifacts`.
- Извлечение explicit notification artifacts из `qwen/notify/session/artifact-event`.
- Все входные данные преобразуются в один и тот же `SessionArtifactInput[]`.
- Назначение `source` и `receivedSeq` на основе transport context. `trustedPublisher` назначается только через bridge-side ingest option для завершенного session update `ArtifactTool`; BridgeClient не должен делать выводы на основе полей payload артефакта или содержимого обычного `_meta.artifacts`.
- Единый вызов `ingestArtifacts()` / `SessionArtifactStore.upsertMany()`, не нужно создавать второй набор validation или dedupe для notification artifacts.
- `upsertMany()` возвращает `DaemonSessionArtifactMutationResult`, содержащий created/updated, а также removed changes, возникшие из-за eviction.
- Для каждой change публикуется `artifact_changed`, сначала публикуются created/updated, затем removed.
- `removeSessionArtifact()` удаляет артефакт из store, возвращает removed change с `reason: 'explicit'` и публикует `artifact_changed`.

### 8.4 Phase C-2: serve snapshot API

Изменения:

- `packages/cli/src/serve/capabilities.ts`
  - Добавление `session_artifacts`.
- `packages/cli/src/serve/server.ts`
  - Добавление `GET /session/:id/artifacts`.
  - Добавление `DELETE /session/:id/artifacts/:artifactId`.

Поведение GET:

- Если сессия не существует: существующий 404.
- Если нет артефактов: возвращается пустой массив.
- workspace-артефакт поддерживает внутренний status cache, например `lastStatAt`, `lastKnownSizeBytes`, `lastKnownStatus`.
- При upsert выполняется один best-effort stat.
- GET по умолчанию использует cache; обновление по TTL выполняется только при устаревании `lastStatAt`, например, через 5-30 секунд, при этом ограничивается количество параллельных stat. При обновлении необходимо повторно выполнить проверку workspace containment и realpath symlink из Section 7.1.
- При сбое stat: GET возвращает `status: 'missing'`, артефакт не удаляется.
- При успешном stat и прохождении проверки containment / realpath: если до этого cache был `missing`, GET возвращает `status: 'available'`.
- Если при обновлении обнаруживается symlink escape или сбой workspace containment, GET возвращает `status: 'missing'` и не возвращает новые `sizeBytes`.
- GET может тихо обновлять status cache, но не должен публиковать `artifact_changed` из-за запросов на чтение; статус V1 является eventually consistent для SSE-клиентов.
- Если в будущем потребуются события статуса в реальном времени, `artifact_changed` / `updated` должны публиковаться фоновым обновлением или явной refresh-мутацией, а не в горячем пути чтения GET.
- managed / URL-артефакты не проверяют локальные пути и всегда возвращают `status: 'available'`.

### 8.5 Phase C-3: SDK list/event support
Изменения:

- `packages/sdk-typescript/src/daemon/types.ts`
  - Добавлены типы artifact.
- `packages/sdk-typescript/src/daemon/events.ts`
  - В known event добавлен `artifact_changed`.
- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
  - `listSessionArtifacts(sessionId, opts?, clientId?)`
  - `addSessionArtifact(sessionId, artifact, clientId?)`
  - `removeSessionArtifact(sessionId, artifactId, clientId?)`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
  - `artifacts(opts?)`
  - `addArtifact(artifact)`
  - `removeArtifact(artifactId)`
- `packages/sdk-typescript/src/index.ts`
  - Экспортированы типы.

Одиночный add в SDK маппится на множественную mutation в bridge: `addSessionArtifact(a)` оборачивается в `addSessionArtifacts(sessionId, [a])`, возвращая полный `DaemonSessionArtifactMutationResult`, не отбрасывая removed changes, возникшие из-за eviction.

### 8.6 Phase D: явная регистрация record_artifact

Изменения:

- `packages/core/src/tools/tool-names.ts`
  - Добавлено `RECORD_ARTIFACT: 'record_artifact'`.
- Добавлен `packages/core/src/tools/record-artifact.ts`
  - Реализован `RecordArtifactTool`.
  - В параметрах используются `workspacePath` / `managedId` / `url`, произвольные локальные абсолютные пути не принимаются.
  - Не принимается `storage: 'published'` или исключение `url + managedId` для published.
  - Выводит `ToolResult.artifacts`, переиспользуя цепочку V1 store/event/list.
- `Config.createToolRegistry`
  - Регистрация с feature-gate или через opt-in для skill/extension, чтобы не добавлять видимые модели инструменты во все сессии.

### 8.7 Phase E: явная регистрация hook artifacts

Изменения:

- `packages/core/src/hooks/types.ts`
  - `HookOutput.hookSpecificOutput.artifacts?: ToolArtifact[]`.
- `packages/core/src/hooks/hookAggregator.ts`
  - `mergeWithOrLogic()` делает concat для `artifacts` из нескольких хуков, а не использует last-writer-wins.
- `packages/core/src/core/toolHookTriggers.ts`
  - В `PostToolUseHookResult` / `PostToolBatchHookResult` добавлено `artifacts?: ToolArtifact[]`.
- `packages/core/src/core/coreToolScheduler.ts`
  - Перекрывает пути распространения artifacts для PostToolUse / PostToolBatch в core scheduler.
- `packages/cli/src/acp-integration/session/Session.ts`
  - Перекрывает путь распространения artifacts для PostToolUse в ACP session.
- Оба пути PostToolUse переиспользуют один и тот же helper для сбора hook artifacts.
- ACP session V1 не заявляет поддержку PostToolBatch artifacts; если продукт требует batch artifacts для основной сессии daemon, необходимо добавить реальный callsite PostToolBatch в ACP Session, а не полагаться на путь не-daemon основной сессии из `coreToolScheduler.ts`.
- Другие runtime, если у них уже есть batch-level artifact notification, могут отправлять их в bridge через `qwen/notify/session/artifact-event`.
- BridgeClient извлекает batch-level artifacts из `qwen/notify/session/artifact-event`, проходя ту же валидацию и upsert.

### 8.8 Phase F: явная регистрация client POST / SDK add

Изменения:

- `packages/cli/src/serve/server.ts`
  - Добавлен `POST /session/:id/artifacts`, вызывает `mutate({ strict: true })`.
  - Добавлен `DELETE /session/:id/artifacts/:artifactId`, вызывает `mutate({ strict: true })`.
  - Валидация body.
  - source устанавливается в `client`.
  - Преобразуется в одноэлементный `SessionArtifactInput[]`, вызывается `addSessionArtifacts()` в bridge.
  - POST не принимает `storage: 'published'` или `trustedPublisher`.
  - DELETE вызывает `removeSessionArtifact()` в bridge; если artifact уже не существует, возвращает пустой `changes[]` без публикации SSE.
  - Публикуется `artifact_changed`, сначала публикуются created/updated, затем removed.
- Для artifact add не создается новая одиночная bridge mutation; все новые точки входа используют `addSessionArtifacts()` / `upsertMany()`, чтобы избежать расхождений в поведении валидации, coalescing и eviction. Для artifact remove используется отдельный `removeSessionArtifact()`, так как он удаляет по server-assigned artifact id и не участвует в валидации input / coalescing identity.

- В SDK добавлено:
  - `DaemonClient.addSessionArtifact(sessionId, artifact, clientId?)`
  - `DaemonSessionClient.addArtifact(artifact)`
  - `DaemonClient.removeSessionArtifact(sessionId, artifactId, clientId?)`
  - `DaemonSessionClient.removeArtifact(artifactId)`

## 9. Границы безопасности

### 9.1 URL

- Для обычных link artifact разрешены только `http:` / `https:`.
- Необходимо использовать парсинг WHATWG `new URL(input)` и проверять `parsed.protocol`, запрещается проверка по префиксу строки.
- Перед сохранением отклонять или очищать `parsed.username` / `parsed.password`, чтобы избежать утечки учетных данных URL.
- `record_artifact` / hook / client POST не разрешают `file://`.
- Исключение сохраняется для `file://` published URL, возвращаемых `ArtifactTool`, так как они поступают из авторизованного publish; в сценариях с remote daemon следует отдавать приоритет `https:` URL от удаленного издателя.
- Daemon не делает fetch URL.
- Client отображает host.
- URL не открываются автоматически.
- Client не должен автоматически подставлять external URL в `<img>`, `<video>`, `<audio>`, `iframe` или подобные элементы предпросмотра, инициирующие сетевые запросы, из-за `kind: 'image' | 'video' | 'audio' | 'html'`. В V1 для external URL отображаются только иконка, заголовок, host и точка входа для клика; удаленный предпросмотр должен ждать явного клика пользователя или включаться позже через отдельные возможности предпросмотра и политики песочницы.
- Client должен выдавать предупреждение или блокировать приватные адреса, такие как loopback, RFC 1918, link-local, metadata service и т.д.; Daemon V1 не резолвит DNS и не несет окончательной ответственности за защиту от SSRF.

### 9.2 Path

- Наружу возвращается только `workspacePath`, который должен быть workspace-relative path.
- Пути за пределами workspace не раскрываются как file artifact.
- Если в `record_artifact` / hook / client POST передан `workspacePath`, он должен находиться внутри workspace.
- Алгоритм проверки см. в Section 7.1: проверка вложенности `path.resolve` + `path.relative`, при наличии цели выполняется проверка symlink escape через `fs.realpath`; если цели не существует, artifact может попасть в store, но должен быть помечен как `missing`, а последующие GET/status refresh будут повторно запускать ту же проверку.
- Отклоняются `..` escape, escape абсолютными путями, symlink, указывающие за пределы workspace, `~/.qwen`, `/tmp` и другие внешние локальные пути.
- `managedId` может ссылаться только на daemon-managed storage; после trim не может быть пустым, отклоняются разделители путей, `..`, управляющие символы и семантика локальных абсолютных путей.

### 9.3 Metadata

- Ограничение по размеру, например, не более 4 КБ после JSON stringify.
- Разрешены только primitive values.
- Вложенные object/array не разрешены, чтобы не усложнять UI и персистентное хранение.
- Нельзя размещать секреты, токены, cookie, подписанные URL, приватные ключи, учетные данные для доступа.
- Если string value из metadata отображается в UI, он должен рендериться как untrusted plain text или экранироваться; metadata не является точкой расширения для HTML/markdown.
- V1 не предоставляет такие поля без потребителей, как `visibility`, `sensitivity`, `expiresAt`, `sourceId` и т.д.; видимость artifact жестко зафиксирована в семантике current session-local.
- Аудит-измерения обеспечиваются через `source` / `toolCallId` / `toolName` / `hookName` / `extensionId` / `clientId`, `createdAt`, `updatedAt` от первой зарегистрировавшей стороны.
- Последующие регистрации для той же identity по умолчанию не перезаписывают отображаемые поля от первой зарегистрировавшей стороны; единственное исключение — определенное в Section 7 доверенное обновление `external_url -> published`, в этом случае издатель может перезаписать `title` / `description`. Metadata разрешает только контролируемое обогащение, определенное в Section 7, чтобы избежать инъекции metadata из разных источников.

### 9.4 Text Fields

- `title` / `description` — это plain text, не HTML и не markdown.
- Валидация в Daemon должна проверять длину, делать trim, отклонять управляющие символы ASCII; не следует использовать blacklist подстрок как границу безопасности от XSS.
- Все текстовые поля, которые могут попасть в UI, включая `title`, `description`, string value из `metadata`, `toolName`, `hookName`, `extensionId`, `clientId`, client должен рендерить как untrusted text или экранировать как HTML, запрещается прямая вставка через `innerHTML`.

### 9.5 Anti-spam

- Максимум 200 artifacts на сессию.
- Soft reservation по умолчанию: `tool: 100`, `client: 50`, `hook: 50`, неиспользованная квота может быть позаимствована другими источниками.
- `record_artifact` регистрирует только 1 artifact за каждый вызов инструмента.
- `POST /session/:id/artifacts` проходит через существующий rate limit / mutation gate.
- При eviction события `artifact_changed` / `removed` должны отправляться для каждого элемента по отдельности.
- Client может группировать или сворачивать их по source/toolName.

### 9.6 Validation Diagnostics

- При ошибке валидации параметров `record_artifact` возвращается ошибка инструмента, artifact не создается.
- При ошибке валидации body в `POST /session/:id/artifacts` возвращается 400.
- Единичный malformed artifact в `_meta.artifacts`, hook artifacts или `artifact-event` не должен ломать исходное событие tool/session; bridge должен пропустить такой artifact и записать warning-level log.
- Warning log должен содержать как минимум sessionId, source, toolName / hookName / extensionId / clientId, поле с ошибкой и причину; не следует логировать metadata values, похожие на секреты.
- Debug log может записывать отклоненный payload artifact после санитизации и обрезки по длине.
- Если доступна существующая инфраструктура telemetry/metrics, добавьте счетчик отклонений валидации с тегами source и reason; если метрик пока нет, логирование является минимальным требованием для V1.

## 10. Границы с «обычными ссылками»

На правой панели artifacts отображаются только декларативные artifacts; в теле чата по-прежнему могут отображаться обычные ссылки.

Причины, по которым не делается автоматическое извлечение:

- Ссылки на документацию, цитаты, ссылки для отладки из обычных ответов будут массово ошибочно попадать в область artifacts.
- URL может быть примером, шаблоном, незавершенным результатом, выводом ошибки.
- Автоматическое извлечение лишит модель возможности контролировать, «какие ссылки стоит использовать пользователю в дальнейшем».
- С точки зрения безопасности, явная регистрация упрощает маркировку источника и предупреждения в UI.

Если бизнесу критически необходимо извлекать URL из текста, это должно быть реализовано как опциональный UX в Client:

- Отображается только рядом с телом чата.
- Не попадает в daemon artifact store.
- Не триггерит `artifact_changed`.

## 11. Использование в Skill / Agent

После предоставления `record_artifact` в V1, в skill или agent.md можно написать:

```md
Когда ты конструируешь URL бизнес-ресурса, доступный для просмотра пользователем, на основе результатов инструмента, вызови инструмент record_artifact для его регистрации.

Правила регистрации:

- В title используй человекочитаемое название ресурса.
- В kind используй link.
- В storage используй external_url.
- В url используй финальный кликабельный URL.
- В metadata.resourceType укажи тип ресурса, например, data_platform_resource, scheduler_task.
- Не регистрируй обычные ссылки на документацию как artifact.
```

После выполнения моделью:

1. Вызывает бизнес-инструмент и получает ID ресурса, ID задачи, ID узла.
2. Собирает URL по правилам skill.
3. Вызывает `record_artifact`.
4. На правой панели артефактов Daemon появляется эта ссылка.

Этот подход не требует написания hook в skill, а также кода extension/plugin, и лучше всего подходит для большинства бизнес-правил.

## 12. Использование в Hook / Extension

После предоставления hook artifacts в V1, extension может предоставить PostToolUse hook в `qwen-extension.json` или `hooks/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__data_platform__get_resource",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/table-artifact.js"
          }
        ]
      }
    ]
  }
}
```

Текущая замена переменных в extension/hook qwen-code по-прежнему поддерживает `${CLAUDE_PLUGIN_ROOT}`; если позже будет введена новая qwen-specific root переменная, пример можно будет синхронно мигрировать вместе с реализацией.

stdout скрипта:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "artifacts": [
      {
        "kind": "link",
        "storage": "external_url",
        "title": "Детали ресурса профиля пользователя",
        "url": "https://platform.example.com/resources/user-profile",
        "mimeType": "text/html",
        "metadata": {
          "resourceType": "data_platform_resource"
        }
      }
    ]
  }
}
```

Это подходит для корпоративных плагинов: логика «как собрать бизнес-URL из результатов инструмента» фиксируется в extension, а не прописывается в каждый промпт.

## 13. План тестирования

### 13.1 Phase A core

Покрытие:

- Компиляция типов `ToolResult.artifacts`.
- Успешный возврат `ArtifactTool` html artifact с `storage: 'published'`.
- `ArtifactTool` не раскрывает локальный абсолютный путь к qwen home как `workspacePath`.
- Покрытие юнит-тестами правил дефолтного вывода `ToolArtifact.kind` / `storage`.

Команды:

```bash
cd packages/core && npx vitest run src/tools/artifact/artifact-tool.test.ts
```

### 13.2 Phase B cli session

Покрытие:

- `ToolCallEmitter.emitResult()` выводит `_meta.artifacts`.
- `toolResult.artifacts` передается в `emitResult()`.
- Завершенное обновление сессии `ArtifactTool` устанавливает внутренний `trustedPublisher: true` через bridge-side ingest option; `record_artifact`, другие tool result, hook payload, client POST не устанавливают его, и BridgeClient также не может вывести его из полей payload artifact.
- Обычные изменения исходного кода в `write_file/edit/notebook_edit` не генерируют artifact автоматически.
- `read_file/grep/glob/shell` не генерируют artifact.
- При сбое инструмента artifacts из неудачного tool result не собираются; диагностические artifacts, явно возвращенные PostToolUse hook, все еще могут попасть в store.
- Hook artifacts на пути сбоя не зависят от успешного result `_meta.artifacts`.

Команды:

```bash
cd packages/cli && npx vitest run src/acp-integration/session/emitters/ToolCallEmitter.test.ts
cd packages/cli && npx vitest run src/acp-integration/session/Session.test.ts
```

### 13.3 Phase C-1 acp-bridge

Покрытие:

- `SessionArtifactStore` created/updated/removed.
- Enrichment `ToolArtifact` до `DaemonSessionArtifact`.
- `SessionArtifactInput` — это унифицированный внутренний тип input для всех точек входа.
- Дефолтный вывод `kind` / `storage`, покрывает published->html, html/image/video/audio/pdf/notebook/file.
- Дедупликация identity workspacePath / managedId / URL, причем identity не включает source, и регистрация одного и того же ресурса из разных источников объединяется в один artifact.
- Обычные artifacts с несколькими primary locator одновременно отклоняются; только `trustedPublisher: true` и `storage: 'published'` разрешают `url + managedId`, identity определяется только по `url`.
- Подделка `storage: 'published'` в hook, client POST, `record_artifact` или обычном tool result будет отклонена или пропущена с записью warning.
- Нормализация managedId: trim, отклонение пустых значений, отклонение разделителей путей, отклонение `..`, отклонение управляющих символов, без схлопывания регистра.
- Валидация URL: scheme/host в нижнем регистре, нормализация default port, сохранение fragment, сохранение порядка query, отклонение/удаление userinfo.
- `url` сохраняет очищенный кликабельный URL, для identity используется внутренний `identityUrl`, они не смешиваются.
- Валидация Path: `../../etc/passwd`, абсолютные пути за пределами workspace, symlink escape отклоняются; несуществующие пути при попадании в store получают статус `missing`, при GET TTL refresh повторно выполняется проверка containment / realpath.
- Валидация Title/description: ограничение длины, trim, отклонение управляющих символов, plain text, отклонение явных HTML/script payload.
- Валидация Metadata: ограничение размера, только primitive, отклонение вложенных object/array.
- Upsert для одной identity использует first-writer-wins для отображаемых полей и полей источника.
- Identity с тем же URL поддерживает доверенное обновление сущности ресурса `external_url -> published`, дополняя `managedId` / `kind` / `mimeType` и позволяя издателю перезаписывать placeholder `title` / `description`.
- Последующий metadata от tool/client может только добавлять отсутствующие key, но не перезаписывать существующие, после слияния повторно удовлетворяя ограничениям 4 КБ и primitive-only.
- Последующее обогащение metadata от hook по умолчанию игнорируется.
- Повторяющиеся identity в одной пачке определяют владельца по порядку `receivedSeq` / входного массива и генерируют только одну итоговую change в `changes[]`.
- `retentionSource` устанавливается при создании и не обновляется; `clientRetained` отделен от `retentionSource`; `insertSeq` устанавливается при создании и не обновляется.
- Eviction по soft reservation: неиспользованная квота может быть позаимствована, missing удаляются в первую очередь, client-retained в последнюю, стабильная сортировка по `createdAt + insertSeq`, при этом для каждого элемента по отдельности отправляется removed event с `reason: 'eviction'`.
- Перед использованием приоритета missing при eviction обновляется статус кандидатов workspace artifact, чтобы устаревший missing cache не удалял в первую очередь восстановленные файлы.
- Eviction не будет в первую очередь удалять missing artifact, только что созданные в этой пачке; если сама пачка превышает оставшуюся емкость, превышающие новые input этой пачки отбрасываются до генерации changes с записью diagnostics, не генерируя `created` + `removed` для той же identity.
- `clientRetained` не нарушает глобальный лимит в 200; при полном client-retained все равно удаляются самые старые элементы.
- Malformed artifact генерирует warning log / diagnostics, не влияя на исходное событие.
- `_meta.artifacts` записывается в store.
- Публикуется `artifact_changed`.
- `upsertMany()` / `addSessionArtifacts()` возвращают `DaemonSessionArtifactMutationResult`, включающий eviction changes.
- `removeSessionArtifact()` возвращает removed change с `reason: 'explicit'`.

Команды:

```bash
cd packages/acp-bridge && npx vitest run src/sessionArtifacts.test.ts
cd packages/acp-bridge && npx vitest run src/bridgeClient.test.ts
```
### 13.4 Phase C-2 serve

Покрытие:

- `/capabilities` включает `session_artifacts`.
- `GET /session/:id/artifacts` возвращает пустой список.
- Возвращает envelope при наличии artifacts.
- envelope не возвращает абсолютный `workspaceCwd` хост-машины.
- Для неизвестной session возвращает существующую ошибку.
- При обновлении TTL для GET workspace artifact выполняется best-effort stat; для отсутствующих файлов возвращается `status: 'missing'`, после восстановления файла — `status: 'available'`.
- При обновлении TTL для GET повторно выполняется проверка workspace containment / symlink realpath; при symlink escape возвращается `missing`.
- При обновлении статуса GET не публикуется `artifact_changed`; для managed / URL artifact не выполняется локальный stat.
- GET использует status cache / TTL, чтобы избежать синхронного stat для всех artifacts при каждом горячем чтении.

Команды:

```bash
cd packages/cli && npx vitest run src/serve/server.test.ts
```

### 13.5 Phase C-3 SDK

Покрытие:

- Маршрут `listSessionArtifacts()` корректен.
- Сужение типов для известного события `artifact_changed`; artifact в событии представляет собой полный `DaemonSessionArtifact`.
- Публичный index экспортирует новые типы.
- Тип публичного response enum представляет собой open union; клиент имеет fallback для неизвестных kind/status/source/storage.
- SDK singular add оборачивает bridge plural add и возвращает полный mutation result; SDK remove вызывает DELETE route.

Команды:

```bash
cd packages/sdk-typescript && npx vitest run src/daemon/DaemonClient.test.ts
cd packages/sdk-typescript && npx vitest run src/daemon/events.test.ts
```

### 13.6 Phase D/E/F explicit registration tests

`record_artifact`:

- Валидация title / workspacePath / managedId / url.
- Пустые `workspacePath + managedId + url` не допускаются, также не допускается передача нескольких primary locator одновременно в обычных входных данных.
- `storage: 'published'` не допускается.
- Неподдерживаемые URL scheme не допускаются.
- URL userinfo отклоняется или очищается.
- Возвращает `ToolResult.artifacts`.
- `llmContent` возвращает структурированный результат регистрации; за каждый tool call регистрируется только один artifact.

hook artifacts:

- `HookOutput.hookSpecificOutput.artifacts` попадают в `PostToolUseHookResult` / `PostToolBatchHookResult` через `createHookOutput()` и `toolHookTriggers.ts`.
- `mergeWithOrLogic()` в `hookAggregator.ts` выполняет конкатенацию нескольких hook artifacts.
- Оба пути, `coreToolScheduler.ts` и ACP `Session.ts`, могут распространять PostToolUse artifacts.
- Оба пути PostToolUse используют общий helper для сбора hook artifacts.
- ACP main session не объявляет PostToolBatch artifacts; если в будущем будут добавлены реальные callsite, потребуется покрытие unit-тестами.
- PostToolUse / PostToolUseFailure hook artifacts попадают в bridge отдельно через extNotification `qwen/notify/session/artifact-event`, не завися от `_meta.artifacts` успешного tool result.
- Runtime с существующими batch notification может записываться в store через `qwen/notify/session/artifact-event`.
- hook artifacts проходят ту же валидацию, что и другие точки входа.
- `source` в payload hook выводится bridge на основе transport context; подделать tool source или trusted publisher невозможно.
- При сбое инструмента error/dashboard artifact, возвращенный hook, всё равно может попасть в store.

client POST / SDK add:

- `POST /session/:id/artifacts` успешно выполняет upsert.
- `POST` возвращает `DaemonSessionArtifactMutationResult`, содержащий изменения created/updated, а также removed в результате eviction.
- При срабатывании upsert + eviction по `POST` проверяется, что каждый элемент `changes[]` синхронно публикуется как SSE event `artifact_changed`, причем created/updated публикуются раньше removed.
- `POST` отклоняется при отсутствии авторизации / mutation token.
- `POST` возвращает 400 для путей за пределами workspace, path traversal и symlink escape.
- `POST` возвращает структурированный error envelope для `storage: 'published'`, нескольких primary locator и превышения лимита metadata.
- Запись по `POST` выполняется через единственный путь bridge `addSessionArtifacts()`.
- Тело `DaemonClient.addSessionArtifact()` корректно.
- При попадании `DELETE /session/:id/artifacts/:artifactId` возвращается изменение removed с `reason: 'explicit'` и публикуется соответствующий SSE event, при этом базовый файл или URL не удаляются.
- При отсутствии попадания `DELETE /session/:id/artifacts/:artifactId` идемпотентно возвращает пустой `changes[]` без публикации SSE event.

### 13.7 Кросс-пакетные интеграционные тесты

Покрытие полного пайплайна:

1. tool возвращает `ToolResult.artifacts`.
2. `ToolCallEmitter` записывает в `_meta.artifacts`.
3. `BridgeClient` извлекает artifacts из события.
4. `SessionArtifactStore` выполняет validate / normalize / upsert.
5. SSE отправляет `artifact_changed`.
6. `GET /session/:id/artifacts` возвращает тот же artifact.
7. После переподключения клиента при обрыве связи повторное получение snapshot восстанавливает текущее состояние в памяти.
8. При заполнении artifacts до предела и добавлении нового artifact утверждается, что SSE одновременно содержит событие created и событие removed с `reason: 'eviction'`, после чего GET возвращает только усеченное состояние.

### 13.8 Ручная приемка

Сценарий A: Файловые artifacts

1. ArtifactTool публикует `lineage.html`.
2. `GET /session/:id/artifacts` возвращает html artifact с `storage: 'published'`.
3. По SSE приходит `artifact_changed`.

Сценарий B: Обычное редактирование исходного кода не попадает в область artifacts

1. Агент изменяет файлы исходного кода.
2. Изменения файлов / diff отображаются в штатном режиме.
3. Список artifacts не изменяется.

Сценарий C: Явные бизнес-ссылки как artifacts

1. Skill запрашивает у модели сборку URL с деталями внутреннего ресурса.
2. Модель вызывает `record_artifact`.
3. В правой области artifacts появляется link artifact.

Сценарий D: Hook artifacts

1. Расширение регистрирует PostToolUse hook.
2. Hook возвращает artifacts на основе вывода инструмента.
3. В правой области artifacts появляется hook source artifact.

Сценарий E: Обычные ссылки не попадают в область artifacts

1. Ассистент отвечает markdown-ссылкой.
2. Список artifacts не изменяется.

## 14. Критерии приемки

После полной реализации возможностей V1 должно быть выполнено как минимум:

- Существует фича `session_artifacts`.
- `GET /session/:id/artifacts` доступен.
- Событие `artifact_changed` доступно.
- `ArtifactTool` генерирует published html artifact.
- `ToolResult.artifacts` могут попадать в daemon artifact store.
- `record_artifact` может регистрировать link / workspace artifact, при этом регистрация доступна через feature-gate или opt-in.
- Hook может внедрять artifact через `hookSpecificOutput.artifacts`, несколько hook artifacts конкатенируются.
- Клиент может внедрять artifact через `POST /session/:id/artifacts`.
- Клиент может явно удалять ошибочно зарегистрированный artifact через `DELETE /session/:id/artifacts/:artifactId`.
- Обычные `WRITE_FILE` / `EDIT` / `NOTEBOOK_EDIT` не попадают в список artifacts автоматически.
- Обычные текстовые URL ассистента не попадают в список artifacts.
- SDK может выполнять list/add/remove artifacts и распознавать `artifact_changed`.
- SDK remove корректно маппит идемпотентный пустой результат для уже несуществующего artifact.
- Границы безопасности workspacePath / URL / metadata покрыты unit-тестами.
- Нормализация managedId покрыта unit-тестами.
- Логика first-writer-wins для одного identity, published upgrade, controlled enrichment metadata и soft reservation eviction покрыты unit-тестами.
- При eviction клиент уведомляется об удалении по каждой записи.
- При сбое валидации выводятся warning log / diagnostics.
- Три точки входа: hook, client и record_artifact проходят одну и ту же валидацию.
- `npm run build && npm run typecheck` проходят успешно.

## 15. Рекомендуемый порядок внедрения

Для внутренней реализации V1 рекомендуется следующий порядок; это инженерный график, а не разделение возможностей:

1. `ToolArtifact` + `ToolResult.artifacts?`
2. `ArtifactTool` structured artifacts
3. `ToolCallEmitter._meta.artifacts`
4. `Session.runTool()` собирает только `toolResult.artifacts`
5. `SessionArtifactStore` validation / normalize / enrichment / upsert
6. BridgeClient потребляет `_meta.artifacts`
7. `GET /session/:id/artifacts`
8. SDK list/event типы
9. `RecordArtifactTool`
10. hook output artifacts
11. `qwen/notify/session/artifact-event`
12. `POST /session/:id/artifacts`
13. SDK addArtifact
14. Дополнение ссылок на managed / published storage
15. Документация протокола и тесты

## 16. Дальнейшие планы

Phase 2: Восстановление истории

- artifacts записываются в метаданные записи чата.
- HistoryReplayer воспроизводит artifacts.
- Список artifacts может быть восстановлен после `session/load`.

Phase 3: Детали и предпросмотр

- `GET /session/:id/artifacts/:artifactId`
- метаданные предпросмотра.
- Стратегии предпросмотра для изображений/PDF/HTML.

Phase 4: Безопасный динамический предпросмотр

- Изолированный sandbox origin.
- iframe sandbox.
- HTML/React artifact shim.

Phase 5: Долгосрочное хранение

- OSS/MinIO.
- retention policy.
- pin/delete/version history.

## 17. Заключение

Ссылка может быть artifact, но должна быть зарегистрирована явно. Правая область artifacts не должна автоматически собирать все текстовые ссылки.

Для внешних пользователей V1 представляет собой единую возможность, внутренне состоящую из единого store и четырех типов точек входа:

1. **Точка входа инструмента**: `ToolResult.artifacts` / `ArtifactTool` генерируют структурированные метаданные artifact.
2. **Точка входа модели/skill**: инструмент `record_artifact`.
3. **Точка входа hook/extension**: `hookSpecificOutput.artifacts`.
4. **Точка входа клиента**: `POST /session/:id/artifacts`.

Все эти точки входа в конечном итоге попадают в один и тот же `SessionArtifactStore`, запрашиваются через один и тот же `GET /session/:id/artifacts` и обновляют UI через одно и то же SSE-событие `artifact_changed`. Это позволяет охватить бизнес-ссылки, файлы, HTML, изображения, видео и другие artifacts, сохраняя при этом простоту протокола, прозрачность источников и контролируемость границ. Самая важная граница заключается в том, что Artifacts — это явно объявленные session outputs, а не набор всех обычных изменений файлов или обычных ссылок.