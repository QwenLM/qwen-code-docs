# Справочник по HTTP-протоколу `qwen serve`

Этап 1 [дизайна демона qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Все маршруты находятся по базовому URL демона (по умолчанию `http://127.0.0.1:4170`).

## Аутентификация

Если демон был запущен с флагом `--token` или переменной `QWEN_SERVER_TOKEN`, **каждый маршрут, кроме `/health` при привязке к loopback-интерфейсу**, должен содержать:

```
Authorization: Bearer <token>
```

Без настроенного токена (стандартно для loopback в режиме разработки) заголовок необязателен. Сравнение токенов выполняется за константное время. Ответы 401 унифицированы для случаев `missing header` / `wrong scheme` / `wrong token`.

**Исключение для `/health`** (Bctum): при привязке к loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`) `/health` регистрируется ДО bearer-промежуточного ПО, поэтому liveness-пробы внутри пода могут не передавать токен, даже если демон запущен с `--token`. При привязке не к loopback (`--hostname 0.0.0.0` и т.д.) `/health` защищается bearer-токеном, как и любой другой маршрут — см. раздел [`GET /health`](#get-health) для понимания причин.

**`--require-auth` (#4175 PR 15).** Передайте этот флаг при запуске, чтобы распространить правило «обязательного наличия токена» и на loopback. Запуск без токена завершится ошибкой; исключение для `/health` снимается (поэтому `/health` также требует `Authorization: Bearer …`).

Когда флаг включен, глобальное промежуточное ПО `bearerAuth` защищает **каждый** маршрут, включая `/capabilities`. Поэтому **неаутентифицированный** клиент не может выполнить pre-flight запрос `caps.features`, чтобы узнать, что требуется аутентификация: поверхностью обнаружения в этом случае является само **тело ответа 401** (унифицированное для всех маршрутов согласно разделу [Аутентификация](#authentication)). Тег возможности `require_auth` — это **подтверждение после успешной аутентификации**: как только клиент успешно аутентифицируется и прочитает `/capabilities`, наличие тега подтверждает, что демон был запущен с `--require-auth` (полезно для UI аудита/соответствия требованиям и для клиентов SDK, чтобы отображать «этот деплоймент усилен» на панели настроек). Маршруты мутации, подключенные к строгому режиму для каждого маршрута (дополнения Wave 4), отклоняют запросы с `401 { code: "token_required", error: "…" }` при обращении к ним в режиме loopback по умолчанию без токена — но при включенном `--require-auth` глобальное bearer-промежуточное ПО прерывает запрос до проверки на уровне маршрута, поэтому неаутентифицированные вызывающие стороны фактически видят устаревшее тело `Unauthorized`.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Браузерные webui, обращающиеся к демону с другого origin, по умолчанию блокируются — любой запрос с заголовком `Origin` возвращает `403 {"error":"Request denied by CORS policy"}`, поскольку клиенты CLI/SDK никогда не отправляют `Origin`, и демон расценивает его наличие как признак того, что запрос поступил из браузерного контекста, который оператор не разрешил. Передайте `--allow-origin <pattern>` (можно повторять) при запуске, чтобы установить список разрешенных origin вместо глухой стены. Каждый паттерн может быть:

- Буквальный `*` — разрешает любой origin. **Опасно**: запуск завершится ошибкой, если настроен `*`, но не задан bearer-токен (из любого источника: `--token`, `QWEN_SERVER_TOKEN` или `--require-auth`, который требует токен при запуске). При наличии `*` в списке загрузочный маячок выводит предупреждение в stderr. **Рекомендация**: используйте в паре с `--require-auth` при привязке к loopback, чтобы `/health` и `/demo` также защищались bearer-токеном — по умолчанию они регистрируются до bearer-промежуточного ПО на loopback (чтобы пробы k8s/Compose могли достигать `/health` без токена), а список разрешенных `*` делает их доступными из любого cross-origin браузера. При привязке не к loopback bearer уже обязателен при запуске, поэтому поверхность риска с `*` — это только `/health` (JSON статуса) и `/demo` (статическая страница, чей JS все равно вызывает защищенные токеном маршруты) — фактическая поверхность API в любом случае защищена.
- Канонический URL origin — `<scheme>://<host>[:<port>]`. **Без завершающего слэша, без пути, без userinfo, без query.** Запуск завершится ошибкой `InvalidAllowOriginPatternError`, если запись не проходит проверку `new URL(pattern).origin === pattern`; в сообщении об ошибке указывается некорректный паттерн и каноническая форма. Строгость заложена намеренно: тихая нормализация (например, удаление завершающего `/`) позволила бы опечаткам проскользнуть и принимать неоднозначные входные данные.

Сопоставленные origin получают стандартные заголовки ответа CORS в каждом запросе:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` дословно повторяет origin запроса (в нижнем/верхнем регистре, как отправил браузер), а не буквальный `*`, даже при паттерне `*` — кэши браузера ключуют ответы по нему в паре с `Vary: Origin`, а повторение оставляет возможность добавить `Access-Control-Allow-Credentials` в следующем релизе без изменения схемы. `Access-Control-Expose-Headers: Retry-After` позволяет браузерным webui учитывать подсказки демона о повторных попытках из ответов `429` / `503`. `Access-Control-Allow-Credentials` на данный момент **НЕ** отправляется: демон аутентифицируется через bearer в `Authorization`, что работает cross-origin без `credentials: 'include'`.

OPTIONS preflight-запросы (OPTIONS с `Access-Control-Request-Method` или `Access-Control-Request-Headers`) прерываются с `204 No Content` плюс заголовки выше. Это стандартный паттерн CORS, и он безопасен — preflight только подтверждает, какие методы/заголовки примет демон; фактический последующий запрос все равно проходит полную цепочку (список разрешенных хостов → bearer-аутентификация → маршруты), поэтому защита от anti-DNS-rebinding и проверка bearer все равно срабатывают до чтения или изменения любого состояния. Обычные OPTIONS-запросы из сопоставленных origin продолжают проходить дальше с прикрепленными заголовками CORS.

Origin, не совпадающие со списком разрешенных, по-прежнему получают `403 {"error":"Request denied by CORS policy"}` — ту же обертку, что и для стены по умолчанию, поэтому клиентам, которые уже парсили ответ стены, не нужно обрабатывать особый случай для демонов с настроенным списком. Путь отклонения **не** выдает никаких заголовков `Access-Control-*` (браузер все равно бы их проигнорировал, а их выдача косвенно раскрыла бы размер списка разрешенных через наличие заголовков).

Настроенный список паттернов намеренно НЕ повторяется в `/capabilities` — браузерный webui и так знает свой собственный origin (в конце концов, он сам вызвал демон), а вывод списка позволил бы неаутентифицированному читателю `/capabilities` перечислить все доверенные origin (полезная разведка для неправильно настроенного деплоймента). Клиенты SDK ориентируются на тег `caps.features.allow_origin` для понимания «этот демон разрешает cross-origin запросы из браузера», не зная конкретных origin.

Loopback self-origin запросы (например, когда страница `/demo` обращается к демону на том же `127.0.0.1:port`) обрабатываются **отдельным** shim-модулем для удаления Origin, который запускается ДО CORS-промежуточного ПО и удаляет заголовок `Origin` для `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Поэтому они проходят независимо от конфигурации `--allow-origin` — операторам не нужно указывать собственный порт демона, чтобы работала демо-страница.

## Общий формат ошибок

Ответы 5xx содержат `code` и `data` исходной ошибки, если они есть (в стиле JSON-RPC — ACP SDK пересылает `{code, message, data}` от агента):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

При некорректном JSON в теле запроса возвращается:

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

Используйте это для pre-flight обнаружения несоответствия: прочитайте `workspaceCwd` из `/capabilities` и опустите `cwd` в `POST /session` (он вернется к привязанной рабочей области) или направьте запрос к демону, привязанному к `requestedWorkspace`.

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

Возникает, когда `session/load` вызывается для id, по которому уже выполняется `session/resume` (или наоборот). Подождите хотя бы `Retry-After` секунд и повторите попытку — базовое восстановление завершается в течение `initTimeoutMs` (по умолчанию 10 с). Гонки одинаковых действий (`load` против `load`, `resume` против `resume`) объединяются вместо выдачи ошибки.

## Возможности

Демон объявляет поддерживаемые теги функций из реестра возможностей serve. Клиенты **должны** включать UI-элементы на основе `features`, а не `mode` (согласно дизайну §10).

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
 'session_close', 'session_metadata', 'mcp_guardrails',
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

> Условные теги появляются только при включении соответствующего переключателя деплоймента (см. таблицу ниже). Тег `permission_mediation` из F3 включен всегда и содержит `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, чтобы клиенты SDK могли анализировать набор, поддерживаемый сборкой; активная в рантайме стратегия находится в `body.policy.permission`.

`session_scope_override` — это механизм согласования для поля `sessionScope` в каждом запросе `POST /session` (см. ниже). Старые демоны молча игнорируют это поле, поэтому клиентам SDK следует выполнять pre-flight `caps.features` на наличие этого тега перед его отправкой.

`session_load` и `session_resume` объявляют маршруты явного восстановления (`POST /session/:id/load` и `POST /session/:id/resume`). Старые демоны возвращают `404` для этих путей, поэтому клиентам SDK следует выполнять pre-flight `caps.features` перед вызовом. `unstable_session_resume` по-прежнему объявляется как устаревший псевдоним для совместимости с SDK, выпущенными, когда базовый метод ACP назывался `connection.unstable_resumeSession`; новые клиенты должны ориентироваться на `session_resume`.

`slow_client_warning` охватывает два совместно выпущенных механизма обратного давления SSE, представленных в #4175 Wave 2.5 PR 10: (a) демон отправляет синтетический фрейм потока событий `slow_client_warning`, когда очередь подписчика заполняется более чем на 75%, один раз за эпизод переполнения (сбрасывается после очистки очереди ниже 37,5%); (b) `GET /session/:id/events` принимает query-параметр `?maxQueued=N` (диапазон `[16, 2048]`) для предварительного размера отставания на подписчика при холодных переподключениях к большому кольцу воспроизведения. Размер кольца для всего демона управляется `--event-ring-size` (по умолчанию **8000**, согласно #3803 §02). Старые демоны молча лишены обоих — выполняйте pre-flight этого тега перед его использованием.

`typed_event_schema` объявляет, что полезные нагрузки событий демона соответствуют схеме SDK `KnownDaemonEvent`. Старые демоны могут по-прежнему передавать совместимые фреймы, но клиентам SDK следует выполнять pre-flight этого тега перед тем, как полагаться на покрытие типизированных событий.

`client_heartbeat` объявляет `POST /session/:id/heartbeat`. Старые демоны возвращают `404`; выполняйте pre-flight этого тега перед отправкой периодических heartbeat-запросов.

`session_close` и `session_metadata` объявляют `DELETE /session/:id` и `PATCH /session/:id/metadata`. Старые демоны возвращают `404`; выполняйте pre-flight этих тегов перед предоставлением функций закрытия или переименования.

`session_lsp` объявляет `GET /session/:id/lsp`, снимок структурированного статуса LSP только для чтения для клиентов демона. Старые демоны возвращают `404`; выполняйте pre-flight этого тега перед отображением удаленного статуса LSP.

`session_status` объявляет `GET /session/:id/status`, сводку live-моста для одной сессии по id (`clientCount` / `hasActivePrompt` и основные поля). Старые демоны возвращают `404`; выполняйте pre-flight этого тега перед опросом статуса одной сессии вместо сканирования полного списка сессий.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` и `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) объявляют четыре маршрута управления мутацией, описанные ниже в разделе "Мутация: одобрение, инструменты, инициализация, перезапуск MCP". Все четыре строго защищены шлюзом мутации из PR 15 (демон, настроенный без bearer-токена, отклоняет их с 401 `token_required`). Старые демоны возвращают `404`; выполняйте pre-flight каждого тега перед предоставлением соответствующей функции.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) охватывает поверхность бюджета MCP: поля `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` в `GET /workspace/mcp`, поле `disabledReason` в ячейках для каждого сервера и флаги CLI `--mcp-client-budget` / `--mcp-budget-mode`. Старые демоны полностью опускают новые поля; клиенты SDK выполняют pre-flight этого тега перед использованием семантики `budgets[]`. Дескриптор реестра также содержит `modes: ['warn', 'enforce']` для будущего отображения режимов функций — пока клиенты определяют режим по полю `budgetMode` в снимке. Отказ сервера в режиме `enforce` детерминирован порядком объявления `Object.entries(mcpServers)`; будущий слой приоритета областей действия (если qwen-code его внедрит) изменит это на «сначала наименьший приоритет», чтобы соответствовать соглашению claude-code `plugin < user < project < local`.

> ⚠️ **Область действия PR 14 v1: на сессию, а не на рабочую область.** Каждая сессия ACP внутри демона создает свой собственный `Config` + `McpClientManager` (через `acpAgent.newSessionConfig`). Ограничения бюджета ограничивают активные MCP-клиенты **для каждой сессии**; каждая сессия независимо читает `QWEN_SERVE_MCP_CLIENT_BUDGET` из переданного окружения. При `--mcp-client-budget=10` и 5 параллельных сессиях ACP фактическое количество активных MCP-клиентов может достигать 5 × 10 = 50 на весь демон. Снимок `GET /workspace/mcp` читает учетные данные `McpClientManager` только **начальной сессии** — значение `budgets[0].scope: 'session'` является честным сигналом того, что это на сессию, а не агрегированное. **Wave 5 PR 23 (общий пул MCP)** внедрит менеджер для рабочей области и добавит ячейку `scope: 'workspace'` рядом с ячейкой для сессии для истинной кросс-сессионной агрегации. v1 — это внутрипроцессный счетчик + основа мягкого принуждения, на которой строится PR 23.

`workspace_file_read` охватывает маршруты файлов рабочей области для text/list/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` охватывает `GET /file/bytes`, который был добавлен позже, чтобы клиенты могли выполнять pre-flight поддержки сырого байтового окна для демонов эпохи PR19. `workspace_file_write` охватывает маршруты текстовой мутации с учетом хеша (`POST /file/write`, `POST /file/edit`). Тег write означает, что контракт маршрута существует; это не значит, что текущий деплоймент открыт для анонимной мутации. Write/edit — это строгие маршруты мутации и требуют настроенного bearer-токена даже на loopback.

`daemon_status` объявляет `GET /daemon/status`, консолидированный диагностический снимок оператора только для чтения, описанный ниже.

**Условные теги.** Небольшое количество тегов функций объявляется только при включении соответствующего переключателя деплоймента. Наличие тега = поведение включено; отсутствие = либо более старый демон до появления тега, либо текущий демон, где оператор не включил эту функцию. В настоящее время:

| Tag                        | Advertised when …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | демон был запущен с `--require-auth` (или `requireAuth: true` через встроенный API). Bearer-токен обязателен для каждого маршрута, включая `/health` при привязке к loopback.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | общий пул транспортов MCP активен. Опускается, когда `QWEN_SERVE_NO_MCP_POOL=1` отключает пул.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | общий пул транспортов MCP активен; ответы перезапуска могут включать многозаписные формы с учетом пула.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Демон был запущен хотя бы с одним `--allow-origin <pattern>` (или `allowOrigins: [...]` через встроенный API). Cross-origin запросы из сопоставленных origin получают правильные заголовки ответа CORS; несовпадающие origin по-прежнему получают 403 по умолчанию. Настроенный список паттернов намеренно НЕ повторяется в `/capabilities`, чтобы не раскрывать набор доверенных origin неаутентифицированным читателям — браузерный webui и так знает свой собственный origin. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` установлено в положительное целое число.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` установлено в положительное целое число.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | демон был создан с доступным сохранением настроек.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | выполнение shell-команд в сессии явно включено.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` включено.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | поддержка перезагрузки рабочей области доступна в конфигурации встроенных маршрутов.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` **нет** в этой условной таблице — это всегда включенный тег, который анонсируется всякий раз, когда бинарник поддерживает новые поля бюджета `/workspace/mcp`, независимо от того, настроил ли оператор бюджет. Операторы, которые не установили `--mcp-client-budget`, все равно получают новые поля (с `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) анонсирует типизированные push-события SSE, которые сигнализируют о пересечении состояний бюджета MCP без цикла опроса. Два типа фреймов поступают на `GET /session/:id/events`:

- `mcp_budget_warning` — срабатывает один раз при восходящем пересечении 75% для `reservedSlots.size / clientBudget`. Повторно активируется только после того, как соотношение упадет ниже 37,5% (`MCP_BUDGET_REARM_FRACTION`). Повторяет гистерезис `slow_client_warning` из PR 10, но на уровне менеджера, а не на уровне очереди конкретного подписчика. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Срабатывает в режимах `warn` и `enforce`; никогда в `off`.
- `mcp_child_refused_batch` — срабатывает в конце каждого прохода `discoverAllMcpTools*`, если один или несколько серверов были отклонены, А ТАКЖЕ как батч длиной 1 на пути отклонения ленивого спавна `readResource`. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` — это буквально `'enforce'`, потому что режим `warn` никогда не отклоняет.

Оба события живут в кольце повтора SSE для каждой сессии (они несут `id`), поэтому клиент, переподключающийся с `Last-Event-ID`, возобновляет работу через них; снимок на `GET /workspace/mcp` по-прежнему является источником истины для состояния после длительного отключения. Всегда включены после анонсирования — условного переключателя нет. Состояние редьюсера SDK (`DaemonSessionViewState`) предоставляет `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` для адаптеров, которым нужен простой UI в стиле лага.

## Routes

### `GET /health`

Liveness-проба. По умолчанию возвращает `200 {"status":"ok"}`, если слушатель работает — дешевая, без доступа к bridge, подходит для высокочастотных liveness-проб k8s/Compose.

Передайте `?deep=1` (также принимается `?deep=true` или просто `?deep`) для пробы, которая раскрывает **счетчики** bridge (только для информации, не настоящая проверка liveness):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Глубокая проба (deep probe) носит **информационный** характер, а не является реальной проверкой liveness. Она читает аксессоры счетчиков (`bridge.sessionCount`, `bridge.pendingPermissionCount`), которые представляют собой простые геттеры размера Map; они не пингуют отдельные дочерние процессы / каналы и поэтому не обнаружат зависшую, но все еще учитываемую сессию. Используйте её для дашбордов емкости (текущая параллельность против `--max-sessions`, глубина очереди), а не как триггер для "вывода этого демона из ротации". Ответ `503 {"status":"degraded"}` теоретически возможен, если геттеры кастомной реализации bridge бросят исключение, но геттеры реального bridge этого никогда не делают — при нормальной работе глубокая проба всегда возвращает 200. Для реальной проверки liveness полагайтесь на то, принимает ли слушатель TCP-соединение вообще (т.е. дефолтный `/health` без `?deep`).

**Auth:** требуется **только при привязке не к loopback**. На loopback (`127.0.0.1`, `::1`, `[::1]`) `/health` регистрируется до bearer middleware, поэтому пробы k8s/Compose внутри пода не нуждаются в токене. При привязке не к loopback (`--hostname 0.0.0.0` и т.д.) маршрут регистрируется после bearer middleware и возвращает 401 без валидного токена — в противном случае неаутентифицированный вызывающий абонент мог бы зондировать произвольные адреса, чтобы подтвердить существование `qwen serve`, что представляет собой утечку информации низкой степени серьезности, которая плохо сочетается со сканированием портов. Запрет CORS + allowlist Host по-прежнему применяются для исключения loopback.

### `GET /daemon/status`

Диагностика оператора только для чтения. В отличие от `/health`, это обычный API демона:
он регистрируется после bearer-аутентификации и rate limiting, включая привязки к loopback. Query-параметр:

- `detail=summary` (по умолчанию) читает только состояние демона в памяти.
- `detail=full` также включает диагностику активных сессий, диагностику подключений ACP, счетчики device-flow аутентификации и разделы статуса рабочего пространства.
- любой другой `detail` возвращает `400 { "code": "invalid_detail" }`.

`summary` намеренно не запрашивает методы статуса рабочего пространства, не запускает дочерний процесс ACP и не создает сессию. `full` запрашивает каждый раздел рабочего пространства независимо; таймаут или исключение помечают только этот раздел как `unavailable` и добавляют проблему `workspace_status_unavailable`.

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
    }
  }
}
```

`status` равен `error`, если какая-либо проблема имеет серьезность error, `warning`, если какая-либо проблема имеет серьезность warning, в противном случае `ok`. Коды проблем стабильны и включают `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits` и `workspace_status_unavailable`. В течение короткого окна после готовности слушателя, но до монтирования полной среды выполнения, `/daemon/status` может сообщать `daemon_runtime_starting`; если асинхронное монтирование среды выполнения завершается ошибкой, он сообщает `daemon_runtime_failed`, в то время как маршруты среды выполнения, не связанные со статусом, возвращают `503`.

Безопасность: ответ никогда не включает bearer-токены, id клиентов, полные id подключений ACP, пользовательские коды device-flow или URL-адреса верификации. `summary` опускает путь к логам демона; `full` может включать его для аутентифицированных операторов.

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

Стабильный контракт: когда `v` инкрементируется, макет фрейма изменился обратно несовместимым образом.

> **`protocolVersions`** описывает версии протокола serve, которые поддерживает демон. `current` — это предпочитаемая демоном версия протокола, а `supported` — совместимый набор. Клиенты, которым требуется определенный протокол, должны проверять `supported`; UI для конкретных функций по-прежнему должен ориентироваться на `features`. Добавлено к v=1: старые демоны v=1 опускают это поле, поэтому SDK-клиенты, нацеленные на старые сборки, должны считать его опциональным.

> **`modelServices` всегда `[]` на Этапе 1.** Агент использует свой единственный дефолтный сервис моделей и не перечисляет его по сети. На Этапе 2 это будет заполняться из зарегистрированных адаптеров моделей, чтобы SDK-клиенты могли создавать пикеры сервисов; а пока НЕ полагайтесь на то, что это поле непустое.

> **`workspaceCwd`** — это канонический абсолютный путь, к которому привязывается этот демон (#3803 §02 — 1 демон = 1 рабочее пространство). Используйте его, чтобы (а) обнаружить несоответствие перед отправкой `/session` и (б) опустить `cwd` в `POST /session` (маршрут откатывается к этому пути). Развертывания с несколькими рабочими пространствами предоставляют несколько демонов на разных портах, каждый со своим `workspaceCwd`. Добавлено к v=1: демоны v=1 до §02 опускают это поле — клиенты, нацеленные на старые сборки, должны проверять на null перед его использованием.

### Маршруты статуса среды выполнения только для чтения

Эти маршруты сообщают снимки среды выполнения на стороне демона. Это аддитивные маршруты v1,
они не мутируют состояние и не изменяют версию протокола serve. Маршруты статуса
рабочего пространства намеренно **не** запускают дочерний процесс ACP только потому,
что клиент опрашивает GET-маршрут: если демон простаивает, они возвращают
`initialized: false` с пустым снимком. Маршруты статуса сессии требуют активной сессии
и используют стандартную форму `404 SessionNotFoundError` для неизвестных id.

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

`errorKind` — это закрытое перечисление, общее для `/workspace/preflight`,
`/workspace/env` и (в конечном итоге) MCP guardrails, чтобы SDK-клиенты могли отображать
исправление по категориям вместо парсинга сообщений в свободной форме. PR 13
(#4175) ввел семь литералов, перечисленных выше; PR 14 заполнит
`blocked_egress`, как только появится проба исходящего трафика.

Payload-и статуса никогда не раскрывают значения env MCP, заголовки, данные OAuth/сервисных аккаунтов, API-ключи провайдеров, провайдерские `baseUrl` / `envKey`, тело скилла, файловые пути скиллов, определения хуков или значения секретных переменных
окружения. `/workspace/env` сообщает только о **наличии** переменных окружения из белого списка; URL-адреса прокси очищаются от учетных данных и сводятся к
`host:port` перед отправкой по сети.

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

`discoveryState` принимает одно из значений `not_started`, `in_progress` или `completed`.
`transport` — одно из `stdio`, `sse`, `http`, `websocket`, `sdk` или
`unknown`. `errors` опускается, если обнаружение прошло успешно.

**MCP client guardrails (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Демоны после PR-14 расширяют payload четырьмя аддитивными полями и одной ячейкой уровня рабочего пространства:

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

`budgetMode` принимает одно из значений `enforce`, `warn` или `off`. `clientBudget` отсутствует, если бюджет не был установлен. `budgets[]` — это **всегда массив** на демонах после PR-14 (возможно, пустой, если `budgetMode === 'off'`); демоны до PR-14 полностью опускают это поле. v1 выдает одну ячейку с `scope: 'session'` (принудительное применение для каждой сессии — см. раздел возможностей выше, чтобы узнать, почему). Потребители ДОЛЖНЫ допускать дополнительные записи `budgets[]` с нераспознанными значениями `scope` — Wave 5 PR 23 добавит `scope: 'workspace'` (или `'pool'`) вместе с ячейкой для каждой сессии без повышения версии схемы.

`disabledReason` в ячейках для каждого сервера различает отключенные оператором (`'config'` — список конфигурации `disabledMcpServers`) и отклоненные из-за бюджета (`'budget'` — обнаружены, но никогда не подключались из-за режима `enforce`). Отказы детерминированы порядком объявления `Object.entries(mcpServers)`. `status: 'error', errorKind: 'budget_exhausted'` для каждого сервера перекрывает сырой `mcpStatus: 'disconnected'` (что верно, но не является серьезностью, ориентированной на оператора).

Принудительное применение бюджета в PR 14 v1 работает **для каждой сессии, а не для рабочего пространства**. Хотя демоны Mode B имеют конфигурацию `1 демон = 1 рабочее пространство × N сессий` после #4113 на уровне процесса, `McpClientManager` создается внутри `Config` каждой сессии ACP через `acpAgent.newSessionConfig`, поэтому N сессий применяют свою собственную копию лимита. Снимок представляет собой вид bootstrap-сессии. Wave 5 PR 23 вводит общий пул MCP с областью действия рабочего пространства, что переводит это на истинное принудительное применение для всего рабочего пространства.

**Обнаружение давления на бюджет.** Два интерфейса, оба заполняются после PR-14b:

- **Push-события** (анонсируются через `mcp_guardrail_events`): подпишитесь на `GET /session/:id/events` и фильтруйте фреймы `mcp_budget_warning` / `mcp_child_refused_batch` через `KnownDaemonEvent`. Конечный автомат срабатывает один раз при восходящем пересечении 75% (повторно активируется ниже 37,5%); отказы объединяются один раз за проход обнаружения в режиме `enforce`.
- **Опрос снимка** (анонсируется через `mcp_guardrails`): `GET /workspace/mcp` и проверка ячейки бюджета для сессии (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (соответствует порогу гистерезиса, который будет использовать push-событие PR 14b).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (один или несколько серверов отклонены в этом проходе обнаружения).
- `budgets[0].status === 'ok'` ⇔ ниже порога 75% И нет отказов.

Рекомендуемый интервал опроса: согласован с тем, что уже опрашивает `/workspace/mcp`; снимок дешев, а ячейка бюджета не несет дополнительных затрат на обнаружение. SDK-клиенты, которые подписываются на push-события, все равно выигрывают от снимка для состояния после длительного отключения (глубина кольца повтора SSE конечна — `--event-ring-size`, по умолчанию 8000 — поэтому клиент, находящийся в офлайне дольше, чем покрытие кольца, откатывается к ресинхронизации по снимку).

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

`level` принимает одно из значений `project`, `user`, `extension` или `bundled`. `errors`
опускается, если обнаружение прошло успешно.

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

Модели сгруппированы по типу аутентификации. Диагностика подключений провайдера находится в
ячейке `providers` маршрута `/workspace/preflight`; предварительная проверка
окружения находится в `/workspace/preflight` и `/workspace/env` (ниже). `errors` опускается,
если создание снимка прошло успешно.

### `GET /workspace/env`

Сообщает о среде выполнения процесса демона, платформе, песочнице, прокси и
**наличии** секретных переменных окружения из белого списка. Всегда отвечает из состояния `process.*` — демон никогда не запускает дочерний процесс ACP для обслуживания
этого маршрута, и ответ идентичен, независимо от того, запущен ACP или простаивает.
Поле `acpChannelLive` носит только информационный характер.

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

Форма ячейки:

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

**Политика редактирования (редоктации).** Ячейки `kind: 'env_var'` никогда не включают поле `value`; клиенты видят только `present: boolean`. Ячейки `kind: 'proxy'` пропускают сырое значение env через редактирование учетных данных (`redactProxyCredentials`), а затем через парсинг `URL`, чтобы по сети передавался только `host:port`. `NO_PROXY` передается через редактирование дословно, потому что это список хостов, а не URL. Белый список перечисляемых секретных переменных окружения в настоящее время включает `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` и `QWEN_SERVER_TOKEN`. Другие переменные окружения не перечисляются, поэтому случайно установленные секреты остаются невидимыми.

### `GET /workspace/preflight`

Сообщает о проверках готовности демона. **Ячейки уровня демона** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) всегда
заполняются из `process.*` и `node:fs`. **Ячейки уровня ACP** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
требуют активного дочернего процесса ACP — когда демон простаивает, они выдают
заполнители `status: 'not_started'`. Маршрут никогда не запускает ACP исключительно
для заполнения ячеек; соответствующие ячейки откатываются к `not_started`.

Ответ в режиме простоя (нет дочернего процесса ACP):

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
Структура ячейки:

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
  ripgrep / git / npm не найдены в PATH (для опциональных бинарников это предупреждения, а не ошибки).
- `missing_file` — `boundWorkspace` не существует или не является директорией;
  ошибка парсинга skill, указывающая на отсутствующий или нечитаемый файл.
- `parse_error` — ошибка парсинга `SKILL.md`, некорректный JSON конфигурации.
- `auth_env_error` — `validateAuthMethod` вернул непустую строку ошибки,
  или подкласс `ModelConfigError` проброшен из резолвинга провайдера.
- `init_timeout` — reject `withTimeout` в bridge (фактический таймаут при ожидании ACP roundtrip). Определяется по типизированному классу `BridgeTimeoutError`. Примечание: переходящая `warning`-ячейка `mcp_discovery` с `connecting > 0` НЕ несет этот kind — это нормальное состояние handshake-in-progress, отличное от реального таймаута.
- `protocol_error` — ACP `extMethod` отклонен из-за закрытия канала в середине запроса или из-за неожиданного отсутствия tool registry.
- `blocked_egress` — зарезервировано для PR 14 (#4175). PR 13 оставляет ячейку `egress` со `status: 'not_started'`.

Если bridge не может связаться с ACP child при обработке preflight-запроса (например, из-за закрытия канала в середине запроса), массив `errors` в envelope содержит одну `ServeStatusCell`, описывающую сбой, а ячейки откатываются к ACP-плейсхолдерам `not_started`. Ячейки уровня daemon по-прежнему возвращаются.

### Роуты файлов workspace

Все пути к файлам резолвятся через привязанное к daemon workspace. Ответы используют пути относительно workspace и никогда не возвращают абсолютные пути файловой системы для обычных успешных случаев. Успешные ответы файлов включают:

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

Читает текстовый файл. Query-параметры: `path` (обязательный), `maxBytes`, `line` и `limit`. Daemon отклоняет бинарные файлы и файлы, превышающие лимит чтения текста. Ответ включает `hash` — SHA-256 дайджест сырых байтов на диске для всего файла, даже если `line`, `limit` или `maxBytes` вернули срез.

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

Читает сырые байты из файла без декодирования. Query-параметры: `path` (обязательный), `offset` (по умолчанию `0`) и `maxBytes` (по умолчанию `65536`, максимум `262144`). Этот роут поддерживает ограниченные окна для больших бинарных файлов без загрузки всего файла целиком. Ответ включает `hash` только в том случае, если возвращенное окно покрывает весь файл.

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

Создает или заменяет текстовый файл. Это строгий роут мутации: на loopback без настроенного токена он возвращает `401 { "code": "token_required" }`. При использовании `--require-auth` глобальный bearer middleware отклоняет неаутентифицированные запросы до выполнения роута.

Тело:

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

`mode` должен быть `create` или `replace`. `create` никогда не перезаписывает существующий файл (`409 file_already_exists`). `replace` требует `expectedHash`; отсутствующие или некорректные хэши возвращают `400 parse_error`, а устаревшие хэши — `409 hash_mismatch`. `expectedHash` — это `sha256:` плюс 64 шестнадцатеричных символа в нижнем регистре, вычисленные по сырым байтам на диске.

Могут быть указаны `bom`, `encoding` и `lineEnding`. По умолчанию замена сохраняет профиль кодировки существующего файла; явные поля переопределяют его. Запись бинарных файлов не поддерживается.

Daemon записывает данные во временный файл со случайным именем в целевой директории, выполняет fsync там, где это поддерживается, повторно проверяет текущий хэш непосредственно перед `rename()`, а затем переименовывает файл на место. Это предотвращает наблюдение за частично записанным файлом и сериализует операции записи от daemon в один и тот же файл, но это не межпроцессный атомарный compare-and-swap на уровне ядра: внешний редактор все еще может попасть в крошечное окно между финальной проверкой хэша и переименованием.

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

Применяет одну точную замену текста в существующем текстовом файле. Это также строгий роут мутации, требующий `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` должен быть непустым и встречаться ровно один раз. Отсутствие совпадений возвращает `422 text_not_found`; множественные совпадения возвращают `422 ambiguous_text_match`. Роут сохраняет кодировку, BOM и окончания строк, а также повторно проверяет `expectedHash` непосредственно перед атомарным переименованием.

Явные записи/редактирования игнорируемых путей разрешены, поскольку аутентифицированный вызывающий абонент явно указал путь. Ответы об успехе и события аудита включают `matchedIgnore: "file" | "directory" | null`.

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

`state` повторяет те же структуры ACP model/mode/config-option, которые используются в `POST /session`, `POST /session/:id/load` и `POST /session/:id/resume`.

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

`availableCommands` — это тот же снимок команд, который используется в SSE-уведомлении `available_commands_update`. `availableSkills` перечисляет только имена skill; клиенты не должны ожидать тела или пути skill через этот роут.

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
    }
  ]
}
```

