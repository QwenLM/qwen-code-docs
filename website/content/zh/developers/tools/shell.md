# Shell 工具 (`run_shell_command`)

本文档介绍了 Qwen Code 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command` 与底层系统交互、运行脚本或执行命令行操作。如果将 `tools.shell.enableInteractiveShell` 设置设为 `true`，`run_shell_command` 将执行指定的 shell 命令，包括需要用户输入的交互式命令（例如 `vim`、`git rebase -i`）。

在 Windows 上，命令通过 `cmd.exe /c` 执行。在其他平台上，命令通过 `bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command`（string，必需）：要执行的确切 shell 命令。
- `description`（string，可选）：命令用途的简要说明，将展示给用户。
- `directory`（string，可选）：执行命令的目录（相对于项目根目录）。如果未提供，命令将在项目根目录中运行。
- `is_background`（boolean，必需）：是否在后台运行命令。此参数为必需项，以确保对命令执行模式做出明确决策。对于开发服务器、监听器或守护进程等应持续运行且不阻塞后续命令的长时进程，请设为 `true`。对于应在继续操作前完成的一次性命令，请设为 `false`。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令将作为子进程执行。你可以通过 `is_background` 参数或在命令末尾显式添加 `&` 来控制命令在后台还是前台运行。该工具会返回详细的执行信息，包括：

### 必需的后台参数

所有命令执行都**必须**提供 `is_background` 参数。此设计确保 LLM（和用户）必须明确决定每个命令应在后台还是前台运行，从而促进有意识且可预测的命令执行行为。通过强制要求此参数，我们避免了意外回退到前台执行，这在处理长时进程时可能会阻塞后续操作。

### 后台与前台执行

该工具会根据你的明确选择智能处理后台和前台执行：

**适用于后台执行 (`is_background: true`) 的场景：**

- 长时运行的开发服务器：`npm run start`、`npm run dev`、`yarn dev`
- 构建监听器：`npm run watch`、`webpack --watch`
- 数据库服务器：`mongod`、`mysql`、`redis-server`
- Web 服务器：`python -m http.server`、`php -S localhost:8000`
- 任何预期会无限期运行直到手动停止的命令

**适用于前台执行 (`is_background: false`) 的场景：**

- 一次性命令：`ls`、`cat`、`grep`
- 构建命令：`npm run build`、`make`
- 安装命令：`npm install`、`pip install`
- Git 操作：`git commit`、`git push`
- 测试运行：`npm test`、`pytest`

### 执行信息

该工具会返回详细的执行信息，包括：

- `Command`：已执行的命令。
- `Directory`：命令运行的目录。
- `Stdout`：标准输出流的输出。
- `Stderr`：标准错误流的输出。
- `Error`：子进程报告的任何错误信息。
- `Exit Code`：命令的退出码。
- `Signal`：如果命令被信号终止，则为信号编号。
- `Background PIDs`：已启动的任何后台进程的 PID 列表。

用法：

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注意：** `is_background` 参数是必需的，必须在每次命令执行时显式指定。

## `run_shell_command` 示例

列出当前目录中的文件：

```bash
run_shell_command(command="ls -la", is_background=false)
```

在指定目录中运行脚本：

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

启动后台开发服务器（推荐方式）：

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

启动后台服务器（使用显式 `&` 的替代方式）：

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

在前台运行构建命令：

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

启动多个后台服务：

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## 配置

你可以通过修改 `settings.json` 文件或在 Qwen Code 中使用 `/settings` 命令来配置 `run_shell_command` 工具的行为。

### 启用交互式命令

`tools.shell.enableInteractiveShell` 设置控制 shell 命令是通过 `node-pty`（交互式 PTY）还是普通的 `child_process` 后端执行。启用后，`vim`、`git rebase -i` 和 TUI 程序等交互式会话将正常工作。

在大多数平台上，此设置默认为 `true`。在 Windows 版本 **<= 19041**（Windows 10 2004 版本之前）上，它默认为 `false`，因为旧版 ConPTY 实现存在已知的可靠性问题（输出丢失、挂起）。这与 VS Code 使用的截止版本一致 ([microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725))。如果运行时 `node-pty` 不可用，无论此设置如何，工具都会回退到 `child_process`。

要显式覆盖默认值，请在 `settings.json` 中设置该值：

**`settings.json` 示例：**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### 在输出中显示颜色

要在 shell 输出中显示颜色，你需要将 `tools.shell.showColor` 设置设为 `true`。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时生效。**

**`settings.json` 示例：**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### 设置分页器

你可以通过设置 `tools.shell.pager` 来为 shell 输出指定自定义分页器。默认分页器为 `cat`。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时生效。**

**`settings.json` 示例：**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## 交互式命令

`run_shell_command` 工具现在通过集成伪终端 (pty) 支持交互式命令。这允许你运行需要实时用户输入的命令，例如文本编辑器（`vim`、`nano`）、终端 UI（`htop`）以及交互式版本控制操作（`git rebase -i`）。

当交互式命令运行时，你可以从 Qwen Code 向其发送输入。要聚焦到交互式 shell，请按 `ctrl+f`。终端输出（包括复杂的 TUI）将被正确渲染。

## 重要说明

- **安全性：** 执行命令时请保持谨慎，尤其是那些由用户输入构造的命令，以防止安全漏洞。
- **错误处理：** 检查 `Stderr`、`Error` 和 `Exit Code` 字段以确定命令是否成功执行。
- **后台进程：** 当 `is_background=true` 或命令包含 `&` 时，工具将立即返回，进程将在后台继续运行。`Background PIDs` 字段将包含后台进程的进程 ID。
- **后台执行选项：** `is_background` 参数是必需的，并提供对执行模式的显式控制。你也可以在命令中添加 `&` 进行手动后台执行，但仍必须指定 `is_background` 参数。该参数能更清晰地表达意图，并自动处理后台执行设置。
- **命令描述：** 使用 `is_background=true` 时，命令描述将包含 `[background]` 指示符，以清晰显示执行模式。

## 环境变量

当 `run_shell_command` 执行命令时，它会在子进程的环境中设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否正在 CLI 内部运行。

## 命令限制

你可以通过在配置文件中使用 `tools.core` 和 `tools.exclude` 设置来限制 `run_shell_command` 工具可执行的命令。

- `tools.core`：要将 `run_shell_command` 限制为特定命令集，请在 `tools` 类别下的 `core` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"tools": {"core": ["run_shell_command(git)"]}` 将仅允许 `git` 命令。包含通用的 `run_shell_command` 将作为通配符，允许任何未被显式阻止的命令。
- `tools.exclude`：要阻止特定命令，请在 `tools` 类别下的 `exclude` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"tools": {"exclude": ["run_shell_command(rm)"]}` 将阻止 `rm` 命令。

验证逻辑旨在兼顾安全性与灵活性：

1.  **禁用命令链**：工具会自动拆分通过 `&&`、`||` 或 `;` 链接的命令，并分别验证每个部分。如果链中的任何部分被禁止，整个命令将被阻止。
2.  **前缀匹配**：工具使用前缀匹配。例如，如果你允许 `git`，则可以运行 `git status` 或 `git log`。
3.  **黑名单优先**：始终优先检查 `tools.exclude` 列表。如果命令匹配被阻止的前缀，即使它也匹配 `tools.core` 中允许的前缀，也会被拒绝。

### 命令限制示例

**仅允许特定命令前缀**

要仅允许 `git` 和 `npm` 命令并阻止其他所有命令：

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`：允许
- `npm install`：允许
- `ls -l`：阻止

**阻止特定命令前缀**

要阻止 `rm` 并允许所有其他命令：

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`：阻止
- `git status`：允许
- `npm install`：允许

**黑名单优先**

如果命令前缀同时存在于 `tools.core` 和 `tools.exclude` 中，它将被阻止。

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`：阻止
- `git status`：允许

**阻止所有 shell 命令**

要阻止所有 shell 命令，请将 `run_shell_command` 通配符添加到 `tools.exclude`：

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`：阻止
- `any other command`：阻止

## 关于 `excludeTools` 的安全说明

`excludeTools` 中针对 `run_shell_command` 的特定命令限制基于简单的字符串匹配，很容易被绕过。此功能**不是安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 显式选择允许执行的命令。