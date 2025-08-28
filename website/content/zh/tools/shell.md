# Shell 工具 (`run_shell_command`)

本文档描述了用于 Qwen Code 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command` 与底层系统交互、运行脚本或执行命令行操作。`run_shell_command` 会执行给定的 shell 命令。在 Windows 上，命令将通过 `cmd.exe /c` 执行；在其他平台上，命令将通过 `bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command` (string, 必填): 要执行的确切 shell 命令。
- `description` (string, 可选): 命令用途的简要描述，将显示给用户。
- `directory` (string, 可选): 执行命令的目录（相对于项目根目录）。如果未提供，则命令在项目根目录中运行。
- `is_background` (boolean, 必填): 是否在后台运行命令。此参数是必需的，以确保对命令执行模式进行明确的决策。对于应该在不阻塞后续命令的情况下继续运行的长时间运行进程（如开发服务器、监听器或守护进程），设置为 true。对于应在继续执行之前完成的一次性命令，设置为 false。

## 如何在 Qwen Code 中使用 `run_shell_command`

使用 `run_shell_command` 时，命令会作为子进程执行。你可以通过 `is_background` 参数控制命令是在后台还是前台运行，或者显式地在命令后添加 `&`。该工具会返回详细的执行信息，包括：

### 必需的 Background 参数

`is_background` 参数对于所有命令执行来说都是**必需的**。这样设计是为了确保 LLM（以及用户）必须显式决定每个命令是在后台还是前台运行，从而促进命令执行行为的明确性和可预测性。通过将此参数设为必填项，我们可以避免在处理长时间运行的进程时，意外回退到前台执行而导致后续操作被阻塞。

### 后台 vs 前台执行

该工具会根据你的明确选择智能地处理后台和前台执行：

**使用后台执行 (`is_background: true`) 适用于：**

- 长时间运行的开发服务器：`npm run start`、`npm run dev`、`yarn dev`
- 构建监听器：`npm run watch`、`webpack --watch`
- 数据库服务器：`mongod`、`mysql`、`redis-server`
- Web 服务器：`python -m http.server`、`php -S localhost:8000`
- 任何预期会无限期运行直到手动停止的命令

**使用前台执行 (`is_background: false`) 适用于：**

- 一次性命令：`ls`、`cat`、`grep`
- 构建命令：`npm run build`、`make`
- 安装命令：`npm install`、`pip install`
- Git 操作：`git commit`、`git push`
- 测试运行：`npm test`、`pytest`

### 执行信息

该工具会返回详细的执行信息，包括：

- `Command`：执行的命令。
- `Directory`：命令运行的目录。
- `Stdout`：标准输出流的输出内容。
- `Stderr`：标准错误流的输出内容。
- `Error`：子进程报告的任何错误信息。
- `Exit Code`：命令的退出码。
- `Signal`：如果命令被信号终止，则为信号编号。
- `Background PIDs`：启动的任何后台进程的 PID 列表。

用法：

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注意：** `is_background` 参数是必需的，每次命令执行时都必须明确指定。

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

启动后台服务器（使用显式 & 的替代方式）：

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

## 重要说明

- **安全性：** 执行命令时要谨慎，特别是那些由用户输入构造的命令，以防止安全漏洞。
- **交互式命令：** 避免使用需要交互式用户输入的命令，因为这可能导致工具挂起。如果可用，请使用非交互式标志（例如 `npm init -y`）。
- **错误处理：** 检查 `Stderr`、`Error` 和 `Exit Code` 字段以确定命令是否成功执行。
- **后台进程：** 当 `is_background=true` 或命令包含 `&` 时，工具将立即返回，进程将在后台继续运行。`Background PIDs` 字段将包含后台进程的进程 ID。
- **后台执行选择：** `is_background` 参数是必需的，它提供了对执行模式的显式控制。你也可以在命令中添加 `&` 来手动后台执行，但仍然必须指定 `is_background` 参数。该参数提供了更清晰的意图，并自动处理后台执行设置。
- **命令描述：** 当使用 `is_background=true` 时，命令描述将包含 `[background]` 指示器，以清楚地显示执行模式。

## 环境变量

当 `run_shell_command` 执行命令时，它会在子进程的环境中设置 `QWEN_CODE=1` 环境变量。这允许脚本或工具检测它们是否是从 CLI 中运行的。

## 命令限制

你可以通过在配置文件中使用 `coreTools` 和 `excludeTools` 设置来限制 `run_shell_command` 工具可以执行的命令。

- `coreTools`：要将 `run_shell_command` 限制为特定的一组命令，请在 `coreTools` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"coreTools": ["run_shell_command(git)"]` 将只允许执行 `git` 命令。如果包含通用的 `run_shell_command`，则相当于通配符，允许执行任何未被明确阻止的命令。
- `excludeTools`：要阻止特定命令，请在 `excludeTools` 列表中添加格式为 `run_shell_command(<command>)` 的条目。例如，`"excludeTools": ["run_shell_command(rm)"]` 将阻止执行 `rm` 命令。

验证逻辑设计得既安全又灵活：

1.  **禁用命令链**：工具会自动将使用 `&&`、`||` 或 `;` 连接的命令拆分，并分别验证每个部分。如果链条中的任何部分不被允许，则整个命令将被阻止。
2.  **前缀匹配**：工具使用前缀匹配。例如，如果你允许 `git`，那么你可以运行 `git status` 或 `git log`。
3.  **黑名单优先**：始终优先检查 `excludeTools` 列表。如果命令匹配了被阻止的前缀，即使它也匹配了 `coreTools` 中允许的前缀，该命令仍将被拒绝。

### 命令限制示例

**仅允许特定命令前缀**

若只允许执行 `git` 和 `npm` 命令，其他命令均被阻止：

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`：允许
- `npm install`：允许
- `ls -l`：阻止

**阻止特定命令前缀**

若要阻止 `rm` 命令，但允许所有其他命令：

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

## `excludeTools` 安全提醒

`excludeTools` 中针对 `run_shell_command` 的命令限制是基于简单的字符串匹配实现的，很容易被绕过。此功能**不是一种安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `coreTools` 来显式选择可以执行的命令。