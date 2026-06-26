# Начало работы с расширениями Qwen Code

В этом руководстве вы создадите своё первое расширение для Qwen Code. Вы узнаете, как настроить новое расширение, добавить пользовательский инструмент через MCP-сервер, создать пользовательскую команду и предоставить контекст модели с помощью файла `QWEN.md`.

## Предварительные требования

Перед началом убедитесь, что у вас установлен Qwen Code и есть базовое понимание Node.js и TypeScript.

## Шаг 1: Создание нового расширения

Самый простой способ начать — использовать один из встроенных шаблонов. В качестве основы возьмём пример `mcp-server`.

Выполните следующую команду, чтобы создать новую директорию `my-first-extension` с файлами шаблона:

```bash
qwen extensions new my-first-extension mcp-server
```

Будет создана новая директория со следующей структурой:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Шаг 2: Понимание файлов расширения

Рассмотрим ключевые файлы вашего нового расширения.

### `qwen-extension.json`

Это манифест расширения. Он сообщает Qwen Code, как загружать и использовать ваше расширение.

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

- `name`: уникальное имя расширения.
- `version`: версия расширения.
- `mcpServers`: эта секция определяет один или несколько серверов по протоколу Model Context Protocol (MCP). MCP-серверы — это способ добавления новых инструментов для модели.
  - `command`, `args`, `cwd`: эти поля указывают, как запустить сервер. Обратите внимание на использование переменной `${extensionPath}`, которую Qwen Code заменяет абсолютным путём к директории установки расширения. Это позволяет расширению работать независимо от места установки.

### `example.ts`

Этот файл содержит исходный код MCP-сервера. Это простой сервер на Node.js, использующий `@modelcontextprotocol/sdk`.

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

### `package.json` и `tsconfig.json`

Это стандартные конфигурационные файлы для TypeScript-проекта. Файл `package.json` определяет зависимости и скрипт `build`, а `tsconfig.json` настраивает компилятор TypeScript.

## Шаг 3: Сборка и привязка расширения

Прежде чем использовать расширение, нужно скомпилировать TypeScript-код и привязать расширение к вашей установке Qwen Code для локальной разработки.

1.  **Установка зависимостей:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Сборка сервера:**

    ```bash
    npm run build
    ```

    Это скомпилирует `example.ts` в `dist/example.js` — файл, на который ссылается ваш `qwen-extension.json`.

3.  **Привязка расширения:**

    Команда `link` создаёт символическую ссылку из директории расширений Qwen Code в вашу директорию разработки. Это означает, что любые изменения будут отображаться сразу, без переустановки.

    ```bash
    qwen extensions link .
    ```

Теперь перезапустите сессию Qwen Code. Новый инструмент `fetch_posts` станет доступен. Вы можете проверить его, спросив: "fetch posts".

## Шаг 4: Добавление пользовательской команды

Пользовательские команды позволяют создавать сокращения для сложных промптов. Давайте добавим команду для поиска шаблона в вашем коде.

1.  Создайте директорию `commands` и поддиректорию для группы команд:

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

    Эта команда `/fs:grep-code` будет принимать аргумент, выполнять с ним shell-команду `grep` и передавать результаты в промпт для обобщения.

> **Примечание:** Команды используют формат Markdown с опциональным YAML-фронтматером. Формат TOML устарел, но всё ещё поддерживается для обратной совместимости.

После сохранения файла перезапустите Qwen Code. Теперь вы можете выполнить `/fs:grep-code "some pattern"`, чтобы использовать новую команду.

## Шаг 5: Добавление пользовательских навыков и субагентов (опционально)

Расширения также могут предоставлять пользовательские навыки и субагенты для расширения возможностей Qwen Code.

### Добавление пользовательского навыка

Навыки — это возможности, вызываемые моделью: ИИ может автоматически использовать их, когда это уместно.

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

### Добавление пользовательского субагента

Субагенты — это специализированные AI-ассистенты для конкретных задач.

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

После перезапуска Qwen Code ваши пользовательские навыки станут доступны через `/skills`, а субагенты — через `/agents manage`.

## Шаг 6: Добавление пользовательского `QWEN.md`

Вы можете предоставить модели постоянный контекст, добавив файл `QWEN.md` в своё расширение. Это полезно для инструкций модели о том, как себя вести, или информации об инструментах расширения. Обратите внимание, что это может не всегда требоваться для расширений, предназначенных для команд и промптов.

1.  Создайте файл с именем `QWEN.md` в корне директории расширения:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  Обновите `qwen-extension.json`, чтобы сообщить CLI о загрузке этого файла:

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

Снова перезапустите CLI. Теперь модель будет иметь контекст из вашего файла `QWEN.md` в каждой сессии, где расширение активно.

## Шаг 7: Публикация расширения

Когда расширение готово, вы можете поделиться им с другими. Два основных способа публикации расширений — через Git-репозиторий или через выпуски GitHub. Использование публичного Git-репозитория — самый простой метод.

Подробные инструкции по обоим методам приведены в [Руководстве по публикации расширений](extension-releasing.md).

## Заключение

Вы успешно создали расширение для Qwen Code! Вы узнали, как:

- Создавать новое расширение из шаблона.
- Добавлять пользовательские инструменты с помощью MCP-сервера.
- Создавать удобные пользовательские команды.
- Добавлять пользовательские навыки и субагенты.
- Предоставлять модели постоянный контекст.
- Привязывать расширение для локальной разработки.

Отсюда вы можете изучать более продвинутые возможности и создавать мощные новые функции для Qwen Code.