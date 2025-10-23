# Qwen Code Extensions 入门指南

本指南将带你创建第一个 Qwen Code extension。你将学习如何设置一个新的 extension，通过 MCP server 添加自定义工具，创建自定义命令，以及使用 `QWEN.md` 文件为模型提供上下文。

## 前置要求

开始之前，请确保你已经安装了 Qwen Code，并且对 Node.js 和 TypeScript 有基本了解。

## 步骤 1：创建新的 Extension

最简单的开始方式是使用内置模板之一。我们将以 `mcp-server` 示例作为基础。

运行以下命令创建一个名为 `my-first-extension` 的新目录，并包含模板文件：

```bash
qwen extensions new my-first-extension mcp-server
```

这将创建一个具有以下结构的新目录：

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

这是你的扩展的 manifest 文件。它告诉 Qwen Code 如何加载和使用你的扩展。

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

- `name`：你的扩展的唯一名称。
- `version`：你的扩展的版本。
- `mcpServers`：这一部分定义了一个或多个 Model Context Protocol (MCP) 服务器。MCP 服务器是你为模型添加新工具的方式。
  - `command`、`args`、`cwd`：这些字段指定了如何启动你的服务器。注意这里使用了 `${extensionPath}` 变量，Qwen Code 会将其替换为你的扩展安装目录的绝对路径。这样无论你的扩展安装在哪里都可以正常工作。

### `example.ts`

这个文件包含了你的 MCP 服务器的源代码。它是一个简单的 Node.js 服务器，使用了 `@modelcontextprotocol/sdk`。

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

// 注册一个名为 'fetch_posts' 的新工具
server.registerTool(
  'fetch_posts',
  {
    description: '从公共 API 获取文章列表。',
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

// ...（为简洁起见省略了 prompt 注册部分）

const transport = new StdioServerTransport();
await server.connect(transport);
```

该服务器定义了一个名为 `fetch_posts` 的工具，用于从公共 API 获取数据。

### `package.json` 和 `tsconfig.json`

这些是 TypeScript 项目的标准配置文件。`package.json` 文件定义了依赖项和 `build` 脚本，而 `tsconfig.json` 则用于配置 TypeScript 编译器。

## 步骤 3：构建并链接你的 Extension

在使用 extension 之前，你需要先编译 TypeScript 代码，并将 extension 链接到你的 Qwen Code 安装目录中，以便进行本地开发。

1.  **安装依赖：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务端代码：**

    ```bash
    npm run build
    ```

    这会将 `example.ts` 编译为 `dist/example.js`，这个文件就是在 `qwen-extension.json` 中引用的文件。

3.  **链接 extension：**

    `link` 命令会在 Qwen Code 的 extensions 目录和你的开发目录之间创建一个符号链接。这意味着你所做的任何修改都会立即生效，无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，重启你的 Qwen Code 会话。新的 `fetch_posts` 工具就可用了。你可以通过提问 “fetch posts” 来测试它。

## 步骤 4：添加自定义命令

自定义命令提供了一种为复杂 prompt 创建快捷方式的方法。我们来添加一个在代码中搜索模式的命令。

1.  创建 `commands` 目录以及命令组的子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建名为 `commands/fs/grep-code.toml` 的文件：

    ```toml
    prompt = """
    请总结 `{{args}}` 模式的搜索结果。

    搜索结果：
    !{grep -r {{args}} .}
    """

    ```

    这个命令 `/fs:grep-code` 会接收一个参数，使用该参数运行 `grep` shell 命令，并将结果传入 prompt 进行总结。

保存文件后，重启 Qwen Code。现在你可以运行 `/fs:grep-code "some pattern"` 来使用你的新命令了。

## 步骤 5：添加自定义 `QWEN.md`

你可以通过在 extension 中添加一个 `QWEN.md` 文件来为模型提供持久化的上下文。这对于指导模型如何行为，或者提供有关你的 extension 工具的信息非常有用。注意，如果你的 extension 主要用于暴露 commands 和 prompts，可能并不总是需要这个文件。

1. 在你的 extension 目录根路径下创建一个名为 `QWEN.md` 的文件：

   ```markdown
   # My First Extension Instructions

   You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
   ```

2. 更新你的 `qwen-extension.json` 文件，告诉 CLI 加载这个文件：

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

再次重启 CLI。现在，在 extension 处于激活状态的每个 session 中，模型都将拥有来自你 `QWEN.md` 文件的上下文信息。

## Step 6: 发布你的 Extension

当你对你的 extension 感到满意时，就可以与他人分享了。发布 extension 的两种主要方式是通过 Git repository 或 GitHub Releases。使用公共 Git repository 是最简单的方法。

有关这两种方法的详细说明，请参阅 [Extension 发布指南](extension-releasing.md)。

## 结论

你已成功创建了一个 Qwen Code extension！你学会了如何：

- 从模板引导新的 extension。
- 使用 MCP server 添加自定义工具。
- 创建便捷的自定义命令。
- 为模型提供持久化上下文。
- 在本地开发中链接你的 extension。

接下来，你可以探索更多高级功能，并为 Qwen Code 构建强大的新能力。