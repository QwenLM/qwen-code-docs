# Shell 工具（`run_shell_command`）

本文档介绍 Qwen Code 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command` 与底层系统交互、运行脚本或执行命令行操作。`run_shell_command` 执行指定的 shell 命令；若启用了 `tools.shell.enableInteractiveShell` 设置（即设为 `true`），还可执行需要用户输入的交互式命令（例如 `vim`、`git rebase -i`）。

在 Windows 系统上，命令通过 `cmd.exe /c` 执行；在其他平台上，则通过 `bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command`（字符串，必需）：要执行的确切 shell 命令。
- `description`（字符串，可选）：对该命令用途的简要说明，将向用户展示。
- `directory`（字符串，可选）：执行命令所在的目录（相对于项目根目录）。若未提供，则在项目根目录下执行命令。
- `is_background`（布尔值，必需）：是否在后台运行该命令。此参数为必需项，以确保对命令执行模式作出明确决策。对于需持续运行且不应阻塞后续命令的长时间运行进程（例如开发服务器、文件监听器或守护进程），请设为 `true`；对于需在继续执行前完成的一次性命令，请设为 `false`。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令将以子进程形式执行。你可以通过 `is_background` 参数，或在命令末尾显式添加 `&`，来控制命令是在后台还是前台运行。该工具会返回有关执行的详细信息，包括：

### 必填的后台参数

`is_background` 参数在所有命令执行中均为**必填项**。此设计确保大语言模型（LLM）及用户必须明确指定每个命令是后台运行还是前台运行，从而促进有意图且可预测的命令执行行为。将该参数设为必填，可避免因意外回退至前台执行而导致长时运行进程阻塞后续操作。

### 后台执行 vs 前台执行

该工具会根据你的显式选择，智能地处理后台与前台执行：

**以下场景请使用后台执行（`is_background: true`）：**

- 长时间运行的开发服务器：`npm run start`、`npm run dev`、`yarn dev`
- 构建监听器：`npm run watch`、`webpack --watch`
- 数据库服务器：`mongod`、`mysql`、`redis-server`
- Web 服务器：`python -m http.server`、`php -S localhost:8000`
- 任何预期将持续运行、直至手动终止的命令

**以下场景请使用前台执行（`is_background: false`）：**

- 一次性命令：`ls`、`cat`、`grep`
- 构建命令：`npm run build`、`make`
- 安装命令：`npm install`、`pip install`
- Git 操作：`git commit`、`git push`
- 测试运行：`npm test`、`pytest`

### 执行信息

该工具返回有关执行的详细信息，包括：

- `Command`：执行的命令。
- `Directory`：命令运行所在的目录。
- `Stdout`：标准输出流的输出内容。
- `Stderr`：标准错误流的输出内容。
- `Error`：子进程报告的任何错误消息。
- `Exit Code`：命令的退出码。
- `Signal`：若命令因信号而终止，则为该信号编号。
- `Background PIDs`：启动的任何后台进程的进程 ID（PID）列表。

用法：

```bash
run_shell_command(command="你的命令。", description="你对这条命令的描述。", directory="你的执行目录。", is_background=false)
```

**注意：** `is_background` 参数为必填项，每次执行命令时都必须显式指定。

## `run_shell_command` 示例

列出当前目录下的文件：

```bash
run_shell_command(command="ls -la", is_background=false)
```

在指定目录中运行脚本：

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="运行我的自定义脚本", is_background=false)
```

以后台方式启动开发服务器（推荐方式）：

```bash
run_shell_command(command="npm run dev", description="以后台方式启动开发服务器", is_background=true)
```

以后台方式启动服务器（替代方式，显式使用 `&`）：

```bash
run_shell_command(command="npm run dev &", description="以后台方式启动开发服务器", is_background=false)
```

在前台运行构建命令：

```bash
run_shell_command(command="npm run build", description="构建项目", is_background=false)
```

以后台方式启动多个服务：

```bash
run_shell_command(command="docker-compose up", description="启动所有服务", is_background=true)
```

## 配置

你可以通过修改 `settings.json` 文件，或在 Qwen Code 中使用 `/settings` 命令来配置 `run_shell_command` 工具的行为。

### 启用交互式命令

`tools.shell.enableInteractiveShell` 设置控制 Shell 命令是通过 `node-pty`（交互式 PTY）还是基础的 `child_process` 后端执行。启用后，`vim`、`git rebase -i` 以及基于 TUI 的程序等交互式会话可正常工作。

