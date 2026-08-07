# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk`는 Qwen Code용 실험적 Python SDK입니다. v1은 기존 `stream-json` CLI 프로토콜을 대상으로 하며 transport 표면을 작고 테스트 가능하게 유지합니다.

## 범위

- 패키지 이름: `qwen-code-sdk`
- Import 경로: `qwen_code_sdk`
- 런타임 요구 사항: Python `>=3.10`
- CLI 의존성: v1에서는 외부 `qwen` 실행 파일이 필요합니다
- Transport 범위: 프로세스 transport만 해당
- v1에 미포함: ACP transport, SDK 내장 MCP 서버

## 설치

```bash
pip install qwen-code-sdk
```

프리뷰 릴리스의 경우:

```bash
pip install --pre qwen-code-sdk
```

`qwen`이 `PATH`에 없으면 `path_to_qwen_executable`을 명시적으로 전달하세요.

SDK 코드를 작성하기 전에, 같은 셸에서 CLI가 작동하는지 확인하세요:

```bash
qwen --version
```

## 빠른 시작

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

`asyncio.run()`은 독립 실행형 스크립트에 적합합니다. Jupyter, FastAPI, pytest-asyncio 등 이미 이벤트 루프를 실행 중인 애플리케이션이라면 `await main()`을 호출하세요.

## 동기(Sync) 사용법

호스트 애플리케이션이 async가 아닌 경우 `query_sync`를 사용하세요:

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

## API 표면