Этот роут представляет собой снимок только для чтения вне основного потока (out-of-band). Он намеренно не является промптом и может быть запрошен во время стриминга сессии. Ответ содержит только метаданные из белого списка из реестров задач agent, shell и monitor; контроллеры, таймеры, смещения, ожидающие сообщения и сырые объекты реестра никогда не раскрываются.

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

`status` принимает одно из значений: `NOT_STARTED`, `IN_PROGRESS`, `READY` или `FAILED`. Опциональный `error` присутствует на упавших серверах, если доступен. Отключенный LSP (включая bare mode) возвращает HTTP 200 с `enabled: false`, нулевыми счетчиками и `servers: []`. Включенный LSP без настроенных серверов возвращает `enabled: true`, `configuredServers: 0` и `servers: []`. Если инициализация завершилась ошибкой до создания клиента, ответ может включать `initializationError`; если активный клиент не может предоставить снимок, ответ включает `statusUnavailable: true`.

Этот роут раскрывает только стабильные клиентские поля. Он намеренно опускает отладочные внутренние данные, такие как ID процессов, аргументы spawn, хвосты stderr, корневые URI и пути к папкам workspace.

### `POST /session`

Запускает нового agent или подключается к существующему (при `sessionScope: 'single'`, по умолчанию).

Запрос:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | Абсолютный путь, совпадающий с привязанным к daemon workspace. Если пропущен, роут откатывается к `boundWorkspace` (читайте его из `/capabilities.workspaceCwd`). Несоответствующий непустой `cwd` возвращает `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Пути workspace канонизируются через `realpathSync.native` (с фоллбэком только на резолв для несуществующих путей), чтобы файловые системы без учета регистра не отклоняли сессии из-за написания.                                                                                                                                                                          |
| `modelServiceId` | no       | Выбирает, какой настроенный _model service_ будет использовать agent (бэкенд-провайдер — Alibaba ModelStudio, OpenRouter и т.д.). Если пропущен, agent использует свой сервис по умолчанию. Если в workspace уже есть сессия, это вызывает `setSessionModel` для существующей и транслирует `model_switched`. Отличается от `modelId` в `POST /session/:id/model`, который выбирает модель **внутри** уже привязанного сервиса. Массив `modelServices` в `/capabilities` зарезервирован для рекламы настроенных сервисов; на Этапе 1 он всегда равен `[]` (используется сервис agent по умолчанию и не перечисляется по HTTP). |
| `sessionScope`   | no       | Переопределение для каждого запроса при совместном использовании сессии. `'single'` (дефолтный для daemon) заставляет второй `POST /session` для того же workspace переиспользовать существующую сессию (`attached: true`); `'thread'` принудительно создает новую уникальную сессию при каждом вызове. Пропустите, чтобы унаследовать дефолтное значение для daemon. Значения вне enum возвращают `400 { code: 'invalid_session_scope' }`. Старые daemon (до PR 5 #4175) молча игнорируют это поле — проверяйте `caps.features.session_scope_override` перед отправкой. Дефолтное значение для daemon сегодня жестко задано как `'single'` в продакшене; #4175 может добавить CLI-флаг `--sessionScope` в последующих обновлениях.         |

Ответ:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` означает, что сессия для этого workspace уже существовала, и теперь вы используете её совместно.

