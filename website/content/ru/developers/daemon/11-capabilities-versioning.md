# Возможности и версионирование протокола

## Обзор

`GET /capabilities` — это preflight-эндпоинт демона. Каждый клиент SDK должен вызывать его перед обращением к любому другому маршруту, чтобы узнать, какую версию протокола поддерживает демон, какие теги функций включены и к какому рабочему пространству привязан демон. Контракт:

- **Существует только одна версия протокола: `v1`.** `SERVE_PROTOCOL_VERSION = 'v1'` и `SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']`. v1 внутренне аддитивна; критические изменения формы фрейма зарезервированы для v2.
- **У каждого тега есть версия `since`.** Будущие демоны v2 могут анонсировать как теги v1, так и v2.
- **Некоторые теги являются условными.** Тринадцать тегов (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `workspace_voice`, `workspace_voice_transcription`, `session_shell_command`, `rate_limit`, `workspace_reload`, `voice_transcribe`) анонсируются только при включении соответствующего переключателя развертывания. Наличие тега означает, что поведение существует.
- **Тег возможности = контракт поведения.** Добавление нового поведения под существующим тегом может незаметно сломать клиенты, которые делали preflight старого тега. Новое поведение требует нового тега.

Полный реестр находится в `packages/cli/src/serve/capabilities.ts`.

## Обязанности

- Объявлять каждую функцию, которую демон может анонсировать.
- Фильтровать анонсируемые функции по версии протокола и переключателям развертывания.
- Предоставлять `getRegisteredServeFeatures()` (все ключи, без фильтрации), `getAdvertisedServeFeatures(version, toggles)` (с фильтрацией) и `getServeProtocolVersions()` (обертка `{ current, supported }`).
- Сохранять инвариант "тег присутствует — поведение присутствует". `server.test.ts` включает тест, проверяющий, что каждый условный тег анонсируется при включении его переключателя; добавление условного тега без предиката провалит этот тест.

## Архитектура

### Обертка возможностей

`/capabilities` возвращает:

```ts
{
  v: 1,                    // CAPABILITIES_SCHEMA_VERSION
  mode: 'http-bridge',
  features: ServeFeature[],
  workspaceCwd: string,
  protocol?: { current: 'v1', supported: ['v1'] },
  policy?: { permission: PermissionPolicy },
}
```

`workspaceCwd` — это каноническое рабочее пространство, привязанное при запуске демона (см. [`02-serve-runtime.md`](./02-serve-runtime.md)). `policy.permission` — это активная политика медиатора.

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // lists operation modes when a feature has modes
}
```

Четыре тега v1 используют `modes`:

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` — клиенты должны делать preflight для `'enforce'` перед тем как полагаться на поведение отказа.
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` — это набор, поддерживаемый на этапе сборки; активная политика находится в `policy.permission`.
- `workspace_voice_transcription: { since: 'v1', modes: ['batch'] }` — путь транскрибации, который предлагает демон.
- `voice_transcribe: { since: 'v1', modes: ['streaming', 'batch'] }` — два пути транскрибации, доступных в WebSocket `/voice/stream`.

### Условные теги

```ts
export const CONDITIONAL_SERVE_FEATURES: ReadonlyMap<
  ServeFeature,
  (toggles: AdvertiseFeatureToggles) => boolean
> = new Map([
  ['require_auth', (t) => t.requireAuth === true],
  ['mcp_workspace_pool', (t) => t.mcpPoolActive === true],
  ['mcp_pool_restart', (t) => t.mcpPoolActive === true],
  ['allow_origin', (t) => t.allowOriginActive === true],
  [
    'prompt_absolute_deadline',
    (t) => typeof t.promptDeadlineMs === 'number' && t.promptDeadlineMs > 0,
  ],
  [
    'writer_idle_timeout',
    (t) =>
      typeof t.writerIdleTimeoutMs === 'number' && t.writerIdleTimeoutMs > 0,
  ],
  ['workspace_settings', (t) => t.persistSettingAvailable === true],
  ['workspace_voice', (t) => t.persistSettingAvailable === true],
  [
    'workspace_voice_transcription',
    (t) => t.voiceTranscriptionAvailable === true,
  ],
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
  ['voice_transcribe', (t) => t.voiceWsAvailable !== false],
]);
```

`Map` хранит принадлежность и предикат вместе. Добавление нового условного тега требует двух согласованных изменений:

1. Зарегистрировать тег и его версию `since` в `SERVE_CAPABILITY_REGISTRY`.
2. Добавить его предикат в `CONDITIONAL_SERVE_FEATURES`.

Базовые теги отсутствуют в `Map` и анонсируются безусловно. Это намеренно представлено отсутствием, а не отдельным Set.

### 75 тегов (v1, сгруппированы по доменам)

Базовые: `health`, `daemon_status`, `capabilities`.

Сессии: `session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_prompt`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_archive`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_stats`, `session_lsp`, `session_status`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (условный), `session_language`, `session_rewind`, `session_hooks`, `session_branch`.

Стриминг: `slow_client_warning`, `typed_event_schema`.

Идентификация и heartbeat: `client_identity`, `client_heartbeat`.

Разрешения: `session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`).

Read-only снимки рабочего пространства: `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`.

Мутации рабочего пространства (Wave 4+): `workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_tool_toggle`, **`workspace_settings`** (условный), `workspace_permissions`, `workspace_init`, `workspace_github_setup`, `workspace_trust`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, **`workspace_reload`** (условный).

MCP guardrails: **`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_guardrail_events`, `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (условный), **`mcp_pool_restart`** (условный).

