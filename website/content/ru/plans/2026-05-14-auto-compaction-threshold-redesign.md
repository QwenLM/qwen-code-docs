# План реализации редизайна порога автоматического уплотнения

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК: Используйте суперсилы:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации этого плана задача за задачей. Шаги используют синтаксис флажков (`- [ ]`) для отслеживания.

**Цель:** Модернизировать одноуровневый процентный порог (70%) для автоматического уплотнения qwen-code в гибридную «процент + абсолют» трехуровневую лестницу (warn / auto / hard), одновременно добавив для вызова уплотнения верхнюю границу `maxOutputTokens`, отключив thinking, внедрив отказоустойчивый предохранитель, исправив задержку `lastPromptTokenCount` / пробел первого раунда, а также очистив пользовательскую конфигурацию.

**Архитектура:**

- В `chatCompressionService.ts` добавляется новый `computeThresholds(window)`, возвращающий `{ warn, auto, hard }`; cheap-gate использует `auto`, точка входа `sendMessageStream` получает hard для активного спасения.
- Создается новый `tokenEstimation.ts`, предоставляющий локальную оценочную функцию char/4 для компенсации двух пробелов `lastPromptTokenCount`: «задержка на один раунд» и «первый раунд равен 0».
- Обработка ошибок переходит от одноразовой блокировки `hasFailedCompressionAttempt: boolean` к счетчику `consecutiveFailures: number` с тройным предохранителем.
- Вызов sideQuery для уплотнения отключает thinking и добавляет `maxOutputTokens: 20K`.
- Удаляется поле `chatCompression.contextPercentageThreshold` из настроек; при запуске старые конфигурации выводят предупреждение в stderr и игнорируются.
- Три tip-а `context-*` в `tipRegistry.ts` переписываются для отслеживания новых порогов; команда `/context` отображает трехуровневые значения.

**Технологический стек:** TypeScript, Vitest, `@google/genai`, существующий инструмент оценки `compactionInputSlimming`.

**Порядок слияния:** P6 → P7 → P1 → P2 → P4 → P3 → P5. Каждая задача является кандидатом на отдельный PR.

---

## Файловая структура

| Путь                                                        | Действие      | Ответственность                                                                          |
| ----------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `packages/core/src/services/tokenEstimation.ts`             | Создать       | Оценка токенов на уровне символов + точка входа `estimatePromptTokens`                   |
| `packages/core/src/services/tokenEstimation.test.ts`        | Создать       | Модульные тесты оценочных функций                                                         |
| `packages/core/src/services/chatCompressionService.ts`      | Изменить      | Добавить константы + `computeThresholds`; изменить cheap-gate; отключить thinking + maxOutput; изменить счетчик ошибок |
| `packages/core/src/services/chatCompressionService.test.ts` | Изменить      | Модульные тесты computeThresholds + утверждения cheap-gate / sideQuery config             |
| `packages/core/src/core/geminiChat.ts`                      | Изменить      | Точка входа `sendMessageStream` добавляет проверку hard; `hasFailedCompressionAttempt` → `consecutiveFailures` |
| `packages/core/src/core/geminiChat.test.ts`                 | Изменить      | Интеграционные тесты для hard-срабатывания + предохранителя + первого раунда               |
| `packages/core/src/config/config.ts`                        | Изменить      | Удалить `contextPercentageThreshold` из `ChatCompressionSettings`; предупреждение при запуске |
| `packages/cli/src/services/tips/tipRegistry.ts`             | Изменить      | Три tip-а `context-*` теперь используют абсолютное сравнение с порогами; `TipContext` добавлено `thresholds` |
| `packages/cli/src/services/tips/tipRegistry.test.ts`        | Создать/Изменить | Тесты интервалов срабатывания tip-ов                                                |
| `packages/cli/src/ui/commands/contextCommand.ts`            | Изменить      | Отображение новых трехуровневых порогов                                                 |
| `packages/cli/src/ui/commands/contextCommand.test.ts`       | Изменить      | Снимок вывода                                                                             |
| `packages/cli/src/ui/AppContainer.tsx`                      | Изменить      | При создании `TipContext` внедрять `thresholds`                                          |

---

## Фаза P6 — Сжатие sideQuery: отключение thinking + добавление maxOutputTokens

Первая реализация, чтобы последующие предположения о порогах стали надежными. Отдельный PR.

### Задача 1: Изменение вызова sideQuery в chatCompressionService

**Файлы:**

- Изменить: `packages/core/src/services/chatCompressionService.ts:374-376`
- Изменить: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Шаг 1: Написать падающий тест**

Добавить точку входа для spy в импорты в начале `chatCompressionService.test.ts` и добавить тест внутри подходящего describe. `runSideQuery` уже экспортируется из модуля, можно spyOn:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress sideQuery config', () => {
  it('передает maxOutputTokens=20_000 и includeThoughts=false в runSideQuery', async () => {
    const spy = vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>summary</state_snapshot>',
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
    } as any);

    const service = new ChatCompressionService();
    await service.compress(makeFakeChat(), {
      promptId: 'p',
      force: true,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 180_000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0]![1];
    expect(callArg.config?.thinkingConfig?.includeThoughts).toBe(false);
    expect(callArg.config?.maxOutputTokens).toBe(20_000);
  });
});
```

`makeFakeChat` / `makeFakeConfig` переиспользуют существующие тестовые хелперы (если они уже есть в файле, используйте их; если нет — встроить минимальную заглушку).

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'передает maxOutputTokens=20_000'
```

Ожидание: FAIL — сейчас передается `{ thinkingConfig: { includeThoughts: true } }` и нет `maxOutputTokens`.

- [ ] **Шаг 3: Реализация — изменить chatCompressionService.ts**

Заменить весь блок `config:` в [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374):

```ts
const summaryResult = await runSideQuery(config, {
  purpose: 'chat-compression',
  model,
  maxAttempts: 1,
  systemInstruction: getCompressionPrompt(),
  contents: [
    ...slim.slimmedHistory,
    {
      role: 'user',
      parts: [
        {
          text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
        },
      ],
    },
  ],
  // Выход уплотнения ограничен maxOutputTokens для гарантированного резерва
  // у всех провайдеров (см. docs/design/auto-compaction-threshold-redesign.md).
  // Thinking отключен, потому что семантика бюджета thinking
  // у разных провайдеров несовместима (Anthropic/OpenAI считают его отдельно,
  // Gemini зависит от модели).
  config: {
    thinkingConfig: { includeThoughts: false },
    maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS,
  },
  abortSignal: signal ?? new AbortController().signal,
  promptId,
});
```