Параллельные вызовы `POST /session` для одного и того же workspace **объединяются (coalesced)** в один запуск — оба вызывающих получают один и тот же `sessionId`, и только один из них сообщает `attached: false`. Если базовый запуск завершается ошибкой (таймаут инициализации, некорректный вывод agent, OOM), **все объединенные вызывающие получают одну и ту же ошибку** — слот in-flight очищается, чтобы последующий вызов мог повторить попытку с нуля.

> ⚠️ **Отклонение `modelServiceId` для новой сессии происходит молча в HTTP-ответе.** Неверный `modelServiceId` (опечатка, ненастроенный сервис) НЕ возвращает 500 при создании — сессия остается рабочей на модели agent по умолчанию, поэтому вызывающий все равно получает `sessionId`, с которым он может повторить переключение модели (через `POST /session/:id/model`). Видимый сигнал об ошибке — это событие `model_switch_failed` в SSE-потоке сессии, которое срабатывает между handshake запуска и вашей первой подпиской. **Подписчики, которым необходимо наблюдать это событие, должны передавать `Last-Event-ID: 0` при первом вызове `GET /session/:id/events`**, чтобы воспроизвести события с самого старого доступного события в кольцевом буфере (это покрывает `model_switch_failed` во время запуска, даже если подписка происходит через несколько мс после ответа на создание).

