# Qwen Code 文件系统工具

Qwen Code 提供了一套全面的工具，用于与本地文件系统进行交互。这些工具允许模型在你的控制下读取、写入、列出、搜索和修改文件及目录，敏感操作通常需要确认。

**注意：** 出于安全考虑，所有文件系统工具都在一个 `rootDirectory`（通常是启动 CLI 的当前工作目录）内运行。你提供给这些工具的路径通常应为绝对路径，或相对于该根目录解析的路径。

## 1. `list_directory` (ReadFolder)

`list_directory` 用于列出指定目录路径下直接包含的文件和子目录名称。它可以可选地忽略匹配所提供 glob 模式的条目。

- **Tool name:** `list_directory`
- **Display name:** ReadFolder
- **File:** `ls.ts`
- **参数:**
  - `path` (string, 必填): 要列出内容的目录绝对路径。
  - `ignore` (字符串数组, 可选): 要从列表中排除的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, 可选): 列出文件时是否遵循 `.gitignore` 模式。默认为 `true`。
- **行为:**
  - 返回文件和目录名称列表。
  - 标明每个条目是否为目录。
  - 对条目进行排序，目录在前，然后按字母顺序排列。
- **输出 (`llmContent`):** 类似这样的字符串: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **确认:** 否。

## 2. `read_file` (ReadFile)

`read_file` 用于读取并返回指定文件的内容。该工具支持处理文本文件、图像文件（PNG、JPG、GIF、WEBP、SVG、BMP）以及 PDF 文件。对于文本文件，可以读取特定的行范围；其他二进制文件类型通常会被跳过。

- **Tool name:** `read_file`
- **Display name:** ReadFile
- **File:** `read-file.ts`
- **参数：**
  - `path` (string, 必填): 要读取文件的绝对路径。
  - `offset` (number, 可选): 对于文本文件，表示从第几行开始读取（基于 0 的索引）。需要同时设置 `limit` 参数。
  - `limit` (number, 可选): 对于文本文件，表示最多读取多少行。如果未提供，则默认读取最大行数（例如 2000 行），或者在可行的情况下读取整个文件。
- **行为说明：**
  - 对于文本文件：返回文件内容。若使用了 `offset` 和 `limit`，则只返回对应区间的行内容，并标明是否因行数限制或单行长度限制而被截断。
  - 对于图像和 PDF 文件：以适合模型消费的 base64 编码数据结构形式返回文件内容。
  - 对于其他二进制文件：尝试识别并跳过这些文件，返回提示信息表明这是一个通用二进制文件。
- **输出格式** (`llmContent`)：
  - 文本文件：返回文件内容，可能带有截断提示前缀（如 `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 图像/PDF 文件：返回一个包含 `inlineData` 的对象，其中含有 `mimeType` 和 base64 格式的 `data`（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - 其他二进制文件：返回类似这样的消息 `Cannot display content of binary file: /path/to/data.bin`。
- **确认操作：** 否。

## 3. `write_file` (WriteFile)

`write_file` 将内容写入指定文件。如果文件已存在，则会被覆盖。如果文件不存在，则会创建该文件（以及任何必要的父目录）。

- **Tool name:** `write_file`
- **Display name:** WriteFile
- **File:** `write-file.ts`
- **Parameters:**
  - `file_path` (string, required): 要写入文件的绝对路径。
  - `content` (string, required): 要写入文件的内容。
- **Behavior:**
  - 将提供的 `content` 写入 `file_path`。
  - 如果父目录不存在，则会自动创建。
- **Output (`llmContent`):** 成功消息，例如：`Successfully overwrote file: /path/to/your/file.txt` 或 `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **Confirmation:** 是。在写入前会显示变更的 diff 并请求用户确认。

## 4. `glob` (FindFiles)

`glob` 用于查找匹配特定 glob 模式的文件（例如：`src/**/*.ts`、`*.md`），返回按修改时间排序的绝对路径（最新的在前）。

- **Tool name:** `glob`
- **Display name:** FindFiles
- **File:** `glob.ts`
- **参数:**
  - `pattern` (string, 必填): 要匹配的 glob 模式（例如：`"*.py"`、`"src/**/*.js"`）。
  - `path` (string, 可选): 要搜索的目录的绝对路径。如果省略，则在工具的根目录中搜索。
  - `case_sensitive` (boolean, 可选): 搜索是否区分大小写。默认为 `false`。
  - `respect_git_ignore` (boolean, 可选): 是否遵循 .gitignore 中定义的忽略规则。默认为 `true`。
- **行为:**
  - 在指定目录内搜索与 glob 模式匹配的文件。
  - 返回一个绝对路径列表，按照最近修改的时间倒序排列。
  - 默认会忽略常见的干扰目录，如 `node_modules` 和 `.git`。
