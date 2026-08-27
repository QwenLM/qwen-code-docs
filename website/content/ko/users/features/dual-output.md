# Dual Output

Dual Output는 대화형 TUI의 사이드카 모드입니다: Qwen Code가 `stdout`에서 정상적으로 렌더링하는 동안, 구조화된 JSON 이벤트 스트림을 별도의 채널로 동시에 내보내어 외부 프로그램 — IDE 확장, 웹 프론트엔드, CI 파이프라인, 자동화 스크립트 — 이 세션을 관찰하고 제어할 수 있게 합니다.

또한 역방향 채널도 제공합니다: 외부 프로그램이 TUI가 감시하는 파일에 JSONL 명령을 작성하여, 마치 사람이 키보드에 있는 것처럼 프롬프트를 제출하고 도구 권한 요청에 응답할 수 있습니다.

Dual Output는 완전히 선택적입니다. 아래 플래그가 없으면 TUI는 추가 I/O나 동작 변경 없이 이전과 동일하게 동작합니다.

## 사용 사례

Dual Output는 저수준 플럼빙 프리미티브입니다. 이것이 가능하게 하는 구체적인 통합은 다음과 같습니다:

### 터미널 + Chat 이중 모드 실시간 동기화

주요 사용 사례입니다. 웹 또는 데스크톱 ChatUI가 PTY 내부에 TUI를 호스팅하고 구조화된 이벤트 스트림으로 구동되는 병렬 대화 뷰를 렌더링합니다:

- 사용자는 어느 표면에서든 입력할 수 있습니다 — TUI(터미널 네이티브 파워 유저용) 또는 웹 UI(더 풍부한 UX, 공유 가능한 링크, 모바일용). 두 뷰는 모든 메시지가 같은 JSON 이벤트를 통과하므로 동기화를 유지합니다.
- 도구 승인 프롬프트가 두 곳 모두에 나타납니다; 먼저 승인하는 쪽이 승리합니다.
- 세션 기록은 `--json-file`에서 그대로 캡처되므로, 서버 측은 ANSI를 파싱하지 않고도 표준 기계 판독 가능한 트랜스크립트를 갖습니다.

### IDE 확장 (VS Code / JetBrains / Cursor / Neovim)

IDE 내부에 Qwen Code를 임베드합니다. TUI는 원하는 사용자를 위해 편집기의 통합 터미널 패널에서 실행되고, 확장은 `--json-fd` / `--json-file` 이벤트를 소비하여 다음을 구동합니다:

- 에이전트가 파일을 건드릴 때 인라인 diff 오버레이.
- 포맷된 Markdown, 구문 강조된 도구 호출 및 클릭 가능한 인용을 가진 웹뷰 사이드 패널.
- 상태 표시줄 표시기 (생각 중 / 응답 중 / 승인 대기).
- 사용자가 네이티브 IDE 승인 버튼을 클릭할 때 프로그램적 `confirmation_response` 쓰기.

### 브라우저 기반 Chat 프론트엔드

Node/Bun 서버가 렌더링 의미를 위해 PTY에서 TUI를 생성하지만 브라우저에 WebSocket 채널을 노출합니다. `--json-file`의 이벤트가 클라이언트로 전달되고; 브라우저에서 입력된 사용자 메시지는 `--input-file`을 통해 주입됩니다. 양쪽 모두 ANSI 파싱이 필요 없습니다.

### CI / 자동화 옵저버

CI 작업이 작업 프롬프트와 함께 Qwen Code를 실행합니다. 사람은 작업 로그에서 TUI를 보고; CI 시스템은 `--json-file`을 테일하여:

- `result` 이벤트가 오류를 보고하면 작업을 실패시킵니다.
- `token usage` / `duration_ms` / `tool_use` 카운트를 메트릭으로 푸시합니다.
- 전체 트랜스크립트를 빌드 아티팩트로 보관합니다.

### 다중 에이전트 오케스트레이션

슈퍼바이저 에이전트가 각각 고유한 이벤트/입력 파일 쌍을 가진 여러 TUI 작업자를 생성합니다. 진행 상황을 감시하고, 후속 프롬프트를 주입하며, 모든 작업자에 걸쳐 도구 호출을 승인 또는 거부하여 전역 예산 / 안전 정책을 시행합니다.

### 세션 기록, 감사 및 재생

`--json-file`로 모든 TUI 세션을 일반 파일에 티합니다. 나중에:

- 규정 감사에서 정확히 무엇이 실행되었는지 재구성할 수 있습니다.
- 자동 회귀 테스트가 모델 버전 간 실행을 비교할 수 있습니다.
- 재생 도구가 같은 프로토콜을 통해 이벤트를 재방출하여 시각화 대시보드에 공급할 수 있습니다.

