# 开始使用 Qwen Code 扩展

本指南将引导您创建第一个 Qwen Code 扩展。您将学习如何搭建一个新的扩展、通过 MCP 服务器添加自定义工具、创建自定义命令，以及通过 `QWEN.md` 文件为模型提供上下文。

## 前提条件

开始之前，请确保已安装 Qwen Code，并具备 Node.js 和 TypeScript 的基本知识。

## 步骤 1：创建新扩展

最简单的方式是使用内置模板之一。我们将以 `mcp-server` 示例作为基础。

运行以下命令，创建一个名为 `my-first-extension` 的新目录，并填充模板文件：

```bash
qwen extensions new my-first-extension mcp-server
```

这将创建一个包含如下结构的新目录：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## 第二步：了解扩展文件

我们来查看新扩展中的关键文件。

### `qwen-extension.json`

这是扩展的清单文件，用于告知 Qwen Code 如何加载和使用你的扩展。

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
- `mcpServers`：该部分定义一个或多个模型上下文协议（MCP）服务器。MCP 服务器是你为模型添加新工具的方式。  
  - `command`、`args`、`cwd`：这些字段指定如何启动你的服务器。注意 `${extensionPath}` 变量的用法——Qwen Code 会将其替换为扩展安装目录的绝对路径，从而确保扩展在任意安装位置均可正常运行。

### `example.ts`

该文件包含你的 MCP 服务器的源代码。它是一个简单的 Node.js 服务器，使用了 `@modelcontextprotocol/sdk`。

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
    description: '从公开 API 获取帖子列表。',
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

// ...（为简洁起见，省略 prompt 注册部分）

const transport = new StdioServerTransport();
await server.connect(transport);
```

该服务器定义了一个名为 `fetch_posts` 的工具，用于从公开 API 获取数据。

### `package.json` 和 `tsconfig.json`

这两个是 TypeScript 项目的标准配置文件。`package.json` 文件定义了项目依赖和 `build` 脚本，而 `tsconfig.json` 则用于配置 TypeScript 编译器。

## 第三步：构建并链接你的扩展

在使用该扩展之前，你需要先编译 TypeScript 代码，并将扩展链接到本地的 Qwen Code 安装目录以进行开发。

1.  **安装依赖项：**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **构建服务器：**

    ```bash
    npm run build
    ```

    此命令会将 `example.ts` 编译为 `dist/example.js`，该文件即为 `qwen-extension.json` 中所引用的文件。

3.  **链接扩展：**

    `link` 命令会在 Qwen Code 的扩展目录与你的开发目录之间创建一个符号链接。这意味着你所做的任何修改都会立即生效，无需重新安装。

    ```bash
    qwen extensions link .
    ```

现在，请重启你的 Qwen Code 会话。新的 `fetch_posts` 工具即可使用。你可以通过提问“获取帖子”来测试它。

## 第 4 步：添加自定义命令

自定义命令可为复杂提示创建快捷方式。下面我们来添加一个在代码中搜索指定模式的命令。

1.  创建 `commands` 目录及用于存放命令组的子目录：

    ```bash
    mkdir -p commands/fs
    ```

2.  创建文件 `commands/fs/grep-code.md`：

    ```markdown
    ---
    description: 在代码中搜索指定模式并汇总结果
    ---

    请汇总模式 `{{args}}` 的搜索结果。

    搜索结果：
    !{grep -r {{args}} .}
    ```

    此命令 `/fs:grep-code` 将接收一个参数，使用该参数执行 `grep` shell 命令，并将结果传递给模型以生成摘要。

> **注意：** 命令采用 Markdown 格式，可选 YAML 前置元数据（frontmatter）。TOML 格式已弃用，但为向后兼容仍受支持。

保存该文件后，请重启 Qwen Code。现在你就可以运行 `/fs:grep-code "某个模式"` 来使用这个新命令了。

## 第 5 步：添加自定义技能和子智能体（可选）

扩展还可以提供自定义技能和子智能体，以增强 Qwen Code 的能力。

### 添加自定义技能

技能是模型可调用的功能，AI 在相关场景下可自动使用这些功能。

1.  创建一个 `skills` 目录及其中的技能子目录：

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  创建 `skills/code-analyzer/SKILL.md` 文件：

    ```markdown
    ---
    name: code-analyzer
    description: 分析代码结构，并提供关于复杂度、依赖关系及潜在改进点的洞察
    ---

    # 代码分析器

    ## 使用说明

    分析代码时，请重点关注以下方面：

    - 代码复杂度与可维护性
    - 依赖关系与耦合程度
    - 潜在的性能问题
    - 改进建议

    ## 示例

    - “分析此函数的复杂度”
    - “该模块有哪些依赖？”
    ```

### 添加自定义子智能体

子智能体是针对特定任务的专业化 AI 助手。

1.  创建 `agents` 目录：

    ```bash
    mkdir -p agents
    ```

2.  创建 `agents/refactoring-expert.md` 文件：

    ```markdown
    ---
    name: refactoring-expert
    description: 专注于代码重构，提升代码结构与可维护性
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    你是一位专注于提升代码质量的重构专家。

    你的专长包括：

    - 识别代码坏味道和反模式
    - 应用 SOLID 原则
    - 提升代码可读性与可维护性
    - 在最小风险前提下安全地进行重构

    对于每个重构任务，请执行以下步骤：

    1. 分析当前代码结构
    2. 识别待改进之处
    3. 提出重构方案
    4. 增量式实施变更
    5. 验证功能保持不变
    ```

重启 Qwen Code 后，你的自定义技能将可通过 `/skills` 访问，子智能体则可通过 `/agents manage` 管理。

## 第六步：添加自定义的 `QWEN.md`

你可以通过在扩展目录中添加一个 `QWEN.md` 文件，为模型提供持久化的上下文。这有助于向模型说明其行为规范，或提供有关你扩展所含工具的信息。注意：对于仅用于暴露命令和提示词的扩展，你并不总是需要此文件。

1.  在扩展目录的根目录下创建一个名为 `QWEN.md` 的文件：

    ```markdown
    # 我的第一个扩展指令

    你是一位经验丰富的开发助手。当用户要求获取文章时，请使用 `fetch_posts` 工具。请保持响应简洁。
    ```

2.  更新你的 `qwen-extension.json`，告知 CLI 加载该文件：

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

再次重启 CLI。现在，只要该扩展处于激活状态，模型在每次会话中都将拥有 `QWEN.md` 文件所提供的上下文。

## 第 7 步：发布你的扩展

当你对自己的扩展满意后，就可以将其分享给其他人了。发布扩展主要有两种方式：通过 Git 仓库或通过 GitHub Releases。使用公开的 Git 仓库是最简单的方法。

有关这两种方法的详细说明，请参阅[扩展发布指南](extension-releasing.md)。

## 总结

你已成功创建了一个 Qwen Code 扩展！你学会了如何：

- 基于模板快速搭建一个新的扩展。
- 通过 MCP 服务器添加自定义工具。
- 创建便捷的自定义命令。
- 添加自定义技能和子智能体。
- 向模型提供持久化上下文。
- 为本地开发链接你的扩展。

接下来，你可以探索更多高级功能，并为 Qwen Code 构建更强大的新能力。