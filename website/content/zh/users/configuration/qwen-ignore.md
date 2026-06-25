# 忽略文件

本文档介绍 Qwen Code 的 Qwen Ignore（`.qwenignore`）功能。Qwen Code 还支持通过 `context.fileFiltering.customIgnoreFiles` 配置自定义忽略文件，默认兼容 `.agentignore` 和 `.aiignore`。

Qwen Code 支持自动忽略文件，类似于 Git 使用的 `.gitignore`。将路径添加到 `.qwenignore` 或已配置的自定义忽略文件后，支持该功能的工具将排除这些路径，但其他服务（如 Git）仍可见这些文件。

## 工作原理

将路径添加到忽略文件后，遵循 Qwen ignore 规则的工具会在操作时排除匹配的文件和目录。例如，使用 [`read_many_files`](../../developers/tools/multi-file) 命令时，`.qwenignore` 或已配置的自定义忽略文件中的路径会被自动排除。

这些忽略文件的语法与 `.gitignore` 文件基本一致：

- 空行和以 `#` 开头的行会被忽略。
- 支持标准 glob 模式（如 `*`、`?` 和 `[]`）。
- 路径末尾加 `/` 仅匹配目录。
- 路径开头加 `/` 表示相对于忽略文件的锚定路径。
- `!` 用于取反某个模式。

你可以随时更新这些忽略文件。更改生效需要重启 Qwen Code 会话。

## 如何使用忽略文件

| 步骤                    | 说明                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **启用忽略规则** | 在项目根目录创建 `.qwenignore`、默认自定义文件（`.agentignore` / `.aiignore`）或已配置的自定义忽略文件 |
| **添加忽略规则**    | 打开忽略文件，添加要忽略的路径，例如：`/archive/` 或 `apikeys.txt`                                                                    |

默认情况下，Qwen Code 读取 `.qwenignore`、`.agentignore` 和 `.aiignore`。
如需使用其他自定义忽略文件，可进行如下配置：

```json
{
  "context": {
    "fileFiltering": {
      "customIgnoreFiles": [".cursorignore"]
    }
  }
}
```

当 `context.fileFiltering.respectQwenIgnore` 启用时，`.qwenignore` 始终生效。自定义忽略文件路径相对于项目根目录。

### 忽略文件示例

你可以使用任意支持的忽略文件来忽略目录和文件：

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

可以在忽略文件中使用通配符 `*`：

```
# Exclude all .md files
*.md
```

也可以使用 `!` 将某些文件从排除范围中恢复：

```
# Exclude all .md files except README.md
*.md
!README.md
```

如需移除忽略规则，删除忽略文件中对应的行即可。
