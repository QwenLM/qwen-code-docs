# Дизайн интерфейса обнаружения бездействия демона

## Контекст

### Проблема

Qwen Daemon разворачивается на нескольких машинах как долгоживущий сервис. Когда демон длительное время не выполняет задач, продолжать занимать ресурсы машины — пустая трата. Внешнему планировщику (K8s HPA / кастомный Scaler) нужен надёжный сигнал для определения того, находится ли демон в состоянии бездействия, чтобы выполнить масштабирование и освободить ресурсы.

### Текущее состояние

Доступные в настоящее время интерфейсы:

| Интерфейс                      | Возвращаемая информация                                 | Ограничения                                                                                  |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `GET /health?deep=true`        | `{ sessions, pendingPermissions }`                     | Только количество сессий; невозможно различить «есть сессия, но бездействует» и «есть сессия, работает» |
| `GET /workspace/:cwd/sessions` | `hasActivePrompt` + `clientCount` для каждой сессии    | Требуется дополнительный запрос, отсутствует временное измерение (как долго нет активности?) |

**Ключевые недостатки**:

1. Нет агрегированного показателя «есть ли активный prompt».
2. Нет временной метки последней активности; внешняя система должна сама поддерживать конечный автомат для расчёта времени бездействия.
3. Нет экспозиции количества SSE-соединений (внутренне используется `activeSseCount`, но `/health` его не возвращает).
4. Нет экспозиции статуса выживания channel (дочернего процесса agent).

## Цели дизайна

Предоставить интерфейс, позволяющий **одним HTTP-вызовом определить бездействие**, который удовлетворяет требованиям:

- Внешний планировщик может за один GET определить, можно ли освободить ресурсы.
- Поддержка временного измерения (как долго простаивает), чтобы внешняя система не поддерживала состояние.
- Обратная совместимость с существующим поведением `/health`.
- Нулевые дополнительные зависимости, использование существующего внутреннего состояния.

## Решение

### Расширение ответа `GET /health?deep=true`

Добавить поля в существующий ответ `/health?deep=true`:

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Существующие поля (без изменений) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Новые поля ---
  "activePrompts": 1, // количество сессий, выполняющих prompt
  "connectedClients": 3, // количество активных SSE-соединений
  "channelAlive": true, // жив ли дочерний процесс agent
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // временная метка последней активности (ISO 8601)
  "idleSinceMs": 120000, // количество миллисекунд с последней активности
}
```

### Определение полей

| Поле                | Тип               | Семантика                                                                                   |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `activePrompts`     | `number`          | Количество сессий, у которых `promptActive === true` в данный момент                        |
| `connectedClients`  | `number`          | Количество активных SSE-соединений (уже есть `activeSseCount`)                              |
| `channelAlive`      | `boolean`         | Жив ли дочерний процесс agent (уже есть `bridge.isChannelLive()`)                           |
| `lastActivityAt`    | `string \| null`  | ISO-временная метка последнего начала или завершения prompt; `null`, если после запуска демона не было ни одного prompt |
| `idleSinceMs`       | `number \| null`  | `Date.now() - lastActivityAt`; `null`, если нет записей об активности                       |

### Определение «активности»

Следующие события считаются «активностью» и обновляют `lastActivityAt`:

- Начало выполнения prompt (`promptActive` меняется с false на true).
- Завершение/ошибка prompt (`promptActive` меняется с true на false).
- Создание новой сессии (`spawnOrAttach` успешно выполнен).
- Восстановление/загрузка сессии (`loadSession` / `resumeSession` успешно выполнены).

**Не** считаются активностью (чтобы избежать ложных срабатываний):

- SSE-соединение/разъединение.
- Heartbeat.
- Сам запрос `/health`.
- Запрос/ответ permission.

### Правила определения бездействия (для справки внешнему планировщику)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Условия для освобождения: бездействие превышает пороговое значение (по умолчанию 5 минут)"""
    if health["activePrompts"] > 0:
        return False  # есть выполняемая задача
    if health["connectedClients"] > 0:
        return False  # есть подключённые клиенты
    if health["idleSinceMs"] is None:
        # Никогда не было активности — возможно, только что запущенный холодный демон
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Изменения в коде

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Добавить в интерфейс `AcpSessionBridge`:

```typescript
/** Количество сессий, выполняющих prompt */
get activePromptCount(): number;