### 관찰 가능성 대시보드

`--json-file`을 JSONL을 수용하는 Loki / OTEL / 모든 파이프라인으로 스트리밍합니다. `usage.input_tokens`, `tool_use.name`, `result.duration_api_ms`를 Grafana의 일급 메트릭으로 추출합니다. 로그 파싱 정규식이 필요 없습니다.

### 테스트 및 QA

통합 테스트는 Qwen Code를 헤드리스로 생성하고, `--input-file` 스크립트로 구동하며, `--json-file` 이벤트에서 어서션합니다. stdout ANSI를 파싱하는 것과 달리, 어서션은 UI 리팩토링에 걸쳐 안정적입니다.

## 플래그

| 플래그                | 타입            | 목적                                                                                                                                  |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | number, `n >= 3` | 파일 디스크립터 `n`에 구조화된 JSON 이벤트를 씁니다. 호출자는 spawn `stdio` 구성이나 셸 리디렉션을 통해 이 fd를 제공해야 합니다.        |
| `--json-file <path>`  | path            | 파일에 구조화된 JSON 이벤트를 씁니다. 경로는 일반 파일, FIFO(이름 있는 파이프) 또는 `/dev/fd/N`이 될 수 있습니다.                       |
| `--input-file <path>` | path            | 외부 프로그램이 작성한 JSONL 명령을 위해 이 파일을 감시합니다.                                                                         |

`--json-fd`와 `--json-file`은 상호 배타적입니다. fd 0, 1, 2는 TUI 자체 출력을 손상시키지 않기 위해 거부됩니다.

## 왜 두 개의 출력 플래그가 있는가? (`--json-fd` vs `--json-file`)

언뜻 보면 `--json-fd`로 충분해 보입니다 — 호출자가 추가 파일 디스크립터와 함께 Qwen Code를 spawn하면, TUI가 이벤트를 거기에 쓰고 끝입니다. 실제로, fd 전달은 가장 중요한 임베딩 시나리오에서 무너집니다: 의사 터미널(PTY) 내부에서 TUI를 실행하는 것입니다. 이것이 이 기능이 경로 기반 대안도 노출하는 이유입니다.

### `--json-fd`가 작동할 때

`stdio` 배열이 있는 순수 `child_process.spawn`:

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node의 spawn은 임의의 `stdio` 항목을 지원합니다; fd 3은 자식에 의해 상속되며, 자식은 이에 직접 쓸 수 있습니다. 제로 카피, 제로 버퍼, 제로 파일 시스템 — 가장 빠른 경로입니다.

### `--json-fd`가 PTY 아래에서 작동하지 **않는** 이유

