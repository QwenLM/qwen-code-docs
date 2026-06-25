# 多文件读取（`read_many_files`）

> [!note]
>
> `read_many_files` 之前作为独立工具对外暴露，后已重构为内部工具函数。模型不再直接调用它——`read_file`、`glob` 和 `grep_search` 工具已覆盖单文件和多文件读取场景。以下信息仅供参考。

## 描述

使用 `read_many_files` 读取由路径或 glob 模式指定的多个文件内容。该工具的行为取决于提供的文件类型：

- 对于文本文件，该工具会将它们的内容拼接为单个字符串。
- 对于图像（如 PNG、JPEG）、PDF、音频（MP3、WAV）和视频（MP4、MOV）文件，只要通过文件名或扩展名显式请求，该工具会读取并以 base64 编码数据的形式返回。

`read_many_files` 可用于执行以下任务：获取代码库概览、查找特定功能的实现位置、查阅文档，或从多个配置文件中收集上下文信息。

**注意：** `read_many_files` 会根据提供的路径或 glob 模式查找文件。如果仅提供目录路径（如 `"/docs"`），将返回空结果；该工具需要使用类似 `"/docs/*"` 或 `"/docs/*.md"` 的模式来匹配相关文件。

### 参数

`read_many_files` 接受以下参数：

- `paths` (list[string], 必需)：相对于工具目标目录的 glob 模式或路径数组（例如 `["src/**/*.ts"]`、`["README.md", "docs/*", "assets/logo.png"]`）。
- `exclude` (list[string], 可选)：要排除的文件/目录的 glob 模式（例如 `["**/*.log", "temp/"]`）。如果 `useDefaultExcludes` 为 true，这些模式会添加到默认排除列表中。
- `include` (list[string], 可选)：要额外包含的 glob 模式。这些模式会与 `paths` 合并（例如使用 `["*.test.ts"]` 在广泛排除时专门添加测试文件，或使用 `["images/*.jpg"]` 包含特定类型的图像）。
- `recursive` (boolean, 可选)：是否递归搜索。这主要由 glob 模式中的 `**` 控制。默认值为 `true`。
- `useDefaultExcludes` (boolean, 可选)：是否应用默认排除模式列表（例如 `node_modules`、`.git`、非图像/PDF 的二进制文件）。默认值为 `true`。
- `respect_git_ignore` (boolean, 可选)：查找文件时是否遵循 `.gitignore` 模式。默认值为 true。

## 如何在 Qwen Code 中使用 `read_many_files`

`read_many_files` 会搜索匹配提供的 `paths` 和 `include` 模式的文件，同时遵循 `exclude` 模式和默认排除规则（如果已启用）。

- 对于文本文件：读取每个匹配文件的内容（尝试跳过未显式请求为图像/PDF 的二进制文件），并将其拼接为单个字符串。每个文件的内容之间使用分隔符 `--- {filePath} ---`。默认使用 UTF-8 编码。
- 该工具会在最后一个文件后插入 `--- End of content ---`。
- 对于图像和 PDF 文件：如果通过文件名或扩展名显式请求（例如 `paths: ["logo.png"]` 或 `include: ["*.pdf"]`），该工具会读取文件并以 base64 编码字符串的形式返回其内容。
- 该工具会通过检查文件开头内容是否包含空字节，来尝试检测并跳过其他二进制文件（即不匹配常见图像/PDF 类型或未显式请求的文件）。

用法：

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录中的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README、`docs` 目录中的所有 Markdown 文件以及特定的 logo 图像，同时排除特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但显式包含测试文件以及 `images` 文件夹中的所有 JPEG 图像：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要说明

- **二进制文件处理：**
  - **图像/PDF/音频/视频文件：** 该工具可读取常见图像类型（PNG、JPEG 等）、PDF、音频（mp3、wav）和视频（mp4、mov）文件，并以 base64 编码数据形式返回。这些文件 _必须_ 通过 `paths` 或 `include` 模式显式指定（例如指定确切文件名 `video.mp4` 或使用模式 `*.mov`）。
  - **其他二进制文件：** 该工具会通过检查文件开头内容是否包含空字节，来尝试检测并跳过其他类型的二进制文件。这些文件不会包含在输出结果中。
- **性能：** 读取大量文件或单个超大文件可能会消耗较多资源。
- **路径精确性：** 确保路径和 glob 模式相对于工具的目标目录正确指定。对于图像/PDF 文件，请确保模式足够具体以包含它们。
- **默认排除规则：** 请注意默认排除模式（如 `node_modules`、`.git`）。如果需要覆盖它们，请使用 `useDefaultExcludes=False`，但请谨慎操作。