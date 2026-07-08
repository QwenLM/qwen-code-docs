# 模拟 `sed -i` 文件历史追踪

## 摘要

支持 issue #4204 中剩余的 B1 项，将一小类 `sed -i 's/pattern/replacement/flags' file` shell 命令视为文件编辑，而不是不透明的 shell 执行。

模拟路径在常规编辑确认 UI 中预览确切的文本更改，使用 `FileHistoryService.trackEdit()` 记录目标文件，通过 `FileSystemService.writeTextFile()` 进行写入，并避免生成 shell。这使得 `/rewind` 能够捕获 agent 工作流中常见的由 shell 驱动的就地编辑。

## 范围

仅模拟简单的就地替换：

- `sed -i 's/foo/bar/' file`
- `sed -i '' -E 's/foo|bar/baz/g' file`
- `sed -i -e 's/foo/bar/' file`

当命令包含复合 shell 操作符、通配符、多个文件、命令替换、sed 表达式内的 shell 变量引用、变量展开的文件路径、如 `-i.bak` 之类的备份后缀、不支持的 sed 标志、不支持的 sed 表达式或后台执行时，不进行模拟。这些情况将保留现有的 shell 执行行为。

支持的替换标志有意限制为 `g` 和数字出现次数。可能影响 stdout 或具有特定于平台的 sed 行为的标志（如 `p`、`I` 和 `M`）将回退到 shell 路径。带有环境前缀的 shell 包装器也会回退，以确保模拟器不会默默忽略区域设置或环境更改。

## 行为

确认阶段读取目标文件，在内存中应用解析后的替换，并返回带有常规文件 diff 的 `ToolEditConfirmationDetails`。

执行阶段在写入前重新读取文件。如果文件内容与用于确认的内容不同，执行将拒绝并返回 `FILE_CHANGED_SINCE_READ`，而不是写入用户未批准的更改。

如果预览文件失败，则通过现有的 shell 路径确认并执行该命令，而不是进行模拟。

确认过程会隐藏外部编辑器的修改操作，因为 ShellTool 不是通用的可修改文件编辑工具。如果 IDE 或宿主在批准 diff 时返回内联的 `newContent` 负载，模拟的 sed 路径将在相同的过期内容保护机制下写入该已批准的内容。

在写入之前，执行会调用 `FileHistoryService.trackEdit(filePath)`，以便当前轮次的文件历史快照捕获编辑前的备份。文件历史调用是尽力而为的，永远不会阻塞编辑。写入本身使用带有读取元数据的 `FileSystemService.writeTextFile()`，以确保编码、BOM 和换行符行为与 Edit 和 WriteFile 工具保持一致。

## 兼容性

不需要更改持久化 schema。这只是现有快照中跟踪文件编辑的另一个来源。不支持的 shell 命令将继续通过现有的 shell 路径执行，因此这不会改变通用的 shell 语义。

## 不在范围内

通用的 shell 变更跟踪仍被推迟。像 `perl -pi`、`python -c`、`awk`、`cat > file`、`mv`、任意脚本以及多文件 `sed` 调用等命令不会被模拟。它们需要更广泛的 shell 影响分析，这是 claude-code 目前不支持的，并且超出了 B1 的范围。