[`node-pty`](https://github.com/microsoft/node-pty) 및 [`bun-pty`](https://github.com/oven-sh/bun)와 같은 PTY 래퍼는 심각한 임베더(IDE 확장, 웹 터미널, tmux 유사 멀티플렉서)가 대화형 TUI를 호스팅하는 방법입니다. 이들은 세 가지 상호 강화되는 이유로 자식에 추가 fd를 전달할 수 없습니다:

1. **API 표면.** `node-pty.spawn(file, args, options)`은 `cwd`, `env`, `cols`, `rows`, `encoding` 등을 받습니다 — 하지만 **`stdio` 배열은 없습니다**. "이 fd를 자식의 fd 3으로 추가 첨부"라고 말할 API 장소가 단순히 없습니다. `bun-pty`도 같은 형태를 노출합니다.
2. **`forkpty(3)` 시맨틱.** 내부적으로 PTY 래퍼는 `forkpty(3)`을 호출합니다(또는 동등한 `posix_openpt` + `login_tty` 댄스). 해당 시스템 콜은 마스터/슬레이브 의사 터미널 쌍을 할당하고 자식의 fd 0/1/2를 슬레이브 측으로 리디렉션하여 자식이 실제 터미널에 연결된 것처럼 생각합니다. 부모의 2 초과 fd는 `login_tty`에 의해 닫히며, `exec` 전에 `fd >= 3`에 대해 `close(fd)`를 호출합니다. 추가 fd는 적극적으로 삭제되며 상속되지 않습니다.
3. **제어 터미널 부작용.** 추가 fd를 해킹해서 통과시킨다 해도, 터미널이 아니므로 자식의 TUI 렌더러(fd 1에서 TTY를 가정하고 이스케이프 시퀀스를 작성)는 여전히 출력을 위해 슬레이브가 필요합니다. 어쨌든 두 개의 독립적인 전송 수단을 갖게 됩니다.

요약하면: 임베더가 TUI 렌더링을 위해 실제 TTY가 필요한 순간 — 모든 IDE 확장, 모든 웹 터미널, 모든 데스크톱 채팅 앱 — fd 상속은 불가능합니다.

### `--json-file`이 갭을 채움

파일 경로는 일반 CLI 인수로 전달되므로 모든 spawn 모델을 생존합니다:

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

자식이 파일을 직접 열고 이벤트를 거기에 씁니다; 임베더는 같은 경로를 `fs.watch` + 증분 읽기로 테일합니다. 세 가지 유의할 점:

- **일반 파일**, FIFO(이름 있는 파이프) 또는 `/dev/fd/N` 모두 작동합니다. FIFO는 양쪽이 같은 호스트에 있을 때 가장 낮은 지연 옵션입니다.
- 브리지는 FIFO를 `O_NONBLOCK`으로 열며 `ENXIO`(아직 리더 없음)에서 블로킹 모드로 폴백하므로, PTY 시작이 소비자를 기다리면서 교착 상태에 빠지지 않습니다.
- 다중 세션 격리를 위해, `$XDG_RUNTIME_DIR` 아래의 세션별 경로 또는 모드 `0700`의 `mkdtemp`'d 디렉토리를 사용하세요.

### 어떤 플래그를 사용해야 하나요?

| 임베딩 스타일                                  | 사용                |
| ----------------------------------------------- | ------------------- |
| 일반 stdio를 가진 `child_process.spawn`          | `--json-fd`         |
| `node-pty` / `bun-pty` / 모든 PTY 호스트         | `--json-file`       |
| 셸 리디렉션 / 수동 파이프라인 테스트              | 둘 다               |
| CI 로그 수집 (일반 파일, 종료 후 읽기)            | `--json-file`       |
| 같은 호스트에서 가능한 낮은 지연                  | `--json-file` + FIFO|

일반 규칙: **TUI가 올바르게 렌더링되는 것이 필요하면, PTY가 필요하고, 이는 `--json-file`이 필요하다는 뜻입니다.** `--json-fd`는 TUI 정확도에 신경 쓰지 않는 더 간단한 임베더용입니다 — 일반적으로 stdout을 어쨌든 버리는 프로그램matic 래퍼.

## 빠른 시작

일반 파일을 사용하여 두 채널을 모두 활성화하여 Qwen Code를 실행하세요:

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

두 번째 터미널에서 이벤트 스트림을 테일하세요:

```bash
tail -f /tmp/qwen-events.jsonl
```

세 번째 터미널에서 실행 중인 TUI로 프롬프트를 푸시하세요:

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

프롬프트가 사용자가 입력한 것과 정확히 동일하게 TUI에 나타나고, 스트리밍 응답이 `/tmp/qwen-events.jsonl`에 미러링됩니다.

### 이벤트 출력에 FIFO(이름 있는 파이프) 사용

FIFO는 일반 파일보다 낮은 지연을 전달합니다(디스크 I/O 없음)이며 양쪽이 같은 호스트에 있을 때 잘 작동합니다. 브리지는 FIFO를 `O_RDWR | O_NONBLOCK`으로 열므로, 아직 리더가 연결되지 않아도 **블록하지 않습니다** — 이벤트는 리더가 첨부될 때까지 커널 파이프 버퍼에 버퍼링됩니다.

> **참고:** `--input-file`은 일반 파일이 필요합니다(FIFO가 아님). 감시자가 새 데이터를 감지하기 위해 `stat.size`에 의존하는데, 이는 FIFO에 대해 항상 0이기 때문입니다.

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI가 즉시 시작합니다 — 먼저 리더를 시작할 필요 없음.

# 두 번째 터미널에서 준비되면 연결:
cat /tmp/qwen-events.jsonl
```

리더가 절대 연결되지 않으면, 브리지는 내부 버퍼가 1MB를 초과하면 자동으로 비활성화됩니다. TUI는 정상적으로 계속 실행됩니다.

## 출력 이벤트 스키마

이벤트는 JSON Lines로 내보내집니다(한 줄에 하나의 객체). 스키마는 비대화형 `--output-format=stream-json` 모드에서 사용되는 것과 동일하며, `includePartialMessages`가 항상 활성화되어 있습니다.

프로토콜 버전 2는 JSON 문자열 직렬화 후 텍스트 `tool_result.content` 값을 65,536 UTF-8 바이트로 제한합니다. 초과하는 값은 결정적 헤드/테일 미리보기가 되며, 이벤트 타입과 필드 스키마는 변경되지 않습니다. 이것은 필드 제한이며 범용 JSONL 프레임 크기 제한이 아닙니다.

채널의 첫 이벤트는 항상 `system` / `session_start`이며, 브리지가 구성될 때 내보내집니다. 다른 이벤트가 도착하기 전에 채널을 세션 id와 상관시키는 데 사용하세요.

```jsonc
// 세션 라이프사이클
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// 진행 중인 어시스턴트 턴의 스트리밍 이벤트
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// 완료된 메시지
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// 권한 제어 평면 (도구가 승인이 필요할 때만)
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

`control_response`는 TUI(네이티브 승인 UI)에서 결정되었든 외부 `confirmation_response`(아래 참조)에서 결정되었든 내보내집니다. 어느 쪽이든, 모든 옵저버가 최종 결과를 볼 수 있습니다.

## 입력 명령 스키마

`--input-file`에서 두 가지 명령 형태가 허용됩니다:

```jsonc
// 프롬프트 큐에 사용자 메시지 제출
{ "type": "submit", "text": "What does this function do?" }

// 보류 중인 control_request에 회신
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

동작:

- `submit` 명령은 대기열에 들어갑니다. TUI가 응답으로 바쁘면, TUI가 다음에 유휴 상태로 돌아올 때 자동으로 재시도됩니다.
- `confirmation_response` 명령은 즉시 디스패치되며 절대 대기열에 들어가지 않습니다. 도구 호출이 블로킹 중이며 응답이 이전 `submit`을 기다리지 않고 기본 `onConfirm` 핸들러에 도달해야 하기 때문입니다.
- 어느 쪽이 먼저 도구 승인을 하면 승리합니다; 다른 쪽의 늦은 응답은 해 없이 삭제됩니다.
- JSON으로 파싱에 실패한 라인은 기록되고 건너뜁니다 — 감시자를 중지하지 않습니다.

## 지연 참고

입력 파일은 500ms 폴링 간격으로 `fs.watchFile`로 관찰되므로, 원격 `submit`의 최악의 경우 왕복 지연은 약 0.5초입니다. 이것은 의도적입니다: 폴링은 플랫폼과 파일 시스템(macOS / 네트워크 마운트 포함)에 걸쳐 이식 가능하며, 이 기능이 대상으로 하는 일반적인 인간-인-더-루프 페이싱과 일치합니다. 출력 채널에는 폴링이 없습니다 — 이벤트는 TUI가 내보낼 때 동기적으로 기록됩니다.

## 실패 모드

- **잘못된 fd.** `--json-fd`에 전달된 fd가 열려 있지 않거나 0/1/2 중 하나이면, TUI는 `stderr`에 경고를 출력하고 dual output 없이 계속합니다.
- **잘못된 경로.** `--json-file`에 전달된 파일을 열 수 없으면, TUI는 경고를 출력하고 dual output 없이 계속합니다.
- **소비자 연결 끊김.** 채널 반대편의 리더가 사라지면(`EPIPE`), 브리지는 조용히 자체 비활성화하고 TUI는 계속 실행됩니다. 재시도 없음.
- **FIFO 버퍼 오버플로우.** 리더가 연결되지 않은 FIFO에 쓸 때, 이벤트는 커널 파이프(Linux에서 ~64KB)와 Node.js WriteStream에 버퍼링됩니다. 파이프가 가득 차거나 내부 버퍼가 1MB를 초과하면, 브리지는 자체 비활성화하고 fd를 닫습니다. 이 경우 `session_end`가 내보내지지 않습니다 — 소비자는 `session_end` 없이 닫힌 스트림을 비정상 종료로 처리해야 합니다. TUI는 정상적으로 계속 실행됩니다.
- **어댑터 예외.** 이벤트를 내보내는 동안 발생한 모든 예외는 잡히고, 기록되며, 브리지를 비활성화합니다. TUI는 dual-output 실패로 크래시되지 않습니다.

## Spawn 예시

일반적인 임베딩 부모 프로세스는 두 채널과 함께 Qwen Code를 spawn합니다:

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

TUI는 여전히 stdio 0/1/2에서 사용자의 터미널을 소유하며, 임베더는 fd 3을 지원하는 파일에서 구조화된 이벤트를 읽고 `/tmp/qwen-input.jsonl`에 JSONL 라인을 추가하여 명령을 푸시합니다.

## 설정 기반 구성

장기 실행 임베더의 경우 모든 시작에 CLI 플래그를 스레딩하는 것이 불편할 수 있습니다. 같은 채널을 `settings.json`의 최상위 `dualOutput` 키 아래에 구성할 수 있습니다:

```jsonc
// ~/.qwen/settings.json  (사용자 수준)
// 또는 <workspace>/.qwen/settings.json  (작업 공간 수준)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

우선순위 규칙:

- CLI 플래그가 설정보다 **우선**합니다. 명령줄에서 `--json-file /foo`를 전달하면 설정의 `dualOutput.jsonFile`을 오버라이드합니다.
- `--json-fd`는 설정에 해당하는 것이 없습니다 — fd 전달은 정적으로 선언할 수 없는 spawn 시점 문제입니다.
- 플래그도 설정도 없으면 dual output은 비활성화된 상태로 유지됩니다(오늘날의 기본값과 동일).

`requiresRestart: true` 플래그는 변경 사항이 다음 Qwen Code 시작 시에만 적용됨을 의미합니다. 브리지는 시작 시 한 번만 구성되기 때문입니다.

## 실행 가능한 데모

아래 각 스크립트는 복사하여 바로 사용할 수 있습니다. POC&nbsp;1로 시작하여 빌드에 dual output이 있는지 확인하세요; POC&nbsp;4가 실제 IDE 확장 통합에 가장 가까운 유사체입니다.

### POC 1 — 이벤트 스트림 관찰

사용자가 정상적으로 사용하는 동안 TUI가 내보내는 모든 구조화된 이벤트를 감시하세요:

```bash
# 터미널 A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# 터미널 B
qwen --json-file /tmp/qwen-events.jsonl
# ...그런 다음 정상적으로 대화; 터미널 A에 session_start,
# user/assistant/result/control_request 라이프사이클이 실시간으로 표시됩니다.
```

터미널 A의 예상 첫 줄:

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 외부에서 프롬프트 주입

첫 번째 터미널의 키보드를 건드리지 않고 두 번째 터미널에서 TUI를 구동하세요:

```bash
# 터미널 A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# 터미널 B — TUI가 직접 입력한 것처럼 응답
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — 원격 도구 권한 브리지

별도 프로세스에서 도구 호출을 승인 또는 거부하세요:

```bash
# 터미널 A — control_request 관찰
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# 터미널 B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# 승인이 필요한 작업을 Qwen에게 요청하세요. 예:
# "run `ls -la /tmp`". control_request가 터미널 A에 나타납니다.
# request_id를 복사한 다음 세 번째 터미널에서:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-input.jsonl
# TUI 확인 프롬프트가 해제되고 도구가 실행됩니다.
```

알 수 없는 `request_id`로 회신하면, 브리지는 출력 채널에 `subtype: "error"`가 있는 `control_response`를 내보내어 소비자가 기록하거나 재시도할 수 있습니다:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Node 임베더 (IDE 유사)

가장 현실적인 형태: 부모 프로세스가 Qwen Code를 spawn하고, 이벤트를 테일하고, 자체 일정에 따라 프롬프트를 주입합니다.

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// 출력 채널을 테일합니다. 프로덕션에서는 적절한
// 바이트 오프셋 테일을 사용하겠지만, 간결함을 위해 여기서 0부터 재스트리밍합니다.
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // 기능을 사용하기 전에 기능 감지
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// 2초 후, 사용자가 입력한 것처럼 프롬프트 주입
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

실행 방법:

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI가 현재 터미널에서 열립니다; 임베더는
# 핸드셰이크 + 턴 종료 + 세션 종료 이벤트를 부모의 stdout에 기록합니다.
```

### POC 5 — 기능 핸드셰이크 기능 감지

이전 Qwen Code 버전은 `protocol_version`을 내보내지 않습니다. 필드를 선택적으로 취급하고 기능 감지하세요:

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — 정리 종료 시그널로서의 session_end

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // 메트릭 플러시, WebSocket 닫기 등.
  }
});
```

TUI가 `session_end` 전에 크래시하면, 출력 스트림이 닫힙니다(다음 쓰기에 `EPIPE`); 임베더는 두 경로 모두 처리해야 합니다.

### POC 7 — 실패 훈련 (플래그가 TUI를 절대 깨지 않음을 증명)

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI는 여전히 정상적으로 시작됩니다.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI는 여전히 정상적으로 시작됩니다.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs가 거부: "--json-fd and --json-file are mutually exclusive."
# TUI 시작 전에 프로세스가 종료됩니다.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr 경고; TUI는 여전히 시작됩니다.
```

## Claude Code와의 관계

Claude Code는 `--print --output-format stream-json` 아래에 유사한 stream-json 이벤트 형식을 노출하지만, 비대화형 모드에서만 — TUI를 실행하면서 동시에 구조화된 사이드카 채널을 갖는 것과 동등한 것이 없습니다. Dual Output이 그 갭을 채웁니다.
