# План реализации встроенной поддержки Computer Use

> **Для агентных разработчиков:** ОБЯЗАТЕЛЬНЫЙ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: Используйте суперсилы:subagent-driven-development (рекомендуется) или суперсилы:executing-plans для реализации этого плана задача за задачей. Шаги используют синтаксис флажков (`- [ ]`) для отслеживания.

**Цель:** Сделать `open-computer-use` встроенной возможностью в qwen-code без необходимости настройки. 9 инструментов computer-use появляются в отложенном списке инструментов как `computer_use__click`, `computer_use__type_text` и т.д. Первый вызов прозрачно устанавливает вышестоящий npm-пакет, при необходимости проводит пользователя через разрешения macOS Accessibility / Screen Recording и передает вызов на вышестоящий MCP-сервер.

**Архитектура:** Тонкая оболочка над вышестоящим `npx -y open-computer-use mcp`. Мы НЕ встраиваем бинарный файл; кэш `npx` вышестоящего пакета и `.app`-сборка отвечают за распространение и macOS TCC. 9 инструментов регистрируются как параметризованные экземпляры `ComputerUseTool` (по одному на каждый инструмент), основанные на синглтоне `ComputerUseClient`, который управляет долгоживущим дочерним процессом MCP stdio. Поверх этого надстраивается конечный автомат начальной загрузки: стандартное разрешение инструмента qwen-code (существующее) → подтверждение первой установки → опциональное руководство по разрешениям macOS.

**Технологический стек:** TypeScript, vitest, `@modelcontextprotocol/sdk` (уже есть как зависимость qwen-code), `node:child_process`, `node:fs/promises`.

---

## Структура файлов

**Новые файлы:**

```
packages/core/src/tools/computer-use/
  index.ts                          # registerComputerUseTools(registry, config); barrel-export
  schemas.ts                        # 9 жёстко заданных схем + описания (синхронизированы с вышестоящим)
  tool.ts                           # ComputerUseTool — параметризованный BaseDeclarativeTool
  client.ts                         # ComputerUseClient — синглтон-менеджер MCP stdio-процесса
  bootstrap.ts                      # конечный автомат: проверка → подтверждение установки → установка → руководство по разрешениям
  install-state.ts                  # чтение/запись ~/.qwen/computer-use/installed.json
  permission-detector.ts            # анализ строк ошибок вышестоящего для определения отсутствия разрешений
  schemas.test.ts                   # все 9 схем парсятся, имена соответствуют контракту
  tool.test.ts                      # параметризованная проводка инструмента
  client.test.ts                    # жизненный цикл клиента (мокированный spawn)
  bootstrap.test.ts                 # переходы конечного автомата
  install-state.test.ts             # round-trip файла состояния
  permission-detector.test.ts       # сопоставление с шаблонами ошибок
scripts/
  sync-computer-use-schemas.ts      # скрипт времени релиза: выгрузить вышестоящий tools/list → schemas.ts
```

**Изменяемые файлы:**

```
packages/core/src/tools/tool-names.ts                  # добавить 9 констант COMPUTER_USE_*
packages/core/src/config/config.ts                     # добавить поле computerUseEnabled + isComputerUseEnabled() + вызов register в createToolRegistry()
packages/cli/src/config/config.ts                      # сопоставить settings.tools.computerUse.enabled → ConfigParameters.computerUseEnabled
packages/cli/src/config/settingsSchema.ts              # добавить логическое поле tools.computerUse.enabled (по умолчанию true)
```

**Обоснование декомпозиции:** Каждый файл имеет одну ответственность. `client.ts` знает протокол MCP, но не UX; `bootstrap.ts` знает UX, но не касается деталей MCP; `tool.ts` — чистая обвязка, которая соединяет их через `execute()`. Тесты находятся рядом с кодом. Схемы изолированы, чтобы скрипт синхронизации мог перезаписать файл, не затрагивая логику.

---

## Фаза 1 — Основа (поверхность инструментов видна, выполнения нет)

### Задача 1: Добавить записи ToolNames + ToolDisplayNames для 9 инструментов computer-use

**Файлы:**

- Изменить: `packages/core/src/tools/tool-names.ts`

- [ ] **Шаг 1: Добавить 9 констант имён**

Отредактируйте `packages/core/src/tools/tool-names.ts` — внутри объекта `ToolNames`, после `EXIT_WORKTREE: 'exit_worktree',`:

```ts
  // Инструменты Computer Use — встроенные, но основанные на вышестоящем MCP-сервере.
  // Все отложены; раскрываются только когда запрос, инициированный пользователем,
  // вызывает действие computer-use. См. packages/core/src/tools/computer-use/.
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

Зеркально отразите в `ToolDisplayNames`:

```ts
  COMPUTER_USE_LIST_APPS: 'computer_use__list_apps',
  COMPUTER_USE_GET_APP_STATE: 'computer_use__get_app_state',
  COMPUTER_USE_CLICK: 'computer_use__click',
  COMPUTER_USE_PERFORM_SECONDARY_ACTION: 'computer_use__perform_secondary_action',
  COMPUTER_USE_SCROLL: 'computer_use__scroll',
  COMPUTER_USE_DRAG: 'computer_use__drag',
  COMPUTER_USE_TYPE_TEXT: 'computer_use__type_text',
  COMPUTER_USE_PRESS_KEY: 'computer_use__press_key',
  COMPUTER_USE_SET_VALUE: 'computer_use__set_value',
```

(displayName == name намеренно; мы не хотим, чтобы в диалоге разрешений отображались имена с заглавной буквы, такие как `Click`, когда имя инструмента — `computer_use__click`.)

- [ ] **Шаг 2: Проверить, что существующий тест tool-names всё ещё проходит**

Выполните: `npm test -- packages/core/src/tools/tool-names`
Ожидаемый результат: PASS (если тестового файла нет, выполните `npm run build -- --filter @qwen-code/qwen-code-core`, чтобы проверить типы)

- [ ] **Шаг 3: Закоммитить**

```bash
git add packages/core/src/tools/tool-names.ts
git commit -m "feat(computer-use): add tool name constants"
```

---

### Задача 2: Модуль жёстко заданных схем

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/schemas.ts`
- Создать: `packages/core/src/tools/computer-use/schemas.test.ts`

9 схем зеркально отражают вывод `tools/list` вышестоящего `open-computer-use mcp`. Они привязаны к версии вышестоящего пакета `^0.x.y` (TODO: укажите фактическую привязку в начале `schemas.ts` при реализации — выполните `npx -y open-computer-use@latest --version`, чтобы получить текущую последнюю версию).

- [ ] **Шаг 1: Написать падающий тест**

Создайте `packages/core/src/tools/computer-use/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('schemas computer-use', () => {
  it('экспортирует ровно 9 схем', () => {
    expect(Object.keys(COMPUTER_USE_SCHEMAS)).toHaveLength(9);
  });

  it('каждое имя инструмента соответствует соглашению вышестоящего (без префикса computer_use__)', () => {
    // schemas.ts использует имена вышестоящего пакета дословно ("click", "type_text").
    // Префикс computer_use__ находится в обёртке qwen-code.
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(name).not.toContain('computer_use__');
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('каждая схема имеет стандартную структуру объекта', () => {
    for (const [name, schema] of Object.entries(COMPUTER_USE_SCHEMAS)) {
      expect(schema.description, `${name} отсутствует описание`).toBeTruthy();
      expect(
        schema.parameterSchema,
        `${name} отсутствует parameterSchema`,
      ).toBeTruthy();
      expect((schema.parameterSchema as { type: string }).type).toBe('object');
    }
  });

  it('list_apps не принимает параметров', () => {
    expect(COMPUTER_USE_SCHEMAS.list_apps.parameterSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('click требует app и либо element_index, либо x/y', () => {
    const schema = COMPUTER_USE_SCHEMAS.click.parameterSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties).toHaveProperty('app');
    expect(schema.properties).toHaveProperty('element_index');
    expect(schema.properties).toHaveProperty('x');
    expect(schema.properties).toHaveProperty('y');
    expect(schema.required).toContain('app');
  });
});
```

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

