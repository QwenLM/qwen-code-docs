# F2: Общий пул транспорта MCP — Дизайн v2.2

> Цель — `daemon_mode_b_main` (согласно стратегии ветвления #4175). Заменяет #4175 Wave 5 PR 23.
> **Доставка одним PR** согласно указанию мейнтейнера о пакетном слиянии функционально-целостных изменений (2026-05-19).
> Автор: doudouOUC. Дата: 2026-05-20. Исправлено: 2026-05-20 (v2.2 — включены исправления по ревью).

---

## 0. Список изменений

### v2.2 (2026-05-20) — Реализация PR #4336 + 32 исправлений по ревью

PR #4336 поставил F2 в 6 атомарных коммитов + 6 исправляющих коммитов за ~4 часа. Wenshao просматривал накопительно в 3 партии; каждая партия порождала инлайн- и критические исправления, которые были влиты назад. Таблица ниже фиксирует, что изменилось по сравнению с v2.1, сгруппировано по партиям ревью.

#### v2.1 → первый раунд ревью (коммиты 1-4, wenshao C1-C7 + S1-S4)

| #   | Место                                                       | Что было не так                                                                                                                                              | Связанный коммит |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C1  | `acpAgent.ts:269` — путь закрытия IDE                      | Drain пула срабатывал только в обработчике SIGTERM; нормальное закрытие, инициированное IDE, оставляло записи утекать до очистки ОС. Зеркалировать drain пула из SIGTERM в `await connection.closed` | `ae0b296c4`      |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` сбрасывал `maxIdleTimer` при каждом флапе, нарушая жёсткий лимит из §6.3. Теперь очищается только `drainTimer`; max-idle живёт всё время жизни записи                           | `ae0b296c4`      |
| C3  | `mcp-pool-entry.ts:doRestart`                              | Сбой переподключения оставлял запись в зомби-состоянии (`localStatus=CONNECTED`, `state='active'`, устаревший снепшот). Добавлены try/catch + переход в `'failed'` при сбое                         | `ae0b296c4`      |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` устанавливался ПОСЛЕ await'ов, поэтому конкурентный `acquire` мог увидеть `'active'` и выдать устаревшее соединение. Теперь устанавливается синхронно в начале                     | `ae0b296c4`      |
| C5  | `mcp-transport-pool.ts:drainAll`                           | Конкурентный `acquire` мог породить новую запись во время drain'а. Добавлен флаг-мьютекс `draining` + `await Promise.allSettled(spawnInFlight)` перед очисткой                                     | `ae0b296c4`      |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | Слушатель не фильтровался по `serverName`; каждая запись получала уведомления о статусе всех серверов + собственный вызов `markActive` порождал эхо                                             | `ae0b296c4`      |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | Шлюз пулового режима добавлен в `discoverAllMcpTools`, но пропущен у `Incremental` — `/mcp refresh` обходил пул, порождая клиент на сессию                                                     | `ae0b296c4`      |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | В документации не отмечено, что `excludeTools` использует прямое равенство (без поддержки скобочной формы); расхождение с `mcp-client.ts:isEnabled`                                             | `ae0b296c4`      |
| S2  | докстринг `pid-descendants.ts`                             | Утверждалось наличие ветки с `taskkill /F` для Windows, которой не было — Node заменяет `process.kill('SIGTERM')` на `TerminateProcess`                                                         | `ae0b296c4`      |
| S3  | `session-mcp-view.ts:applyTools` отладочный лог            | Строка содержала литерал `"N"` вместо интерполяции; операторы видели `applied 12 tools (filtered to N registered)`                                                                              | `ae0b296c4`      |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` статусный cb | Жёстко привязан к `() => CONNECTED`, поэтому `aggregateStatusByName` врал после отключения. Теперь `() => client.getStatus()`                                                                 | `ae0b296c4`      |

#### Внутреннее ревью коммита 5 (R1-R3, небольшие)

| #   | Место                                            | Что было не так                                                                                                                                           | Связанный коммит |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | `server.test.ts:918` обёртка `/capabilities`    | Тест проверял `getAdvertisedServeFeatures()` (без тогглов), но server.ts передаёт `mcpPoolActive: opts.mcpPoolActive !== false` (включено по умолчанию). Якорь для тоггла | `3e68c00bc`      |
| R2  | `server.test.ts` покрытие включения по умолчанию | Не было теста с опциями по умолчанию для проверки рекламы пуловых тегов. Добавлен явный тест с `mcpPoolActive: false`                                      | `3e68c00bc`      |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`   | Документация говорила, что SDK до этого PR "увидят новое значение как неизвестное и отобразят общим образом" — на самом деле `MCP_RESTART_REFUSED_REASONS.has(...)` отвергает → молчаливое игнорирование | `3e68c00bc`      |
#### Пакет второй проверки (коммиты 1–5, wenshao R1–R10)

| #   | Сайт                                                | Описание проблемы                                                                                                                                                                          | Коммит слияния |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | Исправление C2 корректно сохраняло `maxIdleTimer` при переключении, но fire-action принудительно закрывал независимо от `refs.size`. Активная сессия с повторным подключением в льготном периоде теряла инструменты через 5 минут | `72399f109`    |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + повторное получение ВСЕХ на каждом проходе оставляли короткое окно с нулевыми зарегистрированными MCP-инструментами И сбрасывали каждый таймер слива. Отличие от желаемого `(name, fingerprint)` | `72399f109`    |
| WR3 | `mcp-pool-entry.ts:doRestart` рассылка снимков      | Перезапуск обновлял `toolsSnapshot`/`promptsSnapshot` и генерировал типизированные события, но ни один экземпляр `SessionMcpView` не был подписан на этот поток. Перебирать `subscribers` напрямую после создания снимка | `72399f109`    |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | Учитывал websocket в `subprocessCount` — websocket подключается удалённо, локального дочернего процесса нет. Ограничено только `'stdio'` | `72399f109`    |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | `${pid}` подставлялся напрямую в строку `-Filter`. Входная проверка `Number.isInteger` сегодня предотвращает инъекцию; привязка к `$p` для защиты в глубину от будущих ослаблений проверок | `72399f109`    |
| WR6 | `mcp-pool-entry.ts` поле `cfg` в конструкторе       | `readonly cfg: MCPServerConfig` было неявно публичным, открывая ключи API окружения, заголовки аутентификации и поля OAuth. Сделано `private`; добавлен геттер `transportKind` для единственного внешнего читателя | `72399f109`    |
| WR7 | `mcp-pool-events.ts` преждевременные экспорты       | 5 стражей типа PoolEvent + реэкспорт `Prompt` + `PoolEntryConnectionStatus` не имели ни одного вызова. Удалены; оставлен `MCPCallInterruptedError` (требование §13.4 дизайна) | `72399f109`    |
| WR8 | `acpAgent.ts:269,300` дублирование слива пула       | SIGTERM + закрытие IDE содержали одинаковые блоки `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`. Вынесен вспомогательный метод `drainPoolBeforeExit(label)` | `72399f109`    |

#### Пакет самообзора коммита 6 (R1–R3 критическая гонка)

| #   | Сайт                                    | Описание проблемы                                                                                                                                                               | Коммит слияния |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | Гонка освобождения слота: A завершает spawn, B (другой отпечаток, то же имя) начинает spawn, A сливается. Close-cb проверял только `entries` (B ещё не зарегистрирован) → преждевременное освобождение | `0e58a098f`    |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | События уровня workspace распространяются на N сессий → N приращений редьюсера; потребители, агрегирующие данные по сессиям, удваивают счёт. Документация обновлена с указанием множителя | `0e58a098f`    |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | Итерация `this.sessions.keys()` напрямую во время асинхронной рассылки; конкурентный `killSession` мог испортить итератор. Снимок через `Array.from(...)` | `0e58a098f`    |

#### Пакет третьей проверки (коммиты 1–6, wenshao W1–W15)

| #   | Сайт                                                           | Описание проблемы                                                                                                                                                                                | Коммит слияния |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | Сбой spawn навсегда утекал `statusChangeListener` — только `forceShutdown` удаляет его. Добавлен `entry.forceShutdown('manual')` в catch | `4a3c5cd90`    |
| W2  | `mcp-pool-entry.ts:statusChangeListener` перекрёстная проверка | Карта `serverStatuses` на уровне модуля разделялась между записями с разными отпечатками. Ошибка транспорта A записывала DISCONNECTED, слушатель B портил `localStatus` B. Добавлена проверка `client.getStatus()` | `4a3c5cd90`    |
| W3  | `mcp-pool-entry.ts:doRestart` очистка pid                      | Перезапуск пропускал `listDescendantPids` + `sigtermPids` — каждый перезапуск обёрнутых `npx`/`uvx` stdio-процессов оставлял сиротой реального внука MCP. Добавлена очистка перед разрывом соединения | `4a3c5cd90`    |
| W4  | `mcp-pool-entry.ts:doRestart` гонка с таймером слива           | Таймер слива мог сработать во время yield перезапуска → `forceShutdown` удаляет запись → `client.connect` порождает сироту. Добавлен `cancelDrainTimer` + установка `state→active` в начале `doRestart` | `4a3c5cd90`    |
| W5  | `mcp-client-manager.ts:pooledConnections` мёртвые дескрипторы  | Когда запись переходила в `'failed'`, менеджер держал мёртвый `PooledConnection` навсегда. Подписка на события записи; удаление при `'failed'` (идемпотентно через защиту `get(name) === conn`) | `4a3c5cd90`    |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` повторный вход | Два прохода, перекрываясь, могли оба вызвать `set(name, conn)` → первый conn утекал. Добавлен мьютекс `discoveryInFlight`; второй вызывающий ждёт того же промиса. Новый регрессионный тест | `4a3c5cd90`    |
| W9  | `acpAgent.ts:parsePoolDrainMs` строгость                       | `Number.parseInt` принимал `'30000ms'` / `'30000abc'`. Строгий regex `^\d+$`; отклонение с предупреждением в stderr + возврат значения по умолчанию | `4a3c5cd90`    |
| W10 | `mcp-transport-pool.ts:acquire` порядок indexAttach            | `indexAttach` изменял `sessionToEntries` ДО `entry.attach()`. Если `attach` выбрасывал исключение, оставалось устаревшее обратное отображение. `indexAttach` перенесён после успешного `attach` (оба пути: быстрый и в полёте) | `4a3c5cd90`    |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | Документация всё ещё утверждала `stdio + websocket` после того, как WR4 ограничил только stdio. Обновлено | `4a3c5cd90`    |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch         | Такая же утечка `statusChangeListener`, как W1, в пути без пула. То же зеркальное исправление: `forceShutdown` перед разрывом соединения | `4a3c5cd90`    |
| W15 | `bridge.ts:restartMcpServer` ответ                              | Приведение `as PoolEntries` было ненадёжным — нетипизированный JSON от дочернего ACP. Добавлена проверка `Array.isArray` + проверка формы каждой записи; некорректные записи пропускаются с сообщением в stderr | `4a3c5cd90`    |
#### Отклонено с ответом (зарегистрировано как последующие действия F2)

| #   | Участок                                                | Причина отклонения                                                                                                                                                          |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Пробелы в тестовом покрытии (4 непроверенных критических пути) | 1/4 добавлено (регрессионный тест W6); остальное отложено до PR, сфокусированного на тестовом покрытии после слияния серии F2                                                |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` не используются | Заглушки обратной совместимости для отложенного переподключения, управляемого монитором здоровья (дизайн §6.6); удаление и повторное добавление вызывает изменения в публичном типе |
| W11 | Дублирующиеся блоки присоединения быстрого пути / текущего пути | ✅ Выполнено в PR A: приватные помощники `attachPooledSession` + `rollbackReservationOnSpawnFailure` (коммит `2d546efca`)                                                     |
| W12 | `passesSessionFilter` O(M×N) на каждый `applyTools`    | ✅ Выполнено в PR A: `applyTools` / `applyPrompts` предварительно вычисляют фильтры `Set` один раз за проход; предикат становится O(1) на инструмент (коммит `a4a855ab3`) |
| R9  | Конструктор `McpClientManager` с 7 позиционными сигналами | ✅ Выполнено в PR A: конструктор через объект параметров + тестовая фабрика `mkManager` (коммит `0cb1eaa27`)                                                                    |
| R10 | Стоимость `pgrep -P <pid>` на каждый PID на каждый уровень | ✅ Выполнено в PR A: один снимок `ps -A -o pid=,ppid=` + обход BFS в памяти; pgrep BFS сохранен как запасной вариант для BusyBox <v1.28 / distroless (коммит влит как заключительная часть PR A) |

#### Количество ошибок

- **3 партии × 27 критических / важных исправлений** + 5 документальных / предложений свёрнуто = **32 влитых по результатам рецензирования всего**
- **2 критических состояния гонки, выявленных только при повторном просмотре** (гонка 6R1 при освобождении слота во время порождения; реентерабельность обнаружения W6)
- **0 незаметных сбоев выпущено** — каждое исправление содержит встроенную метку `// F2 (#4175 commit X review fix — wenshao YN):`, указывающую на исходную рецензию

### v2.1 (2026-05-20) — стратегия одного PR + 12 влитых по результатам рецензирования

| #      | Что                                                                                                             | Почему                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| V21-1  | Перешли от плана с 6 под-PR к **одному целостному PR по функциональности** с 6 атомарными коммитами             | Согласно указаниям мейнтейнера (стратегия ветвления #4175); рецензент может читать коммит за коммитом через `git log -p` |
| V21-2  | Добавлен обратный индекс `sessionToEntries: Map<sid, Set<ConnectionId>>` в пуле (§6)                            | `releaseSession` O(N записей) → O(ссылок сессии); необходимо для масштаба 1000 сессий                               |
| V21-3  | Параметр запроса `?fingerprint=` на маршруте перезапуска (§13.1)                                                | Оператор может захотеть перезапустить только одну запись, когда одно имя имеет несколько отпечатков; добавление сейчас почти ничего не стоит |
| V21-4  | Путь отказа при порождении явно освобождает зарезервированный слот (§6.1, §6.5)                                 | Иначе слот утекает до следующего прохода монитора здоровья; незаметная реальная ошибка                              |
| V21-5  | Новый §13.4: семантика вызова инструмента в полёте во время переподключения                                     | `MCPCallInterruptedError`; пул НЕ выполняет автоматический повтор (запись небезопасна)                              |
| V21-6  | Новый §10.4: `/mcp disable X` вызывает повторное применение `SessionMcpView`                                   | Иначе отключение во время сессии не удаляет уже зарегистрированные инструменты                                      |
| V21-7  | Маршрут статуса показывает `entryIndex`, а не сырой отпечаток (§8.3)                                            | Избегает раскрытия по побочному каналу ротации OAuth-токена через изменение отпечатка                              |
| V21-8  | Спецификация повторного подключения: stdio фиксированные 5 с × 3, HTTP/SSE экспоненциальные 1/2/4/8/16 с × 5 (§6.6) | v2 не указывала; HTTP требует большего бюджета повторов для колебаний сети                                        |
| V21-9  | `canonicalOAuth(o)` нормализует `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                               | Иначе функционально эквивалентные конфигурации создают разные записи                                               |
| V21-10 | Переименовал вспомогательную функцию пула из "устаревшее получение в процессе" в `createUnpooledConnection` (§5.3, §6.1) | Обход SDK MCP является постоянным, а не устаревшим                                                                |
| V21-11 | `drainAll(opts?)` возвращает `Promise<void>` с бюджетом `timeoutMs` по реальному времени (§17)                  | Вызывающему нужно знать, когда завершится слив, для упорядочивания завершения работы                               |
| V21-12 | Зафиксированы имена полей редуктора SDK (Q1 решено): сохранить `mcpBudgetWarningCount` и т.д. с семантикой области видимости в JSDoc | Нет переименований публичного API во время PR                                                                      |
| V21-13 | Зафиксированы Q3 (пул включён по умолчанию, аварийный выключатель `--no-mcp-pool`), Q4 (HTTP/SSE по согласию), Q6 (жадное создание) | Доставка в одном PR; шлюзование флагами не требуется                                                               |
| V21-14 | Добавлены риски одного PR R9/R10/R11 (§23)                                                                      | Усталость рецензента, конфликт слияния daemon_mode_b_main, время CI                                                |
| V21-15 | Обработка осиротевших записей при удалении расширения отложена до естественного удаления по `MAX_IDLE_MS` (§16.3) | Нет явного `invalidateByExtension`; сохраняет единообразие модели                                                  |
### v2 (2026-05-20) — первоначальные исправления из черновика v1

| #   | Что                                                                                                  | Зачем                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | Пул распространяется на **Tools + Prompts** (раньше: только tools)                                    | Конструктор `McpClient` принимает оба реестра; иначе prompts в режиме пула бесшумно теряются |
| C2  | Новый раздел о **сосуществовании глобального состояния** (`serverStatuses` / `mcpServerRequiresOAuth` — map-ы модуля) | Межсессионное разделение уже существует сегодня; пул наследует + формализует                |
| C3  | Фабричный путь `connectToMcpServer` **унифицирован** с классом `McpClient` в F2-1                    | v1 рефакторила только класс; оставался бы параллельный непуллируемый путь                   |
| C4  | Воспроизведение снапшота при подключении (в стиле earlyEvents) добавлено в `PoolEntry.attach()`      | Новая гонка: сессия-B подключается → сервер отправляет `tools/list_changed` до настройки подписки |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` для дедупликации конкурентных захватов        | v1 упоминалось в тестовой матрице, но отсутствовало в контракте реализации                  |
| C6  | Кроссплатформенная чистка дочерних процессов (pgrep на Linux/macOS, wmic/PowerShell на Windows)      | v1 говорило "скопировать `pgrep -P` из opencode" — это только Unix                           |
| C7  | Поле `trust` для каждой сессии — **копия** объекта инструмента                                        | trust хранится на `DiscoveredMCPTool`; общий экземпляр смешивал бы trust между сессиями     |
| C8  | Транспорты HTTP/SSE **opt-in** для пуллинга (по умолчанию только stdio + websocket)                  | Некоторые MCP HTTP серверы хранят состояние на транспорт; совместное использование рискует смешиванием состояний |
| C9  | Явный обход SDK MCP сервера (`isSdkMcpServerConfig`)                                                 | `sendSdkMcpMessage` по дизайну выполняется для каждой сессии                               |
| C10 | OAuth путь **явно отложен до F3**                                                                    | Поток OAuth требует маршрутизации в стиле PermissionMediator; не входит в объём F2          |
| C11 | Специфицирована семантика маршрута перезапуска (имя → все подходящие записи)                           | `POST /workspace/mcp/:server/restart` из PR 17 ранее было однозначным (1 запись); теперь 1..N |
| C12 | Раздел рефакторинга статусного маршрута (новый путь: `QwenAgent.getMcpPoolAccounting()`)              | `httpAcpBridge.ts:733-770` сейчас читает менеджер начальной сессии — необходимо изменить     |
| C13 | Счётчик поколений на `PoolEntry` для защиты от устаревших обработчиков `tools/list_changed`          | Паттерн в opencode: `if (s.clients[name] !== client) return`                               |
| C14 | Разбивка под-PR: 4 → **6**                                                                           | v1 недооценила; A2, B1, B3, C6 добавляют реальную работу                                    |
| C15 | Ленивое создание пула (только когда N≥2 сессий) — опционально                                        | `qwen serve --foreground` с одной сессией не даст выгоды; сберегает затраты на инициализацию |

---

## 1. Цели / Не-цели

**Цели**

- N сессий в 1 рабочем пространстве, совместно использующих 1 процесс на уникальную конфигурацию сервера — по ключу-отпечатку
- Сохранение представлений `ToolRegistry` / `PromptRegistry` для каждой сессии (фильтрация, доверие)
- Устойчивый жизненный цикл с подсчётом ссылок и graceful drain, допускающий повторное подключение
- Кроссплатформенная очистка дочерних процессов
- Ограничители бюджета переходят с уровня сессии на уровень рабочего пространства (обещано в PR 14)
- Обратная совместимость с не-демонским standalone qwen (пул там не создаётся)

**Не-цели (объём F2)**

- Совместное использование пула между рабочими пространствами (1 демон = 1 рабочее пространство — инвариант из PR #4113 сохраняется)
- Совместное использование пула между демонами (выходит за рамки — территория многопроцессного оркестратора)
- Переработка маршрутизации OAuth (F3 с `PermissionMediator`)
- Сохранение пула между перезапусками демона (только в памяти)
- Автоопределение «пул-безопасных» HTTP серверов (только флаг opt-in)
- Сравнение `MCPServerConfig` на лету для мутации записей на месте (изменение конфигурации → новая запись, старая дренируется)

---

## 2. Текущее состояние (что заменяется)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Карта связей (что нужно разорвать или пробросить):**
| Связывание                                                                       | Расположение                                      | Действие в F2                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Конструктор `McpClient` привязывает 1 ToolRegistry + 1 PromptRegistry            | mcp-client.ts:106-119                             | Пул владеет транспортом; `SessionMcpView` (на сессию) владеет реестрами сессии                      |
| `McpClient.discover()` вызывает `toolRegistry.registerTool()` инлайн            | mcp-client.ts:178-198                             | Разделение: `discoverAndReturn()` возвращает снимок; представление регистрирует                     |
| Обработчик `ListRootsRequestSchema` замыкается на `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Единый контекст, привязанный к рабочей области пула                                               |
| Прослушиватель `workspaceContext.onDirectoriesChanged` регистрируется на каждое подключение | mcp-client.ts:907                                 | Пул регистрируется один раз на запись                                                              |
| `McpClientManager` создаётся внутри ToolRegistry                                  | tool-registry.ts:199                              | Добавить опциональный параметр `pool?` в конструктор; инъекция из Config                            |
| Контроль бюджета на сессию                                                        | mcp-client-manager.ts:91-95 comment               | Переместить конечный автомат в пул                                                                |
| `serverDiscoveryPromises` дедупликация выполняющихся запросов на сервер           | mcp-client-manager.ts:350                         | Пул имеет `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                                   |
| `setMcpBudgetEventCallback` регистрация на сессию                                 | acpAgent.ts:1851-1899                             | Пул генерирует событие → `QwenAgent` транслирует всем сессиям                                      |

**Уже разделяемое состояние (пул наследует, не вносит новое):**

| Состояние                                       | Расположение                              | Примечание                                                        |
| ----------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>`  | mcp-client.ts:292 (уровень модуля)        | Сейчас общепроцессное; ключ пула всё ещё по имени → «любой-CONNECTED-выигрывает» |
| `mcpServerRequiresOAuth: Map<string, boolean>`  | mcp-client.ts:302 (уровень модуля)        | То же                                                             |
| `MCPOAuthTokenStorage` токены на диске           | `~/.qwen/mcp-oauth/<name>.json`           | Разделяется демоном; пул просто использует эффективнее            |

---

## 3. Результаты исследования

| Проект          | Пул?              | Ключ                                                 | Жизненный цикл                                                                                        | Паттерны для заимствования                                                                                                   |
| --------------- | ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | Нет, на процесс   | `name + JSON.stringify(cfg)` (lodash.memoize)        | `clearServerCache` + удалённая отсрочка×5; сбой stdio → `failed`                                       | SHA-256 по отсортированному ключу `hashMcpConfig` для инвалидации / ключа                                                    |
| **opencode**    | Да, на рабочую область | только **имя сервера** (без хеша конфигурации)      | Нет счётчика ссылок / нет вытеснения / нет перезапуска; финализатор Effect + `pgrep -P` рекурсивный SIGTERM | Очистка процессов-потомков, защита устаревшего обработчика (`if (s.clients[name] !== client) return`), разветвление `tools/list_changed` через шину событий |

**Что F2 заимствует от каждого:** хеш конфигурации от claude-code (обрабатывает расхождения env/аутентификации между сессиями, чего нет в opencode), очистка процессов-потомков от opencode (обёртки npx/uvx порождают утечки). Что добавляем своё: счётчик ссылок + слив (многоклиентный демон), автоматический перезапуск (долгоживущий демон), разветвление запросов, защита генерации.

---

## 4. Архитектура

### 4.1 Схема процессов

```
HTTP-демон (packages/cli/src/serve, qwen serve)
  │ порождает
  ▼
Дочерний ACP (qwen --acp, один процесс на рабочую область)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── новый, в рамках рабочей области, 1 экземпляр
  │     ├── записи: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (привязан к рабочей области демона)
  │     └── защитные ограничения бюджета (конечный автомат PR 14, перенесён в рабочую область)
  │
  └── сессии: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ пул внедрён     │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   устаревший внутрипроцессный
                                  → SessionMcpView            (автономный qwen)
                                    .applyTools/Prompts
                                    (фильтр + регистрация в
                                     собственные реестры сессии)
```
**Пул находится в ACP-дочернем процессе**, а не в HTTP-демоне. HTTP-демон опрашивает состояние пула через существующую поверхность extMethod `bridge.client` (`getMcpPoolAccounting`, `restartMcpServer`). Код F2 находится в **`packages/core/src/tools/`** (на одном уровне с `mcp-client-manager.ts`), а не в `packages/acp-bridge/`.

### 4.2 Диаграмма классов

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (массовое освобождение для завершения сессии)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (в масштабе рабочей области)
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

PooledConnection (дескриптор, возвращаемый вызывающему)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (на сессию, на сервер)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (фильтрует по include/exclude, декорирует доверие)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (удаляет свои регистрации)
```

---

## 5. Ключ пула (отпечаток)

### 5.1 Хэшированные канонические поля

```ts
type PoolKey = string; // sha256 hex, first 16 chars sufficient (collision-free for realistic N)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] sorted by k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: normalize functionally-equivalent OAuth configs so they
 * collapse to the same fingerprint. `{enabled: false}`, `undefined`,
 * `null`, and `{}` all mean "no OAuth" → all return `null`.
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

// Excluded fields (per-session filters, NOT transport-level):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Группировка по типу транспорта

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**По умолчанию `pooledTransports = {stdio, websocket}`** . Операторы могут включить HTTP/SSE через:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Переменная окружения: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Почему HTTP/SSE по умолчанию исключены**: некоторые реализации MCP HTTP-серверов привязывают состояние (контекст аутентификации, память диалога) к TCP/SSE-потоку; совместное использование в нескольких ACP-сессиях привело бы к утечке состояния. stdio и websocket — это полноценные OS-процессы, чьё состояние наблюдаемо и изолируемо.

### 5.3 Обход SDK MCP

Если `isSdkMcpServerConfig(cfg)` истинно → пул возвращает тонкую обёртку `PooledConnection` через `createUnpooledConnection(name, cfg, sid)`, которая немедленно создаёт `McpClient`, без разделения, без сохранения записи в пуле. Причина: `sendSdkMcpMessage` по замыслу выполняется для каждой сессии (маршрутизируется через управляющую плоскость ACP обратно в исходную сессию). Тот же путь используется для HTTP/SSE, когда транспорт не входит в `pooledTransports` (§10.3).

V21-10: имя — `createUnpooledConnection`, а не `legacyInProcessAcquire` — SDK MCP и HTTP-opt-out являются постоянными проектными решениями, а не устаревшим кодом.

---

## 6. Жизненный цикл

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: reverse index, O(refs) releaseSession instead of O(entries). */
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
          // V21-4: release reserved slot on spawn failure. Without
          // this, slot leaks until health monitor's release path
          // runs (which it doesn't, because there's no entry to monitor).
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

  /** V21-2: O(refs of this session), not O(all entries). */
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
### 6.2 Дедупликация конкурентного acquire (`spawnInFlight`)

Зеркалирует `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350). Без этого 5 сессий, запускающихся при загрузке, все видят `entries.has(id) === false` и конкурируют за запуск 5 дочерних процессов.

### 6.3 Льготный период слива + предельное время бездействия

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // grace after last release
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // hard cap (defense against drain cancellation loop)
```

Машина состояний в `PoolEntry`:

```
spawning ──spawn ok──► active ──last detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (cancel timer)
   spawn fail───────────►failed
                          │
                          └──manual restart──► spawning
```

Жесткий предел бездействия: таймер слива можно бесконечно отменять и перезапускать (переключения acquire/release). `MAX_IDLE_MS` — это отдельный таймер, запускаемый **при первом простое** и никогда не сбрасываемый; когда он срабатывает, принудительное закрытие выполняется даже если в данный момент активен льготный период слива. Предотвращает появление зомби-записей пула от проблемных клиентов, которые хаотично вызывают acquire/release.

### 6.4 Кросс-платформенный обход дочерних PID

**Обновление R10 / R23 T7 / PR A (2026-05-22)**: перешли от BFS по каждому PID (вызов одного `pgrep -P <pid>` / `Get-CimInstance -Filter` на узел) к единому снимку таблицы процессов с последующим обходом дерева в памяти. Две причины: (1) один форк вместо B^D форков на горячем пути завершения пула; (2) согласованность снимка — до исправления BFS мог пропустить потомков, которые форкнулись между соседними уровнями BFS. Путь по каждому PID сохранен как запасной для BusyBox `ps` <v1.28 (без поддержки `-o`) и контейнеров distroless без `ps`.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS reaps orphans; pool shutdown still proceeds.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* fall through to fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(descendants), 1 fork
  return await listDescendantPidsUnixPgrepFallback(root); // legacy BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: all processes (POSIX, equivalent to -e but unambiguous on BSD).
  // -o pid=,ppid=: pid + ppid columns, trailing `=` suppresses headers.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // covers >250k-process pathological hosts
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parse, push into childrenByPpid */
  }
  return childrenByPpid;
}

// Windows: single Get-CimInstance Win32_Process | ConvertTo-Csv snapshot
// of all (ProcessId, ParentProcessId) rows + in-memory walk; per-pid
// `Get-CimInstance -Filter "ParentProcessId=$p"` retained as fallback.
```

Вызывается из `PoolEntry.shutdown()` перед `client.disconnect()`. Обрабатывает утечки обёрток `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Ограничения MAX_DESCENDANTS=256 / MAX_DEPTH=8 сохранены.

### 6.5 Обработка сбоев запуска

Если `spawnEntry` отклоняет после того, как несколько подписчиков прикрепились (через `spawnInFlight`):

- Все ожидающие получают отклонение.
- `tryReserveSlot` освобождается **через явную ветвь `.catch` в `acquire`** (V21-4); без этого исправления слот утекал до следующего прохода монитора здоровья, который никогда не выполнялся, поскольку не было записи для мониторинга.
- Ошибочная запись НЕ сохраняется в `entries`.
- Пути кода подписчиков обрабатывают это так, как если бы `acquire` изначально завершился ошибкой (существующая логика catch в `discoverMcpToolsForServer` для каждой сессии остается валидной).

### 6.6 Экспоненциальная задержка переподключения (V21-8)

Когда `PoolEntry` входит в режим переподключения после обрыва транспорта:

| Транспортное семейство | Стратегия                                          | Предел                                                                                       |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| stdio                  | Фиксированная 5 с × 3 попытки                      | В соответствии с существующим `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`                        |
| websocket              | Фиксированная 5 с × 3 попытки                      | Аналогично stdio                                                                             |
| http (опционально)     | Экспоненциальная 1 с, 2 с, 4 с, 8 с, 16 с × 5 попыток | Удалённые конечные точки флаттят при временных сетевых проблемах; больший бюджет            |
| sse (опционально)      | Экспоненциальная 1 с, 2 с, 4 с, 8 с, 16 с × 5 попыток | Аналогично http
После исчерпания лимита: запись переходит в состояние `failed`; подписчики получают событие `failed`; новый `acquire` для того же `ConnectionId` порождает повторную попытку один раз, затем выдаёт исключение. Перезапуск оператора (§13) сбрасывает состояние.

---

## 7. Discovery / SessionMcpView

### 7.1 Двойной fan-out для Tools + Prompts

```ts
// packages/core/src/tools/mcp-client.ts — разделение discover на чистую функцию
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
      throw new Error('На сервере не найдены ни промпты, ни инструменты.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// Устаревший discover() сохранён, делегирует discoverAndReturn + регистрация (для standalone версии qwen)
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
      // C7: копия доверия на уровне сессии (не мутировать общий snapshot)
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

### 7.2 Воспроизведение snapshot при attach (стиль earlyEvents)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Немедленно воспроизводим текущий snapshot, чтобы подписчик не пропустил
    // обновления, которые поступили между завершением in-flight discover и
    // моментом attach.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Зеркалирует подход `BridgeClient.earlyEvents` из исправления PR 14b #1 — решает аналогичную гонку при присоединении к пулу.

### 7.3 Защита устаревших обработчиков (счётчик поколений)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // заменено другим reconnect
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
      .catch(/* подавить + залогировать */);
  };
}
```

Без этого устаревший обработчик от экземпляра Client до переподключения мог бы перезаписать snapshot после переподключения устаревшими данными.

**Инвариант монотонности** (уточнение V21): `generation` только увеличивается, никогда не сбрасывается. Любая in-flight операция захватывает `myGen` при входе, затем после `await` проверяет `myGen === this.generation`. Эквивалентно: «с момента моего старта не произошло событие, которое меня заменяет». Ограничено значением Number.MAX_SAFE_INTEGER (~285 тысяч лет при частоте переподключений 1 Гц), переполнение не угрожает.

### 7.4 Унификация путей (расширение области действия F2-1)

В `packages/core/src/tools/mcp-client.ts` существует ДВА пути подключения к серверу:

1. Класс `McpClient` (mcp-client.ts:100) — используется `McpClientManager`
2. Фабричная функция `connectToMcpServer` (mcp-client.ts:875) — используется `discoverMcpTools` (строка 560) и `connectAndDiscover` (строка 607)

F2-1 должен свести оба пути за `McpClient.discoverAndReturn` (чтобы `connectToMcpServer` стал приватным помощником `McpClient` или оба вызывали общий примитив `establishConnection()`). Иначе пул покрывает только путь через класс; фабричный путь остаётся для каждой сессии и подрывает все усилия.

---

## 8. Сосуществование глобального состояния

### 8.1 `serverStatuses` (mcp-client.ts:292) — запись с коллизионной терпимостью

Модульный уровень `Map<serverName, MCPServerStatus>`. `ConnectionId` пула — `name::hash`, но `updateMCPServerStatus(name, status)` записывает по имени. **Несколько записей пула для одного имени (разные отпечатки, например, расхождение токенов) будут затирать статусы друг друга.**
**Разрешение**: пул перехватывает записи статуса:

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
    // Any CONNECTED ⇒ CONNECTED
    // Else any CONNECTING ⇒ CONNECTING
    // Else DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

Маршрут статуса отображает `entryCount: number`, чтобы операторы видели, когда одному имени соответствует несколько записей.

### 8.2 Хранение OAuth-токенов

`MCPOAuthTokenStorage` записывает данные в `~/.qwen/mcp-oauth/<serverName>.json` — уже доступно для общего использования демоном. Пул выигрывает косвенно (первая сессия завершает OAuth → токен на диске → переподключение записи пула подхватывает токен → все остальные сессии используют его).

**Предостережение — случай нескольких отпечатков**: 2 записи для одного имени (разные заголовки/окружение) с одним и тем же провайдером OAuth → обе читают один и тот же файл токена. Если токены привязаны к серверу (типично для OAuth), это работает. Если токены привязаны к окружению (редко), требуется явное расширение ключа хранения. **Откладываем до F3** с документированным известным ограничением.

### 8.3 `entryCount` в снимке

Ячейка на сервер в `GET /workspace/mcp` дополняется:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // НОВОЕ — N записей пула для этого имени
  entrySummary?: [                        // НОВОЕ — недетализированная разбивка по записям
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` — **стабильное непрозрачное целое число**, присваиваемое при создании записи (порядок вставки внутри группы одного имени), а НЕ исходный отпечаток. Обоснование: отпечаток меняется при ротации OAuth-токенов или переменных окружения, что могло бы раскрыть эту информацию через различия в снимках (оператор мог бы сделать вывод "токен ротирован через T+5 мин" по переходу `'a3b1' → 'f972'`). `entryIndex` монотонно возрастает внутри группы одного имени, но остаётся стабильным при ротации, поскольку старая запись завершается, а новая получает следующий индекс.

