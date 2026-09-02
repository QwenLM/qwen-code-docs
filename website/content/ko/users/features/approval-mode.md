
# 승인 모드

Qwen Code는 작업의 복잡성과 위험 수준에 따라 AI가 코드 및 시스템과 상호작용하는 방식을 유연하게 제어할 수 있는 다섯 가지 권한 모드를 제공합니다.

## 권한 모드 비교

| 모드                 | 파일 편집                    | 셸 명령어                    | 적합한 상황                                                                                              | 위험 수준 |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**             | ❌ 읽기 전용 분석만         | ❌ 실행되지 않음            | • 코드 탐색 <br>• 복잡한 변경 계획 <br>• 안전한 코드 리뷰                                              | 가장 낮음  |
| **Ask Permissions**  | ✅ 수동 승인 필요           | ✅ 수동 승인 필요           | • 새/익숙하지 않은 코드베이스 <br>• 중요 시스템 <br>• 팀 협업 <br>• 학습 및 교육                       | 낮음       |
| **Auto-Edit**        | ✅ 자동 승인                | ❌ 수동 승인 필요           | • 일상 개발 작업 <br>• 리팩토링 및 코드 개선 <br>• 안전한 자동화                                       | 중간       |
| **Auto**             | ✅ 분류기 평가              | ✅ 분류기 평가              | • 긴 자율 세션 <br>• Auto-Edit가 너무 보수적이고 YOLO가 너무 위험할 때                                 | 중간       |
| **YOLO**             | ✅ 자동 승인                | ✅ 자동 승인                | • 신뢰할 수 있는 개인 프로젝트 <br>• 자동화 스크립트/CI/CD <br>• 배치 처리 작업                        | 가장 높음  |

> [!NOTE]
>
> 기존 **Default**라는 이름은 동작을 더 잘 설명하기 위해 **Ask Permissions**로 변경되었습니다. 내부 설정값(`tools.approvalMode: "default"`)과 `/approval-mode default` 명령어는 하위 호환성을 위해 변경되지 않았습니다.

### 빠른 참고 가이드

- **Plan Mode로 시작**: 변경 전에 코드를 이해하는 데 적합
- **Auto Mode (기본값)**: 기본 제공 경험 — LLM 분류기가 안전한 작업을 자동 승인하고 위험한 작업을 차단하여 안전망을 유지하면서 방해를 최소화
- **Ask Permissions로 전환**: 모든 파일 편집과 셸 명령어에 수동 승인을 원할 때
- **Auto-Edit로 전환**: 안전한 코드 변경을 많이 할 때
- **YOLO는 신중하게 사용**: 제어된 환경에서 신뢰할 수 있는 자동화에만 사용

> [!tip]
>
> 세션 중에 **Shift+Tab**(또는 Windows에서 **Tab**)을 사용하여 모드를 빠르게 순환할 수 있습니다. 터미널 상태 표시줄에 현재 모드가 표시되므로 Qwen Code의 권한을 항상 확인할 수 있습니다.

> 순환 순서: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Plan Mode로 안전한 코드 분석

Plan Mode는 Qwen Code에게 **읽기 전용** 작업으로 코드베이스를 분석하여 계획을 생성하도록 지시합니다. 코드베이스 탐색, 복잡한 변경 계획, 안전한 코드 리뷰에 적합합니다.

### Plan Mode를 사용할 때

- **다단계 구현**: 기능이 여러 파일의 편집을 필요로 할 때
- **코드 탐색**: 변경 전에 코드베이스를 철저히 조사하고 싶을 때
- **반복적 개발**: Qwen Code와 방향성에 대해 반복적으로 논의하고 싶을 때

### Plan Mode 사용 방법

**세션 중에 Plan Mode 켜기**

세션 중에 **Shift+Tab**(또는 Windows에서 **Tab**)을 사용하여 권한 모드를 순환하며 Plan Mode로 전환할 수 있습니다.

Normal Mode에서 **Shift+Tab**(또는 Windows에서 **Tab**)을 누르면 먼저 `auto-edits` Mode로 전환되며, 터미널 하단에 `⏵⏵ accept edits on`으로 표시됩니다. 이후 다시 **Shift+Tab**(또는 Windows에서 **Tab**)을 누르면 `⏸ plan mode`로 표시되는 Plan Mode로 전환됩니다.