Выполните: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Ожидаемый результат: FAIL с сообщением "Cannot find module './schemas.js'"

- [ ] **Шаг 3: Написать модуль схем**

Создайте `packages/core/src/tools/computer-use/schemas.ts`. Приведённые ниже схемы являются MVP — они отражают поверхность инструментов вышестоящего и имена параметров. Скрипт `sync-computer-use-schemas.ts` (Задача 13) будет перегенерировать этот файл на основе живого снимка вышестоящего пакета в CI перед каждым релизом qwen-code.

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Жёстко заданные схемы для 9 вышестоящих инструментов open-computer-use.
 *
 * Привязаны к версии вышестоящего пакета: <PIN_VERSION_DURING_IMPL>
 *
 * Перегенерировано скриптом `scripts/sync-computer-use-schemas.ts` — не редактировать вручную.
 * Имена вышестоящих инструментов ("click", "type_text") указываются здесь дословно;
 * префикс `computer_use__` добавляется обёрткой qwen-code в
 * `tool.ts`, чтобы модель видела `computer_use__click` без утечки
 * концепций MCP.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = [
  'list_apps',
  'get_app_state',
  'click',
  'perform_secondary_action',
  'scroll',
  'drag',
  'type_text',
  'press_key',
  'set_value',
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<
  ComputerUseToolName,
  ComputerUseToolSchema
> = {
  list_apps: {
    description:
      'Список работающих и недавно использованных настольных приложений на текущей машине. Возвращает каждое приложение с идентификатором пакета и отображаемым именем. Используйте перед get_app_state, чтобы узнать, с чем можно взаимодействовать.',
    parameterSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  get_app_state: {
    description:
      'Захватывает текущее дерево доступности и скриншот указанного приложения. Возвращает значения element_index, которые последующие действия (click, set_value и т.д.) могут использовать в качестве цели. Всегда вызывайте перед любым действием, нацеленным на элемент; element_index действителен только в пределах текущего снимка.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description:
            'Идентификатор пакета приложения или отображаемое имя (например, "TextEdit", "com.apple.Safari").',
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  click: {
    description:
      'Левый клик по цели. Предпочитайте element_index из последнего результата get_app_state. Используйте координаты x/y в пикселях скриншота только в том случае, если ни один элемент AX не соответствует цели.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Целевое приложение.' },
        element_index: {
          type: 'integer',
          description: 'Индекс в списке элементов последнего get_app_state.',
        },
        x: {
          type: 'integer',
          description: 'Координата X в пикселях скриншота.',
        },
        y: {
          type: 'integer',
          description: 'Координата Y в пикселях скриншота.',
        },
        click_count: {
          type: 'integer',
          description: 'Количество кликов (1 = одиночный, 2 = двойной).',
          default: 1,
        },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  perform_secondary_action: {
    description:
      'Выполняет семантическое действие, не являющееся кликом, предоставленное целевым элементом AX (например, "Raise", "ShowMenu"). Возвращает ошибку, если действие недопустимо для элемента.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        action: {
          type: 'string',
          description: 'Имя действия AX для выполнения.',
        },
      },
      required: ['app', 'element_index', 'action'],
      additionalProperties: false,
    },
  },
  scroll: {
    description:
      'Прокрутка внутри целевого элемента или по заданным координатам. `pages` — дробное количество страниц (положительное = вниз, отрицательное = вверх).',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        pages: {
          type: 'number',
          description: 'Дробное количество страниц для прокрутки (отрицательное = вверх).',
        },
      },
      required: ['app', 'pages'],
      additionalProperties: false,
    },
  },
  drag: {
    description:
      'Перетаскивание от одной пары координат к другой в окне целевого приложения. Координаты в пикселях скриншота.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        from_x: { type: 'integer' },
        from_y: { type: 'integer' },
        to_x: { type: 'integer' },
        to_y: { type: 'integer' },
      },
      required: ['app', 'from_x', 'from_y', 'to_x', 'to_y'],
      additionalProperties: false,
    },
  },
  type_text: {
    description:
      'Ввод текста в текущий сфокусированный текстовый ввод целевого приложения. Сначала щёлкните по области ввода, если она не в фокусе. Для несфокусированных текстовых полей лучше используйте set_value.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        text: {
          type: 'string',
          description: 'Текст для ввода. Поддерживает Unicode.',
        },
      },
      required: ['app', 'text'],
      additionalProperties: false,
    },
  },
  press_key: {
    description:
      'Нажатие клавиши клавиатуры или комбинации в целевом приложении. Имена клавиш следуют соглашениям xdotool (например, "Return", "BackSpace", "cmd+c", "Page_Up").',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['app', 'key'],
      additionalProperties: false,
    },
  },
  set_value: {
    description:
      'Непосредственная установка значения устанавливаемого элемента AX (текстовые поля, ползунки и т.д.). Возвращает ошибку, если цель не является устанавливаемой.',
    parameterSchema: {
      type: 'object',
      properties: {
        app: { type: 'string' },
        element_index: { type: 'integer' },
        value: { type: 'string' },
      },
      required: ['app', 'element_index', 'value'],
      additionalProperties: false,
    },
  },
};
```

- [ ] **Шаг 4: Запустить тест, чтобы убедиться, что он проходит**

Выполните: `npm test -- packages/core/src/tools/computer-use/schemas.test.ts`
Ожидаемый результат: PASS, 5 тестов

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/core/src/tools/computer-use/schemas.ts packages/core/src/tools/computer-use/schemas.test.ts
git commit -m "feat(computer-use): hardcode upstream tool schemas"
```

---

### Задача 3: Схема настроек + подключение Config для enableComputerUse

**Файлы:**

- Изменить: `packages/cli/src/config/settingsSchema.ts`
- Изменить: `packages/cli/src/config/config.ts`
- Изменить: `packages/core/src/config/config.ts`

- [ ] **Шаг 1: Добавить запись в настройки**

Отредактируйте `packages/cli/src/config/settingsSchema.ts`. Существующая схема группирует элементы по категориям. Computer Use — это возможность инструмента, не экспериментальная — добавьте новую подгруппу `tools`, если её нет, или добавьте в существующую. Используйте grep:

```bash
grep -n "tools:" packages/cli/src/config/settingsSchema.ts | head -5
```

Если ключ `tools:` существует, добавьте новое свойство внутри него. Если нет, добавьте группу верхнего уровня. Шаблон (добавьте рядом с записью `experimental.cron`, примерно строка ~2298):

```ts
  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: true,
    default: {},
    description: 'Включение/отключение возможностей инструментов.',
    showInDialog: false,
    properties: {
      computerUse: {
        type: 'object',
        label: 'Computer Use',
        category: 'Tools',
        requiresRestart: true,
        default: {},
        description: 'Кроссплатформенная автоматизация рабочего стола через вышестоящий MCP-сервер open-computer-use. Инструменты: list_apps, get_app_state, click, type_text, scroll, drag, press_key, perform_secondary_action, set_value. При первом вызове вышестоящий пакет загружается через npx, и, при необходимости, пользователь проходит через разрешения macOS Accessibility / Screen Recording.',
        showInDialog: false,
        properties: {
          enabled: {
            type: 'boolean',
            label: 'Включить Computer Use',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: 'Когда включено (по умолчанию), 9 инструментов computer_use__* регистрируются как отложенные встроенные.',
            showInDialog: true,
          },
        },
      },
    },
  },
```

