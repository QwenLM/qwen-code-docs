# 명령어

이 문서는 Qwen Code에서 지원하는 모든 명령어를 설명하며, 세션 관리, 인터페이스 커스터마이징, 동작 제어를 효율적으로 수행할 수 있도록 도와줍니다.

Qwen Code 명령어는 특정 접두사를 통해 실행되며 세 가지 범주로 나뉩니다:

| 접두사 유형                  | 기능 설명                                     | 일반적인 사용 사례                                               |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| 슬래시 명령어 (`/`)          | Qwen Code 자체에 대한 메타 수준의 제어        | 세션 관리, 설정 수정, 도움말 확인                                |
| At 명령어 (`@`)              | 로컬 파일 내용을 대화에 빠르게 주입           | AI가 지정된 파일이나 디렉터리 아래의 코드를 분석하도록 허용      |
| 느낌표 명령어 (`!`)          | 시스템 Shell과 직접 상호작용                  | `git status`, `ls` 등의 시스템 명령어 실행                       |

## 1. 슬래시 명령어 (`/`)

슬래시 명령어는 Qwen Code 세션, 인터페이스, 기본 동작을 관리하는 데 사용됩니다.

### 1.1 세션 및 프로젝트 관리

이 명령어들은 작업 진행 상황을 저장, 복원, 요약하는 데 도움이 됩니다.

| 명령어           | 설명                                                                             | 사용 예시                                                       |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/init`          | 현재 디렉터리를 분석하고 초기 컨텍스트 파일을 생성                               | `/init`                                                         |
| `/summary`       | 대화 기록을 기반으로 프로젝트 요약을 생성                                        | `/summary` 또는 `/summary docs/my-summary.md`                   |
| `/compress`      | 토큰 절약을 위해 대화 기록을 요약으로 대체                                     | `/compress` 또는 `/summarize`                                   |
| `/compress-fast` | AI 없이 빠른 압축 — 오래된 도구 출력과 사고 과정을 제거                          | `/compress-fast`                                                |
| `/resume`        | 이전 대화 세션을 재개                                                            | `/resume` 또는 `/continue`                                      |
| `/recap`         | 즉시 한 줄 세션 요약을 생성                                                     | `/recap`                                                        |
| `/restore`       | 도구 호출 실행 전 체크포인트로 프로젝트 파일을 되돌림                            | `/restore` (목록) 또는 `/restore <ID>`                          |
| `/delete`        | 이전 세션을 삭제                                                                 | `/delete`                                                       |
| `/branch`        | 현재 대화를 새 세션으로 포크                                                     | `/branch`                                                       |
| `/fork`          | 전체 대화를 상속하는 백그라운드 에이전트를 생성                                  | `/fork <directive>`                                             |
| `/rewind`        | 대화를 이전 턴으로 되감기                                                        | `/rewind` 또는 `/rollback`                                      |
| `/export`        | 세션 기록을 파일로 내보내기                                                      | `/export html`, `/export md`, `/export json`, `/export jsonl`   |
| `/rename`        | 현재 세션의 이름을 변경하거나 태그를 추가                                        | `/rename My Feature` 또는 `/tag`                                |
| `/commit` | AI가 작성한 메시지로 git 커밋 생성 | `/commit` 또는 `/commit only stage the parser changes` |

> [!note]
>
> HTML 내보내기를 열면 `unpkg.com`에서 해당 Qwen Code 버전의 렌더러와 스타일시트를 로드합니다. 해당 버전이 아직 배포되지 않았거나 두 파일 중 어느 하나에 도달할 수 없는 경우, 파일에 로드 오류가 표시됩니다. Markdown, JSON, JSONL 내보내기는 자체 완결적입니다.

> [!note]
>
> `/summarize`는 `/compress`의 별칭입니다(대화 기록을 압축합니다 — 되돌릴 수 없는 작업). 비파괴적 프로젝트 요약을 생성하려면 `/summary`를 사용하세요.

> [!note]
>
> `/summary`는 선택적 `[path]` 인수를 받아 프로젝트 루트 내의 사용자 지정 위치에 요약을 저장합니다. 인수 없이 실행하면 `.qwen/PROJECT_SUMMARY.md`에 저장됩니다. 사용자 지정 경로의 요약은 환영 메시지 흐름(`ui.enableWelcomeBack`)에서 감지되지 않으며, 이 흐름은 기본 `.qwen/PROJECT_SUMMARY.md` 위치만 읽습니다.

### 1.2 인터페이스 및 작업 공간 제어

인터페이스 외관과 작업 환경을 조정하는 명령어입니다.

| 명령어               | 설명                                                                                                                                                                              | 사용 예시                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/clear`             | 대화 기록을 지우고 컨텍스트 창을 확보                                                                                                                                              | `/clear`, `/reset`, `/new`                                                          |
| `/context`           | 컨텍스트 창 사용량 세부 정보를 표시                                                                                                                                                 | `/context`                                                                          |
| → `detail`           | 항목별 컨텍스트 사용량 세부 정보를 표시                                                                                                                                            | `/context detail`                                                                   |
| `/history`           | 기록 표시 환경 설정 및 가시성 제어                                                                                                                                                  | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`   |
| `/diff`              | 커밋되지 않은 변경 사항과 턴별 diff를 보여주는 대화형 diff 뷰어를 엽니다. ←/→로 현재 git diff와 개별 대화 턴을 전환하고, ↑/↓로 파일을 탐색합니다                                  | `/diff`                                                                             |
| `/log`               | 작업 공간의 커밋 기록 뷰어를 엽니다 (Web Shell 전용)                                                                                                                               | `/log`                                                                              |
| `/theme`             | Qwen Code 비주얼 테마를 변경                                                                                                                                                        | `/theme`                                                                            |
| `/vim`               | 입력 영역 Vim 편집 모드를 켜기/끄기                                                                                                                                                | `/vim`                                                                              |
| `/voice`             | 음성 받아쓰기 입력을 토글                                                                                                                                                           | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`               |
| `/directory`         | 다중 디렉터리 지원 작업 공간을 관리                                                                                                                                                 | `/dir add ./src,./tests`, `/dir show`                                               |
| `/cd`                | 이 세션을 새 작업 디렉터리로 이동                                                                                                                                                   | `/cd ../other-project`                                                              |
| `/editor`            | 지원되는 편집기를 선택하는 대화 상자를 엽니다                                                                                                                                       | `/editor`                                                                           |
| `/statusline`        | 대화형 [상태 표시줄](./status-line.md) 프리셋 대화 상자를 엽니다                                                                                                                    | `/statusline`                                                                       |
| `/statusline <text>` | 에이전트를 통해 명령 모드 [상태 표시줄](./status-line.md)을 생성합니다                                                                                                              | `/statusline show model and git branch`                                             |
| `/terminal-setup`    | 여러 줄 입력을 위한 터미널 키 바인딩을 설정                                                                                                                                         | `/terminal-setup`                                                                   |

### 1.3 언어 설정

인터페이스 및 출력 언어를 제어하는 명령어입니다.

| 명령어                | 설명                     | 사용 예시                  |
| --------------------- | ------------------------ | -------------------------- |
| `/language`           | 언어 설정을 확인하거나 변경 | `/language`                |
| → `ui [language]`     | UI 인터페이스 언어를 설정 | `/language ui zh-CN`       |
| → `output [language]` | LLM 출력 언어를 설정      | `/language output Chinese` |

- 사용 가능한 내장 UI 언어: `zh-CN`(중국어 간체), `en-US`(영어), `ru-RU`(러시아어), `de-DE`(독일어), `ja-JP`(일본어), `pt-BR`(포르투갈어 - 브라질), `fr-FR`(프랑스어), `ca-ES`(카탈로니아어)
- 출력 언어 예시: `Chinese`, `English`, `Japanese` 등

### 1.4 도구 및 모델 관리

AI 도구와 모델을 관리하는 명령어입니다.

