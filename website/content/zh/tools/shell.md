# Shell 工具 (`run_shell_command`)

本文档介绍了 Qwen Code 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command` 与底层系统交互、运行脚本或执行命令行操作。`run_shell_command` 会执行给定的 shell 命令。在 Windows 上，命令将通过 `cmd.exe /c` 执行；在其他平台上，命令将通过 `bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command`（string，必填）：要执行的确切 shell 命令。
- `description`（string，可选）：命令用途的简要描述，将展示给用户。
- `directory`（string，可选）：执行命令的目录（相对于项目根目录）。如果未提供，则命令将在项目根目录中运行。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令会作为子进程执行。`run_shell_command` 可以通过 `&` 启动后台进程。该工具会返回详细的执行信息，包括：

- `Command`：实际执行的命令。
- `Directory`：命令执行所在的目录。
- `Stdout`：标准输出流的内容。
- `Stderr`：标准错误流的内容。
- `Error`：子进程报告的错误信息。
- `Exit Code`：命令的退出码。
- `Signal`：如果命令被信号终止，则显示信号编号。
- `Background PIDs`：所有启动的后台进程的 PID 列表。

用法：

```
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.")
```

## `run_shell_command` 示例

列出当前目录中的文件：

```
run_shell_command(command="ls -la")
```

在指定目录中运行脚本：

```
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
```

启动后台服务器：

```
run_shell_command(command="npm run dev &", description="Start development server in background")
```

## 重要说明

- **安全性：** 执行命令时要小心，特别是那些由用户输入构造的命令，以防止安全漏洞。
- **交互式命令：** 避免需要交互式用户输入的命令，因为这可能导致工具挂起。如果可用，请使用非交互式标志（例如 `npm init -y`）。
- **错误处理：** 检查 `Stderr`、`Error` 和 `Exit Code` 字段以确定命令是否成功执行。
- **后台进程：** 当使用 `&` 在后台运行命令时，工具会立即返回，而进程将在后台继续运行。`Background PIDs` 字段将包含后台进程的进程 ID。

## 环境变量

当 `run_shell_command` 执行命令时，它会在子进程的环境中设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否从 CLI 中运行。

## 命令限制

你可以通过在配置文件中使用 `coreTools` 和 `excludeTools` 设置来限制 `run_shell_command` 工具可以执行的命令。

- `coreTools`：要将 `run_shell_command` 限制为特定的一组命令，请在 `coreTools` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"coreTools": ["run_shell_command(git)"]` 将只允许执行 `git` 命令。如果包含通用的 `run_shell_command`，则作为通配符处理，允许执行任何未被明确阻止的命令。
- `excludeTools`：要阻止特定命令，请在 `excludeTools` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"excludeTools": ["run_shell_command(rm)"]` 将阻止执行 `rm` 命令。

验证逻辑设计得既安全又灵活：

1.  **禁用命令链**：工具会自动将使用 `&&`、`||` 或 `;` 连接的命令拆分，并分别验证每个部分。如果链条中的任何一部分不被允许，则整个命令将被阻止。
2.  **前缀匹配**：工具使用前缀匹配。例如，如果你允许 `git`，那么你可以运行 `git status` 或 `git log`。
3.  **黑名单优先**：始终优先检查 `excludeTools` 列表。如果某个命令匹配了被阻止的前缀，即使它也匹配 `coreTools` 中允许的前缀，该命令仍将被拒绝。

### 命令限制示例

**仅允许特定命令前缀**

若只允许 `git` 和 `npm` 命令，阻止其他所有命令：

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`：允许
- `npm install`：允许
- `ls -l`：阻止

**阻止特定命令前缀**

若要阻止 `rm` 命令，同时允许所有其他命令：

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /`：阻止
- `git status`：允许
- `npm install`：允许

**黑名单优先级更高**

如果某个命令前缀同时出现在 `coreTools` 和 `excludeTools` 中，则该命令会被阻止。

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main`：阻止
- `git status`：允许

**阻止所有 shell 命令**

要阻止所有 shell 命令，可以将 `run_shell_command` 通配符添加到 `excludeTools` 中：

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l`：阻止
- `any other command`：阻止

## `excludeTools` 安全说明

`excludeTools` 中针对 `run_shell_command` 的命令限制是基于简单的字符串匹配实现的，很容易被绕过。此功能**不是一种安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 来显式选择可以执行的命令。