Если группа `tools:` уже существует, просто добавьте свойство `computerUse:` в её `properties`.

- [ ] **Шаг 2: Соединить настройки → ConfigParameters**

Отредактируйте `packages/cli/src/config/config.ts`. Найдите существующую строку `cronEnabled: settings.experimental?.cron ?? false,` (около строки 1833). Добавьте непосредственно ниже:

```ts
    computerUseEnabled: settings.tools?.computerUse?.enabled ?? true,
```

- [ ] **Шаг 3: Добавить поле Config + геттер**

Отредактируйте `packages/core/src/config/config.ts`:

(a) В интерфейсе `ConfigParameters` (найдите `cronEnabled?: boolean;`), добавьте непосредственно ниже:

```ts
  computerUseEnabled?: boolean;
```

(b) В полях класса `Config` (найдите `private readonly cronEnabled: boolean = false;`), добавьте непосредственно ниже:

```ts
  private readonly computerUseEnabled: boolean = true;
```

(c) В конструкторе `Config` (найдите `this.cronEnabled = params.cronEnabled ?? false;`), добавьте непосредственно ниже:

```ts
this.computerUseEnabled = params.computerUseEnabled ?? true;
```

(d) Рядом с `isCronEnabled()` (найдите `isCronEnabled(): boolean {`), добавьте родственный геттер:

```ts
  isComputerUseEnabled(): boolean {
    return this.computerUseEnabled;
  }
```

- [ ] **Шаг 4: Проверка типов**

Выполните: `npm run build -- --filter @qwen-code/qwen-code-core --filter @qwen-code/qwen-code`
Ожидаемый результат: PASS

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/config/settingsSchema.ts packages/cli/src/config/config.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): add enableComputerUse setting (default true)"
```

---

## Фаза 2 — Транспорт (MCP-клиент поверх npx stdio)

### Задача 4: ComputerUseClient — синглтон-менеджер MCP stdio-процесса

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/client.ts`
- Создать: `packages/core/src/tools/computer-use/client.test.ts`

Примечание: Клиент использует `@modelcontextprotocol/sdk` (уже есть как зависимость, см. `packages/core/src/tools/mcp-client.ts`). Мы используем `StdioClientTransport` для запуска `npx -y open-computer-use mcp`.

- [ ] **Шаг 1: Написать падающий тест**

Создайте `packages/core/src/tools/computer-use/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseClient } from './client.js';

describe('ComputerUseClient', () => {
  let client: ComputerUseClient;

  beforeEach(() => {
    client = new ComputerUseClient({
      packageSpec: 'open-computer-use@latest',
      onProgress: vi.fn(),
    });
  });

  it('создаётся', () => {
    expect(client).toBeDefined();
  });

  it('сообщает, что не запущен до вызова start()', () => {
    expect(client.isStarted()).toBe(false);
  });

  it('возвращает тот же экземпляр для повторных вызывающих через синглтон', () => {
    const a = ComputerUseClient.shared();
    const b = ComputerUseClient.shared();
    expect(a).toBe(b);
  });
});
```

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

Выполните: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Ожидаемый результат: FAIL — модуль не найден
- [ ] **Шаг 3: Реализация клиента**

Создайте `packages/core/src/tools/computer-use/client.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Singleton stdio MCP client for the upstream open-computer-use binary.
 *
 * Spawned via `npx -y <packageSpec> mcp`. First spawn pays the npx
 * download cost (up to ~60s for a fresh cache); subsequent spawns reuse
 * the npx cache and are sub-second.
 *
 * Lifecycle: lazy spawn on first `callTool` invocation. The process
 * stays alive until `stop()` or qwen-code exits. State (element_index
 * map per app) lives in the process — if the process restarts, the
 * model must call `get_app_state` again before any element-targeted
 * action.
 */
export interface ComputerUseClientOptions {
  /** npm package spec to npx. Example: "open-computer-use@^0.3.0". */
  packageSpec: string;
  /** Streaming hook for progress messages during slow operations. */
  onProgress?: (message: string) => void;
}

export class ComputerUseClient {
  private static singleton: ComputerUseClient | undefined;

  private readonly packageSpec: string;
  private readonly onProgress: (message: string) => void;
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(options: ComputerUseClientOptions) {
    this.packageSpec = options.packageSpec;
    this.onProgress = options.onProgress ?? (() => {});
  }

  /**
   * Shared singleton instance, created with default options on first
   * access. Tests can replace it via `setSharedForTest()`.
   */
  static shared(): ComputerUseClient {
    if (!ComputerUseClient.singleton) {
      ComputerUseClient.singleton = new ComputerUseClient({
        packageSpec:
          process.env['QWEN_COMPUTER_USE_PACKAGE'] ??
          'open-computer-use@latest',
      });
    }
    return ComputerUseClient.singleton;
  }

  /** Test-only: replace the singleton. */
  static setSharedForTest(replacement: ComputerUseClient | undefined): void {
    ComputerUseClient.singleton = replacement;
  }

  isStarted(): boolean {
    return this.client !== undefined;
  }

  /**
   * Start the upstream MCP server. Idempotent: concurrent callers share
   * the same in-flight start promise.
   *
   * Throws on spawn failure (network down, npx missing, etc.). The
   * caller (bootstrap state machine) is responsible for mapping the
   * throw into user-facing UX.
   */
  async start(): Promise<void> {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.onProgress('Starting Computer Use...');

    // After ~3s, surface a hint that the slow path is download.
    const downloadHintTimer = setTimeout(() => {
      this.onProgress(
        'Downloading Computer Use binary (this can take ~60s on first use)...',
      );
    }, 3000);

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', this.packageSpec, 'mcp'],
        // Inherit env so HTTPS_PROXY etc. flow through to npx
        env: { ...process.env } as Record<string, string>,
      });
      const client = new Client(
        { name: 'qwen-code-computer-use', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.transport = transport;
      this.client = client;
    } finally {
      clearTimeout(downloadHintTimer);
    }
  }

  /**
   * List the tools exposed by the upstream server. Used by the schema
   * sync script and bootstrap diagnostics.
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) throw new Error('ComputerUseClient not started');
    return this.client.listTools();
  }

  /**
   * Call a tool by upstream name (NOT the qwen-code-facing
   * `computer_use__` prefixed name). Returns the raw MCP result so the
   * caller can inspect `isError` and parse text content.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error('ComputerUseClient not started');
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** Tear down the child process. Safe to call multiple times. */
  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) {
      try {
        await client.close();
      } catch {
        // best-effort cleanup
      }
    }
  }
}
```

- [ ] **Шаг 4: Запустите тест для проверки прохождения**

Выполните: `npm test -- packages/core/src/tools/computer-use/client.test.ts`
Ожидаемый результат: PASS, 3 теста

- [ ] **Шаг 5: Коммит**

```bash
git add packages/core/src/tools/computer-use/client.ts packages/core/src/tools/computer-use/client.test.ts
git commit -m "feat(computer-use): MCP stdio client for upstream binary"
```

---

### Задача 5: ComputerUseTool — параметризованная обёртка BaseDeclarativeTool

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/tool.ts`
- Создать: `packages/core/src/tools/computer-use/tool.test.ts`

В этой задаче инструмент просто передаёт управление `ComputerUseClient`, предполагая, что он уже запущен. Обёртка bootstrap state machine будет реализована в Phase 3.

- [ ] **Шаг 1: Напишите падающий тест**

Создайте `packages/core/src/tools/computer-use/tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComputerUseTool } from './tool.js';
import { ComputerUseClient } from './client.js';
import { COMPUTER_USE_SCHEMAS } from './schemas.js';

