# Qwen Code 文件系统工具

Qwen Code 提供了一套全面的工具，用于与本地文件系统进行交互。这些工具允许模型在您的控制下读取、写入、列出、搜索以及修改文件和目录；对于敏感操作，通常还需您确认。

> [!note]  
> 所有文件系统工具均在 `rootDirectory`（通常为您启动 CLI 时所在的当前工作目录）范围内运行，以确保安全性。您提供给这些工具的路径一般应为绝对路径，或相对于该根目录进行解析。

## 1. `list_directory`（列出文件）

`list_directory` 列出指定目录路径下直接包含的文件和子目录名称。它可选择性地忽略与所提供 glob 模式匹配的条目。

- **工具名称：** `list_directory`
- **显示名称：** ListFiles
- **文件：** `ls.ts`
- **参数：**
  - `path`（字符串，必需）：要列出内容的目录的绝对路径。
  - `ignore`（字符串数组，可选）：用于排除在列表之外的 glob 模式列表（例如 `["*.log", ".git"]`）。
  - `respect_git_ignore`（布尔值，可选）：列出文件时是否遵循 `.gitignore` 中的规则。默认为 `true`。
- **行为：**
  - 返回一个文件和目录名称列表。
  - 标明每个条目是否为目录。
  - 排序时优先列出目录，然后按字母顺序排列所有条目。
- **输出（`llmContent`）：** 类似如下字符串：`/path/to/your/folder 目录列表：\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **是否需要确认：** 否

## 2. `read_file`（ReadFile）

`read_file` 用于读取并返回指定文件的内容。该工具支持文本文件以及当前模型所支持模态的媒体文件（如图像、PDF、音频、视频）。对于文本文件，可指定读取的行范围；对于当前模型不支持模态的媒体文件，将返回带有明确提示的错误信息；其他二进制文件类型通常会被跳过。

- **工具名称：** `read_file`  
- **显示名称：** ReadFile  
- **文件：** `read-file.ts`  
- **参数：**  
  - `path`（字符串，必需）：待读取文件的绝对路径。  
  - `offset`（数字，可选）：仅适用于文本文件，表示从第几行（0 起始索引）开始读取。需同时设置 `limit`。  
  - `limit`（数字，可选）：仅适用于文本文件，表示最多读取的行数。若未指定，则读取默认最大行数（例如 2000 行），或在可行时读取整个文件。  
- **行为：**  
  - **文本文件：** 返回文件内容；若指定了 `offset` 和 `limit`，则仅返回对应行范围的内容，并注明是否因行数限制或单行长度限制而被截断。  
  - **媒体文件（图像、PDF、音频、视频）：** 若当前模型支持该文件模态，则以 base64 编码的 `inlineData` 对象形式返回文件内容；若不支持，则返回带指导建议的错误消息（例如推荐使用特定技能或外部工具）。  
  - **其他二进制文件：** 尝试识别并跳过，返回提示消息说明其为通用二进制文件。  
- **输出：**（`llmContent` 类型）  
  - **文本文件：** 文件内容，可能前置截断提示（例如 `[文件内容已截断：显示第 1–100 行，共 500 行...]\n实际文件内容...`）。  
  - **受支持的媒体文件：** 包含 `inlineData` 字段的对象，其中含 `mimeType` 和 base64 编码的 `data`（例如 `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。  
  - **不受支持的媒体文件：** 一条错误消息字符串，说明当前模型不支持该模态，并提供替代方案建议。  
  - **其他二进制文件：** 类似 `Cannot display content of binary file: /path/to/data.bin` 的提示消息。  
- **是否需要确认：** 否

## 3. `write_file`（写入文件）

`write_file` 将内容写入指定文件。若文件已存在，则会被覆盖；若文件不存在，则会创建该文件及其所需的所有父级目录。

- **工具名称：** `write_file`
- **显示名称：** WriteFile
- **文件：** `write-file.ts`
- **参数：**
  - `file_path`（字符串，必需）：要写入的文件的绝对路径。
  - `content`（字符串，必需）：要写入文件的内容。
- **行为：**
  - 将提供的 `content` 写入 `file_path` 指定的文件。
  - 若父级目录不存在，则自动创建。
- **输出（`llmContent`）：** 成功消息，例如：`已成功覆盖文件：/path/to/your/file.txt` 或 `已成功创建并写入新文件：/path/to/new/file.txt`。
- **确认：** 是。执行前会显示变更的差异（diff），并请求用户确认。

## 4. `glob`（通配符匹配）

`glob` 用于查找匹配特定通配符模式（例如 `src/**/*.ts`、`*.md`）的文件，并按修改时间倒序（最新优先）返回其绝对路径。

- **工具名称：** `glob`
- **显示名称：** Glob
- **文件：** `glob.ts`
- **参数：**
  - `pattern`（字符串，必需）：要匹配的通配符模式（例如 `"*.py"`、`"src/**/*.js"`）。
  - `path`（字符串，可选）：要搜索的目录。若未指定，则使用当前工作目录。
