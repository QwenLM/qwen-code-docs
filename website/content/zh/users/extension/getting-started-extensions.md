# Qwen Code 扩展入门指南

本指南将带你逐步创建第一个 Qwen Code 扩展。你将学习如何初始化新扩展、通过 MCP 服务器添加自定义工具、创建自定义命令，以及使用 `QWEN.md` 文件为模型提供上下文。

## 前置条件

开始之前，请确保已安装 Qwen Code，并对 Node.js 和 TypeScript 有基本了解。

## 步骤 1：创建新扩展

最简单的入门方式是使用内置模板之一。我们将以 `mcp-server` 示例为基础。

运行以下命令，创建包含模板文件的新目录 `my-first-extension`：

```bash
qwen extensions new my-first-extension mcp-server
```

这将创建具有以下结构的新目录：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## 步骤 2：了解扩展文件

让我们来看看新扩展中的关键文件。

### `qwen-extension.json`

这是扩展的清单文件。它告诉 Qwen Code 如何加载和使用你的扩展。

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

- `name`：扩展的唯一名称。
- `version`：扩展的版本号。
- `mcpServers`：此部分定义一个或多个 Model Context Protocol (MCP) 服务器。通过 MCP 服务器，你可以为模型添加新工具。
  - `command`、`args`、`cwd`：这些字段指定如何启动服务器。注意 `${extensionPath}` 变量的使用，Qwen Code 会将其替换为扩展安装目录的绝对路径。这使得扩展无论在何处安装都能正常工作。

### `example.ts`

此文件包含 MCP 服务器的源代码。它是一个使用 `@modelcontextprotocol/sdk` 的简单 Node.js 服务器。

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

该服务器定义了一个名为 `fetch_posts` 的单一工具，用于从公共 API 获取数据。

### `package.json` 和 `tsconfig.json`

这些是 TypeScript 项目的标准配置文件。`package.json` 定义了依赖项和 `build` 脚本，`tsconfig.json` 用于配置 TypeScript 编译器。

## 步骤 3：构建并链接扩展

在使用扩展之前，你需要编译 TypeScript 代码，并将扩展链接到本地的 Qwen Code 安装目录以便开发。

1.  **安装依赖：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务器：**

    ```bash
    npm run build
    ```

    这会将 `example.ts` 编译为 `dist/example.js`，即 `qwen-extension.json` 中引用的文件。

3.  **链接扩展：**

    `link` 命令会在 Qwen Code 扩展目录和你的开发目录之间创建符号链接。这意味着你所做的任何更改都会立即生效，无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，重启你的 Qwen Code 会话。新的 `fetch_posts` 工具即可使用。你可以通过输入“fetch posts”来测试它。

## 步骤 4：添加自定义命令

自定义命令提供了一种为复杂提示词创建快捷方式的方法。让我们添加一个在代码中搜索特定模式的命令。

1.  创建 `commands` 目录及命令组的子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建名为 `commands/fs/grep-code.md` 的文件：

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    该命令 `/fs:grep-code` 将接收一个参数，使用它运行 `grep` shell 命令，并将结果传入提示词进行总结。

> **注意：** 命令使用 Markdown 格式，并支持可选的 YAML frontmatter。TOML 格式已弃用，但为保持向后兼容仍受支持。

保存文件后，重启 Qwen Code。你现在可以运行 `/fs:grep-code "some pattern"` 来使用新命令。

## 步骤 5：添加自定义 skill 和 subagent（可选）

扩展还可以提供自定义 skill 和 subagent，以扩展 Qwen Code 的功能。

### 添加自定义 skill

skill 是模型调用的功能，AI 会在相关场景下自动使用。

1.  创建 `skills` 目录及 skill 子目录：

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  创建 `skills/code-analyzer/SKILL.md` 文件：

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

### 添加自定义 subagent

subagent 是专注于特定任务的专用 AI 助手。

1.  创建 `agents` 目录：

    ```bash
    mkdir -p agents
    ```

2.  创建 `agents/refactoring-expert.md` 文件：

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

重启 Qwen Code 后，你的自定义 skill 将通过 `/skills` 可用，subagent 将通过 `/agents manage` 可用。

## 步骤 6：添加自定义 `QWEN.md`

你可以通过在扩展中添加 `QWEN.md` 文件为模型提供持久上下文。这对于向模型提供行为指令或扩展工具的相关信息非常有用。请注意，对于旨在暴露命令和提示词的扩展，你可能并不总是需要此文件。

1.  在扩展目录根目录下创建名为 `QWEN.md` 的文件：

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  更新 `qwen-extension.json` 以告知 CLI 加载此文件：

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

再次重启 CLI。现在，在扩展处于活动状态的每个会话中，模型都将拥有来自 `QWEN.md` 文件的上下文。

## 步骤 7：发布扩展

当你对扩展满意后，可以将其分享给他人。发布扩展的两种主要方式是通过 Git 仓库或 GitHub Releases。使用公共 Git 仓库是最简单的方法。

有关这两种方法的详细说明，请参阅[扩展发布指南](extension-releasing.md)。

## 总结

你已成功创建了一个 Qwen Code 扩展！你学习了如何：

- 从模板初始化新扩展。
- 通过 MCP 服务器添加自定义工具。
- 创建便捷的自定义命令。
- 添加自定义 skill 和 subagent。
- 为模型提供持久上下文。
- 链接扩展以进行本地开发。

接下来，你可以探索更多高级功能，并为 Qwen Code 构建强大的新能力。