function makeFakeClient(
  callToolImpl: (name: string, args: unknown) => Promise<unknown>,
) {
  const fake = {
    isStarted: () => true,
    start: vi.fn(async () => {}),
    callTool: vi.fn(callToolImpl),
    stop: vi.fn(async () => {}),
  };
  return fake as unknown as ComputerUseClient;
}

describe('ComputerUseTool', () => {
  beforeEach(() => {
    ComputerUseClient.setSharedForTest(undefined);
  });

  it('exposes qwen-facing name with computer_use__ prefix', () => {
    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    expect(tool.name).toBe('computer_use__click');
    expect(tool.displayName).toBe('computer_use__click');
  });

  it('marks itself as deferred', () => {
    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    expect(tool.shouldDefer).toBe(true);
    expect(tool.alwaysLoad).toBe(false);
  });

  it('forwards execute() to the shared client with the upstream name', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: '[]' }],
      isError: false,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool(
      'list_apps',
      COMPUTER_USE_SCHEMAS.list_apps,
    );
    const invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(fake.callTool).toHaveBeenCalledWith('list_apps', {});
  });

  it('returns an error result when client returns isError=true', async () => {
    const fake = makeFakeClient(async () => ({
      content: [{ type: 'text', text: 'something went wrong' }],
      isError: true,
    }));
    ComputerUseClient.setSharedForTest(fake);

    const tool = new ComputerUseTool('click', COMPUTER_USE_SCHEMAS.click);
    const invocation = tool.build({ app: 'TextEdit' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(String(result.llmContent)).toContain('something went wrong');
  });
});
```

- [ ] **Шаг 2: Запустите тест для проверки падения**

Выполните: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Ожидаемый результат: FAIL — модуль не найден

- [ ] **Шаг 3: Реализуйте инструмент**

Создайте `packages/core/src/tools/computer-use/tool.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from '../tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ComputerUseClient } from './client.js';
import type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { runBootstrap } from './bootstrap.js';

type ComputerUseParams = Record<string, unknown>;

class ComputerUseInvocation extends BaseToolInvocation<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    params: ComputerUseParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const client = ComputerUseClient.shared();

    // Phase 3 wires the bootstrap state machine here. Until then, this
    // shells out directly which is fine when the binary is already
    // installed and permissions granted.
    await runBootstrap(client, { signal, updateOutput });

    let mcpResult: CallToolResult;
    try {
      mcpResult = await client.callTool(this.upstreamName, this.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `Computer Use tool '${this.upstreamName}' failed: ${message}`,
        returnDisplay: `Error: ${message}`,
        error: { message },
      };
    }

    const text = mcpResult.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');

    if (mcpResult.isError) {
      return {
        llmContent: text || `Tool '${this.upstreamName}' returned isError=true`,
        returnDisplay: text || 'Error',
        error: { message: text || 'tool returned error' },
      };
    }

    return {
      llmContent: text,
      returnDisplay: text,
    };
  }
}

export class ComputerUseTool extends BaseDeclarativeTool<
  ComputerUseParams,
  ToolResult
> {
  constructor(
    private readonly upstreamName: ComputerUseToolName,
    schema: ComputerUseToolSchema,
  ) {
    const qwenName = `computer_use__${upstreamName}`;
    super(
      qwenName,
      qwenName, // displayName == name; no MCP branding in UI
      schema.description,
      Kind.Other,
      schema.parameterSchema,
      true, // isOutputMarkdown — many results are JSON-ish text or screenshots
      true, // canUpdateOutput — bootstrap streams progress
      true, // shouldDefer — surface only via ToolSearch
      false, // alwaysLoad
      `computer use desktop click type screenshot mouse keyboard scroll drag automation gui app native`,
    );
  }

  protected createInvocation(
    params: ComputerUseParams,
  ): ToolInvocation<ComputerUseParams, ToolResult> {
    return new ComputerUseInvocation(this.upstreamName, params);
  }
}
```

Примечание: тест ссылается на `runBootstrap`, который будет реализован в Phase 3. Пока что создайте заглушку `bootstrap.ts`, чтобы тест проходил:

Создайте `packages/core/src/tools/computer-use/bootstrap.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComputerUseClient } from './client.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/**
 * STUB: Phase 3 replaces this with the full state machine
 * (install confirm → install → permission probe → guide → poll).
 * For now: assumes binary is installed and permissions granted;
 * just starts the client if needed.
 */
export async function runBootstrap(
  client: ComputerUseClient,
  _ctx: BootstrapContext,
): Promise<void> {
  if (!client.isStarted()) {
    await client.start();
  }
}
```

- [ ] **Шаг 4: Запустите тест для проверки прохождения**

Выполните: `npm test -- packages/core/src/tools/computer-use/tool.test.ts`
Ожидаемый результат: PASS, 4 теста

- [ ] **Шаг 5: Коммит**

```bash
git add packages/core/src/tools/computer-use/tool.ts packages/core/src/tools/computer-use/tool.test.ts packages/core/src/tools/computer-use/bootstrap.ts
git commit -m "feat(computer-use): ComputerUseTool wrapper + bootstrap stub"
```

---

### Задача 6: Регистрация инструментов в ToolRegistry

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/index.ts`
- Изменить: `packages/core/src/config/config.ts`

- [ ] **Шаг 1: Создайте вспомогательную функцию регистрации**

Создайте `packages/core/src/tools/computer-use/index.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

export { ComputerUseTool } from './tool.js';
export { ComputerUseClient } from './client.js';
export type { ComputerUseToolName, ComputerUseToolSchema } from './schemas.js';
export { COMPUTER_USE_TOOL_NAMES, COMPUTER_USE_SCHEMAS } from './schemas.js';

import { ComputerUseTool } from './tool.js';
import { COMPUTER_USE_SCHEMAS, COMPUTER_USE_TOOL_NAMES } from './schemas.js';
import type { ToolRegistry } from '../tool-registry.js';

/**
 * Register all 9 computer-use tools as lazy factories on the registry.
 * Each tool is deferred (`shouldDefer=true`), so they surface only via
 * ToolSearch keyword match. The first invocation triggers the
 * bootstrap state machine (install confirm → install → permission flow)
 * before forwarding to the upstream MCP server.
 *
 * Should only be called when `Config.isComputerUseEnabled()` is true.
 */
export function registerComputerUseTools(registry: ToolRegistry): void {
  for (const upstreamName of COMPUTER_USE_TOOL_NAMES) {
    const schema = COMPUTER_USE_SCHEMAS[upstreamName];
    const qwenName = `computer_use__${upstreamName}`;
    registry.registerFactory(
      qwenName,
      async () => new ComputerUseTool(upstreamName, schema),
    );
  }
}
```

- [ ] **Шаг 2: Подключите регистрацию в Config.createToolRegistry**

Отредактируйте `packages/core/src/config/config.ts`. Найдите существующий блок, который условно регистрирует cron-инструменты (около строки 3952):

```ts
    if (this.isCronEnabled()) {
      await registerLazy(ToolNames.CRON_CREATE, async () => { ... });
      ...
    }
```

Непосредственно после блока cron (и перед блоком monitor) добавьте:

```ts
// Register computer-use tools unless disabled.
// All 9 are deferred — they surface only via ToolSearch keyword
// match (see packages/core/src/tools/computer-use/).
if (this.isComputerUseEnabled()) {
  const { registerComputerUseTools } = await import(
    '../tools/computer-use/index.js'
  );
  registerComputerUseTools(registry);
}
```

- [ ] **Шаг 3: Добавьте тест регистрации**