| 명령어 | 설명 | 사용 예시 |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | 구성된 MCP 서버 및 도구 목록 표시 | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | Claude 구성에서 MCP 서버 가져오기 | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | 현재 사용 가능한 도구 목록 표시 | `/tools`, `/tools desc` |
| `/skills` | 스킬을 탐색, 검색, 토글 및 실행하기 위해 Skills 패널 열기 | `/skills`, `/<skill-name>` |
| `/learn` | 파일, 디렉터리, URL, 비디오 또는 텍스트에서 재사용 가능한 프로젝트 스킬 생성 | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment` |
| `/curator` | 비활성화된 프로젝트 자동 스킬 검사, 고정, 보관 또는 복원 | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>` |
| `/plan` | 계획 모드로 전환하거나 계획 모드 종료 | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | 도구 승인 모드 변경 (현재 세션에만 적용) | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | 분석만 수행하며 실행하지 않음 (보안 검토) | `/approval-mode plan` |
| → `default` | 편집 시 승인 필요 (일상 사용) | `/approval-mode default` |
| → `auto-edit` | 편집 자동 승인 (신뢰할 수 있는 환경) | `/approval-mode auto-edit` |
| → `auto` | 분류기 평가 기반 승인 (자율적) | `/approval-mode auto` |
| → `yolo` | 모든 항목 자동 승인 (빠른 프로토타이핑) | `/approval-mode yolo` |
| `/peers` | 대기 중인 피어 메시지 검토; 신뢰할 수 있는 컨트롤러 관리 | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>` |
| `/model` | 현재 세션에서 사용하는 모델 전환 | `/model`, `/model <model-id>` (즉시 전환) |
| `/model --fast` | 프롬프트 제안용 경량 모델 설정 | `/model --fast qwen3-coder-flash` |
| `/model --voice` | 음성 전사(transcription)에 사용할 모델 설정 | `/model --voice <model-id>` |
| `/model --vision` | 텍스트 전용 메인 모델을 위해 이미지를 전사하는 데 사용되는 비전 브리지 모델 설정 | `/model --vision <model-id>` |
| `/model --compaction` | 채팅 압축에 사용할 모델 설정 | `/model --compaction <model-id>`, `/model --compaction clear` |
| `/model --image` | 내장 이미지 생성 도구에 사용할 이미지 생성 지원 모델 설정 | `/model --image <model-id>` |
| `/effort` | 사고(thinking) 기능 모델의 추론 강도 설정 | `/effort` (선택 창 열림), `/effort high` (low/medium/high/xhigh/max; 제공업체별로 매핑 및 제한됨) |
| `/output-style` | 응답 작성 방식을 결정하는 출력 스타일 선택 | `/output-style` (선택 창 열림), `/output-style Concise`, `/output-style default` (스타일 없음) |
| `/extensions` | 확장 프로그램 관리 | `/extensions list`, `/extensions manage` |
| → `list` | 설치된 확장 프로그램 목록 표시 | `/extensions list` |
| → `manage` | 설치된 확장 프로그램 관리 (대화형) | `/extensions manage` |
| → `explore` | 브라우저에서 확장 프로그램 페이지 열기 | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | Git 저장소 또는 경로에서 확장 프로그램 설치 | `/extensions install <repo-or-path>` |
| `/memory` | Memory Manager 대화 상자 열기 | `/memory` |
| `/remember` | 영구적인 메모리 저장 | `/remember Prefer terse responses` |
| `/forget` | 자동 메모리에서 일치하는 항목 제거 | `/forget <query>` |
| `/dream` | 자동 메모리 통합(consolidation) 수동 실행 | `/dream` |
| `/hooks` | Qwen Code 훅(hooks) 관리 | `/hooks`, `/hooks list` |
| `/reload-plugins` | 디스크에서 확장 프로그램 변경 사항(명령어, 스킬, 에이전트, 워크플로, 훅, MCP/LSP 서버) 다시 로드 | `/reload-plugins` |
| `/permissions` | 권한 규칙 관리 | `/permissions` |
| `/agents` | 서브에이전트(subagents) 관리 | `/agents manage`, `/agents create` |
| `/arena` | Arena 세션 관리 | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (별칭 `choose`) |
| `/goal` | 목표(Goal) 설정 — 검증자가 확인할 때까지 계속 작업 ([Goals](./goals.md) 참조) | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear` |
| `/tasks` | 백그라운드 작업 목록 표시 | `/tasks` |
| `/workflows` | 워크플로 실행 검사; 백그라운드 실행을 협력적으로 일시 중지/재개 | `/workflows`, `/workflows <runId>`, `/workflows p <runId>` |
| `/lsp` | LSP 서버 상태 표시 | `/lsp` |
| `/trust` | 폴더 신뢰(trust) 설정 관리 | `/trust` |

> [!warning]
>
> 신뢰할 수 있는 소스의 확장 프로그램(`/extensions install`)만 설치하세요. 확장 프로그램에는 Qwen Code 자체와 동일한 권한으로 실행되는 MCP 서버, 스킬 및 명령어가 포함될 수 있으며, 파일, API 키 및 대화 데이터에 접근할 수 있습니다. 또한 워크플로 스크립트를 포함할 수도 있는데, 이는 직접적인 파일 또는 셸 접근 없이 워크플로 샌드박스에서 실행되고, 시작하는 서브에이전트를 통해 동작하며, Workflow 도구의 승인을 거칩니다. `/extensions install`은 확인 프롬프트를 표시하지 않습니다.

> [!warning]
>
> `auto-edit`, `auto`, `yolo` 승인 모드는 도구 실행에 대한 승인 프롬프트를 건너뜁니다. `yolo` 모드에서는 shell 명령어, 파일 쓰기, 네트워크 요청을 포함한 모든 작업이 확인 없이 실행됩니다. 신뢰할 수 있는, 샌드박스 또는 일회용 환경에서만 이 모드를 사용하세요.

> [!note]
>
> `/workflows`, `/lsp`, `/trust`는 각 기능이 활성화되었을 때만 등록됩니다 — 각각 사용자/시스템 범위의 `tools.workflowsEnabled` 설정 또는 `QWEN_CODE_ENABLE_WORKFLOWS=1` 환경 변수, `--experimental-lsp` CLI 플래그, `security.folderTrust.enabled` 설정을 통해 활성화됩니다. `tools.workflowsEnabled`의 워크스페이스 값은 무시됩니다. 비활성화되면 표시되지 않으며 알 수 없는 명령어로 보고됩니다. 마찬가지로, `/dream`과 `/forget`은 관리되는 자동 memory가 사용 가능한 경우에만 등록됩니다; 그렇지 않으면 표시되지 않습니다.

