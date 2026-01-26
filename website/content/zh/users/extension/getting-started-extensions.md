# 开始使用 Qwen Code 扩展

本指南将引导你创建第一个 Qwen Code 扩展。你将学习如何设置新扩展，通过 MCP 服务器添加自定义工具，创建自定义命令，并通过 `QWEN.md` 文件为模型提供上下文。

## 先决条件

开始之前，请确保你已安装 Qwen Code 并具备 Node.js 和 TypeScript 的基础知识。

## 步骤 1：创建新扩展

最简单的开始方式是使用内置模板之一。我们将使用 `mcp-server` 示例作为基础。

运行以下命令来创建一个名为 `my-first-extension` 的新目录，其中包含模板文件：

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

这是你扩展的清单文件。它告诉 Qwen Code 如何加载和使用你的扩展。

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

- `name`：你扩展的唯一名称。
- `version`：你扩展的版本。
- `mcpServers`：此部分定义一个或多个模型上下文协议（MCP）服务器。MCP 服务器是你可以为模型添加新工具的方式。
  - `command`、`args`、`cwd`：这些字段指定如何启动你的服务器。注意使用了 `${extensionPath}` 变量，Qwen Code 会将其替换为你的扩展安装目录的绝对路径。这使得你的扩展无论安装在哪里都能正常工作。

### `example.ts`

此文件包含你的 MCP 服务器的源代码。这是一个简单的 Node.js 服务器，使用了 `@modelcontextprotocol/sdk`。

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
    description: '从公共 API 获取帖子列表。',
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

// ...（为简洁起见省略了 prompt 注册）

const transport = new StdioServerTransport();
await server.connect(transport);
```

该服务器定义了一个名为 `fetch_posts` 的单一工具，用于从公共 API 获取数据。

### `package.json` 和 `tsconfig.json`

这些是 TypeScript 项目的标准配置文件。`package.json` 文件定义了依赖项和 `build` 脚本，而 `tsconfig.json` 配置了 TypeScript 编译器。

## 步骤 3：构建并链接你的扩展

在使用扩展之前，你需要编译 TypeScript 代码并将扩展链接到你的 Qwen Code 安装目录以进行本地开发。

1.  **安装依赖项：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务器：**

    ```bash
    npm run build
    ```

    这将把 `example.ts` 编译成 `dist/example.js`，这是你在 `qwen-extension.json` 中引用的文件。

3.  **链接扩展：**

    `link` 命令会在 Qwen Code 扩展目录和你的开发目录之间创建一个符号链接。这意味着你所做的任何更改都会立即生效，无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，重启你的 Qwen Code 会话。新的 `fetch_posts` 工具将会可用。你可以通过询问："fetch posts" 来测试它。

## 步骤 4：添加自定义命令

自定义命令提供了一种为复杂提示创建快捷方式的方法。让我们添加一个在代码中搜索模式的命令。

1.  创建一个 `commands` 目录和一个用于存放命令组的子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建一个名为 `commands/fs/grep-code.md` 的文件：

    ```markdown
    ---
    description: 在代码中搜索模式并总结发现
    ---

    请总结模式 `{{args}}` 的发现结果。

    搜索结果：
    !{grep -r {{args}} .}
    ```

    这个命令 `/fs:grep-code` 将接受一个参数，用它运行 `grep` shell 命令，并将结果传递给提示进行总结。

> **注意：** 命令使用 Markdown 格式，可选 YAML frontmatter。TOML 格式已弃用但仍支持向后兼容。

保存文件后，重启 Qwen Code。现在你可以运行 `/fs:grep-code "some pattern"` 来使用你的新命令。

## 步骤 5：添加自定义技能和子代理（可选）

扩展还可以提供自定义技能和子代理，以扩展 Qwen Code 的功能。

### 添加自定义技能

技能是模型调用的功能，AI 在相关情况下可以自动使用。

1.  创建一个带有技能子目录的 `skills` 目录：

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  创建一个 `skills/code-analyzer/SKILL.md` 文件：

    ```markdown
    ---
    name: code-analyzer
    description: 分析代码结构并提供关于复杂性、依赖关系和潜在改进的见解
    ---

    # 代码分析器

    ## 指令

    分析代码时，请关注以下方面：

    - 代码复杂性和可维护性
    - 依赖关系和耦合度
    - 潜在的性能问题
    - 改进建议

    ## 示例

    - "分析此函数的复杂性"
    - "这个模块的依赖关系是什么？"
    ```

### 添加自定义子代理

子代理是针对特定任务的专业 AI 助手。

1.  创建一个 `agents` 目录：

    ```bash
    mkdir -p agents
    ```

2.  创建一个 `agents/refactoring-expert.md` 文件：

    ```markdown
    ---
    name: refactoring-expert
    description: 专门从事代码重构，改进代码结构和可维护性
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    你是一个专注于提高代码质量的重构专家。

    你的专业领域包括：

    - 识别代码异味和反模式
    - 应用 SOLID 原则
    - 提高代码的可读性和可维护性
    - 安全重构，风险最小化

    对于每个重构任务：

    1. 分析当前代码结构
    2. 识别需要改进的地方
    3. 提出重构步骤
    4. 渐进式实施更改
    5. 验证功能是否保持不变
    ```

重启 Qwen Code 后，你的自定义技能将通过 `/skills` 可用，子代理将通过 `/agents manage` 可用。

## 步骤 6：添加自定义的 `QWEN.md`

你可以通过在扩展中添加一个 `QWEN.md` 文件来为模型提供持久化的上下文。这对于向模型提供行为指导或关于你扩展工具的信息很有用。请注意，对于构建用于暴露命令和提示的扩展，你可能并不总是需要这个功能。

1.  在你的扩展目录根目录下创建一个名为 `QWEN.md` 的文件：

    ```markdown
    # 我的第一个扩展说明

    你是一个专家级开发助手。当用户要求获取文章时，使用 `fetch_posts` 工具。请在回复中保持简洁。
    ```

2.  更新你的 `qwen-extension.json` 来告诉 CLI 加载这个文件：

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

再次重启 CLI。现在模型在每个激活该扩展的会话中都会拥有来自你 `QWEN.md` 文件的上下文。

## 第七步：发布你的扩展

当你对自己的扩展满意后，你可以与他人分享。发布扩展的两种主要方式是通过 Git 仓库或 GitHub Releases。使用公共 Git 仓库是最简单的方法。

有关这两种方法的详细说明，请参阅[扩展发布指南](extension-releasing.md)。

## 总结

你已经成功创建了一个 Qwen Code 扩展！你学会了如何：

- 从模板引导创建新扩展。
- 使用 MCP 服务器添加自定义工具。
- 创建便捷的自定义命令。
- 添加自定义技能和子代理。
- 为模型提供持久化上下文。
- 链接你的扩展以进行本地开发。

从此，你可以探索更多高级功能，并在 Qwen Code 中构建强大的新功能。