В области констант вверху файла (сразу после `TOOL_ROUND_RETAIN_COUNT`) добавить:

```ts
/**
 * Жесткая граница вывода sideQuery для уплотнения (только текст сводки,
 * так как thinking отключен). Соответствует MAX_OUTPUT_TOKENS_FOR_SUMMARY
 * (autoCompact.ts:30) в claude-code, основанному на p99.99 реальных
 * результатов уплотнения.
 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000;
```

Также очистить комментарий в разделе математики токенов в `compress()` (примерно строка 436-437) с текстом «may include non-persisted tokens (thoughts)» — теперь выводов thinking нет, изменить фразу на «compressionOutputTokenCount reflects the summary tokens only since thinking is disabled».

- [ ] **Шаг 4: Запустить тест, чтобы убедиться, что он проходит**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Ожидание: PASS (новый тест + существующие тесты не должны регрессировать)

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

Ожидание: без ошибок.

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): ограничение вывода sideQuery для уплотнения и отключение thinking

Добавлен COMPACT_MAX_OUTPUT_TOKENS=20_000 и передача maxOutputTokens
в вызов runSideQuery; отключен thinkingConfig.includeThoughts.
Согласовано с резервом autoCompact в claude-code, чтобы последующая
лестница порогов (P1/P3) могла полагаться на предсказуемую верхнюю
границу сводки у всех провайдеров (Anthropic / OpenAI / Gemini
обрабатывают бюджеты thinking непоследовательно).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Фаза P7 — Компенсация оценки токенов

Исправление задержки `lastPromptTokenCount` / пробела первого раунда. 3 задачи.

### Задача 2: Создание модуля tokenEstimation.ts

**Файлы:**

- Создать: `packages/core/src/services/tokenEstimation.ts`
- Создать: `packages/core/src/services/tokenEstimation.test.ts`

- [ ] **Шаг 1: Написать падающий тест**

`packages/core/src/services/tokenEstimation.test.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import {
  estimateContentTokens,
  estimatePromptTokens,
} from './tokenEstimation.js';

const textContent = (text: string): Content => ({
  role: 'user',
  parts: [{ text }],
});

describe('estimateContentTokens', () => {
  it('возвращает 0 для пустого массива', () => {
    expect(estimateContentTokens([])).toBe(0);
  });

  it('оценивает обычный текст в ~символов/4', () => {
    // "hello world" = 11 символов → ceil(11/4) = 3
    expect(estimateContentTokens([textContent('hello world')])).toBe(3);
  });

  it('суммирует токены по нескольким сообщениям', () => {
    const a = textContent('aaaa'); // 4/4 = 1
    const b = textContent('bbbbbbbb'); // 8/4 = 2
    expect(estimateContentTokens([a, b])).toBe(3);
  });

  it('оценивает inlineData через imageTokenEstimate', () => {
    const c: Content = {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xxx' } }],
    };
    expect(estimateContentTokens([c], 1600)).toBe(1600);
  });

  it('оценивает functionCall (плотный JSON) в ~символов/2', () => {
    const c: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'foo', args: { a: 1, b: 2 } } }],
    };
    // estimateContentChars преобразует в строку; итоговый JSON короткий,
    // но соотношение (символов/2) должно быть >= пути символов/4.
    const result = estimateContentTokens([c]);
    expect(result).toBeGreaterThan(0);
  });
});

describe('estimatePromptTokens', () => {
  const history: Content[] = [
    textContent('older message a'),
    textContent('older message b'),
  ];
  const user = textContent('current user message');

  it('использует lastPromptTokenCount + оценку сообщения пользователя, когда count > 0', () => {
    const userEst = estimateContentTokens([user]);
    expect(estimatePromptTokens(history, user, 5000)).toBe(5000 + userEst);
  });

  it('использует полную оценку, когда lastPromptTokenCount равно 0', () => {
    const fullEst = estimateContentTokens([...history, user]);
    expect(estimatePromptTokens(history, user, 0)).toBe(fullEst);
  });
});
```

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Ожидание: FAIL — `tokenEstimation.ts` еще не создан.

- [ ] **Шаг 3: Реализация — создать tokenEstimation.ts**

`packages/core/src/services/tokenEstimation.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  DEFAULT_IMAGE_TOKEN_ESTIMATE,
  estimateContentChars,
} from './compactionInputSlimming.js';

/**
 * Среднее количество байтов на токен для оценки на основе символов.
 * Соответствует умолчанию roughTokenCountEstimation (tokens.ts) в claude-code.
 */
const BYTES_PER_TOKEN = 4;

/**
 * Оценивает количество токенов в списке объектов Content с помощью символов/4.
 *
 * Переиспользует `estimateContentChars`, чтобы inlineData / functionCall /
 * functionResponse обрабатывались так же, как при вычислении точек разделения
 * для уплотнения — чтобы два оценщика были синхронизированы и триггер
 * автоматического уплотнения и разделитель не расходились в оценке размера.
 *
 * Предназначен только для предварительного порогового шлюза. Символы/4 —
 * это консервативная нижняя граница (реальные токенизаторы отклоняются на ±30%);
 * использование этой границы для ЗАПУСКА уплотнения раньше безопасно
 * (ложноположительный результат), использование для ПРОПУСКА уплотнения — нет.
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  let totalChars = 0;
  for (const content of contents) {
    totalChars += estimateContentChars(content, imageTokenEstimate);
  }
  return Math.ceil(totalChars / BYTES_PER_TOKEN);
}

/**
 * Вычисляет эффективное количество токенов запроса для шлюза автоматического уплотнения.
 *
 * `lastPromptTokenCount` (из метаданных использования предыдущего оборота)
 * не учитывает два момента: текущее сообщение пользователя и начальное значение
 * при самой первой отправке. Этот хелпер закрывает оба пробела с помощью
 * локальной оценки.
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
  imageTokenEstimate: number = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  if (lastPromptTokenCount > 0) {
    return (
      lastPromptTokenCount +
      estimateContentTokens([userMessage], imageTokenEstimate)
    );
  }
  return estimateContentTokens([...history, userMessage], imageTokenEstimate);
}
```

