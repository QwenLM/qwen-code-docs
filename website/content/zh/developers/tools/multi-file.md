# 多文件读取工具（`read_many_files`）

本文档介绍 Qwen Code 的 `read_many_files` 工具。

## 描述

使用 `read_many_files` 工具可从路径或通配符模式指定的多个文件中读取内容。该工具的行为取决于所提供的文件类型：

- 对于文本文件，此工具会将其内容拼接为一个字符串。
- 对于图像（如 PNG、JPEG）、PDF、音频（MP3、WAV）和视频（MP4、MOV）文件，若明确通过文件名或扩展名请求，则会以 base64 编码格式读取并返回其内容。

`read_many_files` 可用于执行以下任务：概览代码库结构、定位特定功能的实现位置、审阅文档，或从多个配置文件中收集上下文信息。

**注意：** `read_many_files` 仅根据提供的路径或通配符模式查找匹配的文件。若仅提供目录路径（例如 `"/docs"`），将返回空结果；该工具需要明确的匹配模式（例如 `"/docs/*"` 或 `"/docs/*.md"`）才能识别相关文件。

### 参数

`read_many_files` 接受以下参数：

- `paths`（字符串列表，必需）：相对于工具目标目录的 glob 模式或路径数组（例如 `["src/**/*.ts"]`、`["README.md", "docs/*", "assets/logo.png"]`）。
- `exclude`（字符串列表，可选）：要排除的文件/目录的 glob 模式（例如 `["**/*.log", "temp/"]`）。若 `useDefaultExcludes` 为 `true`，这些模式将被追加到默认排除列表中。
- `include`（字符串列表，可选）：额外要包含的 glob 模式。这些模式将与 `paths` 合并（例如 `["*.test.ts"]` 可用于在大范围排除后显式添加测试文件，或 `["images/*.jpg"]` 可用于包含特定类型的图片）。
- `recursive`（布尔值，可选）：是否递归搜索。该行为主要由 glob 模式中的 `**` 控制，默认值为 `true`。
- `useDefaultExcludes`（布尔值，可选）：是否应用一组默认排除模式（例如 `node_modules`、`.git`、非图片/PDF 的二进制文件等）。默认值为 `true`。
- `respect_git_ignore`（布尔值，可选）：查找文件时是否遵循 `.gitignore` 中的规则。默认值为 `true`。

## 如何在 Qwen Code 中使用 `read_many_files`

`read_many_files` 会根据提供的 `paths` 和 `include` 模式搜索匹配的文件，同时尊重 `exclude` 模式以及默认排除规则（如果已启用）。

- 对于文本文件：该工具会读取每个匹配文件的内容（尝试跳过未明确指定为图像/PDF 的二进制文件），并将所有内容拼接为一个字符串，各文件内容之间以分隔符 `--- {filePath} ---` 隔开。默认使用 UTF-8 编码。
- 工具会在最后一个文件内容后插入 `--- End of content ---`。
- 对于图像和 PDF 文件：如果通过文件名或扩展名显式指定（例如 `paths: ["logo.png"]` 或 `include: ["*.pdf"]`），该工具将读取文件并以其 base64 编码字符串形式返回内容。
- 该工具会通过检查文件初始内容中是否包含空字节，来尝试识别并跳过其他二进制文件（即不匹配常见图像/PDF 类型、也未被显式请求的文件）。

用法：

```
read_many_files(paths=["您的文件或路径。"], include=["要额外包含的文件。"], exclude=["要排除的文件。"], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录下的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README 文件、`docs` 目录下的所有 Markdown 文件，以及特定的 logo 图片，并排除某个特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但显式包含测试文件和 `images` 文件夹中的所有 JPEG 文件：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要注意事项

- **二进制文件处理：**
  - **图像/PDF/音频/视频文件：** 该工具可读取常见图像格式（PNG、JPEG 等）、PDF、音频（mp3、wav）及视频（mp4、mov）文件，并以 base64 编码形式返回。这些文件 _必须_ 通过 `paths` 或 `include` 模式显式指定（例如，指定确切的文件名如 `video.mp4`，或使用通配符模式如 `*.mov`）。
  - **其他二进制文件：** 工具会尝试通过检查文件开头内容是否包含空字节来识别并跳过其他类型的二进制文件，并将这些文件从输出中排除。
- **性能：** 读取大量文件或单个超大文件可能消耗较多系统资源。
- **路径精确性：** 请确保路径和 glob 模式相对于工具的目标目录正确指定。对于图像/PDF 文件，请确保所用模式足够具体，以包含这些文件。
- **默认排除项：** 请注意默认的排除模式（如 `node_modules`、`.git`）。如需覆盖默认行为，请设置 `useDefaultExcludes=False`，但请谨慎操作。