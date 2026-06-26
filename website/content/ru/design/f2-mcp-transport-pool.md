# F2: Общий пул транспортных соединений MCP — Дизайн v2.2

> Целевая ветка: `daemon_mode_b_main` (согласно стратегии ветвления #4175). Заменяет PR 23 волны 5 (#4175).
> **Единый PR** в соответствии с рекомендациями мейнтейнера по функционально-связанным пакетам (19.05.2026).
> Автор: doudouOUC. Дата: 20.05.2026. Редакция: 20.05.2026 (v2.2 — включение результатов ревью).

---

## 0. История изменений

### v2.2 (20.05.2026) — Реализация PR #4336 + 32 исправления по результатам ревью

PR #4336 поставил F2 как 6 атомарных коммитов + 6 исправляющих коммитов за ~4 часа. Wenshao рецензировал совокупно в 3 партии; каждая партия порождала инлайн-замечания + критические исправления, которые были влиты обратно. Таблица ниже фиксирует изменения относительно v2.1, сгруппированные по партиям ревью.

#### v2.1 → первая партия ревью (коммиты 1–4, wenshao C1–C7 + S1–S4)

| #   | Место                                                       | Что было не так                                                                                                                                                                        | Коммит с исправлением |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| C1  | `acpAgent.ts:269` — путь закрытия через IDE                 | Очистка пула выполнялась только в обработчике SIGTERM; нормальное закрытие, инициированное IDE, оставляло записи до тех пор, пока их не обработает ОС. Зеркалировать очистку пула из SIGTERM при `await connection.closed` | `ae0b296c4`       |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` сбрасывал `maxIdleTimer` при каждом переключении состояния, нарушая жесткое ограничение из §6.3. Теперь очищает только `drainTimer`; max-idle сохраняется на всё время жизни записи | `ae0b296c4`       |
| C3  | `mcp-pool-entry.ts:doRestart`                              | Неудачное переподключение оставляло запись в зомби-состоянии (`localStatus=CONNECTED`, `state='active'`, устаревший снимок). Добавлен try/catch + переход в `'failed'` при ошибке       | `ae0b296c4`       |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` устанавливался ПОСЛЕ await, поэтому параллельный `acquire` мог увидеть `'active'` и выдать устаревшее соединение. Устанавливается синхронно в начале                   | `ae0b296c4`       |
| C5  | `mcp-transport-pool.ts:drainAll`                           | Параллельный `acquire` мог породить новую запись в середине очистки. Добавлен флаг-мьютекс `draining` + `await Promise.allSettled(spawnInFlight)` перед очисткой                         | `ae0b296c4`       |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | Слушатель не фильтровался по `serverName`; каждая запись получала уведомления о статусе всех серверов, а также собственная запись при `markActive` зацикливалась                         | `ae0b296c4`       |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | Шлюз режима пула был добавлен в `discoverAllMcpTools`, но не в `Incremental` — `/mcp refresh` обходил пул, создавая отдельный клиент для каждой сессии                                    | `ae0b296c4`       |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | В документации не указано, что `excludeTools` использует прямое равенство (без поддержки скобок); расхождение с `mcp-client.ts:isEnabled`                                                | `ae0b296c4`       |
| S2  | `pid-descendants.ts` docstring                             | Утверждалось существование ветки с `taskkill /F` для Windows, которой не было — Node заменяет `process.kill('SIGTERM')` на `TerminateProcess`                                           | `ae0b296c4`       |
| S3  | `session-mcp-view.ts:applyTools` отладочный лог            | Строка содержала литерал `"N"` вместо интерполяции — операторы видели `применено 12 инструментов (отфильтровано до N зарегистрированных)`                                               | `ae0b296c4`       |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` колбэк статуса | Жёстко задан `() => CONNECTED`, поэтому `aggregateStatusByName` врал после отключения. Теперь `() => client.getStatus()`                                                          | `ae0b296c4`       |

#### Саморецензия на коммит 5 (R1–R3, мелкие)

| #   | Место                                            | Что было не так                                                                                                                                                                        | Коммит с исправлением |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R1  | `server.test.ts:918` обёртка `/capabilities`     | Тест проверял `getAdvertisedServeFeatures()` (без переключателей), но server.ts передаёт `mcpPoolActive: opts.mcpPoolActive !== false` (включено по умолчанию). Исправить переключатель | `3e68c00bc`       |
| R2  | `server.test.ts` тест покрытия для умолчаний     | Не было теста с настройками по умолчанию для проверки рекламы тегов пула. Добавлен явный тест с `mcpPoolActive: false`                                                                  | `3e68c00bc`       |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`    | В документации сказано, что SDK до PR "увидят новое значение как неизвестное и отобразят обобщённо" — на самом деле `MCP_RESTART_REFUSED_REASONS.has(...)` отвергает → молчаливый сброс | `3e68c00bc`       |

#### Вторая партия ревью (коммиты 1–5, wenshao R1–R10)

| #   | Место                                                | Что было не так                                                                                                                                                                                    | Коммит с исправлением |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | Исправление C2 корректно сохраняло `maxIdleTimer` при переключениях, но срабатывание принудительно закрывало запись независимо от `refs.size`. Активная сессия с переподключением внутри льготного периода теряла инструменты через 5 мин | `72399f109`       |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + повторное получение ВСЕХ при каждом проходе оставляло краткое окно без зарегистрированных MCP-инструментов И перезапускало каждый таймер слива. Расхождение с желаемым `(name, fingerprint)` | `72399f109`       |
| WR3 | `mcp-pool-entry.ts:doRestart` рассылка снимков      | Перезапуск обновлял `toolsSnapshot`/`promptsSnapshot` и отправлял типизированные события — но ни один экземпляр `SessionMcpView` не был подписан на этот поток. Итерировать по `subscribers` напрямую после снимка | `72399f109`       |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | Считал websocket-соединения как `subprocessCount` — websocket подключается удалённо, без локального дочернего процесса. Ограничено только `'stdio'`                                                | `72399f109`       |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | `${pid}` интерполировался напрямую в строку `-Filter`. Входная проверка `Number.isInteger` предотвращает инъекцию сегодня; привязать к `$p` для защиты в будущем при ослаблении проверок             | `72399f109`       |
| WR6 | `mcp-pool-entry.ts` ctor поле `cfg`                 | `readonly cfg: MCPServerConfig` был неявно публичным, раскрывая API-ключи, заголовки аутентификации и OAuth-поля. Сделано `private`; добавлен геттер `transportKind` для единственного внешнего читателя | `72399f109`       |
| WR7 | `mcp-pool-events.ts` преждевременные экспорты      | 5 сторожей типов PoolEvent + реэкспорт `Prompt` + `PoolEntryConnectionStatus` не имели ни одного вызова. Удалены; оставлен `MCPCallInterruptedError` (требование дизайна §13.4)                    | `72399f109`       |
| WR8 | `acpAgent.ts:269,300` дублирование очистки пула    | Обработчики SIGTERM и закрытия IDE имели идентичные блоки `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`. Вынесен вспомогательный метод `drainPoolBeforeExit(label)`       | `72399f109`       |

#### Саморецензия на коммит 6 (R1–R3 — критические гонки)

| #   | Место                                    | Что было не так                                                                                                                                                                                         | Коммит с исправлением |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Гонка при освобождении слота: A завершает порождение, B (другой fingerprint, то же имя) начинает порождение, A сливается. В колбэке закрытия проверялись только `entries` (B ещё не зарегистрирован) → преждевременное освобождение | `0e58a098f`       |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | События рабочей области отправляются N сессиям → N увеличений в редьюсере; потребители, агрегирующие по сессиям, удваивают счётчик. Исправлена документация с указанием множителя                                | `0e58a098f`       |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Итерация по `this.sessions.keys()` напрямую во время асинхронной рассылки; параллельный `killSession` мог повредить итератор. Снятие снимка через `Array.from(...)`                                         | `0e58a098f`       |

#### Третья партия ревью (коммиты 1–6, wenshao W1–W15)

| #   | Место                                                           | Что было не так                                                                                                                                                                                          | Коммит с исправлением |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | Ошибка порождения навсегда оставляла `statusChangeListener` — удаляется только в `forceShutdown`. Добавлен `entry.forceShutdown('manual')` в catch                                                          | `4a3c5cd90`       |
| W2  | `mcp-pool-entry.ts:statusChangeListener` перекрёстная проверка | Глобальная карта `serverStatuses` общая для записей с разными отпечатками. Транспортная ошибка A записывала DISCONNECTED, слушатель B повреждал `localStatus` для B. Добавлена проверка `client.getStatus()` | `4a3c5cd90`       |
| W3  | `mcp-pool-entry.ts:doRestart` чистка PID                      | Перезапуск пропускал `listDescendantPids` + `sigtermPids` — каждый перезапуск обёрнутых `npx`/`uvx` stdio-процессов оставлял сиротой реальный дочерний MCP-процесс. Добавлена очистка перед отключением      | `4a3c5cd90`       |
| W4  | `mcp-pool-entry.ts:doRestart` гонка с таймером слива          | Таймер слива мог сработать во время ожидания в перезапуске → `forceShutdown` удаляет запись → `client.connect` порождает сироту. Добавлены `cancelDrainTimer` + переход `state→active` в начале `doRestart` | `4a3c5cd90`       |
| W5  | `mcp-client-manager.ts:pooledConnections` мёртвые дескрипторы | Когда запись переходила в `'failed'`, менеджер хранил мёртвый `PooledConnection` навсегда. Подписаться на события записи; удалять при `'failed'` (идемпотентно через проверку `get(name) === conn`)         | `4a3c5cd90`       |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` повторный вход | Два чередующихся прохода могли оба вызвать `set(name, conn)` → первое соединение утекало. Добавлен мьютекс `discoveryInFlight`; второй вызывающий ждёт того же обещания. Новый регрессионный тест               | `4a3c5cd90`       |
| W9  | `acpAgent.ts:parsePoolDrainMs` строгость                      | `Number.parseInt` принимал `'30000ms'` / `'30000abc'`. Строгое регулярное выражение `^\d+$`; отклонять с предупреждением в stderr и запасным значением по умолчанию                                         | `4a3c5cd90`       |
| W10 | `mcp-transport-pool.ts:acquire` порядок indexAttach           | `indexAttach` изменял `sessionToEntries` ДО `entry.attach()`. Если `attach` выбрасывал, оставалось устаревшее обратное отображение. Перемещён `indexAttach` после успешного `attach` (оба пути: быстрый и в процессе) | `4a3c5cd90`       |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                 | В документации всё ещё указано `stdio + websocket` после ограничения WR4 только stdio. Обновлено                                                                                                           | `4a3c5cd90`       |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch        | Такая же утечка `statusChangeListener`, как в W1, но в пути без пула. Такое же зеркало: `forceShutdown` перед отключением                                                                                  | `4a3c5cd90`       |
| W15 | `bridge.ts:restartMcpServer` ответ                            | Приведение `as PoolEntries` было ненадёжным — нетипизированный JSON от дочернего процесса ACP. Добавлены проверки `Array.isArray` + проверка формы каждой записи; некорректные записи пропускаются с сообщением в stderr | `4a3c5cd90`       |

#### Отклонено с ответом (оформлено как последующие правки F2)

| #   | Место                                                | Причина отклонения                                                                                                                                                                   |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W7  | Пробелы в тестовом покрытии (4 некритичных пути)     | 1/4 добавлен (регрессионный тест W6); остальное отложено в отдельный PR по тестовому покрытию после слияния серии F2                                                                 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` не используются | Заглушки обратной совместимости для отложенного переподключения на основе монитора здоровья (дизайн §6.6); удаление и повторное добавление создаёт нестабильность публичного типа       |
| W11 | Дублирование блоков attach для быстрого пути и пути в процессе | ✅ Сделано в PR A: `attachPooledSession` + `rollbackReservationOnSpawnFailure` приватные вспомогательные методы (коммит `2d546efca`)                                                 |
| W12 | `passesSessionFilter` O(M×N) за каждый `applyTools`  | ✅ Сделано в PR A: `applyTools` / `applyPrompts` предвычисляют множества фильтров `Set` один раз за проход; предикат становится O(1) на инструмент (коммит `a4a855ab3`)               |
| R9  | `McpClientManager` конструктор с 7 позиционными сторожевыми | ✅ Сделано в PR A: конструктор на основе объекта опций + тестовая фабрика `mkManager` (коммит `0cb1eaa27`)                                                                           |
| R10 | Стоимость `pgrep -P <pid>` на каждый PID и уровень   | ✅ Сделано в PR A: один снимок `ps -A -o pid=,ppid=` + BFS-обход в памяти; pgrep BFS сохранён как запасной вариант для BusyBox <v1.28 / distroless (коммит приземляется как последняя часть PR A) |

#### Количество ошибок

- **3 партии × 27 критических / важных исправлений** + 5 исправлений документации / предложений = **всего 32 правки по результатам ревью**
- **2 критические гонки, обнаруженные только при повторном просмотре** (6R1 гонка освобождения слота во время порождения; W6 повторный вход в discovery)
- **0 неявных сбоев, попавших в поставку** — каждое исправление содержит инлайн-комментарий `// F2 (#4175 commit X review fix — wenshao YN):`, указывающий на исходное ревью

### v2.1 (20.05.2026) — стратегия единого PR + 12 правок по ревью

| #       | Что                                                                                                                       | Почему                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| V21-1   | Переход от плана 6 под-PR к **единому функционально-связанному PR** с 6 атомарными коммитами                               | Согласно рекомендациям мейнтейнера (стратегия ветвления #4175); рецензент может читать коммит за коммитом через `git log -p` |
| V21-2   | Добавлен обратный индекс `sessionToEntries: Map<sid, Set<ConnectionId>>` в пул (§6)                                       | `releaseSession` O(N записей) → O(ссылок сессии); необходим для масштаба 1000 сессий                                         |
| V21-3   | Параметр запроса `?fingerprint=` на маршруте перезапуска (§13.1)                                                           | Оператор может захотеть перезапустить только одну запись, когда одно имя имеет несколько отпечатков; добавить сейчас почти бесплатно |
| V21-4   | Путь сбоя порождения явно освобождает зарезервированный слот (§6.1, §6.5)                                                  | Иначе слоты утекают до следующего прохода монитора здоровья; тонкая реальная ошибка                                          |
| V21-5   | Новый §13.4: семантика вызова инструмента в полёте во время переподключения                                                | `MCPCallInterruptedError`; пул НЕ повторяет вызов (запись небезопасна)                                                      |
| V21-6   | Новый §10.4: `/mcp disable X` запускает повторное применение `SessionMcpView`                                             | Иначе отключение в середине сессии не убирает уже зарегистрированные инструменты                                             |
| V21-7   | Маршрут статуса показывает `entryIndex`, а не сырой отпечаток (§8.3)                                                      | Избегает побочного канала утечки ротации OAuth-токенов через изменение отпечатка                                           |
| V21-8   | Спецификация отката при переподключении: stdio фиксированно 5с × 3, HTTP/SSE экспоненциально 1/2/4/8/16с × 5 (§6.6)      | В v2 не было; HTTP нужен более долгий бюджет повторных попыток для сетевых проблем                                            |
| V21-9   | `canonicalOAuth(o)` нормализует `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                                          | Иначе функционально эквивалентные конфигурации дают разные записи                                                           |
| V21-10  | Переименован вспомогательный метод отката пула с "устаревший внутрипроцессный acquire" в `createUnpooledConnection` (§5.3, §6.1) | Обход SDK MCP постоянный, а не устаревший                                                                                   |
| V21-11  | `drainAll(opts?)` возвращает `Promise<void>` с бюджетом времени `timeoutMs` (§17)                                         | Вызывающему нужно знать, когда завершится очистка для порядка завершения работы                                              |
| V21-12  | Зафиксированы имена полей редьюсера SDK (Q1 решено): оставить `mcpBudgetWarningCount` и т.д. с семантикой области в JSDoc  | Никакого переименования в публичном API в середине PR                                                                       |
| V21-13  | Зафиксированы Q3 (пул включён по умолчанию, `<->--no-mcp-pool` аварийный выключатель), Q4 (HTTP/SSE по желанию), Q6 (жадное создание) | Единый PR; переключение флага не требуется                                                                                  |
| V21-14  | Добавлены риски R9/R10/R11 для единого PR (§23)                                                                           | Усталость ревью, конфликт слияния в daemon_mode_b_main, время CI                                                            |
| V21-15  | Обработка сиротских записей при удалении расширения отложена до естественного освобождения по `MAX_IDLE_MS` (§16.3)        | Нет явного `invalidateByExtension`; модель остаётся единообразной                                                            |

### v2 (20.05.2026) — начальные правки ревью из черновика v1

| #   | Что                                                                                                                              | Почему                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| C1  | Пул рассылает **инструменты + подсказки** (раньше: только инструменты)                                                           | `McpClient` конструктор принимает оба регистра; иначе подсказки молча теряются в режиме пула                |
| C2  | Новый раздел о **сосуществовании глобального состояния** (`serverStatuses` / `mcpServerRequiresOAuth` модульные карты)           | Совместное использование между сессиями уже существует сегодня; пул наследует и формализует                |
| C3  | Фабричный путь `connectToMcpServer` **объединён** с классом `McpClient` в F2-1                                                   | v1 реорганизовал только класс; остался бы параллельный непул-путь                                         |
| C4  | Воспроизведение снимка при присоединении (стиль earlyEvents) добавлено в `PoolEntry.attach()`                                    | Новая гонка: сессия B присоединяется → сервер отправляет `tools/list_changed` до установки подписки       |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` для дедупликации параллельных acquire                                     | v1 упоминалось в матрице тестов, но отсутствовало в контракте реализации                                  |
| C6  | Кроссплатформенная очистка дочерних PID (Linux/macOS pgrep, Windows wmic/PowerShell)                                              | v1 говорил "скопировать `pgrep -P` из opencode" — это только Unix                                          |
| C7  | Поле `trust` для каждой сессии — **копия** объекта инструмента                                                                   | trust живёт на `DiscoveredMCPTool`; совместно используемый экземпляр смешал бы trust разных сессий        |
| C8  | Транспорты HTTP/SSE **по желанию** для пула (по умолчанию: stdio + websocket)                                                    | Некоторые MCP HTTP-серверы поддерживают состояние сессии на транспорт; совместное использование рискует утечкой состояния |
| C9  | SD К MCP-сервер (`isSdkMcpServerConfig`) явно обходится                                                                          | `sendSdkMcpMessage` по замыслу для каждой сессии отдельно                                                  |
| C10 | Путь с OAuth явно **отложен до F3**                                                                                              | Поток OAuth требует маршрутизации в стиле PermissionMediator; это не входит в рамки F2                    |
| C11 | Спецификация семантики маршрута перезапуска (имя → все соответствующие записи)                                                    | PR 17 `POST /workspace/mcp/:server/restart` ранее был однозначен (1 запись); теперь 1…N                   |
| C12 | Раздел рефакторинга маршрута статуса (новый путь: `QwenAgent.getMcpPoolAccounting()`)                                            | `httpAcpBridge.ts:733-770` сейчас читает менеджер начальной сессии — необходимо изменить                  |
| C13 | Счётчик поколений на `PoolEntry` для защиты обработчика устаревшего `tools/list_changed`                                         | Шаблон opencode: `if (s.clients[name] !== client) return`                                                 |
| C14 | Разбивка под-PR с 4 → **6**                                                                                                     | v1 недооценил; A2/B1/B3/C6 каждый добавляет реальную работу                                               |
| C15 | Ленивое создание пула (только при N≥2 сессиях) — опционально                                                                     | `qwen serve --foreground` с одной сессией не выигрывает; экономит затраты на инициализацию                |
---

## 1. Цели / Не-цели

**Цели**

- N сессий в 1 рабочей области, разделяющих 1 процесс на уникальную конфигурацию сервера — ключ по отпечатку (fingerprint)
- Представления `ToolRegistry` / `PromptRegistry` для каждой сессии сохраняются (фильтрация, доверие)
- Refcount + жизненный цикл с плавным дрейн-ом, устойчивый к повторному подключению
- Очистка дочерних PID-ов на всех платформах
- Бюджетные guardrails переходят с уровня сессии на уровень рабочей области (это было обещано в PR 14)
- Обратная совместимость с не-демонным standalone qwen (пул там не создаётся)

**Не-цели (рамки F2)**

- Кросс-воркспейс пулинг (1 демон = 1 workspace, инвариант из PR #4113 остаётся)
- Крос-демонный пулинг (выходит за рамки — территория многопроцессного оркестратора)
- Переработка маршрутизации OAuth (F3 с `PermissionMediator`)
- Персистентность пула после перезапуска демона (только in-memory)
- Автоопределение «пуль-безопасных» HTTP-серверов (только opt-in флаг)
- Живое сравнение `MCPServerConfig` для изменения записей на месте (изменение конфига → новая запись, старая уходит в дрейн)

---

## 2. Текущее состояние (цель замены)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Карта связей (что нужно разорвать или протянуть):**

| Связь                                                                             | Расположение                                       | Действие в F2                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Конструктор `McpClient` привязывает 1 `ToolRegistry` + 1 `PromptRegistry`        | mcp-client.ts:106-119                              | Пул владеет транспортом; `SessionMcpView` (на сессию) владеет регистрами на сессию      |
| `McpClient.discover()` вызывает `toolRegistry.registerTool()` на месте           | mcp-client.ts:178-198                              | Разделить: `discoverAndReturn()` возвращает снимок; view регистрирует                   |
| Обработчик `ListRootsRequestSchema` замыкается на `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Контекст пула, привязанный к одной workspace                                            |
| `workspaceContext.onDirectoriesChanged` слушатель регистрируется на каждое подключение | mcp-client.ts:907                                 | Пул регистрируется один раз на запись                                                   |
| `McpClientManager` создаётся внутри `ToolRegistry`                                | tool-registry.ts:199                              | Добавить опциональный параметр `pool?` в конструктор; инъекция из `Config`              |
| Бюджет применяется на сессию                                                     | mcp-client-manager.ts:91-95 comment                | Перенести конечный автомат в пул                                                        |
| `serverDiscoveryPromises` дедуплицирует в полёте на сервер                        | mcp-client-manager.ts:350                         | У пула есть `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                      |
| `setMcpBudgetEventCallback` регистрируется на сессию                              | acpAgent.ts:1851-1899                             | Пул испускает → `QwenAgent` транслирует всем сессиям                                    |

**Уже разделяемое состояние (пул наследует, не вводит):**

| Состояние                                    | Расположение                        | Примечание                                                     |
| -------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292 (модульный уровень) | Сегодня общепроцессное; пул всё ещё по имени → «любой-CONNECTED-побеждает» |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302 (модульный уровень) | То же самое                                                     |
| `MCPOAuthTokenStorage` токены на диске        | `~/.qwen/mcp-oauth/<name>.json`      | Доступны для демона; пул просто использует эффективнее          |

---

## 3. Референтные находки

| Проект          | Пул?              | Ключ                                           | Жизненный цикл                                                                            | Паттерны для заимствования                                                                                                             |
| --------------- | ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | Нет, на процесс    | `name + JSON.stringify(cfg)` (lodash.memoize) | `clearServerCache` + удаленная задержка×5; stdio сбой → `failed`                          | SHA-256 с сортированным ключом `hashMcpConfig` для инвалидации/ключения                                                                 |
| **opencode**    | Да, на workspace   | **только имя сервера** (без хеша конфига)      | Нет refcount / нет вытеснения / нет перезапуска; финализатор Effect + `pgrep -P` рекурсивный SIGTERM | Обход дочерних PID-ов, защита устаревшего обработчика (`if (s.clients[name] !== client) return`), `tools/list_changed` через event bus |

**Что F2 наследует от каждого:** хеш конфига от claude-code (обрабатывает расхождения env/auth между сессиями, чего нет у opencode), обход дочерних PID-ов от opencode (npx/uvx обёртки текут). Что мы добавляем: refcount + дрейн (многоклиентский демон), авто-перезапуск (долгоживущий демон), рассылку prompt-ов, защиту поколения (generation guard).

---

## 4. Архитектура

### 4.1 Схема процессов

```
HTTP-демон (packages/cli/src/serve, qwen serve)
  │ порождает
  ▼
Дочерний ACP (qwen --acp, один процесс на workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── новый, в рамках workspace, 1 экземпляр
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (привязан к workspace демона)
  │     └── budget guardrails (конечный автомат из PR 14, переведён на workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool внедрён   │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   устаревший внутрипроцессный
                                  → SessionMcpView            (standalone qwen)
                                    .applyTools/Prompts
                                    (фильтрация + регистрация
                                     в собственных регистрах сессии)
```

**Пул живёт в дочернем процессе ACP**, не в HTTP-демоне. HTTP-демон запрашивает состояние пула через существующую поверхность extMethod `bridge.client` (`getMcpPoolAccounting`, `restartMcpServer`). Код F2 лежит в **`packages/core/src/tools/`** (рядом с `mcp-client-manager.ts`), а не в `packages/acp-bridge/`.

### 4.2 Диаграмма классов

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (массовое освобождение при завершении сессии)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (в рамках workspace)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (завершение работы)
  └─ onBudgetEvent: (event) => void   (устанавливается QwenAgent)

PoolEntry (внутренний)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ при переподключении; защита от устаревших событий)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (обработчик, возвращаемый вызывающему)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (на сессию, на сервер)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (фильтрует по include/exclude, помечает доверие)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (удаляет свои регистрации)
```

---

## 5. Ключ пула (Fingerprint)

### 5.1 Хешированные канонические поля

```ts
type PoolKey = string; // sha256 hex, первых 16 символов достаточно (коллизий нет для реалистичного N)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] отсортировано по k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: нормализовать функционально-эквивалентные OAuth-конфигурации, чтобы они
 * схлопывались в один fingerprint. `{enabled: false}`, `undefined`,
 * `null`, и `{}` все означают «нет OAuth» → все возвращают `null`.
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// Исключённые поля (фильтры на сессию, НЕ транспортный уровень):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Гейтинг по типу транспорта

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**По умолчанию `pooledTransports = {stdio, websocket}`**. Операторы включают HTTP/SSE через:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Env: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Почему HTTP/SSE по умолчанию исключены**: некоторые реализации MCP HTTP-серверов привязывают состояние (контекст аутентификации, память разговора) к TCP/SSE потоку; несколько ACP-сессий, разделяющих его, привели бы к утечкам состояния. stdio + websocket — это настоящие OS-процессы, чьё состояние наблюдаемо и изолируемо.

### 5.3 Обход SDK MCP

`isSdkMcpServerConfig(cfg)` true → пул возвращает тонкую обёртку `PooledConnection` через `createUnpooledConnection(name, cfg, sid)`, которая немедленно создаёт `McpClient`, без разделения, запись в пуле не сохраняется. Причина: `sendSdkMcpMessage` по своей сути привязана к сессии (маршрутизируется через плоскость управления ACP обратно к исходной сессии). Тот же путь используется для HTTP/SSE, когда транспорт не входит в `pooledTransports` (§10.3).

V21-10: имя — `createUnpooledConnection`, а не `legacyInProcessAcquire` — SDK MCP и HTTP-opt-out являются постоянными проектными решениями, а не устаревшим кодом.

---

## 6. Жизненный цикл

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: обратный индекс, O(refs) releaseSession вместо O(entries). */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4: освободить зарезервированный слот при ошибке спавна. Без
          // этого слот утекает до тех пор, пока не запустится путь освобождения
          // health-монитора (который не запускается, потому что нет записи для мониторинга).
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2: O(refs этой сессии), а не O(всех entries). */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```

### 6.2 Дедупликация concurrent-acquire (`spawnInFlight`)

Зеркалит `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Без неё 5 сессий, запускающихся при загрузке, все видят `entries.has(id) === false` и соревнуются, кто первый запустит 5 дочерних процессов.

### 6.3 Плавный дрейн + лимит простоя

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // льготный период после последнего release
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // жёсткий лимит (защита от бесконечного цикла отмены дрейн-а)
```

Конечный автомат в `PoolEntry`:

```
spawning ──spawn ok──► active ──last detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (отмена таймера)
   spawn fail───────────►failed
                          │
                          └──manual restart──► spawning
```

Жёсткий лимит простоя: таймер дрейн-а может быть отменён и запущен заново бесконечно (флип acquire/release). `MAX_IDLE_MS` — отдельный таймер, запущенный **при первом простое** и никогда не сбрасываемый; когда он срабатывает, принудительно закрывает даже если дрейн сейчас в активном льготном периоде. Предотвращает появление зомби-записей пула от багливых клиентов, которые флапают acquire/release.

### 6.4 Межплатформенная очистка дочерних PID-ов

**R10 / R23 T7 / PR A update (2026-05-22)**: перешли от обхода BFS на PID (один подпроцесс `pgrep -P <pid>` / `Get-CimInstance -Filter` на узел) к одному снимку таблицы процессов с последующим обходом дерева в памяти. Две причины: (1) один fork вместо B^D форков на горячем пути завершения пула; (2) консистентность снимка — до исправления BFS мог пропустить потомков, которые ответвились между смежными уровнями BFS. Путь на PID сохранён как запасной для BusyBox `ps` <v1.28 (нет поддержки `-o`) и контейнеров distroless без `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // ОС заберёт сирот; завершение пула всё равно продолжается.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* fall through to fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(потомков), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // устаревший BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: все процессы (POSIX, эквивалентно -e, но однозначно на BSD).
  // -o pid=,ppid=: столбцы pid + ppid, завершающий `=` убирает заголовки.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // покрывает патологические хосты с >250k процессов
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parse, push into childrenByPpid */
  }
  return childrenByPpid;
}