**`/plan` 명령어 사용**

`/plan` 명령어는 Plan Mode에 빠르게 진입하고 종료하는 단축키를 제공합니다:

일반적인 계획 요청은 자체적으로 모드를 전환하지 않습니다. 읽기 전용 Plan Mode 워크플로우를 원한다면 `/plan`, 키보드 단축키를 사용하거나 승인 모드를 명시적으로 `plan`으로 설정하세요.

```bash
/plan                          # Plan mode 진입
/plan refactor the auth module # Plan mode 진입 후 계획 시작
/plan exit                     # Plan mode 종료, 이전 모드 복원
```

`/plan exit`으로 Plan Mode를 종료하면 이전 승인 모드가 자동으로 복원됩니다(예: Plan Mode 진입 전에 Auto-Edit에 있었다면 Auto-Edit로 돌아갑니다).

**Plan Mode에서 새 세션 시작**

Plan Mode에서 새 세션을 시작하려면 `/approval-mode`를 사용한 후 `plan`을 선택하세요.

```bash
/approval-mode
```

**Plan Mode에서 "헤드리스" 쿼리 실행**

`-p` 또는 `prompt`를 사용하여 Plan Mode에서 직접 쿼리를 실행할 수도 있습니다:

```bash
qwen --prompt "What is machine learning?"
```

### 예시: 복잡한 리팩토링 계획

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code가 Plan Mode에 진입하여 현재 구현을 분석하고 종합적인 계획을 생성합니다. 후속 질문으로 개선하세요:

```
What about backward compatibility?
How should we handle database migration?
```

### Plan Mode를 기본값으로 설정

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Ask Permissions Mode로 제어된 상호작용

Ask Permissions Mode는 Qwen Code를 사용하는 표준적인 방법입니다. 이 모드에서는 모든 잠재적 위험 작업에 대한 완전한 제어권을 유지합니다 — Qwen Code는 파일 변경이나 셸 명령어 실행 전에 승인을 요청합니다.

### Ask Permissions Mode를 사용할 때

- **새로운 코드베이스**: 익숙하지 않은 프로젝트를 탐색하며 각별히 주의하고 싶을 때
- **중요 시스템**: 프로덕션 코드, 인프라 또는 민감한 데이터를 다룰 때
- **학습 및 교육**: Qwen Code가 수행하는 각 단계를 이해하고 싶을 때
- **팀 협업**: 여러 사람이 같은 코드베이스에서 작업할 때
- **복잡한 작업**: 변경 사항이 여러 파일이나 복잡한 로직을 포함할 때

### Ask Permissions Mode 사용 방법

**세션 중에 Ask Permissions Mode 켜기**

세션 중에 **Shift+Tab**(또는 Windows에서 **Tab**)을 사용하여 권한 모드를 순환하며 Ask Permissions Mode로 전환할 수 있습니다. 다른 모드에 있는 경우 **Shift+Tab**(또는 Windows에서 **Tab**)을 계속 누르면 결국 터미널 하단에 모드 표시가 없는 Ask Permissions Mode로 돌아옵니다.

**Ask Permissions Mode에서 새 세션 시작**

Ask Permissions Mode는 Qwen Code를 시작할 때의 초기 모드입니다. 모드를 변경한 후 Ask Permissions Mode로 돌아가려면 다음을 사용하세요:

```
/approval-mode default
```

**Ask Permissions Mode에서 "헤드리스" 쿼리 실행**

헤드리스 명령어를 실행할 때 Ask Permissions Mode가 기본 동작입니다. 명시적으로 지정하려면:

```
qwen --prompt "Analyze this code for potential bugs"
```

### 예시: 안전하게 기능 구현

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code는 코드베이스를 분석하고 계획을 제안합니다. 그런 다음 다음 작업 전에 승인을 요청합니다:

1. 새 파일 생성(컨트롤러, 모델, 마이그레이션)
2. 기존 파일 수정(새 컬럼 추가, API 업데이트)
3. 셸 명령어 실행(데이터베이스 마이그레이션, 의존성 설치)

각 제안된 변경 사항을 검토하고 개별적으로 승인 또는 거부할 수 있습니다.

### Ask Permissions Mode를 기본값으로 설정

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto-Edit Mode