Старые SDK-клиенты игнорируют неизвестные поля по контракту PR 14; новые используют `entryCount` для бейджей. Внутренний путь перезапуска по отпечатку использует непрозрачный токен, возвращаемый только через привилегированный extMethod, и не раскрывается в HTTP-снимке.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Единая регистрация

Экземпляры `McpClient` пула совместно используют **один** `WorkspaceContext` — привязанный контекст рабочей области демона (инвариант PR #4113). Обработчик `ListRootsRequestSchema` в `connectToMcpServer` замыкается на этот единый контекст.

Прослушиватель `onDirectoriesChanged` регистрируется **один раз на запись**, а не один раз на `acquire`. Отключается при завершении записи.

### 9.2 `roots/list_changed` — распространение вверх

Сервер уведомляет клиента о новых корнях → пул распространяет:

- Пул повторно обнаруживает (сервер может сообщить о другом наборе инструментов с новыми корнями) → событие `toolsChanged` → все представления подписчиков переприменяются.

### 9.3 `updateWorkspaceDirectories` на сессию

**Контракт**: в режиме B добавления директорий на сессию являются мягкой подсказкой, а не авторитетным источником. `WorkspaceContext` пула находится на уровне демона.

Два варианта реализации:

- **v1 простой**: игнорировать добавления на сессию, выводить предупреждение при обнаружении
- **v2 объединение**: пул хранит `extraRoots: Map<sessionId, Set<dir>>`, обработчик ListRoots возвращает объединение привязанной рабочей области + всех дополнительных. Удаление на сессию вызывает `roots/list_changed`. Добавляет 50-80 LOC сложности.

**Выбираем v1 простой для F2**; v2 объединение — как дальнейшее улучшение, если возникнут проблемы у пользователей.

---

## 10. Внедрение на сессию

### 10.1 `mcpServers` из `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` объединяет внедрённый список с `settings.merged.mcpServers` (acpAgent.ts:1778-1831). Пул использует **объединённое представление на сессию**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...существующий setMcpBudgetEventCallback УДАЛЁН — пул обрабатывает трансляцию напрямую
}
```

Когда две сессии внедряют сервер с одним именем, но разными env/заголовками → разные отпечатки → две записи пула. Совместное использование пула срабатывает только при полном совпадении настроек сессий.

### 10.2 Расхождение аутентификации

Статические `~/.qwen/settings.json` mcpServers одинаковы для всех сессий → все совместно используют → 80% случаев. Внедрённые на сессию mcpServers с персональными токенами → уникальные отпечатки → без совместного использования. Оба варианта безопасны.

### 10.3 HTTP-транспорт по требованию (повтор из §5.2)

По умолчанию `pooledTransports = {stdio, websocket}`. Серверы HTTP/SSE проходят через путь `createUnpooledConnection` (один McpClient на сессию), если оператор не решит иначе.

### 10.4 `/mcp disable X` в середине сессии (V21-6)

Когда оператор выполняет `/mcp disable github` против активной сессии:
1.  `Config.disableMcpServer('github')` добавляет имя в множество `disabledMcpServers` в рамках данной конфигурации (`per-Config`).
2.  **Хук F2**: срабатывает `Config.onDisabledMcpServersChanged`; `SessionMcpView` для этого имени вызывает `teardown()` (удаляет свои регистрации инструментов/запросов из сессионных реестров).
3.  **Запись в пуле может остаться живой**, если на неё ссылаются другие сессии (refcount > 0) — отключается только представление отключающей сессии.
4.  Если все сессии отключат → refcount → 0 → запускается таймер очистки (drain timer).

Без шага 2 отключение в середине сессии оставило бы уже зарегистрированные инструменты в `ToolRegistry` сессии до следующего перезапуска. Тест 21.4 покрывает это.

`/mcp enable github` — обратная операция: запускает свежий `pool.acquire` для сессии, присоединяет новое представление (view), повторно применяет снэпшот.

---

## 11. Эволюция бюджетных ограничений (Budget Guardrails Graduation)

### 11.1 Конечный автомат перемещается в пул

`tryReserveSlot` / `releaseSlotName` / гистерезис 75% / объединение `refused_batch` / `bulkPassDepth` / `pendingRefusalNames` — всё переезжает из `McpClientManager` в `McpTransportPool`. `McpClientManager` сохраняет это состояние только при работе в автономном режиме (без инжектированного пула).

### 11.2 Область действия ячейки снэпшота (Snapshot cell scope)

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // НОВОЕ значение (в PR 14 v1 было 'session')
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

Согласно контракту PR 14: "Потребители ДОЛЖНЫ допускать дополнительные записи с неизвестными значениями scope (игнорировать, не падать)." Старые клиенты SDK видят `scope: 'workspace'`, отображают как неизвестное (или с запасными верхнеуровневыми числами). Новый SDK добавляет вспомогательную функцию `isWorkspaceScopedBudget(cell)`.

### 11.3 Распространение событий (Event fan-out)

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
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 Изменения контракта типов SDK

PR 14b экспортировал следующее (должно расширяться аддитивно):

- `DaemonMcpBudgetWarningData` — добавлено `scope?: 'workspace' | 'session'` (необязательное для обратной совместимости; при отсутствии = 'session')
- `DaemonMcpChildRefusedBatchData` — то же расширение `scope?`
- `DaemonMcpGuardrailEvent` — дискриминатор без изменений

Новые вспомогательные функции SDK:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

Состояние редьюсера в `DaemonSessionViewState`:

- **Новых полей нет** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` увеличиваются независимо от scope (scope — это свойство каждого события, а не отдельный поток)
- Документировать, что в F2 эти счётчики отражают события рабочего пространства, разосланные во все сессии — они будут увеличиваться **одновременно во всех подключённых сессиях** при наступлении бюджетного давления