// Windows: один снимок Get-CimInstance Win32_Process | ConvertTo-Csv
// всех строк (ProcessId, ParentProcessId) + обход в памяти; по-PID
// `Get-CimInstance -Filter "ParentProcessId=$p"` сохранён как запасной.
```

Вызывается из `PoolEntry.shutdown()` перед `client.disconnect()`. Обрабатывает утечки обёрток `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Лимиты MAX_DESCENDANTS=256 / MAX_DEPTH=8 сохранены.

### 6.5 Обработка ошибок спавна

Если `spawnEntry` отклоняет после того, как к нему прикрепилось несколько подписчиков (через `spawnInFlight`):

- Все ожидающие получают отклонение
- Зарезервированный слот `tryReserveSlot` освобождается **через явный `.catch` в `acquire`** (V21-4); без этого исправления слот утекал до следующего прохода health-монитора, который никогда не запускался, потому что не было записи для мониторинга.
- Неудачная запись НЕ сохраняется в `entries`
- Кодовые пути подписчиков обрабатывают так, как если бы `acquire` изначально не удался (существующая логика catch `discoverMcpToolsForServer` на сессию остаётся верной)

### 6.6 Задержка переподключения (V21-8)

Когда `PoolEntry` входит в переподключение после потери транспорта:

| Семейство транспорта | Стратегия                                     | Лимит                                                            |
| -------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| stdio                | Фиксированная 5с × 3 попытки                  | Согласно существующему `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`  |
| websocket            | Фиксированная 5с × 3 попытки                  | То же, что для stdio                                             |
| http (opt-in)        | Экспоненциальная 1с, 2с, 4с, 8с, 16с × 5 попыток | Удалённые конечные точки флапают на временных проблемах сети; больший бюджет |
| sse (opt-in)         | Экспоненциальная 1с, 2с, 4с, 8с, 16с × 5 попыток | То же, что для http                                              |

