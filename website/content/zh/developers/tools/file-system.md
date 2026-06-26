# Qwen Code 文件系统工具

Qwen Code 提供了一套全面的工具，用于与本地文件系统交互。这些工具允许模型读取、写入、列出、搜索和修改文件及目录，所有操作都在你的控制之下，并且敏感操作通常需要确认。

**注意：** 为了安全起见，所有文件系统工具都在 `rootDirectory`（通常是启动 CLI 时的当前工作目录）内运行。你提供给这些工具的路径通常应为绝对路径，或者会相对于此根目录进行解析。

## 1. `list_directory`（ListFiles）

`list_directory` 列出指定目录路径中的文件和子目录名称。它可以可选地忽略匹配提供的 glob 模式的条目。

- **工具名称：** `list_directory`
- **显示名称：** ListFiles
- **文件：** `ls.ts`
- **参数：**
  - `path`（字符串，必填）：要列出的目录的绝对路径。
  - `ignore`（字符串数组，可选）：要从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore`（布尔值，可选）：是否在列出文件时尊重 `.gitignore` 模式。默认为 `true`。
- **行为：**
  - 返回文件和目录名称列表。
  - 指示每个条目是否为目录。
  - 先排序目录，然后按字母顺序排序条目。
- **输出（`llmContent`）：** 一个字符串，例如：`Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认：** 否。

## 2. `read_file`（ReadFile）

`read_file` 读取并返回指定文件的内容。此工具处理文本文件以及当前模型支持的模态的媒体文件（图像、PDF、音频、视频）。对于文本文件，它可以读取特定的行范围。对于当前模型不支持的模态的媒体文件，会返回一条有用的错误消息。其他二进制文件类型通常会被跳过。

- **工具名称：** `read_file`
- **显示名称：** ReadFile
- **文件：** `read-file.ts`
- **参数：**
  - `path`（字符串，必填）：要读取的文件的绝对路径。
  - `offset`（数字，可选）：对于文本文件，从 0 基数的行号开始读取。需要设置 `limit`。
  - `limit`（数字，可选）：对于文本文件，最大读取行数。如果省略，则读取默认最大值（例如 2000 行）或在可行时读取整个文件。
- **行为：**
  - 对于文本文件：返回内容。如果使用了 `offset` 和 `limit`，则仅返回该行切片。如果内容因行限制或行长限制而被截断，则会进行指示。
  - 对于媒体文件（图像、PDF、音频、视频）：如果当前模型支持该文件的模态，则返回文件内容作为 base64 编码的 `inlineData` 对象。如果模型不支持该模态，则返回带有指导的错误消息（例如，建议使用技能或外部工具）。
  - 对于其他二进制文件：尝试识别并跳过它们，返回指示其为通用二进制文件的消息。
- **输出：**（`llmContent`）：
  - 对于文本文件：文件内容，可能带有截断消息前缀（例如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 对于支持的媒体文件：一个包含 `inlineData` 的对象，其中包含 `mimeType` 和 base64 `data`（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 对于不支持的媒体文件：一个错误消息字符串，解释当前模型不支持此模态，并提供替代建议。
  - 对于其他二进制文件：一条消息，如 `Cannot display content of binary file: /path/to/data.bin`。
- **确认：** 否。

### Jupyter notebook 读取

对于 Jupyter notebook（`.ipynb`），`read_file` 会解析 notebook JSON 并返回结构化的、模型可读的 notebook 视图，而不是原始 JSON。渲染输出包括 notebook 语言、有序单元格、单元格 ID、源代码和摘要输出。

然后可以使用 `notebook_edit` 编辑 notebook 单元格。模型应使用 `read_file` 显示的单元格 ID 来定位目标单元格。

`.ipynb` 文件不支持 `offset` 和 `limit`。Notebook 读取被视为结构化全文件读取；如果渲染的 notebook 输出因过大而被内部截断，`notebook_edit` 将拒绝单元格级编辑，并要求你在编辑前减少输出或拆分 notebook。

## 3. `notebook_edit`（NotebookEdit）

`notebook_edit` 在单元格级别安全地编辑 Jupyter notebook（`.ipynb`）文件。更改 notebook 单元格时，请使用它代替 `edit` 或 `write_file`。

- **工具名称：** `notebook_edit`
- **显示名称：** NotebookEdit
- **文件：** `notebook-edit.ts`
- **参数：**
  - `notebook_path`（字符串，必填）：`.ipynb` 文件的绝对路径。
  - `cell_id`（字符串，可选）：`read_file` 显示的目标单元格 ID。`replace` 和 `delete` 操作需要此参数。对于 `insert`，新单元格插入到此单元格之后；如果省略，则新单元格插入到开头。
  - `new_source`（字符串，可选）：用于 `replace` 和 `insert` 的新单元格源代码。`delete` 操作不需要此参数。
  - `cell_type`（`code` 或 `markdown`，可选）：插入单元格的单元格类型，或替换单元格时的目标类型。
  - `edit_mode`（`replace`、`insert` 或 `delete`，可选）：编辑操作。默认为 `replace`。