Добавьте в существующие тесты tool-registry ИЛИ создайте `packages/core/src/tools/computer-use/registration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerComputerUseTools } from './index.js';
import { COMPUTER_USE_TOOL_NAMES } from './schemas.js';

describe('registerComputerUseTools', () => {
  it('registers a factory for each of the 9 upstream tools, prefixed with computer_use__', () => {
    const registered = new Set<string>();
    const fakeRegistry = {
      registerFactory: vi.fn((name: string) => {
        registered.add(name);
      }),
    } as never;

    registerComputerUseTools(fakeRegistry);

    expect(registered.size).toBe(9);
    for (const name of COMPUTER_USE_TOOL_NAMES) {
      expect(registered.has(`computer_use__${name}`)).toBe(true);
    }
  });
});
```

- [ ] **Шаг 4: Запустите тесты + проверку типов**

Выполните:

```bash
npm test -- packages/core/src/tools/computer-use/
npm run build -- --filter @qwen-code/qwen-code-core
```

Ожидается: Все PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add packages/core/src/tools/computer-use/index.ts packages/core/src/tools/computer-use/registration.test.ts packages/core/src/config/config.ts
git commit -m "feat(computer-use): register 9 deferred tools when enabled"
```

---

### Задача 7: Ручной smoke-тест — инструменты появляются и happy-path вызов работает

Это промежуточный шаг без написания кода. Проверяет, что основа работает, прежде чем переходить к bootstrap UX.

- [ ] **Шаг 1: Предварительно установите upstream-бинарник (однократно, вручную)**

Выполните в терминале:

```bash
npx -y open-computer-use@latest --version
```

На macOS: также выполните `npx -y open-computer-use@latest doctor` и предоставьте запрошенные разрешения. Это обходит наш bootstrap, чтобы мы могли проверить транспортный уровень изолированно.

- [ ] **Шаг 2: Соберите qwen-code**

Выполните: `npm run build`
Ожидается: PASS.

- [ ] **Шаг 3: Запустите qwen-code и проверьте обнаружение инструментов**

Запустите qwen-code, затем попросите модель: _"Use the ToolSearch tool with query 'click computer use' to find any desktop automation tools available."_

Ожидается: ToolSearch возвращает 9 схем `computer_use__*`.

- [ ] **Шаг 4: Протестируйте инструмент без разрешений**

Спросите: _"List the desktop apps currently running using the computer_use\_\_list_apps tool."_

Ожидается: При первом вызове несколько секунд отображается "Starting Computer Use..." (или дольше, если кэш npx холоден), затем возвращается список запущенных приложений. Последующие вызовы в той же сессии быстрые.

- [ ] **Шаг 5: Коммит не нужен; это smoke-проверка**

Если что-то не работает, остановитесь и отладьте, прежде чем переходить к Phase 3.

---

## Phase 3 — Bootstrap UX (подтверждение установки + руководство по разрешениям)

На этом этапе заглушка `runBootstrap` из Задачи 5 заменяется полным конечным автоматом.

### Задача 8: Постоянное хранение состояния установки

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/install-state.ts`
- Создать: `packages/core/src/tools/computer-use/install-state.test.ts`

Сохраняется в `~/.qwen/computer-use/installed.json`:

```json
{
  "approvedPackageSpec": "open-computer-use@^0.3.0",
  "approvedAtIso": "2026-05-28T10:00:00Z"
}
```

- [ ] **Шаг 1: Напишите падающий тест**

Создайте `packages/core/src/tools/computer-use/install-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInstallState,
  saveInstallState,
  isPackageSpecApproved,
  installStatePathFor,
} from './install-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('install-state', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-test-'));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns undefined when no state file exists', async () => {
    expect(await loadInstallState(tmpHome)).toBeUndefined();
  });

  it('round-trips state', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    const loaded = await loadInstallState(tmpHome);
    expect(loaded).toEqual({
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
  });

  it('isPackageSpecApproved returns false when no state', async () => {
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(false);
  });

  it('isPackageSpecApproved returns true on exact match', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.3.0'),
    ).toBe(true);
  });

  it('isPackageSpecApproved returns false when version differs', async () => {
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    expect(
      await isPackageSpecApproved(tmpHome, 'open-computer-use@^0.4.0'),
    ).toBe(false);
  });
});
```
- [ ] **Шаг 2: Запустите тест, чтобы убедиться, что он падает**

Запустите: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Ожидается: FAIL — модуль не найден

- [ ] **Шаг 3: Реализуйте модуль**

Создайте `packages/core/src/tools/computer-use/install-state.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export interface InstallState {
  /** The package spec the user approved (e.g. "open-computer-use@^0.3.0"). */
  approvedPackageSpec: string;
  /** ISO 8601 UTC timestamp of approval. */
  approvedAtIso: string;
}

/**
 * Path to the install-state file. Exported for tests so they can
 * point at a temp directory.
 */
export function installStatePathFor(home: string = homedir()): string {
  return join(home, '.qwen', 'computer-use', 'installed.json');
}

export async function loadInstallState(
  home: string = homedir(),
): Promise<InstallState | undefined> {
  try {
    const text = await readFile(installStatePathFor(home), 'utf8');
    const parsed = JSON.parse(text) as InstallState;
    // Minimal shape check — older or malformed files act as "not approved".
    if (typeof parsed?.approvedPackageSpec !== 'string') return undefined;
    if (typeof parsed?.approvedAtIso !== 'string') return undefined;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    // Treat unreadable / malformed state as "not approved" — re-prompt
    // is safe; treating a bad file as approved would silently install.
    return undefined;
  }
}

export async function saveInstallState(
  home: string = homedir(),
  state: InstallState,
): Promise<void> {
  const path = installStatePathFor(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * True iff the persisted state's package spec exactly matches the one
 * we're about to install. Different specs (version pin bumps) require
 * re-approval, since the user may have approved an older / smaller /
 * different-license version.
 */
export async function isPackageSpecApproved(
  home: string = homedir(),
  packageSpec: string,
): Promise<boolean> {
  const state = await loadInstallState(home);
  return state?.approvedPackageSpec === packageSpec;
}
```

- [ ] **Шаг 4: Запустите тест, чтобы убедиться, что он проходит**

Запустите: `npm test -- packages/core/src/tools/computer-use/install-state.test.ts`
Ожидается: PASS, 5 тестов

- [ ] **Шаг 5: Зафиксируйте изменения**

```bash
git add packages/core/src/tools/computer-use/install-state.ts packages/core/src/tools/computer-use/install-state.test.ts
git commit -m "feat(computer-use): persist install approval state under ~/.qwen"
```

---

### Задача 9: Детектор ошибок разрешений

**Файлы:**

- Создать: `packages/core/src/tools/computer-use/permission-detector.ts`
- Создать: `packages/core/src/tools/computer-use/permission-detector.test.ts`

- [ ] **Шаг 1: Напишите падающий тест**

Создайте `packages/core/src/tools/computer-use/permission-detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectPermissionError } from './permission-detector.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

function textErrorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

describe('detectPermissionError', () => {
  it('returns "none" when isError is false', () => {
    expect(
      detectPermissionError({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    ).toBe('none');
  });

  it('detects accessibility permission missing (upstream phrasing)', () => {
    // From AccessibilitySnapshot.swift:104
    const result = textErrorResult(
      'Accessibility permission is required. Run `open-computer-use doctor` and grant access to Open Computer Use.',
    );
    expect(detectPermissionError(result)).toBe('accessibility');
  });

  it('detects screen recording permission missing', () => {
    const result = textErrorResult(
      'Screen Recording permission is required to capture this window.',
    );
    expect(detectPermissionError(result)).toBe('screenRecording');
  });

  it('detects via the generic doctor marker as fallback', () => {
    const result = textErrorResult(
      'Some unfamiliar error. Run `open-computer-use doctor` for help.',
    );
    expect(detectPermissionError(result)).toBe('unknown_permission');
  });

  it('returns "other" for unrelated errors', () => {
    expect(
      detectPermissionError(textErrorResult('appNotFound("ImaginaryApp")')),
    ).toBe('other');
  });
});
```