### `POST /session/:id/load`

Восстанавливает сохраненную ACP-сессию по id и воспроизводит её историю через SSE. Id в пути является авторитетным; любое поле `sessionId` в теле игнорируется. Pre-flight проверка `caps.features.session_load` — старые daemon возвращают `404` для этого роута.

Запрос:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | no       | Те же правила канонизации и `workspace_mismatch`, что и для `POST /session`. Пропустите, чтобы унаследовать `/capabilities.workspaceCwd`. `mcpServers` намеренно НЕ принимается здесь — MCP для всего daemon управляется настройками (совпадает с `POST /session`). |

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

`state` повторяет `LoadSessionResponse` от ACP — `models` это `SessionModelState`, `modes` это `SessionModeState`, `configOptions` это массив `SessionConfigOption`. Отсутствующие поля определяются agent. Поздние подключенцы (пути с `attached: true` ниже) получают ТОТ ЖЕ снимок `state`, что и исходный вызывающий load — daemon кэширует его на записи; мутации времени выполнения (например, `model_switched`) доставляются через SSE-поток, а не в последующих ответах на подключение.

`attached: true` означает, что сессия уже была активна (либо из-за предыдущего `session/load`/`session/resume`, либо потому, что объединенный параллельный вызывающий опередил совсем немного).