После исчерпания лимита: запись переходит в состояние `failed`; подписчики получают событие `failed`; новый `acquire` для того же `ConnectionId` пробует спавн один раз, затем выбрасывает исключение. Перезапуск оператором (§13) сбрасывает состояние.
---

## 7. Discovery / SessionMcpView

### 7.1 Двусторонняя веерная рассылка Tools + Prompts

```ts
// packages/core/src/tools/mcp-client.ts — разделяем discover на чистую функцию
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Клиент не подключён.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* без реестра */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('На сервере не найдено ни prompts, ни tools.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// Устаревший discover() сохранён, делегирует discoverAndReturn + регистрирует (для standalone qwen)
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: копия доверия на уровне сессии (не мутируем общий snapshot)
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 Воспроизведение снимка при подключении (стиль earlyEvents)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Немедленно воспроизводим текущий снимок, чтобы подписчик не пропустил
    // обновления, которые пришли между завершением discover и подключением.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Повторяет паттерн `BridgeClient.earlyEvents` из исправления #1 PR 14b — решает аналогичную гонку при подключении к пулу.

### 7.3 Защита устаревшего обработчика (счётчик поколений)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // переопределён другим reconnect
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* игнорируем + логируем */);
  };
}
```

Без этого устаревший обработчик от экземпляра Client до переподключения может перезаписать снимок после переподключения устаревшими данными.

