# 忽略文件

本文档概述了 Qwen Code 的 Qwen 忽略（`.qwenignore`）功能。

Qwen Code 支持自动忽略文件，其机制类似于 Git 使用的 `.gitignore`。将路径添加到你的 `.qwenignore` 文件中后，支持该功能的工具将排除这些路径下的文件；但其他服务（例如 Git）仍可正常访问这些文件。

## 工作原理

当你在 `.qwenignore` 文件中添加路径后，遵循该文件的工具会自动在操作中排除匹配的文件和目录。例如，当你使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，`.qwenignore` 文件中列出的所有路径都会被自动排除。

大部分情况下，`.qwenignore` 遵循 `.gitignore` 文件的约定：

- 空行及以 `#` 开头的行会被忽略。
- 支持标准的 glob 模式（例如 `*`、`?` 和 `[]`）。
- 在模式末尾添加 `/` 表示仅匹配目录。
- 在模式开头添加 `/` 表示将路径锚定为相对于 `.qwenignore` 文件的位置。
- 使用 `!` 可对某条模式取反（即取消忽略）。

你可以随时更新 `.qwenignore` 文件。要使更改生效，必须重启你的 Qwen Code 会话。

## 如何使用 `.qwenignore`

| 步骤                   | 说明                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **启用 `.qwenignore`** | 在项目根目录下创建一个名为 `.qwenignore` 的文件                                         |
| **添加忽略规则**       | 打开 `.qwenignore` 文件，添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt`             |

### `.qwenignore` 示例

你可以使用 `.qwenignore` 忽略目录和文件：

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

最后，你可以使用 `!` 将文件或目录从排除列表中恢复（即取消忽略）：

# 排除所有 `.md` 文件，但保留 README.md
*.md
!README.md
```

如需从 `.qwenignore` 文件中移除路径，请删除对应行。