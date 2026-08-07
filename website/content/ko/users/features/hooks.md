---
title: Hooks
---

# Qwen Code Hooks

## 개요

Qwen Code hooks는 Qwen Code 애플리케이션의 동작을 확장하고 커스터마이징할 수 있는 강력한 메커니즘을 제공합니다. Hooks는 도구 실행 전, 도구 실행 후, 세션 시작/종료 및 기타 주요 이벤트와 같이 애플리케이션 수명주기의 특정 시점에서 사용자 정의 스크립트나 프로그램을 실행할 수 있습니다.

Hooks는 기본적으로 활성화되어 있습니다. 설정 파일(`hooks`와 같은 최상위 레벨)에서 `disableAllHooks`를 `true`로 설정하여 모든 hook을 일시적으로 비활성화할 수 있습니다:

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

이렇게 하면 설정을 삭제하지 않고 모든 hook을 비활성화합니다.

## Hook이란?

Hook은 애플리케이션 흐름의 미리 정의된 시점에서 Qwen Code에 의해 자동으로 실행되는 사용자 정의 스크립트나 프로그램입니다. 이를 통해 사용자는 다음을 수행할 수 있습니다:

- 도구 사용 모니터링 및 감사
- 보안 정책 강제
- 대화에 추가 컨텍스트 주입
- 이벤트에 따른 애플리케이션 동작 커스터마이징
- 외부 시스템 및 서비스와 통합
- 도구 입력이나 응답을 프로그래밍 방식으로 수정

## Hook 실행기 유형

Qwen Code는 네 가지 hook 실행기 유형을 지원합니다:

| 유형       | 설명                                                                                         |
| :--------- | :------------------------------------------------------------------------------------------- |
| `command`  | 셸 명령어를 실행합니다. `stdin`을 통해 JSON을 받고 `stdout`을 통해 결과를 반환합니다.       |
| `http`     | JSON을 지정된 URL로 `POST` 요청 본문으로 전송합니다. HTTP 응답 본문을 통해 결과를 반환합니다.|
| `function` | 등록된 JavaScript 함수를 직접 호출합니다(세션 레벨 hook만).                                  |
| `prompt`   | LLM을 사용하여 hook 입력을 평가하고 결정을 반환합니다.                                       |

### Command Hooks

Command hooks는 자식 프로세스를 통해 명령어를 실행합니다. 입력 JSON은 stdin을 통해 전달되고 출력은 stdout을 통해 반환됩니다.

**설정:**

| 필드            | 유형                     | 필수 | 설명                                        |
| :-------------- | :----------------------- | :--- | :------------------------------------------ |
| `type`          | `"command"`              | 예   | Hook 유형                                   |
| `command`       | `string`                 | 예   | 실행할 명령어                               |
| `name`          | `string`                 | 아니오 | Hook 이름(로깅용)                         |
| `description`   | `string`                 | 아니오 | Hook 설명                                 |
| `timeout`       | `number`                 | 아니오 | 타임아웃(밀리초), 기본값 60000            |
| `async`         | `boolean`                | 아니오 | 백그라운드에서 비동기 실행 여부           |
| `env`           | `Record<string, string>` | 아니오 | 환경 변수                                 |
| `shell`         | `"bash" \| "powershell"` | 아니오 | 사용할 셸                                 |
| `statusMessage` | `string`                 | 아니오 | 실행 중 표시되는 상태 메시지              |

**예시:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks

HTTP hooks는 hook 입력을 POST 요청으로 지정된 URL에 전송합니다. URL 화이트리스트, DNS 레벨 SSRF 보호, 환경 변수 보간 및 기타 보안 기능을 지원합니다.

**설정:**

| 필드             | 유형                     | 필수 | 설명                                                |
| :--------------- | :----------------------- | :--- | :-------------------------------------------------- |
| `type`           | `"http"`                 | 예   | Hook 유형                                           |
| `url`            | `string`                 | 예   | 대상 URL                                            |
| `headers`        | `Record<string, string>` | 아니오 | 요청 헤더(환경 변수 보간 지원)                    |
| `allowedEnvVars` | `string[]`               | 아니오 | URL/헤더에서 허용되는 환경 변수 화이트리스트      |
| `timeout`        | `number`                 | 아니오 | 타임아웃(초), 기본값 600                          |
| `name`           | `string`                 | 아니오 | Hook 이름(로깅용)                                 |
| `statusMessage`  | `string`                 | 아니오 | 실행 중 표시되는 상태 메시지                      |
| `once`           | `boolean`                | 아니오 | 세션당 이벤트당 한 번만 실행(HTTP hook만 해당)    |

**보안 기능:**

- **URL 화이트리스트**: `allowedUrls`를 통해 허용되는 URL 패턴을 구성
- **SSRF 보호**: 프라이빗 IP(10.x.x.x, 172.16-31.x.x, 192.168.x.x 등)를 차단하지만 루프백 주소(127.0.0.1, ::1)는 허용
- **DNS 검증**: DNS 리바인딩 공격을 방지하기 위해 요청 전에 도메인 해석을 검증
- **환경 변수 보간**: `${VAR}` 구문, `allowedEnvVars` 화이트리스트에 있는 변수만 허용

#### 프라이빗 네트워크 hook 허용(관리 환경만 해당)