**V21-12 (Q1 решено, зафиксировано в v2.1)**: сохранить существующие имена полей (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) с расширенной семантикой scope, документированной в JSDoc:

```ts
/**
 * Количество событий `mcp_budget_warning`, которые наблюдала сессия.
 * В F2 (`scope: 'workspace'`) увеличивается одновременно
 * во всех подключённых сессиях, поскольку бюджетные события
 * рассылаются на уровне рабочего пространства. Используйте
 * `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`,
 * чтобы проверить scope последнего события.
 */
mcpBudgetWarningCount: number;
```

Обоснование: PR 14b уже поставил эти имена как публичную поверхность SDK; переименование — это ломающее изменение, которое хуже, чем слегка неточная семантика.

---

## 12. OAuth — явный перенос на F3

Резервный механизм OAuth 401 в `connectToMcpServer` (mcp-client.ts:950-1010) требует интерактивного разрешения (открытие браузера или device-flow). Демон режима B **не должен запускать браузер** (по дизайну PR 21 — статический поиск по исходникам завалит сборку при обнаружении `open`/`xdg-open`/`shell.openExternal`).

**Поведение F2 на сервере, требующем OAuth**:

1. Первый вызов acquire запускает `connectToMcpServer` → обнаружена 401
2. Пул перехватывает исключение "требуется OAuth", помечает запись как `failed_auth_required`
3. Маршрут статуса показывает `errorKind: 'auth_env_error'` (существующий errorKind из PR 13)
4. Пул **не повторяет попытки автоматически**
5. Оператор выполняет `/mcp auth <name>` (существующий CLI) ИЛИ использует device-flow маршрут из PR 21 для получения токена на диске → следующий вызов acquire для сессии повторяет попытку и успешно завершается

