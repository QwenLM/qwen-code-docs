---
description: "使用 Qwen Code Python SDK 集成 AI 编程能力，了解安装、认证、调用示例和常见模式，快速把 agent workflow 接入 Python 项目。"
---

# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` 是面向 Qwen Code 的实验性 Python SDK。v1 版本基于现有的
`stream-json` CLI 协议，旨在保持传输层接口精简且易于测试。

## 适用范围

- 包名：`qwen-code-sdk`
- 导入路径：`qwen_code_sdk`
- 运行环境要求：Python `>=3.10`
- CLI 依赖：v1 版本需要外部 `qwen` 可执行文件
- 传输范围：仅支持进程传输
- v1 未包含：ACP 传输、SDK 内置的 MCP 服务器

## 安装

```bash
pip install qwen-code-sdk
```

如果 `qwen` 不在 `PATH` 中，请显式传入 `path_to_qwen_executable`。

## 快速开始

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main() -> None:
    result = query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    )

    async for message in result:
        if is_sdk_result_message(message):
            print(message["result"])


asyncio.run(main())
```

## API 接口

### 顶层入口

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` 支持以下类型：

- `str`：用于单轮请求
- `AsyncIterable[SDKUserMessage]`：用于多轮流式交互

### `Query`

- SDK 消息的异步迭代器
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

v1 支持的配置项：

- `cwd`
- `model`
- `path_to_qwen_executable`
- `permission_mode`
- `can_use_tool`
- `env`
- `system_prompt`
- `append_system_prompt`
- `debug`
- `max_session_turns`
- `core_tools`
- `exclude_tools`
- `allowed_tools`
- `auth_type`
- `include_partial_messages`
- `resume`
- `continue_session`
- `session_id`
- `timeout`
- `mcp_servers`
- `stderr`

会话参数的优先级固定为：

1. `resume`
2. `continue_session`
3. `session_id`

## 权限处理

当 CLI 发出 `can_use_tool` 控制请求时，SDK 会将其路由至
`can_use_tool(tool_name, tool_input, context)` 进行处理。

- 默认行为：拒绝
- 默认超时时间：60 秒
- 超时回退策略：拒绝
- 回调异常：转换为拒绝并附带错误信息
- 回调上下文：`cancel_event`、`suggestions` 和 `blocked_path`
- 回调契约：`can_use_tool` 必须是异步函数且接收 3 个位置参数；
  `stderr` 必须接收 1 个字符串位置参数

## 错误模型

- `ValidationError`：无效的配置项、无效的 UUID 或不支持的组合
- `ControlRequestTimeoutError`：初始化、中断或其他控制请求超时
- `ProcessExitError`：CLI 进程以非零状态码退出
- `AbortError`：控制请求或会话被取消

## 故障排查

如果 SDK 无法启动 CLI：

- 确认目标环境中 `qwen --version` 可正常运行
- 如果你的 shell 使用了 `nvm`、`pyenv` 或其他非标准 PATH 配置，请传入 `path_to_qwen_executable`
- 调试时可使用 `debug=True` 或 `stderr=print` 以输出 CLI 的 stderr 信息

如果会话控制调用超时：

- 确认目标 `qwen` 版本支持 `--input-format stream-json`
- 增大 `timeout.control_request` 的值
- 确认没有包装脚本吞没 stdout/stderr

## 仓库集成

仓库级辅助命令：

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## 真实 E2E 冒烟测试

如需进行真实的运行时检查（实际 `qwen` 进程 + 真实模型调用），请在仓库根目录下运行。npm 辅助脚本使用 `python3`，请确保其指向 Python `>=3.10` 解释器：

```bash
npm run smoke:sdk:python -- --qwen qwen
```

该脚本将执行：

- 异步单轮查询
- 异步控制流（`supported_commands`、权限模式更新）
- 同步 `query_sync` 查询

脚本会输出 JSON，失败时返回非零状态码。