### 최상위 진입점

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt`는 다음 중 하나입니다:

- 단일 턴 요청의 경우 `str`
- 멀티 턴 스트림의 경우 `AsyncIterable[SDKUserMessage]`

### `Query`

- SDK 메시지에 대한 async iterable
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| 옵션                       | 타입 / 값                                                   | 설명                                                                                                             |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                      | CLI 프로세스의 작업 디렉토리.                                                                                       |
| `model`                    | `str`                                                      | 이 SDK 세션의 모델 오버라이드.                                                                                      |
| `path_to_qwen_executable`  | `str`                                                      | `qwen`, 명시적 바이너리 경로, 또는 `.js` CLI 번들.                                                                 |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                     | 도구 실행 승인 모드. `yolo`는 모든 도구를 자동 승인합니다. 신뢰할 수 있거나 샌드박스 환경에서만 사용하세요.                    |
| `can_use_tool`             | async 콜백                                                  | 도구 요청에 대한 커스텀 권한 콜백.                                                                                    |
| `env`                      | `dict[str, str]`                                           | CLI 프로세스에 전달할 추가 환경 변수.                                                                                  |
| `system_prompt`            | `str`                                                      | 시스템 프롬프트를 오버라이드합니다.                                                                                    |
| `append_system_prompt`     | `str`                                                      | 시스템 프롬프트에 추가 지시를 덧붙입니다.                                                                                |
| `debug`                    | `bool`                                                     | `stderr` hook이 없을 때 CLI stderr를 stderr로 전달합니다.                                                            |
| `max_session_turns`        | `int`                                                      | CLI가 세션을 종료하기 전 최대 턴 수.                                                                                  |
| `core_tools`               | `list[str]`                                                | 사용 가능한 도구 세트를 제한합니다.                                                                                     |
| `exclude_tools`            | `list[str]`                                                | 일치하는 도구를 제외합니다.                                                                                          |
| `allowed_tools`            | `list[str]`                                                | 콜백 승인 없이 일치하는 도구를 허용합니다.                                                                                |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | CLI에 전달할 인증 모드.                                                                                             |
| `include_partial_messages` | `bool`                                                     | 부분 어시스턴트 스트림 이벤트를 방출합니다.                                                                                |
| `resume`                   | UUID 문자열                                                 | 알려진 세션 id를 재개합니다.                                                                                          |
| `continue_session`         | `bool`                                                     | 최신 CLI 세션을 계속합니다.                                                                                          |
| `session_id`               | UUID 문자열                                                 | 알려진 id로 세션을 시작하거나 연관시킵니다.                                                                               |
| `timeout`                  | 매핑                                                        | 초 단위의 타임아웃.                                                                                               |
| `stderr`                   | 콜블러                                                      | CLI stderr 라인을 받습니다.                                                                                          |

요청에서 `resume`, `continue_session`, `session_id` 중 하나만 사용하세요.
이 세션 옵션들을 조합하면 SDK가 `ValidationError`를 발생시킵니다.

v1에서 미지원:

- `mcp_servers`

### 일반 구성

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

타임아웃 값은 초 단위입니다. `env`는 부모 프로세스 환경 위에 병합되므로,
이 SDK 세션에서 달라야 하는 변수만 전달하면 됩니다. `OPENAI_API_KEY`와 같은
비밀은 소스에 하드코딩하지 말고 부모 환경이나 비밀 관리자에 설정하세요.

## 권한 처리

CLI가 `can_use_tool` 제어 요청을 방출하면, SDK는 이를
`can_use_tool(tool_name, tool_input, context)`를 통해 라우팅합니다.

- 기본 동작: 거부
- 기본 타임아웃: 60초, `timeout.can_use_tool`로 구성 가능
- 타임아웃 폴백: 거부
- 콜백 예외: 오류 메시지와 함께 거부로 변환
- 콜백 컨텍스트: `cancel_event`, `suggestions`, `blocked_path`
- 콜백 계약: `can_use_tool`은 3개의 위치 인수를 가진 async여야 하며,
  `stderr`는 1개의 위치 문자열 인수를 받아야 합니다

예시:

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

`can_use_tool`을 전달하지 않으면, SDK는 기본적으로 권한 요청을 거부합니다.

## 멀티 턴 세션

멀티 턴 세션의 경우, `SDKUserMessage` 객체의 async iterable을 전달하세요:

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

async iterable의 모든 메시지는 사전에 알려져야 합니다. SDK는 이를
순차적으로 CLI에 전송하지만 이전 응답을 제너레이터에 다시 전달할 수 없습니다.
대화형 턴 교환이 필요하면, 각 턴을 별도의 `query()` 호출로 관리하세요.

## 런타임 제어

반환된 `Query` 객체는 실행 중인 CLI 프로세스를 제어할 수 있습니다:

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

현재 작업을 취소하려면 `interrupt()`를, 기본 프로세스를 정리하려면 `close()`를,
나중에 사용할 세션 id를 저장하려면 `get_session_id()`를 사용하세요.

## 세션 재개

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # 알려진 세션을 id로 재개합니다.
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

대신 최신 세션을 계속하려면:

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

`resume`는 애플리케이션이 세션 id를 저장할 때 유용합니다. `continue_session`은
최신 세션의 선택을 CLI에 위임합니다.

## 오류 모델

- `ValidationError`: 잘못된 옵션, 잘못된 UUID, 지원되지 않는 조합
- `ControlRequestTimeoutError`: initialize, interrupt 또는 다른 제어 요청이
  타임아웃됨
- `ProcessExitError`: CLI가 0이 아닌 상태로 종료됨
- `AbortError`: 제어 요청이나 세션이 취소됨

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

## 문제 해결

SDK가 CLI를 시작할 수 없는 경우:

- 대상 환경에서 `qwen --version`이 작동하는지 확인하세요
- 셸이 `nvm`, `pyenv` 또는 기타 비표준 PATH 설정을 사용하는 경우
  `path_to_qwen_executable`을 전달하세요
- 디버깅 중 CLI stderr를 확인하려면 `debug=True` 또는 `stderr=print`를 사용하세요

세션 제어 호출이 타임아웃되는 경우:

- 대상 `qwen` 버전이 `--input-format stream-json`을 지원하는지 확인하세요
- `timeout.control_request`를 늘리세요
- 래퍼 스크립트가 stdout/stderr를 삼키고 있지 않은지 확인하세요

## 저장소 통합

저장소 수준 헬퍼 명령어:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## 실제 E2E 스모크

실제 런타임 확인(실제 `qwen` 프로세스 + 실제 모델 호출)을 위해
저장소 루트에서 실행하세요. npm 헬퍼는 `python3`를 사용하므로
Python `>=3.10` 인터프리터로 해석되는지 확인하세요:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

이 스크립트는 다음을 실행합니다:

- async 단일 턴 쿼리
- async 제어 흐름 (`supported_commands`, 승인 모드 업데이트)
- sync `query_sync` 쿼리

JSON을 출력하며 실패 시 0이 아닌 값을 반환합니다.
