# LSP 支持

Qwen Code 提供原生语言服务器协议 (LSP) 支持，启用高级代码智能功能，如跳转到定义、查找引用、诊断和代码操作。此集成使 AI 代理能够更深入地理解您的代码并提供更准确的帮助。

## 概述

Qwen Code 中的 LSP 支持通过连接到理解您代码的语言服务器来工作。当您使用 TypeScript、Python、Go 或其他受支持的语言时，Qwen Code 可以自动启动适当的语言服务器并使用它来：

- 导航到符号定义
- 查找符号的所有引用
- 获取悬停信息（文档、类型信息）
- 查看诊断消息（错误、警告）
- 访问代码操作（快速修复、重构）
- 分析调用层次结构

## 快速开始

LSP 是 Qwen Code 中的一个实验性功能。要启用它，请使用 `--experimental-lsp` 命令行标志：

```bash
qwen --experimental-lsp
```

对于大多数常见语言，如果相应的语言服务器已安装在你的系统上，Qwen Code 将自动检测并启动适当的语言服务器。

### 先决条件

你需要安装所用编程语言的语言服务器：

| 语言                  | 语言服务器                 | 安装命令                                                             |
| --------------------- | -------------------------- | -------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`               |
| Python                | pylsp                      | `pip install python-lsp-server`                                      |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                         |
| Rust                  | rust-analyzer              | [安装指南](https://rust-analyzer.github.io/manual.html#installation) |

## 配置

### .lsp.json 文件

你可以使用项目根目录中的 `.lsp.json` 文件来配置语言服务器。这使用了 [Claude Code 插件 LSP 配置参考](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中描述的按语言键控的格式。

**基本格式：**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### 配置选项

#### 必填字段

| 选项                  | 类型   | 描述                                    |
| --------------------- | ------ | --------------------------------------- |
| `command`             | string | 启动 LSP 服务器的命令（必须在 PATH 中） |
| `extensionToLanguage` | object | 将文件扩展名映射到语言标识符            |

#### 可选字段

| 选项                    | 类型     | 默认值    | 描述                                                   |
| ----------------------- | -------- | --------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`      | 命令行参数                                             |
| `transport`             | string   | `"stdio"` | 传输类型：`stdio` 或 `socket`                          |
| `env`                   | object   | -         | 环境变量                                               |
| `initializationOptions` | object   | -         | LSP 初始化选项                                         |
| `settings`              | object   | -         | 通过 `workspace/didChangeConfiguration` 设置服务器配置 |
| `workspaceFolder`       | string   | -         | 覆盖工作区文件夹                                       |
| `startupTimeout`        | number   | `10000`   | 启动超时时间（毫秒）                                   |
| `shutdownTimeout`       | number   | `5000`    | 关闭超时时间（毫秒）                                   |
| `restartOnCrash`        | boolean  | `false`   | 崩溃时自动重启                                         |
| `maxRestarts`           | number   | `3`       | 最大重启尝试次数                                       |
| `trustRequired`         | boolean  | `true`    | 需要受信任的工作区                                     |

### TCP/Socket 传输

对于使用 TCP 或 Unix socket 传输的服务器：

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## 可用的 LSP 操作

Qwen Code 通过统一的 `lsp` 工具暴露 LSP 功能。以下是可用的操作：

### 代码导航

#### 跳转到定义

查找符号定义的位置。

```
操作: goToDefinition
参数:
  - filePath: 文件路径
  - line: 行号（从1开始）
  - character: 列号（从1开始）
```

#### 查找引用

查找符号的所有引用。

```
操作: findReferences
参数:
  - filePath: 文件路径
  - line: 行号（从1开始）
  - character: 列号（从1开始）
  - includeDeclaration: 包含声明本身（可选）
```

#### 跳转到实现

查找接口或抽象方法的实现。

```
操作：goToImplementation
参数：
  - filePath：文件路径
  - line：行号（从1开始）
  - character：列号（从1开始）
```

### 符号信息

#### 悬停

获取符号的文档和类型信息。

```
操作：hover
参数：
  - filePath：文件路径
  - line：行号（从1开始）
  - character：列号（从1开始）
```

#### 文档符号

获取文档中的所有符号。

```
操作：documentSymbol
参数：
  - filePath：文件路径
```

#### 工作区符号搜索

在工作区中搜索符号。

```
操作：workspaceSymbol
参数：
  - query：搜索查询字符串
  - limit：最大结果数（可选）
```

### 调用层次结构

#### 准备调用层次结构

获取指定位置的调用层次结构项。

```
操作：prepareCallHierarchy
参数：
  - filePath：文件路径
  - line：行号（从1开始）
  - character：列号（从1开始）
```

