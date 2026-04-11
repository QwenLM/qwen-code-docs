# 忽略文件

本文档概述了 Qwen Code 的 Qwen Ignore（`.qwenignore`）功能。

Qwen Code 支持自动忽略文件的功能，类似于 Git 使用的 `.gitignore`。将路径添加到 `.qwenignore` 文件中后，支持该功能的工具将排除这些路径，但它们对其他服务（如 Git）仍然可见。

## 工作原理

当你在 `.qwenignore` 文件中添加路径后，遵循该文件的工具会在操作中排除匹配的文件和目录。例如，当你使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，`.qwenignore` 文件中的任何路径都会被自动排除。

在大多数情况下，`.qwenignore` 遵循 `.gitignore` 文件的约定：

- 空行和以 `#` 开头的行会被忽略。
- 支持标准 glob 模式（例如 `*`、`?` 和 `[]`）。
- 在末尾添加 `/` 将仅匹配目录。
- 在开头添加 `/` 会将路径相对于 `.qwenignore` 文件进行锚定。
- `!` 用于取反模式。

你可以随时更新 `.qwenignore` 文件。要使更改生效，必须重启 Qwen Code 会话。

## 如何使用 `.qwenignore`

| 步骤                   | 说明                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **启用 .qwenignore**   | 在项目根目录下创建名为 `.qwenignore` 的文件                                            |
| **添加忽略规则**       | 打开 `.qwenignore` 文件并添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt`          |

### `.qwenignore` 示例

你可以使用 `.qwenignore` 来忽略目录和文件：

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

你可以在 `.qwenignore` 文件中使用 `*` 通配符：

```
# Exclude all .md files
*.md
```

最后，你可以使用 `!` 取消对特定文件或目录的忽略：

```
# Exclude all .md files except README.md
*.md
!README.md
```

要从 `.qwenignore` 文件中移除路径，只需删除对应的行即可。