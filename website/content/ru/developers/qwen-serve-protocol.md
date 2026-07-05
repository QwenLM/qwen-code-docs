# Справочник по HTTP-протоколу `qwen serve`

Этап 1 [дизайна демона qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Все маршруты находятся по базовому URL демона (по умолчанию `http://127.0.0.1:4170`).

## Аутентификация

Если демон был запущен с флагом `--token` или переменной окружения `QWEN_SERVER_TOKEN`, **каждый маршрут, кроме `/health` при привязке к loopback-интерфейсу**, должен содержать заголовок:

```
Authorization: Bearer <token>
```

Без настроенного токена (стандартно для loopback в режиме разработки) заголовок необязателен. Сравнение токенов выполняется за константное время. Ответы с кодом 401 унифицированы для случаев `missing header` / `wrong scheme` / `wrong token`.

**Исключение для `/health`** (Bctum): при привязке к loopback-интерфейсу (`127.0.0.1` / `localhost` / `::1` / `[::1]`) маршрут `/health` регистрируется ДО bearer middleware, поэтому liveness-пробам внутри пода не нужно передавать токен, даже если демон был запущен с флагом `--token`. При привязке к не-loopback интерфейсам (`--hostname 0.0.0.0` и т.д.) `/health` защищается bearer-аутентификацией, как и любой другой маршрут — см. раздел [`GET /health`](#get-health) для получения подробностей.

**`--require-auth` (#4175 PR 15).** Передайте этот флаг при запуске, чтобы распространить правило «обязательное наличие токена» и на loopback-интерфейс. Запуск завершится ошибкой без токена; исключение для `/health` отменяется (поэтому `/health` также требует `Authorization: Bearer …`).

Когда флаг включен, глобальный `bearerAuth` middleware защищает **каждый** маршрут, включая `/capabilities`. Поэтому **неаутентифицированный** клиент не может выполнить pre-flight запрос к `caps.features`, чтобы узнать, что требуется аутентификация: поверхностью обнаружения в этом случае является само **тело ответа 401** (унифицированное для всех маршрутов согласно разделу [Аутентификация](#authentication)). Тег возможности `require_auth` — это **подтверждение пост-аутентификации**: как только клиент успешно проходит аутентификацию и читает `/capabilities`, наличие тега подтверждает, что демон был запущен с флагом `--require-auth` (полезно для UI аудита/соответствия требованиям и для SDK-клиентов, чтобы отображать «это развертывание усилено» на панели настроек). Маршруты мутации, подключенные к строгому режиму для каждого маршрута (доработки Wave 4), отклоняют запрос с `401 { code: "token_required", error: "…" }` при обращении к ним в конфигурации loopback по умолчанию без токена — но при включенном `--require-auth` глобальный bearer middleware прерывает запрос до проверки на уровне маршрута, поэтому неаутентифицированные вызывающие стороны фактически видят устаревшее тело `Unauthorized`.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Браузерные веб-интерфейсы, обращающиеся к демону с другого origin, по умолчанию блокируются — любой запрос с заголовком `Origin` возвращает `403 {"error":"Request denied by CORS policy"}`, поскольку CLI/SDK-клиенты никогда не отправляют `Origin`, и демон расценивает его наличие как признак того, что запрос поступил из браузерного контекста, который оператор не разрешил. Передайте `--allow-origin <pattern>` (флаг можно повторять) при запуске, чтобы установить список разрешенных origin вместо сплошной блокировки. Каждый паттерн может быть:

- Буквальное `*` — разрешить любой origin. **Опасно**: запуск завершится ошибкой, если настроено `*`, но не задан bearer-токен (из любого источника: `--token`, `QWEN_SERVER_TOKEN` или `--require-auth`, который требует токен при запуске). При наличии `*` в списке boot-процесс выводит предупреждение в stderr. **Рекомендация**: используйте в связке с `--require-auth` при привязке к loopback, чтобы `/health` и `/demo` также защищались bearer-аутентификацией — по умолчанию они регистрируются до bearer middleware на loopback (чтобы k8s/Compose-пробы могли обращаться к `/health` без токена), а allowlist `*` делает их доступными из любого cross-origin браузера. При привязке к не-loopback интерфейсам bearer уже обязателен при запуске, поэтому поверхность риска `*` ограничивается только `/health` (JSON статуса) и `/demo` (статическая страница, чей JS всё равно обращается к маршрутам, защищенным токеном) — фактическая поверхность API в любом случае защищена.
- Канонический URL origin — `<scheme>://<host>[:<port>]`. **Без завершающего слэша, без пути, без userinfo, без query.** Запуск завершится ошибкой `InvalidAllowOriginPatternError`, если запись не проходит проверку `new URL(pattern).origin === pattern`; в сообщении об ошибке указывается некорректный паттерн и каноническая форма. Строгость заложена намеренно: тихая нормализация (например, удаление завершающего `/`) позволила бы опечаткам проскользнуть и принимать неоднозначный ввод.

Сопоставленные origin получают стандартные заголовки ответа CORS в каждом запросе:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` дословно повторяет origin запроса (в нижнем/верхнем регистре, как отправил браузер), а не буквальное `*`, даже при использовании паттерна `*` — кэши браузера ключируют ответы по нему в паре с `Vary: Origin`, а повторение оставляет возможность добавить `Access-Control-Allow-Credentials` в будущих релизах без изменения схемы. `Access-Control-Expose-Headers: Retry-After` позволяет браузерным веб-интерфейсам учитывать подсказки демона о повторных попытках из ответов `429` / `503`. `Access-Control-Allow-Credentials` на данный момент **НЕ** отправляется: демон аутентифицируется через bearer в `Authorization`, что работает cross-origin без `credentials: 'include'`.

OPTIONS preflight-запросы (OPTIONS с `Access-Control-Request-Method` или `Access-Control-Request-Headers`) прерываются с кодом `204 No Content` и заголовками, указанными выше. Это стандартный паттерн CORS, и он безопасен — preflight только подтверждает, какие методы/заголовки демон будет принимать; фактический последующий запрос всё равно проходит полную цепочку (allowlist хостов → bearer-аутентификация → маршруты), поэтому защита от DNS-rebinding и проверка bearer срабатывают до чтения или изменения любого состояния. Обычные OPTIONS-запросы из сопоставленных origin продолжают передаваться дальше с прикрепленными заголовками CORS.

Origin, не совпадающие с allowlist, всё равно получают `403 {"error":"Request denied by CORS policy"}` — ту же оболочку, что и при сплошной блокировке по умолчанию, поэтому клиентам, которые уже парсят ответ блокировки, не нужно обрабатывать особый случай для демонов с развернутым allowlist. Путь отклонения **не** отправляет никаких заголовков `Access-Control-*` (браузер всё равно бы их проигнорировал, а их отправка косвенно раскрыла бы размер allowlist через наличие заголовков).

Список настроенных паттернов намеренно НЕ повторяется в `/capabilities` — браузерный веб-интерфейс и так знает свой собственный origin (в конце концов, он обратился к демону), а вывод списка позволил бы неаутентифицированному читателю `/capabilities` перечислить все доверенные origin (полезная разведка для неправильно настроенного развертывания). SDK-клиенты ориентируются на тег `caps.features.allow_origin` для понимания «этот демон принимает cross-origin запросы из браузера», не зная конкретных origin.

Loopback self-origin запросы (например, когда страница `/demo` обращается к демону на том же `127.0.0.1:port`) обрабатываются **отдельным** shim-слоем для удаления Origin, который работает ДО CORS middleware и удаляет заголовок `Origin` для `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Поэтому они проходят независимо от конфигурации `--allow-origin` — операторам не нужно указывать собственный порт демона, чтобы заставить работать демо-страницу.

## Общий формат ошибок

Ответы с кодом 5xx содержат `code` и `data` исходной ошибки, если они присутствуют (в стиле JSON-RPC — ACP SDK пересылает `{code, message, data}` от агента):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Некорректный JSON в теле запроса возвращает:

```json
{ "error": "Invalid JSON in request body" }
```

со статусом `400`.

`SessionNotFoundError` для неизвестного id сессии возвращает:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

со статусом `404`.

`WorkspaceMismatchError` для `POST /session`, чей `cwd` не канонизируется к привязанной рабочей области демона (#3803 §02 — 1 демон = 1 рабочая область), возвращает `400` с:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Используйте это для pre-flight обнаружения несовпадения: прочитайте `workspaceCwd` из `/capabilities` и опустите `cwd` в `POST /session` (произойдет откат к привязанной рабочей области) или направьте запрос к демону, привязанному к `requestedWorkspace`.

`POST /session` сверх лимита `--max-sessions` демона возвращает `503` с заголовком `Retry-After: 5` и:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Подключения к существующим сессиям НЕ учитываются в лимите, поэтому переподключения к неактивному демону продолжают работать даже при достижении лимита.

`RestoreInProgressError` — возвращается только `POST /session/:id/load` и `POST /session/:id/resume` — возвращает `409` с заголовком `Retry-After: 5` (аналогично `session_limit_exceeded`) и:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Возникает, когда `session/load` вызывается для id, по которому уже выполняется `session/resume` (или наоборот). Подождите хотя бы `Retry-After` секунд и повторите попытку — базовое восстановление завершается в течение `initTimeoutMs` (по умолчанию 10 с). Гонки с одинаковыми действиями (`load` против `load`, `resume` против `resume`) объединяются вместо выдачи ошибки.

`SessionArchivedError` возвращается, когда вызывающая сторона пытается загрузить или возобновить сессию, чей JSONL находится в `chats/archive/`:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

со статусом `409`.

`SessionArchivingError` возвращается, когда архивация или разархивация сессии уже выполняется для того же id:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

со статусом `409` и `Retry-After: 5`.

## Возможности

Демон объявляет поддерживаемые теги функций из реестра возможностей serve. Клиенты **должны** управлять отображением UI на основе `features`, а не `mode` (согласно дизайну §10).

```
['health', 'capabilities', 'session_create', 'session_scope_override',
 'session_load', 'session_resume',
 'unstable_session_resume',
 'session_list', 'session_prompt', 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload']
```

> Условные теги появляются только при включении соответствующего переключателя развертывания (см. таблицу ниже). Тег `permission_mediation` из F3 включен всегда и содержит `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, чтобы SDK-клиенты могли анализировать поддерживаемый в сборке набор; активная в рантайме стратегия находится в `body.policy.permission`.
`session_scope_override` — это дескриптор согласования для поля `sessionScope` в каждом запросе к `POST /session` (см. ниже). Старые демоны молча игнорируют это поле, поэтому SDK-клиенты должны предварительно проверять `caps.features` на наличие этого тега перед его отправкой.

`session_load` и `session_resume` анонсируют маршруты явного восстановления (`POST /session/:id/load` и `POST /session/:id/resume`). Старые демоны возвращают `404` для этих путей, поэтому SDK-клиенты должны предварительно проверять `caps.features` перед вызовом. `unstable_session_resume` по-прежнему анонсируется как устаревший псевдоним для совместимости с SDK, которые были выпущены, когда базовый метод ACP назывался `connection.unstable_resumeSession`; новые клиенты должны использовать проверку на `session_resume`.

`slow_client_warning` описывает поведение backpressure для SSE: (a) демон отправляет синтетический фрейм потока событий `slow_client_warning`, когда очередь живых фреймов или очередь живых сериализованных байт подписчика превышает 75% заполнения, один раз за эпизод переполнения (сбрасывается после того, как оба показателя падают ниже 37.5%); (b) `GET /session/:id/events` принимает query-параметр `?maxQueued=N` (диапазон `[16, 2048]`) для предварительного задания размера очереди фреймов на каждого подписчика при холодных переподключениях к большому кольцу повтора. Лимит сериализованных байт контролируется демоном (по умолчанию **2 MiB** на подписчика), работает только для живых соединений и намеренно не имеет query-параметра. Размер кольца для всего демона управляется флагом `--event-ring-size` (по умолчанию **8000**, согласно #3803 §02). Старые демоны молча не поддерживают поведение предупреждений/query-параметров — предварительно проверяйте этот тег перед его использованием.

`typed_event_schema` анонсирует, что полезные нагрузки событий демона соответствуют схеме SDK `KnownDaemonEvent`. Старые демоны могут по-прежнему транслировать совместимые фреймы, но SDK-клиенты должны предварительно проверять этот тег, прежде чем полагаться на покрытие типизированных событий.

`client_heartbeat` анонсирует `POST /session/:id/heartbeat`. Старые демоны возвращают `404`; предварительно проверяйте этот тег перед отправкой периодических heartbeat-запросов.

`session_close` и `session_metadata` анонсируют `DELETE /session/:id` и `PATCH /session/:id/metadata`. Старые демоны возвращают `404`; предварительно проверяйте эти теги перед предоставлением функций закрытия или переименования.

`session_organization` анонсирует пользовательские группы сессий и закрепление. Он добавляет маршруты `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` и опциональный организованный вид списка `GET /workspace/:id/sessions?view=organized`. Старые демоны возвращают `404` для маршрутов мутации/группировки и игнорируют контракт организованного вида, поэтому клиенты WebShell/SDK должны предварительно проверять этот тег перед отображением UI группировки или закрепления.

`session_archive` анонсирует API архивации состояния каталогов v1: `POST /sessions/archive`, `POST /sessions/unarchive` и `GET /workspace/:id/sessions?archiveState=active|archived`. Архивированные сессии не могут быть загружены или возобновлены до тех пор, пока не будут разархивированы.

`session_lsp` анонсирует `GET /session/:id/lsp` — снимок структурированного статуса LSP только для чтения для клиентов демона. Старые демоны возвращают `404`; предварительно проверяйте этот тег перед отображением удаленного статуса LSP.

`session_status` анонсирует `GET /session/:id/status` — сводку live-моста для одной сессии по её id (`clientCount` / `hasActivePrompt` и основные поля). Старые демоны возвращают `404`; предварительно проверяйте этот тег перед опросом статуса отдельной сессии вместо сканирования полного списка сессий.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` и `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) анонсируют четыре маршрута управления мутациями, задокументированные в разделе "Mutation: approval, tools, init, MCP restart" ниже. Все четыре строго защищены mutation gate из PR 15 (демон, настроенный без bearer-токена, отклоняет их с кодом 401 `token_required`). Старые демоны возвращают `404`; предварительно проверяйте каждый тег перед предоставлением соответствующей функции.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) описывает поверхность бюджетов MCP: поля `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` в `GET /workspace/mcp`, поле `disabledReason` в ячейках для каждого сервера и CLI-флаги `--mcp-client-budget` / `--mcp-budget-mode`. Старые демоны полностью опускают новые поля; SDK-клиенты должны предварительно проверять этот тег перед использованием семантики `budgets[]`. Дескриптор реестра также содержит `modes: ['warn', 'enforce']` для будущего предоставления режимов функций — пока что клиенты определяют режим из поля `budgetMode` в снимке. Отказ сервера в режиме `enforce` детерминирован порядком объявления `Object.entries(mcpServers)`; будущий слой приоритетов области действия (если qwen-code его внедрит) изменит это на "сначала наименьший приоритет", чтобы соответствовать соглашению claude-code `plugin < user < project < local`.

> ⚠️ **Область действия PR 14 v1: на сессию, а не на workspace.** Каждая ACP-сессия внутри демона создает свой собственный `Config` + `McpClientManager` (через `acpAgent.newSessionConfig`). Бюджет ограничивает количество живых MCP-клиентов **на сессию**; каждая сессия независимо читает `QWEN_SERVE_MCP_CLIENT_BUDGET` из переданного окружения. При `--mcp-client-budget=10` и 5 параллельных ACP-сессиях фактическое количество живых MCP-клиентов может достигать 5 × 10 = 50 на весь демон. Снимок `GET /workspace/mcp` читает учетные данные `McpClientManager` только **bootstrap-сессии** — значение `budgets[0].scope: 'session'` является прямым сигналом того, что это ограничение на сессию, а не агрегированное. **Wave 5 PR 23 (shared MCP pool)** внедрит менеджер уровня workspace и добавит ячейку `scope: 'workspace'` рядом с ячейкой на сессию для истинной кросс-сессийной агрегации. v1 — это внутрипроцессный счетчик + основа мягкого принуждения, на которой строится PR 23.

`workspace_file_read` охватывает маршруты файлов workspace для текста/списка/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
охватывает `GET /file/bytes`, который был добавлен позже, чтобы клиенты могли предварительно проверять поддержку сырого
байтового окна для демонов эпохи PR19. `workspace_file_write` охватывает
маршруты мутации текста с учетом хеша (`POST /file/write`, `POST /file/edit`).
Тег write означает, что контракт маршрута существует; это не означает, что текущий
деплоймент открыт для анонимной мутации. Write/edit — это строгие маршруты мутации
и требуют настроенного bearer-токена даже на loopback.

`daemon_status` анонсирует `GET /daemon/status` — консолидированный диагностический снимок
только для чтения для оператора, задокументированный ниже.

**Условные теги.** Небольшое количество тегов функций анонсируется только при включении соответствующего переключателя деплоймента. Наличие тега = поведение включено; отсутствие = либо более старый демон до появления этого тега, ЛИБО текущий демон, где оператор не активировал эту функцию. В настоящее время:

| Тег                        | Анонсируется, когда …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | демон был запущен с флагом `--require-auth` (или `requireAuth: true` через встроенный API). Bearer-токен обязателен для каждого маршрута, включая `/health` на loopback-биндах.                                                                                                                                                                                                                                                                                                                                 |
| `mcp_workspace_pool`       | общий пул транспортов MCP активен. Пропускается, когда `QWEN_SERVE_NO_MCP_POOL=1` отключает пул.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `mcp_pool_restart`         | общий пул транспортов MCP активен; ответы на перезапуск могут включать многоэлементные формы с учетом пула.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Демон был запущен хотя бы с одним `--allow-origin <pattern>` (или `allowOrigins: [...]` через встроенный API). Кросс-доменные запросы с совпадающих источников получают правильные заголовки ответов CORS; несовпадающие источники по-прежнему получают стандартный 403. Настроенный список паттернов намеренно НЕ возвращается в `/capabilities`, чтобы не раскрывать набор доверенных источников неаутентифицированным читателям — браузерный webui уже знает свой собственный источник. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` установлено в положительное целое число.                                                                                                                                                                                                                                                                                                                                                                            |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` установлено в положительное целое число.                                                                                                                                                                                                                                                                                                                                                                  |
| `workspace_settings`       | демон был создан с доступным сохранением настроек.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_shell_command`    | выполнение shell-команд в сессии явно включено.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` включено.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_reload`         | поддержка перезагрузки workspace доступна во встроенной конфигурации маршрутов.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
`mcp_guardrails` **нет** в этой условной таблице — это всегда включенный тег, который анонсируется всякий раз, когда бинарник поддерживает новые поля бюджета `/workspace/mcp`, независимо от того, настроил ли оператор бюджет. Операторы, которые не установили `--mcp-client-budget`, всё равно получают новые поля (с `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) анонсирует типизированные push-события SSE, которые сигнализируют о пересечении состояний бюджета MCP без использования цикла опроса. Два типа фреймов поступают на `GET /session/:id/events`:

- `mcp_budget_warning` — срабатывает один раз при превышении порога в 75% для `reservedSlots.size / clientBudget`. Повторно активируется только после того, как соотношение упадет ниже 37,5% (`MCP_BUDGET_REARM_FRACTION`). Повторяет гистерезис `slow_client_warning` из PR 10, но на уровне менеджера, а не на уровне очереди отдельного подписчика. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Срабатывает в обоих режимах `warn` и `enforce`; никогда не срабатывает в режиме `off`.
- `mcp_child_refused_batch` — срабатывает в конце каждого прохода `discoverAllMcpTools*`, если один или несколько серверов были отклонены, А ТАКЖЕ как батч длиной 1 на пути отклонения при ленивом запуске `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` — это буквально `'enforce'`, потому что режим `warn` никогда не отклоняет запросы.

Оба события хранятся в кольцевом буфере повтора SSE для каждой сессии (они содержат `id`), поэтому клиент, переподключающийся с `Last-Event-ID`, возобновляет работу через них; снапшот по `GET /workspace/mcp` по-прежнему является источником истины для состояния после длительного отключения. Всегда включены после анонсирования — условного переключателя нет. Состояние редьюсера SDK (`DaemonSessionViewState`) предоставляет `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` для адаптеров, которым нужен простой UI в стиле индикатора задержки.

## Маршруты

### `GET /health`

Liveness-проба. По умолчанию возвращает `200 {"status":"ok"}`, если слушатель работает — дешевая операция, без обращения к bridge, подходит для высокочастотных liveness-проб в k8s/Compose.

Передайте `?deep=1` (также принимается `?deep=true` или просто `?deep`) для пробы, которая раскрывает **счетчики** bridge (только в информационных целях, не является настоящей проверкой жизнеспособности):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Глубокая проба носит **информационный** характер, а не является реальной проверкой жизнеспособности. Она считывает аксессоры счетчиков (`bridge.sessionCount`, `bridge.pendingPermissionCount`), которые представляют собой простые геттеры размера Map; они не опрашивают отдельные дочерние процессы / каналы и поэтому не могут обнаружить зависшую, но всё ещё учитываемую сессию. Используйте её для дашбордов емкости (текущая параллельность против `--max-sessions`, глубина очереди), а не как триггер для «вывода этого демона из ротации». Ответ `503 {"status":"degraded"}` теоретически возможен, если геттеры в пользовательской реализации bridge выбрасывают исключение, но геттеры реального bridge этого не делают — при нормальной работе глубокая проба всегда возвращает 200. Для реальной проверки жизнеспособности полагайтесь на то, принимает ли слушатель TCP-соединение вообще (т. е. стандартный `/health` без `?deep`).

**Auth:** требуется **только при привязке не к loopback-интерфейсу**. На loopback (`127.0.0.1`, `::1`, `[::1]`) `/health` регистрируется до bearer middleware, поэтому liveness-пробы k8s/Compose внутри пода не нужно передавать токен. При привязке не к loopback (`--hostname 0.0.0.0` и т. д.) маршрут регистрируется после bearer middleware и возвращает 401 без валидного токена — в противном случае неаутентифицированный вызывающий абонент мог бы опрашивать произвольные адреса, чтобы подтвердить существование `qwen serve`, что представляет собой утечку информации с низким уровнем серьезности, которая плохо сочетается со сканированием портов. CORS deny + Host allowlist по-прежнему применяются к исключению для loopback.

### `GET /daemon/status`

Диагностика оператора только для чтения. В отличие от `/health`, это обычный API демона:
он регистрируется после bearer-аутентификации и rate limiting, включая привязки
к loopback. Query-параметр:

- `detail=summary` (по умолчанию) считывает только состояние демона в памяти.
- `detail=full` также включает диагностику активных сессий, диагностику
  подключений ACP, счетчики auth device-flow и разделы статуса рабочего пространства.
- любой другой `detail` возвращает `400 { "code": "invalid_detail" }`.

`summary` намеренно не запрашивает методы статуса рабочего пространства, не запускает
дочерний процесс ACP и не создает сессию. `full` запрашивает каждый раздел рабочего пространства независимо;
тайм-аут или исключение помечают только этот раздел как `unavailable` и добавляют
проблему `workspace_status_unavailable`.

Форма ответа:

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 20,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

`runtime.perf` необязателен. Если присутствует, он сообщает только о задержке
event loop процесса демона, выборках ожидания в FIFO-очереди промптов и счетчиках байтов
pipe между демоном и дочерним процессом; задержка event loop дочернего процесса ACP
не включается в `/daemon/status`.

`status` принимает значение `error`, если какая-либо проблема имеет уровень серьезности error, `warning`, если какая-либо проблема имеет
уровень серьезности warning, в противном случае `ok`. Коды проблем стабильны и включают
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`,
`channel_worker_partial_connect` и `workspace_status_unavailable`. В течение
короткого окна после готовности слушателя, но до монтирования полного runtime,
`/daemon/status` может сообщать `daemon_runtime_starting`; если асинхронное
монтирование runtime завершается ошибкой, он сообщает `daemon_runtime_failed`, в то время как
маршруты runtime, не связанные со статусом, возвращают `503`.

`runtime.activity` сообщает об активности промптов во всем демоне. `activePrompts` считает сессии с промптом в процессе выполнения. `pendingPrompts` считает все принятые промпты, которые еще не завершены, включая выполняющийся промпт и промпты, ожидающие в FIFO. `queuedPrompts` считает промпты, ожидающие в FIFO, которые были приняты, но еще не отправлены в обработку. `lastActivityAt` — это временная метка ISO 8601 последнего запуска/завершения промпта или создания сессии; `null`, если демон никогда не обрабатывал активность с момента загрузки. `idleSinceMs` вычисляется на основе `lastActivityAt` на момент генерации ответа.

`runtime.channel.live` сообщает о канале ACP bridge внутри демона. Это
не worker адаптера канала. Каналы, управляемые демоном, используют
`runtime.channelWorker`, чей `state` может быть `disabled`, `starting`,
`running`, `exited`, `failed` или `stopped`. Когда worker переходит в состояние `running`
и затем завершает работу, `/daemon/status` оставляет демон в сети и сообщает код проблемы
`channel_worker_exited` с уровнем warning.

Запуск worker'а канала, управляемого демоном, по-прежнему работает по принципу fail-fast: если `qwen serve
--channel ...` не может запустить worker, который достигнет состояния ready, запуск serve завершается ошибкой.
После того как worker достиг состояния ready, неожиданные завершения перезапускаются
супервизором serve в рамках ограниченной политики: до 3 попыток перезапуска в 5-минутном
окне, с задержкой 1 с, 5 с, затем 15 с. Worker отправляет IPC-хартбиты каждые
15 с; если хартбит не наблюдается в течение 45 с, супервизор считает worker
устаревшим, убивает его, записывает `staleHeartbeatAt` и использует тот же путь перезапуска.

`runtime.channelWorker` может включать дополнительные операционные поля:
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt` и `staleHeartbeatAt`. `restartCount` — это количество
попыток перезапуска за время жизни данного процесса serve; работающий worker с
`restartCount > 0` считается здоровым, если не применима другая проблема. Работающий worker,
чьи `requestedChannels` включают имена, отсутствующие в `channels`, сообщает о проблеме
`channel_worker_partial_connect`.

`qwen channel status` продолжает читать метаданные pidfile. Во время окна
перезапуска pidfile, принадлежащий serve, остается зарезервированным, но `workerPid` опускается, чтобы
клиенты не отображали устаревший процесс worker'а. stdout/stderr worker'а
перенаправляются в лог демона с удалением bearer-токенов, конфиденциальных значений
окружения worker'а и учетных данных URL прокси.

Безопасность: ответ никогда не включает bearer-токены, client id, полные ACP
connection id, user-коды device-flow или URL-адреса верификации. `summary` опускает
путь к логу демона; `full` может включать его для аутентифицированных операторов.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": ["health", "daemon_status", "capabilities", "..."],
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/workspace"
}
```

Стабильный контракт: когда `v` инкрементируется, структура фрейма изменяется с нарушением обратной совместимости.

> **`protocolVersions`** описывает версии протокола serve, которые поддерживает демон. `current` — это предпочитаемая демоном версия протокола, а `supported` — набор совместимых версий. Клиенты, которым требуется конкретный протокол, должны проверять `supported`; UI, специфичный для функций, по-прежнему должен ориентироваться на `features`. Добавлено в v=1: старые демоны v=1 опускают это поле, поэтому SDK-клиенты, ориентированные на старые сборки, должны считать его необязательным.

> **`modelServices` всегда равен `[]` на Этапе 1.** Агент использует свой единственный сервис моделей по умолчанию и не перечисляет его по сети. На Этапе 2 это поле будет заполняться из зарегистрированных адаптеров моделей, чтобы SDK-клиенты могли создавать переключатели сервисов; до этого момента НЕ полагайтесь на то, что это поле непустое.

> **`workspaceCwd`** — это канонический абсолютный путь, к которому привязывается данный демон (#3803 §02 — 1 демон = 1 рабочее пространство). Используйте его, чтобы (а) обнаружить несоответствие перед отправкой POST-запроса на `/session` и (б) опустить `cwd` в `POST /session` (маршрут использует этот путь в качестве fallback). В развертываниях с несколькими рабочими пространствами запускается несколько демонов на разных портах, каждый со своим `workspaceCwd`. Добавлено в v=1: демоны v=1 до §02 опускают это поле — клиенты, ориентированные на старые сборки, должны проверять его на null перед использованием.

### Маршруты статуса runtime только для чтения

Эти маршруты сообщают о снапшотах runtime на стороне демона. Это аддитивные маршруты v1,
они не мутируют состояние и не изменяют версию протокола serve. Маршруты статуса рабочего пространства
намеренно **не** запускают дочерний процесс ACP только потому, что
клиент опрашивает GET-маршрут: если демон простаивает, они возвращают
`initialized: false` с пустым снапшотом. Маршруты статуса сессии требуют
активной сессии и используют стандартную форму `404 SessionNotFoundError` для неизвестных
id.

Теги возможностей:
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

Общая ячейка статуса:

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` — это закрытое перечисление (enum), общее для `/workspace/preflight`, `/workspace/env` и (в будущем) MCP guardrails, чтобы SDK-клиенты могли отображать инструкции по устранению ошибок для каждой категории вместо парсинга произвольных сообщений. PR 13 (#4175) добавил семь литералов, перечисленных выше; PR 14 заполнит `blocked_egress`, как только будет добавлен egress-зонд.

Полезные нагрузки (payloads) статуса никогда не раскрывают значения переменных окружения MCP, заголовки, детали OAuth/сервисных аккаунтов, API-ключи провайдеров, `baseUrl` / `envKey` провайдеров, тело skill, файловые пути skill, определения хуков или значения секретных переменных окружения. `/workspace/env` сообщает только о **наличии** переменных окружения из белого списка; URL прокси очищаются от учетных данных и сводятся к формату `host:port` перед отправкой по сети.

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` принимает одно из значений: `not_started`, `in_progress` или `completed`. `transport` принимает одно из значений: `stdio`, `sse`, `http`, `websocket`, `sdk` или `unknown`. Поле `errors` опускается, если обнаружение (discovery) прошло успешно.

**MCP client guardrails (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Демоны после PR 14 расширяют полезную нагрузку четырьмя дополнительными полями и одной ячейкой уровня workspace:

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "session",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` принимает одно из значений: `enforce`, `warn` или `off`. `clientBudget` отсутствует, если лимит не был установлен. `budgets[]` — это **всегда массив** для демонов после PR 14 (возможно пустой, если `budgetMode === 'off'`); демоны до PR 14 полностью опускают это поле. v1 выдает одну ячейку с `scope: 'session'` (принудительное применение на уровне сессии — причины см. в разделе capabilities выше). Потребители ДОЛЖНЫ корректно обрабатывать дополнительные записи в `budgets[]` с нераспознанными значениями `scope` — Wave 5 PR 23 добавит `scope: 'workspace'` (или `'pool'`) наряду с ячейкой уровня сессии без изменения схемы.

`disabledReason` в ячейках отдельных серверов позволяет отличить отключение оператором (`'config'` — список конфигурации `disabledMcpServers`) от отказа из-за лимита (`'budget'` — обнаружен, но никогда не подключался из-за режима `enforce`). Отказы детерминированы порядком объявления в `Object.entries(mcpServers)`. Поля `status: 'error', errorKind: 'budget_exhausted'` на уровне сервера перекрывают сырой `mcpStatus: 'disconnected'` (что верно, но не отражает критичность для оператора).

Применение лимитов (budget enforcement) в PR 14 v1 работает **на уровне сессии, а не workspace**. Хотя демоны Mode B после #4113 на уровне процесса устроены по принципу `1 демон = 1 workspace × N сессий`, `McpClientManager` создается внутри `Config` каждой ACP-сессии через `acpAgent.newSessionConfig`, поэтому N сессий применяют свою собственную копию лимита. Снимок (snapshot) отражает представление bootstrap-сессии. Wave 5 PR 23 внедряет общий пул MCP с областью действия workspace, что переводит это на полноценное принудительное применение на уровне workspace.

**Обнаружение нехватки лимита (budget pressure).** Два интерфейса, оба заполняются после PR-14b:

- **Push-события** (анонсируются через `mcp_guardrail_events`): подпишитесь на `GET /session/:id/events` и фильтруйте фреймы `mcp_budget_warning` / `mcp_child_refused_batch` через `KnownDaemonEvent`. Конечный автомат срабатывает один раз при пересечении 75% в сторону увеличения (повторно взводится ниже 37,5%); отказы объединяются один раз за проход обнаружения в режиме `enforce`.
- **Опрос снимка** (анонсируется через `mcp_guardrails`): выполните `GET /workspace/mcp` и проверьте ячейку лимита на уровне сессии (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (соответствует порогу гистерезиса, который будет использоваться в push-событии PR 14b).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (один или несколько серверов получили отказ в этом проходе обнаружения).
- `budgets[0].status === 'ok'` ⇔ ниже порога 75% И нет отказов.

Рекомендуемая частота опроса: согласована с тем, что уже опрашивает `/workspace/mcp`; снятие снимка дешево, а ячейка лимита не несет дополнительных затрат на обнаружение. SDK-клиенты, подписанные на push-события, также выигрывают от использования снимка для состояния после длительного отключения (глубина кольца повтора SSE конечна — `--event-ring-size`, по умолчанию 8000 — поэтому клиент, находящийся в офлайне дольше, чем покрывает кольцо, переключается на ресинхронизацию по снимку).

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` принимает одно из значений: `project`, `user`, `extension` или `bundled`. Поле `errors` опускается, если обнаружение прошло успешно.

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

Модели группируются по типу аутентификации. Диагностика подключения провайдера находится в ячейке `providers` эндпоинта `/workspace/preflight`; предварительная проверка окружения (environment preflight) находится в `/workspace/preflight` и `/workspace/env` (ниже). Поле `errors` опускается, если создание снимка прошло успешно.

### `GET /workspace/env`

Сообщает о runtime, платформе, песочнице (sandbox), прокси процесса демона и **наличии** секретных переменных окружения из белого списка. Всегда отвечает на основе состояния `process.*` — демон никогда не запускает дочерний процесс ACP для обслуживания этого маршрута, и ответ идентичен, работает ACP или находится в режиме ожидания. Поле `acpChannelLive` носит исключительно информационный характер.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

Структура ячейки:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Политика сокрытия данных (Redaction policy).** Ячейки `kind: 'env_var'` никогда не включают поле `value`; клиенты видят только `present: boolean`. Ячейки `kind: 'proxy'` пропускают сырое значение переменной окружения через сокрытие учетных данных (`redactProxyCredentials`), а затем через парсинг `URL`, чтобы по сети передавался только `host:port`. `NO_PROXY` передается через сокрытие как есть, поскольку это список хостов, а не URL. Белый список перечисленных секретных переменных окружения в настоящее время включает `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` и `QWEN_SERVER_TOKEN`. Другие переменные окружения не перечисляются, поэтому случайно установленные секреты остаются невидимыми.

### `GET /workspace/preflight`

Сообщает о проверках готовности демона. **Ячейки уровня демона** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) всегда заполняются из `process.*` и `node:fs`. **Ячейки уровня ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) требуют активного дочернего процесса ACP — когда демон находится в режиме ожидания, они выдают плейсхолдеры `status: 'not_started'`. Маршрут никогда не запускает ACP исключительно для заполнения ячеек; соответствующие ячейки возвращаются к значению `not_started`.

Ответ в режиме ожидания (нет дочернего процесса ACP):

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```
Форма ячейки:

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

Семантика `errorKind`:

- `missing_binary` — версия Node ниже требуемой, отсутствует `QWEN_CLI_ENTRY`,
  ripgrep / git / npm не найдены в PATH (для опциональных бинарников это предупреждения,
  а не ошибки).
- `missing_file` — `boundWorkspace` не существует или не является директорией;
  ошибка парсинга skill, указывающая на отсутствующий или нечитаемый файл.
- `parse_error` — ошибка парсинга `SKILL.md`, некорректный JSON конфигурации.
- `auth_env_error` — `validateAuthMethod` вернул непустую строку ошибки,
  или подкласс `ModelConfigError` был проброшен из разрешения провайдера.
- `init_timeout` — отклонение `withTimeout` в bridge (реальный таймаут при ожидании
  ACP roundtrip). Определяется через типизированный класс `BridgeTimeoutError`.
  Примечание: временная ячейка `warning` для `mcp_discovery` с `connecting > 0`
  НЕ содержит этот тип — это нормальное состояние выполнения рукопожатия,
  отличное от реального таймаута.
- `protocol_error` — ACP `extMethod` отклонен, так как канал закрылся в середине
  запроса, или потому что реестр инструментов неожиданно отсутствовал.
- `blocked_egress` — зарезервировано для PR 14 (#4175). PR 13 оставляет ячейку
  `egress` со статусом `status: 'not_started'`.

Если bridge не может достичь дочернего процесса ACP при обработке preflight-запроса
(например, из-за закрытия канала в середине запроса), массив `errors` в envelope
содержит одну ячейку `ServeStatusCell`, описывающую сбой, а остальные ячейки
откатываются к ACP-заглушкам со статусом `not_started`. Ячейки уровня daemon
по-прежнему возвращаются.

### Маршруты файлов рабочего пространства

Все пути к файлам разрешаются через привязанное к daemon рабочее пространство.
Ответы используют пути относительно рабочего пространства и никогда не возвращают
абсолютные пути файловой системы для обычных успешных случаев. Успешные ответы
с файлами включают:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Ошибки файловой системы используют следующую JSON-структуру:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Значения `errorKind` включают `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found` и `ambiguous_text_match`.

#### `GET /file`

Читает текстовый файл. Query-параметры: `path` (обязательный), `maxBytes`, `line` и
`limit`. Daemon отклоняет бинарные файлы и файлы, превышающие лимит чтения текста.
Ответ включает `hash` — SHA-256 дайджест сырых байтов файла на диске для всего файла,
даже если `line`, `limit` или `maxBytes` вернули только срез.

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

Читает сырые байты из файла без декодирования. Query-параметры: `path` (обязательный),
`offset` (по умолчанию `0`) и `maxBytes` (по умолчанию `65536`, максимум `262144`). Этот
маршрут поддерживает чтение ограниченных окон в больших бинарных файлах без загрузки всего
файла. Ответ включает `hash` только в том случае, если возвращаемое окно охватывает
весь файл.

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

Создает или заменяет текстовый файл. Это строгий маршрут мутации: при запросе через loopback
без настроенного токена он возвращает `401 { "code": "token_required" }`.
При использовании `--require-auth` глобальный bearer middleware отклоняет неаутентифицированные
запросы до выполнения маршрута.

Тело запроса:

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` должен быть `create` или `replace`. `create` никогда не перезаписывает существующий
файл (`409 file_already_exists`). `replace` требует `expectedHash`; отсутствующие или
некорректные хэши возвращают `400 parse_error`, а устаревшие хэши —
`409 hash_mismatch`. `expectedHash` — это `sha256:` плюс 64 строчных шестнадцатеричных
символа, вычисленных по сырым байтам файла на диске.

Могут быть переданы `bom`, `encoding` и `lineEnding`. При замене по умолчанию сохраняется
профиль кодировки существующего файла; явные поля переопределяют его.
Запись бинарных файлов не поддерживается.

Daemon записывает данные во временный файл со случайным именем в целевой директории,
выполняет fsync там, где это поддерживается, повторно проверяет текущий хэш
непосредственно перед `rename()`, а затем переименовывает файл на целевое имя.
Это предотвращает чтение частично записанного файла и сериализует операции записи
от daemon в один и тот же файл, но это не межпроцессный атомарный compare-and-swap
на уровне ядра: внешний редактор все еще может попасть в крошечное окно между
финальной проверкой хэша и переименованием.

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

Применяет одну точную замену текста в существующем текстовом файле. Это также строгий
маршрут мутации, требующий `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` должен быть непустым и встречаться ровно один раз. Отсутствие совпадений
возвращает `422 text_not_found`; множественные совпадения возвращают `422 ambiguous_text_match`.
Маршрут сохраняет кодировку, BOM и окончания строк, а также повторно проверяет
`expectedHash` непосредственно перед атомарным переименованием.

Явные записи/редактирования игнорируемых путей разрешены, поскольку аутентифицированный
вызывающий абонент явно указал путь. Успешные ответы и события аудита включают
`matchedIgnore: "file" | "directory" | null`.

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state` повторяет те же структуры ACP model/mode/config-option, которые используются в
`POST /session`, `POST /session/:id/load` и `POST /session/:id/resume`.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` — это тот же снимок команд, который используется в
SSE-уведомлении `available_commands_update`. `availableSkills` содержит только имена skill;
клиенты не должны ожидать тела или пути skill через этот маршрут.

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

Этот маршрут представляет собой снимок только для чтения (out-of-band). Он намеренно
не является промптом и может быть запрошен во время стриминга сессии. Ответ содержит
только метаданные из белого списка из реестров задач agent, shell и monitor;
контроллеры, таймеры, смещения, ожидающие сообщения и сырые объекты реестра
никогда не раскрываются.

Задачи agent, порожденные другим sub-agent (вложенные sub-agent, ограниченные
`maxSubagentDepth`), содержат три опциональных поля происхождения: `parentAgentId`
(`id` породившей задачи agent), `parentName` (`subagentType` породившего agent,
сохраняемый при регистрации, чтобы пережить удаление родителя из реестра) и `depth`
(глубина запуска, начиная с 0; 0 = порождено сессией верхнего уровня). У agent,
запущенных сессией верхнего уровня, поля `parentAgentId` и `parentName` отсутствуют;
клиенты должны рассматривать все три поля как опциональные и возвращаться к плоскому
списку, если они отсутствуют.

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` принимает одно из значений: `NOT_STARTED`, `IN_PROGRESS`, `READY` или `FAILED`.
Опциональный `error` присутствует на упавших серверах, если доступен. Отключенный LSP
(включая bare mode) возвращает HTTP 200 с `enabled: false`, нулевыми счетчиками и
`servers: []`. Включенный LSP без настроенных серверов возвращает `enabled: true`,
`configuredServers: 0` и `servers: []`. Если инициализация завершилась ошибкой до
создания клиента, ответ может включать `initializationError`; если активный клиент
не может предоставить снимок, ответ включает `statusUnavailable: true`.

Этот маршрут раскрывает только стабильные клиентские поля. Он намеренно опускает
отладочные внутренние данные, такие как ID процессов, аргументы запуска, хвосты stderr,
корневые URI и пути к папкам рабочего пространства.

### `POST /session`

Запускает новый agent или подключается к существующему (при `sessionScope: 'single'`, по умолчанию).

Запрос:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Поле             | Обязательно | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | нет         | Абсолютный путь, соответствующий привязанному к daemon рабочему пространству. Если не указан, маршрут использует `boundWorkspace` (его можно прочитать из `/capabilities.workspaceCwd`). Несоответствующий непустой `cwd` возвращает `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 рабочее пространство). Пути рабочего пространства канонизируются через `realpathSync.native` (с фолбэком на resolve-only для несуществующих путей), чтобы файловые системы без учета регистра не отклоняли сессии из-за разного написания.                                                                                                                                                                          |
| `modelServiceId` | нет         | Выбирает, какой настроенный _сервис моделей_ будет использовать agent (бэкенд-провайдер — Alibaba ModelStudio, OpenRouter и т.д.). Если не указан, agent использует свой сервис по умолчанию. Если в рабочем пространстве уже есть сессия, это вызывает `setSessionModel` для существующей сессии и транслирует `model_switched`. Отличается от `modelId` в `POST /session/:id/model`, который выбирает модель **внутри** уже привязанного сервиса. Массив `modelServices` в `/capabilities` зарезервирован для рекламы настроенных сервисов; на Этапе 1 он всегда равен `[]` (используется сервис agent'а по умолчанию, и он не перечисляется по HTTP). |
| `sessionScope`   | нет         | Переопределение для каждого запроса при совместном использовании сессии. `'single'` (дефолтный для daemon) заставляет повторный `POST /session` для того же рабочего пространства переиспользовать существующую сессию (`attached: true`); `'thread'` принудительно создает новую уникальную сессию при каждом вызове. Не указывайте, чтобы унаследовать дефолтное значение для daemon. Значения вне перечисления возвращают `400 { code: 'invalid_session_scope' }`. Старые daemon (до PR 5 из #4175) молча игнорируют это поле — проверяйте `caps.features.session_scope_override` в pre-flight перед отправкой. Дефолтное значение для daemon сегодня жестко задано как `'single'` в продакшене; #4175 может добавить CLI-флаг `--sessionScope` в последующих обновлениях.         |
Ответ:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` означает, что сессия для этого рабочего пространства уже существовала, и теперь вы используете её совместно.

Мультиклиентские интеграции, которым требуются независимые диалоги, должны отправлять `sessionScope: "thread"` в каждом запросе `POST /session`. Используйте стандартную область видимости `single` только в том случае, если клиенты намеренно используют одну совместную сессию; в общих сессиях промпты сериализуются через одну FIFO-очередь, что видно в `/daemon/status` как `runtime.activity.pendingPrompts` и `runtime.activity.queuedPrompts`.

Параллельные вызовы `POST /session` для одного и того же рабочего пространства **объединяются** в один запуск — оба вызывающих клиента получают одинаковый `sessionId`, и ровно один из них получает `attached: false`. Если базовый запуск завершается ошибкой (таймаут инициализации, некорректный вывод агента, OOM), **все объединенные вызовы получают ту же ошибку** — слот в процессе выполнения очищается, чтобы последующий вызов мог повторить попытку с самого начала.

> ⚠️ **Отклонение `modelServiceId` для новой сессии происходит без ошибки в
> HTTP-ответе.** Неверный `modelServiceId` (опечатка, ненастроенный сервис)
> НЕ вызывает ошибку 500 при создании — сессия остается рабочей
> на модели агента по умолчанию, поэтому вызывающий клиент все равно получает `sessionId`,
> с помощью которого он может повторить попытку переключения модели (через `POST /session/:id/model`).
> Видимым сигналом ошибки является событие `model_switch_failed` в
> SSE-потоке сессии, которое генерируется между рукопожатием запуска и вашей
> первой подпиской. **Подписчики, которым необходимо отследить это событие,
> должны передавать `Last-Event-ID: 0` при первом запросе `GET
/session/:id/events`**, чтобы воспроизвести события начиная с самого старого
> доступного в кольцевом буфере (это перехватит `model_switch_failed` во время запуска,
> даже если подписка происходит через несколько мс после ответа на создание).

### `POST /session/:id/load`

Восстановление сохраненной ACP-сессии по id и воспроизведение её истории через SSE. Id в пути является авторитетным; любое поле `sessionId` в теле запроса игнорируется. Предварительная проверка `caps.features.session_load` — старые демоны возвращают `404` для этого маршрута.

Запрос:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Поле | Обязательно | Примечания                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | нет | Те же правила каноникализации и `workspace_mismatch`, что и для `POST /session`. Пропустите, чтобы наследовать `/capabilities.workspaceCwd`. `mcpServers` намеренно НЕ принимается здесь — MCP для всего демона управляется настройками (аналогично `POST /session`). |

Ответ:

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` повторяет структуру `LoadSessionResponse` из ACP: `models` — это `SessionModelState`, `modes` — `SessionModeState`, `configOptions` — массив `SessionConfigOption`. Отсутствующие поля определяются агентом. Поздние подключившиеся клиенты (пути с `attached: true` ниже) получают ТОТ ЖЕ снимок `state`, что и исходный вызов load — демон кэширует его при входе; мутации во время выполнения (например, `model_switched`) доставляются через SSE-поток, а не в последующих ответах на подключение.

`attached: true` означает, что сессия уже была активна (либо из-за предыдущего `session/load`/`session/resume`, либо потому, что объединенный параллельный вызов опередил его).

**Воспроизведение истории через SSE.** Пока `loadSession` выполняется на стороне агента, агент отправляет уведомления `session_update` для каждого сохраненного хода. Демон буферизует их в шину событий сессии до того, как вернется ответ маршрута, поэтому подписчики, которые сразу же вызовут `GET /session/:id/events` с `Last-Event-ID: 0`, увидят полное воспроизведение. **Кольцевой буфер воспроизведения ограничен** (по умолчанию 8000 фреймов на сессию). Длинные истории с большим количеством вызовов инструментов / потоков мыслей могут превысить этот лимит — самые старые фреймы будут тихо отброшены. Клиентам, которым нужна полная история, следует подписываться сразу после возврата ответа `load`; в качестве альтернативы они могут сохранять id событий SSE и использовать `Last-Event-ID` для возобновления с более поздней границы хода.

**Ошибки:**

- `404` — сохраненный id сессии не существует (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (та же структура, что и в `POST /session`).
- `503` — `session_limit_exceeded` (учитывается в лимите `--max-sessions`; выполняющиеся в данный момент восстановления также учитываются).
- `409` — `restore_in_progress` (восстановление `session/resume` для того же id уже выполняется). `Retry-After: 5`. Однотипные гонки (два параллельных `session/load` для одного id) объединяются — ровно один возвращает `attached: false`, остальные возвращают `attached: true` с тем же `state`.
- `409` — `session_archived`, если id существует только в `chats/archive/`; вызовите `POST /sessions/unarchive` перед `load` или `resume`.
- `409` — `session_archiving`, если архивация или разархивация выполняется для того же id. `Retry-After: 5`.
- `409` — `session_conflict`, если id существует и в `chats/`, и в `chats/archive/`; удалите сессию с помощью `POST /sessions/delete` перед загрузкой.

### `POST /session/:id/resume`

Восстановление сохраненной ACP-сессии по id БЕЗ воспроизведения истории через SSE. Контекст модели восстанавливается внутренне на стороне агента (через `geminiClient.initialize`, читающий `config.getResumedSessionData`); SSE-поток остается чистым для клиентов, у которых история уже отрисована. Предварительная проверка `caps.features.session_resume`; `unstable_session_resume` остается устаревшим алиасом для обратной совместимости со старыми клиентами.

Та же форма запроса, что и у `/load`. Та же форма ответа — `state` повторяет `ResumeSessionResponse` из ACP. Та же оболочка ошибок, включая `409 restore_in_progress` (возникает, когда выполняется `session/load`; `session/resume`, идущий следом за другим `session/resume`, объединяется).

Используйте `/load`, когда у клиента нет отрисованной истории (холодное переподключение, выбор сессии → открытие). Используйте `/resume`, когда у клиента уже есть ходы на экране и ему нужно просто вернуть дескриптор на стороне демона.

> ⚠️ **Почему `unstable_session_resume` все еще анонсируется?** HTTP-маршрут демона и возможность `session_resume` стабильны для v1, но мост по-прежнему вызывает `connection.unstable_resumeSession` из ACP. Старый тег остается только для того, чтобы SDK, выпущенные до появления `session_resume`, продолжали работать.

### `GET /workspace/:id/sessions`

Список сохраненных сессий, чье каноническое рабочее пространство совпадает с `:id` (абсолютный cwd в URL-кодировке). По умолчанию выводятся активные сессии из `chats/`; передайте `archiveState=archived`, чтобы вывести архивированные сессии из `chats/archive/`. `archiveState=all` не поддерживается в v1. Семантика ответа по умолчанию и числового `cursor` не изменяется из-за `session_organization`.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Параметры запроса:

| Поле          | Обязательно | Примечания                                                                                                                                                                                           |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | нет | `active` (по умолчанию) или `archived`. Любое другое значение возвращает `400 { code: "invalid_archive_state" }`.                                                                                              |
| `cursor`       | нет | Курсор пагинации из предыдущего ответа.                                                                                                                                                   |
| `size`         | нет | Размер страницы. Неверные значения возвращают `400 { code: "invalid_cursor" }` или срабатывает существующая валидация размера страницы.                                                                                         |
| `view`         | нет | Пропустите для устаревшего списка недавних сессий. `organized` включает сортировку закрепленных/групп на стороне сервера и добавляет необязательные поля организации. Любое другое значение возвращает `400 { code: "invalid_session_view" }`. |
| `group`        | нет | Имеет смысл только при `view=organized`. `all` (по умолчанию), `pinned`, `ungrouped` или пользовательский id группы. Неизвестные id групп возвращают `404 { code: "group_not_found" }`.                                |

Ответ:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

При `view=organized` демон читает `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, возвращает сначала закрепленные сессии, затем в порядке убывания времени активности, а затем по `sessionId` для стабильного разрешения ничьих. Организованный курсор представляет собой непрозрачный JSON в формате base64url и не должен использоваться повторно с устаревшим списком недавних сессий. `pinned` — это виртуальный фильтр, а не группа. `groupId: null` означает отсутствие группы. Архивированные сессии сохраняют свои метаданные организации, но `archiveState=archived&view=organized` все равно возвращает только архивированные сессии.

Дополнительные поля могут появляться в каждой сессии при `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Активные списки включают поля live-оверлея демона, такие как `clientCount` и `hasActivePrompt`. Архивные списки предназначены только для хранилища: `isArchived` равно `true`, а поля live-оверлея остаются отсутствующими или ложными. Возвращается пустой массив (а не 404), если сессий не существует — UI выбора сессии не должен выдавать ошибку только из-за того, что рабочее пространство неактивно.

### `GET /workspace/:id/session-groups`

Список пользовательских групп сессий для рабочего пространства. Предварительная проверка `caps.features.includes('session_organization')`.

Ответ:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

Цвета — это только протокольные токены; клиенты локализовывают отображаемые имена. Группы по умолчанию с именами цветов не создаются.

### `POST /workspace/:id/session-groups`

Создание пользовательской группы сессий. Строгая проверка мутации. Предварительная проверка `caps.features.includes('session_organization')`.

Запрос:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` обрезается, должно быть от 1 до 64 символов, не может содержать управляющие символы и должно быть уникальным в пределах рабочего пространства при сравнении без учета регистра и с обрезанными пробелами. Дублирующиеся имена возвращают `409 { code: "group_name_conflict" }`. `color` должен быть одним из возвращенных `colorOptions`.

Ответ:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

Обновление пользовательской группы сессий. Строгая проверка мутации. Предварительная проверка `caps.features.includes('session_organization')`. Поля в теле запроса необязательны: `{ "name"?: string, "color"?: string, "order"?: number }`. Неизвестные id групп возвращают `404 { code: "group_not_found" }`; дублирующиеся/неверные имена и цвета используют те же ошибки, что и при создании.

### `DELETE /workspace/:id/session-groups/:groupId`

Удаление пользовательской группы сессий. Строгая проверка мутации. Предварительная проверка `caps.features.includes('session_organization')`. Сессии, ссылающиеся на группу, очищаются до `groupId: null`; состояние закрепления сохраняется. Ответ — `{ "deleted": true }`, если группа была удалена, и `{ "deleted": false }`, если id не существовал.
### `POST /sessions/delete`

Жесткое удаление одного или нескольких сохраненных JSONL-файлов сессий. Демон сначала по мере возможности (best-effort) закрывает активные сессии, а затем удаляет активный или архивный JSONL. Если для одного и того же id существуют как активная, так и архивная копии, удаляются обе. Сайдкары (sidecars) worktree с обеих сторон очищаются; история файлов, транскрипты подагентов и runtime-сайдкары намеренно сохраняются.

Запрос:

```json
{ "sessionIds": ["<uuid>"] }
```

Ответ:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Архивирование одной или нескольких сессий. Архивирование — это переход состояния, а не удаление: JSONL перемещается из `chats/<id>.jsonl` в `chats/archive/<id>.jsonl`. История файлов, транскрипты подагентов и runtime-сайдкары остаются на месте. Если сессия активна, демон сначала выполняет строгое закрытие и требует, чтобы обработчик закрытия ACP-агента сбросил (flush) запись чата; если закрытие или сброс не выполняются, JSONL не перемещается. Pre-flight `caps.features.session_archive`.

Запрос:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` должен быть непустым массивом строк, содержащим не более 100 id. Дубликаты схлопываются.

Ответ:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

Записи в `errors` имеют формат `{ "sessionId": "<uuid>", "error": "message" }`. Активные и архивные файлы с одинаковым id рассматриваются как конфликт и сообщаются в `errors`; ни один файл не перезаписывается.

### `POST /sessions/unarchive`

Восстановление архивных сессий в активную директорию. Само по себе это не возобновляет сессию; это лишь перемещает `chats/archive/<id>.jsonl` обратно в `chats/<id>.jsonl`. После успешного разархивирования клиенты могут вызвать `POST /session/:id/load` или `POST /session/:id/resume`.

Запрос:

```json
{ "sessionIds": ["<uuid>"] }
```

Ответ:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

Если для данного id уже существует активный JSONL, разархивирование сообщает о конфликте в `errors` и не перезаписывает его. Выполняющееся в данный момент архивирование или разархивирование для того же id возвращает `409 session_archiving` до начала пакетной обработки.

ACP-over-HTTP использует те же тела запросов и ответов через вендорные методы `_qwen/sessions/archive` и `_qwen/sessions/unarchive`. Таблица REST-маршрутов сопоставляет `POST /sessions/archive` и `POST /sessions/unarchive` с этими методами для ACP-транспортов.

### `POST /session/:id/prompt`

Пересылка промпта агенту. Вызывающие стороны с несколькими промптами ставят их в FIFO-очередь для каждой сессии (ACP гарантирует один активный промпт на сессию).

Запрос:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Валидация: `prompt` должен быть непустым массивом объектов. При других ошибках возвращается `400` до достижения bridge.

Ответ:

```json
{ "stopReason": "end_turn" }
```

Другие причины остановки: `cancelled`, `max_tokens`, `error`, `length` (согласно спецификации ACP).

Если HTTP-клиент отключается во время выполнения промпта, демон отправляет агенту ACP-уведомление `cancel`, которое завершает промпт с `stopReason: "cancelled"`.

> **Ограничение Stage 1 — отсутствие серверного таймаута промпта.** Bridge
> только сравнивает (races) `prompt()` агента с `transportClosedReject`
> (падением дочернего процесса агента) и AbortSignal отключения HTTP-клиента.
> Зависший, но живой агент (например, зависший вызов модели)
> блокирует FIFO-очередь сессии до тех пор, пока у HTTP-клиента
> не истечет таймаут и он не отключится. Длительные промпты легитимны
> (глубокий ресерч, анализ большой кодовой базы), поэтому дефолтный дедлайн
> намеренно не устанавливается; в Stage 2 будет добавлена настраиваемая
> опция `promptTimeoutMs`. До этого момента вызывающие стороны должны устанавливать свой собственный
> клиентский таймаут и отключаться (или вызывать
> `POST /session/:id/cancel`) по истечении времени.

### `POST /session/:id/cancel`

Отмена **текущего активного** промпта в сессии. На стороне ACP это уведомление, а не запрос — агент подтверждает это, резолвя активный `prompt()` со статусом `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Контракт множественных промптов:** отмена влияет только на активный промпт. Любые промпты, которые тот же клиент ранее отправил через POST и которые все еще находятся в очереди за активным, продолжат выполняться. Очередь множественных промптов — это поведение, введенное демоном (отсутствует в спецификации ACP); контракт для промптов в очереди звучит так: "они продолжают выполняться, пока вы не отмените каждый из них или не завершите сессию через выход из канала".

Если промпты в очереди неожиданны для развертывания с несколькими клиентами, сначала убедитесь,
что вызывающие стороны не используют совместно сессию с дефолтным `sessionScope: "single"`. Для
независимых разговоров в каждом треде создавайте сессии с
`sessionScope: "thread"`, чтобы промпты сериализовывались только внутри этого треда.

### `DELETE /session/:id`

Явное закрытие активной сессии. Принудительно закрывает сессию, даже если подключены другие клиенты — отменяет любой активный промпт, резолвит ожидающие разрешения как отмененные, публикует событие `session_closed`, закрывает EventBus и удаляет сессию из мап (maps) демона. Сохраненные на диске сессии НЕ удаляются — их можно перезагрузить через `POST /session/:id/load`. Pre-flight `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Идемпотентно: возвращает `404` для неизвестных сессий (та же структура `SessionNotFoundError`, что и для других маршрутов).

> **Событие `session_closed`.** Подписчики SSE получают терминальное событие `session_closed` с `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` перед завершением стрима. SDK-редьюсеры обрабатывают это идентично `session_died` (устанавливает `alive: false`, очищает `pendingPermissions`).

### `PATCH /session/:id/metadata`

Обновление изменяемых метаданных сессии. В настоящее время поддерживается только `displayName`. Pre-flight `caps.features.session_metadata`. Группировка и закрепление намеренно не включены в этот маршрут; используйте `PATCH /session/:id/organization` в рамках `session_organization`.

Запрос:

```json
{ "displayName": "My Investigation Session" }
```

| Поле          | Обязательно | Примечания                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------------ |
| `displayName` | нет         | Строка, макс. 256 символов. Пустая строка очищает имя. Пропустите, чтобы оставить как есть. |

Ответ:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Публикует событие `session_metadata_updated` в SSE-стриме сессии с `{ sessionId, displayName }`.

### `PATCH /session/:id/organization`

Обновление локального состояния организации сессии. Строгий мутационный гейт. Pre-flight `caps.features.includes('session_organization')`.

Запрос:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Поле       | Обязательно | Примечания                                                                                           |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `isPinned` | нет         | Boolean. `true` устанавливает `pinnedAt`, если элемент еще не был закреплен; `false` очищает `pinnedAt`. |
| `groupId`  | нет         | Пользовательский id группы или `null` для отсутствия группы. Неизвестные id групп возвращают `404 { code: "group_not_found" }`. |

Ответ:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

Это состояние хранится в сайдкаре (sidecar) организации сессий на уровне проекта в директории runtime-хранилища демона. Это не контент транскрипта, оно не обновляет `mtime` транскрипта, не экспортируется вместе с транскриптами и сохраняется при архивировании/разархивировании.

### `POST /session/:id/heartbeat`

Обновление учетной записи last-seen (последнее посещение) для этой сессии в демоне. Долгоживущие адаптеры (TUI/IDE/web) пингуют этот эндпоинт с определенным интервалом, чтобы будущая политика отзыва (Wave 5 PR 24) могла отличать мертвых клиентов от просто молчащих.

Заголовки:

| Заголовок          | Обязательно | Примечания                                                                                                                                                                                                                          |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | нет         | Возвращает (echoes) id, выданный демоном из `POST /session`. Идентифицированные клиенты также обновляют свой клиентский таймстамп; анонимные heartbeat-запросы обновляют только вотермарк (watermark) сессии. Должен соответствовать тому же формату `[A-Za-z0-9._:-]{1,128}`, что и в других местах. |

Тело запроса пустое (подойдет `{}` — на сегодняшний день поля не читаются).

Ответ:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` возвращается только в том случае, если был передан доверенный `X-Qwen-Client-Id`. `lastSeenAt` — это сохраненная bridge серверная эпоха `Date.now()` (в мс) демона.

Ошибки:

- `400` — `{ code: 'invalid_client_id' }`, если заголовок имеет неверный формат (правило формы заголовка) или если в нем передан `clientId`, который не зарегистрирован для этой сессии (bridge выбрасывает `InvalidClientIdError` до обновления любого таймстампа).
- `404` — неизвестная сессия.

Гейтинг возможностей (Capability gating): pre-flight `caps.features.client_heartbeat`. Более старые демоны возвращают `404` для этого пути.

### `POST /session/:id/model`

Переключение активной модели **внутри** текущего привязанного сервиса моделей сессии. Сериализуется через очередь смены модели для каждой сессии.

(Для переключения самого _сервиса_ — Alibaba ModelStudio, OpenRouter и т.д. — передавайте `modelServiceId` в `POST /session` для новой сессии. В Stage 1 нет маршрута для переключения сервиса в реальном времени.)

Запрос:

```json
{ "modelId": "qwen-staging" }
```

Ответ:

```json
{ "modelId": "qwen-staging" }
```

При успехе публикует `model_switched` в SSE-стрим. При ошибке публикует `model_switch_failed` (чтобы пассивные подписчики видели ошибку, а не только вызывающая сторона). Запускается параллельно с выходом из канала агента, чтобы зависший дочерний процесс не мог заблокировать HTTP-обработчик.

### `POST /session/:id/recap`

Тег возможности (Capability tag): `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Генерация краткого резюме сессии из одного предложения в формате "на чем я остановился". Обертка над `generateSessionRecap` из core (`packages/core/src/services/sessionRecap.ts`), которая выполняет side-query к быстрой модели с отключенными инструментами, `maxOutputTokens: 300` и строгим форматом вывода `<recap>...</recap>`. Side-query читает существующую историю чата GeminiClient сессии и **не** добавляет в нее ничего.

Тело запроса игнорируется (отправьте `{}` или оставьте пустым). Нестрогий мутационный гейт — поведение зеркально `/session/:id/prompt` (вызов стоит токенов, но не мутирует состояние). Событие SSE не публикуется.

Ответ (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Отладка гонки при повторной попытке авторизации. Далее: добавить детерминированный тайминг в интеграционный тест."
}
```

`recap` равен `null` (обычный 200, не ошибка), когда:

- в сессии еще не было двух диалоговых ходов,
- side-query не вернул извлекаемую нагрузку `<recap>...</recap>`,
- или произошла любая базовая ошибка модели (хелпер core работает в режиме best-effort и никогда не выбрасывает исключения).

Ошибки:

- `400 {code: 'invalid_client_id'}` — неверный формат заголовка `X-Qwen-Client-Id`.
- `404` — неизвестная сессия.

Отмена: **отсутствует в v1**. Маршрут не слушает отключение HTTP-клиента, `AbortSignal` не передается в bridge, и дочерний процесс ACP выполняет side-query до завершения независимо от того, отключился ли вызывающий клиент. Единственными ограничениями являются 60-секундный резервный таймаут bridge (`SESSION_RECAP_TIMEOUT_MS`) и гонка transport-closed с гибелью канала ACP. Это приемлемо, поскольку recap выполняется быстро (одна попытка, `maxOutputTokens: 300`, обычно ~1–5 с); ext-метод отмены на основе request-id может обеспечить полную сквозную отмену в будущих релизах, если затраты на пропускную способность когда-либо это оправдают.

### Мутация: approval, tools, init, перезапуск MCP
Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 добавляет четыре маршрута управления изменениями, которые позволяют удаленным клиентам изменять состояние среды выполнения без использования CLI хоста демона. Все четыре:

- Защищены **строгим** шлюзом изменений из PR 15. Демон, настроенный без bearer-токена, отклоняет их с ошибкой `401 {code: 'token_required'}`. Настройте `--token` (или `QWEN_SERVER_TOKEN`) перед включением.
- Принимают и помечают заголовок `X-Qwen-Client-Id` (цепочка аудита из PR 7). Если заголовок содержит доверенный id, демон добавляет `originatorClientId` в соответствующее событие SSE, чтобы интерфейсы других клиентов могли подавлять эхо собственных изменений.
- Выполняют pre-flight проверку каждой возможности для каждого тега перед предоставлением доступа. Более старые версии демона возвращают `404` для этого маршрута.

Три из четырех маршрутов (`tools/:name/enable`, `init`, `mcp/:server/restart`) генерируют события **в масштабе рабочего пространства**: каждое активное событие SSE-шины сессии получает это событие, независимо от того, какая сессия была подключена в момент инициирования изменения. `approval-mode` генерирует событие **в масштабе сессии**, так как изменение является локальным для `Config` только одной сессии.

#### `POST /session/:id/approval-mode`

Тег возможности: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Изменяет режим одобрения для активной сессии. Новый режим немедленно применяется в `Config` дочернего процесса ACP для конкретной сессии. По умолчанию настройки НЕ записываются на диск — передайте `persist: true`, чтобы также записать `tools.approvalMode` в настройки рабочего пространства.

Запрос:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` должен быть одним из `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (зеркальное отражение enum `ApprovalMode` ядра; SDK экспортирует `DAEMON_APPROVAL_MODES` для проверки во время выполнения). `persist` по умолчанию равен `false`.

Ответ (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Ошибки:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — неизвестное значение режима.
- `400 {code: 'invalid_persist_flag'}` — `persist` не является булевым значением.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — запрошенный режим требует доверенной папки (привилегированные режимы в недоверенных рабочих пространствах отклоняются методом `Config.setApprovalMode` ядра).
- `404` — сессия не найдена.

Событие SSE (в масштабе сессии): `approval_mode_changed` с `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Тег возможности: `workspace_tool_toggle`. Чистый файловый ввод-вывод — без обращения к ACP.

Переключает имя инструмента в списке настроек `tools.disabled` рабочего пространства. Инструменты, указанные там, **не регистрируются** вообще (в отличие от `permissions.deny`, который оставляет инструмент зарегистрированным, но отклоняет его вызов). Как встроенные инструменты, так и инструменты, обнаруженные через MCP, проходят через `ToolRegistry.registerTool`, который проверяет набор отключенных инструментов.

> ⚠️ **Имена должны точно совпадать с открытым идентификатором в реестре.** Разрешение псевдонимов не выполняется — маршрут сохраняет любую строку из path-параметра в `tools.disabled`, а следующий дочерний процесс ACP сравнивает её с `tool.name` во время регистрации. Встроенные инструменты используют свое каноническое имя в реестре (в форме snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` и т.д. — НЕ отображаемые метки (`Shell`, `Read`, `Write`), которые показывает CLI. Инструменты, обнаруженные через MCP, используют квалифицированную форму `mcp__<server>__<name>` (которая также используется в событиях `tool_toggled` и в списке `GET /workspace/mcp`). Отключение `Bash` НЕ предотвратит регистрацию `run_shell_command` в следующей сессии.

Активные дочерние процессы ACP сохраняют уже зарегистрированные инструменты — переключение вступает в силу только при запуске **следующего** дочернего процесса ACP. Объедините с `POST /workspace/mcp/:server/restart` (для инструментов из MCP) или созданием новой сессии, чтобы изменение вступило в силу в текущем демоне.

Неизвестные имена инструментов принимаются: предварительное отключение еще не установленного MCP-инструмента является допустимым сценарием использования.

Запрос:

```json
{ "enabled": false }
```

Ответ (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Ошибки:

- `400 {code: 'invalid_tool_name'}` — пустой path-параметр или его длина превышает лимит в 256 символов.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` отсутствует или не является булевым значением.

Событие SSE (в масштабе рабочего пространства): `tool_toggled` с `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Тег возможности: `workspace_init`. Чистый файловый ввод-вывод — без обращения к ACP, **без вызова LLM**.

Создает пустой `QWEN.md` (или то, что возвращает `getCurrentGeminiMdFilename()` при переопределении `--memory-file-name`) в корневой папке рабочего пространства, привязанного к демону. Только механическое действие — для заполнения содержимого с помощью ИИ, выполните `POST /session/:id/prompt`.

По умолчанию отказывается перезаписывать файл, если целевой файл существует и содержит непробельные символы. Файлы, содержащие только пробелы, считаются отсутствующими (аналогично локальной slash-команде `/init`).

Запрос:

```json
{ "force": false }
```

Ответ (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` принимает значение `'created'` при новом создании, `'noop'`, если существующий файл, содержащий только пробелы, был оставлен без изменений (запись не выполнялась), и `'overwrote'`, когда `force: true` заменил непустое содержимое. Событие SSE `workspace_initialized` дублирует действие из ответа — наблюдатели могут фильтровать по `action !== 'noop'`, чтобы реагировать только на реальные изменения на диске.

Ошибки:

- `400 {code: 'invalid_force_flag'}` — `force` не является булевым значением.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — файл существует и содержит непробельные символы, а `force` не указан или равен false. Тело ответа содержит абсолютный путь и размер (в байтах), чтобы клиенты SDK могли отобразить запрос «перезаписать N байт?» без повторного вызова stat.

Событие SSE (в масштабе рабочего пространства): `workspace_initialized` с `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Тег возможности: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Перезапускает настроенный MCP-сервер через `McpClientManager.discoverMcpToolsForServer` дочернего процесса ACP (отключение + повторное подключение + повторное обнаружение). Предварительно проверяет актуальный снимок бюджета из системы учета PR 14 v1, чтобы перезапуск в рабочем пространстве с исчерпанным бюджетом возвращал мягкий отказ, а не запускал каскад ошибок `BudgetExhaustedError`.

Тело запроса пустое (`{}`). Path-параметр — это URL-кодированное имя сервера в том виде, в котором оно указано в конфигурации `mcpServers`.

Ответ (200) — дискриминированное объединение по полю `restarted`:

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

Причины мягкого пропуска (все возвращают 200):

| `reason`                | Значение                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Другое обнаружение / перезапуск для этого сервера уже выполняется. Маршрут возвращает ответ немедленно, не ожидая исходный промис. Вызывающая сторона должна повторить попытку после небольшой задержки. |
| `'disabled'`            | Сервер настроен, но указан в `excludedMcpServers`. Включите его перед перезапуском.                                                                                                    |
| `'budget_would_exceed'` | Демон запущен с `--mcp-budget-mode=enforce`, целевой сервер в данный момент не находится в `reservedSlots`, а текущий общий объем достиг `clientBudget`. Вызывающая сторона должна сначала освободить слот.         |

Ошибки (не 2xx):

- `400 {code: 'invalid_server_name'}` — пустой path-параметр.
- `404` — имя сервера отсутствует в конфигурации `mcpServers` или не существует активного ACP-канала (перезапуск по своей сути требует активного экземпляра `McpClientManager`).
- `500` — внутренняя ошибка (например, `ToolRegistry` не инициализирован).

События SSE (в масштабе рабочего пространства): `mcp_server_restarted` с `{serverName, durationMs, originatorClientId?}` при успехе; `mcp_server_restart_refused` с `{serverName, reason, originatorClientId?}` при мягком пропуске.

### `GET /session/:id/events` (SSE)

Подписка на поток событий сессии.

Заголовки:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
```

Query-параметры:

| Параметр       | Обязательный | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | нет       | Лимит **очереди живых фреймов** для каждого подписчика. Диапазон `[16, 2048]`, по умолчанию 256. Фреймы повторной передачи, принудительно отправляемые при подписке, не подпадают под ограничения по количеству фреймов и байт; фактически они потребляются живыми событиями, которые поступают, пока подписчик все еще обрабатывает большую повторную передачу `Last-Event-ID: 0`. Увеличьте значение для холодных переподключений, чтобы живой хвост не вызывал предупреждение о медленном клиенте / исключение до того, как потребитель догонит. Лимит живых сериализованных байт жестко задан на стороне демона (по умолчанию 2 МиБ) и не имеет query-параметра. Значения вне диапазона / не в десятичном формате / присутствующие, но пустые возвращают `400 invalid_max_queued` до открытия SSE-соединения. Pre-flight `caps.features.slow_client_warning` — старые демоны тихо игнорируют этот параметр. |

Формат фрейма. Строка `data:` — это **полный конверт события**, сериализованный в JSON в одну строку — `{id?, v, type, data, originatorClientId?}`. Специфичная для ACP полезная нагрузка (аргументы `sessionUpdate`, `requestPermission` и т.д.) находится в поле `data` конверта; собственный `type` конверта совпадает со строкой SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

Строки `id:` / `event:` на уровне SSE дублируют `envelope.id` / `envelope.type` для совместимости с EventSource. Потребители, использующие чистый `fetch` (например, `parseSseStream` из SDK), читают все данные из JSON-конверта и игнорируют строки преамбулы SSE.
| Тип события               | Триггер                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Любое ACP-уведомление `sessionUpdate` (чанки LLM, вызовы инструментов, использование)                                                                                                                                                                                                                                                                                                                                                                                                         |
| `permission_request`      | Агент запросил подтверждение инструмента                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `permission_resolved`     | Какой-либо клиент проголосовал за разрешение через `POST /permission/:requestId`                                                                                                                                                                                                                                                                                                                                                                                                                |
| `permission_partial_vote` | (только для consensus) Голос учтен, но кворум еще не достигнут. Содержит `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                                                                         |
| `permission_forbidden`    | Голос отклонен активной политикой (несоответствие `designated`, `local-only` не для loopback или голосующий в `consensus` отсутствует в снапшоте). Содержит `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                       |
| `model_switched`          | `POST /session/:id/model` выполнен успешно                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` отклонен                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_died`            | Дочерний процесс агента неожиданно завершился с ошибкой. **Терминальное: SSE-поток закрывается после этого фрейма; сессия удаляется из `byId`.** Подписчикам следует переподключиться через `POST /session`, чтобы создать новую.                                                                                                                                                                                                                                                               |
| `slow_client_warning`     | Локальное для подписчика: бэклог живых фреймов или бэклог живых сериализованных байтов заполнен ≥ 75%. **Нетерминальное** — поток продолжается; предупреждение подается перед исключением. Содержит `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`, где `threshold` — это `frames`, `bytes` или `frames_and_bytes`. Срабатывает ОДИН раз за эпизод переполнения; повторно взводится после того, как оба показателя упадут ниже 37,5%. Без `id` (синтетическое). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`          | Локальное для подписчика: переполнение очереди. `reason` равен `queue_overflow` для лимита живых фреймов и `queue_bytes_overflow` для лимита живых сериализованных байтов. **Терминальное: SSE-поток закрывается после этого фрейма** (без `id` — синтетическое). Другие подписчики в той же сессии продолжают работу.                                                                                                                                                                         |
| `stream_error`            | Ошибка на стороне демона при рассылке. **Терминальное: SSE-поток закрывается после этого фрейма** (без `id` — синтетическое).                                                                                                                                                                                                                                                                                                                                                                   |

Семантика переподключения:

- Отправьте `Last-Event-ID: <n>`, чтобы воспроизвести события с `id > n` из кольцевого буфера сессии (глубина по умолчанию **8000**, настраивается через `qwen serve --event-ring-size <n>`)
- **Обнаружение пропусков (на стороне клиента):** если `<n>` старше самого старого события в кольцевом буфере (например, вы переподключаетесь с `Last-Event-ID: 50`, но буфер теперь содержит события 200–1199), демон воспроизводит события начиная с самого старого доступного без выдачи ошибки. Сравните `id` первого воспроизведенного события с `n + 1`; любая разница — это размер потерянного окна. На Этапе 2 (Stage 2) будет добавлен явный синтетический фрейм `stream_gap` на стороне демона; на Этапе 1 (Stage 1) обнаружение лежит на клиенте.
- ID монотонны в рамках сессии, начинаются с 1
- Синтетические фреймы (`client_evicted`, `slow_client_warning`, `stream_error`) намеренно не содержат `id`, чтобы не занимать слот в последовательности для других подписчиков

Противодавление:

- Очередь для каждого подписчика по умолчанию имеет лимит `maxQueued: 256` живых элементов плюс принадлежащий демону лимит в 2 МиБ для живых сериализованных байтов. Фреймы воспроизведения при переподключении, а также `slow_client_warning` и `client_evicted` обходят оба лимита.
- Переопределить можно только лимит фреймов через `?maxQueued=N` (диапазон `[16, 2048]`) в SSE-запросе. Параметр `?maxQueuedBytes` намеренно отсутствует; клиенты не могут увеличивать бюджет памяти демона.
- Когда бэклог живых фреймов или бэклог живых байтов подписчика заполняется более чем на 75%, шина принудительно отправляет этому подписчику синтетический фрейм `slow_client_warning` (один раз за эпизод переполнения; повторно взводится после падения обоих показателей ниже 37,5%). Поток остается открытым — предупреждение подается заранее, чтобы клиент мог быстрее обработать очередь или отключиться и корректно переподключиться.
- При переполнении лимита живых фреймов шина отправляет `client_evicted` с `reason: "queue_overflow"`. При переполнении лимита живых байтов отправляется `reason: "queue_bytes_overflow"`. В обоих случаях терминальный фрейм отправляется принудительно, и подписка закрывается.

### `POST /permission/:requestId`

Проголосуйте по ожидающему обработки `permission_request`. Активная **политика медиации** определяет, чей голос победит:

| Политика                    | Поведение                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (по умолчанию) | Побеждает любой валидированный голосующий; последующие голосующие получают `404`. Базовая версия до F3.                                                                                                                                                     |
| `designated`                | Решает только инициатор промпта (`originatorClientId`); не-инициаторы получают `403 permission_forbidden / designated_mismatch`. Для анонимных промптов используется fallback на first-responder.                                                          |
| `consensus`                 | N из M голосующих должны согласиться (по умолчанию `N = floor(M/2) + 1`, переопределяется через `policy.consensusQuorum`). Побеждает первый вариант, набравший `N` голосов. Нерешающие голоса получают `200` + SSE-фреймы `permission_partial_vote`. |
| `local-only`                | Решают только голосующие с loopback; удаленные вызывающие получают `403 permission_forbidden / remote_not_allowed`.                                                                                                                                        |

Активная политика настраивается в `settings.json` в разделе `policy.permissionStrategy` и отображается в `/capabilities` по пути `body.policy.permission`. Pre-flight `caps.features.permission_mediation` (с `modes: [...]`) для набора, поддерживаемого сборкой.

> **F3 (#4175): координация разрешений для нескольких клиентов.** В F3 добавлены четыре вышеуказанные политики. В демонах до F3 first-responder был жестко задан; формат данных остается бит-в-бит неизменным, если настроена политика `first-responder`. Новые события (`permission_partial_vote`, `permission_forbidden`) являются аддитивными — старые SDK видят их как `unrecognized_known_event` и корректно игнорируют.

> **Таймаут разрешения (по умолчанию 5 минут).** Запрос `permission_request`
> остается в ожидании, пока: (a) какой-либо клиент не проголосует здесь,
> (b) не сработает `POST /session/:id/cancel`, (c) HTTP-клиент, управляющий
> промптом, не отключится (отмена во время промпта разрешает ожидающие
> обработки разрешения как `cancelled`), (d) сессия не будет завершена,
> (e) демон не завершит работу, **или (f) не сработает таймаут разрешения
> для сессии** (`DEFAULT_PERMISSION_TIMEOUT_MS`, 5 минут). При срабатывании
> таймаута `requestPermission` агента разрешается как `{outcome: 'cancelled'}`,
> кольцевой буфер аудита записывает запись `permission.timeout`, в stderr
> демона выводится однострочная метка, а SSE-шина рассылает стандартный
> отмененный фрейм `permission_resolved`, чтобы подписчики могли очистить
> состояние. Таймаут настраивается через
> `BridgeOptions.permissionResponseTimeoutMs`; headless-клиентам, выполняющим
> длинные промпты, может потребоваться увеличить его.

Запрос:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Результаты:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — принять / отклонить / выполнить один раз и т.д., в соответствии с вариантами, предложенными агентом
- `{ "outcome": "cancelled" }` — отменить запрос (аналогично тому, что делают `cancelSession` / `shutdown` внутри)

Ответ:

- `200 {}` — ваш голос принят (разрешен ИЛИ учтен в рамках кворума consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: активная политика отклонила ваш голос
- `404 { "error": "..." }` — неизвестный requestId (уже разрешен, не существовал или сессия уничтожена)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: `allowedOptionIds` агента содержит зарезервированный маркер `'__cancelled__'`; нарушение контракта между агентом и демоном
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3: прямая совместимость: литерал политики появился в схеме, но ее ветка медиатора еще не реализована (в настоящее время недостижимо; зарезервировано для будущих политик)
После успешного голосования каждый подключенный клиент получает `permission_resolved` с тем же `requestId` и выбранным `outcome`. В режиме `consensus` промежуточные голоса дополнительно рассылаются как `permission_partial_vote` до достижения кворума.

### Роуты Auth device-flow (issue #4175 PR 21)

Демон выступает брокером для OAuth 2.0 Device Authorization Grant (RFC 8628), позволяя удаленному SDK-клиенту инициировать вход, при котором токены сохраняются в файловой системе **демона**, а не клиента. Демон самостоятельно опрашивает IdP; единственная задача клиента — отобразить URL верификации и пользовательский код, а также (опционально) подписаться на SSE для получения событий о завершении.

Тег возможности: `auth_device_flow` (всегда анонсируется). Поддерживаемые провайдеры в v1: `qwen-oauth`.

> [!note]
>
> Бесплатный тариф Qwen OAuth был закрыт 15.04.2026. Рассматривайте `qwen-oauth` как устаревший идентификатор провайдера v1 в данном протоколе; новые клиенты должны предпочитать актуальные поддерживаемые провайдеры аутентификации, если они доступны.

**Локальность выполнения.** Демон никогда не открывает браузер — даже если имеет такую возможность. Клиент сам решает, вызывать ли `open(verificationUri)` локально; в headless-поде (каноничный деплой Mode B) пользователь открывает URL на любом устройстве, где есть браузер. Рекомендуемый UX описан в `docs/users/qwen-serve.md`.

**Отсутствие утечки токенов в событиях.** `auth_device_flow_started` передает только `{deviceFlowId, providerId, expiresAt}`. Пользовательский код и URL верификации возвращаются точка-в-точку в теле ответа POST 201 и через `GET /workspace/auth/device-flow/:id`; они никогда не транслируются через SSE.

**Синглтон для каждого провайдера.** Повторный `POST` для того же провайдера, пока поток ожидает обработки, является идемпотентным перехватом — он возвращает существующую запись с `attached: true`, вместо того чтобы начинать новый запрос к IdP.

#### `POST /workspace/auth/device-flow`

Строгий шлюз мутаций: требует bearer-токен даже для loopback-настроек по умолчанию без токенов (`401 token_required`).

Запрос:

```json
{ "providerId": "qwen-oauth" }
```

Ответ (`201` — новый запуск, `200` — идемпотентный перехват):

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Ошибки:

- `400 unsupported_provider` — неизвестный `providerId` (ответ включает `supportedProviders`)
- `409 too_many_active_flows` — достигнут лимит воркспейса (4); отмените один с помощью `DELETE`
- `401 token_required` — строгий шлюз отклонил запрос без токена
- `502 upstream_error` — IdP вернул непредвиденную ошибку

#### `GET /workspace/auth/device-flow/:id`

Чтение текущего состояния. Ожидающие записи возвращают `userCode/verificationUri/expiresAt/intervalMs`; терминальные записи (после 5-минутного грейс-периода) опускают их и выводят `status` + опциональные `errorKind/hint`.

Возвращает `404 device_flow_not_found` для неизвестных id и записей, удаленных после грейс-периода.

#### `DELETE /workspace/auth/device-flow/:id`

Идемпотентная отмена:

- ожидающая запись → `204` + отправка `auth_device_flow_cancelled`
- терминальная запись → `204` no-op (без повторной отправки события)
- неизвестный id → `404`

#### `GET /workspace/auth/status`

Снимок ожидающих потоков + поддерживаемых провайдеров:

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### SSE-события Device-flow

Пять типизированных событий (в масштабе воркспейса, рассылаемых на каждую активную шину сессий):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST выполнен успешно; SDK должен подписаться (здесь нет userCode, при необходимости получите через GET)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — демон учел upstream-запрос `slow_down`; клиенты, опрашивающие GET, должны увеличить свой интервал до соответствующего значения
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — учетные данные сохранены; `accountAlias` — это метка без PII (никогда не email/телефон)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — терминальное; `errorKind` принимает одно из значений: `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` — внутренняя ошибка демона: обмен с IdP прошел успешно, но демон не смог надежно сохранить учетные данные (EACCES / EROFS / ENOSPC). Пользователю следует повторить попытку после устранения проблемы с диском.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE успешно выполнен для ожидающей записи

> **Несовместимо с MCP.** Спецификация авторизации MCP (2025-06-18) требует OAuth 2.1 + PKCE auth-code с редирект-колбэком, что не работает для демонов в headless-подах. Поверхность device-flow в Mode B является приватной для демона — клиентам, нацеленным на MCP-совместимые серверы, следует использовать другой путь аутентификации.

## Формат данных стриминга

События отправляются в виде стандартных фреймов EventSource. Демон записывает одну строку `data:` на каждый фрейм (в JSON нет встроенных переносов строк после `JSON.stringify`); парсер SDK в `packages/sdk-typescript/src/daemon/sse.ts` обрабатывает как этот формат, так и разрешенный спецификацией формат с несколькими `data:` на стороне приема.

## Фреймы ошибок во время стриминга

Если итератор моста выбрасывает исключение при обслуживании подписчика SSE, демон отправляет терминальный фрейм `stream_error` (без `id`). Строка `data:` содержит полный конверт (той же формы, что и любой другой SSE-фрейм в этом документе); фактическое сообщение об ошибке находится в `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

После этого соединение закрывается.

## Переменные окружения

| Переменная          | Назначение                                                     |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer-токен. При запуске обрезаются начальные и конечные пробелы. |

## Структура исходного кода

| Путь                                                 | Назначение                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs-команда + схема флагов                                                                             |
| `packages/cli/src/serve/run-qwen-serve.ts`           | жизненный цикл слушателя + обработка сигналов                                                            |
| `packages/cli/src/serve/server.ts`                   | сборка Express-приложения, порядок middleware и остальные прямые роуты                                   |
| `packages/cli/src/serve/routes/*.ts`                 | Сфокусированные группы Express-роутов, включая сессии, SSE, аутентификацию воркспейса, статус воркспейса и файловые роуты |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist хостов + запрет CORS                                                                  |
| `packages/cli/src/serve/acp-session-bridge.ts`       | CLI-локальный фасад совместимости моста для spawn-or-attach, FIFO для каждой сессии и реестр разрешений  |
| `packages/acp-bridge/src/status.ts`                  | wire-типы статуса демона только для чтения + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | чистый хелпер, собирающий пейлоады `/workspace/env` из состояния `process.*`, включая маскирование учетных данных |
| `packages/acp-bridge/src/eventBus.ts`                | ограниченная асинхронная очередь + кольцо воспроизведения                                                |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-клиент                                                                                                |
| `packages/sdk-typescript/src/daemon/sse.ts`          | парсер фреймов EventSource                                                                               |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 тестов, без LLM                                                                                       |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 теста, реальный дочерний процесс `qwen --acp` с локальным фейковым OpenAI-сервером (только POSIX; пропускается в Windows) |