# Начало работы с расширениями Qwen Code

В этом руководстве мы пошагово разберём создание вашего первого расширения для Qwen Code. Вы узнаете, как настроить новое расширение, добавить пользовательский инструмент через MCP-сервер, создать пользовательскую команду и передать модели контекст с помощью файла `QWEN.md`.

## Предварительные требования

Перед началом убедитесь, что у вас установлен Qwen Code и есть базовое понимание Node.js и TypeScript.

## Шаг 1: Создание нового расширения

Самый простой способ начать — использовать один из встроенных шаблонов. В качестве основы мы возьмём пример `mcp-server`.

Выполните следующую команду, чтобы создать новую директорию `my-first-extension` с файлами шаблона:

```bash
qwen extensions new my-first-extension mcp-server
```

Это создаст новую директорию со следующей структурой:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Шаг 2: Разбор файлов расширения

Рассмотрим ключевые файлы вашего нового расширения.

### `qwen-extension.json`

Это файл манифеста вашего расширения. Он указывает Qwen Code, как загружать и использовать расширение.

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name`: Уникальное имя вашего расширения.
- `version`: Версия вашего расширения.
- `mcpServers`: В этом разделе определяется один или несколько серверов Model Context Protocol (MCP). Через MCP-серверы вы можете добавлять новые инструменты для использования моделью.
  - `command`, `args`, `cwd`: Эти поля указывают, как запускать ваш сервер. Обратите внимание на использование переменной `${extensionPath}`, которую Qwen Code заменяет на абсолютный путь к директории установки расширения. Это позволяет расширению работать независимо от места его установки.

### `example.ts`

Этот файл содержит исходный код вашего MCP-сервера. Это простой сервер на Node.js, использующий `@modelcontextprotocol/sdk`.

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// Registers a new tool named 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Этот сервер определяет один инструмент с именем `fetch_posts`, который получает данные из публичного API.

### `package.json` and `tsconfig.json`

Это стандартные конфигурационные файлы для TypeScript-проекта. Файл `package.json` определяет зависимости и скрипт `build`, а `tsconfig.json` настраивает компилятор TypeScript.

## Шаг 3: Сборка и линковка расширения

Прежде чем использовать расширение, необходимо скомпилировать TypeScript-код и линковать расширение с вашей локальной установкой Qwen Code для разработки.

1.  **Установите зависимости:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Соберите сервер:**

    ```bash
    npm run build
    ```

    Это скомпилирует `example.ts` в `dist/example.js`, который указан в вашем `qwen-extension.json`.

3.  **Линкуйте расширение:**

    Команда `link` создаёт символическую ссылку из директории расширений Qwen Code на вашу рабочую директорию. Это означает, что все изменения будут применяться сразу, без необходимости переустановки.

    ```bash
    qwen extensions link .
    ```

Теперь перезапустите сессию Qwen Code. Новый инструмент `fetch_posts` станет доступен. Вы можете протестировать его, запросив: "fetch posts".

## Шаг 4: Добавление пользовательской команды

Пользовательские команды позволяют создавать ярлыки для сложных промптов. Давайте добавим команду для поиска паттерна в вашем коде.

1.  Создайте директорию `commands` и поддиректорию для вашей группы команд:

    ```bash
    mkdir -p commands/fs
    ```

2.  Создайте файл `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    Эта команда, `/fs:grep-code`, примет аргумент, выполнит с ним shell-команду `grep` и передаст результаты в промпт для суммаризации.

> **Примечание:** Команды используют формат Markdown с опциональным YAML frontmatter. Формат TOML устарел, но всё ещё поддерживается для обратной совместимости.

После сохранения файла перезапустите Qwen Code. Теперь вы можете запустить `/fs:grep-code "some pattern"`, чтобы использовать новую команду.

## Шаг 5: Добавление пользовательских skills и subagents (опционально)

Расширения также могут предоставлять пользовательские `skills` и `subagents` для расширения возможностей Qwen Code.

### Добавление пользовательского skill

`Skills` — это возможности, которые модель вызывает автоматически при необходимости.

1.  Создайте директорию `skills` с поддиректорией для навыка:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Создайте файл `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### Добавление пользовательского subagent

`Subagents` — это специализированные ИИ-ассистенты для конкретных задач.

1.  Создайте директорию `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Создайте файл `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

После перезапуска Qwen Code ваши пользовательские `skills` станут доступны через `/skills`, а `subagents` — через `/agents manage`.

## Шаг 6: Добавление пользовательского `QWEN.md`

Вы можете передать модели постоянный контекст, добавив файл `QWEN.md` в ваше расширение. Это полезно для указания модели инструкций по поведению или информации об инструментах вашего расширения. Обратите внимание, что для расширений, созданных только для предоставления команд и промптов, это может не потребоваться.

1.  Создайте файл `QWEN.md` в корне директории вашего расширения:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  Обновите ваш `qwen-extension.json`, чтобы указать CLI загружать этот файл:

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

Снова перезапустите CLI. Теперь модель будет получать контекст из вашего файла `QWEN.md` в каждой сессии, где активно расширение.

## Шаг 7: Публикация расширения

Когда расширение будет готово, вы сможете поделиться им с другими. Основные способы публикации — через Git-репозиторий или GitHub Releases. Использование публичного Git-репозитория — самый простой метод.

Подробные инструкции по обоим методам см. в [Руководстве по публикации расширений](extension-releasing.md).

## Заключение

Вы успешно создали расширение для Qwen Code! Вы узнали, как:

- Инициализировать новое расширение из шаблона.
- Добавлять пользовательские инструменты через MCP-сервер.
- Создавать удобные пользовательские команды.
- Добавлять пользовательские `skills` и `subagents`.
- Передавать модели постоянный контекст.
- Линковать расширение для локальной разработки.

Далее вы можете изучить более продвинутые функции и встроить мощные новые возможности в Qwen Code.