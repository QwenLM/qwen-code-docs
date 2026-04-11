# Qwen Code 文件系统工具

Qwen Code 提供了一套全面的工具，用于与本地文件系统进行交互。这些工具允许模型在你的控制下读取、写入、列出、搜索和修改文件与目录，通常敏感操作需要确认。

**注意：** 所有文件系统工具均在 `rootDirectory`（通常是你启动 CLI 时所在的当前工作目录）内运行，以确保安全。提供给这些工具的路径通常应为绝对路径，或相对于此根目录进行解析。

## 1. `list_directory` (ListFiles)

`list_directory` 列出指定目录路径下的直接文件和子目录名称。它可以选择性地忽略匹配提供的 glob 模式的条目。

- **工具名称：** `list_directory`
- **显示名称：** ListFiles
- **文件：** `ls.ts`
- **参数：**
  - `path`（字符串，必需）：要列出的目录的绝对路径。
  - `ignore`（字符串数组，可选）：要从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore`（布尔值，可选）：列出文件时是否遵循 `.gitignore` 模式。默认为 `true`。
- **行为：**
  - 返回文件和目录名称的列表。
  - 指示每个条目是否为目录。
  - 对条目进行排序，目录优先，然后按字母顺序排列。
- **输出（`llmContent`）：** 类似如下的字符串：`Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认：** 否。

## 2. `read_file` (ReadFile)

`read_file` 读取并返回指定文件的内容。该工具处理文本文件以及当前模型支持其模态的媒体文件（图像、PDF、音频、视频）。对于文本文件，它可以读取特定的行范围。如果当前模型不支持媒体文件的模态，将返回包含指导性信息的错误提示。其他二进制文件类型通常会被跳过。

- **工具名称：** `read_file`
- **显示名称：** ReadFile
- **文件：** `read-file.ts`
- **参数：**
  - `path`（字符串，必需）：要读取的文件的绝对路径。
  - `offset`（数字，可选）：对于文本文件，开始读取的起始行号（从 0 开始）。需要同时设置 `limit`。
  - `limit`（数字，可选）：对于文本文件，要读取的最大行数。如果省略，则读取默认最大值（例如 2000 行）或在可行时读取整个文件。
- **行为：**
  - 对于文本文件：返回内容。如果使用了 `offset` 和 `limit`，则仅返回该范围的行。如果内容因行数或行长限制被截断，会进行提示。
  - 对于媒体文件（图像、PDF、音频、视频）：如果当前模型支持该文件的模态，则将文件内容作为 base64 编码的 `inlineData` 对象返回。如果模型不支持该模态，则返回包含建议（例如推荐 skill 或外部工具）的错误信息。
  - 对于其他二进制文件：尝试识别并跳过它们，返回一条表明其为通用二进制文件的消息。
- **输出（`llmContent`）：**
  - 对于文本文件：文件内容，可能带有截断提示前缀（例如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 对于支持的媒体文件：包含 `inlineData` 的对象，其中包含 `mimeType` 和 base64 `data`（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 对于不支持的媒体文件：错误消息字符串，说明当前模型不支持此模态，并提供替代方案建议。
  - 对于其他二进制文件：类似 `Cannot display content of binary file: /path/to/data.bin` 的消息。
- **确认：** 否。

## 3. `write_file` (WriteFile)

`write_file` 将内容写入指定文件。如果文件已存在，将被覆盖。如果文件不存在，将创建该文件（及任何必要的父目录）。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path`（字符串，必需）：要写入的文件的绝对路径。
  - `content`（字符串，必需）：要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入 `file_path`。
  - 如果父目录不存在，则创建它们。
- **输出（`llmContent`）：** 成功消息，例如 `Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **确认：** 是。在写入前会显示更改的 diff 并请求用户批准。

## 4. `glob` (Glob)

`glob` 查找匹配特定 glob 模式（例如 `src/**/*.ts`、`*.md`）的文件，返回按修改时间排序（最新优先）的绝对路径。

