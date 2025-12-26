# 忽略文件

本文档概述了 Qwen Code 的 Qwen Ignore (`.qwenignore`) 功能。

Qwen Code 包含自动忽略文件的功能，类似于 Git 使用的 `.gitignore`。将路径添加到你的 `.qwenignore` 文件中，会将它们从支持此功能的工具中排除，尽管它们对其他服务（如 Git）仍然可见。

## 工作原理

当你向 `.qwenignore` 文件中添加路径时，遵循此文件的工具会将其匹配的文件和目录排除在操作之外。例如，当你使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，任何在 `.qwenignore` 文件中的路径都会被自动排除。

在大多数情况下，`.qwenignore` 遵循 `.gitignore` 文件的约定：

- 空行和以 `#` 开头的行会被忽略。
- 支持标准的 glob 模式（如 `*`、`?` 和 `[]`）。
- 在末尾添加 `/` 只会匹配目录。
- 在开头添加 `/` 会将路径相对于 `.qwenignore` 文件进行锚定。
- `!` 可以否定一个模式。

你可以随时更新 `.qwenignore` 文件。要应用更改，你必须重启 Qwen Code 会话。

## 如何使用 `.qwenignore`

| 步骤                   | 说明                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **启用 .qwenignore**   | 在项目根目录创建一个名为 `.qwenignore` 的文件                                        |
| **添加忽略规则**       | 打开 `.qwenignore` 文件并添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt`        |

### `.qwenignore` 示例

你可以使用 `.qwenignore` 来忽略目录和文件：

```

# 排除 /packages/ 目录及其所有子目录
/packages/

# 排除 apikeys.txt 文件
apikeys.txt
```

你可以在 `.qwenignore` 文件中使用通配符 `*`：

```

# 排除所有 .md 文件
*.md
```

最后，你可以使用 `!` 来取消排除某些文件和目录：

# 排除所有 .md 文件，除了 README.md
*.md
!README.md
```

要从你的 `.qwenignore` 文件中移除路径，删除相关的行即可。