**Воспроизведение истории через SSE.** Пока `loadSession` выполняется на стороне agent, agent отправляет уведомления `session_update` для каждого сохраненного хода. Daemon буферизует их в event-bus сессии до того, как ответ роута вернется, поэтому подписчики, которые сразу же вызовут `GET /session/:id/events` с `Last-Event-ID: 0`, увидят полное воспроизведение. **Кольцо воспроизведения ограничено** (по умолчанию 8000 фреймов на сессию). Длинные истории с множеством ходов tool-call / thought-stream могут превысить этот лимит — самые старые фреймы молча отбрасываются. Клиентам, которым нужна полная история, следует подписываться сразу после возврата `load`; в качестве альтернативы они могут сохранять id событий SSE и использовать `Last-Event-ID` для возобновления с более поздней границы хода.

**Ошибки:**

- `404` — сохраненный id сессии не существует (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (та же структура, что и в `POST /session`).
- `503` — `session_limit_exceeded` (учитывается в лимите `--max-sessions`; in-flight восстановления также учитываются).
- `409` — `restore_in_progress` (`session/resume` для того же id уже выполняется). `Retry-After: 5`. Гонки с одинаковым действием (два параллельных `session/load` для одного id) объединяются — ровно один возвращает `attached: false`, остальные возвращают `attached: true` с тем же `state`.

### `POST /session/:id/resume`

Восстанавливает сохраненную ACP-сессию по id БЕЗ воспроизведения истории через SSE. Контекст модели восстанавливается внутренне на стороне agent (через `geminiClient.initialize`, читающий `config.getResumedSessionData`); SSE-поток остается чистым для клиентов, у которых уже отрисована история. Pre-flight проверка `caps.features.session_resume`; `unstable_session_resume` остается устаревшим алиасом совместимости для старых клиентов.

Та же структура запроса, что и у `/load`. Та же структура ответа — `state` повторяет `ResumeSessionResponse` от ACP. Та же структура ошибок, включая `409 restore_in_progress` (который срабатывает, когда выполняется `session/load`; `session/resume`, идущий следом за другим `session/resume`, объединяется).

Используйте `/load`, когда у клиента нет отрисованной истории (холодное переподключение, выбор -> открытие). Используйте `/resume`, когда у клиента уже есть ходы на экране и ему нужен только дескриптор на стороне daemon.

> ⚠️ **Почему `unstable_session_resume` все еще анонсируется?** HTTP-роут daemon и возможность `session_resume` стабильны для v1, но bridge по-прежнему вызывает `connection.unstable_resumeSession` от ACP. Старый тег остается только для того, чтобы SDK, выпущенные до `session_resume`, продолжали работать.

### `GET /workspace/:id/sessions`

Выводит список всех активных сессий, чье каноническое workspace совпадает с `:id` (абсолютный cwd в URL-кодировке).

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

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
      "hasActivePrompt": false
    }
  ]
}
```

Пустой массив (не 404), если сессий не существует — UI выбора сессии не должен выдавать ошибку только из-за того, что workspace простаивает.

### `POST /session/:id/prompt`

Перенаправляет промпт agent. Вызывающие с несколькими промптами выстраиваются в FIFO-очередь для каждой сессии (ACP гарантирует один активный промпт на сессию).

Запрос:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Валидация: `prompt` должен быть непустым массивом объектов. Другие ошибки возвращают `400` до достижения bridge.

Ответ:

```json
{ "stopReason": "end_turn" }
```

Другие причины остановки: `cancelled`, `max_tokens`, `error`, `length` (согласно спецификации ACP).

Если HTTP-клиент отключается в середине промпта, daemon отправляет ACP-уведомление `cancel` agent, который сворачивает промпт с `stopReason: "cancelled"`.
> **Ограничение этапа 1 — отсутствие серверного таймаута для промптов.** Мост
> сравнивает по времени только `prompt()` агента с `transportClosedReject`
> (сбой дочернего процесса агента) и AbortSignal отключения HTTP вызывающей стороны.
> Зависший, но живой агент (например, зависший вызов модели)
> блокирует сессионный FIFO до тех пор, пока HTTP-клиент не истечет
> по таймауту и не отключится. Длительные промпты являются легитимными
> (глубокий поиск, анализ большой кодовой базы), поэтому дедлайн по умолчанию
> намеренно не устанавливается; на этапе 2 будет добавлена настраиваемая
> опция `promptTimeoutMs`. До этого момента вызывающие стороны должны устанавливать свой собственный
> клиентский таймаут и отключаться (или вызывать
> `POST /session/:id/cancel`) по истечении времени.

### `POST /session/:id/cancel`

Отменяет **текущий активный** промпт в сессии. На стороне ACP это уведомление, а не запрос — агент подтверждает это, резолвя активный `prompt()` со статусом `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Контракт множественных промптов:** отмена влияет только на активный промпт. Любые промпты, которые тот же клиент ранее отправил через POST и которые все еще находятся в очереди за активным, продолжат выполняться. Очередь множественных промптов — это поведение, введенное демоном (его нет в спецификации ACP); контракт для промптов в очереди звучит так: "они продолжают выполняться, пока вы не отмените каждый из них или не завершите сессию через выход из канала".

### `DELETE /session/:id`