该设置在大多数平台上默认为 `true`。但在 Windows 版本 **≤ 19041**（即 Windows 10 2004 版本之前）的系统上，默认为 `false`，因为旧版 ConPTY 实现存在已知的可靠性问题（例如输出丢失、进程挂起）。此行为与 VS Code 采用的版本分界点一致（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。若运行时 `node-pty` 不可用，则无论该设置为何值，工具均自动回退至 `child_process`。

如需显式覆盖默认值，请在 `settings.json` 中设置该值：

**示例 `settings.json`：**

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

若要在 Shell 输出中显示颜色，需将 `tools.shell.showColor` 设置为 `true`。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时生效。**

**示例 `settings.json`：**

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

可通过设置 `tools.shell.pager` 为 Shell 输出指定自定义分页器。默认分页器为 `cat`。**注意：此设置仅在启用 `tools.shell.enableInteractiveShell` 时生效。**

**示例 `settings.json`：**

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

`run_shell_command` 工具现已通过集成伪终端（pty）支持交互式命令。这使您能够运行需要实时用户输入的命令，例如文本编辑器（`vim`、`nano`）、基于终端的用户界面（`htop`）以及交互式的版本控制操作（`git rebase -i`）。

当交互式命令正在运行时，您可从 Qwen Code 向其发送输入。要聚焦于交互式 Shell，请按 `ctrl+f`。终端输出（包括复杂的 TUI）将被正确渲染。

## 重要注意事项

- **安全性：** 执行命令时需谨慎，尤其是由用户输入构造的命令，以防止安全漏洞。
- **错误处理：** 检查 `Stderr`、`Error` 和 `Exit Code` 字段，以确定命令是否成功执行。
- **后台进程：** 当 `is_background=true` 或命令中包含 `&` 时，工具将立即返回，进程将在后台继续运行。`Background PIDs` 字段将包含该后台进程的进程 ID（PID）。
- **后台执行选项：** `is_background` 参数为必填项，用于显式控制执行模式。你也可以在命令末尾添加 `&` 实现手动后台执行，但 `is_background` 参数仍必须指定。该参数能更清晰地表达意图，并自动完成后台执行的相关设置。
- **命令描述：** 使用 `is_background=true` 时，命令描述中将包含 `[background]` 标识，以明确指示执行模式。

## 环境变量

当 `run_shell_command` 执行命令时，会在子进程的环境中设置 `QWEN_CODE=1` 环境变量。这使得脚本或工具能够检测到它们是否正在 CLI 内部运行。

## 命令限制

你可以通过配置文件中的 `tools.core` 和 `tools.exclude` 设置，限制 `run_shell_command` 工具可执行的命令。

- `tools.core`：若要将 `run_shell_command` 限制为仅允许执行特定命令集，请在配置的 `tools` 类别下 `core` 列表中添加形如 `run_shell_command(<command>)` 的条目。例如，`"tools": {"core": ["run_shell_command(git)"]}` 表示只允许执行 `git` 命令。若在 `core` 列表中包含通用形式 `run_shell_command`（即不带括号参数），则表示通配，允许执行任何未被显式禁止的命令。
- `tools.exclude`：若要禁止特定命令，请在配置的 `tools` 类别下 `exclude` 列表中添加形如 `run_shell_command(<command>)` 的条目。例如，`"tools": {"exclude": ["run_shell_command(rm)"]}` 将禁止执行 `rm` 命令。

该验证逻辑兼顾安全性与灵活性：

1.  **禁用命令链**：工具会自动将使用 `&&`、`||` 或 `;` 连接的多命令语句拆分为独立部分，并分别验证。只要其中任一部分被禁止，整个命令即被拒绝执行。
2.  **前缀匹配**：工具采用前缀匹配方式。例如，若允许 `git`，则 `git status` 和 `git log` 均可执行。
3.  **屏蔽列表优先级更高**：`tools.exclude` 列表始终优先检查。若某命令匹配了屏蔽列表中的前缀，则无论其是否也匹配 `tools.core` 中的允许前缀，该命令均会被拒绝。

### 命令限制示例

**仅允许特定命令前缀**

仅允许 `git` 和 `npm` 命令，阻止所有其他命令：

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

阻止 `rm` 命令，但允许所有其他命令：

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

**阻止列表优先级更高**

若某命令前缀同时出现在 `tools.core` 和 `tools.exclude` 中，则该命令将被阻止。

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

**阻止所有 Shell 命令**

要阻止所有 Shell 命令，可将通配符 `run_shell_command` 添加到 `tools.exclude` 中：

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`：阻止  
- `任何其他命令`：阻止

## `excludeTools` 的安全说明

`excludeTools` 中针对 `run_shell_command` 的命令级限制仅基于简单的字符串匹配，极易被绕过。此功能**并非一种安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 显式指定允许执行的命令。