**F3 заменит шаги 4–5** на использование `PermissionMediator` для маршрутизации запроса завершения OAuth к подключённым сессиям, чтобы первая ответившая обработала.

Это позволяет избежать смешивания кода F2 с работой автомата состояния аутентификации.

---

## 13. Семантика маршрута перезапуска (Restart Route Semantics)

### 13.1 `POST /workspace/mcp/:server/restart` в пуле

Сейчас (PR 17): перезапуск в менеджере начальной сессии = перезапуск единственной записи для этого имени.

В пуле: имя → несколько записей (разные отпечатки для одного имени = разные сессии с разными конфигурациями).
**Установленное поведение**:

| Запрос                                                   | Поведение                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`                    | Перезапуск **всех** записей, соответствующих `serverName` (параллельно с помощью `Promise.allSettled`)                                   |
| `POST /workspace/mcp/:server/restart?entryIndex=0`       | V21-3: перезапуск только записи #0 (непрозрачный индекс из снимка §8.3); 404, если не найдена                                            |
| `POST /workspace/mcp/:server/restart?entryIndex=*`       | Явное указание "all" (то же, что и без параметра)                                                                                         |

Форма ответа:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: opaque index, not raw fingerprint
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

Старая форма `{restarted: true, durationMs}` сохраняется, когда `entries.length === 1` И отсутствует параметр `entryIndex`, для обратной совместимости; клиенты могут обнаружить новую форму, проверяя `'entries' in response`.

### 13.2 Дедупликация перезапусков в процессе выполнения

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

Перед перезапуском пул проверяет бюджет: если отключение и повторное подключение всё ещё укладываются, то ОК. Семантика из текущего PR 17 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` сохранена (теперь применяется для каждой записи).

