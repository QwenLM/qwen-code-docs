# 忽略文件

本文档概述了 Qwen Code 的 Qwen Ignore（`.qwenignore`）功能。Qwen Code 还会识别通过 `context.fileFiltering.customIgnoreFiles` 配置的自定义忽略文件，其默认兼容文件为 `.agentignore` 和 `.aiignore`。

Qwen Code 具备自动忽略文件的能力，类似于 `.gitignore`（Git 使用）。将路径添加到 `.qwenignore` 或已配置的自定义忽略文件后，支持该功能的工具将排除这些路径，但其他服务（如 Git）仍可看到它们。

## 工作原理

当你将路径添加到这些忽略文件之一时，遵循 Qwen 忽略规则的工具会从操作中排除匹配的文件和目录。例如，当你使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，`.qwenignore` 或已配置的自定义忽略文件中的路径将被自动排除。

大多数情况下，这些忽略文件遵循 `.gitignore` 文件的约定：

- 空行和以 `#` 开头的行会被忽略。
- 支持标准 glob 模式（如 `*`、`?` 和 `[]`）。
- 末尾的 `/` 仅匹配目录。
- 开头的 `/` 表示相对于忽略文件的路径锚定。
- `!` 表示否定某个模式。

你可以随时更新这些忽略文件。要使更改生效，必须重启 Qwen Code 会话。

## 如何使用忽略文件

| 步骤                  | 描述                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **启用忽略规则**      | 在项目根目录创建 `.qwenignore`、默认自定义文件（`.agentignore` / `.aiignore`）或已配置的自定义忽略文件 |
| **添加忽略规则**      | 打开忽略文件并添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt`                         |

默认情况下，Qwen Code 会读取 `.qwenignore`、`.agentignore` 和 `.aiignore`。
要使用其他自定义忽略文件，请配置：

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

当 `context.fileFiltering.respectQwenIgnore` 启用时，`.qwenignore` 始终包含在内。自定义忽略文件路径相对于项目根目录。

### 忽略文件示例

你可以使用任何支持的忽略文件来忽略目录和文件：

```
# 排除 /packages/ 目录及其所有子目录
/packages/

# 排除 apikeys.txt 文件
apikeys.txt
```

你可以在忽略文件中使用通配符 `*`：

```
# 排除所有 .md 文件
*.md
```

最后，你可以使用 `!` 从排除中排除文件和目录：

```
# 排除所有 .md 文件，但保留 README.md
*.md
!README.md
```

要从忽略文件中移除路径，请删除相关行。