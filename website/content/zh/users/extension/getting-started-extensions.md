# Qwen Code 扩展入门

本指南将引导你创建第一个 Qwen Code 扩展。你将学习如何设置一个新扩展、通过 MCP 服务器添加自定义工具、创建自定义命令，以及使用 `QWEN.md` 文件为模型提供上下文。

## 前提条件

开始之前，请确保已安装 Qwen Code，并对 Node.js 和 TypeScript 有基本了解。

## 第一步：创建新扩展

最简单的方法是使用内置模板之一。我们将以 `mcp-server` 示例作为基础。

运行以下命令，创建一个名为 `my-first-extension` 的新目录，其中包含模板文件：

```bash
qwen extensions new my-first-extension mcp-server
```

这将创建一个包含以下结构的新目录：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## 第二步：了解扩展文件

让我们来看看新扩展中的关键文件。

### `qwen-extension.json`

这是扩展的清单文件，它告诉 Qwen Code 如何加载和使用你的扩展。

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
- `mcpServers`：此部分定义一个或多个模型上下文协议（MCP）服务器。MCP 服务器是你为模型添加新工具的方式。
  - `command`、`args`、`cwd`：这些字段指定如何启动你的服务器。注意其中使用了 `${extensionPath}` 变量，Qwen Code 会将其替换为扩展安装目录的绝对路径。这样无论扩展安装在何处，都能正常运行。

### `example.ts`

此文件包含 MCP 服务器的源代码。它是一个简单的 Node.js 服务器，使用了 `@modelcontextprotocol/sdk`。

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

// ... (为简洁起见，省略了 prompt 注册)

const transport = new StdioServerTransport();
await server.connect(transport);
```

该服务器定义了一个名为 `fetch_posts` 的工具，用于从公共 API 获取数据。

### `package.json` 和 `tsconfig.json`

这些是 TypeScript 项目的标准配置文件。`package.json` 文件定义了依赖项和 `build` 脚本，`tsconfig.json` 则配置 TypeScript 编译器。

## 第三步：构建并链接你的扩展

在使用扩展之前，需要编译 TypeScript 代码，并将扩展链接到你的 Qwen Code 安装目录以进行本地开发。

1.  **安装依赖：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务器：**

    ```bash
    npm run build
    ```

    这将把 `example.ts` 编译为 `dist/example.js`，即 `qwen-extension.json` 中引用的文件。

3.  **链接扩展：**

    `link` 命令会在 Qwen Code 的扩展目录和你的开发目录之间创建一个符号链接。这意味着你进行的任何更改都会立即生效，无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，重启你的 Qwen Code 会话。新的 `fetch_posts` 工具将可用。你可以通过询问"fetch posts"来测试它。

## 第四步：添加自定义命令

自定义命令提供了一种为复杂提示创建快捷方式的方法。让我们添加一个用于在代码中搜索模式的命令。

1.  创建一个 `commands` 目录以及一个命令组子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建一个名为 `commands/fs/grep-code.md` 的文件：

    ```markdown
    ---
    description: 在代码中搜索模式并总结结果
    ---

    请总结模式 `{{args}}` 的查找结果。

    搜索结果：
    !{grep -r {{args}} .}
    ```

    这个命令 `/fs:grep-code` 将接收一个参数，运行 `grep` shell 命令，并将结果输入到提示中进行总结。

> **注意：** 命令使用 Markdown 格式，并带有可选的 YAML 前置元数据。TOML 格式已弃用，但为了向后兼容仍然支持。

保存文件后，重启 Qwen Code。你现在可以运行 `/fs:grep-code "some pattern"` 来使用你的新命令。

## 第五步：添加自定义技能和子代理（可选）

扩展还可以提供自定义技能和子代理，以扩展 Qwen Code 的能力。

### 添加自定义技能

技能是模型调用的能力，AI 可以在相关时自动使用它们。

1.  创建一个 `skills` 目录和一个技能子目录：

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  创建一个 `skills/code-analyzer/SKILL.md` 文件：

    ```markdown
    ---
    name: code-analyzer
    description: 分析代码结构，提供关于复杂度、依赖关系和潜在改进的见解
    ---

    # Code Analyzer

    ## 指令

    分析代码时，重点关注：

    - 代码复杂度和可维护性
    - 依赖关系和耦合度
    - 潜在的性能问题
    - 改进建议

    ## 示例

    - "分析此函数的复杂度"
    - "此模块有哪些依赖项？"
    ```

### 添加自定义子代理

子代理是用于特定任务的专门 AI 助手。

1.  创建一个 `agents` 目录：

    ```bash
    mkdir -p agents
    ```

2.  创建一个 `agents/refactoring-expert.md` 文件：

    ```markdown
    ---
    name: refactoring-expert
    description: 专注于代码重构，改善代码结构和可维护性
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    你是一位专注于提升代码质量的重构专家。

    你的专长包括：

    - 识别代码坏味道和反模式
    - 应用 SOLID 原则
    - 提高代码可读性和可维护性
    - 最小化风险的安全重构

    对于每个重构任务：

    1. 分析当前代码结构
    2. 识别需要改进的区域
    3. 提出重构步骤
    4. 逐步实施更改
    5. 验证功能是否保留
    ```

重启 Qwen Code 后，你的自定义技能将通过 `/skills` 使用，子代理通过 `/agents manage` 使用。

## 第六步：添加自定义 `QWEN.md`

你可以通过向扩展添加 `QWEN.md` 文件来为模型提供持久化的上下文。这对于告诉模型如何行为或提供扩展工具的信息非常有用。请注意，对于仅用于暴露命令和提示的扩展，你可能并不总是需要这个。

1.  在扩展目录的根目录下创建一个名为 `QWEN.md` 的文件：

    ```markdown
    # 我的第一个扩展指令

    你是一位专家级开发者助手。当用户要求你获取帖子时，请使用 `fetch_posts` 工具。回答要简洁。
    ```

2.  更新你的 `qwen-extension.json`，告诉 CLI 加载此文件：

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

再次重启 CLI。在扩展处于活动状态的每个会话中，模型现在都将拥有来自 `QWEN.md` 文件的上下文。

## 第七步：发布你的扩展

对你的扩展满意后，可以与他人分享。发布扩展的两种主要方式是通过 Git 仓库或 GitHub Releases。使用公共 Git 仓库是最简单的方法。

有关两种方法的详细说明，请参阅[扩展发布指南](extension-releasing.md)。

## 总结

你已成功创建了一个 Qwen Code 扩展！你学会了如何：

- 从模板引导新扩展。
- 使用 MCP 服务器添加自定义工具。
- 创建方便的自定义命令。
- 添加自定义技能和子代理。
- 为模型提供持久化的上下文。
- 链接扩展以进行本地开发。

从这里开始，你可以探索更高级的功能，并为 Qwen Code 构建强大的新能力。