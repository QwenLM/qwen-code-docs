# Справочник по REST API демона

Это публичный REST/SSE-интерфейс для интеграций, которые запускают
`qwen serve --no-web` и предоставляют собственный UI. Начните с
[руководства по интеграции](./rest-api-integration.md), затем используйте эту страницу
для обнаружения эндпоинтов, а [справочник по протоколу HTTP](./qwen-serve-protocol.md) —
для подробной семантики жизненного цикла.

## OpenAPI

Курируемый контракт из 25 операций доступен в формате
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json).
Импортируйте этот URL в OpenAPI-совместимый рендерер, генератор клиентов или
инструмент валидации. Зафиксированный JSON является переносимым контрактом
интерфейса для проиндексированных ниже операций и проверяется на соответствие
руководству, заголовкам протокола и зарегистрированным маршрутам в CI.

Этот индекс охватывает курируемое базовое подмножество REST-поверхности демона,
а не всю её целиком.
За его пределами остаются маршруты Web Shell от первого лица, условные внутренние
поверхности и другие публичные, но не базовые маршруты: мутация файлов,
регистрация рабочих пространств, организация и генерация сессий, а также MCP
рабочих пространств, навыки и провайдеры. Эти поверхности объявляются
собственными тегами возможностей (capability);
[справочник по протоколу HTTP](./qwen-serve-protocol.md) описывает поверхности
сессий, статусов рабочих пространств и файлов, а управление MCP-серверами,
провайдеры аутентификации и вход через device-flow описаны в
[заметках по аутентификации и безопасности демона](./daemon/12-auth-security.md).
Они находятся за рамками данного контракта, а не устарели.

## Чтение индекса

- **Capability** — тег функции для проверки в `GET /capabilities`. Тире
  означает, что у операции нет выделенного тега функции; клиенты, которым нужна
  поддержка старых сборок демона, должны обрабатывать `404`.
- **Scope** указывает, какой runtime владеет операцией. `process-global` читает
  состояние демона в целом, `selected-runtime` использует выбор рабочего
  пространства из запроса, `persisted-workspace` разрешает сохранённое хранилище
  сессий, `live-session-owner` маршрутизирует по активной сессии, а
  `legacy-primary` всегда нацелен на основное рабочее пространство демона.
  `GET /session/:id/export` привязан к основному рабочему пространству: он
  разрешает только управляемые внутренние runtime, прежде чем вернуться к
  основному рабочему пространству.
- Все операции в этом индексе являются **стабильными** в контракте REST v1.
  Устаревшее имя возможности (capability) `unstable_session_resume` — только
  алиас; используйте `session_resume` для стабильного маршрута возобновления.

## Обнаружение

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Жизненный цикл сессии

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Промпты и события

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt` возвращает `202`, когда промпт поступает в очередь, а
не когда Агент завершает работу. Сначала подпишитесь, затем сопоставляйте
`turn_complete` или `turn_error` по `promptId`.

## Разрешения

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Новые интеграции с несколькими рабочими пространствами всегда должны использовать
маршрут с областью действия сессии. Устаревший маршрут может вернуть тот же
`404` для запроса, принадлежащего другому runtime, как и для уже разрешённого
голосования.

## Контекст рабочего пространства только для чтения

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Эти единичные маршруты нацелены на основное рабочее пространство. Интеграции,
предоставляющие доступ к нескольким зарегистрированным рабочим пространствам,
должны использовать квалифицированные по рабочему пространству аналоги,
описанные в полном протоколе и preflight `workspace_qualified_rest_core`.

## Общие правила протокола

- Аутентифицируйте обычные маршруты с помощью `Authorization: Bearer <token>`.
  Стандартный loopback-зонд `/health` может быть освобождён; привязки не к
  loopback не освобождаются.
- Отправляйте `X-Qwen-Client-Id`, если ответ create/load предоставил его. Это
  идентификатор привязки и атрибуции, а не принципал безопасности конечного
  пользователя.
- Рассматривайте тела ошибок как дополнения. Ветвитесь преимущественно по
  HTTP-статусу и стабильным `code` или `errorKind`, если они присутствуют.
- Сохраняйте заголовки ответов SSE и отключайте буферизацию прокси. Возобновляйте
  с помощью `Last-Event-ID` и `X-Qwen-Event-Epoch`, если демон предоставил
  эпоху.
- Граница доверия рабочего пространства — это не изоляция арендаторов. Запускайте
  отдельные демоны, когда принципалы безопасности или границы сбоев на уровне
  процессов должны быть независимы.