Явно закрывает активную сессию. Принудительно закрывает сессию, даже если к ней подключены другие клиенты — отменяет любой активный промпт, резолвит ожидающие разрешения как отмененные, публикует событие `session_closed`, закрывает EventBus и удаляет сессию из мап демона. Сохраненные на диске сессии НЕ удаляются — их можно перезагрузить через `POST /session/:id/load`. Pre-flight `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Идемпотентно: возвращает `404` для неизвестных сессий (та же структура `SessionNotFoundError`, что и для других роутов).

> **Событие `session_closed`.** Подписчики SSE получают терминальное событие `session_closed` с `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` перед завершением стрима. Редьюсеры SDK обрабатывают это идентично `session_died` (устанавливают `alive: false`, очищают `pendingPermissions`).

### `PATCH /session/:id/metadata`

Обновляет изменяемые метаданные сессии. В настоящее время поддерживается только `displayName`. Pre-flight `caps.features.session_metadata`.

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

### `POST /session/:id/heartbeat`

Обновляет учет "последнего раза замечен" (last-seen) в демоне для этой сессии. Долгоживущие адаптеры (TUI/IDE/web) пингуют этот эндпоинт с определенным интервалом, чтобы будущая политика отзыва (Wave 5 PR 24) могла отличать мертвых клиентов от просто молчащих.

Заголовки:

| Заголовок          | Обязательно | Примечания                                                                                                                                                                                                                          |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | нет         | Возвращает (эхом) id, выданный демоном в `POST /session`. Идентифицированные клиенты также обновляют свой клиентский таймстамп; анонимные хартбиты обновляют только сессионную метку времени. Должен соответствовать тому же формату `[A-Za-z0-9._:-]{1,128}`, что и в других местах. |

Тело запроса пустое (подойдет `{}` — сегодня никакие поля не читаются).

Ответ:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` возвращается эхом только в том случае, если был передан доверенный `X-Qwen-Client-Id`. `lastSeenAt` — это эпоха `Date.now()` (мс) на стороне демона, которую сохранил мост.

Ошибки:

- `400` — `{ code: 'invalid_client_id' }`, если заголовок имеет неверный формат (правило формы заголовка) или если в нем передан `clientId`, который не зарегистрирован для этой сессии (мост выбрасывает `InvalidClientIdError` до обновления любого таймстампа).
- `404` — неизвестная сессия.

Проверка возможностей: pre-flight `caps.features.client_heartbeat`. Старые демоны возвращают `404` для этого пути.

### `POST /session/:id/model`

Переключает активную модель **внутри** текущего привязанного к сессии сервиса моделей. Сериализуется через сессионную очередь изменений модели.

(Для переключения самого _сервиса_ — Alibaba ModelStudio, OpenRouter и т.д. — передавайте `modelServiceId` в `POST /session` для новой сессии. На этапе 1 нет роута для переключения сервиса в реальном времени.)

Запрос:

```json
{ "modelId": "qwen-staging" }
```

Ответ:

```json
{ "modelId": "qwen-staging" }
```

В случае успеха публикует `model_switched` в SSE-стрим. В случае неудачи публикует `model_switch_failed` (чтобы пассивные подписчики видели ошибку, а не только вызывающая сторона). Запускается параллельно с выходом из канала агента, чтобы зависший дочерний процесс не мог заблокировать HTTP-обработчик.

### `POST /session/:id/recap`

Тег возможности: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Генерирует краткое резюме сессии из одного предложения в стиле "на чем я остановился". Обертка над `generateSessionRecap` из ядра (`packages/core/src/services/sessionRecap.ts`), которая выполняет побочный запрос к быстрой модели с отключенными инструментами, `maxOutputTokens: 300` и строгим форматом вывода `<recap>...</recap>`. Побочный запрос читает существующую историю чата GeminiClient сессии и **не** добавляет в нее ничего.

Тело запроса игнорируется (отправляйте `{}` или пустое тело). Нестрогий мутационный гейт — поведение зеркалит `/session/:id/prompt` (вызов тратит токены, но не мутирует состояние). Событие SSE не публикуется.