- [ ] **Шаг 4: Запустить тест, чтобы убедиться, что он проходит**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/tokenEstimation.test.ts
```

Ожидание: PASS

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/services/tokenEstimation.ts packages/core/src/services/tokenEstimation.test.ts
git commit -m "$(cat <<'EOF'
feat(core): добавление хелпера оценки токенов для шлюза уплотнения

Введение estimateContentTokens / estimatePromptTokens на основе
существующего estimateContentChars (compactionInputSlimming), деленного
на соотношение символы/4. Заменит прямое использование
lastPromptTokenCount при проверках cheap-gate и hard-порога, чтобы
система могла реагировать на (а) текущее сообщение пользователя и
(б) самую первую отправку (где сообщаемое API значение равно 0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Задача 3: Применение оценки в cheap-gate chatCompressionService

**Файлы:**

- Изменить: `packages/core/src/services/chatCompressionService.ts`
- Изменить: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Шаг 1: Написать падающий тест**

Эта задача выполняется до P1, поэтому используется **существующая** формула `порог * лимит контекста` (70% * 200K = 140K), только `originalTokenCount` заменяется на `estimatePromptTokens(...)`:

```ts
import * as sideQueryModule from '../utils/sideQuery.js';

describe('ChatCompressionService.compress cheap-gate использует оцененные токены', () => {
  it('запускает уплотнение, когда API-сообщенные токены ниже порога, но оцененные токены с ожидающим сообщением пользователя превышают его', async () => {
    // 200K окно, текущий порог = 0.7 * 200K = 140K
    // originalTokenCount = 135K (разница 5K)
    // сообщение пользователя оценено ~10K → 145K, превышает 140K
    const userMessage: Content = {
      role: 'user',
      parts: [{ text: 'x'.repeat(40_000) }], // 40K символов ≈ 10K токенов
    };
    const chat = makeFakeChat({ historyChars: 500_000 });

    // Mock runSideQuery, чтобы последующие шаги compress не упали
    vi.spyOn(sideQueryModule, 'runSideQuery').mockResolvedValue({
      text: '<state_snapshot>x</state_snapshot>',
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    } as any);

    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 135_000,
      pendingUserMessage: userMessage,
    });
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });

  it('возвращает NOOP, когда ни originalTokenCount, ни оцененная сумма не достигают порога', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 80_000,
      pendingUserMessage: {
        role: 'user',
        parts: [{ text: 'short' }],
      },
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });
});
```

`makeFakeChat({ historyChars })` — это встроенный хелпер в тестовом файле: создает двойник `GeminiChat`, `getHistory()` возвращает массив Content с длиной, приблизительно соответствующей `historyChars` (если хелпер уже есть, переиспользовать).

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate использует оцененные токены'
```

Ожидание: FAIL — текущий cheap-gate смотрит только `originalTokenCount` и решит NOOP.

- [ ] **Шаг 3: Реализация — изменить compress() cheap-gate**

Изменить блок [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235):

