# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` 是 Qwen Code 的实验性 Python SDK。v1 基于现有的 `stream-json` CLI 协议，保持传输层简洁且易于测试。

## 范围

- 包名：`qwen-code-sdk`
- 导入路径：`qwen_code_sdk`
- 运行时要求：Python `>=3.10`
- CLI 依赖：v1 需要外部 `qwen` 可执行文件
- 传输范围：仅支持进程传输
- v1 不包含：ACP 传输、SDK 内嵌 MCP 服务器

## 安装

```bash
pip install qwen-code-sdk
```

安装预览版：

```bash
pip install --pre qwen-code-sdk
```

如果 `qwen` 不在 `PATH` 中，请显式传入 `path_to_qwen_executable`。

编写 SDK 代码前，请先确认 CLI 在同一 shell 中能正常运行：

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
        "Explain the repository structure.",
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

`asyncio.run()` 适用于独立脚本。如果你的应用已运行事件循环（如 Jupyter、FastAPI 或 pytest-asyncio），请改用 `await main()`。

## 同步用法

当宿主应用不是异步时，使用 `query_sync`：

```python
from qwen_code_sdk import is_sdk_result_message, query_sync


with query_sync(
    "Summarize this repository in one paragraph.",
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

## API 接口

### 顶层入口

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` 支持以下两种形式：

- `str`：单轮请求
- `AsyncIterable[SDKUserMessage]`：多轮流式对话

### `Query`

- 可异步迭代 SDK 消息
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| 选项                       | 类型 / 可选值                                              | 说明                                                                                                            |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                      | CLI 进程的工作目录。                                                                                            |
| `model`                    | `str`                                                      | 本次 SDK 会话的模型覆盖。                                                                                       |
| `path_to_qwen_executable`  | `str`                                                      | `qwen`、显式二进制路径或 `.js` CLI 包。                                                                         |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                     | 工具执行审批模式。`yolo` 自动批准所有工具，仅在可信或沙箱环境中使用。                                          |
| `can_use_tool`             | 异步回调                                                   | 工具请求的自定义权限回调。                                                                                      |
| `env`                      | `dict[str, str]`                                           | 传递给 CLI 进程的额外环境变量。                                                                                 |
| `system_prompt`            | `str`                                                      | 覆盖系统提示词。                                                                                                |
| `append_system_prompt`     | `str`                                                      | 在系统提示词后追加额外指令。                                                                                    |
| `debug`                    | `bool`                                                     | 在没有 `stderr` 钩子时，将 CLI 的 stderr 转发到 stderr。                                                        |
| `max_session_turns`        | `int`                                                      | CLI 结束会话前的最大轮数。                                                                                      |
| `core_tools`               | `list[str]`                                                | 限制可用工具集。                                                                                                |
| `exclude_tools`            | `list[str]`                                                | 排除匹配的工具。                                                                                                |
| `allowed_tools`            | `list[str]`                                                | 允许匹配的工具无需回调审批。                                                                                    |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | 传递给 CLI 的认证模式。                                                                                         |
| `include_partial_messages` | `bool`                                                     | 发出部分 assistant 流式事件。                                                                                   |
| `resume`                   | UUID 字符串                                                | 恢复已知会话 id。                                                                                               |
| `continue_session`         | `bool`                                                     | 继续最新的 CLI 会话。                                                                                           |
| `session_id`               | UUID 字符串                                                | 以已知 id 启动或关联会话。                                                                                      |
| `timeout`                  | 映射                                                       | 超时时间（秒）。                                                                                                |
| `stderr`                   | 可调用对象                                                 | 接收 CLI 的 stderr 行。                                                                                         |

在一次请求中只能使用 `resume`、`continue_session`、`session_id` 中的一个。组合使用这些会话选项时，SDK 会抛出 `ValidationError`。

v1 不支持：

- `mcp_servers`

### 常用配置

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

超时值单位为秒。`env` 会合并到父进程环境之上，因此只需传入本次 SDK 会话需要不同值的变量。请将 `OPENAI_API_KEY` 等密钥设置在父环境或密钥管理器中，而不是硬编码在源代码里。

## 权限处理

当 CLI 发出 `can_use_tool` 控制请求时，SDK 会将其路由到 `can_use_tool(tool_name, tool_input, context)`。

- 默认行为：拒绝
- 默认超时：60 秒，可通过 `timeout.can_use_tool` 配置
- 超时回退：拒绝
- 回调异常：转换为带错误消息的拒绝
- 回调上下文：`cancel_event`、`suggestions` 和 `blocked_path`
- 回调约定：`can_use_tool` 必须是带 3 个位置参数的异步函数；`stderr` 必须接受 1 个位置字符串参数

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
                "message": "Only project-local paths are allowed",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Only .md files can be written"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} is not allowed by this application",
    }


async def main():
    async with query(
        "Update README.md with a short summary.",
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

如果未传入 `can_use_tool`，SDK 默认拒绝权限请求。

## 多轮会话

对于多轮会话，传入一个 `SDKUserMessage` 对象的异步可迭代对象：

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
            "content": "Create a concise project summary.",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Also list the test files.",
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

异步可迭代对象中的所有消息必须预先确定。SDK 会将它们按顺序发送给 CLI，但无法将前一个响应反馈回生成器。如果需要对话式轮流交互，请将每一轮作为单独的 `query()` 调用来管理。

## 运行时控制

返回的 `Query` 对象可以控制正在运行的 CLI 进程：

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Inspect this repository and explain the test layout.",
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

使用 `interrupt()` 取消当前操作，`close()` 清理底层进程，`get_session_id()` 获取会话 id 以便后续使用。

## 会话恢复

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # 通过已知 id 恢复会话。
    async with query(
        "Continue from this session.",
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

继续最新会话：

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Continue the latest session.",
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

`resume` 适用于应用存储了会话 id 的场景。`continue_session` 将最新会话的选择委托给 CLI。

## 错误模型

- `ValidationError`：无效选项、无效 UUID、不支持的组合
- `ControlRequestTimeoutError`：初始化、中断或其他控制请求超时
- `ProcessExitError`：CLI 以非零退出
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
    print(f"Invalid SDK options: {exc}")
except ProcessExitError as exc:
    print(f"qwen exited with {exc.exit_code}: {exc}")
```

## 故障排查

如果 SDK 无法启动 CLI：

- 在目标环境中验证 `qwen --version` 是否正常
- 如果你的 shell 使用了 `nvm`、`pyenv` 或其他非标准 PATH 设置，请传入 `path_to_qwen_executable`
- 调试时使用 `debug=True` 或 `stderr=print` 来输出 CLI 的 stderr

如果会话控制调用超时：

- 检查目标 `qwen` 版本是否支持 `--input-format stream-json`
- 增大 `timeout.control_request`
- 确认没有包装脚本在吞掉 stdout/stderr

## 仓库集成

仓库级辅助命令：

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## 真实端到端冒烟测试

如需进行真实运行时检查（实际 `qwen` 进程 + 真实模型调用），请在仓库根目录执行。npm 辅助脚本使用 `python3`，请确保其指向 Python `>=3.10` 解释器：

```bash
npm run smoke:sdk:python -- --qwen qwen
```

该脚本会执行：

- 异步单轮查询
- 异步控制流（`supported_commands`、权限模式更新）
- 同步 `query_sync` 查询

它会打印 JSON，失败时返回非零退出码。
