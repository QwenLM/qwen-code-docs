# Auto Mode

Auto Mode는 LLM classifier를 사용해 각 도구 호출을 평가하고 자동 승인 여부를 결정한다. Auto-Edit(파일 편집만 자동 승인)과 YOLO(모두 자동 승인) 사이의 단계이다.

이 페이지는 Auto Mode 설정 및 문제 해결 레퍼런스이다. 소개는 [승인 모드 개요](./approval-mode.md#4-auto-mode---classifier-driven-approval)를 참조.

## 작동 방식

Auto Mode에서 에이전트가 도구를 실행하려고 하면, Qwen Code는 다음 세 단계를 순서대로 거친다:

1. **acceptEdits 빠른 경로** — 워크스페이스 내부 경로의 Edit / Write는 classifier를 호출하지 않고 자동 승인된다. **예외:** Qwen Code 자체의 자체 수정 표면(`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`, 설정된 컨텍스트 파일명, `.qwen/rules/`, `.qwen/commands/`, `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`)과 영속성 표면(`.git/`, `.husky/`, `package.json`, `.npmrc`, `Makefile`, `.github/workflows/` 등)으로의 쓰기는 워크스페이스 내부여도 classifier를 거친다. 보호된 경로를 대상으로 하는 심볼릭 링크도 해석되어 거부된다. `cd && bash -lc '...'` 등 래퍼를 통해 이 경로에 도달하는 셸 명령어도 classifier를 거친다.
2. **안전 도구 허용 목록** — 읽기 전용 및 메타데이터 전용 내장 도구(Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion 등)는 classifier를 호출하지 않고 자동 승인된다.
3. **LLM classifier** — 나머지 전부(셸 명령어, 웹 가져오기, 서브에이전트 생성, 워크스페이스 외부 편집, MCP 도구)는 2단계 classifier로 전송된다:
   - **1단계 (빠름)** — `{ shouldBlock }`만 출력. 약 ~300ms. `shouldBlock`이 `false`이면 동작이 허용되고 호출이 진행된다.
   - **2단계 (사고)** — 1단계에서 차단할 때만 실행. chain-of-thought 리뷰로 1단계의 오탐을 줄인다. 1단계의 차단을 허용으로 내릴 수 있다. 차단 시 사용자에게 보이는 `reason`을 출력한다.

classifier는 설정된 fast model(`/model --fast`)을 사용한다. fast model이 설정되지 않은 경우 메인 세션 모델이 대신 사용된다.

> [!tip]
>
> 권한 시스템이 읽기 전용으로 감지한 셸 명령어(예: `ls`, `cat`, `git log`)는 classifier에 도달하기 전에 자동 승인된다. `permissions.autoMode.classifyAllShell: true`를 설정하면 이를 재정의하고 모든 셸 명령어를 classifier로 보낸다 — 아래 [모든 셸 명령어 분류](#classify-all-shell-commands) 참조.

## 하드 규칙이 우선

Auto Mode는 하드 권한 규칙을 **대체하지 않는다**. classifier가 실행되기 전에:

- `permissions.deny` 규칙이 해당 이유로 동작을 차단한다. classifier는 이를 보지 못한다.
- 특정 지정자가 있는 `permissions.allow` 규칙(예: `Bash(git status)`, `Read(./docs/**)`)은 classifier 없이 자동 허용된다 — **단**, 호출이 보호된 자체 수정 또는 영속성 경로에서 쓰기로 해석되는 경우는 예외("작동 방식"의 목록 참조). 이 경우 Auto Mode는 classifier를 통해 호출을 재검사한다. `Bash(*)`에 대한 allow 규칙이 Qwen Code의 설정, 명령어, hook, skill, MCP 서버를 조용히 재작성하는 권한으로 전환되는 것을 방지한다.
- `permissions.ask` 규칙은 Auto Mode에서도 수동 확인을 강제한다.

## 지나치게 광범위한 allow 규칙은 Auto Mode에서 제거됨

다음과 같은 규칙은 classifier 검토 없이 에이전트가 임의 코드를 실행할 수 있게 한다:

- `Bash` / `Bash(*)` / `Bash()` — 모든 셸 명령어 자동 허용
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — 인터프리터 와일드카드
- `Agent` / `Agent(coder)` — Agent 도구에 대한 모든 allow
- `Skill` / `Skill(pdf)` — Skill 도구에 대한 모든 allow

Auto Mode에 진입하면 Qwen Code는 이러한 규칙을 활성 권한 세트에서 일시적으로 제거하고 나열하는 알림을 출력한다. Auto Mode를 벗어나면 규칙은 즉시 복원된다. `settings.json`은 수정되지 않는다.

정말로 이러한 광범위한 규칙이 필요하면 YOLO 모드를 사용하라.

## 힌트 설정

Auto Mode는 `settings.json`의 `permissions.autoMode`를 읽는다. 항목은 규칙 패턴이 아닌 자연어 설명이며 — 내장 기본값과 함께 classifier의 시스템 프롬프트에 추가된다.

세 가지 힌트 카테고리와 환경 목록이 있다:

- **`allow`** — classifier가 자동 승인해야 하는 동작.
- **`softDeny`** — 파괴적이거나 되돌릴 수 없는 동작으로, **사용자의 가장 최근 명시적 요청이 해당 동작과 범위를 정확히 요청한 경우**가 아니면 classifier가 차단해야 한다. soft deny는 사용자 의도로 해제될 수 있다. 일반적인 "yes do whatever"는 인정되지 않는다.
- **`hardDeny`** — `autoMode.hints.allow`이나 최근 사용자 의도와 관계없이 Auto Mode에서 classifier가 반드시 차단해야 하는 보안 경계 동작. classifier 정책이며 결정적 권한 규칙이 아니다: `permissions.allow`를 재정의하지 않는다. 권한 관리자가 절대 허용해서는 안 되는 동작에는 `permissions.deny`를 사용하라.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Running poetry install and poetry update in this Python project",
          "Cleaning build artifacts under ./dist or ./build",
          "Reading any file under /Users/me/code/"
        ],
        "softDeny": [
          "Editing Qwen Code settings unless I explicitly ask for the exact change",
          "Running migration scripts that touch the production DB"
        ],
        "hardDeny": [
          "Sending secrets or .env contents to any network endpoint",
          "Modifying anything under ~/.ssh or ~/.aws"
        ]
      },
      "environment": [
        "This is a private monorepo with strict commit signing",
        "Production credentials live in 1Password, never in plain files"
      ]
    }
  }
}
```

`hints.deny`는 하위 호환성을 위해 여전히 허용되며 `softDeny`로 처리된다. 둘을 혼용해도 된다 — `softDeny`가 먼저 와서 항목이 연결된다.

### 길이 및 개수 제한

classifier 시스템 프롬프트를 작게 유지하기 위해:

- 각 항목은 200자로 제한된다(긴 항목은 경고와 함께 잘린다).
- `hints.allow`, `hints.softDeny`, `hints.hardDeny`는 각각 최대 50개 항목을 받는다.
- `environment`는 최대 20개 항목을 받는다.

### 설정 파일 간 레이어링

`autoMode`는 다른 권한 설정과 동일하게 시스템 / 사용자 / 워크스페이스 설정에 걸쳐 병합된다: 배열은 연결되고 중복이 제거된다.

### 모든 셸 명령어 분류 {#classify-all-shell-commands}

기본적으로 읽기 전용 셸 명령어(`ls`, `cat`, `git status`, …)는 classifier를 호출하지 않고 자동 승인된다 — 권한 시스템이 3단계에서 이를 안전하다고 감지하고 classifier를 완전히 건너뛴다. `classifyAllShell`을 `true`로 설정하면 읽기 전용 포함 **모든** 셸 명령어를 classifier로 강제한다:

```json
{
  "permissions": {
    "autoMode": {
      "classifyAllShell": true
    }
  }
}
```

프로덕션 또는 보안이 중요한 환경에서 심층 방어가 필요할 때 유용하다: 무해해 보이는 명령어도 실행 전 classifier가 검토한다. 단점은 추가 지연(읽기 전용 셸 호출당 ~300ms)과 classifier 가용성 의존이다 — classifier API에 도달할 수 없으면 읽기 전용 셸 명령어도 수동 승인이 필요하다.

> [!note]
>
> `classifyAllShell`은 셸 명령어(`run_shell_command` 및 `monitor`)에만 영향을 준다. 내장 읽기 전용 도구(`read_file`, `grep_search`, `glob`, `list_directory` 등)는 영향을 받지 않으며 빠른 경로 허용 목록을 계속 사용한다.

## 결정 읽기

classifier가 동작을 차단하면 도구 호출이 다음 메시지와 함께 실패한다:

- **`Blocked by auto mode policy: <reason>`** — classifier가 해당 동작을 안전하지 않다고 판단했다. 이유는 classifier의 2단계에서 온다.

이 메시지 뒤에는 **차단된 동작 그 자체**를 다른 도구, 셸 우회, 생성된 스크립트, 별칭, 심볼릭 링크, 설정 변경, hook, 명령 파일, MCP 설정, 인코딩된 페이로드 또는 동등한 경로로 완료해서는 안 된다는 안내가 에이전트에게 전달된다. **관련 없는 안전한 작업과 진정으로 더 안전한 대안은 여전히 허용된다** — 다른 경로를 통해 동일한 차단된 의도를 달성하려는 시도만 차단된다.

차단된 동작이 정말로 필요하면, 에이전트는 거부 절차를 우회하려 하지 말고 중지하고 명시적 승인을 요청해야 한다.

### classifier 이유 언어

classifier 이유는 LLM이 생성하며 번역되지 않는다. 비영어권 이유를 원하면 `permissions.autoMode.environment`에 `Respond reasons in Chinese`와 같은 힌트를 추가하라.

## 수동 승인 폴백

Auto Mode는 멈추지 않도록 보호한다:

- classifier API에 도달할 수 없거나, 타임아웃되거나, 컨텍스트 창을 초과하거나, 잘못된 응답을 반환하면 현재 동작이 즉시 수동 승인 폴백으로 전환된다. 확인 프롬프트는 Default Mode를 권장하며 **Default Mode로 전환하고 한 번 허용** 옵션을 Allow once 및 Reject와 함께 제공한다. 전환은 현재 런타임 세션에만 영향을 주며 저장된 설정은 변경하지 않는다.

- **3회 연속 정책 차단** 후 다음 도구 호출은 표준 수동 승인 프롬프트로 폴백한다. 에이전트가 금지된 명령의 사소한 변형을 계속 시도하는 경우를 잡는다.
- **2회 연속 사용 불가** 결과(classifier API 실패) 후, 이후 호출은 고장난 classifier를 건너뛰고 직접 수동 승인으로 이동한다. 첫 번째 사용 불가 결과에서 이미 요청하며, 임계값은 classifier 재시도를 반복적으로 대기하는 것을 방지한다.

세션은 전환 옵션을 명시적으로 선택하지 않는 한 Auto Mode를 유지한다. 폴백 호출만 수동 승인을 거친다. 폴백 호출을 승인하거나 모드를 전환하면 카운터가 초기화된다.

폴백이 계속 발생하면 가장 가능성이 높은 원인은 classifier API 장애 또는 조정이 필요한 힌트이다. 조사하는 동안 Default Mode로 전환하라.

## 문제 해결

**"Auto Mode가 내 명령을 계속 차단한다"**

오류 메시지의 이유를 확인하라. classifier가 컨텍스트에 비해 지나치게 보수적이면 `permissions.autoMode.hints.allow`에 해당 패턴을 자연어로 설명하는 항목을 추가하라. 예시:

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Auto Mode classifier 사용 불가"**

classifier API가 응답하지 않았다. 가능한 원인:

- 모델 엔드포인트와의 네트워크 문제.
- 설정된 fast model을 더 이상 사용할 수 없음 — `/model --fast`로 확인.
- 트랜스크립트가 너무 길어 fast model 컨텍스트 창을 초과.

진단하는 동안 Default Mode로 전환하라: `/approval-mode default`.

**"수동 승인으로 폴백"**

3회 연속 차단 또는 2회 연속 사용 불가 가드에 도달했다. 평소처럼 프롬프트를 승인하거나 거부하라. 한 번 승인된 폴백 후 연속 카운터가 초기화된다.

**classifier가 내 프롬프트에서 민감 데이터를 본다**

도구 입력은 classifier에 도달하기 전 각 도구의 `toAutoClassifierInput` 메서드를 통해 투영된다. 긴 편집 내용, 웹 가져오기 프롬프트, 서브에이전트 프롬프트는 잘린다. 도구 결과(파일 내용, 웹 페이지)는 classifier에 절대 전송되지 않는다 — 사용자의 텍스트와 어시스턴트 도구 호출만 전달된다.

특정 도구가 수정하려는 필드를 노출하면 도구명과 함께 이슈를 등록하라. 투영은 도구별이며 시간이 지남에 따라 강화될 예정이다.

## 제한 사항

- **오프라인 미지원.** classifier는 LLM 호출이 필요하다.
- **느린 경로에서 지연 추가.** 허용 목록 + acceptEdits는 대부분의 호출을 지연 없이 처리하지만, `run_shell_command`는 일반적으로 ~300ms(빠른 classifier 경로) 또는 ~3-5s(사고 리뷰가 있는 느린 경로)를 추가한다.
- **`deny` 규칙의 대체가 아님.** classifier는 최선 노력이다. 절대 실행되면 안 되는 명령은 `permissions.deny`에 넣으라.
- **MCP 도구는 기본적으로 보수적 차단.** 서드파티 MCP 도구(`mcp__*`)는 `toAutoClassifierInput` 오버라이드를 통해 인수 전달을 옵트인한다. 옵트인하지 않은 도구는 이름만 classifier에 노출한다 — 대부분의 경우 명시적 `allow` 규칙이 없으면 보수적으로 차단된다. 이것은 설계상 실패 시 차단이다(자격 증명과 대량 내용이 classifier LLM으로 유출되지 않는다). 특정 MCP 도구를 신뢰하면 `permissions.allow: ["mcp__server__tool"]`를 추가하여 classifier를 완전히 우회하라.

## FAQ

**Auto Mode가 내 코드를 서드파티에 전송하나?**

Auto Mode는 기존 모델 설정을 재사용한다 — 메인 에이전트와 동일한 엔드포인트. Qwen Code를 자체 호스팅 모델로 설정했다면 classifier도 해당 엔드포인트에서 실행된다.

**내 비밀 / `.env` 내용이 classifier에 도달하나?**

classifier는 각 도구의 `toAutoClassifierInput` 투영이 노출하는 것만 본다:

- `read_file` 및 기타 읽기 전용 도구: 호출되지 않음(빠른 경로 허용 목록에 있음).
- `edit` / `write_file`: file_path 및 old/new 내용의 처음 80자. 전체 내용은 전달되지 않는다.
- `run_shell_command`: 전체 명령(전달해야 한다 — classifier가 판단하는 대상).
- `web_fetch`: URL만. 프롬프트 필드는 전달되지 않는다.
- `agent`: 서브에이전트 타입 및 전체 프롬프트. 프롬프트는 서브에이전트가 따를 지시이므로 classifier가 파괴적 동작으로 서브에이전트를 유도하는 공격을 탐지하려면 전체가 필요하다 — `run_shell_command`이 전체 명령을 전달하는 것과 같은 이유.

도구 결과(도구가 반환한 실제 내용)는 classifier 트랜스크립트에서 완전히 제거된다.

MCP 도구(`mcp__*`)는 더 엄격한 기본값을 따른다: MCP 도구 작성자가 `toAutoClassifierInput` 오버라이드로 명시적 옵트인하지 않으면 매개변수가 전달되지 않는다. classifier는 도구 이름만 보고 인수는 보지 않으므로 사용자가 명시적 allow 규칙을 작성하지 않은 한 대부분의 MCP 호출은 보수적으로 차단된다. 이것은 설계상 실패 시 차단이다 — 서드파티 도구가 의도 없이 자격 증명이나 대량 파일 내용을 classifier LLM으로 유출해서는 안 된다.

**첫 번째 정보 메시지를 비활성화할 수 있나?**

사용자 설정 파일당 한 번만 표시된다. 해제 후 `ui.autoModeAcknowledged: true`가 사용자 설정에 저장된다.

**Auto-Edit와 어떻게 다른가?**

Auto-Edit는 파일 편집만 자동 승인하고 나머지는 묻는다. Auto Mode는 classifier를 사용해 안전한 셸 명령어와 다른 도구 호출도 자동 승인하면서 위험한 것은 차단한다.

**YOLO와 어떻게 다른가?**

YOLO는 검토 없이 모든 것을 자동 승인한다. Auto Mode는 classifier가 루프에 있어 위험한 동작을 차단한다.