- **行为：**
  - 要求在当前会话中已使用 `read_file` 读取过该 notebook。
  - 使用 `read_file` 渲染的 ID 定位单元格，包括真实的 notebook 单元格 ID 和显示的 `cell-N` 后备 ID。
  - 拒绝模糊的渲染单元格 ID，而不是猜测。
  - 对于代码单元格，当源代码更改时，清除过时的输出并重置 `execution_count`。
  - 尽可能保留 notebook JSON 格式、行尾、编码和 BOM。
  - 在结构性编辑（当显示的后备 ID 可能发生变化）后，使先前读取状态失效，因此下一次 notebook 编辑需要重新 `read_file`。
- **输出（`llmContent`）：** 一条成功消息，描述已编辑的 notebook 单元格，对于非删除操作，还包括更新的源代码。
- **确认：** 是。显示 notebook JSON 差异并在写入前征求用户批准，除非当前权限模式或规则自动批准编辑工具。

### `notebook_edit` 示例

替换一个代码单元格：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

在现有单元格后插入一个 markdown 单元格：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

删除一个单元格：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file`（WriteFile）

`write_file` 将内容写入指定文件。如果文件存在，它将被覆盖。如果文件不存在，则将创建它（以及任何必要的父目录）。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path`（字符串，必填）：要写入的文件的绝对路径。
  - `content`（字符串，必填）：要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入 `file_path`。
  - 不写入原始 Jupyter notebook JSON。对于 `.ipynb` 单元格编辑，请使用 `notebook_edit`。
  - 如果父目录不存在，则创建它们。
- **输出（`llmContent`）：** 一条成功消息，例如 `Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **确认：** 是。显示更改的差异并在写入前征求用户批准。

## 5. `glob`（Glob）

`glob` 查找匹配特定 glob 模式（例如 `src/**/*.ts`、`*.md`）的文件，返回按修改时间排序的绝对路径（最新的在前）。

- **工具名称：** `glob`
- **显示名称：** Glob
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（字符串，必填）：要匹配的 glob 模式（例如 `"*.py"`、`"src/**/*.js"`）。
  - `path`（字符串，可选）：要搜索的目录。如果未指定，则使用当前工作目录。
- **行为：**
  - 在指定目录中查找匹配 glob 模式的文件。
  - 返回绝对路径列表，按最近修改的文件优先排序。
  - 默认情况下，尊重 .gitignore、.qwenignore 和配置的自定义 Qwen 忽略文件。
  - 限制结果为 100 个文件，以防止上下文溢出。
- **输出（`llmContent`）：** 一条消息，例如：`Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **确认：** 否。

## 6. `grep_search`（Grep）

`grep_search` 在指定目录的文件内容中搜索正则表达式模式。可以通过 glob 模式过滤文件。返回匹配的行及其文件路径和行号。

