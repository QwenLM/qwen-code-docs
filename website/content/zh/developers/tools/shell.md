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
- `is_background`（boolean，可选）：是否在后台运行命令。如果未指定，默认为 `false`（前台执行）。对于应继续运行而不阻塞后续命令的长时间运行进程（如开发服务器、watcher 或守护进程），请设置为 true。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令将作为子进程执行。是否在后台还是前台运行由 `is_background` 参数控制。当 `is_background: true` 时不要添加尾部 `&`：托管的后台路径本身就是后台化机制，工具会拒绝该调用而不是执行命令。该工具返回有关执行的详细信息，包括：

### `is_background` 参数

`is_background` 是可选的——工具的 schema 仅要求 `command`——省略时命令在前台运行。因此需要显式做出决定的是另一种情况：不会自行停止的命令必须标记为 `is_background: true`，因为让它留在前台会阻塞轮次直到超时。

### 后台与前台执行

该工具根据该参数处理后台和前台执行：

**在以下情况使用后台执行（`is_background: true`）：**

- 长时间运行的开发服务器：`npm run start`、`npm run dev`、`yarn dev`
- 构建 watcher：`npm run watch`、`webpack --watch`
- 数据库服务器：`mongod`、`mysql`、`redis-server`
- Web 服务器：`python -m http.server`、`php -S localhost:8000`
- 预期无限期运行直到手动停止的任何命令

**对于**会自行完成的命令，使用前台执行（默认方式），如构建、安装、git 操作和测试运行。

文件读取和搜索根本不适合使用此工具的前台执行：应使用专用工具（`read_file`、`grep_search`、`glob`），而不是该工具自身描述中已排除的 `cat`、`grep` 或 `find`。

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

**注意：** `is_background` 是可选的。省略时命令在前台运行，因此需要显式设置为 `true` 的情况是不会自行停止的命令。

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

注意：显式的 `&` 不是托管的后台机制。当 `is_background: true` 时，工具会在命令运行前拒绝带有尾部 `&` 的调用；当 `is_background=false` 时，shell 会分离进程，因此调用返回但进程未被追踪——它没有后台任务条目，`task_stop` 也无法触及它。对于应在后台运行的命令，始终使用 `is_background=true`。

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

当省略此设置时，显式一次性提示使用 `child_process`；交互式 TUI、ACP、stream-json 输入、仅 stdin 和文件输入会话使用 PTY。在 Windows 内部版本 **<= 19041**（Windows 10 版本 2004 之前）上，PTY 模式会回退到 `child_process`，因为较旧的 ConPTY 实现存在已知的可靠性问题（输出丢失、挂起）。这与 VS Code 使用的相同分界线一致（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。如果在运行时 `node-pty` 不可用，该工具也会回退到 `child_process`。

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
- **后台进程：** 只有 `is_background=true` 会启动受追踪的后台进程：工具立即返回 shell id 和 PID，进程继续运行。shell 级别的 `&` 不会创建受追踪的后台进程——当 `is_background: true` 时工具会拒绝尾部 `&`，当 `is_background=false` 时 shell 会分离命令而工具不会追踪它。
- **后台执行选择：** `is_background` 参数是可选的（schema 仅要求 `command`）；对于不会自行停止的命令，请设置 `is_background: true`，因为让它留在前台会阻塞轮次直到超时。使用 `is_background` 而不是 shell 级别的 `&`；它提供更清晰的意图，且工具会管理后台执行设置。
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