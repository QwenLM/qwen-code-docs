# 多文件读取工具 (`read_many_files`)

本文档描述了用于 Qwen Code 的 `read_many_files` 工具。

## 描述

使用 `read_many_files` 从指定路径或 glob 模式匹配的多个文件中读取内容。此工具的行为取决于提供的文件类型：

- 对于文本文件，该工具会将其内容连接成一个单一字符串。
- 对于图像（如 PNG、JPEG）、PDF、音频（MP3、WAV）和视频（MP4、MOV）文件，如果通过文件名或扩展名明确请求，它会读取并以 base64 编码数据的形式返回。

`read_many_files` 可用于执行诸如概览代码库、查找特定功能实现位置、审查文档或从多个配置文件中收集上下文等任务。

**注意：** `read_many_files` 会根据提供的路径或 glob 模式查找文件。像 `"/docs"` 这样的目录路径将返回空结果；该工具需要像 `"/docs/*"` 或 `"/docs/*.md"` 这样的模式来识别相关文件。

### 参数

`read_many_files` 接受以下参数：

- `paths` (list[string], 必填): 一个 glob 模式或相对于工具目标目录的路径数组（例如 `["src/**/*.ts"]`、`["README.md", "docs/*", "assets/logo.png"]`）。
- `exclude` (list[string], 可选): 要排除的文件/目录的 glob 模式（例如 `["**/*.log", "temp/"]`）。如果 `useDefaultExcludes` 为 true，这些模式会与默认排除模式合并。
- `include` (list[string], 可选): 要包含的额外 glob 模式。这些模式会与 `paths` 合并（例如 `["*.test.ts"]` 用于特别添加测试文件，或者 `["images/*.jpg"]` 用于包含特定类型的图像）。
- `recursive` (boolean, 可选): 是否递归搜索。主要通过 glob 模式中的 `**` 控制。默认值为 `true`。
- `useDefaultExcludes` (boolean, 可选): 是否应用默认的排除模式列表（例如 `node_modules`、`.git`、非图像/PDF 的二进制文件）。默认值为 `true`。
- `respect_git_ignore` (boolean, 可选): 查找文件时是否遵循 .gitignore 模式。默认值为 true。

## 如何在 Qwen Code 中使用 `read_many_files`

`read_many_files` 会根据提供的 `paths` 和 `include` 模式搜索匹配的文件，同时遵守 `exclude` 模式和默认排除规则（如果启用）。

- 对于文本文件：它会读取每个匹配文件的内容（尝试跳过未明确指定为 image/PDF 的二进制文件），并将它们连接成一个字符串，每个文件内容之间用分隔符 `--- {filePath} ---` 分隔。默认使用 UTF-8 编码。
- 对于图像和 PDF 文件：如果通过文件名或扩展名显式指定（例如 `paths: ["logo.png"]` 或 `include: ["*.pdf"]`），该工具会读取文件并将其内容以 base64 编码字符串的形式返回。
- 对于其他二进制文件（不匹配常见 image/PDF 类型且未显式指定的文件），工具会通过检查文件开头是否存在 null 字节来尝试检测并跳过这些文件。

用法：

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录下的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README 文件、`docs` 目录下的所有 Markdown 文件以及一个特定的 logo 图片，但排除一个特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但显式包含测试文件以及 `images` 文件夹中的所有 JPEG 图片：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要说明

- **二进制文件处理：**
  - **图像/PDF/音频/视频文件：** 该工具可以读取常见的图像格式（PNG、JPEG 等）、PDF、音频（mp3、wav）和视频（mp4、mov）文件，并将其作为 base64 编码数据返回。这些文件**必须**通过 `paths` 或 `include` 模式显式指定（例如，指定确切的文件名如 `video.mp4` 或模式如 `*.mov`）。
  - **其他二进制文件：** 该工具会尝试通过检查文件开头内容中的空字节来检测并跳过其他类型的二进制文件。这些文件会被排除在输出之外。
- **性能：** 读取大量文件或单个大文件可能会消耗较多资源。
- **路径指定：** 确保路径和 glob 模式相对于工具的目标目录正确指定。对于图像/PDF 文件，请确保模式足够具体以包含它们。
- **默认排除：** 注意默认的排除模式（如 `node_modules`、`.git`），如果需要覆盖这些模式，可以使用 `useDefaultExcludes=False`，但请谨慎操作。