기본적으로 HTTP hooks는 프라이빗 또는 링크 로컬 IP 범위를 대상으로 할 수 없습니다. hook 수신자가 자체 엔드포인트(예: `172.16.0.0/12`로 해석되는 내부 API 게이트웨이)인 플랫폼 관리 환경에서는 다음 설정으로 IP 범위 검사를 완화할 수 있습니다:

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- 이 설정은 **User, System, SystemDefaults 설정 범위에서만 적용됩니다**. Workspace(프로젝트) 설정에서 설정한 값은 무시되며 경고로 기록되므로, 클론된 저장소에서 자체적으로 이 우회를 부여할 수 없습니다.
- 이 플래그는 일반적인 프라이빗/CGNAT/링크 로컬 **범위** 검사만 완화합니다. 클라우드 메타데이터 엔드포인트는 모든 구성에서 차단된 상태로 유지됩니다: `BLOCKED_HOSTS` 목록은 리터럴로 매칭되고(`metadata.google.internal`, `metadata.azure.internal`, ...), 메타데이터 IP `169.254.169.254`와 `100.100.100.200`은 모든 직렬화된 형태(IPv4 매핑 IPv6인 `::ffff:a9fe:a9fe` 포함)에서 그리고 DNS 해석 후에 차단됩니다.
- `security.allowedHttpHookUrls` 화이트리스트는 독립적으로 계속 적용됩니다. 관리 환경에서는 이 플래그를 화이트리스트와 함께 사용하여 의도한 내부 엔드포인트만 접근 가능하도록 합니다.

> **경고:** 이 플래그를 활성화하면 hook이 네트워크의 내부 인프라에 접근할 수 있습니다. 신뢰할 수 있는 관리 환경에서만 활성화하고, 사용자가 제어하지 않는 저장소에서는 절대 활성화하지 마십시오.

**예시:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

**예시: 외부 판단 서비스 어댑터**

위의 `remote-security-check` 구성은 `http://127.0.0.1:8080/hooks/pre-tool-use`에 이 계약(POST `{tool_name, tool_input, ...}` 입력, `hookSpecificOutput.permissionDecision` 출력)을 말하는 서비스가 이미 실행 중이라고 가정합니다. 다음은 누락된 부분을 채우는 최소한의 stdlib 전용 어댑터로, 구체적인 판단 백엔드에 연결되어 전체를 실행 가능하고 종단 간 테스트 가능하게 만듭니다(스텁이 아닌). `review()` 함수만 백엔드 의존적입니다 — 사용하는 서비스에 맞게 본문과 요청/응답 형태를 교체하면 됩니다; 나머지(서버, fail-open 처리, hook 응답 형태)는 백엔드와 관계없이 동일합니다.