```ts
// Не уплотнять, если не принудительно и мы ниже лимита. Это
// стабильный путь на каждую отправку; нужно выйти до оплаты
// полного клонирования `getHistory(true)` ниже.
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < threshold * contextLimit) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

Добавить новое поле в интерфейс `CompressOptions` ([:172-196](packages/core/src/services/chatCompressionService.ts:172)):

```ts
export interface CompressOptions {
  // ... существующие поля ...
  /**
   * Ожидающее сообщение пользователя, которое будет отправлено. При наличии
   * cheap-gate добавляет его оцененное количество токенов к `originalTokenCount`
   * (который отражает только использование API предыдущего оборота), чтобы
   * шлюз видел реальный размер запроса.
   * Опционально для обратной совместимости с вызывающими, у которых нет
   * сообщения пользователя (например, ручные пути /compress force=true).
   */
  pendingUserMessage?: Content;
}
```

Добавить импорт: `import { estimatePromptTokens } from './tokenEstimation.js';`

- [ ] **Шаг 4: Запустить тест, чтобы убедиться, что он проходит**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Ожидание: PASS

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): cheap-gate использует оцененные токены, когда есть ожидающее сообщение пользователя

Добавлено `pendingUserMessage` в CompressOptions, передается через
estimatePromptTokens на cheap-gate автоматического уплотнения. Закрывает
пробел «задержка на один раунд», когда проверка порога пропускала
сообщение пользователя, готовящееся к отправке.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Задача 4: Проброс pendingUserMessage в точке входа sendMessageStream в geminiChat

**Файлы:**

- Изменить: `packages/core/src/core/geminiChat.ts`
- Изменить: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Шаг 1: Написать падающий тест**

Добавить в `packages/core/src/core/geminiChat.test.ts`:

```ts
describe('sendMessageStream first-turn estimation', () => {
  it('запускает автоматическое уплотнение при первой отправке, если унаследованная история огромна', async () => {
    // Сценарий: sub-agent наследует большую историю / --continue:
    // lastPromptTokenCount = 0, но история уже почти достигла порога auto
    const chat = makeChatWithLargeInheritedHistory(/* ~150K символов */);
    expect(chat.getLastPromptTokenCount()).toBe(0);

    const mockGen = mockContentGeneratorWithUsage({
      totalTokenCount: 80_000,
    });
    chat.setContentGenerator(mockGen);

    const stream = await chat.sendMessageStream(
      'qwen-test',
      { message: 'next user prompt' },
      'prompt-1',
    );
    // Первое событие в потоке должно быть COMPRESSED
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
  });
});
```
```markdown
helper `makeChatWithLargeInheritedHistory` 在测试文件里 inline：构造一个 `GeminiChat`，`history` 装入 1500 个简单 user/model content，每条 100 chars，总 ~150K chars。

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'first-turn estimation'
```

Expected: FAIL — 当前 `tryCompress` 用的是 `lastPromptTokenCount = 0`，cheap-gate 判 NOOP。

- [ ] **Step 3: Implement — 改 sendMessageStream 与 tryCompress**

[geminiChat.ts:562](packages/core/src/core/geminiChat.ts:562) 改为：

```ts
compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  false,
  params.config?.abortSignal,
  {
    pendingUserMessage: createUserContent(params.message),
  },
);
```

`tryCompress` 函数签名（约 [:460-478](packages/core/src/core/geminiChat.ts:460)）的 `options` 接口 `TryCompressOptions` 加：

```ts
interface TryCompressOptions {
  originalTokenCountOverride?: number;
  trigger?: CompactTrigger;
  pendingUserMessage?: Content; // ← 新增
}
```

把 `pendingUserMessage` 透传给 `service.compress`：

```ts
const { newHistory, info } = await service.compress(this, {
  // ... 现有字段 ...
  pendingUserMessage: options?.pendingUserMessage,
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): pass pendingUserMessage from sendMessageStream to tryCompress

Closes the 'first send after inherited history' gap where
lastPromptTokenCount is 0 and the cheap-gate would always NOOP.
estimatePromptTokens falls back to a full-history estimate in that
case once the user message is provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P1 — 三层阈值常量 + computeThresholds + cheap-gate

### Task 5: 添加常量与 computeThresholds 函数

**Files:**

- Modify: `packages/core/src/services/chatCompressionService.ts`
- Modify: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: Write the failing test**

`chatCompressionService.test.ts` 增加：

```ts
import { computeThresholds } from './chatCompressionService.js';

describe('computeThresholds', () => {
  it('32K window — proportional fallback for all tiers, hard degrades to auto', () => {
    const t = computeThresholds(32_000);
    expect(t.warn).toBe(19_200); // 0.6 * 32K
    expect(t.auto).toBe(22_400); // 0.7 * 32K
    expect(t.hard).toBe(22_400); // max(window-23K=9K, auto=22.4K) = auto
    expect(t.effectiveWindow).toBe(12_000);
  });

  it('128K window — mixed (warn=pct, auto/hard=abs)', () => {
    const t = computeThresholds(128_000);
    expect(t.warn).toBe(76_800); // 0.6 * 128K (pct wins: 76.8K vs auto-20K=75K)
    expect(t.auto).toBe(95_000); // abs: window-33K (abs wins: 95K vs 0.7*128K=89.6K)
    expect(t.hard).toBe(105_000); // abs: window-23K
    expect(t.effectiveWindow).toBe(108_000);
  });

  it('200K window — absolute takes over all tiers', () => {
    const t = computeThresholds(200_000);
    expect(t.warn).toBe(147_000); // abs: auto-20K (abs wins: 147K vs 0.6*200K=120K)
    expect(t.auto).toBe(167_000); // abs: 200K-33K
    expect(t.hard).toBe(177_000); // abs: 200K-23K
  });

  it('1M window — fully absolute', () => {
    const t = computeThresholds(1_000_000);
    expect(t.warn).toBe(947_000);
    expect(t.auto).toBe(967_000);
    expect(t.hard).toBe(977_000);
  });

  it('extreme small window (10K) does not crash; returns sane values', () => {
    const t = computeThresholds(10_000);
    expect(t.warn).toBeGreaterThan(0);
    expect(t.auto).toBeGreaterThan(0);
    expect(t.warn).toBeLessThanOrEqual(t.auto);
    expect(t.auto).toBeLessThanOrEqual(t.hard);
  });

  it('thresholds always satisfy warn <= auto <= hard', () => {
    for (const w of [32_000, 64_000, 128_000, 200_000, 256_000, 1_000_000]) {
      const t = computeThresholds(w);
      expect(t.warn).toBeLessThanOrEqual(t.auto);
      expect(t.auto).toBeLessThanOrEqual(t.hard);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'computeThresholds'
```

Expected: FAIL — `computeThresholds` 不存在。

- [ ] **Step 3: Implement — 加常量与函数**

在 [chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) 文件常量区（紧跟 `COMPACT_MAX_OUTPUT_TOKENS`）加：

```ts
/**
 * Default proportional auto-compaction threshold (legacy semantics
 * preserved as a small-window fallback / safety net).
 */
export const DEFAULT_PCT = 0.7;

/**
 * Warn-tier proportional offset: warn-pct = PCT - WARN_PCT_OFFSET (= 0.6).
 */
export const WARN_PCT_OFFSET = 0.1;

/**
 * Token budget reserved for compression output. Matches COMPACT_MAX_OUTPUT_TOKENS
 * because thinking is disabled (see Task 1) so maxOutputTokens is the hard
 * ceiling on summary output.
 */
export const SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS; // 20_000

/** Distance between auto threshold and effectiveWindow. */
export const AUTOCOMPACT_BUFFER = 13_000;

/** Distance between warn threshold and auto threshold. */
export const WARN_BUFFER = 20_000;

/** Distance between hard threshold and effectiveWindow (claude-code MANUAL_COMPACT_BUFFER). */
export const HARD_BUFFER = 3_000;

/** Auto-compaction consecutive-failure circuit breaker. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CompactionThresholds {
  /** Token count at which UI warn tier triggers. */
  warn: number;
  /** Token count at which auto-compaction triggers. */
  auto: number;
  /** Token count at which auto-compaction is forced (resets failure counter). */
  hard: number;
  /** Window minus SUMMARY_RESERVE; the budget available for input + summary. */
  effectiveWindow: number;
}

/**
 * Compute the three-tier threshold ladder for a given context window.
 *
 * Each tier is `max(proportional, absolute)`:
 *   auto  = max(PCT * window,                effectiveWindow - AUTOCOMPACT_BUFFER)
 *   warn  = max((PCT - WARN_OFFSET) * window, auto - WARN_BUFFER)
 *   hard  = max(effectiveWindow - HARD_BUFFER, auto)  // hard degrades to auto for tiny windows
 *
 * Small windows (where the absolute branch goes negative) automatically fall
 * back to the proportional branch. Large windows are dominated by the absolute
 * branch, capping wasted reservation to ~33K instead of 30% of the window.
 */
export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto);

  return { warn, auto, hard, effectiveWindow };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
feat(core): add computeThresholds for three-tier compaction ladder

Introduces warn/auto/hard thresholds combining proportional fallback
(small windows) with absolute reservation (large windows). Matches the
formula in docs/design/auto-compaction-threshold-redesign.md. Pure
function with full coverage across 32K/128K/200K/1M/extreme-small
windows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6: cheap-gate 切换到 computeThresholds.auto

**Files:**

- Modify: `packages/core/src/services/chatCompressionService.ts`
- Modify: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('compress cheap-gate uses computeThresholds.auto', () => {
  it('on a 200K window with originalTokenCount=160K, NOOP (below auto=167K)', async () => {
    const chat = makeFakeChat();
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 160_000,
    });
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
  });

  it('on a 200K window with originalTokenCount=168K, proceeds past gate', async () => {
    // 168K > 167K (auto)，cheap-gate 放行，进入 curatedHistory 阶段
    const chat = makeFakeChat({ historyChars: 500_000 });
    const result = await new ChatCompressionService().compress(chat, {
      promptId: 'p',
      force: false,
      model: 'qwen-test',
      config: makeFakeConfig({ contextWindowSize: 200_000 }),
      hasFailedCompressionAttempt: false,
      originalTokenCount: 168_000,
    });
    // 实际结果取决于 mock 出来的 sideQuery；只验证不是被 cheap-gate 拦下的早期 NOOP
    expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts -t 'cheap-gate uses computeThresholds'
```

Expected: FAIL — 当前阈值是 `threshold * contextLimit = 0.7 * 200K = 140K`，160K 已经超过 140K 直接 cheap-gate 放行（不符断言①）；168K 同理。

- [ ] **Step 3: Implement — 切换 cheap-gate 公式**

修改 [chatCompressionService.ts:235-249](packages/core/src/services/chatCompressionService.ts:235) 那段 `if (!force) { ... }` 块：

```ts
if (!force) {
  const contextLimit =
    config.getContentGeneratorConfig()?.contextWindowSize ??
    DEFAULT_TOKEN_LIMIT;
  const { auto } = computeThresholds(contextLimit);
  const pendingUserMessage = opts.pendingUserMessage;
  const effectiveTokens = pendingUserMessage
    ? estimatePromptTokens(
        chat.getHistory(true),
        pendingUserMessage,
        originalTokenCount,
        slimmingConfig.imageTokenEstimate,
      )
    : originalTokenCount;
  if (effectiveTokens < auto) {
    return {
      newHistory: null,
      info: {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      },
    };
  }
}
```

同时删除 [chatCompressionService.ts:214-217](packages/core/src/services/chatCompressionService.ts:214) 那段 `const threshold = chatCompressionSettings?.contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;`，因为 `threshold` 现在不再被 cheap-gate 使用。同时去掉 line 221 那个 `threshold <= 0` 分支（隐式禁用语义，详细在 P4 处理）。

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/core -- --run packages/core/src/services/chatCompressionService.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): cheap-gate uses computeThresholds.auto