#### 入站调用

查找所有调用给定函数的函数。

```
操作：incomingCalls
参数：
  - callHierarchyItem：来自 prepareCallHierarchy 的项
```

#### 出站调用

查找给定函数调用的所有函数。

```
操作：outgoingCalls
参数：
  - callHierarchyItem：来自 prepareCallHierarchy 的项
```

### 诊断

#### 文件诊断

获取文件的诊断消息（错误、警告）。

```
操作：diagnostics
参数：
  - filePath：文件路径
```

#### 工作区诊断

获取整个工作区的所有诊断消息。

```
操作：workspaceDiagnostics
参数：
  - limit：最大结果数（可选）
```

### 代码操作

#### 获取代码操作

获取指定位置可用的代码操作（快速修复、重构）。

```
操作：codeActions
参数：
  - filePath: 文件路径
  - line: 起始行号（从1开始）
  - character: 起始列号（从1开始）
  - endLine: 结束行号（可选，默认为line）
  - endCharacter: 结束列号（可选，默认为character）
  - diagnostics: 需要获取操作的诊断信息（可选）
  - codeActionKinds: 按操作类型过滤（可选）
```

代码操作类型：

- `quickfix` - 错误/警告的快速修复
- `refactor` - 重构操作
- `refactor.extract` - 提取为函数/变量
- `refactor.inline` - 内联函数/变量
- `source` - 源代码操作
- `source.organizeImports` - 整理导入
- `source.fixAll` - 修复所有可自动修复的问题

## 安全性

默认情况下，LSP 服务器仅在受信任的工作区中启动。这是因为语言服务器以您的用户权限运行并可以执行代码。

### 信任控制

- **受信任的工作区**: LSP 服务器自动启动
- **不受信任的工作区**: LSP 服务器不会启动，除非在服务器配置中设置了 `trustRequired: false`

要将工作区标记为受信任，请使用 `/trust` 命令或在设置中配置受信任的文件夹。

### 每个服务器的信任覆盖

你可以在特定服务器的配置中覆盖信任要求：

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## 故障排除

### 服务器未启动

1. **检查服务器是否已安装**：手动运行命令以验证
2. **检查 PATH**：确保服务器二进制文件在系统 PATH 中
3. **检查工作区信任**：工作区必须被信任才能使用 LSP
4. **检查日志**：查看控制台输出中的错误消息
5. **验证 --experimental-lsp 标志**：确保在启动 Qwen Code 时使用了该标志

### 性能缓慢

1. **大型项目**：考虑排除 `node_modules` 和其他大型目录
2. **服务器超时**：在服务器配置中增加 `startupTimeout` 以应对慢速服务器

### 无结果

1. **服务器未就绪**：服务器可能仍在索引中
2. **文件未保存**：保存文件以便服务器获取更改
3. **语言错误**：检查是否有正确的服务器为你的语言运行

### 调试

启用调试日志以查看 LSP 通信：

```bash
DEBUG=lsp* qwen --experimental-lsp
```

或者查看 `packages/cli/LSP_DEBUGGING_GUIDE.md` 中的 LSP 调试指南。

## Claude Code 兼容性

Qwen Code 支持 Claude Code 风格的 `.lsp.json` 配置文件，采用 [Claude Code 插件参考文档](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中定义的语言键格式。如果你正在从 Claude Code 迁移，请在配置中使用语言作为键的布局。

### 配置格式

推荐的格式遵循 Claude Code 的规范：

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

Claude Code LSP 插件也可以在 `plugin.json`（或引用的 `.lsp.json`）中提供 `lspServers`。当扩展启用时，Qwen Code 会加载这些配置，它们必须使用相同的语言键格式。

## 最佳实践

1. **全局安装语言服务器**：这确保它们在所有项目中都可用
2. **使用项目特定设置**：通过 `.lsp.json` 根据需要为每个项目配置服务器选项
3. **保持服务器更新**：定期更新语言服务器以获得最佳效果
4. **谨慎信任**：只信任来自可信来源的工作区

## 常见问题

### 问：如何启用 LSP？

启动 Qwen Code 时使用 `--experimental-lsp` 标志：

```bash
qwen --experimental-lsp
```

### 问：如何知道哪些语言服务器正在运行？

使用 `/lsp status` 命令查看所有已配置和正在运行的语言服务器。

### 问：我可以对同一文件类型使用多个语言服务器吗？

可以，但每次操作只会使用其中一个。第一个返回结果的服务器获胜。

### 问：LSP 在沙盒模式下工作吗？

LSP 服务器在沙盒外部运行以访问您的代码。它们受工作区信任控制的约束。