- **工具名称：** `glob`
- **显示名称：** Glob
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（字符串，必需）：要匹配的 glob 模式（例如 `"*.py"`、`"src/**/*.js"`）。
  - `path`（字符串，可选）：要搜索的目录。如果未指定，将使用当前工作目录。
- **行为：**
  - 在指定目录中搜索匹配 glob 模式的文件。
  - 返回绝对路径列表，按最近修改的文件优先排序。
  - 默认遵循 .gitignore 和 .qwenignore 模式。
  - 将结果限制为 100 个文件，以防止上下文溢出。
- **输出（`llmContent`）：** 类似如下的消息：`Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **确认：** 否。

## 5. `grep_search` (Grep)

`grep_search` 在指定目录的文件内容中搜索正则表达式模式。可以通过 glob 模式过滤文件。返回包含匹配项的行，以及它们的文件路径和行号。

- **工具名称：** `grep_search`
- **显示名称：** Grep
- **文件：** `grep.ts`（以 `ripGrep.ts` 作为回退）
- **参数：**
  - `pattern`（字符串，必需）：要在文件内容中搜索的正则表达式模式（例如 `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（字符串，可选）：要搜索的文件或目录。默认为当前工作目录。
  - `glob`（字符串，可选）：用于过滤文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（数字，可选）：将输出限制为前 N 个匹配行。可选 - 如果未指定，则显示所有匹配项。
- **行为：**
  - 可用时使用 ripgrep 进行快速搜索；否则回退到基于 JavaScript 的搜索实现。
  - 返回匹配行及其文件路径和行号。
  - 默认不区分大小写。
  - 遵循 .gitignore 和 .qwenignore 模式。
  - 限制输出以防止上下文溢出。
- **输出（`llmContent`）：** 格式化的匹配字符串，例如：

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **确认：** 否。

### `grep_search` 示例

使用默认结果限制搜索模式：

```
grep_search(pattern="function\\s+myFunction", path="src")
```

使用自定义结果限制搜索模式：

```
grep_search(pattern="function", path="src", limit=50)
```

使用文件过滤和自定义结果限制搜索模式：

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (Edit)

`edit` 替换文件中的文本。默认情况下，它要求 `old_string` 精确匹配唯一的位置；当你有意更改所有匹配项时，请将 `replace_all` 设置为 `true`。该工具专为精确、有针对性的更改而设计，需要在 `old_string` 周围提供充足的上下文，以确保修改正确的位置。

- **工具名称：** `edit`
- **显示名称：** Edit
- **文件：** `edit.ts`
- **参数：**
  - `file_path`（字符串，必需）：要修改的文件的绝对路径。
  - `old_string`（字符串，必需）：要替换的精确字面文本。

    **关键：** 此字符串必须唯一标识要更改的单个实例。它应包含目标文本周围的充足上下文，并精确匹配空格和缩进。如果 `old_string` 为空，工具将尝试在 `file_path` 创建一个新文件，并将 `new_string` 作为内容。

  - `new_string`（字符串，必需）：用于替换 `old_string` 的精确字面文本。
  - `replace_all`（布尔值，可选）：替换 `old_string` 的所有匹配项。默认为 `false`。

- **行为：**
  - 如果 `old_string` 为空且 `file_path` 不存在，则创建包含 `new_string` 内容的新文件。
  - 如果提供了 `old_string`，它会读取 `file_path` 并尝试精确查找一个匹配项，除非 `replace_all` 为 true。
  - 如果匹配项唯一（或 `replace_all` 为 true），则用 `new_string` 替换文本。
  - **增强可靠性（多阶段编辑修正）：** 为了显著提高编辑成功率，尤其是在模型提供的 `old_string` 可能不够精确时，该工具集成了多阶段编辑修正机制。
    - 如果初始的 `old_string` 未找到或匹配多个位置，工具可以利用 Qwen 模型迭代优化 `old_string`（以及可能的 `new_string`）。
    - 这种自我修正过程会尝试识别模型意图修改的唯一片段，即使初始上下文略有偏差，也能使 `edit` 操作更加稳健。