_공개: 아래 사용된 백엔드인 [invinoveritas](https://api.babyblueviper.com)는 작성자가 관련된 서비스로, 이 예시에서 종단 간 검증이 가능한 서비스이기 때문에 사용되었으며 추천이 아닙니다. JSON 판단을 반환하는 모든 HTTP 서비스가 동일하게 작동하며, `review()`만 변경하면 됩니다._

_데이터 처리: `matcher: "*"`를 사용하면 **모든** 도구 호출의 전체 `tool_input`이 판단 백엔드로 전송됩니다 — 해당 입력을 민감한 것으로 취급하십시오(파일 내용, 경로, 시크릿이 포함될 수 있음). 셸 명령어만 판단하면 되는 경우 matcher를 좁히십시오(예: `run_shell_command`)._

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

위의 실제 프로덕션 API에 대해 종단 간 라이브 테스트가 수행되었습니다: 실제로 파괴적인 입력(`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`)은 실제 설명과 함께 `permissionDecision: "deny"`를 반환했고, 안전한 입력(`ls -la`)은 `"allow"`를 반환했습니다. 판단 백엔드의 네트워크/타임아웃/잘못된 응답 문제 발생 시 fail-open하므로, 장애가 정상적인 도구 호출을 차단하지 않습니다 — 위의 `command` hook 예시들이 자체 종료 코드로 적용하는 것과 동일한 규칙입니다.

### Function Hooks

Function hooks는 등록된 JavaScript/TypeScript 함수를 직접 호출합니다. Skill 시스템에서 내부적으로 사용되며, 현재 최종 사용자를 위한 공개 API로는 제공되지 않습니다.

**참고**: 대부분의 사용 사례에서는 설정 파일에서 구성할 수 있는 **command hooks** 또는 **HTTP hooks**를 사용하십시오.

### Prompt Hooks

Prompt hooks는 LLM을 사용하여 hook 입력을 평가하고 결정을 반환합니다. 컨텍스트에 기반한 지능적 결정을 내리는 데 유용합니다(예: 작업 허용 또는 차단 여부 결정).

> **데이터 처리:** Prompt hook은 이벤트 입력을 구성된 모델 제공자에게 전송합니다. 파일 기반 디버그 로깅이 활성화되면 완전히 확장된 prompt hook 요청도 세션 디버그 로그에 기록됩니다. Hook 입력과 디버그 로그를 민감할 수 있는 것으로 취급하십시오.

**작동 방식:**

1. Hook 입력 JSON이 `$ARGUMENTS` 플레이스홀더를 사용하여 프롬프트에 주입됩니다
2. 프롬프트가 LLM(기본값: 현재 모델)로 전송됩니다
3. LLM이 결정이 포함된 JSON 응답을 반환합니다
4. Qwen Code가 결정을 처리하고 실행을 계속하거나 차단합니다

**설정:**

| 필드            | 유형       | 필수 | 설명                                              |
| :-------------- | :--------- | :--- | :------------------------------------------------ |
| `type`          | `"prompt"` | 예   | Hook 유형                                         |
| `prompt`        | `string`   | 예   | LLM에 전송되는 프롬프트. `$ARGUMENTS`로 hook 입력 사용 |
| `model`         | `string`   | 아니오 | 사용할 모델(기본값: 현재 모델)                  |
| `timeout`       | `number`   | 아니오 | 타임아웃(초), 기본값 30                         |
| `name`          | `string`   | 아니오 | Hook 이름(로깅용)                               |
| `description`   | `string`   | 아니오 | Hook 설명                                       |
| `statusMessage` | `string`   | 아니오 | 실행 중 표시되는 상태 메시지                    |

**응답 형식:**

LLM은 다음 구조의 JSON을 반환해야 합니다:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| 필드                | 설명                                                                  |
| :------------------ | :-------------------------------------------------------------------- |
| `ok`                | 허용/계속하려면 `true`, 차단/중지하려면 `false`                       |
| `reason`            | `ok`가 `false`일 때 필수. 모델에게 차단을 설명하기 위해 표시됨        |
| `additionalContext` | 선택 사항. 허용 시 대화에 주입할 추가 컨텍스트                        |

**지원되는 이벤트:**

Prompt hooks는 다음을 포함한 대부분의 hook 이벤트와 함께 사용할 수 있습니다:

- `PreToolUse` - 도구 호출 허용 여부 평가
- `PostToolUse` - 도구 결과를 평가하고 컨텍스트를 주입할 수 있음
- `Stop` - 계속할지 중지할지 결정
- `SubagentStop` - 서브에이전트 결과 평가
- `UserPromptSubmit` - 지원되는 모델 바인딩 프롬프트 평가 또는 보강

**예시: Stop Hook**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

`ok`가 `false`이면 Qwen Code는 계속 작업하며 `reason`을 다음 응답의 컨텍스트로 사용합니다.

**예시: PreToolUse Hook**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "run_shell_command",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## Hook 이벤트

Hook은 Qwen Code 세션 중 특정 시점에서 발생합니다. 각 이벤트는 트리거 조건을 필터링하기 위해 서로 다른 matcher를 지원합니다.

| 이벤트               | 트리거 시점                                     | Matcher 대상                                                 |
| :------------------- | :---------------------------------------------- | :----------------------------------------------------------- |
| `PreToolUse`         | 도구 실행 전                                    | 도구 id (`write_file`, `read_file`, `run_shell_command` 등)  |
| `PostToolUse`        | 도구 실행 성공 후                               | 도구 id                                                      |
| `PostToolUseFailure` | 도구 실행 실패 후                               | 도구 id                                                      |
| `UserPromptSubmit`   | 지원되는 모델 호출 전                           | 없음                                                         |
| `SessionStart`       | 세션 시작 또는 재개 시                          | 소스 (`startup`, `resume`, `clear`, `compact`)               |
| `SessionEnd`         | 세션 종료 시                                    | 이유 (`clear`, `logout`, `prompt_input_exit` 등)             |
| `SessionDelete`      | 명시적으로 선택된 세션 삭제 후                  | 없음                                                         |
| `MessageDisplay`     | 응답이 스트리밍되는 동안 반복적으로             | 없음(항상 발생)                                              |
| `Stop`               | Claude가 응답을 마무리하려고 할 때              | 없음(항상 발생)                                              |
| `SubagentStart`      | 서브에이전트 시작 시                            | 에이전트 유형 (`Bash`, `Explorer`, `Plan` 등)                |
| `SubagentStop`       | 서브에이전트 중지 시                            | 에이전트 유형                                                |
| `PreCompact`         | 대화 압축 전                                    | 트리거 (`manual`, `auto`)                                    |
| `Notification`       | 알림 전송 시                                    | 유형 (`permission_prompt`, `idle_prompt`, `auth_success`)    |
| `PermissionRequest`  | 권한 대화상자 표시 시                           | 도구 id                                                      |
| `PermissionDenied`   | 도구 권한 거부 시                               | 도구 id                                                      |
| `TodoCreated`        | 새 todo 항목 생성 시                            | 없음(항상 발생)                                              |
| `TodoCompleted`      | todo 항목이 완료로 표시될 때                    | 없음(항상 발생)                                              |

### Matcher 패턴

`matcher`는 트리거 조건을 필터링하는 데 사용되는 정규식입니다.

| 이벤트 유형         | 이벤트                                                                                   | Matcher 지원 | Matcher 대상                                                |
| :------------------ | :--------------------------------------------------------------------------------------- | :----------- | :---------------------------------------------------------- |
| 도구 이벤트         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ 정규식    | 도구 id: `write_file`, `read_file`, `run_shell_command` 등  |
| 서브에이전트 이벤트 | `SubagentStart`, `SubagentStop`                                                          | ✅ 정규식    | 에이전트 유형: `Bash`, `Explorer` 등                        |
| 세션 이벤트         | `SessionStart`                                                                           | ✅ 정규식    | 소스: `startup`, `resume`, `clear`, `compact`               |
| 세션 이벤트         | `SessionEnd`                                                                             | ✅ 정규식    | 이유: `clear`, `logout`, `prompt_input_exit` 등             |
| 세션 이벤트         | `SessionDelete`                                                                          | ❌ 아니오    | N/A                                                         |
| 알림 이벤트         | `Notification`                                                                           | ✅ 정확 매칭 | 유형: `permission_prompt`, `idle_prompt`, `auth_success`    |
| 압축 이벤트         | `PreCompact`                                                                             | ✅ 정확 매칭 | 트리거: `manual`, `auto`                                    |
| Todo 이벤트         | `TodoCreated`, `TodoCompleted`                                                           | ❌ 아니오    | N/A                                                         |
| 프롬프트 이벤트     | `UserPromptSubmit`                                                                       | ❌ 아니오    | N/A                                                         |
| 중지 이벤트         | `Stop`                                                                                   | ❌ 아니오    | N/A                                                         |
| 메시지 표시         | `MessageDisplay`                                                                         | ❌ 아니오    | N/A                                                         |

**Matcher 구문:**

- 빈 문자열 `""` 또는 `"*"`는 해당 유형의 모든 이벤트와 매칭
- 표준 정규식 구문 지원(예: `^run_shell_command$`, `read_.*`, `(write_file|edit)`)
- 도구 hook은 `tool_name`에 런타임 도구 id를 받습니다(예: `write_file`). `WriteFile`, `ReadFile`과 같은 내장 표시 이름도 호환성을 위해 matcher 별칭으로 허용되지만, 새 구성에서는 런타임 id를 사용하는 것이 좋습니다.

**예시:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## 입력/출력 규칙

### Hook 입력 구조

모든 hook 실행기는 표준화된 이벤트 입력을 받습니다. 전달 경계는 실행기에 따라 다릅니다:

| Hook 유형  | 입력 수신자                                                    |
| :--------- | :------------------------------------------------------------- |
| `command`  | `stdin`의 JSON을 통한 자식 프로세스                            |
| `http`     | JSON `POST` 본문을 통한 구성된 엔드포인트                      |
| `function` | 신뢰할 수 있는 프로세스 내 콜백                                |
| `prompt`   | 입력이 `$ARGUMENTS`를 대체한 후 구성된 모델 제공자             |

Function hooks는 Qwen 프로세스에서 실행되는 신뢰할 수 있는 코드입니다. 프로세스 내 객체를 받으므로, function hook에 대해 필드를 불변으로 취급해서는 안 됩니다.

Qwen은 hook 프로세스, 엔드포인트, 콜백 또는 모델 제공자가 입력을 보존하거나 전달하는지 제어하지 않습니다. 각 구성된 실행기의 데이터 처리 정책을 검토하십시오.

**공통 필드:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

이벤트별 필드는 hook 유형에 따라 추가됩니다. 서브에이전트에서 실행될 때 `agent_id`와 `agent_type`이 추가로 포함됩니다.

Hook 입력은 확장 가능한 JSON 계약입니다: 기존 이벤트에 새 선택적 필드를 추가할 수 있습니다. 소비자는 알 수 없는 필드를 무시해야 합니다. 알 수 없는 속성을 거부하는 엄격한 디코더는 Qwen Code를 업그레이드하기 전에 각 새 선택적 필드를 명시적으로 허용하도록 업데이트해야 합니다. 보안에 민감한 hook의 경우 디코더 실패가 fail-open 또는 fail-closed 동작을 변경할 수 있으므로, 관리자는 롤아웃 전에 배포된 hook에 대해 업그레이드된 페이로드를 검증해야 합니다.

### Hook 출력 구조

Hook 출력은 `stdout`(command) 또는 HTTP 응답 본문(http)을 통해 JSON으로 반환됩니다.

| 종료 코드 | 동작                                                                                |
| :-------- | :---------------------------------------------------------------------------------- |
| `0`       | 성공. `stdout`의 JSON을 파싱하여 동작을 제어합니다.                                 |
| `2`       | **차단 오류**. `stdout`을 무시하고 `stderr`를 모델에 대한 오류 피드백으로 전달합니다.|
| 기타      | 비차단 오류. `stderr`는 디버그 모드에서만 표시되며 실행이 계속됩니다.              |

**출력 구조:**

Hook 출력은 세 가지 범주의 필드를 지원합니다:

1. **공통 필드**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **최상위 결정**: `decision`, `reason`(일부 이벤트에서 사용)
3. **이벤트별 제어**: `hookSpecificOutput`(`hookEventName` 포함 필수)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### 개별 Hook 이벤트 상세

#### PreToolUse

**용도**: 도구 사용 전에 실행되어 권한 검사, 입력 유효성 검증 또는 컨텍스트 주입을 수행합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**출력 옵션**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" 또는 "ask"(필수)
- `hookSpecificOutput.permissionDecisionReason`: 결정에 대한 설명(필수)
- `hookSpecificOutput.updatedInput`: 원래 입력 대신 사용할 수정된 도구 입력 매개변수
- `hookSpecificOutput.additionalContext`: 추가 컨텍스트 정보

`permissionDecision` 값은 도구가 실행되는지를 제어합니다:

- `"allow"` — 일반적인 승인 프롬프트 없이 도구를 실행합니다.
- `"deny"` — 도구를 차단합니다; 실행되지 않으며 모델에 오류가 반환됩니다.
- `"ask"` — 일시 중지하고 TUI에서 사용자에게 도구 호출 확인을 요청합니다. 확인하면 도구가 한 번 실행되고, 거부하면 취소됩니다. 확인을 요청할 수 없는 컨텍스트 — 헤드리스(`--prompt`) 실행 및 백그라운드 서브에이전트 — 에서 `"ask"`는 `"deny"`로 폴백됩니다.

**참고**: `decision` 및 `reason`과 같은 표준 hook 출력 필드는 내부 클래스에서 기술적으로 지원되지만, 공식 인터페이스는 `permissionDecision` 및 `permissionDecisionReason`와 함께 `hookSpecificOutput`를 기대합니다.

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**용도**: 도구가 성공적으로 완료된 후 실행되어 결과를 처리하거나, 결과를 로깅하거나, 추가 컨텍스트를 주입합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**출력 옵션**:

- `decision`: "allow", "deny", "block"(지정하지 않으면 기본값 "allow")
- `reason`: 결정에 대한 이유
- `hookSpecificOutput.additionalContext`: 포함할 추가 정보

**출력 예시**:

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**용도**: 도구 실행이 실패했을 때 실행되어 오류를 처리하거나, 알림을 보내거나, 실패를 기록합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 오류 처리 정보
- 표준 hook 출력 필드

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**용도**: 지원되는 모델 호출 전에 실행되어 현재 모델 바인딩 프롬프트를 검증, 차단 또는 보강합니다. 이 이벤트는 현재 `UserQuery`, `ToolResult` 및 `Hook` 전송을 다루며, `Retry`, `Steer`, `Cron`, `Notification` 및 `Teammate` 전송은 건너뜁니다. 따라서 계속 경로에서 발생할 수 있으며, `prompt`를 원시 사용자 입력으로 가정해서는 안 됩니다.

**이벤트별 필드**:

```json
{
  "prompt": "current model-bound prompt for this hook invocation",
  "submitted_prompt": "optional user text captured at a supported interactive TUI submission boundary"
}
```

`submitted_prompt`는 선택 사항입니다. Qwen이 지원되는 대화형 TUI 제출에서 새 `UserQuery`로 출처를 전달할 수 있을 때만 존재합니다. 지원되지 않는 생산자 및 동일 턴 스티어링, 도구 결과 계속, 재시도, cron, 알림, 팀메이트 트래픽과 같은 기계 기반 경로에서는 생략됩니다. ACP, 헤드리스, `serve`, SDK 및 원격 입력 경로는 이 버전에서 이를 생성하지 않습니다.

지연된 입력은 출처가 완전한 상태로 유지되는 경우 필드를 보존할 수 있습니다. 결합된 배치는 모든 구성 항목에 출처가 있을 때만 출처를 유지합니다; 편집되거나 부분적으로 알려졌거나 기타 모호한 입력은 필드를 생략합니다. 프롬프트, 명령어 및 셸 기록 탐색 또는 선택된 검색 일치, 재시작 간 stash 복원 및 대화 되감기 복원도 이를 생략합니다. 이러한 경로는 원래 출처 없이 모델 바인딩 텍스트를 표시할 수 있기 때문입니다. 사용자 제출 텍스트가 필요한 소비자는 `prompt`로 폴백하는 대신 부재를 사용 불가로 취급해야 합니다.

복원되거나 출처를 사용할 수 없는 모델 바인딩 입력이 지워지거나 제출된 후, 컴포저는 실행 취소 및 다시 실행 기록도 지웁니다. 이는 마커나 사이드카가 소비된 후 실행 취소가 확장된 텍스트를 복원하는 것을 방지합니다.

대형 붙여넣기 플레이스홀더는 `submitted_prompt`에서 압축된 상태로 유지됩니다; 확장된 붙여넣기 내용은 `prompt`에만 나타납니다. 소비자는 이 필드를 클립보드 입력의 바이트 단위 기록이 아닌 TUI 텍스트 프로젝션으로 취급해야 합니다.

Vim 모드가 활성화된 상태에서 존재하는 비어 있지 않은 입력은 Vim이 비활성화된 후에도 `submitted_prompt`를 생략합니다. Vim 레지스터가 이 버전에서 출처를 전달하지 않기 때문입니다. 이 보수적 규칙은 Vim을 활성화하기 전에 입력된 초안도 포함합니다. 컴포저를 지우면 새 적합한 입력이 시작됩니다.

이 필드는 출처이며, 인증, 테넌트 ID, 권한 부여 또는 DLP가 아닙니다. 호출자 제공 데이터입니다. 이 이벤트에 구성된 모든 실행기가 이를 받습니다; 특히 HTTP hooks는 엔드포인트로 전송하고 prompt hooks는 모델 제공자로 전송합니다.

두 필드가 모두 존재할 때 prompt hook 페이로드에는 중복 텍스트가 포함되며 추가 모델 입력 토큰을 소비할 수 있습니다. 이 버전에서는 hook별 필드 억제가 없습니다.

순차적 UserPromptSubmit hooks는 `additionalContext`를 `prompt`에 추가할 수 있습니다; `submitted_prompt`는 캡처된 제출을 계속 나타냅니다. Function hooks는 신뢰할 수 있는 동일 프로세스 코드이며 불변성 보증에 의해 제약되지 않습니다.

**출력 옵션**:

- `decision`: "allow", "deny", "block" 또는 "ask"
- `reason`: 결정에 대한 사람이 읽을 수 있는 설명
- `hookSpecificOutput.additionalContext`: 프롬프트에 추가할 추가 컨텍스트(선택 사항)

모델에 전송될 때, 주입된 `additionalContext`는 예약된 `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>` 태그로 감싸진 자체 메시지 부분으로 추가되므로, 모델 기록 및 세션 트랜스크립트에서 사용자가 작성한 텍스트와 구별할 수 있습니다. Hook 출력의 꺾쇠괄호는 감싸기 전에 이스케이프되므로 hook 내용이 태그를 닫거나 위조할 수 없습니다. 세션 트랜스크립트는 사용자의 원본 프롬프트 텍스트도 별도로 기록합니다; 대화형 TUI와 ACP/내보내기 트랜스크립트 재생 경로는 주입된 컨텍스트가 아닌 원본 텍스트를 표시합니다.

**참고**: UserPromptSubmitOutput은 HookOutput을 확장하므로 모든 표준 필드를 사용할 수 있지만, hookSpecificOutput의 additionalContext만이 이 이벤트를 위해 특별히 정의됩니다.

**출력 예시**:

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**용도**: 새 세션이 시작될 때 실행되어 초기화 작업을 수행합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 세션에서 사용할 컨텍스트
- 표준 hook 출력 필드

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**용도**: 세션이 종료될 때 실행되어 정리 작업을 수행합니다.

**이벤트별 필드**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**출력 옵션**:

- 표준 hook 출력 필드(일반적으로 차단 목적으로 사용되지 않음)

#### SessionDelete

**용도**: 명시적으로 선택된 세션이 영구적으로 삭제된 후 실행됩니다. 이 이벤트는 fire-and-forget입니다: 출력과 실패는 삭제를 되돌릴 수 없습니다.

**이벤트별 필드**:

```json
{
  "deleted_session_id": "the session that was deleted"
}
```

이 hook은 삭제하는 런타임의 일반 세션 필드(`session_id`, `transcript_path` 및 `cwd`)를 사용합니다; ACP를 통하면 `transcript_path`는 비어 있습니다. 삭제하는 런타임에 자체 트랜스크립트가 없기 때문입니다. `SessionDelete`는 현재 대화형 `/delete` 흐름과 ACP의 명시적 `deleteSession` 메서드에 대해 발생합니다; 데몬 REST 일괄 삭제 및 내부 정리는 이를 발생시키지 않습니다.

#### MessageDisplay

**용도**: 어시스턴트의 응답이 스트리밍되는 동안 반복적으로 발생합니다 — 턴 마지막에 한 번만 발생하는 `Stop` 전에 사용됩니다. 응답이 작성되는 동안 실시간으로 반응하려는 라이브 내레이션, 증분 로깅 또는 모든 소비자에게 유용합니다. 이것은 **fire-and-forget** 이벤트입니다 — hook 출력과 종료 코드는 무시됩니다.

**이벤트별 필드**:

```json
{
  "message_id": "stable id for the whole streamed message",
  "displayed_text": "the CUMULATIVE text streamed so far for this message (not a delta)",
  "is_final": "true on the last firing for this message, false otherwise"
}
```

`displayed_text`는 델타가 아닌 누적입니다. hook 스크립트가 스스로 청크를 재조립할 필요가 없도록 — 각 발생은 지금까지의 전체 텍스트를 전달합니다. 발생은 디바운스됩니다(최대 약 200ms마다). 단, 최종 발생(`is_final: true`)은 메시지가 끝나면 항상 한 번 발생하므로, 응답의 마지막 부분이 디바운스 창을 기다리다가 유실되지 않습니다.

**전달 의미** — hook 스크립트가 의존할 수 있는 것:

- **느린 hook은 더 적고 더 새로운 페이로드를 받습니다.** 메시지당 최대 하나의 중간 스트림 hook 실행이 동시에 진행 중입니다; 하나가 실행되는 동안, 더 새로운 디바운스 페이로드가 뒤에서 쌓이는 대신 대기 중인 것을 _교체_합니다. 디바운스 창보다 느린 hook은 중간 스냅샷을 건너뜁니다 — 각 페이로드가 전체 누적 텍스트를 전달하므로 손실 없습니다.
- **`is_final`은 오래된 전달 뒤에 대기하지 않습니다.** 최종 페이로드가 메시지 종료 즉시 디스패치됩니다 — 여전히 실행 중인 중간 스트림 실행이 있으면 그것과 함께(한 번에 하나의 규칙에 대한 유일한 예외, 같은 방식으로 정당화됨: 최종 누적 텍스트는 해당 실행이 처리 중인 것을 엄격하게 대체). Hook은 항상 `is_final` 페이로드를 받으며 `Stop` hook이 발생하기 전에 받습니다. 상태 저장 hook에 대한 한 가지 결과: 최종 실행이 대체된 중간 스트림 실행과 겹칠 때, _완료_ 순서는 지정되지 않습니다 — 오래된 실행이 최종 실행 후에 완료될 수 있습니다(`Stop` 후에도). `is_final`을 `message_id`당 종단으로 취급하고, 마지막에 완료된 실행이 가장 새로운 상태를 전달한다고 가정하지 말고 누적 텍스트가 승리하도록 합니다.
- **턴은 `is_final` 전달이 완료될 때까지 기다립니다 — 하지만 영원히는 아닙니다.** 턴의 종료(및 `Stop` hook가 발생할 때)는 최종 전달이 완료될 때까지 최대 5초간 기다립니다. 해당 예산 내에 완료되는 hook은 가장 강력한 보장을 유지합니다: 헤드리스 실행(`qwen -p ...`)은 hook이 완료된 후에만 종료되며, `is_final` 실행은 `Stop`이 시작되기 전에 완료됩니다. 더 느린 hook도 여전히 `is_final`을 먼저 받습니다 — 완료 대기에 대한 대기만 제한됩니다: 터미널 UI 또는 ACP 세션에서 실행은 백그라운드에서 단순히 완료되며, 헤드리스 실행은 기다리지 않고 종료됩니다. Hook 프로세스는 종료 시 kill되지 않습니다; 스스로 완료하도록 남겨지므로, `qwen -p … && next-step`를 연결하는 스크립트는 느린 hook이 아직 실행 중인 동안 `next-step`가 시작되는 것을 관찰할 수 있습니다. 이 타임아웃에 도달하면 stderr에 경고가 출력됩니다.
- **취소 동작은 타이밍에 따라 다릅니다.** `is_final` 디스패치 _전에_ 취소된 턴은 `is_final`을 발생시키지 않습니다 — 메시지는 포기된 것으로 취급되며, `is_final`까지 버퍼링하는 소비자는 취소 침묵을 플러시/폐기 신호(예: 타임아웃 폴백)로 취급해야 합니다. 기준은 턴이 종료되는 시점의 중단 신호 상태이며, 모든 청크가 이미 스트리밍되었는지 여부가 아닙니다 — 해당 검사 직전의 짧은 간격에 도달하는 중단은 실제로 텍스트 도착이 완료된 메시지에 대해 `is_final`을 억제할 수 있습니다. `is_final`이 디스패치된 _후_에(드레인 대기 중) 취소하는 것은 다릅니다: 아직 실행 중인 hook 실행은 중간에 종료될 수 있지만(SIGTERM), 페이로드 자체는 이미 전달되었습니다.
- **`displayed_text`는 `is_final`까지 잠정적입니다.** 지금까지 스트리밍된 내용을 반영합니다; 중간 페이로드를 권한 있는 최종 내용이 아닌 표시 상태로 취급하십시오.
- **도구를 사용하는 턴은 여러 메시지를 생성합니다.** 각 모델 호출은 자체 `is_final: true` 발생과 함께 자체 `message_id`를 가집니다: 도구 호출 전의 텍스트가 하나의 메시지이고, 도구 결과 이후의 계속이 또 다른 메시지입니다. 표시 텍스트를 생성하지 않는 모델 호출(도구 호출만)은 아무것도 발생시키지 않습니다.

**참고**: 터미널 UI, 헤드리스(`-p`) 및 ACP(IDE/편집기/`qwen serve`) 세션에서 발생하며, 모든 표면에서 동일한 페이로드 계약을 가집니다.

#### Stop

**용도**: Qwen이 응답을 마무리하기 전에 실행되어 최종 피드백이나 요약을 제공합니다.

**이벤트별 필드**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

`context_usage`, `context_limit` 및 `input_tokens` 필드를 통해 hook 스크립트가 컨텍스트 사용을 관찰하고 사용자 정의 압축 전략을 구현할 수 있습니다 — 예를 들어, 사용량이 사용자 정의 임계값을 초과할 때 `/compact`를 실행하라는 알림을 출력하는 스크립트입니다.

**출력 옵션**:

- `decision`: "allow", "deny", "block" 또는 "ask"
- `reason`: 결정에 대한 사람이 읽을 수 있는 설명
- `stopReason`: 중지 응답에 포함할 피드백
- `continue`: 실행을 중지하려면 false로 설정
- `hookSpecificOutput.additionalContext`: 추가 컨텍스트 정보

**참고**: StopOutput은 HookOutput을 확장하므로 모든 표준 필드를 사용할 수 있지만 stopReason 필드가 이 이벤트에 특히 관련이 있습니다.

**출력 예시**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**용도**: 턴이 API 오류 또는 루프 감지로 인해 종료될 때 실행됩니다(`Stop` 대신). 이것은 **fire-and-forget** 이벤트입니다 — hook 출력과 종료 코드는 무시됩니다.

**이벤트별 필드**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: `error` 필드에 대해 매칭합니다. 예를 들어 `"matcher": "rate_limit"`는 속도 제한 오류에 대해서만 트리거됩니다.

**출력 옵션**:

- **없음** — StopFailure는 fire-and-forget입니다. 모든 hook 출력과 종료 코드는 무시됩니다.

**종료 코드 처리**:

| 종료 코드 | 동작                    |
| --------- | ----------------------- |
| Any       | 무시됨(fire-and-forget) |

**설정 예시**:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**사용 사례**:

- 속도 제한 모니터링 및 알림
- 인증 실패 로깅
- 청구 오류 알림
- 오류 통계 수집

#### SubagentStart

**용도**: 서브에이전트(Task 도구 등)가 시작될 때 실행되어 컨텍스트나 권한을 설정합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 서브에이전트에 대한 초기 컨텍스트
- 표준 hook 출력 필드

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**용도**: 서브에이전트가 완료될 때 실행되어 최종 처리 작업을 수행합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**출력 옵션**:

- `decision`: "allow", "deny", "block" 또는 "ask"
- `reason`: 결정에 대한 사람이 읽을 수 있는 설명

**출력 예시**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**용도**: 대화 압축 전에 실행되어 압축을 준비하거나 로깅합니다.

**이벤트별 필드**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 압축 전에 포함할 컨텍스트
- 표준 hook 출력 필드

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**용도**: 대화 압축이 완료된 후 실행되어 요약을 아카이브하거나 사용을 추적합니다.

**이벤트별 필드**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: `trigger` 필드에 대해 매칭합니다. 예를 들어 `"matcher": "manual"`은 `/compact` 명령어를 통한 수동 압축에 대해서만 트리거됩니다.

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 추가 컨텍스트(로깅 전용)
- 표준 hook 출력 필드(로깅 전용)

**참고**: PostCompact는 공식적인 결정 모드 지원 이벤트 목록에 **없습니다**. `decision` 필드 및 기타 제어 필드는 제어 효과를 생성하지 않으며 — 로깅 목적으로만 사용됩니다.

**종료 코드 처리**:

| 종료 코드 | 동작                                                       |
| --------- | ---------------------------------------------------------- |
| 0         | 성공 - stdout이 상세 모드에서 사용자에게 표시됨            |
| 기타      | 비차단 오류 - stderr가 상세 모드에서 사용자에게 표시됨     |

**설정 예시**:

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**사용 사례**:

- 파일이나 데이터베이스로 요약 아카이빙
- 사용 통계 추적
- 컨텍스트 변경 모니터링
- 압축 작업에 대한 감사 로깅

#### Notification

**용도**: 알림이 전송될 때 실행되어 알림을 커스터마이즈하거나 가로챕니다.

**이벤트별 필드**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **참고**: `elicitation_dialog` 유형은 정의되어 있지만 현재 구현되지 않았습니다.

**출력 옵션**:

- `hookSpecificOutput.additionalContext`: 포함할 추가 정보
- 표준 hook 출력 필드

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**용도**: 권한 대화상자가 표시될 때 실행되어 결정을 자동화하거나 권한을 업데이트합니다.

**이벤트별 필드**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**출력 옵션**:

- `hookSpecificOutput.decision`: 권한 결정 세부 정보가 포함된 구조화된 객체:
  - `behavior`: "allow" 또는 "deny"
  - `updatedInput`: 수정된 도구 입력(선택 사항)
  - `updatedPermissions`: 수정된 권한(선택 사항)
  - `message`: 사용자에게 표시할 메시지(선택 사항)
  - `interrupt`: 워크플로를 중단할지 여부(선택 사항)

**출력 예시**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**용도**: `todo_write` 도구를 통해 새 todo 항목이 생성될 때 실행됩니다. todo 생성의 유효성 검증, 로깅 또는 차단을 허용합니다.

Todo hooks는 두 단계로 실행됩니다:

- `validation`: 저장 전에 실행됩니다. 이 단계에서는 유효성 검증에만 사용하십시오; `block` 또는 `deny`를 반환하면 쓰기가 방지됩니다.
- `postWrite`: 저장 후에 실행됩니다. 로깅이나 동기화와 같은 부작용에 이 단계를 사용하십시오; 이 단계에서는 `block` 또는 `deny`가 무시됩니다.

**이벤트별 필드**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**출력 옵션**:

- `decision`: "allow", "block" 또는 "deny"
- `reason`: 결정에 대한 사람이 읽을 수 있는 설명(차단 시 필수)

**차단 동작**:

`validation` 단계에서 `decision`이 `block` 또는 `deny`(종료 코드 2)이면 todo 생성이 방지됩니다. Todo 목록은 변경되지 않으며, 이유는 모델에 대한 피드백으로 제공됩니다.

`postWrite` 단계에서는 todo가 이미 저장되었습니다. Hook은 여전히 출력을 반환할 수 있지만, `block` / `deny`는 쓰기를 되돌리지 않으며 유효성 검증에 사용해서는 안 됩니다.

**출력 예시(허용)**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**출력 예시(차단)**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Hook 스크립트 예시**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**설정 예시**:

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**용도**: todo 항목이 완료로 표시될 때 실행됩니다. todo 완료의 유효성 검증, 로깅 또는 차단을 허용합니다.

Todo hooks는 두 단계로 실행됩니다:

- `validation`: 저장 전에 실행됩니다. 이 단계에서는 유효성 검증에만 사용하십시오; `block` 또는 `deny`를 반환하면 쓰기가 방지됩니다.
- `postWrite`: 저장 후에 실행됩니다. 로깅이나 동기화와 같은 부작용에 이 단계를 사용하십시오; 이 단계에서는 `block` 또는 `deny`가 무시됩니다.

**이벤트별 필드**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**출력 옵션**:

- `decision`: "allow", "block" 또는 "deny"
- `reason`: 결정에 대한 사람이 읽을 수 있는 설명(차단 시 필수)

**차단 동작**:

`validation` 단계에서 `decision`이 `block` 또는 `deny`(종료 코드 2)이면 todo 완료가 방지됩니다. Todo 항목은 이전 상태를 유지하며, 이유는 모델에 대한 피드백으로 제공됩니다.

`postWrite` 단계에서는 todo가 이미 저장되었습니다. Hook은 여전히 출력을 반환할 수 있지만, `block` / `deny`는 쓰기를 되돌리지 않으며 유효성 검증에 사용해서는 안 됩니다.

**출력 예시(허용)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**출력 예시(차단)**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Hook 스크립트 예시**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**설정 예시**:

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**사용 사례**:

- **로깅**: 감사 또는 분석을 위한 todo 생성 및 완료 추적
- **유효성 검증**: 콘텐츠 품질 기준 강제(최소 길이, 필수 키워드)
- **워크플로 제어**: 전제 조건이 충족될 때까지 완료 차단
- **통합**: 외부 작업 관리 시스템(Jira, Trello 등)과 todo 동기화

## Hook 설정

Hooks는 Qwen Code 설정에서 구성되며, 일반적으로 `.qwen/settings.json` 또는 사용자 구성 파일에 설정합니다:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Hook 실행

### 병렬 vs 순차 실행

- 기본적으로 hook은 더 나은 성능을 위해 병렬로 실행됩니다
- 순서 의존적 실행을 강제하려면 hook 정의에서 `sequential: true`를 사용하십시오
- 순차 hook은 체인의 후속 hook을 위한 입력을 수정할 수 있습니다

### 비동기 Hooks

`command` 유형만 비동기 실행을 지원합니다. `"async": true`를 설정하면 메인 흐름을 차단하지 않고 백그라운드에서 hook이 실행됩니다.

**기능:**

- 결정 제어를 반환할 수 없습니다(작업이 이미 발생함)
- 결과는 다음 대화 턴에서 `systemMessage` 또는 `additionalContext`를 통해 주입됩니다
- 감사, 로깅, 백그라운드 테스트 등에 적합

**예시:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write_file|edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### 보안 모델

- Hook은 사용자 환경에서 사용자 권한으로 실행됩니다
- 프로젝트 레벨 hook은 신뢰할 수 있는 폴더 상태가 필요합니다
- 타임아웃은 멈춘 hook을 방지합니다(기본값: 60초)

## 모범 사례

### 예시 1: 보안 유효성 검증 Hook

위험한 명령어를 로깅하고 잠재적으로 차단하는 PreToolUse hook:

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

`.qwen/settings.json`에서 구성:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 예시 2: HTTP 감사 Hook

모든 도구 실행 기록을 원격 감사 서비스로 전송하는 PostToolUse HTTP hook:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### 예시 3: 대화형 TUI 제출 프롬프트 유효성 검증 Hook

현재 모델 바인딩 내용을 대신 검사하려면 `prompt`를 읽으십시오. 해당 필드는 생성되거나 확장된 내용을 포함할 수 있으며, 원본 사용자 입력이 아니며, `UserPromptSubmit`가 모든 모델 전송을 다루는 것은 아닙니다. 소스 출처가 필요한 경우 `submitted_prompt`에서 `prompt`로 조용히 폴백하지 마십시오.

민감 정보에 대한 지원되는 대화형 TUI 제출을 검증하고 긴 프롬프트에 대한 컨텍스트를 제공하는 UserPromptSubmit hook입니다. 소스 출처를 사용할 수 없는 호출은 건너뜁니다. 키워드 검사는 예시이며 완전한 DLP 정책이 아닙니다:

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## 문제 해결

- 애플리케이션 로그에서 hook 실행 세부 정보를 확인하십시오
- hook 스크립트의 권한과 실행 가능 여부를 확인하십시오
- hook 출력에서 올바른 JSON 형식을 사용하십시오
- 의도하지 않은 hook 실행을 피하기 위해 구체적인 matcher 패턴을 사용하십시오
- `--debug` 모드를 사용하여 상세한 hook 매칭 및 실행 정보를 확인하십시오. Prompt hook 입력은 세션 디버그 로그에 기록될 수 있으므로 적절한 접근 및 보존 통제를 적용하십시오.
- 모든 hook을 일시적으로 비활성화: 설정에 `"disableAllHooks": true` 추가
