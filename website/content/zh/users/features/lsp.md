# Language Server Protocol (LSP) 支持

Qwen Code 提供原生的 Language Server Protocol (LSP) 支持，可实现跳转定义、查找引用、诊断信息和代码操作等高级代码智能功能。该集成使 AI 代理能够更深入地理解你的代码，并提供更精准的辅助。

## 概述

Qwen Code 中的 LSP 支持通过连接到理解你代码的语言服务器来实现。通过 `.lsp.json`（或扩展）配置服务器后，Qwen Code 可以启动它们并利用它们来：

- 跳转到符号定义
- 查找符号的所有引用
- 获取悬停信息（文档、类型信息）
- 查看诊断消息（错误、警告）
- 访问代码操作（快速修复、重构）
- 分析调用层级

## 快速开始

LSP 是 Qwen Code 中的一项实验性功能。要启用它，请使用 `--experimental-lsp` 命令行标志：

```bash
qwen --experimental-lsp
```

LSP 服务器由配置驱动。你必须在 `.lsp.json`（或通过扩展）中定义它们，Qwen Code 才会启动它们。

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

你可以在项目根目录使用 `.lsp.json` 文件配置语言服务器。每个顶层键是语言标识符，其值为服务器配置对象。

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

- 必须安装 clangd (LLVM) 并将其添加到 PATH 中。
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

- 已安装 JDK 并将其添加到 PATH 中（`java`）。
- 已安装 JDTLS 并将其添加到 PATH 中（`jdtls`）。

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

| 选项    | 类型   | 描述                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | 启动 LSP 服务器的命令。支持通过 `PATH` 解析的纯命令名称（如 `clangd`）和绝对路径（如 `/opt/llvm/bin/clangd`） |

#### 可选字段

| 选项                  | 类型     | 默认值   | 描述                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | 命令行参数                                  |
| `transport`             | string   | `"stdio"` | 传输类型：`stdio`、`tcp` 或 `socket`             |
| `env`                   | object   | -         | 环境变量                                   |
| `initializationOptions` | object   | -         | LSP 初始化选项                              |
| `settings`              | object   | -         | 通过 `workspace/didChangeConfiguration` 设置的服务器配置  |
| `extensionToLanguage`   | object   | -         | 将文件扩展名映射到语言标识符            |
| `workspaceFolder`       | string   | -         | 覆盖工作区文件夹（必须位于项目根目录内） |
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

基于位置的操作（`goToDefinition`、`findReferences`、`hover`、`goToImplementation` 和 `prepareCallHierarchy`）需要精确的 `filePath` + `line` + `character` 位置。如果你不知道确切位置，请先使用 `workspaceSymbol` 或 `documentSymbol` 定位符号。

### 代码导航

#### 跳转定义

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

#### 跳转实现

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

获取文件的诊断消息（错误、警告）。

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### 工作区诊断

获取整个工作区的所有诊断消息。

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

要将工作区标记为受信任，请使用 `/trust` 命令。

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

## 故障排查

### 服务器未启动

1. **验证 `--experimental-lsp` 标志**：确保启动 Qwen Code 时使用了该标志
2. **检查服务器是否已安装**：手动运行命令（如 `clangd --version`）进行验证
3. **检查命令**：服务器二进制文件必须位于系统 `PATH` 中，或指定为绝对路径（如 `/opt/llvm/bin/clangd`）。会阻止跳出工作区的相对路径
4. **检查工作区信任状态**：LSP 要求工作区受信任（使用 `/trust`）
5. **检查日志**：在调试日志中查找 `[LSP]` 条目（见下方调试部分）
6. **检查进程**：运行 `ps aux | grep <server-name>` 验证服务器进程是否正在运行

### 性能缓慢

1. **大型项目**：考虑排除 `node_modules` 和其他大型目录
2. **服务器超时**：对于启动较慢的服务器，在配置中增加 `startupTimeout`

### 无结果

1. **服务器未就绪**：服务器可能仍在建立索引。对于使用 clangd 的 C/C++ 项目，确保 args 中包含 `--background-index`，且项目根目录或父目录中存在 `compile_commands.json`（或 `compile_flags.txt`）。如果位于构建子目录中，请使用 `--compile-commands-dir=<path>`
2. **文件未保存**：保存文件以便服务器获取更改
3. **语言不匹配**：检查是否为你的语言运行了正确的服务器
4. **检查进程**：运行 `ps aux | grep <server-name>` 验证服务器是否实际在运行

### 调试

LSP 调试日志会自动写入 `~/.qwen/debug/` 中的会话日志文件。要查看 LSP 相关条目：

```bash
# 查看最新的会话日志
grep '\[LSP\]' ~/.qwen/debug/latest

# 需要留意的常见错误消息：
#   "command path is unsafe"  → 相对路径跳出工作区，请使用绝对路径或添加到 PATH
#   "command not found"       → 服务器二进制文件未安装或不在 PATH 中
#   "requires trusted workspace" → 请先运行 /trust
```

你也可以验证服务器进程是否正在运行：

```bash
ps aux | grep clangd   # 或 typescript-language-server, jdtls 等
```

## 扩展 LSP 配置

扩展可以通过其 `plugin.json` 中的 `lspServers` 字段提供 LSP 服务器配置。这可以是内联对象，也可以是指向 `.lsp.json` 文件的路径。Qwen Code 会在启用扩展时加载这些配置。其格式与项目 `.lsp.json` 文件中使用的以语言为键的布局相同。

## 最佳实践

1. **全局安装语言服务器**：确保它们在所有项目中可用
2. **使用项目特定设置**：需要时通过 `.lsp.json` 为每个项目配置服务器选项
3. **保持服务器更新**：定期更新语言服务器以获得最佳效果
4. **谨慎设置信任**：仅信任来自可靠来源的工作区

## 常见问题

### Q：如何启用 LSP？

启动 Qwen Code 时使用 `--experimental-lsp` 标志：

```bash
qwen --experimental-lsp
```

### Q：如何知道哪些语言服务器正在运行？

检查调试日志中的 `[LSP]` 条目（`grep '\[LSP\]' ~/.qwen/debug/latest`），或直接使用 `ps aux | grep <server-name>` 验证进程。

### Q：我可以为同一种文件类型使用多个语言服务器吗？

可以，但每个操作只会使用其中一个。最先返回结果的服务器将胜出。

### Q：LSP 在沙盒模式下是否有效？

LSP 服务器在沙盒外部运行以访问你的代码。它们受工作区信任控制约束。