/** Временная метка последней активности (в миллисекундах от эпохи), null если активность никогда не происходила */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Внутри фабричной функции `createAcpSessionBridge`:

```typescript
// Новая переменная для отслеживания состояния
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Вызывать `touchActivity()` в следующих местах:

- `entry.promptActive = true` (строка ~2528) — начало prompt
- `entry.promptActive = false` (строки ~2551, 2559) — завершение prompt
- После успешного создания сессии в `doSpawn` (около строки ~1906)
- После успешного вызова `restoreSession`

В возвращаемом объекте добавить:

```typescript
get activePromptCount() {
  let count = 0;
  for (const entry of byId.values()) {
    if (entry.promptActive) count++;
  }
  return count;
},

get lastActivityAt() {
  return lastActivityTimestamp;
},
```

### 3. `packages/cli/src/serve/server.ts`

Изменить `healthHandler` (строка ~803) в ветке `deep`:

```typescript
const healthHandler = (req: Request, res: Response): void => {
  const deepQuery = req.query['deep'];
  const deep = deepQuery === '1' || deepQuery === 'true' || deepQuery === '';
  if (!deep) {
    res.status(200).json({ status: 'ok' });
    return;
  }
  try {
    const lastActivityAt = bridge.lastActivityAt;
    const now = Date.now();
    res.status(200).json({
      status: 'ok',
      // Существующие
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // Новые
      activePrompts: bridge.activePromptCount,
      connectedClients: getActiveSseCount(),
      channelAlive: bridge.isChannelLive(),
      lastActivityAt:
        lastActivityAt !== null ? new Date(lastActivityAt).toISOString() : null,
      idleSinceMs: lastActivityAt !== null ? now - lastActivityAt : null,
    });
  } catch (err) {
    writeStderrLine(
      `qwen serve: /health deep probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: 'degraded' });
  }
};
```
### 4. `packages/cli/src/serve/server.test.ts`

Новые тестовые сценарии покрывают:

- `/health?deep=true` корректность возврата новых полей
- При отсутствии сессии `activePrompts === 0`, `idleSinceMs === null`
- Во время выполнения prompt `activePrompts > 0`, `idleSinceMs` постоянно обновляется
- После завершения prompt `idleSinceMs` начинает увеличиваться

### 5. `packages/acp-bridge/src/bridge.test.ts`

Новые тестовые сценарии покрывают:

- Изменение значения `activePromptCount` в течение жизненного цикла prompt
- Обновление `lastActivityAt` после каждого события активности
- Корректное накопление `activePromptCount` при параллельном выполнении нескольких сессий

## Список изменений файлов

| Файл                                      | Тип изменения     | Описание                                           |
| ----------------------------------------- | ----------------- | -------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`  | Расширение интерфейса | Добавлены свойства `activePromptCount`, `lastActivityAt` |
| `packages/acp-bridge/src/bridge.ts`       | Реализация логики | Добавлены отслеживание `lastActivityTimestamp` + геттер |
| `packages/cli/src/serve/server.ts`        | Расширение HTTP-ответа | Добавлены новые поля в `/health?deep=true`          |
| `packages/cli/src/serve/server.test.ts`   | Тесты             | Покрытие новых полей health-эндпоинта               |
| `packages/acp-bridge/src/bridge.test.ts`  | Тесты             | Покрытие новых свойств bridge                       |

## Совместимость

- **Обратная совместимость**: новые поля добавлены, существующие поля не изменяются и не удаляются.
- **`GET /health` (не deep)**: поведение не изменилось, по-прежнему возвращается `{ "status": "ok" }`.
- **OTel Gauge**: существующий `registerDaemonGaugeCallbacks` может быть дополнен gauge `activePrompts` в будущем, но в рамках данного изменения не реализуется.

## Дальнейшие расширения (не входят в текущий объём)

1. **Автоматическое завершение**: параметр `--auto-shutdown-idle-ms` в daemon, при превышении idle-таймаута процесс завершается (подходит для сценариев systemd/K8s Pod).
2. **Экспорт OTel-метрик**: регистрация `activePrompts`, `idleSinceMs` в качестве gauge в OTel meter.
3. **Вебхук-колбэк**: активная отправка событий во внешнюю систему при превышении idle-порога.
