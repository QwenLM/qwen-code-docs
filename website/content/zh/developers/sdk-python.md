```markdown
# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` 是一个用于 Qwen Code 的实验性 Python SDK。v1 版本针对现有的
`stream-json` CLI 协议，保持传输层体积小巧且可测试。

## 范围

- 包名：`qwen-code-sdk`
- 导入路径：`qwen_code_sdk`
- 运行时要求：Python `>=3.10`
- CLI 依赖：v1 需要外部的 `qwen` 可执行文件
- 传输范围：仅支持进程内传输
- v1 不支持：ACP 传输、SDK 内嵌的 MCP 服务器

## 安装

```bash
pip install qwen-code-sdk
```

对于预览版本：

```bash
pip install --pre qwen-code-sdk
```

如果 `qwen` 不在 `PATH` 中，请显式传递 `path_to_qwen_executable`。

在编写 SDK 代码之前，请确保 CLI 在同一个 shell 中可用：

```bash
qwen --version
```

## 快速开始

```python
import asyncio

from qwen_code_sdk import (
    is_sdk_assistant_message,
    is_sdk_result_message,
    query,
)


def extract_text(message):
    content = message.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return repr(content)
    texts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    return "".join(texts) if texts else "[no text content]"


def print_result(message):
    if message.get("is_error"):
        error = message.get("error") or {}
        print(f"Error: {error.get('message', 'Unknown error')}")
        return
    print(message.get("result", ""))


async def main() -> None:
    async with query(
        "解释仓库结构。",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        async for message in result:
            if is_sdk_assistant_message(message):
                print(extract_text(message))
            elif is_sdk_result_message(message):
                print_result(message)


asyncio.run(main())
```

`asyncio.run()` 适用于独立脚本。如果你的应用程序已经在运行事件循环（例如 Jupyter、FastAPI 或 pytest-asyncio），则应使用 `await main()` 代替。

## 同步用法

当你的宿主应用不是异步时，使用 `query_sync`：

```python
from qwen_code_sdk import is_sdk_result_message, query_sync


with query_sync(
    "用一段话概括这个仓库。",
    {
        "cwd": "/path/to/project",
        "path_to_qwen_executable": "qwen",
    },
) as result:
    for message in result:
        if is_sdk_result_message(message):
            if message.get("is_error"):
                error = message.get("error") or {}
                print(f"Error: {error.get('message', 'Unknown error')}")
            else:
                print(message.get("result", ""))
```

## API 面

### 顶层入口

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` 支持：

- `str` 用于单轮请求
- `AsyncIterable[SDKUserMessage]` 用于多轮流式交互

### `Query`

- 可异步迭代的 SDK 消息
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| 选项                          | 类型 / 值                                                   | 描述                                                                                         |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `cwd`                         | `str`                                                       | CLI 进程的工作目录。                                                                         |
| `model`                       | `str`                                                       | 本次 SDK 会话使用的模型覆盖。                                                                |
| `path_to_qwen_executable`     | `str`                                                       | `qwen`、显式的二进制路径，或 `.js` CLI 包。                                                  |
| `permission_mode`             | `default`, `plan`, `auto-edit`, `yolo`                      | 工具执行审批模式。`yolo` 自动批准所有工具；仅在受信任或沙盒环境中使用。                      |
| `can_use_tool`                | async 回调                                                  | 工具请求的自定义权限回调。                                                                   |
| `env`                         | `dict[str, str]`                                            | 传递给 CLI 进程的额外环境变量。                                                              |
| `system_prompt`               | `str`                                                       | 覆盖系统提示词。                                                                             |
| `append_system_prompt`        | `str`                                                       | 在系统提示词后追加额外指令。                                                                 |
| `debug`                       | `bool`                                                      | 当没有 `stderr` 钩子时，将 CLI 的 stderr 转发到 stderr。                                     |
| `max_session_turns`           | `int`                                                       | CLI 结束会话前的最大轮数。                                                                   |
| `core_tools`                  | `list[str]`                                                 | 限制可用的工具集。                                                                           |
| `exclude_tools`               | `list[str]`                                                 | 排除匹配的工具。                                                                             |
| `allowed_tools`               | `list[str]`                                                 | 允许匹配的工具无需回调审批。                                                                 |
| `auth_type`                   | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai`  | 传递给 CLI 的认证模式。                                                                      |
| `include_partial_messages`    | `bool`                                                      | 发射部分助手流事件。                                                                         |
| `resume`                      | UUID 字符串                                                 | 恢复已知的会话 ID。                                                                          |
| `continue_session`            | `bool`                                                      | 继续最近的 CLI 会话。                                                                        |
| `session_id`                  | UUID 字符串                                                 | 使用已知 ID 启动或关联会话。                                                                 |
| `timeout`                     | 映射                                                        | 超时设置（秒）。                                                                             |
| `stderr`                      | callable                                                    | 接收 CLI 的 stderr 行。                                                                      |

在一次请求中只能使用 `resume`、`continue_session` 或 `session_id` 中的一个。如果这些会话选项组合使用，SDK 会抛出 `ValidationError`。

v1 不支持：

- `mcp_servers`

### 通用配置