Auto-Edit Mode는 Qwen Code에게 파일 편집을 자동으로 승인하면서 셸 명령어는 수동 승인을 요구하도록 지시합니다. 개발 워크플로우를 가속화하면서 시스템 안전을 유지하는 데 이상적입니다.

자동 승인되는 편집 도구에는 `edit`, `write_file`, `notebook_edit`이 포함됩니다.

### Auto-Accept Edits Mode를 사용할 때

- **일상 개발**: 대부분의 코딩 작업에 적합
- **안전한 자동화**: AI가 코드를 수정하면서도 위험한 명령어의 실수행을 방지
- **팀 협업**: 공유 프로젝트에서 다른 사람에게 의도치 않은 영향을 미치지 않도록 사용

### 이 모드로 전환하는 방법

```
# 명령어로 전환
/approval-mode auto-edit

# 또는 키보드 단축키 사용
Shift+Tab (또는 Windows에서 Tab) # 다른 모드에서 전환
```

### 워크플로우 예시

1. Qwen Code에게 함수 리팩토링을 요청
2. AI가 코드를 분석하고 변경 사항을 제안
3. 확인 없이 모든 파일 변경을 **자동으로** 적용
4. 테스트를 실행해야 하는 경우 `npm test` 실행을 **승인 요청**

## 4. Auto Mode - 분류기 기반 승인

Auto Mode는 Auto-Edit와 YOLO 사이에 위치합니다. LLM 분류기가 각 셸 명령어, 네트워크 호출, 워크스페이스 외부 편집을 평가하여 안전하다고 판단하면 자동 승인하고 위험하면 차단합니다. 대부분의 읽기 전용 작업과 워크스페이스 내 편집은 속도 향상을 위해 분류기를 건너뜁니다.

전체 레퍼런스(hints 설정, 문제 해결, FAQ)는 [auto-mode.md](./auto-mode.md)를 참조하세요.

### Auto Mode를 사용할 때

- **긴 자율 세션**: Ask Permissions Mode가 너무 자주 중단되지만 YOLO는 너무 위험할 때
- **신뢰할 수 있는 프로젝트**: 에이전트가 계속 진행해야 하지만 파괴적인 셸 명령어와 외부 네트워크 호출에 대한 안전장치가 필요한 내부 코드베이스
- **헤드리스 / 예약 실행**: Auto-Edit만으로는 부족하고(에이전트가 셸 명령어도 실행해야 함) `rm -rf /`, `curl ... | sh`, 자격 증명 유출 등에 대한 안전이 필요할 때

### Auto Mode 사용 방법

**세션 중에 Auto Mode 켜기**

**Shift+Tab**(또는 Windows에서 **Tab**)을 눌러 Auto Mode로 순환 전환하세요. 상태 표시줄에 활성 모드가 표시됩니다.

**`/approval-mode` 명령어 사용**

```
/approval-mode auto
```

Auto Mode에 처음 진입하면 작동 방식을 설명하는 정보 메시지가 표시됩니다. 이 알림은 다시 나타나지 않습니다.

**Auto Mode에서 새 세션 시작**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Auto Mode의 자동 승인 vs 차단

분류기는 불확실할 때 차단하는 방향으로 편향되어 있습니다. 기본값:

- **자동 승인**: 읽기 전용 명령어(ls, cat, git status, grep, find), cwd에서의 패키지 설치, 빌드/테스트 명령어, 워크스페이스 내 파일 편집, 로컬 전용 작업
- **차단**: 되돌릴 수 없는 파괴(rm -rf /, fdisk, mkfs), 외부 코드 실행(curl | sh, 원격 콘텐츠 eval), 자격 증명 유출, 무단 지속성(.bashrc 편집, crontab), 보안 약화, main/master에 force-push