Управление промптами: **`prompt_absolute_deadline`** (условный), **`writer_idle_timeout`** (условный), `non_blocking_prompt`.

Аутентификация: `auth_provider_install`, `auth_device_flow`, **`require_auth`** (условный), **`allow_origin`** (условный).

Голос: **`workspace_voice`** (условный), **`workspace_voice_transcription`** (условный, `modes: ['batch']`), **`voice_transcribe`** (условный, `modes: ['streaming', 'batch']`).

Ограничение частоты запросов: **`rate_limit`** (условный).

Теги, выделенные жирным шрифтом, имеют `modes` или являются условными.

## Процесс

### Сторона демона: сборка обертки

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["фильтрация через isFeatureAvailableInProtocol"]
    C --> D["для каждой функции проверка CONDITIONAL_SERVE_FEATURES"]
    D --> E["да: predicate(toggles) ? включить : пропустить"]
    D --> F["нет: включить безусловно"]
    E --> G["возврат ServeFeature[]"]
    F --> G
    G --> H["обертка в envelope:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### Сторона клиента: preflight функций

```mermaid
sequenceDiagram
    autonumber
    participant C as Клиент
    participant D as GET /capabilities
    participant R as Маршрут

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt yes
        C->>R: использование pool-aware форм ответа<br/>(например, entries[] из /workspace/mcp/:server/restart)
    else no
        C->>R: устаревшая форма ответа с одной записью
    end
```

## Состояние и жизненный цикл

- `CAPABILITIES_SCHEMA_VERSION` — это версия формы обертки в сети, в настоящее время `1`. Увеличивайте её только при критическом изменении обертки.
- `SERVE_PROTOCOL_VERSION = 'v1'` — это версия протокол-функций. Добавление функций внутри v1 аддитивно; старые клиенты не увидят нового поведения, если не сделают preflight нового тега. Удаление функции — это критическое изменение для v2.
- `EVENT_SCHEMA_VERSION = 1` — это поле `v` фрейма SSE (см. [`09-event-schema.md`](./09-event-schema.md)). Это независимая ось версий; увеличение версии схемы событий не подразумевает увеличения версии протокола, и наоборот.
- `session_resume` — это стабильная возможность демона для `POST /session/:id/resume`. `unstable_session_resume` продолжает анонсироваться как устаревший псевдоним, поскольку базовый метод ACP по-прежнему называется `connection.unstable_resumeSession`; новые клиенты должны делать feature-detect для `session_resume`.

## Зависимости

- Читается `packages/cli/src/serve/server.ts` при формировании ответов `/capabilities`.
- Входные данные переключателей поступают из `runQwenServe` / `createServeApp`: `{ requireAuth, mcpPoolActive, allowOriginActive, promptDeadlineMs, writerIdleTimeoutMs, persistSettingAvailable, sessionShellCommandEnabled, rateLimit, reloadAvailable }`.
- Активная политика `permission` в обертке берется из `BridgeOptions.permissionPolicy`, который, в свою очередь, читает `policy.permissionStrategy` из `settings.json`.

## Конфигурация

| Источник | Параметр | Влияние на возможности |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CLI флаг | `--require-auth` | Анонсирует `require_auth`. |
| Переменная окружения | `QWEN_SERVE_NO_MCP_POOL=1` | Прекращает анонсирование `mcp_workspace_pool` и `mcp_pool_restart`; события MCP больше не добавляют `scope: 'workspace'`. |
| CLI флаг | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | Не изменяет набор тегов (`mcp_guardrails` анонсируется всегда), но изменяет резервирование для каждого сервера и поведение отказа. |
| CLI флаг / переменная окружения | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` | Анонсирует `rate_limit`. |
| Встроенная опция | `persistSettingAvailable` | Анонсирует `workspace_settings` и `workspace_voice`. |
| Встроенная опция | `voiceTranscriptionAvailable` | Анонсирует `workspace_voice_transcription`. |
| CLI флаг / встроенная опция | `--enable-session-shell` / `sessionShellCommandEnabled` | Анонсирует `session_shell_command`. |
| Встроенная опция | `reloadAvailable` | Анонсирует `workspace_reload`. |
| Встроенная опция | `voiceWsAvailable` | Анонсирует `voice_transcribe`. |
| `settings.json` | `policy.permissionStrategy` | Устанавливает `policy.permission` в обертке. |

## Оговорки и известные ограничения

- **`--require-auth` скрывает preflight.** При использовании `--require-auth` все маршруты, включая `/capabilities`, требуют bearer-аутентификации. Неаутентифицированный клиент не может сделать preflight для `caps.features.require_auth`; тело ответа 401 является поверхностью обнаружения. Тег `require_auth` — это аутентифицированное подтверждение для UI аудита защищенных развертываний.
- **Наличие тега означает существование поведения.** Если будущий контрибьютор добавит поведение под существующим тегом без увеличения `since`, клиенты, сделавшие preflight старого тега, могут незаметно получить новое поведение. Соглашение таково: новое поведение получает новый тег.
- **Теги `unstable_*` могут изменять свою форму между версиями** без увеличения версии протокола. Фиксируйте версию SDK при зависимости от них.
- Каталог маршрутов находится в [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md); эта страница намеренно не дублирует его.

## Ссылки

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts` (сборка обертки)
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- Справочник по wire-протоколу: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- Аутентификация и guardrails развертывания: [`12-auth-security.md`](./12-auth-security.md)