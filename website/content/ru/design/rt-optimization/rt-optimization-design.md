# Qwen Code Agent Loop RT 优化技术方案

## 1. 背景与问题定义

### 1.1 现状

Qwen Code 的 Agent Loop 为严格串行模型：

```
User Prompt → [LLM 决策] → Tool Execution → [LLM 决策] → Tool Execution → ... → [LLM 回复] → Idle
               ~3-4s          ~Xms-Ns          ~3-4s          ~Xms-Ns            ~3-4s
```

每一轮 LLM 调用（含网络 RTT + 模型推理）约 3-4s，是端到端 RT 的主要成本。

### 1.2 实测数据

测试场景："我有哪些工作空间"（3 轮 agent loop，2 次工具调用，单次采样）

| 阶段                        | 耗时      | 占比 |
| --------------------------- | --------- | ---- |
| LLM Round 1（决策调 skill） | 3.8s      | 28%  |
| Skill 执行                  | 1ms       | <1%  |
| LLM Round 2（决策调 shell） | 3.0s      | 22%  |
| Shell 执行                  | 2.5s      | 19%  |
| LLM Round 3（文字总结）     | 3.8s      | 28%  |
| 框架开销（状态同步、渲染）  | 0.3s      | 3%   |
| **总计**                    | **13.4s** | 100% |

**结论**：LLM 调用占 78%，工具执行 19%，框架 3%。优化的核心是**减少 LLM 调用次数**和**降低单次 LLM 调用延迟**。

> 注：单次采样、单一场景。19% 工具执行是 shell 慢调用支配，read-heavy 场景下工具执行可降至 <5%。方案落地前需补 ≥3 类场景（写操作、跨工具推理、错误恢复）的基线。

### 1.3 当前架构关键约束

| 约束                | 代码位置                                                                                   | 说明                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 工具结果无后置控制  | `tools.ts` `ToolResult` 接口 (L422)                                                        | 仅有 `llmContent`/`returnDisplay`/`error`，无法表达"跳过 LLM"                    |
| 结果无条件回传 LLM  | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355) | 所有 gemini-initiated 工具结果都回传                                             |
| Stream 完毕后才调度 | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                   | stream 循环结束后才 `scheduleToolCalls`，无增量调度                              |
| 模型层选择无策略层  | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                   | 基础设施已贯通至 `turn.run(model, …)` (L1707)，但调用方仅在 skill 显式指定时使用 |

### 1.4 已就绪的基础设施（本方案大量复用）

| 能力                                           | 位置                                                   | 现状                                                                   |
| ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `fastModel` 配置 + `/model --fast <id>`        | `config.ts:684`, `1987`, `2021`                        | 已就绪                                                                 |
| `SendMessageOptions.modelOverride`             | `client.ts:142` → `1598` → `turn.run`                  | 端到端贯通至 `geminiChat.sendMessageStream(model, …)`                  |
| 钩子层 `modelOverrideRef`（承载 skill 选模型） | `useGeminiStream.ts:376`, `2225`, `1841`               | 已贯通                                                                 |
| fast-model **非流式** side query 先例          | `services/toolUseSummary.ts:108`（via `runSideQuery`） | 已上线，证明 fast 模型配置健全；但**非流式路径**                       |
| fast-model **流式** 先例                       | `followup/speculation.ts:224`                          | 已上线，但**用的是 forked chat**（`createForkedChat`），与主 chat 隔离 |

**关键空白**：**没有任何生产代码**在主 chat 上以 fast model 跑 streaming。本方案 D2 是首个 case，需先做验证实验（详见 §3.2 前置条件）。

---

## 2. 设计原则

1. **通用性**：方案不绑定特定 tool/skill
2. **向后兼容**：现有工具无需修改即可继续工作
3. **渐进式 + 显式信号**：策略默认 conservative，由工具作者通过显式字段 opt-in 优化
4. **可回滚**：所有优化通过 feature flag 控制；用户级别可强制关闭
5. **诚实的权衡**：明确标注质量风险、成本风险和适用边界

---

## 3. 优化方案

### 3.1 方向一：工具后置执行指令（ToolResult Post-Execution Directive）

#### 问题

当前 `ToolResult` 不包含任何关于"接下来该怎么做"的信息。无论工具结果是否自解释，都无条件触发一轮 LLM。

#### 设计

扩展 `ToolResult` 接口（`packages/core/src/tools/tools.ts` L422）：

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // 新增：后置执行指令
  postExecution?: {
    /**
     * 工具结果不回传 LLM，直接作为最终回复展示给用户。
     * 适用于结果完全自包含、不需要模型再解读的场景。
     * 是 ToolResult 局部属性。
     */
    skipLlmRound?: boolean;

    /**
     * 工具结果"自包含、可直接展示给用户"——即 `returnDisplay` 已经是
     * 用户期望看到的最终形态，不需要模型加工。
     * 是 ToolResult 局部属性，**不**预测"下一轮是否 summary"。
     * 与方向三（展示解耦）联动：true → 进入 Summarizing 状态允许用户输入。
     */
    resultIsTerminal?: boolean;
  };
}
```

> **设计修正**：早期版本曾把单一 `selfExplanatory` 字段同时承担"工具产物属性"和"对话流预测信号"两份职责，但二者并不重合（例：用户 prompt 是"读 X 然后修 Y"，read_file 输出自包含，但下一轮显然不是 summary）。**预测信号属于对话流全局属性**，不应通过工具字段表达——D2 改为完全用对话流启发式（见 §3.2）。

#### 行为变更

`handleCompletedTools` 中新增判断：

```
工具批次完成
  → 检查 batch 中所有工具的 postExecution.skipLlmRound
  → 全部为 true?
    → YES: markToolsAsSubmitted, 不调 submitQuery, 直接 idle
    → NO: 保持现有行为 (submitQuery)
```

**重要约束**：`skipLlmRound` 仅在**当前 batch 的所有工具都声明 skip** 时才生效。混合 batch 仍然回传。

#### 历史不变量

跳过 LLM 后历史形如：`user → function_call → function_response → <无 assistant>`。

- 复核 `repairOrphanedToolUseTurnsInHistory`（session-load 时调用）是否容忍此形态
- 复核 auto-compaction 在缺少 assistant 文本时的行为
- PR #4176 刚关闭过 tool_use↔tool_result 不变量，落地前需补单测覆盖"skip 后下一轮 user message"的 alternation
- Qwen / OpenAI 风格 API 容忍；Anthropic 严格 alternation —— 后续若支持 Anthropic 直连需要兜底（向 history 注入空 assistant text）
> **Единая точка исправления**: здесь и в §3.3 (прерывание Summarizing в D3) нарушается **один и тот же инвариант истории**. Выберите один из двух вариантов исправления (вставка пустого assistant / принятие толерантности Qwen) – оба направления должны использовать одинаковый выбор.

#### Экосистема сигналов (Phase 2)

| Инструмент                          | `skipLlmRound`       | `resultIsTerminal` | Примечание                                                      |
| ----------------------------------- | -------------------- | ------------------ | --------------------------------------------------------------- |
| `read_file`                         | совместно с query-only | true               | Содержимое файла – это и есть ответ                             |
| `cat` (через shell)                 | по ситуации          | true               | То же, что read_file                                            |
| `grep` / `glob` / `ls`              | false                | **false (по умолч.)** | Результаты часто требуют выбора/сортировки/обобщения моделью; уровень skill явно устанавливает true в известных «чисто запросных» сценариях |
| `git status` / `git log` (через shell) | false                | true               | Вывод уже отформатирован                                        |
| Skill-инструменты                   | решает каждый skill  | решает каждый skill | Запросные skill склоняются к true                               |
| MCP-инструменты                     | по умолчанию false   | по умолчанию false | Явное включение через allowlist                                 |

Инструменты сторонних/MCP-разработчиков не заслуживают доверия, по умолчанию не маркируются; включение – через `config.toolPostExecAllowlist`.

> `grep/glob/ls` по умолчанию false – жёсткий выбор: чтобы избежать ошибочного срабатывания D2/D3 в сценариях, где модели нужно обобщение/сортировка.

#### Применимость и неприменимость

- **Применимо**: финальные запросы (типа read/cat/print), самодостаточные результаты (skill уже отформатировал вывод)
- **Неприменимо**: промежуточные шаги многошаговых задач, подтверждения записи, сложные логи, требующие интерпретации

#### Риски и смягчение

| Риск                                                    | Серьёзность | Смягчение                                               |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| Неправильная установка `skipLlmRound` приводит к обрыву многошаговой задачи | Средняя     | Семантика на уровне batch + `llmContent` всё ещё в истории, можно восстановить |
| Злоупотребление сторонними инструментами                | Средняя     | MCP отключены по умолчанию, явное включение через allowlist |
| Нарушение инварианта истории                            | Средняя     | Перед запуском добавить unit-тесты; покрыть при session-load replay |
| Несовпадение ожиданий пользователя (ожидает обобщение, но не получает) | Низкая      | Настройка `alwaysSummarize: true` переопределяет        |

#### Выгода

Экономия 3–4 с в сценариях финальных запросов (пропуск последнего раунда LLM).

---

### 3.2 Направление 2: стратегия маршрутизации на быструю модель в раунде summary

#### Позиционирование

**Это направление не вводит новый конвейер, но требует расширения интерфейса GeminiChat для поддержки переключения модели во время выполнения**.

Инфраструктура §1.4 предоставляет конфигурацию быстрой модели и сквозную передачу `modelOverride`, но **нет прецедента запуска `fastModel` со streaming в основном чате** – необходимо:

- Функция принятия решения: когда передавать `config.getFastModel()` как override
- Безопасный откат: новый интерфейс `GeminiChat.retryStreamWithModel` (работа с внутренним состоянием chat)
- Экспериментальное подтверждение: переключение fast/primary в основном чате не нарушает compaction / history-recording

#### Область применения

D2 действует только на:

- **useGeminiStream** (основной путь TUI) – точка вызова `sendMessageStream`, строка L1841
- **ACP Session** (путь интеграции IDE) – `acp-integration/session/Session.ts:1182`, синхронная доработка в Phase 3

D2 **не действует** на следующие пути, чтобы не вводить дополнительные сбои в неинтерактивных или изолированных контекстах:

- **Subagent runtime** (`agents/runtime/agent-core.ts:614`): под-агент уже имеет собственную конфигурацию модели
- **Cron-вызов turn** (`SendMessageType.Cron`, client.ts:127): не интерактивен, нет срочности RT
- **Notification turn** (`SendMessageType.Notification`, client.ts:129): то же

#### Основная сложность

При вызове `submitQuery` **мы не знаем**, собирается ли модель после просмотра результатов вызывать новый инструмент или сразу выдать текст. Если использовать быструю модель, а модель на самом деле планирует вызвать инструмент – последствия **скрыты**: быстрая модель может вызвать неверный инструмент или с неверными параметрами, и ошибка не проявится явно.

**Никакое поле на уровне инструмента** не может надёжно предсказать «будет ли следующий раунд summary», потому что это зависит от диалогового потока (user prompt + накопленный контекст), а не от локального свойства результата инструмента. Пример:

```
Пользователь: "прочитай utils.ts, а затем замени все console.log на logger.info"
  → Tool 1: read_file → результат самодостаточен
  → но следующий раунд очевидно НЕ summary