settings.json에서 자연어 hints를 통해 분류기의 판단을 사용자 정의할 수 있습니다. [auto-mode.md](./auto-mode.md#configuring-hints)를 참조하세요.

### 안전 가드레일

- **하드 규칙 유지**: `permissions.deny` 규칙은 분류기가 실행되기 전에 작업을 차단합니다.
- **Auto Mode에서 과도하게 넓은 허용 규칙은 비활성화**: 예: `permissions.allow: ["Bash"]`(모든 셸 명령어 허용)는 분류기를 무력화합니다. Auto Mode에 진입하면 분류기가 제대로 작동할 수 있도록 이러한 규칙이 일시적으로 비활성화됩니다. Auto Mode를 떠나면 규칙이 복원됩니다. 디스크의 설정은 절대 수정되지 않습니다.
- **실패 시 차단**: 분류기 API에 연결할 수 없으면 허용 대신 차단됩니다. 두 번 연속 사용 불가능한 호출이 발생하면 다음 도구 호출이 수동 승인으로 전환됩니다.
- **루프 가드**: 3번 연속 정책 차단이 발생하면 다음 호출도 수동 승인으로 전환되어 에이전트가 교착 상태에서 반복되지 않도록 합니다.

### 예시

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code가 파일 편집을 수행하고(워크스페이스 내 편집은 분류기를 건너뜀), `npm test`를 실행하며(분류기가 안전하다고 판단), `rm -rf /Users/me/.aws`와 같은 위험한 작업을 시도하면 차단을 표시합니다. 인라인으로 이유를 확인하고 해당 단계에 대해 Ask Permissions Mode로 전환할지 결정할 수 있습니다.

### Auto Mode를 기본값으로 설정

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
      // 선택 사항: 모든 셸 명령어(ls, cat 같은 읽기 전용 포함)를
      // 분류기를 통해 방어를 강화합니다.
      // "classifyAllShell": true,
      // 선택 사항: MCP 도구 호출을 이름만 분류기로 전송합니다
      // (인수는 기본적으로 전달됨).
      // "mcp": { "forwardArguments": false },
    },
  },
}
```

## 5. YOLO Mode - 완전 자동화

YOLO Mode는 Qwen Code에게 가장 높은 권한을 부여하여 파일 편집과 셸 명령어를 포함한 모든 도구 호출을 자동으로 승인합니다.

### YOLO Mode를 사용할 때

- **자동화 스크립트**: 미리 정의된 자동화 작업 실행
- **CI/CD 파이프라인**: 제어된 환경에서의 자동 실행
- **개인 프로젝트**: 완전히 신뢰할 수 있는 환경에서의 빠른 반복
- **배치 처리**: 다단계 명령어 체인이 필요한 작업

> [!warning]
>
> **YOLO Mode는 주의해서 사용**: AI가 터미널 권한으로 모든 명령어를 실행할 수 있습니다. 다음을 확인하세요:
>
> 1. 현재 코드베이스를 신뢰할 수 있는지
> 2. AI가 수행할 모든 작업을 이해하고 있는지
> 3. 중요한 파일이 백업되었거나 버전 관리에 커밋되어 있는지

### YOLO Mode 활성화 방법

```
# 임시 활성화(현재 세션만)
/approval-mode yolo

# 프로젝트 기본값으로 설정
/approval-mode yolo --project

# 사용자 전역 기본값으로 설정
/approval-mode yolo --user
```

### 설정 예시

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### 자동화 워크플로우 예시

```bash
# 완전 자동화된 리팩토링 작업
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# 사람의 개입 없이 AI가 다음을 수행:
# 1. 테스트 명령어 실행(자동 승인)
# 2. 실패한 테스트 케이스 수정(파일 자동 편집)
# 3. git commit 실행(자동 승인)
```

## 모드 전환 및 설정

### 키보드 단축키로 전환

Qwen Code 세션 중에 **Shift+Tab**(또는 Windows에서 **Tab**)을 사용하여 다섯 가지 모드를 빠르게 순환할 수 있습니다:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### 영구 설정

```
// 프로젝트 수준: ./.qwen/settings.json
// 사용자 수준: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // 또는 "plan", "default", "auto", "yolo"
  }
}
```

### 모드 사용 권장사항

1. **새로운 코드베이스**: **Plan Mode**로 시작하여 안전하게 탐색
2. **일상 개발 작업**: **Auto-Accept Edits**(기본 모드) 사용 — 효율적이고 안전
3. **자동화 스크립트**: 제어된 환경에서 **YOLO Mode**를 사용하여 완전 자동화
4. **복잡한 리팩토링**: 먼저 **Plan Mode**로 상세 계획을 세운 후 실행을 위해 적절한 모드로 전환
