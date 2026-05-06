# План реализации отображения инструментов агента

> **Для Claude:** REQUIRED SUB-SKILL: Используйте superpowers:executing-plans для пошаговой реализации этого плана.

**Цель:** Добавить отдельный интерфейс отображения в VSCode/web UI для выполнения инструментов агента, чтобы прогресс, сводки и ошибки субагентов рендерились из структурированного `rawOutput`, а не использовали стандартную карточку инструмента.

**Архитектура:** Сохранить ACP `rawOutput` в пайплайне сессии/обновлений VSCode и передать его в `ToolCallData`, после чего позволить общему роутеру web UI обнаруживать полезные нагрузки `task_execution` и рендерить отдельный компонент `AgentToolCall`. Изменения должны оставаться общими в `packages/webui`, чтобы VSCode и `ChatViewer` оставались синхронизированными.

**Стек технологий:** TypeScript, React, Vitest, общие компоненты вызовов инструментов `@qwen-code/webui`.

### Задача 1: Фиксация ожидаемого падения тестов для потока данных

**Файлы:**

- Изменить: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Создать: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Шаг 1: Написание тестов, которые должны падать**

- Добавьте тест обработчика сессии, проверяющий, что `tool_call_update` передаёт `rawOutput`, когда ACP отправляет полезную нагрузку `task_execution`.
- Добавьте тест хука, проверяющий, что `useToolCalls` сохраняет и обновляет `rawOutput` для вызова инструмента агента.

**Шаг 2: Запуск тестов для проверки падения**

Запуск: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Ожидаемый результат: падение тестов, так как `rawOutput` не сохраняется в текущем пайплайне обработчика/хука.

### Задача 2: Фиксация ожидаемого падения тестов для рендерера

**Файлы:**

- Создать: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Шаг 1: Написание теста, который должен падать**

- Отрендерите маршрутизированный вызов инструмента с `kind: 'other'` и `rawOutput.type === 'task_execution'`.
- Проверьте, что описание задачи, активный дочерний инструмент, сводка и причина ошибки рендерятся через отдельный интерфейс агента, а не через стандартный текстовый вывод.

**Шаг 2: Запуск теста для проверки падения**

Запуск: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Ожидаемый результат: падение, так как роутер ориентируется только на `kind`, а отдельный компонент агента отсутствует.

### Задача 3: Сквозное сохранение структурированного вывода агента

**Файлы:**

- Изменить: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Изменить: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Изменить: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Изменить: `packages/webui/src/components/toolcalls/shared/types.ts`

**Шаг 1: Реализация минимальных изменений в модели данных**

- Добавьте опциональное поле `rawOutput` в типы вызовов инструментов для сессии/webview VSCode.
- Передавайте `rawOutput` в `QwenSessionUpdateHandler`.
- Сохраняйте/объединяйте `rawOutput` в `useToolCalls`.
- Экспортируйте `rawOutput` в общих типах данных вызовов инструментов web UI.

**Шаг 2: Запуск целевых тестов**

Запуск: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Ожидаемый результат: успешное прохождение.

### Задача 4: Добавление общего UI для вызовов инструментов агента

**Файлы:**

- Создать: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Изменить: `packages/webui/src/components/toolcalls/index.ts`
- Изменить: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Изменить: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Шаг 1: Реализация минимального рендерера**

- Добавьте guard для `rawOutput.type === 'task_execution'`.
- Отрендерите описание задачи в качестве заголовка.
- Отобразите имя и статус агента, текущие выполняемые дочерние инструменты, сводку завершения и причину ошибки/отмены.
- Сохраните совместимость макета с несколькими параллельными карточками агентов, рендеря каждый вызов инструмента независимо.

**Шаг 2: Запуск целевого теста рендерера**

Запуск: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Ожидаемый результат: успешное прохождение.

### Задача 5: Проверка интегрированного интерфейса

**Файлы:**

- Изменить: `packages/webui/src/index.ts`

**Шаг 1: Экспорт нового общего компонента (при необходимости)**

- Выполните реэкспорт любых новых компонентов/типов, необходимых для VSCode или `ChatViewer`.

**Шаг 2: Запуск проверки пакета**

Запуск: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Запуск: `npm run check-types --workspace=packages/vscode-ide-companion`
Запуск: `npm run typecheck --workspace=packages/webui`

Ожидаемый результат: успешное прохождение всех целевых тестов и проверок типов.