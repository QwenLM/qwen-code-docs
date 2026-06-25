# Qwen Code 文件系统工具

Qwen Code 提供了一套完整的工具，用于与本地文件系统进行交互。这些工具允许模型在你的控制下读取、写入、列出、搜索和修改文件及目录，对于敏感操作通常需要确认。

**注意：** 出于安全考虑，所有文件系统工具都在 `rootDirectory`（通常是你启动 CLI 时的当前工作目录）内运行。你提供给这些工具的路径通常应为绝对路径，或相对于根目录进行解析。

## 1. `list_directory`（ListFiles）

`list_directory` 列出指定目录路径下的文件和子目录名称，可选择性地忽略匹配特定 glob 模式的条目。

- **工具名称：** `list_directory`
- **显示名称：** ListFiles
- **文件：** `ls.ts`
- **参数：**
  - `path`（string，必填）：要列出内容的目录的绝对路径。
  - `ignore`（string 数组，可选）：从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore`（boolean，可选）：列出文件时是否遵循 `.gitignore` 模式，默认为 `true`。
- **行为：**
  - 返回文件和目录名称列表。
  - 标明每个条目是否为目录。
  - 排序时目录优先，然后按字母顺序排列。
- **输出（`llmContent`）：** 类似如下格式的字符串：`Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认：** 否。

## 2. `read_file`（ReadFile）

`read_file` 读取并返回指定文件的内容。该工具支持文本文件和当前模型所支持模态的媒体文件（图片、PDF、音频、视频）。对于文本文件，可以读取特定行范围。当前模型不支持的媒体文件模态将被拒绝并返回友好的错误信息。其他二进制文件类型通常会被跳过。

- **工具名称：** `read_file`
- **显示名称：** ReadFile
- **文件：** `read-file.ts`
- **参数：**
  - `path`（string，必填）：要读取的文件的绝对路径。
  - `offset`（number，可选）：对于文本文件，从第几行（基于 0）开始读取，需同时设置 `limit`。
  - `limit`（number，可选）：对于文本文件，最多读取的行数。若省略，则读取默认最大行数（如 2000 行）或在可行时读取整个文件。
- **行为：**
  - 对于文本文件：返回内容。若使用了 `offset` 和 `limit`，则只返回对应行的切片。若内容因行数限制或行长度限制被截断，会进行提示。
  - 对于媒体文件（图片、PDF、音频、视频）：若当前模型支持该文件的模态，则以 base64 编码的 `inlineData` 对象形式返回文件内容；若模型不支持该模态，则返回错误信息和建议（例如建议使用 skills 或外部工具）。
  - 对于其他二进制文件：尝试识别并跳过，返回提示信息说明这是通用二进制文件。
- **输出（`llmContent`）：**
  - 对于文本文件：文件内容，可能带有截断提示前缀（例如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 对于支持的媒体文件：包含 `inlineData`（含 `mimeType` 和 base64 `data`）的对象（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 对于不支持的媒体文件：错误信息字符串，说明当前模型不支持该模态，并提供替代建议。
  - 对于其他二进制文件：类似 `Cannot display content of binary file: /path/to/data.bin` 的提示信息。
- **确认：** 否。

### Jupyter notebook 读取

对于 Jupyter notebook（`.ipynb`）文件，`read_file` 会解析 notebook JSON 并返回结构化的、模型可读的 notebook 视图，而不是原始 JSON。渲染输出包含 notebook 语言、有序的 cell、cell ID、源码和摘要输出。

随后可使用 `notebook_edit` 编辑 notebook cell。模型在定位 cell 时应使用 `read_file` 显示的 cell ID。

`.ipynb` 文件不支持 `offset` 和 `limit`。Notebook 读取视为完整文件的结构化读取；如果渲染的 notebook 输出因内容过大而被内部截断，`notebook_edit` 将拒绝 cell 级别的编辑，并要求你先减少输出或拆分 notebook 再进行编辑。

## 3. `notebook_edit`（NotebookEdit）

`notebook_edit` 以 cell 为单位安全地编辑 Jupyter notebook（`.ipynb`）文件。在修改 notebook cell 时，请使用此工具代替 `edit` 或 `write_file`。

- **工具名称：** `notebook_edit`
- **显示名称：** NotebookEdit
- **文件：** `notebook-edit.ts`
- **参数：**
  - `notebook_path`（string，必填）：`.ipynb` 文件的绝对路径。
  - `cell_id`（string，可选）：`read_file` 显示的目标 cell ID。`replace` 和 `delete` 操作必填。对于 `insert`，新 cell 插入在此 cell 之后；若省略，则插入到开头。
  - `new_source`（string，可选）：`replace` 和 `insert` 操作的新 cell 源码，`delete` 操作不需要。
  - `cell_type`（`code` 或 `markdown`，可选）：插入 cell 的类型，或替换 cell 时的目标类型。
  - `edit_mode`（`replace`、`insert` 或 `delete`，可选）：编辑操作类型，默认为 `replace`。