```

Поэтому D2 полностью полагается на **диалоговые эвристики** для прогноза и не использует поля инструментов.

#### Функция принятия решения: диалоговые эвристики + вето

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== Принудительные настройки пользователя (высший приоритет) =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // всё ещё подпадает под runtime-ограничения

  // ===== Вето по намерениям пользователя =====
  // 1. user prompt содержит глаголы действия → следующий раунд, скорее всего, опять вызов инструмента
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. В текущем пакете уже есть mutator → скорее всего, последует проверка/чтение
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. В текущем раунде или истории есть неразрешённые ошибки → модели нужна primary для диагностики
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== Вето по сложности вывода =====
  // 4. user prompt требует глубокого анализа (объяснение/сравнение/почему)
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. Вызовы инструментов ≥3 разных инструментов → связное повествование по результатам требует primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. Вывод инструмента слишком длинный → обобщение длинного контента требует primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== Вето по возможностям модели =====
  // 7. Context window быстрой модели недостаточен → переключение на fast вызовет compression
  //    (compression сам требует вызова LLM, что замедляет и увеличивает стоимость)
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== Запасной вариант для многоязычности =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Запасной вариант по состоянию Session =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Значение восьми условий вето:

- **`requestImpliesFurtherAction`**: глаголы действия (`изменить|удалить|добавить|заменить|исправить|реализовать|создать|create|fix|change|add|remove|implement|write|update`) → многошаговая задача
- **Попадание в `MUTATOR_KINDS`**: в текущем пакете уже была запись → с высокой вероятностью последует чтение/проверка. **Используем существующий `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` из `tools.ts:806`** (свойство `kind: Kind` каждого экземпляра Tool является авторитетной классификацией; не изобретать `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`**: двухэтапная проверка:
  - **Любая ошибка в текущем пакете → всегда неразрешена** (не предполагаем, что параллельные пакеты могут самокорректироваться)
  - **История: дедупликация по `(toolName, args fingerprint)`, последняя запись всё ещё с ошибкой считается неразрешённой** (только по toolName – ошибочно для разных аргументов одного имени)
  - `shell` и подобные должны корректно заполнять `ToolResult.error` (зависит от качества данных на предыдущем этапе)
- **`needsDeepReasoning`**: содержит ключевые слова «анализ/объяснение/почему/сравнение/диагностика»
- **`needsCrossResultReasoning`**: distinct вызовов инструментов ≥3 (один и тот же инструмент с одними и теми же аргументами считается одним вызовом)
- **Выходные токены > 4000**: эмпирический порог, **ждёт корректировки после базовых замеров на быстрой модели**
- **`wouldTriggerCompression`**: context window быстрой модели обычно меньше, чем у primary; та же история на fast раньше вызовет `tryCompress` (geminiChat.ts:1418) – compression сам требует вызова LLM, что **может ухудшить RT и увеличить стоимость**. Оценка: `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` считается срабатыванием
- **Неподдерживаемый язык**: проверяются только ключевые слова на китайском и английском; остальные языки (японский, корейский и т.д.) по умолчанию primary
- **Внезапное изменение состояния session**: первое продолжение после `/compact` или `/clear` → primary для восстановления ментальной модели
否决方向**偏向 primary**（лучше добавить 2 с, чем снизить качество）。

#### Ключевая реализация: `GeminiChat.retryStreamWithModel`

**Проблема**: Прямой `abort` + вызов `client.sendMessageStream` нарушает состояние чата:

1. `geminiChat.ts:1428` при запуске stream сразу же пушит `userContent` в историю; повторный запуск **пушит ещё раз**, что приводит к дублированию `function_response` в истории.
2. Блокировка `sendPromise` (`geminiChat.ts:1392, 1398`) — после `abort` необходимо гарантировать вызов `streamDoneResolver`.
3. Необходимо корректно очистить `pendingPartialState` и другие маркеры инвариантов, введённые в PR #4176.
4. Необходимо обновить атрибут модели в Span телеметрии.

**Новый интерфейс** (`packages/core/src/core/geminiChat.ts`):

```typescript
/**
 * Повторно выполняет уже запущенную или только что прерванную стриминговую отправку с другой моделью.
 * НЕ пушит userContent повторно (сохраняется из исходной отправки).
 * Сбрасывает pendingPartialState; освобождает устаревший sendPromise; переоткрывает span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

Контракт вызова:

- Вызывается только после того, как исходный send уже был прерван (без одновременного выполнения).
- `prompt_id` используется повторно (один и тот же пользовательский замысел).
- `userContent`, уже запушенный в историю, больше не пушится.

Объём реализации: около 1.5 дней + unit-тесты.

#### Защита во время выполнения

`selectContinuationTier` возвращает `'fast'`, но в stream появляется событие `ServerGeminiEventType.ToolCallRequest` → **немедленно прервать текущий поток и вызвать `retryStreamWithModel(primaryModel)`**.

Это покрывает единственный сценарий "тихой" ошибки, когда предсказывается summary, а на самом деле требуется инструмент. Цена: один потраченный впустую вызов fast (распределение затрат см. в §5.3).

#### Разделение с `modelOverride` от skill

`useGeminiStream.modelOverrideRef` (L376, L2225) в настоящее время хранит **модель, явно выбранную skill** — это "бизнес-семантика". Fast-маршрутизация в данном направлении — это "оптимизационная семантика". Их **необходимо разделить**:

```typescript
// Новый независимый ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// Точка вызова объединяется (не переиспользуем modelOverrideRef)
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // явный выбор skill имеет приоритет
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

Жизненный цикл:

| Момент                                       | `modelOverrideRef` (skill) | `summaryTierRef` (fast-маршрут)            |
| -------------------------------------------- | -------------------------- | ---------------------------------------- |
| Новый user turn (`!Retry && !ToolResult`)    | Очищается                  | Очищается                                |
| skill инструмент вернул поле `modelOverride`  | Записывается               | Не изменяется                            |
| tool batch завершён → `selectContinuationTier` | Не изменяется              | Записывается                             |
| Runtime fallback (видим ToolCallRequest)     | Не изменяется              | Повышается до `'primary'`                |
| Retry (пользователь вручную Ctrl+Y)          | Сохраняется                | Повышается до `'primary'` (fast больше не применяется) |

Явный выбор skill **всегда побеждает** — явное намерение пользователя приоритетнее оптимизационной стратегии.

#### Исправления телеметрии

В `client.ts:1303` span взаимодействия при запуске turn записывает атрибут `model`. При срабатывании fallback модель фактически меняется, данные span искажаются. Необходимо:

```typescript
// при срабатывании fallback
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

А также различать модели `requested` / `actual` в `addUserPromptAttributes`, чтобы избежать путаницы при биллинге/аудите.

#### Принудительное включение/отключение на уровне пользователя

Добавить настройку (`packages/cli/src/config/settingsSchema.ts`):

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`: использовать `selectContinuationTier` (рекомендуется)
- `'always_primary'`: полностью отключить D2-оптимизацию (чувствительные к качеству сценарии)
- `'always_fast'`: пропустить вето, **всё ещё под защитой runtime-защиты** (продвинутые пользователи)

Обоснование: D2 — это компромисс качества ради скорости; некоторым пользователям/сценариям нужно явное право отказаться.

#### Предварительные условия

- `config.getFastModel()` должен быть сконфигурирован
- **Эксперимент по валидации fastModel-streaming в основном чате** (1 день до кодирования):
  - Создать mock-инструмент с `resultIsTerminal=true`, многократно вызывать summary round в основном чате.
  - Наблюдать, не вызывается ли `tryCompress` ошибочно (fast-модель может сработать раньше из-за меньшего окна контекста).
  - Наблюдать, нет ли `model mismatch` в выводе `chatRecordingService`.
  - Наблюдать, может ли следующий primary-вызов корректно читать историю после одного fast-вызова.
- **Базовое измерение fast-кандидата модели** (1 день):
  - Запустить 100 prompt'ов summary round (входные данные содержат `function_response`), измерить P50/P95 сквозной задержки и time-to-first-token.
  - Измерить частоту срабатывания `tryCompress` `P_compact`, проверить чистый выигрыш по RT = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - Включать только если P50 fast ≤ primary P50 × 0.5 и P95 fast ≤ primary P95 × 0.6.
- Fast-модель и primary-модель должны быть из одного семейства (избежать различий в кодировании `function_response`); кросс-семейственный выбор должен отклоняться на уровне `getFastModel()`.
- **Совместимость `thinkingConfig`**:
  - Fast-модель должна быть согласована с primary по поддержке `thinkingConfig.includeThoughts`; или
  - На fast-пути принудительно установить `includeThoughts: false` (согласно `sideQuery.ts:118-122`)
  - Проверить: если в истории есть `thought parts`, fast-модель обрабатывает их корректно (не выдаёт ошибку, не принимает thought за пользовательский ввод).

#### Риски и смягчение

| Риск                                                      | Серьёзность | Смягчение                                                                                                                                 |
| --------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fast-модель молча ошибается при вызове инструментов       | Высокая     | Эвристика диалогового потока + защита abort'a при ToolCallRequest в рантайме                                                             |
| Fast-модель галлюцинирует "видимый пользователю ошибочный ответ" при входных данных с ошибками | **Высокая** | `hasUnresolvedError` veto; мониторинг частоты уточнений пользователя (примечание: аналогичный риск `emitToolUseSummaries` затрагивает только 60-токенную метку, этот риск влияет на финальный ответ, масштаб выше) |
| Fast-путь вызывает `tryCompress` → дополнительный LLM-вызов, **ухудшает RT и стоимость** | **Высокая** | Предварительный gate `wouldTriggerCompression` (см. решающую функцию #7); предварительное измерение порога `P_compact`                    |
| Чей модель использует compression                          | Средняя     | При срабатывании compression немедленно отказаться от fast-маршрута (gate #7 подстраховывает); избежать проблем с ответом                |
| Смена модели в основном чате вызывает аномалии внутреннего состояния/записи чата | Средняя     | Покрыть предварительным валидационным экспериментом; тест воспроизведения при session resume                                              |
| D2 и `emitToolUseSummaries` одновременно вызывают concurrent fast-вызовы, превышая rate-limit | Средняя     | Либо отключать `emitToolUseSummaries` при включённом D2 (заголовки не влияют на функционал), либо использовать общий token bucket rate-limit |
| `thinkingConfig` различается между fast/primary, вызывая проблемы парсинга history | Средняя     | Одно семейство + принудительное `includeThoughts: false` на fast-пути (см. предварительные условия)                                         |
| Fallback-путь оказывается дороже (сожжённые fast токены + полный primary) | Средняя     | Мониторинг решения по `fast_tokens_consumed`; автоматическое отключение флага при rate fallback >20%                                        |
| Искажение model в span телеметрии                          | Средняя     | Разделение `requested` / `actual` (см. исправления телеметрии)                                                                              |
| Несовместимость формата контекста (кросс-семейство)        | Средняя     | `getFastModel()` должен отклонять кросс-семейственный выбор                                                                                 |
| Семантический конфликт с modelOverride от skill            | Средняя     | Независимый ref + приоритет skill                                                                                                          |
| После смены основной модели во время выполнения через `/model` решение `summaryTierRef` становится недействительным | Низкая      | При обработке команды `/model` синхронно очищать `summaryTierRef`                                                                          |
| fast токены/с медленнее                                    | Низкая      | При реальном тестировании измерять TTFT, а не только общий RT                                                                             |
#### 收益（待实测）

- **RT**：summary 轮节省 2-3s（实测前不写入 PR 标题）
- **成本**：fast 模型单价通常显著低于 primary，高频 summary 场景下 token 成本可能下降 30-50%；但 fallback 路径浪费会抵消部分收益，需用 `fast_tokens_consumed` 实测确认净收益

---

### 3.3 方向三：结果展示与交互解耦（Presentation Decoupling）

#### 问题

用户从工具完成到可以再次输入，必须等 LLM 总结轮完成：

```
工具完成 → [渲染结果] → [submitQuery] → [等 LLM 流式回复 3-4s] → Idle → 可输入
                                         ~~~~~~~~~~~~~~~~~~~~~~~~
                                         用户已看到结果但无法操作
```

#### 设计

新增 `StreamingState.Summarizing` 状态：

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // 新增
}
```

#### 状态机变更

```
工具完成且结果已展示
  → 若 batch 全员 postExecution.resultIsTerminal === true:
    → 进入 Summarizing（用户可输入）
    → submitQuery 异步执行
    → LLM 总结追加到 history（或被用户新消息取消）
  → 否则:
    → 保持 Responding（用户不可输入）
```

#### 用户新消息处理

- `Summarizing` 状态下用户提交新消息 → abort 当前总结 → 处理新消息
- 已生成的**部分总结文本丢弃**（不入 history），避免半句 assistant 污染上下文
- `function_response` 仍保留在 history（模型知道工具执行了）
- followup suggestion 等 Summarizing 完成或被取消后再触发

#### Abort 时 partial text 清理清单

partial text 分布在多处，需**同时**清理，缺一会导致状态不一致：

| 位置                                                           | 清理动作                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current`（useGeminiStream React state） | 置 `null`，不调 `addItem`                                                                 |
| `GeminiChat.history` 内部累积                                  | abort 前若已 push 部分 assistant content，需通过新的 `discardPendingAssistant()` 接口回滚 |
| `ChatRecordingService` buffered turn                           | 标记为 cancelled，不写入 JSONL                                                            |
| `dualOutput.emitText`（如启用）                                | 发送 abort sentinel，sidecar 自行丢弃                                                     |
| `loopDetectorRef` 累积 token                                   | 重置当前 turn 计数                                                                        |

执行顺序：abort signal 触发 → 收齐上述五处清理 → 才允许新 user message 进入 `submitQuery`。竞态测试覆盖：abort 触发瞬间正好收到最后一个 chunk。

#### 适用条件

batch 全员 `postExecution.resultIsTerminal === true`。

#### 历史不变量（与 §3.1 同源）

中途打断 Summarizing 会产生：

```
[user_1, function_call, function_response, user_2]
                                          ↑ 无 assistant turn
```

**这与 §3.1 跳过 LLM 轮破坏的是同一个不变量**，必须使用与 D1 相同的修复策略（注入空 assistant / 接受 Qwen 容忍）。

- 复用 D1 的不变量单测覆盖
- session-load 重放（含 `repairOrphanedToolUseTurnsInHistory`）必须覆盖此形态
- Anthropic alternation：直连时与 D1 同时补兜底

#### 风险与缓解

| 风险                                | 严重度 | 缓解                                                           |
| ----------------------------------- | ------ | -------------------------------------------------------------- |
| Abort 时半句 assistant 进 history   | **中** | 显式丢弃 partial text；仅保留 function_response；单测覆盖 race |
| 历史不变量破坏（无 assistant 接续） | **中** | 与 D1 同源问题，统一修复（见 §3.1 历史不变量）                 |
| UI 状态复杂度增加                   | 中     | Summarizing = Idle + 背景任务；输入路径复用 Idle               |
| 用户感知收益依赖行为模式            | 低     | 用户若 3s 内不输入，summary 已完成 → 无感知收益；但**不退化**  |

#### 收益

- **理论上限**：3-4s 感知 RT（用户工具完成即输入）
- **实际中位数**：取决于用户输入间隔——读结果 2-5s 后才输入的用户不会感受到差异，但**绝不会更慢**

---

### 3.4 方向四：流式提前调度（Stream-Ahead Scheduling）

#### 问题

`processGeminiStreamEvents` 在 stream 完全结束后才批量调度工具。`ToolCallRequest` 事件可能在 stream 中期就已 yield。

#### 设计

在 stream 事件处理中对 `ToolCallRequest` 立即开始**前置验证**（不执行）：

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // 新增
  break;
```

`CoreToolScheduler.prevalidate(request)`：

1. 查找工具注册
2. 构建 invocation
3. 执行 `shouldConfirmExecute`（缓存结果）
4. `schedule()` 时直接使用缓存结果

#### 纯度契约与 Allowlist

`prevalidate` 要求 `shouldConfirmExecute` 是 side-effect-free **且**结果在 prevalidate→schedule 间隙不会被外部修改使之失效。

**直接复用 `tools.ts:818` 的 `CONCURRENCY_SAFE_KINDS`**：

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

这是项目已有的"无副作用 + 可并发"分类，正好匹配 prevalidate 需求。

| 工具 Kind                     | 是否在 allowlist        | 理由                                                    |
| ----------------------------- | ----------------------- | ------------------------------------------------------- |
| `Read`（read_file 等）        | ✅                      | 纯读                                                    |
| `Search`（grep / glob）       | ✅                      | 纯读                                                    |
| `Fetch`（web_fetch 等）       | ✅                      | 远程读，无写副作用                                      |
| `Edit`                        | **❌**（见下文 TOCTOU） | shouldConfirmExecute 纯只读，但 diff 在调度间隙可能失效 |
| `Delete` / `Move` / `Execute` | ❌                      | MUTATOR_KINDS                                           |
| `Think`                       | ❌                      | 含 save_memory / todo_write 等隐式写                    |
| MCP 工具                      | ❌                      | 不可信                                                  |
**TOCTOU: Почему Edit не входит в allowlist**

Теоретически `shouldConfirmExecute` для Edit чисто read-only (чтение файла, вычисление diff). Но между prevalidate и schedule существует временное окно:

```
T=0      поток получает Edit(file=a.ts, ...) → prevalidate
T=10ms   shouldConfirmExecute читает a.ts, кеширует diff_v0
T=300ms  поток завершается, scheduler.schedule()
T=305ms   за это время другие инструменты/IDE/внешние процессы изменяют a.ts
T=310ms  scheduler показывает diff_v0 пользователю
T=320ms  пользователь подтверждает на основе v0
T=330ms  Edit применяет старые params к файлу v1 → повреждение содержимого / слияние не удалось
```

Это TOCTOU. Направления исправления:

- **A (рекомендуется)**: Edit не входит в allowlist, prevalidate покрывает только три типа `CONCURRENCY_SAFE_KINDS`. Цена: выгода снижается с "50-200ms (преимущественно Edit)" до "50-100ms (только чтение)"
- **B (опциональное усиление)**: Edit входит в allowlist, но кеш дополняется `(mtime, size, content_hash)`; при schedule() проверяется, не изменились ли значения, и только тогда используется кеш, иначе пересчёт

Документация пока выбирает A.

#### Взаимодействие с существующим параллельным планированием

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) использует `partitionToolCalls` для разделения инструментов на "пакеты, безопасные для параллельного выполнения" и "последовательные пакеты". Параллельные пакеты выполняются через `runConcurrently` (L2473).

prevalidate должен синхронизироваться с этой моделью разделения:

- кеш индексируется по `callId` (не по `(toolName, args)`, чтобы избежать конфликтов при параллельных вызовах с одинаковыми именами)
- call, неуспешный в prevalidate → не влияет на другие call, при schedule() этот call идёт по исходному пути `shouldConfirmExecute`
- при отмене потока по `signal` каскадно прерываются все выполняющиеся prevalidate

#### Риски

| Риск                                                                   | Серьёзность | Смягчение                                                                       |
| ---------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Кешированный diff не соответствует реальному файлу при подтверждении (TOCTOU) | Высокая     | Вариант A: Edit не входит в allowlist; Вариант B: кеш с проверкой `(mtime, size, hash)` |
| Сбой prevalidate влияет на планирование                                | Низкая      | При сбое/тайм‑ауте возврат к исходному пути `shouldConfirmExecute`, отсутствие кеша ≡ не включено |
| Конкурентный prevalidate разделяет fd / соперничество за ресурсы       | Низкая      | `QWEN_CODE_MAX_TOOL_CONCURRENCY` ограничивает параллельность (по умолчанию 10) |

#### Выгода

50-100ms/раунд (только в рамках `CONCURRENCY_SAFE_KINDS`). Если выбрать вариант B с Edit, теоретическая выгода 100-200ms.

---

## 4. Комплексная оценка и дорожная карта

### 4.1 Комплексная оценка

| Направление             | Выгода по RT                | Сложность реализации          | Риск для качества | Зависимости                                    | Приоритет |
| ----------------------- | --------------------------- | ----------------------------- | ----------------- | ---------------------------------------------- | --------- |
| D1 Постинструкции инструмента | 3-4s/финальный раунд        | Низкая (2-3д)                 | Низкий            | Нет                                            | **P0**    |
| D2 Быстрый маршрут summary | 2-3s/раунд summary (требует измерения) | **Средне-высокая (9д)** | Средне-высокий    | Эвристика D2 + валидационный эксперимент main chat + синхронизация ACP | **P1**    |
| D3 Разделение отображения | 3-4s улучшение восприятия (зависит от поведения пользователя) | Средняя (3-5д, включая исправление инвариантов) | Средний    | Исправление исторических инвариантов D1         | **P1**    |
| D4 Упреждающее планирование потока | 50-200ms/раунд              | Высокая (5-7д)                | Очень низкий      | Нет                                            | P2        |

#### Разбивка работ D2

| Подзадача                                                                                                              | Оценка |
| ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Валидационный эксперимент main chat fastModel-streaming (включая измерение P_compact)                                   | 1д     |
| Базовое измерение быстрых моделей-кандидатов (включая TTFT, P95, совместимость `thinkingConfig`)                       | 1д     |
| Интеграция `selectContinuationTier` + `summaryTierRef` (useGeminiStream)                                               | 0.5д   |
| Реализация эвристики (включая повторное использование `MUTATOR_KINDS` / оценка `wouldTriggerCompression` / многоязычность / мутация состояния) | 1д     |
| Реализация интерфейса `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`                                    | 1.5д   |
| Модификация синхронизации сессии ACP (acp-integration/session/Session.ts)                                              | 1д     |
| Исправление spans телеметрии (разделение `requested` / `actual`)                                                        | 0.5д   |
| Настройка на уровне пользователя `summaryTierStrategy` + JSON schema + интеграция с `/config`                          | 0.5д   |
| Юнит-тесты (гонки, моменты abort, инварианты истории, пути отката, путь ACP)                                            | 2д     |
| **Итого**                                                                                                              | **9д** |

> Примечание: ранняя оценка в 6,5д не учитывала путь ACP, защиту `wouldTriggerCompression`, список очистки, инженеринг схемы settings и т.д.

### 4.2 План реализации

#### Фаза 1: D1 Постинструкции инструмента (1 неделя)

- Расширение `ToolResult.postExecution` (tools.ts L422): `skipLlmRound` + `resultIsTerminal`
- Реализация сокращения `skipLlmRound` в `handleCompletedTools` (useGeminiStream.ts L2038)
- Юнит-тесты покрывают инварианты истории
- **Фаза 1 не использует `resultIsTerminal`** (оставлено для Фазы 3)

#### Фаза 2: Построение экосистемы сигналов (2 недели, параллельно с Фазой 4)

- Постепенная разметка встроенных инструментов с помощью `skipLlmRound` / `resultIsTerminal` (см. таблицу §3.1)
- Проверка покрытия разметки ≥60% (взвешенное по числу раундов, а не по числу вызовов)
- Сбор production-данных, калибровка порогов шлюза veto из §3.2
- В конце Фазы 2 проведение валидационного эксперимента из §3.2 и базовых измерений

#### Фаза 3: D2 + D3 (примерно 3 недели, включая синхронизацию ACP)

> **Исправление**: ранняя дорожная карта оценивала 1 неделю, не включая валидационный эксперимент fastModel-streaming, реализацию `retryStreamWithModel`, единое исправление инвариантов, синхронизацию пути ACP.

- Перед кодированием: завершить валидационный эксперимент main chat + базовые измерения (включая совместимость `P_compact` с thinkingConfig)
- Добавить `summaryTierRef` + `selectContinuationTier` (включая защиту `wouldTriggerCompression`)
- Добавить `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **Одновременно модифицировать путь сессии ACP** (acp-integration/session/Session.ts) для использования той же функции принятия решений
- Добавить `StreamingState.Summarizing` + повторное использование входного пути + список очистки abort
- Единое исправление инвариантов истории (общий источник для D1+D3)
- Флаг функции `experimental.summaryRoundFastModel: false`, **по умолчанию выключен в Release N**
- Пользовательская настройка `summaryTierStrategy`
- Исправление spans телеметрии
- Защита времени выполнения (ToolCallRequest abort + retryStreamWithModel)

#### Фаза 4: D4 Упреждающее планирование потока (может быть вставлено независимо)

- `CoreToolScheduler.prevalidate` + allowlist
- Инкрементальное планирование `processGeminiStreamEvents`
---

## 5. Метрики, приёмка и ограничения

### 5.1 Показатели производительности

| Метрика                         | Базовый уровень | Phase 1 | Phase 3                   |
| ------------------------------- | --------------- | ------- | ------------------------- |
| Сквозное время отклика P50 (3 цикла) | 13,4 с          | <10 с   | <8 с (требуется замер)    |
| Сквозное время отклика P95      | -               | <13 с   | <12 с (верхняя граница fallback-пути) |
| Время до первого результата для пользователя P50 | 13,4 с          | <10 с   | <5 с (с включённым D3)    |
| Время до первого результата для пользователя P95 | -               | <13 с   | <8 с                      |
| Количество вызовов LLM (сценарии с пропуском) | 3               | 2       | 2 (быстрее)               |

> Примечание: базовый уровень основан на единичном замере; перед внедрением необходимо добавить ≥3 сценариев.

### 5.2 Показатели качества

| Метрика                                           | Базовый уровень | Допустимая деградация       |
| ------------------------------------------------ | --------------- | --------------------------- |
| Точность Tool-calling (для fast model в цикле summary) | 100%            | ≥98%                        |
| Частота ложного срабатывания skipLlmRound (пользователь уточняет «подробнее») | -               | <1%                         |
| Частота fallback_triggered для fast model         | -               | <10% (автоматическое отключение флага при >20%) |
| Попадание ответа ассистента из состояния Summarizing в историю | 0               | 0 (строго)                  |

### 5.3 Показатели стоимости

| Метрика                                    | Базовый уровень | Цель Phase 3                                                |
| ------------------------------------------ | --------------- | ----------------------------------------------------------- |
| Стоимость токенов на 1000 сессий (цикл summary) | 100%            | <70%                                                        |
| Доля токенов, потраченных впустую на fallback-путь | 0               | <15% (частота fallback × количество токенов fast model за один вызов / количество токенов primary model за один вызов) |

### 5.4 Схема журнала решений

Каждое критическое решение в `selectContinuationTier` и `handleCompletedTools` записывается в структурированном журнале:

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // решение (до fallback)
  tier_actual:    'fast' | 'primary',          // фактическое выполнение (после fallback)
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // двойные измерения при fallback
  fast_tokens_consumed: int,                    // токены fast model, потраченные впустую (отнесение затрат)
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Наблюдаемые показатели:

- частота срабатывания fast model (ожидается 30–50%)
- частота fallback_triggered (ожидается <10%; >20% — рекомендовать отключить флаг по умолчанию в следующем релизе)
- доли различных причин вето (позволяет определить излишнюю жёсткость/мягкость)
- fast_tokens_consumed × fallback_rate (риск обратного роста затрат)
- частота вопросов пользователя «подробнее» (сигнал ухудшения качества fast model)

**Пояснение к измерению `fast_tokens_consumed`**:

Прерванный поток stream **скорее всего не получит `finishReason` / `usageMetadata`** — последние заполняются только при полном завершении stream. Реализация должна использовать оценку:

- приоритет: до прерывания попытаться выполнить `stream.return()`, чтобы генератор прошёл по пути finally; возможно частичное получение usage
- запасной вариант: накопленная длина текста в полученных чанках × 4 для оценки выходных токенов; входные токены оценивать по истории
- пометка: в поле журнала добавить `tokens_source: 'usage' | 'estimated'`; при последующем анализе необходимо разделять эти данные

### 5.5 Методы верификации и стратегия развёртывания

#### Верификация

- Использовать существующую систему хронометража `/tmp/tool-timing.log`
- Добавить `T_userIdle` (момент, когда пользователь может снова ввести запрос)
- Добавить `T_firstToken` (момент получения первого токена в потоке)
- A/B-тестирование для сравнения времени отклика и распределения затрат до и после каждого Phase

#### Стратегия развёртывания (адаптирована для локального CLI)

Qwen Code — локальный CLI, **не имеющий возможности runtime-распространения**; традиционное «канареечное» развёртывание (5% / 25% / 100%) неприменимо. Используется **поэтапное продвижение через релизы**:

| Этап                     | Узел релиза          | Значение feature flag по умолчанию | Условие активации                                           |
| ------------------------ | -------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Phase 3a: dogfood        | Релиз N              | `false`                            | Внутренние пользователи включают самостоятельно через `summaryTierStrategy=always_fast` |
| Phase 3b: opt-in по умолчанию | Релиз N+1 (≥2 недели спустя) | `false` (не меняется)              | По результатам dogfood журнал решений соответствует критериям: fallback <10%, чистая выгода по времени/затратам >0 |
| Phase 3c: включено по умолчанию | Релиз N+2 (≥4 недели спустя) | `true`                             | В Phase 3b нет сообщений о регрессии качества на уровне пользователей |
| Откат                    | Релиз N+3 (при необходимости) | `true → false`                     | Масштабный fallback >20% или деградация показателей качества |

**Механизм отката**:

- Нет runtime-распространения, поэтому **откат = выпуск нового релиза с выключенным флагом по умолчанию**
- На уровне пользователя `summaryTierStrategy=always_primary` всегда предоставляет канал «немедленного выхода», не зависящий от нового релиза
- `fallback_rate` / `cost_regression` из журнала решений оцениваются в каждом цикле релиза, определяя дальнейшие шаги

### 5.6 Известные ограничения

1. **Скудность базовых данных**: единичный замер не покрывает все типы задач; перед внедрением необходимо дополнить сценарии
2. **Предпосылка для fast model**: если нет существенно более быстрой модели того же семейства с достаточной точностью tool-calling, D2 не активируется
3. **`skipLlmRound` — компромисс качества ради скорости**: пропуск LLM означает отказ от понимания и коррекции модели; применим только в сценариях с высокой определённостью
4. **D2 — компромисс качества и затрат ради скорости**: fast model уступает primary по качеству; fallback-путь может оказаться дороже — необходимо подтвердить чистую выгоду на основе журнала решений
5. **`tryCompress` может ухудшить ситуацию**: контекст fast model меньше, а сжатие само требует вызова LLM — защита `wouldTriggerCompression` обязательна
6. **Разделение отображения меняет модель взаимодействия**: новый режим требует адаптации пользователя; фактическое восприятие выгоды зависит от поведения пользователя
7. **Задержка в сети неконтролируема**: данное решение сокращает количество вызовов, а не оптимизирует одиночный вызов
8. **Прямое подключение к Anthropic не охвачено**: текущая толерантность к alternation основана на API стиля Qwen / OpenAI
9. **Потоковая передача fastModel в основном чате внедряется впервые**: нет производственного прецедента; требуется независимая экспериментальная верификация
10. **Локальный CLI не имеет runtime-распространения**: стратегия развёртывания возможна только через поэтапные релизы; невозможно быстрое канареечное регулирование
11. **D2 действует только на интерактивном пути**: Subagent / Cron / Notification не получают выгоды — это намеренно
12. **Долгосрочное влияние смешанной модели на историю неизвестно**: при включённом D2 сессионные обороты переключаются между fast/primary; необходимо наблюдать за возобновлением длинных сессий и связностью контекста
13. **Снижение выгоды D4**: после исключения Edit из allowlist превалидация покрывает только инструменты для чтения (выигрыш 50–100 мс); выигрыш 200 мс с Edit потребует механизмов mtime/hash из схемы B
### 5.7 Ключевые позиции в коде

| Файл                                                   | Ключевые символы                                           | Расположение          |
| ------------------------------------------------------ | ---------------------------------------------------------- | --------------------- |
| `packages/core/src/tools/tools.ts`                     | `ToolResult` interface                                     | L422                  |
| `packages/core/src/tools/tools.ts`                     | `Kind` enum + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`   | L793, L806, L818      |
| `packages/core/src/tools/tools.ts`                     | `DeclarativeTool.kind: Kind` (каждый экземпляр Tool)       | L165                  |
| `packages/core/src/core/client.ts`                     | `SendMessageOptions.modelOverride`                         | L142                  |
| `packages/core/src/core/client.ts`                     | `sendMessageStream`                                        | L1216                 |
| `packages/core/src/core/client.ts`                     | `modelOverride ?? getModel()`                              | L1305, L1598          |
| `packages/core/src/core/client.ts`                     | `turn.run(model, …)`                                      | L1707                 |
| `packages/core/src/core/geminiChat.ts`                 | `sendMessageStream(model, …)`                              | L1387                 |
| `packages/core/src/core/geminiChat.ts`                 | `history.push(userContent)`                                | L1428                 |
| `packages/core/src/core/geminiChat.ts`                 | блокировка `sendPromise`                                   | L1392                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | `modelOverrideRef` (выбор модели для скилла)               | L376, L2225           |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | `processGeminiStreamEvents`                                | L1365                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | точка вызова `sendMessageStream`                           | L1841                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | `handleCompletedTools`                                     | L2038                 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | `submitQuery(ToolResult, …)`                               | L2355                 |
| `packages/core/src/services/toolUseSummary.ts`         | fast-model side query (нестриминговый прецедент)           | L108                  |
| `packages/core/src/followup/speculation.ts`            | fast-model streaming (прецедент forked chat)               | L224                  |
| `packages/core/src/config/config.ts`                   | `fastModel` + `getFastModel` + `setFastModel`              | L684, L1987, L2021    |
| `packages/core/src/core/coreToolScheduler.ts`          | `attemptExecutionOfScheduledCalls`                         | L2436                 |
| `packages/core/src/core/coreToolScheduler.ts`          | `runConcurrently` + `partitionToolCalls`                   | L2473                 |
| `packages/cli/src/acp-integration/session/Session.ts`  | точка вызова `sendMessageStream` (путь ACP / IDE)          | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`       | Subagent `sendMessageStream` (не зависит от D2)            | L614                  |

---

## 6. Запись верификации ревью (2026-05-26)

### 6.1 Метод верификации

Для нескольких **заявленных, но не количественно оценённых** предположений о качестве данных и оценках выгоды из проектного документа было запущено 4 параллельных Explore subagent для read-only анализа кода. Каждый subagent отвечает только на один фактический вопрос, не делает выводов и не предлагает оптимизаций. Исследование основано на текущей ветке `main` (HEAD: `026f2f768`).

| Вопрос верификации                                                               | Связанный раздел                     |
| -------------------------------------------------------------------------------- | ------------------------------------ |
| Q3 Заполняемость поля `ToolResult.error` у всех текущих инструментов             | §3.2 Предусловие `hasUnresolvedError`|
| Q4 Фактическая доступность `usageMetadata` после stream abort                    | §5.4 Измерение `fast_tokens_consumed`|
| Q5 Существование точек сбора "пользовательский запрос / уточнение"               | §5.2 Сигнал мониторинга регрессии fast|
| Q6 Реальная нагрузка I/O при `shouldConfirmExecute` для `CONCURRENCY_SAFE_KINDS` | §3.4 Оценка выгоды D4               |

### 6.2 Находка 1: Эвристика `hasUnresolvedError` имеет 32% слепой зоны по инструментам (влияние на D2)

**Факт**: Из 22 инструментов с путями ошибок **15 (68%) корректно заполняют поле `ToolResult.error`** (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-\* и другие основные I/O инструменты в порядке), **7 (32%) просто помещают ошибку в строку `llmContent`**: `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite` и т.д.

**Отсутствует** единый хелпер `createErrorResult`; каждый инструмент реализует формирование ошибки независимо.

**Влияние на дизайн**:

- Если отрицающий критерий `hasUnresolvedError` из §3.2 будет проверять только поле `ToolResult.error`, **для этих 7 инструментов сбой никогда не вызовет переключение на primary** – следующий раунд всё равно будет направлен на fast model
- Особенно **сбой инструмента `skill`, который будет ошибочно обобщён fast model**, является приоритетным сценарием риска (на него будут влиять многочисленные workflows на базе skill в этом репозитории)
- Список из §3.2 "shell и т.п. должны корректно заполнять ToolResult.error (зависимость от качества данных)" **слишком узок**: shell уже корректно заполнено, реальные пропуски – это skill / lsp / todoWrite и т.д.

**Рекомендуемая правка**: Добавить "**доработку 7 инструментов, которые передают ошибки только через `llmContent`, для корректного заполнения поля `error`**" как жёсткое предусловие D2 (§3.2 предусловие). Оценка времени ~2d; не принимать "запасной путь" с проверкой `llmContent.match(/^Error:/i)` (высокий риск ложных срабатываний).
### 6.3 Обнаружение 2: Затраты на реализацию метрики `fast_tokens_consumed` недооценены (влияние на D2 / §5.3)

**Факты**:

- В `turn.ts` путь аварийного завершения (abort) (L289-291) выполняет прямой `return`, **без блока finally и без вызова `stream.return()`** – вход, описанный в §5.4 как "вызов `stream.return()` перед abort, чтобы генератор прошёл через finally", в текущем коде отсутствует.
- Цикл `for await` в `geminiChat.ts:processStreamResponse` записывает turn только при полном проходе (L1286); прерывание abort означает, что финальный chunk с usage-only (обычно содержащий полные метаданные) **просто отбрасывается**.
- В основном пути чата **нет никакого резервного накопления токенов на уровне chunk**; накопление есть только в слое subagent (`agent.ts:731-744`), который не может быть повторно использован.
- Вывод: при abort `usageMetadata` **недоступен**, доступна только оценка `chars/4` (погрешность ±20%).

**Влияние на проект**:

- В трёхуровневой схеме §5.4 "приоритетный / резервный / маркировка" **приоритетный путь в текущем коде недостижим** – требуется сначала изменить структуру генератора `sendMessageStream`, добавив finally; объём работ ~1 день, в документе эта стоимость не отражена.
- В §5.3 цель Phase 3 "стоимость токенов на тысячу сессий <70%"; но если сама метрика имеет погрешность ±20%, **"70%" и "82%" лежат в пределах шума измерений**.

**Рекомендуемая корректировка**:

- §5.3 переписать как **метрику тренда**, а не как gate для релиза; использовать комбинированную оценку по двум метрикам: "коэффициент `fallback_triggered` из журнала решений + однонаправленный тренд `fast_tokens_consumed`".
- §5.4 дополнить: для реализации `fast_tokens_consumed` необходимо сначала переработать путь abort в turn.ts, добавив finally + `stream.return()`, как дополнение к объёму работ §3.2 (+1д).

### 6.4 Обнаружение 3: `user_prompt_classification` и "продолжение запроса пользователем" требуют создания новой метрики (влияние на D2 / §5.2)

**Факты**:

- В `packages/core/src/followup/` уже существуют `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, но их телеметрия (`PromptSuggestionEvent`) фиксирует **"системные предложения приняты/проигнорированы"**, а не "пользователь задаёт уточняющий вопрос".
- `ChatRecordingService` сохраняет сообщения пользователя, но **не навешивает метки классификации**.
- Поиск по всему репозиторию не выявил `user_prompt_classification`, ни англоязычного, ни китайского распознавания шаблонов уточнений, ни механизмов `clarif*` / `intentDetect`.

**Влияние на проект**:

- В схеме журнала решений §5.4 поле `user_prompt_classification: 'query' | 'action' | 'analysis'` **не имеет источника данных** – его нельзя вывести ни из существующих PromptSuggestionEvent, ни из ChatRecord.
- В §5.2 метрика "частота уточнений пользователя 'подробнее'" – то же самое; ближайший существующий якорь `followupState.onOutcome` неприменим.

**Рекомендуемая корректировка**:

- В §3.2 в предварительные условия добавить "минимальная реализация классификатора пользовательского ввода" (распознавание русскоязычных/англоязычных шаблонов, ~3д); иначе в §5.4 поля `user_prompt_classification` и `requestImpliesFurtherAction` останутся без данных.
- Или **принять**, что на этапе dogfood Phase 3a этих двух сигналов не будет, а мониторинг регрессов качества вести только по доле `fallback_triggered` – дешевле, но рискованнее.

### 6.5 Обнаружение 4: Внутреннее противоречие проекта D4 – allowlist и привязка выгоды не согласованы (влияние на D4 / §3.4)

**Факты**:

- Для инструментов `Kind.Read` (read_file), `Kind.Search` (glob / grep), `Kind.Fetch` (web_fetch) методы `shouldConfirmExecute` / `getConfirmationDetails` **в большинстве случаев наследуют реализацию по умолчанию из `BaseToolInvocation`, выполняя нулевой ввод-вывод** (read_file / glob / grep вообще не переопределяют, web_fetch делает только 5-10 строк парсинга URL hostname).
- Реальный ввод-вывод происходит в `Edit` / `WriteFile` (`calculateEdit` + `readTextFile` + `Diff.createPatch`, типично ~20ms), но §3.4 схема A исключает их из allowlist для обхода TOCTOU.
- **Результат**: для трёх типов инструментов, оставшихся в allowlist, объём работы по prevalidate практически не отличается от отсутствия prevalidate – фактически allowlist блокирует "единственный инструмент с возможностью экономии ввода-вывода (Edit)", оставляя "инструменты с нулевой стоимостью".

**Влияние на проект**:

- Повествование §3.4 о "предварительной верификации ввода-вывода" **несостоятельно**: реальный выигрыш 50-100мс происходит от **устранения ожидания планирования "пока поток полностью не завершится, а затем пакетная постановка в очередь"**, а не от ввода-вывода инструментов.
- Неправильная привязка выгоды влечёт две проблемы:
  1. **allowlist может быть шире** – пригодны все инструменты с идемпотентным prevalidate, не обязательно привязываться к `CONCURRENCY_SAFE_KINDS`.
  2. **Вложение 5-7д трудно обосновать** – если реальный выигрыш ~50мс от изменения модели планирования, а Edit не в allowlist, то ROI этого вложения ниже, чем предполагалось в документе.

**Рекомендуемая корректировка**: §3.4 переписать привязку выгоды:

- Разбить на две части: (a) ~50мс экономии от изменения модели планирования (устранение ожидания потока); (b) ~0мс экономии от предварительного ввода-вывода инструментов (внутри allowlist) / ~20мс (если Edit включить в allowlist).
- В сводной оценке §4.1 изменить выигрыш по RT для D4 с "50-200ms" на "30-80ms (схема A, в основном от модели планирования) / 100-200ms (схема B, включая Edit)".
- В roadmap §4.2 дополнительно снизить приоритет D4 – чистое изменение модели планирования можно делать независимо, не обязательно привязывать к концепции prevalidate.

### 6.6 Влияние на roadmap (сводка)

| Раздел                        | Оценка изначальная | После верификации | Источник увеличения                                                                                       |
| ----------------------------- | ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------- |
| D2 §3.2 объём работ (§4.1)    | 9д                 | **14-16д**        | +2д (обнаружение 1: доработка инструментов) +1д (обнаружение 2: finally в turn.ts) +3д (обнаружение 3: классификатор ввода, если жёсткий путь) |
| D4 §3.4 сводная оценка        | 5-7д               | 5-7д (без измен.) | Объём работ не меняется, но **привязка выгоды RT переносится с "ввода-вывода инструментов" на "модель планирования"**, ROI снижается. |
| Phase 3 общая длительность (§4.2) | ~3 нед             | **~4-5 нед**      | Увеличение объёма по D2 + отдельный цикл PR для доработки инструментов.                                    |

**Рекомендации по корректировке исходного roadmap**:

1. **Сохранить приоритет D1 (P0) и D3 как следующий** – данная верификация не затронула их ключевые гипотезы, оценка ROI не меняется.
2. **Ужесточить условия запуска D2** – сделать предварительные работы по обнаружениям 1/2/3 (суммарно ~6д) "gate for D2 start": не входить в §3.2 предварительный эксперимент без их завершения.
3. **Заново оценить приоритет D4** – раз реальная выгода заключается в изменении модели планирования, а не в вводе-выводе инструментов, либо (a) принять 30-80мс и понизить D4 до P3 (после фазы), либо (b) рассмотреть схему B (Edit + mtime/hash) для восстановления 100-200мс, но с дополнительными 5-7д.
4. **Не изменять §1.2 базовую линию однократной выборки** – но в §5.1 для P95 конкретные цифры не указывать до завершения D1 и набора базовой линии по ≥3 классам сценариев.

### 6.7 Непокрытые вопросы

Следующие вопросы относятся к субъективным суждениям или вопросам авторского замысла; данная верификация не обрабатывалась через subagent, оставлены для обсуждения на последующем review проекта:

- Следует ли отложить реализацию D2 после D3 (субъективный порядок).
- Следует ли объединить D1/D3 в одну фазу Phase 1 (стратегия реализации).
- Соответствует ли порог ≥3 в §3.2 `needsCrossResultReasoning` обратной подгонке под базовые сценарии §1.2 (авторский замысел).
- Следует ли заменить строковые номера строк в таблице ключевых мест кода §5.7 на символьные привязки (стабильность документа).

---

## 7. Оценка "плавающего мусора" и следующие шаги (второй review 2026-05-26)

### 7.1 Факты, спровоцировавшие текущую переоценку

После §6 верификации обнаружились **два факта, меняющих оценку ROI**:

1. **`cache_control` в DashScope уже реализован** (`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`)
   - В streaming-запросах маркировка `system + последнее сообщение + последнее определение инструмента`
   - Данные о попадании `cached_tokens` уже собираются в `usageMetadata.cachedContentTokenCount` (`converter.ts:1124-1149`)
   - Это механизм prefix cache: Round N+1 автоматически попадает в кэш, записанный Round N
   - **Раунд summary как раз является раундом с максимальной длиной префикса, попадающего в кэш**

2. **System prompt уже стабилен** (результат аудита `prompts.ts`)
   - Отсутствуют "жесткие" изменяемые элементы, такие как cwd / timestamp / git status / список файлов / состояние LSP, которые меняются на каждом turn.
   - `process.cwd()` используется только как переключатель `isGitRepository()`, не записывается в содержимое prompt.
   - Единственные динамические точки: инструмент `save_memory` / переключение `/model` / динамическая загрузка MCP (все событийные, низкочастотные).

### 7.2 Эти два факта изменили оценку ROI для D2

Документ §3.2 исходил из предположения "fast model быстрее primary примерно на ~2с", сравнивая **primary без кэша vs fast без кэша**.

Однако в реальной работе primary выполняется **с кэшем** (раунд summary как раз попадает на самый сильный кэш), поэтому правильное сравнение:
> primary cached vs fast uncached

| Маршрут                         | Оценочная задержка | Примечание                                     |
| ------------------------------- | ------------------ | ---------------------------------------------- |
| primary попадание 80% prefix cache | ~1.8-2.2с         | Текущая реальная производительность summary раунда |
| fast без кеша (не разделяется между моделями) | ~1.5-2с     | Реальная производительность после переключения на D2 |

**Чистый разрыв: несколько сотен миллисекунд, возможно fast даже медленнее**. С учётом инженерных затрат 14-16 дней + риск качества + потери на fallback, **чистая выгода D2 близка к нулю или отрицательна**.

§3.2 **Должно быть добавлено** обязательное условие: базовые измерения должны сравнивать primary **cached** против fast **uncached**, и при `T_primary_cached < T_fast_uncached × 1.5` D2 не должен включаться.

### 7.3 Список кандидатов (пересортирован по «жирности»)

**Настоящий низко висящий фрукт (делать сейчас, < 1 дня, крайне низкий риск, гарантированная выгода)**:

| Пункт                                       | Затраты | Выгода                                  | Место внесения                                                                 |
| ------------------------------------------- | ------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Инструкция на краткий ответ                 | 30 мин  | ~2с/суммарный раунд (выходные токены вдвое) | Добавить одну фразу в `prompts.ts` Final Reminder                              |
| Выставить телеметрию cache hit rate         | 0.5 дня | 0с напрямую, но **enabler** для решений | `cachedContentTokenCount` уже собирается, не хватает экспозиции; также отметить `save_memory` отдельным тегом |

**Почти низко висящий фрукт (подождать данных, 0.5-1 дня)**:

| Пункт                                      | Затраты         | Выгода                              | Предусловие для решения                                                     |
| ------------------------------------------ | --------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| summary раунд `tool_choice='none'`        | 0.5-1 день      | 0.3-1с (sampling пропускает tool_call токен) | Нужна логика определения «это summary раунд», риск ложного срабатывания низок |
| Отключить thinking в summary раунде        | 1 день          | 0.5-2с                              | Актуально только для моделей с включённым thinking (qwen3.5-plus, glm-4.7, kimi-k2.5 и др.) |
| Chunk batching на уровне UI рендеринга     | 0.5 дня исслед. + 0.5 дня внедр. | Требует проверки                    | Гипотеза: накладные расходы на рендеринг токенов `useGeminiStream` для длинных summary могут быть существенны |

**На исследование (возможно, крупная рыба)**:

| Пункт                                            | Затраты на исследование | Потенциальная выгода | Ключевая неизвестность                                                      |
| ------------------------------------------------ | ----------------------- | -------------------- | --------------------------------------------------------------------------- |
| ~~Поддержка DashScope `scope: 'global'`~~        | ~~0.5 дня доки + 0.5 дня A/B~~ | ~~Попадание между сессиями~~ | **Исследовано, вывод (c) невыполнимо** (см. §7.4 Обнаружение B результаты исследования). Эта строка оставлена как запись решения, не возобновлять исследование |

**Средние доработки (не низко висящие, оценивать отдельно)**:

| Пункт                                      | Затраты   | Риск | Выгода      |
| ------------------------------------------ | --------- | ---- | ----------- |
| D1 `skipLlmRound` (сценарий конечного запроса) | 2-3 дня   | Средний | 3-4с/конечный раунд |
| Обрезка результатов инструментов в summary раунде (подмножество D5) | 2 дня | Средний | 1-2с |
| D3 Состояние `Summarizing`                | 3-5 дней  | Средний | Улучшение восприятия на 3с |
| Похудение system prompt                   | 2-3 дня включая A/B тест | Средний | 0.5-1с |

**Отброшенные направления (больше не делать)**:

| Пункт                                          | Причина отбрасывания                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| D2 маршрутизация fast model                    | Нивелировано DashScope cache, чистая выгода близка к нулю или отрицательна |
| D4 предварительная проверка (prevalidate)      | Выгода приписана неверно (реально ~50мс от модели-планировщика), 5-7 дней не оправданы |
| Стабилизация system prompt                     | Уже стабильно, делать нечего                                   |
| Преждевременное завершение потока (abort финальных любезностей) | Высокий риск ложного срабатывания, пользователь воспринимает ответ как обрубленный |

### 7.4 Три новых заслуживающих внимания открытия

#### Обнаружение A: Реальный механизм `tool_choice='none'`

В API OpenAI / DashScope `tool_choice='none'` означает не просто «запретить вызов инструмента» — на этапе sampling модель **полностью пропускает распределение вероятностей для специального токена `<tool_call>`**, декодер сразу идёт по пути генерации естественного языка. Выгода не в «экономии пары retry», а в более быстром самом sampling.

#### Обнаружение B: `scope: 'global'` уже есть в кодовой базе для Anthropic

В `packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` уже используется `cache_control: { type: 'ephemeral', scope: 'global' }`. Но в `provider/dashscope.ts:288` при установке cache_control **scope не передаётся**:

```typescript
cache_control: { type: 'ephemeral' },   // нет scope
```

Если бы сервер DashScope распознавал `scope: 'global'`:

- system + tools переходят в глобальный кеш (TTL значительно больше, чем 5 минут ephemeral)
- **Попадание между сессиями**, также снижается задержка запуска
- Одна эта выгода может превысить все гипотетические выгоды от D2

##### Результаты исследования (2026-05-26, вывод (c): невыполнимо, линия закрыта)

Фактологический список из официальной документации Alibaba Cloud Bailian `help.aliyun.com/zh/model-studio/context-cache`:

| Вопрос                          | Вывод                                                                                                                                                                                              | Доказательство                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Поддержка поля `scope`          | **Не поддерживается**. Распознаётся только `type: 'ephemeral'`, любое `scope`/`persistent`/`global` будет молча отброшено.                                                                            | Оригинал документации: «Поддерживается только установка `type` в значение `ephemeral`»                         |
| Реальный TTL ephemeral          | **Скользящее окно 5 минут** (сбрасывается при попадании)                                                                                                                                             | Документация Bailian чётко указывает                                                                          |
| Механизм длительного TTL / глобального кеша | **Нет никакого механизма в публичном облачном API**. Нет значения type `persistent`, нет отдельного предварительного API загрузки, нет `prompt_cache_key`; единственный «глобальный постоянный» продукт — PAI глобальный кеш контекста (самостоятельное развёртывание + vLLM + Lingjun + общий Redis), не связан с DashScope API | Документация PAI                                                                                              |
| Разделение между сессиями       | Один аккаунт + та же модель + совпадение содержимого → уже попадание (это и так делает ephemeral); разные аккаунты абсолютно не разделяются                                                            | Документация Bailian                                                                                          |
| Ценообразование                 | cache write 125%, явное cache read 10%, **неявное cache read 20%** (даже без маркировки `cache_control` можно получить неявную скидку 20%)                                                             | Документация по ценам Bailian                                                                                 |
| Минимальный кешируемый prompt   | **1024 токена**                                                                                                                                                                                     | Документация Bailian                                                                                          |
| Поддержка моделей (явный кеш)   | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 — все явно перечислены. **qwen3.6-plus и qwen3.7-max также получают скидку 90% на явный кеш** | Список моделей Bailian (подтверждено 2026-05-26)                                                              |
**Несколько побочных следствий обнаружений**:

1. **Скользящее окно TTL** — хорошая новость для agent loop: интервалы между последовательными вызовами внутри цикла обычно < 30 с, **кэш всегда свежий, истечение через 5 минут не происходит**
2. **Неявный кэш со скидкой 20%** — бесплатный бонус: он действует даже без указания `cache_control`; но тонкое управление требует явного задания
3. ~~`qwen3.6-plus` нет в явном списке~~ — **исправлено (2026-05-26)**: после перепроверки **`qwen3.6-plus` действительно присутствует в списке явного кэша** и получает скидку 90%. В предыдущем отчёте была ошибка, исправлено в первой таблице этого раздела
4. **Текущая реализация `dashscope.ts:288` уже является верхней границей возможностей DashScope Public Cloud API** — выжать больше нечего

**Дополнительное усиление решения §7.2 D2**:

Скользящее окно TTL означает, что внутри agent loop summary-раунды **почти со 100% вероятностью попадают в кэш** основного раунда (только что попадали, в пределах 5 минут). Переключение D2 на fast model не только разрывает цепочку накопленной записи кэша, **но и отбрасывает summary-раунд с "почти 100% попадания" до "полного промаха"** — чистая выгода оказывается ещё более отрицательной, чем изначальная гипотеза §7.2.

#### Обнаружение C: уровень рендеринга UI — игнорируемая слепая зона

В §1.2 базовой линии "накладные расходы фреймворка" оценены в 0,3 с (3%), но это грубая оценка. Ink 7 + React 19.2 при каждом chunk вызывают setState → re-render, на длинном summary может накопиться 200–500 мс. Нужно проверить, как `useGeminiStream` обрабатывает поток токенов, применяются ли `requestAnimationFrame` / `useDeferredValue` для объединения chunk.

### 7.5 Контрольные точки ожидания данных — при поступлении данных решаем, какое смотреть решение

Данный раздел является **входной точкой этого документа**: при поступлении любых последующих метрик сверяйтесь с таблицей ниже, чтобы решить, какое решение пересмотреть.

#### Контрольная точка 1: после поступления данных о cache hit rate

**Условие запуска**: телеметрия cache hit rate "плёнки" работает ≥3 дня, в логах решений есть распределение `cached_tokens` / `prompt_tokens`.

**Какие данные смотреть**:

- Общий hit rate (cached / prompt) P50, P90
- По раундам: Round 1 / Round 2 / Round 3 (summary) — hit rate каждого
- Hit rate следующего раунда после вызова `save_memory` (должен быть близок к 0)
- Hit rate следующего раунда после переключения `/model` (должен быть близок к 0)

**Путь решения**:

| Общий hit rate | Значение                | Действие                                                                        |
| -------------- | ----------------------- | ------------------------------------------------------------------------------- |
| > 70%          | Текущее состояние близко к теоретическому пределу | Делать только #1 краткие инструкции + исследование обнаружения Б; остальные плёнки по необходимости |
| 40–70%         | Есть потенциал, но источник неясен               | Анализировать hit rate по раундам, выяснить, на каком этапе происходит промах   |
| < 40%          | Есть динамические точки, сбивающие кэш           | Повторно проверить частоту срабатывания system prompt / userMemory; возможно, `save_memory` срабатывает чаще ожидаемого |

#### Контрольная точка 2: исследование документации DashScope `scope: 'global'` ✅ завершено (2026-05-26)

**Результат**: **полностью не распознаётся**. Подробности см. в разделе "Результаты исследования" обнаружения Б §7.4.

**Выполненное действие**: принять как данность, пропустить этот пункт. В `dashscope.ts:288` оставить существующую пометку `ephemeral`, переделывать не требуется.

**В будущем это исследование не возобновлять** — пока DashScope официально не объявит о новом механизме персистентности.

#### Контрольная точка 3: результаты исследования уровня рендеринга UI

**Условие запуска**: исследование обнаружения C завершено (просмотр обработки потока токенов в `useGeminiStream` + замеры Ink/React DevTools).

**Путь решения**:

| Результат                                    | Действие                                              |
| -------------------------------------------- | ----------------------------------------------------- |
| Длительный summary stream рендеринг > 200 ms | Перейти на batching (`useDeferredValue` или собственная регулировка) |
| Затраты на рендеринг < 100 ms                 | Закрыть эту линию                                     |

#### Контрольная точка 4: повторное базовое измерение после "настоящих плёнок"

**Условие запуска**: #1 краткие инструкции + решения по контрольным точкам 1/2/3 выполнены ≥1 неделя.

**Какие данные смотреть**:

- Сквозное время ответа P50 в сравнении с однократной базовой замерой §1.2 (13,4 с)
- P50 / P95 отдельно для summary раунда
- Частота повторных запросов пользователя (если плёнка A попутно добавляет классификацию пользовательского ввода)

**Путь решения**:

| Суммарная экономия | Действие                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| > 4 с (достижение 9,6 с сквозного P50) | Оценить D1 `skipLlmRound` (ещё 3–4 с на финальный раунд)                          |
| 2–4 с              | Принять как есть, оценить, стоит ли делать D3 для улучшения восприятия             |
| < 2 с              | Пересмотреть: переоценены ли сами плёнки, или есть неидентифицированные узкие места (RTT сети, задержки provider) |

### 7.6 Окончательное решение по направлениям §3

На основе верификации §6 + переранжирование ROI в этом разделе:

| Направление           | Исходный приоритет §3 | Решение в этом разделе                     | Причина                                               |
| --------------------- | -------------------- | ------------------------------------------ | ------------------------------------------------------ |
| D1 Инструкции после инструментов | P0                   | **P0 сохраняется**, но ждать завершения плёнок | ROI по-прежнему хорош, но больше не "делать сразу" — сначала забрать более дешёвые плёнки |
| D2 Summary fast маршрутизация | P1                   | **Отложить / Won't Fix**                   | Нивелировано кэшем DashScope, 14–16 дней вложений почти нулевой отдачи |
| D3 Развязка отображения | P1                   | **Оставить опционально**, смотреть данные контрольной точки 4 | Улучшение восприятия определено, но абсолютное RT не меняется, зависит от поведения пользователя |
| D4 Упреждающее планирование потоков | P2                   | **Отложить**                               | Измерение отдачи ошибочное, реально ~50 мс, не стоит 5–7 дней |

### 7.7 Рекомендуемая последовательность выполнения

**День 1** (выполнимо одним человеком за один день):

- ✅ Добавить краткую инструкцию в `prompts.ts` (30 мин)
- ✅ Выставить `cachedContentTokenCount` в телеметрию + пометить вызовы `save_memory` / `/model` (0,5 д)
- ✅ Запустить исследование обнаружения Б: запрос документации DashScope `scope: 'global'` + сравнение с существующим использованием Anthropic (0,5 д)

**День 2–3**:

- Собрать первые данные о cache hit rate
- Запустить исследование обнаружения C: путь рендеринга React в `useGeminiStream`
- На основе контрольной точки 2 решить, нужна ли переделка `scope: 'global'`

**Конец недели 1**:

- Принять решение по данным контрольной точки 1 (смотреть распределение)
- Решить, нужно ли делать `tool_choice='none'` / отключать thinking (на основе данных о hit rate)

**Неделя 2–3**:

- Повторное базовое измерение по контрольной точке 4
- Решить, запускать ли D1 (самый крупный элемент не из плёнок, 3–4 с на финальный раунд)

**Никогда не делать**: D2 / D4 / стабилизация system prompt.

### 7.8 Аудит динамического содержимого `prompts.ts` (2026-05-27)

В §7.1 вывод "system prompt стабилен" был сделан на основе грубого grep. Этот раздел — систематический аудит файла `packages/core/src/core/prompts.ts` (1169 строк), дающий список для последующего анализа cache hit rate и решений по плёнкам.

**Метод аудита**: перечислены все интерполяционные выражения `${...}`, IIFE, вызовы `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`. Для каждого проверено, изменяется ли значение в пределах одной сессии.

#### Полностью отсутствуют (часто подозреваемые, но не найденные узкие места)

| Кандидат                            | Фактический код                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `Date.now()` / `new Date()`         | **Ноль вхождений** во всем файле (`rg` не даёт совпадений)                            |
| `Math.random()`                     | **Ноль вхождений**                                                                   |
| Значение `process.cwd()` в prompt   | Только L366 `if (isGitRepository(process.cwd())) { ... }`, **значение не записывается в строку**, только как переключатель |
| Вызов подпроцесса git status / git branch | **Ноль**, git-секция — статический текст-инструкция                                 |
| Инъекция текущего списка файлов / структуры проекта | **Ноль**                                                                             |
| Состояние LSP / количество ошибок   | **Ноль**                                                                             |
| История ввода пользователя          | **Ноль** (history идёт через messages, не в system)                                   |
#### При запуске один раз, внутри сессии не меняется

| Расположение | Содержание                                                                                            | Когда может измениться       |
| ------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| L190         | `process.env['QWEN_SYSTEM_MD']` определяет источник basePrompt (умолчание vs пользовательский system.md) | Не меняется в процессе       |
| L342-343     | `process.env['SANDBOX']` определяет, какая версия раздела sandbox выбирается (Seatbelt / Sandbox / Outside) | Не меняется в процессе       |
| L366         | `isGitRepository(process.cwd())` определяет, вставляется ли раздел git                               | cwd обычно не меняется в сессии |
| L871         | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` определяет стиль вызова инструментов (qwen-coder / qwen-vl / general) | Не меняется в процессе       |

#### Событийно-зависимые (редко)

| Параметр                                         | Условие срабатывания                                     | Примерная частота        |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------ |
| `userMemory` (1-й параметр `getCoreSystemPrompt`) | инструмент `save_memory` / `/memory refresh` / загрузка расширения | 0-3 раза за сессию       |
| имя модели (влияет, какую ветку выбирает `getToolCallExamples`) | переключение `/model`                                    | Крайне редко             |
| `appendInstruction`                              | Конфигурационный параметр, почти не меняется в сессии    | Почти никогда            |
| `deferredTools` (`buildDeferredToolsSection`)    | Динамическая загрузка MCP-инструментов                   | В основном при старте сессии |

#### Один незаметный нюанс

L207-209: если установлена переменная окружения `QWEN_SYSTEM_MD`, **каждый** вызов `getCoreSystemPrompt` выполняет `fs.readFileSync(systemMdPath)`:

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Если файл не меняется, содержимое стабильно → кеш не страдает
- Но каждый вызов LLM приводит к синхронному вводу-выводу (по умолчанию `.qwen/system.md`, для сетевых файловых систем медленнее)
- Это не влияет на вывод о «дружественности к кешу» в данном разделе, просто задокументированная мелкая проблема производительности

#### Сопутствующие выводы

1. **System prompt в стабильной сессии при каждом вызове идентичен byte-for-byte** → ключ эфемерного кеша DashScope (основанный на хеше содержимого) стабилен целиком → **попадание в кеш для раздела system практически 100%**
2. Единственное событие, сбивающее кеш — `save_memory` — ключевая функциональность, её нельзя подчинять кешу
3. **Анализ затрат на «мелкую неприятность #1 (инструкция краткого ответа)»**: добавление инструкции в раздел Final Reminder (L389-390) → содержимое system prompt меняется один раз → **первый запрос — cache miss (одноразовая стоимость прогрева), все последующие запросы продолжают попадать в кеш**
4. **§7 «стабилизация system prompt» — ранее сделанный вывод о ненужности получает формальное подтверждение**: не только не нужно делать, но даже «теоретическое снижение cache miss rate» не достигается, потому что оно и так ≈ 0
5. Данный аудит может служить опорной базой для последующих обсуждений, чтобы избежать повторного grep; при значительных изменениях в prompts.ts этот раздел необходимо синхронно обновить
