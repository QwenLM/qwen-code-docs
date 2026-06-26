# Дизайн интерфейса обнаружения простоя демона

## Предыстория

### Проблема

Qwen Daemon развёртывается на нескольких машинах как долгоживущий сервис. Когда демон длительное время не выполняет задачи, продолжать занимать ресурсы машины — пустая трата. Внешнему планировщику (K8s HPA / кастомный Scaler) нужен надёжный сигнал для определения того, находится ли демон в состоянии простоя, чтобы выполнить масштабирование вниз и освободить ресурсы.

### Текущая ситуация

Доступные на данный момент интерфейсы:

| Интерфейс                       | Возвращаемая информация                          | Ограничения                                                                 |
| ------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /health?deep=true`         | `{ sessions, pendingPermissions }`               | Только количество сессий, невозможно отличить «есть сессия, но простаивает» от «есть сессия, работает» |
| `GET /workspace/:cwd/sessions`  | `hasActivePrompt` + `clientCount` для каждой сессии | Требуется дополнительный запрос, нет информации о временной шкале (как долго нет активности?) |

**Ключевые недостатки**:

1. Нет агрегированного показателя «есть ли активный prompt»
2. Нет «времени последней активности» — внешней системе приходится самой вести конечный автомат для вычисления длительности простоя
3. Не раскрыто количество SSE-соединений (внутренне поддерживается `activeSseCount`, но `/health` его не возвращает)
4. Не раскрыто состояние канала (дочернего процесса агента)

## Цели дизайна

Предоставить интерфейс, позволяющий **за один HTTP-запрос** определить состояние простоя, удовлетворяющий требованиям:

- Внешний планировщик может выполнить один GET-запрос и решить, можно ли освободить ресурсы
- Поддержка временной размерности (как долго длится простой), чтобы не поддерживать состояние извне
- Обратная совместимость с существующим поведением `/health`
- Нулевые дополнительные зависимости, использование уже имеющегося внутреннего состояния

## Решение

### Расширение ответа `GET /health?deep=true`

В существующий ответ `/health?deep=true` добавляются поля:

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
  "channelAlive": true, // жив ли дочерний процесс агента
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // время последней активности (ISO 8601)
  "idleSinceMs": 120000, // количество миллисекунд с момента последней активности
}
```

### Определение полей

| Поле               | Тип               | Семантика                                                                             |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| `activePrompts`    | `number`          | Количество сессий, у которых `promptActive === true`                                  |
| `connectedClients` | `number`          | Количество активных SSE-соединений (уже есть `activeSseCount`)                        |
| `channelAlive`     | `boolean`         | Жив ли дочерний процесс агента (уже есть `bridge.isChannelLive()`)                    |
| `lastActivityAt`   | `string \| null`  | ISO-временная метка последнего начала или завершения prompt; `null`, если с момента запуска демона не было ни одного prompt |
| `idleSinceMs`      | `number \| null`  | `Date.now() - lastActivityAt`; `null`, если нет записи об активности                  |

### Определение «активности»

Следующие события считаются активностью и обновляют `lastActivityAt`:

- Начало выполнения prompt (`promptActive` переходит из false → true)
- Завершение/сбой prompt (`promptActive` переходит из true → false)
- Создание новой сессии (`spawnOrAttach` успешен)
- Восстановление/загрузка сессии (`loadSession` / `resumeSession` успешны)

**Не** считаются активностью (чтобы избежать ложных срабатываний):

- Подключение/отключение SSE
- Heartbeat
- Сам запрос `/health`
- Запрос/ответ разрешений (permission)

### Правила определения простоя (для справки внешнего планировщика)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Рекомендуется освобождать ресурсы, если простой превышает порог (по умолчанию 5 минут)"""
    if health["activePrompts"] > 0:
        return False  # есть выполняющиеся задачи
    if health["connectedClients"] > 0:
        return False  # есть подключённые клиенты
    if health["idleSinceMs"] is None:
        # никогда не было активности — возможно, только что запущенный холодный демон
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Изменения в коде

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

В интерфейсе `AcpSessionBridge` добавляются:

```typescript
/** Количество сессий, выполняющих prompt */
get activePromptCount(): number;

/** Временная метка последней активности (в миллисекундах эпохи), null — активности не было */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

В фабричной функции `createAcpSessionBridge`:

```typescript
// Добавить отслеживание состояния
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

Вызывать `touchActivity()` в следующих местах:

- `entry.promptActive = true` (около строки 2528) — начало prompt
- `entry.promptActive = false` (около строк 2551, 2559) — завершение prompt
- после успешного создания сессии `doSpawn` (около строки 1906)
- после успешного `restoreSession`

Раскрыть в возвращаемом объекте:

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

Изменить ветку `deep` в `healthHandler` (около строки 803):

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

Добавить тесты, покрывающие:

- Правильность возвращаемых новых полей при `/health?deep=true`
- При отсутствии сессий `activePrompts === 0`, `idleSinceMs === null`
- Во время выполнения prompt `activePrompts > 0`, `idleSinceMs` постоянно обновляется
- После завершения prompt `idleSinceMs` начинает увеличиваться

### 5. `packages/acp-bridge/src/bridge.test.ts`

Добавить тесты, покрывающие:

- Изменение `activePromptCount` в течение жизненного цикла prompt
- Обновление `lastActivityAt` после каждого события активности
- Правильное суммирование `activePromptCount` при параллельных сессиях

## Список изменяемых файлов

| Файл                                      | Тип изменения      | Описание                                                    |
| ----------------------------------------- | ------------------ | ----------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`  | Расширение интерфейса | Добавлены свойства `activePromptCount`, `lastActivityAt`   |
| `packages/acp-bridge/src/bridge.ts`       | Реализация логики     | Добавлено отслеживание `lastActivityTimestamp` + геттеры    |
| `packages/cli/src/serve/server.ts`        | Расширение HTTP-ответа | `/health?deep=true` теперь возвращает новые поля            |
| `packages/cli/src/serve/server.test.ts`   | Тесты                 | Покрытие новых полей health-интерфейса                      |
| `packages/acp-bridge/src/bridge.test.ts`  | Тесты                 | Покрытие новых свойств bridge                               |

## Совместимость

- **Обратная совместимость**: новые поля добавляются, ни одно существующее поле не изменяется и не удаляется
- **`GET /health` (не deep)**: поведение не изменяется, по-прежнему возвращает только `{ "status": "ok" }`
- **OTel Gauge**: существующий `registerDaemonGaugeCallbacks` может опционально получить дополнительный gauge `activePrompts`, но это не входит в текущий объём работ

## Дальнейшее расширение (не входит в текущий объём)

1. **Автоматическое завершение**: встроенный параметр `--auto-shutdown-idle-ms`, демон завершается сам по истечении тайм-аута простоя (подходит для systemd / K8s Pod)
2. **Раскрытие метрик OTel**: регистрация `activePrompts`, `idleSinceMs` как gauge в meter OTel
3. **Webhook-уведомления**: активная отправка событий во внешнюю систему при превышении порога простоя