### 13.4 Вызов инструмента в процессе выполнения при переподключении (V21-5, новое)

Сессия A вызывает `pool.callTool('git.commit', args)` → запрос попадает в stdin дочернего процесса → дочерний процесс аварийно завершается во время записи → запись переходит в переподключение:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // pre-reconnect generation
  readonly args: unknown;              // original args, for caller to retry if safe
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Спецификация**:

- Промис выполняющегося вызова отклоняется с `MCPCallInterruptedError` как только обнаружено падение транспорта (не ждать переподключения)
- Пул **НЕ выполняет автоматический повтор** вызова; семантика небезопасна для операций записи (commit, редактирование файла и т.д.), и пул не может отличить чтение от записи
- Вызывающая сторона (обычно уровень выполнения инструментов в цикле агента) перехватывает эту ошибку и решает: повторить / показать пользователю / прервать
- После переподключения: сессия A может вызвать снова (тот же `PooledConnection.callTool`); пул прозрачно направляет вызов к новому экземпляру транспорта
- `MCPCallInterruptedError.clientGeneration` позволяет вызывающей стороне сопоставить с последующим событием `reconnected` при необходимости

Тест 21.6 должен охватывать: запустить долгоживущий stdio MCP, отправить вызов инструмента, убить дочерний процесс во время вызова, проверить отклонение с `MCPCallInterruptedError` и ненулевым `clientGeneration`.

---

## 14. Рефакторинг маршрута статуса