Replace the legacy `threshold * contextLimit` formula with
computeThresholds.auto, which combines proportional fallback with
absolute reservation. On large windows (>=128K) the gate now triggers
later than 70% but reserves a fixed ~33K, freeing tens of thousands of
context tokens that the old formula wasted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P2 — 失败处理升级（1 次锁 → 3 次熔断）

### Task 7: hasFailedCompressionAttempt → consecutiveFailures

**Files:**

- Modify: `packages/core/src/core/geminiChat.ts`
- Modify: `packages/core/src/services/chatCompressionService.ts`
- Modify: `packages/core/src/core/geminiChat.test.ts`
- Modify: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: Write the failing test**

`geminiChat.test.ts`：

```ts
describe('compression failure circuit breaker', () => {
  it('tolerates 2 consecutive failures, NOOPs the third', async () => {
    const chat = makeChatWithMockedFailingCompression();
    // 触发 3 次连续失败：
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // attempt 1 fails
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // attempt 2 fails
    const events = await collectEvents(
      await chat.sendMessageStream('m', { message: 'c' }, 'p3'), // attempt 3 should NOOP
    );
    expect(
      events.find((e) => e.type === StreamEventType.COMPRESSED),
    ).toBeUndefined();
    // 验证 service.compress 第 3 次根本没被调用（熔断器 NOOP 在 cheap-gate）
    expect(getCompressCallCount()).toBe(2);
  });

  it('resets counter on a successful force compress', async () => {
    const chat = makeChatWithMockedFailingCompression();
    await chat.sendMessageStream('m', { message: 'a' }, 'p1'); // fail
    await chat.sendMessageStream('m', { message: 'b' }, 'p2'); // fail
    // 用户手动 /compress
    await chat.tryCompress('p3', 'm', /* force */ true);
    // 现在熔断器应该已重置
    await chat.sendMessageStream('m', { message: 'c' }, 'p4');
    expect(getCompressCallCount()).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'circuit breaker'
```

Expected: FAIL — 当前一次失败就永久锁，第 2 次 send 已经被 cheap-gate NOOP，第 3 次也 NOOP，但断言 ② 期望力 force 之后能恢复且 sendMessageStream 走得到 compress。

- [ ] **Step 3: Implement —替换字段**

[geminiChat.ts](packages/core/src/core/geminiChat.ts) 内部字段（grep `hasFailedCompressionAttempt`）：

```ts
// 替换前
private hasFailedCompressionAttempt = false;

// 替换后
private consecutiveFailures = 0;
```

[geminiChat.ts:467-478](packages/core/src/core/geminiChat.ts:467) 的 `tryCompress` 函数传给 `service.compress` 的字段：

```ts
const { newHistory, info } = await service.compress(this, {
  promptId,
  force,
  model,
  config: this.config,
  consecutiveFailures: this.consecutiveFailures, // ← 取代 hasFailedCompressionAttempt
  originalTokenCount:
    options?.originalTokenCountOverride ?? this.lastPromptTokenCount,
  pendingUserMessage: options?.pendingUserMessage,
  trigger: options?.trigger,
  signal,
});
```

[geminiChat.ts:503-510](packages/core/src/core/geminiChat.ts:503) 失败/成功分支：

```ts
if (info.compressionStatus === CompressionStatus.COMPRESSED && newHistory) {
  // ... 现有逻辑 ...
  this.setHistory(newHistory);
  this.config.getFileReadCache().clear();
  this.lastPromptTokenCount = info.newTokenCount;
  this.telemetryService?.setLastPromptTokenCount(info.newTokenCount);
  this.consecutiveFailures = 0; // ← 取代 hasFailedCompressionAttempt = false
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1; // ← 取代 hasFailedCompressionAttempt = true
  }
}
```

[chatCompressionService.ts](packages/core/src/services/chatCompressionService.ts) 的 `CompressOptions` 接口：

```ts
export interface CompressOptions {
  // ... 现有字段 ...
  /**
   * Number of consecutive auto-compaction failures for this chat. When
   * it reaches MAX_CONSECUTIVE_FAILURES, the gate stops trying until a
   * successful force=true call resets it.
   */
  consecutiveFailures: number;
  // 删除 hasFailedCompressionAttempt
}
```

`compress()` 函数内 [:221](packages/core/src/services/chatCompressionService.ts:221) 那段 cheap-gate 检查：

```ts
// Cheap gates first — these don't need the curated history.
if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
  return {
    newHistory: null,
    info: {
      originalTokenCount: 0,
      newTokenCount: 0,
      compressionStatus: CompressionStatus.NOOP,
    },
  };
}
```

更新解构 `const { ... } = opts;` 把 `hasFailedCompressionAttempt` 替换成 `consecutiveFailures`。