- [ ] **Шаг 2: Запустите тест, чтобы убедиться, что он падает**

Запустите: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Ожидается: FAIL — модуль не найден

- [ ] **Шаг 3: Реализуйте детектор**

Создайте `packages/core/src/tools/computer-use/permission-detector.ts`:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * What kind of permission issue, if any, the upstream MCP result
 * indicates. We classify based on message strings because upstream
 * doesn't expose typed error codes through MCP (see
 * `packages/OpenComputerUseKit/Sources/OpenComputerUseKit/Errors.swift`
 * in the open-codex-computer-use repo).
 *
 * Long-term fix is to PR upstream for a typed errorKind; for now this
 * string detection is the contract.
 */
export type PermissionErrorKind =
  | 'none' // success, or non-error result
  | 'other' // error, but not a permission issue
  | 'accessibility' // AX missing
  | 'screenRecording' // Screen Recording missing
  | 'unknown_permission'; // matches the doctor marker but doesn't pinpoint which

/**
 * Upstream-known error patterns. Order matters — more specific
 * patterns first.
 */
const PATTERNS: Array<{ kind: PermissionErrorKind; regex: RegExp }> = [
  { kind: 'accessibility', regex: /accessibility permission is required/i },
  { kind: 'screenRecording', regex: /screen recording permission/i },
  // Fallback: any error mentioning the doctor command is likely permission-related.
  // Listed last so it doesn't preempt the specific patterns.
  { kind: 'unknown_permission', regex: /open-computer-use\s+doctor/i },
];

export function detectPermissionError(
  result: CallToolResult,
): PermissionErrorKind {
  if (!result.isError) return 'none';
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
  for (const { kind, regex } of PATTERNS) {
    if (regex.test(text)) return kind;
  }
  return 'other';
}
```

- [ ] **Шаг 4: Запустите тест, чтобы убедиться, что он проходит**

Запустите: `npm test -- packages/core/src/tools/computer-use/permission-detector.test.ts`
Ожидается: PASS, 5 тестов

- [ ] **Шаг 5: Зафиксируйте изменения**

```bash
git add packages/core/src/tools/computer-use/permission-detector.ts packages/core/src/tools/computer-use/permission-detector.test.ts
git commit -m "feat(computer-use): detect upstream permission errors"
```

---

### Задача 10: Инициализация конечного автомата — полный UX-поток

**Файлы:**

- Изменить: `packages/core/src/tools/computer-use/bootstrap.ts` (заменить заглушку из задачи 5)
- Создать: `packages/core/src/tools/computer-use/bootstrap.test.ts`

Конечный автомат включает три подпотока:

1. **Установка при первом запуске**: если `isPackageSpecApproved` возвращает false, запросить у пользователя подтверждение, выполнить установку, сохранить подтверждение.
2. **Запуск**: убедиться, что клиент запущен.
3. **Проверка разрешений + гид** (только macOS): если возникает ошибка разрешений, запустить `open-computer-use doctor`, опрашивать предоставление доступа до 10 минут, повторить попытку.

Примечание: фактический механизм «задать вопрос пользователю во время выполнения» в qwen-code использует существующий фреймворк подтверждения инструментов. **РАЗРАБОТЧИК**: перед написанием реализации этой задачи выполните grep по `shouldConfirmExecute` в `packages/core/src/tools/`, чтобы увидеть, как `shell.ts` и аналогичные инструменты реализуют подтверждение. Эта задача предполагает, что такой механизм доступен; если нет — используйте `process.stderr.write` + чтение из `process.stdin` для подтверждения установки (допустимый UX для v0).

- [ ] **Шаг 1: Изучите паттерны подтверждения**

Выполните:

```bash
grep -rn "shouldConfirmExecute\|ToolConfirmation" packages/core/src/tools --include="*.ts" | grep -v ".test." | head -20
```

Прочитайте хотя бы один инструмент, использующий паттерн подтверждения (скорее всего, `shell.ts`). Решите: есть ли у `ToolInvocation` метод `shouldConfirmExecute()` или подобный?

Если ДА: используйте его для подтверждения установки.
Если НЕТ: используйте запасной вариант v0 (stderr + инструмент `ask_user_question`, если он доступен, иначе выбросьте определённый код ошибки, который модель может повторно выполнить после предоставления пользователем доступа).

Задокументируйте свой выбор в комментарии в начале `bootstrap.ts`.

- [ ] **Шаг 2: Напишите падающий тест**

Создайте `packages/core/src/tools/computer-use/bootstrap.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap, type BootstrapDeps } from './bootstrap.js';

function makeFakeClient(opts: { startThrows?: Error } = {}) {
  const start = vi.fn(async () => {
    if (opts.startThrows) throw opts.startThrows;
  });
  return {
    isStarted: vi.fn(() => start.mock.calls.length > 0),
    start,
    callTool: vi.fn(),
    stop: vi.fn(),
  };
}