Ответ (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` равен `null` (это нормальный 200, а не ошибка), когда:

- в сессии еще не было и двух ходов диалога,
- побочный запрос не вернул извлекаемую нагрузку `<recap>...</recap>`,
- или произошла любая базовая ошибка модели (хелпер ядра работает по принципу "best-effort" и никогда не выбрасывает исключения).

Ошибки:

- `400 {code: 'invalid_client_id'}` — неверный формат заголовка `X-Qwen-Client-Id`.
- `404` — неизвестная сессия.

Отмена: **отсутствует в v1**. Роут не слушает отключение HTTP-клиента, `AbortSignal` не передается в мост, и дочерний процесс ACP выполняет побочный запрос до конца, независимо от того, отключился ли вызывающий клиент. Единственными ограничениями являются 60-секундный резервный таймаут моста (`SESSION_RECAP_TIMEOUT_MS`) и гонка закрытия транспорта со смертью канала ACP. Это приемлемо, так как recap короткий (одна попытка, `maxOutputTokens: 300`, обычно ~1–5 с); ext-метод отмены на основе request-id может обеспечить полную сквозную отмену в будущих релизах, если затраты на пропускную способность когда-либо это оправдают.

### Мутации: approval, tools, init, перезапуск MCP

В задаче [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 добавлены четыре роута управления мутациями, которые позволяют удаленным клиентам изменять поведение во время выполнения без взаимодействия с CLI хоста демона. Все четыре:

- Защищены **строгим** мутационным гейтом из PR 15. Демон, настроенный без bearer-токена, отклоняет их с `401 {code: 'token_required'}`. Настройте `--token` (или `QWEN_SERVER_TOKEN`) перед использованием.
- Принимают и штампуют заголовок `X-Qwen-Client-Id` (аудиторская цепочка из PR 7). Когда заголовок содержит доверенный id, демон добавляет `originatorClientId` в соответствующее событие SSE, чтобы UI для нескольких клиентов могли подавлять эхо своих собственных мутаций.
- Выполняют pre-flight каждой возможности для каждого тега перед предоставлением функции. Старые демоны возвращают `404` для этого роута.

#### `POST /session/:id/approval-mode`

Тег возможности: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Изменяет режим подтверждения (approval mode) активной сессии. Новый режим немедленно попадает в сессионный `Config` дочернего процесса ACP. По умолчанию настройки НЕ записываются на диск — передайте `persist: true`, чтобы также записать `tools.approvalMode` в настройки рабочего пространства.

Запрос:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` должен быть одним из `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (зеркало энума `ApprovalMode` из ядра; SDK экспортирует `DAEMON_APPROVAL_MODES` для валидации в рантайме). `persist` по умолчанию равен `false`.

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — запрошенный режим требует доверенной папки (привилегированные режимы в недоверенных рабочих пространствах отклоняются методом `Config.setApprovalMode` из ядра).
- `404` — неизвестная сессия.

Событие SSE (в рамках сессии): `approval_mode_changed` с `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Тег возможности: `workspace_tool_toggle`. Чистый файловый ввод-вывод — без циклов ACP.

Переключает имя инструмента в списке настроек `tools.disabled` рабочего пространства. Инструменты, перечисленные там, **вообще не регистрируются** (в отличие от `permissions.deny`, который оставляет инструмент зарегистрированным, но отклоняет его вызов). Как встроенные инструменты, так и инструменты, обнаруженные через MCP, проходят через `ToolRegistry.registerTool`, который обращается к набору отключенных.

> ⚠️ **Имена должны точно совпадать с открытым идентификатором в реестре.** Разрешение псевдонимов не происходит — роут сохраняет любую строку из path-параметра в `tools.disabled`, а следующий дочерний процесс ACP сравнивает ее с `tool.name` во время регистрации. Встроенные инструменты используют свое каноническое имя в реестре (глагол в snake_case): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` и т.д. — НЕ отображаемые метки (`Shell`, `Read`, `Write`), которые показывает CLI. Инструменты, обнаруженные через MCP, используют квалифицированную форму `mcp__<server>__<name>` (которая также используется в трансляции событий `tool_toggled` и в списке `GET /workspace/mcp`). Отключение `Bash` НЕ предотвратит регистрацию `run_shell_command` в следующей сессии.

Активные дочерние процессы ACP сохраняют уже зарегистрированные инструменты — переключение вступает в силу при создании **следующего** дочернего процесса ACP. Объедините с `POST /workspace/mcp/:server/restart` (для инструментов из MCP) или созданием новой сессии, чтобы изменение вступило в силу в текущем демоне.

Неизвестные имена инструментов принимаются: предварительное отключение еще не установленного MCP-инструмента — это легитимный сценарий использования.

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

Событие SSE (в рамках рабочего пространства): `tool_toggled` с `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Тег возможности: `workspace_init`. Чистый файловый ввод-вывод — без циклов ACP, **без вызова LLM**.

Создает заготовку пустого `QWEN.md` (или того, что возвращает `getCurrentGeminiMdFilename()` с учетом переопределений `--memory-file-name`) в корне рабочего пространства, привязанного к демону. Только механическое действие — для заполнения контента с помощью ИИ выполните `POST /session/:id/prompt`.

По умолчанию отказывается перезаписывать, если целевой файл существует и содержит непробельные символы. Файлы, содержащие только пробелы, считаются отсутствующими (соответствует локальной слэш-команде `/init`).

Запрос:

```json
{ "force": false }
```

Ответ (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` равен `'created'` при новом создании, `'noop'`, если существующий файл из пробелов был оставлен без изменений (запись не выполнялась), и `'overwrote'`, когда `force: true` заменил непустое содержимое. Событие SSE `workspace_initialized` зеркалит действие из ответа — наблюдатели могут фильтровать по `action !== 'noop'`, чтобы реагировать только на реальные изменения на диске.

Ошибки:

- `400 {code: 'invalid_force_flag'}` — `force` не является булевым значением.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — файл существует и содержит непробельные символы, а `force` пропущен или равен false. Тело содержит абсолютный путь и размер (в байтах), чтобы SDK-клиенты могли отобразить промпт "перезаписать N байт?" без повторного вызова stat.

Событие SSE (в рамках рабочего пространства): `workspace_initialized` с `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Тег возможности: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Перезапускает настроенный MCP-сервер через `McpClientManager.discoverMcpToolsForServer` дочернего процесса ACP (отключение + переподключение + повторное обнаружение). Предварительно проверяет актуальный снимок бюджета из учета PR 14 v1, чтобы перезапуск в рабочем пространстве с исчерпанным бюджетом возвращал мягкий отказ, а не запускал каскад `BudgetExhaustedError`.

Тело запроса пустое (`{}`). Path-параметр — это URL-кодированное имя сервера в том виде, в котором оно указано в конфиге `mcpServers`.

Ответ (200) — дискриминированное объединение по `restarted`:

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

| `reason`                | Значение                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Другое обнаружение / перезапуск для этого сервера уже выполняется. Роут возвращает ответ немедленно, не дожидаясь исходного промиса. Вызывающей стороне следует повторить попытку через короткую задержку. |
| `'disabled'`            | Сервер настроен, но указан в `excludedMcpServers`. Включите его перед перезапуском.                                                                                                     |
| `'budget_would_exceed'` | Демон запущен с `--mcp-budget-mode=enforce`, целевой сервер в данный момент не находится в `reservedSlots`, а текущий итог достиг `clientBudget`. Вызывающей стороне следует сначала освободить слот. |

Ошибки (не 2xx):

- `400 {code: 'invalid_server_name'}` — пустой path-параметр.
- `404` — имя сервера отсутствует в конфиге `mcpServers` или не существует активного канала ACP (перезапуск по своей сути требует активного экземпляра `McpClientManager`).
- `500` — внутренняя ошибка (например, `ToolRegistry` не инициализирован).

События SSE (в рамках рабочего пространства): `mcp_server_restarted` с `{serverName, durationMs, originatorClientId?}` при успехе; `mcp_server_restart_refused` с `{serverName, reason, originatorClientId?}` при мягком пропуске.

### `GET /session/:id/events` (SSE)

Подписка на стрим событий сессии.

Заголовки:

```
Accept: text/event-stream
Last-Event-ID: 42        ← опционально, воспроизводит события после id 42
```

Query-параметры:

| Параметр    | Обязательно | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | нет         | Лимит **живого бэклога** для каждого подписчика. Диапазон `[16, 2048]`, по умолчанию 256. Фреймы повтора, принудительно отправляемые при подписке, не учитываются в этом лимите; фактически его потребляют живые события, которые приходят, пока подписчик все еще разбирает большой повтор `Last-Event-ID: 0`. Увеличьте для холодных переподключений, чтобы живой хвост не вызывал предупреждение о медленном клиенте / выселение до того, как потребитель догонит. Значения вне диапазона / не десятичные / присутствующие, но пустые возвращают `400 invalid_max_queued` до открытия SSE-рукпожатия. Pre-flight `caps.features.slow_client_warning` — старые демоны молча игнорируют этот параметр. |

Формат фрейма. Строка `data:` — это **полный конверт события**, JSON-сериализованный в одну строку — `{id?, v, type, data, originatorClientId?}`. Специфичная для ACP нагрузка (аргументы `sessionUpdate`, `requestPermission` и т.д.) находится в поле `data` конверта; собственный `type` конверта совпадает со строкой SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← каждые 15 с, без нагрузки

event: client_evicted    ← терминальный фрейм, без id (синтетический)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Строки `id:` / `event:` на уровне SSE дублируют `envelope.id` / `envelope.type` для совместимости с EventSource. Потребители, использующие сырой `fetch` (например, `parseSseStream` в SDK), читают все из JSON-конверта и игнорируют строки преамбулы SSE.

| Тип события               | Триггер                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Любое уведомление ACP `sessionUpdate` (чанки LLM, вызовы инструментов, использование)                                                                                                                                                                                                                                  |
| `permission_request`      | Агент запросил подтверждение инструмента                                                                                                                                                                                                                                                                               |
| `permission_resolved`     | Какой-либо клиент проголосовал за разрешение через `POST /permission/:requestId`                                                                                                                                                                                                                                       |
| `permission_partial_vote` | (только для consensus) Голос записан, но кворум еще не достигнут. Содержит `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                                               |
| `permission_forbidden`    | Голос отклонен активной политикой (несоответствие `designated`, `local-only` не для loopback или голосующий `consensus` отсутствует в снимке). Содержит `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                                 |
| `model_switched`          | `POST /session/:id/model` выполнен успешно                                                                                                                                                                                                                                                                             |
| `model_switch_failed`     | `POST /session/:id/model` отклонен                                                                                                                                                                                                                                                                                     |
| `session_died`            | Дочерний процесс агента неожиданно завершился с ошибкой. **Терминальное: SSE-стрим закрывается после этого фрейма; сессия удаляется из `byId`.** Подписчикам следует переподключиться через `POST /session`, чтобы создать новую.                                                                                    |
| `slow_client_warning`     | Локально для подписчика: очередь заполнена на ≥ 75%. **Не терминальное** — стрим продолжается; предупреждение служит сигналом перед выселением. Содержит `{queueSize, maxQueued, lastEventId}`. Срабатывает ОДИН раз за эпизод переполнения; повторно взводится после того, как очередь опустеет ниже 37.5%. Нет `id` (синтетический). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`          | Локально для подписчика: переполнение очереди. **Терминальное: SSE-стрим закрывается после этого фрейма** (нет `id` — синтетический). Другие подписчики в той же сессии продолжают работу.                                                                                                                            |
| `stream_error`            | Ошибка на стороне демона во время рассылки (fan-out). **Терминальное: SSE-стрим закрывается после этого фрейма** (нет `id` — синтетический).                                                                                                                                                                           |
Семантика переподключения:

- Отправка `Last-Event-ID: <n>` для повторного воспроизведения событий с `id > n` из кольцевого буфера сессии (глубина по умолчанию **8000**, настраивается через `qwen serve --event-ring-size <n>`)
- **Обнаружение пропусков (на стороне клиента):** если `<n>` старше самого старого события, все еще находящегося в кольцевом буфере (например, вы переподключаетесь с `Last-Event-ID: 50`, но буфер теперь содержит события 200–1199), демон начинает воспроизведение с самого старого доступного события без генерации ошибки. Сравните `id` первого воспроизведенного события с `n + 1`; любая разница указывает на размер потерянного окна. На этапе 2 (Stage 2) будет добавлена явная синтетическая фрейм `stream_gap` на стороне демона; на этапе 1 (Stage 1) обнаружение пропусков лежит на клиенте.
- ID монотонно возрастают в рамках каждой сессии, начиная с 1
- Синтетические фреймы (`client_evicted`, `slow_client_warning`, `stream_error`) намеренно не содержат `id`, чтобы не занимать слот в последовательности для других подписчиков

Механизм обратного давления:

- Очередь для каждого подписчика по умолчанию вмещает `maxQueued: 256` активных элементов (фреймы повторного воспроизведения при переподключении обходят это ограничение). Переопределить можно через `?maxQueued=N` (диапазон `[16, 2048]`) в SSE-запросе.
- Когда очередь подписчика заполняется более чем на 75%, шина принудительно отправляет этому подписчику синтетический фрейм `slow_client_warning` (один раз за эпизод переполнения; сбрасывается после очистки очереди ниже 37,5%). Поток остается открытым — предупреждение служит сигналом, чтобы клиент мог быстрее обработать очередь или корректно отключиться и переподключиться.
- Если очередь действительно переполняется после предупреждения, шина отправляет терминальный фрейм `client_evicted` и закрывает подписку.

### `POST /permission/:requestId`

Проголосуйте по ожидающему рассмотрения `permission_request`. Активная **политика посредничества (mediation policy)** определяет победителя:

| Policy                      | Behavior                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (default) | Любой валидированный голосующий побеждает; последующие голосующие получают `404`. Базовое поведение до F3.                                                                                                                                    |
| `designated`                | Решает только инициатор промпта (`originatorClientId`); не-инициаторы получают `403 permission_forbidden / designated_mismatch`. Для анонимных промптов используется `first-responder`.                 |
| `consensus`                 | Необходимо согласие N из M голосующих (по умолчанию `N = floor(M/2) + 1`, переопределяется через `policy.consensusQuorum`). Побеждает первый вариант, набравший `N` голосов. Нерешающие голоса получают `200` + SSE-фреймы `permission_partial_vote`. |
| `local-only`                | Решают только локальные голосующие (loopback); удаленные вызывающие стороны получают `403 permission_forbidden / remote_not_allowed`.                                                                                                      |

Активная политика настраивается в `settings.json` в разделе `policy.permissionStrategy` и отображается в `/capabilities` по пути `body.policy.permission`. Предварительная проверка `caps.features.permission_mediation` (с `modes: [...]`) показывает набор, поддерживаемый в данной сборке.

> **F3 (#4175): координация разрешений для нескольких клиентов.** В F3 добавлены четыре вышеуказанные политики. В демонах до F3 жестко был задан `first-responder`; формат передачи данных остается бит-в-бит неизменным, если настроена политика `first-responder`. Новые события (`permission_partial_vote`, `permission_forbidden`) являются аддитивными — старые SDK воспринимают их как `unrecognized_known_event` и корректно игнорируют.

> **Таймаут разрешения (по умолчанию 5 минут).** `permission_request` остается в ожидании до тех пор, пока: (a) какой-либо клиент не проголосует здесь, (b) не будет выполнен `POST /session/:id/cancel`, (c) HTTP-клиент, управляющий промптом, не отключится (отмена во время промпта разрешает ожидающие разрешения как `cancelled`), (d) сессия не будет завершена, (e) демон не будет остановлен, **или (f) не сработает таймаут разрешения для сессии** (`DEFAULT_PERMISSION_TIMEOUT_MS`, 5 минут). При срабатывании таймаута `requestPermission` агента разрешается как `{outcome: 'cancelled'}`, кольцевой буфер аудита записывает запись `permission.timeout`, в stderr демона выводится однострочное сообщение, а шина SSE рассылает стандартный отмененный фрейм `permission_resolved`, чтобы подписчики могли выполнить очистку. Таймаут настраивается через `BridgeOptions.permissionResponseTimeoutMs`; headless-клиенты, выполняющие длительные промпты, могут захотеть увеличить его.

Запрос:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Возможные исходы:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — принять / отклонить / выполнить один раз и т.д., в зависимости от предложенных агентом вариантов
- `{ "outcome": "cancelled" }` — отменить запрос (аналогично тому, что делают внутри `cancelSession` / `shutdown`)

Ответ:

- `200 {}` — ваш голос принят (разрешен ИЛИ записан при достижении кворума consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: активная политика отклонила ваш голос
- `404 { "error": "..." }` — requestId неизвестен (уже разрешен, не существовал или сессия удалена)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: `allowedOptionIds` агента содержит зарезервированный маркер `'__cancelled__'`; нарушение контракта между агентом и демоном
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat: литерал политики появился в схеме, но её обработчик еще не реализован (в настоящее время недостижимо; зарезервировано для будущих политик)

После успешного голосования каждый подключенный клиент видит `permission_resolved` с тем же `requestId` и выбранным `outcome`. При использовании `consensus` промежуточные голоса дополнительно рассылаются через `permission_partial_vote` до достижения кворума.

### Роуты device-flow для аутентификации (issue #4175 PR 21)

Демон выступает брокером для OAuth 2.0 Device Authorization Grant (RFC 8628), чтобы удаленный SDK-клиент мог инициировать вход, при котором токены сохраняются в файловой системе **демона**, а не клиента. Демон самостоятельно опрашивает IdP; единственная задача клиента — отобразить URL верификации и пользовательский код, а также (опционально) подписаться на SSE для получения событий о завершении.

Тег возможности (Capability tag): `auth_device_flow` (всегда анонсируется). Поддерживаемые провайдеры в v1: `qwen-oauth`.

> [!note]
>
> Бесплатный тариф Qwen OAuth был отменен 15.04.2026. Рассматривайте `qwen-oauth` как устаревший идентификатор провайдера v1 в данном протоколе; новым клиентам следует предпочитать текущий поддерживаемый провайдер аутентификации, если таковой доступен.

**Локальность выполнения.** Демон никогда не открывает браузер — даже если имеет такую возможность. Клиент сам решает, вызывать ли `open(verificationUri)` локально; в headless-поде (каноничное развертывание Mode B) пользователь открывает URL на любом устройстве, где есть браузер. Рекомендуемый UX описан в `docs/users/qwen-serve.md`.

**Отсутствие утечки токенов в событиях.** `auth_device_flow_started` содержит только `{deviceFlowId, providerId, expiresAt}`. Пользовательский код и URL верификации возвращаются точка-в-точку в теле POST 201 и через `GET /workspace/auth/device-flow/:id`; они никогда не транслируются через SSE.

**Синглтон для каждого провайдера.** Повторный `POST` для того же провайдера во время ожидания потока является идемпотентным перехватом — он возвращает существующую запись с `attached: true`, а не инициирует новый запрос к IdP.

#### `POST /workspace/auth/device-flow`

Строгий шлюз мутаций: требует bearer-токен даже для loopback-запросов по умолчанию без токенов (`401 token_required`).

Запрос:

```json
{ "providerId": "qwen-oauth" }
```

Ответ (`201` при новом запуске, `200` при идемпотентном перехвате):

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
- `409 too_many_active_flows` — достигнут лимит рабочего пространства (4); отмените один через `DELETE`
- `401 token_required` — строгий шлюз отклонил запрос без токена
- `502 upstream_error` — IdP вернул непредвиденную ошибку

#### `GET /workspace/auth/device-flow/:id`

Чтение текущего состояния. Ожидающие записи возвращают `userCode/verificationUri/expiresAt/intervalMs`; терминальные записи (с 5-минутным grace-периодом) опускают их и возвращают `status` + опциональные `errorKind/hint`.

Возвращает `404 device_flow_not_found` для неизвестных id и записей, удаленных после grace-периода.

#### `DELETE /workspace/auth/device-flow/:id`

Идемпотентная отмена:

- ожидающая запись → `204` + отправка `auth_device_flow_cancelled`
- терминальная запись → `204` без действий (без повторной отправки события)
- неизвестный id → `404`

#### `GET /workspace/auth/status`

Снимок ожидающих потоков и поддерживаемых провайдеров:

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

#### SSE-события device-flow

Пять типизированных событий (в масштабе рабочего пространства, рассылаются в каждую активную шину сессии):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST выполнен успешно; SDK должен подписаться (userCode здесь нет, при необходимости получайте через GET)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — демон учел upstream-запрос `slow_down`; клиенты, опрашивающие GET, должны увеличить свой интервал до соответствующего значения
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — учетные данные сохранены; `accountAlias` — это метка без PII (никогда не email/телефон)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — терминальное событие; `errorKind` принимает одно из значений: `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` — внутренняя ошибка демона: обмен с IdP прошел успешно, но демон не смог надежно сохранить учетные данные (EACCES / EROFS / ENOSPC). Пользователю следует повторить попытку после устранения проблемы с диском.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE успешно выполнен для ожидающей записи

> **Несовместимо с MCP.** Спецификация авторизации MCP (2025-06-18) требует OAuth 2.1 + PKCE auth-code с редиректом callback, что не работает для демонов в headless-подах. Поверхность device-flow в Mode B является приватной для демона — клиентам, ориентированным на MCP-совместимые серверы, следует использовать другой путь аутентификации.

## Формат передачи данных при стриминге

События отправляются в виде стандартных фреймов EventSource. Демон записывает одну строку `data:` на каждый фрейм (JSON не содержит встроенных переводов строк после `JSON.stringify`); парсер SDK в `packages/sdk-typescript/src/daemon/sse.ts` обрабатывает как этот формат, так и разрешенную спецификацией форму с несколькими `data:` на стороне приема.

## Фреймы ошибок во время стриминга

Если итератор моста генерирует исключение при обслуживании SSE-подписчика, демон отправляет терминальный фрейм `stream_error` (без `id`). Строка `data:` содержит полную обертку (та же структура, что и у любого другого SSE-фрейма в этом документе); фактическое сообщение об ошибке находится в `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

После этого соединение закрывается.

## Переменные окружения

| Var                 | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer-токен. При запуске удаляются начальные и конечные пробелы. |

## Структура исходного кода

| Path                                                 | Purpose                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Команда yargs + схема флагов                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Жизненный цикл listener'а + обработка сигналов                                                                       |
| `packages/cli/src/serve/server.ts`                   | Сборка приложения Express, порядок middleware и остальные прямые роуты                                     |
| `packages/cli/src/serve/routes/*.ts`                 | Сфокусированные группы роутов Express, включая сессии, SSE, аутентификацию рабочего пространства, статус рабочего пространства и файловые роуты    |
| `packages/cli/src/serve/auth.ts`                     | bearer + Host allowlist + запрет CORS                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | CLI-локальный фасад совместимости моста для spawn-or-attach, per-session FIFO и реестра разрешений       |
| `packages/acp-bridge/src/status.ts`                  | read-only wire-типы статуса демона + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Чистый хелпер, формирующий пейлоады `/workspace/env` из состояния `process.*`, включая маскирование учетных данных   |
| `packages/acp-bridge/src/eventBus.ts`                | Ограниченная асинхронная очередь + кольцевой буфер воспроизведения                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-клиент                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Парсер фреймов EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 тестов, без LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 теста, реальный дочерний процесс `qwen --acp` с локальным фейковым сервером OpenAI (только POSIX; пропускается в Windows)   |