- **失败条件：** 尽管有修正机制，但在以下情况下工具仍会失败：
  - `file_path` 不是绝对路径或位于根目录之外。
  - `old_string` 不为空，但 `file_path` 不存在。
  - `old_string` 为空，但 `file_path` 已存在。
  - 尝试修正后，在文件中仍未找到 `old_string`。
  - `old_string` 被找到多次，`replace_all` 为 false，且自我修正机制无法将其解析为单一明确的匹配项。
- **输出（`llmContent`）：**
  - 成功时：`Successfully modified file: /path/to/file.txt (1 replacements).` 或 `Created new file: /path/to/new_file.txt with provided content.`
  - 失败时：解释原因的错误消息（例如 `Failed to edit, 0 occurrences found...`、`Failed to edit because the text matches multiple locations...`）。
- **确认：** 是。在写入文件前会显示建议更改的 diff 并请求用户批准。

## 文件编码与平台特定行为

### 编码检测与保留

读取文件时，Qwen Code 使用多步策略检测文件编码：

1. **UTF-8** — 优先尝试（大多数现代工具输出 UTF-8）
2. **chardet** — 对非 UTF-8 内容进行统计检测
3. **系统编码** — 回退到操作系统代码页（Windows `chcp` / Unix `LANG`）

`write_file` 和 `edit` 都会保留现有文件的原始编码和 BOM（字节顺序标记）。如果文件以带 UTF-8 BOM 的 GBK 编码读取，它将以相同方式写回。

### 配置新文件的默认编码

`defaultFileEncoding` 设置控制**新创建**文件的编码（不适用于对现有文件的编辑）：

| 值 | 行为 |
| ----------- | --------------------------------------------------------------------------- |
| _(未设置)_ | 不带 BOM 的 UTF-8，并自动进行平台特定调整（见下文） |
| `utf-8` | 不带 BOM 的 UTF-8，无自动调整 |
| `utf-8-bom` | 所有新文件均使用带 BOM 的 UTF-8 |

在 `.qwen/settings.json` 或 `~/.qwen/settings.json` 中设置：

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows：批处理文件的 CRLF

在 Windows 上，`.bat` 和 `.cmd` 文件会自动使用 CRLF (`\r\n`) 换行符写入。这是必需的，因为 `cmd.exe` 使用 CRLF 作为行分隔符——仅使用 LF 结尾可能会破坏多行 `if`/`else`、`goto` 标签和 `for` 循环。此行为不受编码设置影响，且仅适用于 Windows。

### Windows：PowerShell 脚本的 UTF-8 BOM

在具有**非 UTF-8 系统代码页**（例如 GBK/cp936、Big5/cp950、Shift_JIS/cp932）的 Windows 上，新创建的 `.ps1` 文件会自动写入 UTF-8 BOM。这是必要的，因为 Windows PowerShell 5.1（Windows 10/11 内置版本）会使用系统的 ANSI 代码页读取不带 BOM 的脚本。如果没有 BOM，脚本中的任何非 ASCII 字符都会被错误解析。

此自动 BOM 仅在以下条件下生效：

- 平台为 Windows
- 系统代码页不是 UTF-8（非代码页 65001）
- 文件是新的 `.ps1` 文件（现有文件保留其原始编码）
- 用户**未**在设置中显式配置 `defaultFileEncoding`

PowerShell 7+ (pwsh) 默认使用 UTF-8 并透明处理 BOM，因此 BOM 在其中不会产生负面影响。

如果你将 `defaultFileEncoding` 显式设置为 `"utf-8"`，则会自动禁用 BOM——这是为拒绝 BOM 的仓库或工具链特意留出的例外配置。

### 总结

| 文件类型 | 平台 | 自动行为 |
| -------------- | ----------------------------- | --------------------------- |
| `.bat`, `.cmd` | Windows | CRLF 换行符 |
| `.ps1` | Windows（非 UTF-8 代码页） | 新文件添加 UTF-8 BOM |
| 其他所有文件 | 所有平台 | 不带 BOM 的 UTF-8（默认） |

这些文件系统工具为 Qwen Code 理解并与你的本地项目上下文进行交互奠定了基础。