- **行为：**
  - 需要在当前会话中先用 `read_file` 读取过该 notebook。
  - 使用 `read_file` 渲染的 cell ID 定位目标 cell，包括真实的 notebook cell ID 和显示的 `cell-N` 备用 ID。
  - 对于模糊的渲染 cell ID，拒绝操作而不是猜测。
  - 对于 code cell，当源码发生变化时清除过期输出并重置 `execution_count`。
  - 尽量保留 notebook JSON 格式、行尾符、编码和 BOM。
  - 结构性编辑后（显示的备用 ID 可能发生偏移时）使先前的读取状态失效，下一次 notebook 编辑需要重新执行 `read_file`。
- **输出（`llmContent`）：** 描述已编辑的 notebook cell 的成功信息，以及非删除操作时更新后的源码。
- **确认：** 是。显示 notebook JSON diff 并在写入前请求用户批准，除非当前权限模式或规则自动批准编辑工具。

### `notebook_edit` 示例

替换一个 code cell：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

在已有 cell 后插入一个 markdown cell：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

删除一个 cell：

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file`（WriteFile）

`write_file` 将内容写入指定文件。若文件已存在，将被覆盖；若文件不存在，则会创建该文件（以及必要的父目录）。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path`（string，必填）：要写入的文件的绝对路径。
  - `content`（string，必填）：要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入 `file_path`。
  - 不写入原始 Jupyter notebook JSON，`.ipynb` cell 编辑请使用 `notebook_edit`。
  - 若父目录不存在，则自动创建。
- **输出（`llmContent`）：** 成功信息，例如 `Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **确认：** 是。显示更改 diff 并在写入前请求用户批准。

## 5. `glob`（Glob）

`glob` 查找匹配特定 glob 模式的文件（例如 `src/**/*.ts`、`*.md`），返回按修改时间排序的绝对路径列表（最新的在前）。

- **工具名称：** `glob`
- **显示名称：** Glob
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（string，必填）：要匹配的 glob 模式（例如 `"*.py"`、`"src/**/*.js"`）。
  - `path`（string，可选）：搜索的目录。若未指定，则使用当前工作目录。
- **行为：**
  - 在指定目录内搜索匹配 glob 模式的文件。
  - 返回绝对路径列表，按最近修改的文件排在最前。
  - 默认遵循 .gitignore、.qwenignore 以及配置的自定义 Qwen 忽略文件。
  - 限制结果最多 100 个文件，防止上下文溢出。
- **输出（`llmContent`）：** 类似如下的信息：`Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **确认：** 否。

## 6. `grep_search`（Grep）

`grep_search` 在指定目录的文件内容中搜索正则表达式模式，可通过 glob 模式过滤文件。返回包含匹配内容的行，以及对应的文件路径和行号。

