# Shell 工具 (`run_shell_command`)

本文档介绍 Qwen Code 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command` 与底层系统交互、运行脚本或执行命令行操作。如果将 `tools.shell.enableInteractiveShell` 设置设为 `true`，`run_shell_command` 可以执行给定的 shell 命令，包括需要用户输入的交互式命令（例如 `vim`、`git rebase -i`）。

在 Windows 上，命令通过 `cmd.exe /c` 执行。在其他平台上，命令通过 `bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command`（string，必填）：要执行的确切 shell 命令。
- `description`（string，可选）：命令用途的简短描述，将展示给用户。
- `directory`（string，可选）：执行命令的目录（相对于项目根目录）。如果未提供，则命令在项目根目录中运行。
- `is_background`（boolean，必填）：是否在后台运行命令。此参数是必需的，以确保对命令执行模式做出明确决策。对于应继续运行而不阻塞后续命令的长时间运行进程（如开发服务器、watcher 或守护进程），请设置为 true。对于应在继续之前完成的一次性命令，请设置为 false。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令将作为子进程执行。你可以使用 `is_background` 参数，或通过显式向命令添加 `&` 来控制命令在后台还是前台运行。该工具返回有关执行的详细信息，包括：

### 必需的后台参数

对于所有命令执行，`is_background` 参数是**必填**的。这种设计确保 LLM（和用户）必须明确决定每个命令是在后台还是前台运行，从而促进有意图且可预测的命令执行行为。通过强制要求此参数，我们避免了意外回退到前台执行的情况，这在处理长时间运行的进程时可能会阻塞后续操作。

### 后台与前台执行

该工具根据你的明确选择智能处理后台和前台执行：

**在以下情况使用后台执行（`is_background: true`）：**

- 长时间运行的开发服务器：`npm run start`、`npm run dev`、`yarn dev`
- 构建 watcher：`npm run watch`、`webpack --watch`
- 数据库服务器：`mongod`、`mysql`、`redis-server`
- Web 服务器：`python -m http.server`、`php -S localhost:8000`
- 预期无限期运行直到手动停止的任何命令

**在以下情况使用前台执行（`is_background: false`）：**

- 一次性命令：`ls`、`cat`、`grep`
- 构建命令：`npm run build`、`make`
- 安装命令：`npm install`、`pip install`
- Git 操作：`git commit`、`git push`
- 测试运行：`npm test`、`pytest`

### 执行信息

该工具返回有关执行的详细信息，包括：

- `Command`：已执行的命令。
- `Directory`：运行命令的目录。
- `Stdout`：标准输出流的输出。
- `Stderr`：标准错误流的输出。
- `Error`：子进程报告的任何错误消息。
- `Exit Code`：命令的退出代码。
- `Signal`：如果命令被信号终止，则为信号编号。
- `Background PIDs`：启动的任何后台进程的 PID 列表。

用法：

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注意：** `is_background` 参数是必需的，并且必须为每次命令执行显式指定。

## `run_shell_command` 示例

列出当前目录中的文件：

```bash
run_shell_command(command="ls -la", is_background=false)
```

在特定目录中运行脚本：

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

启动后台开发服务器（推荐方法）：

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

启动后台服务器（使用显式 & 的替代方法）：

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

`tools.shell.enableInteractiveShell` 设置控制 shell 命令是通过 `node-pty`（交互式 PTY）还是普通的 `child_process` 后端执行。启用后，`vim`、`git rebase -i` 和 TUI 程序等交互式会话可以正常工作。

此设置在大多数平台上默认为 `true`。在 Windows 内部版本 **<= 19041**（Windows 10 版本 2004 之前）上，它默认为 `false`，因为较旧的 ConPTY 实现存在已知的可靠性问题（输出丢失、挂起）。这与 VS Code 使用的相同分界线一致（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。如果在运行时 `node-pty` 不可用，无论此设置如何，该工具都会回退到 `child_process`。

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

要在 shell 输出中显示颜色，你需要将 `tools.shell.showColor` 设置设为 `true`。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时适用。**

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

你可以通过设置 `tools.shell.pager` 来为 shell 输出设置自定义分页器。在非 Windows 平台上，默认分页器是 `cat`。在 Windows 上未设置默认值。将 `tools.shell.pager` 设置为空字符串以禁用分页器环境变量。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时适用。**

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

`run_shell_command` 工具现在通过集成伪终端（pty）支持交互式命令。这允许你运行需要实时用户输入的命令，例如文本编辑器（`vim`、`nano`）、基于终端的 UI（`htop`）和交互式版本控制操作（`git rebase -i`）。

当交互式命令运行时，你可以从 Qwen Code 向其发送输入。要聚焦于交互式 shell，请按 `ctrl+f`。终端输出（包括复杂的 TUI）将被正确渲染。

## 重要注意事项

- **安全性：** 执行命令时要小心，尤其是那些由用户输入构造的命令，以防止安全漏洞。
- **错误处理：** 检查 `Stderr`、`Error` 和 `Exit Code` 字段以确定命令是否成功执行。
- **后台进程：** 当 `is_background=true` 或命令包含 `&` 时，工具将立即返回，进程将在后台继续运行。`Background PIDs` 字段将包含后台进程的进程 ID。
- **后台执行选择：** `is_background` 参数是必需的，并提供对执行模式的显式控制。你也可以向命令添加 `&` 以进行手动后台执行，但仍必须指定 `is_background` 参数。该参数提供了更清晰的意图，并自动处理后台执行设置。
- **命令描述：** 使用 `is_background=true` 时，命令描述将包含一个 `[background]` 指示器，以清楚地显示执行模式。

## 环境变量

当 `run_shell_command` 执行命令时，它会在子进程的环境中设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否是从 CLI 内部运行的。

## 命令限制

你可以通过使用配置文件中的 `tools.core` 和 `tools.exclude` 设置来限制 `run_shell_command` 工具可以执行的命令。

- `tools.core`：要将 `run_shell_command` 限制为特定的命令集，请在 `tools` 类别下的 `core` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"tools": {"core": ["run_shell_command(git)"]}` 将只允许 `git` 命令。包含通用的 `run_shell_command` 充当通配符，允许任何未被显式阻止的命令。
- `tools.exclude`：要阻止特定命令，请在 `tools` 类别下的 `exclude` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"tools": {"exclude": ["run_shell_command(rm)"]}` 将阻止 `rm` 命令。

验证逻辑设计为安全且灵活：

1.  **禁用命令链接**：该工具自动拆分使用 `&&`、`||` 或 `;` 链接的命令，并分别验证每个部分。如果链接的任何部分被禁止，则整个命令被阻止。
2.  **前缀匹配**：该工具使用前缀匹配。例如，如果你允许 `git`，则可以运行 `git status` 或 `git log`。
3.  **阻止列表优先**：始终首先检查 `tools.exclude` 列表。如果命令匹配被阻止的前缀，它将被拒绝，即使它也匹配 `tools.core` 中允许的前缀。

### 命令限制示例

**仅允许特定的命令前缀**

要仅允许 `git` 和 `npm` 命令，并阻止所有其他命令：

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

**阻止特定的命令前缀**

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

**阻止列表优先**

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

## `excludeTools` 的安全注意事项

`run_shell_command` 在 `excludeTools` 中的特定命令限制基于简单的字符串匹配，并且很容易被绕过。此功能**不是安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 显式选择可以执行的命令。