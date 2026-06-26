# 语言服务器协议 (LSP) 支持

Qwen Code 提供原生的语言服务器协议 (LSP) 支持，实现了诸如跳转到定义、查找引用、诊断和代码操作等高级代码智能功能。这一集成使 AI 代理能够更深入地理解您的代码，并提供更准确的帮助。

## 概览

Qwen Code 中的 LSP 支持通过连接到理解您代码的语言服务器来工作。一旦通过 `.lsp.json`（或扩展）配置好服务器，Qwen Code 就可以启动它们并利用它们来：

- 导航到符号定义
- 查找符号的所有引用
- 获取悬停信息（文档、类型信息）
- 查看诊断消息（错误、警告）
- 访问代码操作（快速修复、重构）
- 分析调用层级

## 快速入门

LSP 是 Qwen Code 的一项实验性功能。要启用它，请使用 `--experimental-lsp` 命令行标志：

```bash
qwen --experimental-lsp
```

LSP 服务器由配置驱动。您必须在 `.lsp.json`（或通过扩展）中定义它们，Qwen Code 才能启动它们。

### 前提条件

您需要安装适用于您编程语言的对应语言服务器：

| 语言                | 语言服务器                  | 安装命令                                                                       |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python              | pylsp                      | `pip install python-lsp-server`                                                |
| Go                  | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                | rust-analyzer              | [安装指南](https://rust-analyzer.github.io/manual.html#installation)           |
| C/C++               | clangd                     | 通过包管理器安装 LLVM/clangd                                                   |
| Java                | jdtls                      | 安装 JDTLS 和 JDK                                                              |

## 配置

### .lsp.json 文件

您可以使用项目根目录中的 `.lsp.json` 文件来配置语言服务器。每个顶级键是一个语言标识符，其值为服务器配置对象。

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

- 必须安装 clangd (LLVM) 并确保其在 PATH 中可用。
- 需要一个编译数据库（`compile_commands.json`）或 `compile_flags.txt` 才能获得准确的结果。

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

- 安装 JDK 并确保其在 PATH 中可用（`java`）。
- 安装 JDTLS 并确保其在 PATH 中可用（`jdtls`）。

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

| 选项      | 类型   | 描述                                                                                                                           |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `command` | string | 启动 LSP 服务器的命令。支持通过 `PATH` 解析的裸命令名（例如 `clangd`）和绝对路径（例如 `/opt/llvm/bin/clangd`）                 |

#### 可选字段

| 选项                    | 类型     | 默认值     | 描述                                                   |
| ----------------------- | -------- | ---------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`       | 命令行参数                                             |
| `transport`             | string   | `"stdio"`  | 传输类型：`stdio`、`tcp` 或 `socket`                   |
| `env`                   | object   | -          | 环境变量                                               |
| `initializationOptions` | object   | -          | LSP 初始化选项                                         |
| `settings`              | object   | -          | 通过 `workspace/didChangeConfiguration` 进行服务器设置 |
| `extensionToLanguage`   | object   | -          | 将文件扩展名映射到语言标识符                           |
| `workspaceFolder`       | string   | -          | 覆盖工作区文件夹（必须在项目根目录内）                 |
| `startupTimeout`        | number   | `10000`    | 启动超时时间（毫秒）                                   |
| `shutdownTimeout`       | number   | `5000`     | 关闭超时时间（毫秒）                                   |
| `restartOnCrash`        | boolean  | `false`    | 崩溃时自动重启                                         |
| `maxRestarts`           | number   | `3`        | 最大重启尝试次数                                       |
| `trustRequired`         | boolean  | `true`     | 需要可信工作区                                         |

### TCP/Socket 传输

对于使用 TCP 或 Unix 套接字传输的服务器：

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

基于位置的操作（`goToDefinition`、`findReferences`、`hover`、`goToImplementation` 和 `prepareCallHierarchy`）需要精确的 `filePath` + `line` + `character` 位置。如果您不知道精确位置，请先使用 `workspaceSymbol` 或 `documentSymbol` 来定位符号。

### 代码导航

#### 跳转到定义

查找符号定义的位置。

```
Operation: goToDefinition
Parameters:
  - filePath: 文件路径
  - line: 行号（从 1 开始）
  - character: 列号（从 1 开始）
```

#### 查找引用

查找符号的所有引用。

```
Operation: findReferences
Parameters:
  - filePath: 文件路径
  - line: 行号（从 1 开始）
  - character: 列号（从 1 开始）
  - includeDeclaration: 是否包含声明本身（可选）
```

#### 跳转到实现

查找接口或抽象方法的实现。

```
Operation: goToImplementation
Parameters:
  - filePath: 文件路径
  - line: 行号（从 1 开始）
  - character: 列号（从 1 开始）
```

### 符号信息

#### 悬停

获取符号的文档和类型信息。

```
Operation: hover
Parameters:
  - filePath: 文件路径
  - line: 行号（从 1 开始）
  - character: 列号（从 1 开始）
```

#### 文档符号

获取文档中的所有符号。

```
Operation: documentSymbol
Parameters:
  - filePath: 文件路径
```

#### 工作区符号搜索

在整个工作区中搜索符号。

```
Operation: workspaceSymbol
Parameters:
  - query: 搜索查询字符串
  - limit: 最大结果数（可选）
```

### 调用层级

#### 准备调用层级

获取某个位置的调用层级项。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: 文件路径
  - line: 行号（从 1 开始）
  - character: 列号（从 1 开始）
```

#### 传入调用

查找调用给定函数的所有函数。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: 来自 prepareCallHierarchy 的项
```

#### 传出调用

查找给定函数调用的所有函数。

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: 来自 prepareCallHierarchy 的项
```

### 诊断

#### 文件诊断

获取文件的诊断消息（错误、警告）。

```
Operation: diagnostics
Parameters:
  - filePath: 文件路径
```

#### 工作区诊断

获取整个工作区的所有诊断消息。

```
Operation: workspaceDiagnostics
Parameters:
  - limit: 最大结果数（可选）
```

### 代码操作

#### 获取代码操作

获取某个位置可用的代码操作（快速修复、重构）。

```
Operation: codeActions
Parameters:
  - filePath: 文件路径
  - line: 起始行号（从 1 开始）
  - character: 起始列号（从 1 开始）
  - endLine: 结束行号（可选，默认为 line）
  - endCharacter: 结束列（可选，默认为 character）
  - diagnostics: 为其获取操作的诊断（可选）
  - codeActionKinds: 按操作类型过滤（可选）
```

代码操作类型：

- `quickfix` - 针对错误/警告的快速修复
- `refactor` - 重构操作
- `refactor.extract` - 提取为函数/变量
- `refactor.inline` - 内联函数/变量
- `source` - 源代码操作
- `source.organizeImports` - 整理导入
- `source.fixAll` - 修复所有可自动修复的问题

## 安全性

默认情况下，LSP 服务器仅在可信工作区中启动。这是因为语言服务器以您的用户权限运行，并且可以执行代码。

### 信任控制

- **可信工作区**：如果已配置，则 LSP 服务器启动
- **不可信工作区**：除非在服务器配置中设置了 `trustRequired: false`，否则 LSP 服务器不会启动

要将工作区标记为可信，请使用 `/trust` 命令。

### 按服务器信任覆盖

您可以在特定服务器的配置中覆盖信任要求：

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

1. **验证 `--experimental-lsp` 标志**：确保在启动 Qwen Code 时使用了该标志
2. **检查服务器是否已安装**：手动运行命令（例如 `clangd --version`）进行验证
3. **检查命令**：服务器二进制文件必须位于系统 `PATH` 中，或指定为绝对路径（例如 `/opt/llvm/bin/clangd`）。会阻止转义工作区的相对路径
4. **检查工作区信任**：工作区必须被 LSP 信任（使用 `/trust`）
5. **检查日志**：使用 `--debug` 启动 Qwen Code，然后在调试日志中搜索与 LSP 相关的条目（参见下面的调试部分）
6. **检查进程**：运行 `ps aux | grep <server-name>` 以验证服务器进程是否在运行

### 性能缓慢

1. **大型项目**：考虑排除 `node_modules` 和其他大型目录
2. **服务器超时**：对于慢速服务器，增加服务器配置中的 `startupTimeout`

### 无结果

1. **服务器未就绪**：服务器可能仍在索引。对于使用 clangd 的 C/C++ 项目，请确保参数中包含 `--background-index`，并且项目根目录或父目录中存在 `compile_commands.json`（或 `compile_flags.txt`）。如果它位于构建子目录中，请使用 `--compile-commands-dir=<path>`
2. **文件未保存**：保存文件以便服务器获取更改
3. **语言错误**：检查是否为您的语言运行了正确的服务器
4. **检查进程**：运行 `ps aux | grep <server-name>` 以验证服务器是否真的在运行

### 调试

LSP 没有单独的调试标志。将 Qwen Code 的正常调试模式与 LSP 功能标志一起使用：

```bash
qwen --experimental-lsp --debug
```

调试日志写入会话调试日志目录。要检查 LSP 相关的条目：

```bash
# 默认运行时目录
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# 或者，不使用 ripgrep：
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# 如果已配置 QWEN_RUNTIME_DIR
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

有用的条目包括：

- `[LSP] ...`：由原生 LSP 服务和服务器管理器发出的日志。
- `[CONFIG] Native LSP status after discovery: ...`：为会话发现的 LSP 服务器配置。
- `[CONFIG] Native LSP status after startup: ...`：服务器启动结果，包括就绪/失败计数。
- `[STATUS] LSP status snapshot for /status: ...`：在调试模式下运行 `/status` 时打印的状态快照。

您也可以在 CLI 中运行 `/status` 以查看简短的 LSP 摘要：

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

要查看每个服务器的详细信息，请运行 `/lsp`：

```text
**LSP Server Status**

| 服务器 | 命令 | 语言 | 状态 |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | 就绪 |
| pyright | `pyright-langserver` | python | 失败 - 启动失败 |
```

需要注意的常见错误消息：

```text
command path is unsafe        -> 命令路径不安全 -> 相对路径转义了工作区，请使用绝对路径或添加到 PATH
command not found             -> 命令未找到 -> 服务器二进制文件未安装或不在 PATH 中
requires trusted workspace    -> 需要可信工作区 -> 请先运行 /trust
LSP connection closed         -> LSP 连接已关闭 -> 服务器已启动，但在回复初始化之前退出或关闭了 stdio
```

对于 clangd 启动失败，请直接从项目根目录验证服务器：

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++ 项目通常应提供 `compile_commands.json` 或 `compile_flags.txt`。如果编译数据库在构建目录中，请将其传递给 clangd：

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # 或 typescript-language-server, jdtls 等
```

## 扩展 LSP 配置

扩展可以通过其 `plugin.json` 中的 `lspServers` 字段提供 LSP 服务器配置。这可以是一个内联对象或指向 `.lsp.json` 文件的路径。当扩展启用时，Qwen Code 会加载这些配置。其格式与项目 `.lsp.json` 文件中使用的语言键布局相同。

## 最佳实践

1. **全局安装语言服务器**：这可以确保它们在所有项目中可用
2. **使用项目特定的设置**：通过 `.lsp.json` 根据需要为每个项目配置服务器选项
3. **保持服务器更新**：定期更新您的语言服务器以获得最佳效果
4. **明智地信任**：仅信任来自可靠来源的工作区

## 常见问题

### 问：如何启用 LSP？

在启动 Qwen Code 时使用 `--experimental-lsp` 标志：

```bash
qwen --experimental-lsp
```

### 问：如何知道哪些语言服务器在运行？

使用已启用 LSP 和调试模式启动 Qwen Code：

```bash
qwen --experimental-lsp --debug
```

然后运行 `/status` 查看简短摘要，运行 `/lsp` 查看各服务器状态，或检查调试日志：

```bash
# 默认运行时目录
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# 或者：
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# 如果已配置 QWEN_RUNTIME_DIR
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP 使用 Qwen Code 的正常 `--debug` 模式；没有单独的 LSP 调试标志。

### 问：我可以对同一文件类型使用多个语言服务器吗？

可以，但每个操作只会使用一个。第一个返回结果的服务器胜出。

### 问：LSP 在沙盒模式下工作吗？

LSP 服务器在沙盒之外运行以访问您的代码。它们受工作区信任控制约束。