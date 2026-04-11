# Language Server Protocol (LSP) 支持

Qwen Code 提供原生的 Language Server Protocol (LSP) 支持，可实现跳转到定义、查找引用、诊断信息和代码操作等高级代码智能功能。该集成使 AI 代理能够更深入地理解你的代码，并提供更精准的辅助。

## 概述

Qwen Code 中的 LSP 支持通过连接到理解你代码的语言服务器来实现。通过 `.lsp.json`（或扩展）配置服务器后，Qwen Code 即可启动它们并利用其实现以下功能：

- 跳转到符号定义
- 查找符号的所有引用
- 获取悬停信息（文档、类型信息）
- 查看诊断信息（错误、警告）
- 使用代码操作（快速修复、重构）
- 分析调用层级

## 快速开始

LSP 是 Qwen Code 中的一项实验性功能。要启用它，请使用 `--experimental-lsp` 命令行标志：

```bash
qwen --experimental-lsp
```

LSP 服务器由配置驱动。你必须在 `.lsp.json`（或通过扩展）中定义它们，Qwen Code 才会启动。

### 前置条件

你需要安装对应编程语言的语言服务器：

| 语言              | 语言服务器            | 安装命令                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [安装指南](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | 通过包管理器安装 LLVM/clangd                                   |
| Java                  | jdtls                      | 安装 JDTLS 和 JDK                                                        |

## 配置

### .lsp.json 文件

你可以在项目根目录使用 `.lsp.json` 文件配置语言服务器。该文件采用 [Claude Code 插件 LSP 配置参考](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中描述的以语言为键的格式。

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

### C/C++ (clangd) 配置

依赖项：

- 必须安装 clangd (LLVM) 并将其加入 PATH。
- 需要编译数据库（`compile_commands.json`）或 `compile_flags.txt` 以确保结果准确。

示例：

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Java (jdtls) 配置

依赖项：

- 已安装 JDK 并将其加入 PATH（`java`）。
- 已安装 JDTLS 并将其加入 PATH（`jdtls`）。

示例：

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### 配置选项

#### 必填字段

| 选项    | 类型   | 描述                                       |
| --------- | ------ | ------------------------------------------------- |
| `command` | string | 启动 LSP 服务器的命令（必须在 PATH 中） |

#### 可选字段

| 选项                  | 类型     | 默认值   | 描述                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | 命令行参数                                  |
| `transport`             | string   | `"stdio"` | 传输类型：`stdio`、`tcp` 或 `socket`             |
| `env`                   | object   | -         | 环境变量                                   |
| `initializationOptions` | object   | -         | LSP 初始化选项                              |
| `settings`              | object   | -         | 通过 `workspace/didChangeConfiguration` 传递的服务器设置  |
| `extensionToLanguage`   | object   | -         | 将文件扩展名映射到语言标识符            |
| `workspaceFolder`       | string   | -         | 覆盖工作区文件夹（必须在项目根目录内） |
| `startupTimeout`        | number   | `10000`   | 启动超时时间（毫秒）                         |
| `shutdownTimeout`       | number   | `5000`    | 关闭超时时间（毫秒）                        |
| `restartOnCrash`        | boolean  | `false`   | 崩溃时自动重启                                   |
| `maxRestarts`           | number   | `3`       | 最大重启尝试次数                                |
| `trustRequired`         | boolean  | `true`    | 要求工作区受信任                               |

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

查找符号的定义位置。

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 查找引用

查找符号的所有引用。

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### 跳转到实现

查找接口或抽象方法的实现。

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### 符号信息

#### 悬停信息

获取符号的文档和类型信息。

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 文档符号

获取文档中的所有符号。

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### 工作区符号搜索

在整个工作区中搜索符号。

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### 调用层级

#### 准备调用层级

获取指定位置的调用层级项。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 传入调用

查找所有调用指定函数的函数。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### 传出调用

查找指定函数调用的所有函数。

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### 诊断信息

#### 文件诊断

获取文件的诊断信息（错误、警告）。

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### 工作区诊断

获取整个工作区的所有诊断信息。

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### 代码操作

#### 获取代码操作

获取指定位置可用的代码操作（快速修复、重构）。

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
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

默认情况下，LSP 服务器仅在受信任的工作区中启动。这是因为语言服务器以你的用户权限运行，并且可以执行代码。

### 信任控制

- **受信任的工作区**：如果已配置，LSP 服务器将启动
- **不受信任的工作区**：除非在服务器配置中设置 `trustRequired: false`，否则 LSP 服务器不会启动

要将工作区标记为受信任，请使用 `/trust` 命令或在设置中配置受信任的文件夹。

### 按服务器覆盖信任设置

你可以在配置中覆盖特定服务器的信任要求：

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

### 服务器无法启动

1. **检查服务器是否已安装**：手动运行命令进行验证
2. **检查 PATH**：确保服务器二进制文件位于系统 PATH 中
3. **检查工作区信任状态**：LSP 要求工作区受信任
4. **检查日志**：在控制台输出中查找错误信息
5. **验证 --experimental-lsp 标志**：确保启动 Qwen Code 时使用了该标志

### 性能缓慢

1. **大型项目**：考虑排除 `node_modules` 等大型目录
2. **服务器超时**：对于启动较慢的服务器，可在配置中增加 `startupTimeout`

### 无结果

1. **服务器未就绪**：服务器可能仍在建立索引
2. **文件未保存**：保存文件以便服务器获取更改
3. **语言不匹配**：检查是否为你的语言运行了正确的服务器

### 调试

启用调试日志以查看 LSP 通信：

```bash
DEBUG=lsp* qwen --experimental-lsp
```

或查看 `packages/cli/LSP_DEBUGGING_GUIDE.md` 中的 LSP 调试指南。

## Claude Code 兼容性

Qwen Code 支持 [Claude Code 插件参考](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中定义的以语言为键的 Claude Code 风格 `.lsp.json` 配置文件。如果你正在从 Claude Code 迁移，请在配置中使用以语言为键的布局。

### 配置格式

推荐格式遵循 Claude Code 的规范：

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

Claude Code LSP 插件也可以在 `plugin.json`（或引用的 `.lsp.json`）中提供 `lspServers`。启用扩展时，Qwen Code 会加载这些配置，且它们必须使用相同的以语言为键的格式。

## 最佳实践

1. **全局安装语言服务器**：确保它们在所有项目中均可用
2. **使用项目特定设置**：需要时通过 `.lsp.json` 为每个项目配置服务器选项
3. **保持服务器更新**：定期更新语言服务器以获得最佳效果
4. **谨慎授权信任**：仅信任来自可靠来源的工作区

## 常见问题 (FAQ)

### Q：如何启用 LSP？

启动 Qwen Code 时使用 `--experimental-lsp` 标志：

```bash
qwen --experimental-lsp
```

### Q：如何查看正在运行哪些语言服务器？

使用 `/lsp status` 命令查看所有已配置和正在运行的语言服务器。

### Q：我可以为同一种文件类型使用多个语言服务器吗？

可以，但每个操作只会使用其中一个。最先返回结果的服务器将胜出。

### Q：LSP 在沙盒模式下是否有效？

LSP 服务器在沙盒外部运行以访问你的代码。它们受工作区信任控制机制的约束。