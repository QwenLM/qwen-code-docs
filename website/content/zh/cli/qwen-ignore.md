# 忽略文件

本文档概述了 Qwen Code 的 Qwen Ignore（`.qwenignore`）功能。

Qwen Code 支持自动忽略文件，类似于 `.gitignore`（Git 使用的忽略文件）。将路径添加到你的 `.qwenignore` 文件中，可以将这些文件从支持该功能的工具中排除，但这些文件对其他服务（如 Git）仍然可见。

## 工作原理

当你在 `.qwenignore` 文件中添加路径时，支持该文件的工具会在操作中自动排除匹配的文件和目录。例如，当你使用 [`read_many_files`](./tools/multi-file.md) 命令时，所有在 `.qwenignore` 文件中定义的路径都会被自动忽略。

大多数情况下，`.qwenignore` 遵循与 `.gitignore` 文件相同的规则：

- 空行以及以 `#` 开头的行会被忽略。
- 支持标准的通配符模式（如 `*`、`?` 和 `[]`）。
- 路径末尾加上 `/` 表示只匹配目录。
- 路径开头加上 `/` 表示相对于 `.qwenignore` 文件位置进行锚定匹配。
- 使用 `!` 可以对某个模式取反。

你可以随时更新 `.qwenignore` 文件。要使更改生效，必须重启你的 Qwen Code 会话。

## 如何使用 `.qwenignore`

要启用 `.qwenignore`：

1. 在你的项目根目录下创建一个名为 `.qwenignore` 的文件。

要将文件或目录添加到 `.qwenignore`：

1. 打开你的 `.qwenignore` 文件。
2. 添加你想要忽略的路径或文件，例如：`/archive/` 或 `apikeys.txt`。

### `.qwenignore` 示例

你可以使用 `.qwenignore` 来忽略目录和文件：

```

# 排除你的 /packages/ 目录及其所有子目录
/packages/

# 排除你的 apikeys.txt 文件
apikeys.txt
```

你可以在 `.qwenignore` 文件中使用通配符 `*`：

```

# 排除所有 .md 文件
*.md
```

最后，你可以使用 `!` 来从排除列表中重新包含某些文件和目录：

```

# 排除所有 .md 文件，但 README.md 除外
*.md
!README.md
```

要从 `.qwenignore` 文件中移除路径，只需删除相应的行。