- **工具名称：** `grep_search`
- **显示名称：** Grep
- **文件：** `grep.ts`（备用为 `ripGrep.ts`）
- **参数：**
  - `pattern`（string，必填）：在文件内容中搜索的正则表达式模式（例如 `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（string，可选）：搜索的文件或目录，默认为当前工作目录。
  - `glob`（string，可选）：过滤文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（integer，可选）：限制输出前 N 条匹配行，必须为正整数。可选——若未指定则显示所有匹配。
- **行为：**
  - 可用时使用 ripgrep 快速搜索，否则回退到基于 JavaScript 的搜索实现。
  - 返回带有文件路径和行号的匹配行。
  - 默认不区分大小写。
  - 遵循 .gitignore、.qwenignore 以及配置的自定义 Qwen 忽略文件。
  - 限制输出量防止上下文溢出。
- **输出（`llmContent`）：** 格式化的匹配结果字符串，例如：

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

结合文件过滤和自定义结果限制搜索模式：

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 7. `edit`（Edit）

`edit` 替换文件中的文本。默认情况下要求 `old_string` 只匹配唯一一处；若有意修改所有出现的位置，请将 `replace_all` 设为 `true`。该工具专为精确、定向的修改而设计，需要在 `old_string` 周围提供充足的上下文，以确保修改的是正确位置。

- **工具名称：** `edit`
- **显示名称：** Edit
- **文件：** `edit.ts`
- **参数：**
  - `file_path`（string，必填）：要修改的文件的绝对路径。
  - `old_string`（string，必填）：要替换的精确字面文本。

    **重要：** 此字符串必须能唯一定位到要更改的单个位置。应在目标文本周围包含足够的上下文，并精确匹配空白符和缩进。若 `old_string` 为空，工具将尝试在 `file_path` 创建新文件，内容为 `new_string`。

  - `new_string`（string，必填）：用于替换 `old_string` 的精确字面文本。
  - `replace_all`（boolean，可选）：替换所有出现的 `old_string`，默认为 `false`。

- **行为：**
  - 不编辑原始 Jupyter notebook JSON，`.ipynb` cell 编辑请使用 `notebook_edit`。
  - 若 `old_string` 为空且 `file_path` 不存在，则以 `new_string` 为内容创建新文件。
  - 若提供了 `old_string`，则读取 `file_path` 并尝试查找恰好一处匹配，除非 `replace_all` 为 true。
  - 若匹配唯一（或 `replace_all` 为 true），则将文本替换为 `new_string`。
  - **增强可靠性（多阶段编辑纠错）：** 为显著提高编辑成功率，尤其是当模型提供的 `old_string` 可能不够精确时，该工具内置了多阶段编辑纠错机制。
    - 若初始 `old_string` 未找到或匹配多处，工具可借助 Qwen 模型迭代细化 `old_string`（以及可能的 `new_string`）。
    - 这一自我纠错过程尝试识别模型意图修改的唯一片段，使 `edit` 操作在初始上下文略有偏差时也更加稳健。
- **失败条件：** 尽管有纠错机制，以下情况工具仍会失败：
  - `file_path` 不是绝对路径或位于根目录之外。
  - `old_string` 非空，但 `file_path` 不存在。
  - `old_string` 为空，但 `file_path` 已存在。
  - 尝试纠错后仍未在文件中找到 `old_string`。
  - `old_string` 多处匹配、`replace_all` 为 false，且自我纠错机制无法将其解析为单一无歧义匹配。
- **输出（`llmContent`）：**
  - 成功时：`Successfully modified file: /path/to/file.txt (1 replacements).` 或 `Created new file: /path/to/new_file.txt with provided content.`
  - 失败时：说明原因的错误信息（例如 `Failed to edit, 0 occurrences found...`、`Failed to edit because the text matches multiple locations...`）。
- **确认：** 是。显示拟议更改的 diff 并在写入文件前请求用户批准。

## 文件编码与平台特定行为

### 编码检测与保留

读取文件时，Qwen Code 通过多步策略检测文件编码：

1. **UTF-8** — 优先尝试（现代工具链大多输出 UTF-8）
2. **chardet** — 对非 UTF-8 内容进行统计检测
3. **系统编码** — 回退到操作系统代码页（Windows `chcp` / Unix `LANG`）

`write_file` 和 `edit` 均会保留已有文件的原始编码和 BOM（字节顺序标记）。若文件以 GBK 编码且带有 UTF-8 BOM 的方式读取，写回时也会保持相同方式。

### 为新文件配置默认编码

`defaultFileEncoding` 设置控制**新创建**文件（非对已有文件的编辑）的编码：

| 值            | 行为                                                  |
| ------------- | ----------------------------------------------------- |
| _（未设置）_  | UTF-8 无 BOM，并自动进行平台特定调整（见下文）        |
| `utf-8`       | UTF-8 无 BOM，不进行自动调整                          |
| `utf-8-bom`   | 所有新文件均使用带 BOM 的 UTF-8                       |

在 `.qwen/settings.json` 或 `~/.qwen/settings.json` 中设置：

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows：批处理文件使用 CRLF

在 Windows 上，`.bat` 和 `.cmd` 文件会自动以 CRLF（`\r\n`）行尾写入。这是必要的，因为 `cmd.exe` 使用 CRLF 作为行分隔符——仅有 LF 的行尾会导致多行 `if`/`else`、`goto` 标签和 `for` 循环出现问题。无论编码设置如何，此行为仅在 Windows 上生效。

### Windows：PowerShell 脚本使用 UTF-8 BOM

在 **非 UTF-8 系统代码页**的 Windows 上（如 GBK/cp936、Big5/cp950、Shift_JIS/cp932），新创建的 `.ps1` 文件会自动写入 UTF-8 BOM。这是必要的，因为 Windows PowerShell 5.1（Windows 10/11 内置版本）使用系统 ANSI 代码页读取无 BOM 的脚本，若无 BOM，脚本中的非 ASCII 字符将被错误解读。

自动添加 BOM 仅在以下条件全部满足时生效：

- 平台为 Windows
- 系统代码页非 UTF-8（非代码页 65001）
- 文件为新建的 `.ps1` 文件（已有文件保留原始编码）
- 用户**未**在设置中显式设置 `defaultFileEncoding`

PowerShell 7+（pwsh）默认使用 UTF-8 并透明处理 BOM，因此 BOM 在该环境中无害。

若显式将 `defaultFileEncoding` 设置为 `"utf-8"`，则自动 BOM 将被禁用——这是为拒绝 BOM 的代码库或工具链提供的有意为之的退出机制。

### 汇总

| 文件类型        | 平台                        | 自动行为                    |
| --------------- | --------------------------- | --------------------------- |
| `.bat`、`.cmd`  | Windows                     | CRLF 行尾                   |
| `.ps1`          | Windows（非 UTF-8 代码页）  | 新文件使用 UTF-8 BOM        |
| 其他所有类型    | 所有平台                    | UTF-8 无 BOM（默认）        |

这些文件系统工具为 Qwen Code 理解并与你的本地项目上下文进行交互提供了基础。