**Инвариант монотонности** (уточнение V21): `generation` только увеличивается, никогда не сбрасывается. Любая выполняющаяся операция захватывает `myGen` на входе, а после `await` проверяет `myGen === this.generation`. Это эквивалентно утверждению «с момента моего запуска не произошло никакого замещающего события». Ограничено числом `Number.MAX_SAFE_INTEGER` (~285 тыс. лет при частоте переподключения 1 Гц), переполнение не опасно.

### 7.4 Унификация путей (расширение области действия F2-1)

`packages/core/src/tools/mcp-client.ts` содержит ДВА пути подключения к серверу:

1. Класс `McpClient` (mcp-client.ts:100) — используется `McpClientManager`
2. Фабричная функция `connectToMcpServer` (mcp-client.ts:875) — используется `discoverMcpTools` (строка 560) и `connectAndDiscover` (строка 607)

F2-1 должен свести оба пути к `McpClient.discoverAndReturn` (при этом `connectToMcpServer` становится приватным помощником `McpClient`, либо оба вызывают общий примитив `establishConnection()`). Иначе пул покрывает только путь класса; фабричный путь остаётся на уровне сессии и сводит на нет все усилия.

---

## 8. Сосуществование глобального состояния

### 8.1 `serverStatuses` (mcp-client.ts:292) — запись с защитой от коллизий

Карта на уровне модуля `Map<serverName, MCPServerStatus>`. `ConnectionId` пула имеет формат `name::hash`, но `updateMCPServerStatus(name, status)` записывает по имени. **Несколько записей пула для одного имени (разные отпечатки, например, расхождение токенов) будут затирать статус друг друга.**

**Решение**: пул перехватывает запись статуса:

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // Любой CONNECTED ⇒ CONNECTED
    // Иначе любой CONNECTING ⇒ CONNECTING
    // Иначе DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

В статусном маршруте отображается `entryCount: number`, чтобы операторы могли видеть, когда одному имени соответствует несколько записей.

### 8.2 Хранение OAuth-токенов

`MCPOAuthTokenStorage` пишет в `~/.qwen/mcp-oauth/<serverName>.json` — уже общий для хоста демона. Пул получает выгоду по стечению обстоятельств (первая сессия завершает OAuth → токен на диске → переподключение записи пула подхватывает токен → все остальные сессии подключаются без затрат).

**Предостережение — случай нескольких отпечатков**: 2 записи для одного имени (разные заголовки/окружение), но один и тот же OAuth-провайдер → обе читают один файл токена. Если токены привязаны к серверу (типично для OAuth), это работает. Если токены привязаны к окружению (редко), требуется явное расширение ключа хранилища. **Откладываем до F3** с задокументированным известным ограничением.

### 8.3 `entryCount` в снимке

Ячейка сервера `GET /workspace/mcp` дополняется:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // НОВОЕ — N записей пула для этого имени
  entrySummary?: [                        // НОВОЕ — непрозрачная разбивка по записям
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` — это **стабильное непрозрачное целое**, назначенное при создании записи (порядок вставки внутри группы имён), а НЕ сырой отпечаток. Обоснование: отпечаток меняется при ротации OAuth-токенов или переменных окружения, что могло бы утечь эту информацию через diff снимков (оператор мог бы сделать вывод «токен ротирован в момент T+5мин» по переходу `'a3b1' → 'f972'`). `entryIndex` монотонно растёт внутри группы имён, но остаётся стабильным при ротации, так как старая запись выгружается, а новая получает следующий индекс.

Старые SDK-клиенты игнорируют неизвестные поля в соответствии с контрактом PR 14; новые клиенты используют `entryCount` для бейджей. Внутренний путь перезапуска по отпечатку использует непрозрачный токен, возвращаемый только через привилегированный extMethod, и не раскрывается в HTTP-снимке.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Единая регистрация

Экземпляры `McpClient` пула используют **один** `WorkspaceContext` — привязанный контекст рабочего пространства демона (инвариант PR #4113). Обработчик `ListRootsRequestSchema` в `connectToMcpServer` замыкается на этом единственном контексте.

Слушатель `onDirectoriesChanged` регистрируется **один раз на запись**, а не один раз на `acquire`. Открепляется при завершении записи.

### 9.2 `roots/list_changed` — рассылка вверх

Сервер уведомляет клиента о новых корнях → пул рассылает:

- Пул выполняет повторное обнаружение (сервер может сообщить другой набор инструментов под новыми корнями) → событие `toolsChanged` → все представления подписчиков применяют заново

### 9.3 `updateWorkspaceDirectories` на уровне сессии

**Контракт**: в режиме B добавление директорий на уровне сессии — мягкая подсказка, не авторитетная. `WorkspaceContext` пула — на уровне демона.

Два варианта реализации:

- **v1 простой**: игнорировать добавления на уровне сессии, логировать предупреждение при обнаружении
- **v2 объединение**: пул поддерживает `extraRoots: Map<sessionId, Set<dir>>`, обработчик ListRoots возвращает объединение связанного рабочего пространства и всех дополнений. Удаление на уровне сессии запускает `roots/list_changed`. Добавляет 50–80 LOC сложности.

**Выбираем v1 простой для F2**; v2 объединение — как доработка, если возникнет реальная потребность пользователей.

---

## 10. Инъекции на уровне сессии

### 10.1 `mcpServers` из `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` объединяет переданный список с `settings.merged.mcpServers` (acpAgent.ts:1778-1831). Пул использует **объединённое представление на уровне сессии**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...существующий setMcpBudgetEventCallback УДАЛЁН — пул обрабатывает широковещательную рассылку напрямую
}
```

Когда две сессии инжектируют сервер с одним именем, но разными окружением/заголовками → разные отпечатки → две записи пула. Совместное использование пулом происходит только когда сессии полностью совпадают.

### 10.2 Расхождение в аутентификации

Статические `mcpServers` в `~/.qwen/settings.json` одинаковы для всех сессий → все совместно используются → 80% случаев. Инжектированные на уровне сессии mcpServers с токенами разных пользователей → уникальные отпечатки → совместное использование отсутствует. Оба случая безопасны.

### 10.3 Опциональный HTTP-транспорт (повтор раздела §5.2)

По умолчанию `pooledTransports = {stdio, websocket}`. HTTP/SSE-серверы проходят по пути `createUnpooledConnection` (один McpClient на сессию), если оператор явно не выбрал иное.

### 10.4 `/mcp disable X` в середине сессии (V21-6)

Когда оператор запускает `/mcp disable github` на активной сессии:

1. `Config.disableMcpServer('github')` добавляет в множество `disabledMcpServers` в Config
2. **Хук F2**: `Config.onDisabledMcpServersChanged` срабатывает; `SessionMcpView` для этого имени вызывает `teardown()` (удаляет свои регистрации tools/prompts из реестров сессии)
3. Запись пула **может остаться живой**, если на неё ссылаются другие сессии (refcount > 0) — только представление отключающейся сессии отсоединяется
4. Если все сессии отключат → refcount → 0 → запускается таймер выгрузки

Без шага 2 отключение в середине сессии оставило бы уже зарегистрированные инструменты в `ToolRegistry` сессии до следующего перезапуска сессии. Тест 21.4 покрывает это.

`/mcp enable github` — обратная операция: запускает свежий `pool.acquire` для сессии, подключает новое представление, повторно применяет снимок.

---

## 11. Завершение внедрения бюджетных ограничений

### 11.1 Конечный автомат перемещается в пул

`tryReserveSlot` / `releaseSlotName` / гистерезис 75% / объединение `refused_batch` / `bulkPassDepth` / `pendingRefusalNames` — всё переносится из `McpClientManager` в `McpTransportPool`. `McpClientManager` сохраняет это состояние только при работе в автономном режиме (без инъекции пула).

### 11.2 Область действия ячейки снимка

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // НОВОЕ значение (PR 14 v1 возвращал 'session')
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

В соответствии с контрактом PR 14: «Потребители ДОЛЖНЫ допускать дополнительные записи с нераспознанными значениями scope (пропускать, не вызывать ошибку)». Старые SDK-клиенты видят `scope: 'workspace'`, отображают как неизвестное (или используют запасные значения из верхнего уровня). Новый SDK добавляет вспомогательный метод `isWorkspaceScopedBudget(cell)`.

### 11.3 Широковещательная рассылка события

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('доставка бюджетного события не удалась', { sid, err }),
        );
    }
  }
}
```

### 11.4 Изменения контракта типов SDK

PR 14b экспортировал следующее (должно быть расширено аддитивно):

- `DaemonMcpBudgetWarningData` — добавить `scope?: 'workspace' | 'session'` (опционально для обратной совместимости; при отсутствии = 'session')
- `DaemonMcpChildRefusedBatchData` — то же расширение `scope?`
- `DaemonMcpGuardrailEvent` — дискриминатор остаётся без изменений

Новые вспомогательные методы SDK:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

Состояние редьюсера в `DaemonSessionViewState`:

- **Нет новых полей** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` увеличиваются независимо от scope (scope — свойство каждого события, а не отдельный поток)
- Документировать, что при F2 эти счётчики отражают события уровня рабочего пространства, разосланные всем сессиям — они будут увеличиваться **одновременно во всех подключённых сессиях** при возникновении бюджетного давления

