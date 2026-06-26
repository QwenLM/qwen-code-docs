# Справочник по HTTP-протоколу `qwen serve`

Этап 1 [проектирования демона qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Все маршруты находятся по базовому URL демона (по умолчанию `http://127.0.0.1:4170`).

## Аутентификация

Если демон был запущен с флагом `--token` или переменной `QWEN_SERVER_TOKEN`, **каждый маршрут, кроме `/health` на loopback-привязках**, должен содержать:

```
Authorization: Bearer <токен>
```

Если токен не настроен (режим разработки по умолчанию на loopback), заголовок не обязателен. Сравнение токенов выполняется за константное время. Ответы 401 единообразны для случаев `отсутствует заголовок` / `неверная схема` / `неверный токен`.

**Исключение для `/health` (Bctum):** на loopback-привязках (`127.0.0.1` / `localhost` / `::1` / `[::1]`) маршрут `/health` регистрируется **ДО** middleware для bearer-токена, поэтому проверки работоспособности (liveness probes) внутри пода могут не содержать токена, даже если демон запущен с `--token`. Привязки не к loopback (`--hostname 0.0.0.0` и т.д.) защищают `/health` с помощью bearer, как и все остальные маршруты — см. раздел [`GET /health`](#get-health) с обоснованием.

**`--require-auth` (#4175 PR 15).** Передача этого флага при запуске расширяет правило «должен быть токен» также на loopback. Запуск без токена завершается ошибкой; исключение для `/health` снимается (таким образом, `/health` также требует `Authorization: Bearer …`).

Когда флаг включён, глобальный middleware `bearerAuth` защищает **каждый** маршрут — включая `/capabilities`. Таким образом, **неаутентифицированный** клиент не может предварительно запросить `caps.features`, чтобы обнаружить, что требуется аутентификация: поверхность обнаружения для этого случая — это **тело ответа 401** (единообразное для всех маршрутов, как описано в разделе [Аутентификация](#authentication)). Тег возможности `require_auth` является **подтверждением после аутентификации** — после того, как клиент успешно проходит аутентификацию и читает `/capabilities`, наличие тега подтверждает, что демон был запущен с `--require-auth` (полезно для аудита / соответствия требованиям в UI и для SDK-клиентов, чтобы отображать «это развертывание усилено» на панели настроек). Маршруты, изменяющие состояние, которые подписываются на строгий режим для конкретного маршрута (последующие доработки Wave 4), отказывают с `401 { code: "token_required", error: "…" }` при доступе без токена на loopback по умолчанию — но если включён `--require-auth`, глобальный middleware bearer перехватывает запрос до проверки на уровне маршрута, поэтому неаутентифицированные вызывающие видят устаревшее тело `Unauthorized`.

**`--allow-origin <шаблон>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Веб-интерфейсы браузеров, обращающиеся к демону из другого источника, по умолчанию блокируются — любой запрос, содержащий заголовок `Origin`, возвращает `403 {"error":"Request denied by CORS policy"}`, потому что CLI/SDK-клиенты никогда не отправляют `Origin`, и демон рассматривает его наличие как признак того, что запрос пришёл из браузерного контекста, на который оператор не дал согласия. Передайте `--allow-origin <шаблон>` (можно повторять) при запуске, чтобы установить белый список вместо блокировки. Каждый шаблон представляет собой либо:

- Литерал `*` — разрешить любой источник. **Рискованно**: запуск отклоняется, когда указан `*`, но не установлен bearer-токен (любой источник: `--token`, `QWEN_SERVER_TOKEN` или `--require-auth`, который требует токен при запуске). При запуске в stderr выводится предупреждение, если `*` есть в списке. **Рекомендация**: сочетать с `--require-auth` на loopback-привязках, чтобы `/health` и `/demo` также были защищены bearer — по умолчанию на loopback они регистрируются до middleware bearer (поэтому k8s/Compose probes могут обращаться к `/health` без токена), а список `*` делает их доступными из любого кросс-доменного браузера. На привязках не к loopback bearer уже обязателен при запуске, поэтому поверхность воздействия `*` ограничена только `/health` (JSON статуса) и `/demo` (статическая страница, чей JS всё равно вызывает маршруты, защищённые токеном) — фактическая поверхность API в любом случае защищена.
- Канонический URL-источник — `<схема>://<хост>[:<порт>]`. **Без завершающего слеша, без пути, без информации о пользователе, без запроса.** Запуск отклоняется с `InvalidAllowOriginPatternError`, если запись не проходит проверку `new URL(pattern).origin === pattern`; сообщение об ошибке указывает неверный шаблон и каноническую форму. Строгость задумана намеренно: молчаливая нормализация (например, удаление завершающего `/`) позволила бы опечаткам проскользнуть и принять неоднозначный ввод.

Совпавшие источники получают стандартные заголовки CORS в каждом запросе:

```
Access-Control-Allow-Origin: <отражённый источник>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` отражает источник запроса дословно (в нижнем / верхнем регистре, как отправил браузер), а не литерал `*`, даже при использовании шаблона `*` — браузерные кеши связывают ответы с ним в паре с `Vary: Origin`, а отражение оставляет возможность добавить `Access-Control-Allow-Credentials` в одном из следующих релизов без изменения схемы. `Access-Control-Expose-Headers: Retry-After` позволяет веб-интерфейсам браузера учитывать подсказки о повторных попытках от демона в ответах `429` / `503`. `Access-Control-Allow-Credentials` **НЕ** отправляется сегодня: демон аутентифицируется через bearer в `Authorization`, что работает кросс-доменно без `credentials: 'include'`.
OPTIONS preflight-запросы (OPTIONS с `Access-Control-Request-Method` или `Access-Control-Request-Headers`) завершаются ответом `204 No Content` плюс указанными выше заголовками. Это стандартный шаблон CORS и безопасен — preflight только подтверждает, какие методы/заголовки принимает демон; фактический последующий запрос всё равно проходит полную цепочку (белый список хостов → аутентификация по токену → маршруты), так что защита от DNS-rebinding и проверка токена срабатывают до любого чтения или изменения состояния. Обычные OPTIONS-запросы из разрешённых источников продолжают обрабатываться с добавленными заголовками CORS.

Источники, не попавшие в белый список, получают `403 {"error":"Request denied by CORS policy"}` — тот же формат, что и стандартная заглушка, чтобы клиенты, уже разбирающие ответ заглушки, не нуждались в специальном случае для демонов с развёрнутым белым списком. Путь отклонения **не** отправляет никаких заголовков `Access-Control-*` (браузер бы их проигнорировал, а их отправка косвенно раскрыла бы размер белого списка через сам факт наличия).

Настроенный список шаблонов намеренно НЕ отображается в `/capabilities` — браузерный webui уже знает свой собственный источник (он ведь вызвал демон), а раскрытие списка позволило бы неаутентифицированному читателю `/capabilities` перечислить все доверенные источники (полезная разведка для неправильно настроенного развёртывания). SDK-клиенты ориентируются на тег `caps.features.allow_origin` как признак «этот демон поддерживает кросс-доменные браузерные запросы» без необходимости знать конкретные источники.

Запросы от самого себя через loopback (например, страница `/demo` вызывает демон на том же `127.0.0.1:port`) обрабатываются **отдельным** шлюзом удаления Origin, который запускается ДО middleware CORS и удаляет заголовок `Origin` для `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Таким образом, они проходят независимо от конфигурации `--allow-origin` — операторам не нужно указывать собственный порт демона, чтобы демо-страница работала.

## Общий формат ошибок

Ответы с кодом 5xx содержат оригинальные `code` и `data` ошибки, если они есть (стиль JSON-RPC — ACP SDK передаёт `{code, message, data}` от агента):

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

`SessionNotFoundError` для неизвестного идентификатора сессии возвращает:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

со статусом `404`.

`WorkspaceMismatchError` для `POST /session`, чей `cwd` не канонизируется до привязанной рабочей области демона (§3803 §02 — 1 демон = 1 рабочая область) возвращает `400` с:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Используйте это для обнаружения несоответствия перед выполнением: прочитайте `workspaceCwd` из `/capabilities` и опустите `cwd` в `POST /session` (тогда он упадёт на привязанную рабочую область), или направьте запрос демону, привязанному к `requestedWorkspace`.

`POST /session` при превышении лимита демона `--max-sessions` возвращает `503` с заголовком `Retry-After: 5` и:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Подключения к существующим сессиям НЕ учитываются в лимите, поэтому повторные подключения к бездействующему демону продолжают работать, даже если он на пределе.

`RestoreInProgressError` — генерируется только `POST /session/:id/load` и `POST /session/:id/resume` — возвращает `409` с заголовком `Retry-After: 5` (аналогично `session_limit_exceeded`) и:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Возникает, когда для идентификатора, для которого уже выполняется `session/resume`, отправлен запрос `session/load` (или наоборот). Подождите как минимум `Retry-After` секунд и повторите — восстановление завершится в течение `initTimeoutMs` (по умолчанию 10 с). Конкуренция одинаковых действий (`load` vs `load`, `resume` vs `resume`) объединяется, а не приводит к ошибке.

## Возможности

Демон сообщает о поддерживаемых тегах функций из реестра возможностей сервера. Клиенты **должны** принимать решения по UI на основе `features`, а не `mode` (согласно дизайну §10).

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
 'session_lsp',
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
> Условные теги появляются только тогда, когда соответствующий им переключатель развёртывания включён (см. таблицу ниже). Тег `permission_mediation` из F3 всегда включён и содержит `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, чтобы SDK-клиенты могли анализировать поддерживаемый сборкой набор; стратегия, активная во время выполнения, находится в `body.policy.permission`.

`session_scope_override` — это дискриптор согласования для поля `sessionScope` на запросе `POST /session` (см. ниже). Более старые демоны молча игнорируют это поле, поэтому SDK-клиентам следует выполнять предварительную проверку наличия этого тега в `caps.features` перед его отправкой.

`session_load` и `session_resume` анонсируют маршруты явного восстановления (`POST /session/:id/load` и `POST /session/:id/resume`). Более старые демоны возвращают `404` для этих путей, поэтому SDK-клиентам следует проверять `caps.features` перед вызовом. `unstable_session_resume` по-прежнему анонсируется как устаревший псевдоним для совместимости с SDK, которые были выпущены, когда соответствующий метод ACP назывался `connection.unstable_resumeSession`; новые клиенты должны ориентироваться на `session_resume`.

`slow_client_warning` охватывает две совместно выпущенные ручки противодавления SSE, введённые в #4175 Wave 2.5 PR 10: (a) демон генерирует синтетический кадр событийного потока `slow_client_warning`, когда очередь подписчика заполнена на 75%, один раз за эпизод переполнения (перевооружение происходит после того, как очередь опускается ниже 37,5%); (b) `GET /session/:id/events` принимает параметр запроса `?maxQueued=N` (диапазон `[16, 2048]`) для предварительного задания размера отставания на подписчика при холодных переподключениях к большому кольцу воспроизведения. Размер кольца демона управляется параметром `--event-ring-size` (по умолчанию **8000**, согласно #3803 §02). Старые демоны молча лишены обеих функций — проверяйте этот тег перед включением.

`typed_event_schema` анонсирует полезные нагрузки событий демона, соответствующие схеме `KnownDaemonEvent` SDK. Более старые демоны могут по-прежнему передавать совместимые кадры, но SDK-клиентам следует проверять этот тег, прежде чем рассчитывать на покрытие типизированных событий.

`client_heartbeat` анонсирует `POST /session/:id/heartbeat`. Более старые демоны возвращают `404`; проверяйте этот тег перед отправкой периодических heartbeat-запросов.

`session_close` и `session_metadata` анонсируют `DELETE /session/:id` и `PATCH /session/:id/metadata`. Более старые демоны возвращают `404`; проверяйте эти теги перед тем, как предлагать возможности закрытия или переименования.

`session_lsp` анонсирует `GET /session/:id/lsp` — доступный только для чтения структурированный снимок состояния LSP для клиентов демона. Более старые демоны возвращают `404`; проверяйте этот тег перед тем, как отображать удалённый статус LSP.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` и `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) анонсируют четыре маршрута управления мутациями, описанные ниже в разделе «Мутации: утверждение, инструменты, инициализация, перезапуск MCP». Все четыре строго охраняются шлюзом мутаций из PR 15 (демон, настроенный без токена-носителя, отклоняет их с кодом 401 `token_required`). Более старые демоны возвращают `404`; проверяйте каждый тег перед тем, как предлагать соответствующую возможность.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) охватывает поверхность бюджета MCP: поля `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` в `GET /workspace/mcp`, поле `disabledReason` в ячейках на сервер, а также флаги CLI `--mcp-client-budget` / `--mcp-budget-mode`. Более старые демоны полностью опускают новые поля; SDK-клиенты проверяют этот тег, прежде чем полагаться на семантику `budgets[]`. Дескриптор реестра также содержит `modes: ['warn', 'enforce']` для будущего раскрытия режимов функций — пока клиенты определяют режим из поля `budgetMode` снимка. Отказ сервера в режиме `enforce` детерминирован порядком объявления в `Object.entries(mcpServers)`; будущий слой приоритетов области действия (если qwen-code примет таковой) изменит это на «сначала наименьший приоритет», чтобы отразить соглашение claude-code `plugin < user < project < local`.

> ⚠️ **Область действия PR 14 v1: на сессию, а не на рабочую область.** Каждая ACP-сессия внутри демона создаёт свои собственные `Config` + `McpClientManager` (через `acpAgent.newSessionConfig`). Бюджет ограничивает активные MCP-клиенты **на сессию**; каждая сессия независимо читает `QWEN_SERVE_MCP_CLIENT_BUDGET` из переданного окружения. С `--mcp-client-budget=10` и 5 параллельными ACP-сессиями фактическое количество активных MCP-клиентов может достигать 5 × 10 = 50 по всему демону. Снимок `GET /workspace/mcp` считывает учёт только **сессии начальной загрузки** `McpClientManager` — значение `budgets[0].scope: 'session'` является честным сигналом того, что это на сессию, а не агрегировано. **Wave 5 PR 23 (общий пул MCP)** представит менеджер с областью действия рабочей области и добавит ячейку `scope: 'workspace'` рядом с ячейкой на сессию для истинной кросс-сессионной агрегации. v1 — это основа счётчика внутри процесса + мягкого принуждения, на которой строится PR 23.

`workspace_file_read` охватывает текстовые/списочные/статистические/глоб-маршруты файлов рабочей области (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` охватывает `GET /file/bytes`, который был добавлен позже, чтобы клиенты могли проверять поддержку сырых окон байтов на демонах эпохи PR19. `workspace_file_write` охватывает маршруты мутации текста с учётом хеша (`POST /file/write`, `POST /file/edit`). Тег записи означает, что контракт маршрута существует; это не означает, что текущее развёртывание открыто для анонимных мутаций. Запись/редактирование являются строгими маршрутами мутации и требуют настроенного токена-носителя даже на локальной петле.
`daemon_status` предоставляет эндпоинт `GET /daemon/status`, который возвращает консолидированный диагностический снимок оператора, доступный только для чтения, как описано ниже.

**Условные теги.** Небольшое количество тегов функциональности присутствует в выводе только при включении соответствующего флага развертывания. Наличие тега = поведение включено; отсутствие = либо старая версия демона, которая предшествует введению этого тега, либо текущий демон, где оператор не включил эту функцию. В настоящее время:

| Тег                        | Условие присутствия                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | демон был запущен с флагом `--require-auth` (или `requireAuth: true` через встроенный API). Bearer-токен обязателен для каждого маршрута, включая `/health` на loopback-привязках.                                                                                                                                                                                                                                                                                                                               |
| `mcp_workspace_pool`       | общий пул транспортов MCP активен. Тег отсутствует, когда пул отключён параметром `QWEN_SERVE_NO_MCP_POOL=1`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mcp_pool_restart`         | общий пул транспортов MCP активен; ответы на перезапуск могут включать элементы с несколькими записями, учитывающими пул.                                                                                                                                                                                                                                                                                                                                                                                        |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Демон был запущен с хотя бы одним флагом `--allow-origin <pattern>` (или `allowOrigins: [...]` через встроенный API). Междоменные запросы с совпадающих источников получают корректные CORS-заголовки; запросы с несовпадающих источников по-прежнему возвращают код 403. Список настроенных шаблонов намеренно НЕ дублируется в `/capabilities`, чтобы не раскрывать набор доверенных источников неаутентифицированным читателям — браузерный веб-интерфейс уже знает свой собственный источник. |
| `prompt_absolute_deadline` | параметр `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` установлен в положительное целое число.                                                                                                                                                                                                                                                                                                                                                                    |
| `writer_idle_timeout`      | параметр `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` установлен в положительное целое число.                                                                                                                                                                                                                                                                                                                                                         |
| `workspace_settings`       | демон был создан с возможностью сохранения настроек.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `session_shell_command`    | выполнение команд в оболочке сессии явно включено.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rate_limit`               | включен параметр `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `workspace_reload`         | поддержка перезагрузки рабочего пространства доступна в конфигурации встроенных маршрутов.                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` **не** входит в эту условную таблицу — это всегда активный тег, объявляемый всякий раз, когда бинарный файл поддерживает новые поля бюджета `/workspace/mcp`, независимо от того, настроил ли оператор бюджет. Операторы, не установившие `--mcp-client-budget`, всё равно получают новые поля (с `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) объявляет типизированные SSE push-события, которые отображают пересечения состояния MCP-бюджета без цикла опроса. На `GET /session/:id/events` приходят два типа фреймов:

- `mcp_budget_warning` — срабатывает один раз при превышении порога в 75% от `reservedSlots.size / clientBudget`. Повторно активируется только после того, как коэффициент опускается ниже 37.5% (`MCP_BUDGET_REARM_FRACTION`). Копирует гистерезис `slow_client_warning` из PR 10, но на уровне менеджера, а не на уровне отставания отдельного подписчика. Полезная нагрузка: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Срабатывает в обоих режимах `warn` и `enforce`; никогда — в режиме `off`.
- `mcp_child_refused_batch` — срабатывает в конце каждого прохода `discoverAllMcpTools*`, когда один или несколько серверов были отклонены, а также как пакет длиной 1 на пути отказа при ленивом порождении `readResource`. Полезная нагрузка: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` — это буквальное значение `'enforce'`, поскольку режим `warn` никогда не отказывает.

Оба события находятся в кольцевом буфере повторного воспроизведения SSE для каждой сессии (они содержат `id`), поэтому клиент, переподключающийся с `Last-Event-ID`, проходит через них; моментальный снимок в `GET /workspace/mcp` по-прежнему является источником истины для состояния после длительного отключения. Всегда активны после объявления — условного переключателя нет. Состояние в редукторе SDK (`DaemonSessionViewState`) предоставляет `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` для адаптеров, которым нужен простой UI с отставанием.

## Routes

### `GET /health`

Проверка работоспособности (liveness). Стандартная форма возвращает `200 {"status":"ok"}`, если слушатель активен — дешёвая, без доступа к мосту, подходит для высокочастотных проверок k8s/Compose.

Передайте `?deep=1` (также принимается `?deep=true` или просто `?deep`) для проверки, которая раскрывает **счётчики** моста (только для информации, не настоящая проверка liveness):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Глубокая проверка является **информационной**, а не настоящей проверкой работоспособности. Она читает аксессоры счётчиков (`bridge.sessionCount`, `bridge.pendingPermissionCount`), которые являются простыми геттерами размера Map; они не выполняют ping отдельных дочерних процессов/каналов и поэтому не обнаружат зависшую, но всё ещё учитываемую сессию. Используйте её для панелей мониторинга ёмкости (текущая параллельность vs `--max-sessions`, глубина очереди), а не как триггер для «вывести демона из ротации». Ответ `503 {"status":"degraded"}` теоретически возможен, если геттеры пользовательской реализации моста выбрасывают исключение, но геттеры реального моста никогда этого не делают — при нормальной работе глубокая проверка всегда возвращает 200. Для реальной проверки liveness полагайтесь на то, принимает ли слушатель TCP-соединение вообще (т.е. на `/health` по умолчанию без `?deep`).

**Auth:** требуется **только на не-loopback привязках**. На loopback (`127.0.0.1`, `::1`, `[::1]`) `/health` регистрируется до middleware с токеном, поэтому проверки k8s/Compose внутри пода не должны нести токен. На не-loopback (`--hostname 0.0.0.0` и т.д.) маршрут регистрируется после middleware с токеном и возвращает 401 без действительного токена — иначе неаутентифицированный вызывающий мог бы опрашивать произвольные адреса, чтобы подтвердить существование `qwen serve`, что является низкоприоритетной утечкой информации, плохо сочетаемой со сканированием портов. CORS deny + Host allowlist по-прежнему применяются к исключению для loopback.

### `GET /daemon/status`

Диагностика оператора (только для чтения). В отличие от `/health`, это обычный API демона:
он регистрируется после bearer-аутентификации и rate limiting, включая привязки loopback. Параметр запроса:

- `detail=summary` (по умолчанию) читает только состояние демона в памяти.
- `detail=full` также включает диагностику активных сессий, диагностику ACP-соединений, количество устройств через auth device-flow и разделы состояния рабочей области.
- любое другое `detail` возвращает `400 { "code": "invalid_detail" }`.

`summary` намеренно не запрашивает методы состояния рабочей области, не запускает дочерний процесс ACP и не порождает сессию. `full` запрашивает каждый раздел рабочей области независимо; тайм-аут или исключение помечает только этот раздел как `unavailable` и добавляет проблему `workspace_status_unavailable`.

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
`status` имеет значение `error`, если какая-либо проблема имеет уровень ошибки, `warning`, если какая-либо проблема имеет уровень предупреждения, в противном случае — `ok`. Коды проблем стабильны и включают `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits` и `workspace_status_unavailable`. В течение короткого промежутка времени после того, как слушатель готов, но до полной загрузки рантайма, `/daemon/status` может возвращать `daemon_runtime_starting`; если асинхронная загрузка рантайма завершается неудачей, он возвращает `daemon_runtime_failed`, в то время как маршруты, не связанные со статусом рантайма, возвращают `503`.

Безопасность: ответ никогда не включает токены bearer, ID клиентов, полные ID ACP-подключений, коды авторизации device-flow или URL верификации. `summary` опускает путь к логу демона; `full` может включать его для аутентифицированных операторов.

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

Стабильный контракт: когда `v` увеличивается, структура фрейма изменилась обратно-несовместимым образом.

> **`protocolVersions`** описывает версии serve-протокола, которые может использовать демон. `current` — предпочитаемая демоном версия протокола, а `supported` — совместимый набор. Клиенты, которым требуется конкретный протокол, должны проверять `supported`; UI, зависящий от функций, всё равно должен проверять `features`. Дополнение для v=1: более старые v=1 демоны опускают это поле, поэтому SDK-клиенты, предназначенные для старых сборок, должны считать его необязательным.

> **`modelServices` всегда `[]` в Фазе 1.** Агент использует единственный сервис модели по умолчанию и не перечисляет его по сети. Фаза 2 заполнит это поле из зарегистрированных адаптеров моделей, чтобы SDK-клиенты могли создавать селекторы сервисов; до тех пор НЕ полагайтесь на то, что это поле не пустое.

> **`workspaceCwd`** — это канонический абсолютный путь, к которому привязан этот демон (#3803 §02 — 1 демон = 1 workspace). Используйте его для (a) обнаружения несоответствия перед отправкой POST `/session` и (b) опускания `cwd` в POST `/session` (маршрут использует этот путь по умолчанию). Многоворкспейсовые развёртывания запускают несколько демонов на разных портах, каждый со своим `workspaceCwd`. Дополнение для v=1: v=1 демоны до §02 опускают поле — клиенты, предназначенные для старых сборок, должны проверять на null перед использованием.

### Маршруты статуса рантайма только для чтения

Эти маршруты возвращают снимки рантайма со стороны демона. Они являются дополнительными v1-маршрутами, не изменяют состояние и не меняют версию serve-протокола. Маршруты статуса workspace намеренно **не** запускают дочерний процесс ACP только потому, что клиент опрашивает GET-маршрут: если демон бездействует, они возвращают `initialized: false` с пустым снимком. Маршруты статуса сессии требуют активной сессии и используют стандартную форму `404 SessionNotFoundError` для неизвестных ID.

Теги возможностей:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`

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

`errorKind` — это закрытое перечисление, общее для `/workspace/preflight`, `/workspace/env` и (в конечном итоге) guardrails MCP, чтобы SDK-клиенты могли отображать исправления по категориям вместо разбора свободных сообщений. PR 13 (#4175) представил семь литералов, перечисленных выше; PR 14 заполнит `blocked_egress` после того, как зонд egress будет реализован.

Полезные данные статуса никогда не раскрывают значения MCP env, заголовки, детали OAuth/сервисных аккаунтов, ключи API провайдеров, `baseUrl` / `envKey` провайдера, тело навыка, пути файловой системы навыка, определения хуков или значения секретных переменных окружения. `/workspace/env` сообщает только о **наличии** разрешённых переменных env; URL прокси очищаются от учётных данных и сокращаются до `host:port` перед отправкой.

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

`discoveryState` может быть одним из `not_started`, `in_progress` или `completed`. `transport` может быть одним из `stdio`, `sse`, `http`, `websocket`, `sdk` или `unknown`. `errors` опускается, если обнаружение прошло успешно.
**MCP клиентские ограничения (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Демоны после PR-14 расширяют полезную нагрузку четырьмя дополнительными полями и одной ячейкой уровня рабочего пространства:

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

`budgetMode` принимает одно из значений: `enforce`, `warn` или `off`. `clientBudget` отсутствует, если бюджет не задан. `budgets[]` **всегда является массивом** в демонах после PR-14 (может быть пустым, если `budgetMode === 'off'`); демоны до PR-14 опускают это поле целиком. v1 выдает одну ячейку с `scope: 'session'` (контроль на сессию — объяснение в разделе возможностей выше). Потребители ДОЛЖНЫ игнорировать дополнительные записи `budgets[]` с неизвестными значениями `scope` — в Wave 5 PR 23 добавится `scope: 'workspace'` (или `'pool'`) вместе с ячейкой на сессию, без изменения схемы.

`disabledReason` в ячейках на сервер различает отключение оператором (`'config'` — список конфигурации `disabledMcpServers`) и отказ из-за бюджета (`'budget'` — сервер обнаружен, но никогда не подключался из-за режима `enforce`). Отказы детерминированы по порядку объявления в `Object.entries(mcpServers)`. Поле `status: 'error', errorKind: 'budget_exhausted'` на сервере перекрывает сырое `mcpStatus: 'disconnected'` (которое верно, но не является серьезностью для оператора).

Контроль бюджета в PR 14 v1 осуществляется **на сессию, а не на рабочее пространство**. Хотя демоны Режима B представляют собой `1 демон = 1 рабочее пространство × N сессий` после #4113 на уровне процесса, `McpClientManager` создается внутри каждой сессии ACP через `acpAgent.newSessionConfig`, поэтому N сессий каждая применяет свою собственную копию ограничения. Снимок представляет представление сессии начальной загрузки. Wave 5 PR 23 вводит общий MCP-пул на уровне рабочего пространства, который превращает это в полноценный контроль на рабочее пространство.

**Обнаружение давления бюджета.** Две поверхности, обе заполняются после PR-14b:

- **Push-события** (объявляются через `mcp_guardrail_events`): подписка на `GET /session/:id/events` и фильтрация фреймов `mcp_budget_warning` / `mcp_child_refused_batch` через `KnownDaemonEvent`. Конечный автомат срабатывает один раз при каждом пересечении 75% вверх (перевооружение ниже 37,5%); отказы объединяются за один проход обнаружения в режиме `enforce`.
- **Опрос снимка** (объявляется через `mcp_guardrails`): `GET /workspace/mcp` и проверка ячейки бюджета сессии (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (соответствует порогу гистерезиса, который будет использовать push-событие PR 14b).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (один или несколько серверов отказаны за этот проход обнаружения).
- `budgets[0].status === 'ok'` ⇔ ниже порога 75% И нет отказов.

Рекомендуемая частота опроса: синхронизировать с тем, что уже опрашивает `/workspace/mcp`; снимок дешев, и ячейка бюджета не несет дополнительных затрат на обнаружение. Клиенты SDK, подписанные на push-события, все равно выигрывают от снимка для восстановления состояния после длительного отключения (глубина кольцевого буфера SSE конечна — `--event-ring-size`, по умолчанию 8000 — поэтому клиент, отсутствующий дольше, чем охватывает кольцо, возвращается к синхронизации через снимок).

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

`level` принимает одно из значений: `project`, `user`, `extension` или `bundled`. `errors` опускается, если обнаружение прошло успешно.

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
Модели сгруппированы по типу аутентификации. Диагностика подключения провайдеров находится в ячейке `providers` на `/workspace/preflight`; проверка окружения — на `/workspace/preflight` и `/workspace/env` (ниже). `errors` опускается при успешном построении снимка.

### `GET /workspace/env`

Сообщает runtime процесса демона, платформу, песочницу, прокси и **наличие** разрешённых секретных переменных окружения. Всегда отвечает из состояния `process.*` — демон никогда не порождает дочерний ACP-процесс для обслуживания этого маршрута, и ответ идентичен независимо от того, запущен ACP или простаивает. Поле `acpChannelLive` является исключительно информационным.

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

**Политика редактирования.** Ячейки с `kind: 'env_var'` никогда не содержат поля `value`; клиенты видят только `present: boolean`. Ячейки с `kind: 'proxy'` пропускают сырое значение env через редактирование учётных данных (`redactProxyCredentials`), а затем через разбор `URL`, чтобы по сети передавался только `host:port`. `NO_PROXY` передаётся через редактирование дословно, так как это список хостов, а не URL. Белый список перечисленных секретных переменных окружения в настоящее время включает `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` и `QWEN_SERVER_TOKEN`. Другие переменные окружения не перечисляются, поэтому случайно установленные секреты остаются невидимыми.

### `GET /workspace/preflight`

Сообщает результаты проверки готовности демона. **Ячейки уровня демона** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) всегда заполняются из `process.*` и `node:fs`. **Ячейки уровня ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) требуют активного дочернего ACP-процесса — когда демон простаивает, они выдают заполнители с `status: 'not_started'`. Маршрут никогда не порождает ACP только для заполнения ячеек; соответствующие ячейки возвращаются в состоянии `not_started`.

Ответ в режиме простоя (нет дочернего ACP-процесса):

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
  ripgrep / git / npm не найдены в PATH (скорее предупреждения, чем ошибки для
  опциональных бинарников).
- `missing_file` — `boundWorkspace` не существует или не является директорией;
  ошибка разбора навыка, указывающая на отсутствующий или недоступный для чтения файл.
- `parse_error` — ошибка разбора `SKILL.md`, некорректный JSON конфигурации.
- `auth_env_error` — `validateAuthMethod` вернул ненулевую строку ошибки
  или подкласс `ModelConfigError`, распространённый из разрешения провайдера.
- `init_timeout` — отклонение `withTimeout` в мосту (фактический тайм-аут
  при ожидании ACP-ответа). Определяется по типизированному классу
  `BridgeTimeoutError`. Примечание: временная ячейка `mcp_discovery`
  с `connecting > 0` и статусом `warning` НЕ несёт этот kind — это
  нормальное состояние незавершённого рукопожатия, отличное от реального тайм-аута.
- `protocol_error` — ACP `extMethod` отклонён, потому что канал закрылся
  в середине запроса, или потому что реестр инструментов неожиданно отсутствовал.
- `blocked_egress` — зарезервировано для PR 14 (#4175). PR 13 оставляет
  ячейку `egress` со статусом `not_started`.

Если мосту не удаётся связаться с ACP-дочерним процессом во время обработки preflight-запроса
(например, закрытие канала в середине запроса), массив `errors` конверта
содержит одну ячейку `ServeStatusCell`, описывающую ошибку, а сами ячейки
откатываются к заполнителям ACP со статусом `not_started`. Ячейки уровня демона
всё равно возвращаются.

### Маршруты файлов рабочей области

Все пути к файлам разрешаются относительно привязанной рабочей области демона. Ответы используют
относительные пути рабочей области и никогда не возвращают абсолютные пути файловой системы для обычных
успешных случаев. Успешные ответы о файлах включают:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Ошибки файловой системы используют следующую JSON-форму:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "перечитайте файл и повторите с последним хешем",
  "status": 409
}
```

Значения `errorKind` включают `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found` и `ambiguous_text_match`.

#### `GET /file`

Читает текстовый файл. Параметры запроса: `path` (обязательный), `maxBytes`, `line` и
`limit`. Демон отклоняет бинарные файлы и файлы, превышающие лимит чтения текста.
Ответ включает `hash` — дайджест SHA-256 по сырым байтам на диске для
всего файла, даже если `line`, `limit` или `maxBytes` вернули лишь часть.

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

Читает сырые байты из файла без декодирования. Параметры запроса: `path` (обязательный),
`offset` (по умолчанию `0`) и `maxBytes` (по умолчанию `65536`, максимум `262144`). Этот
маршрут поддерживает ограниченные окна для больших бинарных файлов без полной загрузки файла.
Ответ включает `hash` только тогда, когда возвращённое окно покрывает весь файл.

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

Создаёт или заменяет текстовый файл. Это строгий маршрут мутации: при loopback
без настроенного токена возвращает `401 { "code": "token_required" }`.
С флагом `--require-auth` глобальное middleware Bearer отклоняет неаутентифицированные
запросы до выполнения маршрута.

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

`mode` должен быть `create` или `replace`. `create` никогда не перезаписывает существующий
файл (`409 file_already_exists`). `replace` требует `expectedHash`; отсутствующий или
некорректный хеш даёт `400 parse_error`, а устаревший хеш —
`409 hash_mismatch`. `expectedHash` — это `sha256:` плюс 64 символа
в нижнем регистре, вычисленные по сырым байтам на диске.

`bom`, `encoding` и `lineEnding` могут быть предоставлены. При замене по умолчанию
сохраняется существующий профиль кодировки файла; явные поля переопределяют его.
Бинарная запись выходит за рамки.

Демон записывает во временный файл со случайным именем в целевой директории, выполняет fsync там,
где это поддерживается, повторно проверяет текущий хеш непосредственно перед `rename()`,
затем переименовывает на место. Это предотвращает наблюдение частичного файла и сериализует
записи от демона в один и тот же файл, но это не является атомарной операцией сравнения-и-замены
на уровне ядра для разных процессов: внешний редактор всё ещё может устроить гонку в крошечном
окне между последней проверкой хеша и переименованием.
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

Применяет одну точную замену текста в существующем текстовом файле. Это также строгий мутирующий маршрут и требует `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` должен быть непустым и встречаться ровно один раз. Отсутствие совпадения возвращает `422 text_not_found`, несколько совпадений — `422 ambiguous_text_match`. Маршрут сохраняет кодировку, BOM и окончания строк, а также повторно проверяет `expectedHash` непосредственно перед атомарным переименованием.

Явные записи/редактирования по игнорируемым путям разрешены, так как аутентифицированный вызывающий указал этот путь. Успешные ответы и события аудита включают `matchedIgnore: "file" | "directory" | null`.

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

`state` отражает те же формы ACP-модели/режима/конфигурации, которые используются в `POST /session`, `POST /session/:id/load` и `POST /session/:id/resume`.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Инициализировать проект",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` — это тот же снимок команд, который используется в SSE-уведомлении `available_commands_update`. `availableSkills` перечисляет только имена навыков; клиенты не должны ожидать тела навыков или пути по этому маршруту.

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
      "label": "reviewer: проверить сбой",
      "description": "проверить сбой",
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

Этот маршрут — доступный только для чтения внеполосный снимок. Он намеренно не является подсказкой (prompt) и может быть опрошен, пока сессия передает потоковые данные. Ответ содержит только разрешенные метаданные из реестров задач агента, оболочки и монитора; контроллеры, таймеры, смещения, ожидающие сообщения и сырые объекты реестра никогда не раскрываются.

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

`status` — одно из `NOT_STARTED`, `IN_PROGRESS`, `READY` или `FAILED`. Необязательное поле `error` присутствует у упавших серверов, когда доступно. Отключенный LSP (включая базовый режим) возвращает HTTP 200 с `enabled: false`, нулевыми счетчиками и `servers: []`. Включенный LSP без настроенных серверов возвращает `enabled: true`, `configuredServers: 0` и `servers: []`. Если инициализация завершается сбоем до создания клиента, ответ может содержать `initializationError`; если живой клиент не может предоставить снимок, ответ включает `statusUnavailable: true`.

Этот маршрут раскрывает только стабильные поля, видимые клиенту. Он намеренно опускает внутренние детали отладки, такие как идентификаторы процессов, аргументы запуска, вывод stderr, корневые URI и пути к папкам рабочего пространства.

### `POST /session`

Породить нового агента или присоединиться к существующему (при `sessionScope: 'single'`, значении по умолчанию).

Запрос:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Поле               | Обязательно | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`               | нет         | Абсолютный путь, соответствующий привязанному рабочему пространству демона. Если опущен, маршрут использует `boundWorkspace` (прочитайте его из `/capabilities.workspaceCwd`). Несовпадающий непустой `cwd` возвращает `400 workspace_mismatch` (#3803 §02 — 1 демон = 1 рабочее пространство). Пути рабочего пространства канонизируются через `realpathSync.native` (с fallback только на разрешение для несуществующих путей), чтобы файловые системы без учета регистра не отклоняли сессии из-за написания.                                                                                                                     |
| `modelServiceId`    | нет         | Выбирает, через какой настроенный _сервис моделей_ будет маршрутизироваться агент (серверный провайдер — Alibaba ModelStudio, OpenRouter и т. д.). Если опущен, агент использует свой сервис по умолчанию. Если у рабочего пространства уже есть сессия, этот вызов вызывает `setSessionModel` на существующей и рассылает `model_switched`. Отличается от `modelId` в `POST /session/:id/model`, который выбирает модель **внутри** уже привязанного сервиса. Массив `modelServices` в `/capabilities` зарезервирован для рекламы настроенных сервисов; на этапе 1 он всегда `[]` (агент использует сервис по умолчанию, который не перечисляется через HTTP). |
| `sessionScope`      | нет         | Параметр переопределения для общего доступа к сессии. `'single'` (значение по умолчанию для демона) заставляет повторный `POST /session` того же рабочего пространства повторно использовать существующую сессию (`attached: true`); `'thread'` принудительно создает новую отдельную сессию при каждом вызове. Если опущен, наследует значение по умолчанию демона. Значения вне перечисления возвращают `400 { code: 'invalid_session_scope' }`. Старые демоны (до #4175 PR 5) игнорируют поле молча — перед отправкой проверьте `caps.features.session_scope_override`. Значение по умолчанию демона сегодня захардкожено как `'single'`; #4175 может добавить флаг CLI `--sessionScope` в последующем обновлении.                  |
```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` означает, что сессия для этого рабочего пространства уже существовала, и теперь вы используете её совместно.

Одновременные вызовы `POST /session` для одного и того же рабочего пространства **объединяются** в один spawn — оба вызывающих получают одинаковый `sessionId`, ровно один получает `attached: false`. Если базовый spawn завершается неудачей (тайм-аут инициализации, некорректный вывод агента, OOM), **все объединённые вызывающие получают одну и ту же ошибку** — слот выполнения очищается, так что последующий вызов может повторить попытку с нуля.

> ⚠️ **Отклонение `modelServiceId` при создании новой сессии происходит молча — в HTTP-ответе это не отображается.** Неверный `modelServiceId` (опечатка, не настроенный сервис) НЕ вызывает 500 при создании — сессия остаётся работоспособной с моделью агента по умолчанию, так что вызывающий всё равно получает `sessionId`, с которым может повторить попытку переключения модели (через `POST /session/:id/model`). Видимый сигнал ошибки — это событие `model_switch_failed` в SSE-потоке сессии, которое возникает между квитированием spawn и первой подпиской. **Подписчикам, которым необходимо отследить это событие, следует передавать `Last-Event-ID: 0` при первом `GET /session/:id/events`**, чтобы воспроизвести события, начиная с самого старого доступного в кольце (это покрывает событие `model_switch_failed` времени spawn, даже если подписка приходит через несколько миллисекунд после ответа на создание).

### `POST /session/:id/load`

Восстановить сохранённую сессию ACP по идентификатору и воспроизвести её историю через SSE. Идентификатор в пути является основным; любое поле `sessionId` в теле игнорируется. Перед использованием проверяйте `caps.features.session_load` — старые демоны возвращают `404` на этот маршрут.

Request:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Поле | Обязательно | Примечания                                                                                                                                                                                                                           |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`| нет         | Те же правила канонизации + `workspace_mismatch`, что и в `POST /session`. Если не указано, наследуется значение `/capabilities.workspaceCwd`. `mcpServers` намеренно НЕ принимается — общедемонный MCP управляется настройками (аналогично `POST /session`). |

Response:

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

`state` соответствует ACP `LoadSessionResponse` — `models` это `SessionModelState`, `modes` — `SessionModeState`, `configOptions` — массив `SessionConfigOption`. Отсутствующие поля определяются агентом. Поздние присоединяющиеся (путь `attached: true`) получают ТОТ ЖЕ снимок `state`, который видел исходный вызывающий load — демон кеширует его при записи; изменения во время выполнения (например, `model_switched`) доставляются через SSE-поток, а не в последующих ответах attach.

`attached: true` означает, что сессия уже была активна (либо после предшествующего `session/load`/`session/resume`, либо потому что другой одновременный вызывающий опередил).

**Воспроизведение истории через SSE.** Пока `loadSession` выполняется на стороне агента, агент отправляет уведомления `session_update` для каждого сохранённого шага. Демон буферизует их в шину событий сессии до того, как ответ маршрута будет возвращён, поэтому подписчики, которые немедленно вызывают `GET /session/:id/events` с `Last-Event-ID: 0`, увидят полное воспроизведение. **Кольцо воспроизведения ограничено** (по умолчанию 8000 фреймов на сессию). Длинные истории с множеством вызовов инструментов / потоков мыслей могут превысить этот лимит — самые старые фреймы отбрасываются молча. Клиентам, которым нужна полная история, следует подписываться сразу после возврата `load`; альтернативно они могут сохранять идентификаторы SSE-событий и использовать `Last-Event-ID`, чтобы возобновить с более поздней границы шага.

**Ошибки:**

- `404` — идентификатор сохранённой сессии не существует (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (та же форма, что в `POST /session`).
- `503` — `session_limit_exceeded` (учитывается в `--max-sessions`; восстанавливаемые сессии также учитываются).
- `409` — `restore_in_progress` (`session/resume` для того же идентификатора уже выполняется). `Retry-After: 5`. Однотипные гонки (два одновременных `session/load` для одного идентификатора) объединяются — ровно один возвращает `attached: false`, остальные возвращают `attached: true` с тем же `state`.

### `POST /session/:id/resume`

Восстановить сохранённую сессию ACP по идентификатору БЕЗ воспроизведения истории через SSE. Контекст модели восстанавливается внутренне на стороне агента (через `geminiClient.initialize` с чтением `config.getResumedSessionData`); SSE-поток остаётся чистым для клиентов, у которых история уже отрендерена. Перед использованием проверяйте `caps.features.session_resume`; `unstable_session_resume` остаётся устаревшим алиасом для обратной совместимости со старыми клиентами.

Та же форма запроса, что у `/load`. Та же форма ответа — `state` соответствует ACP `ResumeSessionResponse`. Те же ошибки, включая `409 restore_in_progress` (возникает, когда выполняется `session/load`; `session/resume`, выполняющийся одновременно с другим `session/resume`, объединяется).
Используйте `/load`, когда у клиента нет отображённой истории (холодное переподключение, открытие через палитру). Используйте `/resume`, когда у клиента уже есть витки на экране и ему нужен только дескриптор со стороны демона.

> ⚠️ **Зачем всё ещё рекламируется `unstable_session_resume`?** HTTP-маршрут демона и возможность `session_resume` стабильны для v1, но мост по-прежнему вызывает `connection.unstable_resumeSession` из ACP. Старый тег остаётся только для того, чтобы SDK, выпущенные до `session_resume`, продолжали работать.

### `GET /workspace/:id/sessions`

Вывести список всех активных сессий, чей канонический workspace соответствует `:id` (URL-кодированный абсолютный cwd).

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

Пустой массив (а не 404), когда сессий нет — UI выбора сессий не должен выдавать ошибку только потому, что workspace простаивает.

### `POST /session/:id/prompt`

Передать промпт агенту. Вызывающие мульти-промпт ставятся в FIFO-очередь на каждую сессию (ACP гарантирует один активный промпт на сессию).

Запрос:

```json
{
  "prompt": [{ "type": "text", "text": "Что делает src/main.ts?" }]
}
```

Проверка: `prompt` должен быть непустым массивом объектов. Другие ошибки возвращают `400` до того, как запрос дойдёт до моста.

Ответ:

```json
{ "stopReason": "end_turn" }
```

Другие причины остановки: `cancelled`, `max_tokens`, `error`, `length` (по спецификации ACP).

Если HTTP-клиент отключается во время выполнения промпта, демон отправляет агенту уведомление ACP `cancel`, что завершает промпт с `stopReason: "cancelled"`.

> **Ограничение этапа 1 — отсутствие тайм-аута промпта на стороне сервера.** Мост
> только соревнует вызов `prompt()` агента с `transportClosedReject`
> (падение дочернего процесса агента) и AbortSignal при HTTP-отключении
> вызывающей стороны. Зависший, но живой агент (например, вызов модели,
> который завис) блокирует FIFO для данной сессии до тех пор, пока HTTP-клиент
> не завершится по своему тайм-ауту и не отключится. Длительные промпты
> легитимны (глубокое исследование, анализ большой кодовой базы), поэтому
> значение по умолчанию сознательно не задано; в этапе 2 будет добавлена
> конфигурируемая опция `promptTimeoutMs`. А пока вызывающие стороны должны
> устанавливать собственный тайм-аут на стороне клиента и отключаться (или
> вызывать `POST /session/:id/cancel`) по истечении.

### `POST /session/:id/cancel`

Отменить **текущий активный** промпт в сессии. На стороне ACP это уведомление, а не запрос — агент подтверждает отмену, разрешая активный `prompt()` с `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Контракт мульти-промпта:** отмена затрагивает только активный промпт. Любые промпты, которые тот же клиент ранее отправил через POST и которые всё ещё стоят в очереди за активным, продолжат выполняться. Очередь мульти-промптов — это поведение, введённое демоном (не описано в спецификации ACP); контракт для поставленных в очередь промптов: «они продолжают работать, если вы не отмените каждый или не убьёте сессию через выход из канала».

### `DELETE /session/:id`

Явно закрыть активную сессию. Принудительно закрывается, даже если подключены другие клиенты — отменяет любой активный промпт, разрешает ожидающие разрешения как отменённые, публикует событие `session_closed`, закрывает EventBus и удаляет сессию из карт демона. Сессии, сохранённые на диске, НЕ удаляются — их можно перезагрузить через `POST /session/:id/load`. Предварительная проверка: `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Идемпотентно: возвращает `404` для неизвестных сессий (та же форма `SessionNotFoundError`, что и в других маршрутах).

> **Событие `session_closed`.** Подписчики SSE получают терминальное событие `session_closed` с `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` до завершения потока. Редьюсеры SDK обрабатывают его так же, как `session_died` (устанавливают `alive: false`, очищают `pendingPermissions`).

### `PATCH /session/:id/metadata`

Обновить изменяемые метаданные сессии. В настоящее время поддерживается только `displayName`. Предварительная проверка: `caps.features.session_metadata`.

Запрос:

```json
{ "displayName": "My Investigation Session" }
```

| Поле          | Обязательное | Примечания                                                                      |
| ------------- | ------------ | ------------------------------------------------------------------------------- |
| `displayName` | нет          | Строка, максимум 256 символов. Пустая строка очищает имя. Опустите, чтобы оставить без изменений. |

Ответ:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Публикует событие `session_metadata_updated` в SSE-потоке сессии с `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Обновить учёт последнего времени активности демона для данной сессии. Долгоживущие адаптеры (TUI/IDE/web) отправляют этот пинг через интервал, чтобы будущая политика отзыва (волна 5, PR 24) могла отличить мёртвых клиентов от молчаливых.
| Заголовок         | Обязательно | Примечания                                                                                                                                                                                                                                   |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id`| нет         | Повторяет идентификатор, выданный демоном при `POST /session`. Идентифицированные клиенты также обновляют свою метку времени на каждого клиента; анонимные пульсы обновляют только метку сессии. Должен соответствовать тому же шаблону `[A-Za-z0-9._:-]{1,128}`, что и везде. |

Тело запроса пустое (`{}` подойдёт — поля не читаются).

Ответ:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` возвращается только при наличии доверенного заголовка `X-Qwen-Client-Id`. `lastSeenAt` — это метка времени `Date.now()` на стороне демона (мс), которую сохранил мост.

Ошибки:

- `400` — `{ code: 'invalid_client_id' }`, если заголовок имеет неверный формат (нарушено правило формы заголовка) или если он содержит `clientId`, не зарегистрированный для данной сессии (мост выбрасывает `InvalidClientIdError` до обновления любой метки времени).
- `404` — сессия не найдена.

Проверка возможностей: предварительная проверка `caps.features.client_heartbeat`. Старые демоны возвращают `404` для этого пути.

### `POST /session/:id/model`

Переключение активной модели **внутри** текущей привязанной к сессии модели сервиса. Сериализуется через очередь изменения модели для сессии.

(Для переключения самого _сервиса_ — Alibaba ModelStudio, OpenRouter и т.д. — передайте `modelServiceId` в `POST /session` для новой сессии. В Этапе 1 нет маршрута для переключения сервиса на лету.)

Запрос:

```json
{ "modelId": "qwen-staging" }
```

Ответ:

```json
{ "modelId": "qwen-staging" }
```

При успехе публикует событие `model_switched` в SSE-поток. При неудаче публикует `model_switch_failed` (чтобы пассивные подписчики тоже видели ошибку, а не только вызывающая сторона). Гонка с завершением канала агента: зависший дочерний процесс не может заблокировать HTTP-обработчик.

### `POST /session/:id/recap`

Тег возможности: `session_recap`. Мост → ACP extMethod `qwen/control/session/recap`.

Генерирует однофразовое резюме «на чём остановились» для сессии. Оборачивает `generateSessionRecap` ядра (`packages/core/src/services/sessionRecap.ts`), который выполняет побочный запрос к быстрой модели с отключёнными инструментами, `maxOutputTokens: 300` и строгим форматом вывода `<recap>...</recap>`. Побочный запрос читает существующую историю чата GeminiClient сессии и **не** добавляет в неё информацию.

Тело запроса игнорируется (отправьте `{}` или пустое). Нестрогий шлюз мутации — поведение соответствует `/session/:id/prompt` (вызов тратит токены, но не меняет состояние). SSE-событие не публикуется.

Ответ (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Отладка гонки повторных попыток аутентификации. Далее: добавить детерминированные тайминги в интеграционный тест."
}
```

`recap` принимает значение `null` (нормальный 200, не ошибка), когда:

- в сессии ещё менее двух диалоговых ходов,
- побочный запрос не вернул извлекаемый `<recap>...</recap>`,
- произошла любая базовая ошибка модели (вспомогательная функция ядра работает по принципу best-effort и никогда не выбрасывает исключения).

Ошибки:

- `400 {code: 'invalid_client_id'}` — неверный формат заголовка `X-Qwen-Client-Id`.
- `404` — сессия не найдена.

Отмена: **отсутствует в v1**. Маршрут не обрабатывает отключение HTTP-клиента, в мост не передаётся `AbortSignal`, и дочерний процесс ACP выполняет побочный запрос до конца независимо от того, отключился ли вызывающий клиент. Единственные ограничения — таймаут моста в 60 секунд (`SESSION_RECAP_TIMEOUT_MS`) и гонка закрытия транспорта против смерти канала ACP. Это допустимо, так как резюме короткое (одна попытка, `maxOutputTokens: 300`, обычно ~1–5 с); метод расширения отмены на основе идентификатора запроса может реализовать полную сквозную отмену в будущем релизе, если затраты на пропускную способность когда-либо это оправдают.

### Мутация: approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 добавляет четыре маршрута управления мутациями, позволяющие удалённым клиентам изменять состояние выполнения без обращения к CLI хоста демона. Все четыре:

- Защищены **строгим** шлюзом мутации из PR 15. Демон, настроенный без токена bearer, отвечает на них `401 {code: 'token_required'}`. Настройте `--token` (или `QWEN_SERVER_TOKEN`) перед включением.
- Принимают и отмечают заголовок `X-Qwen-Client-Id` (цепочка аудита PR 7). Если заголовок содержит доверенный идентификатор, демон включает `originatorClientId` в соответствующее SSE-событие, чтобы межклиентские UI могли подавить эхо своих собственных мутаций.
- Проверяют по тегу возможности перед открытием функциональности. Старые демоны возвращают `404` для маршрута.

Три из четырёх маршрутов (`tools/:name/enable`, `init`, `mcp/:server/restart`) генерируют события **в масштабах рабочего пространства**: каждая активная SSE-шина сессии получает событие, независимо от того, к какой сессии был прикреплён клиент в момент мутации. `approval-mode` генерирует событие **в масштабах сессии**, так как изменение локально для `Config` одной сессии.
#### `POST /session/:id/approval-mode`

Тег возможности: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Изменяет режим одобрения активной сессии. Новый режим сразу попадает в `Config` дочернего процесса ACP, связанный с этой сессией. По умолчанию настройки НЕ записываются на диск — передайте `persist: true`, чтобы также записать `tools.approvalMode` в настройки рабочей области.

Запрос:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` должен быть одним из `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (отражение перечисления `ApprovalMode` ядра; SDK экспортирует `DAEMON_APPROVAL_MODES` для проверки во время выполнения). `persist` по умолчанию равен `false`.

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

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — неизвестный литерал режима.
- `400 {code: 'invalid_persist_flag'}` — `persist` не является булевым значением.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — запрошенный режим требует доверенную папку (привилегированные режимы в недоверенных рабочих областях отклоняются методом `Config.setApprovalMode` ядра).
- `404` — сессия неизвестна.

SSE-событие (в рамках сессии): `approval_mode_changed` с `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Тег возможности: `workspace_tool_toggle`. Чистый файловый ввод-вывод — нет обхода через ACP.

Переключает имя инструмента в списке `tools.disabled` настроек рабочей области. Инструменты, перечисленные там, **не регистрируются** вообще (в отличие от `permissions.deny`, который оставляет инструмент зарегистрированным и отклоняет вызов). Как встроенные инструменты, так и инструменты, обнаруженные через MCP, проходят через `ToolRegistry.registerTool`, который учитывает набор отключённых.

> ⚠️ **Имена должны точно совпадать с идентификатором, опубликованным реестром.** Псевдонимы не разрешаются — маршрут сохраняет любую строку из параметра пути в `tools.disabled`, а следующий дочерний процесс ACP сравнивает её с `tool.name` во время регистрации. Встроенные инструменты используют канонические имена реестра (в форме snake_case для глагола): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` и т.д. — НЕ отображаемые метки (`Shell`, `Read`, `Write`), которые использует CLI. Инструменты, обнаруженные через MCP, используют квалифицированную форму `mcp__<server>__<name>` (эту же форму транслируют события `tool_toggled` и показывает `GET /workspace/mcp`). Отключение `Bash` НЕ помешает `run_shell_command` зарегистрироваться в следующей сессии.

Живые дочерние процессы ACP сохраняют уже зарегистрированные инструменты — переключение вступает в силу при **следующем** порождении дочернего процесса ACP. Комбинируйте с `POST /workspace/mcp/:server/restart` (для инструментов из MCP) или созданием новой сессии, чтобы изменения вступили в силу в текущем демоне.

Неизвестные имена инструментов принимаются: предварительное отключение ещё не установленного MCP-инструмента — допустимый сценарий использования.

Запрос:

```json
{ "enabled": false }
```

Ответ (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Ошибки:

- `400 {code: 'invalid_tool_name'}` — пустой параметр пути или параметр пути превышает 256 символов.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` отсутствует или не является булевым значением.

SSE-событие (в рамках рабочей области): `tool_toggled` с `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Тег возможности: `workspace_init`. Чистый файловый ввод-вывод — нет обхода через ACP, **нет вызова LLM**.

Создаёт пустой файл `QWEN.md` (или то, что возвращает `getCurrentGeminiMdFilename()` при переопределении с помощью `--memory-file-name`) в корне привязанной рабочей области демона. Только механическое действие — для заполнения содержимого с помощью ИИ используйте `POST /session/:id/prompt`.

По умолчанию отказывается перезаписывать, если целевой файл существует и содержит не-пробельные символы. Файлы, содержащие только пробельные символы, считаются отсутствующими (соответствует локальной команде `/init`).

Запрос:

```json
{ "force": false }
```

Ответ (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` может быть `'created'` (создан заново), `'noop'` (существующий файл с только пробельными символами остался нетронутым — запись не выполнялась) и `'overwrote'` (перезаписан непустой файл при `force: true`). SSE-событие `workspace_initialized` отражает действие ответа — наблюдатели могут фильтровать по `action !== 'noop'`, чтобы реагировать только на реальные изменения на диске.

Ошибки:

- `400 {code: 'invalid_force_flag'}` — `force` не является булевым значением.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — файл существует с не-пробельными символами, а `force` не указан или равен false. Тело ответа содержит абсолютный путь и размер (в байтах), чтобы клиенты SDK могли отобразить запрос "перезаписать N байт?" без повторной проверки состояния.

SSE-событие (в рамках рабочей области): `workspace_initialized` с `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Тег возможности: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Перезапускает настроенный MCP-сервер через дочерний процесс ACP с помощью `McpClientManager.discoverMcpToolsForServer` (отключение + повторное подключение + повторное обнаружение). Предварительно проверяет текущий снимок бюджета (на основе учёта из PR 14 v1), чтобы перезапуск в рабочей области с насыщенным бюджетом возвращал мягкий отказ, а не вызывал каскад ошибок `BudgetExhaustedError`.
Тело запроса пустое (`{}`). Параметр пути — URL-кодированное имя сервера, как оно указано в конфигурации `mcpServers`.

Ответ (200) — discriminated union по полю `restarted`:

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
| `'in_flight'`           | Для этого сервера уже выполняется другое обнаружение / перезапуск. Маршрут возвращается немедленно, не дожидаясь исходного обещания. Вызывающему следует повторить после короткой задержки. |
| `'disabled'`            | Сервер сконфигурирован, но указан в `excludedMcpServers`. Перед перезапуском необходимо включить его. |
| `'budget_would_exceed'` | Демон работает в режиме `--mcp-budget-mode=enforce`, целевой сервер в данный момент не входит в `reservedSlots`, а текущее общее количество достигло `clientBudget`. Вызывающему сначала нужно освободить слот. |

Ошибки (не 2xx):

- `400 {code: 'invalid_server_name'}` — пустой параметр пути.
- `404` — имя сервера отсутствует в конфигурации `mcpServers`, или нет активного ACP-канала (перезапуск по своей природе требует живого экземпляра `McpClientManager`).
- `500` — внутренняя ошибка (например, `ToolRegistry` не инициализирован).

SSE-события (в рамках рабочего пространства): `mcp_server_restarted` с полями `{serverName, durationMs, originatorClientId?}` при успехе; `mcp_server_restart_refused` с полями `{serverName, reason, originatorClientId?}` при мягком пропуске.

### `GET /session/:id/events` (SSE)

Подписка на поток событий сессии.

Заголовки:

```
Accept: text/event-stream
Last-Event-ID: 42        ← необязательно, воспроизводит события после id 42
```

Параметры запроса:

| Параметр    | Обязателен | Примечания                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | нет        | Ограничение **живого бэкалога** на подписчика. Диапазон `[16, 2048]`, по умолчанию 256. Кадры воспроизведения, принудительно отправленные при подписке, не учитываются в этом ограничении; расходуют его только живые события, поступающие, пока подписчик всё ещё обрабатывает большой бэкалог (например, после `Last-Event-ID: 0`). Увеличьте для холодных переподключений, чтобы «хвост» живых событий не вызывал предупреждение о медленном клиенте / его отключение до того, как потребитель догонит. Значения вне диапазона / нечисловые / пустые (при наличии параметра) возвращают `400 invalid_max_queued` до открытия SSE-рукопожатия. Предварительная проверка: `caps.features.slow_client_warning` — старые демоны молча игнорируют этот параметр. |

Формат кадра. Строка `data:` содержит **полный конверт события**, сериализованный в JSON в одну строку — `{id?, v, type, data, originatorClientId?}`. Специфичная для ACP полезная нагрузка (аргументы `sessionUpdate`, `requestPermission` и т.п.) находится внутри поля `data` конверта; собственное поле `type` конверта совпадает со строкой `event:` в SSE.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← каждые 15 с, без полезной нагрузки

event: client_evicted    ← завершающий кадр, без id (синтетический)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Строки SSE `id:` / `event:` дублируют `envelope.id` / `envelope.type` для совместимости с EventSource. Потребители, использующие сырой `fetch` (например, `parseSseStream` в SDK), читают всё из JSON-конверта и игнорируют преамбулы SSE.
| Тип события                  | Триггер                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`            | Любое уведомление ACP `sessionUpdate` (чанки LLM, вызовы инструментов, статистика использования)                                                                                                                                                                                                                           |
| `permission_request`        | Агент запросил одобрение инструмента                                                                                                                                                                                                                                                                                       |
| `permission_resolved`       | Какой-то клиент проголосовал за разрешение через `POST /permission/:requestId`                                                                                                                                                                                                                                              |
| `permission_partial_vote`   | (только при консенсусе) Голос записан, но кворум ещё не достигнут. Содержит `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Проверять через `caps.features.permission_mediation`.                                                                                                              |
| `permission_forbidden`      | Голос отклонён активной политикой (несовпадение `designated`, `local-only` не через loopback, или голосующий не в снапшоте при `consensus`). Содержит `{requestId, sessionId, clientId?, reason}`. Проверять через `caps.features.permission_mediation`.                                                                  |
| `model_switched`            | `POST /session/:id/model` выполнен успешно                                                                                                                                                                                                                                                                                 |
| `model_switch_failed`       | `POST /session/:id/model` отклонён                                                                                                                                                                                                                                                                                          |
| `session_died`              | Дочерний процесс агента неожиданно завершился. **Терминальное: после этого фрейма поток SSE закрывается; сессия исчезает из `byId`.** Подписчикам следует переподключиться через `POST /session`, чтобы создать новую.                                                                                                     |
| `slow_client_warning`       | Локальное для подписчика: очередь заполнена на ≥ 75%. **Нетерминальное** — поток продолжается; предупреждение даётся до вытеснения. Содержит `{queueSize, maxQueued, lastEventId}`. Срабатывает один раз за эпизод переполнения; сбрасывается после того, как очередь опустеет ниже 37,5%. Без `id` (синтетическое). Проверять через `caps.features.slow_client_warning`. |
| `client_evicted`            | Локальное для подписчика: переполнение очереди. **Терминальное: после этого фрейма поток SSE закрывается** (без `id` — синтетическое). Другие подписчики той же сессии продолжают работу.                                                                                                                                   |
| `stream_error`              | Ошибка на стороне демона при развёртывании (fan-out). **Терминальное: после этого фрейма поток SSE закрывается** (без `id` — синтетическое).                                                                                                                                                                                   |

Семантика переподключения:

- Отправляйте `Last-Event-ID: <n>`, чтобы воспроизвести события с `id > n` из кольцевого буфера сессии (глубина по умолчанию **8000**, настраивается через `qwen serve --event-ring-size <n>`)
- **Обнаружение разрыва (на стороне клиента):** если `<n>` старше самого старого события, всё ещё хранящегося в кольце (например, вы переподключаетесь с `Last-Event-ID: 50`, а в кольце сейчас события 200–1199), демон воспроизводит с самого старого доступного события без возникновения ошибки. Сравните `id` первого воспроизведённого события с `n + 1`; любая разница — это размер потерянного окна. На этапе 2 будет добавлен явный синтетический фрейм `stream_gap` на стороне демона; на этапе 1 обнаружение лежит на клиенте.
- Идентификаторы монотонно возрастают в пределах сессии, начиная с 1
- Синтетические фреймы (`client_evicted`, `slow_client_warning`, `stream_error`) намеренно не содержат `id`, чтобы не занимать слоты последовательности для других подписчиков
Обратное давление:

- Очередь на подписчика по умолчанию содержит до `maxQueued: 256` живых элементов (кадры повторного воспроизведения при переподключении не учитываются). Можно переопределить через `?maxQueued=N` (диапазон `[16, 2048]`) в SSE-запросе.
- Когда очередь подписчика заполняется на 75%, шина принудительно отправляет этому подписчику синтетический кадр `slow_client_warning` (один раз за эпизод переполнения; сбрасывается после опустошения ниже 37,5%). Поток остаётся открытым — предупреждение даёт клиенту знать, чтобы он либо быстрее обрабатывал данные, либо отключился и переподключился корректно.
- Если очередь всё же переполняется, шина отправляет терминальный кадр `client_evicted` и закрывает подписку.

### `POST /permission/:requestId`

Отдать голос по ожидающему запросу разрешения (`permission_request`). Активная **политика посредничества** определяет победителя:

| Политика                        | Поведение                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (по умолчанию) | Любой валидированный голосующий выигрывает; последующие голосующие получают `404`. Базовый вариант до F3.                                                                                                                      |
| `designated`                    | Только инициатор запроса (`originatorClientId`) принимает решение; не-инициаторы получают `403 permission_forbidden / designated_mismatch`. Для анонимных запросов возвращается к first-responder.                               |
| `consensus`                     | N из M голосующих должны согласиться (по умолчанию `N = floor(M/2) + 1`, переопределяется через `policy.consensusQuorum`). Первый вариант, набравший `N`, выигрывает. Голоса, не влияющие на решение, получают `200` с SSE-кадром `permission_partial_vote`. |
| `local-only`                    | Только локальные голосующие (loopback) принимают решение; удалённые вызывающие получают `403 permission_forbidden / remote_not_allowed`.                                                                                       |

Активная политика настраивается в `settings.json` в разделе `policy.permissionStrategy` и отображается в `/capabilities` по адресу `body.policy.permission`. Предварительная проверка `caps.features.permission_mediation` (с `modes: [...]`) показывает поддерживаемые сборкой варианты.

> [!note] **F3 (#4175): координация разрешений между несколькими клиентами.** F3 добавил четыре вышеуказанные политики. Демоны до F3 жёстко задавали first-responder; формат проводов (wire shape) остаётся бит-в-бит неизменным, если настроена политика `first-responder`. Новые события (`permission_partial_vote`, `permission_forbidden`) являются аддитивными — старые SDK воспринимают их как `unrecognized_known_event` и корректно игнорируют.

> [!note] **Тайм-аут разрешения (по умолчанию 5 минут).** Запрос `permission_request`
> остаётся в ожидании до тех пор, пока: (a) какой-либо клиент не проголосует здесь, (b) не сработает `POST /session/:id/cancel`,
> (c) не отключится HTTP-клиент, инициировавший запрос
> (отмена на середине запроса решает все ожидающие разрешения как `cancelled`),
> (d) не будет завершена сессия, (e) не остановится демон, **или
> (f) не сработает тайм-аут разрешения для данной сессии** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 минут). При срабатывании тайм-аута метод `requestPermission` агента
> завершается с `{outcome: 'cancelled'}`, в кольцевой журнал аудита записывается
> запись `permission.timeout`, stderr демона выдаёт однострочное
> сообщение, а SSE-шина рассылает стандартный
> кадр `permission_resolved` с состоянием cancelled, чтобы подписчики выполнили очистку.
> Тайм-аут настраивается через `BridgeOptions.permissionResponseTimeoutMs`;
> headless-вызывающие, работающие с длинными запросами, могут захотеть его увеличить.

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

- `{ "outcome": "selected", "optionId": "<один-из-вариантов>" }` — принять / отклонить / выполнить один раз и т.д., в зависимости от предложенных агентом вариантов.
- `{ "outcome": "cancelled" }` — отменить запрос (соответствует тому, что делают `cancelSession` / `shutdown` внутри).

Ответ:

- `200 {}` — ваш голос принят (решение принято ИЛИ записано для достижения кворума при консенсусе).
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: активная политика отклонила ваш голос.
- `404 { "error": "..." }` — requestId неизвестен (уже разрешён, никогда не существовал или сессия завершена).
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: `allowedOptionIds` агента содержит зарезервированный сентинел `'__cancelled__'`; нарушение контракта агент/демон.
- `501 { "code": "permission_policy_not_implemented", "policy": "<имя>" }` — F3 для обратной совместимости: в схему добавлена литера политики, но её ветка посредника ещё не реализована (в настоящее время недостижимо; зарезервировано для будущих политик).

После успешного голосования каждый подключённый клиент видит `permission_resolved` с тем же `requestId` и выбранным `outcome`. При режиме `consensus` промежуточные голоса дополнительно рассылают `permission_partial_vote` до достижения кворума.
### Маршруты авторизации через device-flow (issue #4175 PR 21)

Демон организует предоставление авторизации устройства OAuth 2.0 (RFC 8628), чтобы удаленный SDK-клиент мог инициировать вход, после чего токены оказываются на файловой системе **демона**, а не на клиенте. Демон сам опрашивает IdP; единственная задача клиента — отобразить URL для проверки и код пользователя и (опционально) подписаться на SSE для получения событий о завершении.

Тег возможности: `auth_device_flow` (всегда объявляется). Поддерживаемые провайдеры в
v1: `qwen-oauth`.

> [!note]
>
> Бесплатный тариф Qwen OAuth был отключен 2026-04-15. Считайте `qwen-oauth` устаревшим
> идентификатором провайдера v1 в этом протоколе; новые клиенты должны предпочитать
> текущий поддерживаемый провайдер аутентификации, если он доступен.

**Локальность выполнения.** Демон никогда не запускает браузер — даже если может. Клиент решает, вызывать ли `open(verificationUri)` локально; на безголовом поде (каноническое развертывание Mode B) пользователь открывает URL на том устройстве, где у него есть браузер. См. `docs/users/qwen-serve.md` с рекомендуемым пользовательским опытом.

**Токены не просачиваются в события.** `auth_device_flow_started` содержит только `{deviceFlowId, providerId, expiresAt}`. Код пользователя и URL для проверки возвращаются напрямую в теле ответа POST 201 и через `GET /workspace/auth/device-flow/:id`; они никогда не транслируются через SSE.

**Синглтон на провайдера.** Второй `POST` для того же провайдера, пока поток ожидает, является идемпотентным перехватом — он возвращает существующую запись с `attached: true` вместо запуска нового запроса к IdP.

#### `POST /workspace/auth/device-flow`

Строгий шлюз изменений: требует токен-носитель даже для настроек loopback без токена (`401 token_required`).

Запрос:

```json
{ "providerId": "qwen-oauth" }
```

Ответ (`201` новый запуск, `200` идемпотентный перехват):

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

- `400 unsupported_provider` — неизвестный `providerId` (в ответе также `supportedProviders`)
- `409 too_many_active_flows` — достигнут лимит рабочего пространства (4); отмените один с помощью `DELETE`
- `401 token_required` — строгий шлюз отклонил запрос без токена
- `502 upstream_error` — IdP вернул неожиданную ошибку

#### `GET /workspace/auth/device-flow/:id`

Чтение текущего состояния. Ожидающие записи возвращают `userCode/verificationUri/expiresAt/intervalMs`; терминальные записи (5-минутный льготный период) удаляют их и показывают `status` + опциональные `errorKind/hint`.

Возвращает `404 device_flow_not_found` для неизвестных идентификаторов и записей, вытесненных после льготного периода.

#### `DELETE /workspace/auth/device-flow/:id`

Идемпотентная отмена:

- ожидающая запись → `204` + выпускает `auth_device_flow_cancelled`
- терминальная запись → `204` бездействие (событие не выпускается повторно)
- неизвестный идентификатор → `404`

#### `GET /workspace/auth/status`

Снимок ожидающих потоков + поддерживаемые провайдеры:

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

Пять типизированных событий (в рамках рабочего пространства, распространяемые на каждую активную сессионную шину):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST успешно завершен; SDK должен подписаться (здесь нет userCode, при необходимости получите его через GET)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — демон выполнил upstream `slow_down`; клиенты, опрашивающие GET, должны увеличить свой интервал, чтобы соответствовать
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — учетные данные сохранены; `accountAlias` — это метка, не являющаяся PII (никогда не email/phone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — терминальное событие; `errorKind` — одно из `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` — внутренняя ошибка демона: обмен с IdP прошел успешно, но демон не смог надежно сохранить учетные данные (EACCES / EROFS / ENOSPC). Пользователь должен повторить попытку после устранения проблемы с диском.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE успешно выполнен для ожидающей записи

> **Не совместимо с MCP.** Спецификация авторизации MCP (2025-06-18) требует OAuth 2.1 + PKCE с кодом авторизации и обратным вызовом перенаправления, что не работает для демонов на безголовых подах. Поверхность device-flow режима B является частной для демона — клиенты, ориентированные на MCP-совместимые серверы, должны использовать другой путь аутентификации.

## Формат потоковой передачи на проводе

События отправляются как стандартные кадры EventSource. Демон записывает одну строку `data:` на кадр (JSON не содержит встроенных символов новой строки после `JSON.stringify`); парсер SDK в `packages/sdk-typescript/src/daemon/sse.ts` обрабатывает как это, так и разрешенную спецификацией форму multi-`data:` на стороне приема.
## Фреймы ошибок при потоковой передаче

Если итератор моста выбрасывает исключение при обслуживании подписчика SSE, демон отправляет терминальный фрейм `stream_error` (без `id`). Строка `data:` содержит полный конверт (той же формы, что и любой другой SSE-фрейм в этом документе); фактическое сообщение об ошибке находится в `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<сообщение>"}}
```

После этого соединение закрывается.

## Переменные окружения

| Переменная           | Назначение                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`  | Bearer-токен. При запуске удаляются начальные и конечные пробелы.          |

## Структура исходного кода

| Путь                                                     | Назначение                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                     | yargs-команда + схема флагов                                                                               |
| `packages/cli/src/serve/run-qwen-serve.ts`               | жизненный цикл слушателя + обработка сигналов                                                              |
| `packages/cli/src/serve/server.ts`                       | маршруты Express + промежуточное ПО                                                                        |
| `packages/cli/src/serve/auth.ts`                         | Bearer + белый список хостов + запрет CORS                                                                 |
| `packages/cli/src/serve/httpAcpBridge.ts`                | запуск/подключение + FIFO на сессию + реестр разрешений                                                    |
| `packages/cli/src/serve/status.ts`                       | типы проводов статуса демона (только чтение) + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`                 | чистая вспомогательная функция, строящая полезные нагрузки `/workspace/env` из состояния `process.*`, включая редактирование учётных данных |
| `packages/acp-bridge/src/eventBus.ts`                    | ограниченная асинхронная очередь + кольцо воспроизведения                                                  |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`     | TS-клиент                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`              | парсер фреймов EventSource                                                                                 |
| `integration-tests/cli/qwen-serve-routes.test.ts`       | 18 кейсов, без LLM                                                                                         |
| `integration-tests/cli/qwen-serve-streaming.test.ts`   | 3 кейса, реальный дочерний процесс `qwen --acp` на основе локального фейкового сервера OpenAI (только POSIX; пропускается на Windows) |
