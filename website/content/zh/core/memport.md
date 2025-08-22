# Memory Import Processor

Memory Import Processor 是一个功能，允许你通过使用 `@file.md` 语法从其他文件导入内容，从而模块化你的上下文文件（例如 `QWEN.md`）。

## 概述

该功能使你能够将大型上下文文件（例如 `QWEN.md`）拆分为更小、更易管理的组件，并可在不同上下文中复用。Import Processor 支持相对路径和绝对路径，并内置安全机制以防止循环导入并确保文件访问安全。

## 语法

使用 `@` 符号后跟你要导入的文件路径：

```markdown

# Main QWEN.md file

This is the main content.

@./components/instructions.md

More content here.

@./shared/configuration.md
```

## 支持的路径格式

### 相对路径

- `@./file.md` - 从当前目录导入
- `@../file.md` - 从父级目录导入
- `@./components/file.md` - 从子目录导入

### 绝对路径

- `@/absolute/path/to/file.md` - 使用绝对路径导入

## 示例

### 基础导入

```markdown

# My QWEN.md

欢迎来到我的项目！

@./getting-started.md

## 功能特性

@./features/overview.md
```

### 嵌套导入

被导入的文件本身也可以包含导入语句，从而创建嵌套结构：

```markdown

# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown

# header.md

# 项目头部

@./shared/title.md
```

## 安全特性

### 循环导入检测

处理器会自动检测并阻止循环导入：

```markdown

# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- 这将被检测到并阻止 -->
```

### 文件访问安全

`validateImportPath` 函数确保只允许从指定目录导入文件，防止访问允许范围之外的敏感文件。

### 最大导入深度

为了防止无限递归，系统提供了一个可配置的最大导入深度（默认值：5 层）。

## 错误处理

### 文件缺失

如果引用的文件不存在，导入操作会优雅地失败，并在输出中添加一条错误注释。

### 文件访问错误

权限问题或其他文件系统错误会被优雅地处理，并显示相应的错误信息。

## 代码区域检测

导入处理器使用 `marked` 库来检测代码块和行内代码片段，确保这些区域内的 `@` 导入被正确忽略。这为嵌套代码块和复杂的 Markdown 结构提供了可靠的处理能力。

## 导入树结构

处理器会返回一个导入树，显示导入文件的层次结构。这有助于用户通过展示哪些文件被读取及其导入关系来调试他们的上下文文件问题。

示例树结构：

```
Memory Files
L project: QWEN.md
           L a.md
             L b.md
               L c.md
             L d.md
               L e.md
                 L f.md
           L included.md
```

该树保留了文件导入的顺序，并显示完整的导入链，以便于调试。

## 与 Claude Code 的 `/memory`（`claude.md`）方法对比

Claude Code 的 `/memory` 功能（如 `claude.md` 中所示）通过连接所有包含的文件来生成一个扁平的、线性的文档，并始终使用清晰的注释和路径名标记文件边界。它不会显式地展示 import 层级结构，但 LLM 会接收到所有文件内容和路径，这对于在需要时重建层级结构已经足够了。

注意：import tree 主要用于开发过程中的清晰性，对 LLM 的处理只有有限的相关性。

## API 参考

### `processImports(content, basePath, debugMode?, importState?)`

处理 context 文件内容中的 import 语句。

**参数:**

- `content` (string): 需要处理 import 的内容
- `basePath` (string): 当前文件所在的目录路径
- `debugMode` (boolean, optional): 是否启用 debug 日志（默认：false）
- `importState` (ImportState, optional): 用于防止循环 import 的状态跟踪

**返回值:** Promise<ProcessImportsResult> - 包含处理后的内容和 import 树的对象

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // 处理后的内容，import 已被解析
  importTree: MemoryFile; // 显示 import 层级结构的树形结构
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // 文件路径
  imports?: MemoryFile[]; // 直接 import 的文件，按导入顺序排列
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

验证 import 路径，确保它们是安全的且在允许的目录范围内。

**参数:**

- `importPath` (string): 需要验证的 import 路径
- `basePath` (string): 用于解析相对路径的基目录
- `allowedDirectories` (string[]): 允许的目录路径数组

**返回值:** boolean - import 路径是否有效

### `findProjectRoot(startDir)`

通过从给定的起始目录向上搜索 `.git` 目录来查找项目根目录。实现为一个 **async** 函数，使用非阻塞的文件系统 API 来避免阻塞 Node.js 事件循环。

**参数:**

- `startDir` (string): 开始搜索的目录

**返回值:** Promise<string> - 项目根目录（如果未找到 `.git`，则返回起始目录）

## 最佳实践

1. **使用描述性的文件名** 来命名导入的组件
2. **保持导入层级浅** - 避免过深的嵌套导入链
3. **记录你的结构** - 维护清晰的导入文件层次结构
4. **测试你的导入** - 确保所有引用的文件都存在且可访问
5. **尽可能使用相对路径** 以获得更好的可移植性

## 故障排除

### 常见问题

1. **导入不生效**: 检查文件是否存在以及路径是否正确
2. **循环导入警告**: 检查你的导入结构是否存在循环引用
3. **权限错误**: 确保文件可读且位于允许的目录内
4. **路径解析问题**: 如果相对路径无法正确解析，可以使用绝对路径

### 调试模式

启用调试模式来查看导入过程的详细日志：

```typescript
const result = await processImports(content, basePath, true);
```