**V21-12 (Q1 решено, зафиксировано в v2.1)**: сохранять существующие имена полей (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) с расширенной семантикой scope, задокументированной в JSDoc:

```ts
/**
 * Количество событий `mcp_budget_warning`, наблюдаемых сессией.
 * При F2 (`scope: 'workspace'`) увеличивается одновременно
 * во всех подключённых сессиях, так как бюджетные события
 * рассылаются на уровне рабочего пространства. Используйте
 * `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`, чтобы
 * проверить scope последнего события.
 */
mcpBudgetWarningCount: number;
```

Обоснование: PR 14b уже поставил эти имена как публичную поверхность SDK; переименование — более серьёзное нарушение обратной совместимости, чем слегка неточная семантика.

---

## 12. OAuth — явное откладывание до F3

Обработка 401 при OAuth в `connectToMcpServer` (mcp-client.ts:950-1010) требует интерактивного разрешения (открытие браузера или device-flow). Демон в режиме B **не должен открывать браузер** (согласно дизайну PR 21 — grep по статическим источникам вызывает сбой сборки при наличии `open`/`xdg-open`/`shell.openExternal`).

**Поведение F2 при сервере, требующем OAuth**:

1. Первый `acquire` вызывает `connectToMcpServer` → обнаружен 401
2. Пул перехватывает исключение OAuth-required, помечает запись как `failed_auth_required`
3. Статусный маршрут отображает `errorKind: 'auth_env_error'` (существующий PR 13 errorKind)
4. Пул **не повторяет попытку автоматически**
5. Оператор запускает `/mcp auth <name>` (существующий CLI) ИЛИ использует device-flow-маршрут PR 21 для получения токена на диск → следующий `acquire` сессии повторяет попытку и завершается успешно

**F3 заменит шаги 4–5** на `PermissionMediator`, направляющий запрос завершения OAuth подключённым сессиям для первого ответчика.

Это позволяет F2 не смешиваться с работой конечного автомата аутентификации.

---

## 13. Семантика маршрута перезапуска

### 13.1 `POST /workspace/mcp/:server/restart` под пулом

Сегодня (PR 17): перезапуск в менеджере сессии bootstrap = перезапуск единственной записи для данного имени.

Под пулом: имя → возможно несколько записей (разные отпечатки для одного имени = разные сессии с разными конфигурациями).

**Заданное поведение**:

| Запрос                                                   | Поведение                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`                    | Перезапустить **все** записи, соответствующие `serverName` (параллельно через `Promise.allSettled`) |
| `POST /workspace/mcp/:server/restart?entryIndex=0`       | V21-3: перезапустить только запись #0 (непрозрачный индекс из снимка §8.3); 404, если не найдена |
| `POST /workspace/mcp/:server/restart?entryIndex=*`       | Явный «все» (то же, что без параметра)                                               |

Форма ответа:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: непрозрачный индекс, не сырой отпечаток
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

Старая форма `{restarted: true, durationMs}` сохраняется, когда `entries.length === 1` И отсутствует параметр запроса `entryIndex` для обратной совместимости; клиенты могут определить новую форму по наличию `'entries' in response`.

### 13.2 Дедупликация перезапуска при выполнении

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 Проверка бюджета (сохраняет поведение PR 17)

Перед перезапуском пул проверяет бюджет: если отключение+подключение всё ещё укладывается в бюджет, ОК. Текущая семантика PR 17 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` сохраняется (теперь применяется к каждой записи).

### 13.4 Выполняющийся вызов инструмента во время переподключения (V21-5, новое)

Сессия A вызывает `pool.callTool('git.commit', args)` → запрос поступает на stdin дочернего процесса → дочерний процесс падает в середине записи → запись переходит к переподключению:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // поколение до переподключения
  readonly args: unknown;              // исходные аргументы, чтобы вызывающая сторона могла повторить, если безопасно
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Спецификация**:

- Промис выполняющегося вызова отклоняется с `MCPCallInterruptedError` сразу при обнаружении разрыва транспорта (не ждать переподключения)
- Пул **НЕ повторяет вызов автоматически**; семантика небезопасна для записей (коммит, редактирование файла и т.д.), а пул не может отличить чтение от записи
- Вызывающая сторона (обычно уровень выполнения инструментов в цикле агента) перехватывает эту ошибку и принимает решение: повторить / показать пользователю / прервать
- После переподключения: сессия A может повторить вызов (через тот же `PooledConnection.callTool`); пул прозрачно направляет запрос к новому экземпляру транспорта
- `MCPCallInterruptedError.clientGeneration` позволяет вызывающей стороне при необходимости сопоставить с последующим событием `reconnected`

Тест 21.6 должен покрывать: запустить долгоживущий stdio MCP, отправить вызов инструмента, убить дочерний процесс во время вызова, проверить отклонение с `MCPCallInterruptedError` и ненулевым `clientGeneration`.

---

## 14. Рефакторинг статусного маршрута