`chatCompressionService.test.ts` 中所有传 `hasFailedCompressionAttempt: false/true` 的地方改为 `consecutiveFailures: 0` / `consecutiveFailures: MAX_CONSECUTIVE_FAILURES`，逐个修正测试期望。

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
```

Expected: PASS

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/services/chatCompressionService.ts packages/core/src/core/geminiChat.test.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core): replace hasFailedCompressionAttempt with circuit breaker

Switches from a one-shot permanent lock to a three-strike circuit
breaker (MAX_CONSECUTIVE_FAILURES=3). Successful force compress
(manual /compress, reactive overflow, or hard-tier rescue) resets the
counter. Aligns with claude-code's design and unblocks recovery from
transient failures (rate limits, transient model errors) that
previously disabled auto-compaction for the rest of the session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase P4 — 配置面：删除 contextPercentageThreshold + breaking-change 警告

### Task 8: 删除字段 + 启动 warning

**Files:**

- Modify: `packages/core/src/config/config.ts`
- Modify: `packages/cli/src/config/settingsSchema.ts`（如果有引用）
- Modify: `packages/core/src/services/chatCompressionService.ts`
- Modify: `packages/core/src/services/chatCompressionService.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/config/config.test.ts`（如果不存在则创建）：

```ts
import { describe, it, expect, vi } from 'vitest';

