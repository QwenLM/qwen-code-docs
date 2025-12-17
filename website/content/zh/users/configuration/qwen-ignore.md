# 忽略文件

本文档概述了 Qwen Code 的 Qwen 忽略（`.qwenignore`）功能。

Qwen Code 包含自动忽略文件的功能，类似于 `.gitignore`（由 Git 使用）。将路径添加到你的 `.qwenignore` 文件中将会把这些路径从支持此功能的工具中排除，但这些文件对其他服务（如 Git）仍然可见。

## 工作原理

当你在 `.qwenignore` 文件中添加路径时，支持该文件的工具会在其操作中排除匹配的文件和目录。例如，当你使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，`.qwenignore` 文件中的任何路径都将被自动排除。

大多数情况下，`.qwenignore` 遵循 `.gitignore` 文件的约定：

- 空行和以 `#` 开头的行将被忽略。
- 支持标准的通配符模式（如 `*`、`?` 和 `[]`）。
- 在末尾加上 `/` 只会匹配目录。
- 在开头加上 `/` 会使路径相对于 `.qwenignore` 文件进行锚定。
- `!` 用于否定一个模式。

你可以随时更新 `.qwenignore` 文件。要使更改生效，必须重启你的 Qwen Code 会话。

## 如何使用 `.qwenignore`

| 步骤                   | 描述                                                         |
| ---------------------- | ------------------------------------------------------------ |
| **启用 .qwenignore**   | 在项目根目录下创建一个名为 `.qwenignore` 的文件              |
| **添加忽略规则**       | 打开 `.qwenignore` 文件并添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt` |

### `.qwenignore` 示例

你可以使用 `.qwenignore` 来忽略目录和文件：

```

# 忽略 /packages/ 目录及其所有子目录
/packages/

# 忽略 apikeys.txt 文件
apikeys.txt
```

你可以在 `.qwenignore` 文件中使用通配符 `*`：

```

# 忽略所有 .md 文件
*.md
```

最后，你可以使用 `!` 将某些文件或目录从忽略列表中排除：

```

# 忽略所有 .md 文件，但不包括 README.md
*.md
!README.md
```

若要从 `.qwenignore` 文件中移除路径，请删除相应的行。