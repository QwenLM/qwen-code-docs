# План реализации отображения инструментов агента

> **Для Claude:** ОБЯЗАТЕЛЬНЫЙ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: используйте superpowers:executing-plans для поэтапной реализации этого плана.

**Цель:** Добавить выделенное отображение выполнения инструментов агента в VSCode/веб-интерфейсе, чтобы прогресс подзадач, сводки и ошибки отображались на основе структурированного `rawOutput` вместо использования универсальной карточки инструмента.

**Архитектура:** Сохранить ACP `rawOutput` через конвейер сессии/обновления VSCode в `ToolCallData`, затем позволить общему веб-интерфейсу маршрутизатора определять полезные нагрузки `task_execution` и отображать выделенный компонент `AgentToolCall`. Изменение должно быть общим в `packages/webui`, чтобы VSCode и `ChatViewer` оставались согласованными.

**Технологический стек:** TypeScript, React, Vitest, общие компоненты тул-коллов `@qwen-code/webui`.

### Задача 1: Зафиксировать ошибочное поведение потока данных

**Файлы:**

- Изменить: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.test.ts`
- Создать: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.test.tsx`

**Шаг 1: Написать падающие тесты**

- Добавить в тест обработчика сессии утверждение, что `tool_call_update` передаёт `rawOutput`, когда ACP отправляет полезную нагрузку `task_execution`.
- Добавить в тест хука утверждение, что `useToolCalls` сохраняет и обновляет `rawOutput` для вызова инструмента агента.

**Шаг 2: Запустить тесты и убедиться, что они падают**

Запустить: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Ожидается: ошибки, потому что `rawOutput` не сохраняется в текущем конвейере обработчика/хука.

### Задача 2: Зафиксировать ошибочное поведение рендеринга

**Файлы:**

- Создать: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

**Шаг 1: Написать падающий тест**

- Отрендерить маршрутизированный вызов инструмента с `kind: 'other'` и `rawOutput.type === 'task_execution'`.
- Утвердить, что описание задачи, активный дочерний инструмент, сводка и причина ошибки отображаются в выделенном интерфейсе агента, а не в общем текстовом выводе.

**Шаг 2: Запустить тест и убедиться, что он падает**

Запустить: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Ожидается: ошибка, потому что маршрутизатор работает только по `kind` и не существует выделенного компонента агента.

### Задача 3: Сохранять структурированный вывод агента сквозным образом

**Файлы:**

- Изменить: `packages/vscode-ide-companion/src/types/chatTypes.ts`
- Изменить: `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts`
- Изменить: `packages/vscode-ide-companion/src/webview/hooks/useToolCalls.ts`
- Изменить: `packages/webui/src/components/toolcalls/shared/types.ts`

**Шаг 1: Реализовать минимальные изменения модели данных**

- Добавить опциональное поле `rawOutput` в типы вызовов инструментов сессии VSCode и webview.
- Передавать `rawOutput` в `QwenSessionUpdateHandler`.
- Сохранять/объединять `rawOutput` в `useToolCalls`.
- Экспонировать `rawOutput` в общих типах данных вызовов инструментов веб-интерфейса.

**Шаг 2: Запустить целевые тесты**

Запустить: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx`

Ожидается: успешное выполнение.

### Задача 4: Добавить общий пользовательский интерфейс вызова инструмента агента

**Файлы:**

- Создать: `packages/webui/src/components/toolcalls/AgentToolCall.tsx`
- Изменить: `packages/webui/src/components/toolcalls/index.ts`
- Изменить: `packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.tsx`
- Изменить: `packages/webui/src/components/ChatViewer/ChatViewer.tsx`

**Шаг 1: Реализовать минимальный рендерер**

- Добавить проверку на `rawOutput.type === 'task_execution'`.
- Отображать описание задачи в заголовке.
- Показывать имя агента + статус, запущенные дочерние инструменты, сводку по завершению и причину ошибки/отмены.
- Обеспечить совместимость макета с несколькими параллельными карточками агентов, отображая каждый вызов инструмента независимо.

**Шаг 2: Запустить целевой тест рендерера**

Запустить: `npm test --workspace=packages/vscode-ide-companion -- --run packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`

Ожидается: успешное выполнение.

### Задача 5: Проверить интегрированную поверхность

**Файлы:**

- Изменить: `packages/webui/src/index.ts`

**Шаг 1: Экспортировать новый общий компонент при необходимости**

- Повторно экспортировать любые новые компоненты/типы, необходимые VSCode или `ChatViewer`.

**Шаг 2: Запустить проверку пакета**

Запустить: `npm test --workspace=packages/vscode-ide-companion -- --run qwenSessionUpdateHandler.test.ts useToolCalls.test.tsx packages/vscode-ide-companion/src/webview/components/messages/toolcalls/index.test.tsx`
Запустить: `npm run check-types --workspace=packages/vscode-ide-companion`
Запустить: `npm run typecheck --workspace=packages/webui`

Ожидается: все целевые тесты и проверки типов проходят успешно.