> [!note]
>
> 설치된 확장 프로그램의 스킬도 슬래시 명령어이며, 이름에 소유자가 포함됩니다: `/pdf`이 아니라 `/rust:pdf`입니다. 맨 형태는 별칭이 아닙니다 — 다른 스킬 이름이 `pdf`인 경우, `/pdf`은 해당 스킬 대신 실행됩니다. `slashCommands.disabled`는 이러한 명령어를 두 가지 표기법 모두에서 게이트(gate) 처리하므로, 이름에 소유자가 포함되기 전에 작성된 항목도 여전히 영향을 미칩니다. [확장 프로그램 스킬 명명 방식](./skills.md#how-extension-skills-are-named)을 참조하세요.

### 1.5 내장 스킬

이러한 명령어는 전문화된 워크플로를 제공하는 번들링된 스킬을 호출합니다.

| 명령어 | 설명 | 사용 예시 |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/review` | 멀티 에이전트 코드 리뷰 (높은 강도로 12개의 병렬 에이전트) | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | 읽기 전용 워커와 하나의 선택적 worktree 작성자 조정 | `/coordinate investigate and fix the authentication regression` |
| `/loop` | 반복되는 일정에 따라 프롬프트 실행 | `/loop 5m check the build` |
| `/goal-draft` | 모호한 의도를 검증 가능한 `/goal` 목표로 변환 | `/goal-draft make the auth tests pass` |
| `/autofix-pr` | PR을 모니터링하고 CI, 리뷰 피드백 및 충돌 수정 | `/autofix-pr 123`, `/autofix-pr 123 --once`, `/autofix-pr resume`, `/autofix-pr stop 123` |
| `/simplify` | 최근 변경 사항 검토 및 안전한 정리 편집 직접 적용 | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | Qwen Code 사용 및 구성 관련 질문에 답변 | `/qc-helper how do I configure MCP?` |

전체 `/review` 문서는 [Code Review](./code-review.md)를, `/autofix-pr` 문서는 [Autofix a Pull Request](./autofix-pr.md)를 참조하세요.

### 1.6 사이드 질문 (`/btw`)

`/btw` 명령어를 사용하면 기본 대화 흐름을 중단하거나 영향을 주지 않고 빠른 사이드 질문을 할 수 있습니다.

| 명령어                 | 설명                           |
| ---------------------- | ------------------------------ |
| `/btw <your question>` | 빠른 사이드 질문을 합니다      |
| `?btw <your question>` | 사이드 질문의 대체 구문        |

**작동 방식:**

- 사이드 질문은 최근 대화 컨텍스트(최대 20개 메시지까지)와 함께 별도의 API 호출로 전송됩니다
- 응답은 Composer 위에 표시됩니다 — 대기 중에도 계속 입력할 수 있습니다
- 기본 대화가 **차단되지 않습니다** — 독립적으로 계속 진행됩니다
- 사이드 질문 응답은 기본 대화 기록에 포함되지 **않습니다**
- 답변은 전체 Markdown 지원과 함께 렌더링됩니다 (코드 블록, 목록, 표 등)

**키보드 단축키 (대화형 모드):**

| 단축키               | 동작                                              |
| -------------------- | -------------------------------------------------- |
| `Escape`             | 취소 (로딩 중) 또는 닫기 (완료 후)                |
| `Space` 또는 `Enter` | 답변을 닫기 (입력이 비어 있을 때)                 |
| `Ctrl+C` 또는 `Ctrl+D` | 진행 중인 사이드 질문 취소                      |

**예시:**

```
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**지원 실행 모드:**

| 모드 | 동작 |
| -------------------- | -------------------------------------------- |
| 대화형 | Composer 위에 Markdown 렌더링으로 표시 |
| Non-interactive      | 텍스트 결과 반환: `btw> question\nanswer`    |
| ACP (Agent Protocol) | stream_messages 비동기 생성기 반환           |

> [!tip]
>
> 기본 작업에서 벗어나지 않고 빠른 답변이 필요할 때 `/btw`를 사용하세요. 개념을 명확히 하거나, 사실을 확인하거나, 기본 워크플로우에 집중하면서 빠른 설명을 얻는 데 특히 유용합니다.

### 1.7 두 번째 의견 (`/advisor`) [#17-second-opinion-advisor]

`/advisor` 명령어는 지금까지의 대화에 대한 독립적이고 읽기 전용 리뷰를 실행하여 구조화된 두 번째 의견을 반환합니다 — 작업을 수행하거나 기본 대화를 중단하지 않습니다.

| 명령어             | 설명                               |
| ------------------ | ---------------------------------- |
| `/advisor`         | 위 대화를 리뷰                     |
| `/advisor <focus>` | 특정 우려사항에 리뷰 집중          |

**작동 방식:**

- 리뷰는 최근 대화 컨텍스트(최대 최근 40개 메시지)와 함께 별도의 단일 턴 API 호출로 전송됩니다
- 리뷰어 모델은 **도구를 실행할 수 없습니다** — 도구는 요청 수준에서 제거되며(`/btw`와 동일한 메커니즘), 리뷰는 코드를 작성하거나 명령을 실행하지 않습니다; 모든 주장은 보이는 트랜스크립트에 기반해야 합니다
- 기본 대화는 중단되지 **않습니다**; 리뷰는 사용자에게만 표시됩니다
- 리뷰는 `/advisor · <model>` 헤더 아래에 네 개의 고정 섹션 — **Verdict**, **Risks**, **Missing evidence**, **Recommendation** — 이 있는 박스형 마크다운 블록으로 렌더링되며, 해결된 리뷰어 모델 이름을 표시합니다
- fire-and-forget 방식이라 세션을 사용할 수 있게 두는 `/btw`와 달리, `/advisor`는 리뷰가 반환될 때까지 입력을 차단합니다; 전체 컨텍스트 창에 걸쳐 강력한 리뷰어를 사용하면 수십 초가 걸릴 수 있습니다
- 기본적으로 기본 모델이 사용됩니다; [`advisorModel`](../configuration/settings.md#advisormodel)을 설정하여 리뷰를 다른(보통 더 강력한) 모델로 라우팅합니다 — 최근 트랜스크립트는 다른 제공자를 사용하더라도 해당 모델로 전송됩니다

**예시:**

```
> /advisor is my fix for the null check actually correct?

  Consulting advisor...

  ╭──────────────────────────────────────────────────────╮
  │ /advisor · qwen3-max                                 │
  │                                                      │
  │ Verdict                                              │
  │ The approach is sound, but the edge case at line 42  │
  │ is unverified.                                       │
  │                                                      │
  │ Risks                                                │
  │  - The fix assumes the config is always loaded; a    │
  │    startup race could leave it null.                 │
  │                                                      │
  │ Missing evidence                                     │
  │  - No test exercises the null-config path in the     │
  │    visible transcript.                               │
  │                                                      │
  │ Recommendation                                       │
  │ Add a focused unit test for the null-config branch   │
  │ before merging.                                      │
  ╰──────────────────────────────────────────────────────╯
```

리뷰는 헤더에 해결된 리뷰어 모델 이름을 표시하는 테두리 박스로 렌더링됩니다. 알 수 없는 `advisorModel`은 미리 검증되지 않습니다 — 제공자가 거부하면 `/advisor`가 실패를 보고하므로 모델 이름을 확인하세요; 해결할 수 없는 별칭 선택자(예: 빠른 모델이 구성되지 않은 `fast`)만 기본 모델로 폴백합니다. Advisor 요청은 구성된 모델 폴백을 사용하지 않습니다.

**지원 실행 모드:**

| 모드                 | 동작                                               |
| -------------------- | -------------------------------------------------- |
| Interactive          | 대화에서 4개 섹션 리뷰를 렌더링                    |
| ACP (Agent Protocol) | 리뷰를 메시지 결과로 반환                          |

> [!tip]
>
> 방향을 결정하기 전에 두 번째 의견을 얻으려면 `/advisor`를 사용하세요 — 결함 있는 가정, 검증되지 않은 주장 또는 위험한 다음 단계를 포착하는 데 특히 유용합니다. `advisorModel`을 구성하여 기본 대화와 다른 모델의 리뷰를 받으세요.

> [!note]
>
> `advisorModel`은 설정에서만 지정됩니다; `fastModel` 및 `visionModel`과 달리 아직 `/model` 플래그 대응 항목이 없습니다.

### 1.8 세션 요약 (`/recap`)

`/recap` 명령은 현재 세션의 "이어서 작업할 위치"를 나타내는 짧은 요약을 생성하므로, 긴 대화 기록을 스크롤하지 않고도 이전 대화를 쉽게 이어갈 수 있습니다.

| 명령어 | 설명 |
| -------- | ------------------------------------------ |
| `/recap` | 한 줄 세션 요약을 생성하고 표시  |

**작동 방식:**

- 설정된 빠른 모델(`fastModel` 설정)을 우선 사용하며, 사용할 수 없는 경우 메인 세션 모델로 대체합니다. 요약에는 작고 저렴한 모델이면 충분합니다.
- 최근 대화 내용(최대 30개 메시지, 텍스트만 포함 — 도구 호출 및 도구 응답은 제외됨)이 엄격한 시스템 프롬프트와 함께 모델로 전송됩니다.
- 요약은 실제 어시스턴트 답변과 구분되도록 `❯` 접두사와 함께 어두운 색상으로 렌더링됩니다.
- 모델 응답 처리 중이거나 다른 명령이 실행 중인 경우 인라인 오류 메시지와 함께 요청을 거부합니다. 사용 가능한 대화가 없거나 기본 생성 프로세스가 실패하면 `/recap`은 요약 대신 짧은 정보 메시지를 표시합니다. 수동 명령은 항상 응답을 제공합니다.

터미널이 **5분 이상** 흐려졌다가 다시 포커스되면 요약이

터미널 포커스가 **5분 이상** 해제된 후 다시 활성화되면 요약이 자동으로 생성되어 표시됩니다(모델 응답 처리 중일 때는 현재 턴이 완료될 때까지 대기한 후 실행). 수동 명령과 달리 자동 트리거는 실패 시 완전히 조용하게 동작합니다: 생성 오류 발생이나 요약할 내용이 없을 경우 히스토리에 메시지가 추가되지 않습니다. `general.showSessionRecap` 설정으로 제어되며(기본값: `false`), 수동 `/recap` 명령은 이 설정과 관계없이 항상 작동합니다.

**예시:**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> `/model --fast <model>`을 통해 빠른 모델을 설정하여(예: `qwen3-coder-flash`) `/recap`을 빠르고 저렴하게 만듭니다. 자동 트리거를 활성화하려면 `general.showSessionRecap`을 `true`으로 설정하십시오. 수동 `/recap` 명령은 이 설정과 관계없이 항상 작동합니다.

### 1.9 Diff 뷰어 (`/diff`)

`/diff` 명령어는 커밋되지 않은 변경 사항과 턴별 diff를 보여주는 대화형 diff 뷰어를 엽니다. ←/→로 현재 git diff와 개별 대화 턴을 전환하고, ↑/↓로 파일을 탐색하고, Enter로 인라인 diff를 확인합니다.

**작동 방식:**

대화형 모드에서, `/diff`는 상단에 **소스 피커**가 있는 대화 상자를 엽니다:

- **Current** — 작업 트리와 HEAD 비교 (`git diff HEAD`). 스테이징, 언스테이징, 추적되지 않은 파일을 포함한 모든 커밋되지 않은 변경 사항을 표시합니다.
- **T1, T2, T3, …** — 턴별 diff, 파일을 수정한 각 모델 턴마다 하나의 탭. 가장 최근 턴이 먼저 표시됩니다. 각 탭에는 컨텍스트를 위한 원본 프롬프트의 미리보기가 표시됩니다.

파일 목록은 파일별 통계(추가/삭제된 줄 수)와 특수 상태에 대한 태그(`new`, `deleted`, `untracked`, `binary`, `truncated`, `oversized`)를 표시합니다. 파일에서 Enter를 누르면 구문 강조된 hunk와 함께 인라인 diff를 볼 수 있습니다.

턴별 diff는 파일 체크포인트가 활성화되어 있어야 합니다 (대화형 모드에서 기본적으로 켜져 있음). 파일 체크포인트가 꺼져 있으면 "Current" 소스만 사용 가능합니다.

**키보드 단축키:**

| 키        | 동작                                      |
| --------- | ----------------------------------------- |
| `←` / `→` | 소스 간 전환 (Current / T1 / T2…)         |
| `↑` / `↓` | 파일 목록 탐색                            |
| `j` / `k` | 파일 목록 탐색 (vim 스타일)               |
| Enter     | 선택한 파일의 인라인 diff 보기             |
| `←` / Esc | 인라인 diff 보기에서 파일 목록으로 복귀   |
| Esc       | 대화 상자 닫기                             |

**예시:**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**비대화형 모드:**

헤드리스 모드(`--prompt`) 또는 비대화형 컨텍스트에서, `/diff`는 작업 트리와 HEAD 비교의 일반 텍스트 요약을 출력합니다. 턴별 탐색은 사용할 수 없습니다.

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

**Web Shell:** Web Shell UI(`qwen serve`)에서, `/diff`는 그래픽 diff 대화 상자를 엽니다. 상단의 탭 바를 통해 **Changes** 뷰와 **History** 뷰(`/log`) 간에 전환할 수 있습니다.

#### History 뷰어 (`/log`) — Web Shell 전용

`/log` 명령어는 현재 작업 공간의 커밋 기록 브라우저를 엽니다. Web Shell UI에서만 사용할 수 있으며, CLI/TUI에는 이 명령어가 없습니다.

**작동 방식:**

`/log`는 커밋을 역순(최신 우선)으로 나열하는 대화 상자를 엽니다. 각 행에는 다음이 표시됩니다:

- 짧은 SHA (모노스페이스, 전체 SHA를 위한 복사 버튼 포함)
- 커밋 제목 (한 줄)
- 작성자 이름과 상대적 시간 (예: "2h ago")
- 브랜치/태그 ref 라벨 (있는 경우)
- 병합 커밋에 대한 병합 아이콘 (⎇)

커밋 행을 클릭하면 상세 정보가 필요에 따라 확장됩니다:

- 전체 커밋 메시지 본문
- 파일 변경 통계 (변경된 파일, 추가/삭제된 줄, 파일별 세부 정보)

하단의 **Load more**를 사용하여 다음 페이지의 커밋을 가져옵니다 (페이지당 50개).

**예시:**

```
┌─ History ──────────────────────────── 50 commits ─ ✕ ┐
│                                                       │
│  a1b2c3d  feat(cli): add --json flag        2h ago   │
│           wenshao                                    │
│                                                       │
│  e4f5g6h  fix(core): handle null config     5h ago   │
│           dev · main  v1.2.0                         │
│                                                       │
│ ▼ 789abcd  refactor: simplify parser        1d ago   │
│   ┌─────────────────────────────────────────────┐    │
│   │  Broke the monolithic parse() into smaller  │    │
│   │  functions for readability.                 │    │
│   │                                             │    │
│   │  3 files · +45 −12                          │    │
│   │   +30 −8   src/parser.ts                    │    │
│   │   +10 −2   src/utils.ts                     │    │
│   │   +5  −2   test/parser.test.ts              │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│              [ Load more ]                            │
└───────────────────────────────────────────────────────┘
```

> [!note]
>
> `/log`는 git 저장소 작업 공간이 필요합니다. 작업 공간이 git 저장소가 아니거나 커밋이 없으면, 대화 상자에 플레이스홀더 메시지가 표시됩니다.

### 1.10 정보, 설정 및 도움말

정보를 얻고 시스템 설정을 수행하는 명령어입니다.

| 명령어           | 설명                                                                                                                    | 사용 예시                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/help`          | 사용 가능한 명령어에 대한 도움말 정보를 표시                                                                             | `/help` 또는 `/?`                                                                     |
| `/status`        | 버전 정보를 표시                                                                                                         | `/status` 또는 `/about`                                                               |
| `/status paths`  | 현재 세션 파일 및 로그 경로를 표시                                                                                       | `/status paths`                                                                       |
| `/stats`         | 대화형 사용 통계 대시보드를 엽니다 (Session, Activity, Efficiency 탭)                                                    | `/stats` 또는 `/usage`                                                                |
| `/stats model`   | 모델별 토큰 사용량과 예상 비용을 표시                                                                                    | `/stats model`                                                                        |
| `/stats tools`   | 도구별 호출 횟수를 표시                                                                                                 | `/stats tools`                                                                        |
| `/stats skills`  | 현재 라이브 세션의 skill별 호출 횟수를 표시 (라이브만; 교차 세션 일일/월간 활동 제외)                                    | `/stats skills`                                                                       |
| `/stats daily`   | 일일 토큰 사용량 통계를 표시                                                                                            | `/stats daily` (별칭 `day`), `/stats day [YYYY-MM-DD]`                                |
| `/stats monthly` | 월간 토큰 사용량 통계를 표시                                                                                            | `/stats monthly` (별칭 `month`), `/stats month [YYYY-MM]`                             |
| `/stats export`  | 사용 통계를 CSV 또는 JSON으로 내보내기                                                                                   | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]`   |
| `/settings`      | 설정 편집기를 엽니다                                                                                                     | `/settings`                                                                           |
| `/config`        | 점 경로(dot-path) 키로 모든 설정을 가져오거나 설정합니다 (사용자 설정에 기록)                                             | `/config` (전체 목록), `/config <key>`, `/config <key>=<value>`                       |
| `/auth`          | 인증 방식을 변경                                                                                                         | `/auth`, `/connect`, `/login`                                                         |
| `/logout` | 활성 Qwen 구독 계정에서 로그아웃 (Qwen 구독 로그인 사용 가능) | `/logout` |
| `/upgrade` | Qwen 구독 플랜 열기 (Qwen 구독 로그인 사용 가능) | `/upgrade` |
| `/doctor`        | 설치 및 환경 진단을 실행                                                                                                 | `/doctor`, `/doctor memory`                                                           |
| → `memory`       | 현재 프로세스 메모리 진단을 표시                                                                                         | `/doctor memory [--json] [--sample] [--snapshot]`                                     |
| → `cpu-profile`  | Chrome DevTools 분석을 위한 CPU 프로파일을 기록                                                                          | `/doctor cpu-profile [--duration <seconds>]`                                          |
| → `rollback`     | 독립 실행형 CLI 바이너리를 이전 버전으로 롤백합니다 (독립 실행형 설치 전용; 대화 기록은 `/rewind` 사용)                  | `/doctor rollback`                                                                    |
| `/docs`          | 브라우저에서 전체 Qwen Code 문서를 엽니다                                                                                | `/docs`                                                                               |
| `/ide`           | IDE 통합을 관리                                                                                                          | `/ide status`, `/ide install`, `/ide enable`, `/ide disable`                          |
| `/insight`       | 대화 기록에서 프로그래밍 인사이트를 생성                                                                                 | `/insight`                                                                            |
| `/setup-github`  | GitHub Actions를 설정                                                                                                    | `/setup-github`                                                                       |
| `/bug`           | Qwen Code에 대한 이슈를 제출                                                                                             | `/bug Button click unresponsive`                                                      |
| `/copy`          | 클립보드에 복사: 응답 (마지막 N번째), 코드 (언어별), LaTeX, 또는 Mermaid                                                 | `/copy`, `/copy 2`, `/copy python`, `/copy latex`, `/copy mermaid`                    |
| `/quit`          | Qwen Code를 즉시 종료                                                                                                    | `/quit` 또는 `/exit`                                                                  |

> [!warning]
>
> `/doctor memory --snapshot`은 현재 세션의 프롬프트, 파일 내용, API 키, 도구 결과를 포함할 수 있는 V8 힙 스냅샷을 작성합니다. 공유하기 전에 파일을 검토하세요.

> [!note]
>
> `/config`는 점 경로 키(예: `general.vimMode`)로 개별 설정을 읽고 쓰며, 대화형 `/settings` 편집기를 보완합니다. 인수 없이 `/config`를 실행하면(또는 `--help`) 모든 설정 가능한 키가 유형과 현재 값과 함께 나열됩니다. `/config <key>`는 현재 값을 출력합니다 — 부울 키의 경우 값을 토글합니다. `/config <key>=<value>`는 값을 설정합니다. 변경 사항은 사용자 설정(`~/.qwen/settings.json`)에 기록됩니다. `boolean`, `string`, `number`, `enum` 설정만 이 방식으로 변경할 수 있습니다 — `array`와 `object` 설정은 `settings.json`에서 직접 편집해야 합니다. 민감한 값(API 키, 토큰, base URL)은 출력에서 마스킹되며, `tools.approvalMode`를 `yolo`로 설정하는 것은 차단됩니다.

### 1.11 일반적인 단축키

| 단축키             | 기능                    | 참고                                                                                |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | 화면 지우기             | 보이는 화면만 지웁니다 (`/clear`처럼 세션을 초기화하지 않음)                        |
| `Ctrl/cmd+T`       | 도구 설명 토글          | MCP 도구 관리                                                                       |
| `Ctrl/cmd+C`×2     | 종료 확인               | 안전한 종료 메커니즘                                                                |
| `Ctrl/cmd+Z`       | 입력 실행 취소          | 텍스트 편집                                                                         |
| `Ctrl/cmd+Shift+Z` | 입력 다시 실행          | 텍스트 편집                                                                         |

### 1.12 인증 명령어

Qwen Code 세션 내에서 `/auth`를 사용하여 인증을 구성하세요. `/doctor`를 사용하여 현재 인증 및 환경 상태를 확인하세요.

| 명령어    | 설명                                                           |
| --------- | -------------------------------------------------------------- |
| `/auth`   | 대화형으로 인증을 구성합니다 (별칭: `/connect`, `/login`)      |
| `/doctor` | 인증 및 환경 검사를 표시                                       |

> [!note]
>
> 독립 실행형 `qwen auth` CLI 명령어는 제거되었습니다. `qwen auth status`와 같은 레거시 호출은 마이그레이션 안내와 함께 제거 공지를 출력합니다. 자세한 내용은 [인증](../configuration/auth) 페이지를 참조하세요.

## 2. @ 명령어 (파일 가져오기)

@ 명령어는 로컬 파일이나 디렉터리 내용을 대화에 빠르게 추가하는 데 사용됩니다.

| 명령어 형식         | 설명                                 | 예시                                             |
| ------------------- | ------------------------------------ | ------------------------------------------------ |
| `@<file path>`      | 지정된 파일의 내용을 주입            | `@src/main.py Please explain this code`          |
| `@<directory path>` | 디렉터리 내 모든 텍스트 파일을 재귀적으로 읽음 | `@docs/ Summarize content of this document`      |
| 독립 `@`            | `@` 기호 자체에 대해 논의할 때 사용  | `@ What is this symbol used for in programming?` |

참고: 경로에 포함된 공백은 백슬래시로 이스케이프해야 합니다 (예: `@My\ Documents/file.txt`)

대화형 프롬프트에서 `@` 완성은 이모지를 포함한 유니코드 파일 이름을 지원합니다. 프롬프트의 다른 위치에 있는 이모지는 완성용 파일 경로에 영향을 주지 않습니다.

## 3. 느낌표 명령어 (`!`) - Shell 명령어 실행

느낌표 명령어를 사용하면 Qwen Code 내에서 시스템 명령어를 직접 실행할 수 있습니다.

| 명령어 형식        | 설명                                                         | 예시                                 |
| ------------------ | ------------------------------------------------------------ | ------------------------------------ |
| `!<shell command>` | 하위 Shell에서 명령어를 실행                                 | `!ls -la`, `!git status`             |
| 독립 `!`           | Shell 모드로 전환, 모든 입력이 Shell 명령어로 직접 실행됨    | `!`(진입) → 명령어 입력 → `!`(종료)  |

환경 변수: `!`를 통해 실행된 명령어는 `QWEN_CODE=1` 환경 변수를 설정합니다.

## 4. 사용자 정의 명령어 [#4-custom-commands]

자주 사용하는 프롬프트를 단축 명령어로 저장하여 작업 효율을 높이고 일관성을 유지하세요.

> [!note]
>
> 사용자 정의 명령어는 이제 선택적 YAML 프론트매터와 함께 Markdown 형식을 사용합니다. TOML 형식은 더 이상 사용되지 않지만 하위 호환성을 위해 여전히 지원됩니다. TOML 파일이 감지되면 자동 마이그레이션 프롬프트가 표시됩니다.

### 빠른 개요

| 기능           | 설명                             | 장점                                 | 우선순위 | 해당 시나리오                                |
| -------------- | -------------------------------- | ------------------------------------ | -------- | -------------------------------------------- |
| 네임스페이스   | 하위 디렉터리가 콜론 이름의 명령어를 생성 | 더 나은 명령어 구성                  |          |                                              |
| 전역 명령어    | `~/.qwen/commands/`              | 모든 프로젝트에서 사용 가능          | 낮음     | 개인적으로 자주 사용하는 명령어, 교차 프로젝트 사용 |
| 프로젝트 명령어 | `<project root directory>/.qwen/commands/` | 프로젝트별, 버전 관리 가능         | 높음     | 팀 공유, 프로젝트별 명령어                   |

우선순위 규칙: 프로젝트 명령어 > 사용자 명령어 (이름이 같을 때 프로젝트 명령어가 사용됨)

### 명령어 명명 규칙

#### 파일 경로 → 명령어 이름 매핑 표

| 파일 위치                                | 생성되는 명령어   | 예시 호출             |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

명명 규칙: 경로 구분자(`/` 또는 `\`)가 콜론(`:`)으로 변환됩니다

### 이 머신에서 볼 수 있는 Qwen Code 세션 기록을 나열합니다.

사용자 정의 명령은 선택적 YAML frontmatter가 포함된 Markdown 파일을 사용합니다:

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| 필드          | 필수 여부 | 설명                              | 예시                                       |
| ------------- | --------- | --------------------------------- | ------------------------------------------ |
| `description` | 선택      | 명령어 설명 (/help에 표시됨)      | `description: Code analysis tool`          |
| 프롬프트 본문 | 필수      | 모델로 전송되는 프롬프트 내용     | 프론트매터 뒤의 모든 Markdown 내용         |

### TOML 파일 형식 (더 이상 사용되지 않음)

> [!warning]
>
> **더 이상 사용되지 않음:** TOML 형식은 여전히 지원되지만 향후 버전에서 제거될 예정입니다. Markdown 형식으로 마이그레이션하세요.

| 필드          | 필수 여부 | 설명                              | 예시                                       |
| ------------- | --------- | --------------------------------- | ------------------------------------------ |
| `prompt`      | 필수      | 모델로 전송되는 프롬프트 내용     | `prompt = "Please analyze code: {{args}}"` |
| `description` | 선택      | 명령어 설명 (/help에 표시됨)      | `description = "Code analysis tool"`       |

### 매개변수 처리 메커니즘

| 처리 방법                  | 구문               | 적용 시나리오                   | 보안 기능                          |
| -------------------------- | ------------------ | ------------------------------- | ---------------------------------- |
| 컨텍스트 인식 주입         | `{{args}}`         | 정확한 매개변수 제어가 필요한 경우 | 자동 Shell 이스케이프             |
| 기본 매개변수 처리         | 특별한 표시 없음   | 간단한 명령어, 매개변수 추가    | 그대로 추가                        |
| Shell 명령어 주입          | `!{command}`       | 동적 내용이 필요한 경우         | 실행 전 확인 필요                  |

#### 1. 컨텍스트 인식 주입 (`{{args}}`)

| 시나리오           | TOML 설정                             | 호출 방법             | 실제 효과              |
| ------------------ | ------------------------------------- | --------------------- | ---------------------- |
| 원시 주입          | `prompt = "Fix: {{args}}"`            | `/fix "Button issue"` | `Fix: "Button issue"`  |
| Shell 명령어 내    | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`   | `grep "hello" .` 실행  |

#### 2. 기본 매개변수 처리

| 입력 상황     | 처리 방법                                | 예시                                         |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| 매개변수 있음 | 프롬프트 끝에 추가 (두 줄 바꿈으로 구분) | `/cmd parameter` → 원본 프롬프트 + 매개변수  |
| 매개변수 없음 | 프롬프트를 그대로 전송                   | `/cmd` → 원본 프롬프트                       |

🚀 동적 내용 주입

| 주입 유형        | 구문           | 처리 순서       | 목적                           |
| ---------------- | -------------- | --------------- | ------------------------------ |
| 파일 내용        | `@{file path}` | 먼저 처리       | 정적 참조 파일 주입            |
| Shell 명령어     | `!{command}`   | 중간에 처리     | 동적 실행 결과 주입            |
| 매개변수 교체    | `{{args}}`     | 마지막에 처리   | 사용자 매개변수 주입           |

#### 3. Shell 명령어 실행 (`!{...}`)

| 작업                          | 사용자 상호작용      |
| ----------------------------- | -------------------- |
| 1. 명령어와 매개변수 파싱     | -                    |
| 2. 자동 Shell 이스케이프       | -                    |
| 3. 확인 대화 상자 표시         | ✅ 사용자 확인       |
| 4. 명령어 실행                 | -                    |
| 5. 출력을 프롬프트에 주입      | -                    |

예시: Git 커밋 메시지 생성

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. 파일 내용 주입 (`@{...}`)

| 파일 유형    | 지원 상태              | 처리 방법             |
| ------------ | ---------------------- | --------------------- |
| 텍스트 파일  | ✅ 완전 지원           | 내용을 직접 주입      |
| 이미지/PDF   | ✅ 멀티모달 지원       | 인코딩하여 주입       |
| 바이너리 파일| ⚠️ 제한적 지원         | 건너뛰기거나 잘릴 수 있음 |
| 디렉터리     | ✅ 재귀적 주입         | .gitignore 규칙 따름  |

예시: 코드 리뷰 명령어

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### 실용적인 생성 예시

#### "순수 함수 리팩터링" 명령어 생성 단계 표

| 작업                      | 명령어/코드                             |
| ------------------------- | --------------------------------------- |
| 1. 디렉터리 구조 생성     | `mkdir -p ~/.qwen/commands/refactor`    |
| 2. 명령어 파일 생성       | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. 명령어 내용 편집       | 아래 전체 코드를 참조                   |
| 4. 명령어 테스트          | `@file.js` → `/refactor:pure`           |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### 사용자 정의 명령어 모범 사례 요약

#### 명령어 설계 권장 사항 표

| 실천 항목            | 권장 접근 방식                | 피해야 할 사항                          |
| -------------------- | ----------------------------- | --------------------------------------- |
| 명령어 명명          | 네임스페이스를 사용하여 구성  | 지나치게 일반적인 이름 사용 피하기      |
| 매개변수 처리        | `{{args}}`를 명확하게 사용    | 기본 추가에 의존 (혼동하기 쉬움)       |
| 오류 처리            | Shell 오류 출력 활용          | 실행 실패 무시                          |
| 파일 구성            | 디렉터리 내에서 기능별로 구성 | 모든 명령어를 루트 디렉터리에 배치      |
| 설명 필드            | 항상 명확한 설명을 제공       | 자동 생성 설명에 의존                   |

#### 보안 기능 알림 표

| 보안 메커니즘        | 보호 효과            | 사용자 작업          |
| -------------------- | -------------------- | -------------------- |
| Shell 이스케이프     | 명령어 주입 방지     | 자동 처리            |
| 실행 확인            | 실수 실행 방지       | 대화 상자 확인       |
| 오류 보고            | 문제 진단 지원       | 오류 정보 확인       |

## 5. CLI 서브명령어

이 명령어들은 대화형 세션을 시작하기 전에 셸에서 `qwen <subcommand>`로 실행됩니다.

### 세션 관리

| 명령어               | 설명                      | 사용 예시                                                  |
| -------------------- | ------------------------- | ---------------------------------------------------------- |
| `qwen sessions list` | 최근 대화 세션을 나열     | `qwen sessions list`, `qwen sessions list --json --limit 50` |
| `qwen sessions ps`          | 현재 실행 중인 대화 세션을 나열 | `qwen sessions ps`, `qwen sessions ps --json`                                    |
| `qwen sessions controllers` | 신뢰되는 컨트롤러 토큰을 관리   | `qwen sessions controllers add --label <name>`, `qwen sessions controllers list` |

#### `qwen sessions list`

메타데이터와 함께 최근 Qwen Code 세션을 나열합니다.

**플래그:**

| 플래그    | 유형    | 기본값  | 설명                                      |
| --------- | ------- | ------- | ----------------------------------------- |
| `--json`  | boolean | `false` | JSON Lines로 출력 (한 줄에 하나의 JSON 객체) |
| `--limit` | number  | `20`    | 표시할 최대 세션 수                       |

**사람이 읽을 수 있는 출력 (기본값):**

다음 열이 있는 표: SESSION ID, STARTED (UTC 타임스탬프), TITLE, BRANCH, PROMPT.

**JSON 출력 (`--json`):**

stdout에 JSON Lines를 출력합니다. 각 줄은 다음 필드를 가진 JSON 객체입니다:

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

"더 많은 세션이 있음" 힌트는 stderr를 통해 출력되므로 `jq`로 파이프해도 안전합니다.

**예시:**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

이 머신에서 확인할 수 있는 Qwen Code 세션 기록을 나열합니다. `sessions list`은 저장된 트랜스크립트를 탐색합니다("내가 어떤 작업을 해왔는가"). 이 명령은 라이브 프로세스 레지스트리와 `managed`으로 표시된 Agent View 기록을 모두 보여줍니다. 종료된 세션이 남긴 기록은 발견되는 대로 레지스트리에서 제거됩니다. 관리형 기록은 지속적 장부 기록이며 워커 프로세스가 아직 살아 있다는 증거가 아닙니다. 일회성 `qwen -p` 실행은 등록되지 않으며 목록에 표시되지 않습니다.

**플래그:**

| 플래그 | 유형 | 기본값 | 설명 |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | JSON Lines 형식으로 출력(줄당 하나의 JSON 객체) |

**사람이 읽을 수 있는 출력 (기본값):**

NAME, KIND, PID, AGE, DIRECTORY 열이 있는 테이블.

KIND는 세션을 등록한 주체를 나타냅니다 — 터미널에서 사용자가 실행한 경우 `tui`, Qwen Code 세션이 아닌 프로그램(음성 인터페이스, 릴레이 등)인 경우 `external`, 다른 프로그램이 구동하는 세션인 경우 `headless` 또는 `serve`입니다. 여러 `serve` 또는 `headless` 행이 하나의 PID를 공유할 수 있습니다: `qwen --acp` 자식 프로세스는 모든 세션을 단일 프로세스에서 호스팅하며 — 데몬이 생성한 경우 `serve`, 클라이언트가 직접 구동하는 경우 `headless` — 피어 메시징이 활성화되면 각각 별도로 등록됩니다. 자체 환경이 베어 모드나 안전 모드인 호스팅 세션은 여기에 등록되지 않습니다. 데몬의 `--bare`은 호스팅하는 세션에 전달되지 않습니다(`QWEN_CODE_SIMPLE`은 자식 환경에서 제거됨); 상속된 `QWEN_CODE_SAFE_MODE`은 전달되어 해당 호스팅 세션이 이 목록에 나타나지 않도록 합니다. 이는 NAME 및 DIRECTORY와 마찬가지로 자기 보고(self-report)입니다: 여기 있는 모든 필드는 설명하는 프로세스가 작성한 것이며, 세션이 허용되는 작업 여부는 이에 의존하지 않습니다. `managed`으로 표시된 Agent View 기록은 KIND에 `managed`을, PID와 AGE에 `-`을 사용합니다. 동일한 세션에 라이브 레지스트리 기록도 있는 경우 별도의 행으로 유지됩니다. 기록 형식 및 자체 프로그램 등록 방법은 [Cross-Session Protocol](./cross-session-protocol.md)을 참조하십시오.

**JSON 출력 (`--json`):**

표준 출력(stdout)에 JSON Lines 형식으로 관리형 기록부터 출력합니다. 레지스트리 기록은 기존 형식을 유지합니다:

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (when peer messaging is available)
```

stdout에는 다른 아무것도 쓰이지 않습니다 — 빈 목록은 아무것도 출력하지

```
sessionId, cwd, managed: true
```

stdout에는 다른 아무것도 쓰이지 않습니다 — 빈 목록은 아무것도 출력하지 않음 — 따라서 `qwen sessions ps --json | jq .`은 스크립팅에 안전하게 사용할 수 있습니다. 관리자 스토어를 읽을 수 없는 경우에도 레지스트리 기록은 계속 출력되며 그 이유는 표준 오류(stderr)에 기록됩니다.

JSON 출력은 원시 데이터입니다: 필드 값은 기록된 그대로 터미널 살리니제이션(sanitization) 없이 방출됩니다. 이를 데이터로 취급하고 터미널에 렌더링하기 전에 반드시 살리니제이션하십시오.

**예시:**

```bash
# Show the other live sessions
qwen sessions ps

# Which directories have a visible session record?
# Note: `jq -r` renders the raw recorded value in your terminal (see the
# raw-data note above); pipe through a sanitizer if the path is untrusted.
qwen sessions ps --json | jq -r .cwd
```

## 동일 머신의 두 대화형 세션은 서로에게 메시지를 보낼 수 있습니다 [#6-messaging-another-running-session]

동일 머신의 두 대화형 세션은 서로에게 메시지를 보낼 수 있습니다. 이 기능은 **기본적으로 활성화**되어 있지만 `--bare`과 `--safe-mode`은 설정과 관계없이 이를 비활성화합니다. 수신함(inbox)이 리스닝 상태인 경우 세션은 동일 사용자의 다른 세션에 의해 발견 가능하며, 그들이 보내는 내용은 모델이 보기 전에 아래 검토 규칙을 거칩니다. 피어 발견 및 메시징을 비활성화하려면 `settings.json`에서 끄고 재시작하십시오:

```json
{ "agents": { "crossSessionMessaging": false } }
```

피어 메시징이 비활성화된 대화형 세션은 `qwen sessions ps`에 여전히 나타날 수 있지만 `ipcPath`이 없으며 `list_agents`에서 도달 가능한 피어가 아닙니다. OpenTUI 인터페이스도 피어 수신함을 바인딩하지 않으므로, 설정만 활성화한다고 해서 메시징 가능해지지 않습니다.

메시징이 활성화된 상태에서 한 세션의 모델은 `list_agents`을 통해 다른 세션들을 발견할 수 있습니다. 각 세션은 `sessions` 아래에 `qwen sessions ps --json`이 기록한 `name`와 함께 표시되며(테이블 뷰에서는 긴 이름이 잘릴 수 있음), 해당 이름을 `to`로 사용하여 `send_message`를 통해 특정 세션에 메시지를 보낼 수 있습니다. 두 세션이 동일한 이름을 공유하는 경우, `list_agents`는 각 세션을 짧은 `[ref]`과 함께 표시하며 전송 시 이를 포함해야 합니다(`name [ref]`). 모호한 단순 이름은 추측되지 않고 거부됩니다. `list_agents`는 또한 `self` 아래에서 세션 자신의 이름을 보고하며, `to: "*"`은 여전히 "내 에이전트 팀 동료들"을 의미하며 다른 세션에는 도달하지 않습니다.

메시지는 다른 세션에서 그 사용자의 메시지가 아닌 다른 세션에서 온 것으로 표시되어 도착하며, 수신 세션의 권한을 전혀 가지지 않습니다: 수신 세션은 자체 권한 설정 내에서만 이에 대응합니다. 사용자는 `agents.crossSessionInbound`(`accept`, `hold` 또는 `refuse`)을 통해 들어오는 메시지에 대한 처리 방식을 선택할 수 있습니다. 설정되지 않은 경우, 두 세션 모두 동일한 검토 클래스에 있을 때에만 메시지가 전달됩니다: 즉, 두 세션 모두 각 작업을 계속 검토하거나(기본 모드 또는 계획 모드), 두 세션 모두 개별 작업 검토 없이 일부 작업을 적용하는 모드(auto-edit, auto 또는 yolo)에 있는 경우입니다. 다른 클래스의 세션에서 온 메시지나, 자신의 클래스를 명시하지 않은 발신자로부터 온 메시지는 양방향 모두 검토를 위해 대기 상태로 유지됩니다. 각 작업을 검토하는 세션은 그렇지 않은 세션으로부터 온 메시지를 대기 상태로 유지하는데, 이는 해당 메시지가 아무도 감시하지 않는 모델에 의해 작성되었기 때문이며, 개별 작업 프롬프트는 행동을 보호할 뿐 세션이 어떤 내용으로 설득되고 있는지를 보호하지 않기 때문입니다. 대기 중인 메시지는 수신 세션에서 `/peers`로 나열되고 해제되며, 단지 모드 차이 때문에 대기 중인 메시지는 모드가 일치하면 자동으로 해제됩니다.

저장소는 therein 열린 세션을 더 신중하게 만들 수 있지만, 덜 신중하게 만들 수는 없습니다: 워크스페이스 `.qwen/settings.json`은 `agents.crossSessionInbound`을 `hold` 또는 `refuse`으로 설정하거나, `agents.crossSessionMessaging`을 `false`으로 설정할 수 있으며, 이 값은 사용자 설정보다 느슨한 값을 우선합니다. 운영자가 설정한 값을 완화하려는 워크스페이스 값(`accept`, 또는 사용자/시스템 범위가 `false`으로 설정했을 때 스위치용 `true`)은 경고와 함께 무시됩니다. 다른 곳에서 스위치를 설정하지 않은 경우의 워크스페이스 `true`은 단순히 기본값을 반복하므로 조용히 제거됩니다. CLI가 인식하지 못하는 값은 유효한 값일 때마다 모든 메시지를 대기 상태로 유지합니다. 시스템 설정은 모든 설정과 마찬가지로 이러한 모든 사항을 우선합니다.

대기는 영원히 지속되지 않습니다. 아무도 결정하지 않은 메시지는 `agents.crossSessionHeldExpiry` 후 만료됩니다 — `1m`, `5m`, `10m` 또는 `never`, 기본값은 5분입니다 — 그리고 발신 세션에는 결정이 내려지지 않았다는 알림이 전달됩니다. 설정 시간을 단축하면 이미 대기 중인 메시지에도 적용됩니다.

세션이 인박스(inbox)를 바인딩할 수 없는 경우 — 런타임 디렉터리가 없거나, 다른 사용자가 소유하거나, 읽기 전용인 경우(컨테이너 내부에서 발생할 수 있음) — 먼저 임시 디렉터리 아래에 비공개 디렉터리를 시도하고, 그것마저 실패하면 인박스 없이 시작합니다. 이런 상황이 발생하면 세션은 시작 시 이를 알리며, `/peers`은 이유와 변경 사항(보통 `XDG_RUNTIME_DIR` 또는 `TMPDIR`)을 다시 알려줍니다.

두 세션이 동일한 인박스 주소를 해석할 수도 있는데, 이는 주소가 프로세스 ID를 키로 사용하며 컨테이너 간에 프로세스 ID가 중복될 수 있기 때문입니다. 두 번째로 시작하는 세션은 사용 중인 주소를 빼앗는 대신 인접한 주소를 취하므로, 어느 쪽도 도달 불가능해지지 않습니다. 피어(peer)는 영향을 받지 않습니다: 피어는 주소를 파생시키는 대신 세션 레지스트리에서 세션의 주소를 읽습니다.

`send_message` 호출은 메시지가 다른 세션에 전달되었는지 여부만 확인합니다. 메시지의 최종 결과는 나중에 영수증(receipt) 형태로 도착합니다: 만약 메시지가 대기(held), 거절(declined), 거부(refused), 드롭(dropped), 만료(expired)되거나 잘못된 주소(misaddressed, 주소가 변경됨 - 에이전트를 다시 나열하세요)로 처리되었거나 — 대기 후 해제된 경우 — 발신 세션의 트랜스크립트에 알림이 표시됩니다(`Message to <name>: …`). 거절(Declined), 거부(refused) 및 드롭(dropped)은 세 가지 서로 다른 응답입니다: 거절은 누군가가 메시지를 검토하고 '아니요'라고 말했음을 의미하고, 거부는 해당 세션의 `agents.crossSessionInbound`가 `refuse`이며 아무도 메시지를 보지 못했음을 의미하며, 드롭은 그 전에 인박스가 메시지를 차단했음을 의미합니다(아래 참조). 첫 번째 드롭은 즉시 응답되며 나머지는 몇 초마다 하나의 영수증으로 묶여 각각 대표하는 메시지를 명시하므로, 연속적인 드롭은 한 줄씩이 아니라 소수의 라인으로 비용이 발생합니다. 이를 보낸 모델에는 알려지지 않으며; 다른 세션이 답변한다면, 답변은 세션 간 메시지로 도착합니다.

### 플러드 보호

한 세션은 한 발신자로부터 한 번에 최대 30개의 메시지를 허용하며 이후 2초당 하나씩, 모든 발신자를 합쳐서 한 번에 최대 32개를 허용하고 이후 초당 하나씩 허용합니다. 두 번째 제한이 존재하는 이유는 발신자가 자신의 이름을 지정하기 때문입니다: 해당 이름을 회전시키면 첫 번째 제한에서 새로운 허용량을 얻지만 두 번째 제한에서는 그렇지 않습니다. 이 값은 첫 번째 제한보다 약간 높습니다. 왜냐하면 허용된 모든 메시지는 영수증을 생성하며, 세션은 동시에 처리할 수 있는 영수증의 수가 제한되기 때문입니다. 다른 세션에서 온 메시지 중 이전 30초 이내에 동일한 발신자의 이전 메시지를 단어 단위로 반복하는 메시지도 거부됩니다 — 모델이 한 문장을 루프 처리할 때마다 새로운 메시지 ID를 생성하므로, 텍스트가 이를 감지합니다. 세션이 시작한 스크립트나 신뢰할 수 있는 컨트롤러에서 온 메시지는 반복 검사에서 제외됩니다. 훅이 동일한 줄을 두 번 보고하는 것은 두 가지 사실을 보고하는 것이며, 사람이 "continue"를 두 번 말하는 것은 그 의미를 두 번 전달하는 것이기 때문입니다. 하지만 둘 모두 속도 제한에는 적용됩니다. 마지막으로, 허용되었지만 세션에 이미 대기 중인 메시지가 50개 있어 큐잉할 수 없는 메시지도 거부됩니다.

이렇게 거부된 메시지는 보관되지 않고, 모델에게 표시되지 않으며, 기록도 남기지 않으므로, 발신자는 나중에 다시 시도하여 성공할 수 있습니다. 수신 세션은 트랜스크립트에 해당 발신자당 분당 최대 한 번만 이를 명시하며, 해당 줄이 의미하는 항목의 개수를 포함합니다. 발신 세션은 버스트로 인해 손실된 모든 메시지를 나열하는 하나의 영수증을 받으며, 트랜스크립트는 재전송하지 말고 여전히 중요한 내용을 나중에 하나의 메시지로 통합하라고 지시합니다.

발신 측은 결과를 기다리지 않습니다. 각 세션은 각 주소로 보낸 내용을 추적하며 수신자가 드롭(drop)할 전송을 거부하므로, 모델은 메시지가 작성된 후가 아니라 작성 전에 배치(batch)하도록 지시받습니다 — 그리고 수신자는 거부할 메시지에 연결을 낭비하지 않습니다.

### 해당 프로그램에 토큰을 발급하여 전달 권한을 부여합니다:

각 세션의 수신함(inbox)은 세션별 토큰을 요구합니다: 연결은 메시지를 읽기 전에 첫 번째 줄에서 이를 제시해야 하며, 세션들은 서로를 발견하는 데 사용하는 동일한 레지스트리 기록을 통해 자동으로 토큰을 교환합니다. 토큰 지원이 없는 빌드의 세션은 최신 버전으로부터 수신할 수 있지만, 최신 버전으로의 전송은 드롭됩니다.

세션은 자체 수신함 주소와 토큰을 자식 프로세스에 `QWEN_CODE_MESSAGING_SOCKET` 및 `QWEN_CODE_MESSAGING_TOKEN`로 내보내므로, 세션이 실행하는 스크립트나 훅이 메시지를 세션으로 다시 보낼 수 있습니다. 이는 어디에도 공개되지 않는 두 번째 _자식_ 토큰입니다: 세션이 시작한 프로세스만 이를 보유할 수 있으므로, 이 토큰과 함께 도착한 메시지는 다른 세션의 메시지가 아닌 세션 자신의 메시지로 인식됩니다.

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

모든 주입(injection)에 새로운 `msgId`을 부여하십시오. 수신 게이트는 이미 처리한 ID를 기억하므로, 하나의 ID를 재사용하는 훅은 처음에만 전달되고 이후 모든 실행에서는 조용히 중복 제거됩니다. 동일한 _텍스트_를 반복하는 것은 괜찮습니다 — 위의 반복 검사는 세션 자신의 프로세스에는 적용되지 않음 — 그러나 속도 제한은 적용되므로, 루프 내의 훅은 다른 홍수(flood)처럼 드롭됩니다.

주입된 메시지는 여전히 인바운드 게이트를 거치며 사용자로부터 오지 않은 것으로 표시되지만, 게이트는 이것이 세션 자신의 프로세스에서 왔음을 알고 있습니다: 모드 패리티(mode-parity) 기본 설정 하에서는 검토 없이 전달됩니다(동일한 위치에 있는 피어는 보류됨). 반면, `hold` 또는 `refuse`의 명시적인 `agents.crossSessionInbound` 설정은 다른 모든 것과 동일하게 적용됩니다. 모델은 이것이 세션이 실행한 스크립트나 훅에서 왔으며 사용자로부터 오지 않았다는 통지와 함께 `<cross_session_message from="own process" origin="own-process">`으로 봅니다.

### 신뢰할 수 있는 컨트롤러(Trusted controllers) [#trusted-controllers]

위의 규칙은 어떤 검토 클래스에 속하는지 명시하지 않는 모든 발신자의 메시지를 보류합니다. Qwen Code 세션이 아닌 프로그램은 이를 명시할 수 없습니다. 이는 낯선 사람에게는 올바른 기본값이지만, 사용자가 선택한 프로그램에는 적합하지 않습니다: 음성 프론트엔드, 구술 브리지, 사용자의 지침을 중계하는 자동화 데몬은 모든 메시지가 보류될 것이며, 각각을 수동으로 승인하는 것은 목적을 무산시킵니다.

사용자는 이러한 프로그램에 토큰을 발급하여 전달 권한을 부여합니다:

```bash
qwen sessions controllers add --label voice-bridge
```

토큰은 한 번만 출력되며 어디에도 저장되지 않습니다: Qwen 홈 아래 파일에는 SHA-256 해시만 유지되므로, 나중에 해당 파일을 읽는 아무것도 토큰을 제시할 수 없습니다. 명령어가 이를 출력할 때 컨트롤러의 자체 구성에 넣으십시오.

컨트롤러는 다른 발신자와 동일한 방식으로 토큰을 제시합니다 — 연결의 첫 번째 줄로 — 그리고 세션 레지스트리에서 소켓 경로를 가져옵니다(`qwen sessions ps --json`은 활성 세션당 하나의 기록을 출력하며, `ipcPath`이 주소입니다):

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

부여된 토큰으로 도착한 메시지는 양측의 검토 클래스와 관계없이 메시지별 검토 없이 전달됩니다 — 그러나 명시적인 설정에는 여전히 따릅니다: `hold`의 `agents.crossSessionInbound`은 다른 모든 것과 동일하게 보류하며, `refuse`는 거부합니다. 부여는 하나의 세션이 아닌 사용자의 Qwen 홈에 속하므로, 컨트롤러는 사용자가 실행 중인 세션에 도달할 수 있으며, 세션은 모든 연결 시마다 파일을 다시 읽습니다: 토큰을 생성하거나 취소하면 다음 연결부터 효과가 발생하며, 재시작할 필요가 없습니다.

```bash
qwen sessions controllers list          # ids, labels, when they were added
qwen sessions controllers remove c_1a2b # revoke one
```

`/peers controllers`과 `/peers revoke <id>`은 세션 내부에서 동일한 역할을 수행합니다. 권한을 통해 전달된 메시지는 `Message from a trusted controller (voice-bridge)`로 표시되며, `hold` 설정에 의해 대기 상태가 된 경우 `/peers`에서 `[controller] voice-bridge`로 나타납니다.

모델은 이러한 메시지를 `<cross_session_message from="controller" origin="controller" controller="voice-bridge">`으로 인식하며, 이는 사용자의 지시를 중계한다는 안내와 함께 모든 다른 출처에 적용되는 두 가지 금지 사항이 포함됩니다: 메시지의 요청으로 권한 설정, QWEN.md 또는 구성을 편집할 수 없으며, 메시지가 보류 중인 확인 프롬프트에 대한 사용자의 승인으로 취급될 수 없습니다. 컨트롤러는 다음에 할 일을 지정할 수 있지만, 사용자를 대신하여 프롬프트에 답변할 수는 없습니다.

토큰을 보유한 누구나 해당 컨트롤러로서 메시지를 보낼 수 있으므로, 이를 다른 자격 증명으로 취급하십시오: 하나의 프로그램에만 부여하고, 공유 구성에서 제외하며, 해당 프로그램이 작업을 완료하면 폐기하십시오.

### 해당 옵션들은 설정 값과 관계없이 메시지 기능을 끕니다. 꺼져 있으면 보이지 않게 되는데,

모든 `qwen --acp` 하위 프로세스는 호스팅하는 각 세션을 등록합니다 — 데몬이 프로세스를 생성한 경우 `serve`로, 에디터나 다른 클라이언트가 `qwen --acp`을 직접 제어하는 경우 `headless`로 등록되며, 이 세션은 `qwen sessions ps` 및 다른 세션의 `list_agents`에 다른 세션과 동일하게 나타납니다. 메시지를 보낼 수 있습니다: 모델은 열려 있는 터미널에 도달하기 위해 `send_message`을 호출할 수 있습니다. 여러 세션이 하나의 프로세스와 하나의 인박스를 공유하므로, 발신자는 의도한 세션을 명시해야 합니다 — 모든 Qwen Code 세션은 이를 자동으로 수행합니다.

_하나의_ 세션으로 전송된 메시지는 보관되지 않고 거부됩니다. 보관은 사람에게 질문을 던지는 것이며, 제어되는 세션을 위해 보관된 메시지 목록을 주시하는 사람은 아무도 없습니다; 발신자는 만료 시간을 기다리는 대신 즉시 통보받습니다. 이러한 세션에서 보관된 메시지가 어디에 표시되어야 하는지는 아직 확정되지 않았습니다.

세션 자체의 설정에서 `agents.crossSessionMessaging`을 끄거나, `--bare` 또는 `--safe-mode`로 시작하지 않는 한 세션은 등록됩니다 — 이 경우 설정 값과 관계없이 메시징이 비활성화됩니다. 비활성화된 경우 세션은 보이지 않게 유지되는데, 아무도 메시지를 보낼 수 없는 세션을 목록에 올리는 유일한 이유는 응답하지 않는 주소를 홍보하기 위한 것이기 때문입니다.

### Qwen Code 세션이 아닌 프로그램

위의 모든 기능은 세션 간에 작동하지만, 특정 세션에만 국한된 것은 아닙니다. 레지스트리 기록을 스스로 작성하고 동일한 방식으로 인박스를 바인딩하는 프로그램은 `qwen sessions ps` 및 `list_agents`에 의해 나열되며, `send_message`에서 이름으로 주소 지정할 수 있고, 전송한 내용에 대한 수신 확인증을 받습니다 — 음성 인터페이스, 릴레이, 빌드 감시자 등이 이에 해당합니다. 목록에서 정체성을 설명할 수 있도록 `kind: "external"`을 기록해야 합니다.

[세션 간 프로토콜](./cross-session-protocol.md)은 이를 작성하기 위한 계약입니다: 기록 스키마와 활성 여부 판단 방법, 소켓 경로 및 프레임 형식, 인증 라인, 모든 프레임 필드, 수신 확인증 상태 및 전이, 그리고 모델이 메시지를 보기 전에 수신자가 취하는 조치.

Node 프로그램은 이러한 내용을 수작업으로 작성할 필요가 없습니다: `@qwen-code/sdk/peer`이 계약을 구현합니다. `PeerEndpoint.start({ name })`은 기록을 게시하고 인박스를 바인딩하며, `list()`와 `send()`은 이름으로 세션을 주소 지정하고, `onMessage`는 그들이 전송한 내용을 수신합니다.