```python
options = {
    "cwd": "/path/to/project",
    "path_to_qwen_executable": "qwen",
    "model": "qwen-plus",
    "permission_mode": "plan",
    "max_session_turns": 1,
    "env": {
        "OPENAI_MODEL": "qwen-plus",
    },
    "timeout": {
        "control_request": 60,
        "can_use_tool": 60,
        "stream_close": 60,
    },
}
```

超时值单位为秒。`env` 会合并到父进程环境之上，因此你只需要传入本次 SDK 会话需要不同的变量。应将 `OPENAI_API_KEY` 等密钥设置在父环境或密钥管理器中，而不是硬编码在源码中。

## 权限处理

当 CLI 发出 `can_use_tool` 控制请求时，SDK 会通过 `can_use_tool(tool_name, tool_input, context)` 路由。

- 默认行为：拒绝
- 默认超时：60 秒，可通过 `timeout.can_use_tool` 配置
- 超时后的回退：拒绝
- 回调异常：转换为拒绝，并附带错误消息
- 回调上下文：`cancel_event`、`suggestions` 和 `blocked_path`
- 回调约定：`can_use_tool` 必须是异步函数，接受 3 个位置参数；`stderr` 必须接受 1 个位置字符串参数

示例：

```python
import asyncio
from pathlib import Path

from qwen_code_sdk import is_sdk_result_message, query

PROJECT_ROOT = Path("/path/to/project").resolve()


def project_path(tool_name, tool_input):
    key = "path" if tool_name == "list_directory" else "file_path"
    raw_path = tool_input.get(key)
    if not isinstance(raw_path, str) or not raw_path:
        return None

    resolved = (PROJECT_ROOT / raw_path).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT)
    except ValueError:
        return None
    return resolved


async def can_use_tool(tool_name, tool_input, context):
    if tool_name in {"read_file", "list_directory", "write_file"}:
        resolved = project_path(tool_name, tool_input)
        if resolved is None:
            return {
                "behavior": "deny",
                "message": "只允许项目本地路径",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "只能写入 .md 文件"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"此应用程序不允许使用 {tool_name}",
    }


async def main():
    async with query(
        "用简短摘要更新 README.md。",
        {
            "cwd": str(PROJECT_ROOT),
            "path_to_qwen_executable": "qwen",
            "can_use_tool": can_use_tool,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

如果你未传入 `can_use_tool`，SDK 默认会拒绝权限请求。

## 多轮会话

对于多轮会话，传入 `SDKUserMessage` 对象的异步可迭代对象：

```python
import asyncio

from qwen_code_sdk import SDKUserMessage, is_sdk_result_message, query

SESSION_ID = "123e4567-e89b-12d3-a456-426614174000"


async def prompts():
    first: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "创建一个简洁的项目摘要。",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "同时列出测试文件。",
        },
        "parent_tool_use_id": None,
    }
    yield second


async def main():
    async with query(
        prompts(),
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
            "session_id": SESSION_ID,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

异步可迭代对象中的所有消息必须事先已知。SDK 会将它们顺序发送给 CLI，但无法将之前的响应反馈回生成器。如果需要对话式的轮流交互，请将每一轮作为一个独立的 `query()` 调用进行管理。

## 运行时控制

返回的 `Query` 对象可以控制正在运行的 CLI 进程：

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "检查此仓库并解释测试布局。",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        commands = await result.supported_commands()
        print(commands)

        await result.set_permission_mode("plan")
        await result.set_model("qwen-plus")

        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

使用 `interrupt()` 取消当前操作，`close()` 清理底层进程，`get_session_id()` 持久化会话 ID 以供后续使用。

## 会话恢复

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # 通过已知 ID 恢复会话
    async with query(
        "从该会话继续。",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

要继续最近的会话，可以这样做：

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "继续最近的会话。",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

当你的应用程序存储了会话 ID 时，`resume` 非常有用。`continue_session` 则将选择最新会话的职责委托给 CLI。

## 错误模型

- `ValidationError`：选项无效、UUID 无效、不支持组合
- `ControlRequestTimeoutError`：初始化、中断或其他控制请求超时
- `ProcessExitError`：CLI 非零退出
- `AbortError`：控制请求或会话被取消

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Say hello", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"无效的 SDK 选项: {exc}")
except ProcessExitError as exc:
    print(f"qwen 退出，退出码 {exc.exit_code}: {exc}")
```

## 故障排除

如果 SDK 无法启动 CLI：

- 确认目标环境中 `qwen --version` 可以运行
- 如果 shell 使用了 `nvm`、`pyenv` 或其他非标准 PATH 配置，请传入 `path_to_qwen_executable`
- 在调试时使用 `debug=True` 或 `stderr=print` 来显示 CLI 的 stderr

如果会话控制调用超时：

- 检查目标 `qwen` 版本是否支持 `--input-format stream-json`
- 增加 `timeout.control_request`
- 确认没有包装脚本在吞没 stdout/stderr

## 仓库集成

仓库级别的辅助命令：

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## 真实端到端冒烟测试

要进行真实的运行时检查（实际 `qwen` 进程 + 真实模型调用），请从仓库根目录运行。npm 辅助命令使用 `python3`，请确保其解析为 Python `>=3.10` 解释器：

```bash
npm run smoke:sdk:python -- --qwen qwen
```

该脚本运行：

- 异步单轮查询
- 异步控制流（`supported_commands`、权限模式更新）
- 同步 `query_sync` 查询

它会打印 JSON，并在失败时返回非零退出码。
```