describe('runBootstrap', () => {
  let tmpHome: string;
  let deps: BootstrapDeps;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'qwen-cu-bs-'));
    deps = {
      homeDir: tmpHome,
      packageSpec: 'open-computer-use@^0.3.0',
      platform: 'darwin',
      promptInstallApproval: vi.fn(async () => true),
      spawnDoctor: vi.fn(),
      probePermissions: vi.fn(async () => 'ok' as const),
    };
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('starts the client when binary is approved + permissions ok', async () => {
    // Pre-seed install state to skip the prompt
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(client.start).toHaveBeenCalledOnce();
    expect(deps.promptInstallApproval).not.toHaveBeenCalled();
  });

  it('prompts for install approval on first call', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.promptInstallApproval).toHaveBeenCalledOnce();
    expect(client.start).toHaveBeenCalledOnce();
  });

  it('throws when user declines install', async () => {
    deps.promptInstallApproval = vi.fn(async () => false);
    const client = makeFakeClient();

    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/declined/i);
    expect(client.start).not.toHaveBeenCalled();
  });

  it('persists approval on success', async () => {
    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    const { loadInstallState } = await import('./install-state.js');
    const state = await loadInstallState(tmpHome);
    expect(state?.approvedPackageSpec).toBe('open-computer-use@^0.3.0');
  });

  it('spawns doctor and polls when permissions are missing', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    let probeCount = 0;
    deps.probePermissions = vi.fn(async () => {
      probeCount++;
      return probeCount < 3 ? 'accessibility' : 'ok';
    });
    deps.pollIntervalMs = 1; // speed up test
    deps.pollTimeoutMs = 1000;

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).toHaveBeenCalledOnce();
    expect(probeCount).toBeGreaterThanOrEqual(3);
  });

  it('throws after pollTimeoutMs when permissions never grant', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });

    deps.probePermissions = vi.fn(async () => 'accessibility' as const);
    deps.pollIntervalMs = 1;
    deps.pollTimeoutMs = 50;

    const client = makeFakeClient();
    await expect(
      runBootstrap(
        client as never,
        { signal: new AbortController().signal },
        deps,
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('skips permission flow on non-darwin platforms', async () => {
    const { saveInstallState } = await import('./install-state.js');
    await saveInstallState(tmpHome, {
      approvedPackageSpec: 'open-computer-use@^0.3.0',
      approvedAtIso: '2026-05-28T10:00:00Z',
    });
    deps.platform = 'linux';

    const client = makeFakeClient();
    await runBootstrap(
      client as never,
      { signal: new AbortController().signal },
      deps,
    );

    expect(deps.spawnDoctor).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 3: Запустите тест, чтобы убедиться, что он падает**

Запустите: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Ожидается: FAIL — много ошибок

- [ ] **Шаг 4: Реализуйте конечный автомат**

Замените `packages/core/src/tools/computer-use/bootstrap.ts` на:

```ts
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Computer Use bootstrap state machine.
 *
 * On first invocation of any computer_use__* tool:
 *   1. If not yet approved: prompt the user to install (one-time).
 *   2. Start the client (lazy npx spawn, may take ~60s first time).
 *   3. On macOS only: probe permissions by calling get_app_state on
 *      Finder. If a permission error surfaces, spawn the upstream
 *      doctor (which opens the system settings + onboarding window),
 *      then poll until permissions grant or 10 min timeout.
 *
 * IMPLEMENTER: pre-step 1 (Task 10 step 1) — verify whether
 * qwen-code's BaseDeclarativeTool exposes a `shouldConfirmExecute()`
 * pathway from inside `execute()`. If not, `promptInstallApproval`
 * defaults to a `process.stderr.write` + readline fallback. The
 * dependency-injection design here keeps that decision swappable
 * without touching the state machine logic.
 */

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import type { ComputerUseClient } from './client.js';
import { isPackageSpecApproved, saveInstallState } from './install-state.js';
import {
  detectPermissionError,
  type PermissionErrorKind,
} from './permission-detector.js';

export interface BootstrapContext {
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

/** Result of a permission probe. */
export type PermissionProbeResult = 'ok' | PermissionErrorKind;

export interface BootstrapDeps {
  homeDir: string;
  packageSpec: string;
  platform: NodeJS.Platform;
  /**
   * Prompt the user to approve installing the upstream binary. Returns
   * true if approved. Implementation may use the qwen-code confirm
   * tool path or a stdin fallback.
   */
  promptInstallApproval: (packageSpec: string) => Promise<boolean>;
  /**
   * Spawn `open-computer-use doctor` (detached). The binary handles
   * opening the system settings window itself.
   */
  spawnDoctor: () => void;
  /**
   * Probe the upstream MCP server for permission state by issuing a
   * lightweight tool call. Returns 'ok' on success or the kind of
   * permission error on failure.
   */
  probePermissions: (
    client: ComputerUseClient,
  ) => Promise<PermissionProbeResult>;
  /** Poll interval for the permission watcher. Default 2000ms. */
  pollIntervalMs?: number;
  /** Total poll timeout. Default 10 min. */
  pollTimeoutMs?: number;
}

/** Production defaults — instantiated lazily so tests can override per call. */
function defaultDeps(): BootstrapDeps {
  return {
    homeDir: homedir(),
    packageSpec:
      process.env['QWEN_COMPUTER_USE_PACKAGE'] ?? 'open-computer-use@latest',
    platform: process.platform,
    promptInstallApproval: async (spec) => {
      // v0 fallback: stderr prompt + stdin read. Replace with
      // qwen-code's standard confirm pathway when wired in.
      process.stderr.write(
        `\n[Computer Use] First-time install\n` +
          `  Package: ${spec}\n` +
          `  This will fetch ~50MB from the npm registry the first time.\n` +
          `  Computer Use can click, type, and read your desktop apps.\n` +
          `  On macOS you'll be guided through Accessibility and Screen Recording permissions next.\n` +
          `Proceed? [y/N] `,
      );
      // IMPLEMENTER: in real interactive sessions, replace with the
      // qwen-code confirm system. For headless / SDK contexts the
      // default is to refuse — explicit user opt-in required.
      return process.env['QWEN_COMPUTER_USE_AUTO_APPROVE'] === '1';
    },
    spawnDoctor: () => {
      const child = spawn('npx', ['-y', defaultDeps().packageSpec, 'doctor'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    },
    probePermissions: async (client) => {
      // Use Finder as a known-running, always-installed macOS app.
      // get_app_state hits AccessibilitySnapshot which is the first
      // path that throws permissionDenied.
      const result = await client.callTool('get_app_state', { app: 'Finder' });
      return detectPermissionError(result) === 'none'
        ? 'ok'
        : detectPermissionError(result);
    },
  };
}

export async function runBootstrap(
  client: ComputerUseClient,
  ctx: BootstrapContext,
  depsOverride?: Partial<BootstrapDeps>,
): Promise<void> {
  const deps: BootstrapDeps = { ...defaultDeps(), ...depsOverride };
  const pollIntervalMs = deps.pollIntervalMs ?? 2000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000;

  // Step 1: install approval gate.
  const approved = await isPackageSpecApproved(deps.homeDir, deps.packageSpec);
  if (!approved) {
    ctx.updateOutput?.('Computer Use needs to be installed (first use).');
    const ok = await deps.promptInstallApproval(deps.packageSpec);
    if (!ok) {
      throw new Error(
        `Computer Use install declined by user. Re-invoke the tool to be prompted again.`,
      );
    }
    await saveInstallState(deps.homeDir, {
      approvedPackageSpec: deps.packageSpec,
      approvedAtIso: new Date().toISOString(),
    });
  }

  // Step 2: spawn (idempotent).
  if (!client.isStarted()) {
    ctx.updateOutput?.('Starting Computer Use...');
    await client.start();
  }

  // Step 3: macOS permission probe + guide.
  if (deps.platform !== 'darwin') return;

  const probe = await deps.probePermissions(client);
  if (probe === 'ok' || probe === 'other') {
    // 'other' means an error happened that isn't permission-related.
    // We don't block bootstrap on that — let the actual tool call surface it.
    return;
  }

  ctx.updateOutput?.(
    `Computer Use needs macOS permissions (${probe}). ` +
      `An onboarding window will open — please grant Accessibility and Screen Recording, then this will continue automatically.`,
  );
  deps.spawnDoctor();

  const startedAt = Date.now();
  for (;;) {
    if (ctx.signal.aborted) {
      throw new Error('Computer Use bootstrap aborted.');
    }
    if (Date.now() - startedAt > pollTimeoutMs) {
      throw new Error(
        `Computer Use permission grant timed out after ${Math.round(pollTimeoutMs / 1000)}s. Re-invoke the tool to retry.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const next = await deps.probePermissions(client);
    if (next === 'ok' || next === 'other') return;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    ctx.updateOutput?.(`Waiting for permissions... (${elapsedSec}s)`);
  }
}
```
- [ ] **Шаг 5: Запустить тест для проверки, что он проходит**

Выполнить: `npm test -- packages/core/src/tools/computer-use/bootstrap.test.ts`
Ожидается: PASS, 7 тестов.

- [ ] **Шаг 6: Закоммитить**

```bash
git add packages/core/src/tools/computer-use/bootstrap.ts packages/core/src/tools/computer-use/bootstrap.test.ts
git commit -m "feat(computer-use): bootstrap state machine (install + permissions)"
```

---

### Задача 11: Подключить реальный `promptInstallApproval` к системе подтверждения qwen-code

**Файлы:**

- Изменить: `packages/core/src/tools/computer-use/bootstrap.ts`
- Возможно: `packages/core/src/tools/computer-use/tool.ts`

Это задача с наиболее переменными границами. **ИСПОЛНИТЕЛЬ**: прочитайте результат исследования из шага 1 задачи 10 и подключите соответствующим образом. Два сценария:

**Сценарий A** — `BaseToolInvocation` поддерживает `shouldConfirmExecute()`:

- Переопределите `shouldConfirmExecute()` в `ComputerUseInvocation`, чтобы возвращать полезную нагрузку запроса на подтверждение установки, когда пакет еще не одобрен.
- Фреймворк отобразит UI подтверждения; после одобрения `execute()` продолжит выполнение.
- `bootstrap.ts` тогда обрабатывает только путь после подтверждения (запись состояния, запуск, проверка разрешений).

**Сценарий B** — нет пути подтверждения внутри выполнения:

- Оставьте версию v0 через stderr+stdin из задачи 10. Явно задокументируйте в README и SKILL.md.
- Создайте задачу-продолжение для добавления правильного пути подтверждения (отдельный PR).

- [ ] **Шаг 1: Реализовать выбранный сценарий**

(Конкретный код зависит от исследования; детали передаются разработчику.)

- [ ] **Шаг 2: Ручное smoke-тестирование**

Удалить состояние установки:

```bash
rm -rf ~/.qwen/computer-use
```

Запустите qwen-code и задайте вопрос, связанный с computer-use. Убедитесь, что запрос на установку отображается в выбранном UI (диалог подтверждения или stderr), и что его одобрение корректно сохраняет состояние.

- [ ] **Шаг 3: Закоммитить**

```bash
git add -A
git commit -m "feat(computer-use): wire install approval to qwen-code confirm UX"
```

---

### Задача 12: Ручное smoke-тестирование — сквозной первый запуск

Это не связанный с кодом шлюз.

- [ ] **Шаг 1: Очистить кэши**

```bash
rm -rf ~/.qwen/computer-use
rm -rf ~/.npm/_npx
# macOS: отозвать разрешения
# Системные настройки → Конфиденциальность и безопасность → Специальные возможности / Запись экрана
# удалить "Open Computer Use.app"
```

- [ ] **Шаг 2: Собрать и запустить**

```bash
npm run build
# запустите qwen-code, задайте вопрос по computer-use
```

- [ ] **Шаг 3: Проверить полный поток**

Ожидаемая последовательность:

1. Появляется запрос на установку.
2. После подтверждения прогресс загрузки транслируется через `updateOutput`.
3. Появляется предупреждение о разрешениях, открывается окно доктора.
4. После предоставления разрешений в Системных настройках вызов инструмента автоматически возобновляется.
5. Результат возвращается.

Если какой-либо шаг завершится с ошибкой, зафиксируйте ошибку и остановитесь. Итерация.

- [ ] **Шаг 4: Без коммита; это шлюз**

---

## Фаза 4 — Инструментарий / Сопровождение

### Задача 13: Скрипт синхронизации схем

**Файлы:**

- Создать: `scripts/sync-computer-use-schemas.ts`

Выполняется как часть подготовки релиза qwen-code. Запускает `npx -y open-computer-use@<pin> mcp`, вызывает `tools/list`, перегенерирует `schemas.ts`.

- [ ] **Шаг 1: Создать скрипт**

Создать `scripts/sync-computer-use-schemas.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Regenerate packages/core/src/tools/computer-use/schemas.ts from a
 * live upstream open-computer-use MCP server.
 *
 * Usage:
 *   npx tsx scripts/sync-computer-use-schemas.ts [packageSpec]
 *
 * Defaults packageSpec to `open-computer-use@latest`. The pin written
 * into the generated file is whatever spec was used — pass an explicit
 * pin (e.g. `open-computer-use@0.3.5`) for release builds.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const packageSpec = process.argv[2] ?? 'open-computer-use@latest';

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  });
  const client = new Client(
    { name: 'qwen-code-schema-sync', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  const result = await client.listTools();
  await client.close();

  if (result.tools.length !== 9) {
    process.stderr.write(
      `WARNING: upstream returned ${result.tools.length} tools, expected 9. Continuing anyway.\n`,
    );
  }

  const schemas: Record<
    string,
    { description: string; parameterSchema: unknown }
  > = {};
  for (const tool of result.tools) {
    schemas[tool.name] = {
      description: tool.description ?? '',
      parameterSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    };
  }

  const out = `/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded schemas for the upstream open-computer-use tools.
 *
 * Pinned to upstream: ${packageSpec}
 * Regenerated by scripts/sync-computer-use-schemas.ts — do not hand-edit.
 */

export interface ComputerUseToolSchema {
  description: string;
  parameterSchema: Record<string, unknown>;
}

export const COMPUTER_USE_TOOL_NAMES = ${JSON.stringify(
    result.tools.map((t) => t.name),
    null,
    2,
  )} as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];

export const COMPUTER_USE_SCHEMAS: Record<ComputerUseToolName, ComputerUseToolSchema> = ${JSON.stringify(
    schemas,
    null,
    2,
  )};
`;

  const target = resolve('packages/core/src/tools/computer-use/schemas.ts');
  await writeFile(target, out, 'utf8');
  process.stdout.write(`Wrote ${result.tools.length} schemas to ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`Schema sync failed: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Шаг 2: Запустить один раз вручную для проверки**

```bash
npx tsx scripts/sync-computer-use-schemas.ts open-computer-use@latest
```

Ожидается: `schemas.ts` перезаписан; `npm test -- packages/core/src/tools/computer-use/schemas.test.ts` по-прежнему проходит (или не проходит только на тестах, которые проверяли конкретное содержимое, написанное вручную — скорректируйте эти тесты, если описания в апстриме изменились).

- [ ] **Шаг 3: Закоммитить**

```bash
git add scripts/sync-computer-use-schemas.ts packages/core/src/tools/computer-use/schemas.ts
git commit -m "chore(computer-use): script to sync schemas from upstream"
```

---

## Чеклист самопроверки (после написания всех задач)

- [ ] Каждый шаг содержит либо блок кода, либо точную команду, либо чётко делегируемую заметку ИСПОЛНИТЕЛЮ с обоснованием.
- [ ] Все 9 названий инструментов последовательно используют префикс `computer_use__` в схемах, обёртке инструмента и регистрации.
- [ ] Никакие ссылки на MCP / mcp__/ DiscoveredMCPTool не просачиваются в строки, видимые пользователю.
- [ ] Конечный автомат bootstrap имеет явные тайм-ауты (никаких бесконечных опросов).
- [ ] `enableComputerUse` по умолчанию `true` в соответствии с решением пользователя.
- [ ] Тесты покрывают: целостность схем, префиксы имён, отложенное выполнение, жизненный цикл клиента, сохранение состояния установки, обнаружение разрешений, все переходы конечного автомата bootstrap.
- [ ] Ручные smoke-шлюзы (Задача 7, Задача 12) явные — нет скрытых утверждений «это работает».

---

## Вне рамок (отложено в последующие PR)

- Тайм-аут простоя для процесса MCP-сервера (экономия ресурсов; v0 держит его живым до выхода из qwen-code).
- Телеметрия на ошибках bootstrap (отказ сети vs Gatekeeper vs тайм-аут разрешений).
- Путь установки в офлайн / поддержка кэшированных tarball.
- Проверка возможности перед показом (сейчас отказ проявляется в момент первого вызова).
- Upstream PR для типизированного `errorKind` для `permissionDenied` (отложено пользователем).
- Перезапуск MCP-сервера после предоставления разрешения (пользователь хочет сначала протестировать на реальном примере, чтобы решить, нужно ли).
- Детальное управление разрешениями для каждого инструмента (например, разрешить только чтение `list_apps` / `get_app_state` без подтверждения каждого вызова).

---

## Передача на выполнение

План сохранён в `docs/superpowers/plans/2026-05-28-computer-use-built-in.md`.

Два варианта выполнения:

1. **Управляемый суб-агентом (рекомендуется)** — создавать нового суб-агента для каждой задачи, двухэтапное ревью между задачами, быстрая итерация.
2. **Выполнение в текущем сеансе** — выполнять задачи в этом сеансе с контрольными точками для ревью.

Какой подход?