### 14.1 Новый путь запроса

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — replace data source
let accounting: McpClientAccounting | undefined;
try {
  // NEW: query pool directly via bridge extMethod, not bootstrap session
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback to legacy bootstrap session path for non-pool daemon
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

Дочерние процессы ACP связываются через `extMethod` для вызова демоном.

### 14.2 entryCount + entrySummary

Согласно §8.3.

### 14.3 Случай без bootstrap-сессии

Сейчас (PR 12), когда демон простаивает (ещё нет сессий), `GET /workspace/mcp` возвращает `initialized: false`, потому что нет bootstrap-сессии для запроса.

При пуле: пул существует с конструктора `QwenAgent` → маршрут статуса может возвращать живую учётную информацию **даже при нулевом количестве сессий**. Ячейка `initialized: true` даже до первого сеанса. **Задокументированное изменение поведения** в описании PR; не регрессия.

---

## 15. Взаимодействие loadSession / resume (PR 6 #4222)

### 15.1 Отмена таймера завершения при возобновлении

```
session-A active, holds entry-X ref
session-A disconnect (no explicit close) → eventually killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → drain timer starts (30s)
session-A resume within 30s → new newSessionConfig → pool.acquire returns entry-X → attach cancels drain
session-A resume after 30s → entry-X already closed → pool spawns new entry (cold start)
```

### 15.2 Окно кэша `restoreState` (5 мин, из PR 6)
`acpAgent.restoreState` удерживается в течение 5 мин после отключения. Слив пула (по умолчанию 30 с) < окно восстановления (5 мин) → возобновление между 30 с и 5 мин приводит к холодному старту MCP. Приемлемый компромисс (само возобновление — редкий путь).

Альтернатива: пул считывает конфигурацию окна восстановления демона и расширяет слив до соответствия. Это добавляет связность между пулом и конечным автоматом сессии; **отложить до последующего, если пользователи не сообщат о проблемах с холодным стартом**.

### 15.3 Взаимодействие `pendingRestoreIds`

`acpAgent.killSession()` должен вызывать `pool.releaseSession(sid)` ПОСЛЕ очистки `pendingRestoreIds`. Порядок:

1. Сессия помечена как восстанавливаемая (`pendingRestoreIds.add(sid)`)
2. Session.close() — но ссылка на пул всё ещё удерживается
3. После истечения `RESTORE_WINDOW_MS` без возобновления: `killSession` окончательно очищает → `pool.releaseSession(sid)` запускает слив

Избегает запуска слива в течение окна восстановления.

---

## 16. Горячая перезагрузка конфигурации

### 16.1 Неявная перезагрузка через изменение отпечатка

Пользователь редактирует `~/.qwen/settings.json` на лету, меняет окружение сервера:

1. Старые сессии сохраняют старый снимок `Config`/`McpServers` → продолжают получать старый отпечаток → запись-OLD сохраняется
2. Новая сессия читает свежие настройки → новый отпечаток → создается запись-NEW → сосуществует с записью-OLD
3. Старые сессии естественным образом закрываются → запись-OLD сливается → в итоге закрывается
4. Стабильное состояние: остается только запись-NEW

**Без изменения активных соединений на лету** — чистое разделение между сессиями с разными версиями конфигурации.

### 16.2 Принудительный маршрут перезагрузки (опционально)

```
POST /workspace/mcp/reload-all
  → для каждой сессии: перезагрузить настройки, заменить Config.mcpServers
  → для каждой записи, на которую больше нет ссылок: запланировать вытеснение
```

Полезно, когда пользователь изменил переменные окружения и хочет немедленного эффекта во всех сессиях. Отложить до последующего F2 (не блокирует).

### 16.3 Осиротевшие записи при удалении расширения (V21-15)

Сценарий: расширение `foo-ext` регистрирует MCP-сервер `foo-server`. Оператор запускает `/extension uninstall foo-ext`. Жизненный цикл расширения удаляет `foo-server` из `extensionMcpServers`, поэтому последующие вызовы `loadCliConfig` не включают его. Но:

- Активные сессии хранят снимки `Config`, которые всё ещё содержат `foo-server` → эти сессии продолжают использовать запись
- Новые сессии после удаления не получают сервер (он больше не в их объединенных mcpServers) → счетчик ссылок не увеличивается

**Решение**: полагаться на естественный слив. По мере закрытия старых сессий счетчик ссылок падает; в конце концов запись достигает `MAX_IDLE_MS = 5 мин` и принудительно закрывается. **Нет явного API `pool.invalidateByExtension(name)`** — сохраняет единообразие модели с горячей перезагрузкой конфигурации (§16.1).

Компромисс: сервер расширения может работать до 5 мин после удаления, если его поддерживает долгая сессия. Приемлемо; операторы могут запустить `/mcp restart foo-server`, затем убить сессию, если требуется срочность.

---

## 17. Порядок завершения работы

Последовательность `QwenAgent.close()` (должна соблюдаться):

```
1. Установить acceptingNewSessions = false; отклонять новые POST /session
2. Для каждого выполняющегося запроса: отправить сигнал отмены, дождаться завершения (существующий PR 11 жизненного цикла)
3. Для каждой сессии: запустить close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← обходит 30-секундный льготный период
   ├── Для каждой записи: отменить таймеры слива и здоровья, пометить как сливаемую
   ├── Для каждой записи параллельно: listDescendantPids → SIGTERM дочерним процессам
   ├── Для каждой записи параллельно: client.disconnect()
   └── Promise.race с timeoutMs; брошенные записи получают SIGKILL
5. Закрыть канал бриджа
6. Выход из процесса
```

**V21-11**: сигнатура `drainAll`:

```ts
async drainAll(opts?: {
  force?: boolean;       // по умолчанию false; true обходит 30-секундный льготный таймер
  timeoutMs?: number;    // по умолчанию 10_000; бюджет реального времени; после него SIGKILL отставшим
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // записи, корректно отключившиеся
  forced: number;        // записи, убитые SIGKILL после тайм-аута
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

Вызывающий использует `DrainResult` для логирования завершения работы; при `forced > 0` записывает предупреждение, чтобы оператор знал, что сервер не завершился корректно.

---

## 18. Структура файлов

**Новые файлы:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool main (~700 строк)
  mcp-pool-key.ts              # отпечаток + вспомогательные функции canonicalize (~150 строк)
  mcp-pool-entry.ts            # PoolEntry: счетчик ссылок + слив + здоровье + поколение (~500 строк)
  session-mcp-view.ts          # SessionMcpView: фильтр + регистрация инструментов/промптов (~200 строк)
  mcp-pool-events.ts           # размеченное объединение PoolEvent (~80 строк)
  pid-descendants.ts           # listDescendantPids кроссплатформенно (~150 строк, включая тесты)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 строк
  mcp-pool-entry.test.ts       # ~400 строк
  session-mcp-view.test.ts     # ~250 строк
  mcp-pool-key.test.ts         # ~150 строк
  pid-descendants.test.ts      # ~200 строк (Unix + Windows с пропуском через gate)
```

**Измененные файлы:**

```
packages/core/src/tools/mcp-client.ts            # разделение discoverAndReturn(); унификация connectToMcpServer
packages/core/src/tools/mcp-client-manager.ts    # опциональный параметр pool; условное состояние бюджета
packages/core/src/tools/tool-registry.ts         # передает pool из config в McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # создание QwenAgent.mcpPool; broadcastBudgetEvent;
                                                 # newSessionConfig подключает pool к Config;
                                                 # killSession вызывает pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # передает --mcp-pool-transports + budget env дочернему процессу ACP
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus читает pool;
                                                 # extMethod restartMcpServer возвращает RestartResult[]
packages/cli/src/serve/capabilities.ts           # объявляет mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: опциональное поле; вспомогательная функция isWorkspaceScopedBudgetEvent
```
## 19. Доставка в одном PR — разбивка коммитов (V21-1)

Следуя рекомендациям мейнтейнера о пакетной поставке функционально-связанных изменений (#4175 стратегия ветвления от 2026-05-19), F2 поставляется как **один PR с 6 атомарными коммитами**. Рецензент может пройтись по ним с помощью `git log -p HEAD~6..HEAD` и проверить каждый коммит отдельно.

| № коммита | Название                                                                                         | Область                                                                                                                                                                                                                                                                                                                                                                                                                   | Затрагивает                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1         | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths`    | Добавляет `discoverAndReturn()`; извлекает общий `establishConnection()`, используемый как `McpClient.connect()`, так и фабрикой `connectToMcpServer()`; старый `discover()` становится тонкой обёрткой, которая выполняет регистрацию (сохраняет поведение отдельного Qwen). Не наблюдаемых изменений поведения.                                                                                                              | `mcp-client.ts`, `mcp-client.test.ts`                                                                                   |
| 2         | `feat(core): McpTransportPool + SessionMcpView`                                                  | Ядро пула: `fingerprint`, счётчик ссылок, дедупликация `spawnInFlight`, обратный индекс `sessionToEntries`, конечный автомат для drain, воспроизведение снимка при присоединении, защита поколения, двойное распространение tool+prompt, копия доверенности на сессию. Mock для McpClient в юнит-тестах. Без включения в продакшн.                                                                                          | новые `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + тесты |
| 3         | `feat(core): cross-platform descendant pid sweep + pool health monitor`                          | `listDescendantPids` (рекурсивный `pgrep -P` на Unix, PowerShell CIM на Windows); унифицированный монитор здоровья внутри `PoolEntry` (проверка по интервалу + счётчик сбоев + обратная экспонента переподключения согласно §6.6); интеграционные тесты с порождением подпроцессов, ограниченные условием `QWEN_INTEGRATION === '1'`.                                                                                       | новые `pid-descendants.ts` + тесты; `mcp-pool-entry.ts`                                                                 |
| 4         | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                                  | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` передаёт пул в `McpClientManager`; необязательный параметр `pool?` конструктора `McpClientManager`; `acpAgent.QwenAgent` создаёт пул при инициализации; инъекция `newSessionConfig`; `killSession` вызывает `pool.releaseSession`; обход SDK MCP + HTTP/SSE через `createUnpooledConnection`; флаги CLI `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                              |
| 5         | `feat(serve): pool-aware status + restart routes`                                                | Метод расширения `QwenAgent.getMcpPoolAccounting`; `httpAcpBridge.buildWorkspaceMcpStatus` сначала через пул, затем fallback на bootstrap-сессию; `restartMcpServer` принимает `?entryIndex=` и возвращает `RestartResult[]`; ячейка: `entryCount` + `entrySummary[].entryIndex`; теги возможностей `mcp_workspace_pool` + `mcp_pool_restart`.                                                                              | `httpAcpBridge.ts`, `capabilities.ts`, типы SDK                                                                        |
| 6         | `feat(serve): graduate MCP budget guardrails to workspace scope`                                 | Переносит `tryReserveSlot`/`releaseSlotName`/гистерезисный конечный автомат из `McpClientManager` в пул; удаляет логику по сессиям `setMcpBudgetEventCallback` в `acpAgent.newSessionConfig`; разветвление `QwenAgent.broadcastBudgetEvent`; ячейка снимка `scope: 'workspace'`; аддитивное поле `scope?` SDK; вспомогательная функция `isWorkspaceScopedBudgetEvent`; обновления встроенной документации.                     | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                |
**Оценка общего LOC**: ~4100 производственный код + ~1900 тесты = ~6000 LOC (оценка v2 ~3850; рост поглощает корректировки V21).

**Цель слияния**: один PR в `daemon_mode_b_main`. Периодическое пакетное слияние с `main` по стратегии #4175.

**Процесс саморецензирования перед открытием PR**:

1. После каждого коммита запускать агента `code-reviewer` на diff коммита; принятые замечания фиксировать в том же коммите
2. Для коммитов 2/4/6 (наибольший риск по дизайну) дополнительно запускать `silent-failure-hunter` + `type-design-analyzer`
3. После того как все 6 коммитов внесены: 3 полных прохода рецензирования разными комбинациями агентов по полному diff PR
4. Запустить полный набор тестов + typecheck + lint по всем затронутым пакетам

Зеркалировать шаблон предварительного рецензирования Mirror PR 21.

---

## 20. Теги возможностей + изменения контракта SDK

### 20.1 Новые теги возможностей (рекламируются атомарно в v0.16, V21-1)

Поскольку F2 поставляется одним PR, все три тега рекламируются вместе. Потребители пула могут предполагать: **`mcp_workspace_pool` объявлен ⇒ все поля `entryCount`/`entrySummary`/`scope?` присутствуют**; проверка по отдельным полям не требуется.

| Тег                        | Когда рекламируется                                                                                          | Значение                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Когда `QwenAgent.mcpPool !== undefined` (всегда истинно в режиме демона, если не задан kill‑switch `--no-mcp-pool`) | `GET /workspace/mcp` отражает состояние пула; поля `entryCount` + `entrySummary` присутствуют                                |
| `mcp_pool_restart`         | Всегда, когда включён `mcp_workspace_pool`                                                                   | `POST /workspace/mcp/:server/restart` принимает `?entryIndex=` и может возвращать `entries: RestartResult[]`                 |
| (расширяет `mcp_guardrails`) | без изменений                                                                                              | Тот же тег, полезная нагрузка расширена полем `scope` (`'workspace'` в рамках F2)                                           |

### 20.2 Аддитивная поверхность SDK

```ts
// @qwen-code/sdk — только добавления
export interface DaemonMcpBudgetWarningData {
  // существующие поля...
  scope?: 'workspace' | 'session'; // НОВОЕ — отсутствует в старых демонах (означает 'session')
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

`EVENT_SCHEMA_VERSION` остаётся равным `1` (аддитивно).

---

## 21. Матрица тестов

### 21.1 Ключ пула (F2-2)

- Одна и та же конфигурация → один и тот же ключ (перестановки env-ключей стабильны, перестановки header-ключей стабильны)
- Значение env отличается на 1 байт → другой ключ
- Значение заголовка `Authorization` отличается → другой ключ
- `includeTools`/`excludeTools`/`trust` изменены → ТОТ ЖЕ ключ (фильтр на уровне сессии)
- Два вызова `new MCPServerConfig(...)` с идентичным содержимым → один и тот же ключ (канонический хеш, а не идентификатор объекта)

### 21.2 Жизненный цикл (F2-2)

- 3 сессии получают один и тот же ключ → 1 запуск (проверить через шпион на `client.connect`)
- Последовательность освобождения n,n-1,...,1 → таймер слива запускается только при переходе 1→0
- 30 с слива: запрос на получение на отметке 25 с отменяет таймер; запрос на отметке 35 с порождает новую запись
- `MAX_IDLE_MS` (5 мин) принудительное закрытие, даже если слив колеблется
- Сбой запуска во время ожидания: все ожидающие получают ошибку; слот освобождается; запись не сохраняется

### 21.3 Одновременное получение (F2-2)

- 5 одновременных вызовов `acquire(sameKey)` при отсутствии записи → ровно 1 вызов `spawnEntry`, все 5 получают одну и ту же запись
- Запуск отвергается → все 5 ожидающих отвергаются с той же ошибкой; последующий `acquire` перезапускает

### 21.4 Изоляция на сессию (F2-2)

- Сессия A с `excludeTools: ['foo']`, сессия B без исключения → ToolRegistry у A не содержит foo, у B содержит; обе из одного `toolsSnapshot`
- Сессия A с `trust: true`, сессия B с `trust: false` → у A `DiscoveredMCPTool.trust === true`, у B `false`; проверить, что ссылки не общие (изменение одного не влияет на другой)
- Сессия A получает сервер, предназначенный только для промптов → PromptRegistry у A заполнен, ToolRegistry для этого сервера пуст

### 21.5 Изменение списка инструментов/промптов (F2-2)

- Сервер отправляет `notifications/tools/list_changed` → у всех подписчиков вызывается `applyTools` с новым снимком
- Устаревший обработчик из поколения до переподключения НЕ перезаписывает снимок
- Аналог для `notifications/prompts/list_changed`

### 21.6 Сбой + переподключение (F2-2)

- Завершение подпроцесса через `process.kill` → подписчики получают событие `disconnected`
- 3 попытки переподключения (с использованием существующего `MCPHealthMonitorConfig`) → успех → событие `reconnected` + свежий снимок
- Исчерпание попыток → все подписчики получают событие `failed`; запись переходит в состояние `failed`; новые вызовы `acquire` повторяют попытку один раз, затем выбрасывают ошибку
### 21.7 Очистка pid потомков (F2-2b)

- Linux/macOS: породить `bash -c "sleep 60 & sleep 60"` как команду stdio → убить корневой → проверить, что оба потомка перехвачены (`/proc/<pid>/status` poll, или `kill(0, pid) === false`)
- Windows: породить обёртку `cmd /c "ping -t localhost"` → убить → проверить, что дочерний процесс ping исчез
- `pgrep` недоступен (PATH отсутствует) → корректная деградация: записать предупреждение в лог, просто отправить SIGTERM корневому, не падать

### 21.8 Бюджет на уровне рабочей области (F2-4)

- 4 сессии × `--mcp-client-budget=2` с 3 статическими MCP-серверами → общий бюджет рабочей области = 3 (не 12); ячейка снимка `scope: 'workspace'`, `liveCount: 3`
- Предупреждение о бюджете срабатывает один раз при пересечении 75% вверх по всей рабочей области; транслируется всем 4 сессиям одновременно
- Переустановка гистерезиса: падение до 37,5% → следующее пересечение срабатывает снова

### 21.9 Обратная совместимость (F2-3)

- Автономный `qwen` (без демона) → `mcpPool === undefined` → все существующие тесты `mcp-client-manager.test.ts` проходят без изменений
- Флаг демона `--no-mcp-pool` → откат к по-сессионной модели, все существующие e2e тесты демона проходят

### 21.10 Изоляция учётных данных (F2-3)

- Сессия A вставляет `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Сессия B — `tokenB` → 2 отдельных процесса; проверить через снимок `entryCount: 2`; проверить, что вызовы инструментов A проходят через транспорт A (проверка заголовков в stdin/log)

### 21.11 LoadSession / возобновление (F2-3)

- Закрытие сессии → начинается дренаж → возобновление в течение 30 с → запись пула переиспользуется (без холодного старта, подтверждено счётчиком вызовов `client.connect`)
- Возобновление после 30 с, но до истечения окна restore-window → холодный старт пула; содержимое restoreState всё ещё сохранено

### 21.12 Маршрут перезапуска (F2-3b)

- 1 запись по имени → `POST /workspace/mcp/foo/restart` возвращает устаревшую форму `{restarted: true, durationMs}`
- 2 записи по имени (разные отпечатки) → возвращает `{entries: [{fingerprint, restarted, ...}, ...]}`
- Перезапуск во время другого выполняющегося перезапуска → второй вызов возвращает тот же промис (дедупликация)
- Перезапуск, когда бюджет был бы превышен → возвращает `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` на запись

### 21.13 Маршрут статуса (F2-3b)

- Бездействующий демон (нет сессий), но в пуле есть кэшированные записи от предыдущей сессии → `GET /workspace/mcp` возвращает `initialized: true` с учётом живых записей
- Bootstrap-сессия не существует → откат к прямому пути пула; без ошибки
- Запрос к пулу выдаёт исключение → откат к пути bootstrap-сессии; снимок никогда не падает

### 21.14 Редьюсер SDK (F2-4)

- `mcpBudgetWarningCount` увеличивается одновременно во всех сессиях-подписчиках, когда транслируется событие рабочей области
- `isWorkspaceScopedBudgetEvent(e)` правильно определяет область действия из полезной нагрузки
- Старый демон (без поля `scope`) → по умолчанию интерпретируется как 'session'

### 21.15 Горячая перезагрузка конфигурации (F2-3)

- Изменение settings.json на лету → старая сессия сохраняет старую запись, новая сессия создаёт новую запись, обе сосуществуют; старая запись естественным образом дренируется, когда последняя старая сессия закрывается
- 0 сессий после закрытия старой сессии → таймер дренажа срабатывает → старая запись GC → остаётся только новая запись

### 21.16 Порядок завершения (F2-3)

- `QwenAgent.close()` запускает в порядке: прекратить приём → дренаж подсказок → закрыть сессии → `pool.drainAll` → никаких зомби-процессов в `pgrep -P <acpChildPid>` после выхода

---

## 22. Открытые вопросы

В v21 заблокированы Q1/Q3/Q4/Q6 в значениях по умолчанию для дизайна (доставка одним PR). Q2/Q5/Q7/Q8/Q9 остаются открытыми.

| №     | Вопрос                                                                                                             | Значение по умолчанию в F2 дизайне                                                                         | Решение необходимо до |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------- |
| Q1 ✅ | Имена полей редьюсера SDK — переименовать или оставить?                                                             | **ЗАФИКСИРОВАНО v2.1**: оставить `mcpBudgetWarningCount` и т.д. с расширенной семантикой области в JSDoc  | решено                |
| Q2    | Возможность `mcp_workspace_pool` — повысить `protocolVersions` ('v1' → 'v1.1') или остаться аддитивным на 'v1'?     | **Остаться аддитивным на 'v1'** (согласно прецеденту PR 14b)                                              | коммит 5              |
| Q3 ✅ | Флаг `--no-mcp-pool` — включён по умолчанию или opt-in?                                                            | **ЗАФИКСИРОВАНО v2.1**: включён по умолчанию; `--no-mcp-pool` — аварийный выключатель                    | решено                |
| Q4 ✅ | HTTP/SSE по умолчанию — пул выключен или включён?                                                                  | **ЗАФИКСИРОВАНО v2.1**: пул выключен; opt-in через `--mcp-pool-transports`                               | решено                |
| Q5    | `POST /workspace/mcp/reload-all` — включить в F2 или отложить?                                                     | **Отложено**                                                                                              | н/д (отложено)        |
| Q6 ✅ | Ленивое построение пула — стоит ли условность?                                                                     | **ЗАФИКСИРОВАНО v2.1**: нетерпеливое (всегда строить в конструкторе `QwenAgent`)                         | решено                |
| Q7    | Окно `restoreState` против дренажа пула — держать раздельно, выровнять или читать из настроек?                     | **Держать раздельно 30 с по умолчанию** + конфиг `--mcp-pool-drain-ms`                                   | коммит 4              |
| Q8    | Обработка OAuth — подтвердить перенос на F3, задокументировать обходное решение?                                  | **Перенесено на F3**, задокументировать обходное решение `/mcp auth <name>`                             | коммит 4              |
| Q9    | Вывод `entrySummary` — всегда включать или за флагом verbose?                                                      | **Всегда включать** (небольшая нагрузка, полезно для операций)                                           | коммит 5              |
| Q10   | Обновить решение #3 в `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` — согласовать с @wenshao? | Описание PR F2 ссылается на PR codeagents; два PR рецензируются независимо                               | PR открыт             |
## 23. Риски

### Высокие

- **R1 (глобальное состояние A2)**: коллизия `serverStatuses` при нескольких входах с одинаковым именем. Смягчается функцией агрегирования статуса; оставшийся риск — SDK-потребители, читающие необработанную глобальную Map (маловероятно — используется только через аксессор `getMCPServerStatus(name)`).
- **R2 (симметрия PromptRegistry)**: забывание разветвления промптов в любом пути кода молча удаляет промпты. Смягчается тестом F2-2 21.4 третий пункт + интеграционным тестом, проверяющим паритетность промптов по сравнению с до-F2.
- **R3 (утечка состояния HTTP-транспорта)**: выбор HTTP-пула для сервера, поддерживающего состояние на транспорт, повреждает контексты сессий. Смягчается отключением по умолчанию + документацией; невозможно обнаружить автоматически.

### Средние

- **R4 (унификация путей F2-1)**: фабрика `connectToMcpServer` и класс `McpClient` имеют тонкие поведенческие различия (например, возможности, объявленные во время создания vs подключения). Смягчается тем, что F2-1 — это чистый рефакторинг PR с полным регрессионным покрытием до начала работы над пулом.
- **R5 (дочерний pid на Windows)**: `Get-CimInstance` в PowerShell может быть медленным (затраты на запуск) или заблокированным AppLocker. Смягчается таймаутом 2 с и плавной деградацией.
- **R6 (усиление широковещательных событий пула)**: оповещение о превышении бюджета, разосланное на 100 сессий, вызывает 100 вызовов `extNotification` в тесном цикле. Смягчается параллелизацией `Promise.all` + catch на сессию (существующий шаблон PR 14b).

### Низкие

- **R7 (стабильность отпечатка между версиями MCPServerConfig)**: будущие поля, добавленные в `MCPServerConfig` и не включенные в отпечаток, могут молча допустить некорректное совместное использование. Смягчается явной функцией канонизации + тестом, перечисляющим все поля `MCPServerConfig` и проверяющим покрытие.
- **R8 (гонки счетчика поколений)**: быстрые циклы перезапуска могут исчерпать точность числа JS (≈ 2^53 = ~285 тыс. лет при 1/сек). Не является практической проблемой.

### Специфичные для одного PR (V21-14)

- **R9 (утомляемость рецензента от одного PR ~6000 LOC)**: пропускная способность рецензента становится критическим путём. F3 блокируется слиянием F2 → блокирует других участников. Смягчение: (a) предварительное рецензирование 3 специализированными агентами и исправление P0/P1 до открытия, повторяя шаблон PR 21; (b) структурировать как 6 атомарных коммитов, чтобы рецензент мог проходить шаг за шагом; (c) согласовать окно рецензирования с @wenshao заранее через комментарий #4175.
- **R10 (накопление конфликтов слияния в `daemon_mode_b_main`)**: F2 затрагивает `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — все горячие пути. Участники F3 / F4, вносящие изменения одновременно, рискуют конфликтами во время 1–2-недельного окна рецензирования F2. Смягчение: ежедневный `git rebase origin/daemon_mode_b_main`; координация через обновление #4175, что F2 находится в процессе + просьба к F3/F4 отложить изменения в горячих файлах до слияния F2.
- **R11 (время выполнения CI)**: ~1900 LOC новых тестов, включая запуск подпроцессов и кроссплатформенный опрос pid, может увеличить время CI с 30 мин до 50 мин. Смягчение: (a) закрыть тесты подпроцессов за `process.env.QWEN_INTEGRATION === '1'`, выполнять подмножество в PR CI + полный набор ночью; (b) параллелизм Vitest ≥ 4; (c) тесты опроса pid на Windows пропускать только на GHA Windows runner.

---

## 24. Обновления документации

| Документ                                                                       | Обновление                                                                                                                                                  | Когда                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`             | Решение #3 «Время жизни MCP-сервера»: сейчас «на сессию»; обновить на «в режиме демона — пул в рабочей области с ключом по хешу конфигурации; отдельно на сессию» | F2-3 сливается (согласовать с @wenshao PR codeagents) |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                             | Волна 5 PR 23 → отметить как серия F2; ссылки на PRs                                                                                                         | F2-3 сливается                                        |
| `packages/cli/src/serve/README.md` (если существует) или новый `docs/serve/mcp-pool.md` | Новый раздел: семантика пула, ключ отпечатка, опциональный транспорт, семантика перезапуска, интерпретация снимка статуса                                       | F2-3b                                                |
| `packages/sdk/README.md`                                                       | Поле `scope?` в событиях защиты, `entryCount` в статусе сервера, вспомогательная функция `isWorkspaceScopedBudgetEvent`                                         | F2-4                                                 |
| Тело issue #4175                                                              | Обновить запись F2 таблицей под-PR, ссылкой на дизайн v2 (этот документ)                                                                                     | Перед открытием F2-1                                  |
| Тело issue #3803                                                              | Строка решения #3: обновить «Сейчас на сессию» → «в режиме демона — пул в рабочей области (F2)»                                                              | После слияния F2-3                                    |
| Встроенный комментарий `acpAgent.ts:869-936`                                   | Удалить прямую ссылку «Волна 5 PR 23»; обновить на «переведено на F2 в `scope: 'workspace'`»                                                                  | PR F2-4                                              |
| CHANGELOG / примечания к выпуску (Волна 6 / F5)                                | Заголовок «MCP-процессы теперь общие для сессий в рабочей области»                                                                                           | Релиз F5                                              |
---

## 25. Шаблон описания PR (доставка в одном PR)

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Единый функционально-связный PR в соответствии со стратегией ветвления #4175 (2026-05-19).
Заменяет то, что изначально планировалось как волна 5 PR 23 + под-PR F2-1..F2-4.

### Область

~4100 строк production-кода + ~1900 строк тестов в 6 атомарных коммитах.
Пошаговый обзор: `git log -p HEAD~6..HEAD` для просмотра коммит за коммитом.

### Дизайн-документ

См. `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Специализированные агенты предварительного ревью (по шаблону PR 21)

Включены в первый коммит до открытия PR:

- code-reviewer: N замечаний, все приняты
- silent-failure-hunter: N замечаний, все приняты
- type-design-analyzer: N замечаний, все приняты

### Закрывает

(нет — запись F2 в #4175 остаётся открытой до слияния PR в основной пакет)

### Связано

- #3803 обновление решения №3 (codeagents PR <link>)
- PR 14b (#4271 слит) — базовая бюджетная защита; F2 расширяет область до рабочего пространства
- F1 (#4319 слит) — пакет acp-bridge; F2 зависит от точек инъекции

### Обратная совместимость

- Автономный `qwen` (не демон): пул не создаётся; существующее поведение сохраняется
- Демон `qwen serve --no-mcp-pool`: аварийный выключатель возвращается к сессионному режиму
- SDK: все новые поля аддитивны (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION остаётся 1
- Старые SDK-клиенты: неизвестное `scope: 'workspace'` игнорируется согласно контракту PR 14
- Старые демоны: SDK-потребители могут обнаружить отсутствие возможности `mcp_workspace_pool` и вернуться к запасному варианту

### План тестирования

- [ ] Ключ пула: стабильность при перестановках окружения, расхождение заголовков, исключение фильтров по сессии
- [ ] Жизненный цикл: разделение 3 сессиями, время на завершение (drain), дедупликация конкурентного захвата, освобождение слота при ошибке порождения
- [ ] Двусторонняя раздача инструментов + подсказок, копия доверия для каждой сессии, воспроизведение снимка при присоединении
- [ ] Охранник генерации: обработчик до переподключения не перезаписывает снимок после переподключения
- [ ] Сбой + переподключение с повторными попытками stdio (5с × 3) и HTTP (1/2/4/8/16с × 5)
- [ ] Очистка дочерних pid: рекурсия pgrep в Linux/macOS, PowerShell CIM в Windows
- [ ] Бюджет в области рабочего пространства: 4 сессии × бюджет=2 → максимум 3 (не 12); раздача на все подключённые
- [ ] Возобновление LoadSession в окне завершения: запись пула повторно используется, без холодного старта
- [ ] Горячая перезагрузка конфигурации: старые/новые записи сосуществуют; старые завершаются естественно
- [ ] Маршрут перезапуска: избирательность `?entryIndex=`; сохранена форма ответа для одной записи из легаси
- [ ] Вызов инструмента в процессе переподключения: отклонение `MCPCallInterruptedError`
- [ ] Автономный qwen: все существующие тесты mcp-client-manager проходят без изменений
```

## Итог

F2 v2.1 = один PR с 6 атомарными коммитами (~6000 LOC), нацеленный на `daemon_mode_b_main`. Ключевые архитектурные решения:

1. **`McpTransportPool`** в `packages/core` (дочерняя сторона ACP), с областью рабочего пространства, подсчётом ссылок + 30-секундным завершением
2. **Ключ по отпечатку (fingerprint key)** SHA-256 по канонической конфигурации, включая окружение/заголовки (шаблон claude-code), исключая фильтры на сессию (includeTools/trust)
3. **`SessionMcpView`** проекция реестра инструментов и подсказок на сессию с копией доверия
4. **Воспроизведение снимка + охранник генерации** для состояния гонки при присоединении и устаревших уведомлений
5. **Кросс-платформенная очистка дочерних pid** (шаблон opencode + порт для Windows)
6. **Поддержка HTTP/SSE по включению**, обход MCP в SDK, OAuth отложен до F3
7. **Конечный автомат бюджета** переходит на область рабочего пространства; ячейка снимка + push-события расширяются аддитивно (`scope?`)
8. **Рефакторинг маршрутов статуса и перезапуска**: сначала пул с запасным вариантом boostrap-сессии; `entryCount` + `RestartResult[]`

**Открытые вопросы Q1–Q10** в §22 требуют решений от мейнтейнера до открытия соответствующих под-PR. Рекомендуется разрешить Q1–Q4 до начала F2-3 (они определяют общее направление); Q5–Q10 можно разрешать постепенно.
