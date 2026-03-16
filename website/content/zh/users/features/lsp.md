# 语言服务器协议（LSP）支持

Qwen Code 提供原生的语言服务器协议（LSP）支持，从而实现高级代码智能功能，例如跳转到定义、查找引用、诊断信息和代码操作。该集成为 AI 智能体提供了更深入理解你代码的能力，并提供更精准的协助。

## 概述

Qwen Code 中的 LSP 支持通过连接能够理解你代码的语言服务器来实现。当你使用 TypeScript、Python、Go 或其他受支持的语言时，Qwen Code 可自动启动对应的语言服务器，并利用它完成以下任务：

- 跳转到符号定义
- 查找符号的所有引用
- 获取悬停信息（文档、类型信息）
- 查看诊断信息（错误、警告）
- 访问代码操作（快速修复、重构）
- 分析调用层级

## 快速开始

LSP 是 Qwen Code 中的一项实验性功能。要启用它，请使用 `--experimental-lsp` 命令行标志：

```bash
qwen --experimental-lsp
```

对于大多数常用语言，如果系统中已安装对应的语言服务器，Qwen Code 将自动检测并启动它。

### 前提条件

你需要安装对应编程语言的语言服务器：

| 语言                | 语言服务器               | 安装命令                                                                 |
| ------------------- | ------------------------ | ------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                   |
| Python              | pylsp                    | `pip install python-lsp-server`                                          |
| Go                  | gopls                    | `go install golang.org/x/tools/gopls@latest`                             |
| Rust                | rust-analyzer            | [安装指南](https://rust-analyzer.github.io/manual.html#installation) |

## 配置

### `.lsp.json` 文件

你可以在项目根目录下使用 `.lsp.json` 文件配置语言服务器。该文件采用 [Claude Code 插件 LSP 配置参考文档](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中描述的“以语言为键”的格式。

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

| 选项                | 类型   | 说明                                           |
| --------------------- | ------ | ---------------------------------------------- |
| `command`             | 字符串 | 启动 LSP 服务器的命令（必须位于系统 PATH 中）     |
| `extensionToLanguage` | 对象   | 将文件扩展名映射到对应的语言标识符               |

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
| `restartOnCrash`        | boolean  | `false`   | 发生崩溃时自动重启                                     |
| `maxRestarts`           | number   | `3`       | 最大重启次数                                           |
| `trustRequired`         | boolean  | `true`    | 要求工作区受信任                                       |

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
操作：goToDefinition
参数：
  - filePath：文件路径
  - line：行号（从 1 开始计数）
  - character：列号（从 1 开始计数）
```

#### 查找引用

查找符号的所有引用位置。

```
操作：findReferences
参数：
  - filePath：文件路径
  - line：行号（从 1 开始计数）
  - character：列号（从 1 开始计数）
  - includeDeclaration：是否包含符号自身的声明（可选）
```

#### 转到实现

查找接口或抽象方法的实现。

```
操作：goToImplementation
参数：
  - filePath：文件路径
  - line：行号（从 1 开始计数）
  - character：列号（从 1 开始计数）
```

### 符号信息

#### 悬停

获取符号的文档和类型信息。

```
操作：hover
参数：
  - filePath：文件路径
  - line：行号（从 1 开始计数）
  - character：列号（从 1 开始计数）
```

#### 文档符号

获取文档中的所有符号。

```
操作：documentSymbol
参数：
  - filePath：文件路径
```

#### 工作区符号搜索

在整个工作区中搜索符号。

```
操作：workspaceSymbol
参数：
  - query：搜索查询字符串
  - limit：最大结果数（可选）
```

### 调用层级

#### 准备调用层级

获取指定位置处的调用层级项。

```
操作：prepareCallHierarchy
参数：
  - filePath：文件路径
  - line：行号（从 1 开始计数）
  - character：列号（从 1 开始计数）
```

#### 入向调用

查找所有调用给定函数的函数。

```
操作：incomingCalls
参数：
  - callHierarchyItem：来自 prepareCallHierarchy 的项
```

#### 出向调用

查找给定函数所调用的所有函数。

```
操作：outgoingCalls
参数：
  - callHierarchyItem：来自 prepareCallHierarchy 的项
```

### 诊断信息

#### 文件诊断

获取指定文件的诊断信息（错误、警告）。

```
操作：diagnostics
参数：
  - filePath：文件路径
```

#### 工作区诊断

获取整个工作区中的所有诊断信息。

```
操作：workspaceDiagnostics
参数：
  - limit：最大结果数（可选）
```

### 代码操作

#### 获取代码操作

获取指定位置处可用的代码操作（快速修复、重构等）。

```
操作：codeActions
参数：
  - filePath：文件路径
  - line：起始行号（从 1 开始计数）
  - character：起始列号（从 1 开始计数）
  - endLine：结束行号（可选，默认为 line）
  - endCharacter：结束列号（可选，默认为 character）
  - diagnostics：要为其获取操作的诊断信息（可选）
  - codeActionKinds：按操作类型筛选（可选）
```

代码操作类型：

- `quickfix` — 针对错误/警告的快速修复  
- `refactor` — 重构操作  
- `refactor.extract` — 提取为函数/变量  
- `refactor.inline` — 内联函数/变量  
- `source` — 源代码操作  
- `source.organizeImports` — 整理导入语句  
- `source.fixAll` — 修复所有可自动修复的问题  

## 安全性

LSP 服务器默认仅在受信任的工作区中启动。这是因为语言服务器以您的用户权限运行，并可能执行任意代码。

### 信任控制

- **受信任的工作区**：LSP 服务器将自动启动  
- **不受信任的工作区**：除非在服务器配置中设置 `trustRequired: false`，否则 LSP 服务器不会启动  

要将工作区标记为受信任，请使用 `/trust` 命令，或在设置中配置受信任的文件夹。

### 按服务器覆盖信任要求

你可以在特定服务器的配置中覆盖其信任要求：

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
2. **检查 PATH 环境变量**：确保服务器可执行文件位于系统 PATH 中  
3. **检查工作区信任状态**：LSP 要求工作区必须被标记为受信任  
4. **检查日志**：在控制台输出中查找错误信息  
5. **确认 `--experimental-lsp` 标志**：启动 Qwen Code 时需指定该标志  

### 性能缓慢

1. **大型项目**：考虑排除 `node_modules` 及其他大型目录  
2. **服务器超时**：针对响应较慢的服务器，在服务端配置中增大 `startupTimeout` 值  

### 无结果返回

1. **服务器尚未就绪**：服务器可能仍在索引中  
2. **文件未保存**：请先保存文件，使服务器能够捕获变更  
3. **语言不匹配**：确认当前运行的是适用于您所用语言的正确服务器

### 调试

启用调试日志以查看 LSP 通信：

```bash
DEBUG=lsp* qwen --experimental-lsp
```

或者查阅 `packages/cli/LSP_DEBUGGING_GUIDE.md` 中的 LSP 调试指南。

## Claude Code 兼容性

Qwen Code 支持 Claude Code 风格的 `.lsp.json` 配置文件，其格式为 [Claude Code 插件参考文档](https://code.claude.com/docs/en/plugins-reference#lsp-servers) 中定义的“以语言为键”的格式。若你正从 Claude Code 迁移，请在配置中使用“以语言为键”的布局。

### 配置格式

推荐采用符合 Claude Code 规范的格式：

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

Claude Code 的 LSP 插件也可在 `plugin.json`（或所引用的 `.lsp.json`）中提供 `lspServers` 字段。Qwen Code 在启用该扩展时会加载这些配置，且这些配置也必须采用相同的“以语言为键”格式。

## 最佳实践

1. **全局安装语言服务器**：确保它们在所有项目中均可使用  
2. **使用项目级配置**：如需按项目定制服务器选项，请通过 `.lsp.json` 文件进行配置  
3. **保持服务器更新**：定期更新语言服务器，以获得最佳效果  
4. **谨慎启用信任**：仅对来自可信来源的工作区启用信任  

## 常见问题（FAQ）

### Q：如何启用 LSP？

启动 Qwen Code 时添加 `--experimental-lsp` 标志：

```bash
qwen --experimental-lsp
```

### Q：如何查看当前运行的语言服务器？

使用 `/lsp status` 命令，可列出所有已配置并正在运行的语言服务器。

### Q：能否为同一文件类型配置多个语言服务器？

可以，但每次操作仅会使用其中一个。最先返回结果的服务器胜出。

### Q：LSP 在沙箱模式下是否可用？

LSP 服务器在沙箱外部运行，以便访问你的代码，并受工作区信任控制机制约束。