### 14.1 Новый путь запроса

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — замена источника данных
let accounting: McpClientAccounting | undefined;
try {
  // НОВОЕ: запрос пула напрямую через extMethod моста, а не через сессию bootstrap
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Запасной вариант — устаревший путь через сессию bootstrap для демона без пула
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` предоставляет `getMcpPoolAccounting()`:

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

Дочерние процессы ACP пробрасывают через `extMethod`, чтобы демон мог вызвать.

### 14.2 entryCount + entrySummary

Согласно §8.3.

### 14.3 Случай без сессии bootstrap

Сегодня (PR 12), когда демон неактивен (ещё нет сессий), `GET /workspace/mcp` возвращает `initialized: false`, потому что некому отправить запрос в менеджер.

Под пулом: пул существует с момента создания `QwenAgent` → статусный маршрут может вернуть живую учётную запись **даже при нулевом количестве сессий**. Ячейка `initialized: true` даже до первой сессии. **Задокументированное изменение поведения** в описании PR; не регрессия.

---

## 15. Взаимодействие loadSession / resume (PR 6 #4222)

### 15.1 Отмена выгрузки при возобновлении

```
session-A активна, удерживает ссылку на entry-X
session-A отключается (без явного close) → в итоге killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → запускается таймер выгрузки (30 с)
session-A возобновляется в течение 30 с → новый newSessionConfig → pool.acquire возвращает entry-X → attach отменяет таймер выгрузки
session-A возобновляется спустя 30 с → entry-X уже закрыт → пул создаёт новую запись (холодный старт)
```
### 15.2 Окно кэша `restoreState` (5 мин, из PR 6)

`acpAgent.restoreState` удерживается в течение 5 мин после отключения. Время слива пула (по умолчанию 30 с) < окно восстановления (5 мин) → возобновление между 30 с и 5 мин приводит к холодному запуску MCP. Приемлемый компромисс (сам путь возобновления редок).

Альтернатива: пул считывает конфигурацию окна восстановления демона и расширяет время слива до соответствия. Это добавляет связь между пулом и конечным автоматом сессии; **отложено на последующую доработку, если пользователи не сообщат о проблеме холодного запуска**.

### 15.3 Взаимодействие `pendingRestoreIds`

`acpAgent.killSession()` должен вызывать `pool.releaseSession(sid)` ПОСЛЕ очистки `pendingRestoreIds`. Порядок:

1. Сессия помечена как восстанавливаемая (`pendingRestoreIds.add(sid)`)
2. Session.close() — но ссылка пула всё ещё удерживается
3. После истечения `RESTORE_WINDOW_MS` без возобновления: `killSession` окончательно очищает → `pool.releaseSession(sid)` запускает слив

Предотвращает срабатывание слива во время окна восстановления.

---

## 16. Горячая перезагрузка конфигурации

### 16.1 Неявная перезагрузка через изменение отпечатка

Пользователь редактирует `~/.qwen/settings.json` на лету, изменяет окружение сервера:

1. Старые сессии сохраняют старый снимок `Config`/`McpServers` → продолжают получать старый отпечаток → ссылка entry-OLD сохраняется
2. Новая сессия читает свежие настройки → новый отпечаток → создаётся entry-NEW, сосуществующий с entry-OLD
3. Старые сессии естественно закрываются → entry-OLD сливается → в итоге закрывается
4. Установившееся состояние: остаётся только entry-NEW

**Нет мутации работающих соединений на лету** — чистое разделение между сессиями на разных версиях конфигурации.

### 16.2 Принудительная перезагрузка (опционально)

```
POST /workspace/mcp/reload-all
  → для каждой сессии: перечитать настройки, заменить Config.mcpServers
  → для каждой записи, на которую больше нет ссылок: запланировать вытеснение
```

Полезно для «Я изменил переменные окружения и хочу немедленного эффекта на всех сессиях». Отложено на доработку F2 (не блокирует).

### 16.3 Запись-сирота после удаления расширения (V21-15)

Сценарий: расширение `foo-ext` регистрирует MCP-сервер `foo-server`. Оператор выполняет `/extension uninstall foo-ext`. Жизненный цикл расширения удаляет `foo-server` из `extensionMcpServers`, так что будущие вызовы `loadCliConfig` не включают его. Но:

- Живые сессии хранят снимки `Config`, которые всё ещё содержат `foo-server` → эти сессии продолжают использовать запись
- Новые сессии после удаления не получают её (сервера больше нет в их объединённом mcpServers) → счётчик ссылок не растёт

**Решение**: полагаться на естественный слив. По мере закрытия старых сессий счётчик ссылок падает; в конце концов запись достигает `MAX_IDLE_MS = 5мин` и принудительно закрывается. **Нет явного API `pool.invalidateByExtension(name)`** — сохраняет единообразие с горячей перезагрузкой конфигурации (§16.1).

Компромисс: сервер расширения может работать до 5 мин после удаления, если долгая сессия поддерживает его живым. Приемлемо; операторы могут выполнить `/mcp restart foo-server`, затем убить сессию, если срочно требуется.

---

## 17. Порядок завершения работы

Последовательность `QwenAgent.close()` (должна соблюдаться):

```
1. Установить acceptingNewSessions = false; отклонять новые POST /session
2. Для каждого выполняющегося запроса: сигнализировать отмену, дождаться завершения (существующий жизненный цикл PR 11)
3. Для каждой сессии: инициировать close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← обходит льготные 30 с
   ├── Для каждой записи: отменить таймеры слива и проверки здоровья, пометить как сливаемый
   ├── Для каждой записи параллельно: listDescendantPids → SIGTERM дочерним процессам
   ├── Для каждой записи параллельно: client.disconnect()
   └── Promise.race с timeoutMs; брошенные записи получают SIGKILL
5. Закрытие канала моста
6. Выход процесса
```

**V21-11**: сигнатура `drainAll`:

```ts
async drainAll(opts?: {
  force?: boolean;       // по умолчанию false; true обходит льготный таймер в 30 с
  timeoutMs?: number;    // по умолчанию 10_000; бюджет реального времени; отставшие получают SIGKILL
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // записи, отключившиеся чисто
  forced: number;        // записи, принудительно убитые SIGKILL после тайм-аута
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

Вызывающий код использует `DrainResult` для логирования при завершении; если `forced > 0`, логирует предупреждение, чтобы оператор знал, что какой-то сервер не завершился чисто.

---

## 18. Структура файлов

**Новые файлы:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool основной (~700 LOC)
  mcp-pool-key.ts              # отпечаток + вспомогательные функции canonicalize (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: счётчик ссылок + слив + здоровье + поколение (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: фильтрация + регистрация инструментов/подсказок (~200 LOC)
  mcp-pool-events.ts           # различаемый union PoolEvent (~80 LOC)
  pid-descendants.ts           # listDescendantPids кроссплатформенный (~150 LOC, включая тесты)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows с пропуском по условию)
```

**Изменённые файлы:**

```
packages/core/src/tools/mcp-client.ts            # разделение discoverAndReturn(); унификация connectToMcpServer
packages/core/src/tools/mcp-client-manager.ts    # опциональный параметр pool; состояние бюджета условное
packages/core/src/tools/tool-registry.ts         # прокидывает pool из конфига в McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # создание QwenAgent.mcpPool; broadcastBudgetEvent;
                                                 # newSessionConfig подключает pool в Config;
                                                 # killSession вызывает pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # передаёт --mcp-pool-transports + бюджетные переменные окружения дочернему ACP
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus читает pool;
                                                 # restartMcpServer extMethod возвращает RestartResult[]
packages/cli/src/serve/capabilities.ts           # объявляет mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: опциональное поле; вспомогательная функция isWorkspaceScopedBudgetEvent
```

---

## 19. Доставка в одном PR — разбивка по коммитам (V21-1)

Согласно рекомендациям мейнтейнера по пакетной передаче функциональности (#4175 стратегия ветвления 2026-05-19), F2 поставляется как **один PR с 6 атомарными коммитами**. Рецензент может пройтись с помощью `git log -p HEAD~6..HEAD` и просматривать коммит за коммитом.

| № коммита | Название                                                                                     | Область                                                                                                                                                                                                                                                                                                                                                                                                                   | Затрагивает                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1        | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | Добавить `discoverAndReturn()`; извлечь общий `establishConnection()`, используемый как `McpClient.connect()`, так и фабрикой `connectToMcpServer()`; унаследованный `discover()` становится тонкой обёрткой, выполняющей регистрацию (сохраняет поведение standalone qwen). Нулевое наблюдаемое изменение поведения.                                                                                                        | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                               | Ядро пула: `fingerprint`, счётчик ссылок, дедупликация `spawnInFlight`, обратный индекс `sessionToEntries`, конечный автомат слива, повторное применение снимка при присоединении, защита поколения, двойной fan-out инструментов и подсказок, копия доверия для каждой сессии. McpClient замокан для модульных тестов. Нет промышленной связки.                                                                              | Новые `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + тесты |
| 3        | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids` (Unix `pgrep -P` рекурсивно, Windows PowerShell CIM); единый монитор здоровья внутри `PoolEntry` (проверка интервала + счётчик сбоев + повторное подключение с экспоненциальной задержкой согласно §6.6); интеграционные тесты для порождения подпроцессов, ограниченные флагом `QWEN_INTEGRATION === '1'`.                                                                                             | Новые `pid-descendants.ts` + тесты; `mcp-pool-entry.ts`                                                                    |
| 4        | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` прокидывает pool в `McpClientManager`; опциональный параметр конструктора `pool?` у `McpClientManager`; `acpAgent.QwenAgent` создаёт pool при инициализации; инъекция `newSessionConfig`; `killSession` вызывает `pool.releaseSession`; SDK MCP + HTTP/SSE обходятся через `createUnpooledConnection`; флаги CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5        | `feat(serve): pool-aware status + restart routes`                                             | extMethod `QwenAgent.getMcpPoolAccounting`; `httpAcpBridge.buildWorkspaceMcpStatus` сначала через pool, затем резервный вариант bootstrap-session; `restartMcpServer` принимает `?entryIndex=` и возвращает `RestartResult[]`; поле `entryCount` + `entrySummary[].entryIndex` в ячейке; теги возможностей `mcp_workspace_pool` + `mcp_pool_restart`.                                                                     | `httpAcpBridge.ts`, `capabilities.ts`, типы SDK                                                                         |
| 6        | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | Перенести `tryReserveSlot`/`releaseSlotName`/конечный автомат гистерезиса из `McpClientManager` в пул; удалить пери-сессионный `setMcpBudgetEventCallback` в `acpAgent.newSessionConfig`; `QwenAgent.broadcastBudgetEvent` fan-out; поле `scope: 'workspace'` в ячейке снимка; добавочное поле `scope?` в SDK; вспомогательная функция `isWorkspaceScopedBudgetEvent`; обновление inline-документации.                       | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**Общая оценка LOC**: ~4100 производственного кода + ~1900 тестов = ~6000 LOC (оценка v2 была ~3850; рост поглощает исправления V21).

**Цель слияния**: один PR в `daemon_mode_b_main`. Периодическое пакетное слияние в `main` согласно стратегии #4175.

**Процесс самопроверки перед открытием PR**:

1. После каждого коммита запустить агент `code-reviewer` на diff коммита; включить принятые замечания в тот же коммит
2. Для коммитов 2/4/6 (наибольший риск в проектировании) дополнительно запустить `silent-failure-hunter` + `type-design-analyzer`
3. После того как все 6 коммитов зафиксированы: 3 полных прохода рецензии разными комбинациями агентов на полном diff PR
4. Запустить полный набор тестов + проверку типов + линтинг по всем затронутым пакетам

Повторяет шаблон предварительной рецензии специалистов из PR 21.

---

## 20. Теги возможностей + изменения контракта SDK

### 20.1 Новые теги возможностей (объявляются атомарно в v0.16, V21-1)

Поскольку F2 поставляется как один PR, все три тега объявляются вместе. Потребители пула могут считать, что **наличие `mcp_workspace_pool` ⇒ поля `entryCount`/`entrySummary`/`scope?` все присутствуют**; проверки по полям не требуется.

| Тег                        | Когда объявляется                                                                               | Значение                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Когда `QwenAgent.mcpPool !== undefined` (всегда истинно в режиме демона, если не `--no-mcp-pool`) | `GET /workspace/mcp` отражает состояние пула; присутствуют поля `entryCount` + `entrySummary`            |
| `mcp_pool_restart`         | Всегда, когда включён `mcp_workspace_pool`                                                      | `POST /workspace/mcp/:server/restart` принимает `?entryIndex=` и может вернуть `entries: RestartResult[]` |
| (расширение `mcp_guardrails`) | без изменений                                                                                 | Тот же тег, полезная нагрузка расширена полем `scope` (`'workspace'` в F2)                               |

### 20.2 Добавочная поверхность SDK

```ts
// @qwen-code/sdk — только добавление
export interface DaemonMcpBudgetWarningData {
  // существующие поля...
  scope?: 'workspace' | 'session'; // НОВОЕ — отсутствует на старых демонах (означает 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // существующие поля...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // существующие поля...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` остаётся `1` (добавочно).

---

## 21. Матрица тестов

### 21.1 Ключ пула (F2-2)

- Одна и та же конфигурация → один и тот же ключ (перестановка ключей env стабильна, перестановка ключей заголовков стабильна)
- Отличие значения env на 1 байт → другой ключ
- Отличие значения заголовка `Authorization` → другой ключ
- Изменение `includeTools`/`excludeTools`/`trust` → ТОТ ЖЕ ключ (фильтр на уровне сессии)
- Два `new MCPServerConfig(...)` с идентичным содержимым → один и тот же ключ (канонический хеш, а не по идентичности)

### 21.2 Жизненный цикл (F2-2)

- 3 сессии получают один и тот же ключ → 1 порождение (проверить через шпион на `client.connect`)
- Последовательность освобождения n,n-1,...,1 → таймер слива запускается только при 1→0
- Слив 30 с: получение на 25 с отменяет таймер; получение на 35 с порождает новую запись
- `MAX_IDLE_MS` (5 мин) принудительное закрытие даже при трепыхании слива
- Ошибка порождения во время ожидания: все ожидающие получают ошибку; слот освобождается; запись не сохраняется

### 21.3 Одновременное получение (F2-2)

- 5 одновременных `acquire(sameKey)` при отсутствующей записи → ровно 1 вызов `spawnEntry`, все 5 получают одну и ту же запись
- Порождение отклоняется → все 5 ожидающих отклоняются с той же ошибкой; последующее получение повторно порождает

### 21.4 Изоляция на уровне сессии (F2-2)

- Сессия A с `excludeTools: ['foo']`, Сессия B без исключения → ToolRegistry у A не содержит foo, у B содержит; обе из одного `toolsSnapshot`
- Сессия A с `trust: true`, Сессия B с `trust: false` → у A `DiscoveredMCPTool.trust === true`, у B `false`; проверить, что НЕ общая ссылка (изменение одной не влияет на другую)
- Сессия A получает сервер только с подсказками → PromptRegistry у A заполнен, ToolRegistry пуст для этого сервера

### 21.5 Изменение списка инструментов/подсказок (F2-2)

- Сервер отправляет `notifications/tools/list_changed` → у всех подписчиков вызывается `applyTools` с новым снимком
- Устаревший обработчик из поколения до повторного подключения НЕ перезаписывает снимок
- Аналог для `notifications/prompts/list_changed`

### 21.6 Сбой + переподключение (F2-2)

- Убить подпроцесс через `process.kill` → подписчики получают событие `disconnected`
- 3 попытки переподключения (с использованием существующей `MCPHealthMonitorConfig`) → успех → `reconnected` + свежий снимок
- Исчерпание повторных попыток → все подписчики получают `failed`; запись переходит в состояние `failed`; новые получатели повторяют попытку один раз, затем выбрасывают ошибку

### 21.7 Сбор дочерних PID (F2-2b)

- Linux/macOS: запустить `bash -c "sleep 60 & sleep 60"` как команду stdio → убить корень → проверить, что оба потомка завершены (опрос `/proc/<pid>/status` или `kill(0, pid) === false`)
- Windows: запустить обёртку `cmd /c "ping -t localhost"` → убить → проверить, что подпроцесс ping исчез
- `pgrep` недоступен (отсутствует в PATH) → постепенная деградация: залогировать предупреждение, просто отправить SIGTERM корню, не падать

### 21.8 Бюджет в масштабе рабочего пространства (F2-4)

- 4 сессии × `--mcp-client-budget=2` с 3 статическими MCP-серверами → всего в рабочем пространстве = 3 (не 12); ячейка снимка `scope: 'workspace'`, `liveCount: 3`
- Предупреждение о бюджете срабатывает один раз при превышении 75% по всему рабочему пространству; транслируется всем 4 сессиям одновременно
- Перевооружение гистерезиса: снижение до 37,5% → следующее превышение срабатывает снова

### 21.9 Обратная совместимость (F2-3)

- Standalone `qwen` (без демона) → `mcpPool === undefined` → все существующие тесты `mcp-client-manager.test.ts` проходят без изменений
- Флаг демона `--no-mcp-pool` → возврат к пери-сессионной модели, все существующие e2e тесты демона проходят

### 21.10 Изоляция учётных данных (F2-3)

- Сессия A вводит `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Сессия B — `tokenB` → 2 отдельных процесса; проверить через снимок `entryCount: 2`; проверить, что вызовы инструментов A проходят через транспорт A (проверкой заголовка в stdin/log)

### 21.11 LoadSession / возобновление (F2-3)

- Закрытие сессии → запуск слива → возобновление в течение 30 с → запись пула повторно используется (без холодного старта, подтверждён счётчиком вызовов `client.connect`)
- Возобновление после 30 с, но до истечения окна восстановления → холодный старт пула; содержимое restoreState всё ещё сохранено

### 21.12 Маршрут перезапуска (F2-3b)

- 1 запись для имени → `POST /workspace/mcp/foo/restart` возвращает унаследованную форму `{restarted: true, durationMs}`
- 2 записи для имени (разные отпечатки) → возвращает `{entries: [{fingerprint, restarted, ...}, ...]}`
- Перезапуск, пока другой перезапуск выполняется → второй вызов возвращает тот же промис (дедупликация)
- Перезапуск при превышении бюджета → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` для каждой записи

### 21.13 Маршрут состояния (F2-3b)

- Демон в простое (нет сессий), но пул содержит кэшированные записи от предыдущей сессии → `GET /workspace/mcp` возвращает `initialized: true` с актуальной учётной информацией
- Bootstrap-сессия не существует → возврат к пути напрямую через пул; без ошибки
- Запрос к пулу выбрасывает исключение → возврат к пути bootstrap-сессии; никогда не крашит снимок

### 21.14 Редуктор SDK (F2-4)

- `mcpBudgetWarningCount` увеличивается одновременно во всех сессиях-подписчиках при трансляции события рабочего пространства
- `isWorkspaceScopedBudgetEvent(e)` правильно определяет область из полезной нагрузки
- Старый демон (без поля `scope`) → по умолчанию интерпретируется как 'session'

### 21.15 Горячая перезагрузка конфигурации (F2-3)

- Изменение settings.json на лету → старая сессия сохраняет старую запись, новая сессия создаёт новую, обе сосуществуют; старая сливается естественным образом после закрытия последней старой сессии
- 0 сессий после закрытия старой сессии → таймер слива срабатывает → старая запись GC'd → остаётся только новая

### 21.16 Порядок завершения (F2-3)

- `QwenAgent.close()` срабатывает по порядку: прекратить приём → слив запросов → закрыть сессии → `pool.drainAll` → нет зомби-процессов в `pgrep -P <acpChildPid>` после завершения
---

## 22. Открытые вопросы

V21 зафиксировал Q1/Q3/Q4/Q6 в дизайнерских значениях по умолчанию (доставка одним PR). Q2/Q5/Q7/Q8/Q9 остаются.

| #     | Вопрос                                                                                                          | Значение по умолчанию в дизайне F2                                                   | Решение необходимо до |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| Q1 ✅ | Имена полей редьюсера SDK — переименовать или оставить?                                                          | **ЗАФИКСИРОВАНО v2.1**: оставить `mcpBudgetWarningCount` и т.д. с расширенной семантикой области видимости в JSDoc | решено                |
| Q2    | Возможность `mcp_workspace_pool` — поднять `protocolVersions` ('v1' → 'v1.1') или остаться аддитивно в 'v1'?     | **Остаться аддитивно в 'v1'** (согласно прецеденту PR 14b)                           | коммит 5              |
| Q3 ✅ | Флаг `--no-mcp-pool` — включён по умолчанию или опционально?                                                    | **ЗАФИКСИРОВАНО v2.1**: включён по умолчанию; `--no-mcp-pool` — аварийный выключатель | решено                |
| Q4 ✅ | Значение по умолчанию HTTP/SSE — пул выключен или включён?                                                      | **ЗАФИКСИРОВАНО v2.1**: пул выключен; опция включения через `--mcp-pool-transports`  | решено                |
| Q5    | `POST /workspace/mcp/reload-all` — включить в F2 или в последующих версиях?                                     | **В последующих версиях**                                                            | н/д (отложено)        |
| Q6 ✅ | Ленивое создание пула — стоит ли условного конструктора?                                                         | **ЗАФИКСИРОВАНО v2.1**: энергичное (всегда создаётся в конструкторе `QwenAgent`)    | решено                |
| Q7    | Окно `restoreState` и освобождение пула — оставить отдельно, выровнять или читать из настроек?                  | **Оставить отдельно таймаут 30 с по умолчанию** + настраиваемый параметр `--mcp-pool-drain-ms` | коммит 4              |
| Q8    | Обработка OAuth — подтвердить перенос на F3, задокументировать обходной путь?                                   | **Перенесено на F3**, задокументировать обходной путь `/mcp auth <name>`              | коммит 4              |
| Q9    | Раскрытие `entrySummary` — всегда включать или за флагом verbose?                                               | **Всегда включать** (маленький полезный груз, полезно для операций)                  | коммит 5              |
| Q10   | Обновить решение #3 в `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` — согласовать с @wenshao? | Описание PR F2 ссылается на PR codeagents; два PR рецензируются независимо            | PR открыт             |

---

## 23. Риски

### Высокие

- **R1 (глобальное состояние A2)**: коллизия `serverStatuses` при множественных записях с одинаковым именем. Смягчено функцией агрегированного статуса; оставшийся риск — SDK-потребители, читающие сырую глобальную Map (маловероятно — используется только через аксессор `getMCPServerStatus(name)`).
- **R2 (симметрия PromptRegistry)**: забывание разветвления промптов в каком-либо пути кода молча удаляет промпты. Смягчено третьим пунктом теста F2-2 21.4 + интеграционным тестом, проверяющим паритет промптов по сравнению с до-F2.
- **R3 (утечка состояния HTTP-транспорта)**: подключение пула HTTP для сервера, поддерживающего состояние на транспорт, повреждает контексты сессий. Смягчено выключением по умолчанию + документацией; автоматически обнаружить невозможно.

### Средние

- **R4 (унификация путей F2-1)**: фабрика `connectToMcpServer` и класс `McpClient` имеют тонкие поведенческие различия (например, возможности, объявленные во время конструктора vs время подключения). Смягчено тем, что F2-1 — это чистый рефакторинг с полным регрессионным покрытием до начала работы над пулом.
- **R5 (дочерние PID в Windows)**: PowerShell `Get-CimInstance` может быть медленным (цена создания процесса) или заблокирован AppLocker. Смягчено таймаутом 2 с + плавной деградацией.
- **R6 (усиление широковещательных событий пула)**: разветвление предупреждения о бюджете на 100 сессий вызывает 100 вызовов extNotification в плотном цикле. Смягчено распараллеливанием `Promise.all` + перехватом ошибок на каждую сессию (существующий шаблон PR 14b).

### Низкие

- **R7 (стабильность отпечатка между версиями MCPServerConfig)**: будущие поля, добавленные в `MCPServerConfig` и не включённые в отпечаток, могут молча допускать некорректное совместное использование. Смягчено явной функцией канонизации + тестом, перечисляющим все поля `MCPServerConfig` и проверяющим покрытие.
- **R8 (гонки счётчика поколений)**: быстрые циклы перезапусков могут исчерпать точность JS-чисел (≈ 2^53 = ~285k лет при 1/с). Практически не является проблемой.

### Специфичные для одного PR (V21-14)

- **R9 (усталость рецензента от ~6000 LOC одного PR)**: Пропускная способность рецензента становится критическим путём. F3 заблокирован слиянием F2 → блокировка других участников. Смягчение: (a) предварительное рецензирование с 3 специализированными агентами и включение P0/P1 до открытия, следуя шаблону PR 21; (b) структура из 6 атомарных коммитов, чтобы рецензент мог проходить шаг за шагом; (c) координация окна рецензирования с @wenshao заранее через комментарий #4175.
- **R10 (накопление конфликтов слияния в `daemon_mode_b_main`)**: F2 затрагивает `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — все горячие пути. Участники F3 / F4, вносящие изменения одновременно, рискуют получить конфликты во время окна рецензирования F2 в 1–2 недели. Смягчение: ежедневный `git rebase origin/daemon_mode_b_main`; координация через обновление #4175, что F2 находится в разработке + просьба к F3/F4 отложить изменения в горячих файлах до слияния F2.
- **R11 (время выполнения CI)**: ~1900 LOC новых тестов, включая запуск дочерних процессов + кросс-платформенный обход PID, может увеличить CI с 30 мин до 50 мин. Смягчение: (a) поместить тесты с подпроцессами за `process.env.QWEN_INTEGRATION === '1'`, запускать подмножество в PR CI + полный набор в ночных сборках; (b) Vitest параллелизм ≥ 4; (c) тесты обхода PID Windows пропускаются только на GHA Windows runner.

---

## 24. Обновления документации

| Документ                                                                                                        | Обновление                                                                                                                                                                     | Когда                                                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`                                              | Решение #3 "Время жизни MCP-сервера": сейчас "на сессию"; обновить на "объединён в рабочей области с ключом по хешу конфигурации в режиме демона; отдельно на сессию"          | Слияние F2-3 (согласовать с @wenshao PR codeagents)      |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                                                              | Волна 5 PR 23 → отметить как серия F2; ссылки на PRs                                                                                                                           | Слияние F2-3                                            |
| `packages/cli/src/serve/README.md` (если существует) или новый `docs/serve/mcp-pool.md`                        | Новый раздел: семантика пула, ключ отпечатка, опция транспорта, семантика перезапуска, интерпретация снимка статуса                                                             | F2-3b                                                   |
| `packages/sdk/README.md`                                                                                        | Поле `scope?` на событиях защиты, `entryCount` на статусе сервера, вспомогательная функция `isWorkspaceScopedBudgetEvent`                                                      | F2-4                                                    |
| Тело задачи #4175                                                                                               | Обновить запись F2 с таблицей под-PR, ссылкой на дизайн v2 (этот документ)                                                                                                     | До открытия F2-1                                       |
| Тело задачи #3803                                                                                               | Строка решения #3: обновить "Текущий на сессию" → "Объединён в рабочей области под демоном (F2)"                                                                               | После слияния F2-3                                     |
| Встроенный комментарий `acpAgent.ts:869-936`                                                                    | Удалить прямую ссылку "Волна 5 PR 23"; обновить на "переведено F2 в `scope: 'workspace'`"                                                                                      | PR F2-4                                                |
| CHANGELOG / примечания к выпуску (Волна 6 / F5)                                                                | Заголовок "MCP-процессы теперь используются совместно между сессиями в рабочей области"                                                                                        | Выпуск F5                                               |

---

## 25. Шаблон описания PR (доставка одним PR)

```markdown
## feat(serve): общий пул MCP-транспорта (в рамках рабочей области) [F2]

Единый функционально-связный PR в соответствии со стратегией ветвления #4175 (2026-05-19).
Заменяет то, что изначально планировалось как Волна 5 PR 23 + под-PR F2-1..F2-4.

### Объём

~4100 LOC production + ~1900 LOC тестов в 6 атомарных коммитах.
Проходите с помощью `git log -p HEAD~6..HEAD` для пошагового рецензирования.

### Документ дизайна

См. `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Предварительные агенты-специалисты (следуя шаблону PR 21)

Включены в первый коммит до открытия:

- code-reviewer: N находок, все приняты
- silent-failure-hunter: N находок, все приняты
- type-design-analyzer: N находок, все приняты

### Закрывает

(нет — запись F2 в #4175 остаётся открытой до слияния PR в основную ветку)

### Связанные

- #3803 обновление решения #3 (codeagents PR <link>)
- PR 14b (#4271 слит) — основа бюджетных защит; F2 переводит область видимости на рабочее пространство
- F1 (#4319 слит) — пакет acp-bridge; F2 зависит от точек внедрения

### Обратная совместимость

- Автономный `qwen` (не демон): пул не создаётся; существующее поведение сохраняется
- Демон `qwen serve --no-mcp-pool`: аварийный выключатель возвращает к сессионной модели
- SDK: все новые поля аддитивны (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION остаётся 1
- Старые SDK-клиенты: неизвестный `scope: 'workspace'` игнорируется согласно контракту PR 14
- Старые демоны: SDK-потребители могут обнаружить отсутствие возможности `mcp_workspace_pool` и переключиться на резервный вариант

### План тестирования

- [ ] Ключ пула: проверка стабильности при изменении окружения, расхождение заголовков, исключение фильтра на сессию
- [ ] Жизненный цикл: совместное использование 3 сессий, льготный период очистки, дедупликация одновременного захвата, освобождение слота при сбое создания
- [ ] Двунаправленное разветвление инструментов и промптов, копия доверия на сессию, воспроизведение снимка при подключении
- [ ] Защита поколений: обработчик перед повторным подключением не перезаписывает снимок после подключения
- [ ] Сбой и повторное подключение с экспоненциальной задержкой stdio (5 с × 3) и HTTP (1/2/4/8/16 с × 5)
- [ ] Обход дочерних PID: рекурсия pgrep в Linux/macOS, PowerShell CIM в Windows
- [ ] Бюджет на уровне рабочей области: 4 сессии × бюджет=2 → максимум 3 (не 12); разветвление на все подключённые
- [ ] Возобновление LoadSession в окне очистки: повторное использование записи пула, без холодного старта
- [ ] Горячая перезагрузка конфигурации: старые/новые записи сосуществуют; старые очищаются естественным путём
- [ ] Маршрут перезапуска: избирательность по `?entryIndex=`; сохранён формат ответа для одной записи
- [ ] Выполняющийся вызов инструмента во время переподключения: отклонение `MCPCallInterruptedError`
- [ ] Автономный qwen: все существующие тесты mcp-client-manager проходят без изменений
```

## Резюме

F2 v2.1 = один PR с 6 атомарными коммитами (~6000 LOC), нацеленный на `daemon_mode_b_main`. Ключевые столпы дизайна:

1. **`McpTransportPool`** в `packages/core` (сторона дочернего ACP), с областью видимости рабочей области, счётчик ссылок + очистка 30 с
2. **Ключ отпечатка** SHA-256 над канонической конфигурацией, включая окружение/заголовки (шаблон claude-code), исключая фильтры на сессию (includeTools/trust)
3. **`SessionMcpView`** проекция реестра инструментов и промптов на сессию с копией доверия
4. **Воспроизведение снимка + защита поколений** для гонок при подключении и устаревших уведомлений
5. **Кросс-платформенный обход дочерних PID** (шаблон opencode + порт для Windows)
6. **HTTP/SSE опционально**, обход MCP в SDK, OAuth перенесено на F3
7. **Машина состояний бюджета** переводится на область рабочей области; ячейка снимка + push-события расширяются аддитивно (`scope?`)
8. **Маршруты статуса и перезапуска** рефакторинг: сначала пул с резервным вариантом начальной сессии; `entryCount` + `RestartResult[]`

**Открытые вопросы Q1–Q10** в §22 требуют решений мейнтейнеров до открытия соответствующих под-PR. Рекомендуется разрешить Q1–Q4 до начала F2-3 (они определяют общее направление); Q5–Q10 можно решать постепенно.