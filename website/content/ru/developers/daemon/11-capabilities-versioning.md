# Возможности и версионирование протокола

## Обзор

`GET /capabilities` — это предварительная конечная точка демона. Каждый клиент SDK должен прочитать её перед вызовом любого другого маршрута, чтобы узнать, какую версию протокола использует демон, какие теги функций включены и к какой рабочей области привязан демон. Контракт:

- **Существует одна версия протокола: `v1`.** `SERVE_PROTOCOL_VERSION = 'v1'` и `SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']`. v1 является аддитивной внутренне; критические изменения формы фрейма резервируются для v2.
- **У каждого тега есть версия `since`.** Будущие демоны v2 смогут рекламировать теги как v1, так и v2.
- **Некоторые теги являются условными.** Десять тегов (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) объявляются только при включении соответствующего переключателя развёртывания. Наличие тега означает, что поведение существует.
- **Тег возможности = контракт поведения.** Добавление нового поведения под существующий тег может незаметно сломать клиентов, которые предварительно проверили старый тег. Для нового поведения требуется новый тег.

Полный реестр находится в `packages/cli/src/serve/capabilities.ts`.

## Обязанности

- Объявлять каждую функцию, которую демон может рекламировать.
- Фильтровать рекламируемые функции по версии протокола и переключателям развёртывания.
- Предоставлять `getRegisteredServeFeatures()` (все ключи, без фильтрации), `getAdvertisedServeFeatures(version, toggles)` (с фильтрацией) и `getServeProtocolVersions()` (конверт `{ current, supported }`).
- Сохранять инвариант «тег присутствует — поведение присутствует». `server.test.ts` включает тест, который проверяет, что каждый условный тег рекламируется, когда его переключатель включён; добавление условного тега без предиката приводит к провалу этого теста.

## Архитектура

### Конверт возможностей

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

`workspaceCwd` — это каноническая рабочая область, привязанная при запуске демона (см. [`02-serve-runtime.md`](./02-serve-runtime.md)). `policy.permission` — это активная политика посредника.

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // lists operation modes when a feature has modes
}
```

Два тега v1 используют `modes`:

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` — клиенты должны предварительно проверять `'enforce'`, прежде чем полагаться на поведение отказа.
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` — это поддерживаемый на этапе сборки набор; активная политика находится в `policy.permission`.

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
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
]);
```

`Map` хранит членство и предикат вместе. Добавление нового условного тега требует двух согласованных изменений:

1. Зарегистрировать тег и его версию `since` в `SERVE_CAPABILITY_REGISTRY`.
2. Добавить его предикат в `CONDITIONAL_SERVE_FEATURES`.

Базовые теги отсутствуют в `Map` и рекламируются безусловно. Это намеренно представлено отсутствием, а не отдельным набором.

### 67 тегов (v1, сгруппированных по доменам)

Фундаментальные: `health`, `capabilities`.

Сессии: `session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_prompt`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_stats`, `session_lsp`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (условный), `session_language`, `session_rewind`, `session_hooks`, `session_branch`.

Потоковая передача: `slow_client_warning`, `typed_event_schema`.

Идентификация и пульс: `client_identity`, `client_heartbeat`.

Разрешения: `session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`).
Снапшоты рабочего пространства только для чтения: `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`.

Мутации рабочего пространства (Wave 4+): `workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_tool_toggle`, **`workspace_settings`** (условно), `workspace_init`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, **`workspace_reload`** (условно).

Ограничения MCP: **`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (условно), **`mcp_pool_restart`** (условно).

Управление промптами: **`prompt_absolute_deadline`** (условно), **`writer_idle_timeout`** (условно), `non_blocking_prompt`.

Аутентификация: `auth_provider_install`, `auth_device_flow`, **`require_auth`** (условно), **`allow_origin`** (условно).

Ограничение скорости: **`rate_limit`** (условно).

Выделенные жирным теги имеют `modes` или являются условными.

## Поток

