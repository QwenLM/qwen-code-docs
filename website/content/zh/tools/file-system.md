# Qwen Code 文件系统工具

Qwen Code 提供了一套全面的工具，用于与本地文件系统进行交互。这些工具允许模型在你的控制下读取、写入、列出、搜索和修改文件及目录，敏感操作通常需要确认。

**注意：** 出于安全考虑，所有文件系统工具都在一个 `rootDirectory`（通常是启动 CLI 的当前工作目录）内运行。你提供给这些工具的路径通常应为绝对路径，或相对于该根目录解析的路径。

## 1. `list_directory` (ListFiles)

`list_directory` 用于列出指定目录路径下直接包含的文件和子目录名称。它可以可选地忽略匹配所提供 glob 模式的条目。

- **Tool name:** `list_directory`
- **Display name:** ListFiles
- **File:** `ls.ts`
- **参数:**
  - `path` (string, 必填): 要列出内容的目录的绝对路径。
  - `ignore` (字符串数组, 可选): 要从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, 可选): 列出文件时是否遵循 `.gitignore` 模式。默认为 `true`。
- **行为:**
  - 返回文件和目录名称的列表。
  - 标明每个条目是否为目录。
  - 对条目进行排序，目录在前，然后按字母顺序排列。
- **输出 (`llmContent`):** 类似这样的字符串：`Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认:** 否。

## 2. `read_file` (ReadFile)

`read_file` 用于读取并返回指定文件的内容。该工具支持处理文本文件、图像文件（PNG、JPG、GIF、WEBP、SVG、BMP）以及 PDF 文件。对于文本文件，可以读取特定的行范围；其他二进制文件类型通常会被跳过。

- **Tool name:** `read_file`
- **Display name:** ReadFile
- **File:** `read-file.ts`
- **参数：**
  - `path` (string, 必填): 要读取文件的绝对路径。
  - `offset` (number, 可选): 对于文本文件，表示从第几行开始读取（基于 0 索引）。需要配合 `limit` 使用。
  - `limit` (number, 可选): 对于文本文件，表示最多读取多少行。如果未设置，则默认读取最大限制行数（例如 2000 行），或者在可行的情况下读取整个文件。
- **行为说明：**
  - 对于文本文件：返回文件内容。若设置了 `offset` 和 `limit`，则只返回对应区间的行内容，并标明是否因行数或单行长度限制而被截断。
  - 对于图像和 PDF 文件：以适合模型消费的 base64 编码数据结构形式返回文件内容。
  - 对于其他二进制文件：尝试识别并跳过这些文件，返回提示信息表明这是一个通用二进制文件。
- **输出格式 (`llmContent`)：**
  - 文本文件：实际文件内容，可能带有截断提示前缀（如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 图像/PDF 文件：包含 `inlineData` 的对象，其中含有 `mimeType` 和 base64 格式的 `data` 字段（示例：`{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 其他二进制文件：类似这样的消息 `Cannot display content of binary file: /path/to/data.bin`。
- **确认操作：** 否

## 3. `write_file` (WriteFile)

`write_file` 将内容写入指定文件。如果文件已存在，则会被覆盖；如果文件不存在，则会创建该文件（以及必要的父目录）。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path` (string, 必填): 要写入文件的绝对路径。
  - `content` (string, 必填): 要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入到 `file_path`。
  - 如果父目录不存在，则会自动创建。
- **输出 (`llmContent`)：** 成功消息，例如：`Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **确认机制：** 是。在写入前会显示变更差异并请求用户批准。

## 4. `glob` (Glob)

`glob` 用于查找匹配特定 glob 模式的文件（例如：`src/**/*.ts`、`*.md`），并返回按修改时间排序的绝对路径（最新的在前）。

- **工具名称：** `glob`
- **显示名称：** Glob
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（字符串，必填）：要匹配的 glob 模式（例如：`"*.py"`、`"src/**/*.js"`）。
  - `path`（字符串，可选）：要搜索的目录。如果未指定，则使用当前工作目录。
- **行为：**
  - 在指定目录中搜索与 glob 模式匹配的文件。
  - 返回一个绝对路径列表，并按照最近修改的时间倒序排列。
  - 默认会遵循 `.gitignore` 和 `.qwenignore` 的规则。
  - 结果限制为最多 100 个文件，以防止上下文溢出。
- **输出 (`llmContent`)：** 类似这样的消息：
  ```
  Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):
  ---
  /path/to/file1.ts
  /path/to/subdir/file2.ts
  ---
  [95 files truncated] ...
  ```
- **确认操作：** 否

## 5. `grep_search` (Grep)

`grep_search` 在指定目录的文件内容中搜索正则表达式模式。可以根据 glob 模式过滤文件。返回包含匹配项的行，以及它们的文件路径和行号。

- **工具名称：** `grep_search`
- **显示名称：** Grep
- **文件：** `ripGrep.ts`（使用 `grep.ts` 作为备选）
- **参数：**
  - `pattern`（字符串，必填）：要在文件内容中搜索的正则表达式模式（例如 `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（字符串，可选）：要搜索的文件或目录。默认为当前工作目录。
  - `glob`（字符串，可选）：用于过滤文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（数字，可选）：将输出限制为前 N 个匹配行。可选——如果未指定，则显示所有匹配项。
- **行为：**
  - 当可用时使用 ripgrep 进行快速搜索；否则回退到基于 JavaScript 的搜索实现。
  - 返回带有文件路径和行号的匹配行。
  - 默认情况下不区分大小写。
  - 遵循 .gitignore 和 .qwenignore 模式。
  - 限制输出以防止上下文溢出。
- **输出 (`llmContent`)：** 格式化的匹配结果字符串，例如：

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

## 6. `edit`（编辑）

`edit` 用于替换文件中的文本。默认情况下，它要求 `old_string` 精确匹配文件中唯一的一处位置；如果你有意要修改所有出现的地方，请将 `replace_all` 设置为 `true`。该工具设计用于精确、有针对性的更改，并且需要在 `old_string` 前后提供足够的上下文内容，以确保能正确地修改目标位置。

- **Tool name:** `edit`
- **Display name:** Edit
- **File:** `edit.ts`
- **参数：**
  - `file_path`（string，必填）：要修改的文件的绝对路径。
  - `old_string`（string，必填）：要被替换的确切原始文本。

    **重要提示：** 此字符串必须能够唯一标识你要更改的那一处内容。它应该至少包含目标文本**之前和之后各 3 行**的上下文，并且必须完全匹配空格与缩进。如果 `old_string` 是空字符串，则工具会尝试在 `file_path` 创建一个新文件，并使用 `new_string` 作为其内容。

  - `new_string`（string，必填）：用来替换 `old_string` 的确切新文本。
  - `replace_all`（boolean，可选）：是否替换所有的 `old_string` 出现位置，默认值为 `false`。

- **行为说明：**
  - 如果 `old_string` 为空，且 `file_path` 文件不存在，则创建一个新文件并写入 `new_string` 作为内容。
  - 如果提供了 `old_string`，则读取 `file_path` 并尝试查找唯一一处匹配项（除非设置了 `replace_all=true`）。
  - 若匹配是唯一的（或启用了 `replace_all`），则用 `new_string` 替换对应文本。
  - **增强可靠性机制（多阶段编辑校正）：** 为了显著提高编辑成功率，特别是在模型提供的 `old_string` 可能不够精准的情况下，该工具引入了多阶段编辑校正机制。
    - 如果初始的 `old_string` 没有找到或者匹配到多个位置，工具可以调用 Qwen 模型来迭代优化 `old_string`（也可能包括 `new_string`）。
    - 这个自我修正过程会尝试识别出模型原本想要修改的那个唯一片段，使 `edit` 操作即使面对略微不完美的初始上下文也更加稳定可靠。

- **失败条件：** 尽管有上述纠错机制，但在以下情况时工具仍会失败：
  - `file_path` 不是绝对路径，或超出了根目录范围。
  - `old_string` 非空但指定的文件不存在。
  - `old_string` 为空但目标文件已存在。
  - 经过尝试修正后仍未在文件中找到 `old_string`。
  - 找到了多个匹配项，而 `replace_all=false`，并且自纠错机制也无法将其收敛至唯一明确的位置。

- **输出 (`llmContent`)：**
  - 成功时返回：`Successfully modified file: /path/to/file.txt (1 replacements).` 或者 `Created new file: /path/to/new_file.txt with provided content.`
  - 失败时返回错误信息，例如：`Failed to edit, 0 occurrences found...` 或 `Failed to edit because the text matches multiple locations...`

- **确认操作：** 是的。在实际写入前，系统会显示即将做出变更的 diff 差异对比，并请求用户批准后再执行修改。

这些文件系统工具为 Qwen Code 提供了理解并与你本地项目上下文交互的基础能力。