# 开始使用 Qwen Code 扩展

本指南将带你创建第一个 Qwen Code 扩展。你将学习如何设置新扩展、通过 MCP 服务器添加自定义工具、创建自定义命令，以及使用 `QWEN.md` 文件为模型提供上下文。

## 先决条件

开始之前，请确保你已安装 Qwen Code，并对 Node.js 和 TypeScript 有基本了解。

## 步骤 1：创建新扩展

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

这是你的扩展的清单文件。它告诉 Qwen Code 如何加载和使用你的扩展。

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
- `mcpServers`：此部分定义了一个或多个模型上下文协议（MCP）服务器。MCP 服务器是你为模型添加新工具的方式。
  - `command`、`args`、`cwd`：这些字段指定了如何启动你的服务器。注意使用了 `${extensionPath}` 变量，Qwen Code 会将其替换为你的扩展安装目录的绝对路径。这使得你的扩展无论安装在何处都能正常工作。

### `example.ts`

该文件包含你的 MCP 服务器的源代码。这是一个简单的 Node.js 服务器，使用了 `@modelcontextprotocol/sdk`。

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

// ...（为简洁起见，提示注册部分已省略）

const transport = new StdioServerTransport();
await server.connect(transport);
```

此服务器定义了一个名为 `fetch_posts` 的工具，用于从公共 API 获取数据。

### `package.json` 和 `tsconfig.json`

这些是 TypeScript 项目的标准配置文件。`package.json` 文件定义了依赖项和 `build` 脚本，而 `tsconfig.json` 配置了 TypeScript 编译器。

## 步骤 3：构建并链接你的扩展

在使用该扩展之前，你需要编译 TypeScript 代码，并将扩展链接到你的 Qwen Code 安装目录以进行本地开发。

1.  **安装依赖项：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务端代码：**

    ```bash
    npm run build
    ```

    这会将 `example.ts` 编译为 `dist/example.js`，该文件在你的 `qwen-extension.json` 中被引用。

3.  **链接扩展：**

    `link` 命令会在 Qwen Code 的扩展目录与你的开发目录之间创建一个符号链接。这意味着你所做的任何更改都会立即生效，而无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，重启你的 Qwen Code 会话。新的 `fetch_posts` 工具将会可用。你可以通过提问“fetch posts”来测试它。

## 步骤 4：添加自定义命令

自定义命令提供了一种为复杂提示创建快捷方式的方法。让我们添加一个在代码中搜索模式的命令。

1.  创建 `commands` 目录以及命令组的子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建一个名为 `commands/fs/grep-code.toml` 的文件：

    ```toml
    prompt = """
    请总结模式 `{{args}}` 的查找结果。

    搜索结果：
    !{grep -r {{args}} .}
    """

    ```

    此命令 `/fs:grep-code` 将接受一个参数，使用该参数运行 `grep` shell 命令，并将结果传入提示中进行总结。

保存文件后，重新启动 Qwen Code。现在你可以运行 `/fs:grep-code "some pattern"` 来使用你的新命令。

## 步骤 5：添加自定义 `QWEN.md`

你可以通过在扩展中添加一个 `QWEN.md` 文件来为模型提供持久的上下文。这对于指导模型如何行为，或提供有关扩展工具的信息非常有用。请注意，对于仅暴露命令和提示的扩展，你可能并不总是需要这个文件。

1. 在扩展目录的根目录下创建一个名为 `QWEN.md` 的文件：

    ```markdown
    # 我的第一个扩展说明

    你是一位专家级开发者助手。当用户要求你获取文章时，请使用 `fetch_posts` 工具。回答请简洁明了。
    ```

2. 更新你的 `qwen-extension.json` 文件，告诉 CLI 加载该文件：

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

再次重启 CLI。现在，在扩展激活的每个会话中，模型都将拥有来自你的 `QWEN.md` 文件的上下文。

## 步骤 6：发布你的扩展

当你对扩展满意后，就可以与他人分享。发布扩展的两种主要方式是通过 Git 仓库或 GitHub Releases。使用公共 Git 仓库是最简单的方法。

有关这两种方法的详细说明，请参阅[扩展发布指南](extension-releasing.md)。

## 结论

你已成功创建了一个 Qwen Code 扩展！你学会了如何：

- 从模板引导新扩展。
- 使用 MCP 服务器添加自定义工具。
- 创建便捷的自定义命令。
- 为模型提供持久上下文。
- 链接扩展以进行本地开发。

接下来，你可以探索更多高级功能，并将强大的新能力构建到 Qwen Code 中。