### Сторона демона: сборка конверта

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["filter by isFeatureAvailableInProtocol"]
    C --> D["for each feature, check CONDITIONAL_SERVE_FEATURES"]
    D --> E["yes: predicate(toggles) ? include : drop"]
    D --> F["no: include unconditionally"]
    E --> G["return ServeFeature[]"]
    F --> G
    G --> H["wrap in envelope:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### Сторона клиента: предварительная проверка возможностей

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant D as GET /capabilities
    participant R as Route

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt yes
        C->>R: rely on pool-aware response shapes<br/>(for example entries[] from /workspace/mcp/:server/restart)
    else no
        C->>R: legacy single-entry response shape
    end
```

## Состояние и жизненный цикл

- `CAPABILITIES_SCHEMA_VERSION` — это версия формы конверта на проводе, в настоящее время `1`. Увеличивайте её только при разрыве конверта.
- `SERVE_PROTOCOL_VERSION = 'v1'` — это версия функций протокола. Добавление функций в рамках v1 является аддитивным; старые клиенты не увидят новое поведение, пока не проверят новый тег. Удаление функции — это разрыв v2.
- `EVENT_SCHEMA_VERSION = 1` — это поле `v` фрейма SSE (см. [`09-event-schema.md`](./09-event-schema.md)). Это независимая ось версий; увеличение версии схемы событий не означает увеличение версии протокола, и наоборот.
- `session_resume` — это стабильная возможность демона для `POST /session/:id/resume`. `unstable_session_resume` продолжает рекламироваться как устаревший псевдоним, потому что базовый метод ACP по-прежнему называется `connection.unstable_resumeSession`; новые клиенты должны определять поддержку через `session_resume`.

## Зависимости

- Читается `packages/cli/src/serve/server.ts` при построении ответов `/capabilities`.
- Входные переключатели поступают из `runQwenServe` / `createServeApp`: `{ requireAuth, mcpPoolActive, allowOriginActive, promptDeadlineMs, writerIdleTimeoutMs, persistSettingAvailable, sessionShellCommandEnabled, rateLimit, reloadAvailable }`.
- Активная политика `permission` в конверте берётся из `BridgeOptions.permissionPolicy`, которая, в свою очередь, читает `settings.json` `policy.permissionStrategy`.

## Конфигурация

| Источник                     | Регулятор                                                      | Влияние на возможности                                                                                                        |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Флаг CLI                     | `--require-auth`                                                | Рекламирует `require_auth`.                                                                                                   |
| Переменная окружения          | `QWEN_SERVE_NO_MCP_POOL=1`                                      | Перестаёт рекламировать `mcp_workspace_pool` и `mcp_pool_restart`; события MCP больше не помечают `scope: 'workspace'`.       |
| Флаг CLI                     | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | Не меняет набор тегов (`mcp_guardrails` рекламируется всегда), но изменяет поведение резервирования и отказа на уровне сервера. |
| Флаг CLI / переменная окружения | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1`                      | Рекламирует `rate_limit`.                                                                                                     |
| Встроенная опция              | `persistSettingAvailable`                                       | Рекламирует `workspace_settings`.                                                                                             |
| Флаг CLI / встроенная опция   | `--enable-session-shell` / `sessionShellCommandEnabled`         | Рекламирует `session_shell_command`.                                                                                          |
| Встроенная опция              | `reloadAvailable`                                               | Рекламирует `workspace_reload`.                                                                                               |
| `settings.json`              | `policy.permissionStrategy`                                     | Устанавливает конверт `policy.permission`.                                                                                    |
## Предостережения и известные ограничения

- **`--require-auth` скрывает предварительную проверку.** При использовании `--require-auth` все маршруты, включая `/capabilities`, требуют bearer-авторизации. Неаутентифицированный клиент не может выполнить предварительную проверку `caps.features.require_auth`; тело ответа 401 является поверхностью обнаружения. Тег `require_auth` — это подтверждённая аутентифицированная метка для аудита в усиленных развёртываниях.
- **Наличие тега означает, что поведение существует.** Если будущий разработчик добавит функциональность под существующим тегом без увеличения `since`, клиенты, выполнившие предварительную проверку старого тега, могут незаметно получить новое поведение. Правило: новое поведение — новый тег.
- **Теги `unstable_*` могут менять структуру между версиями** без изменения протокола. При зависимости от них фиксируйте версию SDK.
- Каталог маршрутов находится в [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md); эта страница намеренно его не дублирует.

## Ссылки

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts` (сборка конверта)
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- Описание протокола: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- Аутентификация и защитные механизмы развёртывания: [`12-auth-security.md`](./12-auth-security.md)