- **行为：**
  - 在指定目录内搜索匹配该通配符模式的文件。
  - 返回一个按修改时间倒序（最新文件在前）排列的绝对路径列表。
  - 默认尊重 `.gitignore` 和 `.qwenignore` 中定义的忽略规则。
  - 结果上限为 100 个文件，以防止上下文溢出。
- **输出（`llmContent`）：** 类似如下格式的消息：`在 /path/to/search/dir 目录中找到 5 个匹配 "*.ts" 的文件，按修改时间排序（最新优先）：\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 个文件已截断] ...`
- **是否需要确认：** 否

## 5. `grep_search`（Grep）

`grep_search` 在指定目录下文件的内容中搜索正则表达式模式，支持通过 glob 模式筛选文件。返回包含匹配项的行，以及对应的文件路径和行号。

- **工具名称：** `grep_search`
- **显示名称：** Grep
- **文件：** `grep.ts`（若不可用，则回退至 `ripGrep.ts`）
- **参数：**
  - `pattern`（字符串，必需）：要在文件内容中搜索的正则表达式模式（例如 `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（字符串，可选）：要搜索的文件或目录，默认为当前工作目录。
  - `glob`（字符串，可选）：用于筛选文件的 glob 模式（例如 `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（数字，可选）：将输出限制为前 N 条匹配行；若未指定，则显示全部匹配结果。
- **行为：**
  - 优先使用 ripgrep 实现快速搜索；若不可用，则回退至基于 JavaScript 的搜索实现。
  - 返回包含匹配内容的行，并附带其文件路径与行号。
  - 默认不区分大小写。
  - 遵守 `.gitignore` 和 `.qwenignore` 中定义的忽略规则。
  - 对输出进行数量限制，防止上下文溢出。
- **输出（`llmContent`）：** 格式化后的匹配结果字符串，例如：

  ```
  在路径 "."（筛选器：`"*.ts"`）中找到 3 处匹配项，模式为 "myFunction"：
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 行已被截断] ...
  ```

- **是否需要确认：** 否

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

## 6. `edit`（编辑）

`edit` 用于替换文件中的文本。默认情况下，它要求 `old_string` 必须精确匹配文件中唯一的一处位置；若需将所有匹配项全部替换，请将 `replace_all` 设为 `true`。该工具专为精准、定向的修改而设计，因此需要在 `old_string` 周围提供足够上下文，以确保修改的是正确的位置。

- **工具名称：** `edit`
- **显示名称：** 编辑
- **文件：** `edit.ts`
- **参数：**
  - `file_path`（字符串，必需）：待修改文件的绝对路径。
  - `old_string`（字符串，必需）：需被替换的精确字面文本。

    **关键注意：** 此字符串必须能唯一标识待修改的单个实例。应包含目标文本周围的充分上下文，并严格匹配空白符与缩进。若 `old_string` 为空，工具将尝试在 `file_path` 处创建一个新文件，并以 `new_string` 作为其内容。

  - `new_string`（字符串，必需）：用于替换 `old_string` 的精确字面文本。
  - `replace_all`（布尔值，可选）：是否替换所有匹配的 `old_string`。默认为 `false`。

- **行为：**
  - 若 `old_string` 为空且 `file_path` 不存在，则创建一个新文件，内容为 `new_string`。
  - 若提供了 `old_string`，则读取 `file_path` 文件，并尝试查找恰好一处匹配（除非 `replace_all` 为 `true`）。
  - 若匹配唯一（或 `replace_all` 为 `true`），则用 `new_string` 替换对应文本。
  - **增强可靠性（多阶段编辑修正）：** 为显著提升编辑成功率（尤其当模型生成的 `old_string` 可能不够精确时），该工具内置了多阶段编辑修正机制。
    - 若初始 `old_string` 未找到匹配项，或匹配到多个位置，工具可调用 Qwen 模型迭代优化 `old_string`（必要时也包括 `new_string`）。
    - 此自修正过程旨在识别模型本意要修改的唯一代码段，从而让 `edit` 操作即使在初始上下文略有偏差的情况下仍保持稳健。

- **失败条件：** 尽管具备修正机制，以下情况仍会导致工具失败：
  - `file_path` 不是绝对路径，或超出根目录范围。
  - `old_string` 非空，但 `file_path` 对应的文件不存在。
  - `old_string` 为空，但 `file_path` 对应的文件已存在。
  - 经多次修正尝试后，`old_string` 仍未在文件中找到。
  - `old_string` 在文件中出现多次，`replace_all` 为 `false`，且自修正机制无法将其收敛至唯一、无歧义的匹配位置。

- **输出（`llmContent`）：**
  - 成功时：`Successfully modified file: /path/to/file.txt (1 replacements).` 或 `Created new file: /path/to/new_file.txt with provided content.`  
  - 失败时：返回说明原因的错误消息（例如：`Failed to edit, 0 occurrences found...`、`Failed to edit because the text matches multiple locations...`）。

- **确认：** 是。会显示拟变更内容的 diff，并在写入文件前请求用户确认。

这些文件系统工具为 Qwen Code 理解并交互本地项目上下文提供了基础能力。