describe('Config — chatCompression.contextPercentageThreshold deprecation', () => {
  it('logs a stderr warning when the deprecated field is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimal required Config params ...
      chatCompression: { contextPercentageThreshold: 0.5 } as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'chatCompression.contextPercentageThreshold has been removed',
      ),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when the deprecated field is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Config({
      // ... minimal params, no chatCompression.contextPercentageThreshold ...
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('chatCompression.contextPercentageThreshold'),
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/core -- --run packages/core/src/config/config.test.ts
```

Expected: FAIL — Config 当前完全接受这个字段，无 warning。

- [ ] **Step 3: Implement — 改 ChatCompressionSettings + Config 构造函数**

[config.ts:217-227](packages/core/src/config/config.ts:217)：

```ts
export interface ChatCompressionSettings {
  /**
   * Estimated tokens for a single inline image / document part when
   * apportioning chars across history in `findCompressSplitPoint`.
   * Also used as the placeholder budget when stripping inline media
   * out of the side-query compaction prompt. Default 1600.
   * Env override: `QWEN_IMAGE_TOKEN_ESTIMATE`.
   */
  imageTokenEstimate?: number;
}
```

（删除 `contextPercentageThreshold` 字段。）
```
[config.ts](packages/core/src/config/config.ts) найдите в конструкторе `Config` место, где обрабатывается `params.chatCompression` (строка ~933). Перед присваиванием добавьте:

```ts
if (
  params.chatCompression &&
  typeof (params.chatCompression as Record<string, unknown>)
    .contextPercentageThreshold !== 'undefined'
) {
  console.warn(
    '[qwen-code] chatCompression.contextPercentageThreshold has been removed ' +
      'and is now controlled by built-in thresholds. Setting will be ignored.',
  );
}
this.chatCompression = params.chatCompression;
```

`chatCompressionService.ts` также подчистите: [:214-217](packages/core/src/services/chatCompressionService.ts:214) — этот фрагмент уже удалён в Task 6, дополнительно проверьте, нет ли в файле остатков `chatCompressionSettings?.contextPercentageThreshold` или экспортируемой константы `COMPRESSION_TOKEN_THRESHOLD`:

- Если `COMPRESSION_TOKEN_THRESHOLD` больше нигде не используется, удалите эту константу.
- Если на неё ещё есть ссылки (например, в telemetry или документации), замените их на `DEFAULT_PCT`.

cli/config/settingsSchema.ts менять не нужно — `chatCompression` остаётся `type: 'object'`, внутри схемы нет поля (см. [settingsSchema.ts:1020-1028](packages/cli/src/config/settingsSchema.ts:1020)). Если внутри схемы была ссылка на `contextPercentageThreshold`, удалите её.

- [ ] **Шаг 4: Запустите тест и убедитесь, что он проходит**

```bash
npm test --workspace=packages/core
npm test --workspace=packages/cli
```

Ожидается: PASS (включая существующие тесты сжатия)

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/config/config.ts packages/core/src/config/config.test.ts packages/core/src/services/chatCompressionService.ts packages/core/src/services/chatCompressionService.test.ts
git commit -m "$(cat <<'EOF'
refactor(core)!: remove chatCompression.contextPercentageThreshold setting

The proportional threshold is now an internal constant (DEFAULT_PCT) and
the auto-compaction threshold is computed from a mixed proportional /
absolute formula (computeThresholds). User-facing tuning of the bare
percentage no longer maps to meaningful behavior on large-window models.

Existing settings.json files containing the field will log a one-line
stderr warning on startup; the field is otherwise ignored.

BREAKING CHANGE: chatCompression.contextPercentageThreshold is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Фаза P3 — принудительное вмешательство на уровне hard

### Task 9: Добавить проверку hard и принудительное сжатие при входе в sendMessageStream

**Файлы:**

- Изменить: `packages/core/src/core/geminiChat.ts`
- Изменить: `packages/core/src/core/geminiChat.test.ts`

- [ ] **Шаг 1: Напишите падающий тест**

```ts
describe('sendMessageStream hard-tier rescue', () => {
  it('triggers force compress when estimated tokens cross hard threshold', async () => {
    // Конструируем окно 200K: hard = 177K
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // Оценка + 176K текущего сообщения превышает 177K
    const userMessage = makeBigUserMessage(/* ~3K tokens */);
    const stream = await chat.sendMessageStream(
      'm',
      { message: userMessage },
      'p',
    );
    const first = await stream.next();
    expect(first.value?.type).toBe(StreamEventType.COMPRESSED);
    expect(getLastCompressCallForce()).toBe(true);
  });

  it('hard rescue resets consecutiveFailures before forcing', async () => {
    const chat = makeChatWithLastPromptTokenCount(176_000);
    // Сначала создаём 3 неудачи, чтобы consecutiveFailures = 3
    setMockedCompressionToFail(3);
    await chat.sendMessageStream('m', { message: 'a' }, 'p1');
    await chat.sendMessageStream('m', { message: 'b' }, 'p2');
    await chat.sendMessageStream('m', { message: 'c' }, 'p3');
    expect(chat.getConsecutiveFailures()).toBe(3);
    // 4-й раз: токен пересекает hard, hard rescue сбрасывает прерыватель и force=true
    setMockedCompressionToSucceed();
    await chat.sendMessageStream('m', { message: 'd' }, 'p4');
    expect(getLastCompressCallForce()).toBe(true);
    expect(chat.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Шаг 2: Запустите тест и убедитесь, что он падает**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts -t 'hard-tier rescue'
```

Ожидается: FAIL — sendMessageStream сейчас всегда вызывает tryCompress с `force=false`.

- [ ] **Шаг 3: Реализуйте — добавьте проверку hard при входе в sendMessageStream**

[geminiChat.ts:560-567](packages/core/src/core/geminiChat.ts:560):

```ts
// Hard-tier rescue: if pending prompt is large enough to risk overflow,
// force compress before the send and reset the failure counter so a
// session already in circuit-breaker NOOP can recover. This proactively
// covers what reactive overflow (line ~711) would otherwise catch
// after a wasted round-trip.
const contextLimit =
  this.config.getContentGeneratorConfig()?.contextWindowSize ??
  DEFAULT_TOKEN_LIMIT;
const { hard } = computeThresholds(contextLimit);
const pendingUserMessage = createUserContent(params.message);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  pendingUserMessage,
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;
if (shouldForceFromHard) {
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
  { pendingUserMessage },
);
```

Примечание: `createUserContent` внутри sendMessageStream и так вызывается на [:569](packages/core/src/core/geminiChat.ts:569); теперь мы вызываем его раньше, поэтому на [:569](packages/core/src/core/geminiChat.ts:569) строку `const userContent = createUserContent(params.message);` можно удалить/заменить на `const userContent = pendingUserMessage;`.

Добавьте импорты: `import { computeThresholds } from '../services/chatCompressionService.js';`
Добавьте импорт: `import { estimatePromptTokens } from '../services/tokenEstimation.js';`

- [ ] **Шаг 4: Запустите тест и убедитесь, что он проходит**

```bash
npm test --workspace=packages/core -- --run packages/core/src/core/geminiChat.test.ts
```

Ожидается: PASS

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck --workspace=packages/core
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/core/geminiChat.ts packages/core/src/core/geminiChat.test.ts
git commit -m "$(cat <<'EOF'
feat(core): hard-tier rescue forces compaction before oversized send

When estimated tokens cross computeThresholds.hard, sendMessageStream
now resets the consecutive-failure counter and calls tryCompress with
force=true. This pulls reactive overflow recovery forward to before
the send, saving one wasted round-trip and unblocking sessions whose
circuit breaker had latched off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Фаза P5 — Изменения в UI (переписываем подсказки + отображение /context)

### Task 10: Переписать три подсказки context-\* в tipRegistry

**Файлы:**

- Изменить: `packages/cli/src/services/tips/tipRegistry.ts`
- Изменить: `packages/cli/src/services/tips/tipRegistry.test.ts` (создать, если не существует)
- Изменить: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Шаг 1: Напишите падающий тест**

`packages/cli/src/services/tips/tipRegistry.test.ts`:

```ts
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tipRegistry, type TipContext } from './tipRegistry.js';

const baseCtx: TipContext = {
  lastPromptTokenCount: 0,
  contextWindowSize: 200_000,
  sessionPromptCount: 10,
  sessionCount: 1,
  platform: 'darwin',
  thresholds: {
    warn: 147_000,
    auto: 167_000,
    hard: 177_000,
    effectiveWindow: 180_000,
  },
};

function tipById(id: string) {
  return tipRegistry.find((t) => t.id === id)!;
}

describe('context-* tip thresholds align with computeThresholds', () => {
  it('compress-intro fires between warn and auto', () => {
    const t = tipById('compress-intro');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 100_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 168_000 })).toBe(
      false,
    );
  });

  it('context-high fires between auto and hard', () => {
    const t = tipById('context-high');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 150_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      true,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      false,
    );
  });

  it('context-critical fires at or above hard', () => {
    const t = tipById('context-critical');
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 170_000 })).toBe(
      false,
    );
    expect(t.isRelevant({ ...baseCtx, lastPromptTokenCount: 178_000 })).toBe(
      true,
    );
  });

  it('falls back gracefully when thresholds undefined (legacy callers)', () => {
    const ctx = { ...baseCtx, thresholds: undefined };
    // Все три подсказки при отсутствии thresholds не должны срабатывать (нельзя сравнивать)
    expect(tipById('compress-intro').isRelevant(ctx)).toBe(false);
    expect(tipById('context-high').isRelevant(ctx)).toBe(false);
    expect(tipById('context-critical').isRelevant(ctx)).toBe(false);
  });
});
```

- [ ] **Шаг 2: Запустите тест и убедитесь, что он падает**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
```

Ожидается: FAIL — в `TipContext` нет поля `thresholds`; три подсказки по-прежнему срабатывают по процентам 50/80/95.

- [ ] **Шаг 3: Реализуйте — измените tipRegistry**

[tipRegistry.ts:15-21](packages/cli/src/services/tips/tipRegistry.ts:15):

```ts
import type { CompactionThresholds } from '@qwen-code/qwen-code-core';
import { DEFAULT_TOKEN_LIMIT } from '@qwen-code/qwen-code-core';

export type TipTrigger = 'startup' | 'post-response';

export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  /**
   * Трёхуровневые пороги автосжатия, вычисляемые вызывающим кодом.
   * Опционально для обратной совместимости; при отсутствии подсказки возвращают false.
   */
  thresholds?: CompactionThresholds;
}
```

`getContextUsagePercent` оставьте (может понадобиться другим startup-подсказкам), но context-\* подсказки больше от него не зависят.

Замените [tipRegistry.ts:37-69](packages/cli/src/services/tips/tipRegistry.ts:37) — `isRelevant` для трёх подсказок:

```ts
export const tipRegistry: ContextualTip[] = [
  // --- Пост-ответные контекстные подсказки (приоритет: выше = более срочно) ---
  {
    id: 'context-critical',
    content:
      'Context near hard limit — auto-compact will force on next send. Consider /clear if you want to start fresh.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.hard,
    cooldownPrompts: 3,
    priority: 100,
  },
  {
    id: 'context-high',
    content: 'Context is getting full. Use /compress to free up space.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.auto &&
      ctx.lastPromptTokenCount < ctx.thresholds.hard,
    cooldownPrompts: 5,
    priority: 90,
  },
  {
    id: 'compress-intro',
    content: 'Long conversation? /compress summarizes history to free context.',
    trigger: 'post-response',
    isRelevant: (ctx) =>
      ctx.thresholds !== undefined &&
      ctx.lastPromptTokenCount >= ctx.thresholds.warn &&
      ctx.lastPromptTokenCount < ctx.thresholds.auto &&
      ctx.sessionPromptCount > 5,
    cooldownPrompts: 10,
    priority: 50,
  },

  // --- Стартовые подсказки ---  ← остаются без изменений
  // ... остальные startup-подсказки не трогаем ...
```

В `packages/cli/src/ui/AppContainer.tsx:1150` (известная точка конструирования контекстных подсказок) измените на:

```tsx
// псевдокод — зависит от существующего кода
const thresholds = computeThresholds(contextWindowSize);
const tipCtx: TipContext = {
  lastPromptTokenCount,
  contextWindowSize,
  sessionPromptCount,
  sessionCount,
  platform: process.platform,
  thresholds,
};
```

Добавьте импорт в AppContainer.tsx:

```tsx
import { computeThresholds } from '@qwen-code/qwen-code-core';
```

- [ ] **Шаг 4: Запустите тест и убедитесь, что он проходит**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/services/tips/tipRegistry.test.ts
npm test --workspace=packages/cli
```

Ожидается: PASS

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/cli/src/services/tips/tipRegistry.ts packages/cli/src/services/tips/tipRegistry.test.ts packages/cli/src/ui/AppContainer.tsx
git commit -m "$(cat <<'EOF'
feat(cli): align context-* tips with new compaction thresholds

The three context-usage tips now compare tokenCount against the
warn/auto/hard ladder from computeThresholds instead of fixed 50/80/95
percentages. compress-intro fires between warn and auto, context-high
between auto and hard, context-critical at or above hard. Threshold
data is injected into TipContext from the AppContainer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 11: Команда /context отображает три уровня порогов

**Файлы:**

- Изменить: `packages/cli/src/ui/commands/contextCommand.ts`
- Изменить: `packages/cli/src/ui/commands/contextCommand.test.ts`

- [ ] **Шаг 1: Напишите падающий тест**

```ts
describe('/context shows three-tier thresholds', () => {
  it('renders warn/auto/hard with current tier marker', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 150_000, // между warn и auto
    });
    expect(result).toMatch(/Warn threshold:\s+147[,.]?000/);
    expect(result).toMatch(/Auto threshold:\s+167[,.]?000/);
    expect(result).toMatch(/Hard threshold:\s+177[,.]?000/);
    expect(result).toMatch(/current tier:\s+warn/i);
  });

  it('correctly identifies "below warn" tier when tokens are low', () => {
    const result = renderContextCommand({
      contextWindowSize: 200_000,
      lastPromptTokenCount: 50_000,
    });
    expect(result).toMatch(/current tier:\s+(safe|below warn|normal)/i);
  });
});
```

- [ ] **Шаг 2: Запустите тест и убедитесь, что он падает**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts -t 'three-tier'
```

Ожидается: FAIL — текущий код [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177) использует формулу `(1 - threshold) * contextWindowSize` и показывает только одно число "autocompactBuffer".

- [ ] **Шаг 3: Реализуйте — измените вывод contextCommand**

Замените фрагмент [contextCommand.ts:177-183](packages/cli/src/ui/commands/contextCommand.ts:177):

```ts
import { computeThresholds } from '@qwen-code/qwen-code-core';

// ... внутри buildContextSummary или подобной точки входа:
const thresholds = computeThresholds(contextWindowSize);
const { warn, auto, hard, effectiveWindow } = thresholds;

function currentTier(tokens: number): string {
  if (tokens >= hard) return 'hard (force compress imminent)';
  if (tokens >= auto) return 'auto (compaction in progress / just ran)';
  if (tokens >= warn) return 'warn';
  return 'safe';
}

// В секции форматированного вывода добавьте:
const lines = [
  // ... существующий вывод ...
  `Effective window:   ${formatNum(effectiveWindow)}  (window − 20K reserve)`,
  `Warn threshold:     ${formatNum(warn)}`,
  `Auto threshold:     ${formatNum(auto)}`,
  `Hard threshold:     ${formatNum(hard)}`,
  `Current tier:       ${currentTier(lastPromptTokenCount)}`,
];
```

Примечание: `formatNum` — существующая в проекте функция `.toLocaleString()` и т.п.; если её нет в файле, вставьте inline `(n: number) => n.toLocaleString('en-US')`.

Также **удалите** старый код, вычисляющий `autocompactBuffer` (строки [:180-183](packages/cli/src/ui/commands/contextCommand.ts:180)), и использование `compressionThreshold` — теперь смотрим прямо на `auto`.

- [ ] **Шаг 4: Запустите тест и убедитесь, что он проходит**

```bash
npm test --workspace=packages/cli -- --run packages/cli/src/ui/commands/contextCommand.test.ts
```

Ожидается: PASS

- [ ] **Шаг 5: Проверка типов + линтинг**

```bash
npm run typecheck
npm run lint
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/cli/src/ui/commands/contextCommand.ts packages/cli/src/ui/commands/contextCommand.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): /context shows three-tier thresholds and current tier

Replace the legacy single-buffer display with effective window + warn /
auto / hard threshold lines and a "current tier" label so users can see
exactly where in the ladder the session sits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Приёмка (финальная полная регрессия)

После выполнения всех задач прогоните полную проверку:

- [ ] **Шаг 1: Полный прогон тестов**

```bash
npm test
```

Ожидается: все тесты всех workspace проходят.

- [ ] **Шаг 2: Полная проверка типов**

```bash
npm run typecheck
```

- [ ] **Шаг 3: Полный линтинг**

```bash
npm run lint
```

- [ ] **Шаг 4: Ручной smoke-тест**

Запустите CLI и выполните:

1. `/context` — проверьте, что новое трёхуровневое отображение корректно
2. Запустите диалог, который вызовет сжатие (можно использовать модель с окном 200K и наполнить prompt до 170K+)
3. Запустите с настройкой `chatCompression.contextPercentageThreshold = 0.5` — проверьте, что в stderr печатается предупреждение об устаревании
4. Восстановите огромную сессию через `--continue` и проверьте, что при первой отправке сжатие вызывается на этапе предварительной оценки

- [ ] **Шаг 5: Единый скрипт описания PR (опционально)**

Если PR отправляется частями, в описании каждого PR укажите ссылку на [docs/design/auto-compaction-threshold-redesign.md](docs/design/auto-compaction-threshold-redesign.md) и пометьте Фазу / Task.