- **工具名称：** `grep_search`
- **显示名称：** Grep
- **文件：** `grep.ts`（后备文件为 `ripGrep.ts`）
- **参数：**
  - `pattern`（字符串，必填）：要在文件内容中搜索的正则表达式模式（例如 `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（字符串，可选）：要搜索的文件或目录。默认为当前工作目录。
  - `glob`（字符串，可选）：用于过滤文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（整数，可选）：将输出限制为前 N 个匹配行。必须为正整数。可选 - 如果未指定，则显示所有匹配项。
- **行为：**
  - 在可用时使用 ripgrep 进行快速搜索；否则回退到基于 JavaScript 的搜索实现。
  - 返回匹配行及其文件路径和行号。
  - 默认不区分大小写。
  - 尊重 .gitignore、.qwenignore 和配置的自定义 Qwen 忽略文件。
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

## 7. `edit`（Edit）

`edit` 替换文件中的文本。默认情况下，它要求 `old_string` 匹配唯一的位置；当你有意更改所有出现时，请将 `replace_all` 设置为 `true`。此工具设计用于精确、有针对性的更改，并且需要围绕 `old_string` 提供足够的上下文，以确保修改正确的位置。

- **工具名称：** `edit`
- **显示名称：** Edit
- **文件：** `edit.ts`
- **参数：**
  - `file_path`（字符串，必填）：要修改的文件的绝对路径。
  - `old_string`（字符串，必填）：要替换的确切字面量文本。

    **关键：** 此字符串必须唯一标识要更改的单个实例。它应包含目标文本周围的足够上下文，精确匹配空白和缩进。如果 `old_string` 为空，则该工具尝试在 `file_path` 处创建一个新文件，内容为 `new_string`。

  - `new_string`（字符串，必填）：用于替换 `old_string` 的确切字面量文本。
  - `replace_all`（布尔值，可选）：替换所有出现的 `old_string`。默认为 `false`。

- **行为：**
  - 不编辑原始 Jupyter notebook JSON。对于 `.ipynb` 单元格编辑，请使用 `notebook_edit`。
  - 如果 `old_string` 为空且 `file_path` 不存在，则创建一个包含 `new_string` 的新文件。
  - 如果提供了 `old_string`，则读取 `file_path` 并尝试查找恰好一次出现，除非 `replace_all` 为 true。
  - 如果匹配是唯一的（或 `replace_all` 为 true），则将文本替换为 `new_string`。
  - **增强可靠性（多阶段编辑校正）：** 为了显著提高编辑的成功率，特别是当模型提供的 `old_string` 可能不够精确时，该工具包含一个多阶段编辑校正机制。
    - 如果初始的 `old_string` 未找到或匹配多个位置，该工具可以利用 Qwen 模型迭代地优化 `old_string`（以及可能的 `new_string`）。
    - 此自校正过程试图识别模型打算修改的唯一片段，使 `edit` 操作即使在初始上下文略微不完美的情况下也更加稳健。
- **失败条件：** 尽管有校正机制，但该工具在以下情况下仍会失败：
  - `file_path` 不是绝对路径或在根目录之外。
  - `old_string` 不为空，但 `file_path` 不存在。
  - `old_string` 为空，但 `file_path` 已存在。
  - 在尝试校正后，在文件中未找到 `old_string`。
  - 多次找到 `old_string`，`replace_all` 为 false，并且自校正机制无法将其解析为单个明确的匹配。
- **输出（`llmContent`）：**
  - 成功时：`Successfully modified file: /path/to/file.txt (1 replacements).` 或 `Created new file: /path/to/new_file.txt with provided content.`
  - 失败时：一条解释原因的错误消息（例如 `Failed to edit, 0 occurrences found...`、`Failed to edit because the text matches multiple locations...`）。
- **确认：** 是。显示建议更改的差异并在写入文件前征求用户批准。

## 文件编码和平台特定行为

### 编码检测与保留

读取文件时，Qwen Code 使用多步策略检测文件的编码：

1. **UTF-8** — 首先尝试（大多数现代工具输出 UTF-8）
2. **chardet** — 对非 UTF-8 内容进行统计检测
3. **系统编码** — 回退到操作系统代码页（Windows `chcp` / Unix `LANG`）

`write_file` 和 `edit` 都会保留现有文件的原始编码和 BOM（字节顺序标记）。如果文件被读取为带有 UTF-8 BOM 的 GBK，则回写时也会保持相同方式。

### 配置新文件的默认编码

`defaultFileEncoding` 设置控制**新创建**文件（而非对现有文件的编辑）的编码：

| 值          | 行为                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| _(未设置)_  | UTF-8 无 BOM，并自动进行平台特定调整（见下文）                               |
| `utf-8`     | UTF-8 无 BOM，不进行自动调整                                                 |
| `utf-8-bom` | 所有新文件都使用 UTF-8 BOM                                                  |

在 `.qwen/settings.json` 或 `~/.qwen/settings.json` 中设置：

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows：批处理文件的 CRLF

在 Windows 上，`.bat` 和 `.cmd` 文件会自动使用 CRLF（`\r\n`）行尾写入。这是因为 `cmd.exe` 使用 CRLF 作为行分隔符——仅使用 LF 的行尾可能会破坏多行 `if`/`else`、`goto` 标签和 `for` 循环。这适用于所有编码设置，且仅在 Windows 上生效。

### Windows：PowerShell 脚本的 UTF-8 BOM

在具有**非 UTF-8 系统代码页**（例如 GBK/cp936、Big5/cp950、Shift_JIS/cp932）的 Windows 上，新创建的 `.ps1` 文件会自动写入 UTF-8 BOM。这是因为 Windows PowerShell 5.1（内置于 Windows 10/11 的版本）使用系统的 ANSI 代码页读取无 BOM 的脚本。如果没有 BOM，脚本中的任何非 ASCII 字符都将被误解。

此自动 BOM 仅在以下情况下适用：

- 平台是 Windows
- 系统代码页不是 UTF-8（不是代码页 65001）
- 文件是新的 `.ps1` 文件（现有文件保留其原始编码）
- 用户**未**在设置中显式设置 `defaultFileEncoding`

PowerShell 7+（pwsh）默认使用 UTF-8 并透明处理 BOM，因此 BOM 在那里无害。

如果你明确将 `defaultFileEncoding` 设置为 `"utf-8"`，则自动 BOM 被禁用——这是为拒绝 BOM 的存储库或工具提供的有意逃生口。

### 总结

| 文件类型      | 平台                          | 自动行为                     |
| ------------- | ----------------------------- | ---------------------------- |
| `.bat`, `.cmd` | Windows                       | CRLF 行尾                    |
| `.ps1`        | Windows（非 UTF-8 代码页）      | 新文件使用 UTF-8 BOM         |
| 所有其他文件  | 所有平台                      | UTF-8 无 BOM（默认）         |

这些文件系统工具为 Qwen Code 理解和交互您的本地项目上下文提供了基础。