- **输出 (`llmContent`):** 类似这样的消息：`Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **确认操作:** 否。

## 5. `search_file_content` (SearchText)

`search_file_content` 用于在指定目录的文件内容中搜索正则表达式模式。可以使用 glob 模式过滤文件。返回包含匹配内容的行，以及对应的文件路径和行号。

- **Tool name:** `search_file_content`
- **Display name:** SearchText
- **File:** `grep.ts`
- **Parameters:**
  - `pattern` (string, required): 要搜索的正则表达式（regex）（例如 `"function\s+myFunction"`）。
  - `path` (string, optional): 要搜索的目录的绝对路径。默认为当前工作目录。
  - `include` (string, optional): 用于过滤搜索文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。如果省略，则搜索大多数文件（遵循常见的忽略规则）。
  - `maxResults` (number, optional): 返回的最大匹配数量，用于防止上下文溢出（默认值：20，最大值：100）。对于广泛搜索使用较低值，对于精确搜索使用较高值。
- **Behavior:**
  - 如果在 Git 仓库中可用，则使用 `git grep` 以提高速度；否则回退到系统 `grep` 或基于 JavaScript 的搜索。
  - 返回匹配的行列表，每行前面带有其文件路径（相对于搜索目录）和行号。
  - 默认将结果限制为最多 20 个匹配项以防止上下文溢出。当结果被截断时，会显示明确的警告并提供优化搜索的建议。
- **Output (`llmContent`):** 格式化的匹配结果字符串，例如：

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---

  WARNING: Results truncated to prevent context overflow. To see more results:
  - Use a more specific pattern to reduce matches
  - Add file filters with the 'include' parameter (e.g., "*.js", "src/**")
  - Specify a narrower 'path' to search in a subdirectory
  - Increase 'maxResults' parameter if you need more matches (current: 20)
  ```

- **Confirmation:** No.

### `search_file_content` 示例

使用默认结果限制搜索模式：

```
search_file_content(pattern="function\s+myFunction", path="src")
```

使用自定义结果限制搜索模式：

```
search_file_content(pattern="function", path="src", maxResults=50)
```

使用文件过滤和自定义结果限制搜索模式：

```
search_file_content(pattern="function", include="*.js", maxResults=10)
```

## 6. `edit`（编辑）

`edit` 工具用于替换文件中的文本。默认情况下，它只会替换第一个匹配项；但如果指定了 `expected_replacements` 参数，则可以替换多个匹配项。该工具专为精确、有针对性的修改而设计，并要求在 `old_string` 前后提供足够的上下文内容，以确保能正确地定位到需要修改的位置。

- **工具名称：** `edit`
- **显示名称：** Edit
- **文件路径：** `edit.ts`
- **参数说明：**
  - `file_path`（字符串，必填）：要修改的文件的绝对路径。
  - `old_string`（字符串，必填）：需要被替换的确切原始文本。

    **重要提示：** 此字符串必须能够唯一标识出你要更改的那一处内容。建议至少包含目标文本前后的各三行上下文信息，并且需完全匹配空格和缩进格式。如果 `old_string` 是空字符串，则工具会尝试在 `file_path` 路径下创建一个新文件，并将 `new_string` 内容写入其中。

  - `new_string`（字符串，必填）：用来替换 `old_string` 的确切新文本。
  - `expected_replacements`（数字，可选）：期望替换的次数，默认值是 `1`。

- **行为逻辑：**
  - 如果 `old_string` 为空并且指定的 `file_path` 文件不存在，则会在该路径创建一个新的文件，并把 `new_string` 作为其内容。
  - 若提供了 `old_string`，则读取对应文件并查找是否存在唯一的匹配项。
  - 找到唯一匹配项时，将其替换为 `new_string`。
  - **增强可靠性机制（多阶段编辑修正）：** 为了显著提高编辑操作的成功率，尤其是在模型提供的 `old_string` 可能不够精准的情况下，此工具引入了多阶段编辑修正机制。
    - 当初始的 `old_string` 没有找到或匹配到了多个位置时，工具可以通过调用 Qwen 模型来逐步优化 `old_string`（以及可能的 `new_string`）。
    - 这种自我修正过程旨在识别出模型原本意图修改的那个唯一片段，从而即使初始上下文稍有偏差也能使 `edit` 操作更加稳定可靠。
- **失败条件：** 尽管具备自动修正能力，但在以下情况中工具仍会执行失败：
  - `file_path` 不是一个绝对路径或者超出了根目录范围。
  - `old_string` 非空但对应的 `file_path` 文件并不存在。
  - `old_string` 为空但 `file_path` 对应的文件已经存在。
  - 经过多次尝试修正后仍未在文件中找到 `old_string`。
  - 发现多个相同的 `old_string` 匹配项，同时自修正机制也无法确定唯一的目标位置。
- **输出结果 (`llmContent`)：**
  - 成功时返回：`Successfully modified file: /path/to/file.txt (1 replacements).` 或者 `Created new file: /path/to/new_file.txt with provided content.`。
  - 失败时返回错误原因描述（例如：`Failed to edit, 0 occurrences found...`、`Failed to edit, expected 1 occurrences but found 2...` 等）。
- **确认流程：** 是的，在实际写入之前，系统会展示即将做出的 diff 更改预览，并请求用户批准后再进行保存。

这些文件系统相关工具构成了 Qwen Code 理解并与本地项目环境交互的基础。